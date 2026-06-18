import type { DocState, DocStatus, DocSignals, DocTrackingConfig } from './types.js';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ageThresholdDays(rank: number): number {
  return clamp(Math.round(30 + rank * 1.5), 14, 365);
}

export function scoreDoc(
  input: { doc_rank: number; status: DocStatus; signals: DocSignals },
  config: DocTrackingConfig,
): { stale_score: number; priority_score: number; state: DocState } {
  const { doc_rank, status, signals } = input;
  const { weights, criticalAt, staleAt, maxRank } = config.scoring;

  if (status === 'draft' || status === 'temp' || status === 'frozen' || status === 'superseded') {
    return { stale_score: 0, priority_score: 0, state: 'EXEMPT' };
  }

  const threshold = ageThresholdDays(doc_rank);
  const ageComponent = clamp(signals.age_days / threshold, 0, 1) * weights.ageMax;
  const stale_score = clamp(
    (signals.content_drift ? weights.content : 0) +
    (signals.code_drift === true ? weights.code : 0) +
    ageComponent, 0, 100,
  );
  const rankWeight = 1 + (maxRank - Math.min(doc_rank, maxRank)) / maxRank;
  const priority_score = clamp(stale_score * rankWeight, 0, 100);

  let state: DocState;
  if (stale_score === 0) state = 'FRESH';
  else if (priority_score >= criticalAt) state = 'CRITICAL_STALE';
  else if (priority_score >= staleAt || signals.age_days > threshold) state = 'STALE';
  else state = 'DRIFT';

  return { stale_score, priority_score, state };
}
