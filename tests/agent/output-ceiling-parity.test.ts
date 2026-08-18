// tests/agent/output-ceiling-parity.test.ts
// ═══ RCA §2 — dynamic output ceiling + transport parity ══════════════════════
// `outputReserveTokens` is the PROTECTED MINIMUM answer room, never the wire
// ceiling. These tests pin three things:
//   1. the normalized resolution ladder (request > configured > unresolved),
//   2. that BOTH transports wire the SAME ceiling for the same request, and
//   3. that the constant 4,096 no longer lives as a wire ceiling on any path —
//      the incident shape (93.5K input in a 200K context) must reach the wire
//      with a ceiling far greater than 4,096.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  createOpenAIAdapter,
  resolveWireOutputCeiling,
  type OpenAIAdapterOptions,
} from '../../src/agent/provider-tooluse/openai.js';
import {
  createAnthropicAdapter,
  type AnthropicAdapterOptions,
} from '../../src/agent/provider-tooluse/anthropic.js';
import type { ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

/** The 2026 incident turn: a large transcript that still had tens of thousands
 *  of tokens of generation room, cut at the protected minimum instead. */
const INCIDENT = {
  measuredInputTokens: 93_500,
  contextWindowTokens: 200_000,
  contextSafetyReserveTokens: 8_000,
  /** The reserve the prompt budget protects — NOT a ceiling. */
  protectedMinimumOutputTokens: 4_096,
  /** Model-registry output limit for the incident model. */
  modelMaxOutputTokens: 64_000,
} as const;

/** The safe ceiling the caller computes for that shape: whatever room the
 *  context actually leaves, capped by the model's own output limit. */
const INCIDENT_CEILING = Math.min(
  INCIDENT.contextWindowTokens - INCIDENT.measuredInputTokens - INCIDENT.contextSafetyReserveTokens,
  INCIDENT.modelMaxOutputTokens,
);

const BASE_REQUEST: ProviderRequest = {
  system: 'sys',
  model: 'incident-model',
  messages: [{ role: 'user', content: 'go' }],
  tools: [],
};

/** Capture the JSON body each transport puts on the wire. Each adapter gets an
 *  SSE stream its own parser terminates on. */
function capturingFetch(sse: string, sink: Record<string, unknown>[]): typeof fetch {
  return (async (_url: unknown, init: { body: string }) => {
    sink.push(JSON.parse(init.body) as Record<string, unknown>);
    return {
      ok: true,
      status: 200,
      body: (async function* () { yield new TextEncoder().encode(sse); })(),
    };
  }) as unknown as typeof fetch;
}

const OPENAI_SSE = 'data: [DONE]\n\n';
const ANTHROPIC_SSE = 'event: message_stop\ndata: {}\n\n';

/** Send `req` through both transports and return the `max_tokens` each wired
 *  (`undefined` = the field was omitted entirely). */
async function wiredCeilings(
  req: ProviderRequest,
  configured?: number,
): Promise<{ openai: unknown; anthropic: unknown }> {
  const openaiBodies: Record<string, unknown>[] = [];
  const anthropicBodies: Record<string, unknown>[] = [];

  const openaiOpts: OpenAIAdapterOptions = {
    baseUrl: 'http://x/v1',
    fetchImpl: capturingFetch(OPENAI_SSE, openaiBodies),
    ...(configured === undefined ? {} : { maxTokens: configured }),
  };
  const anthropicOpts: AnthropicAdapterOptions = {
    apiKey: 'k',
    fetchImpl: capturingFetch(ANTHROPIC_SSE, anthropicBodies),
    ...(configured === undefined ? {} : { maxTokens: configured }),
  };

  for await (const _e of createOpenAIAdapter(openaiOpts).send(req)) { /* drain */ }
  for await (const _e of createAnthropicAdapter(anthropicOpts).send(req)) { /* drain */ }

  return {
    openai: openaiBodies[0]?.['max_tokens'],
    anthropic: anthropicBodies[0]?.['max_tokens'],
  };
}

// ── the normalized ladder ────────────────────────────────────────────────────

describe('resolveWireOutputCeiling', () => {
  it('prefers the per-request computed ceiling over the operator-pinned one', () => {
    expect(resolveWireOutputCeiling({ requestCeilingTokens: 64_000, configuredCeilingTokens: 8_192 }))
      .toEqual({ state: 'resolved', tokens: 64_000, source: 'request' });
  });

  it('falls back to the operator-pinned ceiling when the request carries none', () => {
    expect(resolveWireOutputCeiling({ configuredCeilingTokens: 12_345 }))
      .toEqual({ state: 'resolved', tokens: 12_345, source: 'configured' });
  });

  it('is unresolved — never a constant — when no authority exists', () => {
    expect(resolveWireOutputCeiling({}))
      .toEqual({ state: 'unresolved', reason: 'no-ceiling-authority' });
  });

  it('fails closed on a present-but-invalid authority instead of degrading a tier', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveWireOutputCeiling({ requestCeilingTokens: bad, configuredCeilingTokens: 8_192 }))
        .toEqual({ state: 'unresolved', reason: 'invalid-ceiling-authority' });
      expect(resolveWireOutputCeiling({ configuredCeilingTokens: bad }))
        .toEqual({ state: 'unresolved', reason: 'invalid-ceiling-authority' });
    }
  });
});

// ── the incident shape ───────────────────────────────────────────────────────

describe('RCA §2 — the 93.5K-input incident shape', () => {
  it('derives a safe ceiling far greater than the 4,096 protected minimum', () => {
    // 200_000 - 93_500 - 8_000 = 98_500 tokens of context room, capped by the
    // model's 64_000 output limit. The reserve is a floor, not the answer.
    expect(INCIDENT_CEILING).toBe(64_000);
    expect(INCIDENT_CEILING).toBeGreaterThan(INCIDENT.protectedMinimumOutputTokens);
    expect(INCIDENT_CEILING).toBeGreaterThan(4_096);
  });

  it('reaches BOTH transports as that ceiling, not as 4,096', async () => {
    const wired = await wiredCeilings({ ...BASE_REQUEST, outputCeilingTokens: INCIDENT_CEILING });

    expect(wired.openai).toBe(INCIDENT_CEILING);
    expect(wired.anthropic).toBe(INCIDENT_CEILING);
    expect(wired.openai).not.toBe(4_096);
    expect(wired.anthropic).not.toBe(4_096);
    expect(wired.anthropic as number).toBeGreaterThan(4_096);
  });

  it('regression: the Anthropic transport no longer caps at 4,096 when the request carries a ceiling', async () => {
    // Before the fix this adapter ignored `outputCeilingTokens` entirely and
    // always sent `opts.maxTokens ?? 4096` — production constructs it without
    // `maxTokens`, so every real turn was cut at the protected minimum.
    const wired = await wiredCeilings({ ...BASE_REQUEST, outputCeilingTokens: 120_000 });
    expect(wired.anthropic).toBe(120_000);
  });
});

// ── transport parity ─────────────────────────────────────────────────────────

describe('output-ceiling parity across transports', () => {
  const CASES: Array<{ name: string; requestCeiling?: number; configured?: number; expected: unknown }> = [
    { name: 'request ceiling only', requestCeiling: INCIDENT_CEILING, expected: INCIDENT_CEILING },
    { name: 'operator-pinned ceiling only', configured: 12_345, expected: 12_345 },
    { name: 'request ceiling outranks the operator-pinned one', requestCeiling: 64_000, configured: 8_192, expected: 64_000 },
    { name: 'no ceiling authority at all', expected: undefined },
    { name: 'invalid operator-pinned ceiling fails closed', configured: 0, expected: undefined },
  ];

  for (const c of CASES) {
    it(`wires an identical ceiling on both transports — ${c.name}`, async () => {
      const req: ProviderRequest = c.requestCeiling === undefined
        ? BASE_REQUEST
        : { ...BASE_REQUEST, outputCeilingTokens: c.requestCeiling };
      const wired = await wiredCeilings(req, c.configured);

      expect(wired.openai).toEqual(wired.anthropic);
      expect(wired.openai).toEqual(c.expected);
    });
  }

  it('neither transport invents a ceiling when none was resolved', async () => {
    const openaiBodies: Record<string, unknown>[] = [];
    const anthropicBodies: Record<string, unknown>[] = [];

    for await (const _e of createOpenAIAdapter({
      baseUrl: 'http://x/v1', fetchImpl: capturingFetch(OPENAI_SSE, openaiBodies),
    }).send(BASE_REQUEST)) { /* drain */ }
    for await (const _e of createAnthropicAdapter({
      apiKey: 'k', fetchImpl: capturingFetch(ANTHROPIC_SSE, anthropicBodies),
    }).send(BASE_REQUEST)) { /* drain */ }

    expect(openaiBodies[0]).not.toHaveProperty('max_tokens');
    expect(anthropicBodies[0]).not.toHaveProperty('max_tokens');
  });
});

// ── the constant is gone from every path ─────────────────────────────────────

describe('no constant output ceiling survives in transport source', () => {
  const SOURCES = ['anthropic.ts', 'openai.ts'] as const;

  for (const file of SOURCES) {
    it(`${file} carries no hardcoded generation ceiling`, () => {
      const source = readFileSync(
        new URL(`../../src/agent/provider-tooluse/${file}`, import.meta.url),
        'utf8',
      );
      // Strip comments: the incident is documented in prose there on purpose.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/^[ \t]*\/\/.*$/gmu, '');

      // A `4096` may still legitimately appear far from the ceiling (openai.ts
      // caps its error-body excerpt at 4096 chars) — what must not exist is a
      // 4096 that IS a ceiling.
      for (const line of code.split('\n').filter((l) => /\b4_?096\b/u.test(l))) {
        expect(line).not.toMatch(/max_?tokens|ceiling/iu);
      }
      // No numeric literal may be assigned as the ceiling on any path — the
      // wire value comes from the resolved ceiling or the field is omitted.
      expect(code).not.toMatch(/max_?tokens['"]?\s*[:=]\s*[^;\n]*\b\d/iu);
      // The dead fallback shape itself, in any spacing.
      expect(code).not.toMatch(/max_?[Tt]okens\s*\?\?\s*\d/u);
    });
  }
});
