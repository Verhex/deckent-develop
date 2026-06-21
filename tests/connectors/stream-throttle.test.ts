import { describe, it, expect } from 'vitest';
import { makeStreamThrottle } from '../../src/connectors/stream-throttle.js';

describe('makeStreamThrottle', () => {
  it('coalesces rapid pushes and always flushes the final text', async () => {
    const edits: string[] = [];
    let t = 0;
    const th = makeStreamThrottle({ edit: async (s) => { edits.push(s); }, intervalMs: 100, now: () => t });
    th.push('a');           // t=0 → first edit allowed
    await Promise.resolve();
    th.push('ab');          // t=0 → within interval, coalesced (no edit)
    t = 150; th.push('abc'); // t=150 → interval passed → edit 'abc'
    await Promise.resolve();
    await th.flush();        // final → edit latest 'abc' (dedup: skip if identical to last)
    expect(edits[0]).toBe('a');
    expect(edits).toContain('abc');
    // never edits the same text twice in a row
    for (let i = 1; i < edits.length; i++) expect(edits[i]).not.toBe(edits[i - 1]);
  });
});
