// ═══ RoutingEngineV3 — Learning Cells Sidecar ════════════════════════
// Slice-0 FOUNDATION (sprint-446, task 446-012). Per-(workType, domain,
// agentId) outcome ledger — the vector-routing analogue of agent-pool.ts's
// stats sidecar (born-605 STATS-SIDECAR): a single gitignored JSON file,
// read-merge-write atomically (tmp + rename), never touching a git-tracked
// manifest.
//
// K4 CONTRACT: every field this module's public API takes is the CALLING
// task's OWN vector value (its own workType/domain/agentId/quality) — there
// is no Task[]/Sprint parameter here for an implementation to mistakenly
// sample from index 0 (the K4 bug class: `tasks[0]` read as a stand-in for
// "the" task's DNA — see src/orchestra/sprint-planner.ts:603 for the
// pre-existing instance this new path must never repeat). One call == one
// task's own outcome; there is no task list to index into.
//
// Idempotency is per (taskId, sprintId), NOT per sprint: sprint-finalizer.ts's
// `learnings.recentSprints` marker (a durable "already recorded" check before
// re-running a per-task loop) is the precedent for "record once, ever" — but
// it is checked ONCE per sprint, outside the per-task loop it guards. This
// module's `recordOutcome` is called once per task independently, with no
// shared outer guard, so a per-sprint marker would let only the first task of
// a sprint ever record. The dedupe key is therefore `(taskId, sprintId)`,
// kept as a bounded ring (recentKeys accumulate ~20-35x faster per sprint than
// the one-per-sprint recentSprints list ever did).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJsonSafe } from '../utils.js';
import { InvalidWorkTypeError } from './types.js';
import type { WorkType } from './types.js';
import { isWorkType } from './vocabulary-builtin.js';

// ─── Schema ───────────────────────────────────────────────────────────

/** The single supported on-disk schema generation for routing-cells.json. */
export const CELLS_SCHEMA_VERSION = 1 as const;

/** Project-relative path of the sidecar ledger (gitignored — mirrors agent-pool.ts's catalog-stats.json placement). */
export const CELLS_RELATIVE_PATH = path.join('.deckent', 'stats', 'routing-cells.json');

/** Bounded ring capacity for the (taskId, sprintId) idempotency marker — sized for several
 *  sprints' worth of tasks (observed sprint-445/446 task counts run 20-35/sprint) rather
 *  than any single sprint, so a `finalize --force` re-run days later still finds its own
 *  marker and stays idempotent. */
export const RECENT_KEYS_RING_CAP = 500;

/** One (workType, domain, agentId) cell's accumulated outcome stats. */
export interface RoutingCell {
  uses: number;
  successes: number;
  qualitySum: number;
  lastSprint: string;
}

export interface RoutingCellsFile {
  schemaVersion: number;
  cells: Record<string, RoutingCell>;
  /** Bounded ring of the most-recently-recorded "<taskId>|<sprintId>" keys — see the file
   *  header for why this is per-TASK rather than sprint-finalizer's per-SPRINT precedent. */
  recentKeys: string[];
  /** Visible rejected-outcome counters by reason (ghost gate, 446-013) — never silent drops. */
  rejectedOutcomes: Record<string, number>;
}

// ─── Internals — read / write ──────────────────────────────────────────

function emptyFile(): RoutingCellsFile {
  return { schemaVersion: CELLS_SCHEMA_VERSION, cells: {}, recentKeys: [], rejectedOutcomes: {} };
}

/** Count a rejected outcome in the ledger (atomic write; cells untouched). */
function bumpRejectedCounter(projectRoot: string, reason: string): void {
  const file = readCellsFile(projectRoot);
  file.rejectedOutcomes[reason] = (file.rejectedOutcomes[reason] ?? 0) + 1;
  writeCellsFileAtomic(projectRoot, file);
}

/** Defensive read — a missing/corrupt/malformed ledger degrades to an empty one, never throws. */
function readCellsFile(projectRoot: string): RoutingCellsFile {
  const raw = readJsonSafe<Partial<RoutingCellsFile>>(path.join(projectRoot, CELLS_RELATIVE_PATH));
  if (!raw || typeof raw !== 'object') return emptyFile();

  const cells =
    raw.cells && typeof raw.cells === 'object' && !Array.isArray(raw.cells)
      ? (raw.cells as Record<string, RoutingCell>)
      : {};
  const recentKeys = Array.isArray(raw.recentKeys)
    ? raw.recentKeys.filter((k): k is string => typeof k === 'string')
    : [];

  const rejectedOutcomes =
    raw.rejectedOutcomes && typeof raw.rejectedOutcomes === 'object' && !Array.isArray(raw.rejectedOutcomes)
      ? (raw.rejectedOutcomes as Record<string, number>)
      : {};

  return {
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : CELLS_SCHEMA_VERSION,
    cells,
    recentKeys,
    rejectedOutcomes,
  };
}

/** Recursively Object.freeze a plain-object/array tree (mirrors vocabulary.ts's own deepFreeze — duplicated rather than exported/shared across files for one small helper, YAGNI). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Read-merge-write atomically (tmp file + rename — a crash mid-write never leaves a torn ledger). */
function writeCellsFileAtomic(projectRoot: string, file: RoutingCellsFile): void {
  const fullPath = path.join(projectRoot, CELLS_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const tmpPath = `${fullPath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(file, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmpPath, fullPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — the rename error below is what the caller needs.
    }
    throw err;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/** The "<workType>|<domain>|<agentId>" cell key — the sole cell identity in this ledger. */
export function buildCellKey(workType: string, domain: string, agentId: string): string {
  return `${workType}|${domain}|${agentId}`;
}

/**
 * Read the current cell ledger as a deep-frozen snapshot. A missing or corrupt file
 * degrades to an empty, schema-valid snapshot — this never throws.
 */
export function readCellsSnapshot(projectRoot: string): Readonly<RoutingCellsFile> {
  return deepFreeze(readCellsFile(projectRoot));
}

/** One task's own routing outcome — see the K4 CONTRACT note at the top of this file. */
export interface RecordOutcomeInput {
  /** The task this outcome belongs to — together with sprintId, the idempotency key. */
  readonly taskId: string;
  readonly sprintId: string;
  /** This TASK's OWN closed-core work-type (never a sibling task's). */
  readonly workType: WorkType;
  /** This TASK's OWN dominant domain id (open-set — vocabulary.ts's DomainDef.id). */
  readonly domain: string;
  /** The agent actually assigned to (and evaluated for) THIS task. */
  readonly agentId: string;
  readonly verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  /** 0-100 quality score (QualityAssessor scale) — summed into the cell's qualitySum. */
  readonly quality: number;
}

export interface RecordOutcomeResult {
  /** false when this (taskId, sprintId) pair was already recorded — an idempotent no-op. */
  readonly recorded: boolean;
  readonly cellKey: string;
  /** Set when the outcome was REJECTED (ghost entity / malformed quality) — visible, counted, never silent. */
  readonly rejected?: { reason: 'ghost-entity' | 'malformed-quality'; detail: string };
}

export interface RecordOutcomeOptions {
  /**
   * Ghost gate (446-013 / api-design phantom-100% class): entity ids whose
   * content is known to be missing/empty. Outcomes attributed to a ghost are
   * rejected with a counted, typed reason — a contentless entity must never
   * accumulate success signal. Callers pass the Slice-0 GHOST_SKILLS export
   * (skills) and/or an empty-PROMPT.md probe result (agents).
   */
  ghostEntityIds?: ReadonlySet<string>;
}

/**
 * Record one task's routing outcome into its (workType, domain, agentId) cell.
 * Single-writer, atomic (tmp + rename — see writeCellsFileAtomic): the file is read fresh,
 * merged in memory, and rewritten whole on every call, so a crash mid-write never leaves a
 * torn ledger.
 *
 * Idempotent per (taskId, sprintId) via the bounded recentKeys ring — a retried call (e.g.
 * this task's own `Idempotency-Key` header, or a `finalize --force` re-run) for the SAME
 * task+sprint is a no-op; a DIFFERENT task in the SAME sprint always records (see the file
 * header for why a sprint-level marker, like sprint-finalizer's recentSprints, cannot be
 * reused here).
 *
 * @throws {InvalidWorkTypeError} when `input.workType` is not one of the 8 closed-core work-types.
 */
export function recordOutcome(
  projectRoot: string,
  input: RecordOutcomeInput,
  options: RecordOutcomeOptions = {},
): RecordOutcomeResult {
  if (!isWorkType(input.workType)) {
    throw new InvalidWorkTypeError(String(input.workType));
  }

  const cellKey = buildCellKey(input.workType, input.domain, input.agentId);

  // Ghost gate: a contentless entity never accumulates signal. Rejected —
  // visibly (counted in the ledger's rejectedOutcomes), the store's cells
  // untouched by this call.
  if (options.ghostEntityIds?.has(input.agentId)) {
    const rejected = {
      reason: 'ghost-entity' as const,
      detail: `agent '${input.agentId}' is a known ghost (contentless) — outcome not recorded`,
    };
    bumpRejectedCounter(projectRoot, rejected.reason);
    return { recorded: false, cellKey, rejected };
  }

  // Malformed quality: clamp-or-reject — a non-finite quality is a data bug
  // upstream, rejected visibly; finite out-of-range values are clamped.
  if (!Number.isFinite(input.quality)) {
    const rejected = {
      reason: 'malformed-quality' as const,
      detail: `quality=${String(input.quality)} is not a finite number`,
    };
    bumpRejectedCounter(projectRoot, rejected.reason);
    return { recorded: false, cellKey, rejected };
  }
  const quality = Math.min(100, Math.max(0, input.quality));

  const dedupeKey = `${input.taskId}|${input.sprintId}`;

  const file = readCellsFile(projectRoot);

  if (file.recentKeys.includes(dedupeKey)) {
    return { recorded: false, cellKey };
  }

  const existing = file.cells[cellKey] ?? { uses: 0, successes: 0, qualitySum: 0, lastSprint: '' };
  const isSuccess = input.verdict !== 'NO_GO';
  file.cells[cellKey] = {
    uses: existing.uses + 1,
    successes: existing.successes + (isSuccess ? 1 : 0),
    qualitySum: existing.qualitySum + quality,
    lastSprint: input.sprintId,
  };

  file.recentKeys.push(dedupeKey);
  if (file.recentKeys.length > RECENT_KEYS_RING_CAP) {
    file.recentKeys = file.recentKeys.slice(-RECENT_KEYS_RING_CAP);
  }

  writeCellsFileAtomic(projectRoot, file);

  return { recorded: true, cellKey };
}
