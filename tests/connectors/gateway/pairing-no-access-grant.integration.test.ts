import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';

import { BaseConnector } from '../../../src/connectors/base-connector.js';
import { loadGatewayAccess, parseGatewayPairingStore } from '../../../src/connectors/gateway/gateway-access.js';
import { startGatewayListen } from '../../../src/connectors/gateway/gateway-daemon.js';
import { loadProjectRegistry } from '../../../src/connectors/gateway/project-registry.js';
import { listFederatedPendingItems } from '../../../src/core/approval-inbox-federation.js';
import { resolveApprovalLifecyclePolicy } from '../../../src/core/approval-lifecycle-policy.js';
import { readRevisionedJson } from '../../../src/core/approval-file-cas.js';
import type { ConnectorConfig, IncomingMessage, OutgoingMessage } from '../../../src/connectors/types.js';

const require = createRequire(import.meta.url);
const roots: string[] = [];

class FakeConnector extends BaseConnector {
  readonly id = 'telegram' as const;
  readonly name = 'Pairing integration connector';
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
      channelId: '40',
      text,
      timestamp: '2026-08-21T10:00:00.000Z',
    });
  }
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
  throw new Error('gateway integration condition was not observed');
}

async function bundleGatewayAccess(root: string): Promise<string> {
  const outfile = join(root, 'gateway-access.bundle.mjs');
  await build({
    entryPoints: [resolve('src/connectors/gateway/gateway-access.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    logLevel: 'silent',
  });
  return outfile;
}

async function expireAndAttemptLateInChild(input: {
  bundle: string;
  paths: { pairingsPath: string; allowlistPath: string; bindingsPath: string };
  code: string;
  now: string;
}): Promise<Record<string, any>> {
  const source = `
    const [bundleUrl, pathsJson, code, now] = process.argv.slice(1);
    const { loadGatewayAccess } = await import(bundleUrl);
    const access = await loadGatewayAccess({
      ...JSON.parse(pathsJson),
      clock: () => new Date(now),
    });
    const swept = await access.sweepExpiredPairings();
    const late = await access.decidePairing(code, 'approve', {
      tenantId: 'tenant-pairing-40', projectPath: '/projects/pairing-40',
    });
    const receipt = access.getPairingTimeoutReceipt('gwp-task40-old');
    process.stdout.write(JSON.stringify({ swept, late, receipt }));
  `;
  const child = spawn(process.execPath, [
    '--input-type=module',
    '--eval', source,
    pathToFileURL(input.bundle).href,
    JSON.stringify(input.paths),
    input.code,
    input.now,
  ], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  await new Promise<void>((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('pairing child exceeded 15s'));
    }, 15_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else reject(new Error(`pairing child failed code=${String(code)} signal=${String(signal)}: ${stderr}`));
    });
  });
  return JSON.parse(stdout) as Record<string, any>;
}

afterEach(() => {
  delete process.env['DECKENT_GATEWAY_HOME'];
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('gateway pairing no-access-grant integration', () => {
  it('keeps parser, inbox, child-process timeout/late decision and daemon on one terminal truth', async () => {
    const home = mkdtempSync(join(tmpdir(), 'pairing-no-grant-'));
    roots.push(home);
    process.env['DECKENT_GATEWAY_HOME'] = home;
    const paths = {
      pairingsPath: join(home, 'pairings.json'),
      allowlistPath: join(home, 'allowlist.json'),
      bindingsPath: join(home, 'bindings.json'),
    };
    const projects = await loadProjectRegistry();
    await projects.add('pairing-40', '/projects/pairing-40');
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    // Federation intentionally uses the wall clock, while the pairing store
    // accepts an injected authority clock. Anchor creation to real now so the
    // pre-expiry inbox assertion is honest, then move the authority clock to
    // the exact 10-minute boundary for the child-process race.
    let now = new Date();
    let aliasOrdinal = 0;
    let idOrdinal = 0;
    const daemonAccess = await loadGatewayAccess({
      ...paths,
      clock: () => now,
      genCode: () => ['TASK40', 'NEXT40'][aliasOrdinal++] ?? `NEXT${aliasOrdinal}`,
      genPairingId: () => ['gwp-task40-old', 'gwp-task40-successor'][idOrdinal++] ?? `gwp-next-${idOrdinal}`,
    });
    const connector = new FakeConnector();
    let runtimeSpawnCalls = 0;
    const handle = await startGatewayListen({
      lang: 'en',
      gatewayToken: 'isolated-token',
      deps: {
        makeConnector: () => connector,
        loadAccess: async () => daemonAccess,
        resolvePairingScope: async (_chatKey, projectPath) => ({
          tenantId: 'tenant-pairing-40',
          projectPath,
          lifecycle,
          lifecycleGeneration: 'gateway-config:task40',
          sourceReference: 'project-registry:pairing-40',
        }),
        supervisor: {
          getOrSpawn: () => {
            runtimeSpawnCalls += 1;
            return { projectPath: '/projects/pairing-40', send: async () => ({ id: 'reply', kind: 'final', parts: ['must-not-run'] }) };
          },
          dispose: async () => {},
        },
        waitForever: () => new Promise(() => {}),
        print: () => {},
      },
    });

    connector.inject('/use pairing-40');
    await waitFor(() => connector.sent.some(message => message.text.includes('TASK40')));

    const before = readRevisionedJson<Record<string, any>>(paths.pairingsPath)!;
    expect(parseGatewayPairingStore(before).records).toEqual([
      expect.objectContaining({ pairingId: 'gwp-task40-old', state: 'PENDING' }),
    ]);
    expect(listFederatedPendingItems(home, { gatewayHomeDir: home })).toEqual([
      expect.objectContaining({
        origin: 'gateway-pairing',
        id: 'gwp-task40-old',
        sourceReference: 'project-registry:pairing-40',
      }),
    ]);

    now = new Date(now.getTime() + 600_000);
    const childResult = await expireAndAttemptLateInChild({
      bundle: await bundleGatewayAccess(home),
      paths,
      code: 'TASK40',
      now: now.toISOString(),
    });
    expect(childResult).toMatchObject({
      swept: 1,
      late: { state: 'CLOSED', pairingId: 'gwp-task40-old', terminalState: 'EXPIRED' },
      receipt: {
        requestId: 'gwp-task40-old',
        actor: 'system:expiry',
        kind: 'timeout-disposition',
        action: 'deny',
        accessGrantAllowed: false,
        replayAllowed: false,
        sourceReference: 'project-registry:pairing-40',
      },
    });
    expect(await daemonAccess.isAuthorizedFresh('telegram:40', '/projects/pairing-40')).toBe(false);
    expect(daemonAccess.getPairingTimeoutReceipt('gwp-task40-old')).toEqual(childResult['receipt']);

    connector.inject('/use pairing-40');
    await waitFor(() => connector.sent.some(message => message.text.includes('NEXT40')));
    expect(runtimeSpawnCalls).toBe(0);
    expect(await daemonAccess.isAuthorizedFresh('telegram:40', '/projects/pairing-40')).toBe(false);

    const after = readRevisionedJson<Record<string, any>>(paths.pairingsPath)!;
    expect(parseGatewayPairingStore(after).records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pairingId: 'gwp-task40-old',
        state: 'EXPIRED',
        lateDecision: 'approve',
      }),
      expect.objectContaining({ pairingId: 'gwp-task40-successor', state: 'PENDING' }),
    ]));
    expect(after.value.timeoutReceipts).toEqual({
      'gwp-task40-old': childResult['receipt'],
    });
    await handle.dispose();
  });
});
