/**
 * tests/core/memory-stub-backfill.test.ts
 *
 * Sprint 169 H2 (169-004) — Stub Memory Entries Backfill.
 *
 * Coverage (2 TDD specs):
 *   1. backfill replaces stub content with archive content + flips stub_flag.
 *   2. idempotent — re-running on a filled entry is a no-op.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
// @ts-expect-error — ESM .mjs import (no .d.ts shipped for ops script).
import { backfillStubEntry } from '../../scripts/memory/backfill-stub-entries.mjs';

const ARCHIVE_CONTENT =
  '# Sprint 159\n\nReal sprint content — at least 100 characters of body text ' +
  'so the backfill guard accepts the file and replaces the stub entry safely.\n';

describe('Stub Memory Backfill (Sprint 169 H2)', () => {
  let testDir: string;
  let archiveDir: string;
  let store: MemoryStore;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'stub-backfill-'));
    archiveDir = join(testDir, 'archive');
    mkdirSync(join(archiveDir, 'sprints'), { recursive: true });
    writeFileSync(join(archiveDir, 'sprints', 'sprint-159.md'), ARCHIVE_CONTENT);

    store = new MemoryStore(join(testDir, 'memory.db'));
    store.insert({
      id: 'mem-sprint-159',
      type: 'memory',
      title: 'Sprint 159 Learnings',
      content: 'STUB',
      sprint_id: 'sprint-159',
      sprint_num: 159,
      metadata: { stub_flag: true },
    });
  });

  afterAll(() => {
    store.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('backfill replaces stub content with archive content + clears stub_flag', async () => {
    const result = await backfillStubEntry(store, 159, archiveDir);
    expect(result).toEqual({ updated: true });

    const entry = store.getById('mem-sprint-159');
    expect(entry).not.toBeNull();
    expect(entry!.content.length).toBeGreaterThan(100);
    expect(entry!.content).not.toBe('STUB');
    expect(entry!.content).toContain('Real sprint content');

    const meta = JSON.parse(entry!.metadata || '{}');
    expect(meta.stub_flag).toBe(false);
    expect(typeof meta.backfilled_at).toBe('string');
  });

  it('idempotent — already-filled entry skipped on re-run', async () => {
    const before = store.getById('mem-sprint-159');
    const result = await backfillStubEntry(store, 159, archiveDir);
    expect(result).toEqual({ skipped: true, reason: 'not_stub' });

    const after = store.getById('mem-sprint-159');
    expect(after!.content).toBe(before!.content);
    expect(after!.metadata).toBe(before!.metadata);
  });

  it('skips when archive file is missing', async () => {
    store.insert({
      id: 'mem-sprint-999',
      type: 'memory',
      title: 'Sprint 999 Stub',
      content: 'STUB',
      sprint_id: 'sprint-999',
      sprint_num: 999,
      metadata: { stub_flag: true },
    });
    const result = await backfillStubEntry(store, 999, archiveDir);
    expect(result).toEqual({ skipped: true, reason: 'archive_missing' });

    const entry = store.getById('mem-sprint-999');
    expect(entry!.content).toBe('STUB');
  });

  it('skips when entry does not exist', async () => {
    const result = await backfillStubEntry(store, 12345, archiveDir);
    expect(result).toEqual({ skipped: true, reason: 'not_found' });
  });
});
