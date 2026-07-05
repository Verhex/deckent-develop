import { describe, it, expect } from 'vitest';
import { createInputQueue, type EnqueueDecision } from '../../src/cli/repl/input-queue.js';

const queued = (position: number): EnqueueDecision => ({ kind: 'queued', position });
const swallowed = (reason: 'empty' | 'duplicate-enter'): EnqueueDecision => ({ kind: 'swallowed', reason });

describe('input-queue — construction', () => {
  it('starts empty', () => {
    const q = createInputQueue();
    expect(q.size()).toBe(0);
    expect(q.snapshot()).toEqual([]);
    expect(q.dequeue()).toBeUndefined();
  });
});

// ─── 1. FIFO korunur ─────────────────────────────────────────────────────────

describe('input-queue — FIFO order preserved', () => {
  it('dequeues in exact enqueue order', () => {
    const q = createInputQueue();
    expect(q.enqueue('alpha')).toEqual(queued(1));
    expect(q.enqueue('beta')).toEqual(queued(2));
    expect(q.enqueue('gamma')).toEqual(queued(3));
    expect(q.dequeue()).toBe('alpha');
    expect(q.dequeue()).toBe('beta');
    expect(q.dequeue()).toBe('gamma');
    expect(q.dequeue()).toBeUndefined();
  });

  it('snapshot reflects pending order oldest-first without mutating the queue', () => {
    const q = createInputQueue();
    q.enqueue('a');
    q.enqueue('b');
    expect(q.snapshot()).toEqual(['a', 'b']);
    expect(q.size()).toBe(2); // snapshot is read-only
    q.snapshot().push('mutated-externally' as unknown as string); // mutate the returned copy
    expect(q.snapshot()).toEqual(['a', 'b']); // internal buffer untouched
  });
});

// ─── 2. Stream-sırasında gelen girdi kaybolmaz ──────────────────────────────

describe('input-queue — input arriving mid-drain is never lost', () => {
  it('interleaved enqueue/dequeue preserves every accepted line, in order', () => {
    const q = createInputQueue();
    q.enqueue('first');
    q.enqueue('second');
    expect(q.dequeue()).toBe('first'); // simulated: first line starts streaming
    q.enqueue('third'); // arrives WHILE 'second' is still pending / turn in flight
    q.enqueue('fourth');
    expect(q.snapshot()).toEqual(['second', 'third', 'fourth']);
    expect(q.dequeue()).toBe('second');
    expect(q.dequeue()).toBe('third');
    expect(q.dequeue()).toBe('fourth');
    expect(q.size()).toBe(0);
  });

  it('a burst of rapid distinct lines all survive intact', () => {
    const q = createInputQueue();
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i}`);
    for (const line of lines) expect(q.enqueue(line).kind).toBe('queued');
    expect(q.size()).toBe(50);
    const drained: string[] = [];
    for (let i = 0; i < lines.length; i++) drained.push(q.dequeue() as string);
    expect(drained).toEqual(lines);
  });
});

// ─── 3. Boş/duplicate-enter yutulur ─────────────────────────────────────────

describe('input-queue — blank and duplicate-enter submissions are swallowed', () => {
  it('swallows an empty line without queuing it', () => {
    const q = createInputQueue();
    expect(q.enqueue('')).toEqual(swallowed('empty'));
    expect(q.size()).toBe(0);
  });

  it('swallows a whitespace-only line (trimmed to empty)', () => {
    const q = createInputQueue();
    expect(q.enqueue('   \t  ')).toEqual(swallowed('empty'));
    expect(q.size()).toBe(0);
  });

  it('swallows an immediate duplicate resubmission of the same trimmed text', () => {
    const q = createInputQueue();
    expect(q.enqueue('deploy')).toEqual(queued(1));
    expect(q.enqueue('deploy')).toEqual(swallowed('duplicate-enter')); // double Enter-fire
    expect(q.size()).toBe(1);
    expect(q.snapshot()).toEqual(['deploy']);
  });

  it('treats surrounding-whitespace variants as the same duplicate text', () => {
    const q = createInputQueue();
    expect(q.enqueue('deploy')).toEqual(queued(1));
    expect(q.enqueue('  deploy  ')).toEqual(swallowed('duplicate-enter'));
    expect(q.size()).toBe(1);
  });

  it('does NOT swallow a different line following a queued one', () => {
    const q = createInputQueue();
    q.enqueue('alpha');
    expect(q.enqueue('beta')).toEqual(queued(2));
    expect(q.size()).toBe(2);
  });

  it('allows the same text again once it has been dequeued (not a permanent block)', () => {
    const q = createInputQueue();
    q.enqueue('status');
    q.dequeue(); // processing started — the guard resets
    expect(q.enqueue('status')).toEqual(queued(1)); // deliberate repeat, not a dup-fire
    expect(q.size()).toBe(1);
  });
});

// ─── 4. İptal (ESC) kuyruğu temizler ────────────────────────────────────────

describe('input-queue — clear() empties the queue (ESC/cancel)', () => {
  it('removes all pending lines', () => {
    const q = createInputQueue();
    q.enqueue('a');
    q.enqueue('b');
    q.enqueue('c');
    q.clear();
    expect(q.size()).toBe(0);
    expect(q.snapshot()).toEqual([]);
    expect(q.dequeue()).toBeUndefined();
  });

  it('resets the duplicate guard so the same text can be queued again right after', () => {
    const q = createInputQueue();
    q.enqueue('reboot');
    q.clear();
    expect(q.enqueue('reboot')).toEqual(queued(1)); // not misread as a duplicate-enter
  });

  it('is a safe no-op on an already-empty queue', () => {
    const q = createInputQueue();
    expect(() => q.clear()).not.toThrow();
    expect(q.size()).toBe(0);
  });
});
