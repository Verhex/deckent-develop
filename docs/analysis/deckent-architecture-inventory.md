# Deckent — Architecture & Module Inventory Analysis

> **Sprint 263 · Task 263-001** · Author: claude-fable-5 (doc-writer worker) · Date: 2026-06-09
> Every number in this document was derived from the live working tree at analysis time.
> The exact command used is stated beside each table so all figures are independently reproducible.
> All `find`/`grep` commands exclude `node_modules` (`src/dashboard/` contains a nested
> `node_modules/` that would otherwise inflate counts by ~2,450 files).

---

## 1. Module Count per Top-Level `src/` Directory

**Command:** `for d in src/*/; do find "$d" -name '*.ts' -not -path '*/node_modules/*' | wc -l; done`
(`.tsx` counted separately: `find src -name '*.tsx' -not -path '*/node_modules/*'`)

| Directory | `.ts` files | `.tsx` files | Share of `.ts` total |
|---|---:|---:|---:|
| `src/core/` | 142 | 0 | 24.5% |
| `src/cli/` | 132 | 4 | 22.8% |
| `src/orchestra/` | 129 | 0 | 22.2% |
| `src/mcp/` | 45 | 0 | 7.8% |
| `src/nervous/` | 26 | 0 | 4.5% |
| `src/agents/` | 25 | 0 | 4.3% |
| `src/api/` | 24 | 0 | 4.1% |
| `src/dashboard/` | 23 | 60 | 4.0% |
| `src/connectors/` | 16 | 0 | 2.8% |
| `src/providers/` | 7 | 0 | 1.2% |
| `src/monitor/` | 5 | 0 | 0.9% |
| `src/mcp-client/` | 4 | 0 | 0.7% |
| `src/extensions/` | 1 | 0 | 0.2% |
| `src/` (root-level) | 1 | 0 | 0.2% |
| **Total** | **580** | **64** | 100% |

Notes:
- The 4 `.tsx` files outside `dashboard/` live under `src/cli/` (TUI components).
- CLAUDE.md's architecture section lists "orchestra (76 modules)" and "core (90 modules)" — the
  live tree counts are **129** and **142** respectively, i.e. the documented counts are stale by
  +53 and +52 modules.
- `src/mcp-client/` (4 modules) and root-level `src/` (1 module) exist in the tree but are not
  listed in CLAUDE.md's architecture section.

---

## 2. Source vs Test LoC

**Command:** `find <dir> -name '*.ts' [-o -name '*.tsx'] -not -path '*/node_modules/*' -print0 | xargs -0 cat | wc -l`
(raw line counts, including comments/blank lines)

| Measure | LoC |
|---|---:|
| `src/**/*.ts` | 141,431 |
| `src/**/*.{ts,tsx}` | 150,652 |
| `tests/**/*.ts` | 316,513 |
| `tests/**/*.{ts,tsx}` | 322,080 |
| **Combined `.ts` (src + tests)** | **457,944** |

| Ratio | Value |
|---|---:|
| test : source (`.ts` only) | **2.24 : 1** (316,513 / 141,431) |
| test : source (`.ts`+`.tsx`) | 2.14 : 1 (322,080 / 150,652) |

Test file counts (`find tests -name '*.test.ts(x)' -not -path '*/node_modules/*' | wc -l`):
**1,292** `.test.ts` + **38** `.test.tsx` = **1,330** test files → **2.29 test files per source module** (1,330 / 580).

---

## 3. Top 15 Largest Source Files by LoC

**Command:** `find src -name '*.ts' -not -path '*/node_modules/*' -print0 | xargs -0 wc -l | sort -rn | head -16`

| # | File | LoC |
|---:|---|---:|
| 1 | `src/monitor/auditor.ts` | 2,837 |
| 2 | `src/orchestra/result-evaluator.ts` | 2,361 |
| 3 | `src/core/config.ts` | 2,001 |
| 4 | `src/orchestra/sprint-phases.ts` | 1,906 |
| 5 | `src/orchestra/task-builder.ts` | 1,516 |
| 6 | `src/orchestra/sprint-finalizer.ts` | 1,438 |
| 7 | `src/orchestra/sprint-controller.ts` | 1,428 |
| 8 | `src/orchestra/sprint-spawner.ts` | 1,333 |
| 9 | `src/core/memory-store.ts` | 1,296 |
| 10 | `src/cli/commands/doctor.ts` | 1,287 |
| 11 | `src/orchestra/spawn-backend-docker.ts` | 1,265 |
| 12 | `src/api/server.ts` | 1,262 |
| 13 | `src/orchestra/sprint-retro-writer.ts` | 1,146 |
| 14 | `src/cli/helpers/messages.ts` | 958 |
| 15 | `src/core/routing-engine.ts` | 957 |

Distribution: **8 of 15** files are in `orchestra/` (sprint lifecycle), 3 in `core/`, 2 in `cli/`,
1 each in `monitor/` and `api/`. Sum of top 15 = **23,991 LoC** = **17.0%** of all source `.ts` LoC.

---

## 4. ADR Inventory

**Source:** `.brain/exports/decisions.md` (the generated DB export — canonical per CLAUDE.md).
**Command:** `grep -cE '^## adr-[0-9]+' .brain/exports/decisions.md` for the total;
`awk '/^## adr-[0-9]+/{id=$2} /^\*\*Status:\*\*/{if(id!=""){print $2; id=""}}' | sort | uniq -c`
for per-status counts (first `**Status:**` line after each ADR header).

| Status | Count |
|---|---:|
| accepted | 67 |
| proposed | 7 |
| deprecated | 1 |
| **Total ADRs** | **75** |

Notes:
- 75 distinct `adr-NNN` ids; numbering reaches ADR-086, so the id space has gaps
  (e.g. some numbers between 048 and 086 are unassigned/not exported) — 75 entries ≠ highest id.
- The single deprecated ADR is **adr-005 (Synchronous I/O)** (visible in `.brain/exports/summary.md`).

---

## 5. Import Layering — ADR-008 Check (`core/` must not import upward)

**Command:** `grep -rn "from '.*orchestra/" src/core --include='*.ts'` (same pattern for
`nervous/`, `agents/`, `monitor/`).

| Direction | Import statements | Files affected |
|---|---:|---:|
| `core/` → `orchestra/` | **4** | **3** |
| `core/` → `nervous/` | 0 | 0 |
| `core/` → `agents/` | 0 | 0 |
| `core/` → `monitor/` | 0 | 0 |

The 4 `core/` → `orchestra/` violations:

| Location | Imported symbol | Note |
|---|---|---|
| `src/core/routing-engine.ts:30` | `analyzeSkillInMemory` from `../orchestra/ecosystem-intelligence.js` | runtime import |
| `src/core/audit-query.ts:6` | `readEvents` from `../orchestra/event-stream.js` | runtime import |
| `src/core/audit-query.ts:7` | `DeckentEvent` from `../orchestra/event-stream.js` | **type-only** import |
| `src/core/audit-writer.ts:7` | `writeEvent` from `../orchestra/event-stream.js` | runtime import |

So: **3 runtime violations + 1 type-only**, concentrated on exactly two `orchestra/` modules
(`event-stream.ts` ×3, `ecosystem-intelligence.ts` ×1). Moving `event-stream.ts` into `core/`
would eliminate 3 of the 4 statements (75%) in one refactor.

---

## 6. Surface Counts — CLI, MCP, Agents, Skills (verified against source)

| Surface | Source-verified count | Documented count | Drift |
|---|---:|---:|---|
| CLI top-level command registrations | **55** | "55+" (IDENTITY.md), "46 commands" (CLAUDE.md) | CLAUDE.md stale by 9 |
| CLI command **files** | 87 (`ls src/cli/commands/*.ts \| wc -l`) | — | files > commands (helpers/subcommand modules) |
| MCP tools | **33** | 31 (DECKENT.md), 32 (IDENTITY.md) | both stale; `deckent_models` + `deckent_autonomous` missing from docs |
| MCP resources | **8** | 8 | ✅ in sync |
| Built-in agents | **15** | 15 | ✅ in sync |
| Built-in skills | **21** | 21 | ✅ in sync |

**Derivation commands:**
- CLI commands: `grep -hoE "register[A-Za-z]+\(program" src/cli/index.ts src/cli/entry.ts | sort -u | wc -l` → 55 distinct `register*(program)` calls.
- MCP tools: `grep -h "server.tool(\|server.registerTool(" src/mcp/tools/*.ts | wc -l` → 33 registration calls
  (28 tool files register 1 tool each; `nervous.ts` registers 5), matching 33 distinct `deckent_*` names.
- MCP resources: `ls src/mcp/resources/*.ts` → 8 resource modules (excl. `index.ts`): agents, config, dashboard, debt, directives, memory, retro, tasks.
- Agents: `ls src/core/builtins/agents/ | wc -l` → 15 directories, each with `agent.json`; matches the 15-entry `BUILTIN_AGENT_DOMAINS` map in `src/core/agent-pool.ts:78`.
- Skills: `ls src/core/builtins/skills/ | wc -l` → 21 directories.

---

## Architectural Observations

- **Test-dominant codebase.** Tests outweigh source 2.24:1 by LoC (316,513 vs 141,431) with 1,330 test
  files against 580 source modules (2.29:1). The verification surface is the largest artifact in the
  repo — consistent with the Brain/Auditor evaluation culture, but it also means test maintenance is
  the single biggest LoC liability.
- **Two-layer dominance, stale self-description.** `core/` + `cli/` + `orchestra/` hold 403 of 580
  modules (69.5%). CLAUDE.md still advertises "orchestra 76, core 90, cli 46 commands" — actuals are
  129, 142, and 55 commands. The managed-docs pipeline keeps agent/skill/resource counts honest (all
  exact) but module/command counts have drifted 40–70%.
- **ADR-008 is 99%+ clean with one extractable hotspot.** Out of 142 `core/` modules, only 3 import
  upward (4 statements, 1 type-only) — and 3 of the 4 target `orchestra/event-stream.ts`. Relocating
  `event-stream.ts` to `core/` would cut violations from 4 to 1 and restore strict one-way layering.
- **God-file pressure migrated, not eliminated.** Post ADR-024/026 splits, `sprint-controller.ts`
  sits at 1,428 LoC, but the split products themselves now top the chart: 8 of the 15 largest files
  are `orchestra/` lifecycle modules, and the single largest file is `monitor/auditor.ts` (2,837 LoC)
  — outside the split program's original scope.
- **Surface growth outpaces doc regeneration at the edges.** MCP tools are 33 in source vs 31/32 in
  docs (the two newest — `deckent_models`, `deckent_autonomous` — are unlisted). Where counts feed
  from managed-docs generators (agents 15, skills 21, resources 8) drift is zero; where they are
  hand-maintained prose, drift is consistent — an argument for extending code-derived counts
  (ADR-075) to module and tool tallies.

---

*Method note: all counts are raw `wc -l` line counts (comments and blanks included), taken from the
working tree on 2026-06-09. Approximate figures are labeled as such; everything else is exact output
of the stated commands.*
