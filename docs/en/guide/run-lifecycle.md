# Run lifecycle

## Product-user perspective

Deckent's structured workflow has five operator moments: define intent, inspect a plan, start admitted work, observe/evaluate it, and settle learning. The CLI exposes these as `plan`, `start`, `status`/`watch`, `review`, and `retro`/`finalize`. [Evidence: registrations `src/cli/index.ts:119-160`; command sources cited below]

### Define and plan

`DIRECTIVES.md` is the structured sprint input. `plan --dry-run` forces a structured, provider-optional preview and returns before task files are written. Normal planning can interrogate directives, enforce prompt/scope gates, and transition the plan for later execution. [Evidence: `src/cli/commands/plan.ts:121-205,253-254,367-461`]

Help-verified syntax:

```bash
deckent plan --dry-run
deckent plan --interrogate
```

These exact help paths were run against the real binary; the actions were not run in this audit. [Evidence: recursive binary-help audit, 2026-08-01]

### Start only after admission

`start [description]` supports a structured existing directive or a zero-config description. Its flags expose explicit bypasses for doctor, scope, and prompt gates; those bypasses are authority decisions, not ordinary convenience flags. `--dry-run` plans without spawning workers. [Evidence: `src/cli/commands/start.ts:246-345,790-915`]

```bash
deckent start --dry-run
deckent start --watch
```

Execution was not run here because of the owner boundary. [Evidence: OQ-20]

### Observe

`status` can render snapshot, watch, follow, raw, verbose, graph, or JSON views. `watch --follow <taskId>` selects Docker logs, a tmux pane, or a subprocess log according to worker backend. [Evidence: `src/cli/commands/status.ts:1024-1040`; `src/cli/commands/watch.ts:134-184`]

A real `status --json` run returned `IDLE`, no active sprint, a persisted read model, and a provider-observation HOLD. A real `dashboard --json` run exited 1 with `{"error":"No active sprint. Run deckent start first."}`; the terminal dashboard therefore fails honestly when there is no run to project. [Evidence: real-binary outputs, 2026-08-01]

### Review, explain, and retrospect

`review --json` reads the review state; modification flags auto-decide or approve/reject pending items. In the audit snapshot, the read-only command returned one pending review with an unknown sprint id—valid evidence of data quality that must not be presented as a clean settlement. [Evidence: `src/cli/commands/review.ts:184-224`; real output, 2026-08-01]

`retro --json` returned sprint-490 with 14/14 completed, zero NO_GO and zero tech debt, but no coverage value. `history --json --last 1` returned the same sprint with `coverage: "0.0%"`; the conflicting absence/zero representation is a current reporting gap. [Evidence: real outputs, 2026-08-01; `src/cli/commands/retro.ts:334-342`; `src/cli/commands/history.ts:222-232`]

`finalize` updates managed knowledge/config projections and runs decay unless skipped. It is a consequential settlement action; it is not a read-only synonym for retro. [Evidence: `src/cli/commands/finalize.ts:237-270`]

## Internal eight-phase lifecycle

The intended eight operator-visible phases are:

`PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`

PLAN parses and gates work; SPAWN admits worker attempts; EXECUTE collects results; EVALUATE applies evidence-backed verdicts; FIX retries eligible NO_GO work; RETRO records outcomes; DECAY applies memory policy; CLEANUP settles artifacts. [Evidence: `src/orchestra/sprint-controller.ts:1594-1596,2912-2934`; `src/orchestra/sprint-phases.ts:4170-4207`; manifest entry `sprint-controller`]

The public `SprintPhase` type includes `DIRECTIVE`, `TRANSITION`, and `COMPLETE` but not `CLEANUP`, while source comments disagree between CLEANUP and COMPLETE. Canonical phase naming remains typed `HOLD` in OQ-04. [Evidence: `src/core/sprint-types.ts:9-20`; OQ-04]

## Evidence and settlement chain

A task result is not completion by declaration. Current code has result evaluation, task settlement authority, invocation receipts, run-flow append records, checkpoints, audit events, and retrospective outputs. The exact authority flow is documented in [Evidence and settlement](../operations/evidence-and-settlement.md). [Evidence: `src/orchestra/result-evaluator.ts`; `src/core/task-settlement-authority.ts`; `src/core/invocation-receipt-store.ts`; `src/core/run-flow-store.ts`; `src/orchestra/sprint-checkpoint.ts`]

## Dogfood / repository reality

| Capability | State | Current constraint |
|---|---|---|
| CLI lifecycle surface | ✅ live | All command/help paths register and render. |
| Eight-phase implementation | ⚠️ partial | Lifecycle code is substantial; public phase vocabulary is internally inconsistent (OQ-04). |
| Status/read model | ✅ live | Real idle snapshot and typed HOLD evidence were returned. |
| Review/retro/history | ⚠️ partial | Read paths work; unknown sprint review and coverage representation conflict were observed. |
| Automated settlement | ⚠️ partial | PAZARTESI records collect→evaluate→status transaction gaps and all-roots-NO_GO versus PASS gate contradictions. |
| Unattended certification | ⚠️ partial | 0/31 intervention-free audit result; certification ladder is not complete. [Evidence: `PAZARTESI.md`] |

Do not infer `COMPLETE` from a green process exit alone. Read status authority, task verdicts, settlement evidence, and gate output together. [Evidence: production-wiring rule `AGENTS.md:42-55`; `PAZARTESI.md`]
