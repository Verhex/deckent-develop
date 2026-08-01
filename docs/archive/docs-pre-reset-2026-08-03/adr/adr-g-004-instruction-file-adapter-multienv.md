# ADR-G-004: Instruction-File Adapter & Multi-Env Generation

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`ensureDeckentImport` never-overwrite guarantee + per-env adapter provisioning + **pure-adapter law** (host instruction files carry NO deckent-authored volatile content, NOT managed-docs) — **✅ code-true (source): `claude-md` + `agents-md` removed from `docs.json` + seed template + inline fallback; auditor `stale_md` mtime detector removed (was a pure-adapter false-positive); regression tests pin all four adapter files out of managed-docs (DOCS-PURE-ADAPTER done 2026-07-01). ⚠️ published binary reflects it only after `dist/` rebuild.** → tomorrow=data/registry-driven generator (low-maintenance) + full pure-adapter alignment + global+project scope
**Status:** accepted (provisional — DOCS-PURE-ADAPTER ✅ done 2026-07-01; remaining: CURSOR-TARGET-UNIFY + agent-templates disposition) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-013 (DECKENT.md Adapter Pattern), ADR-018 (Multi-Environment Config Generation) · **Supersedes:** —
**Crosswalk:** ADR-013 + ADR-018 → ADR-G-004

---

## Context

Two early decisions converged on one law. ADR-013 (Sprint 15) solved a data-loss bug: `deckent init` used to overwrite `CLAUDE.md`, destroying user customizations. ADR-018 (Sprint 046) solved a breadth problem: every IDE / agent host expects its own instruction file (Claude → `CLAUDE.md`, Codex → `AGENTS.md`, Gemini → `GEMINI.md`, Cursor → `.cursor/rules/deckent.mdc`), in different formats and paths.

Both resolved to the **same pattern**: `DECKENT.md` is the single source of truth, and every host-specific file is a **pure adapter** carrying only a `DECKENT.md` reference plus the **user's own** content — never deckent-authored content, never overwritten. ADR-018's originally-proposed IDE-specific targets (`config.toml`, `settings.json`, `mcp.json`) converged onto this thin-adapter shape instead.

A Sprint 281 amendment (ADR-013-W) surfaced a conflict with the managed-docs system (ADR-029 → ADR-G-015): `docs.json` lists `CLAUDE.md` / `AGENTS.md` as **managed-docs**, so every sprint's RETRO render stamps status sections (Sprint Metrics, Agent Performance) — originally with Turkish headings — onto these host instruction files, a recurring **locale-leak**. The **correct root fix is to make these files pure adapters**: a host instruction file (which is the *user's / project's* file) must never carry deckent's volatile orchestration status — that data belongs only in deckent's own surfaces (`.brain/exports/summary.md`, the dashboard, `deckent status`) and is **referenced, not duplicated** into core files.

> **State-of-code (2026-07-01, honest):** this root fix is **DONE (source)**. `claude-md` + `agents-md` were removed from `.deckent/settings/docs.json`, from the seed `docs.json.template` (which now seeds only the deckent-owned `identity-md` surface), and from the inline `seedDocsConfig` fallback in `docs-config.ts`. `tests/core/task-166-005-docs-identity.test.ts` was flipped from *requiring* `agents-md` to a **pure-adapter regression** asserting all four adapter files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/deckent.mdc`) are absent from **both** the live docs.json and the seed template; `docs-add-interactive.test.ts`'s seed assertion was updated the same way. The obsolete auditor `stale_md` mtime detector (which alerted at CLAUDE.md mtime >70 min on the now-repudiated assumption that deckent stamps CLAUDE.md every sprint) was removed with its unit test — legitimate user-doc freshness is already covered by doc-tracking (ADR-090). The already-stamped `§Sprint Metrics`/`§Active Debt`/`§Agent Performance` sections were stripped from the dogfood's own `CLAUDE.md` (keeping the `§Live Status` *reference*) and the `§Agent Performance` table from `AGENTS.md`. **Remaining:** the published binary reflects the seed change only after a `dist/` rebuild (BUILD-GATE); CURSOR-TARGET-UNIFY + AGENT-TEMPLATES-DISPOSITION are still open.

## Decision (Today)

### 1. Single source + pure adapters (no volatile content on host files)
`DECKENT.md` is the one source of truth. `CLAUDE.md`, `AGENTS.md` (+ optional `.codex/AGENTS.md`), `GEMINI.md`, and `.cursor/rules/deckent.mdc` are **pure adapters**: they hold only the injected `DECKENT.md` reference plus whatever the **user** writes. They are **never overwritten** and **must not be managed-docs** — no sprint render, metric, debt table, or agent-performance section is ever stamped into them. Deckent's volatile orchestration status lives **only** in deckent-owned surfaces (`.brain/exports/summary.md`, dashboard, `deckent status`) and host files reference it, never copy it. (This is the constitutional rule; `claude-md`/`agents-md` are removed from `docs.json` by DOCS-PURE-ADAPTER to make it true.)

### 2. Never-overwrite mechanism
`ensureDeckentImport` (`src/core/utils.ts`) idempotently injects/preserves the reference. It is **reference-aware**: *any* mention of `DECKENT.md` satisfies the requirement — the `@DECKENT.md` auto-load import **or** a plain on-demand "see DECKENT.md" — and the `@` auto-load form is prepended **only when no reference exists at all**, so a deliberate on-demand (context-trim) choice is respected, never forced back to auto-load. `deckent sync` (`src/cli/commands/sync.ts`) re-synchronizes all adapters. Init is idempotent and safe — re-running never clobbers user content.

### 3. Per-environment provisioning
Production init provisions adapters **additively** via `applyEnvConfig` → `ensureDeckentImport` (`src/cli/commands/init-steps.ts`), producing pure-adapter files (reference + user content). `deckent init --all-envs` provisions every environment in one command.

> **Legacy surface (not today's enforcement):** `src/cli/helpers/agent-templates.ts` (`generateAgentsMd` / `generateGeminiMd` / `generateCursorRules`) generates **rich** content (project name, commands, rules) — i.e. *not* pure adapters — and has **no production caller** (referenced only by tests). It must not be cited as the live mechanism; its disposition (wire to a correct generator, or mark `@deprecated` / remove) is **AGENT-TEMPLATES-DISPOSITION**.

| Host | Adapter file (single real target) |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` (+ optional `.codex/AGENTS.md`) |
| Gemini | `GEMINI.md` |
| Cursor | `.cursor/rules/deckent.mdc` |

> **Cursor target is currently scattered** — `cursor-config.ts` writes `.cursor/rules/deckent.mdc`, an init message says `.cursor/rules/deckent.md`, and `sync.ts` treats `.cursor/rules` as a *directory* target. CURSOR-TARGET-UNIFY collapses these to the single `.cursor/rules/deckent.mdc` file.

## Intent / Roadmap (Tomorrow)

- **DOCS-PURE-ADAPTER (P0) — ✅ DONE (source, 2026-07-01).** Removed `claude-md` + `agents-md` from `.deckent/settings/docs.json`, the seed `docs.json.template`, and the inline `seedDocsConfig` fallback; flipped `tests/core/task-166-005-docs-identity.test.ts` + `docs-add-interactive.test.ts` and added a regression asserting the four adapter files are **NOT** managed-docs in both docs.json and the template; removed the obsolete auditor `stale_md` detector (+ test) that assumed CLAUDE.md is deckent-stamped; stripped the frozen-stale volatile sections from the dogfood's own CLAUDE.md/AGENTS.md. No information is lost: `.brain/memory.db` is the source of truth for this data and it is surfaced on-demand by `deckent status` / `deckent history` / `deckent retro` + the dashboard (and `.brain/exports/summary.md`, git-tracked, carries the Active-Debt + decisions + learnings slice); git history preserves the old stamps. Removing the entries just stops polluting the user's core instruction files. Pending: `dist/` rebuild for the published binary (BUILD-GATE).
- **CURSOR-TARGET-UNIFY (P1).** Collapse the Cursor target to the single `.cursor/rules/deckent.mdc` file across `init-steps.ts`, `cursor-config.ts`, and `sync.ts` (no `.md` message, no dir-as-file).
- **AGENT-TEMPLATES-DISPOSITION (P1).** Decide the fate of the test-only `agent-templates.ts` rich generators: either make them produce pure adapters (and wire them), or mark `@deprecated` / remove (DEADMOD-style).
- **Data/registry-driven generator (low-maintenance).** Replace one hand-written function per host with a single engine + host registry (path/format), so a new environment is a registry entry, not new code — keeping maintenance flat as the host matrix grows (Immutable Law #2 — EVERY ENVIRONMENT).
- **Global + project scope.** Adapter generation/sync becomes scope-aware: a global install seeds host adapters at the user-global layer; project init seeds them per-project (consistent with ADR-G-001's layering).
- **Provider-adapter parity.** As the Brain becomes provider-agnostic (ADR-G-008), the instruction-file adapter registry is the doc-side sibling of the provider adapter registry — same registry-driven philosophy.

## Consequences

**(+)** User instruction files are never destroyed *and* never polluted with deckent's volatile status — one source (`DECKENT.md`) stays authoritative, status stays in deckent-owned surfaces; the pure-adapter law kills the locale-leak at its true root (host files simply are not render targets); `--all-envs` gives one-command multi-IDE setup; reference-aware injection respects on-demand context-trim.

**(−)** DOCS-PURE-ADAPTER is code-true in **source** but the published binary seeds the old shape until `dist/` is rebuilt (BUILD-GATE). Still open: the Cursor target is scattered (CURSOR-TARGET-UNIFY) and the `agent-templates.ts` generators are test-only legacy (AGENT-TEMPLATES-DISPOSITION). Per-env generators are still hand-maintained until the registry-driven engine lands; scope-aware global+project generation is forward-looking.

## References / Absorbed

- **Absorbs:** ADR-013 (DECKENT.md Adapter Pattern — single-source + thin adapter + never-overwrite), ADR-018 (Multi-Environment Config Generation — per-env provisioning, `--all-envs`).
- **Implementation:** `src/core/utils.ts` (`ensureDeckentImport`, reference-aware), `src/cli/commands/init-steps.ts` (`applyEnvConfig` — real additive path), `src/cli/commands/sync.ts` (`deckent sync`). **Legacy/test-only:** `src/cli/helpers/agent-templates.ts` (rich generators, no prod caller).
- **Born work-items:** **DOCS-PURE-ADAPTER** (P0 — remove `claude-md`/`agents-md` from `docs.json` + seed template + update/add tests; adapters are not managed-docs) · **CURSOR-TARGET-UNIFY** (P1 — single `.cursor/rules/deckent.mdc`) · **AGENT-TEMPLATES-DISPOSITION** (P1 — wire-or-deprecate the test-only generators) · data/registry-driven low-maintenance generator (crosswalk maintenance-note).
- **Cross-ref:** ADR-G-015 (Managed-Docs — the system these host files are deliberately excluded from; legitimate managed-docs like `docs/vision/*` and `beta-tracker` stay), ADR-G-001 (Layered Config & Scope), ADR-G-008 (Provider Abstraction — sibling adapter-registry philosophy), Immutable Law #2 (EVERY ENVIRONMENT).
- **Direction:** `.analysis/adr-review-crosswalk.md` rows 013, 018.
