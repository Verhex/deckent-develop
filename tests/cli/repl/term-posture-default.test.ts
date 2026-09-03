// tests/cli/repl/term-posture-default.test.ts
// ═══ TERMINAL-POSTURE-001 — the session starts in Run; the default is config-resolved ═══
//
// Owner decision (2026-09-03): a fresh Terminal starts in the `run` posture
// (reads, edits and execution admitted, autonomous actions still need
// Control) instead of read-only Ask — TERMINAL-TOOLS-011's gate applies on
// every surface, so an Ask default denied every write on a default install.
// The default is a real setting (`terminal.posture`, ask|run|control) with
// metadata (so /config lists it) and validation (so a typo is refused), read
// at REPL boot and injected into the App. Hermetic.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { initialTermModeState, resolveConfiguredPosture, DEFAULT_TERM_MODE, TERM_MODES } from '../../../src/cli/repl/term-mode.js';
import { CONFIG_METADATA, validatePartialConfig, ConfigValidationError } from '../../../src/core/config.js';
import type { DeckentConfig } from '../../../src/core/types.js';

const ROOT = join(__dirname, '..', '..', '..');

describe('initial posture', () => {
  it('defaults to run; an explicit posture wins', () => {
    expect(DEFAULT_TERM_MODE).toBe('run');
    expect(initialTermModeState()).toEqual({ mode: 'run' });
    expect(initialTermModeState('ask')).toEqual({ mode: 'ask' });
    expect(initialTermModeState('control')).toEqual({ mode: 'control' });
  });
  it('resolveConfiguredPosture accepts only the three tokens (case-insensitive) and falls back to the default', () => {
    expect(resolveConfiguredPosture('ask')).toBe('ask');
    expect(resolveConfiguredPosture('CONTROL')).toBe('control');
    expect(resolveConfiguredPosture(undefined)).toBe('run');
    expect(resolveConfiguredPosture('bogus')).toBe('run');
    expect(resolveConfiguredPosture(42)).toBe('run');
  });
});

describe('terminal.posture is a first-class setting', () => {
  it('has metadata with the three options and the run default, in both description languages', () => {
    const meta = CONFIG_METADATA['terminal.posture'];
    expect(meta).toBeDefined();
    expect(meta!.options).toEqual([...TERM_MODES]);
    expect(meta!.default).toBe('run');
    expect(meta!.descriptionTr?.length ?? 0).toBeGreaterThan(0);
  });
  it('validatePartialConfig accepts the tokens and refuses anything else', () => {
    const partial = (posture: string): Partial<DeckentConfig> => ({ terminal: { posture } } as unknown as Partial<DeckentConfig>);
    expect(() => validatePartialConfig(partial('ask'))).not.toThrow();
    expect(() => validatePartialConfig(partial('bogus'))).toThrow(ConfigValidationError);
  });
});

describe('wiring', () => {
  it('run.tsx resolves the configured posture and app.tsx starts from it', () => {
    const run = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf-8');
    const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
    // TERMINAL-SESSION-AUTHORITY-001: the configured posture seeds the session
    // authority and the App starts from the authority's posture.
    expect(run).toMatch(/createSessionAuthority\(\{\s*posture: resolveConfiguredPosture\(/);
    expect(run).toMatch(/initialTermMode=\{sessionAuthority\.posture\(\)\}/);
    expect(app).toMatch(/initialTermModeState\(initialTermMode\)/);
  });
});
