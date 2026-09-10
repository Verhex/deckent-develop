import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createAgentSession,
  type AgentSessionEvent,
} from '../../src/agent/session.js';
import type { PermissionRequestEvent } from '../../src/agent/events.js';
import {
  bindNativePermissionIntent,
  createNativePermissionInvocation,
} from '../../src/agent/native-permission-binding.js';
import type { PermissionResponse } from '../../src/agent/loop.js';
import { permissionResource } from '../../src/agent/native-permission-resource.js';
import { createParityExecImpl } from '../../src/cli/repl/native-agent-bridge.js';
import type { PermissionRequestEvent } from '../../src/agent/events.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';

function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let index = 0;
  return {
    name: 'native-read-approval-registry-test',
    async *send() {
      for (const event of scripts[index++] ?? [{ type: 'done' }]) yield event;
    },
  };
}

function rules(over: Partial<RuleStore> = {}): RuleStore {
  return {
    grant: () => {},
    revoke: () => {},
    activeRules: () => [],
    activeDenies: () => [],
    ...over,
  };
}

function fixtureCwd(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'deckent-read-approval-'));
  writeFileSync(join(cwd, 'README.md'), 'readme\n');
  writeFileSync(join(cwd, 'a.md'), 'hello\n');
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  writeFileSync(join(cwd, 'docs', 'a.md'), 'doc\n');
  mkdirSync(join(cwd, 'src'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'x.ts'), 'export {}\n');
  writeFileSync(join(cwd, 'needle.txt'), 'find-me\n');
  return cwd;
}

function bound(
  request: PermissionRequestEvent,
  decision: 'once' | 'session' | 'always' | 'deny' = 'once',
): PermissionResponse {
  return {
    decision,
    binding: bindNativePermissionIntent(
      request.invocation,
      decision === 'deny' ? 'once' : decision,
      request.resource,
    ),
  };
}

async function nextPermission(iterator: AsyncIterator<AgentSessionEvent>): Promise<PermissionRequestEvent> {
  for (;;) {
    const item = await iterator.next();
    if (item.done) throw new Error('permission request missing');
    if (item.value.type === 'permission-request') return item.value;
  }
}

async function drain(iterator: AsyncIterator<AgentSessionEvent>): Promise<AgentSessionEvent[]> {
  const events: AgentSessionEvent[] = [];
  for (;;) {
    const item = await iterator.next();
    if (item.done) return events;
    events.push(item.value);
  }
}

function sessionFor(cwd: string, scripts: ProviderEvent[][], policy = SAFE_DEFAULT_POLICY) {
  return createAgentSession({
    adapter: scripted(scripts),
    registry: buildNativeToolRegistry({ cwd: () => cwd }),
    policy,
    ruleStore: rules(),
    cwd,
    model: 'm',
  });
}

describe('permissionResource parity with read classifiers', () => {
  it('matches list_dir default path and grep/glob pattern fallbacks', () => {
    expect(permissionResource('deckent_list_dir', {})).toBe('.');
    expect(permissionResource('deckent_list_dir', { path: 'src' })).toBe('src');
    expect(permissionResource('deckent_list_dir', { path: '  private  ' })).toBe('  private  ');
    expect(permissionResource('deckent_list_dir', { file_path: 'docs' })).toBe('.');
    expect(permissionResource('deckent_list_dir', { path: 42 })).toBe('42');
    expect(permissionResource('deckent_grep', { pattern: 'x', path: 42 })).toBe('42');
    expect(permissionResource('deckent_grep', { pattern: 'foo', path: 'src' })).toBe('src');
    expect(permissionResource('deckent_grep', { path: '.', pattern: 'needle' })).toBe('.');
    expect(permissionResource('deckent_grep', { pattern: 'needle' })).toBe('needle');
    expect(permissionResource('deckent_glob', { pattern: '**/*.ts' })).toBe('**/*.ts');
    expect(permissionResource('deckent_grep', { pattern: 'find-me' })).toBe('find-me');
  });
});

describe('native read approval — buildNativeToolRegistry + runAgentTurn', () => {
  it('auto-allows silent deckent_read_file without a permission prompt', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(cwd, [
      [{ type: 'tool-call', id: 'r1', name: 'deckent_read_file', args: { path: 'docs/a.md' } }, { type: 'done' }],
      [{ type: 'done' }],
    ]);
    const events = await drain(session.send('go')[Symbol.asyncIterator]());
    expect(events.some((e) => e.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-result', id: 'r1', tool: 'deckent_read_file', ok: true,
    }));
  });

  it('auto-allows deckent_list_dir with empty args (cwd default resource ".")', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(cwd, [
      [{ type: 'tool-call', id: 'ld1', name: 'deckent_list_dir', args: {} }, { type: 'done' }],
      [{ type: 'done' }],
    ]);
    const events = await drain(session.send('go')[Symbol.asyncIterator]());
    expect(events.some((e) => e.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-result', id: 'ld1', tool: 'deckent_list_dir', ok: true,
    }));
  });

  it('prompts on tierMap confirm for deckent_read_file and runs after grant', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(
      cwd,
      [
        [{ type: 'tool-call', id: 'r2', name: 'deckent_read_file', args: { path: 'src/x.ts' } }, { type: 'done' }],
        [{ type: 'done' }],
      ],
      { ...SAFE_DEFAULT_POLICY, tierMap: { deckent_read_file: 'confirm' } },
    );
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    expect(request.tool).toBe('deckent_read_file');
    expect(request.resource).toBe('src/x.ts');
    expect(session.respondPermission(request, bound(request))).toEqual({ ok: true });
    const events = await drain(iterator);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-result', id: 'r2', tool: 'deckent_read_file', ok: true,
    }));
  });

  it('prompts on tierMap confirm for deckent_list_dir {} with resource "."', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(
      cwd,
      [
        [{ type: 'tool-call', id: 'ld2', name: 'deckent_list_dir', args: {} }, { type: 'done' }],
        [{ type: 'done' }],
      ],
      { ...SAFE_DEFAULT_POLICY, tierMap: { deckent_list_dir: 'confirm' } },
    );
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    expect(request.tool).toBe('deckent_list_dir');
    expect(request.resource).toBe('.');
    expect(session.respondPermission(request, bound(request))).toEqual({ ok: true });
    await drain(iterator);
  });

  it('asks on alwaysFloor even when the tool tier is silent, and deny skips execution', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(
      cwd,
      [
        [{ type: 'tool-call', id: 'r3', name: 'deckent_read_file', args: { path: 'README.md' } }, { type: 'done' }],
        [{ type: 'done' }],
      ],
      { ...SAFE_DEFAULT_POLICY, alwaysFloor: [...SAFE_DEFAULT_POLICY.alwaysFloor, 'deckent_read_file'] },
    );
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    expect(request.tool).toBe('deckent_read_file');
    expect(session.respondPermission(request, bound(request, 'deny'))).toEqual({ ok: true });
    const events = await drain(iterator);
    expect(events.some((e) => e.type === 'tool-result' && e.ok === true)).toBe(false);
  });

  it('fail-closes invalid deckent_read_file args on confirm tier (no handler, no prompt)', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(
      cwd,
      [
        [{ type: 'tool-call', id: 'r4', name: 'deckent_read_file', args: {} }, { type: 'done' }],
        [{ type: 'done' }],
      ],
      { ...SAFE_DEFAULT_POLICY, tierMap: { deckent_read_file: 'confirm' } },
    );
    const events = await drain(session.send('go')[Symbol.asyncIterator]());
    expect(events.some((e) => e.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-result', id: 'r4', tool: 'deckent_read_file', ok: false,
      code: 'native.permission.classification-unavailable',
    }));
  });

  it('prompts on confirm tier for numeric list_dir path with resource "42" (not cwd ".")', async () => {
    const cwd = fixtureCwd();
    mkdirSync(join(cwd, '42'), { recursive: true });
    writeFileSync(join(cwd, '42', 'n.txt'), 'n\n');
    const session = sessionFor(
      cwd,
      [
        [{ type: 'tool-call', id: 'ld5', name: 'deckent_list_dir', args: { path: 42 } }, { type: 'done' }],
        [{ type: 'done' }],
      ],
      { ...SAFE_DEFAULT_POLICY, tierMap: { deckent_list_dir: 'confirm' } },
    );
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    expect(request.resource).toBe('42');
    expect(session.respondPermission(request, bound(request))).toEqual({ ok: true });
    await drain(iterator);
  });

  it('fail-closes list_dir file_path alias on confirm tier (dispatcher uses path only)', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(
      cwd,
      [
        [{ type: 'tool-call', id: 'ld3', name: 'deckent_list_dir', args: { file_path: 'docs' } }, { type: 'done' }],
        [{ type: 'done' }],
      ],
      { ...SAFE_DEFAULT_POLICY, tierMap: { deckent_list_dir: 'confirm' } },
    );
    const events = await drain(session.send('go')[Symbol.asyncIterator]());
    expect(events.some((e) => e.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-result', id: 'ld3', ok: false, code: 'native.permission.classification-unavailable',
    }));
  });

  it('prompts on confirm tier for whitespace list_dir path without trimming resource', async () => {
    const cwd = fixtureCwd();
    mkdirSync(join(cwd, '  private  '), { recursive: true });
    writeFileSync(join(cwd, '  private  ', 'inside.txt'), 'x\n');
    const session = sessionFor(
      cwd,
      [
        [{ type: 'tool-call', id: 'ld4', name: 'deckent_list_dir', args: { path: '  private  ' } }, { type: 'done' }],
        [{ type: 'done' }],
      ],
      { ...SAFE_DEFAULT_POLICY, tierMap: { deckent_list_dir: 'confirm' } },
    );
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    expect(request.resource).toBe('  private  ');
    expect(session.respondPermission(request, bound(request))).toEqual({ ok: true });
    await drain(iterator);
  });

  it('prompts on confirm tier for pattern-only deckent_grep and runs after grant', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(
      cwd,
      [
        [{ type: 'tool-call', id: 'g3', name: 'deckent_grep', args: { pattern: 'find-me' } }, { type: 'done' }],
        [{ type: 'done' }],
      ],
      { ...SAFE_DEFAULT_POLICY, tierMap: { deckent_grep: 'confirm' } },
    );
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    expect(request.tool).toBe('deckent_grep');
    expect(request.resource).toBe('find-me');
    expect(session.respondPermission(request, bound(request))).toEqual({ ok: true });
    const events = await drain(iterator);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'g3', ok: true }));
  });

  it('alwaysFloor on deckent_glob denies without executing', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(
      cwd,
      [
        [{ type: 'tool-call', id: 'g4', name: 'deckent_glob', args: { pattern: '*.txt' } }, { type: 'done' }],
        [{ type: 'done' }],
      ],
      { ...SAFE_DEFAULT_POLICY, alwaysFloor: [...SAFE_DEFAULT_POLICY.alwaysFloor, 'deckent_glob'] },
    );
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    expect(request.resource).toBe('*.txt');
    expect(session.respondPermission(request, bound(request, 'deny'))).toEqual({ ok: true });
    const events = await drain(iterator);
    expect(events.some((e) => e.type === 'tool-result' && e.id === 'g4' && e.ok === true)).toBe(false);
  });

  it('denies deckent_grep when explicit path "." matches a deny rule (no handler run)', async () => {
    const cwd = fixtureCwd();
    const session = createAgentSession({
      adapter: scripted([
        [{ type: 'tool-call', id: 'gd', name: 'deckent_grep', args: { path: '.', pattern: 'find-me' } }, { type: 'done' }],
        [{ type: 'done' }],
      ]),
      registry: buildNativeToolRegistry({ cwd: () => cwd }),
      policy: SAFE_DEFAULT_POLICY,
      ruleStore: rules({ activeDenies: () => [{ tool: 'deckent_grep', pattern: '.' }] }),
      cwd,
      model: 'm',
    });
    const events = await drain(session.send('go')[Symbol.asyncIterator]());
    expect(events.some((e) => e.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-result', id: 'gd', ok: false, output: '[denied by policy]',
    }));
  });

  it('runs deckent_grep and deckent_glob silently when args classify', async () => {
    const cwd = fixtureCwd();
    const session = sessionFor(cwd, [
      [
        { type: 'tool-call', id: 'g1', name: 'deckent_grep', args: { pattern: 'find-me', path: '.' } },
        { type: 'tool-call', id: 'g2', name: 'deckent_glob', args: { pattern: '*.txt' } },
        { type: 'done' },
      ],
      [{ type: 'done' }],
    ]);
    const events = await drain(session.send('go')[Symbol.asyncIterator]());
    expect(events.some((e) => e.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'g1', ok: true }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool-result', id: 'g2', ok: true }));
  });
});

describe('nested call_tool parity — read resource identity', () => {
  function parityExec(cwd: string, tierMap: Record<string, 'confirm'>) {
    const reg = buildNativeToolRegistry({ cwd: () => cwd });
    return createParityExecImpl({
      registry: reg,
      policy: { ...SAFE_DEFAULT_POLICY, tierMap },
      ruleStore: rules(),
      getMode: () => 'suggest',
      cwd,
      t: (k) => k,
      requestNestedPermission: async (input, decidePermission) => {
        const invocation = createNativePermissionInvocation({
          sessionId: 's',
          sessionInstanceId: 'i',
          turnGeneration: 1,
          invocationId: 'inv-nested',
          callId: 'parent',
          tool: input.tool,
          rawArgs: input.rawArgs,
          tier: input.tier,
          elevated: input.elevated,
          nested: true,
        });
        const request = {
          type: 'permission-request',
          id: 'parent',
          tool: input.tool,
          resource: input.resource,
          tier: input.tier,
          elevated: input.elevated,
          nested: true,
          invocation,
          approval: input.approval,
        } satisfies PermissionRequestEvent;
        const response = await decidePermission(request);
        return { kind: 'decided' as const, request, response };
      },
      claimPermissionEffect: () => true,
      decidePermission: async (request) => ({
        decision: 'once',
        binding: bindNativePermissionIntent(request.invocation, 'once', request.resource),
      }),
    });
  }

  it('nested parity denies deckent_grep when explicit path "." matches deny glob', async () => {
    const cwd = fixtureCwd();
    const reg = buildNativeToolRegistry({ cwd: () => cwd });
    const exec = createParityExecImpl({
      registry: reg,
      policy: SAFE_DEFAULT_POLICY,
      ruleStore: rules({ activeDenies: () => [{ tool: 'deckent_grep', pattern: '.' }] }),
      getMode: () => 'suggest',
      cwd,
      t: (k) => k,
    });
    await expect(exec({ name: 'deckent_grep', args: { path: '.', pattern: 'find-me' } }))
      .rejects.toThrow(/denied by policy/);
  });

  it('fail-closes file_path alias on nested list_dir (same as direct loop)', async () => {
    const cwd = fixtureCwd();
    const exec = parityExec(cwd, { deckent_list_dir: 'confirm' });
    await expect(exec({ name: 'deckent_list_dir', args: { file_path: 'docs' } }))
      .rejects.toThrow(/denied by policy/);
  });

  it('nested confirm deckent_grep pattern-only uses pattern as permission resource', async () => {
    const cwd = fixtureCwd();
    const resources: string[] = [];
    const reg = buildNativeToolRegistry({ cwd: () => cwd });
    const exec = createParityExecImpl({
      registry: reg,
      policy: { ...SAFE_DEFAULT_POLICY, tierMap: { deckent_grep: 'confirm' } },
      ruleStore: rules(),
      getMode: () => 'suggest',
      cwd,
      t: (k) => k,
      requestNestedPermission: async (input, decidePermission) => {
        resources.push(input.resource);
        const invocation = createNativePermissionInvocation({
          sessionId: 's',
          sessionInstanceId: 'i',
          turnGeneration: 1,
          invocationId: 'inv-nested',
          callId: 'parent',
          tool: input.tool,
          rawArgs: input.rawArgs,
          tier: input.tier,
          elevated: input.elevated,
          nested: true,
        });
        const request = {
          type: 'permission-request',
          id: 'parent',
          tool: input.tool,
          resource: input.resource,
          tier: input.tier,
          elevated: input.elevated,
          nested: true,
          invocation,
          approval: input.approval,
        } satisfies PermissionRequestEvent;
        const response = await decidePermission(request);
        return { kind: 'decided' as const, request, response };
      },
      claimPermissionEffect: () => true,
      decidePermission: async (request) => ({
        decision: 'once',
        binding: bindNativePermissionIntent(request.invocation, 'once', request.resource),
      }),
    });
    await exec({ name: 'deckent_grep', args: { pattern: 'find-me' } });
    expect(resources).toEqual(['find-me']);
  });
});
