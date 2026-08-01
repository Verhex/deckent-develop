import type { TaskResult } from './task-types.js';
import { resolveHostPreDispatchSettlement } from './pre-dispatch-settlement.js';

export type SprintWorkAttributionState = 'VERIFIED' | 'HOLD' | 'UNAVAILABLE';

export interface AttributedTaskWorkProjection {
  readonly state: SprintWorkAttributionState;
  readonly attemptId: string | null;
  readonly reasonCode: string | null;
  readonly filesChanged: readonly string[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
}

export interface SprintWorkAttributionProjection {
  readonly filesChanged: readonly string[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly verifiedAttempts: number;
  readonly heldAttempts: number;
  readonly unavailableAttempts: number;
  readonly fileAttemptIds: Readonly<Record<string, readonly string[]>>;
}

/**
 * Project one worker claim into sprint-summary evidence. Only host-VERIFIED,
 * claim-time attribution may contribute files or line counts. HOLD and legacy
 * unavailable claims retain their truth state but contribute zero bytes.
 */
export function projectAttributedTaskWork(
  result: TaskResult | undefined,
): AttributedTaskWorkProjection {
  const preDispatchSettlement = resolveHostPreDispatchSettlement(result);
  if (preDispatchSettlement) {
    return {
      state: 'VERIFIED',
      attemptId: preDispatchSettlement.attemptId,
      reasonCode: null,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
    };
  }
  const attribution = result?.workAttribution;
  if (!result || attribution?.state !== 'VERIFIED') {
    return {
      state: attribution?.state ?? 'UNAVAILABLE',
      attemptId: attribution?.attemptId ?? null,
      reasonCode: attribution?.reasonCode
        ?? (result ? 'ATTRIBUTION_AUTHORITY_UNAVAILABLE' : 'RESULT_UNAVAILABLE'),
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
    };
  }
  return {
    state: 'VERIFIED',
    attemptId: attribution.attemptId,
    reasonCode: null,
    filesChanged: [...new Set((result.filesChanged ?? []).filter(Boolean))],
    linesAdded: Number.isFinite(result.linesAdded) ? Math.max(0, result.linesAdded) : 0,
    linesRemoved: Number.isFinite(result.linesRemoved) ? Math.max(0, result.linesRemoved) : 0,
  };
}

/** Fold only VERIFIED attempt evidence into the terminal Sprint projection. */
export function projectSprintWorkAttribution(
  results: readonly TaskResult[],
): SprintWorkAttributionProjection {
  const fileAttempts = new Map<string, Set<string>>();
  let linesAdded = 0;
  let linesRemoved = 0;
  let verifiedAttempts = 0;
  let heldAttempts = 0;
  let unavailableAttempts = 0;

  for (const result of results) {
    const projected = projectAttributedTaskWork(result);
    if (projected.state === 'HOLD') {
      heldAttempts += 1;
      continue;
    }
    if (projected.state === 'UNAVAILABLE') {
      unavailableAttempts += 1;
      continue;
    }
    verifiedAttempts += 1;
    linesAdded += projected.linesAdded;
    linesRemoved += projected.linesRemoved;
    for (const path of projected.filesChanged) {
      const attempts = fileAttempts.get(path) ?? new Set<string>();
      attempts.add(projected.attemptId!);
      fileAttempts.set(path, attempts);
    }
  }

  const filesChanged = [...fileAttempts.keys()].sort((a, b) => a.localeCompare(b));
  return {
    filesChanged,
    linesAdded,
    linesRemoved,
    verifiedAttempts,
    heldAttempts,
    unavailableAttempts,
    fileAttemptIds: Object.freeze(Object.fromEntries(
      filesChanged.map(path => [path, Object.freeze([...fileAttempts.get(path)!].sort())]),
    )),
  };
}
