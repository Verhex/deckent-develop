// tests/cli/config-set-values.test.ts
// ═══ TERMINAL-PICKER-002 (P15b) — setConfigValues: the ONE config write seam ═══
//
// The picker's "save as default" scope and `deckent config set` share this
// exact chain (read raw project config → set → validatePartialConfig →
// withConfigWriteLock(writeConfigJsonAtomic)). Typed outcomes, no throw across
// the seam. Hermetic (tmpdir project).

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { setConfigValues } from '../../src/cli/commands/config.js';
import { PROJECT_CONFIG_PATH } from '../../src/core/constants.js';

const roots: string[] = [];
function project(initial: Record<string, unknown> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'picker-config-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, PROJECT_CONFIG_PATH), JSON.stringify(initial, null, 2));
  return root;
}
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

describe('setConfigValues', () => {
  it('writes the native pin keys atomically and keeps unrelated keys', () => {
    const root = project({ language: 'tr', mode: 'balanced' });
    const out = setConfigValues(root, { native_provider: 'ollama', native_model: 'qwen2.5-coder:32b' });
    expect(out).toEqual({ ok: true });
    const written = JSON.parse(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')) as Record<string, unknown>;
    expect(written).toMatchObject({ language: 'tr', mode: 'balanced', native_provider: 'ollama', native_model: 'qwen2.5-coder:32b' });
    expect(existsSync(join(root, `${PROJECT_CONFIG_PATH}.lock`))).toBe(false);
  });

  it('sets dotted keys as nested values', () => {
    const root = project({});
    expect(setConfigValues(root, { 'repl_surface.approvals': true })).toEqual({ ok: true });
    const written = JSON.parse(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')) as { repl_surface?: { approvals?: boolean } };
    expect(written.repl_surface?.approvals).toBe(true);
  });

  it('a validation failure is a typed outcome and leaves the file untouched', () => {
    const root = project({ mode: 'balanced' });
    const out = setConfigValues(root, { mode: 'bogus-mode' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('validation');
    expect(out.error.length).toBeGreaterThan(0);
    const written = JSON.parse(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')) as { mode?: string };
    expect(written.mode).toBe('balanced');
  });

  it('a missing config file is created from the patch alone', () => {
    const root = mkdtempSync(join(tmpdir(), 'picker-config-empty-'));
    roots.push(root);
    expect(setConfigValues(root, { native_model: 'x' })).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8'))).toEqual({ native_model: 'x' });
  });
});
