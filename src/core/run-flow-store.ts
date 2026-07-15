// ═══ run-flow-store — TERM-FLOW-UNIFY Sprint-4 dilim (426-001), moved to
// core/ (born-671, sprint-427 task 427-020) ═════════════════════════════
//
// docs/analysis/term-flow-unify-design-2026-07-11.md ("Net Öneri" + Sprint-4
// row "Yeni run-job-service.ts, run-flow-store.ts"). Fixes the explicit TODO
// left by run-flow-controller.ts's approve() (Sprint-3, 425-001): "the
// resulting approvedSnapshot lives only in this in-process controller
// instance. A real START_REQUESTED caller must persist it to a durable
// run-flow-store before consuming it." THIS file is that durable store.
//
// STORED SHAPE IS RICHER THAN THE CORE CONTRACT: core/run-flow-contract.ts's
// `ApprovedPlanSnapshot` is the reducer's in-memory CAS record (flowId/
// revision/planDigest/approvedBy/approvedAt) — it carries no task list.
// `StoredApprovedSnapshot` below extends that with the actual planned
// `Sprint` (the exact object `plan-preview-service.ts`'s `generatePlanPreview`
// produced at proposal time) — that is what lets a start-path CONSUME the
// snapshot instead of re-planning (design doc's core complaint: "detached
// start fresh lifecycle'da runPlanPhase'i YENİDEN çağırıyor"). This is the
// store's own on-disk schema, not a redefinition of the core contract type.
//
// MOVED TO core/ (born-671, 427-020): originally lived under cli/repl/ —
// src/mcp/tools/start.ts (a different surface) importing it from there was
// a live ADR-D-004 C3 violation (a surface reaching into another surface's
// internals). core/ is Layer-0 — every surface (cli/, mcp/, orchestra/) may
// import it freely, so the mcp<->cli edge that motivated the move is gone.
// No re-export shim left at the old path; every consumer was repointed at
// core/run-flow-store.js directly. tests/orchestra/run-flow-reducer.test.ts's
// known-consumer allowlist now pins the legitimate consumer list.
//
// Atomic write = tmp file + writeFileSync + renameSync (same pattern as
// core/approval-store.ts's atomicWriteJson) so a crash mid-write never
// leaves a torn file. Append-only = a save() call always ADDS a new JSONL
// line to the flow's log file — it never deletes or mutates a prior line;
// load() returns the LATEST record (last line), giving natural
// re-approval/re-start-attempt history without losing the audit trail.
// Project-scoped = every function takes `root` explicitly; two different
// project roots never share a directory.

import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { RUNTIME_DIR } from './constants.js';
import type { RunFlowEvent, RunProposal } from './run-flow-contract.js';
import type { Sprint } from './types.js';
import type { ActorContext } from './work-model.js';
// RunHandle is duck-typed against core/run-flow-contract.ts but deliberately
// imported from run-job-service.ts, NOT the contract file itself — see that
// module's RunHandle doc comment (tests/orchestra/run-flow-reducer.test.ts's
// known-consumer allowlist pin, out of this task's write scope). This makes
// core/ import orchestra/ — the one edge ADR-D-004 already scans
// (authority-enforcer.ts, advisory/soft: warns + emits, no hard-block).
import type { RunHandle } from '../orchestra/run-job-service.js';

// ─── Stored record shapes ───────────────────────────────────────────────────

/** Durable form of an approved plan — see file header for why this is
 *  richer than core/run-flow-contract.ts's `ApprovedPlanSnapshot`. */
export interface StoredApprovedSnapshot {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly approvedBy: ActorContext;
  readonly approvedAt: string;
  /** The exact planned Sprint (task list) captured at preview time — this is
   *  what lets a start-path consume instead of re-plan. */
  readonly sprint: Sprint;
  /** The originating proposal (G1 durable-fix, SURF-3): a `deckent do` flow uses
   *  the in-memory controller, which never writes `events.jsonl` — so its
   *  intentSummary was lost and the inbox showed a bare UUID. Persisting the
   *  proposal here (additive/optional — legacy snapshots lack it) lets
   *  `deriveLegacyContext` surface `proposal.intentSummary` on the read path. */
  readonly proposal?: RunProposal;
}

/** Durable record of an actual start attempt for a flow — the idempotency
 *  key double-start detection (run-job-service.ts) reads back. */
export interface StoredRunHandleRecord {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly handle: RunHandle;
  readonly startedAt: string;
  /** born-698c: the run process's OWN pid (child persists its handle — born-681),
   *  so the death-sweep can probe liveness. Absent on pre-698 records. */
  readonly pid?: number;
}

// ─── Path helpers ────────────────────────────────────────────────────────

function storeDir(root: string): string {
  return join(root, RUNTIME_DIR, 'run-flow-store');
}

function snapshotLogPath(root: string, flowId: string): string {
  return join(storeDir(root), `${flowId}.snapshot.jsonl`);
}

function handleLogPath(root: string, flowId: string): string {
  return join(storeDir(root), `${flowId}.handle.jsonl`);
}

function eventsLogPath(root: string, flowId: string): string {
  return join(storeDir(root), `${flowId}.events.jsonl`);
}

// ─── Low-level JSONL append (atomic tmp+rename, whole-file rewrite) ────────

/** Tolerant line-by-line JSON read — a torn/mid-rename line is skipped
 *  rather than throwing (mirrors approval-store.ts's torn-write tolerance). */
function readJsonlRecords<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return [];
  }
  const records: T[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      records.push(JSON.parse(trimmed) as T);
    } catch {
      // Skip malformed line — partial write, never throw a reader.
    }
  }
  return records;
}

/** Append `record` to `path` as a new JSONL line, atomically (tmp file +
 *  rename over the target — same primitive as approval-store.ts's
 *  atomicWriteJson). Read-modify-write of the WHOLE file under the tmp+
 *  rename umbrella keeps every prior line intact ("append-only") while still
 *  guaranteeing no reader ever observes a half-written file. */
function appendJsonlRecord(path: string, record: unknown): void {
  const dir = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const nextContent = existing + JSON.stringify(record) + '\n';

  const tmpPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, nextContent, 'utf-8');
  try {
    renameSync(tmpPath, path);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — the rename error below is what the caller needs.
    }
    throw err;
  }
}

// ─── Public API — approved snapshots ────────────────────────────────────

/** Persist a newly-approved plan snapshot for `snapshot.flowId`. Never
 *  overwrites/removes a prior snapshot for the same flowId — appends a new
 *  JSONL line, so a re-approval (new revision/digest) keeps full history. */
export function saveApprovedSnapshot(root: string, snapshot: StoredApprovedSnapshot): void {
  appendJsonlRecord(snapshotLogPath(root, snapshot.flowId), snapshot);
}

/** Load the MOST RECENTLY approved snapshot for `flowId`, or `undefined` if
 *  none was ever saved. */
export function loadApprovedSnapshot(root: string, flowId: string): StoredApprovedSnapshot | undefined {
  const records = readJsonlRecords<StoredApprovedSnapshot>(snapshotLogPath(root, flowId));
  return records.length > 0 ? records[records.length - 1] : undefined;
}

// ─── Public API — planned sprints (SURF-1c durability) ─────────────────

/** Path for a flow's captured planned-Sprint records. */
function plannedSprintLogPath(root: string, flowId: string): string {
  return join(storeDir(root), `${flowId}.plan.jsonl`);
}

/** Persist the exact planned Sprint captured at preview time (SURF-1c): the
 *  approve step needs it to build a StoredApprovedSnapshot, and it must
 *  survive a process restart — the pre-1c in-memory FlowRecord lost it.
 *  Appends (a re-planned revision keeps history, mirror of snapshots). */
export function savePlannedSprint(root: string, flowId: string, record: { revision: number; sprint: unknown }): void {
  appendJsonlRecord(plannedSprintLogPath(root, flowId), { flowId, ...record });
}

/** Load the MOST RECENT planned Sprint for `flowId`, or undefined. */
export function loadPlannedSprint(root: string, flowId: string): { flowId: string; revision: number; sprint: unknown } | undefined {
  const records = readJsonlRecords<{ flowId: string; revision: number; sprint: unknown }>(plannedSprintLogPath(root, flowId));
  return records.length > 0 ? records[records.length - 1] : undefined;
}

// ─── Public API — run handles (double-start idempotency) ───────────────

/** Persist a durable record of an actual start attempt for `record.flowId`.
 *  Appends — never overwrites a prior attempt's line. */
export function saveRunHandle(root: string, record: StoredRunHandleRecord): void {
  appendJsonlRecord(handleLogPath(root, record.flowId), record);
}

/** Load the MOST RECENT start-attempt record for `flowId`, or `undefined` if
 *  this flow was never started. */
export function loadRunHandle(root: string, flowId: string): StoredRunHandleRecord | undefined {
  const records = readJsonlRecords<StoredRunHandleRecord>(handleLogPath(root, flowId));
  return records.length > 0 ? records[records.length - 1] : undefined;
}

// ─── Public API — per-flow durable event log ─────────────────────────────
//
// A per-flowId append-only event log (`<flowId>.events.jsonl`), the durable
// counterpart to the in-memory reducer stream (run-flow-reducer.ts). Every
// append is stamped with a store-assigned monotonic `sequence` so a replay
// cursor can resume from exactly where it left off. Sequence is assigned ONLY
// here — the reducer never produces or reads it (run-flow-contract.ts's
// RunFlowEventBase.sequence purity contract). Same atomic tmp+rename append
// and torn-line-tolerant read as the snapshot/handle logs above (reused, not
// re-invented); no new consumer is wired in this slice — the coordinator that
// reads this log is the next one.

/** Options for {@link readFlowEvents}. */
export interface ReadFlowEventsOptions {
  /** Replay cursor — return only events whose store-assigned `sequence` is
   *  strictly greater than this. Omit to read the whole log. */
  readonly afterSequence?: number;
}

/** Append `event` to `flowId`'s durable event log, stamping it with the next
 *  monotonic sequence (last record's sequence + 1; 1 when the log does not yet
 *  exist). The store is the sole authority for `sequence` — any value on the
 *  incoming `event` is overwritten. Returns the assigned sequence. Atomic
 *  (tmp+rename) via the shared {@link appendJsonlRecord} primitive. */
export function appendFlowEvent(root: string, flowId: string, event: RunFlowEvent): number {
  const path = eventsLogPath(root, flowId);
  const existing = readJsonlRecords<RunFlowEvent>(path);
  const last = existing[existing.length - 1];
  const nextSequence = (last?.sequence ?? 0) + 1;
  // Built at appendJsonlRecord's `unknown` param — no discriminated-union
  // spread widening, and `sequence` last so it wins over any caller-supplied value.
  appendJsonlRecord(path, { ...event, sequence: nextSequence });
  return nextSequence;
}

/** Read `flowId`'s durable event log in append order, torn-line tolerant. With
 *  `opts.afterSequence`, returns only events past that replay cursor. Returns
 *  an empty array when the log does not exist. */
export function readFlowEvents(root: string, flowId: string, opts: ReadFlowEventsOptions = {}): RunFlowEvent[] {
  const records = readJsonlRecords<RunFlowEvent>(eventsLogPath(root, flowId));
  const { afterSequence } = opts;
  if (afterSequence === undefined) return records;
  return records.filter(r => r.sequence !== undefined && r.sequence > afterSequence);
}

/** Enumerate every flowId that has any durable log (snapshot, handle, or
 *  events) under `root`'s store dir. Files whose name matches none of the
 *  known `<flowId>.<kind>.jsonl` suffixes (e.g. in-flight `.tmp` files) are
 *  silently skipped. Result is deduped and sorted for cross-platform-stable
 *  output (readdirSync order is not guaranteed — Yasa #2). */
export function listFlowIds(root: string): string[] {
  const dir = storeDir(root);
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const flowIds = new Set<string>();
  for (const name of entries) {
    for (const suffix of ['.snapshot.jsonl', '.handle.jsonl', '.events.jsonl']) {
      if (name.length > suffix.length && name.endsWith(suffix)) {
        flowIds.add(name.slice(0, -suffix.length));
        break;
      }
    }
  }
  return [...flowIds].sort();
}
