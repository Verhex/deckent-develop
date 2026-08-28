import { createHash } from 'node:crypto';

import { type CapabilityRegistry } from '../core/capability-broker.js';
import { FlowRegistry } from '../core/flow-registry.js';
import { FlowScheduler } from '../core/flow-scheduler.js';
import type { ScheduledFlow } from '../core/scheduled-flow.js';
import {
  createListMission,
  type ListMissionSpec,
} from '../orchestra/autonomous/mission-store/mission-ingest.js';
import type { MissionStore } from '../orchestra/autonomous/mission-store/mission-types.js';
import type { SourceDefinition } from './source-retrieval.js';
import {
  WATCH_CAPABILITY_ID,
  type WatchCapabilityOutcome,
} from './watch-capability.js';

export const WATCH_FLOW_ID = 'intelligence.daily-competitor-watch' as const;
export const WATCH_FLOW_CRON = '0 9 * * *' as const;
export const WATCH_FLOW_TIMEZONE = 'Europe/Istanbul' as const;

export interface WatchFlowCursorStore {
  get(flowId: string): Date | undefined;
  set(flowId: string, occurrence: Date): void;
}

export interface RegisterWatchFlowOptions {
  tenantId?: string;
  createdAt?: Date;
}

export interface RunWatchFlowOptions {
  registry: FlowRegistry;
  scheduler: FlowScheduler;
  capabilityRegistry: CapabilityRegistry;
  missionStore: MissionStore;
  cursorStore: WatchFlowCursorStore;
  sources: readonly SourceDefinition[];
  now: Date;
  dryRun?: boolean;
  /** Test/recovery hook representing process death after the atomic ingest. */
  afterMissionInsert?: (missionId: string, workItemId: string) => void;
}

export interface WatchFlowOccurrenceResult {
  occurrence: Date;
  missionId: string;
  workItemId: string;
  outcome: WatchCapabilityOutcome;
}

/** Register the canonical daily intelligence watch ScheduledFlow. */
export function registerWatchFlow(
  registry: FlowRegistry,
  options: RegisterWatchFlowOptions = {},
): ScheduledFlow {
  const existing = registry.getFlow(WATCH_FLOW_ID);
  if (existing !== undefined) return existing;

  const flow: ScheduledFlow = {
    id: WATCH_FLOW_ID,
    cronExpr: WATCH_FLOW_CRON,
    timezone: WATCH_FLOW_TIMEZONE,
    action: WATCH_CAPABILITY_ID,
    tenantId: options.tenantId ?? 'local',
    enabled: true,
    createdAt: (options.createdAt ?? new Date()).toISOString(),
  };
  registry.addFlow(flow);
  return flow;
}

/**
 * Execute all missed watch slots in order. Mission ingest precedes capability
 * execution; cursor persistence follows it, so replay after either boundary is
 * deterministic and relies on the existing MissionStore/outbox id contracts.
 */
export async function runWatchFlow(
  options: RunWatchFlowOptions,
): Promise<readonly WatchFlowOccurrenceResult[]> {
  const flow = options.registry.getFlow(WATCH_FLOW_ID);
  if (flow === undefined) throw new Error(`Watch flow is not registered: ${WATCH_FLOW_ID}`);

  const after = options.cursorStore.get(flow.id)
    ?? new Date(flow.createdAt ?? options.now.toISOString());
  const occurrences = options.scheduler.missedOccurrences(flow, after, options.now);
  const results: WatchFlowOccurrenceResult[] = [];

  for (const { nextRun: occurrence } of occurrences) {
    const ids = deterministicOccurrenceIds(flow.id, occurrence);
    if (!options.dryRun) {
      createListMission(options.missionStore, missionSpec(flow, occurrence, ids));
      options.afterMissionInsert?.(ids.missionId, ids.workItemId);
    }

    const invocation = await options.capabilityRegistry.invoke({
      capability: WATCH_CAPABILITY_ID,
      args: { sources: options.sources, dryRun: options.dryRun === true },
    });
    if (!invocation.ok) throw new Error(invocation.error);
    const outcome = invocation.value as WatchCapabilityOutcome;
    if (outcome.kind !== 'completed') {
      throw new Error(`Watch capability did not complete: ${outcome.kind}`);
    }

    results.push({ occurrence, ...ids, outcome });
    if (!options.dryRun) options.cursorStore.set(flow.id, occurrence);
  }
  return results;
}

export function deterministicOccurrenceIds(
  flowId: string,
  occurrence: Date,
): { missionId: string; workItemId: string } {
  const digest = createHash('sha256')
    .update(`${flowId}\n${occurrence.toISOString()}`)
    .digest('hex');
  const missionId = `watch-${digest}`;
  return { missionId, workItemId: `${missionId}-capability` };
}

function missionSpec(
  flow: ScheduledFlow,
  occurrence: Date,
  ids: { missionId: string; workItemId: string },
): ListMissionSpec {
  return {
    id: ids.missionId,
    title: `Competitor watch ${occurrence.toISOString()}`,
    tenant: flow.tenantId,
    items: [{
      id: ids.workItemId,
      kind: 'capability',
      spec: {
        capability: WATCH_CAPABILITY_ID,
        scheduledOccurrence: occurrence.toISOString(),
      },
    }],
  };
}
