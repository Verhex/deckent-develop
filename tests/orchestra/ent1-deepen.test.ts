/**
 * tests/orchestra/ent1-deepen.test.ts
 *
 * ENT-1 DEEPEN (306-005) — hard-RBAC enforcement wire + audit-bridge.
 *
 * Covers the wire that ENT-1 (301) left dormant:
 *  - authority-matrix audit bridge: a role violation writes an `authority.denied`
 *    event to the sprint audit hash-chain (both soft-warn and hard-deny).
 *  - checkBacklogEntryRbac / checkSprintSpawnRbac thread the audit context through.
 *  - runtime-loop enforceEntryRbac + deriveEntryCapabilities (the 0-caller gates wired).
 *  - policyGate.decide integration via buildEngineRuntime: enforce_rbac:true +
 *    viewer entry → deny; flag-off → not denied; admin → allowed.
 *
 * Hermetic — tmpdir for audit event reads, no process spawning.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkWorkerAuthority } from '../../src/nervous/authority-matrix.js';
import { AUDIT_EVENT_CHANNEL, _resetChainHead } from '../../src/core/audit-writer.js';
import { readEvents } from '../../src/core/event-stream.js';
import { checkBacklogEntryRbac } from '../../src/orchestra/backlog-trigger.js';
import { checkSprintSpawnRbac } from '../../src/orchestra/sprint-runtime.js';
import {
  buildEngineRuntime,
  deriveEntryCapabilities,
  enforceEntryRbac,
} from '../../src/orchestra/autonomous/runtime-loop.js';
import type { BacklogEntry, BacklogKind } from '../../src/orchestra/autonomous/backlog-types.js';
import type { Capability, ExecutionRequest } from '../../src/core/work-model.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { TaskResult } from '../../src/core/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeConfig(enforceRbac?: boolean): ResolvedConfig {
  return { enforce_rbac: enforceRbac } as ResolvedConfig;
}

function makeReq(
  role: string | undefined,
  capabilities: Capability[],
): Pick<ExecutionRequest, 'actor' | 'requirements'> {
  return {
    actor: role !== undefined ? { id: 'test-actor', role } : undefined,
    requirements: { capabilities, resources: [] },
  };
}

function makeEntry(over: Partial<BacklogEntry> & { kind?: BacklogKind } = {}): BacklogEntry {
  return {
    id: 'e1',
    title: 'test entry',
    kind: over.kind ?? 'capability',
    spec: over.spec ?? {},
    policy: over.policy ?? 'auto',
    trigger: over.trigger ?? { type: 'one-off' },
    status: over.status ?? 'pending',
    lastRun: null,
    lastResult: null,
    ...over,
  } as BacklogEntry;
}

/** Read all audit events written for sprintId='autonomous' under a tmp project root. */
function readAuditEvents(projectRoot: string): Array<{ action?: string; target?: unknown; metadata?: Record<string, unknown> }> {
  return readEvents(projectRoot, 'autonomous', { channel: AUDIT_EVENT_CHANNEL })
    .map((e) => e.payload as { action?: string; target?: unknown; metadata?: Record<string, unknown> });
}

// ─── Audit bridge (authority-matrix) ──────────────────────────────────────────

describe('ENT-1 audit bridge — checkWorkerAuthority writes authority.denied', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), `ent1-audit-${process.pid}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    _resetChainHead();
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hard-deny (enforce_rbac:true) → writes authority.denied with enforced:true', () => {
    const req = makeReq('viewer', ['db-write']);
    const result = checkWorkerAuthority(req, {
      enforceRbac: true,
      audit: { projectRoot: tmpDir, sprintId: 'autonomous', tenantId: 'acme' },
    });

    expect(result.allowed).toBe(false);
    expect(result.level).toBe('deny');

    const audits = readAuditEvents(tmpDir);
    const denied = audits.filter((a) => a.action === 'authority.denied');
    expect(denied).toHaveLength(1);
    expect(denied[0]!.target).toBe('viewer');
    expect(denied[0]!.metadata?.enforced).toBe(true);
    expect((denied[0]!.metadata?.deniedCapabilities as string[]) ?? []).toContain('db-write');
  });

  it('soft-warn (enforce_rbac:false) → still writes authority.denied with enforced:false', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req = makeReq('viewer', ['db-write']);
    const result = checkWorkerAuthority(req, {
      enforceRbac: false,
      audit: { projectRoot: tmpDir },
    });
    warn.mockRestore();

    expect(result.allowed).toBe(true);
    expect(result.level).toBe('warn');

    const denied = readAuditEvents(tmpDir).filter((a) => a.action === 'authority.denied');
    expect(denied).toHaveLength(1);
    expect(denied[0]!.metadata?.enforced).toBe(false);
  });

  it('permit (no violation) → no audit event written', () => {
    const req = makeReq('admin', ['db-write', 'erp-write', 'shell']);
    const result = checkWorkerAuthority(req, {
      enforceRbac: true,
      audit: { projectRoot: tmpDir },
    });

    expect(result.allowed).toBe(true);
    expect(result.level).toBe('permit');
    expect(readAuditEvents(tmpDir).filter((a) => a.action === 'authority.denied')).toHaveLength(0);
  });

  it('no audit ctx → no event written (backward-safe)', () => {
    const req = makeReq('viewer', ['db-write']);
    checkWorkerAuthority(req, { enforceRbac: true });
    expect(readAuditEvents(tmpDir)).toHaveLength(0);
  });
});

// ─── Gate wrappers thread audit through ────────────────────────────────────────

describe('ENT-1 checkBacklogEntryRbac / checkSprintSpawnRbac thread audit', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), `ent1-gate-${process.pid}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    _resetChainHead();
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('checkBacklogEntryRbac deny + audit ctx → authority.denied written', () => {
    const result = checkBacklogEntryRbac(makeReq('viewer', ['db-write']), makeConfig(true), {
      projectRoot: tmpDir,
    });
    expect(result.allowed).toBe(false);
    expect(readAuditEvents(tmpDir).filter((a) => a.action === 'authority.denied')).toHaveLength(1);
  });

  it('checkSprintSpawnRbac deny + audit ctx → authority.denied written', () => {
    const result = checkSprintSpawnRbac(makeReq('viewer', ['shell']), makeConfig(true), {
      projectRoot: tmpDir,
    });
    expect(result.allowed).toBe(false);
    expect(readAuditEvents(tmpDir).filter((a) => a.action === 'authority.denied')).toHaveLength(1);
  });
});

// ─── deriveEntryCapabilities ──────────────────────────────────────────────────

describe('ENT-1 deriveEntryCapabilities', () => {
  it('capability verb db.write → db-write', () => {
    const entry = makeEntry({ kind: 'capability', spec: { capabilityTarget: { capability: 'db.write' } } });
    expect(deriveEntryCapabilities(entry)).toEqual(['db-write']);
  });

  it('capability verb db.query → db-query', () => {
    const entry = makeEntry({ kind: 'capability', spec: { capabilityTarget: { capability: 'db.query' } } });
    expect(deriveEntryCapabilities(entry)).toEqual(['db-query']);
  });

  it('capability verb erp.read → erp-read', () => {
    const entry = makeEntry({ kind: 'capability', spec: { capabilityTarget: { capability: 'erp.read' } } });
    expect(deriveEntryCapabilities(entry)).toEqual(['erp-read']);
  });

  it('capability verb shell.exec → shell', () => {
    const entry = makeEntry({ kind: 'capability', spec: { capabilityTarget: { capability: 'shell.exec' } } });
    expect(deriveEntryCapabilities(entry)).toEqual(['shell']);
  });

  it('unknown verb → fs-read (least-privilege)', () => {
    const entry = makeEntry({ kind: 'capability', spec: { capabilityTarget: { capability: 'mystery.thing' } } });
    expect(deriveEntryCapabilities(entry)).toEqual(['fs-read']);
  });

  it('task / sprint / process → fs-write', () => {
    expect(deriveEntryCapabilities(makeEntry({ kind: 'task' }))).toEqual(['fs-write']);
    expect(deriveEntryCapabilities(makeEntry({ kind: 'sprint' }))).toEqual(['fs-write']);
    expect(deriveEntryCapabilities(makeEntry({ kind: 'process' }))).toEqual(['fs-write']);
  });
});

// ─── enforceEntryRbac ─────────────────────────────────────────────────────────

describe('ENT-1 enforceEntryRbac', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), `ent1-enforce-${process.pid}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    _resetChainHead();
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('viewer + db-write capability + enforce_rbac:true → deny + audit-event', () => {
    const entry = makeEntry({
      kind: 'capability',
      spec: { capabilityTarget: { capability: 'db.write' } },
      actor: { id: 'u1', role: 'viewer' },
      tenant: 'acme',
    });
    const verdict = enforceEntryRbac(entry, makeConfig(true), { projectRoot: tmpDir, tenantId: 'acme' });

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/db-write/);
    const denied = readAuditEvents(tmpDir).filter((a) => a.action === 'authority.denied');
    expect(denied).toHaveLength(1);
    expect(denied[0]!.metadata?.enforced).toBe(true);
  });

  it('viewer + db-write + flag-off → allowed (warn — backward)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry = makeEntry({
      kind: 'capability',
      spec: { capabilityTarget: { capability: 'db.write' } },
      actor: { id: 'u1', role: 'viewer' },
    });
    const verdict = enforceEntryRbac(entry, makeConfig(false), { projectRoot: tmpDir });
    warn.mockRestore();

    expect(verdict.allowed).toBe(true);
  });

  it('admin + db-write + enforce_rbac:true → allowed', () => {
    const entry = makeEntry({
      kind: 'capability',
      spec: { capabilityTarget: { capability: 'db.write' } },
      actor: { id: 'a1', role: 'admin' },
    });
    expect(enforceEntryRbac(entry, makeConfig(true), { projectRoot: tmpDir }).allowed).toBe(true);
  });

  it('no actor role → allowed (permissive default, backward-safe)', () => {
    const entry = makeEntry({ kind: 'sprint' });
    expect(enforceEntryRbac(entry, makeConfig(true), { projectRoot: tmpDir }).allowed).toBe(true);
  });

  it('sprint-kind viewer + enforce_rbac:true → deny (checkSprintSpawnRbac path)', () => {
    // sprint entries derive ['fs-write']; viewer cannot fs-write → backlog gate already denies,
    // so use an admin-allowed capability set is not applicable here. Verify the sprint path by
    // confirming a viewer sprint is denied (fs-write not permitted for viewer).
    const entry = makeEntry({ kind: 'sprint', actor: { id: 'u1', role: 'viewer' } });
    const verdict = enforceEntryRbac(entry, makeConfig(true), { projectRoot: tmpDir });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/fs-write/);
  });
});

// ─── policyGate.decide integration (buildEngineRuntime wire) ───────────────────

describe('ENT-1 policyGate.decide RBAC wire (buildEngineRuntime)', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), `ent1-gate-int-${process.pid}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'backlog.json'), JSON.stringify({ _version: '1.0', entries: [] }, null, 2));
    _resetChainHead();
  });
  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeBundle(enforceRbac: boolean) {
    const doneResult: TaskResult = {
      taskId: 't', selfAssessment: 'DONE', testsPassed: true,
      filesChanged: [], notes: '', linesAdded: 0, linesRemoved: 0,
    };
    return buildEngineRuntime({
      projectRoot: tmpDir,
      config: { deckent_style: 'task', enforce_rbac: enforceRbac } as never,
      backlogPath: join(tmpDir, 'backlog.json'),
      flows: [],
      policy: { id: 'p', trigger: 'scheduled', action: 'start', guard: { requiresApproval: false } },
      runTask: vi.fn().mockResolvedValue({ taskId: 't' }),
      runSprint: vi.fn().mockResolvedValue({}),
      waitForResult: vi.fn().mockResolvedValue(doneResult),
    });
  }

  function trigger(entry: BacklogEntry) {
    return { id: 't1', source: 'backlog' as const, action: 'autonomous.execute', requestedBy: 'system', payload: { entry } };
  }

  it('enforce_rbac:true + viewer entry requiring db-write → decision deny + audit-event', () => {
    const { deps } = makeBundle(true);
    const entry = makeEntry({
      kind: 'capability',
      spec: { capabilityTarget: { capability: 'db.write' } },
      actor: { id: 'u1', role: 'viewer' },
      tenant: 'acme',
    });
    const decision = deps.policyGate!.decide(trigger(entry));
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toMatch(/db-write/);

    const denied = readAuditEvents(tmpDir).filter((a) => a.action === 'authority.denied');
    expect(denied.length).toBeGreaterThanOrEqual(1);
  });

  it('enforce_rbac:false + viewer entry → NOT denied (backward — soft warn)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps } = makeBundle(false);
    const entry = makeEntry({
      kind: 'capability',
      spec: { capabilityTarget: { capability: 'db.write' } },
      actor: { id: 'u1', role: 'viewer' },
      policy: 'auto',
    });
    const decision = deps.policyGate!.decide(trigger(entry));
    warn.mockRestore();
    expect(decision.decision).not.toBe('deny');
  });

  it('enforce_rbac:true + admin entry → NOT denied (reaches policy decision)', () => {
    const { deps } = makeBundle(true);
    const entry = makeEntry({
      kind: 'capability',
      spec: { capabilityTarget: { capability: 'db.write' } },
      actor: { id: 'a1', role: 'admin' },
      policy: 'auto',
    });
    const decision = deps.policyGate!.decide(trigger(entry));
    expect(decision.decision).not.toBe('deny');
  });

  it('enforce_rbac:true + role-less entry → NOT denied (permissive default)', () => {
    const { deps } = makeBundle(true);
    const entry = makeEntry({ kind: 'task', spec: { description: 'plain task' }, policy: 'auto' });
    const decision = deps.policyGate!.decide(trigger(entry));
    expect(decision.decision).not.toBe('deny');
  });
});
