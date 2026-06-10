# Deckent Feature Reference

> Hand-maintained reference — no script generates this file; update it manually when feature status changes. The machine-readable counterpart is `.deckent/features-manifest.json`, which `node scripts/sync-manifest.mjs` regenerates (curated feature catalog in the script, bucketed by an import-count heuristic plus lifecycle annotations). That script writes only the JSON manifest, not this document.

This document lists all Deckent features categorized by their activity level. It serves both AI orchestrators (Claude Code, Codex, Gemini) and human developers as the single reference for feature status.

## Categories

| Category | Description |
|----------|-------------|
| **Active** | Core features used in every sprint cycle. High import count, central to the PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP lifecycle. |
| **Lightly Used** | Features that exist and work but are used infrequently — CLI-only commands, opt-in configurations, or rarely triggered paths. |
| **Dormant** | Implemented features that are not wired into the sprint lifecycle. They exist in source but have zero or minimal external imports. |
| **Dead** | Deprecated or superseded features kept as reference. Protected by ADRs or marked `@deprecated`. |

## Active Features

| Feature | Files | Description |
|---------|-------|-------------|
| sprint-controller | `sprint-controller.ts`, `sprint-phases.ts`, `sprint-lifecycle.ts` | Central orchestrator for 8-phase sprint lifecycle |
| task-builder | `task-builder.ts` | Worker prompt builder + DIRECTIVES parser |
| result-evaluator | `result-evaluator.ts` | GO/NO-GO/TECH_DEBT evaluation with rubric scoring |
| auditor | `auditor.ts` | 30s scan loop + 3-pipeline verification + authority enforcement |
| event-stream | `event-stream.ts` | ADR-035 structured event log (15 channel codes) |
| routing-engine-v2 | `routing-engine.ts`, `intent-classifier.ts`, `activation-engine.ts` | Intent-based task routing with confidence scoring |
| model-registry | `model-registry.ts`, `model-equivalence.ts`, `mode-presets.ts` | 13 models, 3 providers, tier-based routing |
| memory-v2 | `memory-store.ts`, `memory-query.ts`, `memory-normalize.ts`, `memory-export.ts` | SQLite FTS5 DB-first architecture |
| dependency-scheduler | `dependency-scheduler.ts` | Kahn's algorithm topological wave ordering |
| authority-enforcer | `authority-enforcer.ts` | ADR-037 RBAC runtime enforcement |

## Lightly Used Features

Wired-live but opt-in: each autonomous/enterprise capability below ships **default-off** behind the listed config flag (recurring cadence, work-generator, capability dispatch and RBAC enforcement additionally require `autonomous.enabled: true`, which defaults to `false`).

| Feature | Files | Description |
|---------|-------|-------------|
| recurring-backlog | `runtime-loop.ts`, `backlog.ts` | Recurring backlog entries re-fire on their cron cadence — `applyRecurringReenqueue` flips due `done` recurring entries back to `pending` on every backlog load. Default-off: `autonomous.enabled: false`. |
| work-generator | `work-generator-source.ts`, `backlog.ts` | Self-generated work: active tech-debt records become backlog candidates (deduped by id, enqueued, dispatched at the lowest trigger priority — after backlog/scheduled/reactive). Default-off: `autonomous.work_generator.enabled: false` (scan throttle `interval_ms: 600000`). |
| capability-dispatch | `execute-dispatcher.ts`, `capability-runtime.ts` | F8 broker dispatch: `kind=capability` backlog entries resolve through `CapabilityRegistry.invoke`; every invocation lands on the ENT-3 audit hash-chain as `capability.success` / `capability.error` (`createAuditedCapabilityRegistry`); allowlist-gated handlers DENY by default. Default-off: `autonomous.enabled: false`. |
| autonomous-rbac-enforcement | `runtime-loop.ts`, `policy-engine.ts` | RBAC enforcement on machine-initiated dispatch: every entry-carrying trigger is gated through `evaluatePolicy` — a role without `execute` permission (default `viewer`) hard-denies the cycle (`denied`). First enforced slice of ADR-037 (advisory → enforced). Default-off: `autonomous.rbac_policy.enabled: false` (role default `viewer`). |
| audit-compliance-siem | `audit.ts` (CLI), `compliance-report.ts`, `siem-forwarder.ts` | Read-side consumers over the live ENT-3 audit chain: `deckent audit compliance --sprint <id>` (chain-integrity + rbac/tenant controls; broken chain → exit 1) and `deckent audit forward --sprint <id>` (transport precedence `--url` HTTP POST > `--syslog` RFC 5424 > `--out` NDJSON file). Commands are always available; the `rbacEnforcement` control reflects the default-off `autonomous.rbac_policy.enabled` flag. |
| erp-driver-odoo | `erp-driver-odoo.ts`, `erp-connector.ts` | First concrete `ErpDriver`: read-only Odoo JSON-RPC (`execute_kw` → `search_read`), `CompiledQuery` → domain translation, `entityModelMap` aliasing, apiKey redaction in errors, injectable fetch. Opt-in: invoked only via an `erp.read` capability backlog entry with `--connector odoo`; capability dispatch itself is default-off (`autonomous.enabled: false`). |
| audit-retention-cli | `audit.ts` (CLI), `audit-retention.ts` | Audit-log retention via `planRetention`: prune by age (`--keep-days`) and/or count (`--keep-count`). Triggered by `deckent audit retention --sprint <id>` — dry-run by default (plan summary, zero writes); `--apply` archives the pruned partition first, then atomically rewrites the live stream. |
| siem-syslog-transport | `siem-transport-syslog.ts`, `audit.ts` (CLI) | RFC 5424 syslog transport (`createSyslogSiemTransport`) for audit forwarding. Triggered by `deckent audit forward --syslog <host[:port]>` with `--syslog-protocol udp\|tcp` (default `udp`); `--url` takes precedence over `--syslog`, which takes precedence over `--out`. |
| archive-aware-compliance | `audit.ts` (CLI), `audit-query.ts` | Compliance verifies the hash chain across the retention archive **plus** the live stream (`readArchivedAuditEvents` prepended), so sprints remain verifiable after `audit retention --apply`. Triggered by `deckent audit compliance --sprint <id>` — no flag; archive awareness is automatic when an archive partition exists. |
| flow-backlog-bridge | `backlog-trigger.ts`, `runtime-loop.ts` | AUT-3: `makeFlowBacklogBridge` normalizes scheduled-flow triggers into the backlog dispatch lane (handler + authority + policy + rbac + audit in one path) — user-configured flows actually run instead of hitting the "no handler" double-block. Flow guard parks for human approval: `requiresApproval: false` → `auto`, true or absent → `approval-required` (ADR-040 no-auto-approve). Default-off: `autonomous.enabled: false`. |
| erp-driver-dynamics | `erp-driver-dynamics.ts`, `erp-connector.ts` | Third concrete `ErpDriver` (after Odoo, SAP): read-only Dynamics 365 OData **v4** Web API (`createDynamicsErpDriver`) — GET-only `$filter`/`$select`/`$top` translation with native v4 `in` and `contains()`, single-quote escaping for injection safety, bearer-only auth (Azure AD token handed in externally) with redaction in errors, injectable fetch (hermetic). Opt-in: supplied through the `ErpDriver` seam for `erp.read` capability entries with `--connector dynamics`; capability dispatch itself is default-off (`autonomous.enabled: false`). |
| jwks-terminal-auth | `auth-jwks.ts`, `server.ts` (api) | JWKS async AuthProvider for the embedded web terminal (ADR-062): `verifyJwtWithJwks` resolves RS256 keys from a remote JWKS URL (cached resolver, `alg: none` rejected) and delegates claim verification to the `verifyJwt` SSOT (`auth-oidc.ts`). Default-off: enabled only when `terminal_oidc_jwks` (issuer + jwksUrl) is set in config — otherwise the server warns and falls back to local-token terminal auth. |
| resume-artifact-reset | `resume.ts` (CLI) | RESUME-RACE fix (268-001): before re-entering `runSprint`, `deckent resume` resets stale worker artifacts (`.hb` / `.partial-result`) for every non-terminal task so the controller does not mistake a dead worker's leftovers for live progress. Terminal (DONE/NO_GO) task artifacts are left untouched; removal is fail-soft (an unremovable artifact never aborts resume) and the `--dry-run` path only reports. |
| model-effort-passthrough | `reasoning-effort.ts`, `run.ts` (CLI), `sprint-spawner.ts` | Native model reasoning-effort pass-through (268-003): DIRECTIVES `ModelEffort:` and `deckent run --model-effort <level>` flow through `resolveReasoningEffort` into the spawn command (claude `--effort` low\|medium\|high\|xhigh\|max, codex `model_reasoning_effort` minimal\|low\|medium\|high). Opt-in per task; unsupported providers (gemini/ollama) and invalid levels are ignored silently. Distinct from `Effort:` (work-load/timeout budget). |
| spa-fallback-token-inject | `server.ts` (api), `serve.ts` (CLI) | SPA fallback: when a non-API request (client route) hits the server, response is the SPA index.html with the API token injected into a `<meta>` tag for localStorage hydration. Enabled by default in `deckent serve`; allows localhost dashboard access without manual token entry. No configuration needed — automatic. |
| enterprise-endpoints | `server.ts` (api) | Enterprise GET endpoints for integrated dashboards: `/api/enterprise/tenants` (list of managed tenants), `/api/enterprise/user` (current user profile), `/api/enterprise/audit/summary` (audit event summary), `/api/enterprise/config` (current server config snapshot). Enabled when `api_server: true` in config; requires auth (session or API token). |
| dashboard-workers-directives | `dashboard/pages/WorkersPage.tsx`, `dashboard/pages/DirectivesPage.tsx` | Live dashboard pages (Sprint 269): WorkersPage monitors active/completed task workers with heartbeat status + resource usage; DirectivesPage displays current sprint directives with edit history. Wired into dashboard routing; enabled by default when dashboard is served. |
| repl-slash-commands | `cli/repl.ts`, `cli/commands/chat-slash-registry.ts`, `cli/commands/chat-tool-bridge.ts` | REPL enhancements: `/status` (sprint dashboard), `/recall` (memory search), `/usage` (token/limit accounting), `/resources` (worker resource snapshot/log), `/autonomous` (backlog status), `//audit` (audit CLI subcmd), `//directives` (display directives). Bridge commands ('/' = REPL immediate, '//' = subprocess CLI call) allow live orchestration state introspection without exiting REPL. Default-on when REPL is active. |
| mcp-run-model-effort | `run.ts` (CLI), `reasoning-effort.ts`, `mcp-server.ts` | MCP `deckent_run` tool supports `modelEffort` parameter (low\|medium\|high\|xhigh\|max for Claude, minimal\|low\|medium\|high for Codex) with same resolution as CLI `--model-effort` flag. Opt-in per task; if not specified, defaults to model's default reasoning. Parity with CLI established Sprint 269. |
| loopback-rate-limit-exemption | `server.ts` (api) | Rate-limit exemption for loopback requests (127.0.0.1, localhost, ::1): these IPs bypass the per-endpoint request throttle. Config key `rateLimitExemptLoopback: true` (default-on). Rationale: localhost dashboard/CLI clients should not be throttled during development/local testing. Can be disabled via config if needed. |
| resource-monitor | `src/orchestra/resource-monitor.ts`, `src/cli/commands/resources.ts` | Docker worker resource monitoring: `resource_monitor.enabled` flag (default-off) gates optional per-container CPU/memory sampling via `docker stats`. Provides live snapshot (`deckent resources`), historical log analysis (`deckent resources --log`), and health summary in `deckent doctor`. Applies to SPAWN→CLEANUP phases. Default-off: `resource_monitor.enabled: false`. |
| memory-limit-by-kind | `src/core/config-types.ts`, `src/core/config.ts`, `src/orchestra/spawn-backend-docker.ts`, `src/core/provider-failure-classifier.ts`, `src/orchestra/sprint-phases.ts` | F1-LIM faz-2: per-task-kind memory limit override (Sprint 272). Config `worker_memory_limit_by_kind: { code: "1.5g", doc: "768m", ... }` allows code/doc tasks to run with optimized limits based on Sprint 271 baseline measurements instead of global 4g default. Includes provider-failure-classifier (usage-limit, auth, oom detection) and FIX-phase guard that skips retries when ≥50% of failures are usage-limit induced. Default-off: `worker_memory_limit_by_kind` is optional (undefined). |
| limit-ledger + deckent usage | `src/core/limit-ledger.ts`, `src/core/limit-ledger-report.ts`, `src/cli/commands/usage.ts`, `src/mcp/tools/usage.ts`, `src/orchestra/sprint-reporter.ts` | F1-TOK Faz 0+1+1,5 (Sprint 273) + Faz 3 (Sprint 275): real token/limit accounting via transcript-ledger. `parseTranscriptUsage` reads `~/.claude/projects/**/*.jsonl` message-usage fields, dedupes by message-id, calculates cost-equivalent (in·$in + out·$out + cacheWrite·1.25·$in). `deckent usage` CLI command (+ `/usage` REPL slash, + `deckent_usage` MCP tool): default 7-day model-level table (model, calls, in/out, cache, limit-$, hit%) + `--sprint <N>` per-task breakdown + `--since/--until` ISO window + `--json` raw output. `sprint-reporter` adds optional "Limit burn" metric row to retro. Replaces unreliable tokenUsage beyan with ground-truth ledger. Default-on: activated when `.claude/projects/` exists. |
| cache-warm-spawn | `src/orchestra/sprint-spawner.ts`, `src/orchestra/sprint-phases.ts` | F1-TOK Faz 2 (Sprint 274): prompt-prefix cache optimization. Opt-in: when `cache_warm.enabled: true` in config, the first spawn-eligible task launches immediately; remaining fleet tasks delay by `cache_warm.warm_delay_ms` (default 45s), allowing the first worker's cache-write to finish before others read. Single-task sprints skip delay. Fail-safe on timer error. Default-off: `cache_warm.enabled: false`. |
| cache-gate | `src/core/limit-ledger-report.ts`, `src/cli/commands/usage.ts` | F1-TOK Faz 2 (Sprint 274): ledger cache-effectiveness measurement. `evaluateCacheGate` sorts session ledger records chronologically, marks the first session as "warmer", checks if 2.+ sessions' first calls show `cacheRead >= cacheWrite`. Gate passes when warm share ≥80% of followers. `deckent usage --sprint N` output includes "Cache gate: PASS/FAIL (warm-share %X, warmer: <taskId>)" line. Best-effort: gate evaluation failures skip the output line. |
| adr-operative-cc-render | `src/core/prompt-template.ts`, `src/cli/commands/run.ts`, config `prompt.adr_render` | ADR rendering strategy (Sprint 273, Task 273-012): when `prompt.adr_render: "operative"` in config, ADRs are rendered as their operative section only (bounded by `<!-- worker-operative-start/end -->` HTML comments) instead of full text. Allows compliance-sensitive ADRs to mark only the enforceable portion. Default-off: `prompt.adr_render: "full"` (include complete ADR). |
| plan-interrogation-precheck | `src/core/directive-interrogator.ts`, `src/cli/commands/plan.ts`, `src/cli/commands/chat-slash-registry.ts` | PLAN-INT-1 (Sprint 276): Pre-plan interrogation — `deckent plan --interrogate` or `/interrogate` REPL slash generate 5 structural questions challenging directive goals (pain-vs-feature, narrowest shippable wedge, hidden capabilities, premise assumptions, effort alternatives). Collects answers, suggests revised DIRECTIVES.md draft with `## Interrogation Refinements` section. Opt-in: `plan.interrogate: true` in config or `--interrogate` CLI flag; `--no-confirm` skips interrogation silently. Fail-safe on error — mevcut akış never blocked. |
| cross-verify-adversarial | `src/core/cross-verify.ts`, `src/orchestra/cross-verify-runner.ts`, `src/orchestra/outcome-tracker.ts` | XVER-1 (Sprint 276): Cross-provider adversarial verify — high-stakes tasks (security, auth, P0, risk-tagged) spawn a FARKLI provider verifier worker post-EVALUATE to ÇÜRÜTMEYE çalış (refute/confirm result integrity). `isHighStakesTask` detects security signals; `selectVerifierProvider` picks second provider (claude→codex/gemini, or honest-skip if single-provider env). `parseRefuteVerdict` rates result REFUTED/CONFIRMED → advisory signal to Brain evaluation (not downgrade, advisory-only per ADR-070). Default-off: `cross_verify.enabled: false`; high_stakes_only default true. Fail-safe: xverify errors never block sprint. |
| dashboard-sso | `src/dashboard/src/hooks/useAuth.tsx`, `src/dashboard/src/lib/session.ts`, `src/dashboard/src/components/AuthStatus.tsx`, `src/dashboard/src/components/ManualTokenInput.tsx`, `src/dashboard/src/pages/LoginPage.tsx`, `src/dashboard/src/pages/CallbackPage.tsx`, `src/api/auth-me-endpoint.ts`, `src/api/enterprise-endpoint.ts`, `src/api/oidc-callback-endpoint.ts` | ENT-5 (Sprint 277): Dashboard SSO integration — useAuth context hook for session state management (token, identity, authentication status) with sessionStorage persistence. AuthStatus component displays logged-in user identity + role + logout button. LoginPage with optional OIDC "Sign in with SSO" button (PKCE-based redirect) and manual JWT token input. CallbackPage handles OIDC redirect with code/state validation + token exchange. audit-actor JWT-derived from OIDC `sub` claim (Falls back to 'local' for static tokens). Requires `dashboard_oidc.enabled: true` in config for SSO; manual-token always available. |

## Dormant Features

These features are implemented but not yet wired into the sprint lifecycle:

| Feature | Blocked By |
|---------|------------|
| heartbeat-daemon | No sprint-controller auto-wiring |
| shared-memory | No integration point in worker prompt or spawn |
| handoff-protocol | No integration point |
| multi-agent-pipeline | No sprint integration |
| human-checkpoint-cli | Opt-in config, rarely set |

## Dead Features

| Feature | Superseded By | ADR |
|---------|---------------|-----|
| decision-orchestrator-v1 | routing-engine-v2 | ADR-028 |
| parallel-pipeline-manager | dependency-scheduler | — |

## CLI & MCP Access

- **CLI:** `deckent features [--category <cat>] [--json] [--id <featureId>]`
- **MCP:** `deckent_feature_query` tool with `category` and `id` parameters
- **Script:** `node scripts/sync-manifest.mjs [--dry-run] [--json]`

## Regeneration

The manifest is automatically regenerated after each sprint in the RETRO phase (sprint-finalizer.ts Step 10d). Manual regeneration:

```bash
node scripts/sync-manifest.mjs
```
