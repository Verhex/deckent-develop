# Memory V2 DB-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Deckent's flat .md memory system with a SQLite DB-first architecture — FTS5 search, dual-layer i18n normalize, zero parse code at runtime, 97% context reduction.

**Architecture:** SQLite (better-sqlite3) is the single source of truth. All reads go through SQL queries. All writes go through db.insert/upsert. Markdown files become generated exports for git and human review. A MemoryStore class wraps all DB operations. A MemoryQuery builder handles FTS5 dual-layer search.

**Tech Stack:** TypeScript ESM, better-sqlite3 (sync API), FTS5 (full-text search), vitest (tests)

**Spec:** `docs/superpowers/specs/2026-04-16-memory-v2-db-first-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/core/memory-types.ts` | TypeScript interfaces for Memory V2 (MemoryEntry, MemoryQuery, etc.) |
| `src/core/memory-normalize.ts` | turkishNormalize() and locale-aware text normalization |
| `src/core/memory-store.ts` | MemoryStore class: schema init, CRUD, FTS5 triggers, decay, rebuild |
| `src/core/memory-query.ts` | Query builder: dual-layer FTS5 search, scoring, filters |
| `src/core/memory-export.ts` | DB → .md export (summary.md, decisions.md, memory.md, debt.md) |
| `src/core/memory-import.ts` | .md → DB one-time migration (parse existing .brain/ files) |
| `src/cli/commands/recall.ts` | `deckent recall "query"` CLI command |
| `src/cli/commands/remember.ts` | `deckent remember "note"` CLI command |
| `src/mcp/tools/memory-query.ts` | `deckent_memory_query` MCP tool |
| `scripts/migrate-brain-v2.mjs` | One-time migration with 7-step verification |
| `tests/core/memory-normalize.test.ts` | turkishNormalize tests (20+ i18n cases) |
| `tests/core/memory-store.test.ts` | MemoryStore CRUD + FTS5 + decay tests |
| `tests/core/memory-query.test.ts` | Query builder + dual-layer search tests |
| `tests/core/memory-export.test.ts` | Export roundtrip tests |
| `tests/core/memory-import.test.ts` | Migration parsing tests |
| `tests/integration/memory-v2.test.ts` | End-to-end memory lifecycle test |

### Modified Files
| File | Change |
|------|--------|
| `package.json` | Add `better-sqlite3` dependency + `@types/better-sqlite3` devDep |
| `src/core/config-types.ts` | Add `memory` config section to DeckentConfig |
| `src/core/sprint-types.ts` | Keep existing types, add re-exports for backward compat |
| `src/core/constants.ts` | Add MEMORY_DB_FILE constant |
| `src/core/utils.ts` | Deprecate parseDebtTable/generateDebtTable/countBrainLines (keep for migration) |
| `src/orchestra/task-builder.ts` | Replace loadADRContent() → queryRelevantADRs() |
| `src/orchestra/debt-manager.ts` | Replace parseDebtTable/runDecay → db.query/db.softDelete |
| `src/orchestra/sprint-planner.ts` | Replace readContext() file reads → db.query() |
| `src/orchestra/sprint-retro-writer.ts` | Replace writeFileSync → db.upsert() |
| `src/orchestra/sprint-finalizer.ts` | Replace MEMORY/RETRO writes → db.insert/upsert |
| `src/orchestra/sprint-docs-updater.ts` | Replace file writes → db operations |
| `src/monitor/auditor.ts` | Replace DECISIONS.md read → db.query({type:'adr'}) |
| `src/orchestra/authority-enforcer.ts` | Replace DECISIONS.md parse → db.query() |
| `src/mcp/resources/memory.ts` | Replace readFileSync → db.query() |
| `src/mcp/resources/debt.ts` | Replace readFileSync + parseDebtTable → db.query() |
| `src/mcp/resources/retro.ts` | Replace readFileSync → db.query() |
| `src/cli/commands/init.ts` | Update @ reference templates |
| `src/mcp/tools/init.ts` | Update @ reference templates |
| `src/cli/index.ts` | Register recall + remember commands |
| `src/mcp/tools/index.ts` | Register memory-query tool |
| `CLAUDE.md` | `@.brain/MEMORY.md` → `@.brain/exports/summary.md` |
| `DECKENT.md` | `@.brain/DECISIONS.md` → `@.brain/exports/summary.md` |
| `AGENTS.md` | `@.brain/MEMORY.md` → `@.brain/exports/summary.md` |

---

## Task 1: Install better-sqlite3 + Add Constants

**Files:**
- Modify: `package.json:57-61`
- Modify: `src/core/constants.ts:24`
- Modify: `src/core/config-types.ts:156-164`

- [ ] **Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

- [ ] **Step 2: Add MEMORY_DB constant to constants.ts**

Add after line 24 (after `DOCS_CONFIG_FILE`):

```typescript
export const MEMORY_DB_FILE = 'memory.db' as const;
export const MEMORY_EXPORTS_DIR = 'exports' as const;
```

- [ ] **Step 3: Add memory config section to config-types.ts**

Replace the Memory section (lines 156-164) with:

```typescript
  // ─── Memory ─────────────────────────────────────────────────────────
  /** @deprecated Use memory.budget instead. Kept for backward compat. */
  memory_budget?: number;
  /** @deprecated Use memory.decay_after_sprints instead. */
  decay_after_sprints?: number;
  /** Enable pattern detection (default: true) */
  patterns_enabled?: boolean;
  /** Enable PROJECT-IDENTITY.md updates (default: true) */
  project_identity_enabled?: boolean;

  // ─── Memory V2 ─────────────────────────────────────────────────────
  /** Memory V2 configuration. If present, DB-first mode is active. */
  memory?: {
    /** Storage backend (default: 'sqlite') */
    backend?: 'sqlite' | 'json';
    /** Search mode (default: 'fts5') */
    search?: 'fts5' | 'semantic' | 'hybrid';
    /** Semantic search provider (requires search='semantic'|'hybrid') */
    semantic_provider?: 'claude' | 'openai' | 'local' | null;
    /** Soft-delete entries older than N sprints (default: 20) */
    decay_after_sprints?: number;
    /** Export .md snapshots from DB (default: true) */
    export_md?: boolean;
    /** When to trigger export (default: 'sprint_end') */
    export_trigger?: 'sprint_end' | 'every_write' | 'manual';
    /** User-defined entry types beyond built-in ones */
    custom_types?: string[];
    /** i18n keyword aliases for cross-language search */
    keyword_aliases?: Record<string, string[]>;
  };
```

- [ ] **Step 4: Verify build**

```bash
tsc --noEmit
```

Expected: 0 errors (new fields are optional, no consumer changes needed yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/core/constants.ts src/core/config-types.ts
git commit -m "feat(memory-v2): add better-sqlite3 dependency + memory config types"
```

---

## Task 2: memory-normalize.ts — Turkish i18n Normalize

**Files:**
- Create: `src/core/memory-normalize.ts`
- Create: `tests/core/memory-normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/memory-normalize.test.ts
import { describe, it, expect } from 'vitest';
import { turkishNormalize } from '../../src/core/memory-normalize.js';

describe('turkishNormalize', () => {
  it('converts Turkish I to ı then to i', () => {
    expect(turkishNormalize('IŞIK')).toBe('isik');
  });

  it('converts Turkish İ to i', () => {
    expect(turkishNormalize('İstanbul')).toBe('istanbul');
  });

  it('handles all Turkish special chars lowercase', () => {
    expect(turkishNormalize('ığüşöç')).toBe('igusoc');
  });

  it('handles all Turkish special chars uppercase', () => {
    expect(turkishNormalize('IĞÜŞÖÇ')).toBe('igusoc');
  });

  it('normalizes German umlauts', () => {
    expect(turkishNormalize('Lösung über')).toBe('losung uber');
  });

  it('preserves ASCII text unchanged', () => {
    expect(turkishNormalize('docker heartbeat')).toBe('docker heartbeat');
  });

  it('handles mixed case', () => {
    expect(turkishNormalize('Güvenlik Protokolü')).toBe('guvenlik protokolu');
  });

  it('handles empty string', () => {
    expect(turkishNormalize('')).toBe('');
  });

  it('preserves technical terms', () => {
    expect(turkishNormalize('spawnSync')).toBe('spawnsync');
  });

  it('handles Spanish accents', () => {
    expect(turkishNormalize('señor café')).toBe('senor cafe');
  });

  it('handles French accents', () => {
    expect(turkishNormalize('résumé naïve')).toBe('resume naive');
  });

  it('converts ÇÖKME to cokme', () => {
    expect(turkishNormalize('ÇÖKME')).toBe('cokme');
  });

  it('normalizes öğrenci', () => {
    expect(turkishNormalize('öğrenci')).toBe('ogrenci');
  });

  it('normalizes üzüm', () => {
    expect(turkishNormalize('üzüm')).toBe('uzum');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/memory-normalize.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/memory-normalize.ts

/**
 * Normalize text for language-agnostic FTS5 search.
 *
 * SQLite FTS5 unicode61 tokenizer handles most diacritics but fails on
 * Turkish I/İ/ı/i case folding (locale-dependent in Unicode).
 * This function produces a pure ASCII lowercase equivalent that FTS5
 * can match regardless of the user's input locale.
 *
 * Stored in a separate *_norm column alongside the original text.
 * Queries search both columns with OR for 100% recall.
 *
 * Tested: 20/20 pass across TR/EN/DE/ES/FR (see spec Section 4).
 */
export function turkishNormalize(text: string): string {
  if (!text) return '';

  return text
    // Turkish-specific uppercase → lowercase (before generic toLowerCase)
    .replace(/I/g, 'ı')     // Turkish: I is uppercase of ı, not i
    .replace(/İ/g, 'i')     // Turkish: İ is uppercase of i
    .replace(/Ş/g, 'ş')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    // Generic lowercase
    .toLowerCase()
    // NFD decomposition: split base char + combining mark (e.g. é → e + ́)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip combining diacritical marks
    // Turkish chars that survive NFD (ı, ş, ğ don't decompose in NFD)
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/core/memory-normalize.test.ts
```

Expected: 15/15 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/memory-normalize.ts tests/core/memory-normalize.test.ts
git commit -m "feat(memory-v2): turkishNormalize — dual-layer i18n for FTS5 search"
```

---

## Task 3: memory-types.ts — TypeScript Interfaces

**Files:**
- Create: `src/core/memory-types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/core/memory-types.ts

/**
 * Memory V2 type definitions.
 * These types map directly to the SQLite schema in memory-store.ts.
 */

// ─── Entry Types ──────────────────────────────────────────────────

/** Built-in entry types. Custom types are strings beyond this set. */
export type EntryType =
  | 'adr'        // Architecture Decision Record
  | 'memory'     // Sprint learning
  | 'sprint'     // Sprint log
  | 'debt'       // Technical debt item
  | 'pattern'    // Recurring pattern
  | 'retro'      // Retrospective
  | 'error'      // Error record
  | 'identity'   // Project identity (decay exempt)
  | 'custom';    // User-defined type

/** Who created this entry. */
export type EntrySource =
  | 'system'     // Deckent internal state
  | 'brain'      // Brain-generated knowledge
  | 'worker'     // Worker-learned knowledge
  | 'user'       // User direct input (deckent remember)
  | 'import';    // External source (GitHub, Slack)

/** Entry status. Meaning varies by type. */
export type EntryStatus =
  | 'active'
  | 'accepted'     // ADR accepted
  | 'deprecated'   // ADR deprecated
  | 'superseded'   // ADR superseded by another
  | 'proposed'     // ADR proposed
  | 'rejected'     // ADR rejected
  | 'resolved'     // Debt/pattern resolved
  | 'archived';    // Manually archived

/** Relation types between entries. */
export type RelationType =
  | 'references'   // General reference
  | 'supersedes'   // ADR replaces older version
  | 'caused_by'    // Issue caused by event
  | 'resolves'     // Fix resolved issue
  | 'blocks'       // Task blocks another
  | 'depends_on';  // Dependency relationship

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
  type: string;           // EntryType or custom string
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
  metadata: string;       // JSON string
  created_at: string;     // ISO 8601
  updated_at: string;     // ISO 8601
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
  relations?: Array<{ to_id: string; rel_type: RelationType }>;
}

/** A cross-reference between two entries. */
export interface EntryRelation {
  from_id: string;
  to_id: string;
  rel_type: RelationType;
  created_at: string;
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
}

/** A single search result with relevance score. */
export interface MemorySearchResult {
  entry: MemoryEntryV2;
  relevance: number;
  snippet?: string;       // FTS5 snippet with highlights
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
```

- [ ] **Step 2: Verify build**

```bash
tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/memory-types.ts
git commit -m "feat(memory-v2): memory-types.ts — TypeScript interfaces for DB-first memory"
```

---

## Task 4: memory-store.ts — Core DB Layer

**Files:**
- Create: `src/core/memory-store.ts`
- Create: `tests/core/memory-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/memory-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../../src/core/memory-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('MemoryStore', () => {
  let store: MemoryStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-mem-test-'));
    store = new MemoryStore(join(tempDir, 'memory.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('CRUD', () => {
    it('inserts and retrieves an entry', () => {
      store.insert({
        id: 'ADR-001',
        type: 'adr',
        title: 'TypeScript + ESM',
        content: 'Use TypeScript with ESM modules.',
        tags: ['typescript', 'esm'],
        status: 'accepted',
      });

      const entry = store.getById('ADR-001');
      expect(entry).toBeDefined();
      expect(entry!.title).toBe('TypeScript + ESM');
      expect(entry!.type).toBe('adr');
      expect(entry!.status).toBe('accepted');
      expect(entry!.tag_text).toBe('typescript esm');
    });

    it('upserts an existing entry and records history', () => {
      store.insert({
        id: 'ADR-001',
        type: 'adr',
        title: 'Old Title',
        content: 'Old content.',
      });

      store.upsert({
        id: 'ADR-001',
        type: 'adr',
        title: 'New Title',
        content: 'New content.',
      }, 'brain');

      const entry = store.getById('ADR-001');
      expect(entry!.title).toBe('New Title');

      const history = store.getHistory('ADR-001');
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history.some(h => h.field === 'title' && h.old_value === 'Old Title')).toBe(true);
    });

    it('soft-deletes an entry', () => {
      store.insert({ id: 'mem-001', type: 'memory', title: 'T', content: 'C' });
      store.softDelete('mem-001', 'decay');

      const entry = store.getById('mem-001');
      expect(entry).toBeNull(); // default: exclude deleted

      const deleted = store.getById('mem-001', { includeDeleted: true });
      expect(deleted).toBeDefined();
      expect(deleted!.deleted_at).not.toBeNull();
    });

    it('restores a soft-deleted entry', () => {
      store.insert({ id: 'mem-001', type: 'memory', title: 'T', content: 'C' });
      store.softDelete('mem-001', 'decay');
      store.restore('mem-001', 'user');

      const entry = store.getById('mem-001');
      expect(entry).toBeDefined();
      expect(entry!.deleted_at).toBeNull();
    });
  });

  describe('tags', () => {
    it('stores and queries tags', () => {
      store.insert({
        id: 'ADR-006',
        type: 'adr',
        title: 'spawnSync Security',
        content: 'Use spawnSync with args array.',
        tags: ['security', 'spawnSync', 'shell-injection'],
      });

      const tags = store.getTagsForEntry('ADR-006');
      expect(tags).toContain('security');
      expect(tags).toContain('spawnSync');
      expect(tags.length).toBe(3);
    });

    it('finds entries by tag', () => {
      store.insert({ id: 'A', type: 'adr', title: 'T1', content: 'C1', tags: ['security'] });
      store.insert({ id: 'B', type: 'memory', title: 'T2', content: 'C2', tags: ['security', 'docker'] });
      store.insert({ id: 'C', type: 'adr', title: 'T3', content: 'C3', tags: ['docker'] });

      const results = store.getByTags(['security']);
      expect(results.length).toBe(2);
      expect(results.map(r => r.id).sort()).toEqual(['A', 'B']);
    });
  });

  describe('relations', () => {
    it('creates and queries relations', () => {
      store.insert({ id: 'ADR-022-v1', type: 'adr', title: 'V1', content: 'C1' });
      store.insert({ id: 'ADR-022-v2', type: 'adr', title: 'V2', content: 'C2',
        relations: [{ to_id: 'ADR-022-v1', rel_type: 'supersedes' }],
      });

      const rels = store.getRelationsFrom('ADR-022-v2');
      expect(rels.length).toBe(1);
      expect(rels[0]!.to_id).toBe('ADR-022-v1');
      expect(rels[0]!.rel_type).toBe('supersedes');
    });
  });

  describe('decay', () => {
    it('soft-deletes entries older than threshold', () => {
      store.insert({ id: 'old', type: 'memory', title: 'Old', content: 'C', sprint_num: 100 });
      store.insert({ id: 'new', type: 'memory', title: 'New', content: 'C', sprint_num: 139 });
      store.insert({ id: 'exempt', type: 'identity', title: 'ID', content: 'C', sprint_num: 1, decay_exempt: true });

      const result = store.decay(139, 20);
      expect(result.deletedCount).toBe(1); // only 'old' (sprint 100 < 139-20=119)

      expect(store.getById('old')).toBeNull();
      expect(store.getById('new')).toBeDefined();
      expect(store.getById('exempt')).toBeDefined(); // decay_exempt preserved
    });
  });

  describe('counts', () => {
    it('returns counts by type', () => {
      store.insert({ id: 'a1', type: 'adr', title: 'T', content: 'C' });
      store.insert({ id: 'a2', type: 'adr', title: 'T', content: 'C' });
      store.insert({ id: 'm1', type: 'memory', title: 'T', content: 'C' });

      const counts = store.countByType();
      expect(counts.get('adr')).toBe(2);
      expect(counts.get('memory')).toBe(1);
    });
  });

  describe('schema version', () => {
    it('initializes with schema version 1', () => {
      const version = store.getSchemaVersion();
      expect(version).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/memory-store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/memory-store.ts
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { turkishNormalize } from './memory-normalize.js';
import type {
  MemoryEntryV2, CreateEntryInput, EntryRelation,
  EntryHistoryRecord, ChangeType,
} from './memory-types.js';

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entries (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    source       TEXT NOT NULL DEFAULT 'system',
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    summary      TEXT,
    tag_text     TEXT DEFAULT '',
    title_norm   TEXT DEFAULT '',
    content_norm TEXT DEFAULT '',
    summary_norm TEXT DEFAULT '',
    tag_norm     TEXT DEFAULT '',
    status       TEXT DEFAULT 'active',
    priority     TEXT DEFAULT 'normal',
    sprint_id    TEXT,
    sprint_num   INTEGER DEFAULT 0,
    lang         TEXT DEFAULT 'en',
    decay_exempt INTEGER DEFAULT 0,
    metadata     TEXT DEFAULT '{}',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS tags (
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    tag      TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (entry_id, tag)
  );

  CREATE TABLE IF NOT EXISTS relations (
    from_id    TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    to_id      TEXT NOT NULL,
    rel_type   TEXT NOT NULL DEFAULT 'references',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (from_id, to_id, rel_type)
  );

  CREATE TABLE IF NOT EXISTS entry_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id    TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    field       TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    changed_by  TEXT NOT NULL,
    change_type TEXT NOT NULL DEFAULT 'update',
    changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    title, content, summary, tag_text,
    title_norm, content_norm, summary_norm, tag_norm,
    content=entries, content_rowid=rowid,
    tokenize='unicode61 remove_diacritics 2'
  );

  CREATE INDEX IF NOT EXISTS idx_entries_type    ON entries(type);
  CREATE INDEX IF NOT EXISTS idx_entries_source  ON entries(source);
  CREATE INDEX IF NOT EXISTS idx_entries_sprint  ON entries(sprint_num);
  CREATE INDEX IF NOT EXISTS idx_entries_status  ON entries(status);
  CREATE INDEX IF NOT EXISTS idx_entries_active  ON entries(deleted_at) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_entries_decay   ON entries(decay_exempt, sprint_num);
  CREATE INDEX IF NOT EXISTS idx_tags_tag        ON tags(tag);
  CREATE INDEX IF NOT EXISTS idx_relations_to    ON relations(to_id);
  CREATE INDEX IF NOT EXISTS idx_history_entry   ON entry_history(entry_id);
`;

// FTS5 triggers must be created separately (no IF NOT EXISTS for triggers)
const FTS_TRIGGER_SQL = `
  CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, title, content, summary, tag_text,
                            title_norm, content_norm, summary_norm, tag_norm)
    VALUES (new.rowid, new.title, new.content, new.summary, new.tag_text,
            new.title_norm, new.content_norm, new.summary_norm, new.tag_norm);
  END;

  CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, title, content, summary, tag_text,
                            title_norm, content_norm, summary_norm, tag_norm)
    VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.tag_text,
            old.title_norm, old.content_norm, old.summary_norm, old.tag_norm);
  END;

  CREATE TRIGGER IF NOT EXISTS entries_fts_update
  AFTER UPDATE OF title,content,summary,tag_text,title_norm,content_norm,summary_norm,tag_norm
  ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, title, content, summary, tag_text,
                            title_norm, content_norm, summary_norm, tag_norm)
    VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.tag_text,
            old.title_norm, old.content_norm, old.summary_norm, old.tag_norm);
    INSERT INTO entries_fts(rowid, title, content, summary, tag_text,
                            title_norm, content_norm, summary_norm, tag_norm)
    VALUES (new.rowid, new.title, new.content, new.summary, new.tag_text,
            new.title_norm, new.content_norm, new.summary_norm, new.tag_norm);
  END;
`;

export class MemoryStore {
  private db: DatabaseType;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(SCHEMA_SQL);
    // Check if triggers exist before creating (SQLite < 3.35 lacks IF NOT EXISTS for triggers)
    const triggerExists = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='entries_fts_insert'"
    ).get();
    if (!triggerExists) {
      this.db.exec(FTS_TRIGGER_SQL);
    }
    // Seed schema version
    const existing = this.db.prepare('SELECT version FROM schema_version WHERE version = ?').get(SCHEMA_VERSION);
    if (!existing) {
      this.db.prepare('INSERT OR IGNORE INTO schema_version(version) VALUES (?)').run(SCHEMA_VERSION);
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────

  insert(input: CreateEntryInput): void {
    const tagText = (input.tags ?? []).join(' ');
    const now = new Date().toISOString();

    const insertEntry = this.db.prepare(`
      INSERT INTO entries (id, type, source, title, content, summary, tag_text,
                           title_norm, content_norm, summary_norm, tag_norm,
                           status, priority, sprint_id, sprint_num, lang,
                           decay_exempt, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (entry_id, tag) VALUES (?, ?)');
    const insertRel = this.db.prepare('INSERT OR IGNORE INTO relations (from_id, to_id, rel_type) VALUES (?, ?, ?)');
    const insertHist = this.db.prepare(
      `INSERT INTO entry_history (entry_id, field, new_value, changed_by, change_type) VALUES (?, ?, ?, ?, ?)`
    );

    const transaction = this.db.transaction(() => {
      insertEntry.run(
        input.id, input.type, input.source ?? 'system',
        input.title, input.content, input.summary ?? null, tagText,
        turkishNormalize(input.title), turkishNormalize(input.content),
        turkishNormalize(input.summary ?? ''), turkishNormalize(tagText),
        input.status ?? 'active', input.priority ?? 'normal',
        input.sprint_id ?? null, input.sprint_num ?? 0, input.lang ?? 'en',
        input.decay_exempt ? 1 : 0,
        JSON.stringify(input.metadata ?? {}), now, now,
      );

      for (const tag of input.tags ?? []) {
        insertTag.run(input.id, tag);
      }

      for (const rel of input.relations ?? []) {
        insertRel.run(input.id, rel.to_id, rel.rel_type);
      }

      insertHist.run(input.id, 'content', input.content, input.source ?? 'system', 'create');
    });

    transaction();
  }

  upsert(input: CreateEntryInput, changedBy: string): void {
    const existing = this.getById(input.id, { includeDeleted: true });
    if (!existing) {
      this.insert(input);
      return;
    }

    const tagText = (input.tags ?? []).join(' ');
    const now = new Date().toISOString();

    const updateEntry = this.db.prepare(`
      UPDATE entries SET type=?, source=?, title=?, content=?, summary=?, tag_text=?,
                         title_norm=?, content_norm=?, summary_norm=?, tag_norm=?,
                         status=?, priority=?, sprint_id=?, sprint_num=?, lang=?,
                         decay_exempt=?, metadata=?, updated_at=?, deleted_at=NULL
      WHERE id=?
    `);

    const deleteOldTags = this.db.prepare('DELETE FROM tags WHERE entry_id=?');
    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (entry_id, tag) VALUES (?, ?)');
    const insertHist = this.db.prepare(
      `INSERT INTO entry_history (entry_id, field, old_value, new_value, changed_by, change_type) VALUES (?, ?, ?, ?, ?, ?)`
    );

    const transaction = this.db.transaction(() => {
      // Record changed fields in history
      if (existing.title !== input.title) {
        insertHist.run(input.id, 'title', existing.title, input.title, changedBy, 'update');
      }
      if (existing.content !== input.content) {
        insertHist.run(input.id, 'content', existing.content, input.content, changedBy, 'update');
      }
      if (existing.status !== (input.status ?? 'active')) {
        insertHist.run(input.id, 'status', existing.status, input.status ?? 'active', changedBy, 'update');
      }

      updateEntry.run(
        input.type, input.source ?? existing.source, input.title, input.content,
        input.summary ?? null, tagText,
        turkishNormalize(input.title), turkishNormalize(input.content),
        turkishNormalize(input.summary ?? ''), turkishNormalize(tagText),
        input.status ?? 'active', input.priority ?? 'normal',
        input.sprint_id ?? null, input.sprint_num ?? 0, input.lang ?? 'en',
        input.decay_exempt ? 1 : 0, JSON.stringify(input.metadata ?? {}), now,
        input.id,
      );

      deleteOldTags.run(input.id);
      for (const tag of input.tags ?? []) {
        insertTag.run(input.id, tag);
      }
    });

    transaction();
  }

  getById(id: string, opts?: { includeDeleted?: boolean }): MemoryEntryV2 | null {
    const sql = opts?.includeDeleted
      ? 'SELECT * FROM entries WHERE id = ?'
      : 'SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL';
    const row = this.db.prepare(sql).get(id) as MemoryEntryV2 | undefined;
    return row ? { ...row, decay_exempt: Boolean(row.decay_exempt) } : null;
  }

  getByType(type: string): MemoryEntryV2[] {
    return this.db.prepare(
      'SELECT * FROM entries WHERE type = ? AND deleted_at IS NULL ORDER BY sprint_num DESC'
    ).all(type) as MemoryEntryV2[];
  }

  // ─── Tags ────────────────────────────────────────────────────

  getTagsForEntry(entryId: string): string[] {
    const rows = this.db.prepare('SELECT tag FROM tags WHERE entry_id = ?').all(entryId) as Array<{ tag: string }>;
    return rows.map(r => r.tag);
  }

  getByTags(tags: string[]): MemoryEntryV2[] {
    const placeholders = tags.map(() => '?').join(',');
    return this.db.prepare(`
      SELECT DISTINCT e.* FROM entries e
      JOIN tags t ON e.id = t.entry_id
      WHERE t.tag IN (${placeholders})
        AND e.deleted_at IS NULL
      ORDER BY e.sprint_num DESC
    `).all(...tags) as MemoryEntryV2[];
  }

  // ─── Relations ───────────────────────────────────────────────

  getRelationsFrom(entryId: string): EntryRelation[] {
    return this.db.prepare(
      'SELECT * FROM relations WHERE from_id = ?'
    ).all(entryId) as EntryRelation[];
  }

  getRelationsTo(entryId: string): EntryRelation[] {
    return this.db.prepare(
      'SELECT * FROM relations WHERE to_id = ?'
    ).all(entryId) as EntryRelation[];
  }

  // ─── History ─────────────────────────────────────────────────

  getHistory(entryId: string): EntryHistoryRecord[] {
    return this.db.prepare(
      'SELECT * FROM entry_history WHERE entry_id = ? ORDER BY changed_at DESC'
    ).all(entryId) as EntryHistoryRecord[];
  }

  // ─── Soft Delete / Restore ───────────────────────────────────

  softDelete(id: string, changedBy: string): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    this.db.prepare(
      `INSERT INTO entry_history (entry_id, field, new_value, changed_by, change_type) VALUES (?, ?, ?, ?, ?)`
    ).run(id, 'deleted_at', now, changedBy, 'soft_delete');
  }

  restore(id: string, changedBy: string): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE entries SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now, id);
    this.db.prepare(
      `INSERT INTO entry_history (entry_id, field, old_value, changed_by, change_type) VALUES (?, ?, ?, ?, ?)`
    ).run(id, 'deleted_at', now, changedBy, 'restore');
  }

  // ─── Decay ───────────────────────────────────────────────────

  decay(currentSprintNum: number, decayAfterSprints: number): { deletedCount: number } {
    const threshold = currentSprintNum - decayAfterSprints;
    const now = new Date().toISOString();

    const result = this.db.prepare(`
      UPDATE entries SET deleted_at = ?, updated_at = ?
      WHERE sprint_num < ? AND sprint_num > 0
        AND decay_exempt = 0
        AND deleted_at IS NULL
    `).run(now, now, threshold);

    return { deletedCount: result.changes };
  }

  // ─── Counts ──────────────────────────────────────────────────

  countByType(): Map<string, number> {
    const rows = this.db.prepare(
      'SELECT type, COUNT(*) as count FROM entries WHERE deleted_at IS NULL GROUP BY type'
    ).all() as Array<{ type: string; count: number }>;
    return new Map(rows.map(r => [r.type, r.count]));
  }

  totalCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM entries WHERE deleted_at IS NULL').get() as { count: number };
    return row.count;
  }

  // ─── Schema ──────────────────────────────────────────────────

  getSchemaVersion(): number {
    const row = this.db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number } | undefined;
    return row?.v ?? 0;
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  /** Expose raw DB for advanced queries (memory-query.ts uses this). */
  getRawDb(): DatabaseType {
    return this.db;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/core/memory-store.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/memory-store.ts tests/core/memory-store.test.ts
git commit -m "feat(memory-v2): MemoryStore — SQLite DB layer with CRUD, tags, relations, decay, history"
```

---

## Task 5: memory-query.ts — FTS5 Dual-Layer Search

**Files:**
- Create: `src/core/memory-query.ts`
- Create: `tests/core/memory-query.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/memory-query.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../../src/core/memory-store.js';
import { searchMemory } from '../../src/core/memory-query.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('searchMemory', () => {
  let store: MemoryStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-query-test-'));
    store = new MemoryStore(join(tempDir, 'memory.db'));

    // Seed test data
    store.insert({ id: 'ADR-006', type: 'adr', title: 'spawnSync Security Pattern',
      content: 'All shell commands use spawnSync with args array. No shell interpretation.',
      tags: ['security', 'spawnSync', 'shell-injection'], status: 'accepted' });

    store.insert({ id: 'ADR-008', type: 'adr', title: 'Brain Merkezi Import Kurali',
      content: 'Brain projede diger modulleri import eden TEK moduldur.',
      tags: ['brain', 'import', 'circular'], status: 'accepted', lang: 'tr' });

    store.insert({ id: 'mem-139-001', type: 'memory', title: 'Docker HB Core Fix',
      content: 'atomicWriteFileSync ile SIGTERM fsync handler eklendi.',
      tags: ['docker', 'heartbeat', 'atomicWrite'], sprint_id: 'sprint-139', sprint_num: 139 });

    store.insert({ id: 'mem-138-001', type: 'memory', title: 'ADR Governance Integration',
      content: 'MADR v3 hibrit format, worker prompt injection, validator script.',
      tags: ['adr', 'governance'], sprint_id: 'sprint-138', sprint_num: 138 });

    store.insert({ id: 'debt-001', type: 'debt', title: 'MCP disconnect fix',
      content: 'deckent_start fire-and-forget runSprint Promise event loop bloke ediyor.',
      tags: ['mcp', 'disconnect'], status: 'active', sprint_num: 140 });
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds entries by FTS query', () => {
    const results = searchMemory(store, { text: 'docker heartbeat' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.entry.id).toBe('mem-139-001');
  });

  it('handles Turkish chars: güvenlik finds no false positives', () => {
    const results = searchMemory(store, { text: 'güvenlik' });
    // No entry about güvenlik in test data
    expect(results.length).toBe(0);
  });

  it('Turkish normalize: brain import finds ADR-008', () => {
    const results = searchMemory(store, { text: 'brain import' });
    expect(results.some(r => r.entry.id === 'ADR-008')).toBe(true);
  });

  it('filters by type', () => {
    const results = searchMemory(store, { text: 'spawnSync', type: ['adr'] });
    expect(results.every(r => r.entry.type === 'adr')).toBe(true);
  });

  it('filters by status', () => {
    const results = searchMemory(store, { text: 'spawnSync', status: ['accepted'] });
    expect(results.every(r => r.entry.status === 'accepted')).toBe(true);
  });

  it('filters by sprint range', () => {
    const results = searchMemory(store, { type: ['memory'], sprint_range: { min: 139 } });
    expect(results.every(r => r.entry.sprint_num >= 139)).toBe(true);
  });

  it('limits results', () => {
    const results = searchMemory(store, { text: 'import OR docker OR spawnSync', limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns snippets with highlights', () => {
    const results = searchMemory(store, { text: 'spawnSync' });
    expect(results[0]!.snippet).toBeDefined();
  });

  it('searches across all types without filters', () => {
    const results = searchMemory(store, { text: 'sprint' });
    const types = new Set(results.map(r => r.entry.type));
    expect(types.size).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for non-matching query', () => {
    const results = searchMemory(store, { text: 'xyznonexistent' });
    expect(results.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/memory-query.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/memory-query.ts
import type { MemoryStore } from './memory-store.js';
import { turkishNormalize } from './memory-normalize.js';
import type { MemoryQueryParams, MemorySearchResult, MemoryEntryV2 } from './memory-types.js';

/**
 * Escape special FTS5 characters in user query to prevent syntax errors.
 * FTS5 special chars: " * ( ) : ^
 */
function escapeFTS(query: string): string {
  // Wrap each token in double quotes to treat as literal
  return query
    .replace(/"/g, '""')
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => {
      // Allow wildcard * at end of tokens
      if (t.endsWith('*')) return t;
      // Allow OR/AND/NOT operators
      if (t === 'OR' || t === 'AND' || t === 'NOT') return t;
      return `"${t}"`;
    })
    .join(' ');
}

/**
 * Search memory using dual-layer FTS5 (original + normalized).
 * Combines full-text search with structured filters (type, status, sprint range).
 */
export function searchMemory(store: MemoryStore, params: MemoryQueryParams): MemorySearchResult[] {
  const db = store.getRawDb();
  const sqlParts: string[] = [];
  const sqlParams: unknown[] = [];

  if (params.text) {
    const escaped = escapeFTS(params.text);
    const norm = escapeFTS(turkishNormalize(params.text));

    // Dual-layer: search both original and normalized columns
    const ftsQuery = `{title content summary tag_text}: (${escaped}) OR {title_norm content_norm summary_norm tag_norm}: (${norm})`;

    sqlParts.push(`
      SELECT e.*, rank as relevance,
             snippet(entries_fts, 1, '>>>', '<<<', '...', 20) as snippet
      FROM entries e
      JOIN entries_fts ON entries_fts.rowid = e.rowid
      WHERE entries_fts MATCH ?
    `);
    sqlParams.push(ftsQuery);
  } else {
    // No text query — structured filter only
    sqlParts.push('SELECT e.*, 0 as relevance, NULL as snippet FROM entries e WHERE 1=1');
  }

  // Shared filters
  if (!params.include_deleted) {
    sqlParts.push('AND e.deleted_at IS NULL');
  }

  if (params.type?.length) {
    sqlParts.push(`AND e.type IN (${params.type.map(() => '?').join(',')})`);
    sqlParams.push(...params.type);
  }

  if (params.source?.length) {
    sqlParts.push(`AND e.source IN (${params.source.map(() => '?').join(',')})`);
    sqlParams.push(...params.source);
  }

  if (params.status?.length) {
    sqlParts.push(`AND e.status IN (${params.status.map(() => '?').join(',')})`);
    sqlParams.push(...params.status);
  }

  if (params.sprint_range?.min !== undefined) {
    sqlParts.push('AND e.sprint_num >= ?');
    sqlParams.push(params.sprint_range.min);
  }

  if (params.sprint_range?.max !== undefined) {
    sqlParts.push('AND e.sprint_num <= ?');
    sqlParams.push(params.sprint_range.max);
  }

  if (params.decay_exempt !== undefined) {
    sqlParts.push('AND e.decay_exempt = ?');
    sqlParams.push(params.decay_exempt ? 1 : 0);
  }

  if (params.tags_contain?.length) {
    // Entries must have ALL specified tags
    sqlParts.push(`AND e.id IN (
      SELECT entry_id FROM tags WHERE tag IN (${params.tags_contain.map(() => '?').join(',')})
      GROUP BY entry_id HAVING COUNT(DISTINCT tag) = ?
    )`);
    sqlParams.push(...params.tags_contain, params.tags_contain.length);
  }

  // Ordering
  if (params.text) {
    sqlParts.push('ORDER BY rank');
  } else {
    sqlParts.push('ORDER BY e.sprint_num DESC, e.updated_at DESC');
  }

  sqlParts.push('LIMIT ?');
  sqlParams.push(params.limit ?? 10);

  const sql = sqlParts.join('\n');

  try {
    const rows = db.prepare(sql).all(...sqlParams) as Array<MemoryEntryV2 & { relevance: number; snippet: string | null }>;

    return rows.map(row => ({
      entry: {
        ...row,
        decay_exempt: Boolean(row.decay_exempt),
        relevance: undefined,
        snippet: undefined,
      } as MemoryEntryV2,
      relevance: row.relevance,
      snippet: row.snippet ?? undefined,
    }));
  } catch {
    // FTS5 query syntax error — return empty rather than crash
    return [];
  }
}

/**
 * Build an auto-query from task DNA for Brain lifecycle integration.
 * Used during PLAN, SPAWN, EVALUATE phases.
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
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/core/memory-query.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/memory-query.ts tests/core/memory-query.test.ts
git commit -m "feat(memory-v2): searchMemory — dual-layer FTS5 query builder with i18n"
```

---

## Task 6: memory-export.ts — DB to .md Snapshots

**Files:**
- Create: `src/core/memory-export.ts`
- Create: `tests/core/memory-export.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/memory-export.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../../src/core/memory-store.js';
import { exportSummaryMd, exportDecisionsMd, exportMemoryMd, exportDebtMd } from '../../src/core/memory-export.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('memory-export', () => {
  let store: MemoryStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-export-test-'));
    store = new MemoryStore(join(tempDir, 'memory.db'));

    store.insert({ id: 'ADR-001', type: 'adr', title: 'TypeScript ESM',
      content: 'Use TypeScript with ESM.', status: 'accepted', summary: 'ESM as module system' });
    store.insert({ id: 'ADR-002', type: 'adr', title: 'Node16 Resolution',
      content: 'Use Node16 module resolution.', status: 'accepted', summary: 'Explicit .js imports' });
    store.insert({ id: 'mem-139-001', type: 'memory', title: 'Docker Fix',
      content: 'Fixed Docker HB.', sprint_id: 'sprint-139', sprint_num: 139 });
    store.insert({ id: 'debt-001', type: 'debt', title: 'MCP disconnect',
      content: 'Event loop blocking.', status: 'active', priority: 'critical' });
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('exports summary.md with all active entry summaries', () => {
    const md = exportSummaryMd(store);
    expect(md).toContain('ADR-001');
    expect(md).toContain('TypeScript ESM');
    expect(md).toContain('accepted');
    expect(md).toContain('Docker Fix');
    expect(md).toContain('MCP disconnect');
  });

  it('summary.md is under 5000 chars', () => {
    const md = exportSummaryMd(store);
    expect(md.length).toBeLessThan(5000);
  });

  it('exports decisions.md with ADR entries', () => {
    const md = exportDecisionsMd(store);
    expect(md).toContain('## ADR-001: TypeScript ESM');
    expect(md).toContain('**Status:** accepted');
    expect(md).toContain('Use TypeScript with ESM.');
  });

  it('exports memory.md with sprint learnings', () => {
    const md = exportMemoryMd(store);
    expect(md).toContain('## Sprint sprint-139');
    expect(md).toContain('Docker Fix');
  });

  it('exports debt.md with active debt items', () => {
    const md = exportDebtMd(store);
    expect(md).toContain('MCP disconnect');
    expect(md).toContain('critical');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/memory-export.test.ts
```

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/memory-export.ts
import type { MemoryStore } from './memory-store.js';
import type { MemoryEntryV2 } from './memory-types.js';

/**
 * Export summary.md — compact context file for @ reference loading.
 * This replaces the old @.brain/DECISIONS.md and @.brain/MEMORY.md references.
 * Target: < 5000 chars.
 */
export function exportSummaryMd(store: MemoryStore): string {
  const lines: string[] = ['# Brain Summary (auto-generated)', ''];

  // ADRs — one-liner each
  const adrs = store.getByType('adr').filter(e => e.status === 'accepted' || e.status === 'active');
  if (adrs.length > 0) {
    lines.push('## Active Architecture Decisions', '');
    lines.push('| ID | Title | Status |', '|-----|-------|--------|');
    for (const adr of adrs) {
      lines.push(`| ${adr.id} | ${adr.title} | ${adr.status} |`);
    }
    lines.push('');
  }

  // Recent memory — last 3 sprints
  const memories = store.getByType('memory').slice(0, 10);
  if (memories.length > 0) {
    lines.push('## Recent Learnings', '');
    for (const mem of memories) {
      const sprint = mem.sprint_id ? ` (${mem.sprint_id})` : '';
      const summary = mem.summary ?? mem.title;
      lines.push(`- **${mem.title}**${sprint}: ${summary}`);
    }
    lines.push('');
  }

  // Active debt
  const debts = store.getByType('debt').filter(e => e.status === 'active' || e.status === 'open');
  if (debts.length > 0) {
    lines.push('## Active Technical Debt', '');
    for (const d of debts) {
      lines.push(`- [${d.priority?.toUpperCase()}] ${d.title}`);
    }
    lines.push('');
  }

  // Active patterns
  const patterns = store.getByType('pattern').filter(e => e.status === 'active');
  if (patterns.length > 0) {
    lines.push('## Active Patterns', '');
    for (const p of patterns) {
      lines.push(`- ${p.title}`);
    }
    lines.push('');
  }

  lines.push(`_Total entries: ${store.totalCount()} | Generated: ${new Date().toISOString().slice(0, 10)}_`);

  return lines.join('\n');
}

/**
 * Export decisions.md — full ADR content for git/human review.
 */
export function exportDecisionsMd(store: MemoryStore): string {
  const lines: string[] = ['# Architecture Decision Records (auto-generated)', ''];
  const adrs = store.getByType('adr');

  for (const adr of adrs) {
    lines.push(`## ${adr.id}: ${adr.title}`, '');
    lines.push(`**Status:** ${adr.status}`, '');
    lines.push(adr.content, '');
    lines.push('---', '');
  }

  return lines.join('\n');
}

/**
 * Export memory.md — sprint learnings grouped by sprint.
 */
export function exportMemoryMd(store: MemoryStore): string {
  const lines: string[] = ['# Sprint Learnings (auto-generated)', ''];
  const memories = store.getByType('memory');

  // Group by sprint
  const bySprintMap = new Map<string, MemoryEntryV2[]>();
  for (const mem of memories) {
    const key = mem.sprint_id ?? 'unknown';
    const list = bySprintMap.get(key) ?? [];
    list.push(mem);
    bySprintMap.set(key, list);
  }

  for (const [sprintId, entries] of bySprintMap) {
    lines.push(`## Sprint ${sprintId} Learnings`);
    for (const entry of entries) {
      lines.push(`- ${entry.title}: ${entry.summary ?? entry.content.slice(0, 200)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Export debt.md — active debt items as markdown table.
 */
export function exportDebtMd(store: MemoryStore): string {
  const lines: string[] = ['# Technical Debt (auto-generated)', ''];
  const debts = store.getByType('debt');
  const active = debts.filter(d => d.status !== 'resolved');
  const resolved = debts.filter(d => d.status === 'resolved');

  if (active.length > 0) {
    lines.push('## Active Debt', '');
    lines.push('| ID | Title | Priority | Sprint | Status |');
    lines.push('|----|-------|----------|--------|--------|');
    for (const d of active) {
      lines.push(`| ${d.id} | ${d.title} | ${d.priority} | ${d.sprint_id ?? '-'} | ${d.status} |`);
    }
    lines.push('');
  }

  if (resolved.length > 0) {
    lines.push('## Resolved Debt', '');
    lines.push('| ID | Title | Resolved In |');
    lines.push('|----|-------|------------|');
    for (const d of resolved) {
      const meta = JSON.parse(d.metadata || '{}');
      lines.push(`| ${d.id} | ${d.title} | ${meta.resolvedInSprintId ?? '-'} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/core/memory-export.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/memory-export.ts tests/core/memory-export.test.ts
git commit -m "feat(memory-v2): memory-export — DB to .md snapshot generation"
```

---

## Task 7: memory-import.ts — .md to DB Migration

**Files:**
- Create: `src/core/memory-import.ts`
- Create: `tests/core/memory-import.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/memory-import.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../../src/core/memory-store.js';
import { parseDecisionsMd, parseMemoryMd, parseDebtMd } from '../../src/core/memory-import.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('memory-import', () => {
  let store: MemoryStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-import-test-'));
    store = new MemoryStore(join(tempDir, 'memory.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('parseDecisionsMd', () => {
    it('parses ADRs from DECISIONS.md format', () => {
      const md = `# Architecture Decision Records

## ADR-001: TypeScript + ESM

**Status:** accepted

**Decision:** Use TypeScript with ESM.
**Context:** Modern standard.
**Consequence:** All imports use .js extensions.

## ADR-005: Synchronous I/O

**Status:** deprecated

> **Note:** Sprint 132 deprecated this.

**Decision:** Wave 2 modules use sync I/O.
`;

      const entries = parseDecisionsMd(md);
      expect(entries.length).toBe(2);

      expect(entries[0]!.id).toBe('ADR-001');
      expect(entries[0]!.title).toBe('TypeScript + ESM');
      expect(entries[0]!.status).toBe('accepted');
      expect(entries[0]!.content).toContain('Use TypeScript with ESM');

      expect(entries[1]!.id).toBe('ADR-005');
      expect(entries[1]!.status).toBe('deprecated');
    });
  });

  describe('parseMemoryMd', () => {
    it('parses sprint sections from MEMORY.md format', () => {
      const md = `## Sprint sprint-139 Learnings
- Docker HB Core Fix: atomicWriteFileSync + SIGTERM fsync handler
- Chain Dependency: Kahn's algorithm topological

## Sprint sprint-138 Learnings
- ADR Governance: MADR v3 hibrit format
`;

      const entries = parseMemoryMd(md);
      expect(entries.length).toBe(2);
      expect(entries[0]!.sprint_id).toBe('sprint-139');
      expect(entries[0]!.sprint_num).toBe(139);
      expect(entries[0]!.content).toContain('Docker HB Core Fix');
      expect(entries[1]!.sprint_num).toBe(138);
    });
  });

  describe('parseDebtMd', () => {
    it('parses debt table from DEBT.md format', () => {
      const md = `# Technical Debt

| ID | Description | OriginTaskId | OriginSprintId | Priority | SprintsOpen | Resolved | ResolvedInSprintId | CreatedAt |
|----|-------------|------|--------|----------|------|----------|----------|---------|
| D-001 | MCP disconnect | T-140-001 | sprint-140 | CRITICAL | 1 | false | - | 2026-04-15 |
| D-002 | Old debt | T-130-005 | sprint-130 | NORMAL | 10 | true | sprint-139 | 2026-03-01 |
`;

      const entries = parseDebtMd(md);
      expect(entries.length).toBe(2);
      expect(entries[0]!.id).toBe('D-001');
      expect(entries[0]!.title).toBe('MCP disconnect');
      expect(entries[0]!.priority).toBe('critical');
      expect(entries[0]!.status).toBe('active');
      expect(entries[1]!.status).toBe('resolved');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/memory-import.test.ts
```

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/memory-import.ts
import type { CreateEntryInput } from './memory-types.js';

/**
 * Parse DECISIONS.md into ADR entries.
 * Format: ## ADR-NNN: Title\n**Status:** status\n\ncontent...
 */
export function parseDecisionsMd(content: string): CreateEntryInput[] {
  const entries: CreateEntryInput[] = [];
  const adrRegex = /^## (ADR-\d+):\s*(.+)$/gm;
  const sections: Array<{ id: string; title: string; startIdx: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = adrRegex.exec(content)) !== null) {
    sections.push({ id: match[1]!, title: match[2]!.trim(), startIdx: match.index });
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const endIdx = i + 1 < sections.length ? sections[i + 1]!.startIdx : content.length;
    const body = content.slice(section.startIdx, endIdx).trim();

    // Extract status
    const statusMatch = body.match(/\*\*Status:\*\*\s*(\w+)/i);
    const status = statusMatch?.[1]?.toLowerCase() ?? 'accepted';

    // Content = everything after the header line
    const headerEnd = body.indexOf('\n');
    const bodyContent = headerEnd >= 0 ? body.slice(headerEnd + 1).trim() : '';

    // Extract keywords from title + content for tags
    const keywords = extractKeywords(section.title + ' ' + bodyContent);

    entries.push({
      id: section.id,
      type: 'adr',
      title: section.title,
      content: bodyContent,
      status,
      tags: keywords,
      decay_exempt: status === 'accepted',
    });
  }

  return entries;
}

/**
 * Parse MEMORY.md into sprint memory entries.
 * Format: ## Sprint sprint-NNN Learnings\n- item1\n- item2
 */
export function parseMemoryMd(content: string): CreateEntryInput[] {
  const entries: CreateEntryInput[] = [];
  const sectionRegex = /^## Sprint (?:sprint-)?(\d+)\s+\w+/gm;
  const sections: Array<{ sprintNum: number; startIdx: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(content)) !== null) {
    sections.push({ sprintNum: parseInt(match[1]!, 10), startIdx: match.index });
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const endIdx = i + 1 < sections.length ? sections[i + 1]!.startIdx : content.length;
    const body = content.slice(section.startIdx, endIdx).trim();

    const headerEnd = body.indexOf('\n');
    const bodyContent = headerEnd >= 0 ? body.slice(headerEnd + 1).trim() : '';

    if (bodyContent.length === 0) continue;

    const sprintId = `sprint-${section.sprintNum}`;
    entries.push({
      id: `mem-${section.sprintNum}`,
      type: 'memory',
      title: `Sprint ${section.sprintNum} Learnings`,
      content: bodyContent,
      sprint_id: sprintId,
      sprint_num: section.sprintNum,
      tags: extractKeywords(bodyContent),
    });
  }

  return entries;
}

/**
 * Parse DEBT.md into debt entries.
 * Format: pipe-delimited markdown table.
 */
export function parseDebtMd(content: string): CreateEntryInput[] {
  const entries: CreateEntryInput[] = [];
  const lines = content.split('\n');
  let headerFound = false;

  for (const line of lines) {
    if (line.includes('| ID |')) { headerFound = true; continue; }
    if (!headerFound) continue;
    if (line.startsWith('|---') || line.startsWith('| ---')) continue;
    if (!line.startsWith('|')) continue;

    const cols = line.split('|').slice(1, -1).map(c => c.trim());
    if (cols.length < 9) continue;

    const resolved = cols[6] === 'true';
    entries.push({
      id: cols[0]!,
      type: 'debt',
      title: cols[1]!,
      content: `Origin: ${cols[2]} (${cols[3]}). Priority: ${cols[4]}. Open: ${cols[5]} sprints.`,
      status: resolved ? 'resolved' : 'active',
      priority: (cols[4] ?? 'NORMAL').toLowerCase(),
      sprint_id: cols[3] || undefined,
      sprint_num: parseInt((cols[3] ?? '').replace(/\D/g, ''), 10) || 0,
      tags: extractKeywords(cols[1]!),
      metadata: {
        originTaskId: cols[2],
        originSprintId: cols[3],
        sprintsOpen: parseInt(cols[5] ?? '0', 10),
        resolvedInSprintId: cols[7] === '-' ? undefined : cols[7],
        createdAt: cols[8],
      },
    });
  }

  return entries;
}

/**
 * Extract meaningful keywords from text for tagging.
 * Simple heuristic: words > 3 chars, lowercase, no common stop words.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'been', 'will',
    'not', 'are', 'but', 'all', 'can', 'was', 'use', 'used', 'using', 'each',
    'bir', 'ile', 'olan', 'icin', 'olan', 'daha', 'gibi', 'veya',
  ]);

  return [...new Set(
    text.toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
      .slice(0, 15),
  )];
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/core/memory-import.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/memory-import.ts tests/core/memory-import.test.ts
git commit -m "feat(memory-v2): memory-import — parse existing .brain/ .md files into DB entries"
```

---

## Task 8: Integration Test — Full Memory Lifecycle

**Files:**
- Create: `tests/integration/memory-v2.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// tests/integration/memory-v2.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../../src/core/memory-store.js';
import { searchMemory } from '../../src/core/memory-query.js';
import { exportSummaryMd, exportDecisionsMd } from '../../src/core/memory-export.js';
import { parseDecisionsMd } from '../../src/core/memory-import.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Memory V2 Integration', () => {
  let store: MemoryStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-integ-'));
    store = new MemoryStore(join(tempDir, 'memory.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('full lifecycle: insert → search → export → reimport → verify', () => {
    // 1. Insert entries
    store.insert({ id: 'ADR-001', type: 'adr', title: 'TypeScript ESM',
      content: 'Use TypeScript with ESM modules for Node.js.',
      tags: ['typescript', 'esm', 'node'], status: 'accepted', decay_exempt: true });

    store.insert({ id: 'ADR-008', type: 'adr', title: 'Brain Merkezi Import',
      content: 'Brain diğer modülleri import eden TEK modüldür. Döngüsel import yasak.',
      tags: ['brain', 'import', 'circular'], status: 'accepted', lang: 'tr', decay_exempt: true });

    store.insert({ id: 'mem-139-001', type: 'memory', title: 'Docker HB Fix',
      content: 'atomicWriteFileSync + SIGTERM fsync handler + 15s grace period eklendi.',
      tags: ['docker', 'heartbeat'], sprint_id: 'sprint-139', sprint_num: 139 });

    // 2. Search
    const dockerResults = searchMemory(store, { text: 'docker heartbeat' });
    expect(dockerResults.length).toBe(1);
    expect(dockerResults[0]!.entry.id).toBe('mem-139-001');

    const adrResults = searchMemory(store, { text: 'import', type: ['adr'], status: ['accepted'] });
    expect(adrResults.some(r => r.entry.id === 'ADR-008')).toBe(true);

    // 3. Export
    const summaryMd = exportSummaryMd(store);
    expect(summaryMd).toContain('ADR-001');
    expect(summaryMd).toContain('ADR-008');
    expect(summaryMd.length).toBeLessThan(5000);

    const decisionsMd = exportDecisionsMd(store);
    expect(decisionsMd).toContain('TypeScript ESM');

    // 4. Reimport into fresh DB
    const store2 = new MemoryStore(join(tempDir, 'memory2.db'));
    const reimported = parseDecisionsMd(decisionsMd);
    for (const entry of reimported) {
      store2.insert(entry);
    }

    // 5. Verify roundtrip
    const counts1 = store.countByType();
    const reimportedAdrs = store2.getByType('adr');
    expect(reimportedAdrs.length).toBe(counts1.get('adr'));

    store2.close();
  });

  it('Turkish i18n: IŞIK and ışık both find the same entry', () => {
    store.insert({ id: 'test-1', type: 'memory', title: 'IŞIK Sensörü Hatası',
      content: 'Işık sensörü ışık seviyesi düşük olunca tetikleniyor.',
      tags: ['isik', 'sensor'], lang: 'tr' });

    const r1 = searchMemory(store, { text: 'ışık' });
    const r2 = searchMemory(store, { text: 'IŞIK' });
    const r3 = searchMemory(store, { text: 'isik' });

    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
    expect(r3.length).toBeGreaterThan(0);
    expect(r1[0]!.entry.id).toBe('test-1');
    expect(r2[0]!.entry.id).toBe('test-1');
    expect(r3[0]!.entry.id).toBe('test-1');
  });

  it('decay preserves exempt entries', () => {
    store.insert({ id: 'permanent', type: 'identity', title: 'Project ID',
      content: 'Deckent v0.4', sprint_num: 1, decay_exempt: true });
    store.insert({ id: 'old-learning', type: 'memory', title: 'Old Learning',
      content: 'Something from sprint 100.', sprint_num: 100 });
    store.insert({ id: 'recent', type: 'memory', title: 'Recent',
      content: 'Sprint 139 learning.', sprint_num: 139 });

    const result = store.decay(139, 20);
    expect(result.deletedCount).toBe(1);
    expect(store.getById('permanent')).toBeDefined();
    expect(store.getById('recent')).toBeDefined();
    expect(store.getById('old-learning')).toBeNull();
  });

  it('upsert records history', () => {
    store.insert({ id: 'ADR-001', type: 'adr', title: 'V1', content: 'Old.' });
    store.upsert({ id: 'ADR-001', type: 'adr', title: 'V2', content: 'New.' }, 'user');

    const entry = store.getById('ADR-001');
    expect(entry!.title).toBe('V2');

    const history = store.getHistory('ADR-001');
    expect(history.some(h => h.field === 'title' && h.old_value === 'V1' && h.new_value === 'V2')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/integration/memory-v2.test.ts
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/memory-v2.test.ts
git commit -m "test(memory-v2): integration test — full lifecycle + i18n + decay + roundtrip"
```

---

## Task 9: Refactor task-builder.ts — loadADRContent → queryRelevantADRs

**Files:**
- Modify: `src/orchestra/task-builder.ts:697-784`

- [ ] **Step 1: Add memory-store import and new function**

At the top of `task-builder.ts`, add import:

```typescript
import { MemoryStore } from '../core/memory-store.js';
import { searchMemory } from '../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';
```

- [ ] **Step 2: Add queryRelevantADRs function after loadADRContent**

```typescript
/**
 * Query relevant ADRs from Memory V2 DB for worker prompt injection.
 * Returns only ADRs matching the task's scope and keywords.
 * Falls back to loadADRContent() if DB doesn't exist.
 */
export function queryRelevantADRs(taskDescription: string, taskScope: string[], projectRoot?: string): string {
  const root = projectRoot ?? process.cwd();
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

  try {
    // Check if Memory V2 DB exists
    const { existsSync } = require('node:fs');
    if (!existsSync(dbPath)) {
      return loadADRContent(root); // fallback to V1
    }

    const store = new MemoryStore(dbPath);
    try {
      const keywords = taskDescription.split(/\s+/).filter(w => w.length > 3).slice(0, 10);
      const scopeKeywords = taskScope.map(s => s.replace(/\//g, ' ')).join(' ');
      const query = [...keywords, ...scopeKeywords.split(/\s+/)].filter(w => w.length > 2).join(' ');

      const results = searchMemory(store, {
        text: query || '*',
        type: ['adr'],
        status: ['accepted'],
        limit: 5,
      });

      if (results.length === 0) {
        return loadADRContent(root); // fallback if no results
      }

      return results.map(r => `## ${r.entry.id}: ${r.entry.title}\n\n${r.entry.content}`).join('\n\n---\n\n');
    } finally {
      store.close();
    }
  } catch {
    return loadADRContent(root); // fallback on any error
  }
}
```

- [ ] **Step 3: Update the prompt building to use queryRelevantADRs**

In `buildWorkerPrompt()`, change lines around 781-783:

```typescript
  // ADR context injection: query relevant ADRs from Memory V2 (falls back to V1)
  const taskKeywords = task.description ?? task.title ?? '';
  const taskDirs = task.scope?.directories ?? [];
  const adrContent = queryRelevantADRs(taskKeywords, taskDirs);
  const adrBlock = adrContent
    ? `=== Mandatory Architecture Rules (ADR) ===\nAll accepted ADRs below are mandatory constraints. Violating an accepted ADR requires a NO_GO result + ADR amendment proposal.\n\n${adrContent}\n\n`
    : '';
```

- [ ] **Step 4: Verify build and existing tests**

```bash
tsc --noEmit && npx vitest run tests/orchestra/task-builder.test.ts
```

Expected: Build passes, existing tests pass (fallback path covers V1 behavior).

- [ ] **Step 5: Commit**

```bash
git add src/orchestra/task-builder.ts
git commit -m "refactor(memory-v2): task-builder uses queryRelevantADRs with V1 fallback"
```

---

## Task 10: CLI recall + remember Commands

**Files:**
- Create: `src/cli/commands/recall.ts`
- Create: `src/cli/commands/remember.ts`
- Modify: `src/cli/index.ts` (register commands)

- [ ] **Step 1: Create recall command**

```typescript
// src/cli/commands/recall.ts
import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import { searchMemory } from '../../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';

export function registerRecall(program: Command): void {
  program
    .command('recall <query>')
    .description('Search project memory — ADRs, sprint learnings, patterns, debt')
    .option('-t, --type <types>', 'Filter by type (comma-separated: adr,memory,sprint,debt,pattern)', '')
    .option('-n, --limit <n>', 'Max results', '5')
    .option('--sprint-min <n>', 'Minimum sprint number')
    .action((query: string, opts) => {
      const root = resolveProjectRoot();
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError('Memory V2 DB not found. Run `deckent memory migrate` first.');
        return;
      }

      const store = new MemoryStore(dbPath);
      try {
        const types = opts.type ? opts.type.split(',').filter(Boolean) : undefined;
        const results = searchMemory(store, {
          text: query,
          type: types,
          limit: parseInt(opts.limit, 10) || 5,
          sprint_range: opts.sprintMin ? { min: parseInt(opts.sprintMin, 10) } : undefined,
        });

        if (results.length === 0) {
          print(`No results for "${query}".`);
          return;
        }

        print(`\n  ${results.length} result(s) for "${query}":\n`);
        for (let i = 0; i < results.length; i++) {
          const r = results[i]!;
          const sprint = r.entry.sprint_id ? ` (${r.entry.sprint_id})` : '';
          print(`  ${i + 1}. [${r.entry.type}] ${r.entry.title}${sprint}`);
          if (r.snippet) print(`     ${r.snippet.replace(/>>>/g, '\x1b[1m').replace(/<<</g, '\x1b[0m')}`);
          if (r.entry.summary) print(`     ${r.entry.summary}`);
          print('');
        }
      } finally {
        store.close();
      }
    });
}
```

- [ ] **Step 2: Create remember command**

```typescript
// src/cli/commands/remember.ts
import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';

export function registerRemember(program: Command): void {
  program
    .command('remember <note>')
    .description('Store a note in project memory')
    .option('-t, --type <type>', 'Entry type (default: memory)', 'memory')
    .option('--tags <tags>', 'Comma-separated tags', '')
    .option('--title <title>', 'Entry title (default: first 60 chars of note)')
    .action((note: string, opts) => {
      const root = resolveProjectRoot();
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError('Memory V2 DB not found. Run `deckent memory migrate` first.');
        return;
      }

      const store = new MemoryStore(dbPath);
      try {
        const id = `user-${Date.now()}`;
        const title = opts.title || note.slice(0, 60) + (note.length > 60 ? '...' : '');
        const tags = opts.tags ? opts.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

        store.insert({
          id,
          type: opts.type,
          source: 'user',
          title,
          content: note,
          tags,
        });

        print(`  Stored: [${opts.type}] ${title}`);
        if (tags.length > 0) print(`  Tags: ${tags.join(', ')}`);
      } finally {
        store.close();
      }
    });
}
```

- [ ] **Step 3: Register commands in src/cli/index.ts**

Add imports and register calls alongside existing command registrations:

```typescript
import { registerRecall } from './commands/recall.js';
import { registerRemember } from './commands/remember.js';

// ... inside the function where commands are registered:
registerRecall(program);
registerRemember(program);
```

- [ ] **Step 4: Verify build**

```bash
tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/recall.ts src/cli/commands/remember.ts src/cli/index.ts
git commit -m "feat(memory-v2): deckent recall + deckent remember CLI commands"
```

---

## Task 11: MCP deckent_memory_query Tool

**Files:**
- Create: `src/mcp/tools/memory-query.ts`
- Modify: `src/mcp/tools/index.ts` (register tool)

- [ ] **Step 1: Create MCP tool**

```typescript
// src/mcp/tools/memory-query.ts
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import { searchMemory } from '../../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerMemoryQueryTool(server: McpServer): void {
  server.tool(
    'deckent_memory_query',
    'Search project memory — ADRs, sprint learnings, patterns, technical debt. Use when you need context about past decisions or how something was done.',
    {
      query: z.string().describe('Search query text'),
      type: z.array(z.string()).optional().describe('Filter by type: adr, memory, sprint, debt, pattern, retro'),
      status: z.array(z.string()).optional().describe('Filter by status: active, accepted, deprecated, resolved'),
      limit: z.number().optional().default(5).describe('Max results (default 5)'),
      sprint_min: z.number().optional().describe('Minimum sprint number'),
      root: z.string().optional().describe('Project root path'),
    },
    async (params) => {
      const root = params.root || process.cwd();
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        return { content: [{ type: 'text' as const, text: 'Memory V2 DB not found. Run migration first.' }] };
      }

      const store = new MemoryStore(dbPath);
      try {
        const results = searchMemory(store, {
          text: params.query,
          type: params.type,
          status: params.status,
          limit: params.limit,
          sprint_range: params.sprint_min ? { min: params.sprint_min } : undefined,
        });

        if (results.length === 0) {
          return { content: [{ type: 'text' as const, text: `No results for "${params.query}".` }] };
        }

        const text = results.map((r, i) => {
          const sprint = r.entry.sprint_id ? ` (${r.entry.sprint_id})` : '';
          return `${i + 1}. [${r.entry.type}] **${r.entry.title}**${sprint}\n   ${r.entry.summary ?? r.entry.content.slice(0, 200)}`;
        }).join('\n\n');

        return { content: [{ type: 'text' as const, text }] };
      } finally {
        store.close();
      }
    },
  );
}
```

- [ ] **Step 2: Register in tools/index.ts**

Add alongside existing tool registrations:

```typescript
import { registerMemoryQueryTool } from './memory-query.js';

// ... inside registerTools function:
registerMemoryQueryTool(server);
```

- [ ] **Step 3: Verify build**

```bash
tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/memory-query.ts src/mcp/tools/index.ts
git commit -m "feat(memory-v2): deckent_memory_query MCP tool for cross-source memory search"
```

---

## Task 12: Migration Script + @ Reference Swap

**Files:**
- Create: `scripts/migrate-brain-v2.mjs`

- [ ] **Step 1: Write migration script**

```javascript
#!/usr/bin/env node
// scripts/migrate-brain-v2.mjs
// One-time migration: .brain/*.md → .brain/memory.db
// Follows spec Section 10: 7-step verified migration

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.argv[2] || process.cwd();
const brainDir = join(root, '.brain');
const dbPath = join(brainDir, 'memory.db');
const archiveDir = join(brainDir, 'archive', 'pre-v2');
const exportsDir = join(brainDir, 'exports');

if (!existsSync(brainDir)) {
  console.error('ERROR: .brain/ directory not found. Run deckent init first.');
  process.exit(1);
}

if (existsSync(dbPath)) {
  console.log('memory.db already exists. To re-migrate, delete it first.');
  process.exit(0);
}

console.log('═══ Deckent Memory V2 Migration ═══\n');

// STEP 1: INVENTORY
console.log('Step 1: Inventory...');
const manifest = { files: {}, counts: {}, hashes: {}, refs: [] };

const mdFiles = ['DECISIONS.md', 'MEMORY.md', 'DEBT.md', 'PATTERNS.md', 'RETRO.md', 'PROJECT-IDENTITY.md'];
for (const file of mdFiles) {
  const filePath = join(brainDir, file);
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf-8');
    manifest.files[file] = { lines: content.split('\n').length, bytes: content.length };
    manifest.hashes[file] = createHash('sha256').update(content).digest('hex');
  }
}

// Count ADRs
const decisionsContent = existsSync(join(brainDir, 'DECISIONS.md'))
  ? readFileSync(join(brainDir, 'DECISIONS.md'), 'utf-8') : '';
manifest.counts.adrs = (decisionsContent.match(/^## ADR-\d+/gm) || []).length;

// Count memory sections
const memoryContent = existsSync(join(brainDir, 'MEMORY.md'))
  ? readFileSync(join(brainDir, 'MEMORY.md'), 'utf-8') : '';
manifest.counts.memorySections = (memoryContent.match(/^## Sprint/gm) || []).length;

console.log(`  ADRs: ${manifest.counts.adrs}, Memory sections: ${manifest.counts.memorySections}`);
console.log(`  Files: ${Object.keys(manifest.files).length}`);

// STEP 2: BACKUP
console.log('\nStep 2: Backup...');
mkdirSync(archiveDir, { recursive: true });
for (const file of mdFiles) {
  const src = join(brainDir, file);
  if (existsSync(src)) {
    copyFileSync(src, join(archiveDir, file));
  }
}
mkdirSync(exportsDir, { recursive: true });
writeFileSync(join(archiveDir, 'migration-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`  Backed up to ${archiveDir}`);

// STEP 3: PARSE + INSERT
console.log('\nStep 3: Parse + Insert...');

// Dynamic import for ESM compatibility
const { MemoryStore } = await import(join(root, 'dist/core/memory-store.js'));
const { parseDecisionsMd, parseMemoryMd, parseDebtMd } = await import(join(root, 'dist/core/memory-import.js'));

const store = new MemoryStore(dbPath);

let insertCount = 0;

// ADRs
if (decisionsContent) {
  const adrs = parseDecisionsMd(decisionsContent);
  for (const adr of adrs) { store.insert(adr); insertCount++; }
  console.log(`  ADRs: ${adrs.length} inserted`);
}

// Memory
if (memoryContent) {
  const memories = parseMemoryMd(memoryContent);
  for (const mem of memories) { store.insert(mem); insertCount++; }
  console.log(`  Memory sections: ${memories.length} inserted`);
}

// Debt
const debtPath = join(brainDir, 'DEBT.md');
if (existsSync(debtPath)) {
  const debtContent = readFileSync(debtPath, 'utf-8');
  const debts = parseDebtMd(debtContent);
  for (const d of debts) { store.insert(d); insertCount++; }
  console.log(`  Debt items: ${debts.length} inserted`);
}

// Retro
const retroPath = join(brainDir, 'RETRO.md');
if (existsSync(retroPath)) {
  const retroContent = readFileSync(retroPath, 'utf-8');
  store.insert({ id: 'retro-latest', type: 'retro', title: 'Latest Retrospective',
    content: retroContent, source: 'brain' });
  insertCount++;
  console.log('  Retro: 1 inserted');
}

// Project Identity
const idPath = join(brainDir, 'PROJECT-IDENTITY.md');
if (existsSync(idPath)) {
  const idContent = readFileSync(idPath, 'utf-8');
  store.insert({ id: 'project-identity', type: 'identity', title: 'Project Identity',
    content: idContent, source: 'system', decay_exempt: true });
  insertCount++;
  console.log('  Project Identity: 1 inserted (decay_exempt)');
}

// Sprint logs
const sprintsDir = join(brainDir, 'sprints');
if (existsSync(sprintsDir)) {
  const sprintFiles = readdirSync(sprintsDir).filter(f => f.endsWith('.md'));
  for (const file of sprintFiles) {
    const content = readFileSync(join(sprintsDir, file), 'utf-8');
    const numMatch = file.match(/(\d+)/);
    const sprintNum = numMatch ? parseInt(numMatch[1], 10) : 0;
    store.insert({ id: `sprint-log-${sprintNum}`, type: 'sprint', title: `Sprint ${sprintNum} Log`,
      content, sprint_id: `sprint-${sprintNum}`, sprint_num: sprintNum, source: 'brain' });
    insertCount++;
  }
  console.log(`  Sprint logs: ${sprintFiles.length} inserted`);
}

console.log(`  Total: ${insertCount} entries`);

// STEP 4: VERIFICATION GATE
console.log('\nStep 4: Verification gate...');
let gatePass = true;

// Count check
const dbAdrCount = store.getByType('adr').length;
if (dbAdrCount !== manifest.counts.adrs) {
  console.error(`  FAIL: ADR count mismatch. Expected ${manifest.counts.adrs}, got ${dbAdrCount}`);
  gatePass = false;
} else {
  console.log(`  ADR count: ${dbAdrCount}/${manifest.counts.adrs}`);
}

// Sample verification (check 3 random ADRs if available)
const allAdrs = store.getByType('adr');
const sample = allAdrs.slice(0, Math.min(3, allAdrs.length));
for (const adr of sample) {
  if (!adr.content || adr.content.length < 10) {
    console.error(`  FAIL: ADR ${adr.id} has empty/short content (${adr.content?.length ?? 0} chars)`);
    gatePass = false;
  }
}
if (sample.length > 0) console.log(`  Sample check: ${sample.length} ADRs verified`);

// FTS5 smoke test
const { searchMemory } = await import(join(root, 'dist/core/memory-query.js'));
const smokeResults = searchMemory(store, { text: 'TypeScript', type: ['adr'], limit: 3 });
if (smokeResults.length === 0) {
  console.error('  FAIL: FTS5 smoke test returned 0 results for "TypeScript"');
  gatePass = false;
} else {
  console.log(`  FTS5 smoke: ${smokeResults.length} results for "TypeScript"`);
}

if (!gatePass) {
  console.error('\n  VERIFICATION FAILED. Migration aborted. DB kept for inspection.');
  store.close();
  process.exit(1);
}
console.log('  All checks PASSED.');

// STEP 5: EXPORT
console.log('\nStep 5: Export...');
const { exportSummaryMd, exportDecisionsMd, exportMemoryMd, exportDebtMd } = await import(join(root, 'dist/core/memory-export.js'));

writeFileSync(join(exportsDir, 'summary.md'), exportSummaryMd(store));
writeFileSync(join(exportsDir, 'decisions.md'), exportDecisionsMd(store));
writeFileSync(join(exportsDir, 'memory.md'), exportMemoryMd(store));
writeFileSync(join(exportsDir, 'debt.md'), exportDebtMd(store));
console.log(`  Exported 4 .md files to ${exportsDir}`);

// STEP 6: REFERENCE SWAP
console.log('\nStep 6: Reference swap...');
const refFiles = [
  { path: join(root, 'CLAUDE.md'),    from: '@.brain/MEMORY.md',     to: '@.brain/exports/summary.md' },
  { path: join(root, 'DECKENT.md'),   from: '@.brain/DECISIONS.md',  to: '@.brain/exports/summary.md' },
  { path: join(root, 'DECKENT.md'),   from: '@.brain/MEMORY.md',     to: '@.brain/exports/summary.md' },
  { path: join(root, 'AGENTS.md'),    from: '@.brain/MEMORY.md',     to: '@.brain/exports/summary.md' },
];

for (const ref of refFiles) {
  if (existsSync(ref.path)) {
    let content = readFileSync(ref.path, 'utf-8');
    if (content.includes(ref.from)) {
      content = content.replace(ref.from, ref.to);
      writeFileSync(ref.path, content);
      console.log(`  ${ref.path}: ${ref.from} → ${ref.to}`);
    }
  }
}

// STEP 7: FINAL REPORT
store.close();
console.log('\n═══ Migration Complete ═══');
console.log(`  Entries migrated: ${insertCount}`);
console.log(`  DB path: ${dbPath}`);
console.log(`  Exports: ${exportsDir}`);
console.log(`  Backup: ${archiveDir}`);
console.log(`  Original .md files preserved in ${archiveDir}`);
console.log('\nNext: run `tsc --noEmit && npx vitest run` to verify.');
```

- [ ] **Step 2: Make executable and verify**

```bash
chmod +x scripts/migrate-brain-v2.mjs
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-brain-v2.mjs
git commit -m "feat(memory-v2): migration script with 7-step verification + reference swap"
```

---

## Task 13: Verify Everything — Full Test Suite

- [ ] **Step 1: Build**

```bash
tsc
```

- [ ] **Step 2: Run all Memory V2 tests**

```bash
npx vitest run tests/core/memory-normalize.test.ts tests/core/memory-store.test.ts tests/core/memory-query.test.ts tests/core/memory-export.test.ts tests/core/memory-import.test.ts tests/integration/memory-v2.test.ts
```

Expected: All PASS.

- [ ] **Step 3: Run full test suite (regression check)**

```bash
npx vitest run
```

Expected: No regressions — existing 12,485 tests still pass.

- [ ] **Step 4: Run migration dry-run on actual project**

```bash
node scripts/migrate-brain-v2.mjs /home/alperen/deckent-dev
```

Expected: 7 steps complete, verification gate passes, exports generated.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(memory-v2): complete Memory V2 foundation — DB-first with FTS5 search

Memory V2 replaces flat .md file parsing with SQLite DB-first architecture:
- MemoryStore: CRUD, tags, relations, history, decay (memory-store.ts)
- FTS5 dual-layer search with Turkish i18n normalize (memory-query.ts)
- DB → .md export for git snapshots (memory-export.ts)
- .md → DB migration with 7-step verification (memory-import.ts)
- CLI: deckent recall + deckent remember
- MCP: deckent_memory_query tool
- 97% context loading reduction (104K → 6.5K chars)

ADR-010 amended: better-sqlite3 added as runtime dependency.
Existing .brain/*.md files preserved in archive/pre-v2/."
```

---

## Summary

| Task | Description | New LoC | Files |
|------|------------|---------|-------|
| 1 | Install better-sqlite3 + config types | ~40 | 3 modified |
| 2 | turkishNormalize (i18n) | ~30 impl + ~60 test | 2 new |
| 3 | memory-types.ts interfaces | ~140 | 1 new |
| 4 | MemoryStore (core DB layer) | ~300 impl + ~120 test | 2 new |
| 5 | searchMemory (FTS5 query) | ~120 impl + ~90 test | 2 new |
| 6 | memory-export (DB → .md) | ~120 impl + ~50 test | 2 new |
| 7 | memory-import (.md → DB) | ~150 impl + ~80 test | 2 new |
| 8 | Integration test | ~100 test | 1 new |
| 9 | task-builder refactor | ~40 changed | 1 modified |
| 10 | CLI recall + remember | ~120 | 3 new |
| 11 | MCP memory_query tool | ~70 | 2 modified |
| 12 | Migration script | ~200 | 1 new |
| 13 | Verification | 0 | 0 |
| **Total** | | **~1830** | **19 new, 6 modified** |
