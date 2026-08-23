import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import {
  ApprovalDecisionAuthority, ApprovalDecisionIngress,
  type ApprovalDecisionIntegrityAuthority, type LiveApprovalAuthentication,
  type LiveApprovalAuthenticator, type LiveApprovalSessionProof,
} from '../../src/core/approval-decision-ingress.js';
import {
  ProviderExecutionObservationMigrationApprovalBridge,
  ProviderExecutionObservationMigrationApprovalError,
} from '../../src/core/provider-execution-observation-migration-approval.js';
import {
  inspectProviderExecutionObservationMigration, planProviderExecutionObservationMigration,
  safeProviderExecutionObservationProjectPath,
  type ProviderExecutionObservationMigrationPlan,
} from '../../src/core/provider-execution-observation-migration.js';

const NOW = new Date('2026-08-01T12:00:00.000Z');
const EXPIRES = '2026-08-01T12:10:00.000Z';
const KEY = Buffer.from('migration-approval-test-key');
const roots: string[] = [];

class Integrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return { keyId: 'migration-test-key', mac: createHmac('sha256', KEY).update(payload).digest('hex') };
  }
  verify(keyId: string, payload: string, mac: string): boolean {
    if (keyId !== 'migration-test-key' || !/^[a-f0-9]{64}$/u.test(mac)) return false;
    const expected = this.sign(payload).mac;
    return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'));
  }
}

class InteractiveAuthenticator implements LiveApprovalAuthenticator {
  active = true;
  calls = 0;
  identity: LiveApprovalAuthentication = {
    actorId: 'owner-a', tenantId: 'tenant-a', role: 'owner',
    sessionRef: 'interactive-session-secret', authorityRef: 'test-interactive-terminal:v1',
    authenticatedAt: NOW.toISOString(), expiresAt: '2026-08-01T12:05:00.000Z',
  };
  async reauthenticate(): Promise<LiveApprovalAuthentication | null> {
    this.calls += 1;
    return this.active ? this.identity : null;
  }
  isSessionActive(proof: LiveApprovalSessionProof): boolean {
    return this.active && proof.actorId === this.identity.actorId
      && proof.tenantId === this.identity.tenantId
      && proof.authorityRef === this.identity.authorityRef
      && proof.sessionRefHash === createHash('sha256').update(this.identity.sessionRef).digest('hex');
  }
}

interface Fixture {
  root: string; broker: ApprovalBroker; authenticator: InteractiveAuthenticator;
  integrity: Integrity; ingress: ApprovalDecisionIngress; authority: ApprovalDecisionAuthority;
  bridge: ProviderExecutionObservationMigrationApprovalBridge;
  plan: ProviderExecutionObservationMigrationPlan; requestId: string;
}

function createLegacyDatabase(root: string): void {
  const db = new Database(join(root, 'observations.db'));
  db.exec('CREATE TABLE provider_execution_intervals (execution_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, attempt_id TEXT NOT NULL, principal_digest TEXT NOT NULL, fence TEXT NOT NULL, start_json TEXT NOT NULL, end_json TEXT, start_sequence INTEGER NOT NULL, end_sequence INTEGER); CREATE TABLE provider_execution_contradictions (contradiction_id INTEGER PRIMARY KEY AUTOINCREMENT, principal_digest TEXT NOT NULL, payload_json TEXT NOT NULL); PRAGMA user_version = 1;');
  db.close();
}

function bridgeFor(input: {
  root: string; broker: ApprovalBroker; ingress: ApprovalDecisionIngress;
  authority: ApprovalDecisionAuthority; now?: () => Date; tenantId?: string;
  generation?: string; projectRoot?: string; timeout?: 'deny' | 'park';
  requesterId?: string; userId?: string;
}): ProviderExecutionObservationMigrationApprovalBridge {
  return new ProviderExecutionObservationMigrationApprovalBridge({
    broker: input.broker, decisionIngress: input.ingress, decisionAuthority: input.authority,
    projectRoot: input.projectRoot ?? input.root, tenantId: input.tenantId ?? 'tenant-a',
    userId: input.userId ?? 'owner-a',
    requester: { role: 'brain', instanceId: input.requesterId ?? 'brain-migrator' },
    generation: input.generation ?? 'generation-1', expiresAt: EXPIRES,
    timeout: input.timeout ?? 'deny', now: input.now ?? (() => NOW),
  });
}

function fixture(timeout: 'deny' | 'park' = 'deny'): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'migration-approval-'));
  roots.push(root);
  createLegacyDatabase(root);
  const broker = new ApprovalBroker(root, { clock: () => NOW });
  const authenticator = new InteractiveAuthenticator();
  const integrity = new Integrity();
  const ingress = new ApprovalDecisionIngress({ broker, authenticator, integrity, channel: 'terminal', now: () => NOW });
  const authority = new ApprovalDecisionAuthority(integrity, authenticator);
  const path = safeProviderExecutionObservationProjectPath(root, 'observations.db');
  const plan = planProviderExecutionObservationMigration({
    projectPath: path, inspection: inspectProviderExecutionObservationMigration(path),
    clock: { now: () => NOW }, ids: { nextId: () => 'migration-1' },
  });
  const bridge = bridgeFor({ root, broker, ingress, authority, timeout });
  const submitted = bridge.submit(plan);
  return { root, broker, authenticator, integrity, ingress, authority, bridge, plan, requestId: submitted.request.id };
}

function apply(f: Fixture, now = NOW) {
  return f.bridge.apply({
    requestId: f.requestId, plan: f.plan, clock: { now: () => now },
    ids: { nextId: () => 'receipt-1' },
  });
}

function errorCode(operation: () => unknown): string {
  try { operation(); return 'NO_ERROR'; } catch (error) {
    expect(error).toBeInstanceOf(ProviderExecutionObservationMigrationApprovalError);
    return (error as ProviderExecutionObservationMigrationApprovalError).code;
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ProviderExecutionObservationMigrationApprovalBridge critical authority', () => {
  it('requires interactive authenticated allow before fresh apply and avoids direct decide', async () => {
    const f = fixture();
    const directDecide = vi.spyOn(f.broker, 'decide');
    expect(f.broker.getDecision(f.requestId)).toBeNull();
    expect(errorCode(() => apply(f))).toBe('DECISION_NOT_FOUND');

    expect((await f.bridge.decide({
      requestId: f.requestId, action: 'allow', idempotencyKey: 'interactive-allow',
    })).kind).toBe('decided');
    expect(f.authenticator.calls).toBe(1);
    expect(directDecide).not.toHaveBeenCalled();

    const applied = apply(f);
    expect(applied.kind).toBe('applied');
    expect(applied.result.state).toBe('applied');
    if (applied.result.state === 'applied') {
      expect(applied.result.receipt.authorityId).toBe('approval:' + f.requestId);
    }
    expect(directDecide).not.toHaveBeenCalled();
  });

  it('never auto-allows deny, expiry, or parked expiry', async () => {
    const denied = fixture();
    expect((await denied.bridge.decide({
      requestId: denied.requestId, action: 'deny', idempotencyKey: 'interactive-deny',
    })).kind).toBe('decided');
    expect(errorCode(() => apply(denied))).toBe('DECISION_NOT_ALLOWED');

    const expired = fixture('deny');
    expect(expired.broker.expire(new Date(EXPIRES))).toMatchObject([{ decision: 'deny', channel: 'ttl-expire' }]);
    expect(errorCode(() => apply(expired))).toBe('DECISION_NOT_ALLOWED');

    const parked = fixture('park');
    expect(parked.broker.getRequest(parked.requestId)?.defaultAction).toBe('defer');
    // A parked request remains non-authority: the broker closes a non-executable
    // defer default as deny rather than ever translating timeout into allow.
    expect(parked.broker.expire(new Date(EXPIRES))).toMatchObject([{ decision: 'deny', channel: 'ttl-expire' }]);
    expect(errorCode(() => apply(parked))).toBe('DECISION_NOT_ALLOWED');
  });

  it('rejects self-approval and wrong tenant, project, digest, or generation', async () => {
    const f = fixture();
    await f.bridge.decide({ requestId: f.requestId, action: 'allow', idempotencyKey: 'binding-matrix' });
    const applyWith = (bridge: ProviderExecutionObservationMigrationApprovalBridge, plan = f.plan) =>
      bridge.apply({ requestId: f.requestId, plan, clock: { now: () => NOW }, ids: { nextId: () => 'r-mismatch' } });

    expect(errorCode(() => applyWith(bridgeFor({
      root: f.root, broker: f.broker, ingress: f.ingress, authority: f.authority, tenantId: 'tenant-b',
    })))).toBe('REQUEST_MISMATCH');
    expect(errorCode(() => applyWith(bridgeFor({
      root: f.root, broker: f.broker, ingress: f.ingress, authority: f.authority, generation: 'generation-2',
    })))).toBe('REQUEST_MISMATCH');

    const otherRoot = mkdtempSync(join(tmpdir(), 'migration-other-project-'));
    roots.push(otherRoot);
    expect(errorCode(() => applyWith(bridgeFor({
      root: f.root, projectRoot: otherRoot, broker: f.broker, ingress: f.ingress, authority: f.authority,
    })))).toBe('REQUEST_MISMATCH');
    expect(errorCode(() => applyWith(f.bridge, { ...f.plan, sourceSchemaDigest: '0'.repeat(64) })))
      .toBe('REQUEST_MISMATCH');

    expect(() => bridgeFor({
      root: f.root, broker: f.broker, ingress: f.ingress, authority: f.authority,
      userId: 'brain-migrator', requesterId: 'brain-migrator',
    })).toThrowError(expect.objectContaining({ code: 'INVALID_BINDING' }));
  });

  it('rejects stale MAC/session and expired authorization reuse', async () => {
    const revoked = fixture();
    await revoked.bridge.decide({ requestId: revoked.requestId, action: 'allow', idempotencyKey: 'revoked' });
    revoked.authenticator.active = false;
    expect(errorCode(() => apply(revoked))).toBe('DECISION_UNTRUSTED');

    const tampered = fixture();
    await tampered.bridge.decide({ requestId: tampered.requestId, action: 'allow', idempotencyKey: 'mac' });
    const path = join(tampered.root, '.deckent', 'approvals', tampered.requestId + '.decision.json');
    const decision = JSON.parse(readFileSync(path, 'utf8')) as { authorization: { integrityMac: string } };
    decision.authorization.integrityMac = '0'.repeat(64);
    writeFileSync(path, JSON.stringify(decision));
    const broker = new ApprovalBroker(tampered.root, { clock: () => NOW });
    const ingress = new ApprovalDecisionIngress({
      broker, authenticator: tampered.authenticator, integrity: tampered.integrity, channel: 'terminal', now: () => NOW,
    });
    const bridge = bridgeFor({ root: tampered.root, broker, ingress, authority: tampered.authority });
    expect(errorCode(() => bridge.apply({
      requestId: tampered.requestId, plan: tampered.plan, clock: { now: () => NOW },
      ids: { nextId: () => 'r-mac' },
    }))).toBe('DECISION_UNTRUSTED');

    const stale = fixture();
    await stale.bridge.decide({ requestId: stale.requestId, action: 'allow', idempotencyKey: 'stale' });
    const late = new Date('2026-08-01T12:06:00.000Z');
    const staleBridge = bridgeFor({
      root: stale.root, broker: stale.broker, ingress: stale.ingress, authority: stale.authority, now: () => late,
    });
    expect(errorCode(() => staleBridge.apply({
      requestId: stale.requestId, plan: stale.plan, clock: { now: () => late }, ids: { nextId: () => 'r-stale' },
    }))).toBe('DECISION_UNTRUSTED');
  });

  it('preserves FWW across authenticated replay, conflict, and restart', async () => {
    const f = fixture();
    const command = { requestId: f.requestId, action: 'allow' as const, idempotencyKey: 'winner', reason: 'reviewed' };
    expect((await f.bridge.decide(command)).kind).toBe('decided');
    expect((await f.bridge.decide(command)).kind).toBe('idempotent');
    expect(f.authenticator.calls).toBe(2);
    expect(await f.bridge.decide({ ...command, action: 'deny' })).toEqual({ kind: 'rejected', reason: 'conflict' });

    const winner = f.broker.getDecision(f.requestId);
    const broker = new ApprovalBroker(f.root, { clock: () => NOW });
    expect(broker.getDecision(f.requestId)).toEqual(winner);
    const ingress = new ApprovalDecisionIngress({
      broker, authenticator: f.authenticator, integrity: f.integrity, channel: 'terminal', now: () => NOW,
    });
    const restarted = bridgeFor({ root: f.root, broker, ingress, authority: f.authority });
    expect((await restarted.decide(command)).kind).toBe('idempotent');
    expect(broker.getDecision(f.requestId)).toEqual(winner);
  });
});
