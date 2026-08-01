# Execution modes

## Product-user perspective

Deckent has two different “mode” concepts:

1. Capacity/model presets—`performance`, `balanced`, `economic`, `api`—select worker limits and model strategy.
2. `deckent_style`—`sprint`, `task`, or `process`—selects the preferred interaction shape.

They are resolved independently. `deckent mode run` currently stores `sprint`; it is a compatibility alias, not a fourth style. [Evidence: `src/core/config.ts:1613-1784,1969-2021`; `src/cli/commands/mode.ts:50-173`; built `DEFAULT_MODES` output, 2026-08-01]

## Workflow selection

| Workflow | Use it for | Authority and result model | Status |
|---|---|---|---|
| Structured sprint | Dependency-rich work needing PLAN through settlement | `DIRECTIVES.md`, sprint tasks, evaluations, retro/decay | ✅ live surface; unattended certification incomplete |
| `do` goal flow | Natural-language goal with preview and explicit approval | Golden-flow or RunFlow-v2 based on effective config | ⚠️ partial: proposal may persist and requires real provider |
| One-shot `run` | A single bounded coding task | Task-mode files plus immutable settlement evidence | ✅ live surface; parent/alias grammar ambiguous |
| Process mode | Durable task/sprint/capability requests | `ExecutionRequest` with pollable status/result | ✅ live CLI/MCP family; side effects policy-gated |
| Autonomous | Recurring, one-off, reactive backlog | Durable backlog + approval/policy/effect-class gates | ⚠️ partial: default/flag and reactive wiring constraints |
| Test sprint | Exercising execution without retro/memory/decay | Test-specific sprint path | ✅ registered; not run in this audit |

[Evidence: `src/cli/commands/start.ts`; `src/cli/commands/do.ts:169-357,440-517`; `src/cli/commands/run.ts:451-939`; `src/cli/commands/process.ts:142-190`; `src/cli/commands/autonomous.ts:1710-1946`; root help real output, 2026-08-01]

## Goal-first `do`

Without `--run`, the legacy golden-flow branch stops after preview. When `terminal.run_flow_v2=true`, `do` delegates to the RunFlow controller: it compiles a real provider-backed proposal, renders prompt/topology/scope gates and the plan digest, then returns unless execution was requested. The proposal path is not necessarily read-only because it uses durable RunFlow services. [Evidence: `src/cli/commands/do.ts:132-179,219-304,469-500`]

With `--run`, RunFlow v2 also requires `--yes` for non-interactive approval. Failed topology, scope, or prompt gates reject before start; `--yes` is consent, not a gate override. [Evidence: `src/cli/commands/do.ts:307-350,440-495`]

## One-shot task mode

`run <description>` selects provider/model/effort, scope, timeout, retention, approval, and verbose streaming options. It bypasses the full sprint cycle but does not bypass provider authority or settlement. [Evidence: `src/cli/commands/run.ts:451-476`; `src/core/task-settlement-authority.ts`]

The same Commander node owns `run start|status|retro|history` aliases. Real help renders the awkward combined parent grammar; treat this as a known public-contract issue, not two interchangeable domain models. [Evidence: `src/cli/commands/run.ts:920-939`; actual `deckent run --help`, 2026-08-01; OQ-14]

## Process mode

`process submit` accepts `task`, `sprint`, or `capability`, plus scope/provider/model overrides. The service classifies the effect: read-only work may execute automatically; side-effecting work parks for approval. `process status` and `process result` query by execution id. [Evidence: `src/cli/commands/process.ts:142-190`; `src/core/work-model.ts:82-210`; `src/orchestra/process-controller.ts:1-18,128-218`]

## Autonomous mode

The runtime exposes enable/start/plan/status/stop/cleanup, pending approvals, approve/reject, and backlog add/list/remove. Enabling is explicit; start uses a default-deny human-approval gate. [Evidence: `src/cli/commands/autonomous.ts:1710-1946`]

The manifest calls the runtime active and default-off, but the current dogfood effective config snapshot had `autonomous.enabled=true`. A real read-only `autonomous status` returned five backlog entries: three done, two failed, none pending/running/parked. This is a repository snapshot, not a portable default. [Evidence: manifest `autonomous-runtime`; effective-config run and real status output, 2026-08-01]

The same manifest records two limits: no MCP surface for autonomous start/backlog/status, and the Nervous reactive bridge is attach-only because the observer is not driven by autonomous start. Concurrent ExecutionPool production use also remains incomplete. [Evidence: `.deckent/settings/features-manifest.json` entry `autonomous-runtime`]

## Dogfood / repository reality

- `✅ live`: mode commands, sprint/task/process/autonomous CLI registrations, RunFlow branching, and status reads.
- `⚠️ partial`: autonomous reactive input, MCP parity, one-shot/run naming, and unattended execution certification.
- `🔜 roadmap`: no claim is made that every normalized Goal→Operation link is one end-to-end type/authority graph; OQ-05/OQ-06 track the missing canonical ownership.

All command forms in this page were help-verified against the real binary. State-changing actions were not executed. [Evidence: 212-call help audit, 2026-08-01; OQ-20]
