// tests/agent/readonly-bash-silent-tier.test.ts
// ═══ 7111 — proven read-only deckent_bash rides the SILENT tier in standard mode ═
// The registry tier for deckent_bash is `confirm`; before 7111 `sed -n`,
// `awk`, `sort`, `jq`… prompted on every call (the measured "25 approvals, 0
// answers" incident). The loop's shell-risk gate now delegates `safe-read` to
// the canonical allowlist parser, so a proven read inside the project root runs
// with a `permission-auto-decision` (audit) and NO permission-request, while a
// read outside the root / a mutating command still asks.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentTurn, type LoopDeps, type PermissionResponse } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent, PermissionRequestEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import { nativeBuiltinApprovalClassifier } from '../../src/agent/native-tool-approval.js';
import {
  bindNativePermissionIntent,
  createNativePermissionInvocation,
  digestNativePermissionArgs,
  nativePermissionBindingsEqual,
} from '../../src/agent/native-permission-binding.js';

function scriptedAdapter(scripts: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return { name: 'scripted', async *send() { for (const e of scripts[turn++] ?? [{ type: 'done' }]) yield e; } };
}
function memRuleStore(): RuleStore {
  return { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] };
}
async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

function deps(root: string, commands: string[], requested: string[]): LoopDeps {
  const registry = new ToolRegistry();
  registry.register({
    name: 'deckent_bash', description: 'shell', inputSchema: { type: 'object' }, category: 'coding',
    tier: 'confirm', source: 'builtin',
    approval: nativeBuiltinApprovalClassifier('deckent_bash', { cwd: () => root, platform: 'linux' }),
    handler: async () => ({ ok: true, output: 'ran' }),
  });
  let sequence = 0;
  const valid = (request: PermissionRequestEvent, response: PermissionResponse, rawArgs: Record<string, unknown>): boolean => {
    if (response.decision === 'hold' || response.decision === 'deny') return false;
    return digestNativePermissionArgs(rawArgs) === request.invocation.invocationArgsDigest
      && nativePermissionBindingsEqual(response.binding, bindNativePermissionIntent(request.invocation, response.decision, request.resource));
  };
  return {
    adapter: scriptedAdapter([
      [...commands.map((cmd, i) => ({ type: 'tool-call' as const, id: `c${i + 1}`, name: 'deckent_bash', args: { cmd } })), { type: 'done' }],
      [{ type: 'done' }],
    ]),
    registry, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(), cwd: root, model: 'm',
    getMode: () => 'suggest',
    issuePermission: (input) => ({
      type: 'permission-request', id: input.callId, tool: input.tool, resource: input.resource, tier: input.tier,
      approval: Object.freeze({ ...input.approval }), maskedArgs: Object.freeze({ ...input.rawArgs }),
      invocation: createNativePermissionInvocation({
        sessionId: 'ro-test', sessionInstanceId: 'ro-process', turnGeneration: 1,
        invocationId: `permission-${++sequence}`, callId: input.callId, tool: input.tool,
        rawArgs: input.rawArgs, tier: input.tier, elevated: input.elevated, nested: input.nested,
      }),
    }),
    requestPermission: async (request) => {
      requested.push(request.resource);
      return { decision: 'once', binding: bindNativePermissionIntent(request.invocation, 'once', request.resource) };
    },
    validatePermission: valid,
    claimPermissionEffect: valid,
  };
}

describe('7111 — read-only deckent_bash on the silent tier (standard/suggest mode)', () => {
  let root: string;
  // The root exists on disk, so every path argument must exist (7111 existence rule).
  const setup = () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ro-silent-')));
    mkdirSync(join(root, 'docs'));
    for (const f of ['docs/MASTER-PLAN.md', 'f', 'f.json', 'a.md']) writeFileSync(join(root, f), 'x\n');
  };
  const teardown = () => rmSync(root, { recursive: true, force: true });

  it.each([
    "sed -n '1,50p' docs/MASTER-PLAN.md",
    "awk 'NR>=10 && NR<=20' docs/MASTER-PLAN.md",
    'grep -n foo docs/MASTER-PLAN.md | wc -l',
    'sort -u f | uniq -c | head -20',
    "jq '.a' f.json",
    'git log --oneline -5',
  ])('runs %s without a permission-request and records an auto-decision', async (cmd) => {
    setup();
    try {
      const requested: string[] = [];
      const events = await drain(runAgentTurn(deps(root, [cmd], requested), new Transcript(), 'go'));
      expect(requested).toEqual([]);
      expect(events.some((e) => e.type === 'permission-request')).toBe(false);
      expect(events).toContainEqual(expect.objectContaining({
        type: 'permission-auto-decision', tool: 'deckent_bash', resource: cmd, resourceClass: 'safe-read',
        decision: 'allow', tier: 'silent', mode: 'suggest', floor: false,
      }));
      expect(events).toContainEqual({ type: 'tool-executing', id: 'c1', tool: 'deckent_bash' });
      expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'c1', ok: true }));
    } finally { teardown(); }
  });

  it.each([
    'cat /etc/passwd',
    'cat ../outside.txt',
    'cat .env',
    "sed -i 's/a/b/' f",
    'cat f > g',
    'grep x $(rm y)',
    'npm test',
  ])('still asks for %s with the producer classification on the request', async (cmd) => {
    setup();
    try {
      const requested: string[] = [];
      const events = await drain(runAgentTurn(deps(root, [cmd], requested), new Transcript(), 'go'));
      expect(requested).toEqual([cmd]);
      const request = events.find((e): e is PermissionRequestEvent => e.type === 'permission-request');
      expect(request).toBeDefined();
      expect(request!.approval.scope).not.toBe('file-read');
      expect(request!.tier).toBe('confirm');
    } finally { teardown(); }
  });

  it('a destructive command keeps the always floor even though reads are silent', async () => {
    setup();
    try {
      const requested: string[] = [];
      const events = await drain(runAgentTurn(deps(root, ['rm -rf build'], requested), new Transcript(), 'go'));
      expect(requested).toEqual(['rm -rf build']);
      expect(events).toContainEqual(expect.objectContaining({ type: 'permission-request', tier: 'always' }));
    } finally { teardown(); }
  });

  it('a mixed round asks exactly once — only for the non-read call', async () => {
    setup();
    try {
      const requested: string[] = [];
      const events = await drain(runAgentTurn(deps(root, ["sed -n '1p' a.md", 'npm test', 'wc -l a.md'], requested), new Transcript(), 'go'));
      expect(requested).toEqual(['npm test']);
      expect(events.filter((e) => e.type === 'permission-auto-decision')).toHaveLength(2);
      expect(events.filter((e) => e.type === 'tool-result')).toHaveLength(3);
    } finally { teardown(); }
  });
});
