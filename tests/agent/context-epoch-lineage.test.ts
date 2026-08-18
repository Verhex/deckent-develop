// tests/agent/context-epoch-lineage.test.ts
// ═══ 560-004 — context epochs · @ref lineage · /renew (RCA §4-§6) ═══════════
// Three incident-shaped proofs:
//   1. An overflowing transcript is checkpointed from BOUNDED DELTAS — the
//      checkpoint request never carries the full transcript.
//   2. A 26-char intent whose expansion is 99,327 chars compacts onto the RAW
//      intent + reference lineage (path + digest + excerpt), not the attachment.
//   3. `/renew` preserves the cumulative counters and refreshes the context
//      epoch safely on the next send.
// Hermetic: every cwd/scratch root is an mkdtemp, the adapter is scripted, no
// network and no repo files are read (an empty cwd keeps the system prompt small
// and deterministic).

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentSession,
  planCheckpointDelta,
  renderReferenceLineage,
  type AgentSessionDeps,
  type AgentSessionEvent,
  type TurnReference,
} from '../../src/agent/session.js';
import { parseAtRefLineage } from '../../src/cli/repl/native-agent-bridge.js';
import { estimateTokens } from '../../src/agent/context-budget.js';
import type { CostGuardState } from '../../src/agent/guards/cost.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderMessage,
  ProviderRequest,
} from '../../src/agent/provider-tooluse/types.js';

const CHECKPOINT_INSTRUCTION = 'TEST-CHECKPOINT-INSTRUCTION';
/** A checkpoint request larger than this is, by definition, no longer a bounded
 *  delta — the adapter refuses it exactly the way a real window would. */
const CHECKPOINT_WIRE_LIMIT = 20_000;

const budget = {
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

function memRuleStore(): RuleStore {
  return { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] };
}

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

interface ScriptedAdapter {
  adapter: ProviderAdapter;
  requests: ProviderRequest[];
  checkpointRequests: ProviderRequest[];
}

/** Records every request. A CHECKPOINT request over CHECKPOINT_WIRE_LIMIT is
 *  REFUSED (incident shape: a real window rejects the oversized prompt), so a
 *  regression back to "ship the whole transcript" fails loudly here. */
function scriptedAdapter(): ScriptedAdapter {
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
    nativeBudget: budget,
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

async function drain(events: AsyncIterable<AgentSessionEvent>): Promise<AgentSessionEvent[]> {
  const collected: AgentSessionEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function freshCwd(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-epoch-cwd-'));
}

// ── The incident payload: a 26-char intent, a 99,327-char expanded prompt ─────
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

describe('560-004 · context epochs, @ref lineage and /renew', () => {
  it('proof 1 — an overflowing transcript is checkpointed from bounded deltas, never the whole transcript', async () => {
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
    // Every cut is identified, not silently dropped.
    expect(chunks.join('\n')).toContain('sha256:');

    // (b) Live: seed a ~50KB transcript under a wide window, then narrow the
    // window — the PROACTIVE high-water trigger turns the epoch over BEFORE the
    // next request can jam, and it does so from bounded deltas.
    const cwd = freshCwd();
    const { adapter, checkpointRequests } = scriptedAdapter();
    let contextTokens = 400_000;
    const session = createAgentSession(
      sessionDeps({ adapter, cwd, contextTokens: () => contextTokens, sessionId: 'proof1' }),
    );
    const seedNeedles: string[] = [];
    for (let turn = 0; turn < 6; turn++) {
      const seedNeedle = `SEED_NEEDLE_${turn}`;
      seedNeedles.push(seedNeedle);
      // The needle sits far past the per-message bound, so it can only appear in
      // a checkpoint request if the full message was shipped.
      await drain(session.send(`${'s'.repeat(4_000)}${seedNeedle}${'s'.repeat(4_000)}`));
    }
    expect(checkpointRequests).toHaveLength(0); // nothing forced while the window was wide

    contextTokens = 8_192;
    const events = await drain(session.send('simdi ozetle'));

    // Recursive chunk+merge really ran: more than one bounded call, not one big one.
    expect(checkpointRequests.length).toBeGreaterThan(1);
    for (const request of checkpointRequests) {
      expect(JSON.stringify(request).length).toBeLessThanOrEqual(CHECKPOINT_WIRE_LIMIT);
      const wire = JSON.stringify(request);
      for (const seedNeedle of seedNeedles) expect(wire).not.toContain(seedNeedle);
    }
    // A durable checkpoint exists and the session says so honestly.
    expect(session.latestCheckpoint().status).toBe('ok');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'notice', code: 'native.checkpoint.saved' }),
    );
    // The checkpoint call is NOT off-books: its usage rides the same stream.
    expect(events.filter((event) => event.type === 'usage').length).toBeGreaterThan(1);
    session.close();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('proof 2 — a 26-char intent with a 99,327-char expansion compacts to raw intent + lineage', async () => {
    const body = incidentBody();
    const prompt = incidentPrompt(body);
    expect(RAW_INTENT).toHaveLength(26);
    expect(prompt).toHaveLength(99_327);

    // The three carriers are separated before the session ever sees the turn.
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

    // The lineage identifies the material; it never copies it.
    const lineage = renderReferenceLineage([reference]);
    expect(lineage).toContain(REF_PATH);
    expect(lineage).toContain(`sha256:${reference.digest.slice(0, 16)}`);
    expect(lineage).not.toContain(NEEDLE);

    const cwd = freshCwd();
    const { adapter } = scriptedAdapter();
    const session = createAgentSession(
      sessionDeps({ adapter, cwd, contextTokens: () => 8_192, sessionId: 'proof2' }),
    );
    await drain(session.send(structured));

    const compacted = session.transcript();
    const objective = compacted[0]?.content ?? '';
    // The epoch opens on the 26-char intent — the objective is the INTENT, not
    // the 99KB expansion that caused the incident.
    expect(objective.startsWith(RAW_INTENT)).toBe(true);
    expect(objective).toContain(REF_PATH);
    expect(objective).toContain(`sha256:${reference.digest.slice(0, 16)}`);
    // The attachment itself is gone from the live context.
    const wholeTranscript = JSON.stringify(compacted);
    expect(wholeTranscript).not.toContain(NEEDLE);
    expect(wholeTranscript.length).toBeLessThan(5_000);
    expect(session.latestCheckpoint().status).toBe('ok');
    session.close();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('proof 3 — /renew keeps every cumulative counter and refreshes the context epoch safely', async () => {
    const cwd = freshCwd();
    const { adapter } = scriptedAdapter();
    const costGuard: CostGuardState = { spentTokens: 41, usdPerMillionTokens: 2, ceilingUsd: 5 };
    const costGuardIdentity = costGuard;
    const session = createAgentSession(
      sessionDeps({ adapter, cwd, contextTokens: () => 400_000, costGuard, sessionId: 'proof3' }),
    );

    await drain(session.send('ilk tur'));
    const afterFirstTurn = costGuard.spentTokens;
    expect(afterFirstTurn).toBeGreaterThan(41); // cumulative, seeded from a prior session

    // The renewal seam's contract is unchanged, and it never rewrites history.
    const snapshot = { ...costGuard };
    expect(session.renewBudgetEpoch()).toEqual({ epoch: 2 });
    expect(costGuard).toBe(costGuardIdentity);
    expect(costGuard).toEqual(snapshot);

    // The planned refresh happens through the ordinary bounded-delta checkpoint
    // path on the next send — safely, and without discarding the intent.
    const events = await drain(session.send('yenilemeden sonra'));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'notice', code: 'native.checkpoint.saved' }),
    );
    expect(session.latestCheckpoint().status).toBe('ok');
    expect(session.transcript()[0]?.content).toBe('yenilemeden sonra');

    // Cumulative truth is monotonic: the renewal added nothing back, and the
    // checkpoint's own provider call is counted, not hidden.
    expect(costGuard.spentTokens).toBeGreaterThan(snapshot.spentTokens);
    expect(costGuard.usdPerMillionTokens).toBe(snapshot.usdPerMillionTokens);
    expect(costGuard.ceilingUsd).toBe(snapshot.ceilingUsd);
    session.close();
    rmSync(cwd, { recursive: true, force: true });
  });
});
