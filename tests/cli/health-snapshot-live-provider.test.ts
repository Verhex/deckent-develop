// tests/cli/health-snapshot-live-provider.test.ts
// ═══ TERMINAL-TOOLS-007 — the boot health line tells the truth about who answers ═
//
// Real-binary evidence (2026-09-02 PTY, DECKENT_CHAT_PROVIDER=ollama, no keys):
//   claude/claude-opus-5 (claude-opus-5) · auth: … ← health line
//   switch failed — no native transport configured …    ← boot notice
//   deckent  ollama  …                                     ← status row
// Three lines, three stories. (1) the health line ignored the env override
// entry.ts honors, (2) a non-registry provider (ollama / openai-compat /
// local-llm) was shown with the CLAUDE brain_model as "its" model, (3) a
// boot-time native-engine resolution failure was worded as a "switch"
// nobody made. Hermetic: injected config/probes, committed source text.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildHealthSnapshot, renderHealthSnapshot } from '../../src/cli/helpers/health-snapshot.js';
import { composeNativeBootHealth, localizeNativeError, NATIVE_ERROR_CODES } from '../../src/cli/repl/run.js';
import { resolveNativeProvider } from '../../src/cli/repl/native-transport.js';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

const ROOT = join(__dirname, '..', '..');

function cfg(overrides: Record<string, unknown>): ResolvedConfig {
  return {
    brain_provider: 'claude',
    chat_provider: 'claude',
    mode: 'balanced',
    activeModeConfig: { brain_model: 'claude-sonnet-5' },
    ...overrides,
  } as unknown as ResolvedConfig;
}

const deps = (config: ResolvedConfig, extra: Record<string, unknown> = {}) => ({
  loadConfigFn: async () => config,
  probeAuthFn: async () => ({ state: 'unknown' as const }),
  loadMcpServersFn: () => ({}),
  readMemoryCountFn: () => undefined,
  listActiveSessionsFn: () => [],
  ...extra,
});

describe('buildHealthSnapshot — provider is the REPL\'s resolved provider, not a second config read', () => {
  it('composes health from the canonical native resolver result without another selection', () => {
    const resolved = resolveNativeProvider({}, {
      native_provider: 'ollama',
      native_model: 'qwen2.5-coder',
      ollama_host: 'http://127.0.0.1:11434',
    }, '/tmp/x');
    expect('error' in resolved).toBe(false);
    expect(composeNativeBootHealth(resolved)).toEqual({
      provider: { status: 'ok', label: 'ollama' },
      model: { status: 'ok', label: 'qwen2.5-coder:7b' },
      auth: { status: 'unknown', label: 'unknown', detail: 'not probed' },
    });
  });

  it('uses the actual legacy fallback health context after a native resolution failure', () => {
    expect(composeNativeBootHealth({
      error: 'unsupported', errorCode: 'unsupported-native-provider', provider: 'codex',
    })).toBeUndefined();
  });

  it('consumes native boot evidence without re-selecting or re-probing auth', async () => {
    let probes = 0;
    const snap = await buildHealthSnapshot('/tmp/x', {
      ...deps(cfg({ native_provider: 'ollama', native_model: 'qwen2.5-coder' }), {
        probeAuthFn: async () => { probes += 1; return { state: 'logged-in' as const }; },
      }),
      provider: 'claude',
      resolvedSelection: {
        provider: { status: 'ok', label: 'ollama' },
        model: { status: 'ok', label: 'qwen2.5-coder' },
        auth: { status: 'unknown', label: 'unknown', detail: 'not probed' },
      },
    } as never);
    expect(snap.provider).toEqual({ status: 'ok', label: 'ollama' });
    expect(snap.model).toEqual({ status: 'ok', label: 'qwen2.5-coder' });
    expect(snap.auth).toEqual({ status: 'unknown', label: 'unknown', detail: 'not probed' });
    expect(probes).toBe(0);
  });

  it('keeps a failed explicit native selection unknown and skips auth', async () => {
    let probes = 0;
    const snap = await buildHealthSnapshot('/tmp/x', {
      ...deps(cfg({ native_provider: 'codex' }), {
        probeAuthFn: async () => { probes += 1; return { state: 'logged-in' as const }; },
      }),
      resolvedSelection: {
        provider: { status: 'unknown', label: 'codex', detail: 'unsupported-native-provider' },
        model: { status: 'unknown', label: 'unknown', detail: 'unsupported-native-provider' },
        auth: { status: 'unknown', label: 'unknown', detail: 'unsupported-native-provider' },
      },
    } as never);
    expect(snap.provider.status).toBe('unknown');
    expect(snap.model.status).toBe('unknown');
    expect(snap.auth.status).toBe('unknown');
    expect(probes).toBe(0);
  });
  it('an injected provider (entry.ts providerName, env override included) wins over config', async () => {
    const snap = await buildHealthSnapshot('/tmp/x', { ...deps(cfg({ chat_provider: 'claude' })), provider: 'ollama' } as never);
    expect(snap.provider).toMatchObject({ status: 'ok', label: 'ollama' });
  });

  it('without an injected provider the config chain still resolves (other callers unchanged)', async () => {
    const snap = await buildHealthSnapshot('/tmp/x', deps(cfg({ chat_provider: 'codex' })) as never);
    expect(snap.provider.label).toBe('codex');
  });
});

describe('buildHealthSnapshot — model never borrows another provider\'s id', () => {
  it('claude/codex/gemini map brain_model through registry equivalence (unchanged)', async () => {
    const snap = await buildHealthSnapshot('/tmp/x', { ...deps(cfg({})), provider: 'claude' } as never);
    expect(snap.model.status).toBe('ok');
    expect(snap.model.label).toContain('claude-');
  });

  it('does not duplicate identical registry id/apiId labels', async () => {
    const snap = await buildHealthSnapshot('/tmp/x', { ...deps(cfg({})), provider: 'claude' } as never);
    expect(snap.model.label).not.toMatch(/^(.+) \(\1\)$/);
  });

  it('a non-registry provider shows its configured native_model', async () => {
    const snap = await buildHealthSnapshot('/tmp/x', { ...deps(cfg({ native_model: 'qwen2.5-coder' })), provider: 'ollama' } as never);
    expect(snap.model).toMatchObject({ status: 'ok', label: 'qwen2.5-coder' });
  });

  it('a non-registry provider without native_model is honestly unknown — never the claude brain_model', async () => {
    const snap = await buildHealthSnapshot('/tmp/x', { ...deps(cfg({})), provider: 'ollama' } as never);
    expect(snap.model.status).toBe('unknown');
    expect(snap.model.label).not.toContain('claude');
    expect(snap.model.detail).toContain('native_model');
    const line = renderHealthSnapshot(snap, 'tr');
    expect(line).toContain('ollama/');
    expect(line).not.toContain('claude-sonnet-5');
  });
});

describe('boot-time native engine failure is worded as a boot outcome, not a switch', () => {
  it('every native error code has a native.boot.* row in en and tr, distinct from the switch row', () => {
    for (const code of NATIVE_ERROR_CODES) {
      expect(getMessageLanguages(`native.boot.${code}`), code).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(`native.boot.${code}`, 'en')).not.toMatch(/^switch failed/);
      expect(getMessage(`native.boot.${code}`, 'tr')).not.toMatch(/^geçiş başarısız/);
    }
  });

  it('localizeNativeError(err, lang, "boot") uses the boot row; "switch" keeps the switch row', () => {
    const err = { error: 'raw', errorCode: 'no-transport' } as never;
    expect(localizeNativeError(err, 'tr', 'boot')).toBe(getMessage('native.boot.no-transport', 'tr', { provider: '', detail: '' }));
    expect(localizeNativeError(err, 'en', 'boot')).toBe(getMessage('native.boot.no-transport', 'en', { provider: '', detail: '' }));
    expect(localizeNativeError(err, 'en', 'switch')).toBe(getMessage('native.switch.no-transport', 'en', { provider: '', detail: '' }));
  });

  it('run.tsx resolves and refuses native boot before resources; successful selection reaches health', () => {
    const run = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf-8');
    expect(run).toMatch(/nativeBoot = resolveNativeProvider[\s\S]*localizeNativeError\(nativeBoot, lang, 'boot', terminalGlyphs\)/);
    expect(run.indexOf('nativeBoot = resolveNativeProvider')).toBeLessThan(run.indexOf('new ApprovalBroker'));
    const entry = readFileSync(join(ROOT, 'src/cli/entry.ts'), 'utf-8');
    expect(entry).toMatch(/terminalSurface\.surface !== 'ink'\) await emitHealth\(\)/);
    expect(entry).toMatch(/registerReplTeardown,\s*emitHealth\)/);
    expect(run).toMatch(/resolveNativeProvider[\s\S]*bootHealthSelection[\s\S]*onBootSelection/);
    expect(run).toContain('onBootSelection?.(bootHealthSelection, terminalGlyphs)');
    expect(entry).toMatch(/emitHealth = async \([\s\S]*glyphs\?: TerminalGlyphs[\s\S]*renderHealthSnapshot\(snapshot, replLang, glyphs \? \{ glyphs \} : \{\}\)/);
  });

  it('keeps a one-argument boot callback structurally compatible with the optional glyph argument', async () => {
    const callback: Parameters<typeof import('../../src/cli/repl/run.js').runInkRepl>[4] = async (selection) => {
      expect(selection).toBeUndefined();
    };
    await callback?.();
  });
});
