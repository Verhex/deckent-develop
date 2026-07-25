import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  SubprocessSpawnBackend,
  type SubprocessProviderConfig,
} from '../../src/providers/subprocess.js';
import {
  readRuntimeBudgetStop,
  readRuntimeBudgetUsage,
} from '../../src/orchestra/runtime-budget-monitor.js';

function fakeChild(input: { stdout?: PassThrough | null } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    stdout: PassThrough | null;
    kill: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
  };
  child.pid = 987_654_321;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = input.stdout === undefined ? new PassThrough() : input.stdout;
  child.kill = vi.fn(() => true);
  child.unref = vi.fn();
  return child;
}

const supported: SubprocessProviderConfig = {
  cliCommand: 'fake-cli',
  name: 'fake-stream-provider',
  supportedModels: ['claude-sonnet-5'],
  buildArgs: () => [],
  buildCommandString: () => 'fake-cli',
  usageEmitArgs: ['--json'],
  liveStreamArgs: ['--stream-json'],
  liveBudgetEvidenceTrust: 'host-isolated',
};

describe('SubprocessSpawnBackend live execution budget', () => {
  it('enables measured stream without live_trace and terminates on the first exceeded sample', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-subprocess-budget-'));
    process.env.DECKENT_HOME = join(projectRoot, 'host-state');
    const child = fakeChild();
    const spawnImpl = vi.fn(() => child);
    const backend = new SubprocessSpawnBackend(projectRoot, {
      providerConfig: supported,
      spawnImpl: spawnImpl as never,
      platform: 'linux',
    });

    backend.spawn('budgeted', 'claude-sonnet-5', 'prompt', {
      executionBudget: { maxCacheReadTokens: 10 },
      liveTraceEnabled: false,
    });
    expect(spawnImpl.mock.calls[0]?.[1]).toContain('--stream-json');
    expect(spawnImpl.mock.calls[0]?.[2]?.stdio).toEqual(['pipe', 'pipe', expect.any(Number)]);

    const line = JSON.stringify({
      type: 'assistant',
      message: { id: 'msg-1', usage: { cache_read_input_tokens: 11 }, content: [] },
    });
    child.stdout!.write(`${line}\n${line}\n`);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(readRuntimeBudgetStop(projectRoot, 'budgeted')?.decision.counters.cacheReadTokens).toBe(11);
    backend.kill('budgeted');
  });

  it('fails before spawn when the provider has no measured stream mode', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-subprocess-budget-'));
    process.env.DECKENT_HOME = join(projectRoot, 'host-state');
    const spawnImpl = vi.fn();
    const unsupported = { ...supported, name: 'final-only-provider', liveStreamArgs: undefined };
    const backend = new SubprocessSpawnBackend(projectRoot, {
      providerConfig: unsupported,
      spawnImpl: spawnImpl as never,
    });
    expect(() => backend.spawn('blocked', 'claude-sonnet-5', 'prompt', {
      executionBudget: { maxTurns: 5 },
    })).toThrow('Spawn blocked before provider work');
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('fails before spawn for maxUsd until live immutable pricing is available', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-subprocess-budget-'));
    process.env.DECKENT_HOME = join(projectRoot, 'host-state');
    const spawnImpl = vi.fn();
    const backend = new SubprocessSpawnBackend(projectRoot, {
      providerConfig: supported,
      spawnImpl: spawnImpl as never,
    });
    expect(() => backend.spawn('usd-blocked', 'claude-sonnet-5', 'prompt', {
      executionBudget: { maxUsd: 1 },
    })).toThrow('immutable pricing snapshot');
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('contains the exact worker and persists terminal unmeasurable evidence when stdout is unavailable', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-subprocess-budget-'));
    process.env.DECKENT_HOME = join(projectRoot, 'host-state');
    const child = fakeChild({ stdout: null });
    const spawnImpl = vi.fn(() => child);
    const backend = new SubprocessSpawnBackend(projectRoot, {
      providerConfig: supported,
      spawnImpl: spawnImpl as never,
      platform: 'linux',
    });

    backend.spawn('missing-stdout', 'claude-sonnet-5', 'prompt', {
      executionBudget: { maxTurns: 1 },
    });

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    const usage = readRuntimeBudgetUsage(projectRoot, 'missing-stdout');
    expect(usage?.terminal).toBe(true);
    expect(usage?.decision.state).toBe('unmeasurable');
    expect(usage?.decision.reasons.join(' ')).toContain('stream was not attached');
    child.emit('exit', 1);
  });

  it('contains the exact worker and persists terminal unmeasurable evidence on stdout observer error', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-subprocess-budget-'));
    process.env.DECKENT_HOME = join(projectRoot, 'host-state');
    const child = fakeChild();
    const spawnImpl = vi.fn(() => child);
    const backend = new SubprocessSpawnBackend(projectRoot, {
      providerConfig: supported,
      spawnImpl: spawnImpl as never,
      platform: 'linux',
    });

    backend.spawn('stdout-error', 'claude-sonnet-5', 'prompt', {
      executionBudget: { maxTurns: 1 },
    });
    child.stdout!.emit('error', new Error('observer-broken'));

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    const usage = readRuntimeBudgetUsage(projectRoot, 'stdout-error');
    expect(usage?.terminal).toBe(true);
    expect(usage?.decision.state).toBe('unmeasurable');
    expect(usage?.decision.reasons.join(' ')).toContain('observer-broken');
    child.emit('exit', 1);
  });
});
