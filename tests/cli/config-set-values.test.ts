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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setConfigValues } from '../../src/cli/commands/config.js';
import { PROJECT_CONFIG_PATH } from '../../src/core/constants.js';

const roots: string[] = [];
const globalRoots: string[] = [];
const originalDeckentHome = process.env['DECKENT_HOME'];
function project(initial: Record<string, unknown> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'picker-config-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, PROJECT_CONFIG_PATH), JSON.stringify(initial, null, 2));
  return root;
}
function globalConfig(config: Record<string, unknown>): void {
  writeFileSync(join(process.env['DECKENT_HOME']!, 'config.json'), JSON.stringify(config, null, 2));
}
function malformedGlobalConfig(text: string): void {
  writeFileSync(join(process.env['DECKENT_HOME']!, 'config.json'), text);
}
beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'picker-global-config-'));
  globalRoots.push(root);
  process.env['DECKENT_HOME'] = root;
  // The resolver uses a legacy fallback when its preferred path is absent.
  // An explicit empty fixture keeps every write test out of the real global scope.
  writeFileSync(join(root, 'config.json'), '{}');
});
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  for (const r of globalRoots.splice(0)) rmSync(r, { recursive: true, force: true });
  if (originalDeckentHome === undefined) delete process.env['DECKENT_HOME'];
  else process.env['DECKENT_HOME'] = originalDeckentHome;
});

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

  it('rejects malformed terminal.startup.recent_sessions without writing the patch', () => {
    const root = project({ language: 'en', terminal: { startup: { recent_sessions: false } } });
    const before = readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8');
    const out = setConfigValues(root, { 'terminal.startup.recent_sessions': 'yes' });
    expect(out).toEqual({
      ok: false,
      code: 'validation',
      error: 'terminal.startup.recent_sessions must be a boolean.',
    });
    expect(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')).toBe(before);
  });

  it('allows partial sprint-context limits, then requires both before enabling', () => {
    const root = project({ language: 'en' });
    expect(setConfigValues(root, { 'terminal.resume.sprint_context.max_bytes': 4096 })).toEqual({ ok: true });
    const beforeEnable = readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8');
    expect(setConfigValues(root, { 'terminal.resume.sprint_context.enabled': true })).toEqual({
      ok: false,
      code: 'validation',
      error: 'terminal.resume.sprint_context.enabled requires max_bytes and verification_timeout_ms.',
    });
    expect(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')).toBe(beforeEnable);
    expect(setConfigValues(root, {
      'terminal.resume.sprint_context.verification_timeout_ms': 1500,
      'terminal.resume.sprint_context.enabled': true,
    })).toEqual({ ok: true });
    const written = JSON.parse(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')) as {
      terminal?: { resume?: { sprint_context?: Record<string, unknown> } };
    };
    expect(written.terminal?.resume?.sprint_context).toEqual({
      max_bytes: 4096,
      verification_timeout_ms: 1500,
      enabled: true,
    });
  });

  it('localizes an invalid sprint-context limit and leaves the patch unwritten', () => {
    const root = project({ language: 'tr' });
    const before = readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8');
    expect(setConfigValues(root, { 'terminal.resume.sprint_context.max_bytes': 0 })).toEqual({
      ok: false,
      code: 'validation',
      error: 'terminal.resume.sprint_context.max_bytes pozitif güvenli bir tam sayı olmalıdır.',
    });
    expect(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')).toBe(before);
  });

  it('validates an enabled project sprint context against global limits without copying them down', () => {
    globalConfig({ terminal: { resume: { sprint_context: { max_bytes: 4096, verification_timeout_ms: 1500 } } } });
    const root = project({ language: 'en' });
    expect(setConfigValues(root, { 'terminal.resume.sprint_context.enabled': true })).toEqual({ ok: true });
    expect(setConfigValues(root, { native_model: 'qwen2.5-coder:32b' })).toEqual({ ok: true });
    const written = JSON.parse(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')) as {
      terminal?: { resume?: { sprint_context?: Record<string, unknown> } };
      native_model?: string;
    };
    expect(written.terminal?.resume?.sprint_context).toEqual({ enabled: true });
    expect(written.native_model).toBe('qwen2.5-coder:32b');
  });

  it('keeps a project sprint-context limit authoritative over a global limit', () => {
    globalConfig({ terminal: { resume: { sprint_context: { max_bytes: 4096, verification_timeout_ms: 1500 } } } });
    const root = project({ terminal: { resume: { sprint_context: { max_bytes: 2048 } } } });
    expect(setConfigValues(root, { 'terminal.resume.sprint_context.enabled': true })).toEqual({ ok: true });
    const written = JSON.parse(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')) as {
      terminal?: { resume?: { sprint_context?: Record<string, unknown> } };
    };
    expect(written.terminal?.resume?.sprint_context).toEqual({ max_bytes: 2048, enabled: true });
  });

  it('fails closed on invalid global sprint-context limits without writing the project patch', () => {
    globalConfig({ terminal: { resume: { sprint_context: { max_bytes: 0, verification_timeout_ms: 1500 } } } });
    const root = project({ language: 'en' });
    const before = readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8');
    expect(setConfigValues(root, { native_model: 'qwen2.5-coder:32b' })).toEqual({
      ok: false,
      code: 'validation',
      error: 'terminal.resume.sprint_context.max_bytes must be a positive safe integer.',
    });
    expect(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')).toBe(before);
  });

  it.each([
    ['en', 'Global configuration at', 'malformed_json'],
    ['tr', 'genel yapılandırma bu proje yapılandırmasını doğrulamak için kullanılamıyor', 'malformed_json'],
  ] as const)('fails closed with a localized diagnostic when the canonical global config is malformed (%s)', (language, phrase, detail) => {
    malformedGlobalConfig('{ invalid json');
    const root = project({ language });
    const before = readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8');
    const out = setConfigValues(root, { native_model: 'qwen2.5-coder:32b' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe('validation');
    expect(out.error).toContain(phrase);
    expect(out.error).toContain(detail);
    expect(out.error).not.toContain('Unexpected token');
    expect(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8')).toBe(before);
  });

  it('a missing config file is created from the patch alone', () => {
    const root = mkdtempSync(join(tmpdir(), 'picker-config-empty-'));
    roots.push(root);
    expect(setConfigValues(root, { native_model: 'x' })).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(join(root, PROJECT_CONFIG_PATH), 'utf-8'))).toEqual({ native_model: 'x' });
  });
});
