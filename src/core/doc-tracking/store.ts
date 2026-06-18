import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DocRecord, DocSignals, DocState, DocStatus } from './types.js';

interface Row {
  path: string; content_hash: string | null; last_updated: string; doc_rank: number;
  status: string; stale_score: number; priority_score: number; state: string;
  signals: string; tracked_code: string | null; first_seen: string; last_scanned: string;
}

export class DocTrackingStore {
  private db: DatabaseType;
  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true }); // ensure .brain/ exists
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_tracking (
        path TEXT PRIMARY KEY,
        content_hash TEXT,
        last_updated TEXT,
        doc_rank INTEGER,
        status TEXT,
        stale_score REAL,
        priority_score REAL,
        state TEXT,
        signals TEXT,
        tracked_code TEXT,
        first_seen TEXT,
        last_scanned TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_doc_tracking_state ON doc_tracking(state);
      CREATE INDEX IF NOT EXISTS idx_doc_tracking_rank ON doc_tracking(doc_rank);
    `);
  }

  private toRecord(r: Row): DocRecord {
    return {
      path: r.path, content_hash: r.content_hash, last_updated: r.last_updated,
      doc_rank: r.doc_rank, status: r.status as DocStatus, stale_score: r.stale_score,
      priority_score: r.priority_score, state: r.state as DocState,
      signals: JSON.parse(r.signals) as DocSignals,
      tracked_code: r.tracked_code ? (JSON.parse(r.tracked_code) as string[]) : null,
      first_seen: r.first_seen, last_scanned: r.last_scanned,
    };
  }

  upsertDoc(rec: DocRecord): void {
    this.db.prepare(`
      INSERT INTO doc_tracking
        (path, content_hash, last_updated, doc_rank, status, stale_score, priority_score, state, signals, tracked_code, first_seen, last_scanned)
      VALUES (@path,@content_hash,@last_updated,@doc_rank,@status,@stale_score,@priority_score,@state,@signals,@tracked_code,@first_seen,@last_scanned)
      ON CONFLICT(path) DO UPDATE SET
        content_hash=excluded.content_hash, last_updated=excluded.last_updated, doc_rank=excluded.doc_rank,
        status=excluded.status, stale_score=excluded.stale_score, priority_score=excluded.priority_score,
        state=excluded.state, signals=excluded.signals, tracked_code=excluded.tracked_code,
        last_scanned=excluded.last_scanned
    `).run({
      path: rec.path, content_hash: rec.content_hash, last_updated: rec.last_updated,
      doc_rank: rec.doc_rank, status: rec.status, stale_score: rec.stale_score,
      priority_score: rec.priority_score, state: rec.state,
      signals: JSON.stringify(rec.signals),
      tracked_code: rec.tracked_code ? JSON.stringify(rec.tracked_code) : null,
      first_seen: rec.first_seen, last_scanned: rec.last_scanned,
    });
  }

  getByPath(path: string): DocRecord | null {
    const r = this.db.prepare(`SELECT * FROM doc_tracking WHERE path = ?`).get(path) as Row | undefined;
    return r ? this.toRecord(r) : null;
  }

  getAll(): DocRecord[] {
    const rows = this.db.prepare(`SELECT * FROM doc_tracking ORDER BY doc_rank ASC, priority_score DESC`).all() as Row[];
    return rows.map(r => this.toRecord(r));
  }

  pruneDeleted(existingPaths: string[]): number {
    const keep = new Set(existingPaths);
    const all = this.db.prepare(`SELECT path FROM doc_tracking`).all() as Array<{ path: string }>;
    const del = this.db.prepare(`DELETE FROM doc_tracking WHERE path = ?`);
    let n = 0;
    for (const { path } of all) if (!keep.has(path)) { del.run(path); n++; }
    return n;
  }

  close(): void { this.db.close(); }
}
