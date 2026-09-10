// ═══ P2 session lifecycle presentation for /context and /status ═══════════════

import type { SessionLifecycleSnapshot } from '../../agent/session-lifecycle-snapshot.js';

export interface SessionLifecyclePresentLabels {
  conversationOpen: string;
  conversationClosed: string;
  operationIdle: string;
  operationTurn: string;
  operationCompact: string;
  operationReference: string;
  operationPermissionWait: string;
  operationBudgetBlocked: string;
  turnSequence: string;
  userIdle: string;
  userIdleUntracked: string;
  permissionPending: string;
  budgetBlocked: string;
  referencePhase: string;
  workBudgetEpoch: string;
  workBudgetWall: string;
  workBudgetRounds: string;
  workBudgetTools: string;
  workBudgetTokens: string;
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (line, [key, value]) => line.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function operationLabel(snapshot: SessionLifecycleSnapshot, labels: SessionLifecyclePresentLabels): string {
  switch (snapshot.operation) {
    case 'turn': return labels.operationTurn;
    case 'compact': return labels.operationCompact;
    case 'reference': return labels.operationReference;
    case 'permission-wait': return labels.operationPermissionWait;
    case 'budget-blocked': return labels.operationBudgetBlocked;
    default: return labels.operationIdle;
  }
}

/** Local-only lines; no provider calls. */
export function formatSessionLifecycleLines(
  snapshot: SessionLifecycleSnapshot | undefined,
  labels: SessionLifecyclePresentLabels,
): string[] {
  if (!snapshot) return [];
  const lines: string[] = [
    snapshot.conversation === 'open' ? labels.conversationOpen : labels.conversationClosed,
    operationLabel(snapshot, labels),
    fill(labels.turnSequence, { sequence: snapshot.turnSequence }),
  ];
  if (!snapshot.userIdleTracked) {
    lines.push(labels.userIdleUntracked);
  } else {
    lines.push(fill(labels.userIdle, { seconds: Math.round((snapshot.userIdleMs ?? 0) / 1000) }));
  }
  if (snapshot.permissionPending) lines.push(labels.permissionPending);
  if (snapshot.budgetBlocked) {
    lines.push(fill(labels.budgetBlocked, { code: snapshot.budgetExhaustedCode ?? 'unknown' }));
  }
  if (snapshot.referencePhase) {
    lines.push(fill(labels.referencePhase, { phase: snapshot.referencePhase }));
  }
  const work = snapshot.workBudget;
  if (work) {
    lines.push(fill(labels.workBudgetEpoch, { epoch: work.budgetEpoch }));
    lines.push(fill(labels.workBudgetWall, {
      elapsed: Math.round(work.elapsedWorkMs / 1000),
      limit: Math.round(work.maxWallTimeMs / 1000),
    }));
    lines.push(fill(labels.workBudgetRounds, { used: work.rounds, limit: work.maxModelRounds }));
    lines.push(fill(labels.workBudgetTools, { used: work.toolCalls, limit: work.maxToolCalls }));
    lines.push(fill(labels.workBudgetTokens, { used: work.cumulativeTokens, limit: work.maxCumulativeTokens }));
  }
  return lines;
}
