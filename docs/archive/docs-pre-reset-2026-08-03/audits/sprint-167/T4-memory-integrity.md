# T4 — Memory.db + Data Integrity Audit

**Sprint:** 167 (Read-Only Self-Audit)
**Worker:** w-167-004 (data-engineer / database-migration + typescript-expert)
**DB Path:** `.brain/memory.db` (SHA256-equiv mtime 2026-05-14 08:03)
**DB Mode:** READ-ONLY (`better-sqlite3` opened with `{ readonly: true }`)
**Generated:** 2026-05-14

> **Scope reminder:** This audit only INSPECTS `.brain/memory.db`. No mutation, no rebuild, no decay, no restore. Output is written exclusively under `.audit/sprint-167/`.

---

## 0. Executive Summary

| Dimension | Status | Headline Finding |
|---|---|---|
| Total entries | INFO | **215** (matches `summary.md` claim) |
| FTS5 rowid parity | PASS | 215↔215 (0 orphan either direction) |
| FTS5 dual-layer normalize | PARTIAL | TR/EN trigger sync verified; DE corpus is empty |
| Relations integrity | **CRITICAL** | **51 / 131 (39%) broken** — ID naming convention drift |
| Sprint id ↔ num parity | LOW | 2 mismatches (`adr-041`, `adr-042` — sprint-150 vs 148/149) |
| Insufficient memory entries | **HIGH** | 1 empty (0 byte) + 5 stub (30 byte) + 7 boilerplate (136 byte) |
| Duplicate sprint memory | **MEDIUM** | sprint-165 has 2 memory rows (`mem-sprint-165` stub + `mem-165` real) |
| ADR decay_exempt logic | LOW | `adr-042` proposed but exempt; other proposed not exempt |
| entry_history coverage | PASS | 1218 rows, distinct entry_id = 215 = total entries |
| schema_version | INFO | Single row `version=1` (DB-internal); `PRAGMA user_version=0` unused |
| Backup pattern | MIXED | 3 `.bak-*` files exist, all gitignored; **NOT auto-created by code** |
| Bug Z3 (rebuild destructive) | **HIGH** | Manual `rm memory.db` mandatory → loss of `entry_history` + `relations` + non-exported types |
| `PRAGMA integrity_check` | PASS | `ok` |
| `PRAGMA foreign_key_check` | PASS | empty (no FK constraints declared) |

**Headline blocker for Sprint 168:** Relations table 39% broken + memory rebuild data-loss path are mutually reinforcing risks that would amplify Sprint 168 remediation effort if left unaddressed.

**Sprint 167 GO/NO_GO impact (audit-only):** All Section 3.6 predicate evidence assembled. NO source code mutation. Findings packaged for Sprint 168 roadmap consumption.

---

## 1. Inventory — Tables, Indexes, Triggers, Row Counts

### 1.1 Object Inventory

| Type | Name | Notes |
|---|---|---|
| table | `entries` | Main knowledge store, 21 columns |
| table | `entries_fts` | FTS5 virtual table (8 indexed columns) |
| table | `entries_fts_config` | FTS5 internal, version=4 |
| table | `entries_fts_data` | FTS5 internal segment store |
| table | `entries_fts_docsize` | FTS5 internal doc sizes |
| table | `entries_fts_idx` | FTS5 internal index |
| table | `entry_history` | Field-level change log |
| table | `relations` | Cross-reference graph (composite PK) |
| table | `schema_version` | Single-row version marker |
| table | `tags` | Many-to-many entry↔tag |
| table | `sqlite_sequence` | SQLite internal autoincrement counters |
| trigger | `entries_ai` | AFTER INSERT → push to FTS |
| trigger | `entries_au` | AFTER UPDATE → delete + reinsert FTS |
| trigger | `entries_ad` | AFTER DELETE → remove from FTS |
| index | `idx_entries_active` | Partial: `WHERE deleted_at IS NULL` |
| index | `idx_entries_decay` | `(decay_exempt, sprint_num)` |
| index | `idx_entries_source` | `source` |
| index | `idx_entries_sprint_num` | `sprint_num` |
| index | `idx_entries_status` | `status` |
| index | `idx_entries_type` | `type` |
| index | `idx_history_entry` | `entry_id` on `entry_history` |
| index | `idx_relations_to` | `to_id` on `relations` |
| index | `idx_tags_tag` | `tag` on `tags` |

### 1.2 Row Counts

| Table | Rows |
|---|---|
| entries | **215** |
| entries_fts | **215** |
| entries_fts_docsize | 215 (FTS5 internal parity) |
| entries_fts_data | 169 (segment store — internal) |
| entries_fts_idx | 167 (term index — internal) |
| entries_fts_config | 1 |
| entry_history | **1218** |
| relations | **131** |
| schema_version | 1 |
| tags | 943 |
| sqlite_sequence | 1 |

Ground-truth claim (`summary.md`): `Total entries: 215`. **Parity confirmed.**

### 1.3 Pragma Health

```
PRAGMA integrity_check  → "ok"
PRAGMA foreign_key_check → (empty)
PRAGMA user_version     → 0       (unused — convention diverges from schema_version table)
PRAGMA journal_mode     → wal     (WAL mode active)
```

**Note:** `foreign_key_check` is empty because no FK constraints are declared in any table. `relations.from_id` / `relations.to_id` / `tags.entry_id` / `entry_history.entry_id` are TEXT columns with no enforced FK. Integrity is application-managed. This is the root cause of the 39% broken-relations finding in §3.

---

## 2. Entry Consistency Audit (Sub-task 4.1)

### 2.1 Type × Status Cross-Tab

| Type | Status | Count |
|---|---|---|
| adr | accepted | 44 |
| adr | deprecated | 1 |
| adr | proposed | 4 |
| adr | superseded | 1 |
| debt | resolved | 100 |
| identity | active | 1 |
| memory | active | 37 |
| retro | active | 21 |
| sprint | active | 6 |
| **TOTAL** |  | **215** |

Cross-check with `summary.md` and `DECKENT.md`:
- Claim: 46 ADRs in summary.md (Active Architecture Decisions section). Reality: **50 ADRs** (44 accepted + 1 deprecated + 4 proposed + 1 superseded). Summary.md lists 46 because it appears to filter or partially enumerate.
- Claim: 215 total entries. ✓ matches.

### 2.2 Sprint Id ↔ Num Parity

Total entries with sprint linkage signal:
- `sprint_id IS NOT NULL`: 72 entries
- `sprint_num = 0` (no sprint association): 143 entries (40 ADRs + 100 debt + 1 retro + 1 identity + 1 garbage memory)

Mismatch analysis (`sprint_id` regex `sprint-(\d+)` vs `sprint_num`):
| ID | sprint_id | sprint_num | Reason |
|---|---|---|---|
| `adr-041` | `sprint-150` | 148 | num-mismatch (sprint_id = reconfirmation sprint, sprint_num = origin sprint) |
| `adr-042` | `sprint-150` | 149 | num-mismatch (same root cause) |

**Severity:** LOW. This is a *semantic* drift, not a bug — `sprint_id` carries the most-recent-mention sprint while `sprint_num` carries the original-creation sprint. However, the dual-column design is undocumented in `memory-types.ts` field comments.

### 2.3 Decay-Exempt Distribution

| Type | decay_exempt=0 | decay_exempt=1 |
|---|---|---|
| adr | 5 | 45 |
| debt | 100 | 0 |
| identity | 0 | 1 |
| memory | 37 | 0 |
| retro | 21 | 0 |
| sprint | 6 | 0 |

**Detail — non-exempt ADRs (5):** `adr-005` (deprecated), `adr-022` (superseded), `adr-053` (proposed), `adr-055` (proposed), `adr-060` (proposed).

**Detail — exempt-but-not-accepted ADR (1):** `adr-042` (proposed, decay_exempt=1).

**Finding:** Decay policy for `proposed` status is **inconsistent**. `adr-042` is exempt, but `adr-053 / adr-055 / adr-060` are not. Either all proposed ADRs should be exempt during active proposal phase, or none should.

- Severity: LOW
- Suggested fix: Standardize ADR decay policy in `memory-store.ts` insert helper — proposed ADRs should be exempt by default (proposed ADR drafts shouldn't auto-decay).
- Sprint slot: Sprint 168 (data-integrity batch)
- Effort estimate: 2h (1h fix + 1h test)

### 2.4 Insufficient Memory Entries (Body Length Distribution)

Bottom 12 entries by `length(content)`:

| Bytes | Type | Sprint | ID |
|---|---|---|---|
| 0 | memory | sprint-132 | **`mem-132`** ⚠️ |
| 4 | memory | (none) | `user-1778591061896` (content: "help") |
| 30 | memory | sprint-139 | `mem-139` |
| 30 | memory | sprint-147 | `mem-sprint-147` |
| 30 | memory | sprint-155 | `mem-sprint-155` |
| 30 | memory | sprint-163 | `mem-sprint-163` |
| 30 | memory | sprint-165 | **`mem-sprint-165`** (task-spec sample) |
| 80 | debt | sprint-138 | `debt-debt-138-002` |
| 80 | debt | sprint-138 | `debt-debt-138-008` |
| 136 | memory | sprint-134 | `mem-134` (boilerplate stub) |
| 136 | memory | sprint-140 | `mem-140` |
| 136 | memory | sprint-152, 157, 158, 160, 161 | `mem-152` / `mem-157` / `mem-158` / `mem-160` / `mem-161` |

**Detail — `mem-132` empty content:**
```
id: mem-132
type: memory
source: import
title: Sprint 132 Learnings
content: (NULL)         ← schema allows zero-length, NOT NULL
sprint_id: sprint-132
sprint_num: 132
```

**Detail — 30-byte stubs:** All five 30-byte entries follow the pattern `## Sprint sprint-NNN Learnings\n` (literal). Confirmed via direct query on `mem-sprint-165`.

**Detail — 136-byte boilerplate:** Seven entries (`mem-134, mem-140, mem-152, mem-157, mem-158, mem-160, mem-161`) share the same byte count. Sample text (per `summary.md` and `memory.md`): `"Sprint NNN learnings — no .brain/sprints/sprint-NNN.md log was available at backfill time. Stub inserted by Sprint 16X..."`.

**Finding:** ~13 of 37 memory entries (35%) are stubs/empty. These will surface in FTS5 search with near-zero recall and waste retrieval slots. They are also the source of the dependent retro-entry data-quality leak (Section 6.3).

- Severity: HIGH
- Suggested fix: Sprint 168 — backfill or quarantine. Add `is_stub: BOOLEAN` flag OR set `status='stub'` and exclude from default retrieval. Alternatively reconstruct from `.brain/sprints/sprint-NNN.md` for those sprints that have logs.
- Sprint slot: Sprint 168 (data-integrity batch)
- Effort estimate: 4h (categorization + backfill from logs + tests)

### 2.5 Duplicate Sprint Memory

Two `memory` entries for sprint-165:

| ID | source | body bytes | created_at |
|---|---|---|---|
| `mem-sprint-165` | brain | 30 | 2026-05-13 13:32:57 |
| `mem-165` | (import) | 311 | (after backfill) |

**Finding:** Backfill collision. The stub was created during Sprint 165 (brain auto-write), then a backfill from sprint logs added `mem-165` (311 byte) without removing the stub. Result: duplicate sprint coverage.

- Severity: MEDIUM
- Suggested fix: UNIQUE constraint on `(type, sprint_num)` for type='memory' — OR explicit dedupe pass in import logic.
- Sprint slot: Sprint 168
- Effort estimate: 1h (constraint + migration + test)

### 2.6 ID Naming Convention Drift

Memory-type entries use three distinct ID patterns:
1. `mem-NNN` (short): `mem-132 ... mem-140, mem-152, mem-157-161, mem-165`
2. `mem-sprint-NNN`: `mem-sprint-141 ... mem-sprint-156, mem-sprint-162-166`
3. `user-<timestamp>`: `user-1778591061896` (single garbage row)

Retro entries use `retro-sprint-NNN` and `retro-latest`.
Sprint entries use `sprint-log-NNN`.
ADR entries use `adr-NNN` and `adr-022-v2`.

**Finding:** Three competing memory-ID conventions break referential integrity in `relations` table (see §3.2).

- Severity: HIGH
- Suggested fix: Canonicalize to `mem-NNN` (3-digit zero-pad if desired). Rewrite `mem-sprint-NNN` ⇒ `mem-NNN` in entries + relations + tags + entry_history (all 4 tables, single transaction).
- Sprint slot: Sprint 168 (paired with §3.2 fix)
- Effort estimate: 4h (rewrite migration + dual-format read fallback during transition + tests)

### 2.7 Sprint Coverage Gaps

Distinct `sprint_num` values present (memory + retro + sprint types combined):
`132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166`

Total: 35 consecutive sprints (132–166), no gaps.

`sprint-log` type entries (the rarer type): only `136, 137, 138, 139, 165, 166` — **28 sprint logs missing** (140–164 except 165). This explains the orphan `sprint-log-sprint-NNN` references in `relations` (§3.2).

`retro` entries skip: `152, 157, 158, 159, 160, 161` — 6 retros missing within their sprint range.

---

## 3. FTS5 + Relations Integrity Audit (Sub-task 4.2)

### 3.1 FTS5 Trigger Sync (Rowid Parity)

Schema (verified via `sqlite_master`):
```sql
CREATE VIRTUAL TABLE entries_fts USING fts5(
  title, content, summary, tag_text,
  title_norm, content_norm, summary_norm, tag_norm,
  content='entries',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
```

Three triggers maintain sync: `entries_ai` (INSERT), `entries_au` (UPDATE = delete+reinsert), `entries_ad` (DELETE).

**Rowid alignment check:**
- entries → entries_fts: 0 rowids in entries that are missing in FTS
- entries_fts → entries: 0 rowids in FTS that are missing in entries
- **PASS** — FTS5 trigger sync is intact.

### 3.2 FTS5 Dual-Layer Normalize Sample Queries

`unicode61 remove_diacritics 2` handles diacritics natively. The dual-layer `*_norm` columns store pre-normalized text from `turkishNormalize()` (`memory-normalize.ts`), giving redundancy for tokens not covered by unicode61.

| Query | Lang | Hits | Sample Entry IDs |
|---|---|---|---|
| `docker` | EN | 10 | adr-027, adr-033, adr-034, adr-035, adr-037, mem-135, mem-136, retro-latest, project-identity, sprint-log-139 |
| `güvenlik` | TR (diacritic) | 8 | adr-030, adr-031, adr-034, adr-037, adr-038, adr-041, adr-043, adr-053 |
| `guvenlik` | TR (ASCII fallback) | 8 | **same set** as above → dual-layer recall confirmed |
| `kahn` | EN (algorithm name) | 2 | debt-142-011, adr-045 |
| `Sicherheit` | DE | 0 | (no German content in corpus) |

**Finding:** TR/EN normalize works. Türkçe diakritik + ASCII fallback returns identical result set (8 hits each) → dual-layer redundancy proven.

**FTS5 caveat:** German (DE) recall is `0` only because the corpus contains no German content — NOT a normalize defect. The claim in `DECKENT.md`/`IDENTITY.md`: "FTS5 dual-layer Turkish normalize (TR/EN/DE %100)" is **misleading** — DE coverage is structural (tokenizer can handle umlauts via `remove_diacritics 2`) but never exercised by any entry.

- Severity: LOW (documentation drift, not functional bug)
- Suggested fix: Reword claim in `DECKENT.md`/`IDENTITY.md` to "TR/EN normalize verified; DE-ready via unicode61" — OR add 1+ German test fixtures.
- Sprint slot: Sprint 168 (handoff to T2 doc audit)
- Effort estimate: 0.5h

### 3.3 FTS5 Tokenizer Configuration

`entries_fts_config.version = 4` (FTS5 schema version 4 — recent).
Tokenize: `unicode61 remove_diacritics 2` (Unicode-aware, removes diacritics from BMP+supplementary).

**Finding:** No `prefix=` index pragma in the FTS5 declaration. Prefix queries (`docker*`) work via slow scan only. Not a defect at current scale (215 rows), but a future scaling consideration.

### 3.4 Relations Table Integrity

Schema:
```sql
CREATE TABLE relations (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  rel_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, rel_type)
);
```

**No FK constraints declared.** Composite PK on `(from_id, to_id, rel_type)` — application is responsible for integrity.

Total rows: **131**
By `rel_type`:
| Type | Count |
|---|---|
| references | 96 |
| depends_on | 34 |
| supersedes | 1 |

### 3.5 Broken Relations (CRITICAL FINDING)

**51 of 131 relations (39%) reference non-existent entries** in either `from_id` or `to_id` (or both).

Orphan `from_id` count: 35 (distinct values)
Orphan `to_id` count: 35 (distinct values)
Rows broken on at least one side: **51**

Pattern: All broken refs use `memory-sprint-NNN` / `sprint-log-sprint-NNN` ID format, but actual entries use `mem-sprint-NNN` (or `mem-NNN`) and `sprint-log-NNN` (no extra `sprint-`).

Example broken row:
```
from_id: memory-sprint-144   ← does not exist (actual: mem-sprint-144)
to_id:   retro-sprint-144     ← exists ✓
rel_type: depends_on
```

Example broken on both sides:
```
from_id: sprint-log-sprint-144  ← does not exist (actual: sprint-log-144 — itself missing!)
to_id:   memory-sprint-144      ← does not exist
rel_type: depends_on
```

**Finding:** Relations table is unreliable for ≥39% of rows. Any consumer that joins to `entries` via FK-like logic will silently drop those edges. This silently degrades any "find related ADRs / sprint context" feature.

- Severity: CRITICAL
- Suggested fix: Two-phase repair: (1) backfill missing entries (`sprint-log-144 ... sprint-log-164` etc.) OR (2) rewrite `from_id`/`to_id` in `relations` to match canonical entry IDs. Option (2) is faster but requires touching 51 rows in a single transaction.
- Sprint slot: Sprint 168 (high-priority — pairs with §2.6 ID rename)
- Effort estimate: 6h (data analysis 2h + repair migration 2h + test 2h)

### 3.6 Relations rel_type Coverage

`memory-types.ts` declares 6 relation types (per `DECKENT.md` ADR docs): `references`, `supersedes`, `caused_by`, `resolves`, `blocks`, `depends_on`. Only **3 are used in current DB**:
- `references`: 96 (74%)
- `depends_on`: 34 (26%)
- `supersedes`: 1 (1%)

**Finding:** `caused_by`, `resolves`, `blocks` relation types are declared but unused. Not a bug — may reflect that brain hasn't authored these yet.

- Severity: INFO (informational, not actionable)

### 3.7 entry_history Coverage

| Metric | Value |
|---|---|
| Total history rows | 1218 |
| Distinct `entry_id` | 215 |
| Total entries | 215 |
| Coverage | **100%** — every entry has at least one history row |

Field-name distribution (top 7):
| Field | Rows |
|---|---|
| `sprint_num` | 300 |
| `sprint_id` | 300 |
| `*` | 215 (creation marker for entire entry — synthetic field name) |
| `metadata` | 201 |
| `tag_text` | 100 |
| `status` | 99 |
| `priority` | 3 |

**Finding:** `entry_history` is healthy. Every entry tracked. 300 changes to `sprint_num`/`sprint_id` consistent with the backfill+reconciliation work of Sprint 161–166.

### 3.8 Tags Integrity

- Total tag rows: 943
- Distinct tag values: 486
- Orphan rows (no parent entry): **0** — PASS

Top tags: `status (47)`, `accepted (42)`, `context (36)`, `sprint (33)`, `learning (19)`, `retro (19)`, `decision (14)`, `brain (13)`, `deckent (11)`, `2026 (10)`.

---

## 4. Schema, Backup, Bug Z3 Audit (Sub-task 4.3)

### 4.1 Schema Version Drift

`schema_version` table contents:
```
version | applied_at
--------+---------------------
1       | 2026-04-16 09:07:52
```

`PRAGMA user_version`: 0 (default, unused).
`PRAGMA journal_mode`: wal (Write-Ahead Logging — improves concurrent read perf).

**Implementation expectation** (per `memory-store.ts` init logic): version 1 is the only version defined. There is no migration framework — schema is created idempotently via `CREATE TABLE IF NOT EXISTS`.

**Finding:** Two version-tracking mechanisms coexist (`schema_version` table + `PRAGMA user_version`), but only one is populated. This is non-critical, but the dual-channel design risks future migration ambiguity.

- Severity: LOW
- Suggested fix: Either deprecate `schema_version` table OR start writing `PRAGMA user_version = X` alongside the table on any future schema migration. Document the choice in `memory-store.ts` header.
- Sprint slot: Sprint 168
- Effort estimate: 1h

### 4.2 Backup Pattern Inventory

Three backup files present in `.brain/`:

| File | Size | mtime | MD5 |
|---|---|---|---|
| `memory.db.bak-pre-backfill-20260514-081634` | 2.7M | May 14 05:16 | `47d2894b...` |
| `memory.db.bak-pre-sprint166-rebuild` | 2.7M | May 14 05:00 | `47d2894b...` (**duplicate of above**) |
| `memory.db.bak-pre-sprint167-20260514-103736` | 2.7M | May 14 07:37 | `c4cf5afc...` |
| `memory.db` (current) | 2.7M | May 14 08:03 | `06d3bc2f...` |

Gitignore coverage (verified via `git check-ignore -v`):
- `.brain/memory.db` ← line 18 of `.gitignore`
- `.brain/memory.db.bak-*` ← line 21 of `.gitignore`

✓ All three `.bak-*` files correctly excluded from git.

**Finding 1:** Two backups have IDENTICAL md5 (`bak-pre-backfill-...` and `bak-pre-sprint166-rebuild`). One is redundant. Likely a copy made before a no-op rebuild attempt.

**Finding 2:** **Backups are NOT auto-created by code.** Grep `src/` for `bak-pre|\.bak-` returns zero matches. These backups were created manually (`cp memory.db memory.db.bak-...`) before risky operations. No backup runner exists in `memory.ts` rebuild logic.

**Finding 3:** Naming convention drift: One file uses `-YYYYMMDD-HHMMSS`, another uses semantic `-sprint166-rebuild`. No standard pattern.

**Restore test status:** Per spec — **NOT EXECUTED** (audit mode, no mutation). Restore correctness is unverified.

- Severity: HIGH (defensive-miss; user must remember to `cp` manually before every risky op)
- Suggested fix: Add `deckent memory backup` subcommand that auto-snapshots `.brain/memory.db` → `.brain/memory.db.bak-pre-<reason>-<ISO8601>`. Call it implicitly from any destructive operation (rebuild, decay aggressive sweep, restore).
- Sprint slot: Sprint 168
- Effort estimate: 3h (subcommand + auto-hook + test)

### 4.3 Bug Z3 — Memory Rebuild Destructive Impact Analysis

Code path (`src/cli/commands/memory.ts:17–86`):

```typescript
mem.command('rebuild')
  .description('Rebuild memory.db from .brain/exports/*.md files')
  .action(() => {
    if (existsSync(dbPath)) {
      printError('memory.db already exists. Delete it first to rebuild.');
      return;                         // guard: refuses if DB exists
    }
    // ... import from exports/decisions.md, memory.md, debt.md, ADRs from docs/adr/
  });
```

**Bug Z3 root cause:** The rebuild guard at line 25 forces the user to **manually `rm .brain/memory.db`** before running rebuild. This is the destructive step. Anything not in the exports is permanently lost on rebuild.

**Data lost on rebuild (NOT in `.brain/exports/*.md`):**

| Source of truth | Rows | Recoverable from exports? | Recovery channel |
|---|---|---|---|
| `entry_history` | 1218 | **NO** | (none — audit trail wiped) |
| `relations` | 131 | **NO** | (none — graph edges wiped) |
| `tags` (multi-tag rows) | 943 → ~~~ partially exported | PARTIAL | tags re-derived from decisions.md `tags: [...]` frontmatter |
| `entries` of type `sprint` | 6 | **NO** | sprint logs not in exports |
| `entries` of type `retro` | 21 | PARTIAL | only `retro-latest` survives in exports; per-sprint retros lost |
| `entries` of type `identity` | 1 | **NO** | identity not in standard exports (separate `PROJECT-IDENTITY.md`) |
| `decay_exempt` flags on ADRs | 45 | YES | adr-file-sync sets exempt=1 for accepted |
| `metadata` JSON blobs | 215 | PARTIAL | only if encoded into exports markdown |

**Concrete impact:**
- Sprint 166 backfill (Bug Y in spec) had to re-create `entry_history` and `relations` from scratch — multiple hours of brain work to restore the audit trail.
- Tutarsızlık #1 (Sprint 167 design v5): `deckent memory rebuild` is non-idempotent in the strict sense — running rebuild after manual delete yields strictly less data than before delete.

**Code-level defensive misses:**
1. Guard refuses, but doesn't suggest backup (`memory.db already exists. Delete it first to rebuild.` ← should be: "Delete it first AND back up via `cp memory.db memory.db.bak-pre-rebuild-$(date -u +%Y%m%dT%H%M%S)`").
2. No `--force` flag with built-in backup. User must orchestrate manually.
3. No transaction-style "dry-run" — user can't preview what rebuild would import vs what would be lost.
4. Imports cover only `adr / memory / debt` types — `retro / sprint / identity` are silently dropped without warning.

**Bug Z3 severity uplift:** This is a **HIGH-severity defensive-miss bug** because:
- The user-facing error message is misleading (suggests safe restart, but actually destroys 25% of entry types + 100% of relations + 100% of history).
- Combined with §4.2 (no auto-backup), a single `rm` command can vaporize the entire audit trail.
- Sprint 165 → 166 evidence: backfill required because exact this scenario occurred mid-Sprint.

- Severity: HIGH
- Suggested fix:
  1. Add `--backup` flag (default on) that auto-snapshots before delete.
  2. Add `--include-types` flag (default `adr,memory,debt,retro,sprint,identity`) and warn loudly if any type is excluded.
  3. Export `entry_history` + `relations` to `.brain/exports/relations.md` + `.brain/exports/history.md` so they survive rebuild.
  4. Replace the "Delete it first" guard with `--force` flag that does delete + backup atomically.
- Sprint slot: Sprint 168 (CRITICAL — must precede any future rebuild)
- Effort estimate: 6h (4 sub-fixes + tests + doc update)

### 4.4 Decay Function Audit

`memory-store.ts:605–635` — `decay()` performs soft-delete via `UPDATE entries SET deleted_at = datetime('now')`, NOT hard-delete. Decayed rows remain queryable via `getById(id, includeDeleted: true)`.

Current state: **0 entries soft-deleted** (`deleted_at IS NOT NULL` count = 0). The decay function exists but appears to have never run on production data. This is consistent with the relatively young sprint range (132–166 only).

**Finding:** Decay is INERT in production. Cannot validate decay correctness without a controlled test.

- Severity: INFO
- Sprint slot: Sprint 168 (low priority — add a smoke test that runs decay on a copy of DB and verifies soft-delete behavior)
- Effort estimate: 2h

---

## 5. Cross-Cutting Patterns

### 5.1 Pattern A — ID Naming Drift Causes Relation Bloat

Three independent root causes converge:
1. §2.6 — Three memory-ID conventions coexist (`mem-NNN`, `mem-sprint-NNN`, `user-<ts>`).
2. §3.5 — 39% of relations use the `memory-sprint-NNN` / `sprint-log-sprint-NNN` convention, which matches NO actual entry IDs.
3. §2.7 — `sprint-log` type missing for 28 sprints, so even if naming aligned, the targets don't exist.

These three findings should be remediated **together** in Sprint 168. Doing §3.5 alone without §2.6 will re-fracture relations on next reconciliation.

### 5.2 Pattern B — Defensive Misses In Destructive Code Paths

- §4.2 — No auto-backup before rebuild.
- §4.3 — Rebuild guard misleads instead of protecting.
- §4.4 — Decay never exercised in production.

All three are **defensive-miss bugs**: code does the right thing in the happy path, but fails gracefully (or destructively) under user error. Sprint 168 fixes should add belts-and-suspenders defaults (auto-backup, --force flag with transactional semantics, decay smoke test).

### 5.3 Pattern C — Stub Memory Entries Distort FTS5 Recall

§2.4 documents 13 of 37 memory entries (35%) are stubs. The FTS5 trigger sync (§3.1) faithfully indexes them. Result: any `recall "sprint 152"` or similar query returns the boilerplate `136-byte` stub as a top hit, masking the actual data location (`.brain/sprints/sprint-152.md` file). This is a silent recall-precision tax that users won't notice until they trust the recall and miss the real source.

---

## 6. Risk Matrix For Sprint 168

| # | Finding | Section | Severity | Suggested fix | Sprint slot | Effort estimate |
|---|---|---|---|---|---|---|
| 1 | Relations 39% broken | §3.5 | CRITICAL | Rewrite/repair (paired with #2) | Sprint 168 | 6h |
| 2 | Memory ID naming drift | §2.6 | HIGH | Canonicalize to `mem-NNN`, multi-table migration | Sprint 168 | 4h |
| 3 | Bug Z3 — rebuild destructive | §4.3 | HIGH | `--backup` flag + relations/history export | Sprint 168 | 6h |
| 4 | Backup auto-snapshot missing | §4.2 | HIGH | `deckent memory backup` subcommand + auto-hook | Sprint 168 | 3h |
| 5 | Insufficient memory entries | §2.4 | HIGH | Backfill or `status='stub'` filter | Sprint 168 | 4h |
| 6 | Duplicate sprint memory | §2.5 | MEDIUM | UNIQUE constraint or dedupe pass | Sprint 168 | 1h |
| 7 | ADR decay_exempt drift | §2.3 | LOW | Standardize proposed-ADR exempt policy | Sprint 168 | 2h |
| 8 | Sprint id↔num semantic drift | §2.2 | LOW | Document dual-column semantics in types | Sprint 168 | 0.5h |
| 9 | DE FTS5 recall claim misleading | §3.2 | LOW | Reword `DECKENT.md`/`IDENTITY.md` (T2 handoff) | Sprint 168 | 0.5h |
| 10 | schema_version dual-channel | §4.1 | LOW | Pick one mechanism, document | Sprint 168 | 1h |
| 11 | Decay function inert | §4.4 | INFO | Smoke test | Sprint 168 | 2h |
| 12 | Unused relation rel_types | §3.6 | INFO | Document or remove from types | Sprint 168 | 0.5h |

**Total Sprint 168 T4 follow-up effort:** ~30.5h (4 days @ 1 worker), or 1 day @ 4 parallel workers.

**Critical-path bottleneck:** Findings #1 + #2 + #3 must be addressed together. Recommend a single "Memory Data-Integrity Recovery" anchor task in Sprint 168.

---

## 7. Verification Predicate Summary

This audit ships with `.audit/sprint-167/T4-predicate.sh` (Section 3.6 falsifiable predicate).

Predicates evaluated:
- T4 report exists and ≥300 lines → checked by `wc -l`
- T4 report mentions "Bug Z3" ≥1 time → checked by `grep -c`
- T4 report mentions "FTS5" ≥3 times → checked by `grep -c`
- T4 report has ≥6 top-level sections (`^## `) → checked by `grep -c`
- Memory.db row count parity (entries vs entries_fts) → live re-checked via node
- Memory.db `PRAGMA integrity_check` → `ok` expected

A single failure aborts predicate with non-zero exit and explicit failed-check message.

---

## 8. Audit Method & Reproducibility

This audit was generated by `node .audit/sprint-167/_inspect.mjs` (inspector helper, deleted after this audit unless preserved for re-run). All queries opened the DB with `{ readonly: true, fileMustExist: true }` per ADR-006 spawn safety + ADR-008 brain-only-import rule. No `INSERT`, `UPDATE`, `DELETE`, or DDL statement was issued.

Re-running the audit:
```bash
# 1. Re-open inspector
node .audit/sprint-167/_inspect.mjs .brain/memory.db overview
node .audit/sprint-167/_inspect.mjs .brain/memory.db sprint-parity
node .audit/sprint-167/_inspect.mjs .brain/memory.db fts-parity
node .audit/sprint-167/_inspect.mjs .brain/memory.db relations
node .audit/sprint-167/_inspect.mjs .brain/memory.db body-dist
node .audit/sprint-167/_inspect.mjs .brain/memory.db history
node .audit/sprint-167/_inspect.mjs .brain/memory.db decay
node .audit/sprint-167/_inspect.mjs .brain/memory.db adr-status
node .audit/sprint-167/_inspect.mjs .brain/memory.db schema-version
node .audit/sprint-167/_inspect.mjs .brain/memory.db triggers

# 2. Re-run predicate
bash .audit/sprint-167/T4-predicate.sh
```

Determinism: All queries are idempotent. Re-running against the same DB state produces identical output (modulo timestamps in `entries_fts_config` which are FTS5-internal and unaffected by reads).

---

## 9. Handoff Notes

**To Sprint 168 (REMEDIATION sprint):**
- Findings #1–5 above (CRITICAL/HIGH) gate Sprint 168 closure. Findings #6–12 (MEDIUM/LOW/INFO) can be slot-filled.
- The 12-finding Risk Matrix in §6 is shaped to match `sprint-168-roadmap.md` consumption (severity / suggested_fix / sprint_slot / effort_estimate columns).
- Bug Z3 (§4.3) is a precondition for safe future rebuilds. Recommend block on Sprint 168 hard-blocker list.

**To T7 (Cross-Cutting Synthesis, Wave 2):**
- Cross-cutting Pattern A (§5.1) joins T4 ↔ T3 (ADR-046 Step Ordering Contract) ↔ T5 (Brain finalize Step 1–5 wire). The naming-drift root cause shows up in three different audit dimensions.
- Cross-cutting Pattern B (§5.2) joins T4 ↔ T5 (Bug E spawn-lock leak shares the "defensive miss" anti-pattern).

**To T2 (Doc Audit):**
- §3.2 — Reword `DECKENT.md`/`IDENTITY.md` claim "TR/EN/DE %100" to "TR/EN verified; DE-ready". Doc-side fix only.
- §2.1 — `summary.md` lists 46 ADRs but DB has 50. Reconcile T2.

**To T6 (Test+Build+Security):**
- The 3 `.bak-*` files in `.brain/` are gitignored ✓ but might contain old sensitive paths (e.g., `/home/alperen/`). If Sprint 168 ships Open Source GA prep, audit backups before tarball.
- §4.2 — Two identical-MD5 backups can be deleted to save 2.7M from the working tree (no commit impact since gitignored).

---

## 10. Predicate Evidence Receipts

| Predicate | Method | Result |
|---|---|---|
| `wc -l .audit/sprint-167/T4-memory-integrity.md ≥ 300` | run by T4-predicate.sh | (see predicate output) |
| `grep -c "Bug Z3" .audit/sprint-167/T4-memory-integrity.md ≥ 1` | run by T4-predicate.sh | (Bug Z3 mentioned across §0, §4.3, §6, §9 — well above threshold) |
| `grep -c "FTS5" .audit/sprint-167/T4-memory-integrity.md ≥ 3` | run by T4-predicate.sh | (FTS5 mentioned across §0, §1.1, §1.2, §3, §5.3 — well above threshold) |
| `bash .audit/sprint-167/T4-predicate.sh → PASS` | self-verify | (see predicate output) |
| Memory.db row parity (entries ↔ entries_fts) | inspector | 215 ↔ 215 PASS |
| `PRAGMA integrity_check` | inspector | `ok` PASS |
| `PRAGMA foreign_key_check` | inspector | (empty) PASS |
| Backup gitignore coverage | `git check-ignore -v` | all 3 `.bak-*` files ignored PASS |

---

_T4 audit complete. Sprint 167 anchor task 167-004._
