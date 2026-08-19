import { afterEach, describe, expect, it, vi } from 'vitest';

import { modelRegistry } from '../../src/core/model-registry.js';
import type { ModelType } from '../../src/core/types.js';
import { CursorAdapter } from '../../src/providers/cursor.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  openSync: vi.fn().mockReturnValue(7),
  closeSync: vi.fn(),
}));

function child() {
  return { pid: 42, once: vi.fn().mockReturnThis(), kill: vi.fn() };
}

describe('CursorAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('buildCommand is byte-exact and read-only by default', () => {
    vi.spyOn(modelRegistry, 'get').mockReturnValue({ apiId: 'grok-4.6' } as never);
    const adapter = new CursorAdapter('/workspace');
    expect(adapter.buildCommand('cursor-alias' as ModelType, '/workspace/prompt.txt'))
      .toBe('cursor-agent --mode ask -p --trust --output-format json --model grok-4.6 "$(cat /workspace/prompt.txt)"');
  });

  it('extracts provider-reported usage from the proven result envelope', () => {
    const adapter = new CursorAdapter('/workspace');
    expect(adapter.extractUsage(JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'ok',
      usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 80, cacheWriteTokens: 5 },
    }))).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 80,
      cacheCreationTokens: 5,
      cacheWriteTokens: 5,
      totalTokens: 150,
      source: 'provider-adapter',
    });
  });

  it('isAvailable probes cursor-agent on PATH without requiring auth', async () => {
    const spawnSyncImpl = vi.fn().mockReturnValue({ status: 0, stdout: '2026.08.11' });
    const adapter = new CursorAdapter('/workspace', { spawnSyncImpl: spawnSyncImpl as never });
    await expect(adapter.isAvailable()).resolves.toBe(true);
    expect(spawnSyncImpl).toHaveBeenCalledWith('cursor-agent', ['--version'], expect.objectContaining({ timeout: 5_000 }));
  });

  it('spawn uses the cross-platform invocation and scrubs credentials', () => {
    vi.spyOn(modelRegistry, 'getByProvider').mockReturnValue([{ id: 'cursor-test' }] as never);
    vi.spyOn(modelRegistry, 'get').mockReturnValue({ apiId: 'grok-4.6' } as never);
    const spawnImpl = vi.fn().mockReturnValue(child());
    const adapter = new CursorAdapter('/workspace', {
      platform: 'linux',
      spawnImpl: spawnImpl as never,
      credentialEnvKeys: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    });
    adapter.spawn('x', 'cursor-test' as ModelType, 'claim', {
      env: { OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'other', PATH: '/bin' },
    });
    expect(spawnImpl).toHaveBeenCalledWith(
      'cursor-agent',
      ['--mode', 'ask', '-p', '--trust', '--output-format', 'json', '--model', 'grok-4.6', '--', 'claim'],
      expect.objectContaining({
        detached: true,
        shell: false,
        env: expect.objectContaining({ PATH: '/bin' }),
      }),
    );
    const env = spawnImpl.mock.calls[0]?.[2]?.env as NodeJS.ProcessEnv;
    expect(env['OPENAI_API_KEY']).toBeUndefined();
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
  });
});
