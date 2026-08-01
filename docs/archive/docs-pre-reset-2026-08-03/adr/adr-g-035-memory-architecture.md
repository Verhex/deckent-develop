# ADR-G-035: Memory Architecture (DB-First, FTS5, Self-Learning Substrate)

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=sync-invariant (any write keeps content_norm + FTS5 + entry_history consistent; audit_hmac is audit-rows-only, NOT every entry; direct SQL UPDATE is a discipline, not enforced — a getRawDb escape hatch exists) + additive idempotent taxonomy migration (never a destructive rebuild; schema_version bump + backup-guard are born, not yet wired) → tomorrow=opt-in local-embedding vector layer (sqlite-vec, never-calls-home) + scope-layers (MEM-2) + index/SLA (MEM-3)
**Status:** accepted (provisional — DB-first+FTS5+exports shipped; taxonomy storage partial + class/scope-aware recall unwired [TAXONOMY-READPATH]; HMAC audit-rows-only; schema_version not bumped) · **Date:** 2026-06-30 · **Absorbs:** ADR-088 (Memory V2 — DB-First) · **Supersedes:** ADR-009 (DEBT.md markdown table — archived)
**Crosswalk:** ADR-088 → ADR-G-035

> **Substrate note:** This is the storage substrate the rest of the governance stands on — ADR-G-019 (class-aware ADR storage/recall/injection), ADR-G-032 (self-learning loop), and the LEARNINGS-QUALITY work all read/write through it. Its schema is **extended here to carry the 4-layer ADR taxonomy** (`adr_class`/`scope`/`immutable`/`source_authority`/`enforcement_level`).

---

## Context

Brain knowledge originally lived as hand-maintained markdown (DEBT.md, MEMORY.md, DECISIONS.md). It did not scale: a 96 KB ADR file, no search, merge conflicts, no decay or history. Memory V2 (old ADR-088) replaced it with a **DB-first** model — SQLite (`better-sqlite3`) is the single source of truth; `.md` files are generated exports for git review/diff. The 2026-06-30 ADR redesign adds a requirement on top: the memory must store the **4-layer ADR taxonomy** (ADR-G-019) class/scope/immutability metadata and support **class/scope-aware recall + injection**.

---

## Decision (Today)

### 1. DB-first, exports are views

All brain knowledge — ADRs, learnings, retros, tech-debt, patterns, identity — is stored **DB-first** in `.brain/memory.db`. `docs/adr/*.md` + `.brain/exports/*.md` (`summary/decisions/memory/debt`) are **generated exports, not sources of truth**. Code reads via `MemoryStore` (`store.getByType('adr')`, `searchMemory(...)`) — never by parsing `.md`. `.brain/memory.db` is gitignored (rebuildable from exports via `memory-import`); `.brain/exports/*.md` are git-tracked.

### 2. Schema (5 tables + FTS5) — extended for the ADR taxonomy

```xml
<schema>
  <table name="entries">
    id, type, source, title, content, summary, *_norm, status, priority,
    sprint_id, sprint_num, lang, decay_exempt, metadata, tenant_id, timestamps,
    audit_prev_hmac, audit_hmac,
    <!-- NEW (ADR-G-019 taxonomy): -->
    adr_class,          <!-- G | D | UG | UP (null for non-ADR entries) -->
    scope,              <!-- global | project -->
    immutable,          <!-- bool -->
    source_authority,   <!-- publisher | contributor | user -->
    enforcement_level   <!-- advisory | runtime | hard -->
  </table>
  <table name="tags"/>
  <table name="relations">references|supersedes|caused_by|resolves|blocks|depends_on</table>
  <table name="entry_history">field-level change tracking</table>
  <table name="schema_version"/>
  <fts5 name="entries_fts">title/content/summary/tag_text + turkishNormalize variants (8 cols)</fts5>
</schema>
```

The new taxonomy columns are **additive + idempotent** (ALTER TABLE guarded by a column-existence check — never a destructive rebuild); FTS5 is preserved. NOTE: `SCHEMA_VERSION` is still `1` (not yet bumped) and there is no automatic backup-guard around the migration (backup is a separate `deckent memory backup` command) → born SCHEMA-VERSION-BUMP.

### 3. Search — dual-layer (class/scope-aware = roadmap)

`searchMemory()` runs **two layers**: original text + `turkishNormalize()` (TR/EN/DE ≈100% recall). Correct FTS5 shape: `SELECT e.* FROM entries_fts f JOIN entries e ON e.rowid=f.rowid WHERE entries_fts MATCH ?`. The **class/scope-aware** intent (ADR-G-019: a user-project worker gets ADR-G always + relevant ADR-UG/UP, never ADR-D; a deckent-dev worker also gets ADR-D) is NOT yet real — the taxonomy read-path is unwired: `rowToEntry()` does not return the `adr_class`/`scope`/`immutable`/`source_authority`/`enforcement_level` columns, `buildFilterClauses()` has no class/scope filter, and `adr-file-sync` does not parse `enforcement_level`. So the write side stores taxonomy (insert-only) but recall/injection is still class-flat → born TAXONOMY-READPATH (shared with ADR-G-019).

### 4. Sync invariant + decay + audit

Any write through `MemoryStore.insert/upsert/update` keeps `content_norm` + FTS5 + `entry_history` consistent; **direct SQL `UPDATE` is discouraged** (misses norm/FTS5) — but this is a discipline, NOT enforced: `getRawDb()` is an escape hatch and a few migration/backfill paths (`memory-import`) do use `UPDATE entries` directly. **Editing an ADR/entry means updating BOTH the `.md` AND the DB** (doc == DB; regenerate exports with `deckent memory export`). `store.decay(currentSprintNum, decayAfterSprints)`; `decay_exempt=1` for permanent governance (ADRs, identity). The HMAC chain (`audit_prev_hmac`/`audit_hmac`, tamper-evident) is applied to **audit rows** via `insertAuditWithHmac`, NOT to every memory-entry write.

### 5. Surfaces

CLI `deckent recall|remember|memory rebuild|export|stats`; MCP `deckent_memory_query`; config `memory.backend/search/decay_after_sprints`. Brain auto-query: Task-DNA → relevant ADR/pattern/memory injected at PLAN/SPAWN/EVALUATE.

---

## Intent / Roadmap (Tomorrow)

- **Opt-in vector layer (MEM):** a local-embedding semantic layer (`sqlite-vec`, Ollama-local embeddings, **never-calls-home**) added *alongside* FTS5 — class/scope-aware semantic recall. Opt-in; FTS5 stays the default (preserves ADR-D-005 dependency discipline + the never-phone-home moat). This was the deliberate "evolve better-sqlite, don't migrate to a vector DB" decision.
- **Scope layers (MEM-2):** project / session / global memory partitions (mirroring the ADR-UG/UP scope split).
- **Index / SLA (MEM-3):** query-index + worker-spawn/recall SLA (PERF-2).
- **LEARNINGS-QUALITY:** Brain Learnings/Gains today read "nice but half-baked / not genuinely learned." Perfect the *content* of the self-learning record (real learned-content, searchable) — for dogfood AND user. (Substrate for ADR-G-032's loop.)

---

## Consequences

**(+)** One SQLite SSOT scales where markdown did not: search, decay, history, HMAC-audit, class/scope-aware ADR injection. The taxonomy columns make ADR-G-019's precedence/immutability machine-enforceable. Exports keep git review/diff. The never-calls-home property is preserved (local embeddings only, when the vector layer lands).

**(−)** `memory.db` is gitignored → rebuildable but not diffable (exports are the diff surface). The dual-write invariant (md + DB) is a discipline contributors must follow. The vector layer is roadmap/opt-in, not today. LEARNINGS-QUALITY is an open quality gap (the loop runs; the content needs to become genuinely-learned).

---

## References / Absorbed

- **Absorbs:** ADR-088 (Memory V2 DB-First). **Supersedes:** ADR-009 (archived).
- **Cross-ref:** ADR-G-019 (ADR taxonomy — these columns store it) · ADR-G-032 (Self-Learning Loop — runs on this substrate) · ADR-G-031 (tenant_id / audit-hmac enterprise) · ADR-D-005 (dependency policy — sqlite-vec opt-in justification).
- **Born work-items:** TAXONOMY-READPATH (rowToEntry + buildFilterClauses class/scope filter + adr-file-sync enforcement_level parse + upsert taxonomy-update → class/scope-aware recall/injection; shared with ADR-G-019) · SCHEMA-VERSION-BUMP (schema_version bump + backup-guard + direct-SQL migration-only API) · LEARNINGS-QUALITY · MEM-2 (scope-layers) · MEM-3 (index/SLA) · vector-layer (opt-in, never-calls-home).
- **Direction:** `.analysis/adr-governance-redesign-plan.md` §5 (DB strategy = better-sqlite evrim).
