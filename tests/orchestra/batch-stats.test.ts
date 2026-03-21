import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { BatchStatsUpdater } from '../../src/orchestra/batch-stats.js';
import type { StatsUpdate } from '../../src/orchestra/batch-stats.js';

vi.mock('node:fs');

const ROOT = '/tmp/test-project';

function makeUpdate(overrides: Partial<StatsUpdate> = {}): StatsUpdate {
  return {
    type: 'agent',
    id: 'agent-1',
    data: { successRate: 0.9, totalUses: 10 },
    ...overrides,
  };
}

describe('BatchStatsUpdater', () => {
  let updater: BatchStatsUpdater;

  beforeEach(() => {
    vi.restoreAllMocks();
    updater = new BatchStatsUpdater(ROOT);
  });

  // ─── queue ────────────────────────────────────────────────────

  it('queues a single update', () => {
    updater.queue(makeUpdate());
    expect(updater.pending).toBe(1);
  });

  it('queues multiple updates', () => {
    updater.queue(makeUpdate({ id: 'a1' }));
    updater.queue(makeUpdate({ id: 'a2' }));
    expect(updater.pending).toBe(2);
  });

  // ─── queueAll ─────────────────────────────────────────────────

  it('queues all updates at once', () => {
    updater.queueAll([makeUpdate({ id: 'a1' }), makeUpdate({ id: 'a2' })]);
    expect(updater.pending).toBe(2);
  });

  // ─── flush ────────────────────────────────────────────────────

  it('returns 0 flushed when queue is empty', () => {
    const result = updater.flush();
    expect(result.flushed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('flushes queued updates to disk', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    updater.queue(makeUpdate());
    const result = updater.flush();

    expect(result.flushed).toBe(1);
    expect(result.errors).toEqual([]);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('merges updates for same type+id', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    updater.queue(makeUpdate({ data: { successRate: 0.8 } }));
    updater.queue(makeUpdate({ data: { totalUses: 15 } }));
    const result = updater.flush();

    expect(result.flushed).toBe(2);
    // Only one file written because both updates target agent-agent-1
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written.successRate).toBe(0.8);
    expect(written.totalUses).toBe(15);
    expect(written.updatedAt).toBeDefined();
  });

  it('writes separate files for different types', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    updater.queue(makeUpdate({ type: 'agent', id: 'a1' }));
    updater.queue(makeUpdate({ type: 'skill', id: 's1' }));
    const result = updater.flush();

    expect(result.flushed).toBe(2);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
  });

  it('merges with existing file data', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ existingField: 'keep' }));
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    updater.queue(makeUpdate({ data: { newField: 'added' } }));
    updater.flush();

    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written.existingField).toBe('keep');
    expect(written.newField).toBe('added');
  });

  it('handles corrupt existing file gracefully', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not-json');
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    updater.queue(makeUpdate({ data: { value: 42 } }));
    const result = updater.flush();

    expect(result.flushed).toBe(1);
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written.value).toBe(42);
  });

  it('clears queue after flush', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    updater.queue(makeUpdate());
    updater.flush();
    expect(updater.pending).toBe(0);
  });

  it('records errors for failed writes', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => { throw new Error('EACCES'); });

    updater.queue(makeUpdate());
    const result = updater.flush();

    expect(result.flushed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('EACCES');
  });

  // ─── clear ────────────────────────────────────────────────────

  it('clears queue without flushing', () => {
    updater.queue(makeUpdate());
    updater.queue(makeUpdate());
    updater.clear();
    expect(updater.pending).toBe(0);
  });

  // ─── getQueue ─────────────────────────────────────────────────

  it('returns a copy of the queue', () => {
    const update = makeUpdate();
    updater.queue(update);
    const queue = updater.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(update);
    // Modifying returned array should not affect internal queue
    queue.pop();
    expect(updater.pending).toBe(1);
  });

  // ─── Different update types ────────────────────────────────────

  it('handles sprint type updates', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    updater.queue({ type: 'sprint', id: 'sprint-001', data: { totalTasks: 10 } });
    const result = updater.flush();
    expect(result.flushed).toBe(1);
  });

  it('handles task type updates', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    updater.queue({ type: 'task', id: 'task-001', data: { status: 'DONE' } });
    const result = updater.flush();
    expect(result.flushed).toBe(1);
  });
});
