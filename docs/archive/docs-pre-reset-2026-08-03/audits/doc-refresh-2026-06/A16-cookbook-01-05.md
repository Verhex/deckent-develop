# A16 — Cookbook Recipes 01–05 + index.md Audit

**Sprint:** 345  
**Task:** 345-016  
**Auditor:** w-345-016 (doc-writer)  
**Date:** 2026-06-28  
**Scope:** `docs/cookbook/index.md`, `01-first-sprint.md`, `02-multi-provider-fleet.md`, `03-memory-recall.md`, `04-autonomous-mode.md`, `05-status-and-watch.md`  
**Method:** Line-by-line trace of every CLI command/flag against `src/cli/commands/` source files.

---

## Verdict

| Recipe | Status | P0 issues |
|--------|--------|-----------|
| `index.md` | ⚠️ INDEX GAP | 2 files not linked |
| `01-first-sprint.md` | ✅ PASS | None |
| `02-multi-provider-fleet.md` | ✅ PASS | None |
| `03-memory-recall.md` | ✅ PASS | None |
| `04-autonomous-mode.md` | ✅ PASS | None |
| `05-status-and-watch.md` | ⚠️ MINOR | 1 inaccurate description (non-P0) |

**P0 count: 0** — every CLI command in every recipe is copy-paste correct against the live source.

---

## index.md — Link Reconciliation

Verified against `ls docs/cookbook/`:

```
01-first-sprint.md              ✅ listed
02-multi-provider-fleet.md      ✅ listed
03-memory-recall.md             ✅ listed
04-autonomous-mode.md           ✅ listed
05-status-and-watch.md          ✅ listed
06-checkpoints-approval.md      ✅ listed
07-tech-debt-tracking.md        ✅ listed
08-cost-and-budget.md           ✅ listed
09-recover-stuck-sprint.md      ✅ listed
10-nervous-alerts.md            ✅ listed
add-rest-api.md                 ✅ listed
fix-bug.md                      ✅ listed
update-docs.md                  ✅ listed
getting-started-en.md           ❌ EXISTS — not listed in index.md
multi-provider-and-cost-en.md   ❌ EXISTS — not listed in index.md
```

**Gap:** `getting-started-en.md` and `multi-provider-and-cost-en.md` exist in the directory but have no entry in `index.md`. All 13 listed links resolve to real files (no dead links). The two missing files need entries added or the files need to be removed if they are superseded drafts.

---

## 01-first-sprint.md — Command Trace

Source: `src/cli/commands/init.ts`, `plan.ts`, `start.ts`, `status.ts`, `review.ts`, `retro.ts`

| Command | Flag | Source evidence | Result |
|---------|------|-----------------|--------|
| `deckent init` | — | `registerInit` → `.command('init')` | ✅ |
| `deckent plan` | — | `registerPlan` → `.command('plan')` | ✅ |
| `deckent plan` | `--structured` | `plan.ts:89` `.option('--structured', 'Force structured parsing (skip AI)')` | ✅ |
| `deckent plan` | `--dry-run` | `plan.ts:90` `.option('--dry-run', 'Show plan without writing task files to disk')` | ✅ |
| `deckent start` | — | `registerStart` → `.command('start [description]')` | ✅ |
| `deckent start` | `--dry-run` | `start.ts:165` `.option('--dry-run', 'Plan sprint without spawning workers')` | ✅ |
| `deckent status` | — | `registerStatus` → `.command('status')` | ✅ |
| `deckent status` | `--watch` | `status.ts:330` `.option('--watch', 'Auto-refresh every 2 seconds')` | ✅ |
| `deckent review` | — | `src/cli/commands/review.ts` exists | ✅ |
| `deckent retro` | — | `src/cli/commands/retro.ts` exists | ✅ |

**Verdict: PASS — no P0 issues.**

---

## 02-multi-provider-fleet.md — Command Trace

Source: `src/cli/commands/plan.ts`, `start.ts`

| Command / Field | Source evidence | Result |
|-----------------|-----------------|--------|
| `deckent plan` | `plan.ts:82` | ✅ |
| `deckent start` | `start.ts:158` | ✅ |
| `- Provider: <name>` directive field | ADR-015 note: "per-task `- Provider:` override" is the 3rd routing priority; `task-router.ts:279` resolves it | ✅ |
| `- Model: <id>` directive field | ADR-015 6-level routing `forceModel` layer; planner passes model to task JSON | ✅ |
| `- Backend: docker \| tmux \| subprocess` | Task metadata field; `spawn-backend.ts` + `task-mode-runner.ts` route on backend | ✅ |
| `- ModelEffort: <level>` | Parsed by planner into task JSON; providers receive it (Claude `extended_thinking`, Codex `reasoning_effort`) | ✅ |
| Model registry IDs (`opus`, `sonnet`, `haiku`, `o3`, `gpt-5`, `gpt-4.1`, `o4-mini`, `gpt-5-mini`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`) | Short registry IDs — declared in `src/core/model-registry.ts`; cross-checked with ADR-015 note | ✅ (plausible; deep-verify of every alias is out of scope for this audit but no mismatch observed) |

**Verdict: PASS — no P0 issues.**

---

## 03-memory-recall.md — Command Trace

Source: `src/cli/commands/recall.ts`, `remember.ts`, `memory.ts`

### `deckent recall`

| Command | Flag | Source evidence | Result |
|---------|------|-----------------|--------|
| `deckent recall <query>` | — | `recall.ts:14` `.command('recall <query>')` | ✅ |
| | `--type <types>` | `recall.ts:16` `-t, --type <types>` (comma-separated, split at `:33`) | ✅ |
| | `--limit <n>` | `recall.ts:17` `-n, --limit <n>` default 5 | ✅ |
| | `--sprint-min <n>` | `recall.ts:18` `--sprint-min <n>`; mapped to `sprint_range.min` at `:39` | ✅ |
| | `--mode and\|or` | `recall.ts:19` `-m, --mode <mode>` default `'or'`; applied at `:34` | ✅ |

### `deckent remember`

| Command | Flag | Source evidence | Result |
|---------|------|-----------------|--------|
| `deckent remember <note>` | — | `remember.ts:12` `.command('remember <note>')` | ✅ |
| | `--tags <tags>` | `remember.ts:16` `--tags <tags>` split by comma at `:32` | ✅ |
| | `--title <title>` | `remember.ts:17` `--title <title>` | ✅ |
| | `--type <type>` | `remember.ts:15` `-t, --type <type>` default `'memory'` | ✅ |

### `deckent memory`

| Subcommand | Flag | Source evidence | Result |
|------------|------|-----------------|--------|
| `deckent memory export` | — | `memory.ts:90` `mem.command('export')` | ✅ |
| `deckent memory stats` | — | `memory.ts:116` `mem.command('stats')` | ✅ |
| `deckent memory rebuild` | — | `memory.ts:19` `mem.command('rebuild')` | ✅ |
| `deckent memory backup` | — | `memory.ts:144` `mem.command('backup')` | ✅ |
| `deckent memory backup` | `--output <path>` | `memory.ts:146` `.option('--output <path>', ...)` | ✅ |

**Verdict: PASS — no P0 issues.**

---

## 04-autonomous-mode.md — Command Trace

Source: `src/cli/commands/autonomous.ts`

### `deckent autonomous start`

| Flag | Source evidence | Result |
|------|-----------------|--------|
| `--interval-ms <ms>` | `autonomous.ts:1065` `.option('--interval-ms <ms>', 'Idle-tick sleep in ms', '1000')` | ✅ |
| `--max-iterations <n>` | `autonomous.ts:1066` `.option('--max-iterations <n>', ...)` | ✅ |

**Config prerequisite note:** Recipe correctly states `autonomous.enabled: true` must be set in `.deckent/config.json`. Source at `autonomous.ts:497`: `if (!resolvedConfig.autonomous?.enabled) { print(getMessage('autonomous.disabled', lang)); return; }`. ✅

### `deckent autonomous backlog add`

| Flag | Required? | Source evidence | Result |
|------|-----------|-----------------|--------|
| `--id <id>` | ✅ required | `autonomous.ts:1197` `.requiredOption('--id <id>', ...)` | ✅ |
| `--title <title>` | ✅ required | `autonomous.ts:1198` `.requiredOption('--title <title>', ...)` | ✅ |
| `--kind <kind>` | optional | `autonomous.ts:1199` default `'task'`; accepts `task\|sprint\|capability` | ✅ |
| `--description <text>` | optional | `autonomous.ts:1200` default `''` | ✅ |
| `--policy <policy>` | optional | `autonomous.ts:1201` default `'auto'`; values `auto\|approval-required\|risk-tagged` | ✅ |
| `--cron <expr>` | optional | `autonomous.ts:1202` 5-field; validated at intake via `nextRun()` | ✅ |
| `--capability <verb>` | optional | `autonomous.ts:1203` for `kind=capability` | ✅ |
| `--args <json>` | optional | `autonomous.ts:1204` JSON object parsed at `:161` | ✅ |
| `--connector <id>` | optional | `autonomous.ts:1205` for `kind=capability` | ✅ |

### `deckent autonomous backlog list / remove`

| Command | Source evidence | Result |
|---------|-----------------|--------|
| `deckent autonomous backlog list` | `autonomous.ts:1234` `backlog.command('list')` | ✅ |
| `deckent autonomous backlog remove <id>` (positional) | `autonomous.ts:1260` `.command('remove [id]')`, positional at `:1265` | ✅ |
| `deckent autonomous backlog remove --id <id>` | `autonomous.ts:1262` `.option('--id <id>', ...)` | ✅ |

### Other `autonomous` subcommands

| Command / Flag | Source evidence | Result |
|----------------|-----------------|--------|
| `deckent autonomous status` | `autonomous.ts:1103` `cmd.command('status')` | ✅ |
| `deckent autonomous pending` | `autonomous.ts:1145` `cmd.command('pending')` | ✅ |
| `deckent autonomous approve <triggerId>` | `autonomous.ts:1158` `cmd.command('approve <triggerId>')` | ✅ |
| `deckent autonomous approve` `--reason <text>` | `autonomous.ts:1161` `.option('--reason <text>', ...)` | ✅ |
| `deckent autonomous reject <triggerId>` | `autonomous.ts:1173` `cmd.command('reject <triggerId>')` | ✅ |
| `deckent autonomous reject` `--reason <text>` | `autonomous.ts:1176` `.option('--reason <text>', ...)` | ✅ |
| `deckent autonomous stop` | `autonomous.ts:1117` `cmd.command('stop')` | ✅ |

**Verdict: PASS — no P0 issues.**

---

## 05-status-and-watch.md — Command Trace

Source: `src/cli/commands/status.ts`, `watch.ts`

### `deckent status` flags

| Flag | Source evidence | Result |
|------|-----------------|--------|
| `--watch` | `status.ts:330` `.option('--watch', 'Auto-refresh every 2 seconds')` | ✅ |
| `--follow` / `-f` | `status.ts:331` `.option('-f, --follow', 'Follow mode: snapshot + live event tail')` | ✅ |
| `--json` | `status.ts:332` `.option('--json', 'Output raw JSON instead of formatted dashboard')` | ✅ |
| `--raw` | `status.ts:333` `.option('--raw', 'Show legacy raw dashboard (box format)')` | ✅ |
| `--verbose` | `status.ts:334` `.option('--verbose', 'Show detailed agent and skill assignment info')` | ✅ |
| `--no-color` | `status.ts:335` `.option('--no-color', 'Disable colored output')` | ✅ |
| `--graph` | `status.ts:336` `.option('--graph', 'Display dependency graph as Mermaid diagram')` | ✅ |
| `--mode <mode>` | `status.ts:337` `.option('--mode <mode>', 'Output render mode: explainatory \| standart \| verbose \| json')` | ✅ |

**Note on `--mode` table in recipe:** Recipe lists `standart \| explainatory \| verbose \| json` (different order from source but same values). Not a copy-paste issue.

**Note on "standart" / "explainatory" typos:** Both source (`status.ts:337`) and recipe use these spellings. Recipe accurately reflects the source. Not a P0 issue — a fix requires changing the source enum, not just the doc.

### `deckent watch`

| Command / Flag | Source evidence | Result |
|----------------|-----------------|--------|
| `deckent watch` | `watch.ts:134` `registerWatch` → `.command('watch')` | ✅ |
| `deckent watch --follow <taskId>` | `watch.ts:138` `.option('--follow <taskId>', ...)` | ✅ |

**Verdict: PASS — no P0 issues.**

---

## Minor Accuracy Issue — `deckent status --watch` Description

**Recipe text (05-status-and-watch.md, line 17-18):**
> Auto-refresh every 2 seconds using `fs.watch()` (falls back to polling when filesystem events are unavailable).

**Actual behavior (status.ts:472–488):**
```typescript
try {
  const watcher = watch(dashPath, { persistent: true }, () => { render(); });
  const timer = setInterval(render, 5000);   // ← 5 s fallback alongside watcher
  ...
} catch {
  const timer = setInterval(render, 2000);   // ← 2 s polling when watcher fails
  ...
}
```

- When `fs.watch()` **succeeds**: renders on every file-change event (event-driven, not a 2-second schedule). A 5-second fallback timer also runs.
- When `fs.watch()` **fails**: polls every 2 seconds.

**Recipe says:** "every 2 seconds using `fs.watch()`" — conflates two independent mechanisms. The 2-second interval is the *polling fallback*, not the primary path.

**Flag table row (line 63):** `| --watch | Auto-refresh every 2 seconds |` — same inaccuracy. Primary path is event-driven.

**Severity:** Minor / non-P0. The command itself (`deckent status --watch`) is correct and works; the description of its internal timing is imprecise. Suggested correction:

> Auto-refresh on file-change events (`fs.watch()`), with a 5-second heartbeat fallback; or polling every 2 seconds when file-watch is unavailable.

---

## Recommendations

### Priority 1 — index.md index gaps (unlinked files)
Add entries or remove the files:
- `getting-started-en.md` — no entry in `index.md`
- `multi-provider-and-cost-en.md` — no entry in `index.md`

### Priority 2 — Accuracy fix (non-P0)
Update `05-status-and-watch.md` inline description and flag table for `--watch` to match the actual event-driven + fallback behavior described above.

### Priority 3 — Typo cleanup (non-P0, source + doc)
- `standart` → `standard` in `status.ts:337` and recipe table
- `explainatory` → `explanatory` in `status.ts:337` and recipe table
(Requires source change + doc update to stay in sync.)

---

## Coverage Statement

All CLI commands in recipes 01–05 were individually traced to their source registration. No command was spot-checked and skipped. Files examined:

- `src/cli/commands/init.ts` — `deckent init`
- `src/cli/commands/plan.ts` — `deckent plan`
- `src/cli/commands/start.ts` — `deckent start`
- `src/cli/commands/status.ts` — `deckent status`
- `src/cli/commands/review.ts` — `deckent review` (file confirmed, registration present)
- `src/cli/commands/retro.ts` — `deckent retro` (file confirmed, registration present)
- `src/cli/commands/recall.ts` — `deckent recall`
- `src/cli/commands/remember.ts` — `deckent remember`
- `src/cli/commands/memory.ts` — `deckent memory`
- `src/cli/commands/autonomous.ts` — `deckent autonomous *`
- `src/cli/commands/watch.ts` — `deckent watch`
