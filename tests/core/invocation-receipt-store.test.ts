import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
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
    createdAt: '2026-07-20T12:00:00.000Z',
    ...overrides,
  };
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
});
