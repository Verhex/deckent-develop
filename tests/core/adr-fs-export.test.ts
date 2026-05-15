/**
 * tests/core/adr-fs-export.test.ts
 *
 * Sprint 169 Task H1 (169-008) — DB → FS ADR export pipeline.
 *
 * Coverage (3 TDD tests):
 *   1. complete export — N ADRs in DB, empty docs/adr → N .md files written
 *   2. partial placeholder — missing sprint/content → `_To be backfilled_` emitted
 *   3. idempotent — file mtime newer than DB updated_at → skipped (manual edit wins)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, readdirSync, utimesSync, statSync } from 'node:fs';
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

// ─── Test 3 — idempotency (file mtime newer than DB) ───────────────

describe('exportAdrsToFs — idempotent', () => {
  it('skips files whose mtime is newer than the DB updated_at', () => {
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
    const filePath = join(adrDir, files[0]!);

    // Bump the file mtime far into the future so it definitely wins over
    // any conceivable DB updated_at.
    const future = new Date(Date.now() + 60 * 60 * 1000); // +1h
    utimesSync(filePath, future, future);
    const mtimeBefore = statSync(filePath).mtimeMs;

    // Second export — should detect manual edit and skip.
    const second = exportAdrsToFs(store, adrDir);
    expect(second.errors).toEqual([]);
    expect(second.skipped).toBe(1);
    expect(second.written).toBe(0);
    expect(second.updated).toBe(0);

    // mtime must NOT have changed (file was not rewritten).
    const mtimeAfter = statSync(filePath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
