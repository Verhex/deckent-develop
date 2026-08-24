import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createRuntimeAdoptionPlan } from '../../src/core/runtime-adoption.js';
import {
  deriveRuntimeAdoptionReceiptScope,
  discoverRuntimeAdoptionReceipts,
  parseRuntimeAdoptionReceipt,
  publishRuntimeAdoptionReceipt,
  readRuntimeAdoptionReceipt,
  RuntimeAdoptionReceiptStore,
  serializeRuntimeAdoptionReceipt,
} from '../../src/core/runtime-adoption-receipt-store.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const digest = (bytes: string | Buffer): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'runtime-adoption-'));
  roots.push(root);
  const provider = Buffer.from('canonical provider receipt');
  const database = Buffer.from('provider database bytes');
  const entrypoint = Buffer.from('deckent entrypoint artifact');
  for (const [path, bytes] of [
    ['evidence/provider.json', provider], ['state/provider.db', database], ['dist/cli.js', entrypoint],
  ] as const) {
    const absolute = join(root, path); mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, bytes);
  }
  const liveRuntime = {
    runtimeId: 'runtime-1', processId: 777, processStartIdentity: 'boot-9:tick-80',
    ownerIdentityDigest: digest('owner:fence'),
  } as const;
  const plan = createRuntimeAdoptionPlan({
    adoptionId: 'adoption-1',
    providerObservationReceipt: {
      projectRelativePath: 'evidence/provider.json', receiptId: digest('provider-id'), receiptDigest: digest(provider),
    },
    targetDatabase: {
      projectRelativePath: 'state/provider.db', databaseDigest: digest(database), lineageDigest: digest('lineage'),
    },
    deckentBuild: { buildIdentityDigest: digest('build'), sourceTreeIdentityDigest: digest('source-tree') },
    entrypoint: { projectRelativePath: 'dist/cli.js', artifactDigest: digest(entrypoint) },
    liveRuntime,
    plannedAt: '2026-08-24T10:00:00.000Z',
  });
  return { root, plan, liveRuntime };
}

function publication(value: ReturnType<typeof fixture>, publishedAt = '2026-08-24T10:01:00.000Z') {
  return {
    projectRoot: value.root, environmentId: 'production/eu', tenantId: 'tenant-alpha',
    plan: value.plan, observedRuntime: value.liveRuntime, publishedAt,
  } as const;
}

describe('immutable runtime adoption receipt store', () => {
  it('publishes canonical create-only bytes, replays, and reads in a fresh facade', () => {
    const value = fixture();
    const databaseBefore = readFileSync(join(value.root, 'state/provider.db'));
    const first = publishRuntimeAdoptionReceipt(publication(value));
    const replay = publishRuntimeAdoptionReceipt(publication(value));
    expect(first.state).toBe('created');
    expect(replay).toEqual({ ...first, state: 'existing-identical' });
    const path = join(value.root, ...first.projectRelativeReceiptPath.split('/'));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(parseRuntimeAdoptionReceipt(readFileSync(path))).toEqual(first.receipt);
    expect(serializeRuntimeAdoptionReceipt(first.receipt)).toEqual(readFileSync(path));
    const restarted = new RuntimeAdoptionReceiptStore({
      projectRoot: value.root, environmentId: 'production/eu', tenantId: 'tenant-alpha',
    });
    expect(restarted.read({ receiptId: first.receipt.receiptId, fresh: true, observedRuntime: value.liveRuntime }))
      .toEqual(first.receipt);
    expect(readFileSync(join(value.root, 'state/provider.db'))).toEqual(databaseBefore);
  });

  it('derives opaque tenant/environment scopes and prevents cross-tenant reads', () => {
    const value = fixture(); const result = publishRuntimeAdoptionReceipt(publication(value));
    const scope = deriveRuntimeAdoptionReceiptScope({ environmentId: 'production/eu', tenantId: 'tenant-alpha' });
    expect(result.receipt.scope).toEqual(scope);
    expect(JSON.stringify(result.receipt)).not.toContain('tenant-alpha');
    expect(JSON.stringify(result.receipt)).not.toContain('production/eu');
    expect(() => readRuntimeAdoptionReceipt({
      projectRoot: value.root, environmentId: 'production/eu', tenantId: 'tenant-beta', receiptId: result.receipt.receiptId,
    })).toThrowError(expect.objectContaining({ code: 'RECEIPT_NOT_FOUND', state: 'HOLD' }));
  });

  it('fresh replay fails closed on artifact and ownership changes without mutating existing authority', () => {
    const value = fixture(); const result = publishRuntimeAdoptionReceipt(publication(value));
    const receiptPath = join(value.root, ...result.projectRelativeReceiptPath.split('/'));
    const receiptBefore = readFileSync(receiptPath);
    writeFileSync(join(value.root, 'state/provider.db'), 'changed database');
    expect(() => readRuntimeAdoptionReceipt({
      projectRoot: value.root, environmentId: 'production/eu', tenantId: 'tenant-alpha',
      receiptId: result.receipt.receiptId, fresh: true, observedRuntime: value.liveRuntime,
    })).toThrowError(expect.objectContaining({ code: 'TARGET_DATABASE_MISMATCH' }));
    expect(readFileSync(receiptPath)).toEqual(receiptBefore);

    writeFileSync(join(value.root, 'state/provider.db'), 'provider database bytes');
    expect(() => readRuntimeAdoptionReceipt({
      projectRoot: value.root, environmentId: 'production/eu', tenantId: 'tenant-alpha',
      receiptId: result.receipt.receiptId, fresh: true,
      observedRuntime: { ...value.liveRuntime, processStartIdentity: 'boot-9:tick-81' },
    })).toThrowError(expect.objectContaining({ code: 'RUNTIME_OWNERSHIP_MISMATCH' }));
  });

  it('rejects symlink paths, unsafe permissions, collisions, and bounds discovery', () => {
    const linked = fixture();
    rmSync(join(linked.root, 'evidence/provider.json'));
    symlinkSync(join(linked.root, 'dist/cli.js'), join(linked.root, 'evidence/provider.json'));
    expect(() => publishRuntimeAdoptionReceipt(publication(linked)))
      .toThrowError(expect.objectContaining({ code: 'UNSAFE_LINK' }));

    const permission = fixture();
    mkdirSync(join(permission.root, '.deckent'), { mode: 0o777 });
    chmodSync(join(permission.root, '.deckent'), 0o777);
    expect(() => publishRuntimeAdoptionReceipt(publication(permission)))
      .toThrowError(expect.objectContaining({ code: 'PERMISSION_DENIED' }));

    const bounded = fixture();
    const one = publishRuntimeAdoptionReceipt(publication(bounded));
    publishRuntimeAdoptionReceipt(publication(bounded, '2026-08-24T10:02:00.000Z'));
    expect(discoverRuntimeAdoptionReceipts({
      projectRoot: bounded.root, environmentId: 'production/eu', tenantId: 'tenant-alpha', maxEntries: 2,
    })).toHaveLength(2);
    expect(() => discoverRuntimeAdoptionReceipts({
      projectRoot: bounded.root, environmentId: 'production/eu', tenantId: 'tenant-alpha', maxEntries: 1,
    })).toThrowError(expect.objectContaining({ code: 'DISCOVERY_LIMIT_EXCEEDED' }));
    const path = join(bounded.root, ...one.projectRelativeReceiptPath.split('/'));
    writeFileSync(path, '{}'); chmodSync(path, 0o600);
    expect(() => publishRuntimeAdoptionReceipt(publication(bounded)))
      .toThrowError(expect.objectContaining({ code: 'RECEIPT_COLLISION' }));
  });
});
