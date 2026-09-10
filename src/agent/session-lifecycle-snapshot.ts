// ═══ Session lifecycle read model (P2) — conversation / operation / idle ═══════

import type { ReferenceDigestProgress } from './reference-digest-types.js';
import { buildWorkBudgetSnapshot, type WorkBudgetSnapshot } from './work-budget-snapshot.js';
import type { NativeBudgetState } from './guards/recursion.js';
import type { ResolvedNativeAgentBudget } from '../core/execution-budget-policy.js';

export type ConversationState = 'open' | 'closed';

export type OperationPhase =
  | 'idle'
  | 'turn'
  | 'compact'
  | 'reference'
  | 'permission-wait'
  | 'budget-blocked';

const REFERENCE_ACTIVE_PHASES = new Set<ReferenceDigestProgress['phase']>([
  'ADMITTING',
  'SNAPSHOTTING',
  'MAPPING',
  'REDUCING',
  'ANSWERING',
]);

export interface SessionLifecycleSnapshot {
  readonly conversation: ConversationState;
  readonly operation: OperationPhase;
  readonly turnSequence: number;
  readonly userIdleMs: number | undefined;
  /** False until the first user-driven operation timestamps activity. */
  readonly userIdleTracked: boolean;
  readonly permissionPending: boolean;
  readonly budgetBlocked: boolean;
  readonly budgetExhaustedCode?: string;
  readonly referencePhase?: ReferenceDigestProgress['phase'];
  readonly workBudget?: WorkBudgetSnapshot;
}

export interface BuildSessionLifecycleInput {
  closed: boolean;
  inflightOperation: 'none' | 'turn' | 'compact';
  turnSequence: number;
  lastUserActivityAtMs: number | undefined;
  permissionPending: boolean;
  exhausted?: { code: string; epoch: number };
  referenceProgress?: ReferenceDigestProgress;
  nativeBudget?: ResolvedNativeAgentBudget;
  nativeBudgetState?: NativeBudgetState;
  budgetEpoch?: number;
  nowMs?: number;
}

export function buildSessionLifecycleSnapshot(input: BuildSessionLifecycleInput): SessionLifecycleSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const conversation: ConversationState = input.closed ? 'closed' : 'open';
  const userIdleTracked = input.lastUserActivityAtMs !== undefined;
  const userIdleMs = userIdleTracked
    ? Math.max(0, nowMs - input.lastUserActivityAtMs!)
    : undefined;

  let operation: OperationPhase = 'idle';
  if (input.closed) {
    operation = 'idle';
  } else if (input.inflightOperation === 'turn') {
    operation = 'turn';
  } else if (input.inflightOperation === 'compact') {
    operation = 'compact';
  } else if (input.referenceProgress && REFERENCE_ACTIVE_PHASES.has(input.referenceProgress.phase)) {
    operation = 'reference';
  } else if (input.permissionPending) {
    operation = 'permission-wait';
  } else if (input.exhausted) {
    operation = 'budget-blocked';
  }

  const workBudget = input.nativeBudget && input.nativeBudgetState && input.budgetEpoch !== undefined
    ? buildWorkBudgetSnapshot(input.nativeBudgetState, input.nativeBudget, input.budgetEpoch, nowMs)
    : undefined;

  return Object.freeze({
    conversation,
    operation,
    turnSequence: input.turnSequence,
    userIdleMs,
    userIdleTracked,
    permissionPending: input.permissionPending,
    budgetBlocked: Boolean(input.exhausted),
    ...(input.exhausted ? { budgetExhaustedCode: input.exhausted.code } : {}),
    ...(input.referenceProgress ? { referencePhase: input.referenceProgress.phase } : {}),
    ...(workBudget ? { workBudget } : {}),
  });
}

/** Wrap an async event stream to mark in-flight operation scope for /context. */
export function trackSessionOperation<T>(
  kind: 'turn' | 'compact',
  setInflight: (kind: 'none' | 'turn' | 'compact') => void,
  source: AsyncIterable<T>,
): AsyncIterable<T> {
  return (async function* tracked() {
    setInflight(kind);
    try {
      for await (const item of source) yield item;
    } finally {
      setInflight('none');
    }
  })();
}
