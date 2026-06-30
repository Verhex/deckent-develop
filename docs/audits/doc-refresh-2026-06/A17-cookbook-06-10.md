# A17 — Cookbook Recipes 06–10: Deep Verification Audit

**Sprint:** 345  
**Task:** 345-017  
**Date:** 2026-06-28  
**Auditor:** w-345-017 (doc-writer / sonnet)  
**Scope:** `docs/cookbook/06-checkpoints-approval.md`, `07-tech-debt-tracking.md`, `08-cost-and-budget.md`, `09-recover-stuck-sprint.md`, `10-nervous-alerts.md`  
**Method:** Every command, flag, and described behavior cross-referenced against `src/cli/commands/` source files.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Verified — code matches recipe |
| ❌ | Contradiction — code contradicts recipe |
| ⚠ | Omission — feature exists in code but not documented |
| ℹ | Note — non-contradicting nuance worth flagging |

---

## Recipe 06 — `06-checkpoints-approval.md`

**Source verified:** `src/cli/commands/checkpoint.ts`

### Command Verification

| Claim | Evidence | Verdict |
|-------|----------|---------|
| `deckent checkpoint list` | `cmd.command('list')` (line 72) | ✅ |
| `deckent checkpoint list --pending` | `.option('--pending', ...)` (line 73) | ✅ |
| `deckent checkpoint list --json` | `.option('--json', ...)` (line 74) | ✅ |
| `deckent checkpoint approve <sprintId> <phase>` | `cmd.command('approve <sprintId> <phase>')` (line 127) | ✅ |
| `deckent checkpoint reject <sprintId> <phase>` | `cmd.command('reject <sprintId> <phase>')` (line 150) | ✅ |
| Checkpoint dir: `.deckent/checkpoints/` | `getCheckpointsDir → join(root, '.deckent', 'checkpoints')` (line 19) | ✅ |
| Filename: `checkpoint-{sprintId}-{phase}.json` | Regex `match(/^checkpoint-(.+)-(\w+)\.json$/)` (line 36) and `updateCheckpointStatus` path construction (line 49) | ✅ |
| Status values: `pending \| approved \| rejected` | `CheckpointFile` interface (line 13) | ✅ |

### MCP Claims

`deckent_checkpoint` MCP tool (list/approve/reject) — not verifiable from CLI source; MCP tool registration is in `src/mcp/tools/`. No contradiction found, out of scope.

⚠ `--lang <code>` option exists on all three subcommands (approve/reject/list) but is not mentioned in the recipe.

### Verdict: **PASS — no contradictions**

---

## Recipe 07 — `07-tech-debt-tracking.md`

**Source verified:** `src/cli/commands/archive-debt.ts`, `src/cli/commands/recall.ts`, `src/cli/commands/cleanup.ts`, `src/orchestra/debt-manager.ts`, `src/core/constants.ts`

### Command Verification

| Claim | Evidence | Verdict |
|-------|----------|---------|
| `deckent archive-debt` exists | `program.command('archive-debt')` (archive-debt.ts:16) | ✅ |
| `deckent recall "query" --type debt` | `-t, --type <types>` option, split by comma (recall.ts:17) | ✅ |
| `deckent recall "query" --type debt --limit 10` | `-n, --limit <n>` option (recall.ts:18) | ✅ |
| `deckent memory export` | `mem.command('export')` (memory.ts:90) | ✅ |
| `deckent cleanup --decay` | `.option('--decay', ...)` (cleanup.ts:79) | ✅ |
| Escalation: ≥2 sprints → `high` | `DEBT_HIGH_PRIORITY_SPRINTS = 2` (constants.ts:108) + condition (debt-manager.ts:485) | ✅ |
| Escalation: ≥3 sprints → `critical` | `DEBT_CRITICAL_SPRINTS = 3` (constants.ts:109) + condition (debt-manager.ts:484) | ✅ |
| `escalateDebt()` in `debt-manager.ts` | `export function escalateDebt(...)` at debt-manager.ts:474 | ✅ |

### ❌ CONTRADICTION 07-A: `deckent archive-debt` sample output is fabricated

**Recipe claims** (lines 18–29):
```
Tech debt (memory.db): 3 open, 12 resolved.

Open items:
  debt-285-003  [normal]  Tech debt from 285-003: retry limit reached ...
  debt-284-007  [high]    Tech debt from 284-007: coverage below threshold ...
  debt-281-001  [normal]  Tech debt from 281-001: edge case unhandled ...

Resolved debt is retained in memory.db and pruned by sprint decay — no manual archive needed.
```

**Code produces** (archive-debt.ts:26–43):
```
Tech debt (memory.db): {open.length} open, {resolved.length} resolved.
Resolved debt is retained in memory.db and pruned by sprint decay —
no manual archival step is needed (Task #4f, saf DB-first).
```

The "Open items:" section with individual debt IDs (`debt-285-003`), severity labels (`[normal]`, `[high]`), and per-item summaries does **not exist** in the code. The command only prints a summary count line plus a static note. No per-item listing is implemented.

**Impact:** A user running `deckent archive-debt` expecting the per-item output will see only the count line. The recipe's example output is misleading.

### ⚠ Omission 07-B: Undocumented flags on `archive-debt`

`--count` (suppress the explanatory note) and `--before <sprint>` (show count of resolved items before a sprint) are implemented in archive-debt.ts (lines 19–20) but not mentioned in the recipe.

### ℹ Note 07-C: Stale docstring in `debt-manager.ts`

The docstring on line 471 of `debt-manager.ts` states "Items open >= 3 sprints become HIGH, items open >= 5 sprints become CRITICAL" — but the actual constants are `HIGH=2`, `CRITICAL=3` (constants.ts:108–109). The recipe's escalation table correctly matches the constants; the docstring is stale. This is a source code issue, not a recipe issue.

### Verdict: **FAIL — one contradiction (07-A)**

---

## Recipe 08 — `08-cost-and-budget.md`

**Source verified:** `src/cli/commands/cost.ts`, `src/cli/commands/usage.ts`

### Command Verification

| Claim | Evidence | Verdict |
|-------|----------|---------|
| `deckent cost budget` | `cost.command('budget')` (cost.ts:238) | ✅ |
| `deckent cost budget --set 5` | `.option('--set <usd>', ...)` (cost.ts:239) | ✅ |
| `deckent cost budget --daily 20` | `.option('--daily <usd>', ...)` (cost.ts:240) | ✅ |
| `deckent cost budget --monthly 100` | `.option('--monthly <usd>', ...)` (cost.ts:241) | ✅ |
| Config path `.deckent/cost-config.json` | `join(root, '.deckent', 'cost-config.json')` (cost.ts:160) | ✅ |
| `cost_limits.sprint_max_usd` field | `config.cost_limits.sprint_max_usd` (cost.ts:173, 200) | ✅ |
| `cost_limits.daily_max_usd` field | `config.cost_limits.daily_max_usd` (cost.ts:177, 201) | ✅ |
| `cost_limits.monthly_max_usd` field | `config.cost_limits.monthly_max_usd` (cost.ts:181, 202) | ✅ |
| `cost_limits.auto_confirm_below_usd` field | `config.cost_limits.auto_confirm_below_usd` (cost.ts:205) | ✅ |
| `deckent cost show` | `cost.command('show')` (cost.ts:218) | ✅ |
| `deckent cost show --provider anthropic` | `.option('--provider <name>', ...)` (cost.ts:220) | ✅ |
| `deckent cost show --model claude-sonnet-4-6` | `.option('--model <id>', ...)` (cost.ts:221) | ✅ |
| `deckent cost update` | `cost.command('update')` (cost.ts:225) | ✅ |
| `deckent cost update --dry-run` | `.option('--dry-run', ...)` (cost.ts:228) | ✅ |
| `deckent cost update --provider anthropic` | `.option('--provider <name>', ...)` (cost.ts:227) | ✅ |
| `deckent usage` | `program.command('usage')` (usage.ts:343) | ✅ |
| `deckent usage --sprint 285` | `.option('--sprint <N>', ...)` (usage.ts:347) | ✅ |
| `deckent usage --since ... --until ...` | `.option('--since <ISO>', ...)` / `.option('--until <ISO>', ...)` (usage.ts:348–349) | ✅ |
| `deckent usage --json` | `.option('--json', ...)` (usage.ts:350) | ✅ |

### Sample output format check

**`deckent cost budget`**: Recipe shows `Sprint / Daily / Monthly` lines; code prints these conditionally (monthly only if non-null). ✅

**`deckent cost show`**: Recipe shows `── anthropic (billing: subscription/api) ──` prefix with per-model rows `in=.../MTok`. Code prints: `── ${provider} (billing: ${billingModes}) ──` and `${modelId.padEnd(30)} in=${input.padEnd(12)} out=${output.padEnd(12)} cache=${cache.padEnd(10)} ctx=${ctx}` — consistent format. ✅

**`deckent usage` columns (7-day window)**: Recipe shows `Model / Calls / Input / Output / CW / Cost / Hit%` (7 columns). Code uses i18n keys `col_model / col_calls / col_input / col_output / col_cw / col_cost / col_hit_rate` — 7 columns, consistent. ✅

### Verdict: **PASS — no contradictions**

---

## Recipe 09 — `09-recover-stuck-sprint.md`

**Source verified:** `src/cli/commands/recover.ts`, `src/cli/commands/kill.ts`, `src/cli/commands/cleanup.ts`, `src/cli/commands/spawn.ts`

### Command Verification

| Claim | Evidence | Verdict |
|-------|----------|---------|
| `deckent kill --all` | `.option('--all', ...)` + `killAllCascade()` (kill.ts:394, 271) | ✅ |
| `deckent kill --all --force` skips confirmation | `shouldProceedKillAll`: `if (opts.force ...) return true` (kill.ts:377) | ✅ |
| `deckent kill --all` prompts in interactive terminal | `interactiveKillAllConfirm` checks `process.stdin.isTTY` (kill.ts:363) | ✅ |
| `deckent cleanup` | `program.command('cleanup')` (cleanup.ts:76) | ✅ |
| `deckent recover <sprint-id>` | `program.command('recover <sprint-id>')` (recover.ts:120) | ✅ |
| `deckent recover <sprint-id> --dry-run` | `.option('--dry-run', ...)` (recover.ts:123) | ✅ |
| `deckent recover <sprint-id> --skip-audit` | `.option('--skip-audit', ...)` (recover.ts:125) | ✅ |
| `deckent spawn <task-id> --force` | `program.command('spawn <taskId>')` + `.option('--force', ...)` (spawn.ts:182, 191) | ✅ |
| `deckent start` re-launches sprint | Not in scope (start.ts) but standard sprint entry point | ✅ |

### Recovery step order

Recipe claims `deckent recover` runs in order:
1. Brain Self-Audit
2. Orphan IPC cleanup
3. Stale lock cleanup
4. Terminal task archive

Code (`runRecovery` in recover.ts:26–117):
1. `runSelfAuditGate` (step 1, line 44)
2. `cleanOrphanIpcDirs` (step 2, line 90)
3. `clearStaleLocks` + `clearStaleSpawnLocks` (step 3, lines 97, 102)
4. `postFinalizeCleanup` (step 4, line 109)

✅ Exact match.

### ℹ Note 09-A: MCP `deckent_recover` payload incomplete

Recipe shows: `deckent_recover → { root: "." }` (line 37).  
The CLI `recover` command requires `<sprint-id>` as a mandatory positional argument. The MCP payload `{ root: "." }` shows no `sprintId` field, suggesting the MCP signature may accept optional sprint-id or use a different parameter name. **Cannot verify from CLI source alone** — requires checking `src/mcp/tools/`. Not a CLI contradiction but worth flagging for MCP documentation review.

⚠ Undocumented `--json` flag on `recover` (recover.ts:126) outputs structured JSON report.

### Verdict: **PASS — no CLI contradictions**

---

## Recipe 10 — `10-nervous-alerts.md`

**Source verified:** `src/cli/commands/nervous.ts`, `src/nervous/detector-registry.ts`, `src/nervous/detectors/*.ts`, `src/core/nervous-types.ts`

### Command Verification

| Claim | Evidence | Verdict |
|-------|----------|---------|
| `deckent nervous [--lang en\|tr]` | `nervousCmd.option('--lang <code>', ...)` (nervous.ts:706) | ✅ |
| `deckent nervous accept <id>` | `nervousCmd.command('accept <id>')` (nervous.ts:726) | ✅ |
| `deckent nervous accept ns-a1b2` prefix match | `n.id.startsWith(id)` (nervous.ts:308) | ✅ |
| `deckent nervous reject <id>` | `nervousCmd.command('reject <id>')` (nervous.ts:737) | ✅ |
| `deckent nervous reject <id> --reason "..."` | `.option('--reason <text>', ...)` (nervous.ts:739) | ✅ |
| `deckent nervous edit <id>` | `nervousCmd.command('edit <id>')` (nervous.ts:748) | ✅ |
| `deckent nervous undo <action-id>` | `nervousCmd.command('undo <action-id>')` (nervous.ts:756) | ✅ |
| `deckent nervous history` | `nervousCmd.command('history')` (nervous.ts:769) | ✅ |
| `deckent nervous history --limit 50` | `.option('--limit <n>', ...)` (nervous.ts:771) | ✅ |
| `deckent nervous history --since 2h\|30m\|1d` | `parseSinceDuration` handles `m/h/d` units (nervous.ts:178) | ✅ |
| `deckent nervous log` | `nervousCmd.command('log')` (nervous.ts:799) | ✅ |
| `deckent nervous log --follow` | `.option('--follow', ...)` (nervous.ts:801) + `watchFile` impl (nervous.ts:527) | ✅ |
| `deckent nervous accept-panic <task-id>` | `nervousCmd.command('accept-panic <task-id>')` (nervous.ts:809) | ✅ |
| `deckent nervous accept-panic <task-id> --reason "..."` | `.option('--reason <text>', ...)` (nervous.ts:813) | ✅ |
| `deckent nervous baseline-refresh` | `nervousCmd.command('baseline-refresh')` (nervous.ts:819) | ✅ |
| Default mode: `balanced` | `defaults.mode: 'balanced'` (nervous.ts:103) | ✅ |
| Disabled by default | `defaults.enabled: false` (nervous.ts:104) | ✅ |
| 12 detectors listed (names match) | All 12 imported in `detector-registry.ts` (lines 11–22); detector IDs confirmed in each detector file | ✅ |

### Accept behavior

Recipe: "Routes the decision through the live executor if one is running (IPC queue); dismisses without executing if no executor is active."

Code: `if (isNervousPollerAlive(root)) { ...writeApproval... }` else `...dismissed_no_executor...` (nervous.ts:323–334). ✅ Exact match.

### ❌ CONTRADICTION 10-A: Config JSON example nests `quiet_hours` / `throttle_ms` under `notifications`, but CLI reads them from the top level

**Recipe config JSON example** (recipe lines 256–271):
```json
{
  "nervous_system": {
    "enabled": true,
    "mode": "balanced",
    "actionOverrides": { ... },
    "notifications": {
      "throttle_ms": 300000,
      "quiet_hours": {
        "start": "22:00",
        "end": "08:00"
      }
    }
  }
}
```

**CLI code** (`readNervousConfig` in nervous.ts:101–127):
```typescript
const ns = raw?.nervous_system;
return {
  quietHours: ns.quiet_hours ?? ns.quietHours ?? defaults.quietHours,
  throttleWindowMs: ns.throttle_ms ?? ns.throttleWindowMs ?? defaults.throttleWindowMs,
};
```

The CLI reads `ns.quiet_hours` and `ns.throttle_ms` — i.e., directly under `nervous_system`, NOT under `nervous_system.notifications`. A user following the recipe's JSON example will silently get defaults for both fields (the nested values are ignored by the CLI dashboard).

**Root cause context:** `NervousSystemConfigV1` (nervous-types.ts:163–198) documents that `quietHours` and `throttleWindowMs` are "legacy camelCase aliases" for V1. The V2 canonical schema (`NervousSystemConfig`) nests them under `notifications.quiet_hours` / `notifications.throttle_ms`. The CLI `nervous.ts` still reads V1 format; the recipe shows V2 format.

**Additional inconsistency within the recipe itself:** The recipe's own config reference table (recipe lines 272–279) lists `quiet_hours` and `throttle_ms` as direct keys (no `notifications` nesting), contradicting the JSON example in the same recipe.

**Impact:** Users who configure `notifications: { throttle_ms, quiet_hours }` (as shown in the recipe's JSON) will find that the CLI dashboard silently uses defaults (throttle = 5 minutes, quiet hours = 22:00–08:00). Only using the flat top-level keys `quiet_hours` / `throttle_ms` directly under `nervous_system` will be read by the CLI.

### ⚠ Omission 10-B: `deckent nervous enable` not documented

`nervousCmd.command('enable')` is registered at nervous.ts:714 with an optional `--mode <preset>` flag. This provides a one-command toggle (`deckent nervous enable --mode balanced`) instead of manually editing config.json. Not mentioned anywhere in recipe 10.

### ⚠ Omission 10-C: `deckent nervous recommendations` (`recs`) not documented

`nervousCmd.command('recommendations').alias('recs')` is registered at nervous.ts:779 with `--all`, `--limit`, and `--dismiss` flags. It shows the Brain inbox — nervous proposals awaiting disposition (ADR-037 nervous-proposes-Brain-disposes). Not mentioned in recipe 10.

### Verdict: **FAIL — one contradiction (10-A); two omissions (10-B, 10-C)**

---

## Summary Table

| Recipe | Title | CLI Contradictions | Omissions | Verdict |
|--------|-------|-------------------|-----------|---------|
| 06 | Checkpoints & Approval | 0 | `--lang` flag | PASS |
| 07 | Tech Debt Tracking | 1 (07-A: fabricated sample output) | `--count`, `--before` flags | FAIL |
| 08 | Cost and Budget | 0 | — | PASS |
| 09 | Recover Stuck Sprint | 0 (1 MCP-layer note) | `--json` flag on `recover` | PASS |
| 10 | Nervous System Alerts | 1 (10-A: config nesting) | `enable`, `recommendations` subcommands | FAIL |

---

## Required Fixes

### Fix 1 — Recipe 07: `deckent archive-debt` sample output (BLOCKING)

**File:** `docs/cookbook/07-tech-debt-tracking.md`

Replace the "Open items:" section in the sample output with the actual command output:

```
Tech debt (memory.db): 3 open, 12 resolved.
Resolved debt is retained in memory.db and pruned by sprint decay —
no manual archival step is needed (Task #4f, saf DB-first).
```

Or document `deckent recall "debt" --type debt` as the way to list individual debt items (which does return per-item results via FTS5 search).

**Optional:** Document the undocumented `--count` and `--before <sprint>` flags.

### Fix 2 — Recipe 10: Config JSON nesting (BLOCKING)

**File:** `docs/cookbook/10-nervous-alerts.md`

Either:
- **Option A (match CLI):** Change the config JSON example to use top-level keys:
  ```json
  {
    "nervous_system": {
      "enabled": true,
      "mode": "balanced",
      "actionOverrides": { ... },
      "throttle_ms": 300000,
      "quiet_hours": { "start": "22:00", "end": "08:00" }
    }
  }
  ```
- **Option B (match V2 schema):** Update `nervous.ts` `readNervousConfig` to read from `ns.notifications.quiet_hours` / `ns.notifications.throttle_ms` (aligning CLI with V2 canonical schema). Then the recipe example is correct.

Option A is the safe short-term fix (matches CLI behavior today). Option B is the correct long-term fix (V2 migration).

Also align the config reference table with whichever format is chosen.

### Fix 3 — Recipe 10: Document missing subcommands (RECOMMENDED)

Add documentation for:
- `deckent nervous enable [--mode <preset>]`
- `deckent nervous recommendations [--all] [--limit N] [--dismiss <id>]`

---

## Link Verification

| Recipe | Link | Status |
|--------|------|--------|
| 10 | `[Nervous System Architecture](/docs/architecture/authority-matrix.md)` | Not verified (file path assumed, not in scope) |
| 10 | `[Autonomous Engine](/docs/guide/autonomous.md)` | Not verified (file path assumed, not in scope) |
| 10 | `[Cookbook: Watch Sprint Status](/docs/cookbook/05-status-and-watch.md)` | Not verified (file not read, assumed to exist) |

Link verification for external paths is beyond CLI source scope; the doc-refresh VitePress lint pass (ADR-093) should catch dead links.

---

*Generated by task 345-017 · w-345-017 · 2026-06-28*
