import type { CapabilityStatus, EvidenceRefs } from './types.js';

export const RELATIVE_CLASSIFICATIONS = [
  'AHEAD',
  'PARITY',
  'BEHIND',
  'DIFFERENT_APPROACH',
  'NOT_APPLICABLE',
] as const;

export type RelativeClassification =
  (typeof RELATIVE_CLASSIFICATIONS)[number];

export const GAP_DIMENSIONS = [
  'capability',
  'evidence-depth',
  'distribution',
  'enterprise-economics',
  'protocol/interop',
  'ecosystem',
  'operability',
  'trust',
] as const;

export type GapDimension = (typeof GAP_DIMENSIONS)[number];

export interface DimensionSignal {
  classification: RelativeClassification;
  implication: string;
}

export interface ComparisonInput {
  signalId: string;
  baselineStatus: CapabilityStatus;
  competitorStatus: CapabilityStatus;
  evidenceRefs: EvidenceRefs;
  /** Use for dimensions whose approaches cannot honestly be maturity-ranked. */
  differentApproach?: boolean;
  /** Use when the signal has no meaningful Deckent counterpart. */
  applicable?: boolean;
  dimensions: Partial<Record<GapDimension, string>>;
}

export interface DimensionComparison {
  dimension: GapDimension;
  classification: RelativeClassification;
  implication: string | null;
  affected: boolean;
}

export interface ComparisonReport {
  signalId: string;
  classification: RelativeClassification;
  evidenceRefs: EvidenceRefs;
  dimensions: readonly DimensionComparison[];
}

const STATUS_RANK: Record<CapabilityStatus, number> = {
  DEAD_LEGACY: 0,
  ROADMAP: 1,
  DORMANT_DEFAULT_OFF: 2,
  WIRED_UNPROVEN: 3,
  HOLD: 3,
  LIVE_PARTIAL: 4,
  LIVE_PROVEN: 5,
};

export function classifyRelativePosition(
  baselineStatus: CapabilityStatus,
  competitorStatus: CapabilityStatus,
  options: { applicable?: boolean; differentApproach?: boolean } = {},
): RelativeClassification {
  if (options.applicable === false) return 'NOT_APPLICABLE';
  if (options.differentApproach === true) return 'DIFFERENT_APPROACH';
  const baselineRank = STATUS_RANK[baselineStatus];
  const competitorRank = STATUS_RANK[competitorStatus];
  if (baselineRank > competitorRank) return 'AHEAD';
  if (baselineRank < competitorRank) return 'BEHIND';
  return 'PARITY';
}

/** Build a report with one record for every dimension; no aggregate score exists. */
export function compareSignal(input: ComparisonInput): ComparisonReport {
  const classification = classifyRelativePosition(
    input.baselineStatus,
    input.competitorStatus,
    input,
  );
  return {
    signalId: input.signalId,
    classification,
    evidenceRefs: input.evidenceRefs,
    dimensions: GAP_DIMENSIONS.map((dimension) => {
      const implication = input.dimensions[dimension];
      return {
        dimension,
        classification:
          implication === undefined ? 'NOT_APPLICABLE' : classification,
        implication: implication ?? null,
        affected: implication !== undefined,
      };
    }),
  };
}
