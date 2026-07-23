import { createHmac } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ProviderAuthorityKeyring,
  type ProviderIntegrityAuthority,
} from '../../src/core/provider-authority-keyring.js';
import {
  createProviderLimitResult,
  deriveProviderQuotaScopeRefHash,
  type ProviderLimitObservation,
  type ProviderLimitPolicy,
  type ProviderLimitReservationRequest,
} from '../../src/core/provider-limit-truth.js';
import {
  ProviderLimitStore,
  ProviderLimitStoreError,
  migrateProviderLimitStoreV1ToV2,
  resolveProviderLimitStorePath,
  type ProviderLimitReservationQuery,
} from '../../src/core/provider-limit-store.js';

const roots: string[] = [];
const ACCOUNT_HASH = 'a'.repeat(64);
const ENDPOINT_HASH = 'c'.repeat(64);
const QUOTA_HASH = deriveProviderQuotaScopeRefHash({
  tenantId: 'tenant-a', provider: 'openrouter', accountRefHash: ACCOUNT_HASH, authMode: 'api',
  backend: { transport: 'http', executionBackend: 'docker', endpointRefHash: ENDPOINT_HASH },
});
const LOCAL_ENDPOINT_HASH = 'e'.repeat(64);
const LOCAL_QUOTA_HASH = deriveProviderQuotaScopeRefHash({
  tenantId: 'tenant-a', provider: 'ollama', accountRefHash: null, authMode: 'local',
  backend: { transport: 'local-runtime', executionBackend: 'in-process', endpointRefHash: LOCAL_ENDPOINT_HASH },
});
const ALTERNATE_ENDPOINT_HASH = 'f'.repeat(64);
const ALTERNATE_QUOTA_HASH = deriveProviderQuotaScopeRefHash({
  tenantId: 'tenant-a', provider: 'openrouter', accountRefHash: ACCOUNT_HASH, authMode: 'api',
  backend: { transport: 'http', executionBackend: 'docker', endpointRefHash: ALTERNATE_ENDPOINT_HASH },
});
const INTEGRITY_KEY = 'deckent-provider-limit-test-key-00000001';
const T0 = '2026-07-20T12:00:00.000Z';
const T1 = '2026-07-20T12:01:00.000Z';
const T2 = '2026-07-20T12:02:00.000Z';
const T3 = '2026-07-20T12:03:00.000Z';
const T4 = '2026-07-20T12:04:00.000Z';
const T10 = '2026-07-20T12:10:00.000Z';
const T11 = '2026-07-20T12:11:00.000Z';

const POLICY: ProviderLimitPolicy = {
  policyRef: 'limit-policy:00000001',
  warnAtRatio: 0.8,
  blockAtRatio: 0.95,
  minimumRemaining: {},
};

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-provider-limit-'));
  roots.push(root);
  return root;
}

function observation(overrides: Partial<ProviderLimitObservation> = {}): ProviderLimitObservation {
  return {
    tenantId: 'tenant-a',
    projectId: 'project-a',
    idempotencyKey: 'snapshot-key-1',
    provider: 'openrouter',
    accountRefHash: ACCOUNT_HASH,
    quotaScopeRefHash: QUOTA_HASH,
    authMode: 'api',
    backend: { transport: 'http', executionBackend: 'docker', endpointRefHash: ENDPOINT_HASH },
    state: 'known',
    requiredWindowIds: ['input-tokens'],
    windows: [{
      windowId: 'input-tokens',
      kind: 'rate-window',
      model: 'openai/gpt-5.6-sol',
      unit: 'tokens',
      consumed: 0,
      remaining: 100,
      limit: 100,
      reset: { state: 'known', at: T10, displayRefHash: null },
    }],
    source: {
      kind: 'http-headers',
      authority: 'authoritative',
      operatorApprovalRef: null,
      evidenceRef: 'limit-source:00000001',
      fetchedAt: T0,
      expiresAt: T10,
      incorporatedReservationEventRefs: [],
    },
    ...overrides,
  };
}

function query(overrides: Partial<ProviderLimitReservationQuery> = {}): ProviderLimitReservationQuery {
  return {
    tenantId: 'tenant-a',
    projectId: 'project-a',
    provider: 'openrouter',
    accountRefHash: ACCOUNT_HASH,
    quotaScopeRefHash: QUOTA_HASH,
    authMode: 'api',
    ...overrides,
  };
}

function reservation(
  id: string,
  amount: number,
  overrides: Partial<ProviderLimitReservationRequest> = {},
): ProviderLimitReservationRequest {
  return {
    tenantId: 'tenant-a',
    projectId: 'project-a',
    reservationId: id,
    idempotencyKey: `reservation-key-${id}`,
    runId: 'run-a',
    taskId: 'task-a',
    callId: `call-${id}`,
    attemptId: `attempt-${id}`,
    fenceTokenHash: 'd'.repeat(64),
    receiptRef: `invocation-receipt:00000001-${id}`,
    reachabilityEvidenceRef: 'provider-reachability:00000001',
    provider: 'openrouter',
    model: 'openai/gpt-5.6-sol',
    accountRefHash: ACCOUNT_HASH,
    quotaScopeRefHash: QUOTA_HASH,
    authMode: 'api',
    backend: { transport: 'http', executionBackend: 'docker', endpointRefHash: ENDPOINT_HASH },
    estimates: [{ windowId: 'input-tokens', unit: 'tokens', amount }],
    estimateEvidenceRefs: [`budget-estimate:00000001-${id}`],
    requestedAt: T0,
    leaseExpiresAt: T10,
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ProviderLimitStore', () => {
  it('resolves the account-wide store under each platform global state root', () => {
    expect(resolveProviderLimitStorePath('linux', { HOME: '/home/alp' }))
      .toBe('/home/alp/.local/state/deckent/provider-limits.db');
    expect(resolveProviderLimitStorePath('wsl', { HOME: '/home/alp' }))
      .toBe('/home/alp/.local/state/deckent/provider-limits.db');
    expect(resolveProviderLimitStorePath('darwin', { HOME: '/Users/alp' }))
      .toBe('/Users/alp/Library/Application Support/deckent/provider-limits.db');
    expect(resolveProviderLimitStorePath('win32', {
      USERPROFILE: 'C:\\Users\\alp', LOCALAPPDATA: 'D:\\Local',
    })).toBe('D:\\Local\\deckent\\provider-limits.db');
  });

  it('persists a snapshot across restart and shares account capacity across projects', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-limits.db');
    const first = new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    const snapshot = createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' });
    expect(first.putSnapshot(snapshot)).toEqual({
      evidenceRef: 'provider-limit:snapshot-1', created: true,
    });
    expect(first.putSnapshot(snapshot).created).toBe(false);
    first.close();

    const restarted = new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    expect(restarted.getLatestSnapshot(query())).toMatchObject({
      limitResultId: 'snapshot-1', state: 'known', decision: 'allow',
    });
    expect(restarted.reserve(reservation('cross-project', 60, { projectId: 'project-b' })))
      .toMatchObject({ decision: 'allow', effectiveRemaining: { 'input-tokens': 100 } });
    expect(restarted.reserve(reservation('second-project', 50, { projectId: 'project-c' })))
      .toMatchObject({
        decision: 'hold', reasonCode: 'insufficient_remaining',
        effectiveRemaining: { 'input-tokens': 40 },
      });
    expect(restarted.reserve(reservation('projected-policy', 35, { projectId: 'project-d' })))
      .toMatchObject({
        decision: 'hold', reasonCode: 'policy_block', effectiveRemaining: { 'input-tokens': 40 },
      });
    restarted.close();
  });

  it('holds missing, unknown and stale snapshots without fabricating capacity', () => {
    const root = makeRoot();
    const store = new ProviderLimitStore(root, {
      now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    expect(store.reserve(reservation('missing', 1))).toMatchObject({
      decision: 'hold', reasonCode: 'snapshot_missing', snapshotEvidenceRef: null,
    });
    store.putSnapshot(createProviderLimitResult(observation({
      idempotencyKey: 'snapshot-unknown', state: 'unknown', windows: [], requiredWindowIds: [],
    }), POLICY, { idFactory: () => 'snapshot-unknown' }));
    expect(store.reserve(reservation('unknown', 1))).toMatchObject({
      decision: 'hold', reasonCode: 'snapshot_not_usable',
    });
    store.putSnapshot(createProviderLimitResult(observation({
      idempotencyKey: 'snapshot-expired',
      source: { ...observation().source, fetchedAt: T0, expiresAt: T1 },
    }), POLICY, { idFactory: () => 'snapshot-expired' }));
    expect(store.reserve(reservation('stale', 1))).toMatchObject({
      decision: 'hold', reasonCode: 'snapshot_not_usable',
    });
    store.close();
  });

  it('release frees capacity and consumed usage remains reserved until a newer snapshot', () => {
    const root = makeRoot();
    let now = new Date(T2);
    const store = new ProviderLimitStore(root, {
      now: () => now, policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    store.putSnapshot(createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' }));
    expect(store.reserve(reservation('released', 60)).decision).toBe('allow');
    store.appendReservationEvent(query(), 'released', {
      eventId: 'event-release', type: 'released', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'release-event:00000001',
      terminationEvidenceRef: 'runtime-stopped:00000001',
      terminationAuthorityRef: 'termination-authority:v1-00001',
    });
    expect(store.appendReservationEvent(query(), 'released', {
      eventId: 'event-release', type: 'released', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'release-event:00000001',
      terminationEvidenceRef: 'runtime-stopped:00000001',
      terminationAuthorityRef: 'termination-authority:v1-00001',
    }).eventId).toBe('event-release');
    expect(store.getReservation(query(), 'released')?.state).toBe('released');
    expect(store.reserve(reservation('after-release', 60)).decision).toBe('allow');

    const dispatched = store.appendReservationEvent(query(), 'after-release', {
      eventId: 'event-dispatched', type: 'dispatched', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'provider-dispatch:00000001',
    });
    const consumed = store.appendReservationEvent(query(), 'after-release', {
      eventId: 'event-consumed', type: 'consumed', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'provider-usage:00000001',
      actual: [{ windowId: 'input-tokens', unit: 'tokens', amount: 70 }],
    });
    expect(dispatched).toMatchObject({ sequence: 1, previousHash: null });
    expect(consumed).toMatchObject({ sequence: 2, previousHash: dispatched.hash });
    expect(store.getReservation(query(), 'after-release')).toMatchObject({
      state: 'consumed', events: [{ type: 'dispatched' }, { type: 'consumed' }],
    });
    expect(store.reserve(reservation('before-refresh', 50))).toMatchObject({
      decision: 'hold', effectiveRemaining: { 'input-tokens': 30 },
    });

    expect(() => store.putSnapshot(createProviderLimitResult(observation({
      idempotencyKey: 'snapshot-key-forged-coverage',
      source: {
        ...observation().source,
        evidenceRef: 'limit-source:forged-coverage',
        incorporatedReservationEventRefs: ['provider-limit-reservation-event:event-consumed'],
      },
      evidenceRefs: ['provider-usage:00000001', 'invocation-receipt:00000001-after-release'],
    }), POLICY, { idFactory: () => 'snapshot-forged-coverage' }))).toThrow(/cannot incorporate/);

    store.putSnapshot(createProviderLimitResult(observation({
      idempotencyKey: 'snapshot-key-uncovered',
      source: { ...observation().source, evidenceRef: 'limit-source:uncovered-0001', fetchedAt: T2 },
      windows: [{ ...observation().windows[0]!, consumed: 70, remaining: 30 }],
    }), POLICY, { idFactory: () => 'snapshot-uncovered' }));
    expect(store.reserve(reservation('uncovered-refresh', 1))).toMatchObject({
      decision: 'hold', reasonCode: 'insufficient_remaining',
      effectiveRemaining: { 'input-tokens': 0 },
    });

    now = new Date(T4);
    store.putSnapshot(createProviderLimitResult(observation({
      idempotencyKey: 'snapshot-key-2',
      source: {
        ...observation().source,
        evidenceRef: 'limit-source:00000002',
        fetchedAt: T3,
        incorporatedReservationEventRefs: ['provider-limit-reservation-event:event-consumed'],
      },
      evidenceRefs: ['provider-usage:00000001', 'invocation-receipt:00000001-after-release'],
      windows: [{ ...observation().windows[0]!, consumed: 70, remaining: 30 }],
    }), POLICY, { idFactory: () => 'snapshot-2' }));
    expect(store.reserve(reservation('after-refresh', 20, { requestedAt: T4 }))).toMatchObject({
      decision: 'allow', effectiveRemaining: { 'input-tokens': 30 },
    });
    store.close();
  });

  it('never releases capacity from unresolved termination evidence', () => {
    const root = makeRoot();
    const store = new ProviderLimitStore(root, {
      now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => false, integrityKey: INTEGRITY_KEY,
    });
    store.putSnapshot(createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' }));
    expect(store.reserve(reservation('unverified-release', 60)).decision).toBe('allow');
    store.appendReservationEvent(query(), 'unverified-release', {
      eventId: 'dispatch-unverified-release', type: 'dispatched', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'provider-dispatch:unverified-release',
    });
    expect(() => store.appendReservationEvent(query(), 'unverified-release', {
      eventId: 'release-unverified', type: 'released', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'provider-release:unverified-release',
      terminationEvidenceRef: 'runtime-stopped:unverified-release',
      terminationAuthorityRef: 'termination-authority:v1-00001',
    })).toThrow(/not durably verified/);
    expect(store.reserve(reservation('after-unverified-release', 50))).toMatchObject({
      decision: 'hold', reasonCode: 'insufficient_remaining',
      effectiveRemaining: { 'input-tokens': 40 },
    });
    store.close();
  });

  it('fails reads, capacity projection and duplicate release replay after authority revocation', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-limits.db');
    let terminationAuthorized = true;
    const verifier = () => terminationAuthorized;
    const first = new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: verifier, integrityKey: INTEGRITY_KEY,
    });
    first.putSnapshot(createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' }));
    expect(first.reserve(reservation('revoked-release', 60)).decision).toBe('allow');
    first.appendReservationEvent(query(), 'revoked-release', {
      eventId: 'dispatch-revoked-release', type: 'dispatched', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'provider-dispatch:revoked-release',
    });
    const release = {
      eventId: 'release-revoked-release', type: 'released' as const, occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'provider-release:revoked-release',
      terminationEvidenceRef: 'runtime-stopped:revoked-release',
      terminationAuthorityRef: 'termination-authority:v1-revoked',
    };
    first.appendReservationEvent(query(), 'revoked-release', release);
    terminationAuthorized = false;
    expect(() => first.appendReservationEvent(query(), 'revoked-release', release))
      .toThrow(/no longer verifiable/);
    first.close();

    const restartedForRead = new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: verifier, integrityKey: INTEGRITY_KEY,
    });
    expect(() => restartedForRead.getReservation(query(), 'revoked-release'))
      .toThrow(/no longer verifiable/);
    restartedForRead.close();

    const restartedForCapacity = new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: verifier, integrityKey: INTEGRITY_KEY,
    });
    expect(() => restartedForCapacity.reserve(reservation('after-revocation', 50)))
      .toThrow(/no longer verifiable/);
    restartedForCapacity.close();
  });

  it('expires leases and enforces idempotency for local null-account scope', () => {
    const root = makeRoot();
    let now = new Date(T2);
    const store = new ProviderLimitStore(root, {
      now: () => now, policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    const localObservation = observation({
      provider: 'ollama', accountRefHash: null, authMode: 'local',
      quotaScopeRefHash: LOCAL_QUOTA_HASH,
      backend: { transport: 'local-runtime', executionBackend: 'in-process', endpointRefHash: LOCAL_ENDPOINT_HASH },
      idempotencyKey: 'local-snapshot-key',
      source: { ...observation().source, kind: 'local-runtime' },
    });
    store.putSnapshot(createProviderLimitResult(localObservation, POLICY, { idFactory: () => 'local-snapshot' }));
    const localRequest = reservation('local', 60, {
      provider: 'ollama', accountRefHash: null, authMode: 'local', leaseExpiresAt: T3,
      quotaScopeRefHash: LOCAL_QUOTA_HASH,
      backend: { transport: 'local-runtime', executionBackend: 'in-process', endpointRefHash: LOCAL_ENDPOINT_HASH },
    });
    expect(store.reserve(localRequest).decision).toBe('allow');
    expect(store.reserve(localRequest).reservationId).toBe('local');
    expect(() => store.reserve({ ...localRequest, reservationId: 'local-conflict' }))
      .toThrowError(ProviderLimitStoreError);
    now = new Date(T4);
    expect(store.getReservation(query({
      provider: 'ollama', accountRefHash: null, authMode: 'local', quotaScopeRefHash: LOCAL_QUOTA_HASH,
    }), 'local')?.state)
      .toBe('expired-unreconciled');
    expect(store.reserve(localRequest).reservationId).toBe('local');
    expect(store.reserve(reservation('local-after-expiry', 60, {
      provider: 'ollama', accountRefHash: null, authMode: 'local', requestedAt: T4,
      quotaScopeRefHash: LOCAL_QUOTA_HASH,
      backend: { transport: 'local-runtime', executionBackend: 'in-process', endpointRefHash: LOCAL_ENDPOINT_HASH },
    }))).toMatchObject({ decision: 'hold', reasonCode: 'insufficient_remaining' });
    store.appendReservationEvent(query({
      provider: 'ollama', accountRefHash: null, authMode: 'local', quotaScopeRefHash: LOCAL_QUOTA_HASH,
    }), 'local', {
      eventId: 'event-late-release', type: 'released', occurredAt: T4,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'release-event:late-0001',
      terminationEvidenceRef: 'runtime-stopped:late-0001',
      terminationAuthorityRef: 'termination-authority:v1-00001',
    });
    expect(store.reserve(reservation('local-after-reconcile', 60, {
      provider: 'ollama', accountRefHash: null, authMode: 'local', requestedAt: T4,
      quotaScopeRefHash: LOCAL_QUOTA_HASH,
      backend: { transport: 'local-runtime', executionBackend: 'in-process', endpointRefHash: LOCAL_ENDPOINT_HASH },
    })).decision).toBe('allow');
    store.close();
  });

  it('rejects mismatched settlement scope and detects immutable payload tampering', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-limits.db');
    const store = new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    store.putSnapshot(createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' }));
    store.reserve(reservation('settle', 60));
    expect(store.getReservation(query({ projectId: 'project-b' }), 'settle')).toBeNull();
    expect(() => store.appendReservationEvent(query({ projectId: 'project-b' }), 'settle', {
      eventId: 'event-foreign-project', type: 'released', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'release-event:foreign-project',
      terminationEvidenceRef: 'runtime-stopped:foreign-project',
      terminationAuthorityRef: 'termination-authority:v1-00001',
    })).toThrow(/not found/);
    expect(() => store.appendReservationEvent(query(), 'settle', {
      eventId: 'event-bad-fence', type: 'released', occurredAt: T1,
      fenceTokenHash: 'f'.repeat(64), evidenceRef: 'release-event:bad-fence-0001',
      terminationEvidenceRef: 'runtime-stopped:bad-fence-0001',
      terminationAuthorityRef: 'termination-authority:v1-00001',
    })).toThrow(/fencing token mismatch/);
    expect(() => store.appendReservationEvent(query(), 'settle', {
      eventId: 'event-dispatched-settle', type: 'dispatched', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'provider-dispatch:settle-0001',
    })).not.toThrow();
    expect(() => store.appendReservationEvent(query(), 'settle', {
      eventId: 'event-bad-unit', type: 'consumed', occurredAt: T1,
      fenceTokenHash: 'd'.repeat(64), evidenceRef: 'provider-usage:bad-unit',
      actual: [{ windowId: 'input-tokens', unit: 'requests', amount: 1 }],
    })).toThrow(/does not match reserved window scope/);
    store.close();

    const raw = new Database(dbPath);
    expect(() => raw.prepare("UPDATE provider_limit_snapshots SET provider='evil'").run()).toThrow(/immutable/);
    raw.exec('DROP TRIGGER provider_limit_snapshots_no_update');
    raw.prepare("UPDATE provider_limit_snapshots SET payload_json='{}'").run();
    raw.close();

    expect(() => new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    })).toThrow(/schema triggers are invalid/);
  });

  it('fails capacity projection closed on an unsigned released lifecycle row', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-limits.db');
    const store = new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    store.putSnapshot(createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' }));
    expect(store.reserve(reservation('forged-release', 60)).decision).toBe('allow');
    store.close();

    const raw = new Database(dbPath);
    raw.prepare(`
      INSERT INTO provider_limit_reservation_events (
        event_id, reservation_id, sequence, event_type, occurred_at,
        payload_json, payload_hash, previous_hash, event_hash,
        integrity_key_id, integrity_version
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        (SELECT active_key_id FROM provider_limit_authority WHERE singleton_id = 1),
        2
      )
    `).run(
      'forged-release-event', 'forged-release', 1, 'released', T1,
      '{}', '0'.repeat(64), null, '1'.repeat(64),
    );
    raw.close();

    const restarted = new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    expect(() => restarted.reserve(reservation('after-forged-release', 50)))
      .toThrow(/event payload hash mismatch/);
    restarted.close();
  });

  it('fails loudly on an incompatible pre-existing schema', () => {
    const root = makeRoot();
    const dbPath = join(root, 'legacy.db');
    const legacy = new Database(dbPath);
    legacy.exec('CREATE TABLE provider_limit_snapshots (payload_hash TEXT)');
    legacy.close();
    expect(() => new ProviderLimitStore(root, {
      dbPath, policyResolver: () => POLICY, terminationEvidenceVerifier: () => true,
      integrityKey: INTEGRITY_KEY,
    }))
      .toThrow(/schema migration is required/);
  });

  it('fails loudly when an immutable schema index is weakened', () => {
    const root = makeRoot();
    const dbPath = join(root, 'weakened.db');
    const store = new ProviderLimitStore(root, {
      dbPath, policyResolver: () => POLICY, terminationEvidenceVerifier: () => true,
      integrityKey: INTEGRITY_KEY,
    });
    store.close();
    const raw = new Database(dbPath);
    raw.exec('DROP INDEX idx_provider_limit_reservation_idempotency');
    raw.exec(`
      CREATE UNIQUE INDEX idx_provider_limit_reservation_idempotency
      ON provider_limit_reservations (reservation_id)
    `);
    raw.close();
    expect(() => new ProviderLimitStore(root, {
      dbPath, policyResolver: () => POLICY, terminationEvidenceVerifier: () => true,
      integrityKey: INTEGRITY_KEY,
    })).toThrow(/schema indexes are invalid/);
  });

  it('isolates quota buckets and applies the requesting policy at reservation time', () => {
    const root = makeRoot();
    const store = new ProviderLimitStore(root, {
      now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    store.putSnapshot(createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' }));
    expect(store.reserve(reservation('other-endpoint', 1, {
      quotaScopeRefHash: ALTERNATE_QUOTA_HASH,
      backend: { ...reservation('shape', 1).backend, endpointRefHash: ALTERNATE_ENDPOINT_HASH },
    }))).toMatchObject({ decision: 'hold', reasonCode: 'snapshot_missing' });

    const strictPolicy: ProviderLimitPolicy = {
      ...POLICY,
      policyRef: 'limit-policy:strict-0001',
      blockAtRatio: 0.5,
      warnAtRatio: 0.4,
      minimumRemaining: { tokens: 100 },
    };
    store.close();

    const strictRoot = makeRoot();
    const strictStore = new ProviderLimitStore(strictRoot, {
      now: () => new Date(T2), policyResolver: () => strictPolicy,
      terminationEvidenceVerifier: () => true,
      integrityKey: INTEGRITY_KEY,
    });
    strictStore.putSnapshot(createProviderLimitResult(observation({
      idempotencyKey: 'strict-snapshot-key',
    }), POLICY, { idFactory: () => 'strict-snapshot' }));
    expect(strictStore.reserve(reservation('strict-project', 1, { projectId: 'project-b' })))
      .toMatchObject({ decision: 'hold', reasonCode: 'snapshot_not_usable' });
    strictStore.close();
  });

  it('holds incomplete estimate scope and a lease that outlives its evidence', () => {
    const root = makeRoot();
    const store = new ProviderLimitStore(root, {
      now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    store.putSnapshot(createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' }));
    expect(store.reserve(reservation('missing-window', 1, {
      estimates: [{ windowId: 'output-tokens', unit: 'tokens', amount: 1 }],
    }))).toMatchObject({ decision: 'hold', reasonCode: 'estimate_scope_mismatch' });
    expect(store.reserve(reservation('long-lease', 1, { leaseExpiresAt: T11 })))
      .toMatchObject({ decision: 'hold', reasonCode: 'lease_outlives_snapshot' });
    expect(store.reserve(reservation('wrong-model', 1, { model: 'openai/gpt-5.5' })))
      .toMatchObject({ decision: 'hold', reasonCode: 'model_mismatch' });
    expect(() => store.reserve(reservation('offset-time', 1, {
      requestedAt: '2026-07-20T15:00:00+03:00',
    }))).toThrow(/canonical ISO timestamp/);
    expect(() => store.reserve(reservation('whitespace-id', 1, { callId: ' call-id ' })))
      .toThrow(/callId is required/);
    store.close();
  });

  it('requires the same host integrity key across restart', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-limits.db');
    const first = new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    });
    first.putSnapshot(createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' }));
    first.close();
    expect(() => new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true,
      integrityKey: 'different-deckent-provider-limit-key-0001',
    })).toThrow(/authority mismatch/);
  });

  it('serializes projected policy across eight independent store connections', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-limits.db');
    const stores = Array.from({ length: 8 }, () => new ProviderLimitStore(root, {
      dbPath, now: () => new Date(T2), policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true, integrityKey: INTEGRITY_KEY,
    }));
    stores[0]!.putSnapshot(createProviderLimitResult(observation(), POLICY, { idFactory: () => 'snapshot-1' }));
    const reservations = stores.map((store, index) => store.reserve(reservation(
      `connection-${index}`,
      20,
      { projectId: `project-${index}` },
    )));
    expect(reservations.filter(item => item.decision === 'allow')).toHaveLength(4);
    expect(reservations.filter(item => item.decision === 'allow')
      .reduce((total, item) => total + item.estimates[0]!.amount, 0)).toBe(80);
    expect(reservations.slice(4).every(item => item.reasonCode === 'policy_block')).toBe(true);
    for (const store of stores) store.close();
  });

  it('keeps mixed active/retired limit evidence readable across key rotation', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-limits.db');
    const keyring = ProviderAuthorityKeyring.create({
      dataDir: root,
      keyringIdFactory: () => 'par-limit-rotation-0001',
      keyIdFactory: () => 'pak-limit-rotation-0001',
      randomBytesFactory: size => Buffer.alloc(size, 0x71),
    }).keyring;
    const store = new ProviderLimitStore(root, {
      dbPath,
      now: () => new Date(T2),
      policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true,
      integrityAuthority: keyring,
    });
    store.putSnapshot(createProviderLimitResult(
      observation(),
      POLICY,
      { idFactory: () => 'snapshot-before-rotation' },
    ));
    keyring.rotate({
      expectedRevisionHash: keyring.snapshot().revisionHash,
      keyIdFactory: () => 'pak-limit-rotation-0002',
      randomBytesFactory: size => Buffer.alloc(size, 0x72),
    });
    store.putSnapshot(createProviderLimitResult(
      observation({
        idempotencyKey: 'snapshot-key-after-rotation',
        source: {
          ...observation().source,
          evidenceRef: 'limit-source:after-rotation',
          fetchedAt: T1,
        },
      }),
      POLICY,
      { idFactory: () => 'snapshot-after-rotation' },
    ));
    store.close();

    const raw = new Database(dbPath);
    expect(raw.prepare(`
      SELECT limit_result_id, integrity_key_id
      FROM provider_limit_snapshots ORDER BY limit_result_id
    `).all()).toEqual([
      { limit_result_id: 'snapshot-after-rotation', integrity_key_id: 'pak-limit-rotation-0002' },
      { limit_result_id: 'snapshot-before-rotation', integrity_key_id: 'pak-limit-rotation-0001' },
    ]);
    raw.close();

    const reopened = new ProviderLimitStore(root, {
      dbPath,
      now: () => new Date(T2),
      policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true,
      integrityAuthority: keyring,
    });
    expect(reopened.getLatestSnapshot(query())?.limitResultId).toBe('snapshot-after-rotation');
    reopened.close();
  });

  it('migrates v1 evidence transactionally without rewriting payload identity', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-limits-v1.db');
    const legacyKeyId = 'pak-legacy-limit-v1-0001';
    const store = new ProviderLimitStore(root, {
      dbPath,
      now: () => new Date(T2),
      policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true,
      integrityKey: INTEGRITY_KEY,
    });
    store.putSnapshot(createProviderLimitResult(
      observation(),
      POLICY,
      { idFactory: () => 'snapshot-v1-migration' },
    ));
    store.close();

    const legacy = new Database(dbPath);
    legacy.exec(`
      DROP TRIGGER provider_limit_snapshots_no_update;
      DROP TRIGGER provider_limit_snapshots_active_key_insert;
      DROP TRIGGER provider_limit_reservations_active_key_insert;
      DROP TRIGGER provider_limit_events_active_key_insert;
    `);
    const snapshot = legacy.prepare(`
      SELECT payload_json FROM provider_limit_snapshots WHERE limit_result_id = ?
    `).get('snapshot-v1-migration') as { payload_json: string };
    const legacyHash = createHmac('sha256', INTEGRITY_KEY)
      .update(snapshot.payload_json)
      .digest('hex');
    legacy.prepare('UPDATE provider_limit_snapshots SET payload_hash = ?').run(legacyHash);
    legacy.exec(`
      DROP TABLE provider_limit_authority;
      ALTER TABLE provider_limit_snapshots DROP COLUMN integrity_version;
      ALTER TABLE provider_limit_snapshots DROP COLUMN integrity_key_id;
      ALTER TABLE provider_limit_reservations DROP COLUMN integrity_version;
      ALTER TABLE provider_limit_reservations DROP COLUMN integrity_key_id;
      ALTER TABLE provider_limit_reservation_events DROP COLUMN integrity_version;
      ALTER TABLE provider_limit_reservation_events DROP COLUMN integrity_key_id;
      CREATE TRIGGER provider_limit_snapshots_no_update
        BEFORE UPDATE ON provider_limit_snapshots BEGIN
          SELECT RAISE(ABORT, 'provider limit snapshots are immutable');
        END;
    `);
    legacy.pragma('user_version = 1');
    const before = legacy.prepare(`
      SELECT payload_json, payload_hash FROM provider_limit_snapshots WHERE limit_result_id = ?
    `).get('snapshot-v1-migration');
    legacy.close();

    migrateProviderLimitStoreV1ToV2({
      dbPath,
      legacyKeyId,
      legacyIntegrityKey: INTEGRITY_KEY,
    });
    const keyring = ProviderAuthorityKeyring.create({
      dataDir: root,
      keyringIdFactory: () => 'par-limit-migration-0001',
      keyIdFactory: () => 'pak-limit-current-0001',
      randomBytesFactory: size => Buffer.alloc(size, 0x73),
    }).keyring;
    keyring.importLegacyVerificationKey({
      expectedRevisionHash: keyring.snapshot().revisionHash,
      domain: 'limit',
      legacyKey: INTEGRITY_KEY,
      keyIdFactory: () => legacyKeyId,
    });
    const migrated = new ProviderLimitStore(root, {
      dbPath,
      now: () => new Date(T2),
      policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true,
      integrityAuthority: keyring,
    });
    expect(migrated.getLatestSnapshot(query())?.limitResultId).toBe('snapshot-v1-migration');
    migrated.close();

    const verify = new Database(dbPath);
    expect(verify.prepare(`
      SELECT payload_json, payload_hash FROM provider_limit_snapshots WHERE limit_result_id = ?
    `).get('snapshot-v1-migration')).toEqual(before);
    expect(verify.pragma('user_version', { simple: true })).toBe(2);
    verify.close();
  });

  it('rejects a stale writer after a newer limit authority revision is durable', () => {
    const root = makeRoot();
    const dbPath = join(root, 'provider-limit-stale-writer.db');
    const keys = {
      'pak-limit-stale-0001': 'limit-stale-writer-key-material-00000001',
      'pak-limit-stale-0002': 'limit-stale-writer-key-material-00000002',
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
    const options = {
      dbPath,
      now: () => new Date(T2),
      policyResolver: () => POLICY,
      terminationEvidenceVerifier: () => true,
    };
    const stale = new ProviderLimitStore(root, {
      ...options,
      integrityAuthority: authority('pak-limit-stale-0001', 1),
    });
    const current = new ProviderLimitStore(root, {
      ...options,
      integrityAuthority: authority('pak-limit-stale-0002', 2),
    });
    const snapshot = createProviderLimitResult(
      observation(),
      POLICY,
      { idFactory: () => 'snapshot-stale-writer' },
    );
    expect(() => stale.putSnapshot(snapshot)).toThrow(/authority revision is stale/);
    expect(current.putSnapshot(snapshot).created).toBe(true);
    stale.close();
    current.close();
  });
});
