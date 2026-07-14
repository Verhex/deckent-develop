// ═══ run-flow-event-log.test — TERM-FLOW-UNIFY Sprint-4 dilim (438-004) ═════
//
// Hermetic — every fixture lives under os.tmpdir() (CUSTOM Test Hermeticity
// rule: no gitignored local state, no writes to the project root/HOME), no
// spawnSync anywhere. Locks in the per-flow durable event-log API added by
// 438-002 (core/run-flow-store.ts: appendFlowEvent / readFlowEvents /
// listFlowIds) and the optional commandId/sequence fields added by 438-001
// (core/run-flow-contract.ts: RunFlowEventBase). Mirrors
// tests/core/run-flow-store.test.ts's fixture/root pattern (mkdtempSync +
// afterEach rmSync, raw-file assertions against the same
// `.deckent/runtime/run-flow-store/` layout).
//
// Six scenarios: (1) sequence-monotonic, (2) multi-append (independent
// per-flowId counters), (3) afterSequence-cursor incl. boundary values,
// (4) torn-line tolerance + post-torn sequence continuity, (5) listFlowIds
// dedup + unknown-suffix skip, (6) commandId round-trip (present + absent).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendFlowEvent,
  readFlowEvents,
  listFlowIds,
  saveApprovedSnapshot,
  saveRunHandle,
  type StoredApprovedSnapshot,
  type StoredRunHandleRecord,
} from '../../src/core/run-flow-store.js';
import { RUN_FLOW_EVENT_SCHEMA_VERSION, type RunFlowEvent } from '../../src/core/run-flow-contract.js';
import type { Sprint } from '../../src/core/types.js';
import { SprintPhase, SprintStatus } from '../../src/core/sprint-types.js';

function makeSprint(id = 'sprint-1'): Sprint {
  return {
    id,
    number: 1,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks: [],
    workers: [],
  };
}

function makeSnapshot(flowId: string, overrides: Partial<StoredApprovedSnapshot> = {}): StoredApprovedSnapshot {
  return {
    flowId,
    revision: 1,
    planDigest: 'digest-abc',
    approvedBy: { id: 'alperen' },
    approvedAt: '2026-07-12T00:00:00.000Z',
    sprint: makeSprint(),
    ...overrides,
  };
}

function makeHandleRecord(flowId: string, overrides: Partial<StoredRunHandleRecord> = {}): StoredRunHandleRecord {
  return {
    flowId,
    revision: 1,
    planDigest: 'digest-abc',
    handle: { flowId, jobId: 'job-1', logRef: 'log-1' },
    startedAt: '2026-07-12T00:01:00.000Z',
    ...overrides,
  };
}

/** Minimal, deliberately field-less-by-default FLOW_ABORTED event — no
 *  RunProposal/PlanPreview payload needed to exercise the log's sequence/
 *  cursor/commandId behavior, which is generic across every RunFlowEvent variant. */
function makeEvent(flowId: string, overrides: Partial<Pick<RunFlowEvent, 'commandId'>> & { timestamp?: string } = {}): RunFlowEvent {
  return {
    schemaVersion: RUN_FLOW_EVENT_SCHEMA_VERSION,
    type: 'FLOW_ABORTED',
    flowId,
    timestamp: overrides.timestamp ?? '2026-07-12T00:00:00.000Z',
    ...(overrides.commandId !== undefined ? { commandId: overrides.commandId } : {}),
  };
}

function eventsLogRawPath(root: string, flowId: string): string {
  return join(root, '.deckent', 'runtime', 'run-flow-store', `${flowId}.events.jsonl`);
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'run-flow-event-log-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('run-flow-store — event log: sequence-monotonic', () => {
  it('assigns 1..N unbroken sequence numbers to ordered appends on a single flow', () => {
    const flowId = 'flow-mono';
    const assigned: number[] = [];
    for (let i = 0; i < 5; i++) {
      assigned.push(appendFlowEvent(root, flowId, makeEvent(flowId, { timestamp: `2026-07-12T00:00:0${i}.000Z` })));
    }
    expect(assigned).toEqual([1, 2, 3, 4, 5]);

    const stored = readFlowEvents(root, flowId);
    expect(stored.map(e => e.sequence)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('run-flow-store — event log: multi-append (independent per-flowId counters)', () => {
  it('keeps each flowId on its own monotonic sequence regardless of interleaving', () => {
    const flowA = 'flow-multi-a';
    const flowB = 'flow-multi-b';

    const seqA1 = appendFlowEvent(root, flowA, makeEvent(flowA, { timestamp: '2026-07-12T00:00:01.000Z' }));
    const seqB1 = appendFlowEvent(root, flowB, makeEvent(flowB, { timestamp: '2026-07-12T00:00:02.000Z' }));
    const seqA2 = appendFlowEvent(root, flowA, makeEvent(flowA, { timestamp: '2026-07-12T00:00:03.000Z' }));
    const seqB2 = appendFlowEvent(root, flowB, makeEvent(flowB, { timestamp: '2026-07-12T00:00:04.000Z' }));
    const seqB3 = appendFlowEvent(root, flowB, makeEvent(flowB, { timestamp: '2026-07-12T00:00:05.000Z' }));

    expect([seqA1, seqA2]).toEqual([1, 2]);
    expect([seqB1, seqB2, seqB3]).toEqual([1, 2, 3]);

    expect(readFlowEvents(root, flowA).map(e => e.sequence)).toEqual([1, 2]);
    expect(readFlowEvents(root, flowB).map(e => e.sequence)).toEqual([1, 2, 3]);
  });
});

describe('run-flow-store — event log: afterSequence-cursor', () => {
  it('returns only records strictly past the cursor, including boundary values', () => {
    const flowId = 'flow-cursor';
    for (let i = 0; i < 5; i++) {
      appendFlowEvent(root, flowId, makeEvent(flowId, { timestamp: `2026-07-12T00:00:0${i}.000Z` }));
    }

    // Mid-cursor: only the tail past sequence 2.
    expect(readFlowEvents(root, flowId, { afterSequence: 2 }).map(e => e.sequence)).toEqual([3, 4, 5]);

    // Boundary: 0 → every record (real sequences start at 1).
    expect(readFlowEvents(root, flowId, { afterSequence: 0 }).map(e => e.sequence)).toEqual([1, 2, 3, 4, 5]);

    // Boundary: cursor == last assigned sequence → empty.
    expect(readFlowEvents(root, flowId, { afterSequence: 5 })).toEqual([]);

    // Boundary: cursor beyond the last assigned sequence → empty.
    expect(readFlowEvents(root, flowId, { afterSequence: 999 })).toEqual([]);

    // No opts at all → whole log, same as afterSequence: 0.
    expect(readFlowEvents(root, flowId).map(e => e.sequence)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('run-flow-store — event log: torn-line tolerance', () => {
  it('skips a half-written trailing line on read, and keeps computing the correct next sequence for a subsequent append', () => {
    const flowId = 'flow-torn';
    appendFlowEvent(root, flowId, makeEvent(flowId, { timestamp: '2026-07-12T00:00:00.000Z' }));
    appendFlowEvent(root, flowId, makeEvent(flowId, { timestamp: '2026-07-12T00:00:01.000Z' }));

    // Simulate a crash mid-append: raw-inject an incomplete JSON line WITHOUT a
    // trailing newline directly onto the file (bypassing the store's own atomic
    // tmp+rename writer) — the textbook shape of a torn write.
    appendFileSync(eventsLogRawPath(root, flowId), '{"schemaVersion":1,"type":"FLOW_ABOR');

    // readFlowEvents is torn-line-tolerant on the READ side (readJsonlRecords'
    // own doc comment): the malformed trailing line is silently skipped, the
    // two prior valid records still come back untouched.
    const afterTorn = readFlowEvents(root, flowId);
    expect(afterTorn.map(e => e.sequence)).toEqual([1, 2]);

    // The torn line does not corrupt SEQUENCE NUMBERING: appendFlowEvent's own
    // internal read (readJsonlRecords) also skips the unparsable tail, so the
    // next append still continues from the last VALID record (2) → sequence 3,
    // not reset to 1 and not derived from the torn fragment.
    const nextSeq = appendFlowEvent(root, flowId, makeEvent(flowId, { timestamp: '2026-07-12T00:00:02.000Z' }));
    expect(nextSeq).toBe(3);

    // NOTE (verified, not asserted here — see .result notes / follow-up):
    // because appendJsonlRecord's `existing + JSON.stringify(record) + '\n'`
    // concatenation does not normalize a missing trailing newline, the record
    // just written above physically merges onto the SAME corrupted line as the
    // torn fragment and becomes itself unparsable — readFlowEvents(root, flowId)
    // at this point still returns only [1, 2], not [1, 2, 3]. That data-loss
    // behavior is outside this scenario's literal claim (torn-line READ
    // tolerance + next-append SEQUENCE correctness, both asserted above) and
    // outside this task's write scope (src/core/run-flow-store.ts is not in
    // scope.filesWrite) — flagged for a follow-up FIX task instead of asserted
    // as passing/failing here.
  });
});

describe('run-flow-store — event log: listFlowIds', () => {
  it('returns the deduped, sorted flowId set across snapshot/handle/events files and skips unknown-suffix files', () => {
    saveApprovedSnapshot(root, makeSnapshot('flow-only-snapshot'));
    saveRunHandle(root, makeHandleRecord('flow-only-handle'));
    appendFlowEvent(root, 'flow-only-events', makeEvent('flow-only-events'));

    saveApprovedSnapshot(root, makeSnapshot('flow-all-three'));
    saveRunHandle(root, makeHandleRecord('flow-all-three'));
    appendFlowEvent(root, 'flow-all-three', makeEvent('flow-all-three'));

    // Stray file matching none of the three known `<flowId>.<kind>.jsonl` suffixes.
    const dir = join(root, '.deckent', 'runtime', 'run-flow-store');
    appendFileSync(join(dir, 'not-a-flow-file.txt'), 'garbage');
    appendFileSync(join(dir, 'flow-unknownkind.unknown.jsonl'), '{}');

    expect(listFlowIds(root)).toEqual(['flow-all-three', 'flow-only-events', 'flow-only-handle', 'flow-only-snapshot']);
  });

  it('returns an empty array when the store dir does not exist yet', () => {
    expect(listFlowIds(root)).toEqual([]);
  });
});

describe('run-flow-store — event log: commandId-roundtrip', () => {
  it('preserves an appended event’s commandId byte-identically on read', () => {
    const flowId = 'flow-cmdid';
    appendFlowEvent(root, flowId, makeEvent(flowId, { commandId: 'cmd-roundtrip-1', timestamp: '2026-07-12T00:00:00.000Z' }));

    const [record] = readFlowEvents(root, flowId);
    expect(record?.commandId).toBe('cmd-roundtrip-1');
  });

  it('round-trips an event that omits commandId as undefined, not null/empty-string', () => {
    const flowId = 'flow-cmdid-absent';
    appendFlowEvent(root, flowId, makeEvent(flowId, { timestamp: '2026-07-12T00:00:00.000Z' }));

    const [record] = readFlowEvents(root, flowId);
    expect(record?.commandId).toBeUndefined();
  });
});
