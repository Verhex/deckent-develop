# Recovery and troubleshooting

## Product-user perspective

Recovery starts with observation, not deletion. Preserve evidence, identify the exact run/task/attempt, preview the canonical recovery action, obtain required approval, and verify settlement afterward. [Evidence: `AGENTS.md:69-108`; `src/cli/commands/recover.ts:37-116,170-291`; `src/cli/commands/resume.ts:246-580`]

### Read-only triage

1. Run `deckent status --json` and read lifecycle, resumability, authority conflicts, provider observations, and pending approvals.
2. Use `deckent doctor --json` for platform/provider/workspace checks.
3. Use `deckent review --json`, `retro --json`, and `history --json` to compare task, settlement, and report projections.
4. Use `deckent output <taskId>` or `watch --follow <taskId>` only after confirming the exact attempt/backend.

All listed command paths were real-binary help-verified; the first three read paths were action-run in this audit. [Evidence: run ledger, 2026-08-01; `src/cli/commands/status.ts`; `src/cli/commands/doctor.ts`; `src/cli/commands/review.ts`; `src/cli/commands/output.ts`; `src/cli/commands/watch.ts`]

### Canonical recovery choices

| Situation | Preview / action | Contract |
|---|---|---|
| Recoverable checkpoint | `resume <sprintId> --dry-run` | Derives exact resumable set and returns before deleting/resetting artifacts |
| Crashed/stuck sprint | `recover <sprint-id> --dry-run` | Diagnoses canonical cleanup/recovery without applying it |
| Resume through recovery | `recover <sprint-id> --resume --dry-run` | Re-enters canonical resume in a fresh process |
| Restore archived task snapshot | `recover <sprint-id> --restore-tasks --force` | Explicit destructive rollback path; cannot combine with dry-run/resume |
| Cleanup preview | `cleanup --dry-run --sprint <id>` | Lists archive/delete targets before action |
| Human checkpoint | `checkpoint list --pending --json` | Reads approvals; approve/reject are mutations |

[Evidence: `src/cli/commands/resume.ts:246-492`; `src/cli/commands/recover.ts:170-291`; `src/cli/commands/cleanup.ts:118-196`; `src/cli/commands/checkpoint.ts:65-160`]

These are syntax contracts, not action-run evidence in this audit. Owner approval is required before kill/cleanup of a live sprint. [Evidence: owner policy `AGENTS.md:69-108`]

### Why dry-run matters

Resume computes a canonical disposition and exits before task/checkpoint mutation in dry-run mode. Recovery rejects contradictory flag combinations; restoring tasks additionally requires `--force`. Cleanup prints exact archive/delete categories and tells the operator to rerun without dry-run. [Evidence: `src/cli/commands/resume.ts:315-397,455-492`; `src/cli/commands/recover.ts:189-237`; `src/cli/commands/cleanup.ts:118-196`]

A preview is still only as trustworthy as its authority snapshot. If status reports another active sprint, unknown ownership, malformed settlement, or provider observation HOLD, do not “fix” it by deleting `.tasks` or `.brain`. [Evidence: `src/cli/commands/resume.ts:529-580`; immutable memory and cleanup rules `AGENTS.md:69-108`]

### Doctor repair boundary

`doctor --fix` is preview-by-default over a closed whitelist: missing runtime directories, stale shadow permissions, missing/corrupt config, and stale worker locks. `--yes` applies; explicit `--dry-run` wins. Docker image rebuild has its own confirmation path. [Evidence: `src/cli/commands/doctor.ts:1871-2115,2190-2245`]

## Dogfood / repository reality

The 2026-08-01 handoff records:

- build-source mismatch can block `bot stop`, forcing an OS-level SIGTERM workaround;
- SIGTERM can leave `bot.pid`;
- clean preserves dashboard output while the dashboard builder requires an empty target, producing `E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY`;
- 19 stale RunFlow/RunJob projections await typed recovery;
- malformed result, result/status transaction, and final-gate authority contradictions remain;
- generated references and the identity registry projection were missing after the docs reset; the owner restored their pipeline-owned inputs/outputs on 2026-08-02 and both checks are now green;
- provider observation source expects schema v2 while the live DB is v1.

[Evidence: `PAZARTESI.md:37-58`; read-only PRAGMA and docs checks, 2026-08-01; owner-verified pipeline/gate runs, 2026-08-02]

The handoff's raw dashboard deletion workaround is historical incident evidence, not a generally authorized instruction. Do not run it without exact owner-approved scope. [Evidence: destructive-action rules; `PAZARTESI.md:50`]

### Certification ladder

The required order is one successful task; a three-task dependency chain; intentional NO_GO→FIX→DONE; malformed-result recovery; NOT_DISPATCHED recovery; mixed-provider refill; then a 50-task smoke. Acceptance requires at least three consecutive owner-intervention-free `COMPLETE + PASS` runs and zero malformed or task/summary/gate/receipt contradictions. [Evidence: `PAZARTESI.md:55-58`]

Until that evidence exists, unattended production reliability remains `⚠️ partial`.
