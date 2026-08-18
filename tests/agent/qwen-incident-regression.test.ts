// tests/agent/qwen-incident-regression.test.ts
// ═══ Qwen incident (2026-08-18) — deterministic regression (sprint-553-004) ══
//
// The live incident: one native-terminal turn issued three tool calls whose
// results totaled ~474k chars (one single 470k result), which entered the
// context raw and unbounded. This test rebuilds that turn from SYNTHETIC
// fixtures matching only the incident's SHAPE (sizes/counts — never raw
// user/tool content) and drives the REAL agent loop with a scripted adapter:
//
//   (a) with NT-01/04 containment (tool-result-broker) the turn completes and
//       every provider request stays bounded;
//   (b) with NT-02 admission a deliberately-overflowing uncontained variant
//       terminates with the typed admission code — an oversized request is
//       never shipped;
//   (c) the baseline metrics (request bytes, schema bytes, tool-result bytes,
//       rounds) are pinned as assertions with named constants.
//
// Hermetic: no fs, no network — an in-memory content store and a scripted
// adapter are the only seams. No wall-clock reliance anywhere.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
} from '../../src/agent/provider-tooluse/types.js';
import {
  brokerToolResult,
  RENDER_HARD_CAP_BYTES,
  type ContentWriter,
  type ContentWriteReceipt,
} from '../../src/agent/tool-result-broker.js';
import type { ResolvedNativeAgentBudget } from '../../src/core/execution-budget-policy.js';

// ── Incident-shape constants (sizes only — synthetic content) ───────────────

/** The single largest tool result of the incident turn (chars). */
const INCIDENT_SINGLE_RESULT_CHARS = 470_325;
/** All three tool results of the incident turn combined (chars). */
const INCIDENT_TOTAL_TOOL_CHARS = 474_380;
/** The two companion results split the remainder deterministically. */
const INCIDENT_SECOND_RESULT_CHARS = 2_028;
const INCIDENT_THIRD_RESULT_CHARS =
  INCIDENT_TOTAL_TOOL_CHARS - INCIDENT_SINGLE_RESULT_CHARS - INCIDENT_SECOND_RESULT_CHARS;
/** The incident transcript's effective context (~118k tokens). */
const INCIDENT_EFFECTIVE_CONTEXT_TOKENS = 118_000;
/** Eagerly-serialized tool schemas present in the incident request. */
const INCIDENT_EAGER_SCHEMAS = 46;

// ── Baseline ceilings (scenario c — named, asserted) ────────────────────────

/** A contained request (3 envelopes + 46 schemas + system) must stay under this. */
const BASELINE_MAX_CONTAINED_REQUEST_BYTES = 96_000;
/** The 46 eager schemas serialize under this. */
const BASELINE_MAX_SCHEMA_BYTES = 24_000;
/** All three CONTAINED tool results together stay under three render caps. */
const BASELINE_MAX_TOOL_RESULT_BYTES = 3 * RENDER_HARD_CAP_BYTES;
/** The contained turn completes in exactly two model rounds. */
const BASELINE_CONTAINED_ROUNDS = 2;

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Deterministic synthetic payload of exactly `chars` chars — clearly not the
 *  real trace (a repeated marker), sized to the incident's shape. */
function syntheticPayload(label: string, chars: number): string {
  const marker = `synthetic-incident-${label} `;
  return marker.repeat(Math.ceil(chars / marker.length)).slice(0, chars);
}

/** In-memory ContentWriter — real digests, zero fs. */
function memContentStore(): { store: ContentWriter; writes: ContentWriteReceipt[] } {
  const writes: ContentWriteReceipt[] = [];
  return {
    store: {
      write(bytes: Buffer): ContentWriteReceipt {
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const receipt = { path: `mem://content-${sha256}`, sha256 };
        writes.push(receipt);
        return receipt;
      },
    },
    writes,
  };
}

function scriptedAdapter(scripts: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let turn = 0;
  const adapter: ProviderAdapter = {
    name: 'scripted',
    async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
      requests.push(req);
      for (const e of scripts[turn++] ?? [{ type: 'done' }]) yield e;
    },
  };
  return { adapter, requests };
}

function memRuleStore(): RuleStore {
  const rules: { tool: string; pattern: string }[] = [];
  return { grant: (r) => rules.push(r), revoke: () => {}, activeRules: () => [...rules], activeDenies: () => [] };
}

const TEST_BUDGET: ResolvedNativeAgentBudget = {
  maxModelRounds: 120,
  maxToolCalls: 400,
  maxWallTimeMs: 45 * 60_000,
  maxCumulativeTokens: 2_000_000,
  maxNoProgressRounds: 8,
  checkpointEveryRounds: 20,
  checkpointEveryToolCalls: 60,
  outputReserveTokens: 512,
  contextSafetyReserveTokens: 128,
};

const INCIDENT_TOOLS: readonly { name: string; chars: number }[] = [
  { name: 'incident_read_huge', chars: INCIDENT_SINGLE_RESULT_CHARS },
  { name: 'incident_read_second', chars: INCIDENT_SECOND_RESULT_CHARS },
  { name: 'incident_read_third', chars: INCIDENT_THIRD_RESULT_CHARS },
];

/** Registry reproducing the incident shape: 3 producing tools + enough inert
 *  tools to reach the incident's 46 eagerly-serialized schemas. `contain`
 *  toggles whether results route through the real broker (scenario a) or reach
 *  the loop raw, exactly as the pre-fix incident did (scenario b). */
function incidentRegistry(contain: boolean, store: ContentWriter): ToolRegistry {
  const reg = new ToolRegistry();
  for (const tool of INCIDENT_TOOLS) {
    reg.register({
      name: tool.name,
      description: `synthetic incident producer (${tool.chars} chars)`,
      inputSchema: { type: 'object' },
      category: 'coding',
      tier: 'silent',
      source: 'builtin',
      handler: async () => {
        const raw = { output: syntheticPayload(tool.name, tool.chars), ok: true, exitCode: 0 };
        return contain
          ? { ok: true, output: brokerToolResult(raw, { store }) }
          : { ok: true, output: raw.output };
      },
    });
  }
  for (let i = INCIDENT_TOOLS.length; i < INCIDENT_EAGER_SCHEMAS; i++) {
    reg.register({
      name: `incident_inert_${i}`,
      description: `inert schema filler ${i} (never called)`,
      inputSchema: { type: 'object', properties: { arg: { type: 'string' } } },
      category: 'coding',
      tier: 'silent',
      source: 'builtin',
      handler: async () => ({ ok: true, output: 'unused' }),
    });
  }
  return reg;
}

/** Round 1: the incident's three tool calls. Round 2: a plain answer. */
const INCIDENT_TURN: ProviderEvent[][] = [
  [
    ...INCIDENT_TOOLS.map((tool, i): ProviderEvent => ({ type: 'tool-call', id: `c${i + 1}`, name: tool.name, args: {} })),
    { type: 'done' },
  ],
  [{ type: 'text-delta', text: 'contained' }, { type: 'done' }],
];

function deps(registry: ToolRegistry, adapter: ProviderAdapter): LoopDeps {
  return {
    adapter,
    registry,
    policy: SAFE_DEFAULT_POLICY,
    ruleStore: memRuleStore(),
    cwd: tmpdir(),
    model: 'm',
    getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
    nativeBudget: TEST_BUDGET,
    getContextBudgetTokens: () => INCIDENT_EFFECTIVE_CONTEXT_TOKENS,
  };
}

async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

// ── Scenario (a) — containment keeps the incident turn bounded ──────────────

describe('qwen incident regression — containment (NT-01/04)', () => {
  it('the incident-shaped turn completes with every provider request bounded', async () => {
    const { store, writes } = memContentStore();
    const { adapter, requests } = scriptedAdapter(INCIDENT_TURN);
    const evs = await drain(runAgentTurn(deps(incidentRegistry(true, store), adapter), new Transcript(), 'go'));

    expect(evs.some((e) => e.type === 'error')).toBe(false);
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });

    // Scenario (c) baselines — rounds, request bytes, schema bytes, tool-result bytes.
    expect(requests).toHaveLength(BASELINE_CONTAINED_ROUNDS);
    for (const req of requests) {
      expect(Buffer.byteLength(JSON.stringify(req), 'utf8')).toBeLessThan(BASELINE_MAX_CONTAINED_REQUEST_BYTES);
    }
    const schemaBytes = Buffer.byteLength(JSON.stringify(requests[0]!.tools), 'utf8');
    expect(requests[0]!.tools).toHaveLength(INCIDENT_EAGER_SCHEMAS);
    expect(schemaBytes).toBeGreaterThan(0);
    expect(schemaBytes).toBeLessThan(BASELINE_MAX_SCHEMA_BYTES);

    const toolMessages = requests[1]!.messages.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(INCIDENT_TOOLS.length);
    const toolResultBytes = toolMessages.reduce((n, m) => n + Buffer.byteLength(m.content, 'utf8'), 0);
    expect(toolResultBytes).toBeLessThanOrEqual(BASELINE_MAX_TOOL_RESULT_BYTES);
    for (const m of toolMessages) {
      expect(Buffer.byteLength(m.content, 'utf8')).toBeLessThanOrEqual(RENDER_HARD_CAP_BYTES);
    }

    // The 470k single result spilled to the content store with an honest digest,
    // and the model was told exactly that.
    const huge = syntheticPayload('incident_read_huge', INCIDENT_SINGLE_RESULT_CHARS);
    const hugeSha = createHash('sha256').update(Buffer.from(huge, 'utf8')).digest('hex');
    expect(writes.some((w) => w.sha256 === hugeSha)).toBe(true);
    const hugeMessage = toolMessages.find((m) => m.content.includes(hugeSha));
    expect(hugeMessage?.content).toContain(`${INCIDENT_SINGLE_RESULT_CHARS} bytes`);
    expect(hugeMessage?.content).toContain('full content at mem://content-');
  });
});

// ── Scenario (b) — the uncontained variant is denied typed, never shipped ───

describe('qwen incident regression — admission (NT-02)', () => {
  it('the raw pre-fix variant terminates typed instead of shipping the oversized request', async () => {
    const { store } = memContentStore();
    const { adapter, requests } = scriptedAdapter(INCIDENT_TURN);
    const evs = await drain(runAgentTurn(deps(incidentRegistry(false, store), adapter), new Transcript(), 'go'));

    const err = evs.find((e) => e.type === 'error');
    expect(err).toMatchObject({ type: 'error', code: 'native-context.admission-denied' });
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });

    // Exactly one request ever reached the adapter — the bounded first round.
    // The 474k chars of raw tool output were never serialized onto the wire.
    expect(requests).toHaveLength(1);
    expect(Buffer.byteLength(JSON.stringify(requests[0]), 'utf8')).toBeLessThan(BASELINE_MAX_CONTAINED_REQUEST_BYTES);

    // The admission path still asked for ONE compaction checkpoint first.
    expect(evs.filter((e) => e.type === 'budget-checkpoint-request')).toHaveLength(1);
  });
});
