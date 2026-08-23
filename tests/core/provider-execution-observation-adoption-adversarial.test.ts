import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
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
  type ProviderExecutionObservationAdoptionDurableReceipt,
  ProviderExecutionObservationAdoptionReceiptStoreError,
  deriveProviderExecutionObservationAdoptionReceiptScope,
  parseProviderExecutionObservationAdoptionReceipt,
  providerExecutionObservationAdoptionDurableReceiptId,
  publishProviderExecutionObservationAdoptionReceipt,
  readProviderExecutionObservationAdoptionReceipt,
} from '../../src/core/provider-execution-observation-adoption-receipt-store.js';

const roots: string[] = [];
const context = { environmentId: 'prod-secret', tenantId: 'tenant-secret' } as const;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function schema(db: Database.Database, version: 1 | 2): void {
  db.exec(`CREATE TABLE provider_execution_intervals (
    execution_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
    principal_digest TEXT NOT NULL, fence TEXT NOT NULL, start_json TEXT NOT NULL,
    end_json TEXT, start_sequence INTEGER NOT NULL, end_sequence INTEGER
    ${version === 2 ? ', run_id TEXT, retired INTEGER NOT NULL DEFAULT 0' : ''});
    CREATE TABLE provider_execution_contradictions (
      contradiction_id INTEGER PRIMARY KEY AUTOINCREMENT,
      principal_digest TEXT NOT NULL, payload_json TEXT NOT NULL);
    PRAGMA user_version = ${version};`);
}

function row(db: Database.Database, version: 1 | 2, id: string, runId: string | null): void {
  db.prepare(`INSERT INTO provider_execution_intervals
    (execution_id, task_id, attempt_id, principal_digest, fence, start_json, end_json,
      start_sequence, end_sequence${version === 2 ? ', run_id, retired' : ''})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${version === 2 ? ', ?, 0' : ''})`).run(
    id, `task-${id}`, `attempt-${id}`, `principal-${id}`, `fence-${id}`,
    `{"executionId":"${id}","sequence":1,"type":"start"}`, null, 1, null,
    ...(version === 2 ? [runId] : []),
  );
}

interface Fixture {
  readonly root: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly plan: ProviderExecutionObservationAdoptionPlan;
}

function fixture(suffix = ''): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'deckent-adoption-adversarial-'));
  roots.push(root);
  const sourcePath = join(root, 'evidence', 'v1.db');
  const targetPath = join(root, 'state', 'v2.db');
  mkdirSync(dirname(sourcePath), { recursive: true });
  mkdirSync(dirname(targetPath), { recursive: true });
  const source = new Database(sourcePath);
  const target = new Database(targetPath);
  schema(source, 1);
  schema(target, 2);
  row(source, 1, `legacy${suffix}`, null);
  row(target, 2, `legacy${suffix}`, null);
  row(target, 2, `owned${suffix}`, `run${suffix || '-a'}`);
  source.close();
  target.close();
  const paths = { v1PreimagePath: sourcePath, currentDatabasePath: targetPath };
  const inspection = inspectProviderExecutionObservationAdoption(paths);
  const plan = planProviderExecutionObservationAdoption({
    paths, inspection,
    clock: { now: () => new Date('2026-08-22T01:00:00.000Z') },
    ids: { nextId: () => `adoption${suffix || '-a'}` },
  });
  return { root, sourcePath, targetPath, plan };
}

function publish(value: Fixture) {
  return publishProviderExecutionObservationAdoptionReceipt({
    projectRoot: value.root, ...context, plan: value.plan,
    clock: { now: () => new Date('2026-08-22T02:00:00.000Z') },
    ids: { nextId: () => 'receipt-proof' }, bounds: { maxRows: 10, pageSize: 2 },
  });
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining<Partial<ProviderExecutionObservationAdoptionReceiptStoreError>>({ code }));
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function receiptPath(value: Fixture, id: string): string {
  const scope = deriveProviderExecutionObservationAdoptionReceiptScope(context);
  return join(value.root, '.deckent', 'provider-observation-adoption', 'receipts', 'v1',
    scope.environmentKey, scope.tenantKey, `${id.slice('sha256:'.length)}.json`);
}

function forgedReceipt(original: ProviderExecutionObservationAdoptionDurableReceipt,
  mutate: (value: Record<string, unknown>) => void): ProviderExecutionObservationAdoptionDurableReceipt {
  const value = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
  mutate(value);
  delete value['receiptId'];
  const receiptId = providerExecutionObservationAdoptionDurableReceiptId(
    value as unknown as Omit<ProviderExecutionObservationAdoptionDurableReceipt, 'receiptId'>,
  );
  return { ...value, receiptId } as unknown as ProviderExecutionObservationAdoptionDurableReceipt;
}

describe('provider observation adoption receipt adversarial proof', () => {
  it('rejects tampered digests, swapped references, and unknown fields without changing evidence', () => {
    const value = fixture();
    const result = publish(value);
    const before = [readFileSync(value.sourcePath), readFileSync(value.targetPath)] as const;
    const bytes = readFileSync(receiptPath(value, result.receipt.receiptId));
    const parsed = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const source = parsed['source'] as Record<string, unknown>;
    source['contentDigest'] = `sha256:${'0'.repeat(64)}`;
    expectCode(() => parseProviderExecutionObservationAdoptionReceipt(canonical(parsed)), 'INVALID_RECEIPT');

    const unknown = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    unknown['unexpectedAuthority'] = true;
    expectCode(() => parseProviderExecutionObservationAdoptionReceipt(canonical(unknown)), 'INVALID_RECEIPT');

    const swapped = forgedReceipt(result.receipt, (receipt) => {
      const swappedSource = receipt['source'] as Record<string, unknown>;
      const swappedTarget = receipt['target'] as Record<string, unknown>;
      const sourcePath = swappedSource['projectRelativePath'];
      swappedSource['projectRelativePath'] = swappedTarget['projectRelativePath'];
      swappedTarget['projectRelativePath'] = sourcePath;
    });
    const swappedPath = receiptPath(value, swapped.receiptId);
    writeFileSync(swappedPath, canonical(swapped), { mode: 0o600 });
    const swappedBytes = readFileSync(swappedPath);
    expectCode(() => readProviderExecutionObservationAdoptionReceipt({
      projectRoot: value.root, ...context, receiptId: swapped.receiptId, fresh: true,
    }), 'INPUT_CHANGED');
    expect(readFileSync(swappedPath)).toEqual(swappedBytes);
    expect([readFileSync(value.sourcePath), readFileSync(value.targetPath)]).toEqual(before);
  });

  it('rejects foreign-project replay and leaves the replay and both projects unchanged', () => {
    const origin = fixture('-origin');
    const foreign = fixture('-foreign');
    const result = publish(origin);
    const foreignPath = receiptPath(foreign, result.receipt.receiptId);
    mkdirSync(dirname(foreignPath), { recursive: true, mode: 0o700 });
    // mkdir recursive honors umask, so lock every newly introduced authority directory.
    let cursor = join(foreign.root, '.deckent');
    for (const component of ['provider-observation-adoption', 'receipts', 'v1',
      deriveProviderExecutionObservationAdoptionReceiptScope(context).environmentKey,
      deriveProviderExecutionObservationAdoptionReceiptScope(context).tenantKey]) {
      chmodSync(cursor, 0o700);
      cursor = join(cursor, component);
    }
    chmodSync(cursor, 0o700);
    const replay = readFileSync(receiptPath(origin, result.receipt.receiptId));
    writeFileSync(foreignPath, replay, { mode: 0o600 });
    const before = [readFileSync(origin.sourcePath), readFileSync(origin.targetPath),
      readFileSync(foreign.sourcePath), readFileSync(foreign.targetPath), readFileSync(foreignPath)] as const;
    expectCode(() => readProviderExecutionObservationAdoptionReceipt({
      projectRoot: foreign.root, ...context, receiptId: result.receipt.receiptId, fresh: true,
    }), 'INPUT_CHANGED');
    expect([readFileSync(origin.sourcePath), readFileSync(origin.targetPath),
      readFileSync(foreign.sourcePath), readFileSync(foreign.targetPath), readFileSync(foreignPath)]).toEqual(before);
  });

  it('never follows a replacement symlink and preserves its target bytes', () => {
    const value = fixture();
    const result = publish(value);
    const path = receiptPath(value, result.receipt.receiptId);
    const target = join(value.root, 'attacker-controlled');
    const attackerBytes = Buffer.from('do-not-read-or-change');
    writeFileSync(target, attackerBytes);
    unlinkSync(path);
    symlinkSync(target, path);
    expectCode(() => readProviderExecutionObservationAdoptionReceipt({
      projectRoot: value.root, ...context, receiptId: result.receipt.receiptId,
    }), 'INVALID_RECEIPT');
    expect(readFileSync(target)).toEqual(attackerBytes);
  });

  it('rejects partial, non-canonical, and oversized JSON with typed failures', () => {
    const value = fixture();
    const receipt = publish(value).receipt;
    const bytes = canonical(receipt);
    for (const hostile of [bytes.slice(0, -1), `${bytes}\n`, ` ${bytes}`, Buffer.alloc(64 * 1024 + 1, 0x20)]) {
      expectCode(() => parseProviderExecutionObservationAdoptionReceipt(hostile), 'INVALID_RECEIPT');
    }
  });

  it('rejects unsafe scope values and persists neither raw scope secrets nor database secrets', () => {
    for (const unsafe of ['', 'decomposed-e\u0301', 'line\nbreak', '\u0000nul']) {
      expectCode(() => deriveProviderExecutionObservationAdoptionReceiptScope({
        environmentId: unsafe, tenantId: 'safe',
      }), 'INVALID_SCOPE');
    }
    const value = fixture('-raw-secret-marker');
    const result = publish(value);
    const artifact = readFileSync(receiptPath(value, result.receipt.receiptId), 'utf8');
    expect(artifact).not.toContain(context.environmentId);
    expect(artifact).not.toContain(context.tenantId);
    expect(artifact).not.toMatch(/(?:task|attempt|principal|fence)-/u);
    expect(artifact).not.toContain('raw-secret-marker');
    expect(result.receipt.receiptId).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });
});
