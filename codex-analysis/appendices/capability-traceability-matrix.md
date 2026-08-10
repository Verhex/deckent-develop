# Capability Traceability Matrix

`Proof` sütununda source/test varlığı live certification sayılmaz. Verdict current closure zincirini ifade eder.

| Capability | Vision/plan | Producer/authority | Consumer/ingress | Config/policy | Proof durumu | Verdict |
|---|---|---|---|---|---|---|
| Goal create | Vision lifecycle; KERNEL | Goal mission builder + MissionStore | `autonomous-mission create-goal` | autonomous v2 | CLI/store tests | PARTIAL |
| Goal plan/accept | Goal-v2 | buildLiveGoalDeps | autonomous engine | role admission | candidates empty → HOLD | UNWIRED |
| Goal task execution | Goal-v2 | mission engine + runner registry | autonomous start | provider/approval authority | exact executor parked/throw | UNWIRED |
| Mission DAG | KERNEL | SqliteMissionStore | engine/scheduler | tenant/lease policy | strong unit/recovery evidence | PARTIAL/STRONG |
| Flow propose/preview | TERMINAL/RUNFLOW | compiler/coordinator/store | REPL/API | run_flow_v2 | source/tests | PARTIAL |
| Run start | RunFlow | decision/start services | REPL/API detached spawn | approval/provider authority | durable StartAttempt pieces | PARTIAL |
| WorkItem | Canonical chain | MissionStore/task model | scheduler/workers | admission kinds | task only production | PARTIAL |
| Attempt | Canonical chain | mission claims/task lineage/StartAttempt | runtime/read models | lease/fence | multiple authorities | PARTIAL |
| Operation | OPERATION-001 | none canonical | none canonical | none | no durable entity | NOT-STARTED/UNWIRED |
| Evidence envelope | RECEIPT/AUDIT | multiple stores/journals | finalizers/read models | per subsystem | fragmented | PARTIAL |
| Settlement | KERNEL-SETTLEMENT | task result/receipt/sprint evidence | CLI/status/recovery | backend-specific parts | strong atoms, no one authority | PARTIAL |
| Cancellation | Surface parity | RunFlow abort | API | lifecycle separate | flow closes, process runs | CONTRADICTED |
| Scheduler refill | SCHEDULER | dependency scheduler/reducer | sprint orchestration | config concurrency | source/tests; runtime debt | PARTIAL |
| Crash recovery | Recovery train | journals/reconcilers | restart/resume/cleanup | locks/fences | extensive tests/receipts | PARTIAL/STRONG |
| Provider admission | AUTHORITY/PROVIDER | execution admission + composition | planner/spawner | model/auth/budget | fail-closed contracts | PARTIAL |
| Provider observation | P6 | observation producer/store | Docker settlement/recovery | schema v2 | Docker-only; live DB v1 | PARTIAL |
| Provider capacity | SCALE/PROVIDER | runtime reader | admission/routing | effective config | explicit unknown/HOLD | UNKNOWN/HOLD |
| Routing v3 | ROUTING | routeTaskV3/vocabulary/cells | planner adapter | signals/weights | live signal hardcoded false | PARTIAL |
| Worker approval | APPROVAL | disk Broker + WorkerGate | agentic run_bash | gate flag/scope | real spawn/env consumer | EVIDENCE-CONFIRMED/PARTIAL matrix |
| Generic tool approval | TOOL/APPROVAL | injected confirm seam | native tool engine callers | risk threshold | Broker future/caller work | PARTIAL/UNWIRED |
| MCP write lease | MCP/AUTHORITY | writer lease gate | all non-readonly registrations | lease authority | catalog/registration tests | PARTIAL/STRONG |
| Tenant RBAC | TENANT/AUTHORITY | RBAC/capability brokers | API/connectors | defaults often off | contracts/tests | PARTIAL |
| Tenant memory | UserMemory/DATA | MemoryStore | API/MCP resources | optional tenant | unscoped paths | NO-GO/HOLD |
| Outcome learning | LEARNING | finalizer/OutcomeTracker/cells | routing/stats | non-fatal | real production caller | PARTIAL |
| Training trace | TRAINING-TRACE | sprint phase recorder | trace files | feature/config | producer wired/fail-soft | PARTIAL |
| Training pipeline | TRAINING | runPipeline | tests only | unknown | no production caller | UNWIRED |
| Promotion | PROMOTION | PromotionPipeline | finalizer | thresholds | minSprints unused, no approval | NO-GO/HOLD |
| Terminal tool disclosure | TOOL/TERMINAL | registry/search/dispatch | Ink REPL | tool_surface | production wiring exists | PARTIAL/REAL |
| Dashboard observe-only | DASHBOARD-OBS | API read models | Dashboard | mutation ratchets | embedded terminal mutates | CONTRADICTED |
| Desktop primary | DESKTOP | Electron/API bridge | Desktop app | separate package | unit only, no release train | UNPROVEN |
| VS Code | SURFACE | read-only bridge | mock panel | none | no manifest/host | UNWIRED |
| Connectors | CONNECTOR | Telegram/Discord/identity/capability | bot/gateway | per connector | WhatsApp scaffold; transport gaps | PARTIAL |
| i18n | DOCS-I18N | getMessage en/tr | CLI + partial surfaces | lang config | lint partial | PARTIAL |
| Accessibility | DESIGN/DESKTOP/TERMINAL | semantic UI/react-aria/tokens | Dashboard/Desktop/Terminal | platform | no full automated/live matrix | PARTIAL/HOLD |
| Packed install | PACKAGING | npm pack smoke | fresh global install | Node24 | Linux/macOS/Windows required | EVIDENCE-CONFIRMED (scope-limited) |
| Release provenance | RELEASE | release workflow/OIDC | npm registry | tag/exact SHA | strong workflow evidence | PARTIAL/STRONG |
| WSL/native matrix | EVERY-ENV | cross-platform workflow | release gate | platform adapters | WSL direct proof absent | UNKNOWN/HOLD |
| HA/million scale | SCALE/HA | process-local current control plane | API/runtime | enterprise defaults | synthetic small tests | NOT PROVEN |
| XVerify | XVERIFY | tool/contracts | MCP/host | different provider required | not used in this analysis | unavailable/HOLD |

## Closure rule

Bir capability yalnız şu zincir kapandığında DONE olabilir:

```text
canonical producer → authority/policy → consumer → real ingress
→ effective config/admission → effect → evidence → settlement/read model
→ dogfood + product + platform proof
```
