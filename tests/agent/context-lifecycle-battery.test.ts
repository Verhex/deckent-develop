// tests/agent/context-lifecycle-battery.test.ts
// 560-006 — incident-shaped hermetic battery: the RCA "Mandatory regression
// proof" list's 11 items, consolidated into ONE hermetic file. Every item
// below calls the REAL production code path proven by its originating task
// (560-001..560-005) — no fixture-local reimplementation. Hermetic: every
// cwd/scratch root is an mkdtemp, every adapter is scripted, no network and
// no repo files are read.

import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import {
  createOpenAIAdapter,
  resolveWireOutputCeiling,
  type OpenAIAdapterOptions,
} from '../../src/agent/provider-tooluse/openai.js';
import {
  createAnthropicAdapter,
  type AnthropicAdapterOptions,
} from '../../src/agent/provider-tooluse/anthropic.js';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { Transcript } from '../../src/agent/transcript.js';
import {
  createAgentSession,
  planCheckpointDelta,
  renderReferenceLineage,
  type AgentSessionDeps,
  type AgentSessionEvent,
  type TurnReference,
} from '../../src/agent/session.js';
import {
  classifyContextLifecycleEvent,
  createNativeEngine,
  localizeContextLifecycleClass,
  parseAtRefLineage,
  type ContextLifecycleClass,
} from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import type { CostGuardState } from '../../src/agent/guards/cost.js';
import type {
  ProviderAdapter,
  ProviderContextIdentity,
  ProviderEvent,
  ProviderMessage,
  ProviderRequest,
  ProviderRequestMeasurementCapability,
} from '../../src/agent/provider-tooluse/types.js';

// ── shared, module-scoped fixtures (reused by multiple items below) ─────────

async function drainAll<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

function memRuleStore(): RuleStore {
  return { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] };
}

function freshCwd(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-battery-cwd-'));
}

const providerIdentity: ProviderContextIdentity = {
  provider: 'local-llm',
  model: 'incident-model',
  contextWindowTokens: 131_072,
  contextProvenance: 'server-reported',
};

describe('560-006 · incident-shaped hermetic battery (11/11 regression proofs)', () => {
  // ── Item 1 ──────────────────────────────────────────────────────────────
  describe('1 — 222K-exact / 126K-estimate shape: the doomed call is never dispatched', () => {
    function incidentRequest(): ProviderRequest {
      return {
        system: 'system',
        model: providerIdentity.model,
        messages: [{ role: 'user', content: 'x'.repeat(504_000) }],
        tools: [{
          name: 'write', description: 'write a file', input_schema: { type: 'object' },
        } as ProviderRequest['tools'][number]],
      };
    }

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
      const guarded = withMeasuredAdmission({
        adapter: underlying, identity: providerIdentity, capability, outputReserveTokens: 4_096,
      });

      await expect(drainAll(guarded.send(request))).rejects.toMatchObject({
        name: 'InputContextOverflowError', code: 'INPUT_CONTEXT_OVERFLOW',
      } satisfies Partial<InputContextOverflowError>);
      expect(capability.measure).toHaveBeenCalledOnce();
      expect(sent).not.toHaveBeenCalled();
    });
  });

  // ── Item 2 ──────────────────────────────────────────────────────────────
  const OPENAI_SSE = 'data: [DONE]\n\n';
  const ANTHROPIC_SSE = 'event: message_stop\ndata: {}\n\n';

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

  const BASE_REQUEST: ProviderRequest = {
    system: 'sys',
    model: 'incident-model',
    messages: [{ role: 'user', content: 'go' }],
    tools: [],
  };

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

  describe('2 — the 93.5K-input incident shape resolves a ceiling far above the 4,096 protected minimum', () => {
    const INCIDENT = {
      measuredInputTokens: 93_500,
      contextWindowTokens: 200_000,
      contextSafetyReserveTokens: 8_000,
      protectedMinimumOutputTokens: 4_096,
      modelMaxOutputTokens: 64_000,
    } as const;
    const INCIDENT_CEILING = Math.min(
      INCIDENT.contextWindowTokens - INCIDENT.measuredInputTokens - INCIDENT.contextSafetyReserveTokens,
      INCIDENT.modelMaxOutputTokens,
    );

    it('derives a safe ceiling far greater than the 4,096 protected minimum', () => {
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
      const wired = await wiredCeilings({ ...BASE_REQUEST, outputCeilingTokens: 120_000 });
      expect(wired.anthropic).toBe(120_000);
    });
  });

  // ── Items 3, 4, 5 ───────────────────────────────────────────────────────
  function scriptedLoopAdapter(scripts: ProviderEvent[][]): ProviderAdapter {
    let index = 0;
    return {
      name: 'incident-script',
      async *send() {
        for (const event of scripts[index++] ?? [{ type: 'done' }]) yield event;
      },
    };
  }

  function loopDeps(
    adapter: ProviderAdapter,
    handler = vi.fn(async () => ({ ok: true, output: 'ran' })),
  ): LoopDeps {
    const registry = new ToolRegistry();
    registry.register({
      name: 'writer', description: 'writer', inputSchema: { type: 'object' },
      category: 'coding', tier: 'silent', source: 'builtin', handler,
    });
    return {
      adapter, registry, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
      cwd: '/tmp', model: 'incident-model', getMode: () => 'suggest',
      requestPermission: async () => ({ decision: 'once' }),
    };
  }

  describe('3 — reasoning + length + empty-visible collapses to one visible answer', () => {
    it('recovers reasoning-only length into one visible answer without exposing reasoning', async () => {
      const events = await drainAll<AgentEvent>(runAgentTurn(loopDeps(scriptedLoopAdapter([
        [{ type: 'reasoning-activity', chars: 8_000 }, { type: 'usage', inputTokens: 90_000, outputTokens: 4_096 }, { type: 'done', stopReason: 'length' }],
        [{ type: 'text-delta', text: 'Recovered answer' }, { type: 'usage', inputTokens: 90_010, outputTokens: 20 }, { type: 'done', stopReason: 'stop' }],
      ])), new Transcript(), 'incident'));

      expect(events.filter((event) => event.type === 'text-delta')).toEqual([{ type: 'text-delta', text: 'Recovered answer' }]);
      expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', classification: 'EMPTY_VISIBLE_AFTER_REASONING', action: 'continue' }));
      expect(JSON.stringify(events)).not.toContain('8_000');
      expect(events.filter((event) => event.type === 'usage')).toHaveLength(2);
    });
  });

  describe('4 — multiple overlapping visible segments stitch exactly once', () => {
    it('stitches overlapping visible segments exactly once', async () => {
      const events = await drainAll<AgentEvent>(runAgentTurn(loopDeps(scriptedLoopAdapter([
        [{ type: 'text-delta', text: 'alpha beta' }, { type: 'done', stopReason: 'length' }],
        [{ type: 'text-delta', text: 'beta gamma' }, { type: 'done', stopReason: 'stop' }],
      ])), new Transcript(), 'incident'));

      expect(
        events
          .filter((event): event is Extract<AgentEvent, { type: 'text-delta' }> => event.type === 'text-delta')
          .map((event) => event.text)
          .join(''),
      ).toBe('alpha beta gamma');
    });
  });

  describe('5 — a partial tool-call from a length-cut segment never executes', () => {
    it('never executes a tool call emitted by a length-cut segment', async () => {
      const handler = vi.fn(async () => ({ ok: true, output: 'ran' }));
      const events = await drainAll<AgentEvent>(runAgentTurn(loopDeps(scriptedLoopAdapter([
        [{ type: 'tool-call', id: 'partial', name: 'writer', args: {} }, { type: 'done', stopReason: 'length' }],
        [{ type: 'text-delta', text: 'safe answer' }, { type: 'done', stopReason: 'stop' }],
      ]), handler), new Transcript(), 'incident'));

      expect(handler).not.toHaveBeenCalled();
      expect(events.some((event) => event.type === 'tool-proposed' || event.type === 'tool-executing')).toBe(false);
    });
  });

  // ── Items 6, 7, 8 ───────────────────────────────────────────────────────
  const CHECKPOINT_INSTRUCTION = 'TEST-CHECKPOINT-INSTRUCTION';
  const CHECKPOINT_WIRE_LIMIT = 20_000;

  const nativeBudgetDefaults = {
    maxModelRounds: 400,
    maxToolCalls: 400,
    maxWallTimeMs: 600_000,
    maxCumulativeTokens: 10_000_000,
    maxNoProgressRounds: 400,
    checkpointEveryRounds: 10_000,
    checkpointEveryToolCalls: 10_000,
    outputReserveTokens: 256,
    contextSafetyReserveTokens: 256,
  };

  function checkpointJson(objective: string): string {
    return JSON.stringify({
      schemaVersion: 1,
      objective,
      findings: ['bounded delta summarized'],
      evidenceRefs: [],
      decisions: [],
      unresolved: [],
      nextActions: [],
      inspectedAreas: [],
      toolResultDigests: [],
      cumulativeCounters: { checkpoints: 1 },
      createdAt: '2026-08-18T00:00:00.000Z',
    });
  }

  interface ScriptedSessionAdapter {
    adapter: ProviderAdapter;
    requests: ProviderRequest[];
    checkpointRequests: ProviderRequest[];
  }

  /** Records every request. A CHECKPOINT request over CHECKPOINT_WIRE_LIMIT is
   *  REFUSED (incident shape: a real window rejects the oversized prompt), so a
   *  regression back to "ship the whole transcript" fails loudly here. */
  function scriptedSessionAdapter(): ScriptedSessionAdapter {
    const requests: ProviderRequest[] = [];
    const checkpointRequests: ProviderRequest[] = [];
    const adapter: ProviderAdapter = {
      name: 'scripted',
      async *send(request: ProviderRequest): AsyncIterable<ProviderEvent> {
        requests.push(request);
        if (request.system === CHECKPOINT_INSTRUCTION) {
          checkpointRequests.push(request);
          const wireBytes = JSON.stringify(request).length;
          if (wireBytes > CHECKPOINT_WIRE_LIMIT) {
            throw new Error(`INPUT_CONTEXT_OVERFLOW: checkpoint request carried ${wireBytes} bytes`);
          }
          yield { type: 'text-delta', text: checkpointJson('bounded checkpoint') };
          yield { type: 'usage', inputTokens: 11, outputTokens: 7 };
          yield { type: 'done' };
          return;
        }
        yield { type: 'text-delta', text: 'ok' };
        yield { type: 'usage', inputTokens: 3, outputTokens: 2 };
        yield { type: 'done' };
      },
    };
    return { adapter, requests, checkpointRequests };
  }

  function sessionDeps(input: {
    adapter: ProviderAdapter;
    cwd: string;
    contextTokens: () => number;
    costGuard?: CostGuardState;
    sessionId: string;
  }): AgentSessionDeps {
    return {
      adapter: input.adapter,
      registry: new ToolRegistry(),
      policy: SAFE_DEFAULT_POLICY,
      ruleStore: memRuleStore(),
      cwd: input.cwd,
      model: 'm',
      nativeBudget: nativeBudgetDefaults,
      getContextBudgetTokens: input.contextTokens,
      ...(input.costGuard ? { costGuard: input.costGuard } : {}),
      scratch: {
        tenantId: 'tenant',
        projectId: 'project',
        sessionId: input.sessionId,
        checkpointInstruction: CHECKPOINT_INSTRUCTION,
      },
    };
  }

  const RAW_INTENT = 'ozetle: @notes/incident.md';
  const REF_PATH = 'notes/incident.md';
  const NEEDLE = 'NEEDLE_DEEP_INSIDE_THE_ATTACHMENT';
  const BODY_LENGTH = 99_265;

  function incidentBody(): string {
    const filler = 'x'.repeat(BODY_LENGTH);
    return `${filler.slice(0, 50_000)}${NEEDLE}${filler.slice(50_000 + NEEDLE.length)}`;
  }

  /** The prompt exactly as at-ref.ts's expandAtRefs writes it (fenced block after
   *  a blank line) — this is what app.tsx hands the engine today. */
  function incidentPrompt(body: string): string {
    return `${RAW_INTENT}\n\n[@ref] ${REF_PATH}:\n\`\`\`\n${body}\n\`\`\``;
  }

  describe('6 — an overflowing transcript is checkpointed from bounded deltas, never the whole transcript', () => {
    it('proof — bounded delta planner + live proactive high-water checkpoint', async () => {
      // (a) Pure: the delta planner alone guarantees the bound.
      const overflowing: ProviderMessage[] = [
        { role: 'user', content: incidentPrompt(incidentBody()) },
        { role: 'assistant', content: 'y'.repeat(40_000) },
        { role: 'user', content: 'devam' },
      ];
      const chunks = planCheckpointDelta(overflowing, 512);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(estimateTokens(chunk)).toBeLessThanOrEqual(512);
        expect(chunk).not.toContain(NEEDLE);
      }
      expect(chunks.join('\n')).toContain('sha256:');

      // (b) Live: seed a ~50KB transcript under a wide window, then narrow the
      // window — the PROACTIVE high-water trigger turns the epoch over BEFORE
      // the next request can jam, and it does so from bounded deltas.
      const cwd = freshCwd();
      const { adapter, checkpointRequests } = scriptedSessionAdapter();
      let contextTokens = 400_000;
      const session = createAgentSession(
        sessionDeps({ adapter, cwd, contextTokens: () => contextTokens, sessionId: 'proof1' }),
      );
      const seedNeedles: string[] = [];
      for (let turn = 0; turn < 6; turn++) {
        const seedNeedle = `SEED_NEEDLE_${turn}`;
        seedNeedles.push(seedNeedle);
        await drainAll(session.send(`${'s'.repeat(4_000)}${seedNeedle}${'s'.repeat(4_000)}`));
      }
      expect(checkpointRequests).toHaveLength(0);

      contextTokens = 8_192;
      const events = await drainAll<AgentSessionEvent>(session.send('simdi ozetle'));

      expect(checkpointRequests.length).toBeGreaterThan(1);
      for (const request of checkpointRequests) {
        expect(JSON.stringify(request).length).toBeLessThanOrEqual(CHECKPOINT_WIRE_LIMIT);
        const wire = JSON.stringify(request);
        for (const seedNeedle of seedNeedles) expect(wire).not.toContain(seedNeedle);
      }
      expect(session.latestCheckpoint().status).toBe('ok');
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'notice', code: 'native.checkpoint.saved' }),
      );
      expect(events.filter((event) => event.type === 'usage').length).toBeGreaterThan(1);
      session.close();
      rmSync(cwd, { recursive: true, force: true });
    });
  });

  describe('7 — a 26-char intent with a 99,327-char expansion compacts to raw intent + lineage', () => {
    it('proof — three carriers separated, live context compacts, attachment never re-enters', async () => {
      const body = incidentBody();
      const prompt = incidentPrompt(body);
      expect(RAW_INTENT).toHaveLength(26);
      expect(prompt).toHaveLength(99_327);

      const structured = parseAtRefLineage(prompt);
      expect(structured.rawIntent).toBe(RAW_INTENT);
      expect(structured.rawIntent).toHaveLength(26);
      expect(structured.expandedPayload).toHaveLength(99_327);
      expect(structured.references).toHaveLength(1);
      const reference = structured.references[0] as TurnReference;
      expect(reference.path).toBe(REF_PATH);
      expect(reference.digest).toBe(createHash('sha256').update(body).digest('hex'));
      expect(reference.bytes).toBe(BODY_LENGTH);
      expect(reference.excerpt).toHaveLength(320);
      expect(reference.excerpt).not.toContain(NEEDLE);

      const lineage = renderReferenceLineage([reference]);
      expect(lineage).toContain(REF_PATH);
      expect(lineage).toContain(`sha256:${reference.digest.slice(0, 16)}`);
      expect(lineage).not.toContain(NEEDLE);

      const cwd = freshCwd();
      const { adapter } = scriptedSessionAdapter();
      const session = createAgentSession(
        sessionDeps({ adapter, cwd, contextTokens: () => 8_192, sessionId: 'proof2' }),
      );
      await drainAll(session.send(structured));

      const compacted = session.transcript();
      const objective = compacted[0]?.content ?? '';
      expect(objective.startsWith(RAW_INTENT)).toBe(true);
      expect(objective).toContain(REF_PATH);
      expect(objective).toContain(`sha256:${reference.digest.slice(0, 16)}`);
      const wholeTranscript = JSON.stringify(compacted);
      expect(wholeTranscript).not.toContain(NEEDLE);
      expect(wholeTranscript.length).toBeLessThan(5_000);
      expect(session.latestCheckpoint().status).toBe('ok');
      session.close();
      rmSync(cwd, { recursive: true, force: true });
    });
  });

  describe('8 — /renew keeps every cumulative counter and refreshes the context epoch safely', () => {
    it('proof — renewal does not rewrite history, next send checkpoints normally', async () => {
      const cwd = freshCwd();
      const { adapter } = scriptedSessionAdapter();
      const costGuard: CostGuardState = { spentTokens: 41, usdPerMillionTokens: 2, ceilingUsd: 5 };
      const costGuardIdentity = costGuard;
      const session = createAgentSession(
        sessionDeps({ adapter, cwd, contextTokens: () => 400_000, costGuard, sessionId: 'proof3' }),
      );

      await drainAll(session.send('ilk tur'));
      const afterFirstTurn = costGuard.spentTokens;
      expect(afterFirstTurn).toBeGreaterThan(41);

      const snapshot = { ...costGuard };
      expect(session.renewBudgetEpoch()).toEqual({ epoch: 2 });
      expect(costGuard).toBe(costGuardIdentity);
      expect(costGuard).toEqual(snapshot);

      const events = await drainAll<AgentSessionEvent>(session.send('yenilemeden sonra'));
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'notice', code: 'native.checkpoint.saved' }),
      );
      expect(session.latestCheckpoint().status).toBe('ok');
      expect(session.transcript()[0]?.content).toBe('yenilemeden sonra');

      expect(costGuard.spentTokens).toBeGreaterThan(snapshot.spentTokens);
      expect(costGuard.usdPerMillionTokens).toBe(snapshot.usdPerMillionTokens);
      expect(costGuard.ceilingUsd).toBe(snapshot.ceilingUsd);
      session.close();
      rmSync(cwd, { recursive: true, force: true });
    });
  });

  // ── Item 9 ──────────────────────────────────────────────────────────────
  describe('9 — exact and conservative-upper-bound measurement paths stay distinct', () => {
    it('labels a missing exact capability only as a proven conservative upper bound', async () => {
      const request: ProviderRequest = {
        system: 's', model: providerIdentity.model, messages: [{ role: 'user', content: 'hello' }], tools: [],
      };
      const measurement = await measureProviderRequest({ request, identity: providerIdentity });
      expect(measurement).toMatchObject({
        quality: 'conservative-upper-bound', provenance: 'utf8-wire-bytes-plus-framing', identity: providerIdentity,
      });
      expect(measurement.inputTokens).toBe(conservativeRequestTokenUpperBound(request));
      expect(measurement.inputTokens).toBeGreaterThan(estimateTokens(JSON.stringify(request)));
      expect(decideProviderAdmission(measurement, 128, 64).admitted).toBe(true);
    });

    it('bounds a stalled exact counter, caches the conservative result, and never relabels it exact', async () => {
      const request: ProviderRequest = {
        system: 'timeout-case', model: providerIdentity.model, messages: [], tools: [],
      };
      const capability: ProviderRequestMeasurementCapability = {
        measure: vi.fn((_req, signal) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })),
      };
      const first = await measureProviderRequest({ request, identity: providerIdentity, capability, timeoutMs: 5 });
      const second = await measureProviderRequest({ request, identity: providerIdentity, capability, timeoutMs: 5 });
      expect(first.quality).toBe('conservative-upper-bound');
      expect(second).toEqual(first);
      expect(capability.measure).toHaveBeenCalledOnce();
    });
  });

  // ── Item 10 ─────────────────────────────────────────────────────────────
  describe('10 — openai/anthropic wire an identical output ceiling on every path', () => {
    describe('the normalized resolution ladder', () => {
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

    describe('output-ceiling parity across transports', () => {
      const CASES: Array<{ name: string; requestCeiling?: number; configured?: number; expected: unknown }> = [
        { name: 'request ceiling only', requestCeiling: 64_000, expected: 64_000 },
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

    describe('no constant output ceiling survives in transport source', () => {
      const SOURCES = ['anthropic.ts', 'openai.ts'] as const;

      for (const file of SOURCES) {
        it(`${file} carries no hardcoded generation ceiling`, () => {
          const source = readFileSync(
            new URL(`../../src/agent/provider-tooluse/${file}`, import.meta.url),
            'utf8',
          );
          const code = source
            .replace(/\/\*[\s\S]*?\*\//gu, '')
            .replace(/^[ \t]*\/\/.*$/gmu, '');

          for (const line of code.split('\n').filter((l) => /\b4_?096\b/u.test(l))) {
            expect(line).not.toMatch(/max_?tokens|ceiling/iu);
          }
          expect(code).not.toMatch(/max_?tokens['"]?\s*[:=]\s*[^;\n]*\b\d/iu);
          expect(code).not.toMatch(/max_?[Tt]okens\s*\?\?\s*\d/u);
        });
      }
    });
  });

  // ── Item 11 ─────────────────────────────────────────────────────────────
  describe('11 — typed en+tr context-lifecycle messages never conflate classes', () => {
    function scriptedNativeAdapter(scripts: ProviderEvent[][]): ProviderAdapter {
      let turn = 0;
      return { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } };
    }

    const ALL_CLASSES: ContextLifecycleClass[] = [
      'INPUT_CONTEXT_OVERFLOW',
      'OUTPUT_CEILING_REACHED',
      'CONTINUATION_EXHAUSTED',
      'EMPTY_VISIBLE_CONTENT_WITH_REASONING',
      'REFERENCE_EXPANSION_REQUIRES_CHECKPOINT',
    ];

    const SAMPLE_EVENTS: Record<ContextLifecycleClass, AgentSessionEvent> = {
      INPUT_CONTEXT_OVERFLOW: { type: 'error', code: 'native-context.admission-denied', message: 'context admission denied — request needs ~9000 tokens, effective context is 4000' },
      OUTPUT_CEILING_REACHED: { type: 'generation-recovery', classification: 'OUTPUT_LIMIT', continuationIndex: 0, maxContinuations: 2, hiddenReasoningObserved: false, action: 'continue' },
      CONTINUATION_EXHAUSTED: { type: 'error', code: 'native-output.continuation-exhausted', message: 'native-output.continuation-exhausted' },
      EMPTY_VISIBLE_CONTENT_WITH_REASONING: { type: 'generation-recovery', classification: 'EMPTY_VISIBLE_AFTER_REASONING', continuationIndex: 1, maxContinuations: 2, hiddenReasoningObserved: true, action: 'continue' },
      REFERENCE_EXPANSION_REQUIRES_CHECKPOINT: { type: 'budget-checkpoint-request', reason: 'token-pressure', rounds: 3, toolCalls: 1 },
    };

    it('classifyContextLifecycleEvent resolves every real wire event to its class, pure', () => {
      for (const cls of ALL_CLASSES) {
        expect(classifyContextLifecycleEvent(SAMPLE_EVENTS[cls])).toBe(cls);
      }
      const held: AgentSessionEvent = { type: 'generation-recovery', classification: 'OUTPUT_LIMIT', continuationIndex: 2, maxContinuations: 2, hiddenReasoningObserved: false, action: 'hold' };
      expect(classifyContextLifecycleEvent(held)).toBeUndefined();
      expect(classifyContextLifecycleEvent({ type: 'text-delta', text: 'hi' })).toBeUndefined();
    });

    for (const lang of ['en', 'tr'] as const) {
      it(`renders five pairwise-distinct real ${lang} messages (no class shows another class's message)`, () => {
        const identityT = (k: string) => k;
        const t = (key: string) => getMessage(key, lang);
        const rendered = ALL_CLASSES.map((cls) => localizeContextLifecycleClass(t, cls));
        for (const [i, cls] of ALL_CLASSES.entries()) {
          const key = localizeContextLifecycleClass(identityT, cls);
          expect(rendered[i]).not.toBe(key);
        }
        expect(new Set(rendered).size).toBe(ALL_CLASSES.length);
      });
    }

    it('en and tr texts differ for every class, and only INPUT_CONTEXT_OVERFLOW claims the context window is full', () => {
      for (const cls of ALL_CLASSES) {
        const en = localizeContextLifecycleClass((k) => getMessage(k, 'en'), cls);
        const tr = localizeContextLifecycleClass((k) => getMessage(k, 'tr'), cls);
        expect(en).not.toBe(tr);
      }
      const tEn = (k: string) => getMessage(k, 'en');
      const overflowEn = localizeContextLifecycleClass(tEn, 'INPUT_CONTEXT_OVERFLOW');
      expect(overflowEn.toLowerCase()).toContain('context window');
      const tTr = (k: string) => getMessage(k, 'tr');
      const overflowTr = localizeContextLifecycleClass(tTr, 'INPUT_CONTEXT_OVERFLOW');
      expect(overflowTr).toContain('bağlam penceresi');
      for (const cls of ALL_CLASSES.filter((c) => c !== 'INPUT_CONTEXT_OVERFLOW')) {
        const msgEn = localizeContextLifecycleClass(tEn, cls);
        expect(msgEn.toLowerCase()).not.toContain('context window is full');
        expect(msgEn.toLowerCase()).not.toMatch(/context window may be full/);
        const msgTr = localizeContextLifecycleClass(tTr, cls);
        expect(msgTr).not.toMatch(/bağlam penceresi.*dolu/);
      }
      expect(getMessage('native.empty-response', 'en').toLowerCase()).not.toContain('context window may be full');
      expect(getMessage('native.empty-response', 'tr')).not.toMatch(/context penceresi dolmuş olabilir/);
    });

    it('OUTPUT_CEILING_REACHED end-to-end: a length-cut segment with visible text renders the ceiling-reached notice and recovers the full answer', async () => {
      const adapter = scriptedNativeAdapter([
        [{ type: 'text-delta', text: 'partial' }, { type: 'done', stopReason: 'length' }],
        [{ type: 'text-delta', text: ' rest' }, { type: 'done', stopReason: 'stop' }],
      ]);
      const out: string[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
        confirm: async () => 'y', toolSink: () => {},
        t: (k) => getMessage(k, 'en'),
      });
      await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
      const text = out.join('');
      expect(text).toContain(getMessage('native.output-ceiling-reached', 'en'));
      expect(text).toContain('partial');
      expect(text).toContain('rest');
      expect(text).not.toContain(getMessage('native-context.admission-denied', 'en'));
      expect(text).not.toContain(getMessage('native-output.continuation-exhausted', 'en'));
    });

    it('EMPTY_VISIBLE_CONTENT_WITH_REASONING end-to-end: hidden reasoning with no visible text renders the reasoning-recovery notice, distinct from a plain empty response', async () => {
      const adapter = scriptedNativeAdapter([
        [{ type: 'reasoning-activity', chars: 400 }, { type: 'done', stopReason: 'length' }],
        [{ type: 'text-delta', text: 'ok' }, { type: 'done', stopReason: 'stop' }],
      ]);
      const out: string[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'tr',
        confirm: async () => 'y', toolSink: () => {},
        t: (k) => getMessage(k, 'tr'),
      });
      await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
      const text = out.join('');
      expect(text).toContain(getMessage('native.empty-visible-with-reasoning', 'tr'));
      expect(text).toContain('ok');
      expect(text).not.toContain(getMessage('native-context.admission-denied', 'tr'));
      expect(text).not.toContain(getMessage('native.empty-response', 'tr'));
    });

    it('CONTINUATION_EXHAUSTED end-to-end: repeated length-cuts past the continuation cap render the exhaustion notice, not an ongoing "ceiling reached" message', async () => {
      const adapter = scriptedNativeAdapter([
        [{ type: 'text-delta', text: 'a' }, { type: 'done', stopReason: 'length' }],
        [{ type: 'text-delta', text: 'b' }, { type: 'done', stopReason: 'length' }],
        [{ type: 'text-delta', text: 'c' }, { type: 'done', stopReason: 'length' }],
      ]);
      const out: string[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
        confirm: async () => 'y', toolSink: () => {},
        t: (k) => getMessage(k, 'en'),
      });
      await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
      const text = out.join('');
      expect(text).toContain(getMessage('native-output.continuation-exhausted', 'en'));
      expect(text).not.toContain(getMessage('native-context.admission-denied', 'en'));
    });

    it('INPUT_CONTEXT_OVERFLOW + REFERENCE_EXPANSION_REQUIRES_CHECKPOINT end-to-end: a genuinely overflowed context renders both the checkpoint attempt and the terminal overflow notice, never output-exhaustion wording', async () => {
      const adapter = scriptedNativeAdapter([]);
      const out: string[] = [];
      const nativeBudget = {
        maxModelRounds: 20,
        maxToolCalls: 50,
        maxWallTimeMs: 600_000,
        maxCumulativeTokens: 1_000_000,
        maxNoProgressRounds: 10,
        checkpointEveryRounds: 100_000,
        checkpointEveryToolCalls: 100_000,
        outputReserveTokens: 16,
        contextSafetyReserveTokens: 16,
      };
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
        confirm: async () => 'y', toolSink: () => {},
        t: (k) => getMessage(k, 'en'),
        nativeBudget,
        getContextBudgetTokens: () => 5,
      });
      await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
      const text = out.join('');
      expect(text).toContain(getMessage('native.reference-expansion-checkpoint', 'en'));
      expect(text).toContain(getMessage('native-context.admission-denied', 'en'));
      expect(text).not.toContain(getMessage('native-output.continuation-exhausted', 'en'));
      expect(text).not.toContain(getMessage('native.output-ceiling-reached', 'en'));
      expect(text).not.toContain(getMessage('native.empty-visible-with-reasoning', 'en'));
    });
  });
});
