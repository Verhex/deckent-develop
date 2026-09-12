// The planner's memory-read ceiling must be its own, not the shared default.
//
// `DEFAULT_MEMORY_READ_PROFILES` declared a profile for `worker` only, and the
// resolver hardcoded that one consumer — so the planner silently inherited the
// shared 200-line default. A single accepted ADR already exceeds it (largest
// measured in this repo: 287 lines; 3 of 52 exceed 200 on their own), and a
// mandatory entry that does not fit is a hard `REQUIRED_ENTRY_OVERSIZE` hold
// with no truncation path. Planning therefore failed closed and
// deterministically — retrying never helped. Observed live as
// `MEMORY_READ_CONTEXT_HOLD:REQUIRED_ENTRY_OVERSIZE` killing `deckent do`.
//
// These tests pin the declared profile, that it actually reaches the planner,
// and that authored config still outranks it.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MEMORY_READ_PROFILES,
  resolveMemoryReadProfiles,
  resolveMemoryReadLimitsForConsumer,
} from '../../src/core/config.js';
import { DEFAULT_MEMORY_READ_LIMITS } from '../../src/core/memory-read-contract.js';

describe('planner memory-read profile', () => {
  it('is declared and reaches the planner through the resolver', () => {
    const resolved = resolveMemoryReadProfiles({});
    expect(resolved.planner.maxLines).toBe(DEFAULT_MEMORY_READ_PROFILES.planner.maxLines);
    expect(resolved.planner.maxBytes).toBe(DEFAULT_MEMORY_READ_PROFILES.planner.maxBytes);
  });

  it('admits the largest single ADR measured in this repo (287 lines / 23 KB)', () => {
    const { planner } = resolveMemoryReadProfiles({});
    // Plus the per-entry render overhead the service charges on top.
    expect(planner.maxLines).toBeGreaterThan(287 + 7);
    expect(planner.maxBytes).toBeGreaterThan(23_491 + 256);
  });

  it('exceeds the shared default that used to apply to it', () => {
    const { planner } = resolveMemoryReadProfiles({});
    expect(planner.maxLines).toBeGreaterThan(DEFAULT_MEMORY_READ_LIMITS.maxLines);
    expect(planner.maxBytes).toBeGreaterThan(DEFAULT_MEMORY_READ_LIMITS.maxBytes);
  });

  it('carries a larger mandatory budget than the worker', () => {
    // The planner always adds identity, the latest retro and every critical
    // entry on top of the ADRs a directive names.
    const resolved = resolveMemoryReadProfiles({});
    expect(resolved.planner.maxLines).toBeGreaterThan(resolved.worker.maxLines);
    expect(resolved.planner.maxBytes).toBeGreaterThan(resolved.worker.maxBytes);
  });

  it('keeps the worker profile unchanged', () => {
    const resolved = resolveMemoryReadProfiles({});
    expect(resolved.worker.maxLines).toBe(512);
    expect(resolved.worker.maxBytes).toBe(131_072);
  });

  it('leaves a consumer without a declared profile on the shared default', () => {
    const resolved = resolveMemoryReadProfiles({});
    expect(resolved.mcp.maxLines).toBe(DEFAULT_MEMORY_READ_LIMITS.maxLines);
  });
});

describe('planner profile stays owner-overridable', () => {
  it('an authored shared limit wins over the declared default', () => {
    const resolved = resolveMemoryReadProfiles({ memory_read: { maxLines: 300 } });
    expect(resolved.planner.maxLines).toBe(300);
    expect(resolved.worker.maxLines).toBe(300);
  });

  it('an explicit named override wins over the shared limit', () => {
    const resolved = resolveMemoryReadProfiles({
      memory_read: { maxLines: 300 },
      memory_read_profiles: { planner: { maxLines: 900 } },
    });
    expect(resolved.planner.maxLines).toBe(900);
    expect(resolved.worker.maxLines).toBe(300);
  });

  it('a partial override keeps the declared default for untouched limits', () => {
    const resolved = resolveMemoryReadProfiles({
      memory_read_profiles: { planner: { maxLines: 900 } },
    });
    expect(resolved.planner.maxLines).toBe(900);
    expect(resolved.planner.maxBytes).toBe(DEFAULT_MEMORY_READ_PROFILES.planner.maxBytes);
  });

  it('resolveMemoryReadLimitsForConsumer agrees with the profile map', () => {
    expect(resolveMemoryReadLimitsForConsumer({}, 'planner'))
      .toEqual(resolveMemoryReadProfiles({}).planner);
  });
});
