/**
 * 7109 TERMINAL-TOOL-BUDGET-UNITS-001 — retained tool-result share uses tokens,
 * not raw UTF-8 bytes mistaken for token caps (live incident 2026-09-09).
 */

import { describe, it, expect } from 'vitest';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import {
  conservativeRetainedToolResultTokens,
  deriveMeasuredTokensPerUtf8Byte,
  measureRetainedToolResultTokens,
  previewUtf8BytesForTokenBudget,
  sumToolResultUtf8Bytes,
  toolResultBytesToTokens,
} from '../../src/agent/context-budget.js';
import type { ProviderMessage, RequestMeasurement } from '../../src/agent/provider-tooluse/types.js';
import { previewBytesFromTokenShare } from '../../src/agent/tool-result-broker.js';

function scriptedAdapter(scripts: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let turn = 0;
  const adapter: ProviderAdapter = {
    name: 'tool-budget-units',
    async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
      requests.push(req);
      for (const event of scripts[turn++] ?? [{ type: 'done' }]) yield event;
    },
  };
  return { adapter, requests };
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
    tier: 'silent', source: 'builtin', handler: async (args) => ({ ok: true, output: `echoed:${args['v'] ?? ''}` }),
  });
  return {
    adapter: scriptedAdapter([[{ type: 'done' }]]).adapter,
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
    ...over,
  };
}

const WINDOW_131K = 131_072;
const budget = resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { outputReserveTokens: 1, contextSafetyReserveTokens: 1 } } });

function toolRound(id: string, payload: string): ProviderEvent[] {
  return [{ type: 'tool-call', id, name: 'echo', args: { v: payload } }, { type: 'done' }];
}

describe('context-budget token/unit helpers', () => {
  it('converts bytes with a measured ratio instead of treating token caps as bytes', () => {
    expect(toolResultBytesToTokens(18_000, 0.25)).toBe(4500);
    expect(previewUtf8BytesForTokenBudget(6553, 0.25)).toBe(26_212);
    expect(previewBytesFromTokenShare(6553, 1)).toBe(6553);
    expect(deriveMeasuredTokensPerUtf8Byte(5000, 20_000)).toBe(0.25);
  });

  it('probe K: degraded non-tool half falls back to byte upper bound instead of fail-open zero', async () => {
    const toolBody = 'z'.repeat(72_000);
    const messages: ProviderMessage[] = [
      { role: 'user', content: 'go' },
      { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'echo', args: {} }] },
      { role: 'tool', content: toolBody, toolCallId: 't1' },
    ];
    const identity = {
      provider: 'probe', model: 'm', contextWindowTokens: WINDOW_131K, contextProvenance: 'configured-narrowing' as const,
    };
    const measure = async (source: readonly ProviderMessage[]): Promise<RequestMeasurement> => ({
      inputTokens: source.some((message) => message.role === 'tool') ? 80_000 : 100,
      quality: source.some((message) => message.role === 'tool') ? 'exact' : 'conservative-upper-bound',
      provenance: 'probe-k',
      requestDigest: 'probe-k',
      identity,
    });
    const result = await measureRetainedToolResultTokens(messages, measure);
    expect(result).toEqual({
      retainedTokens: conservativeRetainedToolResultTokens(messages),
      quality: 'conservative-upper-bound',
    });
    expect(result.retainedTokens).toBe(72_000);
  });

  it('probe L: degraded full half falls back to byte upper bound without false zero diff', async () => {
    const toolBody = 'x'.repeat(18_000);
    const messages: ProviderMessage[] = [
      { role: 'user', content: 'go' },
      { role: 'tool', content: toolBody, toolCallId: 't1' },
    ];
    const identity = {
      provider: 'probe', model: 'm', contextWindowTokens: WINDOW_131K, contextProvenance: 'configured-narrowing' as const,
    };
    const measure = async (source: readonly ProviderMessage[]): Promise<RequestMeasurement> => ({
      inputTokens: source.some((message) => message.role === 'tool') ? 50_000 : 100,
      quality: source.some((message) => message.role === 'tool') ? 'conservative-upper-bound' : 'exact',
      provenance: 'probe-l',
      requestDigest: 'probe-l',
      identity,
    });
    const result = await measureRetainedToolResultTokens(messages, measure);
    expect(result.retainedTokens).toBe(18_000);
    expect(result.quality).toBe('conservative-upper-bound');
  });

  it('regression pin: 18 KB retained tripped the old byte pre-batch math but not token caps', () => {
    const retainedBytes = 18_000;
    const turnCapAsBytesBug = Math.floor(WINDOW_131K * 0.20);
    const desiredAsBytesBug = Math.min(
      Math.floor(WINDOW_131K * 0.05 * 4),
      Math.floor(turnCapAsBytesBug * 0.75),
    );
    const retainedTokens = toolResultBytesToTokens(retainedBytes, 0.25);
    const turnCapTokens = Math.floor(WINDOW_131K * 0.20);
    const desiredTokens = Math.min(Math.floor(WINDOW_131K * 0.05 * 4), Math.floor(turnCapTokens * 0.75));
    expect(retainedBytes > 0 && turnCapAsBytesBug - retainedBytes < desiredAsBytesBug).toBe(true);
    expect(retainedTokens > 0 && turnCapTokens - retainedTokens >= desiredTokens).toBe(true);
  });
});

describe('runAgentTurn retained tool-result checkpoints (7109)', () => {
  it('131072 window + ~18 KB tool output does NOT request token-pressure checkpoint', async () => {
    const payload = 'x'.repeat(4500);
    const { adapter } = scriptedAdapter([
      toolRound('one', payload),
      toolRound('two', payload),
      toolRound('three', payload),
      toolRound('four', payload),
      [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
    ]);
    const measured: ProviderAdapter = {
      ...adapter,
      requestMeasurement: {
        measure: async (request) => ({
          inputTokens: Math.ceil(sumToolResultUtf8Bytes(request.messages) * 0.25) + 2000,
          provenance: 'test-exact',
        }),
      },
    };
    const events = await drain(runAgentTurn(
      baseDeps({ adapter: measured, nativeBudget: budget, getContextBudgetTokens: () => WINDOW_131K }),
      new Transcript(),
      'inspect files',
    ));
    expect(events.filter((event) => event.type === 'budget-checkpoint-request' && event.reason === 'token-pressure')).toHaveLength(0);
    expect(events.some((event) => event.type === 'error')).toBe(false);
  });

  it('131072 window requests checkpoint when measured request exceeds 75% high-water', async () => {
    const { adapter } = scriptedAdapter([
      toolRound('one', 'evidence'),
      [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
    ]);
    const highWater = Math.floor(WINDOW_131K * budget.contextHighWaterRatio);
    const measured: ProviderAdapter = {
      ...adapter,
      requestMeasurement: {
        measure: async (request) => ({
          inputTokens: request.messages.some((message) => message.role === 'tool') ? highWater + 500 : 100,
          provenance: 'test-exact',
        }),
      },
    };
    const events = await drain(runAgentTurn(
      baseDeps({ adapter: measured, nativeBudget: budget, getContextBudgetTokens: () => WINDOW_131K }),
      new Transcript(),
      'go',
    ));
    const checkpoints = events.filter((event) => event.type === 'budget-checkpoint-request' && event.reason === 'token-pressure');
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({
      pressure: {
        retainedTokens: expect.any(Number),
        capTokens: Math.floor(WINDOW_131K * budget.maxTurnToolResultShareOfContext * budget.contextHighWaterRatio),
        windowTokens: WINDOW_131K,
        quality: 'exact',
        scope: 'tool-results',
      },
    });
  });

  it('32768 window scales retained share proportionally', async () => {
    const window = 32_768;
    const payload = 'y'.repeat(4500);
    const { adapter } = scriptedAdapter([
      toolRound('one', payload),
      toolRound('two', payload),
      [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
    ]);
    const measured: ProviderAdapter = {
      ...adapter,
      requestMeasurement: {
        measure: async (request) => ({
          inputTokens: Math.ceil(sumToolResultUtf8Bytes(request.messages) * 0.25) + 1000,
          provenance: 'test-exact',
        }),
      },
    };
    const events = await drain(runAgentTurn(
      baseDeps({ adapter: measured, nativeBudget: budget, getContextBudgetTokens: () => window }),
      new Transcript(),
      'go',
    ));
    expect(events.filter((event) => event.type === 'budget-checkpoint-request' && event.reason === 'token-pressure')).toHaveLength(0);
  });
});
