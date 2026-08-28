import type {
  ComparisonReport,
  GapDimension,
  RelativeClassification,
} from './comparison.js';
import type { CapabilityStatus } from './types.js';

export interface SignificanceInput {
  comparison: ComparisonReport;
  previousByDimension: Partial<Record<GapDimension, RelativeClassification>>;
  baselineStatus: CapabilityStatus;
  /** The competitor has just reached a capability Deckent already proved live. */
  dagCatchUp?: boolean;
}

export type SignificanceDecision =
  | { kind: 'material'; changedDimensions: readonly GapDimension[] }
  | {
      kind: 'suppressed';
      reason: 'NO_POSITION_CHANGE' | 'DAG_CATCH_UP';
      changedDimensions: readonly GapDimension[];
    };

/** Admit only relative-position changes; routine DAG catch-up is suppressed. */
export function evaluateSignificance(input: SignificanceInput): SignificanceDecision {
  const changedDimensions = input.comparison.dimensions
    .filter(
      (finding) =>
        finding.affected &&
        input.previousByDimension[finding.dimension] !== finding.classification,
    )
    .map((finding) => finding.dimension);

  if (input.dagCatchUp === true && input.baselineStatus === 'LIVE_PROVEN') {
    return { kind: 'suppressed', reason: 'DAG_CATCH_UP', changedDimensions };
  }
  if (changedDimensions.length === 0) {
    return { kind: 'suppressed', reason: 'NO_POSITION_CHANGE', changedDimensions };
  }
  return { kind: 'material', changedDimensions };
}
