import { describe, it, expect, vi } from 'vitest';
import { makeActionExecutor } from '../../src/orchestra/autonomous/action-adapter.js';
import type { ActionHandler } from '../../src/nervous/executor.js';
import type { AutonomousTrigger } from '../../src/orchestra/autonomous-runtime.js';

function makeTrigger(action: string, payload?: unknown): AutonomousTrigger {
  return { id: 't-1', source: 'test', action, requestedBy: 'system', payload };
}

describe('makeActionExecutor', () => {
  it('finds and runs registered handler → ok:true on success outcome', async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue({ outcome: 'success' });
    const executor = makeActionExecutor(new Map([['TEST_ACTION', handler]]));
    const result = await executor.execute(makeTrigger('TEST_ACTION', { key: 'val' }));
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns ok:false when no handler registered for action', async () => {
    const executor = makeActionExecutor(new Map());
    const result = await executor.execute(makeTrigger('UNKNOWN_ACTION'));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no handler');
  });

  it('returns ok:false with error message when handler throws', async () => {
    const handler: ActionHandler = vi.fn().mockRejectedValue(new Error('boom'));
    const executor = makeActionExecutor(new Map([['TEST_ACTION', handler]]));
    const result = await executor.execute(makeTrigger('TEST_ACTION'));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('passes trigger payload through to handler', async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue({ outcome: 'success' });
    const executor = makeActionExecutor(new Map([['METRIC_EMIT', handler]]));
    await executor.execute(makeTrigger('METRIC_EMIT', { metricName: 'latency', value: 99 }));
    expect(handler).toHaveBeenCalledWith('METRIC_EMIT', { metricName: 'latency', value: 99 });
  });

  it('returns ok:false with error when handler returns failure outcome', async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue({
      outcome: 'failure',
      error: 'db write error',
    });
    const executor = makeActionExecutor(new Map([['DB_ACTION', handler]]));
    const result = await executor.execute(makeTrigger('DB_ACTION'));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('db write error');
  });
});
