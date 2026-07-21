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
});
