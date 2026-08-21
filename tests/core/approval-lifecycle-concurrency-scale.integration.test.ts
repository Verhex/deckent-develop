import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import { build } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';

import {
  loadGatewayAccess,
  parseGatewayPairingStore,
  type GatewayPairingRequestScope,
} from '../../src/connectors/gateway/gateway-access.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { readRevisionedJson, replaceRevisionedJson } from '../../src/core/approval-file-cas.js';

const roots: string[] = [];

function sandbox(prefix: string): {
  root: string;
  pairingsPath: string;
  allowlistPath: string;
  bindingsPath: string;
} {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return {
    root,
    pairingsPath: join(root, 'pairings.json'),
    allowlistPath: join(root, 'allowlist.json'),
    bindingsPath: join(root, 'bindings.json'),
  };
}

const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });

function scope(projectPath = '/projects/concurrency'): GatewayPairingRequestScope {
  return {
    tenantId: 'tenant-concurrency',
    projectPath,
    lifecycle,
    lifecycleGeneration: 'gateway-config:concurrency',
    sourceReference: `project-registry:${projectPath}`,
  };
}

async function gatewayBundle(root: string): Promise<string> {
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

interface BarrierChild {
  readonly ready: Promise<void>;
  readonly result: Promise<Record<string, any>>;
  release(): void;
}

function decisionChild(input: {
  bundle: string;
  paths: { pairingsPath: string; allowlistPath: string; bindingsPath: string };
  code: string;
  action: 'approve' | 'reject';
  now: string;
}): BarrierChild {
  const source = `
    const [bundleUrl, pathsJson, code, action, now] = process.argv.slice(1);
    const { loadGatewayAccess } = await import(bundleUrl);
    const access = await loadGatewayAccess({ ...JSON.parse(pathsJson), clock: () => new Date(now) });
    process.send({ type: 'ready' });
    await new Promise((resolve) => process.once('message', resolve));
    const result = await access.decidePairing(code, action, {
      tenantId: 'tenant-concurrency', projectPath: '/projects/concurrency',
    });
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawn(process.execPath, [
    '--input-type=module', '--eval', source,
    pathToFileURL(input.bundle).href,
    JSON.stringify(input.paths),
    input.code,
    input.action,
    input.now,
  ], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const ready = new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('pairing child barrier timed out')), 10_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('message', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
  const result = new Promise<Record<string, any>>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('pairing child completion timed out'));
    }, 20_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(JSON.parse(stdout) as Record<string, any>);
      else reject(new Error(`pairing child failed code=${String(code)} signal=${String(signal)}: ${stderr}`));
    });
  });
  return {
    ready,
    result,
    release: () => child.send({ type: 'release' }),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('approval lifecycle pairing concurrency/restart/scale', () => {
  it('makes human-vs-timeout one FWW terminal truth and never changes that truth on retry', async () => {
    const paths = sandbox('pairing-human-timeout-');
    const createdAt = new Date('2026-08-21T10:00:00.000Z');
    const producer = await loadGatewayAccess({
      ...paths,
      clock: () => createdAt,
      genCode: () => 'FWW-HUMAN-TIMEOUT',
      genPairingId: () => 'gwp-human-timeout',
    });
    await producer.requestPairing('telegram:human-timeout', scope());
    const human = await loadGatewayAccess({ ...paths, clock: () => new Date(createdAt.getTime() + 599_999) });
    const timeout = await loadGatewayAccess({ ...paths, clock: () => new Date(createdAt.getTime() + 600_000) });

    const [humanResult, swept] = await Promise.all([
      human.decidePairing('FWW-HUMAN-TIMEOUT', 'approve', {
        tenantId: 'tenant-concurrency', projectPath: '/projects/concurrency',
      }),
      timeout.sweepExpiredPairings(),
    ]);
    const durable = readRevisionedJson<Record<string, any>>(paths.pairingsPath)!;
    const record = parseGatewayPairingStore(durable).records[0]!;
    expect(['APPROVED', 'EXPIRED']).toContain(record.state);
    expect(humanResult.state === 'APPROVED').toBe(record.state === 'APPROVED');
    expect(swept === 1).toBe(record.state === 'EXPIRED');
    expect(timeout.isAuthorized('telegram:human-timeout', '/projects/concurrency'))
      .toBe(record.state === 'APPROVED');
    expect(timeout.getPairingTimeoutReceipt('gwp-human-timeout') !== null)
      .toBe(record.state === 'EXPIRED');

    const beforeRetry = readFileSync(paths.pairingsPath, 'utf8');
    const retry = await timeout.decidePairing('FWW-HUMAN-TIMEOUT', 'approve', {
      tenantId: 'tenant-concurrency', projectPath: '/projects/concurrency',
    });
    expect(retry).toMatchObject({ state: 'CLOSED', terminalState: record.state });
    const afterFirstRetry = readFileSync(paths.pairingsPath, 'utf8');
    await timeout.decidePairing('FWW-HUMAN-TIMEOUT', 'approve');
    expect(readFileSync(paths.pairingsPath, 'utf8')).toBe(afterFirstRetry);
    expect(afterFirstRetry.length).toBeGreaterThanOrEqual(beforeRetry.length);
  });

  it('serializes two real processes through reload-under-lock and preserves only the first decision', async () => {
    const paths = sandbox('pairing-process-fww-');
    const now = new Date('2026-08-21T10:00:00.000Z');
    const producer = await loadGatewayAccess({
      ...paths,
      clock: () => now,
      genCode: () => 'PROCESS-FWW',
      genPairingId: () => 'gwp-process-fww',
    });
    await producer.requestPairing('telegram:process-fww', scope());
    const bundle = await gatewayBundle(paths.root);
    const approve = decisionChild({ bundle, paths, code: 'PROCESS-FWW', action: 'approve', now: now.toISOString() });
    const reject = decisionChild({ bundle, paths, code: 'PROCESS-FWW', action: 'reject', now: now.toISOString() });
    await Promise.all([approve.ready, reject.ready]);
    approve.release();
    reject.release();
    const results = await Promise.all([approve.result, reject.result]);

    expect(results.filter(result => result['state'] === 'APPROVED' || result['state'] === 'REJECTED')).toHaveLength(1);
    expect(results.filter(result => result['state'] === 'CLOSED')).toHaveLength(1);
    const restarted = await loadGatewayAccess({ ...paths, clock: () => now });
    const record = parseGatewayPairingStore(readRevisionedJson(paths.pairingsPath)).records[0]!;
    expect(['APPROVED', 'REJECTED']).toContain(record.state);
    expect(restarted.isAuthorized('telegram:process-fww', '/projects/concurrency'))
      .toBe(record.state === 'APPROVED');
    expect(record.lateDecision).toBe(record.state === 'APPROVED' ? 'reject' : 'approve');
    expect(restarted.getPairingTimeoutReceipt('gwp-process-fww')).toBeNull();
  });

  it('restart catch-up writes exactly one timeout receipt and a no-op restart keeps bytes stable', async () => {
    const paths = sandbox('pairing-restart-catchup-');
    const createdAt = new Date('2026-08-21T10:00:00.000Z');
    const producer = await loadGatewayAccess({
      ...paths,
      clock: () => createdAt,
      genCode: () => 'RESTART-CATCHUP',
      genPairingId: () => 'gwp-restart-catchup',
    });
    await producer.requestPairing('telegram:restart-catchup', scope());

    const firstRestart = await loadGatewayAccess({
      ...paths,
      clock: () => new Date(createdAt.getTime() + 600_000),
    });
    expect(await firstRestart.sweepExpiredPairings()).toBe(1);
    const receipt = firstRestart.getPairingTimeoutReceipt('gwp-restart-catchup');
    expect(receipt).toMatchObject({
      requestId: 'gwp-restart-catchup',
      actor: 'system:expiry',
      action: 'deny',
      replayAllowed: false,
      accessGrantAllowed: false,
    });
    const afterFirst = readFileSync(paths.pairingsPath, 'utf8');
    const revision = readRevisionedJson(paths.pairingsPath)!.revision;

    const secondRestart = await loadGatewayAccess({
      ...paths,
      clock: () => new Date(createdAt.getTime() + 1_200_000),
    });
    expect(await secondRestart.sweepExpiredPairings()).toBe(0);
    expect(secondRestart.getPairingTimeoutReceipt('gwp-restart-catchup')).toEqual(receipt);
    expect(readRevisionedJson(paths.pairingsPath)!.revision).toBe(revision);
    expect(readFileSync(paths.pairingsPath, 'utf8')).toBe(afterFirst);
  });

  it('measures one restart sweep over 10k canonical pending rows with stable unique receipts', async () => {
    const paths = sandbox('pairing-scale-10k-');
    const createdAt = new Date('2026-08-21T10:00:00.000Z');
    const producer = await loadGatewayAccess({
      ...paths,
      clock: () => createdAt,
      genCode: () => 'SCALE-SEED',
      genPairingId: () => 'gwp-scale-seed',
    });
    await producer.requestPairing('telegram:scale-seed', scope('/projects/scale'));
    const wrapped = readRevisionedJson<Record<string, any>>(paths.pairingsPath)!;
    const seed = wrapped.value.pairings['gwp-scale-seed'];
    const pairings: Record<string, Record<string, unknown>> = {};
    const aliases: Record<string, string> = {};
    for (let index = 0; index < 10_000; index += 1) {
      const suffix = String(index).padStart(5, '0');
      const pairingId = `gwp-scale-${suffix}`;
      const shortCode = `S${String(index).padStart(7, '0')}`;
      const chatKey = `telegram:scale-${index}`;
      const sourceReference = `scale-source:${pairingId}`;
      const requestDigest = createHash('sha256').update(JSON.stringify({
        pairingId,
        chatKey,
        tenantId: seed.tenantId,
        projectPath: seed.projectPath,
        createdAt: seed.createdAt,
        sourceReference,
      })).digest('hex');
      pairings[pairingId] = {
        ...seed,
        pairingId,
        shortCode,
        chatKey,
        source: { ...seed.source, reference: sourceReference, requestDigest },
      };
      aliases[shortCode] = pairingId;
    }
    await replaceRevisionedJson(paths.pairingsPath, wrapped.revision, {
      ...wrapped.value,
      pairings,
      aliases,
      timeoutReceipts: {},
    });

    const restarted = await loadGatewayAccess({
      ...paths,
      clock: () => new Date(createdAt.getTime() + 600_000),
    });
    const startedAt = performance.now();
    expect(await restarted.sweepExpiredPairings()).toBe(10_000);
    const elapsedMs = performance.now() - startedAt;
    const after = readRevisionedJson<Record<string, any>>(paths.pairingsPath)!;
    const fileBytes = readFileSync(paths.pairingsPath).byteLength;
    console.info(`[pairing-scale] rows=10000 sweepMs=${elapsedMs.toFixed(1)} bytes=${fileBytes}`);

    expect(Object.keys(after.value.timeoutReceipts)).toHaveLength(10_000);
    expect(new Set(Object.values(after.value.timeoutReceipts)
      .map((receipt: any) => receipt.requestId)).size).toBe(10_000);
    expect(Object.values(after.value.timeoutReceipts).every((receipt: any) =>
      receipt.actor === 'system:expiry'
      && receipt.accessGrantAllowed === false
      && receipt.replayAllowed === false)).toBe(true);
    expect(after.value.grants).toEqual({});
    expect(parseGatewayPairingStore(after).records.every(record => record.state === 'EXPIRED')).toBe(true);
    expect(elapsedMs).toBeLessThan(5_000);
    expect(fileBytes).toBeLessThan(30 * 1024 * 1024);

    const stableRevision = after.revision;
    expect(await restarted.sweepExpiredPairings()).toBe(0);
    expect(readRevisionedJson(paths.pairingsPath)!.revision).toBe(stableRevision);
  });
});
