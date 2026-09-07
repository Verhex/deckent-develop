// ═══ Native request measurement presentation — L4-E ═══════════════════════
//
// This module deliberately knows only the privacy-safe admission snapshot. It
// neither measures a transcript nor infers that an admitted request was sent:
// the bridge receives the event emitted immediately before transport admission.

import type { RequestMeasurementEvent } from '../../agent/events.js';
import { formatSessionIdForTerminal } from './status-row.js';

export interface NativeRequestMetricLabels {
  lastRequest: string;
  purposeTurn: string;
  purposeCheckpoint: string;
  admitted: string;
  denied: string;
  providerModel: string;
  measurement: string;
  qualityExact: string;
  qualityUpperBound: string;
  capacity: string;
  provenance: string;
  digest: string;
  reportedUsage: string;
  requestUnavailable: string;
}

export interface ProviderReportedUsage {
  inputTokens: number;
  outputTokens: number;
  reports: number;
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (line, [key, value]) => line.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function purposeLabel(event: RequestMeasurementEvent, labels: NativeRequestMetricLabels): string {
  return event.purpose === 'checkpoint' ? labels.purposeCheckpoint : labels.purposeTurn;
}

function decisionLabel(event: RequestMeasurementEvent, labels: NativeRequestMetricLabels): string {
  return event.decision.admitted ? labels.admitted : labels.denied;
}

function qualityLabel(event: RequestMeasurementEvent, labels: NativeRequestMetricLabels): string {
  return event.decision.measurement.quality === 'exact' ? labels.qualityExact : labels.qualityUpperBound;
}

const terminalSafe = (value: string): string => formatSessionIdForTerminal(value);

/** One narrow, last-request-only anchor. It never calls a provider or reports
 * current occupancy; an admission decision means only that admission decided. */
export function formatNativeRequestMetricSummary(
  event: RequestMeasurementEvent | undefined,
  labels: NativeRequestMetricLabels,
): string {
  if (!event) return labels.requestUnavailable;
  return fill(labels.lastRequest, {
    purpose: purposeLabel(event, labels),
    decision: decisionLabel(event, labels),
    tokens: event.decision.measurement.inputTokens,
    quality: qualityLabel(event, labels),
    percent: Math.round((event.decision.measurement.inputTokens / event.decision.measurement.identity.contextWindowTokens) * 100),
  });
}

/** Full disclosure for `/context` and `/status`; no request body crosses this
 * boundary. Provider-reported usage intentionally remains separate from the
 * admission measurement because reports can cover multiple provider rounds. */
export function formatNativeRequestMetricDetail(input: {
  event: RequestMeasurementEvent | undefined;
  providerReportedUsage?: ProviderReportedUsage;
  labels: NativeRequestMetricLabels;
}): string[] {
  const { event, providerReportedUsage, labels } = input;
  if (!event) {
    return [
      labels.requestUnavailable,
      ...(providerReportedUsage ? [fill(labels.reportedUsage, {
        input: providerReportedUsage.inputTokens,
        output: providerReportedUsage.outputTokens,
        reports: providerReportedUsage.reports,
      })] : []),
    ];
  }
  const { decision } = event;
  const { measurement } = decision;
  const lines = [
    formatNativeRequestMetricSummary(event, labels),
    fill(labels.providerModel, { provider: terminalSafe(measurement.identity.provider), model: terminalSafe(measurement.identity.model) }),
    fill(labels.measurement, { tokens: measurement.inputTokens, quality: qualityLabel(event, labels) }),
    fill(labels.capacity, { available: decision.availableTokens, window: measurement.identity.contextWindowTokens }),
    fill(labels.provenance, { provenance: terminalSafe(measurement.provenance) }),
    fill(labels.digest, { digest: terminalSafe(measurement.requestDigest) }),
  ];
  if (providerReportedUsage) {
    lines.push(fill(labels.reportedUsage, {
      input: providerReportedUsage.inputTokens,
      output: providerReportedUsage.outputTokens,
      reports: providerReportedUsage.reports,
    }));
  }
  return lines;
}
