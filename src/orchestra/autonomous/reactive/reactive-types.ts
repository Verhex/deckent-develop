// src/orchestra/autonomous/reactive/reactive-types.ts
// Reactive event + declarative map types. Mirrors the fields a nervous
// DetectorResult actually carries (risk/severity/groupKey/metadata — no detector-type).
import type { RiskLevel, Severity } from '../../../core/nervous-types.js';
import type { BacklogKind, BacklogPolicy } from '../backlog-types.js';

/** A reactive signal normalized from a source (nervous detection today). */
export interface ReactiveEvent {
  sourceType: 'nervous';
  risk: RiskLevel;
  severity?: Severity;
  groupKey?: string;
  metadata?: Record<string, unknown>;
}

/** Backlog-entry template a matched rule instantiates. */
export interface EntryTemplate {
  kind: BacklogKind;
  policy: BacklogPolicy;
  spec: { description?: string; directivesRef?: string; scopeDir?: string };
  provider?: string;
  model?: string;
  titlePrefix?: string;
}

export interface ReactiveRule {
  match: { groupKey?: string; minRisk?: RiskLevel; minSeverity?: Severity };
  entryTemplate: EntryTemplate;
  dedupKey?: string;
}

export interface ReactiveMapFile {
  _version: string;
  rules: ReactiveRule[];
}

const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2, emergency: 3 };

export function riskAtLeast(actual: RiskLevel, min: RiskLevel): boolean {
  return RISK_RANK[actual] >= RISK_RANK[min];
}
export function severityAtLeast(actual: Severity | undefined, min: Severity): boolean {
  return actual !== undefined && SEVERITY_RANK[actual] >= SEVERITY_RANK[min];
}
