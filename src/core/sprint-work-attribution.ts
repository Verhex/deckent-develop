import type { TaskResult } from './task-types.js';
import { resolveHostPreDispatchSettlement } from './pre-dispatch-settlement.js';
import { normalizeChangedPaths } from './task-result-schema.js';

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

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/**
 * A VERIFIED label is not itself authorship evidence.  The projection accepts
 * it only when the host has bound the exact attempt to the immutable,
 * content-addressed claim-time baseline.  Older/partial shapes are ambiguous
 * and therefore become a typed HOLD rather than inheriting the worker's claim.
 */
function hasExactClaimTimeAuthority(result: TaskResult): boolean {
  const attribution = result.workAttribution;
  if (attribution?.state !== 'VERIFIED') return false;
  const baselineSha256 = attribution.baselineSha256;
  return attribution.attemptId.trim().length > 0
    && typeof baselineSha256 === 'string'
    && SHA256_PATTERN.test(baselineSha256)
    && attribution.baselineRef
      === `task-result-work-attribution-baseline:sha256:${baselineSha256}`
    && SHA256_PATTERN.test(attribution.scopeDigest)
    && attribution.reasonCode === undefined;
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
  if (!hasExactClaimTimeAuthority(result)) {
    return {
      state: 'HOLD',
      attemptId: attribution.attemptId,
      reasonCode: 'ATTRIBUTION_AUTHORITY_MISMATCH',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
    };
  }
  // FILESCHANGED-SHAPE, attribution edition (live sprint-661/667): canonical
  // FileChange OBJECTS flowed into the attribution projection unnormalized, so
  // terminal-evidence's validText check held EVERY verified attempt and the
  // success-path COMPLETE publication was structurally impossible. Canonical
  // results also carry totalLinesAdded/Removed, not the legacy linesAdded.
  const canonical = result as { totalLinesAdded?: unknown; totalLinesRemoved?: unknown };
  const added = Number.isFinite(canonical.totalLinesAdded) ? canonical.totalLinesAdded as number
    : Number.isFinite(result.linesAdded) ? result.linesAdded : 0;
  const removed = Number.isFinite(canonical.totalLinesRemoved) ? canonical.totalLinesRemoved as number
    : Number.isFinite(result.linesRemoved) ? result.linesRemoved : 0;
  return {
    state: 'VERIFIED',
    attemptId: attribution.attemptId,
    reasonCode: null,
    filesChanged: [...new Set(normalizeChangedPaths(result.filesChanged))],
    linesAdded: Math.max(0, added),
    linesRemoved: Math.max(0, removed),
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
