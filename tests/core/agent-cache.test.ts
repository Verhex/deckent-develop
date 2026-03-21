import { describe, it, expect, beforeEach } from 'vitest';
import { AgentSelectionCache } from '../../src/core/agent-cache.js';
import type { TaskSignatureInput, CachedResult } from '../../src/core/agent-cache.js';

function makeTask(overrides: Partial<TaskSignatureInput> = {}): TaskSignatureInput {
  return {
    title: 'Add login page',
    description: 'Create login page with Google OAuth',
    scope: { directories: ['src/auth'], filesWrite: ['src/auth/login.ts'] },
    ...overrides,
  };
}

function makeResult(overrides: Partial<CachedResult> = {}): CachedResult {
  return {
    agentId: 'agent-auth',
    score: 85,
    reason: 'Best match for auth tasks',
    ...overrides,
  };
}

describe('AgentSelectionCache', () => {
  let cache: AgentSelectionCache;

  beforeEach(() => {
    cache = new AgentSelectionCache(100, 60000);
  });

  // ─── taskSignature ────────────────────────────────────────────

  it('generates deterministic signatures', () => {
    const task = makeTask();
    const sig1 = cache.taskSignature(task);
    const sig2 = cache.taskSignature(task);
    expect(sig1).toBe(sig2);
  });

  it('generates different signatures for different tasks', () => {
    const sig1 = cache.taskSignature(makeTask({ title: 'Add login' }));
    const sig2 = cache.taskSignature(makeTask({ title: 'Add signup' }));
    expect(sig1).not.toBe(sig2);
  });

  it('signature starts with sig_ prefix', () => {
    const sig = cache.taskSignature(makeTask());
    expect(sig.startsWith('sig_')).toBe(true);
  });

  it('signature is case-insensitive', () => {
    const sig1 = cache.taskSignature(makeTask({ title: 'Add Login Page' }));
    const sig2 = cache.taskSignature(makeTask({ title: 'add login page' }));
    expect(sig1).toBe(sig2);
  });

  it('signature sorts directories for consistency', () => {
    const sig1 = cache.taskSignature(makeTask({ scope: { directories: ['b', 'a'], filesWrite: [] } }));
    const sig2 = cache.taskSignature(makeTask({ scope: { directories: ['a', 'b'], filesWrite: [] } }));
    expect(sig1).toBe(sig2);
  });

  // ─── cache / get ──────────────────────────────────────────────

  it('stores and retrieves a result', () => {
    const sig = 'sig_test1';
    const result = makeResult();
    cache.cache(sig, result);
    expect(cache.get(sig)).toEqual(result);
  });

  it('returns undefined for cache miss', () => {
    expect(cache.get('sig_nonexistent')).toBeUndefined();
  });

  it('returns undefined for expired entries', () => {
    const shortTtl = new AgentSelectionCache(100, 1); // 1ms TTL
    shortTtl.cache('sig_x', makeResult(), 1);
    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    expect(shortTtl.get('sig_x')).toBeUndefined();
  });

  it('overwrites existing entry on same signature', () => {
    cache.cache('sig_1', makeResult({ agentId: 'first' }));
    cache.cache('sig_1', makeResult({ agentId: 'second' }));
    expect(cache.get('sig_1')?.agentId).toBe('second');
  });

  // ─── LRU eviction ─────────────────────────────────────────────

  it('evicts LRU entry when at capacity', () => {
    const smallCache = new AgentSelectionCache(2, 60000);
    smallCache.cache('sig_1', makeResult({ agentId: 'a1' }));
    smallCache.cache('sig_2', makeResult({ agentId: 'a2' }));

    // Both are cached
    expect(smallCache.size).toBe(2);

    // Adding sig_3 should evict the oldest entry
    smallCache.cache('sig_3', makeResult({ agentId: 'a3' }));
    expect(smallCache.size).toBe(2);
    // sig_3 must be present since we just added it
    expect(smallCache.get('sig_3')).toBeDefined();
  });

  it('does not evict when overwriting existing key', () => {
    const smallCache = new AgentSelectionCache(2, 60000);
    smallCache.cache('sig_1', makeResult({ agentId: 'a1' }));
    smallCache.cache('sig_2', makeResult({ agentId: 'a2' }));
    smallCache.cache('sig_1', makeResult({ agentId: 'a1-updated' }));
    expect(smallCache.size).toBe(2);
    expect(smallCache.get('sig_2')).toBeDefined();
  });

  // ─── invalidate ───────────────────────────────────────────────

  it('invalidates all entries for an agent', () => {
    cache.cache('sig_1', makeResult({ agentId: 'agent-a' }));
    cache.cache('sig_2', makeResult({ agentId: 'agent-a' }));
    cache.cache('sig_3', makeResult({ agentId: 'agent-b' }));

    const removed = cache.invalidate('agent-a');
    expect(removed).toBe(2);
    expect(cache.size).toBe(1);
    expect(cache.get('sig_3')).toBeDefined();
  });

  it('returns 0 when invalidating non-existent agent', () => {
    expect(cache.invalidate('agent-x')).toBe(0);
  });

  // ─── clear ────────────────────────────────────────────────────

  it('clears all entries', () => {
    cache.cache('sig_1', makeResult());
    cache.cache('sig_2', makeResult());
    cache.clear();
    expect(cache.size).toBe(0);
  });

  // ─── has ──────────────────────────────────────────────────────

  it('returns true for cached entry', () => {
    cache.cache('sig_1', makeResult());
    expect(cache.has('sig_1')).toBe(true);
  });

  it('returns false for non-cached entry', () => {
    expect(cache.has('sig_x')).toBe(false);
  });

  // ─── keys ─────────────────────────────────────────────────────

  it('returns all cached keys', () => {
    cache.cache('sig_1', makeResult());
    cache.cache('sig_2', makeResult());
    const keys = cache.keys();
    expect(keys).toContain('sig_1');
    expect(keys).toContain('sig_2');
  });

  // ─── size ─────────────────────────────────────────────────────

  it('tracks size correctly', () => {
    expect(cache.size).toBe(0);
    cache.cache('sig_1', makeResult());
    expect(cache.size).toBe(1);
    cache.cache('sig_2', makeResult());
    expect(cache.size).toBe(2);
  });
});
