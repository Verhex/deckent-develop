// ═══ Native runtime truth — P1 measurement vs REPL selection (read-only) ═══════
//
// Compares status-bar selection with the cached last *request measurement*
// (admission boundary snapshot). That event is not dispatch/response proof of
// served inference; denied measurements are labeled honestly.

import type { RequestMeasurementEvent } from '../../agent/events.js';
import type { ActiveSelection } from './provider-switch.js';
import { formatSessionIdForTerminal } from './status-row.js';

export type RuntimeTruthComparison =
  | 'pending_no_measurement'
  | 'pending_no_selection'
  | 'not_admitted_no_compare'
  | 'unknown_default_model'
  | 'aligned'
  | 'provider_mismatch'
  | 'model_mismatch';

export interface NativeRuntimeTruthSnapshot {
  readonly sessionProvider: string | undefined;
  readonly sessionModel: string | null | undefined;
  readonly lastMeasurement?: {
    readonly purpose: RequestMeasurementEvent['purpose'];
    readonly admitted: boolean;
    readonly provider: string;
    readonly model: string;
  };
  readonly comparison: RuntimeTruthComparison;
}

export interface NativeRuntimeTruthLabels {
  sessionSelection: string;
  lastMeasuredRequest: string;
  inferencePending: string;
  sessionUnknown: string;
  modelDefault: string;
  comparisonAligned: string;
  comparisonProviderMismatch: string;
  comparisonModelMismatch: string;
  comparisonPendingNoMeasurement: string;
  comparisonPendingNoSelection: string;
  comparisonNotAdmitted: string;
  comparisonUnknownDefaultModel: string;
}

export interface NativeRuntimeTruthFormatLabels extends NativeRuntimeTruthLabels {
  purposeTurn: string;
  purposeCheckpoint: string;
  purposeReferenceMap: string;
  purposeReferenceReduce: string;
  purposeReferenceInterim: string;
  admitted: string;
  denied: string;
}

function normalizeProvider(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeModel(value: string): string {
  return value.trim();
}

const terminalSafe = (value: string): string => formatSessionIdForTerminal(value);

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (line, [key, value]) => line.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function purposeLabel(
  purpose: RequestMeasurementEvent['purpose'],
  labels: NativeRuntimeTruthFormatLabels,
): string {
  switch (purpose) {
    case 'checkpoint': return labels.purposeCheckpoint;
    case 'reference-map': return labels.purposeReferenceMap;
    case 'reference-reduce': return labels.purposeReferenceReduce;
    case 'reference-interim': return labels.purposeReferenceInterim;
    default: return labels.purposeTurn;
  }
}

function admissionLabel(admitted: boolean, labels: NativeRuntimeTruthFormatLabels): string {
  return admitted ? labels.admitted : labels.denied;
}

/** Compare REPL picker selection with the cached last-request measurement. */
export function buildNativeRuntimeTruth(
  selection: ActiveSelection | undefined,
  lastRequest: RequestMeasurementEvent | undefined,
): NativeRuntimeTruthSnapshot {
  const sessionProvider = selection?.provider;
  const sessionModel = selection?.model;

  if (!lastRequest) {
    return {
      sessionProvider,
      sessionModel,
      comparison: 'pending_no_measurement',
    };
  }

  const { decision, purpose } = lastRequest;
  const { measurement } = decision;
  const lastMeasurement = {
    purpose,
    admitted: decision.admitted,
    provider: measurement.identity.provider,
    model: measurement.identity.model,
  };

  if (!decision.admitted) {
    return {
      sessionProvider,
      sessionModel,
      lastMeasurement,
      comparison: 'not_admitted_no_compare',
    };
  }

  if (!sessionProvider) {
    return {
      sessionProvider,
      sessionModel,
      lastMeasurement,
      comparison: 'pending_no_selection',
    };
  }

  if (sessionModel === null || sessionModel === undefined || sessionModel === '') {
    return {
      sessionProvider,
      sessionModel,
      lastMeasurement,
      comparison: 'unknown_default_model',
    };
  }

  const measuredProvider = measurement.identity.provider;
  const measuredModel = measurement.identity.model;

  if (normalizeProvider(sessionProvider) !== normalizeProvider(measuredProvider)) {
    return {
      sessionProvider,
      sessionModel,
      lastMeasurement,
      comparison: 'provider_mismatch',
    };
  }

  if (normalizeModel(sessionModel) !== normalizeModel(measuredModel)) {
    return {
      sessionProvider,
      sessionModel,
      lastMeasurement,
      comparison: 'model_mismatch',
    };
  }

  return {
    sessionProvider,
    sessionModel,
    lastMeasurement,
    comparison: 'aligned',
  };
}

function sessionModelLabel(
  model: string | null | undefined,
  labels: NativeRuntimeTruthLabels,
  unknown: string,
): string {
  if (model === null) return labels.modelDefault;
  if (model === undefined || model === '') return unknown;
  return terminalSafe(model);
}

/** Lines for `/context` — no provider calls. */
export function formatNativeRuntimeTruthLines(
  truth: NativeRuntimeTruthSnapshot,
  labels: NativeRuntimeTruthFormatLabels,
  unknown: string,
): string[] {
  const sessionProvider = truth.sessionProvider ? terminalSafe(truth.sessionProvider) : labels.sessionUnknown;
  const sessionModel = sessionModelLabel(truth.sessionModel, labels, unknown);
  const lines = [
    fill(labels.sessionSelection, { provider: sessionProvider, model: sessionModel }),
  ];

  if (truth.comparison === 'pending_no_measurement') {
    lines.push(labels.inferencePending);
    lines.push(labels.comparisonPendingNoMeasurement);
    return lines;
  }

  const m = truth.lastMeasurement!;
  lines.push(fill(labels.lastMeasuredRequest, {
    purpose: purposeLabel(m.purpose, labels),
    admission: admissionLabel(m.admitted, labels),
    provider: terminalSafe(m.provider),
    model: terminalSafe(m.model),
  }));

  switch (truth.comparison) {
    case 'not_admitted_no_compare':
      lines.push(labels.comparisonNotAdmitted);
      break;
    case 'pending_no_selection':
      lines.push(labels.comparisonPendingNoSelection);
      break;
    case 'unknown_default_model':
      lines.push(labels.comparisonUnknownDefaultModel);
      break;
    case 'aligned':
      lines.push(labels.comparisonAligned);
      break;
    case 'provider_mismatch':
      lines.push(labels.comparisonProviderMismatch);
      break;
    case 'model_mismatch':
      lines.push(labels.comparisonModelMismatch);
      break;
    default:
      break;
  }

  return lines;
}
