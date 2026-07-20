import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createCapabilityCatalog,
  probeExactModelReachability,
  type ReachabilityResult,
} from '../../src/core/provider-truth.js';
import {
  ProviderTruthStore,
  ProviderTruthStoreError,
  type ExactReachabilityQuery,
} from '../../src/core/provider-truth-store.js';

const roots: string[] = [];
const T0 = new Date('2026-07-20T12:00:00.000Z');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-provider-truth-'));
  roots.push(root);
  return root;
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
  it('fails loudly instead of opening an unversioned incompatible truth schema', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'provider-truth-legacy.db');
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const legacy = new Database(dbPath);
    legacy.exec('CREATE TABLE reachability_results (payload_hash TEXT)');
    legacy.close();
    expect(() => new ProviderTruthStore(root, { dbPath, projectId: 'project-a' }))
      .toThrowError(/schema migration is required/);
  });

  it('persists and verifies a catalog without promoting catalog presence to live proof', () => {
    const root = makeRoot();
    const store = new ProviderTruthStore(root, { now: () => T0, projectId: 'project-a' });
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
    const first = new ProviderTruthStore(root, {
      dbPath, now: () => T0, projectId: 'project-a',
    });
    const evidence = await result(first);
    expect(first.putReachability(evidence)).toEqual({
      evidenceRef: 'provider-reachability:reachability-1', created: true,
    });
    expect(first.putReachability(evidence).created).toBe(false);
    first.close();

    const restarted = new ProviderTruthStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
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
    const store = new ProviderTruthStore(root, { now: () => T0, projectId: 'project-a' });
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
    const store = new ProviderTruthStore(root, { now: () => T0, projectId: 'project-a' });
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
    const store = new ProviderTruthStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
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
    const store = new ProviderTruthStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    const evidence = await result(store);
    store.putReachability(evidence);
    store.close();

    const raw = new Database(dbPath);
    raw.exec('DROP TRIGGER reachability_results_no_update');
    raw.prepare("UPDATE reachability_results SET payload_json='{}'").run();
    raw.close();

    const reopened = new ProviderTruthStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    expect(() => reopened.getReachability(
      { tenantId: 'tenant-a', projectId: reopened.projectId }, evidence.reachabilityId, T0,
    )).toThrowError(ProviderTruthStoreError);
    reopened.close();
  });

  it('detects normalized query-envelope tampering even when payload and its hash are untouched', async () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'provider-truth.db');
    const store = new ProviderTruthStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    store.putReachability(await result(store));
    store.close();

    const raw = new Database(dbPath);
    raw.exec('DROP TRIGGER reachability_results_no_update');
    raw.prepare("UPDATE reachability_results SET provider='evil'").run();
    raw.close();

    const reopened = new ProviderTruthStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    expect(() => reopened.getLatestReachability(query(reopened, { provider: 'evil' }), T0))
      .toThrowError(/envelope mismatch/);
    reopened.close();
  });

  it('detects capability catalog envelope tampering', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'provider-truth.db');
    const store = new ProviderTruthStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
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
    raw.close();

    const reopened = new ProviderTruthStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    expect(() => reopened.getCatalog(catalog, catalog.catalogId)).toThrowError(/envelope mismatch/);
    reopened.close();
  });

  it('stores no prompt, response, argv, endpoint URL or credential material', async () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'provider-truth.db');
    const store = new ProviderTruthStore(root, { dbPath, now: () => T0, projectId: 'project-a' });
    store.putReachability(await result(store));
    store.close();
    const bytes = readFileSync(dbPath).toString('utf8');
    expect(bytes).not.toContain('sk-secret');
    expect(bytes).not.toContain('https://openrouter.ai');
    expect(bytes).not.toContain('--dangerously-skip-permissions');
    expect(bytes).not.toContain('user prompt');
    expect(bytes).not.toContain('model response');
  });
});
