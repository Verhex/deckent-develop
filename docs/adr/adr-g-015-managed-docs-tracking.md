# ADR-G-015: Managed-Docs (Core-Gen) + Tracking / Staleness

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** post-finalize hook (unconditional invocation) + doc-tracking scan
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-029 (Managed-Docs Universalization) + ADR-030 (Template Engine + Plugin Loader) + ADR-031 (Content Hash Cache) + ADR-032 (i18n Pattern) + ADR-046 (Brain Self-Update Hook) + ADR-090 (Documentation Tracking & Staleness)
**Crosswalk:** 029 (+030+031+032+046+090) → ADR-G-015

> **Reframe note (Alperen, 2026-06-30):** deckent does NOT auto-write a user's project docs. In a user project, AI tools manage documentation; deckent only **tracks staleness** (DB-queryable: which docs are current, which lag the code). Auto-doc generation is **minimal and deckent-core-only**. The old "sprint-log" becomes **"deckent-log"** (multi-mode, not sprint-only).

---

## Context

deckent maintains a set of managed documents (CLAUDE.md auto-sections, IDENTITY, exports). The machinery (template engine, content-hash cache, i18n pattern, the post-finalize self-update hook with its step-ordering contract and FS↔DB bi-directional sync) was spread across ADR-029/030/031/032/046, and a separate doc-tracking/staleness system (DCR + multi-signal) arrived as ADR-090. The 2026-06-30 review unifies them and applies a key reframe: **minimize auto-generation, and never write a user's project docs — only track their staleness.**

---

## Decision (Today)

```xml
<managed-docs>
  <core-gen scope="deckent-core-only" mode="minimal">
    template-engine + content-hash cache (fileHash+entryHash+sprintId, sprint-aware) +
    i18n pattern layer. Generates only NECESSARY core docs (not a bulk md-sweep).
  </core-gen>
  <self-update-hook>post-finalize step-ordering contract (memoryExport → adrInsert →
    ruleRegen), UNCONDITIONAL invocation, ground-truth verification, and FS↔DB
    BI-DIRECTIONAL sync (syncAdrFilesToDb forward + exportAdrsToFs reverse) — the
    mechanism that makes the md+DB ADR-edit invariant safe (ADR-G-035).</self-update-hook>
  <tracking scope="all-repos incl. user-project">
    DCR (doc-rank, 0=most-critical) + body content-hash + last_updated + multi-signal
    stale (content-drift + age + code-drift) in a separate doc_tracking table
    (better-sqlite3, additive). CLI `deckent docs track scan|status|sync`; CI-gate
    (CRITICAL_STALE→non-zero); MCP/dashboard health.
  </tracking>
  <user-project rule="track-not-write">deckent does NOT auto-write project-specific
    docs — AI tools do; deckent tracks which are stale/current via the DB.</user-project>
</managed-docs>
```

The "sprint-log" is renamed **"deckent-log"** and spans multiple modes (task/process/autonomous/flow/mission/sprint), not sprint-only.

---

## Intent / Roadmap (Tomorrow)

- **MANAGED-DOCS-MINIMIZE:** reduce auto-md-updates to the necessary core docs only; remove bulk per-md regeneration; user-project = track-not-write (ADR-090 realization).
- **DECKENT-LOG:** complete the sprint-log → deckent-log rename + multi-mode coverage.
- **Code-drift + CI-gate + MCP/dashboard** (ADR-090 Phase-2, already largely landed) generalized to user projects.
- The MJS template plugin-loader, if ever wired, requires a SkillSandbox (latent security).

---

## Consequences

**(+)** One managed-docs + tracking law; the FS↔DB bi-directional sync is exactly what makes the md+DB ADR-edit method safe (idempotent re-sync). User docs stay the user's (track-not-write) — respects the product-vision boundary. Staleness is machine-detectable across the whole repo.

**(−)** "Minimal auto-gen" is a reframe to implement (born: MANAGED-DOCS-MINIMIZE); some bulk-md generation still exists. The deckent-log rename is partial. The plugin-loader is latent (unwired security).

---

## References / Absorbed

- **Absorbs:** ADR-029 + ADR-030 + ADR-031 + ADR-032 + ADR-046 + ADR-090.
- **Cross-ref:** ADR-G-035 (DB sync invariant — the md+DB pair) · ADR-G-019 (ADR export) · ADR-G-004 (instruction-file adapter) · ADR-G-024 (modes — deckent-log multi-mode).
- **Born / MASTER-PLAN:** MANAGED-DOCS-MINIMIZE · DECKENT-LOG · I18N-6 (6-lang).
- **Memory:** `project_docs_security_features_redoc` · `project_claude_md_doc_bloat_cleanup`.
