import { describe, expect, it, vi } from 'vitest';
import {
  conservativeRequestTokenUpperBound,
  decideProviderAdmission,
  estimateTokens,
  measureProviderRequest,
} from '../../src/agent/context-budget.js';
import {
  InputContextOverflowError,
  withMeasuredAdmission,
} from '../../src/cli/repl/native-transport.js';
import type {
  ProviderAdapter,
  ProviderContextIdentity,
  ProviderEvent,
  ProviderRequest,
  ProviderRequestMeasurementCapability,
} from '../../src/agent/provider-tooluse/types.js';

const identity: ProviderContextIdentity = {
  provider: 'local-llm',
  model: 'incident-model',
  contextWindowTokens: 131_072,
  contextProvenance: 'server-reported',
};

function incidentRequest(): ProviderRequest {
  return {
    system: 'system',
    model: identity.model,
    messages: [{ role: 'user', content: 'x'.repeat(504_000) }],
    tools: [{
      name: 'write', description: 'write a file', input_schema: { type: 'object' },
    } as ProviderRequest['tools'][number]],
  };
}

async function drain(iterable: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe('provider-neutral request measurement authority', () => {
  it('uses the exact counter for the incident-shaped 222K request and never dispatches it', async () => {
    const request = incidentRequest();
    expect(estimateTokens(JSON.stringify(request))).toBeLessThan(127_000);
    const capability: ProviderRequestMeasurementCapability = {
      measure: vi.fn(async () => ({ inputTokens: 222_682, provenance: 'incident-exact-counter' })),
    };
    const sent = vi.fn();
    const underlying: ProviderAdapter = {
      name: 'underlying',
      async *send(req) { sent(req); yield { type: 'done' }; },
    };
    const guarded = withMeasuredAdmission({ adapter: underlying, identity, capability, outputReserveTokens: 4_096 });

    const iterator = guarded.send(request)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({
      type: 'request-measurement',
      decision: { admitted: false, measurement: { inputTokens: 222_682, quality: 'exact' } },
    });
    expect(Object.isFrozen(first.value)).toBe(true);
    const frozenDecision = (first.value as {
      decision: { measurement: { identity: object } };
    }).decision;
    expect(Object.isFrozen(frozenDecision)).toBe(true);
    expect(Object.isFrozen(frozenDecision.measurement)).toBe(true);
    expect(Object.isFrozen(frozenDecision.measurement.identity)).toBe(true);
    await expect(iterator.next()).rejects.toMatchObject({
      name: 'InputContextOverflowError', code: 'INPUT_CONTEXT_OVERFLOW',
    } satisfies Partial<InputContextOverflowError>);
    expect(capability.measure).toHaveBeenCalledOnce();
    expect(sent).not.toHaveBeenCalled();
  });

  it('emits one immutable admitted decision before dispatch without recounting', async () => {
    const request: ProviderRequest = {
      system: 'full system', model: identity.model,
      messages: [{ role: 'user', content: 'hello' }], tools: [],
    };
    const capability: ProviderRequestMeasurementCapability = {
      measure: vi.fn(async () => ({ inputTokens: 42, provenance: 'exact-fixture' })),
    };
    const sent = vi.fn();
    const underlying: ProviderAdapter = {
      name: 'underlying',
      async *send() { sent(); yield { type: 'done' }; },
    };
    const iterator = withMeasuredAdmission({ adapter: underlying, identity, capability }).send(request)[Symbol.asyncIterator]();
    const measurement = await iterator.next();
    expect(measurement.value).toMatchObject({
      type: 'request-measurement',
      decision: { admitted: true, availableTokens: identity.contextWindowTokens },
    });
    expect(sent).not.toHaveBeenCalled();
    const done = await iterator.next();
    expect(done.value).toEqual({ type: 'done' });
    expect(sent).toHaveBeenCalledOnce();
    expect(capability.measure).toHaveBeenCalledOnce();
  });

  it('labels a missing exact capability only as a proven conservative upper bound', async () => {
    const request: ProviderRequest = {
      system: 's', model: identity.model, messages: [{ role: 'user', content: 'hello' }], tools: [],
    };
    const measurement = await measureProviderRequest({ request, identity });
    expect(measurement).toMatchObject({
      quality: 'conservative-upper-bound', provenance: 'utf8-wire-bytes-plus-framing', identity,
    });
    expect(measurement.inputTokens).toBe(conservativeRequestTokenUpperBound(request));
    expect(measurement.inputTokens).toBeGreaterThan(estimateTokens(JSON.stringify(request)));
    expect(decideProviderAdmission(measurement, 128, 64).admitted).toBe(true);
  });

  it('bounds a stalled exact counter, caches the conservative result, and never relabels it exact', async () => {
    const request: ProviderRequest = {
      system: 'timeout-case', model: identity.model, messages: [], tools: [],
    };
    const capability: ProviderRequestMeasurementCapability = {
      measure: vi.fn((_req, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })),
    };
    const first = await measureProviderRequest({ request, identity, capability, timeoutMs: 5 });
    const second = await measureProviderRequest({ request, identity, capability, timeoutMs: 5 });
    expect(first.quality).toBe('conservative-upper-bound');
    expect(second).toEqual(first);
    expect(capability.measure).toHaveBeenCalledOnce();
  });
});
