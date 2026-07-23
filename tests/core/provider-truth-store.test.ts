import { createHash, createHmac } from 'node:crypto';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createCapabilityCatalog,
  probeExactModelReachability,
  type ReachabilityResult,
} from '../../src/core/provider-truth.js';
import {
  ProviderAuthorityKeyring,
  type ProviderIntegrityAuthority,
} from '../../src/core/provider-authority-keyring.js';
import {
  ProviderTruthStore,
  ProviderTruthStoreError,
  migrateProviderTruthStoreV2ToV3,
  resolveProviderTruthStorePath,
  type ExactReachabilityQuery,
  type ProviderTruthStoreOptions,
} from '../../src/core/provider-truth-store.js';

const roots: string[] = [];
const T0 = new Date('2026-07-20T12:00:00.000Z');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const INTEGRITY_KEY = 'provider-truth-test-integrity-key-0001';
const OTHER_INTEGRITY_KEY = 'provider-truth-other-integrity-key-0002';

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-provider-truth-'));
  roots.push(root);
  return root;
}

function openStore(
  stateRoot: string,
  options: Omit<ProviderTruthStoreOptions, 'integrityKey'> & { integrityKey?: string | Buffer },
): ProviderTruthStore {
  return new ProviderTruthStore(stateRoot, {
    ...options,
    integrityKey: options.integrityKey ?? INTEGRITY_KEY,
  });
}

function restoreReachabilityUpdateTrigger(db: Database.Database): void {
  db.exec(`
    CREATE TRIGGER reachability_results_no_update
      BEFORE UPDATE ON reachability_results BEGIN
        SELECT RAISE(ABORT, 'reachability results are immutable');
      END;
  `);
}

function restoreCatalogUpdateTrigger(db: Database.Database): void {
  db.exec(`
    CREATE TRIGGER capability_catalogs_no_update
      BEFORE UPDATE ON capability_catalogs BEGIN
        SELECT RAISE(ABORT, 'capability catalogs are immutable');
      END;
  `);
}

async function result(
  store: ProviderTruthStore,
  overrides: Partial<ReachabilityResult> = {},
): Promise<ReachabilityResult> {
  const auth = { mode: 'api' as const, accountRefHash: HASH_A };
  const backend = {
    transport: 'http' as const,
    executionBackend: 'docker' as const,
    endpointRefHash: HASH_B,
    runtimeFingerprint: HASH_C,
    executionProfileRef: 'execution-profile:00000001',
  };
  const produced = await probeExactModelReachability({
    idempotencyKey: 'reachability-key-1',
    tenantId: 'tenant-a',
    projectId: store.projectId,
    provider: 'openrouter',
    model: 'openai/gpt-5.6-sol',
    auth,
    backend,
    probeKind: 'model-invocation',
    capability: 'inference',
    admission: {
      decision: 'allow',
      tenantId: 'tenant-a',
      projectId: store.projectId,
      provider: 'openrouter',
      model: 'openai/gpt-5.6-sol',
      auth,
      backend,
      approvalRef: 'approval:00000001',
      approvalGrantedAt: '2026-07-20T11:59:00.000Z',
      approvalExpiresAt: '2026-07-20T12:05:00.000Z',
      limits: {
        state: 'known', decision: 'allow', evidenceRefs: ['limit:00000001'],
        fetchedAt: '2026-07-20T11:59:00.000Z', expiresAt: '2026-07-20T12:05:00.000Z',
      },
      budget: {
        evidenceRef: 'budget:00000001', maxInputTokens: 128, maxOutputTokens: 128,
        maxTotalTokens: 256, maxUsd: 0.01,
      },
    },
    executionProfile: {
      profileRef: 'execution-profile:00000001',
      provider: 'openrouter',
      allowed: [{ authMode: 'api', transport: 'http', executionBackend: 'docker' }],
    },
    ttlMs: 60_000,
  }, {
    probe: async () => ({
      outcome: 'succeeded', calledProvider: 'openrouter', calledModel: 'openai/gpt-5.6-sol',
      providerRequestRefHash: HASH_D, latencyMs: 15,
    }),
    now: () => T0,
    idFactory: () => 'reachability-1',
  });
  return { ...produced, ...overrides };
}

function query(store: ProviderTruthStore, overrides: Partial<ExactReachabilityQuery> = {}): ExactReachabilityQuery {
  return {
    tenantId: 'tenant-a',
    projectId: store.projectId,
    provider: 'openrouter',
    model: 'openai/gpt-5.6-sol',
    authMode: 'api',
    accountRefHash: HASH_A,
    transport: 'http',
    executionBackend: 'docker',
    endpointRefHash: HASH_B,
    runtimeFingerprint: HASH_C,
    executionProfileRef: 'execution-profile:00000001',
    capability: 'inference',
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ProviderTruthStore', () => {
  it('uses the platform global-state path rather than a project workspace path', () => {
    expect(resolveProviderTruthStorePath('linux', { HOME: '/home/alice' }))
      .toBe('/home/alice/.local/state/deckent/provider-truth.db');
    expect(resolveProviderTruthStorePath('win32', {
      USERPROFILE: 'C:\\Users\\Alice', LOCALAPPDATA: 'D:\\State',
    })).toBe('D:\\State\\deckent\\provider-truth.db');

    const root = makeRoot();
    const store = openStore(root, { projectId: 'project-a' });
    store.close();
    expect(existsSync(join(root, 'provider-truth.db'))).toBe(true);
    expect(existsSync(join(root, '.deckent', 'runtime', 'provider-truth.db'))).toBe(false);
  });

  it('requires a host-private key before opening or writing the store', () => {
    const root = makeRoot();
    expect(() => new ProviderTruthStore(root, {
      projectId: 'project-a', integrityKey: '',
    })).toThrowError(/at least 32 bytes/);
    expect(() => new ProviderTruthStore(root, {
      projectId: 'project-a', integrityKey: 'too-short',
    })).toThrowError(/at least 32 bytes/);
    expect(existsSync(join(root, 'provider-truth.db'))).toBe(false);
  });

  it('fails loudly instead of opening an unversioned incompatible truth schema', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'provider-truth-legacy.db');
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const legacy = new Database(dbPath);
    legacy.exec('CREATE TABLE reachability_results (payload_hash TEXT)');
    legacy.pragma('user_version = 1');
    legacy.close();
    expect(() => openStore(root, { dbPath, projectId: 'project-a' }))
      .toThrowError(/explicit authority migration/);
  });

  it('persists and verifies a catalog without promoting catalog presence to live proof', () => {
    const root = makeRoot();
    const store = openStore(root, { now: () => T0, projectId: 'project-a' });
    const catalog = createCapabilityCatalog({
      catalogId: 'catalog-1', idempotencyKey: 'catalog-key-1',
      tenantId: 'tenant-a', projectId: store.projectId,
      source: { sourceId: 'provider-list:hash', kind: 'provider-list', fetchedAt: T0.toISOString(), expiresAt: null },
      entries: [{
        provider: 'openrouter', model: 'openai/gpt-5.6-sol', capabilities: {},
        stages: { enabled: { state: 'known', evidenceRef: 'auth:key-present' } },
      }],
    });
    expect(store.putCatalog(catalog).created).toBe(true);
    expect(store.getCatalog(catalog, catalog.catalogId)?.entries[0]?.liveProofs).toEqual([]);
    store.close();
  });

  it('persists exact scoped evidence across restart and projects stale at read time', async () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'provider-truth.db');
    const first = openStore(root, {
      dbPath, now: () => T0, projectId: 'project-a',
    });
    const evidence = await result(first);
    expect(first.putReachability(evidence)).toEqual({
      evidenceRef: 'provider-reachability:reachability-1', created: true,
    });
    expect(first.putReachability(evidence).created).toBe(false);
    first.close();

    const restarted = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    expect(restarted.projectId).toBe('project-a');
    expect(restarted.getLatestReachability(query(restarted), T0)).toMatchObject({
      reachabilityId: 'reachability-1', state: 'known', reachable: true,
    });
    expect(restarted.getLatestReachability(
      query(restarted), new Date(T0.getTime() + 60_000),
    )).toMatchObject({ state: 'stale', reachable: false, liveProven: false });
    restarted.close();

    expect(readFileSync(dbPath).includes(Buffer.from(root))).toBe(false);
  });

  it('does not reuse evidence across account, backend, runtime, model or tenant scope', async () => {
    const root = makeRoot();
    const store = openStore(root, { now: () => T0, projectId: 'project-a' });
    store.putReachability(await result(store));

    expect(store.getLatestReachability(query(store, { accountRefHash: 'e'.repeat(64) }), T0)).toBeNull();
    expect(store.getLatestReachability(query(store, { executionBackend: 'in-process' }), T0)).toBeNull();
    expect(store.getLatestReachability(query(store, { runtimeFingerprint: 'e'.repeat(64) }), T0)).toBeNull();
    expect(store.getLatestReachability(query(store, { model: 'anthropic/claude-fable-5' }), T0)).toBeNull();
    expect(store.getLatestReachability(query(store, { tenantId: 'tenant-b' }), T0)).toBeNull();
    store.close();
  });

  it('uses insertion sequence, not random evidence id, for same-timestamp latest truth', async () => {
    const root = makeRoot();
    const store = openStore(root, { now: () => T0, projectId: 'project-a' });
    const success = await result(store);
    store.putReachability(success);
    store.putReachability({
      ...success,
      reachabilityId: 'aaa-later-failure',
      idempotencyKey: 'reachability-key-2',
      state: 'unavailable',
      reachable: false,
      liveProven: false,
      outcome: 'auth-rejected',
      reasonCode: 'auth_rejected',
      observed: {
        ...success.observed,
        calledProvider: null,
        calledModel: null,
        providerRequestRefHash: null,
      },
    });
    expect(store.getLatestReachability(query(store), T0)).toMatchObject({
      reachabilityId: 'aaa-later-failure', state: 'unavailable', reasonCode: 'auth_rejected',
    });
    store.close();
  });

  it('rejects conflicting idempotency and enforces append-only storage', async () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'provider-truth.db');
    const store = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    const evidence = await result(store);
    store.putReachability(evidence);
    expect(() => store.putReachability({
      ...evidence,
      idempotencyKey: 'fake-known-key',
      probe: { ...evidence.probe, kind: 'catalog-list' },
    })).toThrow(/exact successful live model invocation/);
    expect(() => store.putReachability({
      ...evidence,
      reachabilityId: 'fake-capability-id',
      idempotencyKey: 'fake-capability-key',
      probe: { ...evidence.probe, capability: 'tools' },
      observed: { ...evidence.observed, verifiedCapability: null },
    })).toThrow(/exact successful live model invocation/);
    expect(() => store.putReachability({
      ...evidence,
      reachabilityId: 'extended-expiry-id',
      idempotencyKey: 'extended-expiry-key',
      probe: { ...evidence.probe, expiresAt: '2026-07-20T12:06:00.000Z' },
    })).toThrow(/cannot outlive approval or limit evidence/);
    expect(() => store.putReachability({ ...evidence, reachabilityId: 'reachability-2' }))
      .toThrowError(ProviderTruthStoreError);
    store.close();

    const raw = new Database(dbPath);
    expect(() => raw.prepare("UPDATE reachability_results SET provider='evil'").run()).toThrow(/immutable/);
    expect(() => raw.prepare('DELETE FROM reachability_results').run()).toThrow(/immutable/);
    raw.close();
  });

  it('detects payload tampering even if the database trigger is bypassed', async () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'provider-truth.db');
    const store = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    const evidence = await result(store);
    store.putReachability(evidence);
    store.close();

    const raw = new Database(dbPath);
    raw.exec('DROP TRIGGER reachability_results_no_update');
    raw.prepare("UPDATE reachability_results SET payload_json='{}'").run();
    restoreReachabilityUpdateTrigger(raw);
    raw.close();

    const reopened = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    expect(() => reopened.getReachability(
      { tenantId: 'tenant-a', projectId: reopened.projectId }, evidence.reachabilityId, T0,
    )).toThrowError(ProviderTruthStoreError);
    reopened.close();
  });

  it('detects normalized query-envelope tampering even when payload and its hash are untouched', async () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'provider-truth.db');
    const store = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    store.putReachability(await result(store));
    store.close();

    const raw = new Database(dbPath);
    raw.exec('DROP TRIGGER reachability_results_no_update');
    raw.prepare("UPDATE reachability_results SET provider='evil'").run();
    restoreReachabilityUpdateTrigger(raw);
    raw.close();

    const reopened = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    expect(() => reopened.getLatestReachability(query(reopened, { provider: 'evil' }), T0))
      .toThrowError(/envelope mismatch/);
    reopened.close();
  });

  it('detects capability catalog envelope tampering', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'provider-truth.db');
    const store = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    const catalog = createCapabilityCatalog({
      catalogId: 'catalog-tamper', idempotencyKey: 'catalog-tamper-key',
      tenantId: 'tenant-a', projectId: store.projectId,
      source: { sourceId: 'builtin', kind: 'builtin', fetchedAt: T0.toISOString(), expiresAt: null },
      entries: [{ provider: 'openrouter', model: 'openai/gpt-5.6-sol', capabilities: {} }],
    });
    store.putCatalog(catalog);
    store.close();

    const raw = new Database(dbPath);
    raw.exec('DROP TRIGGER capability_catalogs_no_update');
    raw.prepare("UPDATE capability_catalogs SET fetched_at='2099-01-01T00:00:00.000Z'").run();
    restoreCatalogUpdateTrigger(raw);
    raw.close();

    const reopened = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    expect(() => reopened.getCatalog(catalog, catalog.catalogId)).toThrowError(/envelope mismatch/);
    reopened.close();
  });

  it('stores no prompt, response, argv, endpoint URL or credential material', async () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'provider-truth.db');
    const store = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    store.putReachability(await result(store));
    store.close();
    const bytes = readFileSync(dbPath).toString('utf8');
    expect(bytes).not.toContain('sk-secret');
    expect(bytes).not.toContain('https://openrouter.ai');
    expect(bytes).not.toContain('--dangerously-skip-permissions');
    expect(bytes).not.toContain('user prompt');
    expect(bytes).not.toContain('model response');
    expect(bytes).not.toContain(INTEGRITY_KEY);
  });

  it('rejects a forged payload even when an attacker recomputes plain SHA-256', async () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-truth.db');
    const store = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    const evidence = await result(store);
    store.putReachability(evidence);
    store.close();

    const forgedPayload = JSON.stringify({ ...evidence, reachable: false });
    const raw = new Database(dbPath);
    raw.exec('DROP TRIGGER reachability_results_no_update');
    raw.prepare('UPDATE reachability_results SET payload_json = ?, payload_hash = ?')
      .run(forgedPayload, createHash('sha256').update(forgedPayload).digest('hex'));
    restoreReachabilityUpdateTrigger(raw);
    raw.close();

    const reopened = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    expect(() => reopened.getReachability(
      { tenantId: 'tenant-a', projectId: 'project-a' }, evidence.reachabilityId, T0,
    )).toThrowError(/hash mismatch/);
    reopened.close();
  });

  it('fails at open for the wrong key or a tampered immutable schema', async () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-truth.db');
    const store = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    store.putReachability(await result(store));
    store.close();

    expect(() => openStore(root, {
      dbPath, now: () => T0, projectId: 'project-a', integrityKey: OTHER_INTEGRITY_KEY,
    })).toThrowError(/authority mismatch/);

    const raw = new Database(dbPath);
    raw.exec('DROP TRIGGER reachability_results_no_delete');
    raw.close();
    expect(() => openStore(root, { dbPath, now: () => T0, projectId: 'project-a' }))
      .toThrowError(/immutable triggers are invalid/);
  });

  it('rejects same-named weak indexes and inert immutable triggers at open', () => {
    const weakIndexRoot = makeRoot();
    const weakIndexPath = join(weakIndexRoot, 'provider-truth.db');
    openStore(weakIndexRoot, { dbPath: weakIndexPath, projectId: 'project-a' }).close();
    const weakIndexDb = new Database(weakIndexPath);
    weakIndexDb.exec(`
      DROP INDEX idx_reachability_exact_scope;
      CREATE INDEX idx_reachability_exact_scope
        ON reachability_results (execution_profile_ref, capability, completed_at);
    `);
    weakIndexDb.close();
    expect(() => openStore(weakIndexRoot, { dbPath: weakIndexPath, projectId: 'project-a' }))
      .toThrowError(/scope index is invalid/);

    const inertTriggerRoot = makeRoot();
    const inertTriggerPath = join(inertTriggerRoot, 'provider-truth.db');
    openStore(inertTriggerRoot, { dbPath: inertTriggerPath, projectId: 'project-a' }).close();
    const inertTriggerDb = new Database(inertTriggerPath);
    inertTriggerDb.exec(`
      DROP TRIGGER reachability_results_no_update;
      CREATE TRIGGER reachability_results_no_update
        BEFORE UPDATE ON reachability_results WHEN 0 BEGIN
          SELECT RAISE(ABORT, 'reachability results are immutable');
        END;
    `);
    inertTriggerDb.close();
    expect(() => openStore(inertTriggerRoot, { dbPath: inertTriggerPath, projectId: 'project-a' }))
      .toThrowError(/immutable triggers are invalid/);
  });

  it('isolates equal opaque ids and idempotency keys across projects in one host-global database', async () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-truth.db');
    const projectA = openStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    const projectB = openStore(root, { dbPath, now: () => T0, projectId: 'project-b' });
    const catalogA = createCapabilityCatalog({
      catalogId: 'shared-catalog-id', idempotencyKey: 'shared-catalog-key',
      tenantId: 'tenant-a', projectId: projectA.projectId,
      source: { sourceId: 'builtin', kind: 'builtin', fetchedAt: T0.toISOString(), expiresAt: null },
      entries: [{ provider: 'openrouter', model: 'openai/gpt-5.6-sol', capabilities: {} }],
    });
    const catalogB = createCapabilityCatalog({
      ...catalogA,
      projectId: projectB.projectId,
    });
    expect(projectA.putCatalog(catalogA).created).toBe(true);
    expect(projectB.putCatalog(catalogB).created).toBe(true);
    projectA.putReachability(await result(projectA));
    projectB.putReachability(await result(projectB));

    expect(projectA.getCatalog(catalogA, catalogA.catalogId)?.projectId).toBe('project-a');
    expect(projectB.getCatalog(catalogB, catalogB.catalogId)?.projectId).toBe('project-b');
    expect(projectA.getLatestReachability(query(projectA), T0)?.projectId).toBe('project-a');
    expect(projectB.getLatestReachability(query(projectB), T0)?.projectId).toBe('project-b');
    expect(() => projectA.getLatestReachability(query(projectB), T0)).toThrowError(/project scope mismatch/);
    projectA.close();
    projectB.close();
  });

  it('stamps exact key ids and keeps retired-key evidence readable after rotation', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-truth.db');
    const keyring = ProviderAuthorityKeyring.create({
      dataDir: root,
      keyringIdFactory: () => 'par-truth-rotation-0001',
      keyIdFactory: () => 'pak-truth-rotation-0001',
      randomBytesFactory: size => Buffer.alloc(size, 0x61),
    }).keyring;
    const store = new ProviderTruthStore(root, {
      dbPath,
      projectId: 'project-a',
      integrityAuthority: keyring,
    });
    const first = createCapabilityCatalog({
      catalogId: 'catalog-before-rotation',
      idempotencyKey: 'catalog-before-rotation-key',
      tenantId: 'tenant-a',
      projectId: store.projectId,
      source: { sourceId: 'builtin', kind: 'builtin', fetchedAt: T0.toISOString(), expiresAt: null },
      entries: [{ provider: 'claude', model: 'claude-fable-5', capabilities: {} }],
    });
    store.putCatalog(first);
    keyring.rotate({
      expectedRevisionHash: keyring.snapshot().revisionHash,
      keyIdFactory: () => 'pak-truth-rotation-0002',
      randomBytesFactory: size => Buffer.alloc(size, 0x62),
    });
    const second = {
      ...first,
      catalogId: 'catalog-after-rotation',
      idempotencyKey: 'catalog-after-rotation-key',
    };
    store.putCatalog(second);
    store.close();

    const raw = new Database(dbPath);
    expect(raw.prepare(`
      SELECT catalog_id, integrity_key_id FROM capability_catalogs ORDER BY catalog_id
    `).all()).toEqual([
      { catalog_id: 'catalog-after-rotation', integrity_key_id: 'pak-truth-rotation-0002' },
      { catalog_id: 'catalog-before-rotation', integrity_key_id: 'pak-truth-rotation-0001' },
    ]);
    raw.close();

    const reopened = new ProviderTruthStore(root, {
      dbPath,
      projectId: 'project-a',
      integrityAuthority: keyring,
    });
    expect(reopened.getCatalog(first, first.catalogId)?.catalogId).toBe(first.catalogId);
    expect(reopened.getCatalog(second, second.catalogId)?.catalogId).toBe(second.catalogId);
    reopened.close();
  });

  it('migrates exact v2 evidence only through an explicit retired-key binding', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-truth-v2.db');
    const legacyKeyId = 'pak-legacy-truth-v2-0001';
    const store = openStore(root, { dbPath, projectId: 'project-a' });
    const catalog = createCapabilityCatalog({
      catalogId: 'catalog-v2-migration',
      idempotencyKey: 'catalog-v2-migration-key',
      tenantId: 'tenant-a',
      projectId: store.projectId,
      source: { sourceId: 'builtin', kind: 'builtin', fetchedAt: T0.toISOString(), expiresAt: null },
      entries: [{ provider: 'claude', model: 'claude-fable-5', capabilities: {} }],
    });
    store.putCatalog(catalog);
    store.close();

    const legacy = new Database(dbPath);
    legacy.exec(`
      DROP TRIGGER capability_catalogs_no_update;
      DROP TRIGGER capability_catalogs_active_key_insert;
      DROP TRIGGER reachability_results_active_key_insert;
    `);
    const catalogPayload = legacy.prepare(`
      SELECT payload_json FROM capability_catalogs WHERE catalog_id = ?
    `).get(catalog.catalogId) as { payload_json: string };
    const legacyHash = createHmac('sha256', INTEGRITY_KEY)
      .update(catalogPayload.payload_json)
      .digest('hex');
    legacy.prepare('UPDATE capability_catalogs SET payload_hash = ?').run(legacyHash);
    legacy.prepare(`
      UPDATE provider_truth_authority
      SET integrity_check = ?, active_key_id = ?, integrity_version = 1, authority_revision = 0
    `).run(
      createHmac('sha256', INTEGRITY_KEY)
        .update('deckent-provider-truth-store:v2')
        .digest('hex'),
      legacyKeyId,
    );
    legacy.exec(`
      ALTER TABLE provider_truth_authority DROP COLUMN authority_revision;
      ALTER TABLE provider_truth_authority DROP COLUMN integrity_version;
      ALTER TABLE provider_truth_authority DROP COLUMN active_key_id;
      ALTER TABLE capability_catalogs DROP COLUMN integrity_version;
      ALTER TABLE capability_catalogs DROP COLUMN integrity_key_id;
      ALTER TABLE reachability_results DROP COLUMN integrity_version;
      ALTER TABLE reachability_results DROP COLUMN integrity_key_id;
    `);
    restoreCatalogUpdateTrigger(legacy);
    legacy.pragma('user_version = 2');
    const before = legacy.prepare(`
      SELECT payload_json, payload_hash FROM capability_catalogs WHERE catalog_id = ?
    `).get(catalog.catalogId);
    legacy.close();

    migrateProviderTruthStoreV2ToV3({
      dbPath,
      legacyKeyId,
      legacyIntegrityKey: INTEGRITY_KEY,
    });
    const keyring = ProviderAuthorityKeyring.create({
      dataDir: root,
      keyringIdFactory: () => 'par-truth-migration-0001',
      keyIdFactory: () => 'pak-truth-current-0001',
      randomBytesFactory: size => Buffer.alloc(size, 0x63),
    }).keyring;
    keyring.importLegacyVerificationKey({
      expectedRevisionHash: keyring.snapshot().revisionHash,
      domain: 'truth',
      legacyKey: INTEGRITY_KEY,
      keyIdFactory: () => legacyKeyId,
    });
    const migrated = new ProviderTruthStore(root, {
      dbPath,
      projectId: 'project-a',
      integrityAuthority: keyring,
    });
    expect(migrated.getCatalog(catalog, catalog.catalogId)?.catalogId).toBe(catalog.catalogId);
    migrated.close();

    const verify = new Database(dbPath);
    expect(verify.prepare(`
      SELECT payload_json, payload_hash FROM capability_catalogs WHERE catalog_id = ?
    `).get(catalog.catalogId)).toEqual(before);
    expect(verify.pragma('user_version', { simple: true })).toBe(3);
    verify.close();
  });

  it('blocks a stale open writer from reactivating a retired authority revision', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-truth-stale-writer.db');
    const keys = {
      'pak-stale-writer-0001': 'stale-writer-key-material-000000000001',
      'pak-stale-writer-0002': 'stale-writer-key-material-000000000002',
    } as const;
    const authority = (
      activeKeyId: keyof typeof keys,
      authorityRevision: number,
    ): ProviderIntegrityAuthority => ({
      sign: (_domain, value) => ({
        keyId: activeKeyId,
        authorityRevision,
        mac: createHmac('sha256', keys[activeKeyId]).update(value).digest('hex'),
      }),
      verify: (_domain, keyId, value, mac) => {
        const key = keys[keyId as keyof typeof keys];
        if (!key) throw new Error('unknown test key');
        return createHmac('sha256', key).update(value).digest('hex') === mac;
      },
    });
    const stale = new ProviderTruthStore(root, {
      dbPath,
      projectId: 'project-a',
      integrityAuthority: authority('pak-stale-writer-0001', 1),
    });
    const current = new ProviderTruthStore(root, {
      dbPath,
      projectId: 'project-a',
      integrityAuthority: authority('pak-stale-writer-0002', 2),
    });
    const catalog = createCapabilityCatalog({
      catalogId: 'catalog-stale-writer',
      idempotencyKey: 'catalog-stale-writer-key',
      tenantId: 'tenant-a',
      projectId: stale.projectId,
      source: { sourceId: 'builtin', kind: 'builtin', fetchedAt: T0.toISOString(), expiresAt: null },
      entries: [{ provider: 'claude', model: 'claude-fable-5', capabilities: {} }],
    });
    expect(() => stale.putCatalog(catalog)).toThrow(/authority revision is stale/);
    expect(current.putCatalog(catalog).created).toBe(true);
    stale.close();
    current.close();
  });
});
