// ═══ scheduler-journal — SCHED4 differential shadow journal ═══════════════
//
// docs/analysis/scheduler-unify-design-2026-07-11.md: "Event log ilk aşamada
// yürütme otoritesi değil, karar-karşılaştırma ve replay kanıt katmanı
// olmalıdır." This module IS that observation-only layer for the SCHED4
// shadow reducer — one JSONL line per shadowed tick, comparing the reducer's
// decision against the live-observed outcome.
//
// Fail-soft (mirrors `appendRoutingDecisionRecord`, src/core/routing-engine.ts):
// a journal write failure must NEVER affect scheduling — this module is
// consumed exclusively from the shadow-observation path (scheduler-driver.ts),
// which never touches the live spawn/kill mainline.

import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { debugLog } from '../core/utils.js';

const SCHEDULER_SHADOW_DIR = '.deckent/runtime/scheduler-shadow';

/** One tick's differential comparison — the JSONL record shape. */
export interface SchedulerShadowRecord {
  readonly seq: number;
  readonly trigger: 'initial' | 'watcher';
  readonly ts: string;
  readonly legacyDecision: {
    readonly mode: 'continuous' | 'legacy-fifo';
    readonly spawnedTaskIds: readonly string[];
    readonly cascadeSkippedTaskIds: readonly string[];
  };
  readonly reducerDecision: {
    readonly mode: 'continuous' | 'legacy-fifo';
    readonly spawnedTaskIds: readonly string[];
    readonly cascadeSkippedTaskIds: readonly string[];
    readonly blockedTaskIds: readonly string[];
  };
  readonly divergence: readonly SchedulerShadowDivergenceEntry[];
}

export interface SchedulerShadowDivergenceEntry {
  readonly kind:
    | 'spawn-only-in-legacy'
    | 'spawn-only-in-reducer'
    | 'cascade-skip-only-in-legacy'
    | 'cascade-skip-only-in-reducer';
  readonly taskId: string;
}

/** Path to this sprint's shadow-scheduler journal. */
export function schedulerShadowJournalPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, SCHEDULER_SHADOW_DIR, `${sprintId}.jsonl`);
}

/**
 * Append one shadow-tick record. Fail-soft: any mkdir/write error is
 * swallowed (debugLog only) — never thrown, never affects the caller.
 */
export function appendSchedulerShadowRecord(
  projectRoot: string,
  sprintId: string,
  record: SchedulerShadowRecord,
): void {
  try {
    const filePath = schedulerShadowJournalPath(projectRoot, sprintId);
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    debugLog('scheduler-journal:appendSchedulerShadowRecord', err);
  }
}

// ─── Coverage summary (SCHED5K, docs/analysis/scheduler-shadow-divergence-2026-07-12.md §4.2/§5.1) ─
//
// The divergence report's per-sprint table (§1) was built by hand — a one-off
// `node -e` full-parse of each sprint's .jsonl tallying trigger kind, mode,
// spawn/cascade-skip counts and divergence kinds (§7, "Metodoloji" note). This
// summarizer mechanizes exactly that tally so a future dogfood sprint's shadow
// coverage (which scenario classes were actually exercised — legacy-fifo mode?
// cascade-skip? a dependency-driven spawn?) is machine-computable from a
// journal's already-parsed records, instead of requiring another by-hand
// analysis pass. Pure — no fs, no live-path involvement; the caller reads and
// JSON-parses the .jsonl (schedulerShadowJournalPath) and passes the records in.

export interface SchedulerShadowCoverageSummary {
  readonly totalTicks: number;
  readonly triggerCounts: Readonly<Record<SchedulerShadowRecord['trigger'], number>>;
  /** Every distinct `mode` seen across either engine's decision, in first-seen order. */
  readonly modesObserved: readonly SchedulerShadowRecord['legacyDecision']['mode'][];
  readonly legacySpawnTicks: number;
  readonly reducerSpawnTicks: number;
  readonly legacyCascadeSkipTicks: number;
  readonly reducerCascadeSkipTicks: number;
  /** Ticks where the reducer marked at least one task Blocked this tick. */
  readonly dependencyBlockTicks: number;
  readonly divergenceCountByKind: Record<SchedulerShadowDivergenceEntry['kind'], number>;
  readonly totalDivergenceCount: number;
}

const DIVERGENCE_KINDS: readonly SchedulerShadowDivergenceEntry['kind'][] = [
  'spawn-only-in-legacy',
  'spawn-only-in-reducer',
  'cascade-skip-only-in-legacy',
  'cascade-skip-only-in-reducer',
];

/**
 * Tally a set of already-parsed shadow-journal records into a coverage
 * summary. Order-independent (does not assume records are seq-sorted).
 */
export function summarizeSchedulerShadowCoverage(
  records: readonly SchedulerShadowRecord[],
): SchedulerShadowCoverageSummary {
  const triggerCounts: Record<SchedulerShadowRecord['trigger'], number> = { initial: 0, watcher: 0 };
  const modesSeen = new Set<SchedulerShadowRecord['legacyDecision']['mode']>();
  const modesObserved: SchedulerShadowRecord['legacyDecision']['mode'][] = [];
  let legacySpawnTicks = 0;
  let reducerSpawnTicks = 0;
  let legacyCascadeSkipTicks = 0;
  let reducerCascadeSkipTicks = 0;
  let dependencyBlockTicks = 0;
  const divergenceCountByKind: Record<SchedulerShadowDivergenceEntry['kind'], number> = {
    'spawn-only-in-legacy': 0,
    'spawn-only-in-reducer': 0,
    'cascade-skip-only-in-legacy': 0,
    'cascade-skip-only-in-reducer': 0,
  };
  let totalDivergenceCount = 0;

  for (const record of records) {
    triggerCounts[record.trigger]++;

    for (const mode of [record.legacyDecision.mode, record.reducerDecision.mode]) {
      if (!modesSeen.has(mode)) {
        modesSeen.add(mode);
        modesObserved.push(mode);
      }
    }

    if (record.legacyDecision.spawnedTaskIds.length > 0) legacySpawnTicks++;
    if (record.reducerDecision.spawnedTaskIds.length > 0) reducerSpawnTicks++;
    if (record.legacyDecision.cascadeSkippedTaskIds.length > 0) legacyCascadeSkipTicks++;
    if (record.reducerDecision.cascadeSkippedTaskIds.length > 0) reducerCascadeSkipTicks++;
    if (record.reducerDecision.blockedTaskIds.length > 0) dependencyBlockTicks++;

    for (const entry of record.divergence) {
      divergenceCountByKind[entry.kind]++;
      totalDivergenceCount++;
    }
  }

  // Stable output shape regardless of which kinds actually appeared.
  for (const kind of DIVERGENCE_KINDS) {
    if (!(kind in divergenceCountByKind)) divergenceCountByKind[kind] = 0;
  }

  return {
    totalTicks: records.length,
    triggerCounts,
    modesObserved,
    legacySpawnTicks,
    reducerSpawnTicks,
    legacyCascadeSkipTicks,
    reducerCascadeSkipTicks,
    dependencyBlockTicks,
    divergenceCountByKind,
    totalDivergenceCount,
  };
}
