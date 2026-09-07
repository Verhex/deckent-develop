import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';

import {
  createAgentSession,
  type AgentSession,
  type AgentSessionEvent,
} from '../../src/agent/session.js';
import type { PermissionRequestEvent } from '../../src/agent/events.js';
import { bindNativePermissionIntent, createNativePermissionInvocation } from '../../src/agent/native-permission-binding.js';
import type { PermissionResponse } from '../../src/agent/loop.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';

function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let index = 0;
  return {
    name: 'native-permission-session-test',
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

function writerRegistry(_args: Record<string, unknown>, handler: () => Promise<{ ok: boolean; output: string }>): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: 'writer',
    description: 'writer',
    inputSchema: { type: 'object' },
    category: 'coding',
    tier: 'confirm',
    source: 'builtin',
    approval: (candidate) => typeof candidate['path'] === 'string'
      ? { scope: 'file-write', risk: 'high', scopeId: 'writer', resource: candidate['path'] }
      : null,
    handler: async () => handler(),
  });
  return registry;
}

function makeSession(input: {
  scripts: ProviderEvent[][];
  args?: Record<string, unknown>;
  handler?: () => Promise<{ ok: boolean; output: string }>;
  ruleStore?: RuleStore;
  scratchSessionId?: string;
}): AgentSession {
  const args = input.args ?? { path: 'a.txt' };
  return createAgentSession({
    adapter: scripted(input.scripts),
    registry: writerRegistry(args, input.handler ?? (async () => ({ ok: true, output: 'wrote' }))),
    policy: SAFE_DEFAULT_POLICY,
    ruleStore: input.ruleStore ?? rules(),
    cwd: tmpdir(),
    model: 'm',
    ...(input.scratchSessionId
      ? {
          scratch: {
            tenantId: 'tenant', projectId: 'project', sessionId: input.scratchSessionId,
            checkpointInstruction: 'checkpoint',
          },
        }
      : {}),
  });
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

const oneWriterTurn = (id = 'same-call', args: Record<string, unknown> = { path: 'a.txt' }): ProviderEvent[] => [
  { type: 'tool-call', id, name: 'writer', args },
  { type: 'done' },
];

describe('native permission session binding', () => {
  it('registers before yield, accepts one exact early response, and rejects duplicates', async () => {
    let handled = 0;
    const session = makeSession({
      scripts: [oneWriterTurn(), [{ type: 'done' }]],
      handler: async () => { handled++; return { ok: true, output: 'wrote' }; },
    });
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);

    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.invocation)).toBe(true);
    expect(Object.isFrozen(request.approval)).toBe(true);
    expect(session.validatePermissionRequest(request)).toBe(true);
    expect(session.respondPermission(request, bound(request, 'session'))).toEqual({ ok: true });
    expect(session.respondPermission(request, bound(request, 'session'))).toEqual({
      ok: false, reasonCode: 'PERMISSION_DUPLICATE',
    });

    const events = await drain(iterator);
    expect(events).toContainEqual({ type: 'tool-result', id: 'same-call', tool: 'writer', ok: true, output: 'wrote' });
    expect(handled).toBe(1);
  });

  it('rejects unknown and modified invocations without caching an unissued answer', async () => {
    const session = makeSession({ scripts: [oneWriterTurn()] });
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    const unknownInvocation = createNativePermissionInvocation({
      ...request.invocation,
      invocationId: 'unknown-invocation',
      rawArgs: { path: 'a.txt' },
    });
    const unknown = Object.freeze({ ...request, invocation: unknownInvocation });
    expect(session.respondPermission(unknown, bound(unknown))).toEqual({
      ok: false, reasonCode: 'PERMISSION_UNKNOWN',
    });
    const modified = Object.freeze({ ...request, approval: Object.freeze({ ...request.approval, risk: 'critical' as const }) });
    expect(session.respondPermission(modified, bound(request))).toEqual({
      ok: false, reasonCode: 'PERMISSION_MODIFIED',
    });
    session.cancel();
    await drain(iterator);
  });

  it('returns typed boundary outcomes for malformed JSON-shaped request and response values', async () => {
    const session = makeSession({ scripts: [oneWriterTurn(), [{ type: 'done' }]] });
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    expect(session.validatePermissionRequest({} as PermissionRequestEvent)).toBe(false);
    expect(session.claimPermissionEffect(
      {} as PermissionRequestEvent,
      {} as PermissionResponse,
      {},
    )).toBe(false);
    expect(session.respondPermission({} as PermissionRequestEvent, bound(request))).toEqual({
      ok: false, reasonCode: 'PERMISSION_UNKNOWN',
    });
    expect(session.respondPermission(request, null as unknown as PermissionResponse)).toEqual({
      ok: false, reasonCode: 'PERMISSION_RESPONSE_INVALID',
    });
    expect(session.respondPermission(request, { decision: 'unknown' } as unknown as PermissionResponse)).toEqual({
      ok: false, reasonCode: 'PERMISSION_RESPONSE_INVALID',
    });
    expect(session.respondPermission(request, bound(request))).toEqual({ ok: true });
    await drain(iterator);
  });

  it('retires accepted and pending authority on turn replacement despite reused provider call ids', async () => {
    const session = makeSession({
      scripts: [oneWriterTurn('reused'), oneWriterTurn('reused'), [{ type: 'done' }]],
    });
    const firstIterator = session.send('first')[Symbol.asyncIterator]();
    const first = await nextPermission(firstIterator);
    expect(session.respondPermission(first, bound(first))).toEqual({ ok: true });

    const secondIterator = session.send('second')[Symbol.asyncIterator]();
    const second = await nextPermission(secondIterator);
    expect(second.id).toBe(first.id);
    expect(second.invocation.invocationId).not.toBe(first.invocation.invocationId);
    expect(second.invocation.turnGeneration).toBeGreaterThan(first.invocation.turnGeneration);
    expect(session.respondPermission(first, bound(first))).toEqual({
      ok: false, reasonCode: 'PERMISSION_STALE',
    });
    expect(session.claimPermissionEffect(first, bound(first), { path: 'a.txt' })).toBe(false);
    session.cancel();
    await Promise.all([drain(firstIterator), drain(secondIterator)]);
  });

  it('rehashes session-owned args before response and performs no grant or handler on mutation', async () => {
    const rawArgs: Record<string, unknown> = { path: 'a.txt', content: 'old' };
    let grants = 0;
    let handled = 0;
    const session = makeSession({
      scripts: [oneWriterTurn('mutated', rawArgs)],
      args: rawArgs,
      ruleStore: rules({ grant: () => { grants++; } }),
      handler: async () => { handled++; return { ok: true, output: 'wrote' }; },
    });
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    rawArgs['content'] = 'changed';
    expect(session.validatePermissionRequest(request)).toBe(false);
    expect(session.respondPermission(request, bound(request, 'session'))).toEqual({
      ok: false, reasonCode: 'PERMISSION_MODIFIED',
    });
    session.cancel();
    await drain(iterator);
    expect(grants).toBe(0);
    expect(handled).toBe(0);
  });

  it('rechecks live deny policy before grant and keeps the transcript paired', async () => {
    const denies: { tool: string; pattern: string }[] = [];
    let grants = 0;
    let handled = 0;
    const session = makeSession({
      scripts: [oneWriterTurn('policy'), [{ type: 'done' }]],
      ruleStore: rules({
        grant: () => { grants++; },
        activeDenies: () => [...denies],
      }),
      handler: async () => { handled++; return { ok: true, output: 'wrote' }; },
    });
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    expect(session.respondPermission(request, bound(request, 'session'))).toEqual({ ok: true });
    denies.push({ tool: 'writer', pattern: '**' });
    const events = await drain(iterator);
    expect(events).toContainEqual({
      type: 'tool-result', id: 'policy', tool: 'writer', ok: false,
      output: 'native.permission.no-longer-current', code: 'native.permission.no-longer-current',
    });
    expect(grants).toBe(0);
    expect(handled).toBe(0);
    const messages = session.transcript();
    expect(messages.filter((message) => message.role === 'tool').map((message) => message.toolCallId)).toContain('policy');
  });

  it('rechecks args after tool-executing yield and consumes no effect on mutation', async () => {
    const rawArgs: Record<string, unknown> = { path: 'a.txt', content: 'old' };
    let handled = 0;
    const session = makeSession({
      scripts: [oneWriterTurn('before-effect', rawArgs), [{ type: 'done' }]],
      args: rawArgs,
      handler: async () => { handled++; return { ok: true, output: 'wrote' }; },
    });
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    session.respondPermission(request, bound(request));
    const executing = await iterator.next();
    expect(executing.value).toEqual({ type: 'tool-executing', id: 'before-effect', tool: 'writer' });
    rawArgs['content'] = 'changed-after-auth';
    const events = await drain(iterator);
    expect(events).toContainEqual({
      type: 'tool-result', id: 'before-effect', tool: 'writer', ok: false,
      output: 'native.permission.no-longer-current', code: 'native.permission.no-longer-current',
    });
    expect(handled).toBe(0);
  });

  it('cancels after tool-executing without running the handler and preserves pairing', async () => {
    let handled = 0;
    const session = makeSession({
      scripts: [oneWriterTurn('cancel-effect')],
      handler: async () => { handled++; return { ok: true, output: 'wrote' }; },
    });
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    session.respondPermission(request, bound(request));
    expect((await iterator.next()).value).toEqual({ type: 'tool-executing', id: 'cancel-effect', tool: 'writer' });
    session.cancel();
    const events = await drain(iterator);
    expect(events).toContainEqual({ type: 'tool-result', id: 'cancel-effect', tool: 'writer', ok: false, output: '[cancelled]' });
    expect(handled).toBe(0);
    expect(session.transcript().filter((message) => message.role === 'tool').map((message) => message.toolCallId)).toContain('cancel-effect');
  });

  it('maps an unconfirmed terminal restoration hold to a structured zero-effect result', async () => {
    let handled = 0;
    const session = makeSession({
      scripts: [oneWriterTurn('terminal-unavailable'), [{ type: 'done' }]],
      handler: async () => { handled++; return { ok: true, output: 'must-not-run' }; },
    });
    const events: AgentSessionEvent[] = [];
    for await (const event of session.send('go')) {
      events.push(event);
      if (event.type === 'permission-request') {
        expect(session.respondPermission(event, {
          decision: 'hold',
          reasonCode: 'terminal-restoration-unconfirmed',
        })).toEqual({ ok: true });
      }
    }
    expect(events).toContainEqual({
      type: 'tool-result', id: 'terminal-unavailable', tool: 'writer', ok: false,
      output: 'native.permission.terminal-unavailable', code: 'native.permission.terminal-unavailable',
    });
    expect(events.some((event) => event.type === 'tool-executing')).toBe(false);
    expect(handled).toBe(0);
    expect(session.transcript().filter((message) => message.role === 'tool').map((message) => message.toolCallId))
      .toContain('terminal-unavailable');
  });

  it('keeps cancellation authoritative when terminal restoration HOLD arrives late', async () => {
    let handled = 0;
    const session = makeSession({
      scripts: [oneWriterTurn('cancel-before-restoration')],
      handler: async () => { handled++; return { ok: true, output: 'must-not-run' }; },
    });
    const iterator = session.send('go')[Symbol.asyncIterator]();
    const request = await nextPermission(iterator);
    session.cancel();
    expect(session.respondPermission(request, {
      decision: 'hold',
      reasonCode: 'terminal-restoration-unconfirmed',
    })).toEqual({ ok: false, reasonCode: 'PERMISSION_STALE' });
    const events = await drain(iterator);
    expect(events).toContainEqual({
      type: 'tool-result', id: 'cancel-before-restoration', tool: 'writer', ok: false, output: '[cancelled]',
    });
    expect(events.some((event) => event.type === 'tool-result'
      && event.code === 'native.permission.terminal-unavailable')).toBe(false);
    expect(handled).toBe(0);
  });

  it('derives nested identity from the active parent and consumes one exact nested effect', async () => {
    let session: AgentSession;
    let callbackCount = 0;
    let nestedEffects = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: 'outer', description: 'outer', inputSchema: { type: 'object' }, category: 'coding',
      tier: 'silent', source: 'builtin',
      handler: async () => {
        const nestedArgs = { path: 'nested.txt' };
        const result = await session.requestNestedPermission({
          tool: 'nested-writer', rawArgs: nestedArgs, resource: 'nested.txt', tier: 'confirm', elevated: false,
          approval: { scope: 'file-write', risk: 'high', scopeId: 'nested-writer', resource: 'nested.txt' },
        }, async (request) => {
          callbackCount++;
          expect(session.validatePermissionRequest(request)).toBe(true);
          return bound(request);
        });
        if (result.kind === 'resolved'
          && result.response.decision !== 'deny'
          && session.claimPermissionEffect(result.request, result.response, nestedArgs)) nestedEffects++;
        if (result.kind === 'resolved') {
          expect(session.claimPermissionEffect(result.request, result.response, nestedArgs)).toBe(false);
          expect(result.request.invocation.callId).toBe('outer-call');
          expect(result.request.invocation.nested).toBe(true);
        }
        return { ok: true, output: result.kind };
      },
    });
    session = createAgentSession({
      adapter: scripted([
        [{ type: 'tool-call', id: 'outer-call', name: 'outer', args: {} }, { type: 'done' }],
        [{ type: 'done' }],
      ]),
      registry,
      policy: SAFE_DEFAULT_POLICY,
      ruleStore: rules(),
      cwd: tmpdir(),
      model: 'm',
    });
    for await (const _event of session.send('go')) { /* drain */ }
    expect(callbackCount).toBe(1);
    expect(nestedEffects).toBe(1);
    const outside = await session.requestNestedPermission({
      tool: 'nested-writer', rawArgs: { path: 'nested.txt' }, resource: 'nested.txt', tier: 'confirm', elevated: false,
      approval: { scope: 'file-write', risk: 'high', scopeId: 'nested-writer', resource: 'nested.txt' },
    }, async () => { throw new Error('must not run'); });
    expect(outside).toEqual({ kind: 'hold', reasonCode: 'PERMISSION_PARENT_INACTIVE' });
  });

  it('uses the logical scratch session id but a fresh process identity per session', async () => {
    const scripts = [oneWriterTurn('identity')];
    const first = makeSession({ scripts, scratchSessionId: 'logical-session' });
    const second = makeSession({ scripts, scratchSessionId: 'logical-session' });
    const firstIterator = first.send('first')[Symbol.asyncIterator]();
    const secondIterator = second.send('second')[Symbol.asyncIterator]();
    const firstRequest = await nextPermission(firstIterator);
    const secondRequest = await nextPermission(secondIterator);
    expect(firstRequest.invocation.sessionId).toBe('logical-session');
    expect(secondRequest.invocation.sessionId).toBe('logical-session');
    expect(firstRequest.invocation.sessionInstanceId).not.toBe(secondRequest.invocation.sessionInstanceId);
    first.cancel();
    second.cancel();
    await Promise.all([drain(firstIterator), drain(secondIterator)]);
  });

  it('preserves exact whitespace and empty producer resources without normalizing identity', async () => {
    const registry = new ToolRegistry();
    const observed: string[] = [];
    registry.register({
      name: 'spaced-writer', description: 'spaced', inputSchema: { type: 'object' }, category: 'coding',
      tier: 'confirm', source: 'builtin',
      approval: (args) => typeof args['path'] === 'string'
        ? { scope: 'file-write', risk: 'high', scopeId: 'spaced-writer', resource: args['path'] }
        : null,
      handler: async (args) => { observed.push(String(args['path'])); return { ok: true, output: 'spaced' }; },
    });
    registry.register({
      name: 'metadata-only', description: 'metadata', inputSchema: { type: 'object' }, category: 'coding',
      tier: 'confirm', source: 'builtin',
      approval: () => ({ scope: 'git-mutation', risk: 'high', scopeId: 'metadata-only', resource: '' }),
      handler: async () => { observed.push('empty'); return { ok: true, output: 'metadata' }; },
    });
    const session = createAgentSession({
      adapter: scripted([
        [
          { type: 'tool-call', id: 'space', name: 'spaced-writer', args: { path: '  spaced name  ' } },
          { type: 'tool-call', id: 'empty', name: 'metadata-only', args: { message: 'commit' } },
          { type: 'done' },
        ],
        [{ type: 'done' }],
      ]),
      registry,
      policy: SAFE_DEFAULT_POLICY,
      ruleStore: rules(),
      cwd: tmpdir(),
      model: 'm',
    });
    const resources: string[] = [];
    for await (const event of session.send('go')) {
      if (event.type !== 'permission-request') continue;
      resources.push(event.resource);
      expect(session.respondPermission(event, bound(event))).toEqual({ ok: true });
    }
    expect(resources).toEqual(['  spaced name  ', '']);
    expect(observed).toEqual(['  spaced name  ', 'empty']);
  });

  it('holds an ask-tier tool with unavailable producer classification before any prompt or effect', async () => {
    let handled = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: 'unclassified', description: 'unclassified', inputSchema: { type: 'object' }, category: 'coding',
      tier: 'confirm', source: 'builtin',
      handler: async () => { handled++; return { ok: true, output: 'unsafe' }; },
    });
    const session = createAgentSession({
      adapter: scripted([
        [{ type: 'tool-call', id: 'unclassified-call', name: 'unclassified', args: {} }, { type: 'done' }],
        [{ type: 'done' }],
      ]),
      registry,
      policy: SAFE_DEFAULT_POLICY,
      ruleStore: rules(),
      cwd: tmpdir(),
      model: 'm',
    });
    const events: AgentSessionEvent[] = [];
    for await (const event of session.send('go')) events.push(event);
    expect(events.some((event) => event.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual({
      type: 'tool-result', id: 'unclassified-call', tool: 'unclassified', ok: false,
      output: 'native.permission.classification-unavailable', code: 'native.permission.classification-unavailable',
    });
    expect(handled).toBe(0);
  });
});
