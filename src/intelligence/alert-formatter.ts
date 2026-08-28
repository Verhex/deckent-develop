import type {
  ComparisonReport,
  GapDimension,
} from './comparison.js';
import type { CapabilityEntry, EvidenceRefs } from './types.js';

export interface AlertFormatInput {
  occurredAt: string;
  event: {
    competitor: string;
    eventType: string;
    affectedCapability: string;
  };
  baseline?: CapabilityEntry;
  comparison: ComparisonReport;
  action: string;
}

export type AlertFormatError = {
  code: 'BASELINE_ENTRY_MISSING';
  capability: string;
  message: string;
};

export type AlertFormatResult =
  | {
      ok: true;
      text: string;
      evidenceRefs: EvidenceRefs;
    }
  | { ok: false; error: AlertFormatError };

/**
 * Format an evidence-bound alert without reading the clock or performing I/O.
 * `occurredAt` is supplied by the caller so identical input stays deterministic.
 */
export function formatAlert(input: AlertFormatInput): AlertFormatResult {
  if (input.baseline === undefined) {
    return {
      ok: false,
      error: {
        code: 'BASELINE_ENTRY_MISSING',
        capability: input.event.affectedCapability,
        message: `${input.event.affectedCapability} için baseline girdisi gerekli`,
      },
    };
  }

  const gapDimensions = affectedGapDimensions(input.comparison);
  const evidenceRefs = input.baseline.evidenceRefs;
  const text = [
    `Alarm · Zaman: ${input.occurredAt}`,
    `Ne oldu: ${input.event.eventType}`,
    `Rakip: ${input.event.competitor}`,
    `Yetenek alanı: ${input.event.affectedCapability}`,
    `Deckent statüsü: ${input.baseline.status}`,
    `Göreli sınıf: ${input.comparison.classification}`,
    `Boşluk boyutu: ${gapDimensions.join(', ') || 'NOT_APPLICABLE'}`,
    `Ne yapılabilir: ${input.action}`,
    `evidenceRefs: ${evidenceRefs.join(' | ')}`,
  ].join(' · ');

  return { ok: true, text, evidenceRefs };
}

function affectedGapDimensions(report: ComparisonReport): GapDimension[] {
  return report.dimensions
    .filter((dimension) => dimension.affected)
    .map((dimension) => dimension.dimension);
}
