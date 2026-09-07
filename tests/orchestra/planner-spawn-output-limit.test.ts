import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  createPlannerSpawn,
  PlannerSpawnOutputLimitError,
} from '../../src/orchestra/planner.js';

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
    stderr: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
    stdin: EventEmitter & { end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  child.kill = vi.fn();
  return child;
}

describe('createPlannerSpawn output containment', () => {
  it('counts combined stdout/stderr bytes, bounds retention, and terminates once', async () => {
    const child = fakeChild();
    const plannerSpawn = createPlannerSpawn({ platform: 'linux', spawnImpl: vi.fn(() => child) as never });
    const outcomePromise = plannerSpawn('provider', [], { timeoutMs: 5_000, maxOutputBytes: 8 });

    child.stdout.emit('data', '1234');
    child.stderr.emit('data', '5678');
    child.stdout.emit('data', 'overflow');
    child.stderr.emit('data', 'ignored-after-limit');
    child.emit('error', new Error('late error'));
    child.emit('close', 1, 'SIGTERM');

    const outcome = await outcomePromise;
    expect(outcome).toMatchObject({
      status: null,
      signal: 'SIGTERM',
      stdout: '1234',
      stderr: '5678',
      error: expect.objectContaining({ code: 'DECKENT_PLANNER_OUTPUT_LIMIT', maxOutputBytes: 8 }),
    });
    expect(outcome.error).toBeInstanceOf(PlannerSpawnOutputLimitError);
    expect(Buffer.byteLength(outcome.stdout) + Buffer.byteLength(outcome.stderr)).toBeLessThanOrEqual(8);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('measures UTF-8 bytes instead of JavaScript character count', async () => {
    const child = fakeChild();
    const plannerSpawn = createPlannerSpawn({ platform: 'linux', spawnImpl: vi.fn(() => child) as never });
    const outcomePromise = plannerSpawn('provider', [], { timeoutMs: 5_000, maxOutputBytes: 3 });

    child.stdout.emit('data', 'éé');
    child.emit('close', null, 'SIGTERM');
    const outcome = await outcomePromise;

    expect(outcome.error).toMatchObject({ code: 'DECKENT_PLANNER_OUTPUT_LIMIT' });
    expect(outcome.stdout).toBe('');
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('preserves the typed limit when SIGTERM synchronously emits close', async () => {
    const child = fakeChild();
    child.kill.mockImplementation((signal: NodeJS.Signals) => {
      if (signal === 'SIGTERM') child.emit('close', null, 'SIGTERM');
      return true;
    });
    const plannerSpawn = createPlannerSpawn({ platform: 'linux', spawnImpl: vi.fn(() => child) as never });
    const outcomePromise = plannerSpawn('provider', [], { timeoutMs: 5_000, maxOutputBytes: 1 });

    child.stdout.emit('data', 'too large');

    await expect(outcomePromise).resolves.toMatchObject({
      signal: 'SIGTERM',
      error: expect.objectContaining({ code: 'DECKENT_PLANNER_OUTPUT_LIMIT' }),
    });
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('escalates a SIGTERM-ignoring child to SIGKILL within a finite grace', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      child.kill.mockImplementation((signal: NodeJS.Signals) => {
        if (signal === 'SIGKILL') child.emit('close', null, 'SIGKILL');
        return true;
      });
      const plannerSpawn = createPlannerSpawn({ platform: 'linux', spawnImpl: vi.fn(() => child) as never });
      const outcomePromise = plannerSpawn('provider', [], { timeoutMs: 5_000, maxOutputBytes: 1 });

      child.stdout.emit('data', 'too large');
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(outcomePromise).resolves.toMatchObject({
        signal: 'SIGKILL',
        error: expect.objectContaining({ code: 'DECKENT_PLANNER_OUTPUT_LIMIT' }),
      });
      expect(child.kill.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGKILL']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps output-limit ownership through stdin EPIPE until SIGKILL closes the child', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      child.kill.mockImplementation((signal: NodeJS.Signals) => {
        if (signal === 'SIGKILL') child.emit('close', null, 'SIGKILL');
        return true;
      });
      const plannerSpawn = createPlannerSpawn({ platform: 'linux', spawnImpl: vi.fn(() => child) as never });
      const outcomePromise = plannerSpawn('provider', [], {
        timeoutMs: 5_000,
        maxOutputBytes: 1,
        stdin: 'large prompt',
      });

      child.stdout.emit('data', 'too large');
      child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
      child.emit('error', new Error('late termination error'));
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(outcomePromise).resolves.toMatchObject({
        signal: 'SIGKILL',
        error: expect.objectContaining({ code: 'DECKENT_PLANNER_OUTPUT_LIMIT' }),
      });
      expect(child.kill.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGKILL']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('force-reaps a timeout child without letting late errors replace timeout classification', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      child.kill.mockImplementation((signal: NodeJS.Signals) => {
        if (signal === 'SIGKILL') child.emit('close', null, 'SIGKILL');
        return true;
      });
      const plannerSpawn = createPlannerSpawn({ platform: 'linux', spawnImpl: vi.fn(() => child) as never });
      const outcomePromise = plannerSpawn('provider', [], { timeoutMs: 20, stdin: 'prompt' });

      await vi.advanceTimersByTimeAsync(20);
      child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
      child.emit('error', new Error('late termination error'));
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(outcomePromise).resolves.toEqual({
        status: null,
        signal: 'SIGTERM',
        stdout: '',
        stderr: '',
      });
      expect(child.kill.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGKILL']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects invalid output budgets before spawning a child', async () => {
    const spawnImpl = vi.fn();
    const outcome = await createPlannerSpawn({ platform: 'linux', spawnImpl: spawnImpl as never })(
      'provider', [], { timeoutMs: 5_000, maxOutputBytes: Number.NaN },
    );
    expect(outcome.error).toMatchObject({
      code: 'DECKENT_PLANNER_OUTPUT_LIMIT',
      reason: 'invalid',
    });
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('lets an earlier timeout own settlement when later output and EPIPE race', async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      const plannerSpawn = createPlannerSpawn({ platform: 'linux', spawnImpl: vi.fn(() => child) as never });
      const outcomePromise = plannerSpawn('provider', [], {
        timeoutMs: 20,
        maxOutputBytes: 1,
        stdin: 'large prompt',
      });

      await vi.advanceTimersByTimeAsync(20);
      child.stdout.emit('data', 'overflow');
      child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
      child.emit('close', null, 'SIGTERM');

      await expect(outcomePromise).resolves.toEqual({
        status: null,
        signal: 'SIGTERM',
        stdout: '',
        stderr: '',
      });
      expect(child.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows output exactly at the configured boundary', async () => {
    const child = fakeChild();
    const plannerSpawn = createPlannerSpawn({ platform: 'linux', spawnImpl: vi.fn(() => child) as never });
    const outcomePromise = plannerSpawn('provider', [], { timeoutMs: 5_000, maxOutputBytes: 4 });

    child.stdout.emit('data', 'éé');
    child.emit('close', 0, null);

    await expect(outcomePromise).resolves.toEqual({
      status: 0,
      signal: null,
      stdout: 'éé',
      stderr: '',
    });
    expect(child.kill).not.toHaveBeenCalled();
  });
});
