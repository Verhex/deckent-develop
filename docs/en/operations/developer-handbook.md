# Developer handbook

## Product-user perspective

This handbook is for contributors extending Deckent itself or adding project-scoped agents and plugins. Product use does not require modifying the runtime: prefer the documented CLI, MCP, API, configuration, agent, skill, and plugin extension points. Direct runtime work must preserve the repository's producer→consumer→ingress→policy closure and real-binary proof rule. [Evidence: `AGENTS.md:42-55`; `src/cli/index.ts`; `src/mcp/tools/index.ts`; `src/sdk/deckent-client.ts`]

### Repository boundaries

| Area | Responsibility | Load-bearing owners |
|---|---|---|
| `src/core` | Contracts, config, memory, policy, routing, receipts, security primitives. | `src/core/config.ts`, `src/core/work-model.ts`, `src/core/memory-store.ts` |
| `src/orchestra` | Planning, admission, scheduling, execution supervision, evaluation, repair, settlement. | `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-phases.ts`, `src/orchestra/sprint-finalizer.ts` |
| `src/agents` | Worker process, lifecycle, permission, heartbeat and result behavior. | `src/agents/worker.ts`, `src/agents/worker-lifecycle.ts`, `src/agents/permission-guard.ts` |
| `src/cli`, `src/mcp`, `src/api` | User and integration adapters over application/runtime services. | `src/cli/index.ts`, `src/mcp/server.ts`, `src/api/server.ts` |
| `src/dashboard`, `src/desktop`, `src/extensions/vscode` | Observability and operator clients; they do not become independent execution authorities. | `.deckent/workspace/IDENTITY.md:8-9`; each directory's entry modules |
| `scripts` | Builds, checks, generated projections, smoke harnesses, and release validation. | `package.json:22-77` |

ESM imports include the emitted `.js` suffix. User-visible CLI strings belong in the EN/TR message catalog rather than in mechanism modules. Direct code changes must be surgical, hermetic in tests, and explicitly wired into a production ingress. [Evidence: `AGENTS.md:42-55,135-138`; `src/cli/helpers/messages.ts`]

### Agent development

An agent consists of a canonical prompt and a validated definition loaded by `AgentPool`. Project entries override bundled fallbacks by identity. Definitions may carry description, capabilities, domains, priority, model/tier preferences, activation rules, role, source and retirement state; invalid activation data is rejected during loading. [Evidence: `src/core/agent-pool.ts:18-104,227-320`; `src/core/agent-types.ts`]

Use the `agent` command family to inspect, create, enable, disable, edit, reclassify, delete and view statistics. Do not infer route eligibility from an agent's name: role/domain maps cover only a subset, while activation, manifest metadata, task DNA and routing policy constrain selection. [Evidence: `src/cli/commands/agent.ts:221-523`; `src/core/activation-engine.ts`; `src/core/agent-role-contract.ts:8-31`]

### Plugin development

The current plugin manifest validator requires `name`, semantic `version`, non-empty `description`, `skills`, `hooks`, and `permissions`; names must be lowercase kebab-case and hook values must be recognized hook points. Loading resolves the manifest from a plugin directory, verifies paths remain inside that directory, and validates skill safety. [Evidence: `src/core/plugin.ts:21-81,149-190`; `src/core/plugin-loader.ts:45-101`]

Installed plugins can register hooks only after security validation. Hook failures are isolated and counted; registration does not silently grant filesystem or command authority beyond the manifest/security policy. Install supports local directories, Git URLs and npm package sources through temporary staging and validation. [Evidence: `src/core/plugin-hooks.ts:65-104,166-243`; `src/core/plugin.ts:246-335`]

The `plugin` CLI exposes install, list, enable, disable, update, info, test and remove actions. Marketplace publication is a separate skill-package concern documented in the SDK/plugin reference. [Evidence: `src/cli/commands/plugin.ts:9-108`; `docs/en/reference/sdk-and-plugins.md`]

### Worker contract

Workers claim one task/attempt, write heartbeats, execute within assigned file/tool authority, verify their output, and emit a structured result. Host-side settlement independently checks result identity, scope, disk evidence and receipt fencing; worker self-assessment cannot terminally accept its own work. [Evidence: `src/agents/worker.ts:793-835`; `src/core/worker-heartbeat-authority.ts`; `src/core/task-result-schema.ts:205-300`; `src/core/task-result-settlement.ts`]

Worker launch is backend-neutral at the interface. Current backends include tmux, subprocess, Docker and sandbox adapters, selected under effective configuration and environment availability. A freshly restarted coordinator cannot infer “worker absent” only from an empty process-local registry; backend inventory can return `unknown`. [Evidence: `src/orchestra/spawn-backend.ts:28-92`; `src/orchestra/spawn-backend-docker.ts`; `src/providers/subprocess.ts`; `src/providers/sandbox.ts`]

### Brain and lifecycle work

Brain is the control plane, not a general-purpose writer. Planning uses the directive/task builder and planner, execution uses the controller and scheduler, evaluation uses independent result-evaluation paths, and finalization owns retrospective, learning, gate and terminal publication. Preserve those authority boundaries when adding a lifecycle feature. [Evidence: `src/orchestra/brain.ts`; `src/orchestra/task-builder.ts`; `src/orchestra/sprint-controller.ts`; `src/orchestra/result-evaluator.ts`; `src/orchestra/sprint-finalizer.ts`]

A lifecycle change is incomplete if it only adds a type or unit test. Its canonical producer, consumer, actual CLI/API/MCP ingress, effective config/policy enablement, recovery behavior and evidence projection must be demonstrated. [Evidence: `AGENTS.md:42-55`; `src/orchestra/exact-plan-start-service.ts`; `src/orchestra/execution-recovery-service.ts`]

### Dashboard and Desktop development

The dashboard is a React/Vite/Tailwind observability client. `build:dashboard`, `test:dashboard`, `tsc:dashboard`, design-token generation and desktop/API sync are distinct gates; `build:all` includes the dashboard but not the desktop build. [Evidence: `package.json:37-39,45-60,73-77`; `scripts/build-dashboard.mjs`; `scripts/build-design-tokens.mjs`]

The server may serve compiled dashboard assets or proxy to a development origin, but API auth, control-mutation gates and terminal authentication remain server-side authorities. Client state cannot promote a run, approval or terminal session by itself. [Evidence: `src/cli/commands/serve.ts:72-80`; `src/api/server.ts:745-856,2567-2708`; `src/api/terminal/auth-provider.ts`]

### Verification and clean-clone proof

| Layer | Command or harness | Contract |
|---|---|---|
| Type and policy | `npm run lint` | Core/dashboard TypeScript plus the focused gate chain. [Evidence: `package.json:39,42-60`] |
| Core tests | `npm test` | Vitest repository suite. [Evidence: `package.json:25`] |
| UI clients | `npm run test:dashboard`, `npm run test:desktop` | Separate dashboard and desktop configurations. [Evidence: `package.json:30,76`] |
| Binary/API surface | `npm run test:binary-contracts`, `npm run test:e2e-surfaces` | Compiled-binary and cross-surface harnesses. [Evidence: `package.json:29-30`] |
| Clean package install | `node scripts/clean-clone-smoke.mjs` | Packs/installs into isolated temporary state and reports structured stages. [Evidence: `scripts/clean-clone-smoke.mjs:1-30`] |
| User-surface smoke | focused scripts under `scripts/*smoke*.mjs` | Surface-specific, non-substitute proof selected by changed behavior. [Evidence: filesystem inventory; `scripts/test-e2e-surfaces.mjs`] |

Never replace a failed gate with a manual claim. Choose tests proportional to risk, then execute the actual user-facing binary for changed user surfaces. [Evidence: `AGENTS.md:42-55`]

### Documentation and repository synchronization

Manual docs, generated references and the planning ledger have different owners. Generated references/stats must come from their scripts; `docs/MASTER-PLAN.md` remains the planning SSOT. `scripts/sync-to-product.mjs` is a filtered develop→product staging tool: dry-run reports keep/drop decisions, apply prepares a staging tree, and it deliberately does not commit or push. [Evidence: `package.json:66-71`; `scripts/gen-reference-docs.mjs:1-18`; `scripts/sync-to-product.mjs:1-16,139-183`; `AGENTS.md:94-96`]

### Safe troubleshooting sequence

1. Read `status --json`, `doctor --json`, exact task/heartbeat/result files and relevant logs before mutation. [Evidence: `src/cli/commands/status.ts`; `src/cli/commands/doctor.ts`; `src/agents/worker-lifecycle.ts`]
2. Classify whether the problem is config, provider authority, lifecycle projection, worker liveness, settlement, generated-doc drift or build output. [Evidence: `src/core/config.ts`; `src/core/provider-authority-composition.ts`; `src/core/run-status-authority.ts`; `src/core/task-result-settlement.ts`]
3. Prefer dry-run/read surfaces; obtain owner approval before kill or active-run cleanup. [Evidence: `AGENTS.md:81-94`; `src/cli/commands/recover.ts:170-181`; `src/cli/commands/cleanup.ts:118-197`]
4. Re-run the narrow reproducer, then the owning gate and real binary. [Evidence: `AGENTS.md:42-55`; `package.json:25-77`]

## Dogfood / repository reality

| Area | State | Current constraint |
|---|---|---|
| Agent pool and CLI | ✅ live | 21 project prompt personas load; only 15 have hardcoded role/domain mappings, and exact “+2 custom” identity semantics remain OQ-21. |
| Plugin loader/hooks/CLI | ✅ live source | Install and hook paths are implemented; this documentation run did not install or execute an untrusted plugin. |
| Worker/Brain authority split | ⚠️ partial | Contracts and enforcement seams exist, but repository-local policy is not an unbypassable enterprise boundary. [Evidence: `AGENTS.md:124-128`] |
| Dashboard build | ✅ owner-verified | Owner reported `npm run build:all` green; this pass did not rerun it. |
| Clean-clone/platform matrix | ⚠️ HOLD | Harnesses exist, but this documentation pass did not run the network/install/platform matrix. |
| Generated docs | ⚠️ stale | Five generated reference targets and identity registry input remain missing; pipeline regeneration is owner-deferred. |
| Develop→product sync | ⚠️ operator-controlled | Script produces an inspectable staging tree; commit, push and public-repository changes stay manual/authorized. |

See [Development and release](development-and-release.md), [Recovery runbook](recovery-runbook.md), [Agents](../reference/agents.md), and [Plugins](../reference/sdk-and-plugins.md).
