import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { classifyShellCommand, type ShellRisk } from '../../src/agent/guards/shell-risk.js';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent, PermissionRequestEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import type { PermissionResponse } from '../../src/agent/permission.js';
import {
  bindNativePermissionIntent,
  createNativePermissionInvocation,
  digestNativePermissionArgs,
  nativePermissionBindingsEqual,
} from '../../src/agent/native-permission-binding.js';
import { nativeBuiltinApprovalClassifier } from '../../src/agent/native-tool-approval.js';

function expectRisk(command: string, risk: ShellRisk): void {
  expect(classifyShellCommand(command), command).toMatchObject({ risk });
}

describe('classifyShellCommand', () => {
  it.each([
    'ls -la', 'cat file.txt', 'head -n 2 file', 'tail -f log', 'less README.md',
    'grep needle file', 'rg needle src', 'find src -name "*.ts"', 'wc -l file',
    'stat file', 'file archive.zip', 'pwd', 'which node', 'whoami', 'env',
    'env FOO=bar', 'printenv PATH', 'du -sh .', 'df -h', 'ps aux', 'echo hello',
    'node --version', 'npm -v', 'npx --version', 'git status', 'git log -1',
    'git diff --stat', 'git show HEAD', 'git branch', 'git branch --list "feat/*"',
  ])('classifies safe read: %s', (command) => expectRisk(command, 'safe-read'));

  it.each([
    'rm -r x', 'rm -f x', 'rm -rf x', 'rm -fr x', 'rm --recursive x', 'rm --force x',
    'rmdir empty', 'git push --force origin main', 'git push -f origin main',
    'git reset --hard HEAD', 'git clean -fd', 'chmod -R 700 dir', 'chown -R me dir',
    'dd if=/dev/zero of=x', 'mkfs.ext4 /dev/x', 'shred secret', 'truncate -s 0 file',
    'kill 123', 'pkill node', 'killall node', 'docker rm box', 'docker rmi image',
    'docker system prune', 'deckent kill', 'deckent cleanup', 'deckent recover',
  ])('classifies destructive floor: %s', (command) => expectRisk(command, 'destructive'));

  it.each([
    'curl https://example.test', 'rm file.txt', 'git branch new-feature', 'node script.js',
    'npm test', 'npx tsc', 'env sh -c true', 'find . -delete', 'find . -exec echo {} ;',
    'find . -execdir echo {} ;', '', 'echo "unterminated',
  ])('classifies conservative modify: %s', (command) => expectRisk(command, 'modify'));

  it('uses the worst risk across compound commands and substitutions', () => {
    expectRisk('ls && npm test || cat error.log', 'modify');
    expectRisk('pwd; rm -rf /tmp/x', 'destructive');
    expectRisk('cat file | wc -l', 'safe-read');
    expectRisk('echo $(rm -rf /tmp/x)', 'destructive');
    expectRisk('echo `npm test`', 'modify');
  });

  it('promotes output redirection and tee to modify', () => {
    expectRisk('echo hello > file', 'modify');
    expectRisk('cat input >> output', 'modify');
    expectRisk('cat input | tee output', 'modify');
    expectRisk('echo "> literal"', 'safe-read');
  });

  it('does not demote compound writes via the read-only parser', () => {
    expectRisk("mkdir -p /tmp/deckent-x && printf 'test' > /tmp/deckent-x/file.txt", 'modify');
  });
});

function scriptedAdapter(events: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return {
    name: 'scripted',
    async *send() {
      for (const event of events[turn++] ?? [{ type: 'done' }]) yield event;
    },
  };
}

function ruleStore(): RuleStore {
  return { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] };
}

async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function shellDeps(
  command: string,
  requested: string[],
  tool: 'bash' | 'deckent_bash' = 'deckent_bash',
): LoopDeps {
  const registry = new ToolRegistry();
  registry.register({
    name: tool,
    description: 'shell',
    inputSchema: { type: 'object' },
    category: 'coding',
    tier: 'confirm',
    source: 'builtin',
    approval: nativeBuiltinApprovalClassifier(tool),
    handler: async () => ({ ok: true, output: 'ran' }),
  });
  let invocation = 0;
  const issuePermission: LoopDeps['issuePermission'] = (input) => ({
    type: 'permission-request',
    id: input.callId,
    tool: input.tool,
    resource: input.resource,
    tier: input.tier,
    approval: Object.freeze({ ...input.approval }),
    maskedArgs: Object.freeze({ ...input.rawArgs }),
    invocation: createNativePermissionInvocation({
      sessionId: 'shell-risk', sessionInstanceId: 'shell-risk', turnGeneration: 1,
      invocationId: `invocation-${++invocation}`, callId: input.callId, tool: input.tool,
      rawArgs: input.rawArgs, tier: input.tier, elevated: input.elevated, nested: input.nested,
    }),
  });
  const valid = (request: PermissionRequestEvent, response: PermissionResponse, rawArgs: Record<string, unknown>): boolean => {
    if (response.decision === 'hold' || response.decision === 'deny') return false;
    return digestNativePermissionArgs(rawArgs) === request.invocation.invocationArgsDigest
      && nativePermissionBindingsEqual(response.binding, bindNativePermissionIntent(request.invocation, response.decision, request.resource));
  };
  return {
    adapter: scriptedAdapter([
      [{
        type: 'tool-call',
        id: 'shell-1',
        name: tool,
        args: tool === 'bash' ? { command } : { cmd: command },
      }, { type: 'done' }],
      [{ type: 'done' }],
    ]),
    registry,
    policy: SAFE_DEFAULT_POLICY,
    ruleStore: ruleStore(),
    cwd: tmpdir(),
    model: 'test',
    getMode: () => 'full-auto',
    issuePermission,
    requestPermission: async (event) => {
      requested.push(event.resource);
      return { decision: 'once', binding: bindNativePermissionIntent(event.invocation, 'once', event.resource) };
    },
    validatePermission: valid,
    claimPermissionEffect: valid,
  };
}

describe('shell risk loop integration', () => {
  it('runs safe reads promptlessly even when the registry tier is confirm', async () => {
    const requested: string[] = [];
    const events = await drain(runAgentTurn(shellDeps('rg needle src', requested), new Transcript(), 'go'));
    expect(requested).toEqual([]);
    expect(events.some((event) => event.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual({ type: 'tool-executing', id: 'shell-1', tool: 'deckent_bash' });
  });

  it('keeps destructive deckent_bash on the always floor in full-auto', async () => {
    const requested: string[] = [];
    const events = await drain(runAgentTurn(shellDeps('rm -rf /tmp/x', requested), new Transcript(), 'go'));
    expect(requested).toEqual(['rm -rf /tmp/x']);
    expect(events.some((event) => event.type === 'permission-request' && event.tier === 'always' && event.tool === 'deckent_bash')).toBe(true);
  });
});
