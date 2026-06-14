# Documentation Policy — Core Docs & Update Rules

> **Status:** CANONICAL (hand-maintained). Defines which documents are the source of truth, which are auto-generated, which are frozen — and **what to update vs skip during development.**
> **Last reviewed:** 2026-06-14 (Sprint 286).

The #1 rule: **never hand-edit an auto-generated document.** It will be overwritten on the next `deckent` finalize/regen. Fix the *generator/template/data source* instead, then regenerate. The managed-docs registry is `.deckent/docs.json` (ADR-029/030/031).

---

## Tier 1 — Canonical, hand-maintained (edit these directly)

These are the source of truth. Update them by hand when the relevant thing changes.

| Doc | Scope | When to update |
|-----|-------|----------------|
| `docs/MASTER-PLAN.md` | **The single roadmap** — vision, status, F1-F7, sub-projects, work-streams, business, sequencing | Every time roadmap status changes. No other roadmap doc gets status updates. |
| `DECKENT.md` | Product overview, providers, MCP/agent/skill reference, lifecycle guide | When a CLI/MCP/agent/skill capability is added or changed |
| `docs/reference/api-surface.md` | Inter-agent contracts (.tasks/ JSON, result format, phases, lock format) | When a contract/schema changes |
| `docs/adr/NNN-*.md` | Architecture Decision Records (MADR v3) | One per new architectural decision; never rewrite history — supersede with a new ADR |
| `docs/DOC-POLICY.md` | This file | When the doc landscape changes |
| `.claude/rules/*.md` **CUSTOM blocks** | Brain/Auditor/Worker custom rules (between `<!-- CUSTOM-START/END -->`) | Hand-edit only inside CUSTOM markers; AUTO blocks are generated |

---

## Tier 2 — Managed-docs, AUTO-GENERATED (do NOT hand-edit; fix generator + regen)

Registered in `.deckent/docs.json`. Each has `autoSections` (regenerated, overwritten every sprint finalize) and `protectedSections` (hand-maintained prose preserved across regen). **Edit only the protected sections by hand; never touch auto sections.**

| Doc | Auto sections (generated) | Protected sections (hand-editable) |
|-----|---------------------------|-------------------------------------|
| `CLAUDE.md` | Sprint Metrics, Active Debt, Agent Performance, Architecture counts | prose/gotchas (most of the file) |
| `.deckent/workspace/IDENTITY.md` | Project Status table, feature list (code-derived counts) | — (fully generated) |
| `docs/vision/VISION.md` | Deckent by the Numbers, Sprint History, Sprint Metrics | Vision, Mission, Competitive Analysis, Roadmap, Values, Technology Decisions, Target Users |
| `docs/vision/VISION-TR.md` | (same as VISION) | (same, TR) |
| `docs/vision/blueprint.md` | Live Metrics | *(everything else — protectedSections is empty, so the body is preserved hand-content)* |
| `docs/release/beta-tracker.md` / `-tr.md` | gate-status tables | narrative |
| `AGENTS.md` | provider-parity frontmatter, agent/skill tables | — |
| `.deckent/workspace/TOOLS.md` | tool/command tables | — |
| `.deckent/workspace/BOOT.md` | boot sequence | — |
| `.deckent/workspace/WORKER-GUIDE.md` | Anti-Patterns (auto) | .plan File, Heartbeat File, Result File, Error Handling, Scope Rules, Verify Loop, Skill & Agent Context |
| `docs/reference/mcp-tools.md` | full tool list (`npm run docs:ref`) | — |

**Regen triggers:** sprint finalize (managed-doc-runner), `npm run docs:ref` (mcp-tools), `deckent memory export` (`.brain/exports/*`). Auto sections use content-hash caching (ADR-031) — they only re-render when source data changes.

---

## Tier 3 — Auto-generated EXPORTS (never edit; rebuilt from DB)

| Doc | Source | Rule |
|-----|--------|------|
| `.brain/exports/summary.md` | `memory.db` | `deckent memory export` regenerates; loaded into context via `@` |
| `.brain/exports/decisions.md` | `memory.db` (ADR entries) | never hand-edit |
| `.brain/exports/memory.md` | `memory.db` (sprint learnings) | never hand-edit |
| `.brain/exports/debt.md` | `memory.db` (debt table) | never hand-edit |

The DB (`.brain/memory.db`) is the single source of truth for all Brain knowledge — **never deleted** (memory: `feedback_db_silmek_yasak`).

---

## Tier 4 — Historical / frozen (preserved for provenance; do NOT update)

Superseded by MASTER-PLAN; kept with a `SUPERSEDED → MASTER-PLAN` banner. Do not add status here.

- `docs/ROADMAP-GOD-LEVEL.md`, `docs/vision/roadmap.md`, `docs/release/roadmap.md`
- `docs/alperen-analysis/*` (work plans, audits)
- `docs/audits/*`, `docs/superpowers/plans/*`
- `.brain/archive/*`, `.deckent/archive/*`

---

## During development — what to update, what to skip

When a sprint changes the codebase:

1. **New architectural decision?** → add an ADR (`docs/adr/`), insert into `memory.db` (Brain auto-hook). ✅ update
2. **Roadmap status changed?** → update `docs/MASTER-PLAN.md` only. ✅ update
3. **New CLI/MCP/agent/skill capability?** → update `DECKENT.md` reference + the relevant ADR. ✅ update. Counts in IDENTITY/CLAUDE/VISION-numbers regenerate automatically — ⏭️ skip (don't hand-edit).
4. **Contract/schema change?** → update `docs/reference/api-surface.md`. ✅ update
5. **Counts, metrics, sprint history, agent performance, tool lists?** → ⏭️ **skip** — these are auto sections; let the generator/`docs:ref`/`memory export` produce them. Hand-editing is wasted (overwritten).
6. **Vision/Mission/Competitive/Roadmap prose in VISION.md?** → ✅ hand-edit (protected sections), but keep it code-true.
7. **Anything in Tier 4?** → ⏭️ skip (frozen).

**Verification rule (not just numbers/grep):** when updating a Tier-1/protected doc, verify claims by *reading the actual code* (exports, callers, wiring) — not by grep-count alone. A feature with a definition but no runtime caller is "dormant", not "done" (see `feedback_directive_kanit_letter_vs_goal`).

---

## Known doc-code drift (Sprint 286 audit)

Auto-section counts regenerate via managed-docs on every sprint finalize — stale numbers in Tier 2 `autoSections` are expected to self-correct on the next finalize run. Hand-edited `protectedSections` must be updated manually when the underlying feature changes.

If you discover new drift, add it here with the sprint number and fix path (regen vs hand-edit).
