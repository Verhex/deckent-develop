# ADR-088: Memory V2 — DB-First Architecture

**Status:** accepted

**Date:** 2026-06-11

**Supersedes:** ADR-009 (DEBT.md Markdown Tablo Formatı — deprecated). Generalizes the same principle to ALL brain knowledge.

---

**Decision:** All brain knowledge — ADRs, sprint learnings, retros, technical debt, patterns, identity — is stored **DB-first** in SQLite (`.brain/memory.db`, `better-sqlite3`). The `.brain/exports/*.md` files (`summary.md`, `decisions.md`, `memory.md`, `debt.md`) are **generated exports, not sources of truth**. Code reads knowledge via `MemoryStore` (`store.getByType('adr')`, `searchMemory(...)`) — never by parsing `.md`.

**Schema:** 5 tables — `entries` (id, type, source, title, content, summary, *_norm, status, priority, sprint_id, sprint_num, lang, decay_exempt, metadata, tenant_id, timestamps, audit_prev_hmac, audit_hmac), `tags`, `relations` (references/supersedes/caused_by/resolves/blocks/depends_on), `entry_history` (field-level change tracking), `schema_version` — plus the `entries_fts` **FTS5 virtual table** (8 columns: title/content/summary/tag_text + their `turkishNormalize` variants).

**Search:** FTS5 full-text, **dual-layer** — original text + `turkishNormalize()` (`memory-normalize.ts`) → TR/EN/DE ~100% recall. `searchMemory()` (`memory-query.ts`) runs both layers + `buildAutoQuery()` for Brain auto-query. Correct FTS5 query shape: `SELECT e.* FROM entries_fts f JOIN entries e ON e.rowid = f.rowid WHERE entries_fts MATCH ?`.

**Context:** ADR-009 made `DEBT.md` a hand-maintained markdown table — the same file-as-source model used by the original `MEMORY.md`/`DECISIONS.md`/`RETRO.md`. It did not scale (96K ADR file, no search, merge conflicts, no decay/history). Memory V2 (DB-first) replaced it: SQLite is the single source, `.md` are exports for git review/diff. This decision had **no ADR** until now — a governance gap surfaced in the 2026-06-11 ADR review (Alperen).

**Consequence:**
- **Modules:** `memory-store.ts` (CRUD, FTS5 sync, tags, relations, decay, history, audit-hmac), `memory-query.ts` (dual-layer search), `memory-export.ts` (DB→.md), `memory-import.ts` (.md→DB), `memory-types.ts`.
- **Sync invariant:** any write through `MemoryStore.insert/upsert/update` keeps `content_norm` + FTS5 + `entry_history` + `audit_hmac` consistent. Direct SQL `UPDATE` is forbidden (misses norm/FTS5/audit). **Editing an ADR/entry means updating BOTH the `.md` AND the DB** so doc==DB (regenerate exports with `deckent memory export`).
- **Git:** `.brain/memory.db` is gitignored (rebuildable from exports via `memory-import`); `.brain/exports/*.md` are git-tracked.
- **decay:** `store.decay(currentSprintNum, decayAfterSprints)`; `decay_exempt=1` for permanent governance (ADRs, identity).
- **Brain auto-query:** Task DNA → relevant ADR/pattern/memory injected at PLAN/SPAWN/EVALUATE.
- **CLI:** `deckent recall "q"`, `deckent remember "note"`, `deckent memory rebuild|export|stats`. **MCP:** `deckent_memory_query`. **Config:** `.deckent/config.json` → `memory.backend`, `memory.search`, `memory.decay_after_sprints`.

Cross-ref: ADR-009 (superseded), ADR-036 (ADR Governance Integration — ADRs injected from DB), `docs/reference/api-surface.md` (Memory V2 DB Schema + Query API), DECKENT.md "Memory V2 — DB-First Architecture".
