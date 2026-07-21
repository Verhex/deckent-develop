import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { DockerSpawnBackend, followContainerActivity } from '../../src/orchestra/spawn-backend-docker.js';

describe('Docker budget stream safety tap', () => {
  it('rejects a missing remote budget before any Docker work starts', () => {
    const backend = new DockerSpawnBackend('/tmp/deckent-budget-required');
    expect(() => backend.spawn('budgetless', 'claude-sonnet-5', 'prompt'))
      .toThrow('Remote execution budget is required');
    expect(backend.list()).toEqual([]);
  });

  it('rejects a final-only provider before any Docker work starts', () => {
    const backend = new DockerSpawnBackend('/tmp/deckent-budget-preflight');
    expect(() => backend.spawn('gemini-budgeted', 'gemini-2.5-flash', 'prompt', {
      executionBudget: { maxTurns: 5 },
    })).toThrow('does not expose incremental measured usage');
    expect(backend.list()).toEqual([]);
  });

  it('rejects maxUsd before any Docker work until live pricing is available', () => {
    const backend = new DockerSpawnBackend('/tmp/deckent-budget-usd-preflight');
    expect(() => backend.spawn('usd-budgeted', 'claude-sonnet-5', 'prompt', {
      executionBudget: { maxUsd: 1 },
    })).toThrow('immutable pricing snapshot');
    expect(backend.list()).toEqual([]);
  });

  it('follows normalized events when UI live_trace is disabled', async () => {
    const stdout = new PassThrough();
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = stdout;
    child.kill = vi.fn();
    const spawnFn = vi.fn(() => child);
    const tap = vi.fn();
    const stop = followContainerActivity(
      'deckent-w-budgeted',
      'claude',
      { projectRoot: '/tmp', taskId: 'budgeted', workerId: 'docker-budgeted', enabled: false },
      spawnFn as never,
      tap,
    );
    stdout.end(`${JSON.stringify({ type: 'assistant', message: { id: 'm1', usage: { input_tokens: 1 }, content: [] } })}\n`);
    await new Promise(resolve => setImmediate(resolve));
    expect(spawnFn).toHaveBeenCalledWith(
      'docker',
      ['logs', '-f', 'deckent-w-budgeted'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    expect(tap).toHaveBeenCalledTimes(1);
    stop();
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('reports a critical follower failure exactly once while activity-only stays fail-soft', async () => {
    const critical = vi.fn();
    const throwingSpawn = vi.fn(() => { throw new Error('docker socket unavailable'); });
    const stop = followContainerActivity(
      'deckent-w-critical',
      'claude',
      { projectRoot: '/tmp', taskId: 'critical', workerId: 'docker-critical', enabled: false },
      throwingSpawn as never,
      vi.fn(),
      critical,
    );
    expect(critical).toHaveBeenCalledOnce();
    expect(critical.mock.calls[0]?.[0]).toMatchObject({ message: 'docker socket unavailable' });
    stop();

    const child = new EventEmitter() as EventEmitter & {
      stdout?: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.kill = vi.fn();
    const asyncFailure = vi.fn();
    followContainerActivity(
      'deckent-w-async-failure',
      'claude',
      { projectRoot: '/tmp', taskId: 'async-failure', workerId: 'docker-async-failure', enabled: false },
      vi.fn(() => child) as never,
      vi.fn(),
      asyncFailure,
    );
    child.emit('error', new Error('daemon disconnected'));
    child.emit('close', 17, null);
    await new Promise(resolve => setImmediate(resolve));
    expect(asyncFailure).toHaveBeenCalledOnce();

    expect(() => followContainerActivity(
      'deckent-w-activity-only',
      'claude',
      { projectRoot: '/tmp', taskId: 'activity', workerId: 'docker-activity', enabled: true },
      throwingSpawn as never,
    )).not.toThrow();
  });

  it('treats a missing stdout stream as a critical observer failure', () => {
    const child = new EventEmitter() as EventEmitter & { stdout?: undefined; kill: ReturnType<typeof vi.fn> };
    child.stdout = undefined;
    child.kill = vi.fn();
    const critical = vi.fn();
    followContainerActivity(
      'deckent-w-no-stdout',
      'claude',
      { projectRoot: '/tmp', taskId: 'no-stdout', workerId: 'docker-no-stdout', enabled: false },
      vi.fn(() => child) as never,
      vi.fn(),
      critical,
    );
    expect(critical).toHaveBeenCalledOnce();
    expect(critical.mock.calls[0]?.[0]).toMatchObject({
      message: 'docker logs follower started without a readable stdout stream',
    });
  });
});
