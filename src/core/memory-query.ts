/**
 * memory-query.ts — Dual-layer FTS5 search for Memory V2.
 *
 * Provides two search layers:
 *   1. Original text columns (title, content, summary, tag_text)
 *   2. Normalized text columns (title_norm, content_norm, summary_norm, tag_norm)
 *
 * The normalized layer uses turkishNormalize() so queries like "brain import"
 * match Turkish content "Brain merkezi import kurali" through ASCII folding.
 *
 * Also provides buildAutoQuery() for Brain lifecycle integration.
 */

import type { MemoryStore } from './memory-store.js';
import { turkishNormalize } from './memory-normalize.js';
import type { MemoryQueryParams, MemorySearchResult, MemoryEntryV2 } from './memory-types.js';
import { createDebugLog } from './debug-log.js';

const log = createDebugLog('memory-query');

// ─── FTS5 Query Escaping ─────────────────────────────────────────────

/**
 * Custom error class for memory query failures.
 * Thrown instead of silently returning empty results.
 */
export class MemoryQueryError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'MemoryQueryError';
  }
}

/**
 * Escape user input for FTS5 MATCH.
 * - Wrap individual tokens in double quotes to treat as literals.
 * - Preserve OR, AND, NOT operators and * wildcard at end of token.
 * - `mode` controls token join: 'or' (default) joins with OR for broader recall,
 *   'and' joins with implicit AND (space) for precise matching.
 */
export function escapeFts5Query(input: string, mode: 'and' | 'or' = 'or'): string {
  const OPERATORS = new Set(['OR', 'AND', 'NOT']);
  const tokens = input
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(token => {
      if (OPERATORS.has(token)) return token;
      // Allow trailing wildcard
      if (token.endsWith('*')) {
        const base = token.slice(0, -1);
        return `"${base}"*`;
      }
      return `"${token}"`;
    });

  if (mode === 'and') return tokens.join(' ');

  // OR mode: insert OR between non-operator tokens, but don't duplicate
  // when user already wrote explicit operators.
  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (i > 0 && !OPERATORS.has(tok) && !OPERATORS.has(tokens[i - 1]!)) {
      parts.push('OR');
    }
    parts.push(tok);
  }
  return parts.join(' ');
}

// ─── Row type from FTS join ──────────────────────────────────────────

interface FtsResultRow {
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  rank: number;
  snip_title: string | null;
  snip_content: string | null;
  snip_tags: string | null;
}

interface StructuredResultRow {
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToEntry(row: StructuredResultRow | FtsResultRow): MemoryEntryV2 {
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
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

// ─── searchMemory ────────────────────────────────────────────────────

/**
 * Search the memory store using dual-layer FTS5 + structured filters.
 *
 * When `params.text` is provided, runs an FTS5 MATCH on both original and
 * normalized columns (OR'd together for maximum recall). When no text is
 * provided, returns filtered entries ordered by sprint_num DESC.
 */
export function searchMemory(
  store: MemoryStore,
  params: MemoryQueryParams,
): MemorySearchResult[] {
  const db = store.getRawDb();
  const limit = params.limit ?? 10;

  if (params.text && params.text.trim().length > 0) {
    return ftsSearch(db, params, limit);
  }
  return structuredSearch(db, params, limit);
}

/**
 * Pick the best snippet from multiple FTS5 column snippets.
 * Prefers content, then title, then tags — but only if the snippet
 * contains the highlight markers (>>>/<<<), indicating a match.
 */
function pickBestSnippet(...candidates: Array<string | null>): string | undefined {
  const MARKER = '>>>';
  for (const s of candidates) {
    if (s && s.includes(MARKER)) return s;
  }
  // Fallback: return first non-null candidate (no highlights)
  for (const s of candidates) {
    if (s) return s;
  }
  return undefined;
}

// ─── FTS search path ─────────────────────────────────────────────────

function ftsSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  params: MemoryQueryParams,
  limit: number,
): MemorySearchResult[] {
  const mode = params.mode ?? 'or';
  const escaped = escapeFts5Query(params.text!, mode);
  const normalized = escapeFts5Query(turkishNormalize(params.text!), mode);

  log.debug(`FTS query mode=${mode} escaped="${escaped}" normalized="${normalized}"`);

  // Build dual-layer FTS5 MATCH expression:
  // Search original columns OR normalized columns
  const ftsQuery =
    `{title content summary tag_text}: (${escaped})` +
    ` OR ` +
    `{title_norm content_norm summary_norm tag_norm}: (${normalized})`;

  // Build WHERE clauses for structured filters
  const { whereClauses, bindParams } = buildFilterClauses(db, params, 'e');

  // Generate snippets for multiple columns to find best match.
  // FTS5 columns: 0=title, 1=content, 2=summary, 3=tag_text,
  //               4=title_norm, 5=content_norm, 6=summary_norm, 7=tag_norm
  const sql = `
    SELECT e.*,
           entries_fts.rank AS rank,
           snippet(entries_fts, 0, '>>>', '<<<', '...', 20) AS snip_title,
           snippet(entries_fts, 1, '>>>', '<<<', '...', 20) AS snip_content,
           snippet(entries_fts, 3, '>>>', '<<<', '...', 20) AS snip_tags
    FROM entries_fts
    INNER JOIN entries e ON e.rowid = entries_fts.rowid
    WHERE entries_fts MATCH @fts_query
      ${whereClauses.length > 0 ? 'AND ' + whereClauses.join(' AND ') : ''}
    ORDER BY entries_fts.rank
    LIMIT @limit
  `;

  try {
    const rows = db.prepare(sql).all({
      fts_query: ftsQuery,
      limit,
      ...bindParams,
    }) as FtsResultRow[];

    log.info(`FTS search returned ${rows.length} results for mode=${mode}`);

    return rows.map(row => ({
      entry: rowToEntry(row),
      relevance: Math.abs(row.rank),
      snippet: pickBestSnippet(row.snip_content, row.snip_title, row.snip_tags),
    }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`FTS5 query failed: ${message}`);
    throw new MemoryQueryError(`FTS5 query failed: ${message}`, err);
  }
}

// ─── Structured search path (no text) ────────────────────────────────

function structuredSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  params: MemoryQueryParams,
  limit: number,
): MemorySearchResult[] {
  const { whereClauses, bindParams } = buildFilterClauses(db, params, 'e');

  // tags_contain subquery
  const { tagClause, tagBinds } = buildTagsContainClause(params);

  const allClauses = [...whereClauses];
  if (tagClause) allClauses.push(tagClause);

  const sql = `
    SELECT e.*
    FROM entries e
    ${allClauses.length > 0 ? 'WHERE ' + allClauses.join(' AND ') : ''}
    ORDER BY e.sprint_num DESC
    LIMIT @limit
  `;

  const rows = db.prepare(sql).all({
    limit,
    ...bindParams,
    ...tagBinds,
  }) as StructuredResultRow[];

  return rows.map(row => ({
    entry: rowToEntry(row),
    relevance: 0,
  }));
}

// ─── Tenant column guard (born-609) ──────────────────────────────────

/**
 * Defensive existence check for `entries.tenant_id` via PRAGMA table_info.
 * `memory-store.ts` already adds this column via an additive migration on every
 * `MemoryStore` open, so in practice the column always exists — this guard exists
 * for the case `searchMemory` is ever pointed at an older/foreign DB file: the
 * predicate is skipped rather than throwing (honest no-op, per task spec).
 */
function hasTenantColumn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): boolean {
  try {
    const cols = db.prepare(`PRAGMA table_info(entries)`).all() as Array<{ name: string }>;
    return cols.some(c => c.name === 'tenant_id');
  } catch {
    return false;
  }
}

// ─── Filter clause builder ───────────────────────────────────────────

function buildFilterClauses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  params: MemoryQueryParams,
  alias: string,
): { whereClauses: string[]; bindParams: Record<string, unknown> } {
  const clauses: string[] = [];
  const binds: Record<string, unknown> = {};

  // deleted_at filter (default: exclude deleted)
  if (!params.include_deleted) {
    clauses.push(`${alias}.deleted_at IS NULL`);
  }

  // tenant filter (born-609, additive-only). Fail-closed exact match — a NULL-tenant
  // row never matches an explicit tenantId, mirroring MemoryStore's born-563 default.
  // Nothing runs here at all when tenantId is omitted, so the tenant-less path stays
  // byte-identical to pre-609 behavior.
  if (params.tenantId !== undefined) {
    if (hasTenantColumn(db)) {
      clauses.push(`${alias}.tenant_id = @tenant_id`);
      binds['tenant_id'] = params.tenantId;
    } else {
      log.warn(
        `tenantId="${params.tenantId}" requested but entries.tenant_id column does not exist — skipping tenant predicate (honest no-op)`,
      );
    }
  }

  // type filter
  if (params.type && params.type.length > 0) {
    const placeholders = params.type.map((_, i) => `@type_${i}`);
    clauses.push(`${alias}.type IN (${placeholders.join(', ')})`);
    for (let i = 0; i < params.type.length; i++) {
      binds[`type_${i}`] = params.type[i];
    }
  }

  // source filter
  if (params.source && params.source.length > 0) {
    const placeholders = params.source.map((_, i) => `@source_${i}`);
    clauses.push(`${alias}.source IN (${placeholders.join(', ')})`);
    for (let i = 0; i < params.source.length; i++) {
      binds[`source_${i}`] = params.source[i];
    }
  }

  // status filter
  if (params.status && params.status.length > 0) {
    const placeholders = params.status.map((_, i) => `@status_${i}`);
    clauses.push(`${alias}.status IN (${placeholders.join(', ')})`);
    for (let i = 0; i < params.status.length; i++) {
      binds[`status_${i}`] = params.status[i];
    }
  }

  // sprint_range filter
  if (params.sprint_range) {
    if (params.sprint_range.min !== undefined) {
      clauses.push(`${alias}.sprint_num >= @sprint_min`);
      binds['sprint_min'] = params.sprint_range.min;
    }
    if (params.sprint_range.max !== undefined) {
      clauses.push(`${alias}.sprint_num <= @sprint_max`);
      binds['sprint_max'] = params.sprint_range.max;
    }
  }

  // decay_exempt filter
  if (params.decay_exempt !== undefined) {
    clauses.push(`${alias}.decay_exempt = @decay_exempt`);
    binds['decay_exempt'] = params.decay_exempt ? 1 : 0;
  }

  // tags_contain subquery (for FTS path, applied to entries table)
  if (params.tags_contain && params.tags_contain.length > 0) {
    const tagCount = params.tags_contain.length;
    const tagPlaceholders = params.tags_contain.map((_, i) => `@tag_${i}`);
    clauses.push(`
      ${alias}.id IN (
        SELECT t.entry_id FROM tags t
        WHERE t.tag IN (${tagPlaceholders.join(', ')})
        GROUP BY t.entry_id
        HAVING COUNT(DISTINCT t.tag) = @tag_count
      )
    `);
    for (let i = 0; i < params.tags_contain.length; i++) {
      binds[`tag_${i}`] = params.tags_contain[i];
    }
    binds['tag_count'] = tagCount;
  }

  return { whereClauses: clauses, bindParams: binds };
}

function buildTagsContainClause(
  params: MemoryQueryParams,
): { tagClause: string | null; tagBinds: Record<string, unknown> } {
  if (!params.tags_contain || params.tags_contain.length === 0) {
    return { tagClause: null, tagBinds: {} };
  }

  const tagCount = params.tags_contain.length;
  const tagPlaceholders = params.tags_contain.map((_, i) => `@stag_${i}`);
  const binds: Record<string, unknown> = {};
  for (let i = 0; i < params.tags_contain.length; i++) {
    binds[`stag_${i}`] = params.tags_contain[i];
  }
  binds['stag_count'] = tagCount;

  const clause = `
    e.id IN (
      SELECT t.entry_id FROM tags t
      WHERE t.tag IN (${tagPlaceholders.join(', ')})
      GROUP BY t.entry_id
      HAVING COUNT(DISTINCT t.tag) = @stag_count
    )
  `;

  return { tagClause: clause, tagBinds: binds };
}

// ─── buildAutoQuery ──────────────────────────────────────────────────

/**
 * Build a MemoryQueryParams from task DNA keywords and scope paths.
 * Used by Brain lifecycle integration to automatically query relevant
 * context for each task during planning.
 */
export function buildAutoQuery(
  taskKeywords: string[],
  taskScope: string[],
  opts?: { type?: string[]; sprintRange?: number },
): MemoryQueryParams {
  return {
    text: taskKeywords.join(' '),
    type: opts?.type ?? ['adr', 'pattern', 'memory'],
    tags_contain: taskScope.length > 0 ? taskScope : undefined,
    sprint_range: opts?.sprintRange ? { min: opts.sprintRange } : undefined,
    limit: 5,
    mode: 'or',
  };
}
