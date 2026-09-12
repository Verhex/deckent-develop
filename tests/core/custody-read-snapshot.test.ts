import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustodyReadSnapshot } from '../../src/core/custody-read-snapshot.js';

afterEach(() => vi.restoreAllMocks());
const bounds = { maxEntries: 100, maxBytes: 10_000, maxDurationMs: 1000 };
const fail = (reason: string): never => { throw new Error(reason); };

describe('bounded custody read operation', () => {
  it('detects an expired monotonic deadline even if wall time does not advance', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const view = new CustodyReadSnapshot(bounds, fail);
    clock.mockReturnValue(1001);
    expect(() => view.verify()).toThrow('deadline');
    expect(() => view.verify()).toThrow('deadline');
  });
  it('keeps consumer namespaces separate and expires them with the operation', () => {
    const firstOwner = {}, otherOwner = {};
    const view = new CustodyReadSnapshot(bounds, fail);
    expect(view.memoForOwner(firstOwner, 'same', () => ({ value: 1 }))).toEqual({ value: 1 });
    expect(view.memoForOwner(otherOwner, 'same', () => ({ value: 2 }))).toEqual({ value: 2 });
    const never = vi.fn(() => ({ value: 3 }));
    expect(view.memoForOwner(firstOwner, 'same', never)).toEqual({ value: 1 });
    expect(never).not.toHaveBeenCalled();
    view.verify();
    expect(new CustodyReadSnapshot(bounds, fail).memoForOwner(firstOwner, 'same', never)).toEqual({ value: 3 });
  });
  it('checks directory membership after all content observations', () => {
    const events: string[] = [];
    const view = new CustodyReadSnapshot(bounds, fail);
    for (const name of ['scan:dispatch', 'file:admission', 'marker:effect']) {
      view.observe(name, () => { events.push(name); return name; }, x => x, () => 1, x => x);
    }
    events.length = 0;
    view.verify();
    expect(events).toEqual(['file:admission', 'marker:effect', 'scan:dispatch']);
  });
  it('rechecks missing observations and invalidates swallowed read failures', () => {
    let content: string | null = null;
    const view = new CustodyReadSnapshot(bounds, fail);
    view.observe('file:a', () => content, JSON.stringify, () => 1, x => x);
    content = 'published';
    expect(() => view.verify()).toThrow('changed');
    const failed = new CustodyReadSnapshot(bounds, fail);
    expect(() => failed.memo('fact', () => { throw new Error('read failed'); })).toThrow('read failed');
    expect(() => failed.verify()).toThrow('changed');
  });
});
