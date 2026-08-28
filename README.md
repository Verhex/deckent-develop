# Deckent

**A provider-neutral, local-first Agent OS for turning goals into governed, evidence-backed work.**

Deckent unifies an assistant, parallel workers, and a platform control plane around one authority chain: `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`. Terminal and Desktop are the primary operator surfaces; CLI, MCP, API, process/autonomous entry points, and connectors are adapters; Dashboard is an observability projection. [Evidence: `.deckent/workspace/IDENTITY.md:2-10,16-17`]

[English documentation](https://github.com/VerhexIO/deckent/blob/main/docs/en/overview.md) · [Türkçe dokümantasyon](https://github.com/VerhexIO/deckent/blob/main/docs/tr/overview.md) · [Current frictions](https://github.com/VerhexIO/deckent/blob/main/docs/en/operations/current-frictions.md)

## Why it exists

A useful agent runtime must do more than generate code. Deckent resolves provider and model policy, decomposes dependency-aware work, constrains write scope, records attempts and operations, evaluates results, settles evidence, retains memory, and exposes recovery paths. Those responsibilities are visible in the current orchestration, configuration, memory, authority, and run-flow modules. [Evidence: `src/orchestra/sprint-controller.ts`; `src/orchestra/dependency-scheduler.ts`; `src/core/config.ts`; `src/core/memory-store.ts`; `src/core/run-flow-store.ts`; `src/core/task-settlement-authority.ts`]

The product is designed for two audiences at once: a solo user who wants low-friction control, and organizations that require multi-project, multi-tenant, cross-platform policy and audit. It must work across macOS, Linux, Windows native, and WSL2, or fail explicitly when a capability is unavailable. [Evidence: `AGENTS.md:13-35`; `.deckent/workspace/IDENTITY.md:6,15`]

## Installation contract

The npm package exposes `deckent` and `deckent-mcp`, requires Node.js `>=24.0.0`, and publishes the compiled `dist` tree. [Evidence: `package.json`]

For a published-package installation, the declared command is `npm install -g deckent`. `0.100.0` is a tagless version/changelog rebaseline, not a published release; installation-from-registry remains `HOLD` until the owner-gated release closes. The repository build command is `npm run build:all`. [Evidence: `package.json`; `docs/MASTER-PLAN.md` RELEASE-001]

Releases are governed rather than manual. `main` is protected by a GitHub merge queue, so CI re-runs the required checks on the final merge result; the CI workflow listens on `merge_group` for exactly that reason. Publishing is **owner-manual by design**: the release workflow only builds, validates, and produces attestation artifacts with read-only permissions — the automatic npm-publish and GitHub-Release steps were deliberately removed (2026-08-14), and `npm publish` is always executed by the owner. [Evidence: `.github/workflows/ci.yml:3-11`; `.github/workflows/release.yml`; `tests/governance/release-workflow-unify.test.ts`]

## Verified five-minute orientation

The following four commands were executed against the current compiled binary on 2026-08-25. They are read-only; they identify the binary, inspect readiness, preview onboarding, and read current run authority.

```bash
node dist/cli/entry.js --version-json
node dist/cli/entry.js doctor --json
node dist/cli/entry.js onboard --plan-only --json
node dist/cli/entry.js status --json
```

Observed checkpoints:

- Version reported `0.100.0`, Node `v24.15.0`, Linux; exit 0.
- Doctor returned `ok: true` with 14 ready and 4 non-required attention checks out of 18 — including a new routing-journal health check that surfaced a real historic corrupt journal relic on its first run; exit 0.
- Onboarding returned a project-scoped config plan with `applied: false` and did not write; exit 0.
- Status returned `active: false` with the last run's honest terminal state (`ABORTED` — force-finalized dogfood runs are recorded as what they were, never relabeled); exit 0.

[Evidence: real-binary outputs for all four commands, 2026-08-25; read-only contracts in `src/cli/commands/doctor-checks.ts`, `src/cli/commands/onboard.ts`, `src/cli/commands/status.ts`]

Starting actual work is intentionally not presented as verified here: sprint/run/autonomous execution claims belong to the dogfood evidence chain in `docs/MASTER-PLAN.md`, where each is tied to receipts rather than screenshots.

## Choose a workflow

| Need | Surface | Current user contract | Repository truth |
|---|---|---|---|
| Conversational control | Bare `deckent` or `deckent chat --native` | Interactive agentic REPL | Bare invocation routes to native chat; interactive TTY uses the Ink REPL. [Evidence: `src/cli/entry.ts`] |
| Goal preview / governed start | `deckent do <goal>` | Preview by default; `--run --yes` is the explicit non-interactive start path when RunFlow v2 is enabled | Proposal compilation is a real provider call; the RunFlow path can persist a proposal even without starting. [Evidence: `src/cli/commands/do.ts`] |
| Structured lifecycle | `plan`, `start`, `status`, `review`, `retro` | Plan, execute, observe, adjudicate, learn | All command/help contracts are live and exercised by the CLI surface-truth battery (504 real `--help` invocations). [Evidence: `tests/cli/cli-surface-truth-battery.test.ts`] |
| One-shot work | `run <description>` | Execute one task without a sprint cycle | The same `run` parent also owns lifecycle aliases, a documented CLI ambiguity. [Evidence: `src/cli/commands/run.ts`] |
| Run inbox and decisions | `deckent runs [n]` | List run-flows, then decide a single run with `--approve`, `--reject`, `--start`, `--retire`, `--diff`, or `--commit` | All flags registered on one `runs` command; a flow-id prefix resolves against every flow regardless of `--limit`. [Evidence: `src/cli/commands/runs.ts`] |
| Owner-managed model activation | `deckent models list/activate/deactivate/activation` | Detection reports what a provider offers; activation records what the owner allows into the routing pool | Single authority is `ModelActivationStore`; in explicit-active mode no detected model enters the pool silently. [Evidence: `src/cli/commands/models.ts`; `src/core/model-activation-store.ts`] |
| Durable process work | `process submit/status/result` | Submit an `ExecutionRequest`; side effects can park for approval | CLI surface registered and pointing at process services. [Evidence: `src/cli/commands/process.ts`] |
| Continuous work | `autonomous …` | Durable backlog, approvals, status, and loop controls | Runtime active but default-off; reactive bridge is attach-only. [Evidence: `.deckent/settings/features-manifest.json`; `src/cli/commands/autonomous.ts`] |
| Remote/programmatic control | HTTP/SSE and MCP | API server and MCP tools/resources (counts below) | Approvals are read-only over MCP by design — allow/deny decisions exist only on the interactive CLI surface. [Evidence: `src/mcp/tools/index.ts`; `src/mcp/server.ts`] |

## Product capabilities

- Deterministic, evaluation-backed lifecycle orchestration, dependency scheduling, FIX retries, checkpoints, retrospectives, and rollback policy. [Evidence: `src/orchestra/sprint-phases.ts`; `src/orchestra/dependency-scheduler.ts`; `src/orchestra/sprint-checkpoint.ts`; `src/orchestra/rollback.ts`]
- Provider-neutral routing from effective config, model registry, live authority, reachability, limits, and budget rather than a hard-coded product provider — with a learning-cells outcome ledger whose keys are vocabulary-bound and whose infrastructure failures (OOM, usage limits, auth loss) never penalize an agent's capability score. [Evidence: `src/core/routing/route-task-v3.ts`; `src/core/routing/learning-cells.ts`]
- DB-first memory with SQLite/FTS5, relation/history support, document freshness, KPI stores, recall, and export/backup operations. [Evidence: `src/core/memory-store.ts`; `src/core/memory-query.ts`; `src/cli/commands/memory.ts`]
- Runtime-wide approval, authority, audit, scope, and immutable settlement contracts, including an append-only closure ledger with an Ed25519 trust anchor whose private key lives outside the repository in owner custody. [Evidence: `src/core/approval-broker.ts`; `src/orchestra/authority-enforcer.ts`; `scripts/lint-closure-dispositions.mjs`; `docs/governance/`]
- Native REPL, terminal dashboard, web/API server, Desktop, VS Code extension, connectors (Telegram delivery is live-proven), CLI, and MCP surfaces. [Evidence: `src/cli/entry.ts`; `src/cli/commands/dashboard.ts`; `src/cli/commands/serve.ts`; `src/desktop`; `src/extensions/vscode`; `src/connectors`; `src/mcp`]
- 253 visible CLI command paths carrying 548 options and 103 positional arguments, measured by walking the real Commander tree and running 504 real `--help` invocations (2026-08-25). MCP tool/resource, agent, and skill counts are generator-owned below. [Evidence: `tests/cli/cli-surface-truth-battery.test.ts`; `docs/generated/cli-manifest.json`]

## Current repository truth

Status labels in the detailed docs mean:

- `✅ live`: source wiring exists and current runtime evidence supports the claim.
- `⚠️ partial`: code exists, but a flag, missing proof, parity gap, or production closure limits the claim.
- `🔜 roadmap`: design/history exists without current production closure.

The feature manifest currently lists 35 entries. The live `truth --json` check reported five truth contracts on 2026-08-25: training trace was code/wired/enabled/proven; tool surface and worker approval gate are wired and enabled but lack runtime proof; the routing decision journal is wired (journal files are being written live) with no enabling flag detected; prompt-gate-block has no detected callsite and remains the single half-wire candidate. [Evidence: real `node dist/cli/entry.js features --json` and `truth --json` outputs, 2026-08-25]

Dogfood honesty is part of the product: Deckent develops itself through its own runs, and those runs' failures are recorded as `ABORTED` with root-cause rows in `docs/MASTER-PLAN.md` rather than being relabeled. Unattended production reliability is not certified; see [Current frictions](https://github.com/VerhexIO/deckent/blob/main/docs/en/operations/current-frictions.md).

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
- [Dependency rationale ledger](https://github.com/VerhexIO/deckent/blob/main/docs/en/reference/dependencies.md)
- [Complete bilingual documentation index](https://github.com/VerhexIO/deckent/blob/main/docs/index.md)

## Constitutional constraints

Deckent's three immutable laws are Dual Lens + Scale, Every Environment, and Never MVP. The complete governance interpretation is documented in [Immutable Laws](https://github.com/VerhexIO/deckent/blob/main/docs/en/governance/immutable-laws.md). [Evidence: `AGENTS.md:9-35`]

License: MIT. [Evidence: `package.json`; `LICENSE`]

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-37352%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-492%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v0.100.0-orange)](https://github.com/VerhexIO/deckent) [![CI](https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci)](https://github.com/VerhexIO/deckent/actions)
<!-- AUTOGEN:END id="badges" -->

<!-- AUTOGEN:START id="stat-counts" -->
- **51 MCP tools** + **8 MCP resources**
- **22 built-in agents**
- **35 built-in skills**
- **20 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->
