/**
 * tests/orchestra/ent1-rbac-enforce.test.ts
 *
 * ENT-1: RBAC gate for sprint-spawn + backlog-entry paths (ADR-037 V2 step).
 * Hermetic — pure function calls, no disk I/O, no process spawning.
 *
 * Covers:
 *  - enforce_rbac:true + role='viewer' + requires 'fs-write' → spawn deny (hard block)
 *  - enforce_rbac:false (default off) → allowed / soft-warn (regression)
 *  - No actor + enforce_rbac:true → allowed / permit (permissive default, ADR-037 V1.0)
 */

import { describe, it, expect } from 'vitest';
import { checkBacklogEntryRbac } from '../../src/orchestra/backlog-trigger.js';
import { checkSprintSpawnRbac } from '../../src/orchestra/sprint-runtime.js';
import type { ExecutionRequest, Capability } from '../../src/core/work-model.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal config object — only the enforce_rbac field is accessed by the gates. */
function makeConfig(enforceRbac?: boolean): ResolvedConfig {
  return { enforce_rbac: enforceRbac } as ResolvedConfig;
}

/** Build a minimal ExecutionRequest slice with a role and required capabilities. */
function makeReq(
  role: string | undefined,
  capabilities: Capability[],
): Pick<ExecutionRequest, 'actor' | 'requirements'> {
  return {
    actor: role !== undefined ? { id: 'test-actor', role } : undefined,
    requirements: { capabilities, resources: [] },
  };
}

// ─── checkBacklogEntryRbac ────────────────────────────────────────────────────

describe('ENT-1 checkBacklogEntryRbac', () => {
  it('hard-denies viewer + fs-write when enforce_rbac:true', () => {
    const req = makeReq('viewer', ['fs-write']);
    const result = checkBacklogEntryRbac(req, makeConfig(true));

    expect(result.allowed).toBe(false);
    expect(result.level).toBe('deny');
    expect(result.deniedCapabilities).toContain('fs-write');
    expect(result.role).toBe('viewer');
  });

  it('soft-warns viewer + fs-write when enforce_rbac:false (flag off — regression)', () => {
    const req = makeReq('viewer', ['fs-write']);
    const result = checkBacklogEntryRbac(req, makeConfig(false));

    expect(result.allowed).toBe(true);
    expect(result.level).toBe('warn');
  });

  it('allows (permit) when enforce_rbac is absent (undefined → false)', () => {
    const req = makeReq('viewer', ['fs-write']);
    const result = checkBacklogEntryRbac(req, makeConfig(undefined));

    expect(result.allowed).toBe(true);
  });

  it('allows (permit) when no actor — permissive default (ADR-037 V1.0)', () => {
    const req = makeReq(undefined, ['fs-write', 'shell']);
    const result = checkBacklogEntryRbac(req, makeConfig(true));

    expect(result.allowed).toBe(true);
    expect(result.level).toBe('permit');
    expect(result.role).toBeNull();
  });

  it('allows engineer + fs-write when enforce_rbac:true', () => {
    const req = makeReq('engineer', ['fs-write']);
    const result = checkBacklogEntryRbac(req, makeConfig(true));

    expect(result.allowed).toBe(true);
    expect(result.level).toBe('permit');
    expect(result.deniedCapabilities).toHaveLength(0);
  });

  it('hard-denies viewer + shell when enforce_rbac:true', () => {
    const req = makeReq('viewer', ['shell']);
    const result = checkBacklogEntryRbac(req, makeConfig(true));

    expect(result.allowed).toBe(false);
    expect(result.deniedCapabilities).toContain('shell');
  });
});

// ─── checkSprintSpawnRbac ─────────────────────────────────────────────────────

describe('ENT-1 checkSprintSpawnRbac', () => {
  it('hard-denies viewer + fs-write when enforce_rbac:true (spawn deny)', () => {
    const req = makeReq('viewer', ['fs-write']);
    const result = checkSprintSpawnRbac(req, makeConfig(true));

    expect(result.allowed).toBe(false);
    expect(result.level).toBe('deny');
    expect(result.deniedCapabilities).toContain('fs-write');
  });

  it('allows viewer + fs-write when enforce_rbac:false (flag off — regression)', () => {
    const req = makeReq('viewer', ['fs-write']);
    const result = checkSprintSpawnRbac(req, makeConfig(false));

    expect(result.allowed).toBe(true);
    expect(result.level).toBe('warn');
  });

  it('allows when no actor — permissive default (ADR-037 V1.0)', () => {
    const req = makeReq(undefined, ['fs-write', 'db-write']);
    const result = checkSprintSpawnRbac(req, makeConfig(true));

    expect(result.allowed).toBe(true);
    expect(result.level).toBe('permit');
  });

  it('allows engineer + shell + fs-write when enforce_rbac:true', () => {
    const req = makeReq('engineer', ['shell', 'fs-write']);
    const result = checkSprintSpawnRbac(req, makeConfig(true));

    expect(result.allowed).toBe(true);
    expect(result.level).toBe('permit');
  });

  it('hard-denies viewer + erp-write when enforce_rbac:true', () => {
    const req = makeReq('viewer', ['erp-write']);
    const result = checkSprintSpawnRbac(req, makeConfig(true));

    expect(result.allowed).toBe(false);
    expect(result.deniedCapabilities).toContain('erp-write');
  });

  it('allows admin + all capabilities when enforce_rbac:true', () => {
    const req = makeReq('admin', ['fs-write', 'shell', 'erp-write', 'db-write', 'tenant-scope']);
    const result = checkSprintSpawnRbac(req, makeConfig(true));

    expect(result.allowed).toBe(true);
    expect(result.level).toBe('permit');
    expect(result.deniedCapabilities).toHaveLength(0);
  });
});
