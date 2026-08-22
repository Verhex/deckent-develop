import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import Database from 'better-sqlite3'; import { afterEach, describe, expect, it } from 'vitest';
import { applyAcceptanceConfirmationReceipt, prepareAcceptanceConfirmationReceipt,
  createAcceptanceConfirmationTerminalEvent } from '../../src/core/acceptance-confirmation-contract.js';
import { AcceptanceReconciliationStore } from '../../src/core/acceptance-reconciliation-store.js';
const roots: string[] = []; const digest = (v: string) => createHash('sha256').update(v).digest('hex');
function root() { const v = mkdtempSync(join(tmpdir(), 'reconciliation-db-')); roots.push(v); return v; }
function pair(tenantId = 'tenant-a', ordinal = 0) {
  const event = createAcceptanceConfirmationTerminalEvent({ lineage: { tenantId, projectId: 'project-a', attemptId: `attempt-${ordinal}`,
    sprintId: 'sprint-609', taskId: `task-${ordinal}`, generation: 1,
    evaluationDigest: digest(`evaluation-${ordinal}`), resultDigest: digest(`result-${ordinal}`),
    policyDigest: digest('policy'), sourceDigest: digest(`source-${ordinal}`) },
    decision: 'ACCEPTED', terminalAt: '2026-08-21T00:00:00.000Z' }); if (!event.ok) throw new Error(event.error.message);
  const prepared = prepareAcceptanceConfirmationReceipt({ terminalEvent: event.value, preparedAt: '2026-08-21T00:00:01.000Z' }); if (!prepared.ok) throw new Error(prepared.error.message);
  const applied = applyAcceptanceConfirmationReceipt({ preparedReceipt: prepared.value, appliedAt: '2026-08-21T00:00:02.000Z' }); if (!applied.ok) throw new Error(applied.error.message);
  return { prepared: prepared.value, applied: applied.value };
}
afterEach(() => { roots.splice(0).forEach(value => rmSync(value, { recursive: true, force: true })); });
describe('AcceptanceReconciliationStore SQLite authority', () => {
  it('appends PREPARED/APPLIED atomically and replays after restart while holding conflicts', () => {
    const project = root(); const receipts = pair(); const debt = digest('debt'); const store = new AcceptanceReconciliationStore(project);
    expect(store.append({ confirmationReceipt: receipts.prepared, debtProjectionDigest: debt })).toMatchObject({ state: 'PREPARED', durability: { journal: 'WAL', synchronous: 'FULL', commit: 'transaction' } });
    expect(store.append({ confirmationReceipt: receipts.applied, debtProjectionDigest: debt })).toMatchObject({ state: 'APPLIED', receipt: { predecessorDigest: receipts.prepared.receiptDigest } }); store.close();
    const restart = new AcceptanceReconciliationStore(project); expect(restart.append({ confirmationReceipt: receipts.applied, debtProjectionDigest: debt })).toMatchObject({ state: 'REPLAYED' });
    expect(restart.append({ confirmationReceipt: receipts.applied, debtProjectionDigest: digest('other') })).toMatchObject({ state: 'HOLD', reasonCode: 'CONFLICTING_DIGEST' }); restart.close();
  });
  it('rolls a conflicting transaction batch back completely', () => {
    const store = new AcceptanceReconciliationStore(root()); const one = pair('tenant-a', 1); const two = pair('tenant-a', 2);
    const results = store.appendBatch([{ confirmationReceipt: one.prepared, debtProjectionDigest: digest('one') }, { confirmationReceipt: two.applied, debtProjectionDigest: digest('two') }]);
    expect(results.every(result => result.state === 'HOLD')).toBe(true); expect(store.read(store.keyFor(one.prepared), 'PREPARED')).toEqual({ state: 'MISSING' }); store.close();
  });
  it('commits a receipt with no mutable pending-digest phase', () => {
    const project = root(); const store = new AcceptanceReconciliationStore(project);
    const written = store.append({ confirmationReceipt: pair().prepared, debtProjectionDigest: digest('debt') });
    expect(written.state).toBe('PREPARED'); store.close();
    const db = new Database(join(project, '.deckent', 'runtime', 'acceptance-reconciliation.db'));
    expect(() => db.prepare("UPDATE acceptance_reconciliation_receipts SET receipt_digest='pending'").run())
      .toThrow(/immutable/u);
    expect(db.prepare('SELECT receipt_digest FROM acceptance_reconciliation_receipts').get())
      .toMatchObject({ receipt_digest: expect.stringMatching(/^[a-f0-9]{64}$/u) }); db.close();
  });
  it('uses an indexed tenant/project keyset cursor', () => {
    const project = root(); const store = new AcceptanceReconciliationStore(project);
    for (let i = 0; i < 3; i += 1) store.append({ confirmationReceipt: pair('tenant-a', i).prepared, debtProjectionDigest: digest(`d-${i}`) });
    store.append({ confirmationReceipt: pair('tenant-b', 9).prepared, debtProjectionDigest: digest('foreign') });
    const first = store.readTenantPage({ tenantId: 'tenant-a', projectId: 'project-a', limit: 2 }); expect(first.receipts).toHaveLength(2);
    expect(store.readTenantPage({ tenantId: 'tenant-a', projectId: 'project-a', afterSequence: first.nextSequence!, limit: 2 }).receipts).toHaveLength(1); store.close();
    const db = new Database(join(project, '.deckent', 'runtime', 'acceptance-reconciliation.db'), { readonly: true });
    expect((db.pragma('index_list(acceptance_reconciliation_receipts)') as Array<{ name: string }>).map(row => row.name)).toContain('idx_acceptance_reconciliation_tenant_project_cursor'); db.close();
  });
  it('checks integrity and returns corruption in a quarantine view rather than as missing', () => {
    const project = root(); const receipt = pair().prepared; const store = new AcceptanceReconciliationStore(project);
    const written = store.append({ confirmationReceipt: receipt, debtProjectionDigest: digest('debt') }); expect(store.quickCheck()).toMatchObject({ ok: true, messages: ['ok'] }); store.close();
    const db = new Database(join(project, '.deckent', 'runtime', 'acceptance-reconciliation.db')); db.exec('DROP TRIGGER acceptance_reconciliation_no_update'); db.prepare('UPDATE acceptance_reconciliation_receipts SET receipt_digest=?').run(digest('tampered')); db.close();
    const reopened = new AcceptanceReconciliationStore(project, { adoptLegacy: false }); if (written.state !== 'PREPARED') throw new Error('fixture failed');
    expect(reopened.read(written.receipt.reconciliationKey, 'PREPARED')).toMatchObject({ state: 'HOLD', reasonCode: 'CORRUPT_RECEIPT' }); expect(reopened.integrityCheck().ok).toBe(false);
    expect(reopened.quarantineView()).toEqual([expect.objectContaining({ reasonCode: 'CORRUPT_RECEIPT', sequence: written.receipt.sequence })]); reopened.close();
  });
  it('adopts legacy source bytes losslessly and idempotently without deletion', () => {
    const project = root(); const directory = join(project, '.deckent', 'runtime', 'acceptance-reconciliation', 'receipts'); mkdirSync(directory, { recursive: true });
    const source = join(directory, 'legacy.json'); const bytes = Buffer.from('{invalid}\n'); writeFileSync(source, bytes);
    const first = new AcceptanceReconciliationStore(project); expect(first.quarantineView()).toEqual([expect.objectContaining({ reasonCode: 'LEGACY_SOURCE_INVALID', sourceDigest: digest(bytes.toString()) })]); first.close();
    const second = new AcceptanceReconciliationStore(project); expect(second.adoptLegacyReceipts()).toMatchObject({ discovered: 1, replayed: 1 }); second.close();
    expect(existsSync(source)).toBe(true); expect(readFileSync(source)).toEqual(bytes);
  });
  it('adopts a valid legacy receipt and archives its exact source bytes once', () => {
    const project = root(); const directory = join(project, '.deckent', 'runtime', 'acceptance-reconciliation', 'receipts');
    mkdirSync(directory, { recursive: true }); const receipt = pair().prepared;
    const bytes = Buffer.from(`${JSON.stringify({ confirmationReceipt: receipt, debtProjectionDigest: digest('debt') })}\n`);
    const source = join(directory, 'valid.json'); writeFileSync(source, bytes);
    const store = new AcceptanceReconciliationStore(project); expect(store.read(store.keyFor(receipt), 'PREPARED')).toMatchObject({ state: 'FOUND' }); store.close();
    const db = new Database(join(project, '.deckent', 'runtime', 'acceptance-reconciliation.db'), { readonly: true });
    const archived = db.prepare('SELECT source_digest, source_bytes FROM acceptance_reconciliation_legacy_sources').get() as { source_digest: string; source_bytes: Buffer };
    expect(archived.source_digest).toBe(digest(bytes.toString())); expect(archived.source_bytes).toEqual(bytes); db.close();
    const restart = new AcceptanceReconciliationStore(project); expect(restart.adoptLegacyReceipts()).toMatchObject({ discovered: 1, replayed: 1 }); restart.close();
    expect(readFileSync(source)).toEqual(bytes);
  });
  it('uses SQLite durability on win32 without relying on unsupported file fsync', () => {
    const project = root(); const store = new AcceptanceReconciliationStore(project, { platform: 'win32' });
    expect(store.append({ confirmationReceipt: pair().prepared, debtProjectionDigest: digest('debt') }))
      .toMatchObject({ state: 'PREPARED', durability: { journal: 'WAL', synchronous: 'FULL', commit: 'transaction' } });
    store.close();
  });
  it('closes idempotently and keeps committed authority restart-readable', () => {
    const project = root(); const receipt = pair().prepared; const debt = digest('debt');
    const store = new AcceptanceReconciliationStore(project);
    const written = store.append({ confirmationReceipt: receipt, debtProjectionDigest: debt });
    expect(written.state).toBe('PREPARED'); store.close(); expect(() => store.close()).not.toThrow();
    const restarted = new AcceptanceReconciliationStore(project);
    expect(restarted.readTenantPage({ tenantId: 'tenant-a', projectId: 'project-a', limit: 1 }))
      .toMatchObject({ receipts: [{ state: 'FOUND', receipt: { state: 'PREPARED', debtProjectionDigest: debt } }] });
    restarted.close();
  });
  it('rejects APPLIED without PREPARED and keeps the receipt projection empty', () => {
    const store = new AcceptanceReconciliationStore(root()); const receipts = pair();
    expect(store.append({ confirmationReceipt: receipts.applied, debtProjectionDigest: digest('debt') }))
      .toMatchObject({ state: 'HOLD', reasonCode: 'MISSING_PREDECESSOR' });
    expect(store.readTenantPage({ tenantId: 'tenant-a', projectId: 'project-a' }).receipts).toEqual([]);
    store.close();
  });
});
