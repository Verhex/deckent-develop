// tests/agent/trace-retention.test.ts
// born-662 (TRSEG-RETAIN / MASTER-PLAN Sıra-557) — retention/compaction + the
// old-reader (dual-read) consistency for sprint-partitioned trace segments.
// Proves: (a) compaction is LOSSLESS — it collapses ONLY byte-identical duplicate
// lines, so a distinct-content record sharing a stableRecordId survives (the task's
// silent-deletion NO_GO); (b) compaction is ATOMIC — tmp+rename, no torn/leftover
// file, and a reader mid-compaction still sees the OLD complete content; (c) the
// legacy parseTraceLine reader still round-trips every compacted record, and the
// manifest recordCount stays truthful; (d) retention is CONFIGURABLE and deletes
// ONLY above an explicit threshold — an empty policy removes nothing — and every
// deletion is journaled (never silent) + reflected in the manifest.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LogEvent } from '../../src/core/log-event.js';
import {
  appendTraceSegment,
  compactSegment,
  applyRetention,
  selectSegmentsForDeletion,
  toSprintTrainingExample,
  TRACE_SEGMENTS_SUBDIR,
  TRACE_MANIFEST_FILE,
  type SprintTraceMeta,
  type TrainingExample,
} from '../../src/agent/trace-recorder.js';
import { readManifest, type TraceSegmentEntry } from '../../src/core/trace-schema.js';
import { parseTraceLine } from '../../src/training/pipeline.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function tracesDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'trseg-ret-'));
  dirs.push(d);
  return d;
}

const SUB = TRACE_SEGMENTS_SUBDIR;
const segPath = (dir: string, sprintId: string): string => join(dir, SUB, `sprint-${sprintId}.jsonl`);

const baseMeta = (over: Partial<SprintTraceMeta> = {}): SprintTraceMeta => ({
  taskId: '557-001',
  sprintId: '557',
  agent: 'bug-fixer',
  model: 'opus',
  selfAssessment: 'DONE',
  ts: '2026-07-12T00:00:00.000Z',
  ...over,
});

/** A v1 sprint-worker example (no `traceV2`) from a single text event. */
function v1Example(over: Partial<SprintTraceMeta> = {}, text = 'hello'): TrainingExample {
  const events: LogEvent[] = [
    { ts: '2026-07-12T00:00:00.000Z', seq: 1, type: 'text', content: text },
  ];
  return toSprintTrainingExample(events, baseMeta(over));
}

const seg = (over: Partial<TraceSegmentEntry>): TraceSegmentEntry => ({
  sprintId: '557',
  file: 'sprint-557.jsonl',
  recordCount: 1,
  firstTs: '2026-07-12T00:00:00.000Z',
  lastTs: '2026-07-12T00:00:00.000Z',
  ...over,
});

// ─── selectSegmentsForDeletion (pure planner) ────────────────────────────────

describe('selectSegmentsForDeletion — configurable threshold, no silent delete', () => {
  const segments = [
    seg({ sprintId: '557', file: 'sprint-557.jsonl', lastTs: '2026-07-10T00:00:00.000Z' }),
    seg({ sprintId: '558', file: 'sprint-558.jsonl', lastTs: '2026-07-11T00:00:00.000Z' }),
    seg({ sprintId: '559', file: 'sprint-559.jsonl', lastTs: '2026-07-12T00:00:00.000Z' }),
  ];

  it('an EMPTY policy deletes nothing (deletion only above an explicit threshold)', () => {
    expect(selectSegmentsForDeletion(segments, {})).toEqual([]);
  });

  it('maxSegments keeps the most-recent N, deletes older ones (oldest-first)', () => {
    const del = selectSegmentsForDeletion(segments, { maxSegments: 1 });
    expect(del.map((s) => s.sprintId)).toEqual(['557', '558']);
  });

  it('maxAgeMs deletes segments older than now - maxAgeMs (injected clock)', () => {
    const now = Date.parse('2026-07-12T00:00:00.000Z');
    const del = selectSegmentsForDeletion(segments, { maxAgeMs: 36 * 3600 * 1000, now });
    expect(del.map((s) => s.sprintId)).toEqual(['557']); // 557 is 48h old, 558 is 24h, 559 is 0
  });

  it('an unparseable lastTs is never age-deleted (unknown age is conservative)', () => {
    const bad = [seg({ sprintId: 'x', lastTs: 'not-a-date' })];
    expect(selectSegmentsForDeletion(bad, { maxAgeMs: 1, now: Date.parse('2026-07-12T00:00:00.000Z') })).toEqual([]);
  });
});

// ─── compaction — lossless + atomic + manifest-consistent ────────────────────

describe('compactSegment — LOSSLESS collapse of byte-identical duplicates', () => {
  it('collapses exact re-appends to one line and surfaces the merged recordId', () => {
    const dir = tracesDir();
    const ex = v1Example();
    appendTraceSegment(dir, ex);
    appendTraceSegment(dir, ex); // byte-identical re-append
    appendTraceSegment(dir, ex);
    expect(readFileSync(segPath(dir, '557'), 'utf-8').trim().split('\n')).toHaveLength(3);

    const res = compactSegment(dir, '557');
    expect(res.recordsBefore).toBe(3);
    expect(res.recordsAfter).toBe(1);
    expect(res.merged).toBe(2);
    expect(res.mergedRecordIds).toEqual(['557::557-001::a1::original', '557::557-001::a1::original']);

    const lines = readFileSync(segPath(dir, '557'), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('KEEPS a distinct-content record that shares a recordId (no silent deletion)', () => {
    const dir = tracesDir();
    // Same meta ⇒ same stableRecordId, but different message content (models a
    // NOT_DISPATCHED re-dispatch keeping attempt=1/original). keep-last-by-id would
    // drop one of these — byte-identical collapse must keep BOTH.
    const a = v1Example({ taskId: '557-001' }, 'first transcript');
    const b = v1Example({ taskId: '557-001' }, 'DIFFERENT transcript');
    appendTraceSegment(dir, a);
    appendTraceSegment(dir, b);

    const res = compactSegment(dir, '557');
    expect(res.merged).toBe(0); // nothing collapsed — the two lines are not byte-identical
    const lines = readFileSync(segPath(dir, '557'), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const contents = lines.map((l) => JSON.parse(l).messages[0].content);
    expect(contents).toEqual(['first transcript', 'DIFFERENT transcript']);
  });

  it('is idempotent — a second compaction is a pure no-op', () => {
    const dir = tracesDir();
    const ex = v1Example();
    appendTraceSegment(dir, ex);
    appendTraceSegment(dir, ex);
    compactSegment(dir, '557');
    const afterFirst = readFileSync(segPath(dir, '557'), 'utf-8');
    const res2 = compactSegment(dir, '557');
    expect(res2.merged).toBe(0);
    expect(readFileSync(segPath(dir, '557'), 'utf-8')).toBe(afterFirst);
  });

  it('keeps the manifest recordCount truthful after collapse', () => {
    const dir = tracesDir();
    const ex = v1Example();
    appendTraceSegment(dir, ex);
    appendTraceSegment(dir, ex);
    compactSegment(dir, '557');
    const m = readManifest(join(dir, SUB, TRACE_MANIFEST_FILE));
    const s = m.segments.find((x) => x.sprintId === '557')!;
    expect(s.recordCount).toBe(1); // deduped delta matches the deduped segment
  });

  it('every compacted record still round-trips through the legacy parseTraceLine reader', () => {
    const dir = tracesDir();
    const ex = v1Example();
    appendTraceSegment(dir, ex);
    appendTraceSegment(dir, ex);
    compactSegment(dir, '557');
    for (const line of readFileSync(segPath(dir, '557'), 'utf-8').trim().split('\n')) {
      const trace = parseTraceLine(line);
      expect(trace).not.toBeNull();
      expect(typeof trace!.meta!.recordId).toBe('string');
    }
  });
});

// ─── reader-consistency DURING compaction (atomic tmp+rename) ────────────────

describe('compactSegment — readers stay consistent during compaction', () => {
  it('the live path holds the OLD complete content until the rename commits', () => {
    const dir = tracesDir();
    const ex = v1Example();
    appendTraceSegment(dir, ex);
    appendTraceSegment(dir, ex);
    appendTraceSegment(dir, ex);
    const path = segPath(dir, '557');
    const before = readFileSync(path, 'utf-8');

    let observedMidCompaction: string | undefined;
    const res = compactSegment(dir, '557', {
      onStaged: ({ segmentPath }) => {
        // tmp written, rename NOT yet committed — a reader must still see OLD file.
        observedMidCompaction = readFileSync(segmentPath, 'utf-8');
      },
    });

    expect(observedMidCompaction).toBe(before); // reader saw the old COMPLETE content
    // …and it was fully parseable (no torn read) at that instant.
    for (const l of observedMidCompaction!.trim().split('\n')) expect(parseTraceLine(l)).not.toBeNull();

    // After the rename commits: the compacted content, no leftover tmp file.
    expect(readFileSync(path, 'utf-8').trim().split('\n')).toHaveLength(1);
    expect(res.merged).toBe(2);
    expect(existsSync(`${path}.tmp`)).toBe(false);
    expect(existsSync(`${join(dir, SUB, TRACE_MANIFEST_FILE)}.tmp`)).toBe(false);
  });
});

// ─── retention — configurable, journaled, manifest-reflected ─────────────────

describe('applyRetention — deletes only above threshold, never silently', () => {
  function seedThreeSprints(dir: string): void {
    appendTraceSegment(dir, v1Example({ sprintId: '557', taskId: '557-001', ts: '2026-07-10T00:00:00.000Z' }));
    appendTraceSegment(dir, v1Example({ sprintId: '558', taskId: '558-001', ts: '2026-07-11T00:00:00.000Z' }));
    appendTraceSegment(dir, v1Example({ sprintId: '559', taskId: '559-001', ts: '2026-07-12T00:00:00.000Z' }));
  }

  it('an EMPTY policy deletes nothing and writes no journal', () => {
    const dir = tracesDir();
    seedThreeSprints(dir);
    const res = applyRetention(dir, {});
    expect(res.deleted).toEqual([]);
    for (const s of ['557', '558', '559']) expect(existsSync(segPath(dir, s))).toBe(true);
    expect(existsSync(res.retentionLogPath)).toBe(false); // nothing deleted ⇒ no journal
  });

  it('maxSegments deletes the oldest segments, journals them, and drops them from the manifest', () => {
    const dir = tracesDir();
    seedThreeSprints(dir);
    const res = applyRetention(dir, { maxSegments: 1, now: Date.parse('2026-07-12T12:00:00.000Z') });

    expect(res.deleted.map((d) => d.sprintId).sort()).toEqual(['557', '558']);
    // Deleted segment files are gone; the kept one survives.
    expect(existsSync(segPath(dir, '557'))).toBe(false);
    expect(existsSync(segPath(dir, '558'))).toBe(false);
    expect(existsSync(segPath(dir, '559'))).toBe(true);

    // Journal is auditable — every deletion recorded (never silent).
    const journal = readFileSync(res.retentionLogPath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    expect(journal).toHaveLength(2);
    expect(journal.every((r) => r.op === 'retention')).toBe(true);
    expect(journal.map((r) => r.sprintId).sort()).toEqual(['557', '558']);
    expect(journal.every((r) => typeof r.deletedAt === 'string' && r.recordCount === 1)).toBe(true);

    // Manifest no longer dangles at a deleted segment.
    const m = readManifest(res.manifestPath);
    expect(m.segments.map((s) => s.sprintId)).toEqual(['559']);
  });

  it('maxAgeMs deletes only the aged-out segment (kept ones untouched)', () => {
    const dir = tracesDir();
    seedThreeSprints(dir);
    const now = Date.parse('2026-07-12T00:00:00.000Z');
    const res = applyRetention(dir, { maxAgeMs: 36 * 3600 * 1000, now });
    expect(res.deleted.map((d) => d.sprintId)).toEqual(['557']);
    expect(existsSync(segPath(dir, '557'))).toBe(false);
    expect(existsSync(segPath(dir, '558'))).toBe(true);
    expect(existsSync(segPath(dir, '559'))).toBe(true);
    // deletedAt stamped from the injected clock.
    expect(res.deleted[0]!.deletedAt).toBe(new Date(now).toISOString());
  });
});
