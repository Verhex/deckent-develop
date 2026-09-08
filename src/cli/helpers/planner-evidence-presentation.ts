import { resolvePlannerEvidenceRefusal } from '../../core/planner-evidence-refusal.js';

export type PlannerEvidenceTranslator = (key: string) => string;

export function formatPlannerEvidenceRefusal(
  error: unknown,
  t: PlannerEvidenceTranslator,
): string | null {
  const refusal = resolvePlannerEvidenceRefusal(error);
  if (!refusal) return null;

  const messageKey = refusal.kind === 'hold'
    ? 'planner_evidence.refusal.hold'
    : 'planner_evidence.refusal.replan_required';
  const actionKey = refusal.nextAction === 'inspect-evidence'
    ? 'planner_evidence.next.inspect_evidence'
    : 'planner_evidence.next.replan';

  return `${t(messageKey)} [${refusal.code}] ${t(actionKey)}`;
}
