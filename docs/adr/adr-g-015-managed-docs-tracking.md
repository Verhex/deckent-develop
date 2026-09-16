# ADR-G-015: Managed-Docs (Core-Gen) + Tracking / Staleness

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=post-finalize self-update hook (ADR-046: UNCONDITIONAL · step-ordering adrInsert→ruleRegen→**deferred guarded memoryExport-last** · FS→DB sync wired, DB→FS reverse test-only) + DCR multi-signal doc-tracking scan (finalize-sync gated default-off) + code-derived module-count (`countModules`, zero-hardcode) — managed-set still includes the CLAUDE/AGENTS host-adapters (→ DOCS-PURE-ADAPTER) → tomorrow=MANAGED-DOCS-MINIMIZE (core-only minimal auto-gen + user-project track-not-write) + DECKENT-LOG (sprint-log→deckent-log multi-mode) + code-drift CI-gate generalized to user projects
**Status:** accepted (amendment — today split: wired self-update + tracking-scan vs migration-pending minimal-core-only / track-not-write / DB→FS-reverse / deckent-log) · **Date:** 2026-06-30 · **Absorbs:** ADR-029 (Managed-Docs Universalization) + ADR-030 (Template Engine + Plugin Loader) + ADR-031 (Content Hash Cache) + ADR-032 (i18n Pattern) + ADR-046 (Brain Self-Update Hook) + ADR-090 (Documentation Tracking & Staleness)
**Crosswalk:** 029 (+030+031+032+046+090) → ADR-G-015

> **Reframe note (Alperen, 2026-06-30):** deckent does NOT auto-write a user's project docs. In a user project, AI tools manage documentation; deckent only **tracks staleness** (DB-queryable: which docs are current, which lag the code). Auto-doc generation is **minimal and deckent-core-only**. The old "sprint-log" becomes **"deckent-log"** (multi-mode, not sprint-only).

---

## Context

deckent maintains a set of managed documents (CLAUDE.md auto-sections, IDENTITY, exports). The machinery (template engine, content-hash cache, i18n pattern, the post-finalize self-update hook with its step-ordering contract and FS↔DB bi-directional sync) was spread across ADR-029/030/031/032/046, and a separate doc-tracking/staleness system (DCR + multi-signal) arrived as ADR-090. The 2026-06-30 review unifies them and applies a key reframe: **minimize auto-generation, and never write a user's project docs — only track their staleness.**

---

## Decision (Today)

### 1. Core-gen — deckent-core-only, minimal (absorbs ADR-029 / ADR-030 / ADR-031 / ADR-032)

```xml
<core-gen scope="deckent-core (target: minimal)" mode="minimal-target">
  template-engine (ADR-030) + content-hash cache (ADR-031: fileHash+entryHash+sprintId,
  sprint-aware) + i18n pattern layer (ADR-032). TODAY docs.json manages ~11 docs:
  deckent-core (IDENTITY · TOOLS · BOOT · WORKER-GUIDE · VISION · blueprint · beta-tracker)
  PLUS the CLAUDE.md/AGENTS.md host-adapters — the latter must be removed (DOCS-PURE-ADAPTER,
  ADR-G-004 P0). "Minimal core-only" is the TARGET (MANAGED-DOCS-MINIMIZE), not yet the state.
</core-gen>
```

### 2. Self-update hook (absorbs ADR-046)

```xml
<self-update-hook>post-finalize hook (ADR-046), UNCONDITIONAL invocation, ground-truth
  verification. Real step-ordering: adrInsert → ruleRegen → guarded memoryExport LAST
  (runPostFinalizeHooks runs with skipMemoryExport:true so the guarded export runs AFTER,
  capturing the post-Step-3 ADR inserts — NOT memoryExport-first). FS↔DB sync is
  one-directional in production: syncAdrFilesToDb (FS→DB) is finalize-wired; exportAdrsToFs
  (DB→FS reverse) is an available helper called only in tests, not finalize-enforced
  (DB-FS-EXPORT-WIRE). This is the mechanism that makes the md+DB ADR-edit invariant safe
  (ADR-G-035).</self-update-hook>
```

### 3. Code-derived module-count — `countModules` (ADR-075 Part-C)

Managed-docs counts are **code-derived, never hardcoded** — the architecture-map module
table is generated live from the actual `src/` tree, so a doc count can never drift from
reality (zero-hardcode / live-data law):

```xml
<module-count source="src/orchestra/managed-docs/content-generators.ts">
  countModules(dir) counts live `.ts` modules per key dir (core · orchestra · agents ·
  nervous · monitor · connectors · providers · api · mcp · cli) → emits the managed-docs
  architecture module-count table from real file counts, never a hardcoded number.
  Companion code-derived counters: mcpToolCount, cliCommandCount (registration-source
  of truth). This is ADR-075 Part-C folded here (Parts A→ADR-G-032, B→ADR-G-006).
</module-count>
```

### 4. Doc tracking & staleness (absorbs ADR-090)

```xml
<tracking scope="all-repos incl. user-project">
  DCR (doc-rank, 0=most-critical) + body content-hash + last_updated + multi-signal
  stale (content-drift + age + code-drift) in a separate doc_tracking table
  (better-sqlite3, additive). CLI `deckent docs track scan|status|sync`; CI-gate
  (CRITICAL_STALE→non-zero); MCP/dashboard health. NOTE: the post-finalize doc-tracking
  sync is GATED on `doc_tracking.sync_on_finalize` (default-OFF) — distinct from the
  ADR-046 self-update hook above (which IS unconditional).
</tracking>
```

### 5. User-project = track-not-write

```xml
<user-project rule="track-not-write (target)">deckent's DIRECTION is to NOT auto-write
  project-specific docs — AI tools do; deckent tracks which are stale/current via the DB.
  Today the tracking subcommands are read/scan-only, but `docs run` / `docs add --auto`
  can still write managed-doc sections — full track-not-write is the active migration
  (MANAGED-DOCS-MINIMIZE), not yet enforced.</user-project>
```

### 6. deckent-log rename (multi-mode)

The "sprint-log" is **to be renamed "deckent-log"** spanning multiple modes (task/process/autonomous/flow/mission/sprint), not sprint-only. Today the code still uses `writeSprintLog` / `SPRINT_LOG` / `.brain/sprints/*.md` (DECKENT-LOG, pending).

---

## Intent / Roadmap (Tomorrow)

- **MANAGED-DOCS-MINIMIZE:** reduce auto-md-updates to the necessary core docs only; remove bulk per-md regeneration; user-project = track-not-write (ADR-090 realization).
- **DECKENT-LOG:** complete the sprint-log → deckent-log rename + multi-mode coverage.
- **Code-drift + CI-gate + MCP/dashboard** (ADR-090 Phase-2, already largely landed) generalized to user projects.
- The MJS template plugin-loader, if ever wired, requires a SkillSandbox (latent security).

---

## Consequences

**(+)** One managed-docs + tracking law; the FS↔DB bi-directional sync is exactly what makes the md+DB ADR-edit method safe (idempotent re-sync). User docs stay the user's (track-not-write) — respects the product-vision boundary. Staleness is machine-detectable across the whole repo.

**(−)** "Minimal auto-gen" is a target (MANAGED-DOCS-MINIMIZE) — the managed-set still includes the CLAUDE/AGENTS host-adapters (DOCS-PURE-ADAPTER, P0) and `docs run`/`add --auto` can still write user docs. The post-finalize doc-tracking sync is gated default-off; the DB→FS reverse export (`exportAdrsToFs`) is test-only (DB-FS-EXPORT-WIRE); the self-update step-order is adrInsert→ruleRegen→memoryExport-last (not memoryExport-first). The deckent-log rename is partial. The plugin-loader is latent (unwired security).

---

## References / Absorbed

- **Absorbs:** ADR-029 + ADR-030 + ADR-031 + ADR-032 + ADR-046 + ADR-090.
- **Cross-ref:** ADR-G-035 (DB sync invariant — the md+DB pair) · ADR-G-019 (ADR export) · ADR-G-004 (instruction-file adapter) · ADR-G-024 (modes — deckent-log multi-mode) · ADR-075 Part-C (code-derived module-count `countModules` — folded here; Parts A→ADR-G-032, B→ADR-G-006).
- **Born / MASTER-PLAN:** MANAGED-DOCS-MINIMIZE (core-only + track-not-write) · DECKENT-LOG (sprint-log→deckent-log rename) · DB-FS-EXPORT-WIRE (wire `exportAdrsToFs` DB→FS into finalize/CLI, or declare available-not-enforced) · DOCS-PURE-ADAPTER (G-004 P0 — remove CLAUDE/AGENTS from docs.json) · I18N-6 (6-lang).
- **Memory:** `project_docs_security_features_redoc` · `project_claude_md_doc_bloat_cleanup`.
