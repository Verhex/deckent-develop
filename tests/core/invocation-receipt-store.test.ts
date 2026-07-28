import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationEvent,
  type InvocationReceipt,
} from '../../src/core/invocation-receipt.js';
import {
  InvocationReceiptStore,
  InvocationReceiptStoreError,
} from '../../src/core/invocation-receipt-store.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-invocations-'));
  roots.push(root);
  return root;
}

function receipt(
  store: InvocationReceiptStore,
  overrides: Partial<InvocationReceipt> = {},
): InvocationReceipt {
  return {
    schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
    invocationId: 'inv-1',
    idempotencyKey: 'sprint-1:brain:1',
    tenantId: 'tenant-a',
    projectId: store.projectId,
    runId: 'sprint-1',
    taskId: null,
    callId: 'call-1',
    role: 'brain',
    purpose: 'sprint-planning',
    configured: { provider: 'codex', model: 'gpt-5', source: 'config', reasonCode: 'none' },
    requested: { provider: 'codex', model: 'gpt-5', source: 'config', reasonCode: 'none' },
    resolved: { provider: 'codex', model: 'gpt-5', source: 'router', reasonCode: 'none' },
    called: { provider: 'codex', model: 'gpt-5.5', source: 'wire', reasonCode: 'none' },
    backend: { transport: 'cli', executionBackend: 'host-subprocess' },
    auth: { mode: 'subscription', accountRefHash: null },
    fallbackChain: [],
    reachability: { state: 'unknown', evidenceRef: null },
    limits: { state: 'unknown', evidenceRefs: [] },
    createdAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

function seedInOneTransaction(
  store: InvocationReceiptStore,
  operation: () => void,
): void {
  const internal = store as unknown as { db: Database.Database };
  internal.db.transaction(operation).immediate();
}

function canonicalJson(value: unknown): string {
  const normalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(normalize);
    if (current && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return current;
  };
  return JSON.stringify(normalize(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function rewriteEventWithValidHashes(
  db: Database.Database,
  eventId: string,
  payload: unknown,
  occurredAt?: string,
): void {
  const row = db.prepare(`
    SELECT invocation_id, sequence, event_type, occurred_at, prev_hash
    FROM invocation_events
    WHERE event_id = ?
  `).get(eventId) as {
    invocation_id: string;
    sequence: number;
    event_type: string;
    occurred_at: string;
    prev_hash: string | null;
  };
  const nextOccurredAt = occurredAt ?? row.occurred_at;
  const payloadJson = canonicalJson(payload);
  const payloadHash = sha256(canonicalJson({ type: row.event_type, payload }));
  const eventHash = sha256(canonicalJson({
    invocationId: row.invocation_id,
    sequence: row.sequence,
    eventId,
    eventType: row.event_type,
    occurredAt: nextOccurredAt,
    payloadHash,
    previousHash: row.prev_hash,
  }));
  db.prepare(`
    UPDATE invocation_events
    SET occurred_at = ?, payload_json = ?, payload_hash = ?, event_hash = ?
    WHERE event_id = ?
  `).run(nextOccurredAt, payloadJson, payloadHash, eventHash, eventId);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('InvocationReceiptStore', () => {
  it('keeps a stable path-private project binding across restart', () => {
    const root = makeRoot();
    const first = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    expect(first.projectId).toBe('project-a');
    first.close();
    const restarted = new InvocationReceiptStore(root, { idFactory: () => 'project-b' });
    expect(restarted.projectId).toBe('project-a');
    restarted.close();

    const bytes = readFileSync(join(root, '.deckent', 'runtime', 'invocations.db'));
    expect(bytes.includes(Buffer.from(root))).toBe(false);
  });

  it('persists an immutable hash-chained receipt and folds an open dispatch to unknown', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    const store = new InvocationReceiptStore(root, { dbPath, idFactory: () => 'project-a' });
    const input = receipt(store);
    expect(store.declare(input).created).toBe(true);
    store.append(input, input.invocationId, {
      eventId: 'event-1', type: 'dispatch_started', payload: { attempt: 1 },
    });
    store.close();

    const restarted = new InvocationReceiptStore(root, { dbPath });
    const view = restarted.get(input, input.invocationId);
    expect(view?.transportOutcome).toBe('unknown');
    expect(view?.consumerOutcome).toBe('unknown');
    expect(view?.events).toHaveLength(1);
    expect(view?.events[0]?.previousHash).toBeNull();
    restarted.append(input, input.invocationId, {
      eventId: 'event-2', type: 'transport_settled',
      payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 42 },
    });
    const settled = restarted.get(input, input.invocationId);
    expect(settled?.transportOutcome).toBe('succeeded');
    expect(settled?.events[1]?.previousHash).toBe(settled?.events[0]?.hash);
    restarted.close();

    const raw = new Database(dbPath);
    expect(() => raw.prepare("UPDATE invocations SET tenant_id='evil'").run()).toThrow(/immutable/);
    expect(() => raw.prepare('DELETE FROM invocation_events').run()).toThrow(/immutable/);
    raw.close();
  });

  it('enforces tenant scope and conflicting invocation idempotency', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store);
    expect(store.declare(input).created).toBe(true);
    expect(store.declare(input).created).toBe(false);
    expect(store.get({ tenantId: 'tenant-b', projectId: store.projectId }, input.invocationId)).toBeNull();
    expect(() => store.declare(receipt(store, {
      invocationId: 'inv-2',
      called: { provider: 'codex', model: 'different-wire-model', source: 'wire', reasonCode: 'none' },
    }))).toThrowError(InvocationReceiptStoreError);
    store.close();
  });

  it('atomically gives one reconciliation authority receipt ownership of a task', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const first = receipt(store, {
      invocationId: 'worker-invocation-a',
      idempotencyKey: 'worker-idempotency-a',
      runId: 'run-a',
      taskId: 'run-task-a',
      callId: 'worker-call-a',
      role: 'worker',
      purpose: 'worker-execution',
    });
    expect(store.declareTaskReceiptAtomic(first).created).toBe(true);
    expect(store.declareTaskReceiptAtomic(first).created).toBe(false);
    expect(() => store.declareTaskReceiptAtomic({
      ...first,
      invocationId: 'worker-invocation-b',
      idempotencyKey: 'worker-idempotency-b',
      runId: 'run-b',
      callId: 'worker-call-b',
    })).toThrowError(expect.objectContaining({ code: 'RECONCILIATION_CONFLICT' }));
    expect(store.scanTaskReceipts({
      tenantId: first.tenantId,
      projectId: first.projectId,
      taskId: first.taskId!,
      purpose: 'worker-execution',
    })).toHaveLength(1);
    store.close();
  });

  it('makes event retries idempotent and rejects an event-id payload conflict', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    const event = { eventId: 'event-1', type: 'dispatch_started' as const, payload: { attempt: 1 } };
    const first = store.append(input, input.invocationId, event);
    const retry = store.append(input, input.invocationId, event);
    expect(retry.hash).toBe(first.hash);
    expect(() => store.append(input, input.invocationId, {
      eventId: 'event-1', type: 'dispatch_started', payload: { attempt: 2 },
    })).toThrowError(InvocationReceiptStoreError);
    store.close();
  });

  it('enforces monotonic event chronology and exact authored-timestamp replay', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store, { createdAt: '2026-07-20T01:00:00.000Z' });
    store.declare(input);

    expect(() => store.append(input, input.invocationId, {
      eventId: 'event-before-receipt',
      type: 'dispatch_started',
      occurredAt: '2026-07-20T00:59:59.999Z',
      payload: { attempt: 1 },
    })).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));

    const started = {
      eventId: 'event-at-receipt',
      type: 'dispatch_started' as const,
      occurredAt: input.createdAt,
      payload: { attempt: 1 },
    };
    const first = store.append(input, input.invocationId, started);
    expect(store.append(input, input.invocationId, started)).toEqual(first);
    expect(() => store.append(input, input.invocationId, {
      ...started,
      occurredAt: '2026-07-20T01:00:00.001Z',
    })).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));

    expect(() => store.append(input, input.invocationId, {
      eventId: 'event-before-predecessor',
      type: 'transport_settled',
      occurredAt: '2026-07-20T00:59:59.999Z',
      payload: {
        outcome: 'succeeded',
        exitCode: 0,
        signal: null,
        reasonCode: 'none',
        durationMs: 1,
      },
    })).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));

    store.append(input, input.invocationId, {
      eventId: 'event-same-time',
      type: 'transport_settled',
      occurredAt: input.createdAt,
      payload: {
        outcome: 'succeeded',
        exitCode: 0,
        signal: null,
        reasonCode: 'none',
        durationMs: 1,
      },
    });
    expect(store.get(input, input.invocationId)?.events).toHaveLength(2);
    store.close();
  });

  it('rolls back an atomic suffix whose events are chronologically out of order', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store, {
      invocationId: 'inv-atomic-chronology',
      idempotencyKey: 'inv-atomic-chronology',
      taskId: 'task-a',
      role: 'worker',
      purpose: 'worker-execution',
    });

    expect(() => store.writeAtomic({
      receipt: input,
      events: [
        {
          eventId: 'atomic-rejected',
          type: 'dispatch_rejected',
          occurredAt: '2026-07-20T02:00:00.000Z',
          payload: {
            reasonCode: 'no_provider',
            evidenceRefs: ['evidence:a'],
          },
        },
        {
          eventId: 'atomic-consumer',
          type: 'consumer_settled',
          occurredAt: '2026-07-20T01:59:59.999Z',
          payload: {
            outcome: 'accepted',
            reasonCode: 'not_dispatched_settled',
            taskDisposition: 'not_dispatched',
            evidenceRefs: ['evidence:a'],
          },
        },
      ],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    expect(store.get(input, input.invocationId)).toBeNull();
    store.close();
  });

  it('enforces the receipt event FSM and keeps exact terminal replay idempotent', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'event-start', type: 'dispatch_started', payload: { attempt: 1 },
    });
    store.append(input, input.invocationId, {
      eventId: 'event-transport', type: 'transport_settled',
      payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 4 },
    });
    const terminal = {
      eventId: 'event-consumer', type: 'consumer_settled' as const,
      payload: { outcome: 'accepted' as const, reasonCode: 'none' as const },
    };
    const first = store.append(input, input.invocationId, terminal);
    expect(store.append(input, input.invocationId, terminal)).toEqual(first);
    expect(() => store.append(input, input.invocationId, {
      eventId: 'event-after-terminal', type: 'consumer_settled',
      payload: { outcome: 'rejected', reasonCode: 'validation_failed' },
    })).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    store.close();
  });

  it('fails closed when a receipt payload or event hash is tampered on disk', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    let store = new InvocationReceiptStore(root, { dbPath, idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'event-1', type: 'dispatch_started', payload: { attempt: 1 },
    });
    store.close();

    let raw = new Database(dbPath);
    raw.exec('DROP TRIGGER invocations_no_update');
    raw.prepare("UPDATE invocations SET payload_json = replace(payload_json, 'sprint-1', 'sprint-x')").run();
    raw.close();
    store = new InvocationReceiptStore(root, { dbPath });
    expect(() => store.get(input, input.invocationId))
      .toThrowError(expect.objectContaining({ code: 'INTEGRITY_FAILURE' }));
    store.close();

    const cleanRoot = makeRoot();
    const cleanDbPath = join(cleanRoot, '.deckent', 'runtime', 'invocations.db');
    store = new InvocationReceiptStore(cleanRoot, { dbPath: cleanDbPath, idFactory: () => 'project-b' });
    const cleanInput = receipt(store);
    store.declare(cleanInput);
    store.append(cleanInput, cleanInput.invocationId, {
      eventId: 'event-1', type: 'dispatch_started', payload: { attempt: 1 },
    });
    store.close();
    raw = new Database(cleanDbPath);
    raw.exec('DROP TRIGGER invocation_events_no_update');
    raw.prepare("UPDATE invocation_events SET event_hash = ? WHERE event_id = 'event-1'").run('0'.repeat(64));
    raw.close();
    store = new InvocationReceiptStore(cleanRoot, { dbPath: cleanDbPath });
    expect(() => store.get(cleanInput, cleanInput.invocationId))
      .toThrowError(expect.objectContaining({ code: 'INTEGRITY_FAILURE' }));
    store.close();
  });

  it('fails closed on canonical-hashed malformed payloads and forged chronology', () => {
    const malformedRoot = makeRoot();
    const malformedDbPath = join(
      malformedRoot,
      '.deckent',
      'runtime',
      'invocations.db',
    );
    let store = new InvocationReceiptStore(malformedRoot, {
      dbPath: malformedDbPath,
      idFactory: () => 'project-a',
    });
    const malformedInput = receipt(store);
    store.declare(malformedInput);
    store.append(malformedInput, malformedInput.invocationId, {
      eventId: 'malformed-start',
      type: 'dispatch_started',
      occurredAt: '2026-07-20T01:00:00.000Z',
      payload: { attempt: 1 },
    });
    store.close();

    let raw = new Database(malformedDbPath);
    raw.exec('DROP TRIGGER invocation_events_no_update');
    rewriteEventWithValidHashes(raw, 'malformed-start', {
      attempt: 1,
      prompt: 'canonical-hashed-but-forbidden',
    });
    raw.close();
    store = new InvocationReceiptStore(malformedRoot, { dbPath: malformedDbPath });
    expect(() => store.get(malformedInput, malformedInput.invocationId))
      .toThrowError(expect.objectContaining({ code: 'INTEGRITY_FAILURE' }));
    store.close();

    const chronologyRoot = makeRoot();
    const chronologyDbPath = join(
      chronologyRoot,
      '.deckent',
      'runtime',
      'invocations.db',
    );
    store = new InvocationReceiptStore(chronologyRoot, {
      dbPath: chronologyDbPath,
      idFactory: () => 'project-b',
    });
    const chronologyInput = receipt(store, {
      invocationId: 'inv-chronology',
      idempotencyKey: 'inv-chronology',
      createdAt: '2026-07-20T01:00:00.000Z',
    });
    store.declare(chronologyInput);
    store.append(chronologyInput, chronologyInput.invocationId, {
      eventId: 'chronology-start',
      type: 'dispatch_started',
      occurredAt: '2026-07-20T01:00:00.000Z',
      payload: { attempt: 1 },
    });
    store.append(chronologyInput, chronologyInput.invocationId, {
      eventId: 'chronology-transport',
      type: 'transport_settled',
      occurredAt: '2026-07-20T02:00:00.000Z',
      payload: {
        outcome: 'succeeded',
        exitCode: 0,
        signal: null,
        reasonCode: 'none',
        durationMs: 1,
      },
    });
    store.close();

    raw = new Database(chronologyDbPath);
    raw.exec('DROP TRIGGER invocation_events_no_update');
    rewriteEventWithValidHashes(
      raw,
      'chronology-transport',
      {
        outcome: 'succeeded',
        exitCode: 0,
        signal: null,
        reasonCode: 'none',
        durationMs: 1,
      },
      '2026-07-20T00:59:59.999Z',
    );
    raw.close();
    store = new InvocationReceiptStore(chronologyRoot, { dbPath: chronologyDbPath });
    expect(() => store.get(chronologyInput, chronologyInput.invocationId))
      .toThrowError(expect.objectContaining({ code: 'INTEGRITY_FAILURE' }));
    store.close();
  });

  it('cannot persist prompt, output, argv, or credentials through the typed receipt contract', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    const store = new InvocationReceiptStore(root, { dbPath, idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'event-1', type: 'dispatch_rejected', payload: { reasonCode: 'no_provider' },
    });
    store.close();
    const bytes = readFileSync(dbPath).toString('utf8');
    expect(bytes).not.toContain('super-secret-prompt');
    expect(bytes).not.toContain('sk-secret-key');
    expect(bytes).not.toContain('--dangerously-skip-permissions');
  });

  it('rejects malformed runtime variants across every event payload union', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store, {
      taskId: 'task-a',
      role: 'worker',
      purpose: 'worker-execution',
    });
    store.declare(input);
    const attestation = {
      attestationKind: 'legacy-reconciliation',
      operatorRefHash: '1'.repeat(64),
      attestedAt: '2026-07-20T01:00:00.000Z',
      reasonCode: 'legacy_operator_attestation',
      statementDigest: '2'.repeat(64),
      taskContentDigest: '3'.repeat(64),
      taskCreatedAt: '2026-07-20T00:30:00.000Z',
      observedAbsenceEvidenceRefs: ['evidence:a'],
    };
    const cases: Array<{ label: string; event: unknown }> = [
      { label: 'non-object envelope', event: null },
      {
        label: 'extra envelope field',
        event: {
          eventId: 'bad-envelope',
          type: 'dispatch_started',
          payload: { attempt: 1 },
          output: 'must-not-persist',
        },
      },
      {
        label: 'unknown event type',
        event: { eventId: 'bad-type', type: 'provider_called', payload: {} },
      },
      {
        label: 'fractional attempt',
        event: {
          eventId: 'bad-attempt',
          type: 'dispatch_started',
          payload: { attempt: 1.5 },
        },
      },
      {
        label: 'partial called identity',
        event: {
          eventId: 'bad-partial-called',
          type: 'dispatch_started',
          payload: { attempt: 1, calledProvider: 'codex' },
        },
      },
      {
        label: 'mismatched called identity',
        event: {
          eventId: 'bad-called',
          type: 'dispatch_started',
          payload: { attempt: 1, calledProvider: 'claude', calledModel: 'gpt-5.5' },
        },
      },
      {
        label: 'dispatch extra field',
        event: {
          eventId: 'bad-dispatch-extra',
          type: 'dispatch_started',
          payload: { attempt: 1, argv: ['secret'] },
        },
      },
      {
        label: 'unknown rejection reason',
        event: {
          eventId: 'bad-rejection-reason',
          type: 'dispatch_rejected',
          payload: { reasonCode: 'spawn_error' },
        },
      },
      {
        label: 'non-canonical rejection evidence',
        event: {
          eventId: 'bad-rejection-evidence',
          type: 'dispatch_rejected',
          payload: { reasonCode: 'no_provider', evidenceRefs: ['z', 'a'] },
        },
      },
      {
        label: 'attestation extra field',
        event: {
          eventId: 'bad-attestation-extra',
          type: 'dispatch_rejected',
          occurredAt: attestation.attestedAt,
          payload: {
            reasonCode: 'legacy_operator_attestation',
            evidenceRefs: ['evidence:a'],
            attestation: { ...attestation, operator: 'raw-operator' },
          },
        },
      },
      {
        label: 'attestation evidence mismatch',
        event: {
          eventId: 'bad-attestation-evidence',
          type: 'dispatch_rejected',
          occurredAt: attestation.attestedAt,
          payload: {
            reasonCode: 'legacy_operator_attestation',
            evidenceRefs: ['evidence:b'],
            attestation,
          },
        },
      },
      {
        label: 'unknown transport outcome',
        event: {
          eventId: 'bad-transport-outcome',
          type: 'transport_settled',
          payload: {
            outcome: 'complete',
            exitCode: 0,
            signal: null,
            reasonCode: 'none',
            durationMs: 1,
          },
        },
      },
      {
        label: 'fractional exit code',
        event: {
          eventId: 'bad-exit',
          type: 'transport_settled',
          payload: {
            outcome: 'failed',
            exitCode: 1.5,
            signal: null,
            reasonCode: 'nonzero_exit',
            durationMs: 1,
          },
        },
      },
      {
        label: 'non-string signal',
        event: {
          eventId: 'bad-signal',
          type: 'transport_settled',
          payload: {
            outcome: 'failed',
            exitCode: null,
            signal: 9,
            reasonCode: 'spawn_error',
            durationMs: 1,
          },
        },
      },
      {
        label: 'negative duration',
        event: {
          eventId: 'bad-duration',
          type: 'transport_settled',
          payload: {
            outcome: 'failed',
            exitCode: null,
            signal: null,
            reasonCode: 'spawn_error',
            durationMs: -1,
          },
        },
      },
      {
        label: 'forged reconciliation hash',
        event: {
          eventId: 'bad-reconciliation',
          type: 'transport_settled',
          payload: {
            outcome: 'unknown',
            exitCode: null,
            signal: null,
            reasonCode: 'coordinator_restart_orphan',
            durationMs: 1,
            reconciliation: {
              evidenceRef: 'probe:absent',
              dispatchEventHash: 'not-a-hash',
            },
          },
        },
      },
      {
        label: 'unknown consumer disposition',
        event: {
          eventId: 'bad-disposition',
          type: 'consumer_settled',
          payload: {
            outcome: 'accepted',
            reasonCode: 'none',
            taskDisposition: 'skipped',
            evidenceRefs: ['evidence:a'],
          },
        },
      },
      {
        label: 'consumer extra field',
        event: {
          eventId: 'bad-consumer-extra',
          type: 'consumer_settled',
          payload: { outcome: 'accepted', reasonCode: 'none', output: 'secret' },
        },
      },
    ];

    for (const { label, event } of cases) {
      expect(
        () => store.append(input, input.invocationId, event as InvocationEvent),
        label,
      ).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    }
    expect(store.get(input, input.invocationId)?.events).toEqual([]);
    store.close();
  });

  it('keeps Mission V1 event shapes valid while enforcing called identity when supplied', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store, {
      taskId: 'mission-item-1',
      role: 'worker',
      purpose: 'worker-execution',
      backend: {
        transport: 'cli',
        executionBackend: 'host-subprocess',
        endpointRefHash: 'a'.repeat(64),
      },
    });
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'mission-v1-dispatch',
      type: 'dispatch_started',
      payload: { attempt: 1 },
    });
    store.append(input, input.invocationId, {
      eventId: 'mission-v1-transport',
      type: 'transport_settled',
      payload: {
        outcome: 'succeeded',
        exitCode: 0,
        signal: null,
        reasonCode: 'none',
        durationMs: 1,
      },
    });
    store.append(input, input.invocationId, {
      eventId: 'mission-v1-consumer',
      type: 'consumer_settled',
      payload: { outcome: 'accepted', reasonCode: 'none' },
    });
    expect(store.get(input, input.invocationId)).toMatchObject({
      transportOutcome: 'succeeded',
      consumerOutcome: 'accepted',
    });

    const preDispatch = receipt(store, {
      invocationId: 'inv-pre-dispatch',
      idempotencyKey: 'inv-pre-dispatch',
      taskId: 'mission-item-2',
      role: 'worker',
      purpose: 'worker-execution',
      called: { provider: null, model: null, source: 'none', reasonCode: 'none' },
    });
    store.declare(preDispatch);
    store.append(preDispatch, preDispatch.invocationId, {
      eventId: 'pre-dispatch-called-identity',
      type: 'dispatch_started',
      payload: {
        attempt: 1,
        executionEvidenceRef: 'dispatch:mission-item-2',
        calledProvider: 'codex',
        calledModel: 'gpt-5',
      },
    });
    expect(store.get(preDispatch, preDispatch.invocationId)?.events[0]).toMatchObject({
      type: 'dispatch_started',
      payload: { calledProvider: 'codex', calledModel: 'gpt-5' },
    });
    store.close();
  });

  it('scans only bounded open dispatch heads oldest-first and tenant-scoped', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const declareOpen = (invocationId: string, tenantId: string, occurredAt: string): void => {
      const input = receipt(store, {
        invocationId,
        idempotencyKey: invocationId,
        tenantId,
      });
      store.declare(input);
      store.append(input, invocationId, {
        eventId: `${invocationId}-start`,
        type: 'dispatch_started',
        occurredAt,
        payload: { attempt: 1 },
      });
    };
    declareOpen('inv-new', 'tenant-a', '2026-07-20T12:02:00.000Z');
    declareOpen('inv-old', 'tenant-a', '2026-07-20T12:00:00.000Z');
    declareOpen('inv-other-tenant', 'tenant-b', '2026-07-20T11:59:00.000Z');
    const settled = receipt(store, { invocationId: 'inv-settled', idempotencyKey: 'inv-settled' });
    store.declare(settled);
    store.append(settled, settled.invocationId, {
      eventId: 'settled-start', type: 'dispatch_started', occurredAt: '2026-07-20T11:58:00.000Z', payload: { attempt: 1 },
    });
    store.append(settled, settled.invocationId, {
      eventId: 'settled-terminal', type: 'transport_settled',
      payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 1 },
    });

    expect(store.scanOpenDispatches({
      before: '2026-07-20T12:01:00.000Z', tenantId: 'tenant-a', limit: 10,
    }).map(candidate => candidate.ref.invocationId)).toEqual(['inv-old']);
    expect(store.scanOpenDispatches({
      before: '2026-07-20T12:03:00.000Z', limit: 2,
    }).map(candidate => candidate.ref.invocationId)).toEqual(['inv-other-tenant', 'inv-old']);
    expect(store.scanOpenDispatches({
      before: '2026-07-20T12:03:00.000Z',
      tenantId: 'tenant-a',
      invocationId: 'inv-new',
      limit: 1,
    }).map(candidate => candidate.ref.invocationId)).toEqual(['inv-new']);
    expect(store.scanOpenDispatches({
      before: '2026-07-20T12:03:00.000Z',
      tenantId: 'tenant-a',
      invocationId: 'inv-other-tenant',
      limit: 1,
    })).toEqual([]);
    store.close();
  });

  it('compares and orders valid offset timestamps by absolute time', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const declareOpen = (invocationId: string, occurredAt: string): void => {
      const input = receipt(store, { invocationId, idempotencyKey: invocationId });
      store.declare(input);
      store.append(input, invocationId, {
        eventId: `${invocationId}-start`, type: 'dispatch_started', occurredAt, payload: { attempt: 1 },
      });
    };
    declareOpen('inv-offset-earlier', '2026-07-20T13:00:00.000+02:00');
    declareOpen('inv-z-later', '2026-07-20T11:30:00.000Z');

    expect(store.scanOpenDispatches({ before: '2026-07-20T11:15:00.000Z' })
      .map(candidate => candidate.ref.invocationId)).toEqual(['inv-offset-earlier']);
    expect(store.scanOpenDispatches({ before: '2026-07-20T12:00:00.000Z' })
      .map(candidate => candidate.ref.invocationId)).toEqual(['inv-offset-earlier', 'inv-z-later']);
    store.close();
  });

  it('reconciles an exact open head once with durable evidence provenance', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'event-start', type: 'dispatch_started', occurredAt: '2026-07-20T12:00:00.000Z', payload: { attempt: 1 },
    });
    const [candidate] = store.scanOpenDispatches({ before: '2026-07-20T12:01:00.000Z' });
    expect(candidate).toBeDefined();
    const reconciliation = {
      eventId: 'event-reconcile',
      evidenceRef: 'docker-inspect:container-absent:sha256:abc',
      occurredAt: '2026-07-20T12:01:00.000Z',
      outcome: 'unknown' as const,
      exitCode: null,
      signal: null,
      reasonCode: 'coordinator_restart_orphan' as const,
      durationMs: 60_000,
    };
    const first = store.reconcileOpenDispatch(candidate!, reconciliation);
    expect(store.reconcileOpenDispatch(candidate!, reconciliation)).toEqual(first);
    expect(store.get(input, input.invocationId)).toMatchObject({
      transportOutcome: 'unknown',
      events: [
        { type: 'dispatch_started' },
        {
          type: 'transport_settled',
          payload: {
            reasonCode: 'coordinator_restart_orphan',
            reconciliation: {
              evidenceRef: reconciliation.evidenceRef,
              dispatchEventHash: candidate!.dispatchEvent.hash,
            },
          },
        },
      ],
    });
    store.close();
  });

  it('refuses stale-head reconciliation and altered retry evidence', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'event-start', type: 'dispatch_started', occurredAt: '2026-07-20T12:00:00.000Z', payload: { attempt: 1 },
    });
    const [candidate] = store.scanOpenDispatches({ before: '2026-07-20T12:01:00.000Z' });
    store.append(input, input.invocationId, {
      eventId: 'provider-terminal', type: 'transport_settled',
      payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 5 },
    });
    expect(() => store.reconcileOpenDispatch(candidate!, {
      eventId: 'event-reconcile', evidenceRef: 'stale-observation', outcome: 'unknown',
      exitCode: null, signal: null, reasonCode: 'coordinator_restart_orphan', durationMs: 60_000,
    })).toThrowError(expect.objectContaining({ code: 'RECONCILIATION_CONFLICT' }));

    const retryRoot = makeRoot();
    const retryStore = new InvocationReceiptStore(retryRoot, { idFactory: () => 'project-b' });
    const retryInput = receipt(retryStore);
    retryStore.declare(retryInput);
    retryStore.append(retryInput, retryInput.invocationId, {
      eventId: 'retry-start', type: 'dispatch_started', payload: { attempt: 1 },
    });
    const [retryCandidate] = retryStore.scanOpenDispatches({ before: '2100-01-01T00:00:00.000Z' });
    retryStore.reconcileOpenDispatch(retryCandidate!, {
      eventId: 'retry-reconcile', evidenceRef: 'evidence-a', outcome: 'failed',
      exitCode: null, signal: null, reasonCode: 'coordinator_restart_orphan', durationMs: 1,
    });
    expect(() => retryStore.reconcileOpenDispatch(retryCandidate!, {
      eventId: 'retry-reconcile', evidenceRef: 'evidence-b', outcome: 'failed',
      exitCode: null, signal: null, reasonCode: 'coordinator_restart_orphan', durationMs: 1,
    })).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
    store.close();
    retryStore.close();
  });

  it('validates bounded scan and reconciliation evidence inputs', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store);
    store.declare(input);
    store.append(input, input.invocationId, {
      eventId: 'event-start', type: 'dispatch_started', payload: { attempt: 1 },
    });
    expect(() => store.scanOpenDispatches({ before: 'not-a-time' }))
      .toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    expect(() => store.scanOpenDispatches({ before: '2100-01-01T00:00:00.000Z', limit: 0 }))
      .toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    const [candidate] = store.scanOpenDispatches({ before: '2100-01-01T00:00:00.000Z' });
    expect(() => store.reconcileOpenDispatch(candidate!, {
      eventId: 'event-reconcile', evidenceRef: '', outcome: 'unknown', exitCode: null,
      signal: null, reasonCode: 'coordinator_restart_orphan', durationMs: 1,
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    expect(() => store.reconcileOpenDispatch(candidate!, {
      eventId: 'event-reconcile', evidenceRef: 'probe:absent', occurredAt: 'not-a-time',
      outcome: 'unknown', exitCode: null, signal: null,
      reasonCode: 'coordinator_restart_orphan', durationMs: 1,
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    store.close();
  });

  it('atomically rolls back declaration and rejection when the terminal suffix is invalid', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store, {
      taskId: 'task-a',
      role: 'worker',
      purpose: 'worker-execution',
    });
    expect(() => store.writeAtomic({
      receipt: input,
      events: [
        {
          eventId: 'rejected',
          type: 'dispatch_rejected',
          payload: {
            reasonCode: 'budget_capability_unsupported',
            evidenceRefs: ['evidence:a'],
          },
        },
        {
          eventId: 'invalid-terminal',
          type: 'consumer_settled',
          payload: {
            outcome: 'accepted',
            reasonCode: 'none',
            taskDisposition: 'done',
            evidenceRefs: ['evidence:a'],
          },
        },
      ],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    expect(store.get(input, input.invocationId)).toBeNull();
    store.close();
  });

  it('rejects unknown/generic pre-dispatch causes and attestation without canonical evidence', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const input = receipt(store, {
      taskId: 'task-a',
      role: 'worker',
      purpose: 'worker-execution',
    });
    store.declare(input);
    expect(() => store.append(input, input.invocationId, {
      eventId: 'generic-spawn',
      type: 'dispatch_rejected',
      payload: { reasonCode: 'spawn_error' },
    })).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    expect(() => store.append(input, input.invocationId, {
      eventId: 'legacy-without-attestation',
      type: 'dispatch_rejected',
      payload: { reasonCode: 'legacy_operator_attestation' },
    })).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    expect(() => store.append(input, input.invocationId, {
      eventId: 'legacy-unsorted',
      type: 'dispatch_rejected',
      payload: {
        reasonCode: 'legacy_operator_attestation',
        evidenceRefs: ['z', 'a'],
        attestation: {
          attestationKind: 'legacy-reconciliation',
          operatorRefHash: '1'.repeat(64),
          attestedAt: '2026-07-27T12:00:00.000Z',
          reasonCode: 'legacy_operator_attestation',
          statementDigest: '2'.repeat(64),
          taskContentDigest: '3'.repeat(64),
          taskCreatedAt: '2026-07-27T10:00:00.000Z',
          observedAbsenceEvidenceRefs: ['z', 'a'],
        },
      },
    })).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    store.close();
  });

  it('rejects a canonical-hashed but structurally forged receipt', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const forged = {
      ...receipt(store),
      prompt: 'must-never-enter-the-receipt',
    } as unknown as InvocationReceipt;
    expect(() => store.declare(forged))
      .toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }));
    store.close();
  });

  it('scans exact tenant/project/task receipts and opens an existing store read-only', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    let store = new InvocationReceiptStore(root, {
      dbPath,
      idFactory: () => 'project-a',
    });
    const worker = receipt(store, {
      invocationId: 'worker-a',
      idempotencyKey: 'worker-a',
      tenantId: 'tenant-a',
      taskId: 'task-a',
      role: 'worker',
      purpose: 'worker-execution',
    });
    const foreignTenant = receipt(store, {
      invocationId: 'worker-b',
      idempotencyKey: 'worker-b',
      tenantId: 'tenant-b',
      taskId: 'task-a',
      role: 'worker',
      purpose: 'worker-execution',
    });
    store.declare(worker);
    store.declare(foreignTenant);
    store.close();

    store = new InvocationReceiptStore(root, { dbPath, readOnly: true });
    expect(store.scanTaskReceipts({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskId: 'task-a',
      purpose: 'worker-execution',
    }).map(view => view.receipt.invocationId)).toEqual(['worker-a']);
    expect(() => store.declare(worker))
      .toThrowError(expect.objectContaining({ code: 'READ_ONLY' }));
    store.close();
  });

  it('bulk scans thousands of canonical task ids in bounded chunks without losing ambiguity', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    let store = new InvocationReceiptStore(root, {
      dbPath,
      idFactory: () => 'project-a',
    });
    const taskIds = Array.from(
      { length: 1_003 },
      (_, index) => `task-${String(index).padStart(4, '0')}`,
    );
    seedInOneTransaction(store, () => {
      for (const [index, taskId] of taskIds.entries()) {
        const invocation = receipt(store, {
          invocationId: `bulk-invocation-${String(index).padStart(4, '0')}`,
          idempotencyKey: `bulk-idempotency-${String(index).padStart(4, '0')}`,
          taskId,
          callId: `bulk-call-${String(index).padStart(4, '0')}`,
          role: 'worker',
          purpose: 'worker-execution',
        });
        store.declare(invocation);
        store.append(invocation, invocation.invocationId, {
          eventId: `bulk-dispatch-${String(index).padStart(4, '0')}`,
          type: 'dispatch_started',
          payload: { attempt: 1 },
        });
      }
      store.declare(receipt(store, {
        invocationId: 'ambiguous-z',
        idempotencyKey: 'ambiguous-z',
        taskId: 'task-0000',
        callId: 'ambiguous-z',
        role: 'worker',
        purpose: 'worker-execution',
        createdAt: '2026-07-20T02:00:00.000Z',
      }));
      store.declare(receipt(store, {
        invocationId: 'ambiguous-a',
        idempotencyKey: 'ambiguous-a',
        taskId: 'task-0000',
        callId: 'ambiguous-a',
        role: 'worker',
        purpose: 'worker-execution',
        createdAt: '2026-07-20T02:00:00.000Z',
      }));
      store.declare(receipt(store, {
        invocationId: 'foreign-tenant',
        idempotencyKey: 'foreign-tenant',
        tenantId: 'tenant-b',
        taskId: 'task-0000',
        callId: 'foreign-tenant',
        role: 'worker',
        purpose: 'worker-execution',
      }));
      store.declare(receipt(store, {
        invocationId: 'foreign-purpose',
        idempotencyKey: 'foreign-purpose',
        taskId: 'task-0000',
        callId: 'foreign-purpose',
        role: 'auditor',
        purpose: 'audit-evaluation',
      }));
    });
    store.close();

    store = new InvocationReceiptStore(root, { dbPath, readOnly: true });
    const groups = store.scanTaskReceiptsBulk({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskIds: [
        'task-missing',
        ...taskIds.toReversed(),
        'task-0001',
        'task-0000',
      ],
      purpose: 'worker-execution',
    });
    expect(groups).toHaveLength(1_004);
    expect(groups.map(group => group.taskId)).toEqual([
      ...taskIds,
      'task-missing',
    ]);
    expect(groups[0]?.receipts.map(view => view.receipt.invocationId)).toEqual([
      'ambiguous-z',
      'ambiguous-a',
      'bulk-invocation-0000',
    ]);
    expect(groups[1]?.receipts.map(view => view.receipt.invocationId)).toEqual([
      'bulk-invocation-0001',
    ]);
    expect(groups[1]?.receipts[0]).toMatchObject({
      transportOutcome: 'unknown',
      events: [{ eventId: 'bulk-dispatch-0001', sequence: 1 }],
    });
    expect(groups.at(-1)).toEqual({ taskId: 'task-missing', receipts: [] });
    expect(Object.isFrozen(groups)).toBe(true);
    expect(Object.isFrozen(groups[0])).toBe(true);
    expect(Object.isFrozen(groups[0]?.receipts)).toBe(true);

    const isolated = store.scanTaskReceiptsBulk({
      tenantId: 'tenant-a',
      projectId: store.projectId,
      taskIds: ['task-0001'],
      purpose: 'worker-execution',
    });
    expect(isolated).toHaveLength(1);
    expect(isolated[0]?.receipts[0]?.events).toHaveLength(1);

    const raw = new Database(dbPath, { readonly: true });
    const plan = raw.prepare(`
      EXPLAIN QUERY PLAN
      WITH requested(tenant_id, invocation_id) AS (
        VALUES (?, ?), (?, ?)
      )
      SELECT
        e.tenant_id,
        e.project_id,
        e.event_id,
        e.invocation_id,
        e.sequence,
        e.event_type,
        e.occurred_at,
        e.payload_json,
        e.payload_hash,
        e.prev_hash,
        e.event_hash
      FROM requested AS r
      JOIN invocation_events AS e
        INDEXED BY idx_invocation_events_scope_invocation
        ON e.tenant_id = r.tenant_id
        AND e.project_id = ?
        AND e.invocation_id = r.invocation_id
      ORDER BY e.tenant_id ASC, e.invocation_id ASC, e.sequence ASC
    `).all(
      'tenant-a',
      'bulk-invocation-0001',
      'tenant-a',
      'absent-invocation',
      store.projectId,
    ) as Array<{ detail: string }>;
    expect(plan.map(step => step.detail).join('\n')).toMatch(
      /SEARCH e USING INDEX idx_invocation_events_scope_invocation \(tenant_id=\? AND project_id=\? AND invocation_id=\?\)/u,
    );
    raw.close();
    store.close();
  });

  it('scans high-cardinality tenant tuples once under one project snapshot', () => {
    const root = makeRoot();
    const dbPath = join(root, '.deckent', 'runtime', 'invocations.db');
    const store = new InvocationReceiptStore(root, {
      dbPath,
      idFactory: () => 'project-a',
    });
    const tenants = Array.from(
      { length: 1_003 },
      (_, index) => `tenant-${String(index).padStart(4, '0')}`,
    );
    seedInOneTransaction(store, () => {
      for (const [index, tenantId] of tenants.entries()) {
        store.declare(receipt(store, {
          invocationId: `tenant-invocation-${String(index).padStart(4, '0')}`,
          idempotencyKey: `tenant-idempotency-${String(index).padStart(4, '0')}`,
          tenantId,
          taskId: 'shared-task',
          callId: `tenant-call-${String(index).padStart(4, '0')}`,
          role: 'worker',
          purpose: 'worker-execution',
        }));
      }
      store.declare(receipt(store, {
        invocationId: 'tenant-ambiguity',
        idempotencyKey: 'tenant-ambiguity',
        tenantId: 'tenant-0000',
        taskId: 'shared-task',
        callId: 'tenant-ambiguity',
        role: 'worker',
        purpose: 'worker-execution',
        createdAt: '2026-07-20T02:00:00.000Z',
      }));
    });

    const writer = new InvocationReceiptStore(root, { dbPath });
    const lateReceipt = receipt(writer, {
      invocationId: 'late-snapshot-invocation',
      idempotencyKey: 'late-snapshot-invocation',
      tenantId: 'tenant-zzzz',
      taskId: 'shared-task',
      callId: 'late-snapshot-invocation',
      role: 'worker',
      purpose: 'worker-execution',
    });
    type BulkReader = (
      kind: 'task-receipts' | 'receipt-events',
      statement: unknown,
      bindings: Readonly<Record<string, string>>,
    ) => unknown[];
    const instrumented = store as unknown as { readBulkRows: BulkReader };
    const originalRead = instrumented.readBulkRows.bind(store);
    const queryCounts = {
      'task-receipts': 0,
      'receipt-events': 0,
    };
    let publishedDuringSnapshot = false;
    instrumented.readBulkRows = (kind, statement, bindings) => {
      const rows = originalRead(kind, statement, bindings);
      queryCounts[kind] += 1;
      if (kind === 'task-receipts' && queryCounts[kind] === 1) {
        writer.declare(lateReceipt);
        publishedDuringSnapshot = true;
      }
      return rows;
    };

    const groups = store.scanProjectTaskReceiptsBulk({
      projectId: store.projectId,
      purpose: 'worker-execution',
      requests: [
        { tenantId: 'tenant-zzzz', taskId: 'shared-task' },
        ...tenants.toReversed().map(tenantId => ({ tenantId, taskId: 'shared-task' })),
        { tenantId: 'tenant-0000', taskId: 'shared-task' },
      ],
    });
    instrumented.readBulkRows = originalRead;

    expect(publishedDuringSnapshot).toBe(true);
    expect(groups).toHaveLength(1_004);
    expect(groups[0]).toMatchObject({
      tenantId: 'tenant-0000',
      projectId: store.projectId,
      taskId: 'shared-task',
    });
    expect(groups[0]?.receipts.map(view => view.receipt.invocationId)).toEqual([
      'tenant-ambiguity',
      'tenant-invocation-0000',
    ]);
    expect(groups.at(-1)).toEqual({
      tenantId: 'tenant-zzzz',
      projectId: store.projectId,
      taskId: 'shared-task',
      receipts: [],
    });
    expect(queryCounts).toEqual({
      'task-receipts': 5,
      'receipt-events': 6,
    });

    const afterSnapshot = store.scanProjectTaskReceiptsBulk({
      projectId: store.projectId,
      purpose: 'worker-execution',
      requests: [{ tenantId: 'tenant-zzzz', taskId: 'shared-task' }],
    });
    expect(afterSnapshot[0]?.receipts.map(view => view.receipt.invocationId)).toEqual([
      'late-snapshot-invocation',
    ]);

    const raw = new Database(dbPath, { readonly: true });
    const receiptPlan = raw.prepare(`
      EXPLAIN QUERY PLAN
      WITH requested(tenant_id, task_id) AS (
        VALUES (?, ?), (?, ?)
      )
      SELECT
        i.invocation_id,
        i.tenant_id,
        i.project_id,
        i.payload_json,
        i.payload_hash
      FROM requested AS r
      JOIN invocations AS i
        INDEXED BY idx_invocations_task_scope
        ON i.tenant_id = r.tenant_id
        AND i.project_id = ?
        AND json_extract(i.payload_json, '$.taskId') = r.task_id
        AND json_extract(i.payload_json, '$.purpose') = ?
    `).all(
      'tenant-0000',
      'shared-task',
      'tenant-1002',
      'shared-task',
      store.projectId,
      'worker-execution',
    ) as Array<{ detail: string }>;
    expect(receiptPlan.map(step => step.detail).join('\n')).toMatch(
      /SEARCH i USING INDEX idx_invocations_task_scope/u,
    );
    raw.close();
    writer.close();
    store.close();
  });

  it('validates bulk task receipt scans strictly and keeps empty input query-free', () => {
    const root = makeRoot();
    const store = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const scope = {
      tenantId: 'tenant-a',
      projectId: store.projectId,
      purpose: 'worker-execution' as const,
    };

    expect(store.scanTaskReceiptsBulk({ ...scope, taskIds: [] })).toEqual([]);
    expect(() => store.scanTaskReceiptsBulk({
      ...scope,
      taskIds: [' task-a'],
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    expect(() => store.scanTaskReceiptsBulk({
      ...scope,
      taskIds: ['task-a'],
      purpose: 'unknown-purpose',
    } as never)).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    expect(() => store.scanTaskReceiptsBulk({
      ...scope,
      projectId: 'foreign-project',
      taskIds: ['task-a'],
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    expect(() => store.scanTaskReceiptsBulk({
      ...scope,
      taskIds: ['task-a'],
      limit: 1,
    } as never)).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    const sparse = Array<string>(2);
    sparse[1] = 'task-a';
    expect(() => store.scanTaskReceiptsBulk({
      ...scope,
      taskIds: sparse,
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    expect(store.scanProjectTaskReceiptsBulk({
      projectId: store.projectId,
      purpose: 'worker-execution',
      requests: [],
    })).toEqual([]);
    expect(() => store.scanProjectTaskReceiptsBulk({
      projectId: store.projectId,
      purpose: 'worker-execution',
      requests: [{ tenantId: 'tenant-a', taskId: 'task-a', limit: 1 }],
    } as never)).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    expect(() => store.scanProjectTaskReceiptsBulk({
      projectId: store.projectId,
      purpose: 'worker-execution',
      requests: [{ tenantId: ' tenant-a', taskId: 'task-a' }],
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    const sparseRequests = Array<{ tenantId: string; taskId: string }>(2);
    sparseRequests[1] = { tenantId: 'tenant-a', taskId: 'task-a' };
    expect(() => store.scanProjectTaskReceiptsBulk({
      projectId: store.projectId,
      purpose: 'worker-execution',
      requests: sparseRequests,
    })).toThrowError(expect.objectContaining({ code: 'SCOPE_MISMATCH' }));
    store.close();
  });
});
