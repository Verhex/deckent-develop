import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lazyLoad, LazyMap } from '../../src/core/lazy-loader.js';

describe('lazyLoad', () => {
  it('does not call loader until value is accessed', () => {
    const loader = vi.fn(() => 42);
    const handle = lazyLoad(loader);
    expect(loader).not.toHaveBeenCalled();
    expect(handle.isLoaded).toBe(false);
  });

  it('calls loader on first access', () => {
    const loader = vi.fn(() => 'hello');
    const handle = lazyLoad(loader);
    const value = handle.value;
    expect(value).toBe('hello');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(handle.isLoaded).toBe(true);
  });

  it('caches result after first access', () => {
    const loader = vi.fn(() => ({ data: 'test' }));
    const handle = lazyLoad(loader);
    const v1 = handle.value;
    const v2 = handle.value;
    expect(v1).toBe(v2); // Same reference
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reset forces reload on next access', () => {
    let counter = 0;
    const loader = vi.fn(() => ++counter);
    const handle = lazyLoad(loader);
    expect(handle.value).toBe(1);
    handle.reset();
    expect(handle.isLoaded).toBe(false);
    expect(handle.value).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('handles loader returning undefined', () => {
    const handle = lazyLoad(() => undefined);
    expect(handle.value).toBeUndefined();
    expect(handle.isLoaded).toBe(true);
  });

  it('handles loader returning null', () => {
    const handle = lazyLoad(() => null);
    expect(handle.value).toBeNull();
    expect(handle.isLoaded).toBe(true);
  });
});

describe('LazyMap', () => {
  let map: LazyMap<string>;

  beforeEach(() => {
    map = new LazyMap<string>();
  });

  // ─── register / get ───────────────────────────────────────────

  it('registers and lazily loads a value', () => {
    const loader = vi.fn(() => 'value-a');
    map.register('key-a', loader);
    expect(loader).not.toHaveBeenCalled();

    const result = map.get('key-a');
    expect(result).toBe('value-a');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for unregistered key', () => {
    expect(map.get('unknown')).toBeUndefined();
  });

  it('caches loaded value', () => {
    const loader = vi.fn(() => 'cached');
    map.register('key', loader);
    map.get('key');
    map.get('key');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  // ─── isLoaded ─────────────────────────────────────────────────

  it('returns false before first access', () => {
    map.register('key', () => 'val');
    expect(map.isLoaded('key')).toBe(false);
  });

  it('returns true after access', () => {
    map.register('key', () => 'val');
    map.get('key');
    expect(map.isLoaded('key')).toBe(true);
  });

  it('returns false for unregistered key', () => {
    expect(map.isLoaded('unknown')).toBe(false);
  });

  // ─── reset ────────────────────────────────────────────────────

  it('resets a specific key', () => {
    let counter = 0;
    map.register('key', () => `v${++counter}`);
    expect(map.get('key')).toBe('v1');

    map.reset('key');
    expect(map.isLoaded('key')).toBe(false);
    expect(map.get('key')).toBe('v2');
  });

  // ─── resetAll ─────────────────────────────────────────────────

  it('resets all keys', () => {
    map.register('a', () => 'va');
    map.register('b', () => 'vb');
    map.get('a');
    map.get('b');

    map.resetAll();
    expect(map.isLoaded('a')).toBe(false);
    expect(map.isLoaded('b')).toBe(false);
  });

  // ─── preload ──────────────────────────────────────────────────

  it('preloads specified keys', () => {
    const loaderA = vi.fn(() => 'a');
    const loaderB = vi.fn(() => 'b');
    const loaderC = vi.fn(() => 'c');
    map.register('a', loaderA);
    map.register('b', loaderB);
    map.register('c', loaderC);

    const count = map.preload(['a', 'b']);
    expect(count).toBe(2);
    expect(loaderA).toHaveBeenCalled();
    expect(loaderB).toHaveBeenCalled();
    expect(loaderC).not.toHaveBeenCalled();
  });

  it('preloads all keys when no argument', () => {
    map.register('x', () => 'x');
    map.register('y', () => 'y');
    const count = map.preload();
    expect(count).toBe(2);
  });

  it('skips unregistered keys during preload', () => {
    map.register('a', () => 'a');
    const count = map.preload(['a', 'unknown']);
    expect(count).toBe(1);
  });

  // ─── has ──────────────────────────────────────────────────────

  it('returns true for registered key', () => {
    map.register('key', () => 'val');
    expect(map.has('key')).toBe(true);
  });

  it('returns false for unregistered key', () => {
    expect(map.has('unknown')).toBe(false);
  });

  // ─── keys ─────────────────────────────────────────────────────

  it('returns all registered keys', () => {
    map.register('a', () => 'a');
    map.register('b', () => 'b');
    expect(map.keys()).toContain('a');
    expect(map.keys()).toContain('b');
  });

  // ─── size ─────────────────────────────────────────────────────

  it('tracks size correctly', () => {
    expect(map.size).toBe(0);
    map.register('a', () => 'a');
    expect(map.size).toBe(1);
    map.register('b', () => 'b');
    expect(map.size).toBe(2);
  });

  // ─── Re-register overwrites ───────────────────────────────────

  it('overwrites loader on re-register', () => {
    map.register('key', () => 'old');
    map.get('key');

    map.register('key', () => 'new');
    expect(map.isLoaded('key')).toBe(false);
    expect(map.get('key')).toBe('new');
  });
});
