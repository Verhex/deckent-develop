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
});
