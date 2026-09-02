// tests/agent/context-snapshot-compact.test.ts
// ═══ TERMINAL-TOOLS-010 — /context and /compact (agent layer) ═══════════════
//
// Parity P1 (Claude Code /context + /compact, Codex /compact, Hermes
// /compress): the session already measures context occupancy and takes
// bounded-delta checkpoint epochs, but only proactively (0.75 high-water) or
// as a side effect of /renew. Now the session exposes a read-only snapshot
// (window, measured input tokens, epoch, transcript shape, checkpoint state)
// and an explicit, immediate compaction that reuses the SAME epoch path.
// Hermetic: scripted adapter with a measurement capability, tmpdir scratch.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentSession, type AgentSessionDeps, type AgentSessionEvent } from '../../src/agent/session.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const CHECKPOINT_INSTRUCTION = 'TEST-CHECKPOINT-INSTRUCTION';
function memRuleStore(): RuleStore {
  return { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] };
}
function checkpointJson(): string {
  return JSON.stringify({
    schemaVersion: 1, objective: 'obj', findings: ['f'], evidenceRefs: [], decisions: [], unresolved: [],
    nextActions: [], inspectedAreas: [], toolResultDigests: [], cumulativeCounters: { checkpoints: 1 },
    createdAt: '2026-09-02T00:00:00.000Z',
  });
}
/** Adapter that answers checkpoint requests with JSON, normal turns with 'ok', and measures requests at 40 tokens per message. */
function scriptedAdapter(): ProviderAdapter & { checkpointRequests: ProviderRequest[] } {
  const checkpointRequests: ProviderRequest[] = [];
  return {
    name: 'scripted',
    checkpointRequests,
    async *send(request: ProviderRequest): AsyncIterable<ProviderEvent> {
      if (request.system === CHECKPOINT_INSTRUCTION) {
        checkpointRequests.push(request);
        yield { type: 'text-delta', text: checkpointJson() };
        yield { type: 'usage', inputTokens: 11, outputTokens: 7 };
        yield { type: 'done' };
        return;
      }
      yield { type: 'text-delta', text: 'ok' };
      yield { type: 'usage', inputTokens: 3, outputTokens: 2 };
      yield { type: 'done' };
    },
    requestMeasurement: {
      async measure(req: ProviderRequest) {
        return { inputTokens: req.messages.length * 40, quality: 'exact' as const, provenance: 'test-count' };
      },
    },
  } as ProviderAdapter & { checkpointRequests: ProviderRequest[] };
}
function deps(over: Partial<AgentSessionDeps>, opts: { scratchCwd?: string; window?: number } = {}): AgentSessionDeps {
  return {
    adapter: scriptedAdapter(), registry: new ToolRegistry(), policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
    cwd: opts.scratchCwd ?? tmpdir(), model: 'm',
    ...(opts.window ? { getContextBudgetTokens: () => opts.window! } : {}),
    ...(opts.scratchCwd ? { scratch: { tenantId: 't', projectId: 'p', sessionId: 's1', checkpointInstruction: CHECKPOINT_INSTRUCTION } } : {}),
    ...over,
  };
}
async function drain(events: AsyncIterable<AgentSessionEvent>): Promise<AgentSessionEvent[]> {
  const out: AgentSessionEvent[] = []; for await (const e of events) out.push(e); return out;
}

describe('AgentSession.contextSnapshot()', () => {
  it('reports window, measured input tokens, epoch, transcript shape and checkpoint state', async () => {
    const s = createAgentSession(deps({}, { window: 1000 }));
    await drain(s.send('hello'));
    const snap = await s.contextSnapshot();
    expect(snap.window).toBe(1000);
    expect(snap.measuredInputTokens).toBe(2 * 40); // user + assistant message
    expect(snap.epoch).toBe(1);
    expect(snap.messages).toBe(2);
    expect(snap.preambleMessages).toBe(0);
    expect(snap.checkpoint).toBe('empty');
    expect(snap.refreshPlanned).toBe(false);
    expect(snap.highWaterRatio).toBe(0.75);
  });

  it('is honest without a context authority: window and measurement are undefined, nothing is guessed', async () => {
    const s = createAgentSession(deps({}));
    const snap = await s.contextSnapshot();
    expect(snap.window).toBeUndefined();
    expect(snap.measuredInputTokens).toBeUndefined();
    expect(snap.epoch).toBe(1);
  });

  it('planContextRefresh() marks the next turn without renewing the working budget', async () => {
    const s = createAgentSession(deps({}, { window: 1000 }));
    s.planContextRefresh();
    expect((await s.contextSnapshot()).refreshPlanned).toBe(true);
  });
});

describe('AgentSession.compactContext()', () => {
  it('without a scratch store it yields the typed unavailable notice and keeps the epoch', async () => {
    const s = createAgentSession(deps({}, { window: 1000 }));
    const events = await drain(s.compactContext());
    expect(events.map((e) => e.type)).toEqual(['notice']);
    expect(events[0]).toMatchObject({ type: 'notice', code: 'native.compact.unavailable' });
    expect((await s.contextSnapshot()).epoch).toBe(1);
  });

  it('with a scratch store it takes a checkpoint epoch immediately: usage + saved notice, epoch advances, preamble set', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-compact-'));
    try {
      const adapter = scriptedAdapter();
      const s = createAgentSession(deps({ adapter }, { scratchCwd: cwd, window: 100_000 }));
      await drain(s.send('first'));
      await drain(s.send('second'));
      const events = await drain(s.compactContext());
      expect(adapter.checkpointRequests).toHaveLength(1);
      expect(events.map((e) => e.type)).toEqual(['usage', 'notice']);
      expect(events[1]).toMatchObject({ type: 'notice', code: 'native.checkpoint.saved' });
      const snap = await s.contextSnapshot();
      expect(snap.epoch).toBe(2);
      expect(snap.preambleMessages).toBeGreaterThan(0);
      expect(snap.checkpoint).toBe('ok');
      // the session keeps working after an explicit compaction
      const next = await drain(s.send('third'));
      expect(next.some((e) => e.type === 'text-delta')).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('AgentSession.compactContext() is cancellable', () => {
  it('cancel() during an explicit compaction aborts the checkpoint call; the epoch is kept and reported degraded', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deckent-compact-abort-'));
    try {
      let checkpointSignal: AbortSignal | undefined;
      const adapter: ProviderAdapter = {
        name: 'blocking-checkpoint',
        async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
          if (req.system === CHECKPOINT_INSTRUCTION) {
            checkpointSignal = req.signal;
            await new Promise<void>((resolve) => { req.signal?.addEventListener('abort', () => resolve()); });
            throw new DOMException('The operation was aborted', 'AbortError');
          }
          yield { type: 'text-delta', text: 'ok' };
          yield { type: 'done' };
        },
      };
      const s = createAgentSession(deps({ adapter }, { scratchCwd: cwd, window: 100_000 }));
      await drain(s.send('first'));
      const events: AgentSessionEvent[] = [];
      const run = (async () => { for await (const e of s.compactContext()) events.push(e); })();
      while (!checkpointSignal) await new Promise((r) => setTimeout(r, 5));
      s.cancel();
      await run;
      expect(checkpointSignal?.aborted).toBe(true);
      expect(events.some((e) => e.type === 'notice' && e.code === 'native.checkpoint.degraded')).toBe(true);
      expect((await s.contextSnapshot()).epoch).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
