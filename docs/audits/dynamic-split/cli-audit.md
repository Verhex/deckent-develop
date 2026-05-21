# CLI Audit — `src/cli/`

**Sprint:** 185 (rerun)
**Task:** 185-003
**Scope:** `src/cli/` (entry, commands, helpers) — 92 TypeScript files, ~20 153 LoC
**Auditor model:** opus (doc-only, no code changes)
**Date:** 2026-05-21
**Output:** read-only audit; ADR-010/011/012/022 cross-check + CLI/MCP parity table

---

## 1. Inventory

### 1.1 Tree

| Folder | Files | LoC | Notes |
|--------|------:|----:|-------|
| `src/cli/` (root) | 5 | ~310 | Entry point + program builder + helpers shims |
| `src/cli/commands/` | 57 | ~17 000 | Command modules + per-domain split helpers |
| `src/cli/helpers/` | 35 | ~3 100 | Cross-cutting CLI helpers (output, prompt, i18n…) |
| **TOTAL** | **97** | **~20 153** | wc -l reports 20 153 across the three folders |

### 1.2 Root files (`src/cli/*.ts`)

| File | LoC | Purpose |
|------|----:|---------|
| `entry.ts` | 40 | `#!/usr/bin/env node` shim → Node v24 guard → `buildProgram().parseAsync()` → SIGINT/SIGTERM graceful shutdown via `interruptActiveSprint()` + `killAllSessions()` |
| `index.ts` | 122 | `buildProgram()` — exclusively imports `commander.Command` + 47× `register*` symbols + `showSplash` |
| `auto-setup.ts` | 112 | Pure data helper — `generateSetupRecommendation()` (no `register*`, no commander) |
| `version-info.ts` | 36 | `buildVersionJson()` / `buildVersionString()` for `--version` and `--version-json` |
| (no `*.test.ts` in root — tests live under `tests/cli/`) | – | – |

### 1.3 Command modules (`src/cli/commands/*.ts`)

**Registered (48 register exports → 47 wired in `index.ts`):**

| Command file | LoC | Register fn | Wired in index.ts |
|--------------|----:|-------------|-------------------|
| `init.ts` | 377 | `registerInit` | ✅ |
| `init-wizard.ts` | 171 | (split helper, no register) | — |
| `init-steps.ts` | 702 | (split helper) | — |
| `init-templates.ts` | 634 | (split helper) | — |
| `set-directives.ts` | 84 | `registerSetDirectives` | ✅ |
| `plan.ts` | 112 | `registerPlan` | ✅ |
| `start.ts` | 449 | `registerStart` | ✅ |
| `quick-start.ts` | 84 | (helper for start, no register) | — |
| `status.ts` | 451 | `registerStatus` | ✅ |
| `attach.ts` | 78 | `registerAttach` | ✅ |
| `spawn.ts` | 144 | `registerSpawn` | ✅ |
| `kill.ts` | 326 | `registerKill` | ✅ |
| `retro.ts` | 453 | `registerRetro` | ✅ |
| `retro-parser.ts` | 213 | (split helper) | — |
| `retro-formatter.ts` | 111 | (split helper) | — |
| `cleanup.ts` | 254 | `registerCleanup` | ✅ |
| `doctor.ts` | 1 080 | `registerDoctor` | ✅ |
| `doctor-checks.ts` | 480 | (split helper) | — |
| `doctor-format.ts` | 359 | (split helper) | — |
| `config.ts` | 269 | `registerConfig` | ✅ |
| `config-nervous.ts` | 415 | `registerConfigNervous` | ✅ |
| `history.ts` | 309 | `registerHistory` | ✅ |
| `plugin.ts` | 243 | `registerPlugin` | ✅ |
| `upgrade.ts` | 386 | `registerUpgrade` | ✅ |
| `onboard.ts` | 237 | `registerOnboard` | ✅ |
| `analyze.ts` | 44 | `registerAnalyze` | ✅ |
| `archive-debt.ts` | 199 | `registerArchiveDebt` | ✅ |
| `dashboard.ts` | 213 | `registerDashboard` | ✅ |
| `serve.ts` | 140 | `registerServe` | ✅ |
| `web.ts` | 59 | `registerWeb` | ✅ |
| `sync.ts` | 534 | `registerSync` | ✅ |
| `watch.ts` | 177 | `registerWatch` | ✅ |
| `run.ts` | 332 | `registerRun` | ✅ |
| `test-run.ts` | 271 | `registerTestRun` | ✅ |
| `agent.ts` | 534 | `registerAgent` | ✅ |
| `skill.ts` | 656 | `registerSkill` | ✅ |
| `skill-marketplace.ts` | 271 | `registerSkillMarketplace` | ⛓ nested under `registerSkill` |
| `review.ts` | 311 | `registerReview` | ✅ |
| `finalize.ts` | 193 | `registerFinalize` | ✅ |
| `explain.ts` | 434 | `registerExplain` | ✅ |
| `heartbeat.ts` | 84 | `registerHeartbeat` | ✅ |
| `checkpoint.ts` | 153 | `registerCheckpoint` | ✅ |
| `docs.ts` | 157 | `registerDocs` | ✅ |
| `output.ts` | 139 | `registerOutput` | ✅ |
| `cost.ts` | 245 | `registerCostCommand` | ✅ |
| `recall.ts` | 57 | `registerRecall` | ✅ |
| `remember.ts` | 46 | `registerRemember` | ✅ |
| `memory.ts` | 231 | `registerMemory` | ✅ |
| `resume.ts` | 147 | `registerResume` | ✅ |
| `help.ts` | 141 | `registerHelp` (command name `help-info` alias `info`) | ✅ |
| `nervous.ts` | 668 | `registerNervous` | ✅ |
| `mode.ts` | 125 | `registerMode` | ✅ |
| `features.ts` | 148 | `registerFeatures` | ✅ |
| `audit.ts` | 44 | `registerAudit` | ✅ |
| `audit-verify.ts` | 57 | `registerAuditVerify` | ✅ |
| `recover.ts` | 167 | `registerRecover` | ✅ |

**Cross-check counts** (verifying ADR-012 register surface):

```
$ grep -c 'register[A-Z][A-Za-z]*(program' src/cli/index.ts         → 47
$ grep -l 'export function register' src/cli/commands/*.ts | wc -l   → 48
```

The +1 delta is `skill-marketplace.ts:registerSkillMarketplace(parentCmd: Command)` — wired as a sub-command of `registerSkill()` rather than at the program level. Pattern intact (still receives a `Command`).

### 1.4 Helper modules (`src/cli/helpers/*.ts`) — 35 files

| Cluster | Files | Purpose |
|---------|-------|---------|
| I/O & formatting | `output.ts` (647), `output-mode.ts` (78), `terminal-utils.ts` (75), `ansi.ts` (29), `theme.ts` (93), `messages.ts` (358), `i18n.ts` (108) | `print/printError/formatTable/formatSprintSummary`, ANSI escape codes, TR/EN i18n |
| Sprint summary | `sprint-summary.ts` (121), `sprint-summary-rich.ts` (420), `sprint-comparison.ts` (74), `change-categorizer.ts` (102), `status-renderer.ts` (379), `worker-status.ts` (88), `queue-display.ts` (53), `progress.ts` (74), `progress-persistence.ts` (108), `eta-calculator.ts` (61) | Sprint dashboard + status rendering primitives |
| Review/debt | `review-actions.ts` (106), `review-summary.ts` (126), `selective-retry.ts` (90), `debt-counter.ts` (38), `recommendations.ts` (96), `hints.ts` (58) | Review evaluation + technical-debt counters |
| Provider config | `codex-config.ts` (108), `gemini-config.ts` (63), `cursor-config.ts` (89), `config-reader.ts` (20) | Per-IDE / per-provider config writers (`~/.codex/config.json` etc.) |
| Wizard / prompt | `wizard.ts` (354), `prompt.ts` (61), `splash.ts` (61) | TUI wizards, banner ASCII art |
| Agent / runtime | `agent-performance.ts` (76), `agent-templates.ts` (95), `dashboard-dir.ts` (30), `process.ts` (22), `error-handler.ts` (84) | `resolveProjectRoot`, error formatting, agent templates |

No helper exports a `register<Name>` function (correct — ADR-012 applies to commands, not helpers).

---

## 2. Bağlam (Context)

The `src/cli/` directory is the user-facing entry point for the `deckent` binary. Three layers:

1. **`entry.ts`** — npm `bin` shim (per `package.json:bin`). Pinned to Node ≥ 24 (`engines.node = ">=24.0.0"`). Owns the only process-level signal handlers and `unhandledRejection` net.
2. **`index.ts:buildProgram()`** — Pure commander assembly: builds a `Command`, attaches `-V/--version` listeners, then dispatches to 47 register functions. **No `parseAsync` here** — the entry shim owns parsing. This split is the linchpin that makes the entire CLI testable in isolation (tests instantiate `buildProgram()` and call `parseAsync(['node','deckent','status','--json'])` against an in-process program).
3. **`commands/*.ts`** — One file per top-level command, each exporting `registerX(program: Command)` (ADR-012). Larger commands (`init`, `doctor`, `retro`, `nervous`) are split into per-concern siblings (`init-steps`, `init-templates`, `init-wizard`, `doctor-checks`, `doctor-format`, `retro-parser`, `retro-formatter`, `config-nervous`). The split helpers do **not** export `register*` — they are pure functions consumed by the parent command.

**Cross-system role:**
- CLI is one of three runtime surfaces: CLI (this directory), MCP (`src/mcp/`), HTTP API (`src/api/`). All three reuse the orchestra/core layer, but CLI is the canonical surface — MCP and HTTP map subsets onto the same orchestra calls (e.g. `runSprint`, `runRecovery`, `runSelfAuditGate`).
- Per ADR-022-V2, **all MCP tools must have a CLI equivalent**, but CLI-only tools (tmux `attach`, web/serve UI launchers, `plugin`, `upgrade`, `onboard` wizards) are intentional — they touch infrastructure that MCP transport cannot meaningfully drive.
- Per ADR-008, CLI imports only from `core/`, `orchestra/`, `monitor/`, `agents/`, `api/` — never the inverse. Spot-checked: `kill.ts` imports `tmux`, `spawn-backend`, `sprint-pid-manager`, `sprint-controller`, `event-stream` — all one-way.

**Build/test:**
- `tsc --noEmit` covers the whole tree (ESM Node16 module resolution per ADR-002, `.js` extensions in imports). All inspected files comply.
- `vitest` test files live under `tests/cli/*.test.ts` (out of scope for this audit; not modified).

---

## 3. Debt & Risk

### 3.1 Confirmed risks

| ID | Severity | Location | Description |
|----|----------|----------|-------------|
| **R-1 — Stale ADR-011 violations** | LOW | `commands/memory.ts:4`, `helpers/wizard.ts:3` | Both files import `createInterface` from `'node:readline'` (callback API) instead of `'node:readline/promises'` mandated by ADR-011. Functional impact nil, but ADR header on `config-nervous.ts:6` explicitly cites the promise-based variant — this is drift. Two correct usages (`helpers/prompt.ts:1`, `commands/config-nervous.ts:9`) confirm the standard exists. Fix is a 1-line import swap + async wrapper. |
| **R-2 — `doctor.ts` god object** | MEDIUM | `commands/doctor.ts` (1 080 LoC) | Doctor was partially split into `doctor-checks.ts` (480) + `doctor-format.ts` (359), but the parent file still carries the third-largest LoC count in `src/cli/`. The `runDoctorChecks()` symbol is imported by `init.ts` and `start.ts` — refactor must preserve that export. Status-renderer + agent-templates + system-profile dependencies sprawl. Risk on future change cycles. |
| **R-3 — `start.ts` write-path leakage** | MEDIUM | `commands/start.ts:42-62` | `start.ts` writes/reads `.deckent/provider-cache.json` directly. This persistence concern belongs in `core/` (single source of cache truth), not in a CLI command. As long as no other surface (MCP/API) reads this cache, it is dormant; once they do, the parallel implementations will drift. |
| **R-4 — `web.ts` superseded but still registered** | LOW | `commands/web.ts` (59 LoC) | `web.ts` is a thinner predecessor of `serve.ts`. Both call `createHttpServer` but `serve.ts` adds embedded PTY terminal, `--host` binding, dev-proxy, and MIME-type extension. `web.ts` has no equivalent and overlaps. If kept, document the split; if not, fold into `serve.ts` with a `--legacy-web` alias. |
| **R-5 — `register` count drift surface** | LOW | `index.ts` (47 register calls) vs `commands/` (48 register exports) | Static delta is benign today (`registerSkillMarketplace` nests). But there is no compile-time assertion that all `register*` exports are wired into `buildProgram()`; future additions can ship dead code. A simple lint script (`grep -l 'export function register' commands/*.ts` ↔ `grep 'register*(program' index.ts`) could be wired into CI. |
| **R-6 — `output.ts` helper at 647 LoC** | MEDIUM | `helpers/output.ts` | Mixes pure formatters (`formatTable`, `formatSprintSummary`, `formatDoctorResult`) with print primitives (`print`, `printError`) and ANSI/no-color logic (`isNoColor`, `stripAnsi`). Most-imported helper in the whole tree → highest-leverage split candidate. |
| **R-7 — `sync.ts` does both file sync and git inspection** | LOW | `commands/sync.ts` (534 LoC) | `spawnSync('git', ...)` is invoked from CLI rather than via a shared git wrapper in `core/`. Other commands also shell out to git (`upgrade.ts`, `cleanup.ts`, `attach.ts`) — recurring pattern with no central abstraction. |
| **R-8 — `nervous.ts` reaches into `nervous/`** | LOW | `commands/nervous.ts:19` | `import { getActiveDirectivesProtection } from '../../nervous/observer.js'` — CLI directly couples to a specific nervous-system internal. Acceptable today (single caller) but is the kind of import that, multiplied, would let CLI gate the nervous system's evolution. |
| **R-9 — `quick-start.ts` deletes user files** | LOW | `commands/quick-start.ts` (`cleanupZeroConfig`) | Removes the temp `DIRECTIVES.md` it created on failure paths. If a real `DIRECTIVES.md` is present it returns `alreadyExisted=true` and skips deletion — protective, but the only safety net is logic, not file-system primitives (no `.tmp` extension, no metadata marker). |
| **R-10 — `audit-verify` and `audit` are colocated but unrelated** | INFO | `commands/audit.ts` (Self-Audit Gate) vs `commands/audit-verify.ts` (HMAC chain verify) | Different domains sharing the `audit` prefix. Future grep/IDE searches will conflate. |

### 3.2 Risk-free notes

- 48 of 48 register functions follow the `register<Name>(program: Command): void` signature exactly (verified via `grep -E '^export function register'`). ADR-012 contract intact.
- All inspected files use ESM `.js` import suffixes; no CommonJS/UMD drift detected.
- Every command file imports `commander` either as `type { Command }` or `import { Command }` — no foreign CLI framework drift (oclif, yargs, etc.) anywhere in `src/cli/`.

---

## 4. Dead Code

| File / symbol | Verdict | Evidence |
|---------------|---------|----------|
| `commands/web.ts` | **CANDIDATE FOR REMOVAL** — overlaps with `serve.ts`. Both register independent top-level commands (`web` and `serve`). `serve.ts` is the strict superset (PTY, host binding, MIME). | `grep` shows `web` command surface is undocumented in `DECKENT.md` MCP table; `serve` is the canonical pathway in `docs/`. |
| `commands/heartbeat.ts` | **LIVE but UNDERUSED** | `.deckent/HEARTBEAT.md` is rarely produced by sprint flow. Surface is intact and `runHeartbeat` / `HeartbeatDaemon` are imported from `orchestra/heartbeat-daemon.ts`. Keep, but verify in Sprint 187 whether any user-facing docs reference it. |
| `commands/spawn.ts:buildAllowedToolsFromScope()` | **LIVE** — used by `runWorker` paths. | Re-exported via `registerSpawn` not directly, but `spawnWorkerMultiProvider` consumes it. |
| `helpers/eta-calculator.ts` (61 LoC) | **LIVE but optional** | Imported by `status-renderer.ts` only. If `status --graph` mode drops the ETA column it becomes dead. Audit suggests no cross-checking yet. |
| `commands/output.ts` | **LIVE** — `npx deckent output <taskId>` streams worker stdout from `.deckent/sprint-NNN-outputs/`. | Confirmed: file reader + `--follow` poll loop is end-user-visible. |
| `commands/finalize.ts` | **LIVE** — power-user command that re-evaluates `.tasks/*.result` after manual edits | Imports `evaluateResult` from `sprint-controller`; reads review state. Low usage but legitimate diagnostic tool. |
| `commands/test-run.ts` | **LIVE** — `deckent test-run` smoke harness for CI. | Cited in `package.json` test scripts via `npm run test:cli` (out of scope to verify here). |
| `helpers/codex-config.ts`, `gemini-config.ts`, `cursor-config.ts` | **LIVE** — generators called by `init.ts` and `set-directives` flows for multi-IDE setup. | Verified import edges in `init-steps.ts` and `commands/init.ts:writeProviderConfig`. |
| `auto-setup.ts:generateSetupRecommendation()` | **LIVE** — consumed exclusively by `commands/init.ts` | Single import edge; no alternative implementations. |
| `version-info.ts:buildVersionString/Json` | **LIVE** — only callers are the `--version` and `--version-json` listeners in `index.ts:62-69`. | Verified inline. |
| `commands/output.ts` (export `resolveOutputPath`) | **LIVE** — used internally by `runOutputCommand`; not exposed to MCP. | No drift. |

**No outright dead modules were found**, but `commands/web.ts` is the strongest **deprecation candidate** (R-4 above).

---

## 5. Documentation Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| **G-1** | HIGH | `DECKENT.md` MCP tool reference table lists **22 MCP tools** but the live count from `src/mcp/tools/help.ts` is 22 + 5 nervous sub-tools = 27. CLI command count cited as 46+ is also drifted — the live count is 48 register exports. `package.json.version=1.0.0-beta.1` / `IDENTITY.md` reports `CLI Commands: 55+` which is **inflated** (no clear definition of what counts as "command" — register functions, sub-commands, or aliases). |
| **G-2** | MEDIUM | ADR-022 / ADR-022-V2 in `.brain/exports/decisions.md` cites "19 MCP tools = 19 CLI commands" (Sprint 085 snapshot). Today there are 27 MCP tools and 48 CLI register exports — the parity table needs a refresh. ADR text itself flags CLI-only commands (`attach`, `dashboard`, `serve`, `web`, `plugin`, `upgrade`, `onboard`) but the actual list has expanded (e.g. `heartbeat`, `checkpoint`, `cost`, `mode`, `audit-verify`, `recall`, `remember`, `memory`, `output`, `resume`, `archive-debt`, `finalize`, `features`, `recover`, `spawn`, `test-run`). |
| **G-3** | LOW | `commands/help.ts` registers the command as `help-info` (alias `info`), **not** `help` — because commander reserves the literal `help` keyword for its built-in help system. This is mentioned in code comments but not in `DECKENT.md` user docs; a user typing `deckent help` gets commander's auto-help rather than the localized splash. Worth a docs note. |
| **G-4** | LOW | Several large files lack a module-level docstring summarizing their split rationale: `doctor.ts`, `sync.ts`, `start.ts`, `agent.ts`, `skill.ts`. `init.ts` is the model — its top-of-file JSDoc explains the three-way split. Other big modules should follow that pattern. |
| **G-5** | LOW | `helpers/wizard.ts` and `commands/memory.ts` use callback-based `node:readline` — neither carries a `// TODO: migrate to readline/promises` marker, so the ADR-011 drift is silent. |
| **G-6** | INFO | No `README.md` inside `src/cli/` explaining the entry/index/commands/helpers split. New contributors must reverse-engineer the topology from `index.ts`. |
| **G-7** | INFO | `auto-setup.ts` and `version-info.ts` sit at the root of `src/cli/` but conceptually belong in `helpers/` (no `register*`, no commander surface). Their placement is a historical artefact. |

---

## 6. ADR Compliance

### 6.1 ADR-010 — Tek Runtime Dependency: `commander.js`

| Check | Verdict | Evidence |
|-------|---------|----------|
| `commander` is in `package.json:dependencies` | ✅ | `"commander": "^13.0.0"` |
| Every command file imports `Command` from `'commander'` | ✅ | 48/48 files (verified via `grep "from 'commander'"`) — most as `import type { Command } from 'commander'`, a few as `import { Command } from 'commander'` (for runtime constructor use in sub-commands) |
| **No CLI parser drift** (no oclif/yargs/meow/cac) | ✅ | grep across `src/cli/` confirms zero foreign CLI-framework imports |
| Cited rule "tek runtime dependency" interpreted strictly | ⚠ **HISTORICAL DRIFT** | `package.json:dependencies` now lists 10 runtime deps (`@modelcontextprotocol/sdk`, `@noble/ed25519`, `@noble/hashes`, `better-sqlite3`, `commander`, `telegraf`, `ws`, `zod`, `@lydell/node-pty`, plus optional `discord.js`). ADR-010's literal "tek runtime dependency" claim is no longer true — but the **spirit** (a single CLI parser library) is honored. The CLI tree itself only depends on `commander` + `zod` (via `commands/skill.ts:5` for manifest validation). |
| `commands/skill.ts:5` imports `zod` | ⚠ **JUSTIFIED EXCEPTION** | Used for runtime skill-manifest schema validation. Same `zod` already in `package.json` for `core/` schemas. Not a new dep just for CLI. |

**Recommendation:** Either amend ADR-010 to reflect the post-Sprint-156+ multi-dep reality (one CLI-framework dep, multiple domain deps like `zod` and `better-sqlite3`), or supersede it with a new ADR ("Tek CLI Framework — Commander Only"). The current literal reading flags every non-`commander` import as a violation, which is noise.

### 6.2 ADR-011 — `node:readline/promises` Built-in Prompt

| Check | Verdict | Evidence |
|-------|---------|----------|
| `helpers/prompt.ts:1` uses `node:readline/promises` | ✅ | Primary prompt helpers — `promptText/promptSelect/promptConfirm` |
| `commands/config-nervous.ts:9` uses `node:readline/promises` | ✅ | Interactive TUI prompts |
| `commands/memory.ts:4` uses `node:readline` (callback API) | ❌ **VIOLATION** | Should migrate to `node:readline/promises` per ADR-011 |
| `helpers/wizard.ts:3` uses `node:readline` (callback API) | ❌ **VIOLATION** | Should migrate to `node:readline/promises` per ADR-011 |
| No external prompt libs (inquirer, prompts, enquirer, etc.) | ✅ | Zero matches in `src/cli/` |

**Net:** 2 of 4 readline call-sites violate the ADR. Both are pre-`prompt.ts` legacy code. Fix is mechanical (replace `createInterface` import + wrap question calls in `await rl.question(...)`).

### 6.3 ADR-012 — `register<Name>(program)` Pattern

| Check | Verdict | Evidence |
|-------|---------|----------|
| Every command lives in its own file under `src/cli/commands/` | ✅ | 48 register exports across 48 files (1:1) |
| Each command exports `register<Name>(program: Command): void` | ✅ | All 48 match the exact signature; `registerSkillMarketplace(parentCmd: Command)` is the only structural variant (sub-command parent) — semantically conforming |
| `src/cli/index.ts` calls each `register*(program)` | ✅ for 47/47 wired commands; `registerSkillMarketplace` is nested under `registerSkill` |
| Cross-check `grep -c 'register[A-Z][A-Za-z]*(program' src/cli/index.ts` | **47** (matches ADR's canonical check exactly) | ADR text says "drift-eğilimli olduğu için burada sabit yazılmaz — kanonik liste auto-generated `docs/reference/cli.md`'de; çapraz-kontrol: `grep -c 'register[A-Z][A-Za-z]*(program' src/cli/index.ts`" — current value 47 |
| Split helpers (`init-steps`, `init-templates`, `init-wizard`, `doctor-checks`, `doctor-format`, `retro-parser`, `retro-formatter`, `quick-start`) do NOT export `register*` | ✅ | Verified — they are pure helpers consumed by the parent command's `register*` |

**Verdict:** Full compliance. ADR-012 is the cleanest of the four CLI ADRs.

### 6.4 ADR-022 / ADR-022-V2 — CLI/MCP Feature Parity

| Check | Verdict |
|-------|---------|
| Every MCP tool has a CLI equivalent | ✅ (see Section 6.5 table) — `nervous_*` sub-tools all have `deckent nervous *` sub-commands; `feature_query` has `deckent features`; `memory_query` has `deckent recall`. |
| CLI-only commands are infrastructure/UI launchers | ✅ — see CLI-only column in 6.5 |
| ADR-022-V2 cited "19 MCP = 19 CLI" (Sprint 085) | ⚠ **STALE** — actual is 27 MCP / 48 CLI register exports. ADR text should be refreshed to match Sprint 184+ surface. |
| Parameter parity (each MCP tool's params map onto CLI flags) | ⚠ **SPOT-CHECK ONLY** — verified for `plan` (`--structured`, `--dry-run`), `status` (`--watch`, `--json`), `kill` (`--all` / `--worker`), `start` (`--auto-approve`, `--sandbox`). Full inventory not in audit scope. |

### 6.5 CLI ↔ MCP Parity Table

> 27 MCP tools (incl. 5 `nervous_*` sub-tools) ↔ 48 CLI register exports. CLI-only commands are infrastructure / dev-tooling.

| CLI command | CLI register fn | MCP tool | Notes |
|-------------|-----------------|----------|-------|
| `init` | `registerInit` | `deckent_init` | parity ✓ |
| `set-directives` | `registerSetDirectives` | `deckent_set_directives` | parity ✓ |
| `plan` | `registerPlan` | `deckent_plan` | parity ✓ |
| `start` | `registerStart` | `deckent_start` | parity ✓ |
| `status` | `registerStatus` | `deckent_status` | parity ✓ |
| `doctor` | `registerDoctor` | `deckent_doctor` | parity ✓ |
| `retro` | `registerRetro` | `deckent_retro` | parity ✓ |
| `history` | `registerHistory` | `deckent_history` | parity ✓ |
| `analyze` | `registerAnalyze` | `deckent_analyze_project` | parity ✓ (name asymmetry) |
| `sync` | `registerSync` | `deckent_sync` | parity ✓ |
| `config` | `registerConfig` | `deckent_config` | parity ✓ |
| `review` | `registerReview` | `deckent_review` | parity ✓ |
| `run` | `registerRun` | `deckent_run` | parity ✓ |
| `kill` | `registerKill` | `deckent_kill` | parity ✓ |
| `cleanup` | `registerCleanup` | `deckent_cleanup` | parity ✓ |
| `help-info` (alias `info`) | `registerHelp` | `deckent_help` | parity ✓ (CLI command name is `help-info`; `help` is commander's built-in) |
| `agent` (sub: `list`) | `registerAgent` | `deckent_agent_list` | parity ✓ (CLI broader: `add/remove/show/...`) |
| `skill` (sub: `list`) | `registerSkill` | `deckent_skill_list` | parity ✓ (CLI broader: `add/remove/publish/...`) |
| `checkpoint` | `registerCheckpoint` | `deckent_checkpoint` | parity ✓ |
| `docs` | `registerDocs` | `deckent_docs` | parity ✓ |
| `explain` | `registerExplain` | `deckent_explain` | parity ✓ |
| `recall` | `registerRecall` | `deckent_memory_query` | semantic parity ✓ (different naming, same surface) |
| `watch` | `registerWatch` | `deckent_watch` | parity ✓ |
| `nervous` (sub-cmds) | `registerNervous` | `deckent_nervous_subscribe / _accept / _reject / _status` | parity ✓ (4 sub-tools) |
| `config nervous` | `registerConfigNervous` | `deckent_nervous_config` | parity ✓ |
| `features` | `registerFeatures` | `deckent_feature_query` | parity ✓ |
| `audit <sprint-id>` | `registerAudit` | `deckent_audit` | parity ✓ |
| `recover` | `registerRecover` | `deckent_recover` | parity ✓ |
| **CLI-only — infrastructure / dev** | | | |
| `attach` | `registerAttach` | — | tmux session attach (terminal-only) |
| `spawn` | `registerSpawn` | — | low-level single-worker spawn (debug) |
| `dashboard` | `registerDashboard` | — | terminal dashboard renderer |
| `serve` | `registerServe` | — | HTTP API + embedded web terminal (host process) |
| `web` | `registerWeb` | — | thinner dashboard server (deprecation candidate — see R-4) |
| `plugin` | `registerPlugin` | — | plugin install/list/create |
| `upgrade` | `registerUpgrade` | — | self-update via npm/curl |
| `onboard` | `registerOnboard` | — | interactive setup wizard |
| `archive-debt` | `registerArchiveDebt` | — | brain DEBT.md archive rotator |
| `finalize` | `registerFinalize` | — | manual sprint finalize (after `.result` edits) |
| `heartbeat` | `registerHeartbeat` | — | proactive heartbeat daemon |
| `output <taskId>` | `registerOutput` | — | per-worker stdout streamer |
| `cost` | `registerCostCommand` | — | pricing / budget / estimate calculator |
| `remember <note>` | `registerRemember` | — | store memory note (write surface MCP lacks) |
| `memory` (sub-cmds) | `registerMemory` | — | DB rebuild/export/import/migrate (admin) |
| `resume <sprintId>` | `registerResume` | — | resume from checkpoint |
| `test-run` | `registerTestRun` | — | CI smoke harness |
| `mode` | `registerMode` | — | hybrid mode switch (ADR-042) |
| `audit-verify` | `registerAuditVerify` | — | HMAC chain integrity (I4) |

**Summary:** 27 MCP tools ↔ 28 CLI commands with direct parity + 20 CLI-only commands (infrastructure, admin, dev-tooling). ADR-022-V2's "CLI strict superset of MCP" invariant **HOLDS** today.

### 6.6 Other ADRs touching CLI

| ADR | Touches CLI? | Compliance |
|-----|--------------|------------|
| ADR-001 (TypeScript+ESM) | Yes — all files | ✅ |
| ADR-002 (Node16 module resolution) | Yes — every import suffix | ✅ — `.js` suffix everywhere |
| ADR-003 (vitest over Jest) | Indirectly — CLI tests | ✅ — out of audit scope but no Jest imports in src/cli/ |
| ADR-006 (`spawnSync` security pattern) | Yes — `attach.ts:11`, `cleanup.ts:6`, `doctor.ts:4`, `kill.ts` callees, `onboard.ts:3`, `plugin.ts:3`, `start.ts:21`, `sync.ts:3`, `upgrade.ts:1`, `watch.ts:3`, `wizard.ts:5` | ⚠ **SPOT-CHECK** — `spawnSync` calls inspected use array args (no shell interpolation). Full verification deferred to dedicated audit. |
| ADR-008 (Brain merkezi import — tek yönlü bağımlılık) | Yes — `commands/nervous.ts:19`, `commands/recover.ts:5-9`, `commands/resume.ts:11-15`, etc. | ✅ — CLI imports from orchestra/core/nervous/monitor; no reverse imports detected |
| ADR-025 (Graceful shutdown SIGINT) | Yes — `entry.ts:34` | ✅ — calls `interruptActiveSprint()` + `killAllSessions()` |
| ADR-037 (RBAC authority matrix) | Indirectly — CLI commands like `kill`, `cleanup`, `audit`, `recover` exercise auditor/brain rights | ✅ — CLI is the user surface, not a sprint-time actor |
| ADR-046 (Brain self-update hook) | Indirectly — `sync.ts` participates | ✅ |
| ADR-047 (Manuel subagent dispatch) | Indirectly — `mode.ts` switches sprint vs task | ✅ |
| ADR-048 (Prompt lifecycle contract) | Yes — `run.ts:6` and `spawn.ts:10` use `buildWorkerPrompt` | ✅ |
| ADR-062 (Embedded web terminal) | Yes — `serve.ts:4` instantiates `LocalPtyBackend` | ✅ |

---

## 7. Refactor Recommendations

Ranked by ROI (impact × ease):

| # | Recommendation | Files | Effort | Justification |
|---|----------------|-------|--------|--------------|
| **F-1** | Migrate `commands/memory.ts:4` + `helpers/wizard.ts:3` from `node:readline` → `node:readline/promises` | 2 | LOW (≤ 30 min) | Closes the only outstanding ADR-011 violations. Mechanical edit; pattern already exists in `helpers/prompt.ts`. |
| **F-2** | Refresh ADR-022-V2 with current parity numbers (27 MCP / 48 CLI) and the expanded CLI-only list | `.brain/memory.db` ADR row | LOW | Removes Section 6.4 stale-count warning; restores ADR as ground truth. |
| **F-3** | Amend or supersede ADR-010 to reflect "single CLI framework" semantics instead of literal "single runtime dependency" | `.brain/memory.db` ADR row | LOW | Removes false-positive drift signal that flags every legitimate `zod` / `better-sqlite3` import. |
| **F-4** | Split `commands/doctor.ts` further — extract the IDE detection block (~150 LoC) into `doctor-ide-detect.ts` | `commands/doctor.ts` | MEDIUM | Brings doctor below the 1 000 LoC ceiling; complements existing `doctor-checks.ts` / `doctor-format.ts` split. |
| **F-5** | Decide on `commands/web.ts` deprecation path: either fold into `serve.ts --legacy-web` or remove with a CHANGELOG entry | `commands/web.ts`, `commands/serve.ts` | LOW | Eliminates dual HTTP-server entry points; reduces user confusion. |
| **F-6** | Split `helpers/output.ts` (647 LoC) into `helpers/output-print.ts` (print primitives) + `helpers/output-format.ts` (table/sprint formatters) | `helpers/output.ts` | MEDIUM | Eases independent unit testing; reduces blast radius of formatter changes. |
| **F-7** | Add a CI lint that asserts `register*` export ↔ `index.ts` wiring (catch R-5) | new `scripts/lint-cli-registration.mjs` | LOW | Prevents dead-code growth at the CLI surface. |
| **F-8** | Centralize git invocations in `core/git.ts` (single `spawnSync('git', ...)` wrapper) — migrate `sync.ts`, `upgrade.ts`, `cleanup.ts`, `attach.ts` | `core/`, several CLI files | MEDIUM | Reduces git-arg drift; one place to add env scrubbing / timeouts. |
| **F-9** | Relocate `auto-setup.ts` and `version-info.ts` into `helpers/` | 2 files + import paths | LOW | Removes G-7 historical artefact; clarifies "root holds entry+program only" invariant. |
| **F-10** | Document `commands/help.ts` naming choice (`help-info` alias `info` because commander reserves `help`) in `DECKENT.md` | `DECKENT.md` | LOW | Closes G-3. |
| **F-11** | Add a 4-line module docstring to each file > 300 LoC explaining the split rationale (model: `init.ts`) | 14 large files | LOW–MED | Closes G-4. |

---

## 8. Sprint 187 Follow-up

Items to fold into Sprint 187 (post-OSS launch) planning if not picked up sooner:

1. **ADR-011 closure** (F-1) — should be bundled with the next CLI hygiene sprint.
2. **ADR-022-V2 refresh** (F-2) and **ADR-010 amend/supersede** (F-3) — these are governance moves and should be batched together to avoid two separate ADR diffs in adjacent sprints.
3. **`doctor.ts` continued split** (F-4) — drag the IDE-detection logic into a sibling; aligns with the long-running god-object reduction pattern.
4. **`web.ts` deprecation decision** (F-5) — needs PM signoff (Alperen) because it appears in some external docs/examples.
5. **`helpers/output.ts` split** (F-6) — coordinate with anyone touching sprint-summary formatters in Sprint 184-186.
6. **CLI registration lint** (F-7) — small, high-value, can ship as part of any sprint's CI hygiene block.
7. **Git wrapper centralization** (F-8) — medium effort; coordinate with anyone planning a `core/` reorganization.
8. **`auto-setup.ts` / `version-info.ts` relocation** (F-9) — bundle with F-11 docstrings as a single "CLI structural hygiene" task.
9. **Parameter-parity full audit** — Section 6.4 spot-checked only. A separate dynamic-split task should enumerate every MCP tool's input schema vs the corresponding commander option set.
10. **CLI README** — write a short `src/cli/README.md` (entry vs index vs commands vs helpers) — closes G-6. Could be a single doc-only task in Sprint 187.

---

## 9. Summary

- **97 TypeScript files / ~20 153 LoC** under `src/cli/`. Of these, **48 are register-emitting command modules** wired into `src/cli/index.ts:buildProgram()`.
- **ADR-012 (register pattern):** **FULL COMPLIANCE.** 48/48 register exports use the canonical signature; `grep -c` count of 47 in `index.ts` matches the ADR's own self-check command verbatim. The +1 delta is `registerSkillMarketplace`, which is intentionally nested under `registerSkill`.
- **ADR-010 (commander single CLI dep):** **PARTIAL COMPLIANCE.** CLI parser is exclusively `commander` (no oclif/yargs/cac/meow drift). However, the literal "tek runtime dependency" claim is stale — `package.json` now lists 10 runtime deps. Spirit of the ADR (single CLI framework) holds; letter does not. Recommend ADR refresh (F-3).
- **ADR-011 (readline/promises):** **2 VIOLATIONS** — `commands/memory.ts:4` and `helpers/wizard.ts:3` import the callback-based `node:readline`. The correct pattern exists in `helpers/prompt.ts:1` and `commands/config-nervous.ts:9`; migration is mechanical (F-1).
- **ADR-022 / ADR-022-V2 (CLI/MCP parity):** **STRUCTURAL COMPLIANCE** — every MCP tool has a CLI equivalent (see Section 6.5 table). CLI ships 20 additional infrastructure / dev-tooling commands that intentionally have no MCP analogue. ADR's own count (19/19) is **stale** — actual is **27 MCP / 48 CLI register exports** (F-2).
- **Touched but not violated:** ADR-001/002/003/006/008/025/037/046/047/048/062. Spot-checks clean.
- **Risk profile:** mostly LOW. The single MEDIUM-priority risks are `doctor.ts` size (R-2), `start.ts` cache leakage (R-3), and `helpers/output.ts` size (R-6). All three are debt-of-success — modules outgrew their initial split because they get the most use.
- **Dead code:** none outright. `commands/web.ts` is the strongest deprecation candidate (subsumed by `serve.ts`). `commands/heartbeat.ts` is live but underused — verify user-facing docs reference before any pruning.
- **Documentation drift:** `DECKENT.md` MCP-tool count (22) lags actual (27); `IDENTITY.md` CLI count (55+) is inflated relative to register-export count (48). Both should snap back to live numbers in Sprint 187 docs sync.
- **GO/NO_GO read for task 185-003:** ✅ GO — 48 commands audited (≥ 46 target), 9 sections produced, ADR-010/011/012/022 cross-checks present, CLI/MCP parity table populated, no source files modified (write surface limited to `docs/audits/dynamic-split/cli-audit.md`).

---

*Audit produced 2026-05-21 against worktree at HEAD = 88448632 ("chore(sprint-184/185): runtime artifacts + zero-config experiment prompt"). All findings reflect that exact tree state; subsequent commits may alter file sizes and import edges.*
