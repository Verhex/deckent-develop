import { describe, it, expect } from 'vitest';
import { makeSerialPool } from '../../../src/orchestra/autonomous/execution-pool.js';

describe('serial execution pool', () => {
  it('runs submitted jobs and returns results in order', async () => {
    const pool = makeSerialPool();
    const order: number[] = [];
    await pool.submit(async () => { order.push(1); });
    await pool.submit(async () => { order.push(2); });
    expect(order).toEqual([1, 2]);
  });

  it('a throwing job rejects its own submit, pool keeps working', async () => {
    const pool = makeSerialPool();
    await expect(pool.submit(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(pool.submit(async () => 'ok')).resolves.toBe('ok');
  });

  it('serializes overlapping submissions (no interleave)', async () => {
    const pool = makeSerialPool();
    const log: string[] = [];
    const slow = pool.submit(async () => { log.push('slow-start'); await new Promise(r => setTimeout(r, 20)); log.push('slow-end'); });
    const fast = pool.submit(async () => { log.push('fast'); });
    await Promise.all([slow, fast]);
    expect(log).toEqual(['slow-start', 'slow-end', 'fast']);
  });
});
