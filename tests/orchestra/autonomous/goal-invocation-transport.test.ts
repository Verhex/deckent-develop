import { describe, expect, it, vi } from 'vitest';
import { createGoalInvocationTransport } from '../../../src/orchestra/autonomous/goal-invocation-transport.js';
import type { ProviderAdapter } from '../../../src/core/provider.js';

describe('createGoalInvocationTransport', () => {
  it.each([
    { transport: 'cli' as const, executionBackend: 'docker' as const, endpointRefHash: 'a'.repeat(64) },
    { transport: 'api' as const, executionBackend: 'host-subprocess' as const, endpointRefHash: 'a'.repeat(64) },
    { transport: 'cli' as const, executionBackend: 'host-subprocess' as const, endpointRefHash: 'a'.repeat(64) },
  ])('rejects unsupported backend identity before adapter discovery or process spawn: $transport/$executionBackend', async (backend) => {
    const resolveAdapter = vi.fn();
    const spawn = vi.fn();
    const transport = createGoalInvocationTransport({ resolveAdapter, spawn });
    await expect(transport({
      provider: 'claude',
      model: 'claude-fable-5',
      prompt: 'p',
      backend,
    })).rejects.toThrow('GOAL_SELECTED_TRANSPORT_IDENTITY_MISMATCH');
    expect(resolveAdapter).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects a missing backend as typed no-dispatch identity failure', async () => {
    const resolveAdapter = vi.fn();
    const spawn = vi.fn();
    const transport = createGoalInvocationTransport({ resolveAdapter, spawn });
    await expect(transport({
      provider: 'claude', model: 'claude-fable-5', prompt: 'p', backend: undefined,
    } as never)).rejects.toMatchObject({
      reasonCode: 'backend_identity_mismatch',
      dispatchStarted: false,
    });
    expect(resolveAdapter).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

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
    const backend = { transport: 'cli' as const, executionBackend: 'host-subprocess' as const, endpointRefHash: null };
    await expect(transport({ provider: 'claude', model: 'claude-fable-5', prompt: 'p', backend, maxWallClockSeconds: 7 })).resolves.toMatchObject({ output: 'answer', provider: 'claude', model: 'claude-fable-5', backend, usage: { inputTokens: 3, outputTokens: 2 } });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0]![2].timeoutMs).toBe(7_000);
  });

  it('holds output that lacks provider-reported usage', async () => {
    const adapter = { name: 'claude', supportedModels: [], spawn() {}, kill() {}, listWorkers: () => [], isAvailable: async () => true, buildCommand: () => '', buildPlannerCommand: prompt => ({ command: 'claude', args: ['-p', prompt, '--model', 'claude-fable-5'], calledProvider: 'claude', calledModel: 'claude-fable-5', transport: 'cli', executionBackend: 'host-subprocess' }), extractUsage: () => null } as ProviderAdapter;
    const transport = createGoalInvocationTransport({ resolveAdapter: () => adapter, spawn: async () => ({ status: 0, signal: null, stdout: '{}', stderr: '' }) });
    await expect(transport({ provider: 'claude', model: 'claude-fable-5', prompt: 'p', backend: {
      transport: 'cli', executionBackend: 'host-subprocess', endpointRefHash: null,
    } })).rejects.toThrow('GOAL_PROVIDER_REPORTED_USAGE_UNAVAILABLE');
  });
});
