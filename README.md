# Deckent

**A provider-neutral, local-first Agent OS for turning goals into governed, evidence-backed work.**

Deckent unifies an assistant, parallel workers, and a platform control plane around one authority chain: `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`. Terminal and Desktop are the primary operator surfaces; CLI, MCP, API, process/autonomous entry points, and connectors are adapters; Dashboard is an observability projection. [Evidence: `.deckent/workspace/IDENTITY.md:2-10,16-17`]

[English documentation](https://github.com/VerhexIO/deckent/blob/main/docs/en/overview.md) · [Türkçe dokümantasyon](https://github.com/VerhexIO/deckent/blob/main/docs/tr/overview.md) · [Current truth gaps](https://github.com/VerhexIO/deckent/blob/main/docs/analysis/CODE-DOC-DIFF-2026-08.md)

## Why it exists

A useful agent runtime must do more than generate code. Deckent resolves provider and model policy, decomposes dependency-aware work, constrains write scope, records attempts and operations, evaluates results, settles evidence, retains memory, and exposes recovery paths. Those responsibilities are visible in the current orchestration, configuration, memory, authority, and run-flow modules. [Evidence: `src/orchestra/sprint-controller.ts`; `src/orchestra/dependency-scheduler.ts`; `src/core/config.ts`; `src/core/memory-store.ts`; `src/core/run-flow-store.ts`; `src/core/task-settlement-authority.ts`]

The product is designed for two audiences at once: a solo user who wants low-friction control, and organizations that require multi-project, multi-tenant, cross-platform policy and audit. It must work across macOS, Linux, Windows native, and WSL2, or fail explicitly when a capability is unavailable. [Evidence: `AGENTS.md:13-35`; `.deckent/workspace/IDENTITY.md:6,15`]

## Installation contract

The npm package exposes `deckent` and `deckent-mcp`, requires Node.js `>=24.0.0`, and publishes the compiled `dist` tree. [Evidence: `package.json:2-20,115-123`]

For a published-package installation, the declared command is `npm install -g deckent`. This documentation audit did **not** execute that networked, global mutation, so installation-from-registry remains `HOLD` until the publish pipeline verifies it. The repository build command `npm run build:all` was run by the owner immediately before this rewrite. [Evidence: `package.json:22-38`; owner run statement, 2026-08-01; `docs/analysis/OPEN-QUESTIONS-2026-08.md`]

## Verified five-minute orientation

The following four commands were executed against the current compiled binary on 2026-08-01. They are read-only; they identify the binary, inspect readiness, preview onboarding, and read current run authority.

```bash
node dist/cli/entry.js --version-json
node dist/cli/entry.js doctor --json
node dist/cli/entry.js onboard --plan-only --json
node dist/cli/entry.js status --json
```

Observed checkpoints:

- Version reported `1.0.0-beta.1`, Node `v24.15.0`, Linux; exit 0.
- Doctor returned `ok: true`; its honest summary reported 15 ready and 2 non-required missing checks in this workspace; exit 0.
- Onboarding returned a project-scoped, balanced config plan with `applied: false`; it detected logged-in Claude and Codex sessions and did not write the plan; exit 0.
- Status returned `active: false`, `lifecycle: IDLE`, and an honest provider-observation `HOLD` for four unresolved intervals outside the exact current-run task set; exit 0.

[Evidence: real-binary outputs for all four commands, 2026-08-01; read-only contracts `src/cli/commands/doctor.ts:2190-2245`, `src/cli/commands/onboard.ts:301-316,502-546`, `src/cli/commands/status.ts:725-781,1024-1040`]

Starting actual work is intentionally not presented as verified here. The audit was expressly prohibited from running sprint/run/autonomous execution commands. The exact execution-proof authority is therefore typed `HOLD` rather than replaced with fabricated output. [Evidence: owner boundary; `docs/analysis/OPEN-QUESTIONS-2026-08.md` OQ-20]

## Choose a workflow

| Need | Surface | Current user contract | Repository truth |
|---|---|---|---|
| Conversational control | Bare `deckent` or `deckent chat --native` | Interactive agentic REPL | Bare invocation routes to native chat; interactive TTY uses the Ink REPL. [Evidence: `src/cli/entry.ts:51-107,157-171,664-713`] |
| Goal preview / governed start | `deckent do <goal>` | Preview by default; `--run --yes` is the explicit non-interactive start path when RunFlow v2 is enabled | Proposal compilation is a real provider call; the RunFlow path can persist a proposal even without starting, so it was not run in this audit. [Evidence: `src/cli/commands/do.ts:132-179,219-357,440-517`] |
| Structured lifecycle | `plan`, `start`, `status`, `review`, `retro` | Plan, execute, observe, adjudicate, learn | All command/help contracts are live; state-changing paths were help-verified only in this audit. [Evidence: `src/cli/commands/plan.ts:121-205`; `src/cli/commands/start.ts:329-345`; `src/cli/commands/status.ts:1024-1040`; `src/cli/commands/review.ts:184-224`; `src/cli/commands/retro.ts:334-342`] |
| One-shot work | `run <description>` | Execute one task without a sprint cycle | The same `run` parent also owns lifecycle aliases, a documented CLI ambiguity. [Evidence: `src/cli/commands/run.ts:451-476,920-939`] |
| Durable process work | `process submit/status/result` | Submit an `ExecutionRequest`; side effects can park for approval | CLI surface is registered and points at process services. [Evidence: `src/cli/commands/process.ts:142-190`] |
| Continuous work | `autonomous …` | Durable backlog, approvals, status, and loop controls | Manifest marks runtime active but default-off and records missing MCP parity plus an attach-only reactive bridge. [Evidence: `.deckent/settings/features-manifest.json`; `src/cli/commands/autonomous.ts:1710-1946`] |
| Remote/programmatic control | HTTP/SSE and MCP | API server and 49 MCP tools / 8 resources | 49 tools are registered; CLI/MCP parity gate still accepts 37 CLI-only and 1 MCP-only baseline gaps. [Evidence: `src/mcp/tools/index.ts:68-125`; `src/mcp/server.ts`; `npm run lint:parity`, 2026-08-01] |

## Product capabilities

- Deterministic, evaluation-backed lifecycle orchestration, dependency scheduling, FIX retries, checkpoints, retrospectives, and rollback policy. [Evidence: `src/orchestra/sprint-phases.ts`; `src/orchestra/dependency-scheduler.ts`; `src/orchestra/sprint-checkpoint.ts`; `src/orchestra/rollback.ts`]
- Provider-neutral routing from effective config, model registry, live authority, reachability, limits, and budget rather than a hard-coded product provider. [Evidence: `.deckent/workspace/IDENTITY.md:10`; `src/core/config.ts`; `src/core/model-registry.ts`; `src/core/routing/route-task-v3.ts`]
- DB-first memory with SQLite/FTS5, relation/history support, document freshness, KPI stores, recall, and export/backup operations. [Evidence: `src/core/memory-store.ts:100-338`; `src/core/memory-query.ts`; `src/cli/commands/memory.ts`; `src/cli/commands/recall.ts:11-20`]
- Runtime-wide approval, authority, audit, scope, and immutable settlement contracts. [Evidence: `src/core/approval-broker.ts`; `src/orchestra/authority-enforcer.ts`; `src/core/task-settlement-authority.ts`; `src/core/invocation-receipt-store.ts:705-850`]
- Native REPL, terminal dashboard, web/API server, Desktop, VS Code extension, connectors, CLI, and MCP surfaces. [Evidence: `src/cli/entry.ts:664-713`; `src/cli/commands/dashboard.ts:147-214`; `src/cli/commands/serve.ts:72-80`; `src/desktop`; `src/extensions/vscode`; `src/connectors`; `src/mcp`]
- 211 visible CLI command paths, 49 canonical MCP tools, 8 resources, and 31 built-in skills were counted or reported. The identity projection separately reports “21 built-in + 2 custom” agents, while the current project and built-in prompt trees each contain 21 personas; the exact extra-two mapping remains `HOLD` in OQ-21. [Evidence: recursive `buildProgram()` and `TOOL_CATALOG` introspection plus filesystem counts, 2026-08-01; `.deckent/workspace/IDENTITY.md:19-29`; `docs/analysis/OPEN-QUESTIONS-2026-08.md`]

## Current repository truth

Status labels in the detailed docs mean:

- `✅ live`: source wiring exists and current runtime evidence supports the claim.
- `⚠️ partial`: code exists, but a flag, missing proof, parity gap, or production closure limits the claim.
- `🔜 roadmap`: design/history exists without current production closure.

The feature manifest currently lists 21 active, 4 lightly used, 9 dormant, and 1 dead entry. The live `truth --json` check reported five truth contracts: training trace was code/wired/enabled/proven; tool surface, worker approval gate, and routing journal lacked runtime proof; prompt-gate-block had no detected callsite and was the single half-wire candidate. [Evidence: `.deckent/settings/features-manifest.json`; real `node dist/cli/entry.js features --json` and `truth --json` outputs, 2026-08-01]

The latest dogfood handoff does not certify unattended production reliability: its Codex audit records 0/31 intervention-free runs and documents settlement/gate contradictions that require the ordered certification ladder. These are not hidden behind product language; see [Current frictions](https://github.com/VerhexIO/deckent/blob/main/docs/en/operations/current-frictions.md) and the [difference report](https://github.com/VerhexIO/deckent/blob/main/docs/analysis/CODE-DOC-DIFF-2026-08.md). [Evidence: `docs/MASTER-PLAN.md` — RECOVERY-BORN-488 family, RECOVERY-BORN-490-REPLAY-CERTIFICATION-001 and CODEX-MAIN-001 decision line]

## Documentation map

- [Getting started](https://github.com/VerhexIO/deckent/blob/main/docs/en/guide/getting-started.md)
- [Run lifecycle](https://github.com/VerhexIO/deckent/blob/main/docs/en/guide/run-lifecycle.md)
- [Execution modes](https://github.com/VerhexIO/deckent/blob/main/docs/en/guide/execution-modes.md)
- [Interactive surfaces](https://github.com/VerhexIO/deckent/blob/main/docs/en/guide/interactive-surfaces.md)
- [Feature catalog](https://github.com/VerhexIO/deckent/blob/main/docs/en/features/catalog.md)
- [CLI reference](https://github.com/VerhexIO/deckent/blob/main/docs/en/cli.md)
- [MCP reference](https://github.com/VerhexIO/deckent/blob/main/docs/en/mcp.md)
- [Database reference](https://github.com/VerhexIO/deckent/blob/main/docs/en/db.md)
- [Configuration](https://github.com/VerhexIO/deckent/blob/main/docs/en/configuration.md)
- [Complete bilingual documentation index](https://github.com/VerhexIO/deckent/blob/main/docs/index.md)
- [Code–documentation difference report](https://github.com/VerhexIO/deckent/blob/main/docs/analysis/CODE-DOC-DIFF-2026-08.md)

## Constitutional constraints

Deckent's three immutable laws are Dual Lens + Scale, Every Environment, and Never MVP. The complete governance interpretation is documented in [Immutable Laws](https://github.com/VerhexIO/deckent/blob/main/docs/en/governance/immutable-laws.md). [Evidence: `AGENTS.md:9-35`]

License: MIT. [Evidence: `package.json:90-91`; `LICENSE`]

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-34225%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-492%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v1.0.0--beta.1-orange)](https://github.com/VerhexIO/deckent) [![CI](https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci)](https://github.com/VerhexIO/deckent/actions)
<!-- AUTOGEN:END id="badges" -->

<!-- AUTOGEN:START id="stat-counts" -->
- **49 MCP tools** + **8 MCP resources**
- **21 built-in agents**
- **30 built-in skills**
- **20 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->
