# Recovery runbook

## Product-user perspective

Recovery is an authority-sensitive workflow. Start with read-only observation, classify the failure, preview the exact recovery scope, and mutate only with explicit owner authority. Do not delete `.tasks/*` manually and never delete `.brain/memory.db`. [Evidence: `AGENTS.md:81-94,144-151`]

### 1. Observe without mutation

```bash
deckent status --json
deckent history --json --last 1
deckent review --json
deckent bot status
deckent gateway status
deckent autonomous status
```

All six commands were run against the real binary on 2026-08-01. The snapshot was idle; provider observation was on HOLD, review contained one pending record with an unknown sprint id, and the service-status commands returned their current states. [Evidence: real-binary outputs, 2026-08-01]

Then inspect the evidence belonging to the exact run: task status, latest checkpoint, run-flow/read-model status, process/container identity, logs, and terminal receipt. Never infer ownership from a filename alone. [Evidence: `src/core/run-status-authority.ts`; `src/core/run-flow-store.ts`; `src/orchestra/sprint-checkpoint.ts`; `src/core/invocation-receipt-store.ts`]

### 2. Classify the incident

| Condition | Preferred next step | Do not do |
|---|---|---|
| `PAUSED` with a durable checkpoint | Preview `resume --dry-run`; confirm task scope and provider authority. [Evidence: real `resume --help`; `src/cli/commands/resume.ts`] | Do not recreate task files by hand. |
| `ORPHANED`, `STALE`, or interrupted sprint | Preview `recover <sprint-id> --dry-run`; choose forward recovery unless exact evidence requires restore. [Evidence: real `recover --help`; `src/cli/commands/recover.ts:170-300`] | Do not use `--force`, `--skip-audit`, or `--restore-tasks` as defaults. |
| Active process but no trustworthy terminal state | Inspect PID/container ownership and heartbeats; coordinate stop authority with the owner. [Evidence: `src/cli/commands/status.ts`; `src/orchestra/sprint-pid-manager.ts`; `AGENTS.md:81-94`] | Do not kill or cleanup an active sprint without approval. |
| Completed attempts but inconsistent summary/gate/receipt | Hold publication and reconcile exact logical-task authority. [Evidence: `PAZARTESI.md:54-58`] | Do not call PASS or COMPLETE from one projection. |
| Build-source mismatch | Restore a consistent built/source process boundary through the documented host restart/reconnect workflow. [Evidence: `AGENTS.md:88-91,139-143`] | Do not rebuild while a sprint is running or mutate provider auth. |
| DB schema drift | Stop at typed HOLD and use the owning migration entrypoint when authorized. [Evidence: OQ-07/OQ-08] | Do not edit SQLite tables manually. |

### 3. Preview the exact operation

Real binary help confirms these mutation previews:

```bash
deckent recover <sprint-id> --dry-run
deckent resume <sprint-id> --dry-run
deckent cleanup --sprint <sprint-id> --dry-run
```

`recover` also exposes `--resume`, `--restore-tasks`, `--force`, `--skip-audit`, `--auto-approve`, and `--force-scope`. Each broadens or changes authority and requires a concrete reason; preview support does not authorize the final mutation. [Evidence: real `recover --help`, 2026-08-01]

`cleanup --sprint <id>` provides an exact ownership selector, while `--decay` adds memory decay. Because cleanup can delete runtime artifacts, retain the dry-run output as evidence before approval. [Evidence: real `cleanup --help`; `src/cli/commands/cleanup.ts:118-197`]

### 4. Execute only after approval

The owner must approve kill/cleanup for a live sprint. The same safety boundary applies when a recovery flag bypasses audit, interaction, or established scope. The operating contract prohibits direct `.tasks/*` removal. [Evidence: `AGENTS.md:81-94,144-151`]

After an approved action:

1. Re-read canonical status and process/container identity.
2. Confirm expected task/checkpoint/receipt transitions.
3. Compare scoped disk changes with the attempt claim.
4. Confirm gate, summary, task verdicts, and terminal receipt agree.
5. Record any unresolved mismatch as typed HOLD; do not retry destructively by guesswork.

[Evidence: `src/core/run-status-authority.ts`; `src/orchestra/disk-verify.ts:135-207`; `src/core/invocation-receipt-store.ts`; `PAZARTESI.md:54-58`]

### 5. Finalization is not cleanup

`finalize --sprint <id>` updates settlement projections, learning, config, hooks, and decay; `--force`, `--skip-hooks`, and `--skip-decay` alter that behavior. `cleanup` handles owned runtime artifacts. Run neither as an attempt to make an inconsistent run appear complete. [Evidence: real `finalize --help`, 2026-08-01; `src/cli/commands/finalize.ts:237-350`; `src/cli/commands/cleanup.ts:118-197`]

## Dogfood / repository reality

| Recovery surface | State | Current constraint |
|---|---|---|
| Status/history/service reads | ✅ live | Real binary read calls completed; returned data still needs quality interpretation. |
| `resume --dry-run` | ✅ live surface | Registered and help-verified; no action run was authorized in this audit. |
| `recover --dry-run` | ✅ live surface | Supports canonical recovery preview and structured JSON; no action run was authorized. |
| Exact-sprint cleanup preview | ✅ live surface | CLI exposes `--sprint` and `--dry-run`; MCP cleanup does not carry the same exact-sprint input (OQ-11). |
| Bot graceful stop | ⚠️ partial | Identity guard and stale PID issues were observed in the 2026-08-01 build incident. [Evidence: `PAZARTESI.md:47-50`] |
| Stale projection recovery | ⚠️ partial | Nineteen projections awaited typed recovery at the audit date. [Evidence: `PAZARTESI.md:51`] |
| End-to-end recovery certification | 🔜 roadmap | Malformed-result and NOT_DISPATCHED recovery are explicit rungs not yet certified. [Evidence: `PAZARTESI.md:54-56`] |

This runbook intentionally stops at approval gates. It does not grant permission to recover, resume, finalize, kill, or clean an active run. [Evidence: owner boundary; `AGENTS.md:81-94`]
