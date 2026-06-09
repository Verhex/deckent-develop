// src/orchestra/autonomous/work-generator-source.ts
// Composable TriggerSource that yields work-generator candidates as triggers.
// Wired into the live loop by buildEngineRuntime (runtime-loop.ts) when the
// caller supplies a `generateWork` producer — see makeDebtWorkGenerator below
// for the production debt-driven producer used by `deckent autonomous start`.
import { getDebtItems } from '../../core/debt-store.js';
import type { DebtItem } from '../../core/sprint-types.js';
import type { AutonomousTrigger, TriggerSource } from '../autonomous-runtime.js';
import type { BacklogEntry } from './backlog-types.js';
import { AUTONOMOUS_EXECUTE_ACTION } from './execute-dispatcher.js';
import { generateWorkCandidates } from './work-generator.js';

export interface WorkGeneratorSourceOpts {
  /** Called each tick to produce candidates. Injected for testability. */
  generate: () => BacklogEntry[];
}

/**
 * Returns a TriggerSource that, when polled, calls `opts.generate()` and
 * yields the first candidate as a trigger. Fail-safe: generator errors → null.
 *
 * One trigger per tick (matches backlog-trigger semantics). The entry travels
 * in `payload.entry` so the policy gate can inspect it.
 */
export function makeWorkGeneratorSource(opts: WorkGeneratorSourceOpts): TriggerSource {
  return {
    next(): AutonomousTrigger | null {
      let candidates: BacklogEntry[];
      try {
        candidates = opts.generate();
      } catch {
        return null;
      }
      const entry = candidates[0];
      if (!entry) return null;
      return {
        id: `work-gen-${entry.id}`,
        source: 'work-generator',
        action: AUTONOMOUS_EXECUTE_ACTION,
        requestedBy: entry.tenant ? `system:${entry.tenant}` : 'system',
        payload: { entry },
      };
    },
  };
}

// ── Production candidate producer (debt → backlog candidates) ──────────────

export interface DebtWorkGeneratorOpts {
  projectRoot: string;
  /** Minimum ms between debt scans (default 600_000 — 10 min). Between scans → []. */
  intervalMs?: number;
  /** Injected debt loader (hermetic tests). Defaults to getDebtItems(activeOnly). */
  loadDebt?: () => DebtItem[];
  /** Injected ms-epoch clock (deterministic tests). Defaults to Date.now. */
  clock?: () => number;
}

/**
 * Build the live `generateWork` producer for buildEngineRuntime: maps ACTIVE
 * tech-debt records (Memory V2 debt store) to backlog candidates via
 * `generateWorkCandidates`. HIGH/CRITICAL debt → `risk-tagged` policy (parks
 * for approval under the G3 risk gate); NORMAL → `auto`.
 *
 * Scans are throttled to `intervalMs` because the trigger source polls every
 * idle tick and getDebtItems opens SQLite — between scans the producer returns
 * [] (already-enqueued candidates live in the backlog, nothing is lost).
 * Fail-safe: a throwing loader yields [] and never breaks the loop.
 *
 * TODO/FIXME markers (the WorkGeneratorInput.todoMarkers half) have no
 * production scanner yet — debt records are the only live feed for now.
 */
export function makeDebtWorkGenerator(opts: DebtWorkGeneratorOpts): () => BacklogEntry[] {
  const intervalMs = opts.intervalMs ?? 600_000;
  const loadDebt = opts.loadDebt ?? ((): DebtItem[] => getDebtItems(opts.projectRoot, { activeOnly: true }));
  const clock = opts.clock ?? Date.now;
  let lastScan = -Infinity;

  return (): BacklogEntry[] => {
    const now = clock();
    if (now - lastScan < intervalMs) return [];
    lastScan = now;
    let items: DebtItem[];
    try {
      items = loadDebt();
    } catch {
      return []; // fail-safe: debt store unavailable must never break the loop
    }
    return generateWorkCandidates({
      debtRecords: items.map((d) => ({
        id: d.id,
        title: d.description,
        severity: String(d.priority).toLowerCase(),
      })),
    });
  };
}
