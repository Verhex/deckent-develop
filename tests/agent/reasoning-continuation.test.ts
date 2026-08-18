import { describe, expect, it, vi } from 'vitest';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { Transcript } from '../../src/agent/transcript.js';

function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let index = 0;
  return {
    name: 'incident-script',
    async *send() {
      for (const event of scripts[index++] ?? [{ type: 'done' }]) yield event;
    },
  };
}

const ruleStore: RuleStore = {
  grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [],
};

function deps(adapter: ProviderAdapter, handler = vi.fn(async () => ({ ok: true, output: 'ran' }))): LoopDeps {
  const registry = new ToolRegistry();
  registry.register({
    name: 'writer', description: 'writer', inputSchema: { type: 'object' },
    category: 'coding', tier: 'silent', source: 'builtin', handler,
  });
  return {
    adapter, registry, policy: SAFE_DEFAULT_POLICY, ruleStore,
    cwd: '/tmp', model: 'incident-model', getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
  };
}

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('reasoning-aware bounded continuation', () => {
  it('recovers reasoning-only length into one visible answer without exposing reasoning', async () => {
    const events = await collect(runAgentTurn(deps(scripted([
      [{ type: 'reasoning-activity', chars: 8_000 }, { type: 'usage', inputTokens: 90_000, outputTokens: 4_096 }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: 'Recovered answer' }, { type: 'usage', inputTokens: 90_010, outputTokens: 20 }, { type: 'done', stopReason: 'stop' }],
    ])), new Transcript(), 'incident'));

    expect(events.filter((event) => event.type === 'text-delta')).toEqual([{ type: 'text-delta', text: 'Recovered answer' }]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', classification: 'EMPTY_VISIBLE_AFTER_REASONING', action: 'continue' }));
    expect(JSON.stringify(events)).not.toContain('8_000');
    expect(events.filter((event) => event.type === 'usage')).toHaveLength(2);
  });

  it('stitches overlapping visible segments exactly once', async () => {
    const events = await collect(runAgentTurn(deps(scripted([
      [{ type: 'text-delta', text: 'alpha beta' }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: 'beta gamma' }, { type: 'done', stopReason: 'stop' }],
    ])), new Transcript(), 'incident'));

    expect(events.filter((event): event is Extract<AgentEvent, { type: 'text-delta' }> => event.type === 'text-delta').map((event) => event.text).join('')).toBe('alpha beta gamma');
  });

  it('never executes a tool call emitted by a length-cut segment', async () => {
    const handler = vi.fn(async () => ({ ok: true, output: 'ran' }));
    const events = await collect(runAgentTurn(deps(scripted([
      [{ type: 'tool-call', id: 'partial', name: 'writer', args: {} }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: 'safe answer' }, { type: 'done', stopReason: 'stop' }],
    ]), handler), new Transcript(), 'incident'));

    expect(handler).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === 'tool-proposed' || event.type === 'tool-executing')).toBe(false);
  });

  it('holds after the bounded continuation limit', async () => {
    const length = [{ type: 'reasoning-activity', chars: 1 }, { type: 'done', stopReason: 'length' }] satisfies ProviderEvent[];
    const events = await collect(runAgentTurn(deps(scripted([length, length, length, length])), new Transcript(), 'incident'));
    expect(events.filter((event) => event.type === 'generation-recovery')).toHaveLength(3);
    expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', action: 'hold' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'native-output.continuation-exhausted' }));
  });
});
