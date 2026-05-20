// src/core/memory-types.ts

/**
 * Memory V2 type definitions.
 * These types map directly to the SQLite schema in memory-store.ts.
 */

// ─── Entry Types ──────────────────────────────────────────────────

/** Built-in entry types. Custom types are strings beyond this set. */
export type EntryType =
  | 'adr'
  | 'memory'
  | 'sprint'
  | 'debt'
  | 'pattern'
  | 'retro'
  | 'error'
  | 'identity'
  | 'audit'
  | 'custom';

/** Who created this entry. */
export type EntrySource =
  | 'system'
  | 'brain'
  | 'worker'
  | 'user'
  | 'import';

/** Entry status. Meaning varies by type. */
export type EntryStatus =
  | 'active'
  | 'accepted'
  | 'deprecated'
  | 'superseded'
  | 'proposed'
  | 'rejected'
  | 'resolved'
  | 'archived';

/** Relation types between entries. */
export type RelationType =
  | 'references'
  | 'supersedes'
  | 'caused_by'
  | 'resolves'
  | 'blocks'
  | 'depends_on';

/** Change types for history tracking. */
export type ChangeType =
  | 'create'
  | 'update'
  | 'soft_delete'
  | 'restore'
  | 'decay';

// ─── Core Data Structures ─────────────────────────────────────────

/** A single knowledge entry in the memory DB. */
export interface MemoryEntryV2 {
  id: string;
  type: string;
  source: EntrySource;
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
  decay_exempt: boolean;
  metadata: string;
  /** Multi-tenant scope tag. NULL for legacy/single-tenant entries (default). */
  tenant_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Input for creating a new entry (fields with defaults omitted). */
export interface CreateEntryInput {
  id: string;
  type: string;
  title: string;
  content: string;
  source?: EntrySource;
  summary?: string;
  tags?: string[];
  status?: string;
  priority?: string;
  sprint_id?: string;
  sprint_num?: number;
  lang?: string;
  decay_exempt?: boolean;
  metadata?: Record<string, unknown>;
  /** Multi-tenant scope tag (omit for single-tenant default). */
  tenant_id?: string;
  relations?: Array<{ to_id: string; rel_type: RelationType }>;
}

/** A cross-reference between two entries. */
export interface EntryRelation {
  from_id: string;
  to_id: string;
  rel_type: RelationType;
  /** Alias for rel_type — available in query results for test/plan spec compatibility. */
  type: RelationType;
  created_at: string;
}

/** Convenience type for relation insert operations. */
export interface Relation {
  from_id: string;
  to_id: string;
  rel_type: RelationType;
  source?: 'auto-extract' | 'backfill' | 'finalizer' | 'user';
}

/** Object form for insertRelation — MADR v3 relation input. */
export interface MemoryRelation {
  from_id: string;
  to_id: string;
  type: RelationType;
  metadata?: Record<string, unknown>;
}

/** A change history record. */
export interface EntryHistoryRecord {
  id: number;
  entry_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  change_type: ChangeType;
  changed_at: string;
}

// ─── Query Interface ──────────────────────────────────────────────

/** Query parameters for searching memory. */
export interface MemoryQueryParams {
  /** Full-text search query (FTS5 MATCH). Searches both original + normalized. */
  text?: string;
  /** Filter by entry type(s). */
  type?: string[];
  /** Filter by source(s). */
  source?: EntrySource[];
  /** Filter by status(es). */
  status?: string[];
  /** Filter by sprint number range. */
  sprint_range?: { min?: number; max?: number };
  /** Filter: entries must have ALL of these tags. */
  tags_contain?: string[];
  /** Include soft-deleted entries (default: false). */
  include_deleted?: boolean;
  /** Include only decay-exempt entries (default: undefined = all). */
  decay_exempt?: boolean;
  /** Maximum results (default: 10). */
  limit?: number;
  /** Minimum relevance score for FTS results (default: 0). */
  min_score?: number;
  /** FTS5 token join mode: 'or' (default, broader recall) or 'and' (all tokens must match). */
  mode?: 'and' | 'or';
}

/** A single search result with relevance score. */
export interface MemorySearchResult {
  entry: MemoryEntryV2;
  relevance: number;
  snippet?: string;
}

// ─── Export Types ─────────────────────────────────────────────────

/** Summary entry for the summary.md context file. */
export interface SummaryExportEntry {
  id: string;
  type: string;
  title: string;
  status: string;
  sprint_id: string | null;
  summary: string | null;
}
