// src/connectors/identity/identity-store.ts
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ConnectorId } from '../types.js';
import type { IdentityRecord, IdentityBundle } from './provider.js';

interface PendingVerify { code: string; email: string; tenantId: string; expiresAt: number; attempts: number }

/**
 * SQLite-backed social-identity store with a read-through in-memory cache.
 * resolve() hot-path reads go through the cache; writes invalidate it.
 * One file per project under .deckent/ (path injected — never hardcoded).
 */
export class IdentityStore {
  private readonly db: DatabaseType;
  private readonly cache = new Map<string, IdentityRecord | null>();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS social_identity (
        connector TEXT NOT NULL, external_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
        principal_id TEXT NOT NULL, role TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0, method TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (connector, external_id, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS pending_verify (
        connector TEXT NOT NULL, external_id TEXT NOT NULL,
        code TEXT NOT NULL, email TEXT NOT NULL, tenant_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (connector, external_id)
      );
    `);
  }

  private key(c: string, e: string, t: string): string { return `${c}\0${e}\0${t}`; }

  upsertIdentity(rec: IdentityRecord): void {
    this.db.prepare(`
      INSERT INTO social_identity (connector, external_id, tenant_id, principal_id, role, verified, method, updated_at)
      VALUES (@connector, @externalId, @tenantId, @principalId, @role, @verified, @method, @updatedAt)
      ON CONFLICT(connector, external_id, tenant_id) DO UPDATE SET
        principal_id=@principalId, role=@role, verified=@verified, method=@method, updated_at=@updatedAt
    `).run({ ...rec, verified: rec.verified ? 1 : 0 });
    this.cache.delete(this.key(rec.connector, rec.externalId, rec.tenantId));
  }

  getIdentity(connector: ConnectorId, externalId: string, tenantId: string): IdentityRecord | null {
    const k = this.key(connector, externalId, tenantId);
    const cached = this.cache.get(k);
    if (cached !== undefined) return cached;
    const row = this.db.prepare(`
      SELECT connector, external_id, tenant_id, principal_id, role, verified, method, updated_at
      FROM social_identity WHERE connector=? AND external_id=? AND tenant_id=?
    `).get(connector, externalId, tenantId) as Record<string, unknown> | undefined;
    const rec = row ? {
      connector: row['connector'] as ConnectorId, externalId: row['external_id'] as string,
      tenantId: row['tenant_id'] as string, principalId: row['principal_id'] as string,
      role: row['role'] as IdentityRecord['role'], verified: !!(row['verified'] as number),
      method: row['method'] as string, updatedAt: row['updated_at'] as string,
    } : null;
    this.cache.set(k, rec);
    return rec;
  }

  deleteIdentity(connector: ConnectorId, externalId: string, tenantId: string): void {
    this.db.prepare(`DELETE FROM social_identity WHERE connector=? AND external_id=? AND tenant_id=?`).run(connector, externalId, tenantId);
    this.cache.delete(this.key(connector, externalId, tenantId));
  }

  exportBundle(): IdentityBundle {
    const rows = this.db.prepare(`SELECT connector, external_id, tenant_id, principal_id, role, verified, method, updated_at FROM social_identity`).all() as Record<string, unknown>[];
    return {
      version: 1,
      records: rows.map((row) => ({
        connector: row['connector'] as ConnectorId, externalId: row['external_id'] as string,
        tenantId: row['tenant_id'] as string, principalId: row['principal_id'] as string,
        role: row['role'] as IdentityRecord['role'], verified: !!(row['verified'] as number),
        method: row['method'] as string, updatedAt: row['updated_at'] as string,
      })),
    };
  }

  importBundle(b: IdentityBundle): void {
    const tx = this.db.transaction((records: IdentityRecord[]) => {
      for (const rec of records) this.upsertIdentity(rec);
    });
    tx(b.records);
  }

  putPendingVerify(p: { connector: ConnectorId; externalId: string; code: string; email: string; tenantId: string; expiresAt: number }): void {
    this.db.prepare(`
      INSERT INTO pending_verify (connector, external_id, code, email, tenant_id, expires_at, attempts)
      VALUES (@connector, @externalId, @code, @email, @tenantId, @expiresAt, 0)
      ON CONFLICT(connector, external_id) DO UPDATE SET code=@code, email=@email, tenant_id=@tenantId, expires_at=@expiresAt, attempts=0
    `).run(p);
  }

  getPendingVerify(connector: ConnectorId, externalId: string): PendingVerify | null {
    const row = this.db.prepare(`SELECT code, email, tenant_id, expires_at, attempts FROM pending_verify WHERE connector=? AND external_id=?`).get(connector, externalId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { code: row['code'] as string, email: row['email'] as string, tenantId: row['tenant_id'] as string, expiresAt: row['expires_at'] as number, attempts: row['attempts'] as number };
  }

  bumpVerifyAttempts(connector: ConnectorId, externalId: string): void {
    this.db.prepare(`UPDATE pending_verify SET attempts = attempts + 1 WHERE connector=? AND external_id=?`).run(connector, externalId);
  }

  deletePendingVerify(connector: ConnectorId, externalId: string): void {
    this.db.prepare(`DELETE FROM pending_verify WHERE connector=? AND external_id=?`).run(connector, externalId);
  }

  close(): void { this.db.close(); }
}
