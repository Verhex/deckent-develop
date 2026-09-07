import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDeferredLegacyProvider, nativeBootErrorCode, resolveProviderDefaultWrite } from '../../src/cli/repl/run.js';
import { createSwitchableProvider } from '../../src/cli/repl/provider-switch.js';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';
import type { ChatProviderAdapter } from '../../src/cli/commands/chat-native.js';

const ROOT = join(__dirname, '..', '..');

function adapter(exit: () => void): ChatProviderAdapter & { exit: () => void } {
  return {
    send: async () => ({ text: 'ok', stopReason: 'end_turn' }),
    exit,
  };
}

describe('native boot fail-closed policy', () => {
  it('keeps stable secret-free terminal error codes', () => {
    expect(nativeBootErrorCode('missing-api-key')).toBe('NATIVE_BOOT_MISSING_API_KEY');
    expect(nativeBootErrorCode(undefined)).toBe('NATIVE_BOOT_NATIVE_BOOT_FAILED');
  });

  it('does not instantiate the deferred legacy adapter on native-session teardown', async () => {
    const factory = vi.fn(() => adapter(() => undefined));
    const deferred = createDeferredLegacyProvider(factory);
    const switcher = createSwitchableProvider(
      { provider: 'claude', model: null },
      () => adapter(() => undefined),
      deferred,
    );
    await switcher.exit();
    expect(factory).not.toHaveBeenCalled();
  });

  it('closes an already-instantiated deferred adapter exactly once', async () => {
    const exit = vi.fn();
    const factory = vi.fn(() => adapter(exit));
    const deferred = createDeferredLegacyProvider(factory);
    await deferred.send([]);
    const switcher = createSwitchableProvider(
      { provider: 'claude', model: null },
      () => adapter(() => undefined),
      deferred,
    );
    await switcher.exit();
    await switcher.exit();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('resolves every new operator notice in English and Turkish', () => {
    for (const key of [
      'native.boot.config-invalid',
      'native.boot.legacy-host-fallback',
      'native.boot.legacy-host-surface',
      'native.boot.legacy-host-unavailable',
      'native.boot.legacy-model-default-unsupported',
      'native.boot.surface-unsupported',
    ]) {
      expect(getMessageLanguages(key)).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en', { provider: 'codex' })).not.toBe(key);
      expect(getMessage(key, 'tr', { provider: 'codex' })).not.toBe(key);
    }
  });

  it('persists native and legacy-host picker identities without authority drift', () => {
    expect(resolveProviderDefaultWrite({ provider: 'openai', model: 'gpt-5.6' }, 'model', 'gpt-5.7')).toEqual({
      patch: { native_provider: 'openai', native_model: 'gpt-5.7' },
    });
    expect(resolveProviderDefaultWrite({ provider: 'openai', model: 'gpt-5.6' }, 'provider', 'ollama')).toEqual({
      patch: { native_provider: 'ollama' },
    });
    expect(resolveProviderDefaultWrite(undefined, 'provider', 'codex')).toEqual({
      patch: { chat_provider: 'codex' },
    });
    expect(resolveProviderDefaultWrite(undefined, 'model', 'gpt-5.6')).toEqual({
      errorKey: 'native.boot.legacy-model-default-unsupported',
    });
  });

  it('orders native admission before every session resource and keeps model-only intent explicit', () => {
    const source = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf8');
    const run = source.slice(source.indexOf('export async function runInkRepl'));
    const resolveAt = run.indexOf('nativeBoot = resolveNativeProvider(');
    expect(resolveAt).toBeGreaterThan(0);
    for (const allocation of [
      'new ApprovalBroker(',
      'wireBgTurnsProducer(',
      'createPermissionStore(',
      'new MemoryStore(',
      'createSwitchableProvider(',
      'render(',
    ]) {
      const allocationAt = run.indexOf(allocation);
      expect(allocationAt, allocation).toBeGreaterThanOrEqual(0);
      expect(resolveAt, allocation).toBeLessThan(allocationAt);
    }
    expect(run).toContain("projectCfg.native_model !== undefined");
    expect(run).toMatch(/explicitNativeIntent \|\| nativeBoot\.errorCode !== 'no-transport'/u);
  });

  it('keeps Ink legacy construction lazy and rejects non-Ink native intent before construction', () => {
    const entry = readFileSync(join(ROOT, 'src/cli/entry.ts'), 'utf8');
    const surfaceAt = entry.indexOf('const terminalSurface = resolveTerminalSurfaceFromProcess()');
    const rejectAt = entry.indexOf("getMessage('native.boot.surface-unsupported'", surfaceAt);
    const inkAt = entry.indexOf("terminalSurface.surface === 'ink'", surfaceAt);
    const legacyBuildAt = entry.indexOf('provider = buildReplProvider(providerName)', inkAt);
    expect(surfaceAt).toBeGreaterThan(0);
    expect(rejectAt).toBeGreaterThan(surfaceAt);
    expect(legacyBuildAt).toBeGreaterThan(rejectAt);
    expect(entry).toContain('() => buildReplProvider(providerName)');
    expect(entry).toContain('cfg.native_model !== undefined');
  });
});
