import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  acceptanceConfirmationDigest, canonicalAcceptanceConfirmationJson,
  validateAcceptanceConfirmationReceipt, type AcceptanceConfirmationReceipt,
} from './acceptance-confirmation-contract.js';
import { DeckentError } from './errors.js';

export const ACCEPTANCE_RECONCILIATION_SCHEMA_VERSION = 1 as const;
const HASH = /^[a-f0-9]{64}$/u;
export type AcceptanceReconciliationHoldReason = 'CONFLICTING_DIGEST' | 'CORRUPT_RECEIPT'
  | 'MISSING_PREDECESSOR' | 'PREDECESSOR_MISMATCH' | 'TRANSACTION_CONFLICT';
export interface AcceptanceReconciliationReceipt {
  readonly schemaVersion: 1; readonly sequence: number; readonly reconciliationKey: string;
  readonly tenantId: string; readonly projectId: string; readonly confirmationId: string;
  readonly state: 'PREPARED' | 'APPLIED'; readonly predecessorDigest: string | null;
  readonly confirmationReceipt: AcceptanceConfirmationReceipt; readonly confirmationDigest: string;
  readonly debtProjectionDigest: string; readonly recordedAt: string; readonly receiptDigest: string;
}
export interface AcceptanceReconciliationWrite {
  readonly confirmationReceipt: unknown; readonly debtProjectionDigest: string;
  /** Compatibility field used only when adopting an old APPLIED-only envelope. */ readonly appliedAt?: string;
}
export interface ReconciliationDurability { readonly journal: 'WAL'; readonly synchronous: 'FULL'; readonly commit: 'transaction' }
export type AcceptanceReconciliationWriteResult =
  | { readonly state: 'PREPARED' | 'APPLIED'; readonly receipt: AcceptanceReconciliationReceipt; readonly durability: ReconciliationDurability }
  | { readonly state: 'REPLAYED'; readonly receipt: AcceptanceReconciliationReceipt }
  | { readonly state: 'HOLD'; readonly reasonCode: AcceptanceReconciliationHoldReason; readonly message: string };
export type AcceptanceReconciliationReadResult = { readonly state: 'FOUND'; readonly receipt: AcceptanceReconciliationReceipt }
  | { readonly state: 'MISSING' }
  | { readonly state: 'HOLD'; readonly reasonCode: 'CORRUPT_RECEIPT'; readonly message: string };
export interface AcceptanceReconciliationStoreOptions {
  readonly dbPath?: string; readonly runtimeDirectory?: string; readonly platform?: NodeJS.Platform; readonly adoptLegacy?: boolean;
}
export interface AcceptanceReconciliationCursor {
  readonly tenantId: string; readonly projectId?: string; readonly afterSequence?: number; readonly limit?: number;
}
export interface AcceptanceReconciliationCursorPage {
  readonly receipts: readonly AcceptanceReconciliationReadResult[]; readonly nextSequence: number | null;
}
export interface AcceptanceReconciliationQuarantineEntry {
  readonly sequence: number | null; readonly reconciliationKey: string | null; readonly state: string | null;
  readonly reasonCode: 'CORRUPT_RECEIPT' | 'LEGACY_SOURCE_INVALID'; readonly sourcePath: string | null;
  readonly sourceDigest: string | null; readonly detail: string;
}
export interface AcceptanceReconciliationIntegrityResult {
  readonly check: 'quick_check' | 'integrity_check'; readonly ok: boolean; readonly messages: readonly string[];
  readonly corruptRows: readonly AcceptanceReconciliationQuarantineEntry[];
}
export interface AcceptanceReconciliationAdoptionResult { readonly discovered: number; readonly adopted: number; readonly replayed: number; readonly invalid: number }
interface Row {
  sequence: number; reconciliation_key: string; tenant_id: string; project_id: string; confirmation_id: string;
  receipt_state: string; predecessor_digest: string | null; confirmation_json: string; confirmation_digest: string;
  debt_projection_digest: string; recorded_at: string; receipt_digest: string;
}
const DURABILITY: ReconciliationDurability = Object.freeze({ journal: 'WAL', synchronous: 'FULL', commit: 'transaction' });
const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
function keyFor(value: AcceptanceConfirmationReceipt): string {
  return acceptanceConfirmationDigest({ tenantId: value.lineage.tenantId, projectId: value.lineage.projectId, confirmationId: value.confirmationId });
}
function timeOf(value: AcceptanceConfirmationReceipt, legacy?: string): string {
  return value.state === 'APPLIED' ? value.appliedAt : legacy ?? value.preparedAt;
}
function unsigned(sequence: number, value: AcceptanceConfirmationReceipt, debt: string): Omit<AcceptanceReconciliationReceipt, 'receiptDigest'> {
  return { schemaVersion: 1, sequence, reconciliationKey: keyFor(value), tenantId: value.lineage.tenantId,
    projectId: value.lineage.projectId, confirmationId: value.confirmationId, state: value.state,
    predecessorDigest: value.state === 'APPLIED' ? value.preparedReceiptDigest : null,
    confirmationReceipt: value, confirmationDigest: acceptanceConfirmationDigest(value), debtProjectionDigest: debt,
    recordedAt: timeOf(value) };
}
class BatchHold extends Error {
  constructor(readonly result: Extract<AcceptanceReconciliationWriteResult, { state: 'HOLD' }>) { super(result.message); }
}

/** SQLite WAL authority for the immutable PREPARED -> APPLIED reconciliation chain. */
export class AcceptanceReconciliationStore {
  readonly #db: DatabaseType; readonly #legacyDirectory: string; #closed = false;
  constructor(projectRoot: string, options: AcceptanceReconciliationStoreOptions = {}) {
    const dbPath = options.dbPath ?? join(projectRoot, '.deckent', 'runtime', 'acceptance-reconciliation.db');
    this.#legacyDirectory = options.runtimeDirectory ?? join(projectRoot, '.deckent', 'runtime', 'acceptance-reconciliation', 'receipts');
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
    this.#db = new Database(dbPath); this.#db.pragma('journal_mode = WAL'); this.#db.pragma('synchronous = FULL');
    this.#db.pragma('foreign_keys = ON'); this.#db.pragma('busy_timeout = 5000'); this.#initialize();
    if (options.adoptLegacy !== false) this.adoptLegacyReceipts();
  }
  /** Idempotent process-boundary close; committed WAL transactions remain restart-readable. */
  close(): void {
    if (this.#closed) return;
    this.#db.close();
    this.#closed = true;
  }
  keyFor(value: AcceptanceConfirmationReceipt): string { return keyFor(value); }
  append(input: AcceptanceReconciliationWrite): AcceptanceReconciliationWriteResult { return this.appendBatch([input])[0]!; }
  appendBatch(inputs: readonly AcceptanceReconciliationWrite[]): readonly AcceptanceReconciliationWriteResult[] {
    if (inputs.length === 0) return Object.freeze([]);
    const tx = this.#db.transaction((values: readonly AcceptanceReconciliationWrite[]) => values.map(value => {
      const result = this.#appendOne(value); if (result.state === 'HOLD') throw new BatchHold(result); return result;
    }));
    // BEGIN IMMEDIATE serializes the read-before-insert FWW decision across
    // processes. A deferred transaction can let two writers both observe a
    // missing row and surface SQLITE_BUSY/SQLITE_CONSTRAINT instead of a
    // deterministic replay/conflict result.
    try { return Object.freeze(tx.immediate(inputs)); } catch (error) {
      if (!(error instanceof BatchHold)) throw error;
      return Object.freeze(inputs.map(() => ({ state: 'HOLD' as const,
        reasonCode: error.result.reasonCode,
        message: `transaction rolled back: ${error.result.message}` })));
    }
  }
  read(key: string, state: 'PREPARED' | 'APPLIED' = 'APPLIED'): AcceptanceReconciliationReadResult {
    if (!HASH.test(key)) return this.#corrupt('invalid reconciliation key');
    const row = this.#db.prepare('SELECT * FROM acceptance_reconciliation_receipts WHERE reconciliation_key = ? AND receipt_state = ?').get(key, state) as Row | undefined;
    return row ? this.#readRow(row) : { state: 'MISSING' };
  }
  readTenantPage(cursor: AcceptanceReconciliationCursor): AcceptanceReconciliationCursorPage {
    const after = cursor.afterSequence ?? 0; const limit = cursor.limit ?? 100;
    if (!cursor.tenantId || !Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new TypeError('invalid tenant cursor');
    const rows = (cursor.projectId === undefined
      ? this.#db.prepare('SELECT * FROM acceptance_reconciliation_receipts WHERE tenant_id = ? AND sequence > ? ORDER BY sequence LIMIT ?').all(cursor.tenantId, after, limit)
      : this.#db.prepare('SELECT * FROM acceptance_reconciliation_receipts WHERE tenant_id = ? AND project_id = ? AND sequence > ? ORDER BY sequence LIMIT ?').all(cursor.tenantId, cursor.projectId, after, limit)) as Row[];
    return Object.freeze({ receipts: Object.freeze(rows.map(row => this.#readRow(row))), nextSequence: rows.at(-1)?.sequence ?? null });
  }
  /** @deprecated Use readTenantPage; retained for callers created before the projection was named. */
  scanTenant(cursor: AcceptanceReconciliationCursor): AcceptanceReconciliationCursorPage {
    return this.readTenantPage(cursor);
  }
  quickCheck(): AcceptanceReconciliationIntegrityResult { return this.#check('quick_check'); }
  integrityCheck(): AcceptanceReconciliationIntegrityResult { return this.#check('integrity_check'); }
  quarantineView(): readonly AcceptanceReconciliationQuarantineEntry[] {
    const result: AcceptanceReconciliationQuarantineEntry[] = [];
    for (const row of this.#db.prepare('SELECT * FROM acceptance_reconciliation_receipts ORDER BY sequence').all() as Row[]) {
      const read = this.#readRow(row); if (read.state === 'HOLD') result.push({ sequence: row.sequence,
        reconciliationKey: row.reconciliation_key, state: row.receipt_state, reasonCode: 'CORRUPT_RECEIPT',
        sourcePath: null, sourceDigest: null, detail: read.message });
    }
    const legacy = this.#db.prepare('SELECT source_path, source_digest, validation_error FROM acceptance_reconciliation_legacy_sources WHERE validation_error IS NOT NULL ORDER BY source_path, source_digest').all() as Array<{ source_path: string; source_digest: string; validation_error: string }>;
    legacy.forEach(row => result.push({ sequence: null, reconciliationKey: null, state: null,
      reasonCode: 'LEGACY_SOURCE_INVALID', sourcePath: row.source_path, sourceDigest: row.source_digest, detail: row.validation_error }));
    return Object.freeze(result.map(entry => Object.freeze(entry)));
  }
  /** Lossless and idempotent: exact source bytes are copied into SQLite and the file is never deleted. */
  adoptLegacyReceipts(): AcceptanceReconciliationAdoptionResult {
    if (!existsSync(this.#legacyDirectory)) return { discovered: 0, adopted: 0, replayed: 0, invalid: 0 };
    const names = readdirSync(this.#legacyDirectory).filter(name => name.endsWith('.json')).sort();
    let adopted = 0; let replayed = 0; let invalid = 0;
    this.#db.transaction(() => names.forEach(name => {
      const path = join(this.#legacyDirectory, name); const bytes = readFileSync(path); const sourceDigest = sha256(bytes);
      if (this.#db.prepare('SELECT 1 FROM acceptance_reconciliation_legacy_sources WHERE source_path = ? AND source_digest = ?').get(path, sourceDigest)) { replayed += 1; return; }
      let sequence: number | null = null; let problem: string | null = null;
      try {
        const envelope = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
        const parsed = validateAcceptanceConfirmationReceipt(envelope.confirmationReceipt);
        if (!parsed.ok || typeof envelope.debtProjectionDigest !== 'string' || !HASH.test(envelope.debtProjectionDigest)) {
          throw new DeckentError('ACCEPTANCE_RECONCILIATION_LEGACY_RECEIPT_INVALID', 'legacy receipt payload is invalid');
        }
        const write = this.#appendOne({ confirmationReceipt: parsed.value, debtProjectionDigest: envelope.debtProjectionDigest,
          ...(typeof envelope.appliedAt === 'string' ? { appliedAt: envelope.appliedAt } : {}) });
        if (write.state === 'HOLD') {
          throw new DeckentError('ACCEPTANCE_RECONCILIATION_LEGACY_WRITE_HOLD', write.message);
        }
        sequence = write.receipt.sequence; adopted += 1;
      } catch (error) { problem = error instanceof Error ? error.message : 'legacy receipt is invalid'; invalid += 1; }
      this.#db.prepare('INSERT INTO acceptance_reconciliation_legacy_sources (source_path, source_digest, source_bytes, adopted_sequence, validation_error) VALUES (?, ?, ?, ?, ?)').run(path, sourceDigest, bytes, sequence, problem);
    })).immediate();
    return Object.freeze({ discovered: names.length, adopted, replayed, invalid });
  }
  #appendOne(input: AcceptanceReconciliationWrite): AcceptanceReconciliationWriteResult {
    const parsed = validateAcceptanceConfirmationReceipt(input.confirmationReceipt);
    if (!parsed.ok || !HASH.test(input.debtProjectionDigest)) return { state: 'HOLD', reasonCode: 'CORRUPT_RECEIPT', message: 'reconciliation input is invalid' };
    const value = parsed.value; const key = keyFor(value);
    const existing = this.#db.prepare('SELECT * FROM acceptance_reconciliation_receipts WHERE reconciliation_key = ? AND receipt_state = ?').get(key, value.state) as Row | undefined;
    if (existing) {
      const read = this.#readRow(existing);
      if (read.state !== 'FOUND') {
        return { state: 'HOLD', reasonCode: 'CORRUPT_RECEIPT', message: 'stored reconciliation receipt is missing or corrupt' };
      }
      const wanted = acceptanceConfirmationDigest(unsigned(existing.sequence, value, input.debtProjectionDigest));
      return read.receipt.receiptDigest === wanted ? { state: 'REPLAYED', receipt: read.receipt }
        : { state: 'HOLD', reasonCode: 'CONFLICTING_DIGEST', message: 'first writer already owns this confirmation state' };
    }
    if (value.state === 'APPLIED') {
      const predecessor = this.#db.prepare("SELECT * FROM acceptance_reconciliation_receipts WHERE reconciliation_key = ? AND receipt_state = 'PREPARED'").get(key) as Row | undefined;
      if (!predecessor) return { state: 'HOLD', reasonCode: 'MISSING_PREDECESSOR', message: 'APPLIED requires its durable PREPARED predecessor' };
      const read = this.#readRow(predecessor);
      if (read.state !== 'FOUND') {
        return { state: 'HOLD', reasonCode: 'CORRUPT_RECEIPT', message: 'stored PREPARED predecessor is missing or corrupt' };
      }
      if (read.receipt.confirmationReceipt.receiptDigest !== value.preparedReceiptDigest || read.receipt.debtProjectionDigest !== input.debtProjectionDigest)
        return { state: 'HOLD', reasonCode: 'PREDECESSOR_MISMATCH', message: 'APPLIED does not bind the stored PREPARED receipt' };
    }
    const next = this.#db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM acceptance_reconciliation_receipts')
      .get() as { sequence: number };
    const sequence = next.sequence; const body = unsigned(sequence, value, input.debtProjectionDigest);
    const receiptDigest = acceptanceConfirmationDigest(body);
    this.#db.prepare(`INSERT INTO acceptance_reconciliation_receipts
      (sequence,reconciliation_key,tenant_id,project_id,confirmation_id,receipt_state,predecessor_digest,confirmation_json,confirmation_digest,debt_projection_digest,recorded_at,receipt_digest)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(sequence, key, value.lineage.tenantId, value.lineage.projectId, value.confirmationId, value.state,
        value.state === 'APPLIED' ? value.preparedReceiptDigest : null, canonicalAcceptanceConfirmationJson(value),
        acceptanceConfirmationDigest(value), input.debtProjectionDigest, timeOf(value, input.appliedAt), receiptDigest);
    return { state: value.state, receipt: Object.freeze({ ...body, receiptDigest }), durability: DURABILITY };
  }
  #readRow(row: Row): AcceptanceReconciliationReadResult {
    try {
      const parsed = validateAcceptanceConfirmationReceipt(JSON.parse(row.confirmation_json));
      if (!parsed.ok) {
        throw new DeckentError('ACCEPTANCE_RECONCILIATION_CONFIRMATION_INVALID', 'confirmation payload validation failed');
      }
      const body = unsigned(row.sequence, parsed.value, row.debt_projection_digest);
      if (row.reconciliation_key !== body.reconciliationKey || row.tenant_id !== body.tenantId || row.project_id !== body.projectId
        || row.confirmation_id !== body.confirmationId || row.receipt_state !== body.state || row.predecessor_digest !== body.predecessorDigest
        || row.confirmation_digest !== body.confirmationDigest || row.recorded_at !== body.recordedAt || !HASH.test(row.debt_projection_digest)
        || acceptanceConfirmationDigest(body) !== row.receipt_digest) {
        throw new DeckentError('ACCEPTANCE_RECONCILIATION_PERSISTED_RECEIPT_MISMATCH', 'persisted receipt digest or envelope mismatch');
      }
      return { state: 'FOUND', receipt: Object.freeze({ ...body, receiptDigest: row.receipt_digest }) };
    } catch (error) { return this.#corrupt(`corrupt reconciliation row ${row.sequence}: ${error instanceof Error ? error.message : 'invalid data'}`); }
  }
  #corrupt(message: string): Extract<AcceptanceReconciliationReadResult, { state: 'HOLD' }> { return { state: 'HOLD', reasonCode: 'CORRUPT_RECEIPT', message }; }
  #check(check: 'quick_check' | 'integrity_check'): AcceptanceReconciliationIntegrityResult {
    const messages = (this.#db.pragma(check) as Array<Record<string, unknown>>).map(row => String(Object.values(row)[0]));
    const corruptRows = this.quarantineView(); return Object.freeze({ check, ok: messages.length === 1 && messages[0] === 'ok' && corruptRows.length === 0, messages: Object.freeze(messages), corruptRows });
  }
  #initialize(): void { this.#db.exec(`
    CREATE TABLE IF NOT EXISTS acceptance_reconciliation_receipts (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, reconciliation_key TEXT NOT NULL, tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL, confirmation_id TEXT NOT NULL, receipt_state TEXT NOT NULL CHECK(receipt_state IN('PREPARED','APPLIED')),
      predecessor_digest TEXT, confirmation_json TEXT NOT NULL, confirmation_digest TEXT NOT NULL,
      debt_projection_digest TEXT NOT NULL, recorded_at TEXT NOT NULL, receipt_digest TEXT NOT NULL,
      UNIQUE(reconciliation_key,receipt_state), UNIQUE(tenant_id,project_id,confirmation_id,receipt_state));
    CREATE INDEX IF NOT EXISTS idx_acceptance_reconciliation_tenant_cursor ON acceptance_reconciliation_receipts(tenant_id,sequence);
    CREATE INDEX IF NOT EXISTS idx_acceptance_reconciliation_tenant_project_cursor ON acceptance_reconciliation_receipts(tenant_id,project_id,sequence);
    CREATE INDEX IF NOT EXISTS idx_acceptance_reconciliation_confirmation ON acceptance_reconciliation_receipts(tenant_id,project_id,confirmation_id,receipt_state);
    CREATE TABLE IF NOT EXISTS acceptance_reconciliation_legacy_sources (
      source_path TEXT NOT NULL, source_digest TEXT NOT NULL, source_bytes BLOB NOT NULL, adopted_sequence INTEGER,
      validation_error TEXT, PRIMARY KEY(source_path,source_digest), FOREIGN KEY(adopted_sequence) REFERENCES acceptance_reconciliation_receipts(sequence));
    CREATE VIEW IF NOT EXISTS acceptance_reconciliation_corrupt_rows AS SELECT sequence,reconciliation_key,receipt_state,
      CASE WHEN json_valid(confirmation_json)=0 THEN 'confirmation_json_invalid' WHEN length(receipt_digest)<>64 THEN 'receipt_digest_invalid' ELSE NULL END corruption_reason
      FROM acceptance_reconciliation_receipts WHERE json_valid(confirmation_json)=0 OR length(receipt_digest)<>64;
    CREATE TRIGGER IF NOT EXISTS acceptance_reconciliation_no_delete BEFORE DELETE ON acceptance_reconciliation_receipts BEGIN SELECT RAISE(ABORT,'reconciliation receipts are append-only'); END;
    DROP TRIGGER IF EXISTS acceptance_reconciliation_no_update;
    CREATE TRIGGER IF NOT EXISTS acceptance_reconciliation_no_update BEFORE UPDATE ON acceptance_reconciliation_receipts
      BEGIN SELECT RAISE(ABORT,'reconciliation receipts are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS acceptance_reconciliation_legacy_no_delete BEFORE DELETE ON acceptance_reconciliation_legacy_sources BEGIN SELECT RAISE(ABORT,'legacy sources are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS acceptance_reconciliation_legacy_no_update BEFORE UPDATE ON acceptance_reconciliation_legacy_sources BEGIN SELECT RAISE(ABORT,'legacy sources are immutable'); END;
  `); }
}
