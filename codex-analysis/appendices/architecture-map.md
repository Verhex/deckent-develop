# Architecture Map

## Current logical map

```text
Surfaces
├─ Terminal / Ink REPL ─┐
├─ CLI                  ├─ surface-specific bridges/controllers
├─ MCP                  ┤
├─ HTTP API / SSE       ┤
├─ Desktop              ┤
├─ Dashboard            ┤
├─ VS Code              ┤
└─ Connectors           ┘

Execution families
├─ Sprint orchestration: Brain → planner → scheduler → workers → evaluate/fix → finalizer
├─ Autonomous v1 backlog/runtime
├─ Mission/Goal v2: MissionStore → scheduler → engine → runner registry
├─ RunFlow: proposal → preview → approval → StartAttempt → detached run
└─ Process/capability execution requests

Cross-cutting authorities
├─ Config/model registry/provider authority/admission/budget
├─ ApprovalBroker/worker gate/RBAC/capability broker
├─ Task result settlement/receipt/evidence/recovery journals
├─ Memory/routing learning/training traces/promotion
└─ Tenant/audit/KPI/observability
```

## Load-bearing modules

| Domain | Modules |
|---|---|
| Sprint lifecycle | `orchestra/brain.ts`, `sprint-controller.ts`, `sprint-phases.ts`, `sprint-finalizer.ts` |
| Scheduling | `dependency-scheduler.ts`, scheduler reducer/effects |
| Goal/Mission | `autonomous/mission-store/**`, `mission-engine-wire.ts`, `mission-kind-admission.ts` |
| RunFlow | `core/run-flow-contract.ts`, store/coordinator/decision/start services |
| Work model | `core/work-model.ts`, `task-lineage.ts`, sprint/task types |
| Settlement | `task-result-settlement.ts`, `task-settlement-authority.ts`, terminal evidence modules |
| Provider | provider adapters, provider authority composition/bootstrap, execution admission/observation |
| Routing | `core/routing/route-task-v3.ts`, requirement vector, vocabulary, learning cells |
| Approval | `approval-broker.ts`, worker gate/env, authority runtime, connector clients |
| Surfaces | `cli/repl`, `mcp`, `api`, `dashboard`, `desktop`, `extensions/vscode`, `connectors` |

## Target composition

```text
Surface Adapter
  → Versioned Application Service
    → Canonical Lifecycle Authority
      → Principal/Tenant/Capability/Approval/Budget Policy
        → Provider/Tool/Backend Adapter
          → Operation Evidence
            → Settlement + Delivery Receipt
              → Read Models / Dashboard / Learning Candidate
```

Dashboard yalnız read model tüketir. Learning candidate direct production mutation yapmaz. Platform-specific behavior adapter altında supported/degraded/unsupported olarak görünür.
