// ═══ Output Collector Tests ═══════════════════════════════════════════
// Sprint 139 — Task 045: Multi-Backend Output Collector
// 10+ tests covering: CircularBuffer, 3 backends, adaptive polling,
// file write, fail-safe, dispose.

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  CircularBuffer,
  OutputCollector,
  createOutputCollector,
  type OutputEntry,
  type OutputBackendType,
  type CollectOptions,
  type OutputSnapshot,
} from '../../src/core/output-collector.js';

// ─── Mock spawnSync for backend capture ─────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({
    status: 0,
    stdout: '',
    stderr: '',
  })),
}));

import { spawnSync } from 'node:child_process';
const mockSpawnSync = spawnSync as unknown as Mock;

// ─── Test Helpers ───────────────────────────────────────────────────

function makeEntry(line: string, stream: 'stdout' | 'stderr' | 'mixed' = 'mixed'): OutputEntry {
  return { timestamp: '2026-04-15T10:00:00.000Z', line, stream };
}

// ═══ CircularBuffer Tests ═══════════════════════════════════════════

describe('CircularBuffer', () => {
  it('should store entries up to capacity', () => {
    const buf = new CircularBuffer(5);
    buf.push(makeEntry('line1'), makeEntry('line2'), makeEntry('line3'));

    expect(buf.length).toBe(3);
    expect(buf.received).toBe(3);
    expect(buf.dropped).toBe(0);
  });

  it('should drop oldest entries when exceeding capacity', () => {
    const buf = new CircularBuffer(3);
    buf.push(
      makeEntry('line1'),
      makeEntry('line2'),
      makeEntry('line3'),
      makeEntry('line4'),
      makeEntry('line5'),
    );

    expect(buf.length).toBe(3);
    expect(buf.received).toBe(5);
    expect(buf.dropped).toBe(2);

    const all = buf.getAll();
    expect(all[0]!.line).toBe('line3');
    expect(all[1]!.line).toBe('line4');
    expect(all[2]!.line).toBe('line5');
  });

  it('should handle incremental pushes with overflow correctly', () => {
    const buf = new CircularBuffer(3);
    buf.push(makeEntry('a'), makeEntry('b'), makeEntry('c'));
    expect(buf.length).toBe(3);
    expect(buf.dropped).toBe(0);

    buf.push(makeEntry('d'));
    expect(buf.length).toBe(3);
    expect(buf.dropped).toBe(1);
    expect(buf.getAll()[0]!.line).toBe('b');
  });

  it('should clear all entries', () => {
    const buf = new CircularBuffer(10);
    buf.push(makeEntry('a'), makeEntry('b'));
    buf.clear();
    expect(buf.length).toBe(0);
    // received/dropped counters persist after clear
    expect(buf.received).toBe(2);
  });

  it('should throw on non-positive capacity', () => {
    expect(() => new CircularBuffer(0)).toThrow('capacity must be positive');
    expect(() => new CircularBuffer(-5)).toThrow('capacity must be positive');
  });

  it('should return a snapshot copy from getAll()', () => {
    const buf = new CircularBuffer(5);
    buf.push(makeEntry('x'));
    const snapshot1 = buf.getAll();
    buf.push(makeEntry('y'));
    const snapshot2 = buf.getAll();

    // snapshot1 should not be affected by later push
    expect(snapshot1.length).toBe(1);
    expect(snapshot2.length).toBe(2);
  });

  it('should handle exact capacity correctly', () => {
    const buf = new CircularBuffer(2);
    buf.push(makeEntry('a'), makeEntry('b'));
    expect(buf.length).toBe(2);
    expect(buf.dropped).toBe(0);
  });

  it('should handle large batch overflow', () => {
    const buf = new CircularBuffer(3);
    const entries = Array.from({ length: 100 }, (_, i) => makeEntry(`line-${i}`));
    buf.push(...entries);

    expect(buf.length).toBe(3);
    expect(buf.received).toBe(100);
    expect(buf.dropped).toBe(97);
    expect(buf.getAll()[0]!.line).toBe('line-97');
  });
});

// ═══ OutputCollector Tests ══════════════════════════════════════════

describe('OutputCollector', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-output-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testRoot, { recursive: true });
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    vi.useFakeTimers();
    mockSpawnSync.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // ─── Docker Backend ─────────────────────────────────────────────

  describe('Docker backend', () => {
    it('should call docker logs with correct args on poll', () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'line1\nline2\nline3\n',
        stderr: '',
      });

      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-001',
        backend: 'docker',
        taskId: '139-001',
        containerName: 'deckent-w-139-001',
      });

      // Trigger the scheduled poll
      vi.advanceTimersByTime(1100);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['logs', '--tail', '1000', '--timestamps', 'deckent-w-139-001'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 10_000 }),
      );

      const snapshot = collector.getSnapshot('w-001');
      expect(snapshot).not.toBeNull();
      expect(snapshot!.lines.length).toBe(3);
      expect(snapshot!.lines[0]!.line).toBe('line1');

      collector.dispose();
    });

    it('should require containerName for Docker backend', () => {
      const collector = new OutputCollector(testRoot);
      expect(() => {
        collector.collect({
          workerId: 'w-001',
          backend: 'docker',
          taskId: '139-001',
        });
      }).toThrow('containerName is required');
      collector.dispose();
    });
  });

  // ─── Tmux Backend ──────────────────────────────────────────────

  describe('tmux backend', () => {
    it('should call tmux capture-pane with correct args on poll', () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'tmux-output-1\ntmux-output-2\n',
        stderr: '',
      });

      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-002',
        backend: 'tmux',
        taskId: '139-002',
        tmuxTarget: 'deckent:w-139-002',
      });

      vi.advanceTimersByTime(1100);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'tmux',
        ['capture-pane', '-t', 'deckent:w-139-002', '-p', '-S', '-1000'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 5_000 }),
      );

      const snapshot = collector.getSnapshot('w-002');
      expect(snapshot!.lines.length).toBe(2);

      collector.dispose();
    });

    it('should require tmuxTarget for tmux backend', () => {
      const collector = new OutputCollector(testRoot);
      expect(() => {
        collector.collect({
          workerId: 'w-002',
          backend: 'tmux',
          taskId: '139-002',
        });
      }).toThrow('tmuxTarget is required');
      collector.dispose();
    });
  });

  // ─── Subprocess Backend ───────────────────────────────────────

  describe('subprocess backend', () => {
    it('should read from task log file', () => {
      // Create a log file
      const tasksDir = join(testRoot, '.tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(
        join(tasksDir, 'task-139-003.log'),
        'sub-line1\nsub-line2\nsub-line3\n',
        'utf-8',
      );

      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-003',
        backend: 'subprocess',
        taskId: '139-003',
      });

      vi.advanceTimersByTime(1100);

      const snapshot = collector.getSnapshot('w-003');
      expect(snapshot!.lines.length).toBe(3);
      expect(snapshot!.lines[0]!.line).toBe('sub-line1');

      collector.dispose();
    });

    it('should handle missing log file gracefully', () => {
      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-004',
        backend: 'subprocess',
        taskId: '139-004',
      });

      vi.advanceTimersByTime(1100);

      const snapshot = collector.getSnapshot('w-004');
      expect(snapshot!.lines.length).toBe(0);

      collector.dispose();
    });
  });

  // ─── Adaptive Polling ─────────────────────────────────────────

  describe('adaptive polling', () => {
    it('should use active interval (1s) when output is flowing', () => {
      let callCount = 0;
      mockSpawnSync.mockImplementation(() => {
        callCount++;
        return {
          status: 0,
          stdout: `line-${callCount}\n`,
          stderr: '',
        };
      });

      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-005',
        backend: 'docker',
        taskId: '139-005',
        containerName: 'deckent-w-139-005',
      });

      // First poll at ~1s
      vi.advanceTimersByTime(1100);
      expect(mockSpawnSync).toHaveBeenCalledTimes(1);

      // Second poll at ~2s (active = 1s interval)
      vi.advanceTimersByTime(1100);
      expect(mockSpawnSync).toHaveBeenCalledTimes(2);

      // Third poll at ~3s
      vi.advanceTimersByTime(1100);
      expect(mockSpawnSync).toHaveBeenCalledTimes(3);

      collector.dispose();
    });

    it('should switch to idle interval (5s) after 3 idle polls', () => {
      // Return empty output to trigger idle
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
      });

      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-006',
        backend: 'docker',
        taskId: '139-006',
        containerName: 'deckent-w-139-006',
      });

      // 3 active polls (1s each) with no output
      vi.advanceTimersByTime(1100); // poll 1
      vi.advanceTimersByTime(1100); // poll 2
      vi.advanceTimersByTime(1100); // poll 3
      const callsAfterActive = mockSpawnSync.mock.calls.length;

      // Now should be on idle interval (5s) — advancing 2s should NOT trigger poll
      vi.advanceTimersByTime(2000);
      expect(mockSpawnSync.mock.calls.length).toBe(callsAfterActive);

      // But advancing to 5s total should trigger
      vi.advanceTimersByTime(3100);
      expect(mockSpawnSync.mock.calls.length).toBe(callsAfterActive + 1);

      collector.dispose();
    });
  });

  // ─── File Write ───────────────────────────────────────────────

  describe('file write', () => {
    it('should flush output to disk with correct format', () => {
      const collector = new OutputCollector(testRoot);

      // Manually populate buffer via internals
      const buffer = new CircularBuffer(100);
      buffer.push(
        { timestamp: '2026-04-15T10:00:00.000Z', line: 'hello world', stream: 'stdout' },
        { timestamp: '2026-04-15T10:00:01.000Z', line: 'error msg', stream: 'stderr' },
      );
      // Access private map for test setup
      (collector as unknown as { buffers: Map<string, CircularBuffer> }).buffers.set('w-flush', buffer);
      (collector as unknown as { polling: Map<string, unknown> }).polling.set('w-flush', {
        workerId: 'w-flush',
        backend: 'subprocess' as OutputBackendType,
        taskId: '139-flush',
        timeout: null,
        lastLineCount: 0,
        consecutiveIdlePolls: 0,
      });

      const path = collector.flushToDisk('w-flush', 'sprint-139');
      expect(path).not.toBeNull();

      const content = readFileSync(path!, 'utf-8');
      expect(content).toContain('[2026-04-15T10:00:00.000Z] [stdout] hello world');
      expect(content).toContain('[2026-04-15T10:00:01.000Z] [stderr] error msg');

      // Verify directory created
      expect(existsSync(join(testRoot, '.deckent', 'sprint-139-outputs'))).toBe(true);

      collector.dispose();
    });

    it('should return null when buffer is empty', () => {
      const collector = new OutputCollector(testRoot);
      const path = collector.flushToDisk('nonexistent');
      expect(path).toBeNull();
      collector.dispose();
    });
  });

  // ─── Fail-safe Behavior ───────────────────────────────────────

  describe('fail-safe', () => {
    it('should handle docker logs failure gracefully', () => {
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'Error: No such container',
      });

      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-fail',
        backend: 'docker',
        taskId: '139-fail',
        containerName: 'nonexistent-container',
      });

      // Should not throw
      vi.advanceTimersByTime(1100);

      const snapshot = collector.getSnapshot('w-fail');
      expect(snapshot!.lines.length).toBe(0);

      collector.dispose();
    });

    it('should handle spawnSync throwing an exception', () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('ENOENT: docker not found');
      });

      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-throw',
        backend: 'docker',
        taskId: '139-throw',
        containerName: 'some-container',
      });

      // Should not throw — fail-safe
      vi.advanceTimersByTime(1100);

      const snapshot = collector.getSnapshot('w-throw');
      expect(snapshot!.lines.length).toBe(0);

      collector.dispose();
    });
  });

  // ─── Lifecycle ────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should prevent collect after dispose', () => {
      const collector = new OutputCollector(testRoot);
      collector.dispose();

      expect(() => {
        collector.collect({
          workerId: 'w-late',
          backend: 'subprocess',
          taskId: '139-late',
        });
      }).toThrow('disposed');
    });

    it('should stop polling when stop() is called', () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'data\n',
        stderr: '',
      });

      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-stop',
        backend: 'docker',
        taskId: '139-stop',
        containerName: 'deckent-w-139-stop',
      });

      vi.advanceTimersByTime(1100);
      const callsBeforeStop = mockSpawnSync.mock.calls.length;

      collector.stop('w-stop', false);

      // No more polls after stop
      vi.advanceTimersByTime(5000);
      expect(mockSpawnSync.mock.calls.length).toBe(callsBeforeStop);

      collector.dispose();
    });

    it('should track active workers correctly', () => {
      const collector = new OutputCollector(testRoot);

      collector.collect({
        workerId: 'w-a',
        backend: 'subprocess',
        taskId: '139-a',
      });
      collector.collect({
        workerId: 'w-b',
        backend: 'subprocess',
        taskId: '139-b',
      });

      expect(collector.getActiveWorkers()).toEqual(expect.arrayContaining(['w-a', 'w-b']));
      expect(collector.getActiveWorkers().length).toBe(2);

      collector.stop('w-a', false);
      expect(collector.getActiveWorkers()).toEqual(['w-b']);

      collector.dispose();
    });

    it('should not add duplicate workers', () => {
      const collector = new OutputCollector(testRoot);

      collector.collect({
        workerId: 'w-dup',
        backend: 'subprocess',
        taskId: '139-dup',
      });

      // Second collect with same workerId should be no-op
      collector.collect({
        workerId: 'w-dup',
        backend: 'subprocess',
        taskId: '139-dup',
      });

      expect(collector.getActiveWorkers().length).toBe(1);

      collector.dispose();
    });

    it('should return null for unknown worker snapshot', () => {
      const collector = new OutputCollector(testRoot);
      expect(collector.getSnapshot('nonexistent')).toBeNull();
      collector.dispose();
    });
  });

  // ─── Custom maxLines ──────────────────────────────────────────

  describe('custom maxLines', () => {
    it('should respect custom maxLines per worker', () => {
      const collector = new OutputCollector(testRoot);
      collector.collect({
        workerId: 'w-small',
        backend: 'subprocess',
        taskId: '139-small',
        maxLines: 5,
      });

      const buffer = collector.getBuffer('w-small');
      expect(buffer).toBeDefined();

      // Push more than capacity
      const entries = Array.from({ length: 10 }, (_, i) => makeEntry(`line-${i}`));
      buffer!.push(...entries);

      expect(buffer!.length).toBe(5);
      expect(buffer!.dropped).toBe(5);

      collector.dispose();
    });
  });

  // ─── Sprint ID Detection ─────────────────────────────────────

  describe('sprint ID detection', () => {
    it('should detect sprint ID from sprint-state.json', () => {
      writeFileSync(
        join(testRoot, '.deckent', 'sprint-state.json'),
        JSON.stringify({ sprintId: 'sprint-139' }),
        'utf-8',
      );

      const collector = new OutputCollector(testRoot);
      const buffer = new CircularBuffer(100);
      buffer.push(makeEntry('test-line'));
      (collector as unknown as { buffers: Map<string, CircularBuffer> }).buffers.set('w-sprint', buffer);
      (collector as unknown as { polling: Map<string, unknown> }).polling.set('w-sprint', {
        workerId: 'w-sprint',
        backend: 'subprocess' as OutputBackendType,
        taskId: '139-sprint',
        timeout: null,
        lastLineCount: 0,
        consecutiveIdlePolls: 0,
      });

      const path = collector.flushToDisk('w-sprint');
      expect(path).toContain('sprint-139-outputs');

      collector.dispose();
    });

    it('should fallback to sprint-unknown when no state file', () => {
      const collector = new OutputCollector(testRoot);
      const buffer = new CircularBuffer(100);
      buffer.push(makeEntry('test-line'));
      (collector as unknown as { buffers: Map<string, CircularBuffer> }).buffers.set('w-fallback', buffer);
      (collector as unknown as { polling: Map<string, unknown> }).polling.set('w-fallback', {
        workerId: 'w-fallback',
        backend: 'subprocess' as OutputBackendType,
        taskId: '139-fallback',
        timeout: null,
        lastLineCount: 0,
        consecutiveIdlePolls: 0,
      });

      const path = collector.flushToDisk('w-fallback');
      expect(path).toContain('sprint-unknown-outputs');

      collector.dispose();
    });
  });

  // ─── Factory ──────────────────────────────────────────────────

  describe('createOutputCollector', () => {
    it('should create an instance', () => {
      const collector = createOutputCollector(testRoot);
      expect(collector).toBeInstanceOf(OutputCollector);
      collector.dispose();
    });
  });
});
