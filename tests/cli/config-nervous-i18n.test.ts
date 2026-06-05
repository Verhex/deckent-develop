// MSG-004 (MASTER-PLAN §4G) — config-nervous CLI i18n.
//
// config-nervous.ts printed ~30 hardcoded strings (set/override/list/reset
// confirmations, errors, the authority-matrix table, interactive prompts) with
// zero getMessage, and PRESET_DESCRIPTIONS mixed Turkish prose into an otherwise
// English table. This threads a lang through each handler so the surface honours
// the session language (CLAUDE.md i18n-FIRST). English defaults preserve the
// existing English assertions in config-nervous.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

let testRoot: string;
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
  handleCliError: (err: unknown) => { throw err; },
}));

const { handleSetMode, handleOverride, handleList } = await import(
  '../../src/cli/commands/config-nervous.js'
);

function captureOutput(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stdout.write;
  process.stdout.write = ((c: string | Uint8Array) => {
    chunks.push(typeof c === 'string' ? c : Buffer.from(c).toString());
    return true;
  }) as typeof process.stdout.write;
  try { fn(); } finally { process.stdout.write = orig; }
  return chunks.join('');
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stderr.write;
  process.stderr.write = ((c: string | Uint8Array) => {
    chunks.push(typeof c === 'string' ? c : Buffer.from(c).toString());
    return true;
  }) as typeof process.stderr.write;
  try { fn(); } finally { process.stderr.write = orig; }
  return chunks.join('');
}

describe('config nervous CLI i18n (MSG-004)', () => {
  beforeEach(() => {
    testRoot = join(tmpdir(), `config-nervous-i18n-${randomUUID().slice(0, 8)}`);
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    process.exitCode = undefined;
  });
  afterEach(() => {
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* */ }
    process.exitCode = undefined;
  });

  it('set mode confirmation is localized', () => {
    const out = captureOutput(() => handleSetMode(testRoot, 'strict', 'tr'));
    expect(out).toContain('Mod ayarlandı');
  });

  it('list matrix title, headers and preset descriptions are localized', () => {
    const out = captureOutput(() => handleList(testRoot, 'tr'));
    expect(out).toContain('Yetki Matrisi');
    expect(out).toContain('Düşük Risk');
    expect(out).not.toContain('Low Risk');
  });

  it('invalid preset error is localized', () => {
    const err = captureStderr(() => handleSetMode(testRoot, 'bad-preset', 'tr'));
    expect(err).toContain('Geçersiz preset');
  });

  it('safety-floor block message is localized', () => {
    const out = captureOutput(() => handleOverride(testRoot, 'KILL_LIVE_SPRINT', 'autonomous', 'tr'));
    expect(out).toContain('Safety floor');
    expect(out).toContain('yapılamaz');
  });

  it('English remains intact (default path) for set mode', () => {
    const out = captureOutput(() => handleSetMode(testRoot, 'balanced', 'en'));
    expect(out).toContain('Mode set to');
  });
});
