/**
 * MemoryStore — SQLite DB layer for Memory V2.
 *
 * Wraps better-sqlite3 with FTS5 full-text search, tags, relations,
 * field-level history tracking, and soft-delete/decay lifecycle.
 *
 * Schema version: 1
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { turkishNormalize } from './memory-normalize.js';
import { DeckentError } from './errors.js';
import type {
  MemoryEntryV2,
  CreateEntryInput,
  EntryRelation,
  EntryHistoryRecord,
  RelationType,
  MemoryRelation,
  ChatRole,
  ChatTurn,
} from './memory-types.js';

const SCHEMA_VERSION = 1;

// ─── Row type from SQLite (decay_exempt is INTEGER 0/1) ──────────

interface EntryRow {
  id: string;
  type: string;
  source: string;
  title: string;
  content: string;
  summary: string | null;
  tag_text: string;
  title_norm: string;
  content_norm: string;
  summary_norm: string;
  tag_norm: string;
  status: string;
  priority: string;
  sprint_id: string | null;
  sprint_num: number;
  lang: string;
  decay_exempt: number;
  metadata: string;
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToEntry(row: EntryRow): MemoryEntryV2 {
  return {
    id: row.id,
    type: row.type,
    source: row.source as MemoryEntryV2['source'],
    title: row.title,
    content: row.content,
    summary: row.summary,
    tag_text: row.tag_text,
    title_norm: row.title_norm,
    content_norm: row.content_norm,
    summary_norm: row.summary_norm,
    tag_norm: row.tag_norm,
    status: row.status,
    priority: row.priority,
    sprint_id: row.sprint_id,
    sprint_num: row.sprint_num,
    lang: row.lang,
    decay_exempt: row.decay_exempt === 1,
    metadata: row.metadata,
    tenant_id: row.tenant_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

// ─── MemoryStore class ───────────────────────────────────────────

export class MemoryStore {
  private db: DatabaseType;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  // ── Schema initialization ────────────────────────────────────

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'system',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        tag_text TEXT NOT NULL DEFAULT '',
        title_norm TEXT NOT NULL DEFAULT '',
        content_norm TEXT NOT NULL DEFAULT '',
        summary_norm TEXT NOT NULL DEFAULT '',
        tag_norm TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        priority TEXT NOT NULL DEFAULT 'normal',
        sprint_id TEXT,
        sprint_num INTEGER NOT NULL DEFAULT 0,
        lang TEXT NOT NULL DEFAULT 'en',
        decay_exempt INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}',
        tenant_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tags (
        entry_id TEXT NOT NULL,
        tag TEXT NOT NULL COLLATE NOCASE,
        PRIMARY KEY (entry_id, tag),
        FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS relations (
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        rel_type TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (from_id, to_id, rel_type)
      );

      CREATE TABLE IF NOT EXISTS entry_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id TEXT NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT NOT NULL,
        change_type TEXT NOT NULL,
        changed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Additive, non-destructive migrations for existing DBs (DROP/rebuild forbidden).
    // Each migration is column-existence-guarded via PRAGMA so re-opening a DB
    // is idempotent and never raises "duplicate column" errors.
    this.applyAdditiveMigrations();

    // Indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
      CREATE INDEX IF NOT EXISTS idx_entries_source ON entries(source);
      CREATE INDEX IF NOT EXISTS idx_entries_sprint_num ON entries(sprint_num);
      CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
      CREATE INDEX IF NOT EXISTS idx_entries_decay ON entries(decay_exempt, sprint_num);
      CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
      CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_id);
      CREATE INDEX IF NOT EXISTS idx_history_entry ON entry_history(entry_id);
    `);

    // Partial index on deleted_at where NULL (active entries)
    this.createIndexIfNotExists(
      'idx_entries_active',
      'CREATE INDEX idx_entries_active ON entries(deleted_at) WHERE deleted_at IS NULL',
    );

    // FTS5 virtual table
    this.createFts5Table();

    // FTS5 sync triggers
    this.createFtsTriggers();

    // Record schema version
    this.recordSchemaVersion();
  }

  /**
   * Idempotent ALTER TABLE migrations for `entries`. Adds columns introduced
   * after the initial schema without rebuilding the table. PRAGMA-guarded so
   * repeated calls (re-opening the same DB file) are no-ops.
   *
   * Invariant: NEVER DROP or rebuild — historical rows must survive.
   */
  private applyAdditiveMigrations(): void {
    const cols = this.db.prepare(`PRAGMA table_info(entries)`).all() as Array<{ name: string }>;
    const have = new Set(cols.map(c => c.name));

    if (!have.has('tenant_id')) {
      this.db.exec(`ALTER TABLE entries ADD COLUMN tenant_id TEXT`);
    }

    // Sprint 179 W5-12: audit HMAC chain (I4 invariant). Additive, idempotent.
    if (!have.has('audit_prev_hmac')) {
      this.db.exec(`ALTER TABLE entries ADD COLUMN audit_prev_hmac TEXT`);
    }
    if (!have.has('audit_hmac')) {
      this.db.exec(`ALTER TABLE entries ADD COLUMN audit_hmac TEXT`);
    }
  }

  private createIndexIfNotExists(name: string, ddl: string): void {
    const exists = this.db.prepare(
      `SELECT 1 FROM sqlite_master WHERE type='index' AND name=?`,
    ).get(name) as { 1: number } | undefined;
    if (!exists) {
      this.db.exec(ddl);
    }
  }

  private createFts5Table(): void {
    const exists = this.db.prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='entries_fts'`,
    ).get() as { 1: number } | undefined;
    if (!exists) {
      this.db.exec(`
        CREATE VIRTUAL TABLE entries_fts USING fts5(
          title, content, summary, tag_text,
          title_norm, content_norm, summary_norm, tag_norm,
          content='entries',
          content_rowid='rowid',
          tokenize='unicode61 remove_diacritics 2'
        );
      `);
    }
  }

  private createFtsTriggers(): void {
    const triggerNames = [
      'entries_ai',  // after insert
      'entries_ad',  // after delete
      'entries_au',  // after update
    ];

    for (const name of triggerNames) {
      const exists = this.db.prepare(
        `SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?`,
      ).get(name) as { 1: number } | undefined;
      if (exists) continue;

      if (name === 'entries_ai') {
        this.db.exec(`
          CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
            INSERT INTO entries_fts(rowid, title, content, summary, tag_text,
              title_norm, content_norm, summary_norm, tag_norm)
            VALUES (new.rowid, new.title, new.content, new.summary, new.tag_text,
              new.title_norm, new.content_norm, new.summary_norm, new.tag_norm);
          END;
        `);
      } else if (name === 'entries_ad') {
        this.db.exec(`
          CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
            INSERT INTO entries_fts(entries_fts, rowid, title, content, summary, tag_text,
              title_norm, content_norm, summary_norm, tag_norm)
            VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.tag_text,
              old.title_norm, old.content_norm, old.summary_norm, old.tag_norm);
          END;
        `);
      } else if (name === 'entries_au') {
        this.db.exec(`
          CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
            INSERT INTO entries_fts(entries_fts, rowid, title, content, summary, tag_text,
              title_norm, content_norm, summary_norm, tag_norm)
            VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.tag_text,
              old.title_norm, old.content_norm, old.summary_norm, old.tag_norm);
            INSERT INTO entries_fts(rowid, title, content, summary, tag_text,
              title_norm, content_norm, summary_norm, tag_norm)
            VALUES (new.rowid, new.title, new.content, new.summary, new.tag_text,
              new.title_norm, new.content_norm, new.summary_norm, new.tag_norm);
          END;
        `);
      }
    }
  }

  private recordSchemaVersion(): void {
    const existing = this.db.prepare(
      `SELECT version FROM schema_version WHERE version = ?`,
    ).get(SCHEMA_VERSION) as { version: number } | undefined;
    if (!existing) {
      this.db.prepare(
        `INSERT INTO schema_version (version, applied_at) VALUES (?, datetime('now'))`,
      ).run(SCHEMA_VERSION);
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────

  insert(input: CreateEntryInput): void {
    const source = input.source ?? 'system';
    const summary = input.summary ?? null;
    const tags = input.tags ?? [];
    const status = input.status ?? 'active';
    const priority = input.priority ?? 'normal';
    const sprintId = input.sprint_id ?? null;
    const sprintNum = input.sprint_num ?? 0;
    const lang = input.lang ?? 'en';
    const decayExempt = input.decay_exempt ? 1 : 0;
    const metadata = JSON.stringify(input.metadata ?? {});
    const tenantId = input.tenant_id ?? null;
    const relations = input.relations ?? [];

    const tagText = tags.join(' ');
    const titleNorm = turkishNormalize(input.title);
    const contentNorm = turkishNormalize(input.content);
    const summaryNorm = turkishNormalize(summary ?? '');
    const tagNorm = turkishNormalize(tagText);

    const insertEntry = this.db.prepare(`
      INSERT INTO entries (
        id, type, source, title, content, summary,
        tag_text, title_norm, content_norm, summary_norm, tag_norm,
        status, priority, sprint_id, sprint_num, lang,
        decay_exempt, metadata, tenant_id
      ) VALUES (
        @id, @type, @source, @title, @content, @summary,
        @tag_text, @title_norm, @content_norm, @summary_norm, @tag_norm,
        @status, @priority, @sprint_id, @sprint_num, @lang,
        @decay_exempt, @metadata, @tenant_id
      )
    `);

    const insertTag = this.db.prepare(
      `INSERT INTO tags (entry_id, tag) VALUES (?, ?)`,
    );

    const insertRelation = this.db.prepare(
      `INSERT OR IGNORE INTO relations (from_id, to_id, rel_type) VALUES (?, ?, ?)`,
    );

    const insertHistory = this.db.prepare(`
      INSERT INTO entry_history (entry_id, field, old_value, new_value, changed_by, change_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const txn = this.db.transaction(() => {
      insertEntry.run({
        id: input.id,
        type: input.type,
        source,
        title: input.title,
        content: input.content,
        summary,
        tag_text: tagText,
        title_norm: titleNorm,
        content_norm: contentNorm,
        summary_norm: summaryNorm,
        tag_norm: tagNorm,
        status,
        priority,
        sprint_id: sprintId,
        sprint_num: sprintNum,
        lang,
        decay_exempt: decayExempt,
        metadata,
        tenant_id: tenantId,
      });

      for (const tag of tags) {
        insertTag.run(input.id, tag);
      }

      for (const rel of relations) {
        insertRelation.run(input.id, rel.to_id, rel.rel_type);
      }

      // Auto-extract ADR references from content + title
      const adrRefs = MemoryStore.extractAdrReferences(input.content + ' ' + input.title);
      for (const adrId of adrRefs) {
        // Don't self-reference
        if (adrId !== input.id) {
          insertRelation.run(input.id, adrId, 'references');
        }
      }

      // Record create history
      insertHistory.run(input.id, '*', null, null, 'system', 'create');
    });

    txn();
  }

  upsert(input: CreateEntryInput, changedBy: string): void {
    const existing = this.db.prepare(
      `SELECT * FROM entries WHERE id = ?`,
    ).get(input.id) as EntryRow | undefined;

    if (!existing) {
      this.insert(input);
      return;
    }

    // Compute new values
    const source = input.source ?? 'system';
    const summary = input.summary ?? null;
    const tags = input.tags ?? [];
    const status = input.status ?? 'active';
    const priority = input.priority ?? 'normal';
    const sprintId = input.sprint_id ?? null;
    const sprintNum = input.sprint_num ?? 0;
    const lang = input.lang ?? 'en';
    const decayExempt = input.decay_exempt ? 1 : 0;
    const metadata = JSON.stringify(input.metadata ?? {});
    const tenantId = input.tenant_id ?? null;

    const tagText = tags.join(' ');
    const titleNorm = turkishNormalize(input.title);
    const contentNorm = turkishNormalize(input.content);
    const summaryNorm = turkishNormalize(summary ?? '');
    const tagNorm = turkishNormalize(tagText);

    // Build diff of changed fields
    const diffs: Array<{ field: string; oldVal: string | null; newVal: string | null }> = [];

    const fieldMap: Array<[string, string | number | null, string | number | null]> = [
      ['type', existing.type, input.type],
      ['source', existing.source, source],
      ['title', existing.title, input.title],
      ['content', existing.content, input.content],
      ['summary', existing.summary, summary],
      ['tag_text', existing.tag_text, tagText],
      ['status', existing.status, status],
      ['priority', existing.priority, priority],
      ['sprint_id', existing.sprint_id, sprintId],
      ['sprint_num', existing.sprint_num, sprintNum],
      ['lang', existing.lang, lang],
      ['decay_exempt', existing.decay_exempt, decayExempt],
      ['metadata', existing.metadata, metadata],
      ['tenant_id', existing.tenant_id, tenantId],
    ];

    for (const [field, oldVal, newVal] of fieldMap) {
      const oldStr = oldVal === null ? null : String(oldVal);
      const newStr = newVal === null ? null : String(newVal);
      if (oldStr !== newStr) {
        diffs.push({ field, oldVal: oldStr, newVal: newStr });
      }
    }

    const updateEntry = this.db.prepare(`
      UPDATE entries SET
        type = @type,
        source = @source,
        title = @title,
        content = @content,
        summary = @summary,
        tag_text = @tag_text,
        title_norm = @title_norm,
        content_norm = @content_norm,
        summary_norm = @summary_norm,
        tag_norm = @tag_norm,
        status = @status,
        priority = @priority,
        sprint_id = @sprint_id,
        sprint_num = @sprint_num,
        lang = @lang,
        decay_exempt = @decay_exempt,
        metadata = @metadata,
        tenant_id = @tenant_id,
        updated_at = datetime('now')
      WHERE id = @id
    `);

    const deleteTags = this.db.prepare(`DELETE FROM tags WHERE entry_id = ?`);
    const insertTag = this.db.prepare(`INSERT INTO tags (entry_id, tag) VALUES (?, ?)`);
    const insertHistory = this.db.prepare(`
      INSERT INTO entry_history (entry_id, field, old_value, new_value, changed_by, change_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const txn = this.db.transaction(() => {
      updateEntry.run({
        id: input.id,
        type: input.type,
        source,
        title: input.title,
        content: input.content,
        summary,
        tag_text: tagText,
        title_norm: titleNorm,
        content_norm: contentNorm,
        summary_norm: summaryNorm,
        tag_norm: tagNorm,
        status,
        priority,
        sprint_id: sprintId,
        sprint_num: sprintNum,
        lang,
        decay_exempt: decayExempt,
        metadata,
        tenant_id: tenantId,
      });

      // Replace tags
      deleteTags.run(input.id);
      for (const tag of tags) {
        insertTag.run(input.id, tag);
      }

      // Record field-level history for each changed field
      for (const diff of diffs) {
        insertHistory.run(input.id, diff.field, diff.oldVal, diff.newVal, changedBy, 'update');
      }
    });

    txn();
  }

  update(
    id: string,
    fields: Partial<{
      content: string;
      title: string;
      summary: string;
      metadata: string;
      status: string;
      priority: string;
      decay_exempt: number;
    }>,
    changedBy = 'system',
  ): void {
    const existing = this.db.prepare(
      `SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL`,
    ).get(id) as EntryRow | undefined;
    if (!existing) return;

    const sets: string[] = [`updated_at = datetime('now')`];
    const params: Record<string, string | number | null> = { id };
    const diffs: Array<{ field: string; oldVal: string | null; newVal: string | null }> = [];

    if (fields.content !== undefined) {
      sets.push('content = @content', 'content_norm = @content_norm');
      params.content = fields.content;
      params.content_norm = turkishNormalize(fields.content);
      if (existing.content !== fields.content) {
        diffs.push({ field: 'content', oldVal: existing.content, newVal: fields.content });
      }
    }
    if (fields.title !== undefined) {
      sets.push('title = @title', 'title_norm = @title_norm');
      params.title = fields.title;
      params.title_norm = turkishNormalize(fields.title);
      if (existing.title !== fields.title) {
        diffs.push({ field: 'title', oldVal: existing.title, newVal: fields.title });
      }
    }
    if (fields.summary !== undefined) {
      sets.push('summary = @summary', 'summary_norm = @summary_norm');
      params.summary = fields.summary;
      params.summary_norm = turkishNormalize(fields.summary);
      if (existing.summary !== fields.summary) {
        diffs.push({ field: 'summary', oldVal: existing.summary ?? null, newVal: fields.summary });
      }
    }
    if (fields.metadata !== undefined) {
      sets.push('metadata = @metadata');
      params.metadata = fields.metadata;
      if (existing.metadata !== fields.metadata) {
        diffs.push({ field: 'metadata', oldVal: existing.metadata ?? null, newVal: fields.metadata });
      }
    }
    if (fields.status !== undefined) {
      sets.push('status = @status');
      params.status = fields.status;
      if (existing.status !== fields.status) {
        diffs.push({ field: 'status', oldVal: existing.status, newVal: fields.status });
      }
    }
    if (fields.priority !== undefined) {
      sets.push('priority = @priority');
      params.priority = fields.priority;
      if (existing.priority !== fields.priority) {
        diffs.push({ field: 'priority', oldVal: existing.priority, newVal: fields.priority });
      }
    }
    if (fields.decay_exempt !== undefined) {
      sets.push('decay_exempt = @decay_exempt');
      params.decay_exempt = fields.decay_exempt;
      if (String(existing.decay_exempt) !== String(fields.decay_exempt)) {
        diffs.push({ field: 'decay_exempt', oldVal: String(existing.decay_exempt), newVal: String(fields.decay_exempt) });
      }
    }

    const insertHistory = this.db.prepare(`
      INSERT INTO entry_history (entry_id, field, old_value, new_value, changed_by, change_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      this.db.prepare(`UPDATE entries SET ${sets.join(', ')} WHERE id = @id`).run(params);
      for (const diff of diffs) {
        insertHistory.run(id, diff.field, diff.oldVal, diff.newVal, changedBy, 'patch');
      }
    })();
  }

  getById(id: string, opts?: { includeDeleted?: boolean }): MemoryEntryV2 | null {
    const includeDeleted = opts?.includeDeleted ?? false;
    const sql = includeDeleted
      ? `SELECT * FROM entries WHERE id = ?`
      : `SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL`;
    const row = this.db.prepare(sql).get(id) as EntryRow | undefined;
    return row ? rowToEntry(row) : null;
  }

  getByType(type: string): MemoryEntryV2[] {
    const rows = this.db.prepare(
      `SELECT * FROM entries WHERE type = ? AND deleted_at IS NULL ORDER BY sprint_num DESC`,
    ).all(type) as EntryRow[];
    return rows.map(rowToEntry);
  }

  // ── Tags ─────────────────────────────────────────────────────

  getTagsForEntry(entryId: string): string[] {
    const rows = this.db.prepare(
      `SELECT tag FROM tags WHERE entry_id = ?`,
    ).all(entryId) as Array<{ tag: string }>;
    return rows.map(r => r.tag);
  }

  getByTags(tags: string[]): MemoryEntryV2[] {
    if (tags.length === 0) return [];
    const placeholders = tags.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT DISTINCT e.* FROM entries e
      INNER JOIN tags t ON e.id = t.entry_id
      WHERE t.tag IN (${placeholders})
        AND e.deleted_at IS NULL
    `).all(...tags) as EntryRow[];
    return rows.map(rowToEntry);
  }

  // ── Relations ────────────────────────────────────────────────

  getRelationsFrom(entryId: string): EntryRelation[] {
    const rows = this.db.prepare(
      `SELECT * FROM relations WHERE from_id = ?`,
    ).all(entryId) as Array<{ from_id: string; to_id: string; rel_type: RelationType; created_at: string }>;
    return rows.map((r) => ({ ...r, type: r.rel_type }));
  }

  getRelationsTo(entryId: string): EntryRelation[] {
    const rows = this.db.prepare(
      `SELECT * FROM relations WHERE to_id = ?`,
    ).all(entryId) as Array<{ from_id: string; to_id: string; rel_type: RelationType; created_at: string }>;
    return rows.map((r) => ({ ...r, type: r.rel_type }));
  }

  /**
   * Insert a single relation between two entries.
   * Uses INSERT OR IGNORE to avoid duplicates.
   *
   * Overload 1 (positional): backward-compatible for existing call sites.
   * Overload 2 (object form): MADR v3 MemoryRelation — performs FK validation.
   */
  insertRelation(fromId: string, toId: string, relType: RelationType): void;
  insertRelation(rel: MemoryRelation): void;
  insertRelation(
    fromIdOrRel: string | MemoryRelation,
    toId?: string,
    relType?: RelationType,
  ): void {
    let fromId: string;
    let resolvedToId: string;
    let resolvedRelType: RelationType;

    if (typeof fromIdOrRel === 'object') {
      // Object form — validate FK before insert
      fromId = fromIdOrRel.from_id;
      resolvedToId = fromIdOrRel.to_id;
      resolvedRelType = fromIdOrRel.type;

      const fromExists = this.db.prepare(
        `SELECT 1 FROM entries WHERE id = ?`,
      ).get(fromId);
      if (!fromExists) {
        throw new DeckentError('DECKENT_E068', `Orphan relation: from_id '${fromId}' not found in entries`);
      }

      const toExists = this.db.prepare(
        `SELECT 1 FROM entries WHERE id = ?`,
      ).get(resolvedToId);
      if (!toExists) {
        throw new DeckentError('DECKENT_E069', `Orphan relation: to_id '${resolvedToId}' not found in entries`);
      }
    } else {
      fromId = fromIdOrRel;
      resolvedToId = toId!;
      resolvedRelType = relType!;
    }

    this.db.prepare(
      `INSERT OR IGNORE INTO relations (from_id, to_id, rel_type) VALUES (?, ?, ?)`,
    ).run(fromId, resolvedToId, resolvedRelType);
  }

  /**
   * Get all relations for an entry (both from and to directions).
   * Returns a combined array of EntryRelation with both rel_type and type alias.
   */
  getRelations(entryId: string): EntryRelation[] {
    const rows = this.db.prepare(
      `SELECT * FROM relations WHERE from_id = ? OR to_id = ?`,
    ).all(entryId, entryId) as Array<{ from_id: string; to_id: string; rel_type: RelationType; created_at: string }>;
    return rows.map((r) => ({ ...r, type: r.rel_type }));
  }

  /**
   * Get total count of relations in the database.
   */
  countRelations(): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM relations`,
    ).get() as { cnt: number };
    return row.cnt;
  }

  /**
   * Extract ADR references from text content.
   * Matches patterns like ADR-001, ADR-039, etc.
   * Returns normalized IDs like 'adr-001'.
   */
  static extractAdrReferences(text: string): string[] {
    const matches = text.match(/\bADR-(\d{3})\b/g);
    if (!matches) return [];
    const unique = new Set(matches.map(m => m.toLowerCase()));
    return [...unique];
  }

  // ── History ──────────────────────────────────────────────────

  getHistory(entryId: string): EntryHistoryRecord[] {
    return this.db.prepare(
      `SELECT * FROM entry_history WHERE entry_id = ? ORDER BY id ASC`,
    ).all(entryId) as EntryHistoryRecord[];
  }

  // ── Lifecycle ────────────────────────────────────────────────

  softDelete(id: string, changedBy: string): void {
    const txn = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE entries SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      ).run(id);
      this.db.prepare(`
        INSERT INTO entry_history (entry_id, field, old_value, new_value, changed_by, change_type)
        VALUES (?, 'deleted_at', NULL, datetime('now'), ?, 'soft_delete')
      `).run(id, changedBy);
    });
    txn();
  }

  restore(id: string, changedBy: string): void {
    const txn = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE entries SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`,
      ).run(id);
      this.db.prepare(`
        INSERT INTO entry_history (entry_id, field, old_value, new_value, changed_by, change_type)
        VALUES (?, 'deleted_at', datetime('now'), NULL, ?, 'restore')
      `).run(id, changedBy);
    });
    txn();
  }

  decay(currentSprintNum: number, decayAfterSprints: number): { deletedCount: number } {
    const threshold = currentSprintNum - decayAfterSprints;

    // Find entries to decay
    const toDecay = this.db.prepare(`
      SELECT id FROM entries
      WHERE sprint_num < ?
        AND decay_exempt = 0
        AND deleted_at IS NULL
    `).all(threshold) as Array<{ id: string }>;

    if (toDecay.length === 0) return { deletedCount: 0 };

    const updateStmt = this.db.prepare(
      `UPDATE entries SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    );
    const historyStmt = this.db.prepare(`
      INSERT INTO entry_history (entry_id, field, old_value, new_value, changed_by, change_type)
      VALUES (?, 'deleted_at', NULL, datetime('now'), 'decay', 'decay')
    `);

    const txn = this.db.transaction(() => {
      for (const row of toDecay) {
        updateStmt.run(row.id);
        historyStmt.run(row.id);
      }
    });

    txn();
    return { deletedCount: toDecay.length };
  }

  // ── Counts ───────────────────────────────────────────────────

  countByType(): Map<string, number> {
    const rows = this.db.prepare(`
      SELECT type, COUNT(*) as cnt FROM entries WHERE deleted_at IS NULL GROUP BY type
    `).all() as Array<{ type: string; cnt: number }>;
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.type, row.cnt);
    }
    return map;
  }

  totalCount(): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM entries WHERE deleted_at IS NULL`,
    ).get() as { cnt: number };
    return row.cnt;
  }

  // ── Audit HMAC chain (Sprint 179 W5-12, I4 invariant) ──────────

  /**
   * Insert an audit entry that participates in the append-only HMAC chain.
   * The caller is responsible for computing `prevHmac` (last row's hmac, or
   * null for genesis) and `hmac` via `computeAuditHmac()`. We persist them
   * verbatim — verify-side recomputation lives in `audit-integrity.ts`.
   *
   * Note: `type` is forced to `'audit'` to keep the chain coherent.
   */
  insertAuditWithHmac(
    input: CreateEntryInput,
    prevHmac: string | null,
    hmac: string,
  ): void {
    const source = input.source ?? 'system';
    const summary = input.summary ?? null;
    const tags = input.tags ?? [];
    const status = input.status ?? 'active';
    const priority = input.priority ?? 'normal';
    const sprintId = input.sprint_id ?? null;
    const sprintNum = input.sprint_num ?? 0;
    const lang = input.lang ?? 'en';
    const decayExempt = input.decay_exempt ? 1 : 0;
    const metadata = JSON.stringify(input.metadata ?? {});
    const tenantId = input.tenant_id ?? null;

    const tagText = tags.join(' ');
    const titleNorm = turkishNormalize(input.title);
    const contentNorm = turkishNormalize(input.content);
    const summaryNorm = turkishNormalize(summary ?? '');
    const tagNorm = turkishNormalize(tagText);

    const stmt = this.db.prepare(`
      INSERT INTO entries (
        id, type, source, title, content, summary,
        tag_text, title_norm, content_norm, summary_norm, tag_norm,
        status, priority, sprint_id, sprint_num, lang,
        decay_exempt, metadata, tenant_id,
        audit_prev_hmac, audit_hmac
      ) VALUES (
        @id, 'audit', @source, @title, @content, @summary,
        @tag_text, @title_norm, @content_norm, @summary_norm, @tag_norm,
        @status, @priority, @sprint_id, @sprint_num, @lang,
        @decay_exempt, @metadata, @tenant_id,
        @audit_prev_hmac, @audit_hmac
      )
    `);

    stmt.run({
      id: input.id,
      source,
      title: input.title,
      content: input.content,
      summary,
      tag_text: tagText,
      title_norm: titleNorm,
      content_norm: contentNorm,
      summary_norm: summaryNorm,
      tag_norm: tagNorm,
      status,
      priority,
      sprint_id: sprintId,
      sprint_num: sprintNum,
      lang,
      decay_exempt: decayExempt,
      metadata,
      tenant_id: tenantId,
      audit_prev_hmac: prevHmac,
      audit_hmac: hmac,
    });
  }

  /**
   * Returns the HMAC of the latest audit row (id-order = insertion order via
   * SQLite rowid). Returns null when no chained audit rows exist yet.
   */
  getLastAuditHmac(): string | null {
    const row = this.db.prepare(
      `SELECT audit_hmac FROM entries
        WHERE type = 'audit' AND audit_hmac IS NOT NULL
        ORDER BY rowid DESC
        LIMIT 1`,
    ).get() as { audit_hmac: string | null } | undefined;
    return row?.audit_hmac ?? null;
  }

  /**
   * Walk every audit row in chain (insertion) order. Returns the fields the
   * verifier needs to recompute and compare HMACs.
   */
  queryAuditChain(): Array<{
    id: string;
    tenant_id: string | null;
    title: string;
    content: string;
    audit_prev_hmac: string | null;
    audit_hmac: string | null;
    created_at: string;
  }> {
    return this.db.prepare(
      `SELECT id, tenant_id, title, content,
              audit_prev_hmac, audit_hmac, created_at
         FROM entries
        WHERE type = 'audit'
        ORDER BY rowid ASC`,
    ).all() as Array<{
      id: string;
      tenant_id: string | null;
      title: string;
      content: string;
      audit_prev_hmac: string | null;
      audit_hmac: string | null;
      created_at: string;
    }>;
  }

  // ── Chat (Sprint 190 T-190-006) ──────────────────────────────
  //
  // Chat turns are persisted as plain `entries` rows with `type='chat'` so
  // they are automatically indexed by the FTS5 virtual table — `deckent
  // recall "<query>"` therefore matches chat content out of the box.
  //
  // Entry shape per turn:
  //   id        — `chat-<sessionId>-<turnIndex:0-padded>`
  //   tags      — [`chat:<sessionId>`, `role:<role>`] for filtered retrieval
  //   metadata  — { session_id, turn_index, role } JSON
  //   source    — 'user' for user turns, 'system' for assistant turns
  //                (constrained to EntrySource union)

  /**
   * Create a new chat session. Returns the canonical session id used in
   * subsequent appendChatTurn() / getChatHistory() calls. If `sessionId`
   * is omitted, generates one from the current timestamp.
   *
   * No row is written here — sessions are implicit, defined by the first
   * appendChatTurn() call. The return value is purely a convention helper.
   */
  createChatSession(sessionId?: string): string {
    if (sessionId && sessionId.trim().length > 0) {
      return sessionId;
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 8);
    return `chat-${ts}-${rand}`;
  }

  /**
   * Append a single turn to a chat session. Returns the new turn's index
   * (0-based, monotonically increasing per session).
   *
   * Idempotency note: this method does NOT deduplicate identical content —
   * each call appends a new turn. Callers that retry must track turn
   * indices externally.
   */
  appendChatTurn(sessionId: string, role: ChatRole, content: string): number {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new DeckentError('DECKENT_E070', 'appendChatTurn requires a non-empty sessionId');
    }

    const nextIndex = this.getChatTurnCount(sessionId);
    const paddedIndex = String(nextIndex).padStart(6, '0');
    const id = `chat-${sessionId}-${paddedIndex}`;

    this.insert({
      id,
      type: 'chat',
      source: role === 'user' ? 'user' : 'system',
      title: `[chat] ${sessionId} turn ${nextIndex} (${role})`,
      content,
      tags: [`chat:${sessionId}`, `role:${role}`],
      metadata: { session_id: sessionId, turn_index: nextIndex, role },
      decay_exempt: false,
    });

    return nextIndex;
  }

  /**
   * Return all turns for a chat session in chronological order.
   * Pass `limit` to retrieve only the most recent N turns (e.g. for
   * `deckent chat --resume`).
   */
  getChatHistory(sessionId: string, limit?: number): ChatTurn[] {
    if (!sessionId || sessionId.trim().length === 0) return [];

    // Filter via tag join — `chat:<sessionId>` tag is set by appendChatTurn.
    // Sort by id ASC; id encodes a 0-padded turn index so lexicographic
    // order matches insertion order.
    const rows = this.db.prepare(`
      SELECT DISTINCT e.id, e.content, e.created_at, e.metadata
      FROM entries e
      INNER JOIN tags t ON t.entry_id = e.id
      WHERE e.type = 'chat'
        AND e.deleted_at IS NULL
        AND t.tag = ?
      ORDER BY e.id ASC
    `).all(`chat:${sessionId}`) as Array<{
      id: string;
      content: string;
      created_at: string;
      metadata: string;
    }>;

    const turns: ChatTurn[] = rows.map(row => {
      let parsed: { session_id?: string; turn_index?: number; role?: ChatRole } = {};
      try {
        parsed = JSON.parse(row.metadata) as typeof parsed;
      } catch {
        // Corrupt metadata — fall back to id-derived turn index.
      }
      const turnIndex = typeof parsed.turn_index === 'number'
        ? parsed.turn_index
        : Number.parseInt(row.id.slice(`chat-${sessionId}-`.length), 10) || 0;
      const role: ChatRole = parsed.role === 'assistant' ? 'assistant' : 'user';
      return {
        session_id: sessionId,
        turn_index: turnIndex,
        role,
        content: row.content,
        timestamp: row.created_at,
      };
    });

    if (typeof limit === 'number' && limit >= 0) {
      if (limit === 0) return [];
      if (turns.length > limit) return turns.slice(-limit);
    }
    return turns;
  }

  /** Internal helper — count chat turns for a given session. */
  private getChatTurnCount(sessionId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM entries e
      INNER JOIN tags t ON t.entry_id = e.id
      WHERE e.type = 'chat'
        AND e.deleted_at IS NULL
        AND t.tag = ?
    `).get(`chat:${sessionId}`) as { cnt: number };
    return row.cnt;
  }

  // ── Schema & Raw Access ──────────────────────────────────────

  getSchemaVersion(): number {
    const row = this.db.prepare(
      `SELECT MAX(version) as v FROM schema_version`,
    ).get() as { v: number | null };
    return row.v ?? 0;
  }

  close(): void {
    this.db.close();
  }

  getRawDb(): DatabaseType {
    return this.db;
  }
}
