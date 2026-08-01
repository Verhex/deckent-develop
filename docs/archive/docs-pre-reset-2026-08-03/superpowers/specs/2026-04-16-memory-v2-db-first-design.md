# Deckent Memory V2 — DB-First Architecture Design

**Date:** 2026-04-16
**Author:** Alperen + CC (collaborative brainstorming)
**Status:** APPROVED (brainstorming complete, ready for implementation plan)
**Scope:** Core memory infrastructure rewrite — affects 32 source files, ~1400 LoC net

---

## 1. Problem Statement

Deckent's memory system (`.brain/`) was designed in Sprint 1 as flat markdown files parsed with regex. After 139+ sprints, this approach has hit fundamental limits:

| Problem | Impact | Evidence |
|---------|--------|----------|
| DECISIONS.md = 96K chars loaded into every conversation | Context window bloat, 5-minute prompt cache misses | `@.brain/DECISIONS.md` in DECKENT.md |
| DIRECTIVES.md = 457K chars loaded | Same conversation gets ~550K chars of stale data | Sprint 140's 409 tasks still loaded |
| Regex-based parsing is fragile | smartTrimMemory(), parseDebtTable(), loadADRContent() — all use regex/split/line-counting | 480 LoC of parse code across 32 files |
| No query capability | "How did we fix the Docker bug?" → load everything, hope for the best | No search, no retrieval, no cross-reference |
| Decay = information loss | smartTrimMemory() deletes old sprint detail lines | Sprint learnings permanently lost after 20 sprints |
| Line-based budget doesn't work for ADRs | DECISIONS.md at 1505 lines (over 1200 limit) but ADRs can't be deleted | decay_exempt doesn't solve the context loading problem |

### Competitive Analysis

| System | Storage | Retrieval | "How did we do X?" | Offline |
|--------|---------|-----------|-------------------|---------|
| Devin | Cloud DB | Trigger + macro | Yes (Knowledge items) | No |
| OpenHands | In-memory | Event condenser | No (session-scoped) | Yes |
| Aider | Git repo | Graph-ranked repo-map | No (code-only) | Yes |
| claude-mem | SQLite + ChromaDB | 3-layer FTS + vector | Partial (conversation history) | Yes |
| MemPalace | ChromaDB + SQLite | Hybrid 98.4% accuracy | Partial (verbatim only) | Yes |
| OpenClaw | JSONL files | Compaction + pruning | No (session-scoped) | Yes |
| **Deckent current** | .md files | Bulk loading (no search) | No (context bloat) | Yes |
| **Deckent V2** | SQLite + FTS5 | Cross-source query | **Yes (unified search)** | **Yes** |

No competitor offers cross-source project orchestration memory (ADR + sprint + debt + pattern unified search). This is Deckent's unique value proposition.

---

## 2. Design Principles

### P1: DB = Source of Truth, .md = Export

```
OLD:  .md files → parse → knowledge (fragile, regex-based)
NEW:  knowledge → SQLite DB → .md export (structured, SQL-based)
```

All knowledge lives in SQLite. Markdown files are generated snapshots for git diff, PR review, and human readability. They are NEVER parsed at runtime.

### P2: Lazy Retrieval, Never Bulk Load

No file is loaded wholesale into context. Every read goes through a query that returns only relevant entries. Brain automatically queries memory during sprint lifecycle based on Task DNA.

### P3: Dual Memory Layers (System + Project)

- **System Memory** (source='system'|'brain'|'worker'): Deckent internal state — agent performance, routing decisions, sprint metrics. Automatically written by Brain/Worker.
- **Project Memory** (source='user'|'import'): User's project knowledge — decisions, notes, external imports. Written by user (`deckent remember`) or imported from external sources.

Both layers share the same DB, same FTS5 index. Brain queries return results from both layers.

### P4: Offline-First, Online-Optional (Tiered)

- **Tier 0** (always): SQLite FTS5, zero internet, full functionality
- **Tier 1** (config): Semantic search via embedding API (LanceDB)
- **Tier 2** (config): External source import (GitHub issues, Slack)
- **Tier 3** (future): Cloud sync for multi-machine

### P5: Dual-Layer Normalize for i18n

FTS5 `unicode61 remove_diacritics 2` alone fails on Turkish I/İ/ı/i edge cases (tested: 73% pass rate). Solution: store both original text AND `turkishNormalize()` ASCII equivalent. Query searches both layers with OR. **Tested: 100% pass rate across TR/EN/DE.**

### P6: Evolutionary Migration

Current .md write points change API (writeFileSync → db.insert). Current .md read points change API (readFileSync/parse → db.query). A one-time migration script imports existing .brain/ content into the DB. .md exports maintain git history continuity.

---

## 3. SQLite Schema (V1)

```sql
-- ═══════════════════════════════════════════════════
-- Deckent Memory V2 — DB-First Schema V1
-- ═══════════════════════════════════════════════════

-- Schema version tracking (safe migrations)
CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO schema_version(version) VALUES (1);

-- ═══ MAIN ENTRY TABLE ═══
CREATE TABLE entries (
  id           TEXT PRIMARY KEY,        -- "ADR-008", "mem-139-001", "debt-003"

  -- IDENTITY
  type         TEXT NOT NULL,           -- 'adr','memory','sprint','debt',
                                        --  'pattern','retro','error',
                                        --  'identity','custom'
  source       TEXT NOT NULL            -- 'system'  : Deckent internal state
               DEFAULT 'system',        -- 'brain'   : Brain-generated knowledge
                                        -- 'worker'  : Worker-learned knowledge
                                        -- 'user'    : User direct input
                                        -- 'import'  : External source (GitHub, Slack)

  -- CONTENT (original)
  title        TEXT NOT NULL,           -- "Brain Merkezi Import Kurali"
  content      TEXT NOT NULL,           -- Full markdown body
  summary      TEXT,                    -- 1-2 sentence summary (auto or manual)
  tag_text     TEXT DEFAULT '',         -- Denormalized: "docker heartbeat fix"

  -- CONTENT (normalized for i18n search)
  title_norm   TEXT DEFAULT '',         -- turkishNormalize(title)
  content_norm TEXT DEFAULT '',         -- turkishNormalize(content)
  summary_norm TEXT DEFAULT '',         -- turkishNormalize(summary)
  tag_norm     TEXT DEFAULT '',         -- turkishNormalize(tag_text)

  -- STATE
  status       TEXT DEFAULT 'active',   -- ADR: accepted/deprecated/superseded
                                        -- Debt: open/resolved
                                        -- Pattern: active/resolved
                                        -- General: active/archived
  priority     TEXT DEFAULT 'normal',   -- critical/high/normal/low

  -- TIME + SPRINT
  sprint_id    TEXT,                    -- "sprint-139"
  sprint_num   INTEGER DEFAULT 0,       -- 139 (fast range queries)
  lang         TEXT DEFAULT 'en',       -- i18n: 'en','tr','de','es'...

  -- LIFECYCLE
  decay_exempt BOOLEAN DEFAULT 0,       -- 1 = permanent (identity, critical ADR)
  metadata     TEXT DEFAULT '{}',       -- JSON: type-specific extra data
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT                     -- soft delete (NULL = active)
);

-- ═══ TAG TABLE (normalized) ═══
CREATE TABLE tags (
  entry_id  TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (entry_id, tag)
);

-- ═══ CROSS-REFERENCE TABLE ═══
CREATE TABLE relations (
  from_id    TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL,
  rel_type   TEXT NOT NULL DEFAULT 'references',
               -- 'references'  : general reference
               -- 'supersedes'  : ADR replaces older version
               -- 'caused_by'   : this issue was caused by that event
               -- 'resolves'    : this fix resolved that issue
               -- 'blocks'      : this task blocks that one
               -- 'depends_on'  : dependency relationship
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_id, to_id, rel_type)
);

-- ═══ CHANGE HISTORY ═══
CREATE TABLE entry_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id    TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  field       TEXT NOT NULL,            -- 'content','status','title'...
  old_value   TEXT,
  new_value   TEXT,
  changed_by  TEXT NOT NULL,            -- 'brain','worker-001','user','decay'
  change_type TEXT NOT NULL             -- 'create','update','soft_delete',
               DEFAULT 'update',        --  'restore','decay'
  changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══ FTS5 FULL-TEXT SEARCH (8 columns: 4 original + 4 normalized) ═══
CREATE VIRTUAL TABLE entries_fts USING fts5(
  title, content, summary, tag_text,
  title_norm, content_norm, summary_norm, tag_norm,
  content=entries, content_rowid=rowid,
  tokenize='unicode61 remove_diacritics 2'
);

-- FTS5 sync triggers
CREATE TRIGGER entries_fts_insert AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, title, content, summary, tag_text,
                          title_norm, content_norm, summary_norm, tag_norm)
  VALUES (new.rowid, new.title, new.content, new.summary, new.tag_text,
          new.title_norm, new.content_norm, new.summary_norm, new.tag_norm);
END;

CREATE TRIGGER entries_fts_delete AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, title, content, summary, tag_text,
                          title_norm, content_norm, summary_norm, tag_norm)
  VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.tag_text,
          old.title_norm, old.content_norm, old.summary_norm, old.tag_norm);
END;

CREATE TRIGGER entries_fts_update
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

-- ═══ PERFORMANCE INDEXES ═══
CREATE INDEX idx_entries_type       ON entries(type);
CREATE INDEX idx_entries_source     ON entries(source);
CREATE INDEX idx_entries_sprint     ON entries(sprint_num);
CREATE INDEX idx_entries_status     ON entries(status);
CREATE INDEX idx_entries_active     ON entries(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_entries_decay      ON entries(decay_exempt, sprint_num);
CREATE INDEX idx_tags_tag           ON tags(tag);
CREATE INDEX idx_relations_to       ON relations(to_id);
CREATE INDEX idx_history_entry      ON entry_history(entry_id);
```

---

## 4. i18n Solution: Dual-Layer Normalize

### The Problem

SQLite FTS5 `unicode61 remove_diacritics 2` handles most languages but fails on Turkish-specific case folding:

```
Unicode standard:  I → i  (English)
Turkish locale:    I → ı  (Turkish)    ← SQLite doesn't know this
Turkish locale:    İ → i  (Turkish)    ← Works (diacritik removal)
```

### The Solution

Every text field stored twice: original + ASCII-normalized.

```typescript
function turkishNormalize(text: string): string {
  return text
    .replace(/I/g, 'ı')     // Turkish: I → ı (not i)
    .replace(/İ/g, 'i')     // Turkish: İ → i
    .replace(/Ş/g, 'ş').replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü').replace(/Ö/g, 'ö').replace(/Ç/g, 'ç')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
}
```

### Search Strategy

Query searches both layers with OR:
```sql
WHERE entries_fts MATCH
  '{title content summary tag_text}: userQuery
   OR {title_norm content_norm summary_norm tag_norm}: normalizedQuery'
```

### Test Results (live tested with better-sqlite3)

| Query | Single Layer (unicode61 only) | Dual Layer (+ normalize) |
|-------|------------------------------|--------------------------|
| "güvenlik" | Pass | Pass |
| "GÜVENLIK" | Pass | Pass |
| "ışık" | Pass | Pass |
| "isik" (ASCII) | **FAIL** | Pass |
| "IŞIK" (Turkish I) | **FAIL** | Pass |
| "ığüşöç" | Pass* | Pass |
| "IĞÜŞÖÇ" | **FAIL** | Pass |
| "IGUSOC" (ASCII) | **FAIL** | Pass |
| "İstanbul" | Pass | Pass |
| Cross-language OR | Pass | Pass |
| **Total** | **73%** | **100%** |

---

## 5. Brain Auto-Query — 6 Lifecycle Integration Points

Brain automatically queries memory during sprint lifecycle. No manual search needed.

### 5.1 PLAN Phase — "Was this scope problematic before?"

```sql
SELECT e.id, e.title, e.summary, e.sprint_num
FROM entries e
JOIN tags t ON e.id = t.entry_id
WHERE e.type IN ('pattern','memory')
  AND e.status = 'active'
  AND e.deleted_at IS NULL
  AND t.tag IN (/* task.scope.directories */)
ORDER BY e.sprint_num DESC LIMIT 5;
```

**Action:** Brain adds warning to worker prompt, escalates model to opus if needed.

### 5.2 Worker Prompt Build — "Which ADRs apply to this task?"

```sql
SELECT e.id, e.title, e.content
FROM entries e
JOIN entries_fts ON entries_fts.rowid = e.rowid
WHERE entries_fts MATCH '{title content tag_text}: taskKeywords
                         OR {title_norm content_norm tag_norm}: taskKeywordsNorm'
  AND e.type = 'adr'
  AND e.status = 'accepted'
  AND e.deleted_at IS NULL
ORDER BY rank LIMIT 5;
```

**Action:** Only relevant 2-3 ADRs injected into worker prompt (vs all 39 today).

### 5.3 SPAWN Phase — "Is this agent successful with this task type?"

```sql
SELECT e.title, e.summary, e.sprint_num
FROM entries e
JOIN tags t ON e.id = t.entry_id
WHERE e.type = 'memory'
  AND e.source IN ('system','brain')
  AND t.tag = /* agent.id */
  AND e.sprint_num > /* current - 5 */
  AND e.deleted_at IS NULL;
```

**Action:** Brain considers alternative agent if success rate is low.

### 5.4 EVALUATE Phase — "Has this error occurred before?"

```sql
SELECT e.id, e.title, e.summary, e.sprint_num,
       r.to_id as resolution_ref
FROM entries e
LEFT JOIN relations r ON e.id = r.from_id AND r.rel_type = 'resolves'
JOIN entries_fts ON entries_fts.rowid = e.rowid
WHERE entries_fts MATCH /* error signature */
  AND e.type IN ('memory','pattern','error')
  AND e.deleted_at IS NULL
ORDER BY e.sprint_num DESC LIMIT 3;
```

**Action:** Brain suggests known fix in FIX phase.

### 5.5 RETRO Phase — "Is this a recurring pattern?"

```sql
SELECT e.title, e.summary
FROM entries e
WHERE e.type = 'retro'
  AND e.sprint_num > /* current - 3 */
  AND e.deleted_at IS NULL;
```

**Action:** Brain records pattern if same topic appears in 3+ retros.

### 5.6 User Conversation — "How did we do X?"

```sql
SELECT e.id, e.type, e.title, e.summary, e.sprint_id,
       snippet(entries_fts, 1, '>>>', '<<<', '...', 20) as context,
       rank as relevance
FROM entries e
JOIN entries_fts ON entries_fts.rowid = e.rowid
WHERE entries_fts MATCH /* user query with dual-layer */
  AND e.deleted_at IS NULL
ORDER BY rank LIMIT 5;
```

**Action:** Results returned via MCP tool or CLI.

---

## 6. Architecture

### Module Structure

```
src/core/
├── memory-store.ts       (~400 LoC)  DB schema, CRUD, FTS5, decay, rebuild
├── memory-types.ts       (~100 LoC)  TypeScript interfaces
├── memory-query.ts       (~150 LoC)  Query builder, dual-layer search, scoring
├── memory-normalize.ts   (~60 LoC)   turkishNormalize + future locale support
├── memory-export.ts      (~150 LoC)  DB → .md snapshot generation
└── memory-import.ts      (~200 LoC)  .md → DB migration (one-time + recovery)

src/mcp/tools/
└── memory-query.ts       (~80 LoC)   deckent_memory_query MCP tool

src/cli/commands/
├── recall.ts             (~60 LoC)   deckent recall "query"
└── remember.ts           (~40 LoC)   deckent remember "note"

scripts/
└── migrate-brain-v2.mjs  (~100 LoC)  One-time migration script
```

### Data Flow

```
WRITE PATH (sprint lifecycle):
  sprint-finalizer.ts ──► db.insert({type:'memory', ...})
  sprint-retro-writer.ts ──► db.upsert({type:'retro', ...})
  debt-manager.ts ──► db.insert({type:'debt', ...})
  auditor.ts ──► db.insert({type:'pattern', ...})
  worker.ts ──► db.insert({type:'error', source:'worker', ...})

  (optionally, on sprint_end):
  memory-export.ts ──► .brain/exports/*.md  (git-tracked snapshots)

READ PATH (all queries go through DB):
  task-builder.ts ──► db.queryFTS(taskKeywords, {type:'adr'})
  authority-enforcer.ts ──► db.query({type:'adr', status:'accepted'})
  MCP deckent_memory_query ──► db.queryFTS(userQuery)
  CLI deckent recall ──► db.queryFTS(userQuery)

DECAY PATH:
  OLD: smartTrimMemory() + regex + line counting (100 LoC)
  NEW: UPDATE entries SET deleted_at=now() WHERE sprint_num < N (1 SQL)

RECOVERY PATH:
  DB lost → memory-import.ts reads .brain/exports/*.md → rebuilds DB
  .md lost → memory-export.ts reads DB → regenerates .md snapshots
```

### File System Layout

```
BEFORE (current):                    AFTER (V2):
.brain/                              .brain/
├── DECISIONS.md  (96K, parsed)      ├── memory.db         (SQLite, source of truth)
├── MEMORY.md     (4K, parsed)       ├── exports/          (generated, git-tracked)
├── RETRO.md      (5K, parsed)       │   ├── decisions.md  (human-readable ADR list)
├── DEBT.md       (544B, parsed)     │   ├── memory.md     (sprint learnings)
├── PATTERNS.md   (177B, parsed)     │   ├── debt.md       (tech debt table)
├── ERRORS.md     (67K)              │   ├── retro.md      (retrospective)
├── PROJECT-IDENTITY.md              │   ├── patterns.md   (pattern registry)
├── sprints/                         │   └── summary.md    (context loading, ~3K)
└── archive/                         ├── ERRORS.md         (unchanged)
                                     ├── PROJECT-IDENTITY.md (unchanged, decay_exempt)
                                     ├── sprints/          (unchanged)
                                     └── archive/          (unchanged)

CLAUDE.md:  @.brain/DECISIONS.md (96K) → @.brain/exports/summary.md (~3K)
DECKENT.md: @.brain/DECISIONS.md (96K) → @.brain/exports/summary.md (~3K)
```

---

## 7. Configuration

```json
{
  "memory": {
    "backend": "sqlite",
    "search": "fts5",
    "decay_after_sprints": 20,
    "export_md": true,
    "export_trigger": "sprint_end",
    "custom_types": [],

    "online": {
      "semantic_search": false,
      "semantic_provider": null,
      "cloud_sync": false,
      "external_sources": []
    }
  }
}
```

### Tier System

| Tier | Mode | Requires | Features |
|------|------|----------|----------|
| 0 | Offline Core | better-sqlite3 | FTS5, CRUD, decay, export, i18n normalize |
| 1 | Semantic Search | Tier 0 + LanceDB + API key | Vector embeddings, hybrid search |
| 2 | External Sources | Tier 0 + API access | GitHub issues, Slack thread import |
| 3 | Cloud Sync | Tier 0 + cloud config | Multi-machine DB sync (future) |

---

## 8. Impact Analysis

### Code Changes

| Category | Files | LoC | Risk |
|----------|-------|-----|------|
| New modules (memory-store, query, normalize, export, import, types) | 6 | +1140 | Low (new code) |
| New CLI/MCP (recall, remember, memory-query tool) | 3 | +180 | Low (new endpoints) |
| Migration script | 1 | +100 | Low (one-time) |
| Refactor: write points (finalizer, retro-writer, debt-manager) | 3 | ~100 changed | Medium |
| Refactor: read points (task-builder, auditor, authority-enforcer, MCP, CLI) | ~12 | ~200 changed | Medium |
| Deleted parse code (smartTrimMemory, parseDebtTable, countBrainLines, loadADRContent) | 8 | -480 | Low (removal) |
| Markdown reference changes (CLAUDE.md, DECKENT.md) | 2 | ~5 | Low |
| Test updates | ~20 | ~500 | Medium |
| Config types extension | 1 | ~30 | Low |
| **TOTAL** | ~56 files | +1420 net (+1950, -530) | **Manageable** |

### Context Savings

| Source | Before (chars) | After (chars) | Savings |
|--------|---------------|--------------|---------|
| DECISIONS.md context load | 96,389 | ~3,000 (summary.md) | **97%** |
| MEMORY.md context load | 4,361 | ~2,000 (summary.md) | 54% |
| Worker prompt ADR injection | 3,000 (truncated from 96K) | ~1,500 (relevant ADRs only) | 50% |
| **Total per conversation** | ~104K chars | ~6.5K chars | **~97.5K chars saved** |

### ADR Impact

- **ADR-010 amend:** Add `better-sqlite3` as second runtime dependency (commander + better-sqlite3)
- **New ADR-040:** "DB-First Memory Architecture" documenting this design
- **ADR-036 update:** Worker prompt injection changes from loadADRContent() to queryRelevantADRs()

---

## 9. User Experience

### CLI Commands

```bash
# Query memory
deckent recall "docker heartbeat bug nasil cozuldu?"
# → 3 results from memory + sprint log + pattern (scored, ranked)

# Add user knowledge
deckent remember "Payment API rate limit 100 req/s because 3rd party limit"
# → Stored as source='user', searchable immediately

# Export snapshots
deckent memory export
# → .brain/exports/*.md regenerated from DB

# Rebuild DB from exports (recovery)
deckent memory rebuild
# → .brain/memory.db rebuilt from .brain/exports/*.md
```

### MCP Tools

```
deckent_memory_query:
  query: "docker heartbeat"
  type: ["memory", "pattern"]        (optional filter)
  sprint_range: { min: 135 }          (optional)
  limit: 5

deckent_memory_store:
  title: "Payment rate limit decision"
  content: "100 req/s because..."
  type: "memory"
  source: "user"
  tags: ["payment", "rate-limit", "api"]
```

### Brain Auto-Query (invisible to user)

During sprint planning, Brain automatically:
1. Queries patterns related to task scope
2. Finds relevant ADRs for worker prompt injection
3. Checks agent success history
4. Looks up similar past errors during evaluation

All queries < 10ms. Zero user intervention needed.

---

## 10. Migration Strategy

### Phase 1: One-time migration (with verification gates)

```bash
scripts/migrate-brain-v2.mjs:

  STEP 1 — INVENTORY (before touching anything)
  1a. Count: ADRs in DECISIONS.md (by ## ADR- headers)
  1b. Count: memory sections in MEMORY.md (by ## Sprint headers)
  1c. Count: debt items in DEBT.md (table rows)
  1d. Count: patterns in PATTERNS.md
  1e. Count: sprint log files in sprints/
  1f. SHA-256 hash every source .md file
  1g. Inventory all @ references in CLAUDE.md, DECKENT.md, AGENTS.md,
      DECKENT-MASTER-BLUEPRINT.md → save as migration-manifest.json
  1h. Write migration-manifest.json to .brain/archive/pre-v2/

  STEP 2 — BACKUP
  2a. Copy all .brain/*.md to .brain/archive/pre-v2/ (originals preserved)
  2b. Git commit: "chore: pre-v2 memory backup"

  STEP 3 — PARSE + INSERT
  3a. Parse DECISIONS.md → ADR entries (with relations for supersedes/deprecated)
  3b. Parse MEMORY.md → sprint-based memory entries
  3c. Parse DEBT.md → debt entries
  3d. Parse RETRO.md → retro entry
  3e. Parse PATTERNS.md → pattern entries
  3f. Read sprint logs → sprint entries
  3g. Read PROJECT-IDENTITY.md → identity entry (decay_exempt=1)
  3h. Insert all into memory.db with turkishNormalize() on all text fields

  STEP 4 — VERIFICATION GATE (must pass before continuing)
  4a. Count verification: DB row counts per type == manifest counts from Step 1
  4b. Sample verification: 10% random entries (min 5) → read back from DB →
      compare content against original .md source → zero diff required
  4c. Cross-reference check: no dangling relation.to_id
  4d. FTS5 smoke test: 5 known queries must return expected results
  4e. If ANY check fails → abort, print diff, exit 1 (no @ references changed)

  STEP 5 — EXPORT
  5a. Generate .brain/exports/*.md from DB
  5b. Generate .brain/exports/summary.md (~3K chars context file)
  5c. Roundtrip verify: export → reimport to temp DB → compare row counts + hashes

  STEP 6 — REFERENCE SWAP
  6a. For each @ reference in migration-manifest.json:
      - Verify new target file (.brain/exports/summary.md) exists
      - Verify new target contains equivalent summary content
      - Replace @ reference
  6b. Grep all .md for @.brain/ → verify zero dangling references
  6c. Run deckent doctor → must pass

  STEP 7 — FINAL REPORT
  7a. Print migration summary: entries migrated, verification results, references swapped
  7b. Git commit: "feat: Memory V2 migration — .brain/ → SQLite DB-first"
```

### Phase 2: Gradual source code migration

Write points and read points migrated incrementally. Each module can be migrated independently because the DB API is self-contained. Order:

1. memory-store.ts + memory-types.ts (DB layer, no existing code changes)
2. memory-normalize.ts (turkishNormalize, standalone)
3. memory-query.ts (query builder, standalone)
4. task-builder.ts refactor: loadADRContent() → db.queryFTS() (highest impact read point)
5. debt-manager.ts refactor: parseDebtTable/runDecay → db.query/db.delete (biggest simplification)
6. sprint-finalizer.ts + sprint-retro-writer.ts refactor: writeFileSync → db.insert/upsert
7. auditor.ts + authority-enforcer.ts refactor: readFileSync → db.query
8. MCP resources + CLI commands refactor (mechanical, low risk)
9. memory-export.ts (export on sprint_end)
10. CLI recall + remember commands + MCP memory_query tool
11. Delete parse code: smartTrimMemory, parseDebtTable, countBrainLines, loadADRContent

### Rollback

If memory.db is deleted or corrupted:
1. .brain/exports/*.md files are git-tracked → `deckent memory rebuild` reconstructs DB
2. .brain/archive/pre-v2/*.md files preserved → manual recovery possible
3. Original .brain/*.md files exist until Alperen explicitly approves deletion (Success Criteria #17)

---

## 11. Testing Strategy

- Unit tests for memory-store.ts (CRUD, FTS5, decay, rebuild)
- Unit tests for memory-normalize.ts (turkishNormalize edge cases)
- Unit tests for memory-query.ts (dual-layer search, scoring, filters)
- Integration tests for migration (existing .brain/ → DB)
- Integration tests for export/import cycle (DB → .md → DB roundtrip)
- E2E test: Brain auto-query during mock sprint lifecycle
- i18n test suite: TR/EN/DE character permutations (20 test cases proven)

---

## 12. Success Criteria

### Core Functionality
1. Context loading reduced from ~104K chars to ~6.5K chars (97% reduction)
2. `deckent recall "query"` returns relevant results in < 50ms
3. Turkish I/İ/ı/i edge cases: 100% pass rate (20/20 proven)
4. Brain auto-queries integrated at 6 lifecycle points
5. .md exports regenerated correctly from DB
6. All existing 12,485 tests continue to pass
7. No parse code remains (smartTrimMemory, parseDebtTable, countBrainLines deleted)

### Data Migration Integrity (CRITICAL)
8. **Complete transfer:** Every entry in existing .brain/ files has a corresponding entry in memory.db. Verified by count: number of ADRs in DECISIONS.md = number of type='adr' rows in DB. Same for memory sections, debt items, patterns, sprint logs.
9. **Content fidelity:** Migrated content is byte-identical to source (no truncation, no encoding loss, no markdown corruption). Verified by SHA-256 hash comparison of original content vs DB content field for a random sample.
10. **Independent sampling verification:** After migration, 10% random sample of entries (minimum 5, across all types) are read back from DB and diff'd against original .md source. Zero diff = pass. Any diff = migration bug, must fix before proceeding.
11. **Cross-reference integrity:** All relations in the DB correspond to real entries (no dangling to_id references). Verified by: `SELECT r.* FROM relations r LEFT JOIN entries e ON r.to_id = e.id WHERE e.id IS NULL` = 0 rows.
12. **Roundtrip verification:** DB → export → reimport → DB produces identical entry set. Verified by comparing row counts and content hashes before and after roundtrip.

### Reference Migration (@ Flow Continuity)
13. **@ reference audit:** Before changing any `@` reference in CLAUDE.md, DECKENT.md, AGENTS.md, or DECKENT-MASTER-BLUEPRINT.md, document every existing `@` reference and its target. Full inventory.
14. **@ reference swap:** Each `@.brain/DECISIONS.md` and `@.brain/MEMORY.md` reference is replaced with `@.brain/exports/summary.md`. The new target file must exist and contain equivalent summary content before the swap.
15. **Flow continuity verification:** After reference swap, verify that every tool/agent that previously read via `@` references still receives the information it needs. Test: run `deckent doctor` + `deckent help` + mock sprint plan phase — all must complete without "missing context" errors.
16. **No orphan references:** grep all .md files for `@.brain/` patterns — every reference must point to an existing file. Zero dangling references.

### Post-Migration .md Disposition
17. **Original .md files are NOT deleted during migration.** They are moved to `.brain/archive/pre-v2/` as backup. Deletion decision is made separately by Alperen after verification criteria 8-16 all pass. This is a human decision, not an automated step.
