/**
 * Durable provider-execution admission authority.
 *
 * Authentication and provider quota failures are provider-scoped availability
 * holds, never task-cost failures. The event stream preserves both the hold and
 * its explicit clearance so a resumed run cannot be trapped by stale evidence.
 */

import { readEvents, writeEvent } from './event-stream.js';
import type {
  ProviderReportedUsageLimitEvidence,
} from './provider-failure-classifier.js';

export const PROVIDER_EXECUTION_HOLD_CHANNEL = 'PROVIDER_EXECUTION_HOLD';

interface ProviderExecutionHoldBase {
  readonly provider: string;
  readonly sourceTaskId: string;
  readonly reason: string | null;
}

export interface ProviderAuthExecutionHold extends ProviderExecutionHoldBase {
  readonly kind: 'auth';
}

export interface ProviderUsageLimitExecutionHold extends ProviderExecutionHoldBase {
  readonly kind: 'usage-limit';
  readonly evidence: ProviderReportedUsageLimitEvidence;
}

export type ProviderExecutionHold =
  | ProviderAuthExecutionHold
  | ProviderUsageLimitExecutionHold;

/** Publish only evidence-complete holds; usage-limit cannot be constructed bare. */
export function publishProviderExecutionHold(
  projectRoot: string,
  sprintId: string,
  hold: ProviderExecutionHold,
): void {
  writeEvent(projectRoot, sprintId, 'brain', 'auditor', PROVIDER_EXECUTION_HOLD_CHANNEL, {
    ...hold,
    state: 'held',
    heldAt: new Date().toISOString(),
  });
}

/** Project the ordered hold/clear event history into the currently active holds. */
export function readProviderExecutionHolds(
  projectRoot: string,
  sprintId: string,
): ProviderExecutionHold[] {
  const holds = new Map<string, ProviderExecutionHold>();
  for (const event of readEvents(projectRoot, sprintId, {
    channel: PROVIDER_EXECUTION_HOLD_CHANNEL,
  })) {
    if (!event.payload || typeof event.payload !== 'object') continue;
    const payload = event.payload as Record<string, unknown>;
    const provider = typeof payload.provider === 'string' ? payload.provider : null;
    if (!provider) continue;
    if (payload.state === 'cleared') {
      holds.delete(provider);
      continue;
    }
    const kind = payload.kind === 'auth' || payload.kind === 'usage-limit'
      ? payload.kind
      : null;
    const sourceTaskId = typeof payload.sourceTaskId === 'string'
      ? payload.sourceTaskId
      : null;
    if (!kind || !sourceTaskId) continue;
    const base = {
      provider,
      sourceTaskId,
      reason: typeof payload.reason === 'string' ? payload.reason : null,
    };
    if (kind === 'usage-limit') {
      if (!payload.evidence || typeof payload.evidence !== 'object') continue;
      const evidence = payload.evidence as Record<string, unknown>;
      if (
        evidence.kind !== 'provider-reported-usage-limit'
        || typeof evidence.signal !== 'string'
        || evidence.signal.trim().length === 0
      ) continue;
      holds.set(provider, {
        ...base,
        kind,
        evidence: {
          kind: 'provider-reported-usage-limit',
          signal: evidence.signal,
        },
      });
    } else {
      holds.set(provider, { ...base, kind });
    }
  }
  return [...holds.values()];
}

/**
 * Clear every currently active provider hold before a deliberate resume.
 * Returns the providers cleared so callers/tests can audit the transition.
 */
export function clearProviderExecutionHolds(
  projectRoot: string,
  sprintId: string,
): string[] {
  const providers = readProviderExecutionHolds(projectRoot, sprintId)
    .map(hold => hold.provider);
  for (const provider of providers) {
    writeEvent(projectRoot, sprintId, 'brain', 'auditor', PROVIDER_EXECUTION_HOLD_CHANNEL, {
      state: 'cleared',
      provider,
      clearedAt: new Date().toISOString(),
    });
  }
  return providers;
}

/**
 * Restore a prior hold set when a resume attempt fails before settlement.
 * A newer hold for the same provider wins and is never overwritten.
 */
export function restoreProviderExecutionHolds(
  projectRoot: string,
  sprintId: string,
  priorHolds: readonly ProviderExecutionHold[],
): void {
  const activeProviders = new Set(
    readProviderExecutionHolds(projectRoot, sprintId).map(hold => hold.provider),
  );
  for (const hold of priorHolds) {
    if (activeProviders.has(hold.provider)) continue;
    writeEvent(projectRoot, sprintId, 'brain', 'auditor', PROVIDER_EXECUTION_HOLD_CHANNEL, {
      ...hold,
      state: 'held',
      restoredAt: new Date().toISOString(),
    });
    activeProviders.add(hold.provider);
  }
}
