import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationReceipt,
  type InvocationScope,
} from '../../src/core/invocation-receipt.js';
import {
  InvocationReceiptStore,
  InvocationReceiptStoreError,
} from '../../src/core/invocation-receipt-store.js';
import { deriveProviderQuotaScopeRefHash } from '../../src/core/provider-limit-truth.js';
import type {
  ProviderLimitReservationEvent,
  ProviderLimitReservationRequest,
} from '../../src/core/provider-limit-truth.js';
import { GoalInvocationRuntime } from '../../src/orchestra/autonomous/mission-store/goal-invocation-runtime.js';
import { GoalInvocationHeldError } from '../../src/orchestra/autonomous/mission-store/goal-mission.js';

const roots: string[] = [];
const CREATED_AT = '2026-09-08T00:00:00.000Z';
const SETTLED_AT = '2026-09-08T00:01:00.000Z';
const PROMPT = 'author the accepted goal';

function canonicalJson(value: unknown): string {
  const normalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(Object.entries(current as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]));
    }
    return current;
  };
  return JSON.stringify(normalize(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-invocation-output-'));
  roots.push(root);
  return root;
}

function receipt(
  store: InvocationReceiptStore,
  overrides: Partial<InvocationReceipt> = {},
): InvocationReceipt {
  return {
    schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
    invocationId: 'inv-output-1',
    idempotencyKey: 'inv-output-1',
    tenantId: 'tenant-a',
    projectId: store.projectId,
    runId: 'mission-a',
    taskId: null,
    callId: 'goal-authoring:1',
    role: 'brain',
    purpose: 'goal-authoring',
    configured: { provider: 'claude', model: 'claude-fable-5', source: 'config', reasonCode: 'none' },
    requested: { provider: 'claude', model: 'claude-fable-5', source: 'config', reasonCode: 'none' },
    resolved: { provider: 'claude', model: 'claude-fable-5', source: 'router', reasonCode: 'none' },
    called: { provider: 'claude', model: 'claude-fable-5', source: 'wire', reasonCode: 'none' },
    backend: { transport: 'cli', executionBackend: 'host-subprocess', endpointRefHash: null },
    auth: { mode: 'subscription', accountRefHash: 'a'.repeat(64) },
    fallbackChain: [],
    reachability: { state: 'known', evidenceRef: 'provider-reachability:test-output' },
    limits: { state: 'known', evidenceRefs: ['provider-limit:test-output'] },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function reservation(input: InvocationReceipt): ProviderLimitReservationRequest {
  const identity = {
    tenantId: input.tenantId,
    provider: input.called.provider,
    accountRefHash: 'a'.repeat(64),
    authMode: 'subscription' as const,
    backend: {
      transport: 'cli' as const,
      executionBackend: 'host-subprocess' as const,
      endpointRefHash: null,
    },
  };
  return {
    ...identity,
    projectId: input.projectId,
    model: input.called.model,
    quotaScopeRefHash: deriveProviderQuotaScopeRefHash(identity),
    reservationId: `reservation-${input.invocationId}`,
    idempotencyKey: `reservation-${input.invocationId}`,
    runId: input.runId,
    taskId: input.taskId,
    callId: input.callId,
    attemptId: `attempt-${input.invocationId}`,
    fenceTokenHash: 'f'.repeat(64),
    receiptRef: `invocation-receipt:${sha256(`${input.tenantId}\0${input.projectId}\0${input.invocationId}`)}`,
    reachabilityEvidenceRef: 'provider-reachability:test-output',
    estimates: [{ windowId: 'tokens-all', unit: 'tokens', amount: 10 }],
    estimateEvidenceRefs: ['budget-estimate:test-output'],
    requestedAt: CREATED_AT,
    leaseExpiresAt: '2026-09-08T01:00:00.000Z',
  };
}

function usage(input: InvocationReceipt): ProviderLimitReservationEvent {
  return {
    eventId: `usage-${input.invocationId}`,
    type: 'consumed',
    occurredAt: SETTLED_AT,
    fenceTokenHash: 'f'.repeat(64),
    evidenceRef: 'provider-usage:test-output',
    actual: [{ windowId: 'tokens-all', unit: 'tokens', amount: 5 }],
  };
}

function writeArtifact(
  store: InvocationReceiptStore,
  input: InvocationReceipt,
  options: {
    bytes?: Uint8Array;
    transportEventId?: string;
    usageEvent?: ProviderLimitReservationEvent;
  } = {},
) {
  return store.writeOutputArtifact({
    ref: {
      schemaVersion: 1,
      tenantId: input.tenantId,
      projectId: input.projectId,
      invocationId: input.invocationId,
      purpose: input.purpose,
      provider: input.called.provider,
      model: input.called.model,
      promptDigest: sha256(PROMPT),
    },
    bytes: options.bytes ?? Buffer.from('opaque provider output'),
    transportEvent: {
      eventId: options.transportEventId ?? `transport-${input.invocationId}`,
      type: 'transport_settled',
      occurredAt: SETTLED_AT,
      payload: {
        outcome: 'succeeded', exitCode: 0, signal: null,
        reasonCode: 'none', durationMs: 12,
      },
    },
    reservationRequest: reservation(input),
    usageEvent: options.usageEvent ?? usage(input),
  });
}

function seedArtifact(overrides: Partial<InvocationReceipt> = {}) {
  const root = makeRoot();
  const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
  const store = new InvocationReceiptStore(root, { dbPath, idFactory: () => 'project-a' });
  const input = receipt(store, overrides);
  store.declare(input);
  store.append(input, input.invocationId, {
    eventId: `dispatch-${input.invocationId}`,
    type: 'dispatch_started',
    occurredAt: CREATED_AT,
    payload: { attempt: 1, calledProvider: input.called.provider, calledModel: input.called.model },
  });
  const ref = writeArtifact(store, input);
  store.close();
  return { root, dbPath, input, ref };
}

function withMutableArtifact(dbPath: string, mutate: (db: Database.Database) => void): void {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');
  db.exec('DROP TRIGGER invocation_output_artifacts_no_update');
  mutate(db);
  db.close();
}

function expectArtifactNotAccepted(root: string, dbPath: string, scope: InvocationScope, invocationId: string): void {
  const store = new InvocationReceiptStore(root, { dbPath, readOnly: true });
  try {
    let accepted = false;
    try {
      accepted = store.readOutputArtifact(scope, invocationId) !== null;
    } catch (error) {
      expect(error).toBeInstanceOf(InvocationReceiptStoreError);
      expect((error as InvocationReceiptStoreError).code).toBe('INTEGRITY_FAILURE');
    }
    expect(accepted).toBe(false);
  } finally {
    store.close();
  }
}

function rewriteTransportOutputRef(db: Database.Database, eventId: string, outputRef: string): void {
  const row = db.prepare(`
    SELECT invocation_id, sequence, event_type, occurred_at, payload_json, prev_hash
    FROM invocation_events WHERE event_id = ?
  `).get(eventId) as {
    invocation_id: string;
    sequence: number;
    event_type: string;
    occurred_at: string;
    payload_json: string;
    prev_hash: string | null;
  };
  const payload = { ...(JSON.parse(row.payload_json) as Record<string, unknown>), outputRef };
  const payloadJson = canonicalJson(payload);
  const payloadHash = sha256(canonicalJson({ type: row.event_type, payload }));
  const eventHash = sha256(canonicalJson({
    invocationId: row.invocation_id,
    sequence: row.sequence,
    eventId,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    payloadHash,
    previousHash: row.prev_hash,
  }));
  db.prepare(`
    UPDATE invocation_events
    SET payload_json = ?, payload_hash = ?, event_hash = ?
    WHERE event_id = ?
  `).run(payloadJson, payloadHash, eventHash, eventId);
}

function rewriteRecovery(
  dbPath: string,
  invocationId: string,
  mutate: (recovery: {
    reservationRequest: ProviderLimitReservationRequest;
    usageEvent: ProviderLimitReservationEvent;
  }) => {
    reservationRequest: ProviderLimitReservationRequest;
    usageEvent: ProviderLimitReservationEvent;
  },
): void {
  const db = new Database(dbPath);
  db.exec('DROP TRIGGER invocation_output_artifacts_no_update; DROP TRIGGER invocation_events_no_update');
  const row = db.prepare('SELECT * FROM invocation_output_artifacts WHERE invocation_id = ?')
    .get(invocationId) as Record<string, unknown>;
  const recovery = mutate(JSON.parse(String(row.recovery_json)) as {
    reservationRequest: ProviderLimitReservationRequest;
    usageEvent: ProviderLimitReservationEvent;
  });
  const reservationDigest = sha256(canonicalJson(recovery.reservationRequest));
  const usageDigest = sha256(canonicalJson(recovery.usageEvent));
  const base = {
    schemaVersion: 1,
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    invocationId: String(row.invocation_id),
    purpose: row.purpose,
    provider: String(row.provider),
    model: String(row.model),
    promptDigest: String(row.prompt_digest),
    reservationDigest,
    usageDigest,
    contentSha256: String(row.content_sha256),
    byteLength: Number(row.byte_length),
  };
  const artifactSha256 = sha256(canonicalJson(base));
  db.prepare(`
    UPDATE invocation_output_artifacts
    SET reservation_digest = ?, usage_digest = ?, artifact_sha256 = ?, recovery_json = ?
    WHERE invocation_id = ?
  `).run(
    reservationDigest,
    usageDigest,
    artifactSha256,
    canonicalJson(recovery),
    invocationId,
  );
  rewriteTransportOutputRef(db, `transport-${invocationId}`, `invocation-output:${artifactSha256}`);
  db.close();
}

function goalInvocationId(missionId: string): string {
  return `goal-${sha256(['tenant-a', missionId, '1', 'goal-authoring'].join('\0'))}`;
}

async function expectReplayHeld(
  seeded: ReturnType<typeof seedArtifact>,
  input: { missionId?: string; prompt?: string; candidates?: Record<string, { provider: string; model: string }> } = {},
): Promise<void> {
  const ledger = new InvocationReceiptStore(seeded.root, { dbPath: seeded.dbPath, readOnly: true });
  const admissionRuntime = { admit: vi.fn(), settleExistingDispatch: vi.fn() };
  const executeSelected = vi.fn();
  const runtime = new GoalInvocationRuntime({
    admissionRuntime: admissionRuntime as never,
    receiptLedger: ledger,
    executeSelected,
  });
  try {
    await expect(runtime.execute({
      tenantId: 'tenant-a', missionId: input.missionId ?? 'mission-a', round: 1,
      role: 'brain', purpose: 'goal-authoring', prompt: input.prompt ?? PROMPT,
      admission: {
        candidates: input.candidates ?? { claude: { provider: 'claude', model: 'claude-fable-5' } },
      } as never,
      finalOnlyUsage: {
        maxWallClockSeconds: 30,
        profileRef: 'execution_budget.final_only_usage',
        policyDigest: 'd'.repeat(64),
      },
    })).rejects.toMatchObject({
      name: 'GoalInvocationHeldError',
      hold: { reasonCode: 'receipt_unavailable' },
    } satisfies Partial<GoalInvocationHeldError>);
    expect(admissionRuntime.admit).not.toHaveBeenCalled();
    expect(admissionRuntime.settleExistingDispatch).not.toHaveBeenCalled();
    expect(executeSelected).not.toHaveBeenCalled();
  } finally {
    ledger.close();
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('invocation output artifact SQLite integrity', () => {
  it.each([
    ['bytes', (db: Database.Database) => db.prepare('UPDATE invocation_output_artifacts SET content = ?').run(Buffer.from('tampered'))],
    ['content digest', (db: Database.Database) => db.prepare('UPDATE invocation_output_artifacts SET content_sha256 = ?').run('0'.repeat(64))],
    ['artifact digest', (db: Database.Database) => db.prepare('UPDATE invocation_output_artifacts SET artifact_sha256 = ?').run('0'.repeat(64))],
    ['byte length', (db: Database.Database) => db.prepare('UPDATE invocation_output_artifacts SET byte_length = byte_length + 1').run()],
    ['prompt digest', (db: Database.Database) => db.prepare('UPDATE invocation_output_artifacts SET prompt_digest = ?').run('1'.repeat(64))],
    ['reservation digest', (db: Database.Database) => db.prepare('UPDATE invocation_output_artifacts SET reservation_digest = ?').run('2'.repeat(64))],
    ['usage digest', (db: Database.Database) => db.prepare('UPDATE invocation_output_artifacts SET usage_digest = ?').run('3'.repeat(64))],
    ['provider', (db: Database.Database) => db.prepare("UPDATE invocation_output_artifacts SET provider = 'codex'").run()],
    ['model', (db: Database.Database) => db.prepare("UPDATE invocation_output_artifacts SET model = 'gpt-5.5'").run()],
    ['tenant row', (db: Database.Database) => db.prepare("UPDATE invocation_output_artifacts SET tenant_id = 'tenant-b'").run()],
    ['project row', (db: Database.Database) => db.prepare("UPDATE invocation_output_artifacts SET project_id = 'project-b'").run()],
    ['invocation row', (db: Database.Database) => db.prepare("UPDATE invocation_output_artifacts SET invocation_id = 'inv-output-other'").run()],
  ] as const)('does not accept %s tampering', (_label, mutate) => {
    const seeded = seedArtifact();
    withMutableArtifact(seeded.dbPath, mutate);
    expectArtifactNotAccepted(seeded.root, seeded.dbPath, seeded.input, seeded.input.invocationId);
  });

  it('does not accept a transport output ref detached from the immutable artifact', () => {
    const seeded = seedArtifact();
    const db = new Database(seeded.dbPath);
    db.exec('DROP TRIGGER invocation_events_no_update');
    rewriteTransportOutputRef(db, `transport-${seeded.input.invocationId}`, `invocation-output:${'0'.repeat(64)}`);
    db.close();
    expectArtifactNotAccepted(seeded.root, seeded.dbPath, seeded.input, seeded.input.invocationId);
  });

  it('does not let an artifact row become a sibling invocation output', () => {
    const seeded = seedArtifact();
    const store = new InvocationReceiptStore(seeded.root, { dbPath: seeded.dbPath });
    const sibling = receipt(store, { invocationId: 'inv-output-sibling', idempotencyKey: 'inv-output-sibling' });
    store.declare(sibling);
    store.append(sibling, sibling.invocationId, {
      eventId: 'dispatch-inv-output-sibling', type: 'dispatch_started', occurredAt: CREATED_AT,
      payload: { attempt: 1, calledProvider: sibling.called.provider, calledModel: sibling.called.model },
    });
    store.close();
    withMutableArtifact(seeded.dbPath, db => {
      db.prepare('UPDATE invocation_output_artifacts SET invocation_id = ?').run(sibling.invocationId);
    });
    expectArtifactNotAccepted(seeded.root, seeded.dbPath, sibling, sibling.invocationId);
    expectArtifactNotAccepted(seeded.root, seeded.dbPath, seeded.input, seeded.input.invocationId);
  });

  it('returns absence for a read-only legacy receipt database without the artifact table', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    let store = new InvocationReceiptStore(root, { dbPath, idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.close();
    const db = new Database(dbPath);
    db.exec('DROP TABLE invocation_output_artifacts');
    db.close();

    store = new InvocationReceiptStore(root, { dbPath, readOnly: true });
    expect(store.readOutputArtifact(input, input.invocationId)).toBeNull();
    store.close();
  });

  it('turns a succeeded legacy replay without the artifact table into a typed hold', async () => {
    const invocationId = goalInvocationId('mission-a');
    const seeded = seedArtifact({ invocationId, idempotencyKey: invocationId });
    const db = new Database(seeded.dbPath);
    db.exec('DROP TABLE invocation_output_artifacts');
    db.close();
    await expectReplayHeld(seeded);
  });

  it('rolls the artifact row back when its atomic transport event conflicts with a sibling event', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    const store = new InvocationReceiptStore(root, { dbPath, idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'dispatch-inv-output-1', type: 'dispatch_started', occurredAt: CREATED_AT,
      payload: { attempt: 1, calledProvider: input.called.provider, calledModel: input.called.model },
    });
    const sibling = receipt(store, { invocationId: 'inv-output-sibling', idempotencyKey: 'inv-output-sibling' });
    store.declare(sibling);
    store.append(sibling, sibling.invocationId, {
      eventId: 'transport-event-collision', type: 'dispatch_started', occurredAt: CREATED_AT,
      payload: { attempt: 1, calledProvider: sibling.called.provider, calledModel: sibling.called.model },
    });

    expect(() => writeArtifact(store, input, { transportEventId: 'transport-event-collision' }))
      .toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
    expect(store.readOutputArtifact(input, input.invocationId)).toBeNull();
    expect(store.get(input, input.invocationId)?.events).toHaveLength(1);
    store.close();
  });

  it.each([
    ['receipt ref', (request: ProviderLimitReservationRequest) => ({ ...request, receiptRef: 'invocation-receipt:sibling' })],
    ['run', (request: ProviderLimitReservationRequest) => ({ ...request, runId: 'run-sibling' })],
    ['provider', (request: ProviderLimitReservationRequest) => ({ ...request, provider: 'codex' as const })],
    ['model', (request: ProviderLimitReservationRequest) => ({ ...request, model: 'gpt-5.5' })],
  ] as const)('rejects a %s reservation mismatch before output publication', (_label, mutate) => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'dispatch-inv-output-1', type: 'dispatch_started', occurredAt: CREATED_AT,
      payload: { attempt: 1, calledProvider: input.called.provider, calledModel: input.called.model },
    });
    expect(() => store.writeOutputArtifact({
      ref: {
        schemaVersion: 1, tenantId: input.tenantId, projectId: input.projectId,
        invocationId: input.invocationId, purpose: input.purpose,
        provider: input.called.provider, model: input.called.model, promptDigest: sha256(PROMPT),
      },
      bytes: Buffer.from('opaque provider output'),
      transportEvent: {
        eventId: 'transport-inv-output-1', type: 'transport_settled', occurredAt: SETTLED_AT,
        payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 12 },
      },
      reservationRequest: mutate(reservation(input)),
      usageEvent: usage(input),
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    expect(store.readOutputArtifact(input, input.invocationId)).toBeNull();
    expect(store.get(input, input.invocationId)?.transportOutcome).toBe('unknown');
    store.close();
  });

  it('rejects unresolved usage before atomically publishing output or transport success', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'dispatch-inv-output-1', type: 'dispatch_started', occurredAt: CREATED_AT,
      payload: { attempt: 1, calledProvider: input.called.provider, calledModel: input.called.model },
    });
    const unresolved = { ...usage(input), actual: undefined } as unknown as ProviderLimitReservationEvent;

    expect(() => writeArtifact(store, input, { usageEvent: unresolved })).toThrow(/requires actual usage/u);
    expect(store.readOutputArtifact(input, input.invocationId)).toBeNull();
    expect(store.get(input, input.invocationId)?.transportOutcome).toBe('unknown');
    store.close();
  });

  it('does not accept a hash-consistent replay whose recovered usage is unresolved', async () => {
    const invocationId = goalInvocationId('mission-a');
    const seeded = seedArtifact({ invocationId, idempotencyKey: invocationId });
    rewriteRecovery(seeded.dbPath, invocationId, recovery => ({
      ...recovery,
      usageEvent: { ...recovery.usageEvent, actual: undefined } as unknown as ProviderLimitReservationEvent,
    }));
    await expectReplayHeld(seeded);
  });

  it.each([
    ['receipt ref', (request: ProviderLimitReservationRequest) => ({ ...request, receiptRef: 'invocation-receipt:sibling' })],
    ['run', (request: ProviderLimitReservationRequest) => ({ ...request, runId: 'mission-sibling' })],
    ['provider', (request: ProviderLimitReservationRequest) => ({ ...request, provider: 'codex' as const })],
    ['model', (request: ProviderLimitReservationRequest) => ({ ...request, model: 'gpt-5.5' })],
  ] as const)('turns a hash-consistent replay with wrong %s binding into a typed hold', async (_label, mutate) => {
    const invocationId = goalInvocationId('mission-a');
    const seeded = seedArtifact({ invocationId, idempotencyKey: invocationId });
    rewriteRecovery(seeded.dbPath, invocationId, recovery => ({
      ...recovery,
      reservationRequest: mutate(recovery.reservationRequest),
    }));
    await expectReplayHeld(seeded);
  });

  it('holds a replay when the supplied prompt differs from the persisted artifact', async () => {
    const invocationId = goalInvocationId('mission-a');
    const seeded = seedArtifact({ invocationId, idempotencyKey: invocationId });
    await expectReplayHeld(seeded, { prompt: 'a different prompt' });
  });

  it('holds a replay when the mission identity does not match the receipt reservation', async () => {
    const invocationId = goalInvocationId('mission-sibling');
    const seeded = seedArtifact({ invocationId, idempotencyKey: invocationId, runId: 'mission-a' });
    await expectReplayHeld(seeded, { missionId: 'mission-sibling' });
  });

});
