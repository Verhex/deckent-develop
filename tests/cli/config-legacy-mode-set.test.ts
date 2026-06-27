/**
 * CFG-1 — legacy `mode` no longer blocks `config set` (Windows beta install-blocker).
 *
 * Repro: a config.json carrying a legacy `mode` (e.g. `pro_plan`) on disk made
 * `deckent config set <any-unrelated-key> <value>` fail whole-config validation with
 * `Invalid value 'pro_plan' for field 'mode'`, because the WRITE/validate path
 * (`validatePartialConfig` → `validateConfig`) never normalized the legacy alias the
 * way the READ path (`loadConfig` → `resolveMode`) does.
 *
 * Fix: `validatePartialConfig` normalizes a legacy `mode` alias in place before
 * validating (mirrors the read path) — which both unblocks the write AND persists the
 * canonical value, since the CLI writes the same object back to disk. `config migrate`
 * additionally surfaces the rename via `MigrationResult.renamedFields`.
 *
 * Hermetic: every fixture lives under an `os.tmpdir()` sandbox; `resolveProjectRoot`
 * is mocked to the sandbox (no `process.cwd()` reliance). Real fs / config / migration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Hoisted holder so the vi.mock factory can read a per-test sandbox root without
// tripping vitest's "no outer reference in factory" guard.
const sandbox = vi.hoisted(() => ({ root: '' }));

vi.mock('../../src/cli/helpers/process.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/helpers/process.js')>();
  return { ...actual, resolveProjectRoot: () => sandbox.root };
});

import { registerConfig } from '../../src/cli/commands/config.js';
import { validatePartialConfig, createDefaultConfig, clearConfigCache } from '../../src/core/config.js';
import { migrateConfig } from '../../src/core/config-migration.js';
import type { DeckentConfig } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runConfig(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerConfig(program);
  try {
    await program.parseAsync(['node', 'deckent', 'config', ...args]);
  } catch {
    // commander exitOverride throws on exit; the action records process.exitCode itself.
  }
}

function seedConfig(root: string, config: Record<string, unknown>): string {
  const dir = join(root, '.deckent');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'config.json');
  writeFileSync(p, JSON.stringify(config, null, 2));
  return p;
}

function readConfig(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('CFG-1: legacy mode no longer blocks config set', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-cfg1-'));
    sandbox.root = root;
    process.exitCode = undefined;
    clearConfigCache();
  });

  afterEach(() => {
    process.exitCode = undefined;
    clearConfigCache();
    rmSync(root, { recursive: true, force: true });
  });

  it('config set succeeds with a legacy pro_plan config and persists canonical mode', async () => {
    const p = seedConfig(root, { mode: 'pro_plan' });

    await runConfig(['set', 'spawn_backend', 'docker']);

    // Pre-fix RED: validateConfig threw `Invalid value 'pro_plan'` → exitCode 1.
    expect(process.exitCode).not.toBe(1);
    const written = readConfig(p);
    expect(written['spawn_backend']).toBe('docker');
    expect(written['mode']).toBe('economic'); // pro_plan → economic, mirrors the read path
  });

  it('config set on a canonical-mode config leaves mode unchanged', async () => {
    const p = seedConfig(root, { mode: 'balanced' });

    await runConfig(['set', 'spawn_backend', 'docker']);

    expect(process.exitCode).not.toBe(1);
    const written = readConfig(p);
    expect(written['spawn_backend']).toBe('docker');
    expect(written['mode']).toBe('balanced');
  });

  it('validatePartialConfig normalizes a legacy mode in place and does not throw', () => {
    const partial: Partial<DeckentConfig> = { mode: 'pro_plan' as DeckentConfig['mode'] };
    expect(() => validatePartialConfig(partial)).not.toThrow();
    expect(partial.mode).toBe('economic');
  });

  it('validatePartialConfig leaves a canonical mode untouched', () => {
    const partial: Partial<DeckentConfig> = { mode: 'performance' };
    expect(() => validatePartialConfig(partial)).not.toThrow();
    expect(partial.mode).toBe('performance');
  });

  it('validatePartialConfig still rejects a truly invalid mode', () => {
    const partial = { mode: 'not_a_mode' } as unknown as Partial<DeckentConfig>;
    expect(() => validatePartialConfig(partial)).toThrow();
  });

  it('migrateConfig surfaces the legacy mode rename in renamedFields', () => {
    const p = seedConfig(root, { mode: 'pro_plan' });

    const result = migrateConfig(p);

    expect(result.migrated).toBe(true);
    expect(result.renamedFields).toBeDefined();
    expect(result.renamedFields).toContain('mode: pro_plan → economic');
    expect(readConfig(p)['mode']).toBe('economic');
  });

  it('migrateConfig reports a rename-only migration (no fields added)', () => {
    // A complete config whose only legacy artifact is the top-level mode alias →
    // previously reported the misleading bare "Added 0 field(s)".
    const full = createDefaultConfig() as unknown as Record<string, unknown>;
    full['mode'] = 'pro_plan';
    const p = seedConfig(root, full);

    const result = migrateConfig(p);

    expect(result.migrated).toBe(true);
    expect(result.addedFields).toHaveLength(0);
    expect(result.renamedFields).toEqual(['mode: pro_plan → economic']);
  });
});
