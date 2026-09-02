// tests/cli/helpers/terminal-surface.test.ts
// ═══ TERMINAL-TOOLS-003 — terminal surface admission + Ink color gate ═══════
//
// Real-binary findings (2026-09-02 PTY audit): `TERM=dumb` still mounted the
// Ink surface (cursor-movement CSI on a terminal that cannot honor it) and
// `NO_COLOR=1` still produced SGR color from Ink — the project's color SSOT
// (helpers/theme.ts) was never applied to the Ink path. This suite pins the
// pure admission matrix and the env projection the boot path applies before
// Ink is loaded. Hermetic: pure functions, injected inputs only.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  resolveTerminalSurface,
  resolveInkColorEnv,
  type TerminalSurfaceInput,
} from '../../../src/cli/helpers/terminal-surface.js';

const ROOT = join(__dirname, '..', '..', '..');

const tty: TerminalSurfaceInput = { stdinIsTTY: true, stdoutIsTTY: true, term: 'xterm-256color', inkFlag: undefined };

describe('resolveTerminalSurface — admission matrix', () => {
  it('interactive TTY with a capable TERM → the Ink surface', () => {
    expect(resolveTerminalSurface(tty)).toEqual({ surface: 'ink', reason: 'interactive-tty', interactive: true });
  });

  it('DECKENT_INK=0 → the legacy readline surface (still interactive)', () => {
    expect(resolveTerminalSurface({ ...tty, inkFlag: '0' })).toEqual({ surface: 'readline', reason: 'ink-opt-out', interactive: true });
  });

  it('TERM=dumb → the line surface: no cursor control is ever admitted, even on a TTY', () => {
    for (const term of ['dumb', 'DUMB', ' dumb ']) {
      expect(resolveTerminalSurface({ ...tty, term })).toEqual({ surface: 'line', reason: 'dumb-terminal', interactive: false });
    }
    // opt-out cannot re-admit readline's cursor editing on a dumb terminal
    expect(resolveTerminalSurface({ ...tty, term: 'dumb', inkFlag: '0' }).surface).toBe('line');
  });

  it('pipe / redirect on either side → the line surface', () => {
    expect(resolveTerminalSurface({ ...tty, stdinIsTTY: false })).toEqual({ surface: 'line', reason: 'not-a-tty', interactive: false });
    expect(resolveTerminalSurface({ ...tty, stdoutIsTTY: false })).toEqual({ surface: 'line', reason: 'not-a-tty', interactive: false });
  });

  it('an unset TERM (Windows native consoles) is not demoted — only an explicit dumb TERM is', () => {
    expect(resolveTerminalSurface({ ...tty, term: undefined }).surface).toBe('ink');
    expect(resolveTerminalSurface({ ...tty, term: '' }).surface).toBe('ink');
  });

  it('unknown DECKENT_INK values keep the default surface', () => {
    expect(resolveTerminalSurface({ ...tty, inkFlag: 'yes' }).surface).toBe('ink');
    expect(resolveTerminalSurface({ ...tty, inkFlag: '1' }).surface).toBe('ink');
  });
});

describe('resolveInkColorEnv — project the theme.ts color gate onto Ink/chalk before it loads', () => {
  it('color suppressed (NO_COLOR / --no-color) and no FORCE_COLOR → FORCE_COLOR=0 for the Ink process', () => {
    expect(resolveInkColorEnv({ suppressed: true, env: { NO_COLOR: '1' } })).toEqual({ FORCE_COLOR: '0' });
    expect(resolveInkColorEnv({ suppressed: true, env: {} })).toEqual({ FORCE_COLOR: '0' });
  });

  it('never overrides an explicit FORCE_COLOR the user set (theme.ts precedence: FORCE_COLOR beats NO_COLOR)', () => {
    expect(resolveInkColorEnv({ suppressed: false, env: { FORCE_COLOR: '3', NO_COLOR: '1' } })).toEqual({});
    expect(resolveInkColorEnv({ suppressed: true, env: { FORCE_COLOR: '0' } })).toEqual({});
  });

  it('no suppression → no projection (Ink keeps its own TTY detection)', () => {
    expect(resolveInkColorEnv({ suppressed: false, env: {} })).toEqual({});
  });
});

describe('entry.ts wiring', () => {
  it('the boot path admits the surface through resolveTerminalSurfaceFromProcess', () => {
    const src = readFileSync(join(ROOT, 'src/cli/entry.ts'), 'utf-8');
    expect(src).toMatch(/resolveTerminalSurfaceFromProcess\(/);
    // the old ad-hoc admission must be gone
    expect(src).not.toMatch(/process\.env\['DECKENT_INK'\] !== '0'/);
  });

  it('the color-gate preload is the FIRST import of entry.ts (chalk is loaded by static chains before the REPL branch)', () => {
    const src = readFileSync(join(ROOT, 'src/cli/entry.ts'), 'utf-8');
    const firstImport = src.split('\n').find((line) => line.startsWith('import '));
    expect(firstImport).toBe("import './helpers/ink-color-preload.js';");
  });

  it('the preload module depends only on theme.ts and terminal-surface.ts (nothing that loads chalk)', () => {
    const src = readFileSync(join(ROOT, 'src/cli/helpers/ink-color-preload.ts'), 'utf-8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['./terminal-surface.js', './theme.js']);
  });
});

describe('theme.ts — TERM=dumb is a capability signal for the color gate', () => {
  const saved = { TERM: process.env['TERM'], NO_COLOR: process.env['NO_COLOR'], FORCE_COLOR: process.env['FORCE_COLOR'] };
  const restore = (): void => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  };

  it('shouldUseColor / suppressionTier are off on a dumb terminal, and FORCE_COLOR>0 overrides it', async () => {
    const { shouldUseColor, suppressionTier, isDumbTerminal } = await import('../../../src/cli/helpers/theme.js');
    try {
      delete process.env['NO_COLOR'];
      delete process.env['FORCE_COLOR'];
      process.env['TERM'] = 'dumb';
      expect(isDumbTerminal()).toBe(true);
      expect(shouldUseColor()).toBe(false);
      expect(suppressionTier()).toBe('none');
      process.env['FORCE_COLOR'] = '1';
      expect(shouldUseColor()).toBe(true);
      expect(suppressionTier()).not.toBe('none');
    } finally {
      restore();
    }
  });

  it('isDumbTerminal is case/whitespace tolerant and false for unset TERM', async () => {
    const { isDumbTerminal } = await import('../../../src/cli/helpers/theme.js');
    expect(isDumbTerminal('DUMB')).toBe(true);
    expect(isDumbTerminal(' dumb ')).toBe(true);
    expect(isDumbTerminal(undefined)).toBe(false);
    expect(isDumbTerminal('xterm')).toBe(false);
  });
});
