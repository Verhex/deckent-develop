/**
 * tests/core/adr-fs-export.test.ts
 *
 * Sprint 169 Task H1 (169-008) — DB → FS ADR export pipeline.
 *
 * Coverage (3 TDD tests):
 *   1. complete export — N ADRs in DB, empty docs/adr → N .md files written
 *   2. partial placeholder — missing sprint/content → `_To be backfilled_` emitted
 *   3. DB authority — byte-identical projection skips; drift is overwritten
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { exportAdrsToFs } from '../../src/core/memory-export.js';

let store: MemoryStore;
let tmpRoot: string;
let dbPath: string;
let adrDir: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'adr-fs-export-'));
  dbPath = join(tmpRoot, 'memory.db');
  adrDir = join(tmpRoot, 'docs', 'adr');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── Test 1 — complete export ──────────────────────────────────────

describe('exportAdrsToFs — complete export', () => {
  it('writes one .md file per ADR with MADR v3 header', () => {
    store.insert({
      id: 'adr-001',
      type: 'adr',
      title: 'TypeScript ESM',
      content: '# ADR-001: TypeScript ESM\n\n**Status:** accepted\n\nUse TypeScript with ESM imports.\n',
      status: 'accepted',
      sprint_id: 'sprint-001',
      sprint_num: 1,
    });
    store.insert({
      id: 'adr-002',
      type: 'adr',
      title: 'Node16 Module Resolution',
      content: '# ADR-002: Node16 Module Resolution\n\n**Status:** accepted\n\nNode16 resolution mode.\n',
      status: 'accepted',
      sprint_id: 'sprint-002',
      sprint_num: 2,
    });
    store.insert({
      id: 'adr-003',
      type: 'adr',
      title: 'vitest over Jest',
      content: '# ADR-003: vitest over Jest\n\n**Status:** accepted\n\nUse vitest as the test runner.\n',
      status: 'accepted',
      sprint_id: 'sprint-003',
      sprint_num: 3,
    });

    const result = exportAdrsToFs(store, adrDir);

    expect(result.errors).toEqual([]);
    expect(result.written).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.ids).toEqual(expect.arrayContaining(['adr-001', 'adr-002', 'adr-003']));

    const files = readdirSync(adrDir).sort();
    expect(files).toHaveLength(3);
    expect(files[0]).toMatch(/^001-.+\.md$/);
    expect(files[1]).toMatch(/^002-.+\.md$/);
    expect(files[2]).toMatch(/^003-.+\.md$/);

    const adr001 = readFileSync(join(adrDir, files[0]!), 'utf-8');
    expect(adr001).toContain('# ADR-001: TypeScript ESM');
    expect(adr001).toContain('**Status:** accepted');
  });
});

// ─── Test 2 — partial placeholder ──────────────────────────────────

describe('exportAdrsToFs — partial placeholder', () => {
  it('emits `_To be backfilled_` for missing sprint/content', () => {
    // Entry without sprint_id and with content that lacks MADR headers,
    // so the renderer must build the wrapper itself.
    store.insert({
      id: 'adr-099',
      type: 'adr',
      title: 'Skeleton ADR',
      content: '',
      status: 'proposed',
      // sprint_id intentionally omitted
    });

    const result = exportAdrsToFs(store, adrDir);

    expect(result.errors).toEqual([]);
    expect(result.written).toBe(1);

    const files = readdirSync(adrDir);
    expect(files).toHaveLength(1);
    const body = readFileSync(join(adrDir, files[0]!), 'utf-8');

    expect(body).toContain('# ADR-099: Skeleton ADR');
    expect(body).toContain('**Status:** proposed');
    // Two placeholder fields expected: Sprint + body (content empty).
    expect(body).toContain('**Sprint:** _To be backfilled_');
    expect(body).toContain('_To be backfilled_');
  });
});

// ─── Test 3 — DB authority + idempotency ───────────────────────────

describe('exportAdrsToFs — idempotent', () => {
  it('skips byte-identical files and overwrites filesystem drift', () => {
    store.insert({
      id: 'adr-050',
      type: 'adr',
      title: 'Idempotent Probe',
      content: '# ADR-050: Idempotent Probe\n\n**Status:** accepted\n\nbody\n',
      status: 'accepted',
      sprint_id: 'sprint-050',
      sprint_num: 50,
    });

    // First export — write the file.
    const first = exportAdrsToFs(store, adrDir);
    expect(first.written).toBe(1);

    const files = readdirSync(adrDir);
    expect(files).toHaveLength(1);
    const filePath = join(adrDir, '050-idempotent-probe.md');
    expect(files).toEqual(['050-idempotent-probe.md']);

    // Second export — byte-identical projection is a no-op.
    const second = exportAdrsToFs(store, adrDir);
    expect(second.errors).toEqual([]);
    expect(second.skipped).toBe(1);
    expect(second.written).toBe(0);
    expect(second.updated).toBe(0);

    writeFileSync(filePath, 'filesystem drift\n', 'utf-8');
    const third = exportAdrsToFs(store, adrDir);
    expect(third.errors).toEqual([]);
    expect(third.updated).toBe(1);
    expect(readFileSync(filePath, 'utf-8')).toContain('# ADR-050: Idempotent Probe');
  });

  it('projects canonical G/D ids to taxonomy filenames', () => {
    store.insert({
      id: 'ADR-G-037',
      type: 'adr',
      title: 'Execution Budget Landing',
      content: 'Canonical decision body.',
      status: 'accepted',
      adr_class: 'G',
      scope: 'global+project',
      immutable: true,
      source_authority: 'publisher',
      enforcement_level: 'runtime',
    });

    const result = exportAdrsToFs(store, adrDir);
    expect(result.errors).toEqual([]);
    expect(readdirSync(adrDir)).toContain('adr-g-037-execution-budget-landing.md');
    const projection = readFileSync(
      join(adrDir, 'adr-g-037-execution-budget-landing.md'),
      'utf-8',
    );
    expect(projection).toContain('**Class:** ADR-G');
    expect(projection).toContain('**Scope:** global+project');
    expect(projection).toContain('**Immutable:** yes');
    expect(projection).toContain('**Source:** publisher');
    expect(projection).toContain('**Enforcement-Level:** runtime');
  });

  it('reuses an existing ID-matched projection even when its slug differs from the title', () => {
    store.insert({
      id: 'adr-g-020',
      type: 'adr',
      title: 'A Much Longer Canonical Architecture Title',
      content: '# ADR-G-020: A Much Longer Canonical Architecture Title\n\n**Status:** accepted\n',
      status: 'accepted',
      adr_class: 'G',
    });
    const existingPath = join(adrDir, 'adr-g-020-short-stable-slug.md');
    rmSync(adrDir, { recursive: true, force: true });
    // exportAdrsToFs owns directory creation, but this fixture needs an
    // existing projection with a stable, intentionally non-derived slug.
    exportAdrsToFs(store, adrDir);
    const generated = join(adrDir, 'adr-g-020-a-much-longer-canonical-architecture-title.md');
    const content = readFileSync(generated, 'utf-8');
    rmSync(generated);
    writeFileSync(existingPath, content, 'utf-8');

    const result = exportAdrsToFs(store, adrDir);

    expect(result.skipped).toBe(1);
    expect(readdirSync(adrDir)).toEqual(['adr-g-020-short-stable-slug.md']);
  });

  it('surfaces a typed error for a non-canonical ADR id instead of inventing a filename', () => {
    store.insert({
      id: 'user-123',
      type: 'adr',
      title: 'Unclassified Decision',
      content: 'decision',
      status: 'accepted',
    });

    const result = exportAdrsToFs(store, adrDir);
    expect(result.written).toBe(0);
    expect(result.errors).toEqual([
      'user-123: non-canonical ADR id: user-123',
    ]);
  });
});
