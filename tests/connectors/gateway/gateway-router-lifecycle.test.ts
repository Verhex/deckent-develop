import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveApprovalLifecyclePolicy } from '../../../src/core/approval-lifecycle-policy.js';
import {
  makeGatewayRouter,
  type GatewayRouterDeps,
} from '../../../src/connectors/gateway/gateway-router.js';
import { loadProjectRegistry } from '../../../src/connectors/gateway/project-registry.js';
import { loadSessionRegistry } from '../../../src/connectors/gateway/session-registry.js';
import type { IncomingMessage } from '../../../src/connectors/types.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition was not observed');
}

async function fixture(overrides: Partial<GatewayRouterDeps> = {}): Promise<{
  deps: GatewayRouterDeps;
  sent: string[];
}> {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-router-lifecycle-'));
  const sessions = await loadSessionRegistry({ path: join(dir, 'sessions.json') });
  const projects = await loadProjectRegistry({ path: join(dir, 'projects.json') });
  await projects.add('alpha', '/projects/alpha');
  const sent: string[] = [];
  return {
    sent,
    deps: {
      sessions,
      projects,
      supervisor: {
        getOrSpawn: () => ({ projectPath: '/projects/alpha', send: async () => ({ id: 'response', kind: 'final', parts: [] }) }),
        dispose: async () => {},
      },
      send: async (_chatKey, parts) => { sent.push(...parts); },
      isAuthorized: () => false,
      requestPairing: async () => ({
        state: 'PENDING', pairingId: 'gwp-router', code: 'ROUTER42', expiresAt: '2026-08-21T10:10:00.000Z', reused: false,
      }),
      resolvePairingScope: async (_chatKey, projectPath) => ({
        tenantId: 'tenant-router',
        projectPath,
        lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
        lifecycleGeneration: 'gateway-config:3',
      }),
      lang: 'en',
      newId: () => 'gateway-message',
      ...overrides,
    },
  };
}

function useMessage(): IncomingMessage {
  return {
    id: 'incoming-1',
    connector: 'telegram',
    fromUser: 'operator',
    channelId: '42',
    text: '/use alpha',
    timestamp: '2026-08-21T10:00:00.000Z',
  };
}

describe('gateway router lifecycle producer', () => {
  it('passes the resolved tenant and canonical project scope to pairing creation', async () => {
    let observed: { chatKey: string; tenantId?: string; projectPath?: string } | undefined;
    const { deps, sent } = await fixture({
      requestPairing: async (chatKey, scope) => {
        observed = { chatKey, tenantId: scope?.tenantId, projectPath: scope?.projectPath };
        return { state: 'PENDING', pairingId: 'gwp-router', code: 'ROUTER42', expiresAt: '2026-08-21T10:10:00.000Z', reused: false };
      },
    });
    makeGatewayRouter(deps)(useMessage());
    await waitFor(() => sent.length > 0);
    expect(observed).toEqual({ chatKey: 'telegram:42', tenantId: 'tenant-router', projectPath: '/projects/alpha' });
    expect(sent.join(' ')).toContain('ROUTER42');
    expect(deps.sessions.resolve('telegram:42')).toBeUndefined();
  });

  it('fails closed without tenant lifecycle authority and never creates an unscoped pairing', async () => {
    let calls = 0;
    const { deps, sent } = await fixture({
      resolvePairingScope: async () => null,
      requestPairing: async () => {
        calls += 1;
        return { state: 'HOLD', reasonCode: 'invalid-scope' };
      },
    });
    makeGatewayRouter(deps)(useMessage());
    await waitFor(() => sent.length > 0);
    expect(calls).toBe(0);
    expect(sent.join(' ')).toContain(getMessage('approvals.lifecycle_disabled', 'en'));
  });
});
