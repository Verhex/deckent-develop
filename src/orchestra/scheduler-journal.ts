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
