import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAcceptanceRouteDebt, transitionAcceptanceRouteDebt } from '../../src/core/debt-store.js';
import { deriveAcceptanceConfirmationId, type AcceptanceConfirmationLineage } from '../../src/core/acceptance-confirmation-contract.js';
import { MemoryStore } from '../../src/core/memory-store.js';

let projectRoot: string;
let dbPath: string;
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
function lineage(overrides: Partial<AcceptanceConfirmationLineage> = {}): AcceptanceConfirmationLineage {
  return { tenantId: 'tenant-a', projectId: 'project-a', sprintId: 'sprint-a', taskId: 'task-a',
    attemptId: 'attempt-a', generation: 1, evaluationDigest: sha('evaluation'), resultDigest: sha('result'),
    policyDigest: sha('policy'), sourceDigest: sha('source'), ...overrides };
}
function createInput(overrides: Record<string, unknown> = {}) {
  const bound = lineage();
  return { id: 'acceptance-debt-a', tenantId: bound.tenantId, projectId: bound.projectId,
    confirmationId: deriveAcceptanceConfirmationId(bound), lineage: bound, title: 'Acceptance needs follow-up',
    content: 'qualified acceptance debt', status: 'active', metadata: { disposition: 'open' },
    changedBy: 'acceptance-router', ...overrides };
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'debt-tenant-cas-'));
  mkdirSync(join(projectRoot, '.brain'));
  dbPath = join(projectRoot, '.brain', 'memory.db');
  new MemoryStore(dbPath).close();
});
afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

describe('acceptance-route debt CAS authority', () => {
  it('creates once and makes only an exact replay idempotent', () => {
    expect(createAcceptanceRouteDebt(projectRoot, createInput()).state).toBe('CREATED');
    expect(createAcceptanceRouteDebt(projectRoot, createInput()).state).toBe('REPLAYED');
    expect(createAcceptanceRouteDebt(projectRoot, createInput({ content: 'drift' })).state).toBe('CONFLICT');
    expect(createAcceptanceRouteDebt(projectRoot, createInput({ metadata: { disposition: 'changed' } })).state).toBe('CONFLICT');
    const store = new MemoryStore(dbPath);
    expect(store.getById('acceptance-debt-a', { tenantId: 'tenant-a' })).toMatchObject({ tenant_id: 'tenant-a', status: 'active' });
    expect(store.getHistory('acceptance-debt-a')).toHaveLength(1);
    store.close();
  });

  it('updates status, metadata, and history atomically for the complete lineage', () => {
    const created = createInput();
    expect(createAcceptanceRouteDebt(projectRoot, created).state).toBe('CREATED');
    const transition = { id: created.id, tenantId: created.tenantId, projectId: created.projectId,
      confirmationId: created.confirmationId, lineage: created.lineage, expectedStatus: 'active', nextStatus: 'resolved',
      expectedMetadata: { disposition: 'open' }, nextMetadata: { disposition: 'resolved' }, changedBy: 'acceptance-router' };
    expect(transitionAcceptanceRouteDebt(projectRoot, transition)).toBe(true);
    expect(transitionAcceptanceRouteDebt(projectRoot, transition)).toBe(true);
    const store = new MemoryStore(dbPath);
    const row = store.getById(created.id, { tenantId: created.tenantId });
    expect(row).toMatchObject({ status: 'resolved', tenant_id: 'tenant-a' });
    expect(JSON.parse(row!.metadata)).toMatchObject({ disposition: 'resolved', confirmationId: created.confirmationId, lineage: created.lineage });
    expect(store.getHistory(created.id).map(item => item.field)).toEqual(['*', 'status', 'metadata']);
    store.close();
  });

  it('fails closed for wrong tenant/project, NULL tenant, stale status, and lineage or metadata drift', () => {
    const created = createInput();
    expect(createAcceptanceRouteDebt(projectRoot, created).state).toBe('CREATED');
    const base = { id: created.id, tenantId: created.tenantId, projectId: created.projectId,
      confirmationId: created.confirmationId, lineage: created.lineage, expectedStatus: 'active', nextStatus: 'resolved',
      expectedMetadata: { disposition: 'open' } };
    expect(transitionAcceptanceRouteDebt(projectRoot, { ...base, tenantId: 'tenant-b' })).toBe(false);
    expect(transitionAcceptanceRouteDebt(projectRoot, { ...base, projectId: 'project-b' })).toBe(false);
    expect(transitionAcceptanceRouteDebt(projectRoot, { ...base, expectedStatus: 'stale' })).toBe(false);
    expect(transitionAcceptanceRouteDebt(projectRoot, { ...base, expectedMetadata: { disposition: 'drift' } })).toBe(false);
    for (const foreignLineage of [
      lineage({ sprintId: 'sprint-b' }), lineage({ taskId: 'task-b' }), lineage({ attemptId: 'attempt-b' }),
      lineage({ generation: 2 }), lineage({ evaluationDigest: sha('evaluation-b') }),
      lineage({ resultDigest: sha('result-b') }), lineage({ policyDigest: sha('policy-b') }),
      lineage({ sourceDigest: sha('source-b') }),
    ]) {
      expect(transitionAcceptanceRouteDebt(projectRoot, { ...base, lineage: foreignLineage })).toBe(false);
    }
    const raw = new MemoryStore(dbPath);
    raw.insert({ id: 'null-debt', type: 'debt', title: 'legacy', content: 'legacy', status: 'active' });
    raw.close();
    expect(transitionAcceptanceRouteDebt(projectRoot, { ...base, id: 'null-debt' })).toBe(false);
    const check = new MemoryStore(dbPath);
    expect(check.getById(created.id, { tenantId: created.tenantId })?.status).toBe('active');
    expect(check.getHistory(created.id)).toHaveLength(1);
    check.close();
  });
});
