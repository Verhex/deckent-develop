/**
 * 7109-d TERMINAL-TOOL-RESULT-RETENTION-001 — inline shrink, store gate, rollback.
 */

import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { Transcript } from '../../src/agent/transcript.js';
import {
  isShrinkableToolContent,
  restoreToolResultSnapshots,
  shrinkOldestRetainedResults,
  shrinkToolResultContent,
} from '../../src/agent/tool-result-retention.js';
import { resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import type { ContentWriter } from '../../src/agent/tool-result-broker.js';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent, ProviderEvent, ProviderRequest, RequestMeasurement } from '../../src/agent/provider-tooluse/types.js';
import type { ProviderAdapter } from '../../src/agent/provider-tooluse/types.js';

function memStore(): ContentWriter {
  return {
    write(bytes) {
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      return { path: `mem://${sha256}`, sha256 };
    },
  };
}

describe('Transcript.shrinkToolResultInline', () => {
  it('mutates backing store and updates contentHash', () => {
    const t = new Transcript();
    t.appendUser('go');
    t.appendToolResult('c1', 'a'.repeat(8000));
    const shrunk = t.shrinkToolResultInline('c1', 'preview-only');
    expect(shrunk).toMatchObject({ status: 'applied' });
    expect(t.toProviderMessages().find((m) => m.toolCallId === 'c1')?.content).toBe('preview-only');
    expect(t.toEntries().find((e) => e.message.toolCallId === 'c1')?.contentHash).toBe(
      createHash('sha256').update('preview-only').digest('hex'),
    );
    expect(t.toProviderMessages()[1]?.content).toBe('preview-only');
  });

  it('rollback restores prior bytes and hash', () => {
    const t = new Transcript();
    t.appendUser('go');
    t.appendToolResult('c1', 'b'.repeat(4000));
    const snap = t.captureToolResultSnapshot('c1')!;
    t.shrinkToolResultInline('c1', 'x');
    restoreToolResultSnapshots(t, [snap]);
    expect(t.getToolResultContent('c1')).toBe('b'.repeat(4000));
  });
});

describe('shrinkToolResultContent store gate', () => {
  it('refuses preview-only when store write fails', () => {
    const prior = 'z'.repeat(9000);
    const failing: ContentWriter = { write() { throw new Error('disk full'); } };
    const attempt = shrinkToolResultContent(prior, { store: failing, maxPreviewBytes: 512 });
    expect(attempt).toEqual({ ok: false, reason: 'store-failed' });
  });

  it('shrinks with durable contentRef when store succeeds', () => {
    const prior = 'y'.repeat(9000);
    const attempt = shrinkToolResultContent(prior, { store: memStore(), maxPreviewBytes: 512 });
    expect(attempt.ok).toBe(true);
    if (attempt.ok) {
      expect(attempt.rendered).toContain('[deckent] tool-result truncated');
      expect(attempt.rendered).toContain('mem://');
    }
  });
});

describe('shrinkOldestRetainedResults', () => {
  it('leaves transcript byte-identical when store write fails', async () => {
    const t = new Transcript();
    t.appendUser('go');
    t.appendToolResult('c1', 'a'.repeat(9000));
    const digest = createHash('sha256').update(JSON.stringify(t.toProviderMessages())).digest('hex');
    const failing: ContentWriter = { write() { throw new Error('disk full'); } };
    const budget = resolveNativeAgentBudget({});
    const result = await shrinkOldestRetainedResults({
      transcript: t,
      store: failing,
      nativeBudget: budget,
      rawBudget: 131_072,
      tokensPerUtf8Byte: 0.25,
      measureRequest: async () => ({ inputTokens: 1000, quality: 'exact', provenance: 'test', requestDigest: 'd', identity: { provider: 'p', model: 'm', contextWindowTokens: 131_072, contextProvenance: 'configured-narrowing' } }),
    });
    expect(result.shrunkCount).toBe(0);
    expect(createHash('sha256').update(JSON.stringify(t.toProviderMessages())).digest('hex')).toBe(digest);
  });

  it('shrinks oldest large inline results first', async () => {
    const t = new Transcript();
    t.appendUser('go');
    for (let i = 0; i < 3; i++) t.appendToolResult(`c${i}`, `${i}:${'x'.repeat(6000)}`);
    const budget = resolveNativeAgentBudget({
      policy: { roles: {}, native_agent: { maxToolResultShareOfContext: 0.004 } },
    });
    const result = await shrinkOldestRetainedResults({
      transcript: t,
      store: memStore(),
      nativeBudget: budget,
      rawBudget: 131_072,
      tokensPerUtf8Byte: 0.25,
      measureRequest: async () => ({ inputTokens: 1000, quality: 'exact', provenance: 'test', requestDigest: 'd', identity: { provider: 'p', model: 'm', contextWindowTokens: 131_072, contextProvenance: 'configured-narrowing' } }),
    });
    expect(result.shrunkCount).toBeGreaterThan(0);
    expect(isShrinkableToolContent(t.getToolResultContent('c0') ?? '')).toBe(false);
  });
});

function scriptedAdapter(scripts: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return {
    name: 'retention-test',
    async *send(_req: ProviderRequest): AsyncIterable<ProviderEvent> {
      for (const event of scripts[turn++] ?? [{ type: 'done' }]) yield event;
    },
  };
}

async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

function baseDeps(over: Partial<LoopDeps>): LoopDeps {
  const reg = new ToolRegistry();
  reg.register({
    name: 'echo', description: 'echo', inputSchema: { type: 'object' }, category: 'coding',
    tier: 'silent', source: 'builtin', handler: async (args) => ({ ok: true, output: String(args['v'] ?? '') }),
  });
  return {
    adapter: scriptedAdapter([[{ type: 'done' }]]),
    registry: reg,
    policy: SAFE_DEFAULT_POLICY,
    ruleStore: { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] },
    cwd: '/tmp',
    model: 'm',
    getMode: () => 'suggest',
    issuePermission: () => { throw new Error('unexpected permission'); },
    requestPermission: async () => { throw new Error('unexpected permission'); },
    validatePermission: () => true,
    claimPermissionEffect: () => true,
    contentStore: memStore(),
    ...over,
  };
}

describe('runAgentTurn retention integration (7109-d)', () => {
  const WINDOW = 131_072;
  const tightTurnBudget = resolveNativeAgentBudget({
    policy: {
      roles: {},
      native_agent: {
        maxToolResultShareOfContext: 0.004,
        maxTurnToolResultShareOfContext: 0.03,
        outputReserveTokens: 1,
        contextSafetyReserveTokens: 1,
      },
    },
  });

  it('5×6KB reads at low window fill shrink instead of token-pressure checkpoint', async () => {
    const payload = 'p'.repeat(6000);
    const rounds = Array.from({ length: 5 }, (_, i) => [
      { type: 'tool-call' as const, id: `t${i}`, name: 'echo', args: { v: payload } },
      { type: 'done' as const },
    ]);
    rounds.push([{ type: 'text-delta' as const, text: 'done' }, { type: 'done' as const }]);
    const adapter: ProviderAdapter = {
      ...scriptedAdapter(rounds),
      requestMeasurement: {
        measure: async (request) => {
          const toolBytes = request.messages
            .filter((m) => m.role === 'tool')
            .reduce((n, m) => n + Buffer.byteLength(m.content, 'utf8'), 0);
          return {
            inputTokens: toolBytes > 0 ? toolBytes + 800 : 600,
            provenance: 'test-low-fill',
          };
        },
      },
    };
    const transcript = new Transcript();
    const events = await drain(runAgentTurn(
      baseDeps({ adapter, nativeBudget: tightTurnBudget, getContextBudgetTokens: () => WINDOW }),
      transcript,
      'read files',
    ));
    expect(events.filter((e) => e.type === 'budget-checkpoint-request' && e.reason === 'token-pressure')).toHaveLength(0);
    const toolBodies = transcript.toProviderMessages().filter((m) => m.role === 'tool').map((m) => m.content);
    expect(toolBodies.some((body) => body.includes('[deckent] tool-result truncated'))).toBe(true);
  });

  it('does not emit window-pressure checkpoint when exact measurement is unavailable', async () => {
    const adapter: ProviderAdapter = {
      ...scriptedAdapter([
        [{ type: 'tool-call', id: 't1', name: 'echo', args: { v: 'x'.repeat(6000) } }, { type: 'done' }],
        [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
      ]),
      requestMeasurement: {
        measure: async (request) => {
          if (request.messages.some((m) => m.role === 'tool')) throw new Error('measurement unavailable');
          return { inputTokens: 100, provenance: 'degraded' };
        },
      },
    };
    const events = await drain(runAgentTurn(
      baseDeps({ adapter, nativeBudget: tightTurnBudget, getContextBudgetTokens: () => WINDOW }),
      new Transcript(),
      'go',
    ));
    expect(events.filter((e) => e.type === 'budget-checkpoint-request' && e.reason === 'token-pressure')).toHaveLength(0);
  });
});
