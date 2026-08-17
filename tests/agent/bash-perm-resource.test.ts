// tests/agent/bash-perm-resource.test.ts
// born-519: primaryResource() must read the real deckent_bash schema key
// (`cmd`, per src/cli/repl/native-tool-registry.ts) — not a nonexistent
// `command` key — so permission-request events + scoped-allow matching +
// the audit trail reflect the actual command instead of an empty string.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

function scriptedAdapter(scripts: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return {
    name: 'scripted',
    async *send() {
      const script = scripts[turn++] ?? [{ type: 'done' }];
      for (const e of script) yield e;
    },
  };
}
function memRuleStore(): RuleStore {
  return { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] };
}
async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}
function baseDeps(over: Partial<LoopDeps>): LoopDeps {
  return {
    adapter: scriptedAdapter([[{ type: 'done' }]]),
    registry: new ToolRegistry(),
    policy: SAFE_DEFAULT_POLICY,
    ruleStore: memRuleStore(),
    cwd: tmpdir(),
    model: 'm',
    getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
    ...over,
  };
}

describe('primaryResource — deckent_bash schema-key extraction (born-519)', () => {
  it('resolves the permission resource from the real `cmd` schema key, not `command`', async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: 'deckent_bash', description: 'bash', inputSchema: { type: 'object' }, category: 'coding',
      tier: 'confirm', source: 'builtin', handler: async () => ({ ok: true, output: 'ran' }),
    });
    const adapter = scriptedAdapter([
      [{ type: 'tool-call', id: 'b1', name: 'deckent_bash', args: { cmd: 'rm -rf /tmp/scratch' } }, { type: 'done' }],
      [{ type: 'done' }],
    ]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter, registry: reg }), new Transcript(), 'go'));
    expect(evs).toContainEqual({
      // 548-T1 shell-risk: rm -rf is DESTRUCTIVE-floor — 'always', never 'confirm'.
      type: 'permission-request', id: 'b1', tool: 'deckent_bash', resource: 'rm -rf /tmp/scratch', tier: 'always',
    });
  });

  it('does not fall back to an empty resource when only the stale `command` key is present', async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: 'deckent_bash', description: 'bash', inputSchema: { type: 'object' }, category: 'coding',
      tier: 'confirm', source: 'builtin', handler: async () => ({ ok: true, output: 'ran' }),
    });
    const adapter = scriptedAdapter([
      [{ type: 'tool-call', id: 'b2', name: 'deckent_bash', args: { command: 'echo legacy-key-only' } }, { type: 'done' }],
      [{ type: 'done' }],
    ]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter, registry: reg }), new Transcript(), 'go'));
    // 548-T1: the shell-risk classifier reads the command from the args
    // (cmd ?? command), so 'echo …' is safe-read and runs PROMPTLESS — the
    // resource-extraction honesty now shows through the auto-decision audit
    // event instead of a permission prompt.
    expect(evs.some((e) => e.type === 'permission-request')).toBe(false);
    const auto = evs.find((e) => e.type === 'permission-auto-decision');
    expect(auto).toBeDefined();
    expect((auto as Extract<AgentEvent, { type: 'permission-auto-decision' }>).decision).toBe('allow');
  });

  it('still resolves `path`/`file_path` args first, ahead of `cmd` (fallback order preserved)', async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: 'writer', description: 'w', inputSchema: { type: 'object' }, category: 'coding',
      tier: 'confirm', source: 'builtin', handler: async () => ({ ok: true, output: 'wrote' }),
    });
    const adapter = scriptedAdapter([
      [{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'src/a.ts', cmd: 'ignored' } }, { type: 'done' }],
      [{ type: 'done' }],
    ]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter, registry: reg }), new Transcript(), 'go'));
    expect(evs).toContainEqual({
      type: 'permission-request', id: 'w1', tool: 'writer', resource: 'src/a.ts', tier: 'confirm',
    });
  });
});
