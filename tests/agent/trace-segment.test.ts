// tests/agent/trace-segment.test.ts
// born-662 (TRSEG-WRITE / MASTER-PLAN Sıra-557) — sprint-partitioned, append-only
// trace segments + an append-only manifest + a STABLE, position-independent
// record-ID. Proves: (a) records land in per-sprint segment files, (b) the
// manifest folds append-only deltas into per-sprint stats, (c) the stable id is
// derived from logical identity (task/attempt/fix), not line position, and
// (d) DUAL-READ is preserved — a v2 record survives the segment append with its
// top-level `schemaVersion`/`telemetry` byte-untouched, and every record still
// round-trips through the legacy `parseTraceLine` reader.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LogEvent } from '../../src/core/log-event.js';
import {
  appendTraceSegment,
  toSprintTrainingExample,
  toSprintTrainingExampleV2,
  TRACE_SEGMENTS_SUBDIR,
  TRACE_MANIFEST_FILE,
  type SprintTraceMeta,
  type TrainingExample,
} from '../../src/agent/trace-recorder.js';
import {
  stableRecordId,
  segmentFileName,
  readManifest,
  foldManifest,
  parseManifestDelta,
  TRACE_MANIFEST_VERSION,
  TRACE_SCHEMA_VERSION,
} from '../../src/core/trace-schema.js';
import { parseTraceLine } from '../../src/training/pipeline.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function tracesDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'trseg-'));
  dirs.push(d);
  return d;
}

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
function v1Example(over: Partial<SprintTraceMeta> = {}): TrainingExample {
  const events: LogEvent[] = [
    { ts: '2026-07-12T00:00:00.000Z', seq: 1, type: 'text', content: 'hello' },
  ];
  return toSprintTrainingExample(events, baseMeta(over));
}

// A v2 fixture: telemetry (usage) + one conversation turn, plus real prompts so
// the record is NOT quarantined. Mirrors the trace-v2-schema.test.ts shape.
const V2_EVENTS: LogEvent[] = [
  { ts: '2026-07-12T00:00:02.000Z', seq: 2, type: 'usage', content: { type: 'result', usage: { input_tokens: 1, output_tokens: 1 } } },
  { ts: '2026-07-12T00:00:03.000Z', seq: 3, type: 'text', content: { type: 'assistant', message: { content: [{ type: 'text', text: 'working' }] } } },
];
function v2Example(over: Partial<SprintTraceMeta> = {}): TrainingExample {
  return toSprintTrainingExampleV2(V2_EVENTS, baseMeta({
    traceV2: true,
    systemPrompt: 'You are a Deckent worker agent.',
    taskPrompt: '## Your Task\n557-001: do the thing',
    ...over,
  }));
}

describe('stableRecordId', () => {
  it('is deterministic and position-independent (same logical record ⇒ same id)', () => {
    const parts = { sprintId: '557', taskId: '557-001', attempt: 1, purpose: 'original' };
    expect(stableRecordId(parts)).toBe('557::557-001::a1::original');
    expect(stableRecordId(parts)).toBe(stableRecordId({ ...parts }));
  });
  it('defaults attempt→1 and purpose→original when omitted', () => {
    expect(stableRecordId({ sprintId: '557', taskId: '557-001' })).toBe('557::557-001::a1::original');
  });
  it('distinguishes a FIX re-run from its original (attempt + purpose)', () => {
    const original = stableRecordId({ sprintId: '557', taskId: '557-001', attempt: 1, purpose: 'original' });
    const fix = stableRecordId({ sprintId: '557', taskId: '557-001', attempt: 2, purpose: 'fix' });
    expect(fix).not.toBe(original);
  });
});

describe('segmentFileName', () => {
  it('produces a readable sprint-<id>.jsonl and never double-prefixes', () => {
    expect(segmentFileName('557')).toBe('sprint-557.jsonl');
    expect(segmentFileName('sprint-557')).toBe('sprint-557.jsonl');
  });
  it('sanitizes unsafe characters and falls back to a stable name when empty', () => {
    expect(segmentFileName('a/b c')).toBe('sprint-a_b_c.jsonl');
    expect(segmentFileName('')).toBe('sprint-unknown.jsonl');
  });
});

describe('appendTraceSegment — sprint partitioning + stable id', () => {
  it('writes to a per-sprint segment, stamps meta.recordId, and does NOT mutate the caller example', () => {
    const dir = tracesDir();
    const example = v1Example();
    const res = appendTraceSegment(dir, example);

    expect(res.segmentPath).toBe(join(dir, TRACE_SEGMENTS_SUBDIR, 'sprint-557.jsonl'));
    expect(res.recordId).toBe('557::557-001::a1::original');
    // caller's object is untouched (additive stamp is a shallow clone).
    expect(example.meta.recordId).toBeUndefined();

    const written = JSON.parse(readFileSync(res.segmentPath, 'utf-8').trim());
    expect(written.meta.recordId).toBe('557::557-001::a1::original');
    expect(written.meta.taskId).toBe('557-001');
  });

  it('is append-only — repeated appends add lines, never overwrite', () => {
    const dir = tracesDir();
    appendTraceSegment(dir, v1Example({ taskId: '557-001' }));
    appendTraceSegment(dir, v1Example({ taskId: '557-002' }));
    const seg = join(dir, TRACE_SEGMENTS_SUBDIR, 'sprint-557.jsonl');
    const lines = readFileSync(seg, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).meta.taskId).toBe('557-001');
    expect(JSON.parse(lines[1]!).meta.taskId).toBe('557-002');
  });

  it('partitions distinct sprints into distinct segment files', () => {
    const dir = tracesDir();
    appendTraceSegment(dir, v1Example({ sprintId: '557', taskId: '557-001' }));
    appendTraceSegment(dir, v1Example({ sprintId: '558', taskId: '558-001' }));
    const a = readFileSync(join(dir, TRACE_SEGMENTS_SUBDIR, 'sprint-557.jsonl'), 'utf-8').trim().split('\n');
    const b = readFileSync(join(dir, TRACE_SEGMENTS_SUBDIR, 'sprint-558.jsonl'), 'utf-8').trim().split('\n');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

describe('append-only manifest', () => {
  it('folds deltas into per-sprint stats (recordCount + first/last ts)', () => {
    const dir = tracesDir();
    appendTraceSegment(dir, v1Example({ sprintId: '557', taskId: '557-001', ts: '2026-07-12T00:00:00.000Z' }));
    appendTraceSegment(dir, v1Example({ sprintId: '557', taskId: '557-002', ts: '2026-07-12T00:05:00.000Z' }));
    appendTraceSegment(dir, v1Example({ sprintId: '558', taskId: '558-001', ts: '2026-07-12T01:00:00.000Z' }));

    const manifest = readManifest(join(dir, TRACE_SEGMENTS_SUBDIR, TRACE_MANIFEST_FILE));
    expect(manifest.version).toBe(TRACE_MANIFEST_VERSION);
    expect(manifest.segments).toHaveLength(2);

    const s557 = manifest.segments.find((s) => s.sprintId === '557')!;
    expect(s557.file).toBe('sprint-557.jsonl');
    expect(s557.recordCount).toBe(2);
    expect(s557.firstTs).toBe('2026-07-12T00:00:00.000Z');
    expect(s557.lastTs).toBe('2026-07-12T00:05:00.000Z');

    const s558 = manifest.segments.find((s) => s.sprintId === '558')!;
    expect(s558.recordCount).toBe(1);
  });

  it('readManifest is fail-soft on a missing file (empty aggregate)', () => {
    const m = readManifest(join(tracesDir(), TRACE_SEGMENTS_SUBDIR, TRACE_MANIFEST_FILE));
    expect(m).toEqual({ version: TRACE_MANIFEST_VERSION, segments: [] });
  });

  it('parseManifestDelta rejects malformed/torn lines; readManifest skips them', () => {
    expect(parseManifestDelta('{ not json')).toBeNull();
    expect(parseManifestDelta('{"sprintId":"557"}')).toBeNull(); // missing required fields
    // A torn line mid-file must be skipped, not crash the fold.
    const dir = tracesDir();
    const mPath = join(dir, TRACE_MANIFEST_FILE);
    writeFileSync(mPath, [
      JSON.stringify({ sprintId: '557', file: 'sprint-557.jsonl', recordId: 'r1', ts: '2026-07-12T00:00:00.000Z' }),
      '{ torn write half a lin',
      JSON.stringify({ sprintId: '557', file: 'sprint-557.jsonl', recordId: 'r2', ts: '2026-07-12T00:01:00.000Z' }),
    ].join('\n') + '\n', 'utf-8');
    const m = readManifest(mPath);
    expect(m.segments).toHaveLength(1);
    expect(m.segments[0]!.recordCount).toBe(2);
  });

  it('foldManifest preserves first-seen sprint order (pure)', () => {
    const folded = foldManifest([
      { sprintId: '558', file: 'sprint-558.jsonl', recordId: 'a', ts: '2026-07-12T00:00:00.000Z' },
      { sprintId: '557', file: 'sprint-557.jsonl', recordId: 'b', ts: '2026-07-12T00:00:00.000Z' },
    ]);
    expect(folded.segments.map((s) => s.sprintId)).toEqual(['558', '557']);
  });
});

describe('dual-read — 552 schema preserved through the segment append', () => {
  it('a v2 record keeps top-level schemaVersion + telemetry byte-untouched (raw JSON)', () => {
    const dir = tracesDir();
    const example = v2Example();
    // sanity: fixture really is v2 with a telemetry sidecar.
    expect(example.schemaVersion).toBe(TRACE_SCHEMA_VERSION);
    expect(Array.isArray(example.telemetry)).toBe(true);
    expect(example.telemetry!.length).toBeGreaterThan(0);

    const res = appendTraceSegment(dir, example);
    // Raw parse (NOT parseTraceLine, which drops schemaVersion/telemetry) is the
    // sharp assertion that the segment append did not rebuild the record.
    const raw = JSON.parse(readFileSync(res.segmentPath, 'utf-8').trim());
    expect(raw.schemaVersion).toBe(TRACE_SCHEMA_VERSION);
    expect(raw.telemetry).toEqual(example.telemetry);
    expect(raw.meta.schemaVersion).toBe(TRACE_SCHEMA_VERSION);
    expect(raw.meta.recordId).toBe('557::557-001::a1::original');
    expect(Array.isArray(raw.messages)).toBe(true);
  });

  it('both v1 and v2 segment records still round-trip through the legacy parseTraceLine reader', () => {
    const dir = tracesDir();
    const v1 = appendTraceSegment(dir, v1Example({ sprintId: '557', taskId: '557-001' }));
    const v2 = appendTraceSegment(dir, v2Example({ sprintId: '557', taskId: '557-002' }));

    const seg = readFileSync(join(dir, TRACE_SEGMENTS_SUBDIR, 'sprint-557.jsonl'), 'utf-8').trim().split('\n');
    expect(seg).toHaveLength(2);
    for (const line of seg) {
      const trace = parseTraceLine(line);
      expect(trace).not.toBeNull();
      expect(Array.isArray(trace!.messages)).toBe(true);
      expect(typeof trace!.meta!.recordId).toBe('string');
    }
    expect(v1.recordId).not.toBe(v2.recordId);
  });
});
