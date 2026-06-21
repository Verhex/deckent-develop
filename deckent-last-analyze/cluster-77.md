# cli#3 — REPL chat surface + config/cost/dashboard/docs/doctor commands

Files audited (full read): `src/cli/commands/chat-slash-registry.ts`,
`src/cli/commands/chat-spinner.ts`, `src/cli/commands/chat-status-line.ts`,
`src/cli/commands/chat-tool-bridge.ts`, `src/cli/commands/chat-tool-exec.ts`,
`src/cli/commands/chat.ts`, `src/cli/commands/checkpoint.ts`,
`src/cli/commands/cleanup.ts`, `src/cli/commands/config-nervous.ts`,
`src/cli/commands/config.ts`, `src/cli/commands/cost.ts`,
`src/cli/commands/dashboard.ts`, `src/cli/commands/docs.ts`,
`src/cli/commands/doctor-checks.ts`.
Call-sites grep-verified across `src/` + `tests/cli/` + `src/core/config.ts` (defaults).

## Findings

### root-cause

- [root-cause|med] Non-TTY native REPL auto-approves destructive write/edit/bash with ZERO confirmation — `src/cli/entry.ts:639` + `src/cli/commands/chat-tool-exec.ts:78` — the combined dispatcher injects `confirm: isTty ? askConfirm : async () => true` (entry.ts:639); in a piped/headless session `confirm` is the always-`true` stub, and the exec layer's own default is equally permissive (`const confirm = opts.confirm ?? (async () => true)`, chat-tool-exec.ts:78). So `deckent_write_file`/`deckent_edit_file`/`deckent_bash` (SIDE_EFFECTING, chat-tool-exec.ts:22-26) run unconfirmed off a TTY. `deckent_bash` (chat-tool-exec.ts:131-134) additionally has NO path-scope guard — only read/write/edit pass through `inScope` (chat-tool-exec.ts:107-128) — so an auto-approved bash escapes cwd freely.
- [root-cause|med] `deckent chat --native` silently degrades to stubs while the bare REPL is fully wired — `src/cli/commands/chat.ts:416-422,424-428` — native mode wraps `createSubscriptionChatAdapter()` in `try/catch` and on ANY throw falls back to a stub provider returning `'[native] provider not yet connected to a real LLM'` (chat.ts:419); its `stubDispatcher` returns `'[native] tool "${name}" not yet wired'` (chat.ts:426). The REAL provider+tool dispatchers are built only in `src/cli/entry.ts:636-649` (the argumentless `deckent` REPL), so `deckent chat --native` never dispatches a real tool — a silent-fallback that presents as a working surface.
- [root-cause|med] Divergent default memory budget / decay — three different "defaults" — `src/cli/commands/cleanup.ts:98-99` + `src/cli/commands/doctor-checks.ts:277` vs `src/core/config.ts:1100-1101` — cleanup hardcodes `decayMemoryBudget = 900` / `decayAfterSprints = 8` (cleanup.ts:98-99) and doctor hardcodes `memoryBudget = 900` (doctor-checks.ts:277, `checkBrainBudget`), but the canonical `DEFAULT_CONFIG` is `memory_budget: 5000` / `decay_after_sprints: 20` (config.ts:1100-1101, comment "Sprint 140 pre-flight: 900→5000 … 5→20"). When `config.json` omits the keys, cleanup + doctor apply a 900 budget — 5.5× stricter than the product default — yielding spurious "OVER BUDGET" warnings (doctor-checks.ts:283, cleanup.ts:246-247) and premature decay.
- [root-cause|low] doctor/cleanup label a DB row-count as "lines" and compare it to a line budget — `src/cli/commands/doctor-checks.ts:278-283` + `src/cli/commands/cleanup.ts:245-247` — `const lines = getMemoryEntryCount(root)` then `message: \`${lines}/${memoryBudget} lines\``. `getMemoryEntryCount` returns `store.totalCount()` (DB rows, doctor-checks.ts:267-274) — Memory V2 has no "lines"; the metric name is leftover from the pre-V2 `countBrainLines` era (cleanup.ts:21 comment "replaces legacy countBrainLines"), so the budget gate measures the wrong unit under the old label.

### unwired

- [unwired|high] `renderStatusLine` exported but never called in production — `src/cli/commands/chat-status-line.ts:40` — grep over `src/` returns ONLY the definition plus a comment at `src/cli/entry.ts:493-495` stating the Sprint-222 status-line print was **dropped** ("Sprint 222's separate status-line print was dropped here … renderStatusLine stays exported for sprint-aware status surfaces"). No live caller — the REPL prints the banner header instead; every other reference is tests/docs/smoke-script. The whole `StatusLineConfigValue`/`StatusLineFields` config surface (chat-status-line.ts:13-27) is therefore inert in production.

### dormant

- [dormant|high] `classifyChatIntent` + its keyword tables are test-only — `src/cli/commands/chat.ts:161` (+ `TASK_INTENT_KEYWORDS` chat.ts:74-124, `CASUAL_INTENT_KEYWORDS` chat.ts:127-147) — grep over `src/` shows zero production callers; the docblock itself admits it is for "the system prompt documentation and any future runtime gate" (chat.ts:153-154). Runtime classification is delegated to the host LLM via `buildNaiveSystemPrompt` (chat.ts:197, wired at chat.ts:336), so ~75 lines of classifier + keyword tables are exercised only by unit tests.
- [dormant|med] `runPreFlightHealthCheck` (doctor-checks copy) has no production caller — `src/cli/commands/doctor-checks.ts:481` — the live `deckent doctor` calls its OWN duplicate at `src/cli/commands/doctor.ts:1279` (invoked doctor.ts:1465); the doctor-checks.ts export is reached only by `tests/cli/doctor-checks.test.ts:475`. Two byte-divergent copies of the same function, one shadowed (see also INC-A018 in the prior standing audit).
- [dormant|med] dashboard "skill" column is a permanent placeholder — `src/cli/commands/dashboard.ts:76` — `renderDashboard` emits the `col_skill` header (dashboard.ts:68) but every data row hardcodes `const skillCol = padRight('-', …)` (dashboard.ts:76), so the column never shows real data. Contrast the adjacent agent column which IS wired: `const agentName = padRight(a.assignedAgent ?? '-', agentColW)` (dashboard.ts:75).
- [dormant|med] `deckent chat --local` is an advertised-but-dead flag — `src/cli/commands/chat.ts:380` + `chat.ts:401-407` — the option is registered (`--local`, "Use a local LLM (Ollama) — reserved for T-190-009") but its handler immediately errors `'Local mode (--local) is not yet wired.'` and sets exit 1. A user-visible flag whose only behavior is a not-implemented notice.

### inconsistent

- [inconsistent|high] `getMemoryEntryCount` duplicated 5× — `src/cli/commands/cleanup.ts:22` + `src/cli/commands/doctor-checks.ts:267` (both in-cluster) + `src/cli/commands/doctor.ts:253` + `src/mcp/tools/cleanup.ts:12` + `src/cli/helpers/output.ts:10` — five near-identical `MemoryStore(...).totalCount()` helpers copy-pasted per file; a behavior fix (e.g. WAL handling, error reporting) must be applied in five places or they drift.
- [inconsistent|med] `cost estimate` advertised in the docblock but never registered — `src/cli/commands/cost.ts:8` vs `cost.ts:214-245` — the header documents `deckent cost estimate [--task-count N]` as one of four subcommands, but `registerCostCommand` registers only `show`/`update`/`budget` (cost.ts:217,226,236). No `command('estimate')` exists — the documented subcommand is unreachable.
- [inconsistent|med] chat-tool-bridge header contradicts its own allow-list — `src/cli/commands/chat-tool-bridge.ts:21-24` vs `chat-tool-bridge.ts:45` — the map comment says "Anything outside this map (notably **deckent_plan** / start / run …) is refused", yet `deckent_plan: ['plan']` is INSIDE the map (chat-tool-bridge.ts:45). The comment names plan as excluded while the code allows it — stale/contradictory documentation on a confirm-gated write tool.
- [inconsistent|med] cost.ts diverges from the cluster on error-exit AND i18n — `src/cli/commands/cost.ts:41,80,116,147,151,171,179,188` — cost.ts calls `process.exit(1)` (hard exit, untestable) where the rest of the cluster uses `process.exitCode = 1; return` (checkpoint.ts:121,138; config.ts:106,147; cleanup.ts:251). It also hardcodes English+emoji output with no `getMessage` (cost.ts:44-65,83-84,96-112,199-208) while checkpoint/cleanup/config-nervous/dashboard are fully i18n'd — contra the project i18n-FIRST rule.
- [inconsistent|med] docs.ts is half-localized — `src/cli/commands/docs.ts:82,98,111,113,125-126,130,177,192,196,204,207` vs `docs.ts:224,228,232,248-249,262` — the `docs track {scan,status,sync}` subcommands use `getMessage` (docs.ts:224+), but `docs add/remove/list/update/run` hardcode English strings ("✓ Added", "File not found", "No managed documents configured.") within the same command surface — two localization regimes in one file.
- [inconsistent|med] docs.ts error paths exit 0 — `src/cli/commands/docs.ts:81-84,112-114,154,157,191-193` — `docs add` (file-not-found), `remove` (not-found), `update` (no-config / not-found) and `run` (no-config) call `printError(...)` then bare `return` WITHOUT setting `process.exitCode = 1`, so a failed command reports a success exit code. Contrast checkpoint.ts:137-138 and config.ts:161-163, which set `process.exitCode = 1` on the identical not-found condition.
- [inconsistent|low] cleanup.ts uses `spawnSync` in a normal command path — `src/cli/commands/cleanup.ts:6,233` — `spawnSync('tmux', ['kill-session', …])` blocks the event loop, contra ADR-087 (Async I/O) + the project Test-Hermeticity rule ("No spawnSync for subprocesses"); the surrounding cleanup is otherwise async-safe disk I/O.
- [inconsistent|low] dashboard watch filter has a tautological clause — `src/cli/commands/dashboard.ts:191` — `if (filename === DASHBOARD_FILE || filename === '.dashboard')`; `DASHBOARD_FILE === '.dashboard'` (`src/core/constants.ts:49`), so the second disjunct is always identical to the first — dead OR-branch.
- [inconsistent|low] `renderHelp` comment/code width mismatch — `src/cli/commands/chat-slash-registry.ts:286` vs `chat-slash-registry.ts:292` — docblock says "Width is fixed at 12 chars for the name column" but the code pads to 10: `cmd.name.padEnd(10)`.
- [inconsistent|low] `inScope` has a redundant always-null ternary — `src/cli/commands/chat-tool-exec.ts:87-90` — after `if (rel === '' || rel.startsWith('..') || isAbsolute(rel))` the body is `return rel === '' ? null : null;` — both ternary arms return `null`, so the condition is pointless (the comment explaining the `''` vs `'..'` distinction has no behavioral effect).
- [inconsistent|low] config.ts dynamically re-imports an already-static symbol — `src/cli/commands/config.ts:93` — `const { needsMigration, migrateConfig } = await import('../../core/config-migration.js')` re-pulls `migrateConfig`, which is ALREADY statically imported at config.ts:7 (and used statically at config.ts:247); only `needsMigration` genuinely needs the dynamic import.

### dead-test

- [dead-test|high] status-line "wire" test verifies nothing about the wire — `tests/cli/repl-status-line-wire.test.ts:1-9,31-65` — the file header claims it "Verifies that `renderStatusLine` is wired into the REPL launch so provider/dir appears at startup", but every assertion calls the pure `renderStatusLine(...)` directly and checks its return string (lines 33-64); none assert that `entry.ts` prints it at boot. Since the production print was removed (entry.ts:493-495) and the function is unwired (see unwired finding), the suite is green while the feature is absent — false wire-coverage.
- [dead-test|med] doctor pre-flight test covers the shadowed copy, not the live path — `tests/cli/doctor-checks.test.ts:457-475` — it imports and exercises `runPreFlightHealthCheck` from `doctor-checks.ts`, but production `deckent doctor` calls the divergent copy in `doctor.ts:1279` (doctor.ts:1465). The passing test gives coverage to the dormant duplicate while the live function is untested here.

## Summary
Total findings: 22 (root-cause 4, unwired 1, dormant 4, inconsistent 11, dead-test 2).

Dominant theme = **the native REPL chat surface ships exported-but-inert machinery**:
`renderStatusLine` + its whole config type surface is unwired (the REPL prints the banner
instead), `classifyChatIntent` + ~75 lines of intent keyword tables are test-only (the host
LLM classifies via `buildNaiveSystemPrompt`), the dashboard "skill" column is a permanent `-`,
and `deckent chat --native` silently runs on stub provider+dispatcher while the real tool
wiring lives only in the argumentless `deckent` REPL (entry.ts). Secondary theme =
**copy-paste drift + divergent defaults**: `getMemoryEntryCount` is duplicated 5×,
`runPreFlightHealthCheck` exists in two diverging copies (the doctor-checks one dead), and
cleanup/doctor hardcode a 900-line memory budget while the canonical config default is 5000 —
so a config-less project gets spurious OVER-BUDGET warnings + early decay. Surface-quality
gaps: cost.ts breaks the cluster's `process.exitCode`/`getMessage` conventions (`process.exit`
+ hardcoded English), docs.ts is half-i18n with several error paths exiting 0, and the
non-TTY REPL auto-approves destructive write/edit/bash (unscoped `deckent_bash`) with zero
confirmation. Clean files: `chat-spinner.ts`, `checkpoint.ts`, and `config-nervous.ts` (the
last is fully i18n'd, though its display-only `SAFETY_FLOOR_IDS` array at config-nervous.ts:280-286
duplicates the canonical `isSafetyFloorAction` registry and could drift). No source was
modified (read-only audit).
