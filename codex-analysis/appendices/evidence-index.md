# Evidence Index

## Authority / target

| Evidence | Kullanım |
|---|---|
| `AGENTS.md` | Immutable Laws, operating rules, precedence, quality bar |
| `.deckent/workspace/IDENTITY.md` | Product identity, Trinity, surfaces, environments |
| `docs/en/vision.md` | Canonical yön ve gerekçe, ürün, lifecycle, audiences, falsifiers |
| `docs/MASTER-PLAN.md` | Canonical work ledger contract |
| `docs/generated/master-plan-active.json` | Deterministic ledger snapshot |
| `PAZARTESI.md` | En güncel fakat non-canonical bridge/evidence/owner sequence |

## Critical source evidence

| Finding | Source |
|---|---|
| Goal-v2 HOLD-only | `src/cli/commands/autonomous.ts:828-939,1074-1099` |
| Runner registry only task | `src/orchestra/autonomous/mission-store/mission-kind-admission.ts:211-219,298-322` |
| Creator/approval gap | `goal-mission.ts`, `autonomous-mission.ts`, `autonomous.ts:1021-1066` |
| Canonical model split | `core/work-model.ts`, `mission-types.ts`, `run-flow-contract.ts`, settlement modules |
| Goal false completion | `mission-scheduler.ts`, `mission-engine-wire.ts` |
| Worker approval real wiring | `worker-approval-env.ts`, `agentic-worker-runner.ts`, `agentic-worker-tools.ts` |
| Generic tool approval gap | `src/core/tool-dispatch.ts:10-15,65-70` |
| Memory tenant gap | `memory-store.ts:131-180,451-459`; API/MCP memory consumers |
| Run cancellation split | `src/api/run-flow-routes.ts:450-487` |
| Provider matrix gaps | provider bootstrap, Docker observation producer, concurrency reader, route-task-v3 |
| Learning/promotion | `sprint-finalizer.ts:2580-2820`; `promotion-pipeline.ts` |
| Training closure | `sprint-phases.ts`, `output-collector.ts`, `src/training/pipeline.ts` callers |
| Dashboard boundary | Dashboard Layout/TerminalPanel/TerminalTabs/terminal-api |
| Surface parity | command registry, API RPC map/write handlers, connector/VS Code modules |
| Platform/release | `.github/workflows/cross-platform-e2e.yml`, `release.yml`, `package.json` |
| Scale/HA | API process-local Maps/Sets, RunFlow process lifetime, MASTER scale rows |

## Quality and metrics evidence

| Evidence | Snapshot |
|---|---|
| `scripts/test-failure-baseline.json` | 115 files / 591 failures |
| Static file/LOC inventory | `rg --files`, `wc -l`, grouped source directories |
| MCP catalog | 49 entries in `src/mcp/tools/index.ts` |
| CLI inventory contract | ≥45 top-level commands in `tests/cli/cli-inventory.test.ts` |
| Provider DB readonly schema | v1, 53 interval rows, 0 contradiction rows |
| Worktree baseline | HEAD/status/stat captured before report writes |

## Evidence provenance labels

- `STATIC`: source/doc/config inspection.
- `OBSERVED-STATIC`: deterministic file/count/query observation.
- `RECORDED`: repository'deki tarihli prior run claim'i.
- `LIVE-READONLY`: existing disk authority salt-okunur query.
- `UNKNOWN-LIVE`: bu analizde çalıştırılmayan davranış.
- `HOLD`: required authority/evidence unavailable.
