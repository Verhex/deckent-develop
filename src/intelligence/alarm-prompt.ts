import type { ComparisonReport } from './comparison.js';

/**
 * Produce analyzer instructions without invented confidence, scores, or percentages.
 * Evidence references remain verbatim so every conclusion stays traceable.
 */
export function buildAlarmAnalyzerPrompt(report: ComparisonReport): string {
  const findings = report.dimensions
    .filter((finding) => finding.affected)
    .map(
      (finding) =>
        `- ${finding.dimension}: ${finding.classification}; implication: ${finding.implication}`,
    )
    .join('\n');
  const evidence = report.evidenceRefs.map((ref) => `- ${ref}`).join('\n');

  return [
    'Analyze this competitor signal against the Deckent baseline.',
    'Use only the supplied typed relative classes and cited evidence.',
    'Do not invent quantitative ratings, confidence values, or percentages.',
    `Overall relative class: ${report.classification}`,
    'Dimension findings:',
    findings || '- none',
    'Evidence references:',
    evidence,
  ].join('\n');
}
