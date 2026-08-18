import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import {
  createAgentSession,
  type AgentSessionDeps,
  type AgentSessionEvent,
} from '../../src/agent/session.js';
import type { CostGuardState } from '../../src/agent/guards/cost.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const budget = {
  maxModelRounds: 1,
  maxToolCalls: 10,
  maxWallTimeMs: 60_000,
  maxCumulativeTokens: 10_000,
  maxNoProgressRounds: 10,
  checkpointEveryRounds: 10,
  checkpointEveryToolCalls: 10,
  outputReserveTokens: 100,
  contextSafetyReserveTokens: 100,
};

function memRuleStore(): RuleStore {
  return { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] };
}

function deps(adapter: ProviderAdapter, costGuard: CostGuardState): AgentSessionDeps {
  return {
    adapter,
    registry: new ToolRegistry(),
    policy: SAFE_DEFAULT_POLICY,
    ruleStore: memRuleStore(),
    cwd: tmpdir(),
    model: 'm',
    nativeBudget: budget,
    costGuard,
  };
}

async function drain(events: AsyncIterable<AgentSessionEvent>): Promise<AgentSessionEvent[]> {
  const collected: AgentSessionEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

describe('AgentSession budget epoch renewal', () => {
  it('blocks exhausted sends cheaply, then renews fresh working counters without touching cost', async () => {
    const scripts: ProviderEvent[][] = [
      [{ type: 'usage', inputTokens: 7, outputTokens: 3 }, { type: 'tool-call', id: 'missing-1', name: 'missing', args: {} }, { type: 'done' }],
      [{ type: 'text-delta', text: 'renewed' }, { type: 'done' }],
    ];
    let call = 0;
    const send = vi.fn(async function* (_request: ProviderRequest) {
      for (const event of scripts[call++] ?? [{ type: 'done' }]) yield event;
    });
    const adapter: ProviderAdapter = { name: 'scripted', send };
    const costGuard: CostGuardState = { spentTokens: 41, usdPerMillionTokens: 2, ceilingUsd: 5 };
    const costGuardIdentity = costGuard;
    const costGuardSnapshot = { ...costGuard };
    const session = createAgentSession(deps(adapter, costGuard));

    const terminal = await drain(session.send('exhaust this epoch'));
    expect(terminal).toContainEqual({
      type: 'error',
      code: 'native-budget.rounds-exhausted',
      message: 'native-budget.rounds-exhausted',
    });
    expect(send).toHaveBeenCalledTimes(1);

    const blocked = await drain(session.send('must not call adapter'));
    expect(blocked).toEqual([
      {
        type: 'session-budget-exhausted',
        code: 'native-budget.rounds-exhausted',
        epoch: 1,
        renewalHint: true,
      },
      { type: 'turn-end' },
    ]);
    expect(send).toHaveBeenCalledTimes(1);

    expect(session.renewBudgetEpoch()).toEqual({ epoch: 2 });
    expect(costGuard).toBe(costGuardIdentity);
    expect(costGuard).toEqual({ ...costGuardSnapshot, spentTokens: 51 });

    const renewed = await drain(session.send('work again'));
    expect(renewed).toContainEqual({ type: 'text-delta', text: 'renewed' });
    expect(renewed.at(-1)).toEqual({ type: 'turn-end' });
    expect(send).toHaveBeenCalledTimes(2);

    const beforeSecondRenewal = { ...costGuard };
    expect(session.renewBudgetEpoch()).toEqual({ epoch: 3 });
    expect(session.renewBudgetEpoch()).toEqual({ epoch: 4 });
    expect(costGuard).toBe(costGuardIdentity);
    expect(costGuard).toEqual(beforeSecondRenewal);
  });
});
