/**
 * tests/core/adr-file-sync.test.ts
 *
 * Tests for src/core/adr-file-sync.ts — MADR v3 ADR markdown parsing
 * and memory.db upsert sync (Bug M Sprint 166 T1).
 *
 * Coverage:
 *   1. happy path — multiple valid ADRs insert
 *   2. idempotent — second sync with no changes performs no updates
 *   3. malformed skip — file without H1/status is skipped + error reported
 *   4. status transition — existing entry status changes are upserted
 *   5. sprint_id extraction — `Sprint NNN` is parsed into `sprint-NNN`
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import {
  parseAdrFile,
  syncAdrFilesToDb,
  adrToEntryInput,
} from '../../src/core/adr-file-sync.js';

// ─── Test Fixtures ─────────────────────────────────────────────────

const ADR_043 = `# ADR-043: Brain Crash Recovery Protocol

**Status:** accepted

**Sprint:** Sprint 163

## Context

Sprint 159-161 forensic analysis.

## Decision

3-layer crash recovery protocol.
`;

const ADR_044 = `# ADR-044: Sprint State Observability Contract

**Status:** accepted

**Sprint:** Sprint 163

## Context

Sprint state file did not reflect lifecycle progress.
`;

const ADR_045 = `# ADR-045: Wave-Based Execution Semantics

**Status:** proposed

**Sprint:** Sprint 164

## Context

respawnEligibleTasks runtime wire.
`;

const ADR_MALFORMED_NO_TITLE = `## Some Section

**Status:** accepted

No H1 header.
`;

const ADR_MALFORMED_NO_STATUS = `# ADR-099: Missing Status

## Context

No status declaration.
`;

const ADR_G_019 = `# ADR-G-019: Governance Taxonomy

**Class:** ADR-G · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement-Level:** hard
**Status:** accepted

## Decision

Taxonomy metadata is queryable.
`;

// ─── Helpers ───────────────────────────────────────────────────────

function makeTmpAdrDir(): string {
  const dir = join(tmpdir(), `adr-sync-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTmpDbPath(): string {
  const dir = join(tmpdir(), `adr-sync-db-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'memory.db');
}

function writeAdr(dir: string, name: string, content: string): string {
  const filePath = join(dir, name);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ─── parseAdrFile ──────────────────────────────────────────────────

describe('parseAdrFile', () => {
  let adrDir: string;

  beforeEach(() => {
    adrDir = makeTmpAdrDir();
  });

  afterEach(() => {
    if (existsSync(adrDir)) rmSync(adrDir, { recursive: true, force: true });
  });

  it('parses a valid MADR v3 file with title, status, sprint', () => {
    const filePath = writeAdr(adrDir, '043-brain-crash-recovery.md', ADR_043);
    const parsed = parseAdrFile(filePath);

    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('adr-043');
    expect(parsed!.title).toBe('Brain Crash Recovery Protocol');
    expect(parsed!.status).toBe('accepted');
    expect(parsed!.sprintId).toBe('sprint-163');
    expect(parsed!.sprintNum).toBe(163);
    expect(parsed!.content).toContain('3-layer crash recovery protocol');
  });

  it('returns null for a file missing the H1 ADR title', () => {
    const filePath = writeAdr(adrDir, '050-no-title.md', ADR_MALFORMED_NO_TITLE);
    const parsed = parseAdrFile(filePath);
    expect(parsed).toBeNull();
  });

  it('returns null for a file missing **Status:**', () => {
    const filePath = writeAdr(adrDir, '099-no-status.md', ADR_MALFORMED_NO_STATUS);
    const parsed = parseAdrFile(filePath);
    expect(parsed).toBeNull();
  });

  it('returns null for a filename not matching NNN-*.md', () => {
    const filePath = writeAdr(adrDir, 'README.md', ADR_043);
    const parsed = parseAdrFile(filePath);
    expect(parsed).toBeNull();
  });

  it('extracts sprint_id from inline `Sprint NNN` when **Sprint:** missing', () => {
    const inlineSprintAdr = `# ADR-077: Inline Sprint Reference

**Status:** accepted

This ADR was implemented in Sprint 155 — see commit.
`;
    const filePath = writeAdr(adrDir, '077-inline.md', inlineSprintAdr);
    const parsed = parseAdrFile(filePath);
    expect(parsed).not.toBeNull();
    expect(parsed!.sprintId).toBe('sprint-155');
    expect(parsed!.sprintNum).toBe(155);
  });

  it('parses canonical taxonomy and discrete enforcement metadata', () => {
    const filePath = writeAdr(adrDir, 'adr-g-019-governance-taxonomy.md', ADR_G_019);
    const parsed = parseAdrFile(filePath);

    expect(parsed).toMatchObject({
      id: 'adr-g-019',
      adrClass: 'G',
      scope: 'global+project',
      immutable: true,
      sourceAuthority: 'publisher',
      enforcementLevel: 'hard',
    });
  });
});

// ─── adrToEntryInput ──────────────────────────────────────────────

describe('adrToEntryInput', () => {
  it('marks `accepted` ADRs as decay_exempt', () => {
    const parsed = parseAdrFile(writeAdr(makeTmpAdrDir(), '043-test.md', ADR_043))!;
    const input = adrToEntryInput(parsed);
    expect(input.id).toBe('adr-043');
    expect(input.type).toBe('adr');
    expect(input.status).toBe('accepted');
    expect(input.decay_exempt).toBe(true);
    expect(input.sprint_id).toBe('sprint-163');
    expect(input.sprint_num).toBe(163);
  });

  it('does not mark `proposed` ADRs as decay_exempt', () => {
    const parsed = parseAdrFile(writeAdr(makeTmpAdrDir(), '045-test.md', ADR_045))!;
    const input = adrToEntryInput(parsed);
    expect(input.status).toBe('proposed');
    expect(input.decay_exempt).toBe(false);
  });
});

// ─── syncAdrFilesToDb ─────────────────────────────────────────────

describe('syncAdrFilesToDb', () => {
  let adrDir: string;
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(() => {
    adrDir = makeTmpAdrDir();
    dbPath = makeTmpDbPath();
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (existsSync(adrDir)) rmSync(adrDir, { recursive: true, force: true });
    if (existsSync(dbPath)) rmSync(dbPath, { force: true });
  });

  it('happy path — inserts 3 valid ADRs and returns inserted=3', () => {
    writeAdr(adrDir, '043-brain-crash.md', ADR_043);
    writeAdr(adrDir, '044-observability.md', ADR_044);
    writeAdr(adrDir, '045-wave-exec.md', ADR_045);

    const result = syncAdrFilesToDb(store, adrDir);

    expect(result.inserted).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.ids.sort()).toEqual(['adr-043', 'adr-044', 'adr-045']);

    const adr043 = store.getById('adr-043');
    expect(adr043).not.toBeNull();
    expect(adr043!.status).toBe('accepted');
    expect(adr043!.sprint_id).toBe('sprint-163');
    expect(adr043!.decay_exempt).toBe(true);
  });

  it('idempotent — second sync with identical content yields 0 inserted/0 updated', () => {
    writeAdr(adrDir, '043-brain-crash.md', ADR_043);
    writeAdr(adrDir, '044-observability.md', ADR_044);

    const first = syncAdrFilesToDb(store, adrDir);
    expect(first.inserted).toBe(2);

    const second = syncAdrFilesToDb(store, adrDir);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(2);
    expect(second.errors).toEqual([]);
  });

  it('malformed skip — counts skipped + records error without aborting run', () => {
    writeAdr(adrDir, '043-brain-crash.md', ADR_043);
    writeAdr(adrDir, '050-no-title.md', ADR_MALFORMED_NO_TITLE);
    writeAdr(adrDir, '099-no-status.md', ADR_MALFORMED_NO_STATUS);
    writeAdr(adrDir, 'README.md', 'not an ADR'); // filtered out, no error

    const result = syncAdrFilesToDb(store, adrDir);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.errors.length).toBe(2);
    expect(result.errors.some((e) => e.includes('050-no-title.md'))).toBe(true);
    expect(result.errors.some((e) => e.includes('099-no-status.md'))).toBe(true);

    // README.md is filtered by filename pattern, not counted as error/skipped
    expect(store.getById('adr-043')).not.toBeNull();
  });

  it('status transition — updates existing entry when status changes', () => {
    writeAdr(adrDir, '045-wave-exec.md', ADR_045);
    const first = syncAdrFilesToDb(store, adrDir);
    expect(first.inserted).toBe(1);
    expect(store.getById('adr-045')!.status).toBe('proposed');

    // Rewrite the same ADR file with status flipped to accepted.
    const accepted = ADR_045.replace('**Status:** proposed', '**Status:** accepted');
    writeAdr(adrDir, '045-wave-exec.md', accepted);

    const second = syncAdrFilesToDb(store, adrDir);
    expect(second.updated).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(0);

    const updated = store.getById('adr-045')!;
    expect(updated.status).toBe('accepted');
    expect(updated.decay_exempt).toBe(true);
  });

  it('sprint_id extraction — `**Sprint:** Sprint 163` becomes sprint-163 on DB row', () => {
    writeAdr(adrDir, '043-brain-crash.md', ADR_043);
    syncAdrFilesToDb(store, adrDir);

    const row = store.getById('adr-043');
    expect(row).not.toBeNull();
    expect(row!.sprint_id).toBe('sprint-163');
    expect(row!.sprint_num).toBe(163);
  });

  it('updates taxonomy fields even when title/content/status/sprint are unchanged', () => {
    writeAdr(adrDir, 'adr-g-019-governance-taxonomy.md', ADR_G_019);
    syncAdrFilesToDb(store, adrDir);

    store.getRawDb().prepare(`
      UPDATE entries
      SET adr_class = NULL, scope = NULL, immutable = NULL,
          source_authority = NULL, enforcement_level = NULL
      WHERE id = 'adr-g-019'
    `).run();

    const result = syncAdrFilesToDb(store, adrDir);
    expect(result.updated).toBe(1);
    expect(store.getById('adr-g-019')).toMatchObject({
      adr_class: 'G',
      scope: 'global+project',
      immutable: 1,
      source_authority: 'publisher',
      enforcement_level: 'hard',
    });
  });

  it('updates an uppercase historical ID without inserting a case-variant duplicate', () => {
    store.upsert({
      id: 'ADR-G-019',
      type: 'adr',
      title: 'Governance Taxonomy',
      content: 'historical projection',
      source: 'user',
      status: 'accepted',
    });
    writeAdr(adrDir, 'adr-g-019-governance-taxonomy.md', ADR_G_019);

    const result = syncAdrFilesToDb(store, adrDir);

    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.ids).toEqual(['ADR-G-019']);
    expect(store.getById('ADR-G-019')?.content).toBe(ADR_G_019);
    const variants = store.getRawDb().prepare(
      "SELECT id FROM entries WHERE lower(id) = 'adr-g-019'",
    ).all() as Array<{ id: string }>;
    expect(variants).toEqual([{ id: 'ADR-G-019' }]);
  });

  it('reports error and returns empty result when adrDir does not exist', () => {
    const missing = join(adrDir, 'does-not-exist');
    const result = syncAdrFilesToDb(store, missing);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('adr dir not found');
  });
});
