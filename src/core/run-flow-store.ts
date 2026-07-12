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
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { RUNTIME_DIR } from './constants.js';
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
}

/** Durable record of an actual start attempt for a flow — the idempotency
 *  key double-start detection (run-job-service.ts) reads back. */
export interface StoredRunHandleRecord {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest: string;
  readonly handle: RunHandle;
  readonly startedAt: string;
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
