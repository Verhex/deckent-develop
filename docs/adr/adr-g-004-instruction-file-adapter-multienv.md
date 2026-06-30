# ADR-G-004: Instruction-File Adapter & Multi-Env Generation

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`ensureDeckentImport` never-overwrite guarantee + `agent-templates.ts` per-env generators + `docs.json` pure-adapter exclusion (ADR-013-W locale-leak fix) → tomorrow=data/registry-driven generator (low-maintenance) + global+project scope
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-013 (DECKENT.md Adapter Pattern), ADR-018 (Multi-Environment Config Generation) · **Supersedes:** —
**Crosswalk:** ADR-013 + ADR-018 → ADR-G-004

---

## Context

Two early decisions converged on one law. ADR-013 (Sprint 15) solved a data-loss bug: `deckent init` used to overwrite `CLAUDE.md`, destroying user customizations. ADR-018 (Sprint 046) solved a breadth problem: every IDE / agent host expects its own instruction file (Claude → `CLAUDE.md`, Codex → `AGENTS.md`, Gemini → `GEMINI.md`, Cursor → `.cursor/rules/deckent.mdc`), in different formats and paths.

Both resolved to the **same pattern**: `DECKENT.md` is the single source of truth, and every host-specific file is a **thin adapter** carrying only an `@DECKENT.md` reference — never deckent-authored content, never overwritten. ADR-018's originally-proposed IDE-specific targets (`config.toml`, `settings.json`, `mcp.json`) converged onto this thin-adapter shape instead.

A Sprint 281 amendment (ADR-013-W) closed a conflict with the managed-docs system (ADR-029 → ADR-G-015): `docs.json` had been listing `CLAUDE.md` / `AGENTS.md` as *managed-docs*, so every sprint's RETRO render stamped Turkish headings onto these English adapters — a recurring **locale-leak** needing manual revert each sprint. The fix: these files are **pure adapters, NOT managed-docs**; remove them from `docs.json` so nothing renders into them and the leak ends at the root.

## Decision (Today)

### 1. Single source + pure adapters
`DECKENT.md` is the one source of truth. `CLAUDE.md`, `AGENTS.md` (+ optional `.codex/AGENTS.md`), `GEMINI.md`, and `.cursor/rules/deckent.mdc` are **pure adapters**: they hold only the injected `@DECKENT.md` reference plus whatever the user writes. They are **never overwritten** and are **not managed-docs** (ADR-013-W) — no sprint render touches them, so no locale-leak.

### 2. Never-overwrite mechanism
`ensureDeckentImport` (`src/core/utils.ts`) idempotently injects/preserves the `@DECKENT.md` reference; `deckent sync` (`src/cli/commands/sync.ts`) re-synchronizes all adapters. Init is idempotent and safe — re-running never clobbers user content.

### 3. Per-environment generation
Per-host generators live in `src/cli/helpers/agent-templates.ts` (`generateAgentsMd`, `generateGeminiMd`, `generateCursorRules`, …). `deckent init --all-envs` provisions every environment's adapter in one command. Each generator is an independent module, so adding an environment is additive today.

| Host | Adapter file (today's real target) |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` (+ optional `.codex/AGENTS.md`) |
| Gemini | `GEMINI.md` |
| Cursor | `.cursor/rules/deckent.mdc` |

## Intent / Roadmap (Tomorrow)

- **Data/registry-driven generator (low-maintenance).** Today each environment is a hand-written generator function. As providers/environments multiply, one hardcoded function per host does not scale — the crosswalk maintenance-note is explicit: move to a **data/registry-driven generator** (one engine + a host registry describing path/format), so a new environment is a registry entry, not new code. This keeps maintenance burden flat as the host matrix grows (Immutable Law #2 — EVERY ENVIRONMENT).
- **Global + project scope.** Adapter generation/sync becomes scope-aware: a global install seeds host adapters at the user-global layer; project init seeds them per-project — consistent with ADR-G-001's layering.
- **Provider-adapter parity.** As the Brain itself becomes provider-agnostic (ADR-G-008, BRAIN-PROVIDER-SELFUPDATE), the instruction-file adapter registry is the doc-side sibling of the provider adapter registry — same registry-driven philosophy.

## Consequences

**(+)** User instruction files are never destroyed; one source (`DECKENT.md`) stays authoritative across every host; the pure-adapter-not-managed-doc rule (ADR-013-W) kills the locale-leak at its root; `--all-envs` gives one-command multi-IDE setup; independent generators make new hosts additive today and a registry will make them trivial tomorrow.

**(−)** Today's per-env generator functions are still hand-maintained (registry-driven is roadmap), so each new host is real code until then; the never-overwrite guarantee depends on `docs.json` keeping these files out of managed-docs — a regression there would reopen the locale-leak (guarded by the ADR-013-W exclusion); scope-aware global+project generation is forward-looking.

## References / Absorbed

- **Absorbs:** ADR-013 (DECKENT.md Adapter Pattern — single-source + thin adapter + never-overwrite), ADR-018 (Multi-Environment Config Generation — per-env generators, `--all-envs`).
- **Implementation:** `src/core/utils.ts` (`ensureDeckentImport`), `src/cli/commands/sync.ts` (`deckent sync`), `src/cli/helpers/agent-templates.ts` (`generateAgentsMd` / `generateGeminiMd` / `generateCursorRules`).
- **Born work-item:** ADR-013-W (pure-adapter / `docs.json` exclusion / locale-leak root-fix); data/registry-driven low-maintenance generator (crosswalk maintenance-note → MASTER-PLAN).
- **Cross-ref:** ADR-G-015 (Managed-Docs — the system these files are deliberately excluded from), ADR-G-001 (Layered Config & Scope), ADR-G-008 (Provider Abstraction — sibling adapter-registry philosophy), Immutable Law #2 (EVERY ENVIRONMENT — cross-platform/host matrix).
- **Direction:** `.analysis/adr-review-crosswalk.md` rows 013, 018.
