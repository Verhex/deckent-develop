import { describe, expect, it, vi } from 'vitest';
import { createGoalInvocationTransport } from '../../../src/orchestra/autonomous/goal-invocation-transport.js';
import type { ProviderAdapter } from '../../../src/core/provider.js';

describe('createGoalInvocationTransport', () => {
  it('uses the admitted provider/model and requires provider-reported usage', async () => {
    const adapter = {
      name: 'claude', supportedModels: [], spawn() {}, kill() {}, listWorkers: () => [],
      isAvailable: async () => true, buildCommand: () => '',
      buildPlannerCommand: prompt => ({ command: 'claude', args: ['-p', prompt, '--model', 'claude-fable-5'], calledProvider: 'claude', calledModel: 'claude-fable-5', transport: 'cli', executionBackend: 'host-subprocess' }),
      parseAgentResponse: () => 'answer',
      extractUsage: () => ({ inputTokens: 3, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, source: 'provider-adapter' as const }),
    } as ProviderAdapter;
    const spawn = vi.fn(async () => ({ status: 0, signal: null, stdout: '{}', stderr: '' }));
    const transport = createGoalInvocationTransport({ spawn, resolveAdapter: () => adapter, now: (() => { let n = 0; return () => n += 5; })() });
    await expect(transport({ provider: 'claude', model: 'claude-fable-5', prompt: 'p', maxWallClockSeconds: 7 })).resolves.toMatchObject({ output: 'answer', provider: 'claude', model: 'claude-fable-5', usage: { inputTokens: 3, outputTokens: 2 } });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0]![2].timeoutMs).toBe(7_000);
  });

  it('holds output that lacks provider-reported usage', async () => {
    const adapter = { name: 'claude', supportedModels: [], spawn() {}, kill() {}, listWorkers: () => [], isAvailable: async () => true, buildCommand: () => '', buildPlannerCommand: prompt => ({ command: 'claude', args: ['-p', prompt, '--model', 'claude-fable-5'], calledProvider: 'claude', calledModel: 'claude-fable-5', transport: 'cli', executionBackend: 'host-subprocess' }), extractUsage: () => null } as ProviderAdapter;
    const transport = createGoalInvocationTransport({ resolveAdapter: () => adapter, spawn: async () => ({ status: 0, signal: null, stdout: '{}', stderr: '' }) });
    await expect(transport({ provider: 'claude', model: 'claude-fable-5', prompt: 'p' })).rejects.toThrow('GOAL_PROVIDER_REPORTED_USAGE_UNAVAILABLE');
  });
});
