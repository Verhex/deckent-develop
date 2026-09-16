# Execution modes

## Product-user perspektifi

Deckent'te iki farklı “mode” kavramı vardır:

1. Capacity/model preset'leri—`performance`, `balanced`, `economic`, `api`—worker limit ve model strategy seçer.
2. `deckent_style`—`sprint`, `task` veya `process`—preferred interaction shape'i seçer.

Bunlar bağımsız çözülür. `deckent mode run` şu anda `sprint` persist eder; dördüncü style değil compatibility alias'tır. [Kanıt: `src/core/config.ts:1613-1784,1969-2021`; `src/cli/commands/mode.ts:50-173`; built `DEFAULT_MODES` output, 2026-08-01]

## Workflow seçimi

| Workflow | Ne için? | Authority ve result model | Status |
|---|---|---|---|
| Structured sprint | PLAN'dan settlement'a dependency-rich work | `DIRECTIVES.md`, sprint task'ları, evaluations, retro/decay | ✅ canlı surface; unattended certification eksik |
| `do` goal flow | Preview ve explicit approval ile natural-language goal | Effective config'e göre Golden-flow veya RunFlow-v2 | ⚠️ kısmi: proposal persist edebilir ve real provider ister |
| One-shot `run` | Tek bounded coding task | Task-mode files + immutable settlement evidence | ✅ canlı surface; parent/alias grammar ambiguous |
| Process mode | Durable task/sprint/capability request'leri | Poll edilebilir status/result taşıyan `ExecutionRequest` | ✅ canlı CLI/MCP family; side effect policy-gated |
| Autonomous | Recurring, one-off, reactive backlog | Durable backlog + approval/policy/effect-class gate'leri | ⚠️ kısmi: default/flag ve reactive wiring constraint'leri |
| Test sprint | Retro/memory/decay olmadan execution exercise | Test-specific sprint path | ✅ registered; audit'te çalıştırılmadı |

[Kanıt: `src/cli/commands/start.ts`; `src/cli/commands/do.ts:169-357,440-517`; `src/cli/commands/run.ts:451-939`; `src/cli/commands/process.ts:142-190`; `src/cli/commands/autonomous.ts:1710-1946`; root help real output, 2026-08-01]

## Goal-first `do`

`--run` olmadan legacy golden-flow branch preview sonrası durur. `terminal.run_flow_v2=true` iken `do`, RunFlow controller'a delegate eder: real provider-backed proposal compile eder, prompt/topology/scope gate'leri ve plan digest'i render eder; execution istenmediyse döner. Proposal path durable RunFlow service kullandığı için mutlaka read-only değildir. [Kanıt: `src/cli/commands/do.ts:132-179,219-304,469-500`]

`--run` ile RunFlow v2 non-interactive approval için ayrıca `--yes` ister. Failed topology, scope veya prompt gate start öncesi reject eder; `--yes` consent'tir, gate override değildir. [Kanıt: `src/cli/commands/do.ts:307-350,440-495`]

## One-shot task mode

`run <description>`; provider/model/effort, scope, timeout, retention, approval ve verbose streaming option'ları seçer. Full sprint cycle'ı bypass eder; provider authority veya settlement'ı bypass etmez. [Kanıt: `src/cli/commands/run.ts:451-476`; `src/core/task-settlement-authority.ts`]

Aynı Commander node `run start|status|retro|history` alias'larını da taşır. Real help awkward combined parent grammar render eder; bunu iki interchangeable domain model değil known public-contract issue olarak ele alın. [Kanıt: `src/cli/commands/run.ts:920-939`; gerçek `deckent run --help`, 2026-08-01; OQ-14]

## Process mode

`process submit`; `task`, `sprint` veya `capability` ile scope/provider/model override kabul eder. Service effect'i classify eder: read-only work otomatik execute olabilir; side-effecting work approval için park eder. `process status` ve `process result`, execution id ile query yapar. [Kanıt: `src/cli/commands/process.ts:142-190`; `src/core/work-model.ts:82-210`; `src/orchestra/process-controller.ts:1-18,128-218`]

## Autonomous mode

Runtime; enable/start/plan/status/stop/cleanup, pending approvals, approve/reject ve backlog add/list/remove sunar. Enable explicit'tir; start default-deny human-approval gate kullanır. [Kanıt: `src/cli/commands/autonomous.ts:1710-1946`]

Manifest runtime'ı active ve default-off diye tanımlar; current dogfood effective config snapshot ise `autonomous.enabled=true` gösterdi. Gerçek read-only `autonomous status`, beş backlog entry döndürdü: üç done, iki failed, pending/running/parked yok. Bu portable default değil repository snapshot'tır. [Kanıt: manifest `autonomous-runtime`; effective-config run ve real status output, 2026-08-01]

Aynı manifest iki limit kaydeder: autonomous start/backlog/status için MCP surface yoktur ve Nervous reactive bridge attach-only'dir; çünkü observer autonomous start tarafından drive edilmez. Concurrent ExecutionPool production use da eksiktir. [Kanıt: `.deckent/settings/features-manifest.json` `autonomous-runtime` entry]

## Dogfood / repository gerçeği

- `✅ canlı`: mode command'ları, sprint/task/process/autonomous CLI registration'ları, RunFlow branching ve status read'leri.
- `⚠️ kısmi`: autonomous reactive input, MCP parity, one-shot/run naming ve unattended execution certification.
- `🔜 roadmap`: normalize Goal→Operation link'lerinin tek end-to-end type/authority graph olduğu iddia edilmez; OQ-05/OQ-06 canonical ownership eksikliğini takip eder.

Bu sayfadaki tüm command form'ları real binary'de help ile doğrulandı. State-changing action'lar çalıştırılmadı. [Kanıt: 212-call help audit, 2026-08-01; OQ-20]
