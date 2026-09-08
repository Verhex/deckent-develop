export type PlannerEvidenceRefusalCode =
  | 'PLANNER_EVIDENCE_HOLD'
  | 'PLANNER_EVIDENCE_REPLAN_REQUIRED'
  | 'EXACT_START_PLANNER_EVIDENCE_HOLD'
  | 'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED';

export type PlannerEvidenceRefusal =
  | Readonly<{
      code: 'PLANNER_EVIDENCE_HOLD' | 'EXACT_START_PLANNER_EVIDENCE_HOLD';
      kind: 'hold';
      nextAction: 'inspect-evidence';
    }>
  | Readonly<{
      code: 'PLANNER_EVIDENCE_REPLAN_REQUIRED' | 'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED';
      kind: 'replan-required';
      nextAction: 'replan';
    }>;

const REFUSALS: Readonly<Record<PlannerEvidenceRefusalCode, PlannerEvidenceRefusal>> = Object.freeze({
  PLANNER_EVIDENCE_HOLD: Object.freeze({
    code: 'PLANNER_EVIDENCE_HOLD',
    kind: 'hold',
    nextAction: 'inspect-evidence',
  }),
  PLANNER_EVIDENCE_REPLAN_REQUIRED: Object.freeze({
    code: 'PLANNER_EVIDENCE_REPLAN_REQUIRED',
    kind: 'replan-required',
    nextAction: 'replan',
  }),
  EXACT_START_PLANNER_EVIDENCE_HOLD: Object.freeze({
    code: 'EXACT_START_PLANNER_EVIDENCE_HOLD',
    kind: 'hold',
    nextAction: 'inspect-evidence',
  }),
  EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED: Object.freeze({
    code: 'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED',
    kind: 'replan-required',
    nextAction: 'replan',
  }),
});

export function resolvePlannerEvidenceRefusal(error: unknown): PlannerEvidenceRefusal | null {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) return null;

  const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') return null;

  if (!Object.hasOwn(REFUSALS, descriptor.value)) return null;
  return REFUSALS[descriptor.value as PlannerEvidenceRefusalCode];
}
