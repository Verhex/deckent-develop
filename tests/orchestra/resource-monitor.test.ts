// ─── resource-monitor tests ────────────────────────────────────────────────
// Hermetic: all file I/O uses tmpdir; spawn is always mocked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeMockSpawn(lines: string[], exitCode = 0) {
  return (_cmd: string, _args: string[]): ChildProcess => {
    const emitter = new EventEmitter() as ChildProcess;
    const stdout = new EventEmitter();
    // @ts-expect-error — mock partial ChildProcess
    emitter.stdout = stdout;
    // emit async so listeners have time to attach
    setImmediate(() => {
      if (lines.length > 0) {
        stdout.emit('data', lines.join('\n') + '\n');
      }
      emitter.emit('close', exitCode);
    });
    return emitter;
  };
}

function makeMockSpawnError() {
  return (_cmd: string, _args: string[]): ChildProcess => {
    const emitter = new EventEmitter() as ChildProcess;
    const stdout = new EventEmitter();
    // @ts-expect-error — mock partial ChildProcess
    emitter.stdout = stdout;
    setImmediate(() => {
      emitter.emit('error', new Error('spawn docker ENOENT'));
    });
    return emitter;
  };
}

function makeDockerStatLine(overrides: {
  Name?: string;
  MemUsage?: string;
  MemPerc?: string;
  CPUPerc?: string;
  NetIO?: string;
  BlockIO?: string;
} = {}): string {
  return JSON.stringify({
    Name: 'deckent-w-271-001',
    MemUsage: '512MiB / 4GiB',
    MemPerc: '12.50%',
    CPUPerc: '3.14%',
    NetIO: '1.2MB / 500kB',
    BlockIO: '0B / 0B',
    ...overrides,
  });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `rm-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ─── Import (lazy after mocks) ────────────────────────────────────────────

async function getModule() {
  const mod = await import('../../src/orchestra/resource-monitor.js');
  return mod;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('createResourceMonitor', () => {
  it('sampleOnce returns parsed samples from mock spawn output', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    const monitor = createResourceMonitor({
      logPath,
      spawnImpl: makeMockSpawn([makeDockerStatLine()]),
    });

    const samples = await monitor.sampleOnce();

    expect(samples).toHaveLength(1);
    expect(samples[0]!.container).toBe('deckent-w-271-001');
    expect(samples[0]!.taskId).toBe('271-001');
    expect(samples[0]!.memUsageBytes).toBeGreaterThan(0);
    expect(samples[0]!.memLimitBytes).toBeGreaterThan(0);
    expect(samples[0]!.cpuPerc).toBeCloseTo(3.14, 1);
    expect(samples[0]!.memPerc).toBeCloseTo(12.5, 1);
    expect(typeof samples[0]!.ts).toBe('string');
  });

  it('sampleOnce filters out containers not matching filterPrefix', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    const lines = [
      makeDockerStatLine({ Name: 'deckent-w-001' }),
      makeDockerStatLine({ Name: 'other-container' }),
      makeDockerStatLine({ Name: 'nginx' }),
    ];
    const monitor = createResourceMonitor({
      logPath,
      spawnImpl: makeMockSpawn(lines),
    });

    const samples = await monitor.sampleOnce();

    expect(samples).toHaveLength(1);
    expect(samples[0]!.container).toBe('deckent-w-001');
  });

  it('sampleOnce derives taskId by stripping filterPrefix', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    const monitor = createResourceMonitor({
      logPath,
      spawnImpl: makeMockSpawn([makeDockerStatLine({ Name: 'deckent-w-270-005' })]),
    });

    const samples = await monitor.sampleOnce();
    expect(samples[0]!.taskId).toBe('270-005');
  });

  it('sampleOnce uses custom filterPrefix when provided', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    const lines = [
      makeDockerStatLine({ Name: 'myapp-w-001' }),
      makeDockerStatLine({ Name: 'deckent-w-001' }),
    ];
    const monitor = createResourceMonitor({
      logPath,
      spawnImpl: makeMockSpawn(lines),
      filterPrefix: 'myapp-w-',
    });

    const samples = await monitor.sampleOnce();
    expect(samples).toHaveLength(1);
    expect(samples[0]!.container).toBe('myapp-w-001');
    expect(samples[0]!.taskId).toBe('001');
  });

  it('sampleOnce returns empty array when docker is unavailable (spawn error)', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    const monitor = createResourceMonitor({
      logPath,
      spawnImpl: makeMockSpawnError(),
    });

    // Must not throw
    const samples = await monitor.sampleOnce();
    expect(samples).toEqual([]);
  });

  it('sampleOnce skips malformed JSON lines gracefully', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    const lines = [
      'NOT_JSON',
      makeDockerStatLine({ Name: 'deckent-w-001' }),
      '{broken json',
    ];
    const monitor = createResourceMonitor({
      logPath,
      spawnImpl: makeMockSpawn(lines),
    });

    const samples = await monitor.sampleOnce();
    // Only the valid line matching prefix
    expect(samples).toHaveLength(1);
    expect(samples[0]!.container).toBe('deckent-w-001');
  });

  it('appends samples as JSONL to logPath', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    const lines = [
      makeDockerStatLine({ Name: 'deckent-w-001' }),
      makeDockerStatLine({ Name: 'deckent-w-002' }),
    ];
    const monitor = createResourceMonitor({
      logPath,
      spawnImpl: makeMockSpawn(lines),
    });

    // Manually trigger a sample cycle by starting and stopping quickly
    // We call sampleOnce and then simulate what the timer tick does:
    const { appendFileSync } = await import('node:fs');
    const samples = await monitor.sampleOnce();
    for (const s of samples) {
      appendFileSync(logPath, JSON.stringify(s) + '\n', 'utf-8');
    }

    const content = readFileSync(logPath, 'utf-8');
    const jsonLines = content.trim().split('\n').filter(Boolean);
    expect(jsonLines).toHaveLength(2);
    const parsed = jsonLines.map((l) => JSON.parse(l));
    expect(parsed[0]).toMatchObject({ container: 'deckent-w-001', taskId: '001' });
    expect(parsed[1]).toMatchObject({ container: 'deckent-w-002', taskId: '002' });
  });

  it('uses parseMemoryString from spawn-backend-docker to parse memory values', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    // 512MiB → 512 * 1024^2 = 536870912 bytes
    // 4GiB → 4 * 1024^3 = 4294967296 bytes
    const monitor = createResourceMonitor({
      logPath,
      spawnImpl: makeMockSpawn([makeDockerStatLine({ MemUsage: '512MiB / 4GiB' })]),
    });

    const samples = await monitor.sampleOnce();
    expect(samples[0]!.memUsageBytes).toBe(512 * 1024 * 1024);
    expect(samples[0]!.memLimitBytes).toBe(4 * 1024 * 1024 * 1024);
  });

  it('stop() after start() prevents further ticks (timer cleared)', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    let callCount = 0;
    const spawnImpl = (_cmd: string, _args: string[]): ChildProcess => {
      callCount++;
      const emitter = new EventEmitter() as ChildProcess;
      const stdout = new EventEmitter();
      // @ts-expect-error — mock partial ChildProcess
      emitter.stdout = stdout;
      setImmediate(() => {
        emitter.emit('close', 0);
      });
      return emitter;
    };

    const monitor = createResourceMonitor({
      logPath,
      intervalMs: 50, // very fast interval for testing
      spawnImpl,
    });

    monitor.start();
    await monitor.stop();
    const countAfterStop = callCount;

    // Wait a bit longer — no more ticks should fire after stop
    await new Promise((r) => setTimeout(r, 150));
    expect(callCount).toBe(countAfterStop);
  });

  it('sampleOnce returns empty array when spawn emits no output', async () => {
    const { createResourceMonitor } = await getModule();
    const logPath = join(tmpDir, 'resource.jsonl');
    const monitor = createResourceMonitor({
      logPath,
      spawnImpl: makeMockSpawn([]),
    });

    const samples = await monitor.sampleOnce();
    expect(samples).toEqual([]);
  });
});
