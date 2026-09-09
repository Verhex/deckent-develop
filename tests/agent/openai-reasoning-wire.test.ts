// tests/agent/openai-reasoning-wire.test.ts
// ═══ 7108 — the OpenAI-compatible transport maps the reasoning directive onto
// the wire mechanism its descriptor names, and NOTHING else. Hermetic: an
// injected fetch captures the exact JSON body.
import { describe, expect, it } from 'vitest';
import { createOpenAIAdapter, mapReasoningDirectiveToWire } from '../../src/agent/provider-tooluse/openai.js';
import type { ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { ReasoningControlDescriptor } from '../../src/core/model-registry-types.js';
import { UNKNOWN_REASONING_CONTROL } from '../../src/core/reasoning-control.js';

const ENABLE_THINKING: ReasoningControlDescriptor = {
  toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'server-reported',
};
const EFFORT: ReasoningControlDescriptor = {
  toggle: { kind: 'reasoning_effort', on: 'high', off: 'minimal' }, sharesCompletionBudget: true, provenance: 'configured',
};
const NONE: ReasoningControlDescriptor = { toggle: { kind: 'none' }, sharesCompletionBudget: true, provenance: 'server-reported' };

const BASE: ProviderRequest = { system: 'sys', model: 'wire-model', messages: [{ role: 'user', content: 'go' }], tools: [] };
const SSE = 'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';

function capturing(sink: Record<string, unknown>[]): typeof fetch {
  return (async (_url: unknown, init: { body: string }) => {
    sink.push(JSON.parse(init.body) as Record<string, unknown>);
    return { ok: true, status: 200, body: (async function* () { yield new TextEncoder().encode(SSE); })() };
  }) as unknown as typeof fetch;
}

async function wire(req: ProviderRequest, descriptor: ReasoningControlDescriptor | undefined): Promise<Record<string, unknown>> {
  const bodies: Record<string, unknown>[] = [];
  const adapter = createOpenAIAdapter({
    baseUrl: 'http://x/v1', fetchImpl: capturing(bodies),
    ...(descriptor ? { reasoningControl: async () => descriptor } : {}),
  });
  for await (const _ of adapter.send(req)) { /* drain */ }
  return bodies[0]!;
}

describe('mapReasoningDirectiveToWire (pure)', () => {
  it('enable_thinking descriptor: off → chat_template_kwargs.enable_thinking=false, on → true (existing kwargs preserved)', () => {
    expect(mapReasoningDirectiveToWire({ mode: 'off' }, ENABLE_THINKING, {})).toEqual({ chat_template_kwargs: { enable_thinking: false } });
    expect(mapReasoningDirectiveToWire({ mode: 'on', budgetTokens: 8 }, ENABLE_THINKING, { chat_template_kwargs: { keep: 1 } }))
      .toEqual({ chat_template_kwargs: { keep: 1, enable_thinking: true } });
  });
  it('reasoning_effort descriptor: values come from the descriptor data, never from code', () => {
    expect(mapReasoningDirectiveToWire({ mode: 'off' }, EFFORT, {})).toEqual({ reasoning_effort: 'minimal' });
    expect(mapReasoningDirectiveToWire({ mode: 'on' }, EFFORT, {})).toEqual({ reasoning_effort: 'high' });
  });
  it('none / unknown descriptor or no directive: nothing is invented on the wire', () => {
    expect(mapReasoningDirectiveToWire({ mode: 'off' }, NONE, {})).toEqual({});
    expect(mapReasoningDirectiveToWire({ mode: 'off' }, UNKNOWN_REASONING_CONTROL, {})).toEqual({});
    expect(mapReasoningDirectiveToWire(undefined, ENABLE_THINKING, {})).toEqual({});
    expect(mapReasoningDirectiveToWire({ mode: 'on' }, undefined, {})).toEqual({});
  });
});

describe('createOpenAIAdapter — reasoning directive on the wire', () => {
  it('structured request (reasoning off) wires enable_thinking:false for a template-toggle descriptor', async () => {
    const body = await wire({ ...BASE, reasoning: { mode: 'off' }, outputCeilingTokens: 4_096 }, ENABLE_THINKING);
    expect(body['chat_template_kwargs']).toEqual({ enable_thinking: false });
    expect(body['max_tokens']).toBe(4_096);
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('thinking on: enable_thinking:true and max_tokens is the caller\'s INCLUSIVE ceiling (visible + reasoning budget)', async () => {
    const inclusive = 4_096 + 8_192;
    const body = await wire({ ...BASE, reasoning: { mode: 'on', budgetTokens: 8_192 }, outputCeilingTokens: inclusive }, ENABLE_THINKING);
    expect(body['chat_template_kwargs']).toEqual({ enable_thinking: true });
    expect(body['max_tokens']).toBe(inclusive);
  });

  it('reasoning_effort descriptor maps off/on to the descriptor\'s own enum values', async () => {
    expect((await wire({ ...BASE, reasoning: { mode: 'off' } }, EFFORT))['reasoning_effort']).toBe('minimal');
    expect((await wire({ ...BASE, reasoning: { mode: 'on' } }, EFFORT))['reasoning_effort']).toBe('high');
  });

  it('no descriptor / unknown descriptor: the directive is an honest no-op on the wire', async () => {
    for (const descriptor of [undefined, UNKNOWN_REASONING_CONTROL, NONE]) {
      const body = await wire({ ...BASE, reasoning: { mode: 'off' } }, descriptor);
      expect(body).not.toHaveProperty('chat_template_kwargs');
      expect(body).not.toHaveProperty('reasoning_effort');
    }
  });

  it('exposes the descriptor capability on the adapter so the loop reads the SAME authority', async () => {
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', reasoningControl: () => EFFORT });
    expect(await adapter.reasoningControl?.('wire-model')).toBe(EFFORT);
    expect(createOpenAIAdapter({ baseUrl: 'http://x/v1' }).reasoningControl).toBeUndefined();
  });

  it('a throwing descriptor resolver degrades to no-op mapping, never a failed request', async () => {
    const bodies: Record<string, unknown>[] = [];
    const adapter = createOpenAIAdapter({
      baseUrl: 'http://x/v1', fetchImpl: capturing(bodies), reasoningControl: () => { throw new Error('probe down'); },
    });
    for await (const _ of adapter.send({ ...BASE, reasoning: { mode: 'off' } })) { /* drain */ }
    expect(bodies[0]).not.toHaveProperty('chat_template_kwargs');
  });
});
