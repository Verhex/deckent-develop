import { describe, expect, it } from 'vitest';
import type { RequestMeasurementEvent } from '../../../src/agent/events.js';
import {
  formatNativeRequestMetricDetail,
  formatNativeRequestMetricSummary,
  type NativeRequestMetricLabels,
} from '../../../src/cli/repl/native-request-metrics.js';

const labels: NativeRequestMetricLabels = {
  lastRequest: 'last {purpose} {decision} {tokens} {percent} {quality}',
  purposeTurn: 'turn', purposeCheckpoint: 'checkpoint', admitted: 'admitted', denied: 'denied',
  providerModel: 'provider {provider} model {model}', measurement: 'measurement {tokens} {quality}',
  qualityExact: 'exact', qualityUpperBound: 'upper', capacity: 'capacity {available}/{window}',
  provenance: 'source {provenance}', digest: 'digest {digest}',
  reportedUsage: 'reports {input}/{output}/{reports}', requestUnavailable: 'last unknown',
};

const admitted: RequestMeasurementEvent = {
  type: 'request-measurement', purpose: 'turn',
  decision: {
    admitted: true, availableTokens: 800,
    measurement: {
      inputTokens: 200, quality: 'exact', provenance: 'provider-counter', requestDigest: 'digest-1',
      identity: { provider: 'openai', model: 'gpt-test', contextWindowTokens: 1000, contextProvenance: 'model-registry' },
    },
  },
};

describe('native request metric presentation', () => {
  it('renders an actual admitted request without inferring transport success or current occupancy', () => {
    const detail = formatNativeRequestMetricDetail({ event: admitted, labels }).join('\n');
    expect(formatNativeRequestMetricSummary(admitted, labels)).toBe('last turn admitted 200 20 exact');
    expect(detail).toContain('provider openai model gpt-test');
    expect(detail).toContain('capacity 800/1000');
    expect(detail).toContain('digest digest-1');
    expect(detail).not.toMatch(/sent|current|%/i);
  });

  it('keeps a denied checkpoint and provider reports separate from admission measurement', () => {
    const denied: RequestMeasurementEvent = {
      ...admitted,
      purpose: 'checkpoint',
      decision: { ...admitted.decision, admitted: false, code: 'INPUT_CONTEXT_OVERFLOW' },
    } as RequestMeasurementEvent;
    const detail = formatNativeRequestMetricDetail({
      event: denied,
      providerReportedUsage: { inputTokens: 9, outputTokens: 4, reports: 2 },
      labels,
    }).join('\n');
    expect(detail).toContain('last checkpoint denied 200 20 exact');
    expect(detail).toContain('reports 9/4/2');
  });

  it('uses the catalog-provided unknown state when no actual request exists', () => {
    expect(formatNativeRequestMetricSummary(undefined, labels)).toBe('last unknown');
    expect(formatNativeRequestMetricDetail({ event: undefined, labels })).toEqual(['last unknown']);
  });

  it('discloses known provider reports even when no request measurement exists', () => {
    expect(formatNativeRequestMetricDetail({
      event: undefined,
      providerReportedUsage: { inputTokens: 3, outputTokens: 1, reports: 1 },
      labels,
    })).toEqual(['last unknown', 'reports 3/1/1']);
  });

  it('escapes terminal controls in dynamic identity and provenance fields', () => {
    const detail = formatNativeRequestMetricDetail({
      event: {
        ...admitted,
        decision: {
          ...admitted.decision,
          measurement: {
            ...admitted.decision.measurement,
            provenance: 'wire\u001b[2J',
            identity: { ...admitted.decision.measurement.identity, provider: 'p\u202e', model: 'm\u009b' },
          },
        },
      },
      labels,
    }).join('\n');
    expect(detail).toContain('p\\u202e');
    expect(detail).toContain('m\\u009b');
    expect(detail).toContain('wire\\u001b[2J');
  });
});
