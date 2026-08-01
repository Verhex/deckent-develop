# Current frictions and certification status

This page is a dated repository-status report, not a promise about future behavior. The authority for active planning remains `docs/MASTER-PLAN.md`; this page does not edit or replace it. [Evidence: `AGENTS.md:96-101`; documentation boundary, 2026-08-01]

## Product-user perspective

The CLI, MCP, API, terminal, dashboard, desktop, connector, worker, memory, and Nervous surfaces are present, but the accepted 2026-08-01 audit does not certify unattended end-to-end orchestration for production publication. Use explicit observation and approval boundaries for consequential work. [Evidence: `PAZARTESI.md:36-60`; surface registrations `src/cli/index.ts`, `src/mcp/tools/index.ts`, `src/api/server.ts`]

### What is safe to infer today

- A command that renders help is registered; it is not proof that its side effects completed correctly. [Evidence: recursive real-binary help audit, 2026-08-01]
- A worker-written result is input to evaluation, not terminal truth. [Evidence: `src/core/task-result-schema.ts:205-300`; `src/orchestra/result-evaluator.ts`]
- A PASS gate alone is not completion evidence while task/summary/receipt consistency is an open defect. [Evidence: `PAZARTESI.md:54-58`]
- A configured feature can still be only partially certified. [Evidence: manifest status inventory and `PAZARTESI.md:36-58`]
- Recovery and cleanup are operator actions with state consequences; inspect first and obtain owner authority where required. [Evidence: real `recover --help`, `cleanup --help`, 2026-08-01; `AGENTS.md:81-94`]

## Dogfood / repository reality

### Stabilization blockers accepted on 2026-08-01

| Finding | State | Observable risk | Accepted closure direction |
|---|---|---|---|
| Scoped criteria isolation | ⚠️ open | An ambient TypeScript error from another task can contaminate a task verdict. | Evaluate only the bounded criterion/evidence set. [Evidence: `PAZARTESI.md:39-41`] |
| Repair scope augmentation | ⚠️ open | A FIX can inherit the same impossible scope that caused NO_GO. | Add diagnosed missing paths under explicit authority. [Evidence: `PAZARTESI.md:41`] |
| Generated-skill durability | ⚠️ open | A PLAN-created skill can disappear before FIX, yielding `FORCED_SKILL_UNAVAILABLE`. | Preserve the admitted skill through repair attempts. [Evidence: `PAZARTESI.md:42`] |
| Atomic result writing and malformed recovery | ⚠️ open | Three named malformed `.result` cases blocked collection. | Make writes atomic and collector recovery typed. [Evidence: `PAZARTESI.md:43`] |
| Collect→evaluate→status transactionality | ⚠️ open | A valid result can coexist with EXECUTING state. | Settle collection, evaluation, and status as one consistent transition. [Evidence: `PAZARTESI.md:44`] |
| Continuous slot refill | ⚠️ open | Capacity can remain idle before EXECUTE ends and repair work can be delayed. | Refill admitted slots continuously. [Evidence: `PAZARTESI.md:45`] |

### Live build/recovery frictions

| Finding | State | Evidence-backed detail |
|---|---|---|
| `bot stop` identity guard | ⚠️ open | A build-source-mismatch HOLD also blocked the command intended to stop/recover the bot; the recorded workaround was OS SIGTERM. [Evidence: `PAZARTESI.md:47-49`] |
| Stale bot PID | ⚠️ open | SIGTERM did not remove `bot.pid`; clean tolerated the dead PID, but PID hygiene remains unresolved. [Evidence: `PAZARTESI.md:48-49`] |
| Dashboard build/clean policy conflict | ⚠️ open | `clean` preservation and `build:dashboard` empty-output expectations produced `E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY`. [Evidence: `PAZARTESI.md:50`] |
| Stale run projections | ⚠️ open | Nineteen `STALE`/`STALE_DEAD` run-flow/run-job projections require typed recovery. [Evidence: `PAZARTESI.md:51`] |
| Generated documentation projections | ⚠️ pipeline-owned | `docs:ref:check` reports five missing outputs and `lint:master-plan` reports `IDENTITY_REGISTRY_MISSING`; manual repair is forbidden for this documentation task. [Evidence: `PAZARTESI.md:52`; owner Tur-2 decision]
| Provider observation migration | ⚠️ open | Source expects schema v2 while the live DB reports v1; migration belongs to runtime ownership, not docs. [Evidence: real PRAGMA snapshot; `src/core/provider-execution-observation-store.ts:14,114-169`; OQ-07] |

### Additional documentation audit findings

- `config show` is shown by legacy material but is rejected by the current CLI; bare `deckent config` is the read surface. [Evidence: real binary runs, 2026-08-01; `src/cli/commands/config.ts`]
- `connect --json` reported `toolCount: 31` although the canonical MCP registration exports 49 tools. [Evidence: real binary output; `src/mcp/tools/index.ts:54-177`]
- Doctor's Node guidance says `>=18`, while package and identity require Node `>=24`. [Evidence: `src/cli/commands/doctor.ts`; `src/core/errors.ts:139`; `package.json:115-118`; `.deckent/workspace/IDENTITY.md:10`]
- The static error registry ends at `DECKENT_E079`, while live source emits `DECKENT_E081` through `DECKENT_E091`. [Evidence: `src/core/errors.ts`; repository error-code scan; `docs/en/reference/errors.md`]
- Run-flow router comments say four routes and no start, while the dispatcher implements eight action routes including start/cancel/diff. [Evidence: `src/api/run-flow-routes.ts`; `docs/en/reference/api-surface.md`]
- Config metadata covers only a subset of 164 effective default leaves and contains default disagreements. [Evidence: `src/core/config.ts:2674-2850`; built `createDefaultConfig` leaf inventory]

The detailed disposition, correct-side judgment, recommended direction, and evidence for each item live in [CODE-DOC-DIFF-2026-08](../../analysis/CODE-DOC-DIFF-2026-08.md).

### Certification ladder

The accepted ladder is sequential: one successful task; a three-task dependency chain; intentional NO_GO→FIX→DONE; malformed-result recovery; NOT_DISPATCHED→recover; mixed-provider refill; and a 50-task smoke. Stop on a failed rung and replay that same bounded case. Acceptance requires at least three consecutive owner-intervention-free `COMPLETE + gate PASS` sprints, no malformed result, and no task/summary/gate/receipt contradiction. [Evidence: `PAZARTESI.md:54-56`]

Current verdict: **HOLD — not certified for publish-grade autonomous execution.** This does not mark every surface broken; it distinguishes implemented components from the unclosed end-to-end proof. [Evidence: `PAZARTESI.md:36-60`]
