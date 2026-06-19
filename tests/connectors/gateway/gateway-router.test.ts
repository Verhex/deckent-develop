// tests/connectors/gateway/gateway-router.test.ts
import { describe, it, expect } from 'vitest';
import { makeGatewayRouter, chatKeyOf, type GatewayRouterDeps } from '../../../src/connectors/gateway/gateway-router.js';
import { loadSessionRegistry } from '../../../src/connectors/gateway/session-registry.js';
import { loadProjectRegistry } from '../../../src/connectors/gateway/project-registry.js';
import type { IncomingMessage } from '../../../src/connectors/types.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function msg(text: string): IncomingMessage {
  return { id: '1', connector: 'telegram', fromUser: 'u1', channelId: '42', text, timestamp: '2026-06-20T00:00:00Z' };
}

async function deps(over: Partial<GatewayRouterDeps> = {}): Promise<{ d: GatewayRouterDeps; sent: Array<{ chatKey: string; parts: string[] }> }> {
  const dir = await mkdtemp(join(tmpdir(), 'gw-router-'));
  const sessions = await loadSessionRegistry({ path: join(dir, 's.json') });
  const projects = await loadProjectRegistry({ path: join(dir, 'p.json') });
  await projects.add('foo', '/home/me/foo');
  const sent: Array<{ chatKey: string; parts: string[] }> = [];
  const d: GatewayRouterDeps = {
    sessions, projects,
    supervisor: { getOrSpawn: () => ({ projectPath: '/home/me/foo', send: async () => ({ id: '1', kind: 'final', parts: ['runtime-reply'] }) }), dispose: async () => {} },
    send: async (chatKey, parts) => { sent.push({ chatKey, parts }); },
    isAuthorized: () => true,
    lang: 'en',
    newId: () => 'id1',
    ...over,
  };
  return { d, sent };
}

describe('gateway-router', () => {
  it('guides an unbound chat instead of routing', async () => {
    const { d, sent } = await deps();
    makeGatewayRouter(d)(msg('hello'));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent[0]!.parts.join(' ')).toContain('/use');
  });

  it('/use binds the chat to a project', async () => {
    const { d, sent } = await deps();
    makeGatewayRouter(d)(msg('/use foo'));
    await new Promise((r) => setTimeout(r, 0));
    expect(d.sessions.resolve(chatKeyOf('telegram', '42'))?.projectPath).toBe('/home/me/foo');
    expect(sent[0]!.parts.join(' ')).toContain('foo');
  });

  it('routes a natural-language message to the bound runtime', async () => {
    const { d, sent } = await deps();
    await d.sessions.bind(chatKeyOf('telegram', '42'), '/home/me/foo', 'u1');
    makeGatewayRouter(d)(msg('what is my sprint status?'));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent[0]!.parts.join('')).toBe('runtime-reply');
  });

  it('drops a message from an unauthorized chat', async () => {
    const { d, sent } = await deps({ isAuthorized: () => false });
    await d.sessions.bind(chatKeyOf('telegram', '42'), '/home/me/foo', 'u1');
    makeGatewayRouter(d)(msg('hi'));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toHaveLength(0);
  });
});
