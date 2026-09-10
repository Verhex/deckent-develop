import { describe, it, expect } from 'vitest';
import {
  buildNativeRuntimeTruth,
  formatNativeRuntimeTruthLines,
  type NativeRuntimeTruthFormatLabels,
} from '../../../src/cli/repl/native-runtime-truth.js';
import type { RequestMeasurementEvent } from '../../../src/agent/events.js';

const labels: NativeRuntimeTruthFormatLabels = {
  sessionSelection: 'session: {provider} · {model}',
  lastMeasuredRequest: 'measured: {purpose} · {admission} · {provider} · {model}',
  inferencePending: 'no measurement',
  sessionUnknown: 'no session',
  modelDefault: 'default',
  comparisonAligned: 'aligned',
  comparisonProviderMismatch: 'provider mismatch',
  comparisonModelMismatch: 'model mismatch',
  comparisonPendingNoMeasurement: 'pending no measurement',
  comparisonPendingNoSelection: 'pending no selection',
  comparisonNotAdmitted: 'not admitted',
  comparisonUnknownDefaultModel: 'unknown default model',
  purposeTurn: 'turn',
  purposeCheckpoint: 'checkpoint',
  purposeReferenceMap: 'ref-map',
  purposeReferenceReduce: 'ref-reduce',
  purposeReferenceInterim: 'ref-interim',
  admitted: 'admitted',
  denied: 'not admitted',
};

function measurement(
  identity: { provider: string; model: string },
  opts?: { admitted?: boolean; purpose?: RequestMeasurementEvent['purpose'] },
): RequestMeasurementEvent {
  const admitted = opts?.admitted ?? true;
  return {
    type: 'request-measurement',
    purpose: opts?.purpose ?? 'turn',
    decision: {
      admitted,
      availableTokens: admitted ? 100_000 : 0,
      measurement: {
        inputTokens: 1,
        quality: 'exact',
        provenance: 'provider-counter',
        requestDigest: 'digest',
        identity: { ...identity, contextWindowTokens: 200_000, contextProvenance: 'model-registry' },
      },
    },
  };
}

describe('buildNativeRuntimeTruth', () => {
  it('pending when no last request exists (never aligned)', () => {
    const truth = buildNativeRuntimeTruth({ provider: 'openai', model: 'a' }, undefined);
    expect(truth.comparison).toBe('pending_no_measurement');
    expect(truth.lastMeasurement).toBeUndefined();
  });

  it('not_admitted when measurement was denied', () => {
    const truth = buildNativeRuntimeTruth(
      { provider: 'openai', model: 'model-a' },
      measurement({ provider: 'openai', model: 'model-a' }, { admitted: false }),
    );
    expect(truth.comparison).toBe('not_admitted_no_compare');
    expect(truth.lastMeasurement?.admitted).toBe(false);
  });

  it('pending_no_selection when REPL selection is missing', () => {
    const truth = buildNativeRuntimeTruth(
      undefined,
      measurement({ provider: 'openai', model: 'model-a' }),
    );
    expect(truth.comparison).toBe('pending_no_selection');
  });

  it('unknown_default_model when session model is provider default', () => {
    const truth = buildNativeRuntimeTruth(
      { provider: 'openai', model: null },
      measurement({ provider: 'openai', model: 'model-a' }),
    );
    expect(truth.comparison).toBe('unknown_default_model');
  });

  it('aligns only when admitted, explicit model, provider and model match', () => {
    const truth = buildNativeRuntimeTruth(
      { provider: 'openai', model: 'model-a' },
      measurement({ provider: 'openai', model: 'model-a' }),
    );
    expect(truth.comparison).toBe('aligned');
  });

  it('detects provider mismatch', () => {
    const truth = buildNativeRuntimeTruth(
      { provider: 'anthropic', model: 'claude' },
      measurement({ provider: 'openai', model: 'model-a' }),
    );
    expect(truth.comparison).toBe('provider_mismatch');
  });

  it('detects model mismatch', () => {
    const truth = buildNativeRuntimeTruth(
      { provider: 'openai', model: 'model-b' },
      measurement({ provider: 'openai', model: 'model-a' }),
    );
    expect(truth.comparison).toBe('model_mismatch');
  });

  it('carries checkpoint purpose on last measurement', () => {
    const truth = buildNativeRuntimeTruth(
      { provider: 'openai', model: 'model-a' },
      measurement({ provider: 'openai', model: 'model-a' }, { purpose: 'checkpoint' }),
    );
    expect(truth.lastMeasurement?.purpose).toBe('checkpoint');
    expect(truth.comparison).toBe('aligned');
  });
});

describe('formatNativeRuntimeTruthLines', () => {
  it('shows pending lines without fabricated inference', () => {
    const truth = buildNativeRuntimeTruth({ provider: 'openai', model: 'a' }, undefined);
    const lines = formatNativeRuntimeTruthLines(truth, labels, 'unknown');
    expect(lines).toContain('no measurement');
    expect(lines).toContain('pending no measurement');
  });

  it('labels denied measurement without match claim', () => {
    const truth = buildNativeRuntimeTruth(
      { provider: 'openai', model: 'model-a' },
      measurement({ provider: 'openai', model: 'model-a' }, { admitted: false }),
    );
    const lines = formatNativeRuntimeTruthLines(truth, labels, 'unknown');
    expect(lines.some((l) => l.includes('not admitted'))).toBe(true);
    expect(lines).toContain('not admitted');
    expect(lines).not.toContain('aligned');
  });
});
