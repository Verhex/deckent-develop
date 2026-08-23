import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { fork, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import {
  inspectProviderExecutionObservationAdoption,
  planProviderExecutionObservationAdoption,
  type ProviderExecutionObservationAdoptionPlan,
} from '../../src/core/provider-execution-observation-adoption.js';
import {
  ProviderExecutionObservationAdoptionReceiptStore,
  ProviderExecutionObservationAdoptionReceiptStoreError,
  deriveProviderExecutionObservationAdoptionReceiptScope,
  discoverProviderExecutionObservationAdoptionReceipts,
  parseProviderExecutionObservationAdoptionReceipt,
  publishProviderExecutionObservationAdoptionReceipt,
  readProviderExecutionObservationAdoptionReceipt,
  serializeProviderExecutionObservationAdoptionReceipt,
} from '../../src/core/provider-execution-observation-adoption-receipt-store.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createSchema(db: Database.Database, version: 1 | 2): void {
  db.exec(`CREATE TABLE provider_execution_intervals (
    execution_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    principal_digest TEXT NOT NULL,
    fence TEXT NOT NULL,
    start_json TEXT NOT NULL,
    end_json TEXT,
    start_sequence INTEGER NOT NULL,
    end_sequence INTEGER${version === 2
      ? ', run_id TEXT, retired INTEGER NOT NULL DEFAULT 0' : ''}
  );
  CREATE TABLE provider_execution_contradictions (
    contradiction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    principal_digest TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );
  PRAGMA user_version = ${version};`);
}

function insertInterval(db: Database.Database, version: 1 | 2, executionId: string, runId: string | null): void {
  const columns = version === 2 ? ', run_id, retired' : '';
  const values = version === 2 ? ', ?, 0' : '';
  db.prepare(`INSERT INTO provider_execution_intervals (
    execution_id, task_id, attempt_id, principal_digest, fence, start_json,
    end_json, start_sequence, end_sequence${columns}
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${values})`).run(
    executionId,
    `task-${executionId}`,
    `attempt-${executionId}`,
    `principal-${executionId}`,
    `fence-${executionId}`,
    `{"executionId":"${executionId}","sequence":1,"type":"start"}`,
    `{"executionId":"${executionId}","sequence":2,"type":"end"}`,
    1,
    2,
    ...(version === 2 ? [runId] : []),
  );
}

interface Fixture {
  readonly root: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly plan: ProviderExecutionObservationAdoptionPlan;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'deckent-adoption-receipt-store-'));
  roots.push(root);
  const sourcePath = join(root, 'evidence', 'provider-v1.db');
  const targetPath = join(root, 'state', 'provider-v2.db');
  mkdirSync(dirname(sourcePath), { recursive: true });
  mkdirSync(dirname(targetPath), { recursive: true });
  const source = new Database(sourcePath);
  const target = new Database(targetPath);
  createSchema(source, 1);
  createSchema(target, 2);
  for (const executionId of ['legacy-a', 'legacy-b']) {
    insertInterval(source, 1, executionId, null);
    insertInterval(target, 2, executionId, null);
  }
  insertInterval(target, 2, 'run-owned', 'run-1');
  source.close();
  target.close();
  const paths = { v1PreimagePath: sourcePath, currentDatabasePath: targetPath };
  const inspection = inspectProviderExecutionObservationAdoption(paths);
  const plan = planProviderExecutionObservationAdoption({
    paths,
    inspection,
    clock: { now: () => new Date('2026-08-22T01:00:00.000Z') },
    ids: { nextId: () => 'adoption-store-proof' },
  });
  return { root, sourcePath, targetPath, plan };
}

function input(value: Fixture, verifiedAt = '2026-08-22T02:00:00.000Z') {
  return {
    projectRoot: value.root,
    environmentId: 'production/eu-1',
    tenantId: 'tenant-alpha',
    plan: value.plan,
    clock: { now: () => new Date(verifiedAt) },
    ids: { nextId: () => 'verification-store-proof' },
    bounds: { pageSize: 2, maxRows: 10 },
  } as const;
}

function expectStoreCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining<Partial<ProviderExecutionObservationAdoptionReceiptStoreError>>({ code }));
}

interface PublicationWorkerResult {
  readonly state: 'created' | 'existing-identical';
  readonly receiptId: string;
}

interface FreshReadWorkerResult {
  readonly pid: number;
  readonly receipt: unknown;
}

function waitForMessage<T>(child: ChildProcess): Promise<T> {
  return new Promise((resolve, reject) => {
    child.once('message', (message) => resolve(message as T));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) reject(new Error(`publication worker exited with code ${String(code)}`));
    });
  });
}

async function concurrentPublish(value: Fixture): Promise<readonly PublicationWorkerResult[]> {
  const helperPath = join(value.root, 'publication-worker.ts');
  writeFileSync(helperPath, `
    import { publishProviderExecutionObservationAdoptionReceipt } from '${join(process.cwd(), 'src/core/provider-execution-observation-adoption-receipt-store.ts')}';
    const input = JSON.parse(process.env['RECEIPT_INPUT'] ?? 'null');
    process.send?.('ready');
    process.once('message', () => {
      try {
        const result = publishProviderExecutionObservationAdoptionReceipt({
          ...input,
          clock: { now: () => new Date(input.verifiedAt) },
          ids: { nextId: () => 'verification-store-proof' },
        });
        process.send?.({ state: result.state, receiptId: result.receipt.receiptId });
        process.exit(0);
      } catch (error) {
        process.send?.({ error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      }
    });
  `);
  const serializedInput = JSON.stringify({
    ...input(value), clock: undefined, ids: undefined, verifiedAt: '2026-08-22T02:00:00.000Z',
  });
  const workers = Array.from({ length: 2 }, () => fork(
    join(process.cwd(), 'node_modules/vite-node/vite-node.mjs'),
    [helperPath],
    { env: { ...process.env, RECEIPT_INPUT: serializedInput }, silent: true },
  ));
  try {
    await Promise.all(workers.map((worker) => waitForMessage<string>(worker)));
    const results = workers.map((worker) => waitForMessage<PublicationWorkerResult>(worker));
    for (const worker of workers) worker.send('publish');
    return await Promise.all(results);
  } finally {
    for (const worker of workers) if (worker.exitCode === null) worker.kill();
  }
}

async function readInFreshProcess(value: Fixture, receiptId: string): Promise<FreshReadWorkerResult> {
  const helperPath = join(value.root, 'fresh-read-worker.ts');
  writeFileSync(helperPath, `
    import { readProviderExecutionObservationAdoptionReceipt } from '${join(process.cwd(), 'src/core/provider-execution-observation-adoption-receipt-store.ts')}';
    try {
      const receipt = readProviderExecutionObservationAdoptionReceipt({
        projectRoot: process.env['PROJECT_ROOT'] ?? '',
        environmentId: process.env['ENVIRONMENT_ID'] ?? '',
        tenantId: process.env['TENANT_ID'] ?? '',
        receiptId: process.env['RECEIPT_ID'] ?? '',
        fresh: true,
      });
      process.send?.({ pid: process.pid, receipt });
    } catch (error) {
      process.send?.({ error: error instanceof Error ? error.message : String(error) });
      process.exitCode = 1;
    }
  `);
  const child = fork(join(process.cwd(), 'node_modules/vite-node/vite-node.mjs'), [helperPath], {
    env: {
      ...process.env,
      PROJECT_ROOT: value.root,
      ENVIRONMENT_ID: 'production/eu-1',
      TENANT_ID: 'tenant-alpha',
      RECEIPT_ID: receiptId,
    },
    silent: true,
  });
  try {
    return await waitForMessage<FreshReadWorkerResult>(child);
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

function inventory(root: string): readonly string[] {
  const entries: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      entries.push(path.slice(root.length + 1));
      if (entry.isDirectory()) visit(path);
    }
  };
  visit(root);
  return entries;
}

describe('provider execution observation adoption receipt store', () => {
  it('publishes create-only canonical bytes, replays identically, and survives a fresh store instance', () => {
    const value = fixture();
    mkdirSync(join(value.root, '.deckent'), { recursive: true });
    chmodSync(join(value.root, '.deckent'), 0o755);
    const before = [readFileSync(value.sourcePath), readFileSync(value.targetPath)] as const;
    const first = publishProviderExecutionObservationAdoptionReceipt(input(value));
    const replay = publishProviderExecutionObservationAdoptionReceipt(input(value));

    expect(first.state).toBe('created');
    expect(replay).toEqual({ ...first, state: 'existing-identical' });
    expect(first.projectRelativeReceiptPath).toMatch(
      /^\.deckent\/provider-observation-adoption\/receipts\/v1\/[a-z2-7]{52}\/[a-z2-7]{52}\/[a-f0-9]{64}\.json$/u,
    );
    const receiptPath = join(value.root, ...first.projectRelativeReceiptPath.split('/'));
    expect(statSync(receiptPath).mode & 0o777).toBe(0o600);
    expect(readdirSync(dirname(receiptPath)).filter((name) => name.startsWith('.receipt-'))).toEqual([]);
    expect(parseProviderExecutionObservationAdoptionReceipt(readFileSync(receiptPath))).toEqual(first.receipt);
    expect(serializeProviderExecutionObservationAdoptionReceipt(first.receipt)).toEqual(readFileSync(receiptPath));

    const restarted = new ProviderExecutionObservationAdoptionReceiptStore({
      projectRoot: value.root,
      environmentId: 'production/eu-1',
      tenantId: 'tenant-alpha',
    });
    expect(restarted.read({ receiptId: first.receipt.receiptId, fresh: true })).toEqual(first.receipt);
    expect(readFileSync(value.sourcePath)).toEqual(before[0]);
    expect(readFileSync(value.targetPath)).toEqual(before[1]);
  });

  it.skipIf(process.platform === 'win32')('rejects a group-writable shared project control directory', () => {
    const value = fixture();
    mkdirSync(join(value.root, '.deckent'), { recursive: true });
    chmodSync(join(value.root, '.deckent'), 0o775);

    expectStoreCode(
      () => publishProviderExecutionObservationAdoptionReceipt(input(value)),
      'PERMISSION_DENIED',
    );
  });

  it('isolates environment and tenant scopes and never stores their raw identifiers', () => {
    const value = fixture();
    const result = publishProviderExecutionObservationAdoptionReceipt(input(value));
    const serialized = JSON.stringify(result.receipt);
    expect(serialized).not.toContain('production/eu-1');
    expect(serialized).not.toContain('tenant-alpha');
    expect(result.receipt.scope).toEqual(deriveProviderExecutionObservationAdoptionReceiptScope({
      environmentId: 'production/eu-1', tenantId: 'tenant-alpha',
    }));
    expectStoreCode(() => readProviderExecutionObservationAdoptionReceipt({
      projectRoot: value.root,
      environmentId: 'production/eu-1',
      tenantId: 'tenant-beta',
      receiptId: result.receipt.receiptId,
    }), 'RECEIPT_NOT_FOUND');
  });

  it('verifies one exact receipt after process restart without foreign-tenant discovery or private residue', async () => {
    const value = fixture();
    const published = publishProviderExecutionObservationAdoptionReceipt(input(value));
    const currentScope = deriveProviderExecutionObservationAdoptionReceiptScope({
      environmentId: 'production/eu-1', tenantId: 'tenant-alpha',
    });
    const foreignScope = deriveProviderExecutionObservationAdoptionReceiptScope({
      environmentId: 'production/eu-1', tenantId: 'tenant-beta',
    });
    const storeRoot = join(value.root, '.deckent', 'provider-observation-adoption', 'receipts', 'v1');
    const foreignDirectory = join(storeRoot, foreignScope.environmentKey, foreignScope.tenantKey);
    mkdirSync(foreignDirectory, { recursive: true, mode: 0o700 });
    chmodSync(foreignDirectory, 0o700);
    writeFileSync(join(foreignDirectory, `${published.receipt.receiptId.slice('sha256:'.length)}.json`),
      '{"foreignTenantTrap":true}', { mode: 0o600 });

    const restarted = await readInFreshProcess(value, published.receipt.receiptId);

    expect(restarted.pid).not.toBe(process.pid);
    expect(restarted.receipt).toEqual(published.receipt);
    expect(published.receipt.scope).toEqual(currentScope);
    const storedEntries = inventory(storeRoot);
    expect(storedEntries.some((path) => path.includes(foreignScope.tenantKey))).toBe(true);
    expect(storedEntries).not.toContain(expect.stringMatching(/(?:^|\/)(?:latest|current|index)(?:\.|$)/iu));
    expect(storedEntries).not.toContain(expect.stringMatching(/\.receipt-|\.tmp$/u));
    expect(storedEntries.join('\n')).not.toContain('production/eu-1');
    expect(storedEntries.join('\n')).not.toContain('tenant-alpha');
    expect(storedEntries.join('\n')).not.toContain('tenant-beta');
    for (const path of storedEntries.filter((entry) => entry.endsWith('.json'))) {
      const bytes = readFileSync(join(storeRoot, path), 'utf8');
      expect(bytes).not.toContain('production/eu-1');
      expect(bytes).not.toContain('tenant-alpha');
      expect(bytes).not.toContain('tenant-beta');
    }
  });

  it('rejects non-canonical, duplicate, missing-version, and unsupported-version envelopes', () => {
    const value = fixture();
    const result = publishProviderExecutionObservationAdoptionReceipt(input(value));
    const canonical = serializeProviderExecutionObservationAdoptionReceipt(result.receipt).toString('utf8');

    expectStoreCode(() => parseProviderExecutionObservationAdoptionReceipt(`${canonical}\n`), 'INVALID_RECEIPT');
    expectStoreCode(
      () => parseProviderExecutionObservationAdoptionReceipt(canonical.replace('{', '{"schema":"duplicate",')),
      'INVALID_RECEIPT',
    );
    const parsed = JSON.parse(canonical) as Record<string, unknown>;
    delete parsed['version'];
    expectStoreCode(() => parseProviderExecutionObservationAdoptionReceipt(JSON.stringify(parsed)), 'INVALID_RECEIPT');
    parsed['version'] = 2;
    expectStoreCode(
      () => parseProviderExecutionObservationAdoptionReceipt(JSON.stringify(parsed)),
      'UNSUPPORTED_RECEIPT_VERSION',
    );
  });

  it('fails closed on traversal and on stale source or target bytes', () => {
    const outside = fixture();
    const otherRoot = mkdtempSync(join(tmpdir(), 'deckent-adoption-other-root-'));
    roots.push(otherRoot);
    expectStoreCode(() => publishProviderExecutionObservationAdoptionReceipt({
      ...input(outside), projectRoot: otherRoot,
    }), 'PATH_ESCAPE');

    const value = fixture();
    const result = publishProviderExecutionObservationAdoptionReceipt(input(value));
    const target = new Database(value.targetPath);
    target.prepare('UPDATE provider_execution_intervals SET start_json = start_json || ? WHERE execution_id = ?')
      .run(' ', 'run-owned');
    target.close();
    expectStoreCode(() => readProviderExecutionObservationAdoptionReceipt({
      projectRoot: value.root,
      environmentId: 'production/eu-1',
      tenantId: 'tenant-alpha',
      receiptId: result.receipt.receiptId,
      fresh: true,
    }), 'INPUT_CHANGED');
  });

  it('preserves a conflicting final artifact and reports a typed collision', () => {
    const value = fixture();
    const result = publishProviderExecutionObservationAdoptionReceipt(input(value));
    const receiptPath = join(value.root, ...result.projectRelativeReceiptPath.split('/'));
    const conflicting = Buffer.from('{"not":"the canonical receipt"}', 'utf8');
    writeFileSync(receiptPath, conflicting);
    chmodSync(receiptPath, 0o600);

    expectStoreCode(() => publishProviderExecutionObservationAdoptionReceipt(input(value)), 'RECEIPT_COLLISION');
    expect(readFileSync(receiptPath)).toEqual(conflicting);
    expect(readdirSync(dirname(receiptPath)).filter((name) => name.startsWith('.receipt-'))).toEqual([]);
  });

  it('discovers only independently verified final receipts and enforces its explicit bound', () => {
    const value = fixture();
    const first = publishProviderExecutionObservationAdoptionReceipt(input(value));
    const second = publishProviderExecutionObservationAdoptionReceipt(
      input(value, '2026-08-22T02:00:01.000Z'),
    );
    expect(first.receipt.receiptId).not.toBe(second.receipt.receiptId);
    const context = {
      projectRoot: value.root,
      environmentId: 'production/eu-1',
      tenantId: 'tenant-alpha',
    } as const;
    expect(discoverProviderExecutionObservationAdoptionReceipts({ ...context, maxEntries: 2 }))
      .toEqual([first.receipt, second.receipt].sort((left, right) => left.receiptId.localeCompare(right.receiptId)));
    expectStoreCode(
      () => discoverProviderExecutionObservationAdoptionReceipts({ ...context, maxEntries: 1 }),
      'DISCOVERY_LIMIT_EXCEEDED',
    );
  });

  it('publishes identical bytes concurrently and retains one restart-safe final artifact', async () => {
    const value = fixture();
    const results = await concurrentPublish(value);

    expect(results.map(({ state }) => state).sort()).toEqual(['created', 'existing-identical']);
    expect(new Set(results.map(({ receiptId }) => receiptId))).toHaveLength(1);
    const restarted = new ProviderExecutionObservationAdoptionReceiptStore({
      projectRoot: value.root,
      environmentId: 'production/eu-1',
      tenantId: 'tenant-alpha',
    });
    const receipt = restarted.read({ receiptId: results[0]!.receiptId, fresh: true });
    const receiptDirectory = dirname(join(value.root, '.deckent', 'provider-observation-adoption', 'receipts', 'v1',
      receipt.scope.environmentKey, receipt.scope.tenantKey, 'placeholder'));
    expect(readdirSync(receiptDirectory).filter((name) => name.startsWith('.receipt-'))).toEqual([]);
    expect(readdirSync(receiptDirectory).filter((name) => name.endsWith('.json'))).toHaveLength(1);
  });

  it('reads the exact final entry in a 10k-entry scope without discovery and bounds inventory first', () => {
    const value = fixture();
    const published = publishProviderExecutionObservationAdoptionReceipt(input(value));
    const receiptPath = join(value.root, ...published.projectRelativeReceiptPath.split('/'));
    const receiptDirectory = dirname(receiptPath);
    const receiptName = receiptPath.slice(receiptDirectory.length + 1);
    for (let index = 0; index < 9_999; index += 1) {
      const name = `${index.toString(16).padStart(64, '0')}.json`;
      if (name !== receiptName) writeFileSync(join(receiptDirectory, name), '{}', { mode: 0o600 });
    }
    while (readdirSync(receiptDirectory).length < 10_000) {
      const name = `${'f'.repeat(63)}${(readdirSync(receiptDirectory).length % 16).toString(16)}.json`;
      if (name !== receiptName) writeFileSync(join(receiptDirectory, name), '{}', { mode: 0o600 });
    }

    const restarted = new ProviderExecutionObservationAdoptionReceiptStore({
      projectRoot: value.root,
      environmentId: 'production/eu-1',
      tenantId: 'tenant-alpha',
    });
    expect(restarted.read({ receiptId: published.receipt.receiptId })).toEqual(published.receipt);
    expectStoreCode(() => restarted.discover(9_999), 'DISCOVERY_LIMIT_EXCEEDED');
  });

  it('rejects a malformed receipt stored under an exact final name', () => {
    const value = fixture();
    const published = publishProviderExecutionObservationAdoptionReceipt(input(value));
    const receiptPath = join(value.root, ...published.projectRelativeReceiptPath.split('/'));
    const malformedId = `sha256:${'f'.repeat(64)}`;
    writeFileSync(join(dirname(receiptPath), `${'f'.repeat(64)}.json`), '{"synthetic":true}', { mode: 0o600 });

    expectStoreCode(() => readProviderExecutionObservationAdoptionReceipt({
      projectRoot: value.root,
      environmentId: 'production/eu-1',
      tenantId: 'tenant-alpha',
      receiptId: malformedId,
    }), 'INVALID_RECEIPT');
  });
});
