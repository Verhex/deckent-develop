# A07 — Reference CLI Audit

**Scope:** `docs/reference/cli.md` (1152 lines, ~31KB) + `docs/reference/cli-commands.md` (1543 lines, ~49KB)
**Auditor:** doc-writer worker, Sprint 345 task 345-007
**Date:** 2026-06-28
**Method:** Full cross-check of command/flag TABLES against `src/cli/entry.ts` + `src/cli/commands/*.ts` via `.option()` / `.command()` grep. Prose sections skimmed with coverage note.

---

## Coverage Note

**Deep-verified (flag tables):** all 57+ top-level commands registered in `src/cli/index.ts` were located via grep of `.command(...)` and `.option(...)` signatures. Every flag table in the hand-curated sections of both docs was cross-checked against source.

**Skimmed (prose sections):** narrative descriptions, example blocks, and the AUTOGEN flat table (cli.md lines 977-1152) were skimmed for structural correctness and duplicate/phantom entries. Individual prose sentence accuracy was not verified at the word level.

**Not verified:** MCP parity assertions in cli-commands.md MCP Tool Parity Summary (accurate tooling required; out of this audit's scope — covered by ADR-022 linting script `npm run lint:cli-mcp-parity`). REPL slash commands (`/usage`, `/interrogate`, `/resources`) cross-checked only for existence in source.

**Generator scripts identified:**
- `npm run docs:generate-cli` → `scripts/generate-cli-docs.ts` → regenerates `docs/reference/cli.md` hand-curated sections (static template + AST read)
- `npm run docs:ref` → `scripts/gen-reference-docs.mjs` → maintains `<!-- AUTOGEN:START/END id="cli" -->` block in `docs/reference/cli.md`

---

## Findings — `docs/reference/cli.md`

### P0 — Missing entire commands (undocumented in hand-curated sections)

The following commands are registered in `src/cli/index.ts` but have **no dedicated section** in the cli.md hand-curated docs. They appear only as flat rows in the AUTOGEN table (if at all), without flag documentation.

| Command | Source File | Registered at |
|---------|-------------|---------------|
| `gateway` | `src/cli/commands/gateway.ts` | `index.ts:62` |
| `kpi` | `src/cli/commands/kpi.ts` | `index.ts:65` |
| `image` | `src/cli/commands/image.ts` | `index.ts:66` |
| `process` | `src/cli/commands/process.ts` | `index.ts:119` |
| `autonomous-mission` | `src/cli/commands/autonomous-mission.ts` | `index.ts:149` |

**gateway** has subcommands: `listen`, `start`, `stop`, `status`, `pair list/approve/reject` (`gateway.ts:91-157`).
**kpi** has `--sprint`, `--trend`, `-n`, `--json` (`kpi.ts:327-332`).
**image** has subcommand `build` with `--tag`, `--dry-run`, `--with-codex`, `--with-gemini`, `--with-ollama` (`image.ts:234-246`).
**process** has subcommands `submit`, `status`, `result` (`process.ts:132-171`).
**autonomous-mission** has `create-list`, `create-goal`, `list` (`autonomous-mission.ts:208-286`).

---

### P0 — cli.md hand-curated sections: major flag omissions

#### `deckent init` (cli.md:76-98 vs `init.ts:310-323`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `--upgrade` | `init.ts:318` | ✓ |
| `--force` | `init.ts:319` | ✓ |
| `--repair` | `init.ts:320` | ✓ |
| `-y, --yes` | `init.ts:321` | ✗ |
| `--no-install` | `init.ts:322` | ✗ |
| `--no-image` | `init.ts:323` | ✗ |

cli.md only documents 6 flags; source has 12. The 3 CI/install-control flags (`-y`, `--no-install`, `--no-image`) are missing from both docs.

#### `deckent plan` (cli.md:173-194 vs `plan.ts:84-90`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `--dry-run` | `plan.ts:89` | ✓ |
| `--interrogate` | `plan.ts:90` | ✓ |
| `-y, --yes` | `plan.ts:87` | ✗ |

cli.md documents 2 flags; source has 5.

#### `deckent start [description]` (cli.md:146-170 vs `start.ts:160-169`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `--timeout <ms>` | `start.ts:168` | ✓ |
| `--force-directives` | `start.ts:169` | ✓ |
| `--sandbox` | `start.ts:164` | ✗ |

cli.md documents 5 flags; source has 8. `--sandbox` (memory-cap + path-jail isolation, no Docker) is distinct from `--sandbox-mode` (git stash + restore) — neither doc makes this distinction clear.

#### `deckent status` (cli.md:323-345 vs `status.ts:328-337`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `-f, --follow` | `status.ts:331` | ✓ |
| `--no-color` | `status.ts:335` | ✓ |
| `--graph` | `status.ts:336` | ✓ |
| `--mode <mode>` | `status.ts:337` | ✓ |

cli.md documents 4 flags; source has 8.

#### `deckent retro` (cli.md:285-304 vs `retro.ts:336-342`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `--json` | `retro.ts:340` | ✓ |
| `--perf` | `retro.ts:341` | ✓ |
| `--trend [n]` | `retro.ts:342` | ✓ |

cli.md documents 2 flags; source has 5.

#### `deckent dashboard` (cli.md:370-388 vs `dashboard.ts:148-152`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `--no-color` | `dashboard.ts:151` | ✓ |
| `--json` | `dashboard.ts:152` | ✓ |

cli.md documents 1 flag; source has 3.

#### `deckent finalize` (cli.md:219-238 vs `finalize.ts:176-181`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `--sprint <id>` | `finalize.ts:178` | ✓ |
| `--force` | `finalize.ts:181` | ✓ |

cli.md documents 2 flags; source has 4.

#### `deckent serve` (cli.md:928-945 vs `serve.ts:60-66`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `--dev` | `serve.ts:63` | ✓ |
| `--dev-port <number>` | `serve.ts:64` | ✓ |
| `--host <addr>` | `serve.ts:65` | ✗ |
| `--no-terminal` | `serve.ts:66` | ✗ |

cli.md documents 1 flag; source has 5. `--host` and `--no-terminal` missing from both docs.

#### `deckent run <description>` (cli.md:501-519 vs `run.ts:242-250`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `--timeout <ms>` | `run.ts:247` | ✓ |
| `--keep` | `run.ts:248` | ✓ |
| `--auto-approve` | `run.ts:249` | ✓ |
| `--verbose` | `run.ts:250` | ✓ |
| `--model-effort <level>` | `run.ts:245` | ✗ |

cli.md documents 2 flags; source has 7.

#### `deckent models` (cli.md:640-668 vs `models.ts:102-172`)

cli.md lists `--json` and `--provider` on the **parent** `models` command. In source, the parent `models` command has **no flags** — they are on the `list` subcommand only (`models.ts:109-110`). The `tier` subcommand has only `--offline`. cli.md also omits `--offline` entirely from `models list` and `models tier`.

#### `deckent test` (cli.md:198-215 vs `test-run.ts:87-94`)

| Missing Flag | Source Line | In cli-commands.md? |
|---|---|---|
| `--directives <file>` | `test-run.ts:92` | ✓ |
| `--sandbox` | `test-run.ts:93` | ✓ |
| `--model <model>` | `test-run.ts:94` | ✓ |
| `--reporter <format>` | `test-run.ts:95` | ✓ |
| `--min-coverage <percent>` | `test-run.ts:96` | ✓ |

cli.md documents 2 flags; source has 7.

---

### P1 — AUTOGEN block structural issues (cli.md:977-1152)

The `<!-- AUTOGEN:START id="cli" -->` block is maintained by `scripts/gen-reference-docs.mjs`. Issues:

1. **No parent-command context for subcommands.** `deckent list` appears **12+ times** with different descriptions (agents, missions, backlog, checkpoints, authority matrix, config parameters, managed docs, flows, MCP servers, relations, models, plugins, skills) — a new user cannot determine which parent command each belongs to.

2. **Duplicate top-level names.** `deckent cleanup` (2×: sprint cleanup and autonomous sweep), `deckent start` (2×: sprint and autonomous loop), `deckent status` (3×), `deckent history` (2×), `deckent review` (2×), `deckent sync` (2×), `deckent run` (2×). These are subcommands registered under different parents but rendered identically.

3. **Phantom deprecation note.** AUTOGEN row: `deckent web — Start web dashboard with API server (deprecated — use 'deckent serve'`. No `@deprecated` annotation exists in `web.ts:29-32`; the command is active.

4. **Count says "170 commands"** but this number conflates top-level commands and subcommands. True top-level count from `index.ts` imports is ~57 register calls.

---

### P1 — cli.md retro description truncation (cli.md:29, 37)

```
- [`deckent retro`](#retro) — Show the latest sprint retrospective from 
- [`deckent history`](#history) — Show sprint history from 
```

Both lines end mid-sentence (after "from "). The source references (`.brain/RETRO.md`, `.brain/sprints/`) were stripped, likely an escaping/rendering issue in the generator template.

---

## Findings — `docs/reference/cli-commands.md`

### P0 — Phantom flags (documented flags that do NOT exist in source)

#### `deckent archive-debt` (cli-commands.md:1244-1263 vs `archive-debt.ts:17-20`)

| Phantom Flag | Listed In Doc | In Source? |
|---|---|---|
| `--dry-run` | cli-commands.md:1249 | ✗ (not in `archive-debt.ts`) |
| `--max-archive-size <bytes>` | cli-commands.md:1255 | ✗ (not in `archive-debt.ts`) |

Source only has `--count` (`archive-debt.ts:19`) and `--before <sprint>` (`archive-debt.ts:20`). The `--dry-run` and `--max-archive-size` flags appear to be aspirational/planned features never implemented. Running `deckent archive-debt --dry-run` will trigger an "unknown option" Commander error.

---

### P0 — Missing flags in cli-commands.md

#### `deckent serve` (cli-commands.md:1196-1223 vs `serve.ts:60-66`)

| Missing Flag | Source Line |
|---|---|
| `--host <addr>` | `serve.ts:65` |
| `--no-terminal` | `serve.ts:66` |

#### `deckent doctor` (cli-commands.md:431-454 vs `doctor.ts:1391-1400`)

| Missing Flag | Source Line |
|---|---|
| `--providers` | `doctor.ts:1397` |
| `--memory` | `doctor.ts:1398` |
| `--ram-experiment` | `doctor.ts:1399` |

#### `deckent recall` (cli-commands.md:896-917 vs `recall.ts:14-20`)

| Missing Flag | Source Line |
|---|---|
| `--json` | `recall.ts:20` |

#### `deckent run` (cli-commands.md:643-665 vs `run.ts:242-250`)

| Missing Flag | Source Line |
|---|---|
| `--model-effort <level>` | `run.ts:245` |

#### `deckent recover` (cli-commands.md:283-299 vs `recover.ts:121-126`)

| Missing Flag | Source Line |
|---|---|
| `--json` | `recover.ts:126` |

#### `deckent init` (cli-commands.md:72-93 vs `init.ts:310-323`)

| Missing Flag | Source Line |
|---|---|
| `-y, --yes` | `init.ts:321` |
| `--no-install` | `init.ts:322` |
| `--no-image` | `init.ts:323` |

#### `deckent plan` (cli-commands.md:163-183 vs `plan.ts:84-90`)

| Missing Flag | Source Line |
|---|---|
| `-y, --yes` | `plan.ts:87` |

#### `deckent start` (cli-commands.md:136-159 vs `start.ts:160-169`)

| Missing Flag | Source Line |
|---|---|
| `--sandbox` (path-jail isolation) | `start.ts:164` |

Note: `--sandbox-mode` description in cli-commands.md says "Run in sandbox mode (git stash + restore)" — but source `start.ts:163` says "Run in sandbox mode (git stash + restore)" for `--sandbox-mode` and `start.ts:164` has separate `--sandbox` for "Use sandbox spawn backend (memory-cap + path-jail isolation, no Docker required)". The distinction is not documented.

---

### P0 — Missing autonomous subcommands (cli-commands.md:1148-1191 vs `autonomous.ts`)

| Missing Subcommand | Source Location |
|---|---|
| `autonomous enable` | `autonomous.ts:1049` |
| `autonomous plan <goal>` | `autonomous.ts:1079` |
| `autonomous cleanup` | `autonomous.ts:1131` |

`autonomous enable` enables the autonomous mode without requiring manual config edits. `autonomous plan <goal>` decomposes a high-level goal into backlog items (Phase 1). `autonomous cleanup` sweeps stray task-run-* artifacts. None are in the cli-commands.md `autonomous` section.

---

### P0 — Missing commands from cli-commands.md entirely

| Command | Source File | Note |
|---|---|---|
| `gateway` | `src/cli/commands/gateway.ts` | Has `listen/start/stop/status/pair` subcommands |
| `kpi` | `src/cli/commands/kpi.ts` | `--sprint, --trend, -n, --json` |
| `image` | `src/cli/commands/image.ts` | Subcommand `build` with multiple flags |
| `process` | `src/cli/commands/process.ts` | `submit/status/result` subcommands |
| `autonomous-mission` | `src/cli/commands/autonomous-mission.ts` | `create-list/create-goal/list` subcommands |

---

### P1 — Missing agent subcommand and flags

#### `deckent agent` (cli-commands.md:962-987 vs `agent.ts:234-600`)

| Missing | Source Location |
|---|---|
| `agent reclassify` subcommand | `agent.ts:530` |
| `--force` on `agent delete` | `agent.ts:429` |
| `--enable`, `--disable` on `agent edit` | `agent.ts:461-462` |

`reclassify` delta-applies agent/skill stats; it's not a trivial edge case.

---

### P1 — autonomous backlog add: required options not marked as required

cli-commands.md:1166-1181 documents `--id` and `--title` as regular options. In source, they are `.requiredOption()` (`autonomous.ts:1196-1197`) — Commander enforces them at parse time. The doc should reflect that these are **required**.

---

### P1 — Quick Reference table numbering (cli-commands.md:8-66)

Row numbering skips 41 and uses "—" as the row number for `config nervous`. The command count header says "57+ top-level commands + subcommands" but 5+ commands are entirely absent from the table (gateway, kpi, image, process, autonomous-mission).

---

### P1 — cli-commands.md "Last updated Sprint 286" (line 4)

The header says "Last updated Sprint 286" but the current sprint is 345. At minimum 59 sprints of drift. The autonomous commands added since then (autonomous-mission, process mode, gateway, etc.) account for several missing sections.

---

## Generator Drift Analysis

### `docs:generate-cli` (`scripts/generate-cli-docs.ts`)

This script reads CLI metadata and regenerates `docs/reference/cli.md`. However the hand-curated sections appear to use a **static template** that hasn't been re-run since the sprint that generated them, because:
- Flags added in sprints >286 are systematically absent
- The AUTOGEN block is maintained separately and IS fresher

**Recommendation:** `docs:generate-cli` should be run as part of CI (`npm run docs:ref:check` pattern already exists at `package.json:46`) and failures should block merges. A missing flag in the generated doc is a P0 UX regression.

### `docs:ref` / `docs:ref:check` (`scripts/gen-reference-docs.mjs`)

The `<!-- AUTOGEN:START id="cli" -->` block in cli.md is maintained by this script. It IS relatively current but has structural problems with subcommand disambiguation (see P1 findings above). The script should prefix subcommand rows with their parent command.

### `scripts/lint-cli-mcp-parity.mjs`

Exists and can be run with `npm run lint:cli-mcp-parity`. Not invoked by this audit but could catch parity mismatches between the MCP parity table in cli-commands.md and actual tool registration.

---

## Summary Table

| Priority | Doc | Finding | Count |
|----------|-----|---------|-------|
| P0 | cli.md | Commands missing from hand-curated section | 5 |
| P0 | cli.md | Commands with major flag omissions | 10 |
| P0 | cli.md | Flags misplaced on parent vs subcommand | 1 |
| P0 | cli-commands.md | Phantom flags (trigger Commander errors) | 2 |
| P0 | cli-commands.md | Missing flags in detailed sections | 10+ |
| P0 | cli-commands.md | Missing autonomous subcommands | 3 |
| P0 | cli-commands.md | Commands missing from entire doc | 5 |
| P1 | cli.md | AUTOGEN block subcommand disambiguation | 1 |
| P1 | cli.md | AUTOGEN phantom deprecation note | 1 |
| P1 | cli.md | Truncated descriptions (missing file refs) | 2 |
| P1 | cli-commands.md | Missing agent subcommand + flags | 3 |
| P1 | cli-commands.md | Required options not marked required | 1 |
| P1 | cli-commands.md | Quick-ref table numbering + missing entries | 1 |
| P1 | cli-commands.md | Stale "Sprint 286" update date | 1 |

**Verdict:** Both docs are significantly out of date. `cli.md` hand-curated sections are less complete than `cli-commands.md` for the same commands. `cli-commands.md` has the phantom `--dry-run` / `--max-archive-size` P0 defects that will actively mislead users. Five entire commands (gateway, kpi, image, process, autonomous-mission) are undocumented in both files.

---

## Recommended Fix Priority

1. **Immediately (pre-release blocker):** Remove phantom flags from `archive-debt` section in cli-commands.md.
2. **High:** Run `npm run docs:generate-cli` to regenerate cli.md hand-curated sections with current source, then add the 5 missing commands.
3. **High:** Add missing flags to cli-commands.md for serve/doctor/recall/run/recover/init/plan/start.
4. **Medium:** Add gateway, kpi, image, process, autonomous-mission sections to cli-commands.md.
5. **Medium:** Fix AUTOGEN block to prefix subcommand rows with parent command context.
6. **Low:** Fix truncated description lines in cli.md (retro, history index entries).
7. **Ongoing:** Wire `npm run docs:ref:check` to CI to prevent future flag drift.
