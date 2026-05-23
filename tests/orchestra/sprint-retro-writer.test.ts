import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { writeRetrospective } from '../../src/orchestra/sprint-retro-writer.js';
import type { Sprint, SprintMetrics, TaskEvaluation } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────

let tmpDir: string;
let brainDir: string;
let store: MemoryStore;
let dbPath: string;

function makeMinimalSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: overrides.id ?? 'sprint-144',
    number: overrides.number ?? 144,
    status: overrides.status ?? ('COMPLETED' as Sprint['status']),
    phase: overrides.phase ?? ('CLEANUP' as Sprint['phase']),
    tasks: overrides.tasks ?? [],
    workers: overrides.workers ?? [],
    metrics: overrides.metrics ?? makeMetrics(),
    startedAt: overrides.startedAt ?? '2026-04-17T10:00:00Z',
    completedAt: overrides.completedAt ?? '2026-04-17T12:00:00Z',
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: overrides.totalTasks ?? 5,
    completedTasks: overrides.completedTasks ?? 4,
    techDebtTasks: overrides.techDebtTasks ?? 1,
    noGoTasks: overrides.noGoTasks ?? 0,
    durationMs: overrides.durationMs ?? 7200000,
    coveragePercent: overrides.coveragePercent ?? 85,
    noGoRate: overrides.noGoRate ?? 0,
    newDebtCount: overrides.newDebtCount ?? 0,
    resolvedDebtCount: overrides.resolvedDebtCount ?? 0,
    totalOpenDebt: overrides.totalOpenDebt ?? 0,
    boundaryViolations: overrides.boundaryViolations ?? 0,
    crossAssignments: overrides.crossAssignments ?? 0,
    contextLinesUsed: overrides.contextLinesUsed ?? 0,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'retro-writer-test-'));
  brainDir = join(tmpDir, '.brain');
  mkdirSync(brainDir, { recursive: true });
  dbPath = join(brainDir, 'memory.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Canonical retro-sprint-NNN ID ───────────────────────────────

describe('writeRetrospective — canonical retro ID', () => {
  it('writes retro entry with canonical retro-sprint-NNN id', () => {
    const sprint = makeMinimalSprint({ id: 'sprint-144', number: 144 });
    const evaluations = new Map<string, TaskEvaluation>();

    writeRetrospective(tmpDir, sprint, evaluations, makeMetrics());

    // Re-open DB to verify (writeRetrospective opens its own store)
    store.close();
    store = new MemoryStore(dbPath);

    const entry = store.getById('retro-sprint-144');
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('retro');
    expect(entry!.sprint_id).toBe('sprint-144');
    expect(entry!.sprint_num).toBe(144);
    expect(entry!.title).toContain('Sprint sprint-144');
  });

  it('does not create retro-latest entry', () => {
    const sprint = makeMinimalSprint();
    const evaluations = new Map<string, TaskEvaluation>();

    writeRetrospective(tmpDir, sprint, evaluations, makeMetrics());

    store.close();
    store = new MemoryStore(dbPath);

    const latest = store.getById('retro-latest');
    expect(latest).toBeNull();
  });
});

// ─── migrateRetroLatest ──────────────────────────────────────────

describe.skip('migrateRetroLatest (not yet implemented)', () => {
  it('soft-deletes legacy retro-latest entry when it exists', () => {
    // Simulate legacy migration script creating retro-latest
    store.insert({
      id: 'retro-latest',
      type: 'retro',
      title: 'Latest Retrospective',
      content: '# Sprint sprint-141 Retrospective\nSome old content',
      source: 'brain',
    });

    expect(store.getById('retro-latest')).not.toBeNull();

    migrateRetroLatest(store, 'sprint-144', 144);

    // Should be soft-deleted (not visible without includeDeleted)
    expect(store.getById('retro-latest')).toBeNull();
    // But still exists as deleted
    expect(store.getById('retro-latest', { includeDeleted: true })).not.toBeNull();
  });

  it('is a no-op when retro-latest does not exist', () => {
    // Should not throw
    expect(() => migrateRetroLatest(store, 'sprint-144', 144)).not.toThrow();
  });

  it('does not affect sprint-specific retro entries', () => {
    // Insert a canonical retro entry
    store.insert({
      id: 'retro-sprint-143',
      type: 'retro',
      title: 'Sprint sprint-143 Retrospective',
      content: 'Sprint 143 retro content',
      source: 'brain',
      sprint_id: 'sprint-143',
      sprint_num: 143,
    });

    // Also insert legacy
    store.insert({
      id: 'retro-latest',
      type: 'retro',
      title: 'Latest Retrospective',
      content: 'old content',
      source: 'brain',
    });

    migrateRetroLatest(store, 'sprint-144', 144);

    // Canonical entry is untouched
    expect(store.getById('retro-sprint-143')).not.toBeNull();
    // Legacy is soft-deleted
    expect(store.getById('retro-latest')).toBeNull();
  });
});

// ─── getLatestRetro ──────────────────────────────────────────────

describe.skip('MemoryStore.getLatestRetro (not yet implemented)', () => {
  it('returns the retro with the highest sprint_num', () => {
    store.insert({
      id: 'retro-sprint-141',
      type: 'retro',
      title: 'Sprint sprint-141 Retrospective',
      content: 'retro 141',
      source: 'brain',
      sprint_id: 'sprint-141',
      sprint_num: 141,
    });
    store.insert({
      id: 'retro-sprint-143',
      type: 'retro',
      title: 'Sprint sprint-143 Retrospective',
      content: 'retro 143',
      source: 'brain',
      sprint_id: 'sprint-143',
      sprint_num: 143,
    });
    store.insert({
      id: 'retro-sprint-142',
      type: 'retro',
      title: 'Sprint sprint-142 Retrospective',
      content: 'retro 142',
      source: 'brain',
      sprint_id: 'sprint-142',
      sprint_num: 142,
    });

    const latest = store.getLatestRetro();
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe('retro-sprint-143');
    expect(latest!.sprint_num).toBe(143);
  });

  it('returns null when no retro entries exist', () => {
    const latest = store.getLatestRetro();
    expect(latest).toBeNull();
  });

  it('excludes soft-deleted retro entries', () => {
    store.insert({
      id: 'retro-sprint-141',
      type: 'retro',
      title: 'Sprint sprint-141 Retrospective',
      content: 'retro 141',
      source: 'brain',
      sprint_id: 'sprint-141',
      sprint_num: 141,
    });

    store.softDelete('retro-sprint-141', 'test');

    const latest = store.getLatestRetro();
    expect(latest).toBeNull();
  });
});

// ─── Sprint 190 carry-over (190-001) — DB write outcome reporting ──
// RC for Sprint 189 [[project_sprint189_retro_db_missing]]:
// memory.db only had pattern rows for sprint-189; sprint-log/retro/memory
// rows were missing because writeRetrospective's DB block was wrapped in
// `catch {}` and silently swallowed failures. The fix returns a
// WriteRetrospectiveResult so finalizers/tests can detect this divergence.

describe('writeRetrospective — DB write outcome (Sprint 190 carry-over 190-001)', () => {
  it('returns WriteRetrospectiveResult with all three rows persisted when DB is healthy', () => {
    const sprint = makeMinimalSprint({ id: 'sprint-190', number: 190 });
    const evaluations = new Map<string, TaskEvaluation>();

    const out = writeRetrospective(tmpDir, sprint, evaluations, makeMetrics());

    expect(out.dbAttempted).toBe(true);
    expect(out.sprintLogWritten).toBe(true);
    expect(out.retroWritten).toBe(true);
    expect(out.memoryWritten).toBe(true);
    expect(out.dbError).toBeNull();

    // Verify all three rows actually landed (the Sprint 189 carry-over symptom
    // was the absence of these rows). Re-open the store because
    // writeRetrospective opens its own.
    store.close();
    store = new MemoryStore(dbPath);
    expect(store.getById('sprint-log-190')).not.toBeNull();
    expect(store.getById('retro-sprint-190')).not.toBeNull();
    expect(store.getById('mem-sprint-190')).not.toBeNull();
  });

  it('reports dbAttempted=false and no error when memory.db is missing (clean skip)', () => {
    // Remove the DB so existsSync(dbPath) returns false in the function.
    // The pre-fix code already short-circuited here, but the contract had to
    // be made explicit on the new return type so callers can branch.
    store.close();
    rmSync(dbPath, { force: true });

    const sprint = makeMinimalSprint({ id: 'sprint-190', number: 190 });
    const out = writeRetrospective(tmpDir, sprint, new Map(), makeMetrics());

    expect(out.dbAttempted).toBe(false);
    expect(out.sprintLogWritten).toBe(false);
    expect(out.retroWritten).toBe(false);
    expect(out.memoryWritten).toBe(false);
    expect(out.dbError).toBeNull();

    // Re-create an empty DB for the afterEach close() — the harness owns it.
    store = new MemoryStore(dbPath);
  });

  it('surfaces dbError when the DB write step throws (Sprint 189 RC regression guard)', () => {
    // Close the harness store so we can hold an exclusive lock from a
    // second process surrogate. Without an explicit failure injection
    // surface we trigger the catch path by making the DB file unwritable.
    // SQLite better-sqlite3 raises SqliteError("attempt to write a readonly database")
    // on upsert under these conditions.
    store.close();

    // Make the DB read-only at the filesystem level so the upsert inside
    // writeRetrospective fails — exercising the previously-silent catch.
    const { chmodSync } = require('node:fs') as typeof import('node:fs');
    chmodSync(dbPath, 0o444);

    const sprint = makeMinimalSprint({ id: 'sprint-190', number: 190 });
    let out;
    try {
      out = writeRetrospective(tmpDir, sprint, new Map(), makeMetrics());
    } finally {
      chmodSync(dbPath, 0o644);
      // Re-open the harness store so afterEach.close() does not double-fault.
      store = new MemoryStore(dbPath);
    }

    expect(out.dbAttempted).toBe(true);
    expect(out.dbError).not.toBeNull();
    // The error message must mention the failure reason — exact text is
    // SQLite version dependent, so we only assert it is a non-empty string.
    expect(typeof out.dbError).toBe('string');
    expect((out.dbError ?? '').length).toBeGreaterThan(0);
    // Pre-fix this would have looked like a successful sprint finalize —
    // now we can tell the rows did not land.
    expect(out.sprintLogWritten).toBe(false);
  });

  it('writes sprint-log, retro, and memory rows in a single invocation (triple-row contract)', () => {
    // Sprint 189 had ONLY a pattern row — sprint, retro, memory all
    // missing. This pins the contract that one writeRetrospective call
    // produces all three rows when the DB is healthy.
    const sprint = makeMinimalSprint({ id: 'sprint-191', number: 191 });
    const evaluations = new Map<string, TaskEvaluation>();

    const out = writeRetrospective(tmpDir, sprint, evaluations, makeMetrics());
    expect(out.dbError).toBeNull();

    store.close();
    store = new MemoryStore(dbPath);
    const sprintRow = store.getById('sprint-log-191');
    const retroRow = store.getById('retro-sprint-191');
    const memoryRow = store.getById('mem-sprint-191');

    expect(sprintRow?.type).toBe('sprint');
    expect(retroRow?.type).toBe('retro');
    expect(memoryRow?.type).toBe('memory');
    expect(sprintRow?.sprint_id).toBe('sprint-191');
    expect(retroRow?.sprint_id).toBe('sprint-191');
    expect(memoryRow?.sprint_id).toBe('sprint-191');
  });

  it('treats a pre-existing mem entry as success (idempotent re-finalize)', () => {
    // Finalize is idempotent — calling writeRetrospective twice must not
    // return dbError on the second call just because mem-* already exists.
    const sprint = makeMinimalSprint({ id: 'sprint-192', number: 192 });

    const first = writeRetrospective(tmpDir, sprint, new Map(), makeMetrics());
    expect(first.dbError).toBeNull();
    expect(first.memoryWritten).toBe(true);

    const second = writeRetrospective(tmpDir, sprint, new Map(), makeMetrics());
    expect(second.dbError).toBeNull();
    expect(second.sprintLogWritten).toBe(true);
    expect(second.retroWritten).toBe(true);
    // Memory row already existed — still reported as written (idempotent).
    expect(second.memoryWritten).toBe(true);
  });
});

// ─── IDENTITY.md AUTOGEN scope validation (Sprint 190 190-001) ───
// The Project Status manual table at IDENTITY.md sat30 was a duplicate of
// the AUTOGEN id="identity-status" block (sat43) and drifted (MCP Tools: 27
// vs 31). Sprint 190 task 190-001 removed the manual duplicate so the
// ## Project Status heading immediately precedes the AUTOGEN block. The
// validator already existed (validateIdentityAutogenScope) — these tests
// pin the desired-state contract.

describe('validateIdentityAutogenScope — Project Status adjacency (Sprint 190 190-001)', () => {
  it('passes when ## Project Status heading immediately precedes identity-status AUTOGEN block', async () => {
    const { writeFileSync } = await import('node:fs');
    const { validateIdentityAutogenScope } = await import('../../src/core/identity-generator.js');

    const workspaceDir = join(tmpDir, '.deckent', 'workspace');
    mkdirSync(workspaceDir, { recursive: true });

    const goodContent = [
      '# Project Identity',
      'Name: deckent',
      '<!-- AUTOGEN:START id="identity-summary" -->',
      'MCP: 31 tools, 8 resources',
      '<!-- AUTOGEN:END id="identity-summary" -->',
      '',
      '## Project Status',
      '<!-- AUTOGEN:START id="identity-status" -->',
      '| Metric | Value |',
      '|--------|-------|',
      '| MCP Tools | 31 |',
      '<!-- AUTOGEN:END id="identity-status" -->',
      '',
    ].join('\n');
    writeFileSync(join(workspaceDir, 'IDENTITY.md'), goodContent);

    const result = validateIdentityAutogenScope(tmpDir);
    expect(result.ok).toBe(true);
    expect(result.mcpToolCount).toBe(31);
    expect(result.findings).toEqual([]);
  });

  it('fails when a manual Project Status table sits between the heading and the AUTOGEN block (Sprint 189 drift)', async () => {
    const { writeFileSync } = await import('node:fs');
    const { validateIdentityAutogenScope } = await import('../../src/core/identity-generator.js');

    const workspaceDir = join(tmpDir, '.deckent', 'workspace');
    mkdirSync(workspaceDir, { recursive: true });

    // Re-create the exact Sprint 189 drift pattern: manual table interleaved
    // between the heading and the AUTOGEN block.
    const driftedContent = [
      '# Project Identity',
      '',
      '<!-- AUTOGEN:START id="identity-summary" -->',
      'MCP: 31 tools, 8 resources',
      '<!-- AUTOGEN:END id="identity-summary" -->',
      '',
      '## Project Status',
      '| Metric | Value |',
      '|--------|-------|',
      '| MCP Tools | 27 |',          // ← stale manual value
      '',
      '<!-- AUTOGEN:START id="identity-status" -->',
      '| Metric | Value |',
      '|--------|-------|',
      '| MCP Tools | 31 |',
      '<!-- AUTOGEN:END id="identity-status" -->',
      '',
    ].join('\n');
    writeFileSync(join(workspaceDir, 'IDENTITY.md'), driftedContent);

    const result = validateIdentityAutogenScope(tmpDir);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => f.includes('## Project Status heading does not immediately precede')))
      .toBe(true);
  });

  it('fails when MCP Tools count in identity-status drops below the registered minimum (31)', async () => {
    const { writeFileSync } = await import('node:fs');
    const { validateIdentityAutogenScope } = await import('../../src/core/identity-generator.js');

    const workspaceDir = join(tmpDir, '.deckent', 'workspace');
    mkdirSync(workspaceDir, { recursive: true });

    const lowCountContent = [
      '# Project Identity',
      '<!-- AUTOGEN:START id="identity-summary" -->',
      'MCP: 27 tools, 8 resources',
      '<!-- AUTOGEN:END id="identity-summary" -->',
      '',
      '## Project Status',
      '<!-- AUTOGEN:START id="identity-status" -->',
      '| Metric | Value |',
      '| MCP Tools | 27 |',
      '<!-- AUTOGEN:END id="identity-status" -->',
      '',
    ].join('\n');
    writeFileSync(join(workspaceDir, 'IDENTITY.md'), lowCountContent);

    const result = validateIdentityAutogenScope(tmpDir);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => /MCP Tools count 27 is below expected minimum 31/.test(f)))
      .toBe(true);
  });
});
