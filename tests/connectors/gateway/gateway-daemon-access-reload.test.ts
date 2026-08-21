import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveApprovalLifecyclePolicy } from '../../../src/core/approval-lifecycle-policy.js';
import type { ResolvedConfig } from '../../../src/core/config-types.js';
import { BaseConnector } from '../../../src/connectors/base-connector.js';
import {
  resolveGatewayPairingScopeFromConfig,
  startGatewayListen,
} from '../../../src/connectors/gateway/gateway-daemon.js';
import { loadGatewayAccess } from '../../../src/connectors/gateway/gateway-access.js';
import { loadProjectRegistry } from '../../../src/connectors/gateway/project-registry.js';
import type { ConnectorConfig, IncomingMessage, OutgoingMessage } from '../../../src/connectors/types.js';

class FakeConnector extends BaseConnector {
  readonly id = 'telegram' as const;
  readonly name = 'Lifecycle gateway';
  readonly sent: OutgoingMessage[] = [];
  private handler?: (message: IncomingMessage) => void;

  async start(_config: ConnectorConfig): Promise<void> { this.started = true; }
  async sendMessage(message: OutgoingMessage): Promise<void> { this.sent.push(message); }
  isHealthy(): boolean { return true; }
  onMessage(handler: (message: IncomingMessage) => void): void { this.handler = handler; }
  inject(text: string): void {
    this.handler?.({
      id: `message-${this.sent.length}`,
      connector: 'telegram',
      fromUser: 'operator',
      channelId: '42',
      text,
      timestamp: '2026-08-21T10:00:00.000Z',
    });
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition was not observed');
}

afterEach(() => { delete process.env['DECKENT_GATEWAY_HOME']; });

describe('gateway daemon access reload', () => {
  it('observes a CLI-process approval from disk without daemon restart', async () => {
    const home = await mkdtemp(join(tmpdir(), 'gateway-daemon-reload-'));
    process.env['DECKENT_GATEWAY_HOME'] = home;
    const projects = await loadProjectRegistry();
    await projects.add('alpha', '/projects/alpha');
    const clock = () => new Date('2026-08-21T10:00:00.000Z');
    const daemonAccess = await loadGatewayAccess({ clock, genCode: () => 'DAEMON42', genPairingId: () => 'gwp-daemon' });
    const cliAccess = await loadGatewayAccess({ clock });
    const fake = new FakeConnector();
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const handle = await startGatewayListen({
      lang: 'en',
      gatewayToken: 'token',
      deps: {
        makeConnector: () => fake,
        loadAccess: async () => daemonAccess,
        resolvePairingScope: async (_chatKey, projectPath) => ({
          tenantId: 'tenant-daemon',
          projectPath,
          lifecycle,
          lifecycleGeneration: 'gateway-config:test',
        }),
        supervisor: {
          getOrSpawn: () => ({ projectPath: '/projects/alpha', send: async () => ({ id: 'reply', kind: 'final', parts: ['runtime'] }) }),
          dispose: async () => {},
        },
        waitForever: () => new Promise(() => {}),
        print: () => {},
      },
    });

    fake.inject('/use alpha');
    await waitFor(() => fake.sent.some((message) => message.text.includes('DAEMON42')));
    await expect(cliAccess.decidePairing('DAEMON42', 'approve', {
      tenantId: 'tenant-daemon', projectPath: '/projects/alpha',
    })).resolves.toMatchObject({ state: 'APPROVED' });

    fake.inject('/use alpha');
    await waitFor(() => fake.sent.some((message) => /bound|bağlan/iu.test(message.text)));
    expect(daemonAccess.isAuthorized('telegram:42', '/projects/alpha')).toBe(true);
    await handle.dispose();
  });

  it('resolves explicit tenant scope and refuses synthesis under strict isolation', () => {
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const explicit = {
      approval: { lifecycle },
      identity: { channels: { 'telegram:42': { tenantId: 'tenant-explicit', projectPath: '/projects/alpha', mode: 'tenant-locked' } } },
      strict_tenant_isolation: true,
    } as unknown as ResolvedConfig;
    expect(resolveGatewayPairingScopeFromConfig(explicit, 'telegram:42', '/projects/alpha')).toMatchObject({
      tenantId: 'tenant-explicit', projectPath: '/projects/alpha', lifecycleGeneration: expect.stringMatching(/^gateway-config:/u),
    });

    const missing = { approval: { lifecycle }, strict_tenant_isolation: true } as unknown as ResolvedConfig;
    expect(resolveGatewayPairingScopeFromConfig(missing, 'telegram:42', '/projects/alpha')).toBeNull();
  });
});
