# deckent — LAST STANDING

> **Code-grounded root-cause audit.** Every finding below was produced by reading actual source files and adversarially re-verified against code (grep/read). **Zero documentation inference** — `docs/` informational files were forbidden as a source; only executable code + AI-instruction md (CLAUDE.md/DECKENT.md/rules) were context. ADRs hold no authority here; code is ground truth.

**Phase 1 of 2.** This is the CC (Claude Code) parallel-agent pass. Phase 2 re-runs the same audit with deckent's own agents; the two finding-sets get cross-checked into one pure pool, and work proceeds from that pool.

---

## Methodology & Coverage

- **Source swept:** 788 TypeScript/TSX files across 95 bounded clusters (every `src/` subsystem; critical subsystems at fine granularity).
- **Pipeline:** per-cluster deep-read (full-file, sonnet) → **adversarial verify** (opus re-grep, default-refuted) → synthesis (opus, dedup + rank + root-cause clustering).
- **Yield:** 709 raw findings → **692 adversarially-confirmed** (17 refuted/dropped as unverifiable).
- **Severity:** 🔴 65 critical · 🟠 256 high · 🟡 275 medium · ⚪ 96 low.
- **By category:** 123 root-cause · 163 inconsistent · 257 unwired · 137 dormant · 12 dead-test.

---

## Phase-1 Spot-Verification (CC, disk-confirmed)

Before trusting the pool, three of the highest-severity findings were re-checked by hand against the working tree — **3/3 confirmed**, validating the adversarial-verify pass and showing the central root cause live in the code:

- ✅ **`src/agents/worker.ts:602-620` checkWorkerAuthority returns `true` in BOTH branches** — `!allowed` path and allowed path both `return true`; a scope violation can never be signalled.
- ✅ **`src/orchestra/sprint-metrics.ts:128,215` `boundaryViolations: 0`** — literal hardcode on every metrics path; retro always reports "no boundary violations".
- 🔴 **`src/api/server.ts:820,861` call `registerAutonomousRoutes(url, method, res, projectRoot)` with NO `req`** (`req?` is the 5th param). The lineage handler's `if (req)` tenant filter (autonomous-endpoint.ts:130) and ENT-2 backlog isolation (`:159`) are dead branches → production always returns the full cross-tenant chain. **LIVE cross-tenant audit IDOR on `origin/main`.** A prior "fix" (commit `b525d679`) added the filter + a unit test that passes `req` *directly* to the handler — green test, but the real server dispatch never threads `req`. The "trust-without-verify / wired-but-broken" root cause (R2) reproduced *inside its own security patch*. **Fix = thread `req` into the two `server.ts` autonomous call sites (+ enterprise route `:824`).**

---

## Executive Verdict

> Deckent does not keep breaking basic features in spite of its scale and instrumentation — it breaks them BECAUSE of how that scale and instrumentation were built. The system has a vast, sophisticated control plane (RBAC authority matrix, proof-of-function gates, honest-gate downgrades, cross-verify, post-sprint smoke, panic guards, capability least-privilege, tenant isolation, prompt-evolution feedback, telemetry, notification dispatch) that is overwhelmingly DECLARED but not ENFORCED. Across every layer the same five mechanisms repeat: (1) gates default to advisory/soft and return success regardless of verdict (worker authority `checkWorkerAuthority` returns true in both branches; `enforceRbac` is a NO_OP when `enabled` is false and the default IS false; PanicGuard BLOCK is ignored; mTLS cert detected-then-ignored; spawn-safety never enforced); (2) the verification spine is unwired or stubbed (proof-of-function gate, post-sprint smoke runner is a `passed:true` no-op stub, `runHonestyCheck` literally `return 0`, applyTechDebtDowngrade, cross-verify REFUTED — all dead or trusting worker self-report); (3) config knobs proliferate that are validated and displayed but never read (rollback_policy, strictTenantIsolation, telemetry_*, cost caps, boundary_enforcement, adaptive-timeout, native skills) — settings that lie to the operator; (4) silent fallback / override-drop everywhere (provider health read into empty if-body, notification config accepted but never delivered, fail-safe catch-and-continue hooks that swallow errors, getMessage returns the key on miss); (5) metrics that feed the learning/decay/eval loops are hardcoded zero (boundaryViolations=0, coverage=0, prompt version stats {uses:0}, debt-rate 0%, history scaling factor permanently 1.0), so the self-improvement and self-audit loops the project relies on to "catch drift" are structurally inert. The result is a closed circle: the safeguards that would detect a broken feature are themselves the broken features, and because they fail OPEN and SILENT, every sprint can be marked green while real regressions ship.
>
> The deeper structural enabler is that deckent has no single source of truth and no hard architectural boundary. The same concept is reimplemented 3-5 times with divergent semantics (three RateLimiters, three parseVitestOutput, three getCurrentSprintId reading different files, two ROLE_CAPABILITY_MAPs, two NervousSystemConfig schemas, two evaluateResult, two notification systems, duplicate checkWorkerAuthority, noGoRate as both percentage and fraction in live paths), so a fix applied to one copy silently leaves the live copy untouched — this is precisely why "advertised fixes" (skill-affinity routing, agent imbalance, tenant IDOR filter) are no-ops: the fix landed in a module nobody calls. ESM import discipline is soft (bare require() in pure-ESM modules falls back silently; ADR-087 async mandate violated by spawnSync in hot paths across a dozen files), and "DONE" is accepted on trust rather than disk-verified, so false-DONE acceptance is the default acceptance. To actually hold a chain of success, deckent must flip its enforcement philosophy: gates must fail CLOSED by default with the block path reachable in standard config, the verification spine (smoke/proof-of-function/honesty/disk-verify) must be wired into the finalize path and run against real binary output, every config knob must have a runtime reader asserted by a "no dormant knob" lint, duplicates must be collapsed to one canonical implementation, and the metrics that drive eval/learning must be populated from real data — otherwise adding more tooling only adds more places for drift to hide.
>

---

## The Structural Root Causes

These are the systemic mechanisms — not individual bugs — that let breakage survive sprint after sprint. Each is the *engine* behind dozens of the findings below.

### R1. Enforcement is structurally advisory: every security/quality gate fails OPEN by default and the hard-block path is unreachable in standard config  🔴 `critical`

**Mechanism:** The system's gates are written to warn-and-permit rather than deny. checkWorkerAuthority returns true in BOTH the violation and non-violation branches (worker.ts:602-620), so scope enforcement is a literal no-op. enforceRbac is a NO_OP whenever rbacConfig.enabled is false (rbac.ts:127) and the config default is enabled:false (config.ts:1192) with no mechanism to flip it, so the entire RBAC authority matrix is permanently advisory across worker, nervous, sprint-runtime, backlog-trigger, and autonomous paths. PanicGuard BLOCK is ignored (worker kill proceeds anyway), mTLS cert presence is detected/warned/then ignored, assertSpawnSafe (ADR-006) is never called at spawn callsites, and DockerSpawnBackend (the DEFAULT backend) bypasses the SAFETY_FLOOR lethal guard entirely. Because the deny path is never reached, a violating worker, an over-privileged action, or a lethal command is silently permitted — and the audit trail that would record it is itself often soft (canAutoApply veto logged only to console.log, not audit history). This lets every boundary breach survive to ship while the dashboard stays green.

**Evidence:** `src/agents/worker.ts:602` · `src/core/rbac.ts:127` · `src/core/config.ts:1192` · `src/orchestra/sprint-controller.ts` · `src/orchestra/spawn-backend.ts` · `src/core/spawn-safety.ts` · `src/api/terminal/ws-gateway.ts` · `src/nervous/executor.ts`

**Fix direction:** Invert the default: gates fail CLOSED. Wire enforce_rbac with a real config default of true and a validated schema field (not a type-cast); make checkWorkerAuthority actually return result.allowed; route every spawn callsite through assertSpawnSafe; make PanicGuard/mTLS BLOCK terminate execution. Add a 'no advisory-only gate' lint that fails CI if a function named enforce*/check*/assert* has a code path that returns success on a deny verdict.

### R2. The verification spine is unwired or stubbed — DONE is accepted on worker self-report, not disk-verified (trust-without-verify)  🔴 `critical`

**Mechanism:** Every mechanism designed to independently CONFIRM a worker actually did the work is either dead code or a no-op stub. runPostSprintSmoke/applyProofOfFunctionGate/verifyProofOfFunction have zero production callers (imported but never called in sprint-reporter.ts:97), and even if wired the defaultSmokeRunner unconditionally returns passed:true with output 'default smoke runner (no-op stub)' (post-sprint-smoke.ts:227-232). runHonestyCheck is a literal `return 0` stub (sprint-finalizer.ts:156), so the honesty gate in runSelfAuditGate can never trigger. applyTechDebtDowngrade and checkVerifyMarkerHonesty have zero callers; the verify-delta gate accepts the worker's DONE claim without ever reading the verify-delta file it mandates. reconcileRubricNoGo flips Brain NO_GO to DONE using worker-self-reported coverage as ground truth, and cross-verify REFUTED verdicts are purely advisory with no enforcement path. SubprocessSpawnBackend awards GO_WITH_TECH_DEBT to exit-0 workers that never wrote a result file. The net effect: a worker (or an LLM hallucinating success) can claim DONE and the orchestrator has no independent ground-truth check standing between that claim and a green sprint — exactly the false-DONE acceptance that lets broken features ship sprint after sprint.

**Evidence:** `src/orchestra/post-sprint-smoke.ts:227` · `src/orchestra/sprint-finalizer.ts:156` · `src/orchestra/proof-of-function.ts` · `src/orchestra/result-evaluator.ts` · `src/orchestra/mid-sprint-adapter.ts` · `src/orchestra/cross-verify-runner.ts` · `src/providers/subprocess.ts` · `src/orchestra/sprint-reporter.ts:97`

**Fix direction:** Wire the verification spine into the finalize path and make it real: replace defaultSmokeRunner's no-op with an actual real-binary run against the task's declared Smoke command; implement runHonestyCheck against disk diff; make Brain disk-verify (git diff --stat / ls-files) the result before accepting DONE rather than trusting worker self-report or worker-reported coverage. Treat 'verify task exists but ran a stub' as NO_GO. Add a test that fails if any *Gate/*Smoke/*Honesty export has zero production callers.

### R3. Dormant-knob proliferation — config fields that are defined, validated, displayed, and documented but never read at runtime (settings that lie)  🔴 `critical`

**Mechanism:** A large fraction of the configuration surface has no runtime reader, so operators (and the dashboard ConfigPage) believe they are controlling behavior that is hardcoded. rollback_policy is validated and documented but its value is never read (rollback is hardcoded to opts.rollback!==false); strictTenantIsolation defaults false and is never threaded to MemoryStore (guaranteeing tenant data leak); enforce_least_privilege and denialAudit never reach createAuditedCapabilityRegistry; daily_max_usd/monthly_max_usd are settable and displayed but never enforced as a spending gate; boundary_enforcement, cost_optimization, telemetry_enabled/anonymous, output_render_mode, sandboxMode, adaptive-timeout knobs, history_scaling_enabled, mcp_client_enabled, native_cost_ceiling_usd, plugin_require_signature, --auto-approve (hardcoded true), --tenant, --local — all defined-but-inert. Some are read via unsafe type-casts that bypass schema validation entirely (autonomous.engine='v2', risk_gate_enabled, native_cost_ceiling). This destroys the operator's mental model: turning a safety/cost/tenant knob ON changes nothing, so a misconfiguration that should be caught is silently ignored, and 'I enabled the gate' is false.

**Evidence:** `src/orchestra/sprint-controller.ts` · `src/core/memory-store.ts` · `src/core/capability-runtime.ts` · `src/core/cost-config-loader.ts` · `src/core/config-types.ts` · `src/cli/commands/start.ts` · `src/cli/commands/run.ts` · `src/orchestra/autonomous/mission-store/mission-engine-wire.ts`

**Fix direction:** Establish a 'no dormant knob' invariant: every field in the config schema must have at least one production read-site asserted by a registry test (the test enumerates schema keys and greps for a runtime reader, failing CI on any orphan). Remove fields marked 'legacy — never wired' from the default config. Ban reading config via type-cast — any field a code path reads must be declared on DeckentConfig and validated.

### R4. No single source of truth — the same concept is reimplemented 3-5 times with divergent semantics, so fixes land in dead copies while the live path is untouched  🔴 `critical`

**Mechanism:** Core abstractions exist in multiple incompatible copies with no shared canonical implementation, and routing/dispatch frequently selects a different copy than the one a fix was applied to. There are three divergent RateLimiter implementations, three parseVitestOutput, three getCurrentSprintId reading three different files, three extractKeywords, three redactSensitive with different regex coverage, three max_workers algorithms, two ROLE_CAPABILITY_MAP definitions (with conflicting roles), two NervousSystemConfig schemas (one field required in one and optional in the other), two evaluateResult with different logic, two waitForResults (the DI one never called), two notification systems, duplicate checkWorkerAuthority with divergent signatures, and noGoRate stored as percent in one live path and consumed as fraction in another. This is precisely why advertised fixes are no-ops: the skill-affinity routing fix lives in activation-engine code the routing engine's selectBestAgent skips; the lineage tenant IDOR filter exists but server.ts dispatches the route without `req` so the filter is bypassed; enforceRbac in core/rbac.ts is never imported because enforcement reimplements it inline. Every divergent copy is a place where a regression can hide behind a passing test of its twin.

**Evidence:** `src/core/rate-limiter.ts` · `src/monitor/sprint-state.ts` · `src/core/capability-broker.ts` · `src/core/nervous-types.ts` · `src/orchestra/result-evaluator.ts` · `src/core/activation-engine.ts` · `src/api/server.ts` · `src/agents/worker.ts`

**Fix direction:** Collapse each duplicated concept to one canonical module and delete the rest (RateLimiter, parseVitestOutput, getCurrentSprintId, ROLE_CAPABILITY_MAP, NervousSystemConfig, redactSensitive, max_workers). Add a duplicate-export lint that flags two exported symbols with the same name/role across modules. For routing/dispatch fixes, require a live-path integration test that exercises the actual production call chain (not the helper in isolation) so a fix in a dead copy fails the test.

### R5. Feedback/learning/audit loops run on hardcoded-zero metrics — the self-improvement machinery is structurally inert and cannot detect its own drift  🟠 `high`

**Mechanism:** Deckent's claimed differentiators (self-learning routing, prompt evolution, debt decay, boundary-violation tracking, honesty calibration, telemetry) all depend on metrics that are never populated, so the loops execute but learn nothing. SprintMetrics.boundaryViolations is always hardcoded 0 (so the retro boundary check is permanently wrong), coverage is always 0 throughout the CI guardian and process-runtime makeProcessResult (linesAdded/Removed/coverage all 0), PromptVersion.stats is frozen at {uses:0,successRate:0} because updateVersionStats is never called (F5 evolution loop is permanently silent), DebtTrendAnalyzer always computes 0% debt rate (detector permanently inert), history_scaling_enabled is true by default but SprintHistory is always zero-filled making historyFactor permanently 1.0, recordCrossVerifyVerdict is never called so REFUTED signals never feed routing, and assessSkillRelevance/LearningConfig fields never reach OutcomeTracker. Because the metrics that would surface 'this feature regressed' or 'this agent is failing' are constant zeros, the system has no closed feedback loop to catch breakage — it is instrumented but blind, which is why scale and tooling have not translated into a held chain of success.

**Evidence:** `src/orchestra/sprint-metrics.ts` · `src/core/plugin-hooks.ts` · `src/orchestra/process-runtime.ts` · `src/agents/prompt-version.ts` · `src/nervous/detectors/debt-trend.ts` · `src/orchestra/timeout-estimator.ts` · `src/orchestra/outcome-tracker.ts`

**Fix direction:** Populate the metrics from real data at their source: boundaryViolations from the auditor's git-diff scan, coverage from parsed vitest JSON, prompt stats from retro outcomes, debt rate from the debt store. Add assertions that a metric feeding a learning/decay loop is non-constant across sprints (a test that flags any metric hardcoded to 0/literal). Wire recordCrossVerifyVerdict and version-stats updates into the retro phase so the feedback loop actually closes.

### R6. Silent fallback / swallowed-error / unwired-feature is the default failure mode — features fail invisibly instead of surfacing  🟠 `high`

**Mechanism:** When a path cannot complete its job, the pervasive pattern is to swallow the error and report success rather than fail loudly. bootstrapProviders reads the health-check result into an empty if-body (unhealthy providers have no effect); detectClaude reports authMethod='session' unconditionally with no real login check; config-driven Slack/Discord/Webhook notifications are accepted but the old dispatcher is superseded-not-removed so messages are silently never sent (notify-bootstrap trust-without-verify gap); the dashboard session token is never forwarded to API fetches so authenticated requests silently return nothing and the 401 event has no listener; kill/cleanup errors are swallowed in SprintControlPanel and WorkersPage with no user feedback; runPostFinalizeHooks and runAllUpdaters catch-and-continue with no way to surface failures; getMessage returns the key string on a missing key so i18n typos are invisible; Discord sendMessage drops messages for unknown channels; nextSequence claims atomic but is a racy read-modify-write. On top of this, a huge swath of built features are simply never wired (entire CLI helper review subsystem of 8 classes, dashboard analytics classes, SandboxSpawnBackend, BedrockAdapter spawn always throws, deckent_kill only marks PAUSED without killing the process, deckent_plan documented dry-run but writes files, chat --native wires a stub dispatcher returning placeholders). A feature that fails silently or was never connected looks identical to a working one until a user hits it — which is the literal definition of shipping broken basics.

**Evidence:** `src/core/provider.ts` · `src/core/notify-bootstrap.ts` · `src/dashboard/src/lib/api.ts` · `src/dashboard/src/components/SprintControlPanel.tsx` · `src/cli/helpers/messages.ts` · `src/mcp/tools/kill.ts` · `src/mcp/tools/plan.ts` · `src/cli/commands/chat.ts` · `src/cli/helpers/review-actions.ts`

**Fix direction:** Make silent failure illegal on user-facing and security paths: surface caught errors to the sprint outcome / UI instead of catch-and-continue; have getMessage throw (or log+flag) on missing keys in dev; forward the session token in the shared fetch layer and add a 401 listener. Adopt a 'no orphan export' rule — any exported production symbol with zero callers must be either wired or deleted, enforced by a periodic dead-code audit, so 'built but never connected' cannot accumulate.

### R7. Soft architectural rules (ESM discipline, async I/O standard, scope sanitizer) are documented but not mechanically enforced, allowing slow erosion  🟠 `high`

**Mechanism:** ADRs that are supposed to be load-bearing constraints are honored by convention only, so violations accumulate silently. ADR-087 (async I/O, no spawnSync) is violated by spawnSync in at least a dozen hot/async paths — planner, mid-sprint-adapter, baseline-tracker captureVitestBaseline, task-restoration inside async finalizeSprint, monitor-adapter, output-collector polling loop, onboard, realPlannerComplete in the JIT hot path — each capable of freezing the event loop and causing the timeouts that masquerade as worker failures. ADR-001/002 (pure ESM) is violated by bare require('fs') in promotion-pipeline and require() in nervous runtime-scope-check, which 'always silently falls back to stderr' (the scope-violation event is never emitted). The scope-sanitizer JSDoc claims 8 rules but the code runs 10 with ordering gaps and fails to protect prefixed protected files (src/package.json). Because nothing fails the build when an ADR is violated, the codebase erodes one 'small' exception at a time, and the very ADR-governance the project markets as its rigor is not wired to block anything.

**Evidence:** `src/orchestra/planner.ts` · `src/orchestra/task-restoration.ts` · `src/orchestra/baseline-tracker.ts` · `src/core/output-collector.ts` · `src/orchestra/promotion-pipeline.ts` · `src/nervous/runtime-scope-check.ts` · `src/orchestra/scope-sanitizer.ts` · `src/cli/commands/autonomous.ts`

**Fix direction:** Turn ADR constraints into mechanical lint gates: ban spawnSync in async modules via an ESLint/tsc rule (allowlist only documented sync-startup paths), ban bare require() in the ESM package, and reconcile scope-sanitizer rules with its doc + add prefix-aware protected-file matching. Wire enforceAdrCompliance (currently zero production callers and fails-open on error) into the actual evaluation path so an ADR violation is a real NO_GO rather than a doc.

### R8. Test theater — mock-only suites and tests pinned to dead code report green while the live path is unverified  🟠 `high`

**Mechanism:** A meaningful slice of the test suite asserts on mocks, stubs, or already-dead production code, producing green CI that proves nothing about real behavior — the inverse of the project's own proof-of-function mandate. notification-flow.test.ts tests the dead old NotificationDispatcher, not the live pipeline; cross-sprint-analyzer.test.ts and the vscode extension.test.ts test dead/stub classes; agentic-session.test.ts mocks the entire MemoryStore so it verifies mock behavior, not DB persistence; formatDoctorResponse tests use synthetic {ok:} data that never matches real checks (and the real formatter reports all checks failed due to an .ok vs .passed mismatch); SprintControlPanel.test.tsx encodes the component's silent-error behavior as expected for an unwired component; dashboard nav/i18n tests check only a subset of routes/pages and miss the ones with confirmed hardcoded strings; worker-grid-live.test.tsx asserts on source-text strings instead of component behavior. Because these suites are green, they actively mask the underlying breakage and give false confidence that the chain of success is holding.

**Evidence:** `tests/integration/notification-flow.test.ts` · `tests/agents/cross-sprint-analyzer.test.ts` · `tests/cli/agentic-session.test.ts` · `tests/mcp/helpers/format.test.ts` · `src/dashboard/src/components/SprintControlPanel.test.tsx` · `src/dashboard/src/__tests__/nav-single-source.test.tsx` · `tests/dashboard/worker-grid-live.test.tsx` · `src/mcp/helpers/format.ts`

**Fix direction:** Require behavior-level assertions on the live path: forbid tests that import a symbol with zero production callers (a test referencing dead code should fail a meta-test); replace whole-store mocks with tmpdir-backed real DBs for persistence tests; assert on real served HTML / real CLI stdout per the proof-of-function DoD; expand nav/i18n coverage tests to enumerate ALL routes/pages rather than a hardcoded subset so new surfaces cannot slip through unverified.

---

## Cross-Cutting Root Causes (WHY basic features break)

_123 confirmed findings._

**Synthesis:** This category exposes a single dominant failure mode in deckent: governance and safety gates are written, typed, tested, and documented — but structurally inert at runtime. The pattern recurs across every layer. RBAC/ADR-037 enforcement is the worst offender: enforce_rbac defaults to undefined/false with no config-merge default and no flip mechanism, so every authority gate (sprint-runtime, backlog-trigger, authority-matrix, rbac.ts, Task.actor) returns allowed:true on violation; worse, worker.ts checkWorkerAuthority returns true in BOTH branches, making its boolean return semantically meaningless. A second cluster is trust-without-verify in evaluation: sprint-kind backlog entries get ok=true on non-throw, worker-self-reported coverage flips Brain NO_GO to DONE, cross-verify REFUTED verdicts and verify-delta downgrades have no enforcement path, and SprintMetrics.boundaryViolations/coverage are hardcoded to 0. A third cluster is multi-tenant data leakage: the lineage and missions-audit endpoints leak cross-tenant audit data because server.ts never passes req to the route handlers, leaving the tenant filter as dead code (live IDOR), and MemoryStore strictTenantIsolation defaults false and is never threaded from config. Pervasive secondary issues: ~10 spawnSync/sync-I/O event-loop blockers violating ADR-087 on async hot paths, several no-op stubs masquerading as wired features (post-sprint smoke runner, MCP chat dispatcher, flow run, notification adapters), and dozens of silent error-swallows. The net signal: deckent's stated security/quality guarantees are largely advisory by default, and CI stays green because tests exercise the dead code in isolation while production bypasses it.

### Top findings (38, deduped)

#### RC-001 · 🔴 CRITICAL — auto-edit mode bash guard is dead — compares literal 'bash' but registered tools are 'deckent_bash'/'run_bash'
- **Where:** `src/agent/permission.ts:45`
- **What:** `tool !== 'bash'` is always true (no tool is named exactly 'bash'), so decide() returns 'allow' and shell commands auto-execute in auto-edit mode without confirmation; IMMUTABLE_CORE's rm -rf/force-push promise is model-advisory only (SAFE_FLOOR covers just 3 deckent_ tools).

#### RC-002 · 🔴 CRITICAL — Agent evolution loop never closes — adaptAgentRuntime/runIdentityMutation advisory-only with zero mutate callers
- **Where:** `src/agents/adaptive-agent.ts:221`
- **What:** runIdentityMutation has zero production invocations; requiresApproval defaults true and no caller passes false, so skill add/remove suggestions are filed as 'proposed' forever and agent manifests are never updated. Compounded by F5 prompt-evolution (updateVersionStats/collectPromptEvolutionSuggestion uncalled). [DEDUP: merges prompt-version F5 finding]

#### RC-003 · 🔴 CRITICAL — checkWorkerAuthority returns true in BOTH branches — boolean return is a structural no-op
- **Where:** `src/agents/worker.ts:602-620`
- **What:** Violation branch (line 617) and permit branch (line 620) both return true, so the function can never signal a scope violation; also has zero production callers (prod imports the nervous/authority-matrix.ts version). [DEDUP: merges 3 near-identical worker.ts:584 findings]

#### RC-004 · 🔴 CRITICAL — TerminalAudit HMAC-chain dormant — production wires a no-op AuditSink, no events persisted
- **Where:** `src/api/server.ts:1456-1459`
- **What:** Comment claims 'production wires MemoryStore' but code constructs TerminalAudit({ insert: () => {} }) with no integrity config; session.create/kill/auth.deny events persist nothing and audit-verify always sees 0 rows → ok=true, so tamper-detection can never work.

#### RC-005 · 🔴 CRITICAL — Lineage & missions-audit IDOR: server.ts dispatches routes without req — tenant filter is permanently bypassed (live cross-tenant read)
- **Where:** `src/api/server.ts:820,861,824`
- **What:** registerAutonomousRoutes (GET:820/POST:861) and registerEnterpriseRoutes (824) are called without the req arg; the lineage/missions-audit handlers' if(req) tenant-filter is dead code and the else branch dumps the full cross-tenant chain to any authenticated caller. [DEDUP: merges 4 findings incl. autonomous-endpoint deriveRequestPrincipal]

#### RC-006 · 🔴 CRITICAL — switchProvider /provider command confirms 'switched' but never rebuilds the adapter
- **Where:** `src/cli/commands/chat-native.ts:585-586`
- **What:** opts.switchProvider?.(arg) is optional-chained and entry.ts never passes it; the 'switched: X' confirmation prints unconditionally while all subsequent turns still hit the original provider. createSubscriptionChatAdapter similarly voids its resolved adapter and always uses binary 'claude'.

#### RC-007 · 🔴 CRITICAL — deckent chat --native wires a stub dispatcher returning placeholder strings for all tool calls
- **Where:** `src/cli/commands/chat.ts:424-428`
- **What:** stubDispatcher returns `[native] tool "<name>" not yet wired` and is passed to runChatNativeLoop at lines 445/466; every tool-use in `deckent chat --native`/--once/--message is a silent no-op while the real dispatchers exist and are wired only in the Ink REPL.

#### RC-008 · 🔴 CRITICAL — Skill→agent affinity fix (advertised cure for routing imbalance) is dead code never applied in scoring
- **Where:** `src/core/activation-engine.ts:322-407`
- **What:** routing-engine.ts:544 finalScore has only four terms and omits getSkillAgentAffinityBonus; agent selection (step 3) runs before skill selection (step 5), so the documented affinity bonus is structurally never applied — the imbalance it claims to fix persists.

#### RC-009 · 🔴 CRITICAL — audit-writer chainHead is a process-wide singleton — cross-sprint chain verification always fails brokenAt:0
- **Where:** `src/core/audit-writer.ts:20,96-97`
- **What:** Module-level chainHead accumulates across all sprintIds; in long-running processes (autonomous runtime-loop, API server) each later sprint's first event points to the prior sprint's hash, so isolated verifyAuditChain returns intact:false — persistent false-positive integrity failures that mask real tampering.

#### RC-010 · 🔴 CRITICAL — AES-256-GCM keyring auto-generates silently on first access; credential decryption failure returns null silently
- **Where:** `src/core/credential-encryption.ts:35-78`
- **What:** getMasterKey writes a new ~/.deckent/.keyring with no log/notify/versioning; if the file is regenerated, all credentials become unreadable and getCredential() (credentials.ts:144-147) swallows DecryptionError as null — key loss = silent credential loss.

#### RC-011 · 🔴 CRITICAL — MemoryStore tenant isolation structurally bypassed — strictTenantIsolation defaults false and is never threaded from config
- **Where:** `src/core/memory-store.ts:684,708,742`
- **What:** All 50 production new MemoryStore() sites pass no options, locking strictTenantIsolation=false; the false branch (tenant_id = ? OR tenant_id IS NULL) leaks NULL-tenant rows to every tenant query. config.ts:1494 parses but never forwards the value. Code's own WARNING comment acknowledges the leak.

#### RC-012 · 🔴 CRITICAL — Old + new notification dispatch paths both fail to deliver Slack/Discord/Webhook — config accepted but never sent
- **Where:** `src/core/notify-bootstrap.ts:60`
- **What:** bootstrapNotifyDispatcher never reads config.notifications.webhook/slack/discord; the legacy NotificationDispatcher (notifications.ts) is never instantiated so provider slots stay null. config schema and deckent_config docs advertise these channels but nothing delivers. [DEDUP: merges notifications.ts finding]

#### RC-013 · 🔴 CRITICAL — coverage is always hardcoded 0 throughout CI guardian — track_coverage config has no behavioral effect
- **Where:** `src/core/plugin-hooks.ts:619,635,661,675,708`
- **What:** Every code path sets coverage:0 and coverageDelta:0; no path runs vitest --coverage. Brain/Auditor always see 0% delta, making coverage-regression detection structurally dead.

#### RC-014 · 🔴 CRITICAL — bootstrapProviders health-check + detectClaude are warn-without-block — logged-out provider registers as healthy
- **Where:** `src/core/provider.ts:1024-1035`
- **What:** Unhealthy-provider if-body is empty (comment only, intentionally not unregistered); detectClaude sets authMethod='session' purely from `claude --version` and checkAuthStatus always returns 'ok' for Claude, so a dead credential spawns workers that fail and trigger wasteful FIX waves. [DEDUP: merges detectClaude finding]

#### RC-015 · 🔴 CRITICAL — assertSpawnSafe (ADR-006) and skill-sandbox AST scan are inert: zero callers / silent typescript-absent fallback
- **Where:** `src/core/spawn-safety.ts:100`
- **What:** assertSpawnSafe has zero production callers despite user-controlled strings reaching spawnSync in plugin-hooks.ts:372 and provisioner.ts:115; relatedly skill-sandbox scanCodeAST returns [] when typescript (a devDependency) is absent in prod installs, disabling AST obfuscation detection.

#### RC-016 · 🔴 CRITICAL — AgentDetail/SprintControlPanel/WorkersPage dashboard: 401 auth bypass + silent kill-failure swallows
- **Where:** `src/dashboard/src/components/AgentDetail.tsx:62`
- **What:** AgentDetail uses raw fetch without authHeaders → 401 silently swallowed (shows 'no log') when an API token is set; SprintControlPanel kill/cleanup catches are empty `// silent`, WorkersPage handleKill swallows kill failures, and session/OIDC tokens are never forwarded to api.ts fetch/SSE so authenticated users send unauthenticated requests. [DEDUP: merges 4 dashboard auth/silent-swallow findings]

#### RC-017 · 🔴 CRITICAL — deckent_plan writes task files to disk despite documenting dry-run-only
- **Where:** `src/mcp/tools/plan.ts:47,72-74`
- **What:** input.dryRun (default true, 'tasks are never written to disk') is dropped — planSprint receives only {mode}, so sprint-planner.ts:760 `if (!options?.dryRun)` fires and writes real task files on every MCP plan call. start.ts:113 passes dryRun:true correctly, proving the omission.

#### RC-018 · 🔴 CRITICAL — RBAC enforcement is permanently advisory: enforce_rbac defaults false with no config-merge default and no flip mechanism
- **Where:** `src/nervous/authority-matrix.ts:352-378`
- **What:** enforce_rbac is optional in config-types.ts:814 but never defaulted/merged in config.ts (zero hits), so === true is always false → authority-matrix returns {allowed:true, level:'warn'} for every role violation; hard-deny path is unreachable in any default deployment. [DEDUP: merges 8 findings across runtime-loop.ts, backlog-trigger.ts x2, sprint-runtime.ts x2, rbac.ts, task-types.ts actor]

#### RC-019 · 🔴 CRITICAL — Sprint-kind backlog entries receive unconditional ok=true — runSprint result is trust-without-verify
- **Where:** `src/orchestra/autonomous/execute-dispatcher.ts:312-316`
- **What:** kind=sprint sets ok=true on non-throw alone, discarding runSprint's verdict and skipping Brain-Eval/Auditor/Cross-Verify that task-kind entries run; NO_GO/tech-debt sprints record as success. Same pattern at mission-dispatch.ts:92-96. [DEDUP: merges 2 findings]

#### RC-020 · 🔴 CRITICAL — v2 mission scheduler dispatches approval-required/risk-tagged items without any policy check — human-in-the-loop guarantee absent
- **Where:** `src/orchestra/autonomous/mission-store/mission-scheduler.ts:71-105`
- **What:** runMissionScheduler never reads item.policy; queryDue() returns all pending items and claimItem() runs them regardless of policy. The v1 policyGate (runtime-loop.ts:420) park-gate does not exist in v2.

#### RC-021 · 🔴 CRITICAL — Cross-verify REFUTED verdict is purely advisory with no enforcement path and no advisory recipient
- **Where:** `src/orchestra/cross-verify-runner.ts:204-267`
- **What:** A second provider declaring a task REFUTED triggers no downgrade, no FIX task, no re-eval; recordCrossVerifyVerdict is never called and the BRAIN→AUDITOR:CROSS_VERIFY_REFUTED event has no subscriber — feature produces log noise only.

#### RC-022 · 🔴 CRITICAL — handleWorkerQuestion always auto-responds 'continue', discarding worker suggestedAction (abort/retry/skip)
- **Where:** `src/orchestra/ipc-registry.ts:227-244`
- **What:** Live path (result-collector.ts:1076) never reads question.suggestedAction; a worker detecting a fatal conflict and suggesting 'abort' is told to continue, making suggestedAction a production no-op.

#### RC-023 · 🔴 CRITICAL — reconcileRubricNoGo accepts worker-self-reported coverage as ground truth to flip Brain NO_GO→DONE
- **Where:** `src/orchestra/mid-sprint-adapter.ts:662,731-743`
- **What:** When rubricAverage>=85 && worker-written result.coverage>=80, a Brain NO_GO is overridden to DONE with no independent coverage measurement — inverts ADR-037 Brain-over-worker authority.

#### RC-024 · 🔴 CRITICAL — Post-sprint smoke defaultSmokeRunner is a no-op stub always returning passed:true
- **Where:** `src/orchestra/post-sprint-smoke.ts:227-232`
- **What:** No production caller passes a real smokeRunner, so the default fires and every Tier-1 verify task 'passes' regardless of content — the proof-of-function guarantee is absent even if the outer phase were wired.

#### RC-025 · 🔴 CRITICAL — DockerSpawnBackend (the default backend) bypasses the toggle-independent SAFETY_FLOOR lethal guard
- **Where:** `src/orchestra/spawn-backend-docker.ts:470`
- **What:** Tmux/Subprocess backends call checkLethalGuard; Docker (resolveBackend default on non-Windows) never does, so lethal actionIds (KILL_LIVE_SPRINT, DESTRUCTIVE_GIT, etc.) spawn containers on the production path without the panic gate.

#### RC-026 · 🔴 CRITICAL — PanicGuard BLOCK decision is advisory-only: worker kill is silently omitted with no user notification
- **Where:** `src/orchestra/sprint-controller.ts:1213-1245`
- **What:** evaluate() is called with undefined opts so decision is always BLOCK; the BLOCK branch only debugLogs + writes a synthetic NO_GO, never killing the worker, never calling buildNotification/notify — workers are silently abandoned and the approval workflow is unreachable.

#### RC-027 · 🔴 CRITICAL — runHonestyCheck is a permanent stub returning 0; backup gate passes vacuously without a baseline
- **Where:** `src/orchestra/sprint-finalizer.ts:156-163`
- **What:** Exported runHonestyCheck always returns 0 and has no caller; the backup runSelfAuditGate path requires a baseline that is gated on config.pre_sprint_tests (defaults false), so on default config the honesty gate passes vacuously.

#### RC-028 · 🔴 CRITICAL — SprintMetrics.boundaryViolations always hardcoded 0 — retro permanently reports 'No boundary violations'
- **Where:** `src/orchestra/sprint-metrics.ts:128,215`
- **What:** Every metrics path writes literal 0; the auditor detects real violations (auditor.ts:1199) but the count is never bridged into SprintMetrics, so sprint-retro-writer.ts:404 always emits a false 'clean' signal.

#### RC-029 · 🔴 CRITICAL — getRollbackPolicy 'ask' return value is silently ignored — partial NO_GO sprints never prompt, safety branch discarded
- **Where:** `src/orchestra/sprint-phases.ts:1837-1849`
- **What:** runRollbackCheck handles only policy==='auto'; 'ask' (some-but-not-all NO_GO) falls through with no prompt/rollback, and the safety branch is deleted unconditionally at 1849.

#### RC-030 · 🔴 CRITICAL — BedrockAdapter registered as a worker provider but spawn() always throws; send() is unreachable
- **Where:** `src/providers/bedrock.ts:362-364`
- **What:** Registered in provider.ts:922; spawn() unconditionally throws and send() is not on the ProviderAdapter interface, so any task routed to worker_provider=bedrock fails with a misleading error — dead-wire registration gives false confidence.

#### RC-031 · 🟠 HIGH — Honest-gate in writeResult only catches DONE stubs — GO_WITH_TECH_DEBT zero-work stub maps to TaskStatus.DONE
- **Where:** `src/agents/worker.ts:413-435`
- **What:** looksLikeStub checks selfAssessment==='DONE' only; a GO_WITH_TECH_DEBT result with linesAdded=0/testsPassed=false bypasses the gate and line 432 maps it to TaskStatus.DONE, reaching Brain EVALUATE as a silent success.

#### RC-032 · 🟠 HIGH — Config blocks validated/typed but never applied — decision/learning/collaboration, RUNTIME_EXTENSION_MAX, doc-tracking, siem-forwarder
- **Where:** `src/core/decision-config.ts`
- **What:** Schema-without-enforcement: DecisionEngine/Learning/Collaboration validators+factories have zero callers; timeout.runtime_extension_max is overridden by a hard constant 3 in sprint-phases.ts:963; maybeRunDocTrackingSync returns ran:true on both success and error; siem-forwarder silently discards all audit events when transport is omitted with no signal. [DEDUP: merges 4 validated-but-unapplied/silent-discard findings]

#### RC-033 · 🟠 HIGH — deckent_kill (MCP) only marks task PAUSED in JSON — actual tmux/docker/subprocess process is never terminated
- **Where:** `src/mcp/tools/kill.ts:28`
- **What:** No SIGTERM/killWorker/process.kill anywhere; workers don't poll task JSON for PAUSED, so the process keeps consuming tokens while the response reports 'killed'. CLI kill.ts uses killWorker()+SIGTERM, exposing the divergence.

#### RC-034 · 🟠 HIGH — store.recover() defined in interface and implemented but never called — crash-orphaned 'running' items permanently lost
- **Where:** `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:37-39`
- **What:** All three composition roots (runV2Engine, missions-route, autonomous-mission) call only migrate(); queryDue filters status='pending', so items left 'running' by a crash are invisible to the scheduler forever. [DEDUP: merges mission-engine-wire.ts finding]

#### RC-035 · 🟠 HIGH — Pervasive spawnSync/sync-I/O on async hot paths violates ADR-087 — up to 15-minute event-loop freezes
- **Where:** `src/orchestra/planner.ts:462`
- **What:** spawnSync blocks the loop in the live planner (900s timeout, reachable), mid-sprint-adapter reconcile (180s in sync evaluateWithRubric), task-restoration (30s in async finalizeSprint), baseline-tracker (180s), output-collector polling (10s), monitor-adapter, autonomous JIT-detail, onboard/plugin, and trace-recorder appendFileSync per turn. [DEDUP: merges ~10 spawnSync/sync-I/O findings]

#### RC-036 · 🟠 HIGH — disk-verify MANUAL_REVIEW_REQUIRED reclassification is a soft in-memory annotation — cascade/eval still proceed on NO_GO
- **Where:** `src/orchestra/result-collector.ts:746-751`
- **What:** The synthetic .result with selfAssessment:'NO_GO' is written to disk before the in-memory status override; result-evaluator never checks MANUAL_REVIEW_REQUIRED, so cascade-block and FIX still fire — human-review triage never blocks automation.

#### RC-037 · 🟠 HIGH — applyTechDebtDowngrade verify-delta gate never wired into EVALUATE — worker DONE claims accepted unverified
- **Where:** `src/orchestra/result-evaluator.ts:1425-1438`
- **What:** Function has zero callers; the EVALUATE phase never reads the .verify-delta.json that worker-lifecycle.ts writes, so a worker claiming DONE at 39% completion passes unchanged. Param defaults undefined → no-op.

#### RC-038 · 🟠 HIGH — Sprint lifecycle & EventBus events never reach subscribers — wrong channel + deckent_watch missing watchFile()
- **Where:** `src/orchestra/sprint-controller.ts:243-259`
- **What:** emitSprintEvent emits on raw 'deckent-event' (zero registrations) while NervousObserver listens on 'event' (publish() only), so SPRINT_PHASE_CHANGE/STARTED/COMPLETED are silently dead; separately deckent_watch subscribes but never calls watchFile(), receiving zero live events post-backfill (writeEvent only writes JSONL, never publishes). [DEDUP: merges event-bus watch finding]

---

## Inconsistent Features (conflicting defaults / duplicate impls)

_163 confirmed findings._

**Synthesis:** After dedup, 163 raw "inconsistent" findings collapse to ~138 distinct issues; the dominant pattern is **silent semantic divergence between two or more copies of the same concept** that were never reconciled across sprints. Three structural failure modes recur: (1) **same-name, different-shape duplication** — at least 6 RBAC/role maps and rate limiters, 3 `parseVitestOutput`, 3 `extractKeywords`/`getCurrentSprintId`/`max_workers` algorithms, multiple `checkWorkerAuthority`/`ProviderAdapter`/`RateLimiter`/`NervousSystemConfig`/`useApi` pairs — where TypeScript's structural typing hides the mismatch and only one copy is production-wired; (2) **producer/consumer unit and type contracts that disagree** — `noGoRate` stored as percent but consumed as fraction (×100 double-multiply, 5000% output), config defaults that differ between `createDefaultConfig`, `CONFIG_METADATA`, and `REGEN_TEMPLATE_DEFAULTS` (memory_budget 600/5000, decay 5/20, routing_engine v1/v2, dependency_pipeline false/true), and dot-vs-hyphen capability strings that would fail every least-privilege check if enforced; (3) **stale catalogs, comments, and i18n** — MCP tool catalogs undercount (23/31 vs 35), `readOnlyHint:true` on a tool that writes files, archive paths that never match, and a large class of dashboard/CLI pages that hardcode English/Turkish strings in violation of the project's i18n-FIRST mandate. The most dangerous cluster is RBAC: two `ROLE_CAPABILITY_MAP` definitions with conflicting role names ('engineer' vs 'developer') and capability sets across two enforcement planes, meaning the authority a user is granted depends on which code path evaluates them. Many findings are currently dormant because the broken copy has no production caller (dead-code drift), but they are landmines: the moment a caller imports the wrong same-named symbol, behavior silently changes. The pervasiveness (90+ confirmed duplications/divergences) indicates deckent has no shared SSOT discipline for cross-cutting concepts and relies on ADR-008's one-way-import rule as justification for copy-paste rather than extracting neutral shared modules.

### Top findings (46, deduped)

#### INC-001 · 🔴 CRITICAL — Two divergent ROLE_CAPABILITY_MAP definitions with conflicting roles ('engineer' vs 'developer') and capability sets across two RBAC enforcement planes
- **Where:** `src/core/capability-broker.ts:33 (vs src/nervous/authority-matrix.ts:213)`
- **What:** capability-broker grants viewer=[fs-read,mcp-tool] and uses role 'developer'; authority-matrix grants viewer=[fs-read,db-query,erp-read] and uses 'engineer' — an 'engineer' actor resolves to [] in the broker, so granted authority depends on which enforcement plane evaluates the request.

#### INC-002 · 🔴 CRITICAL — NervousSystemConfig defined twice with divergent schemas (camelCase 7-field vs snake_case 20+ field) — quiet-hours feature silently no-ops
- **Where:** `src/core/nervous-types.ts:162 (vs core/config-types.ts:702)`
- **What:** nervous modules import the narrower nervous-types version and cast (`as NervousSystemConfig`), but runtime config uses the fuller config-types schema with notifications.quiet_hours nested; decision-engine.ts:125 reads top-level `quietHours` which is undefined at runtime, so quiet-hours does nothing.

#### INC-003 · 🔴 CRITICAL — deckent_audit declares readOnlyHint:true but the gate action writes files and retention permanently deletes events
- **Where:** `src/mcp/tools/audit.ts:33`
- **What:** annotation tells MCP clients no writes occur, yet action='gate' mkdirSyncs+writeFileSyncs `.deckent/recently-works/{sprintId}-gate.json` (lines 112-114) and action='retention' apply=true deletes audit events — safety-checking clients bypass confirmation prompts.

#### INC-004 · 🔴 CRITICAL — Three divergent getCurrentSprintId implementations reading different files break the documented CLI↔MCP agreement
- **Where:** `src/monitor/sprint-state.ts:33 (vs core/event-stream.ts:227, cli/commands/watch.ts:32)`
- **What:** sprint-state.ts reads sprint-active.json→sprint-state.json; event-stream.ts reads only sprint-state.json; watch.ts reads config.json/last_sprint_id — the orchestration engine and the status/watch surfaces can resolve different (or null) sprint IDs.

#### INC-005 · 🔴 CRITICAL — SprintMetrics.noGoRate stored as percentage (0-100) but consumed as fraction (0-1) — threshold fires on any NO_GO, display double-multiplies to 5000%
- **Where:** `src/orchestra/sprint-metrics.ts:108 (consumers :517,:522,:596; content-generators.ts:354)`
- **What:** Producer multiplies by 100; ≥4 consumers treat it as 0-1, so `noGoRate > 0.5` fires for any sprint with >0.5% NO_GO and `*100` again yields '5000%' for a 50% sprint, mis-triggering the 'switch to AI planning' suggestion.

#### INC-006 · 🔴 CRITICAL — routing_engine defaults to 'v1' in sprint-planner/sprint-controller but 'v2' everywhere else — fresh-checkout sprints silently use legacy routing
- **Where:** `src/orchestra/sprint-planner.ts:473 (and sprint-controller.ts:857)`
- **What:** config default is v2 (config.ts:1139) and deckent_run paths default v2, but the two most critical call sites (planning + FIX re-route) fall back to v1 when config.routing_engine is absent, so `deckent start` and `deckent run` route differently on a config-less install/CI.

#### INC-007 · 🟠 HIGH — Two unrelated ProviderAdapter interfaces share the same exported name (2-method streaming vs 8+-method process-management) across subsystems
- **Where:** `src/agent/provider-tooluse/types.ts:41 (vs core/provider.ts:88)`
- **What:** native tool-use send()-only contract vs orchestration spawn/kill/listWorkers contract; identical name makes auditing and IDE navigation error-prone and risks accidental mis-import.

#### INC-008 · 🟠 HIGH — buildNoGoResult emits fabricated testsPassed:false/coverage:0 in error paths instead of null — triggers the exact anti-regression false-NO_GO the null fix removed
- **Where:** `src/agents/agentic-worker-entry.ts:175`
- **What:** the file's own doc condemns false/0 as fabricated measurements; the success path was fixed to null but the three error-path calls still emit false/0, and sprint-controller.ts:817 `if(!testsPassed) return NO_GO` fires on the fabricated false.

#### INC-009 · 🟠 HIGH — Duplicate CrossSprintAnalyzer + CrossSprintReport with incompatible shapes, and a broken agentId/agent data-layer field mismatch
- **Where:** `src/agents/cross-sprint-analyzer.ts:17 (vs orchestra/cross-sprint-analyzer.ts:34)`
- **What:** same class+type names, fully divergent fields; the agents version reads entry.agentId but pattern-recorder writes 'agent', so even the .brain/learning/ data contract is broken; live CLI uses the orchestra version.

#### INC-010 · 🟠 HIGH — Duplicate calculateSelfHealingRate with incompatible return types (number vs {percent,healed,attempted}) re-exported from different barrels
- **Where:** `src/agents/worker-lifecycle.ts:230 (vs orchestra/sprint-metrics.ts:267)`
- **What:** worker.ts re-exports the number version, sprint-reporter the object version — importing from the wrong barrel silently yields the wrong type for retro generation.

#### INC-011 · 🟠 HIGH — Two same-name checkWorkerAuthority functions: real RBAC deny-path in nervous/authority-matrix.ts vs hollow always-true wrapper in worker.ts
- **Where:** `src/agents/worker.ts:584 (vs src/nervous/authority-matrix.ts:316)`
- **What:** worker.ts version takes (filePath,scope,...) and returns true in both branches; authority-matrix version takes (req,opts) with a real deny path and is the only one production-wired — a future caller importing the wrong one silently disables enforcement.

#### INC-012 · 🟠 HIGH — sendJson hardcodes DEFAULT_PORT(3100) in the CORS Allow-Origin header — every JSON/error API response breaks CORS on any non-default `serve --port`
- **Where:** `src/api/server.ts:200`
- **What:** SSE/OPTIONS use the dynamic per-request allowedOrigin, but every GET/POST routed through sendJson emits localhost:3100, so the dashboard on a custom port has all JSON API calls blocked by the browser.

#### INC-013 · 🟠 HIGH — Three+ divergent RateLimiter classes (tenant maxConcurrent=10 / IP maxRequests=60 / IP maxRequests=100) — only server.ts is wired, and it drops Retry-After on 429
- **Where:** `src/api/server.ts:83 (vs api/rate-limiter.ts:28, core/rate-limiter.ts:31)`
- **What:** three same-named classes with different keys, limits, return types, and lifecycle; the live one returns boolean so the 429 path never emits the Retry-After value the unused api/rate-limiter.ts computes.

#### INC-014 · 🟠 HIGH — agent sprint-stats fallback sets success=mentions=tasks, inflating success rate to 100% even when the mention is inside a NO_GO/failure block
- **Where:** `src/cli/commands/agent.ts:196`
- **What:** when no markdown table rows are found, both tasks and success are set to the raw name-mention count, so `deckent agent stats` reports synthetic 100% success for agents that actually failed.

#### INC-015 · 🟠 HIGH — Three divergent isNoColor implementations — output.ts/sprint-summary-rich.ts ignore the --no-color CLI flag that dashboard.ts honors
- **Where:** `src/cli/commands/dashboard.ts:37 (vs cli/helpers/output.ts:50, sprint-summary-rich.ts:15)`
- **What:** color suppression behavior depends on which module a caller imports; --no-color works for dashboard output but is ignored by all helper-routed output.

#### INC-016 · 🟠 HIGH — Duplicate diverged HumanDoctorInput/PreFlightResult/runPreFlightHealthCheck across doctor.ts and doctor-checks.ts/doctor-format.ts after incomplete God-Object split
- **Where:** `src/cli/commands/doctor.ts:386 (vs doctor-format.ts:18, doctor-checks.ts:30)`
- **What:** the live doctor.ts HumanDoctorInput grew authProbes/workerImage/workerResources fields the doctor-format copy lacks, and runPreFlightHealthCheck exists identically in two files that can diverge silently.

#### INC-017 · 🟠 HIGH — watch.ts private getCurrentSprintId reads config.json/last_sprint_id (updated only at finalize) — `deckent watch` shows the previous sprint mid-flight
- **Where:** `src/cli/commands/watch.ts:31`
- **What:** a third independent sprint-ID source that ignores the canonical monitor/sprint-state.ts resolution; last_sprint_id is written by sprint-finalizer only on finalize, so an in-flight sprint resolves to the prior one.

#### INC-018 · 🟠 HIGH — Two divergent language detectors: getLangFromConfig returns raw unnormalized lang (no env fallback) while detectLang normalizes+falls back — 'tr_TR' silently renders English
- **Where:** `src/cli/helpers/config-reader.ts:9 (vs cli/helpers/i18n.ts:30)`
- **What:** getMessage strict-checks lang==='tr', so getLangFromConfig callers (finalize/doctor/cleanup/retro/explain) break Turkish even when config sets language:'tr_TR', splitting i18n across commands.

#### INC-019 · 🟠 HIGH — Three divergent extractKeywords implementations (min-len 2 vs >3, none/EN/EN+TR stopwords, no-cap vs 15) — divergent tag generation per import path
- **Where:** `src/core/agent-selector.ts:33 (vs memory-import.ts:37, orchestra/task-analyzer.ts:31)`
- **What:** same string yields different keyword sets; adr-file-sync uses the memory-import version while sprint-planner/agent-step use agent-selector's, so matching and tagging diverge by caller.

#### INC-020 · 🟠 HIGH — audit-writer uses unkeyed SHA-256 in a field named 'hmac' while audit-export uses keyed HMAC-SHA256 — the two integrity chains are mutually unverifiable
- **Where:** `src/core/audit-writer.ts:166 (vs core/audit-export.ts:114)`
- **What:** writer chains createHash('sha256') over canonicalJson (no key) stored as AuditEvent.hmac; exporter chains createHmac('sha256',secret) over JSON.stringify — different primitive, key, and serialization, so verifyAuditChain cannot verify exports and vice-versa.

#### INC-021 · 🟠 HIGH — Handler requiredCapability strings use dot-notation ('db.read','shell.exec') absent from the Capability union and every role grant — all F8 handlers would be CAPABILITY_DENIED if enforcement enabled
- **Where:** `src/core/capability-handlers-data.ts:15 (and capability-handlers.ts:17)`
- **What:** dot-notation verbs are bridged by `as Capability` casts but never match the hyphen-notation grants in ROLE_CAPABILITY_MAP, so least-privilege enforcement would reject db.query/mail.search/http.get/env.read/shell.exec for every actor.

#### INC-022 · 🟠 HIGH — config defaults disagree across three sources: memory_budget 600/5000, decay_after_sprints 5/20 — `deckent config list` shows stale values
- **Where:** `src/core/config.ts:1100 (vs CONFIG_METADATA :1967/:1973)`
- **What:** createDefaultConfig sets 5000/20 (Sprint 140) but CONFIG_METADATA still documents 600/5 and feeds generateConfigReference + dashboard help, so docs actively mislead about real defaults.

#### INC-023 · 🟠 HIGH — dependency_pipeline_enabled default is false in docstring+REGEN_TEMPLATE_DEFAULTS but true in resolveConfig — a config regen silently flips wave scheduling
- **Where:** `src/core/config.ts:1488 (vs REGEN_TEMPLATE_DEFAULTS :1642, config-types.ts:910)`
- **What:** never-set runtime resolves to `?? true` (wave/cascade active) but a fresh init/regen writes false, so the same project changes scheduling behavior before vs after a regen.

#### INC-024 · 🟠 HIGH — Three+ divergent max_workers algorithms (caps 16/8/30, inputs totalGB/tiered/freeMem) — doctor display, init suggestion, and live sprint each use a different formula
- **Where:** `src/core/host-detector.ts:96 (vs system-capacity.ts:70, system-profile.ts:9)`
- **What:** the live spawn path (system-profile.ts via sprint-spawner.ts:353) can reach 30 workers while init suggests ≤8 and doctor derives from a third formula; same hardware yields 2x-5x divergent worker counts with no reconciliation.

#### INC-025 · 🟠 HIGH — BUILTIN_TRUSTED_SKILLS lists 4 of 5 stale skill IDs (react-expert/test-expert/doc-expert/node-expert) that match no real skill — trust bypass broken
- **Where:** `src/core/marketplace/skill-sandbox.ts:197`
- **What:** real IDs are react-specialist/testing-expert/documentation-writer and node-expert doesn't exist, so isTrusted() returns false for built-in skills — they'd be scanned as untrusted third-party if the gate were used.

#### INC-026 · 🟠 HIGH — Two parallel notification systems with incompatible event taxonomies — only the adapter-based one is wired, the URL-provider one is dead but test-covered
- **Where:** `src/core/notifications.ts (vs core/notification-dispatcher.ts)`
- **What:** old NotificationEventType (4 snake_case) + NotificationProvider.send(url,event) coexists with new NotificationEventName (7 kebab) + NotificationAdapter.send(notification); tests exercise the dead system's mock, not live behavior.

#### INC-027 · 🟠 HIGH — Two parallel skill-loading systems — SkillPoolManager re-reads disk every getSkill() call (N scans/sprint) while the mtime/LRU SkillLoadingCache is never instantiated
- **Where:** `src/core/skill-pool.ts:32 (vs core/skill-cache.ts:25)`
- **What:** the caching layer built precisely to avoid per-call directory scans has zero production callers; sprint-phases creates a fresh SkillPoolManager per task-fix so even per-instance caching is impossible.

#### INC-028 · 🟠 HIGH — DirectivesEditor (hardcoded English, swallows load errors) and DirectivesPage (i18n-clean) duplicate the same feature with divergent behavior
- **Where:** `src/dashboard/src/components/DirectivesEditor.tsx (vs pages/DirectivesPage.tsx:95)`
- **What:** same /api/directives endpoints, but the embedded component hardcodes English warnings/success that have existing en/tr keys and silently swallows load failures the page surfaces.

#### INC-029 · 🟠 HIGH — NO_GO/ERROR status renders yellow in SprintSummary but red in TaskCard/WorkerCard — contradictory failure-state color language across pages
- **Where:** `src/dashboard/src/components/SprintSummary.tsx:55 (vs TaskCard.tsx:53, WorkerCard.tsx:15)`
- **What:** no shared status-color constant; the same sprint failure looks like a warning on the Status page and an error on the Workers page.

#### INC-030 · 🟠 HIGH — Two divergent useApi hooks both named useApi with incompatible return shapes ({get,post} vs {data,loading,error,refetch}) — ChatPage accidentally imports the stateless one
- **Where:** `src/dashboard/src/lib/useApi.ts:12 (vs hooks/useApi.ts:26)`
- **What:** any new page mis-importing from lib/ instead of hooks/ gets a silent API mismatch with no polling/state; ChatPage already does (POST-only).

#### INC-031 · 🟠 HIGH — LoginPage / ManualTokenInput / MissionsPage hardcode English strings with zero useTranslation — i18n-FIRST mandate violated on auth and missions surfaces
- **Where:** `src/dashboard/src/pages/LoginPage.tsx (and ManualTokenInput.tsx, MissionsPage.tsx)`
- **What:** no login/sso/missions i18n keys exist; Turkish users get English-only login, token, and missions UI, directly violating CLAUDE.md's mandatory getMessage/t() rule across multiple user-facing surfaces.

#### INC-032 · 🟠 HIGH — Two structurally-different VS Code extensions with divergent command IDs/manifests — the compiled main-build stub (deckent.start/status/explain) is the no-op, not the real impl
- **Where:** `src/extensions/vscode/extension.ts:39 (vs extensions/vscode/src/extension.ts:24)`
- **What:** tsconfig include 'src/**/*.ts' compiles the stranded stub into dist while the real implementation (deckent.startSprint/showDashboard) lives outside the build root — split-brain where the shipped extension is the wrong one.

#### INC-033 · 🟠 HIGH — cleanup MCP tool hardcodes memoryBudget=900/decayAfterSprints=8 vs config defaults 5000/20 — dryRun wouldDecay is a false positive
- **Where:** `src/mcp/tools/cleanup.ts:70`
- **What:** reads raw .deckent/config.json bypassing loadConfig and falls back to stale 900/8, so operators see wouldDecay:true at >900 entries when the real threshold is 5000.

#### INC-034 · 🟠 HIGH — MCP help.ts TOOLS catalog lists 23 of 35 registered tools — AI consumers are blind to watch, all 5 nervous, autonomous, process, usage, audit, recover, feature_query
- **Where:** `src/mcp/tools/help.ts:48`
- **What:** static hardcoded list never updated as tools were added; deckent_help advertises itself as the capability catalog but omits >1/3 of live tools.

#### INC-035 · 🟠 HIGH — deckent_process backlogPath computed config-aware on submit but hardcoded on status/result — custom autonomous.backlog_path makes every status/result return found:false
- **Where:** `src/mcp/tools/process.ts:19`
- **What:** submit delegates to buildProcessController (config.autonomous.backlog_path) while status/result read the hardcoded default; the same three-site hardcoded helper bug is duplicated in cli/commands/process.ts and api/autonomous-endpoint.ts.

#### INC-036 · 🟠 HIGH — Three divergent alert-dedup keys (source / source::message / source-or-message) write to the same .dashboard.json alerts array, producing duplicate alerts
- **Where:** `src/monitor/alert-emitter.ts:42 (vs auditor.ts:1437, dashboard-manager.ts:275)`
- **What:** emitAlert and writeScanToDashboard dedup the shared array by different keys with different cap policies (newest-retained vs oldest-removed), so a same-source different-message alert appears twice.

#### INC-037 · 🟠 HIGH — Three divergent parseVitestOutput implementations with incompatible return types — honesty gate, CI baseline, and worker audit compute different failure counts
- **Where:** `src/orchestra/baseline-tracker.ts:107 (vs core/plugin-hooks.ts:549, agents/worker-verify.ts:76)`
- **What:** broad /(\d+)\s+failed/i vs scoped 'Tests' line vs FAIL-name extraction; the auditor even built a 4th path (gatherCiBaseline) to work around the baseline-tracker regex bug.

#### INC-038 · 🟠 HIGH — Default HEARTBEAT.md template's second task ('vitest ... 2>&1 | tail -5') always fails the module's own COMMAND_INJECTION validator on every fresh project
- **Where:** `src/orchestra/heartbeat-daemon.ts:36`
- **What:** SHELL_METACHAR_REGEX (line 29) blocks '&' and '|' and 'tail' is not in ALLOWED_COMMANDS, so the bootstrapped template's 2nd task is permanently rejected — template and validator co-located but never tested against each other.

#### INC-039 · 🟠 HIGH — Two parallel learning systems (PatternRecorder→.brain/learning/ vs OutcomeTracker→.deckent/routing/) with overlapping schemas and zero integration
- **Where:** `src/orchestra/pattern-recorder.ts:30 (vs outcome-tracker.ts:109)`
- **What:** PatternRecorder is never called so .brain/learning/ is empty and PatternReader always returns nothing; OutcomeTracker is the live system — dead storage + duplicate schemas for the same routing-learning goal.

#### INC-040 · 🟠 HIGH — Two divergent evaluateResult functions — finalize --force uses the simplified sprint-controller version lacking TIMEOUT/spurious-NO_GO/Bash-unavailable/goNogo handling
- **Where:** `src/orchestra/result-evaluator.ts:120 (vs sprint-controller.ts:812)`
- **What:** manual finalization re-evaluates identical results with different logic than the live sprint, producing inconsistent GO/NO_GO verdicts.

#### INC-041 · 🟠 HIGH — Two divergent waitForResults — the result-evaluator.ts DI copy lacks disk-verify, container-path sanitizer, TOPP-B dispatch, SharedMemory, and nervous-respawn gates
- **Where:** `src/orchestra/result-evaluator.ts:376 (vs result-collector.ts:520)`
- **What:** the exported DI version drifted stale as Sprints 178/195/201/278 added safety gates only to result-collector; a caller importing from result-evaluator would silently skip every integrity gate.

#### INC-042 · 🟠 HIGH — Three divergent redactSensitive implementations — worker-log.ts uses the weaker core version missing pk- keys and the 100-char content guard that sprint-runner-entry.ts has
- **Where:** `src/orchestra/sensitive-redactor.ts:50 (vs core/redact-sensitive.ts:15, cli/helpers/output.ts:73)`
- **What:** secrets leaking through worker-log.ts may be logged while the same secret via the crash handler is redacted; the output.ts copy is dead code that could mislead future importers.

#### INC-043 · 🟠 HIGH — archiveOrphanTasks writes to .brain/archive/ but cleanTasksArchive reads .tasks/archive/ — retention never prunes the real archives (unbounded growth)
- **Where:** `src/orchestra/sprint-docs-updater.ts:560 (cleanTasksArchive :590)`
- **What:** finalizeSprint calls both back-to-back; the cleaner looks in a tree nothing writes to, so the keep-last-5 policy silently never fires and .brain/archive/ accumulates forever.

#### INC-044 · 🟠 HIGH — Duplicate runtime-extension config: max_extensions 2 vs 3, heartbeat 60s vs 90s, enabled false vs true between timeout-watcher.ts and sprint-phases.ts
- **Where:** `src/orchestra/timeout-watcher.ts:46 (vs sprint-phases.ts:963)`
- **What:** Sprint-145 TimeoutWatcher (default OFF, cap 2, 60s) was never removed after Sprint-191 evaluateRuntimeExtension (default ON via config.ts:191, cap 3, 90s) superseded it; only the latter is wired.

#### INC-045 · 🟠 HIGH — GeminiAdapter.isAvailable() rejects OAuth-only users that spawn() explicitly supports — valid users falsely trigger provider fallback
- **Where:** `src/providers/gemini.ts:340`
- **What:** spawn()+buildGeminiSpawnEnv() were updated to let the CLI use an OAuth session when no API key is present, but isAvailable()/diagnoseAvailability() still require getApiKey()!==undefined, so resolveProviderWithFallback marks Gemini unavailable for OAuth users.

#### INC-046 · 🟠 HIGH — tool_result tool_call_id silently falls back to '' producing structurally invalid OpenAI training examples accepted into both corpora
- **Where:** `src/training/cc-trace-extractor.ts:107`
- **What:** OpenAI format requires non-empty tool_call_id matching the preceding tool_calls id; a malformed transcript yields tool_call_id:'' (and symmetric id:'' at line 141) with no skip guard, silently corrupting general+aligned training data.

---

## Unwired Code (zero-caller exports / unreachable paths)

_257 confirmed findings._

**Synthesis:** Deckent is saturated with built-but-unwired code: ~210 distinct dead exports/classes/methods survive after deduping near-identical findings (e.g. recordCrossVerifyVerdict, enforceAdrCompliance, applyTechDebtDowngrade, capability-realizer, the notification-provider stack, both rate-limiter classes each reported twice). The dominant pattern is half-finished features: a function/class is implemented and unit-tested in isolation, but the single integration call into the live sprint lifecycle (sprint-phases/sprint-finalizer/result-evaluator), spawn path, or React router was never added — so the test suite is green while the capability is structurally absent at runtime. This is most dangerous in the SAFETY and EVALUATION layers: every guarantee deckent advertises in its own CLAUDE.md/ADRs is dead — ADR-006 spawn-safety (assertSpawnSafe), ADR-079 Proof-of-Function gate (applyProofOfFunctionGate), ADR-039 self-modify enforcement (enforceSelfModifyingTask), ADR-043 orphan-HB cleanup (cleanupOrphanHBs), the Sprint-140 cost-cascade guard (CascadeDetector), worker auth/snapshot/result-persist guards (authHealthCheck/setupTaskSnapshot/verifyResultPersisted), and the RBAC enabled-gate (enforceRbac) all have zero production callers. The cross-verify and verify-delta learning loops never feed routing; honest-gate and proof-of-function downgrades never fire. A second recurring shape is superseded-but-not-deleted parallel implementations (V1 DecisionOrchestrator vs routeTaskV2, old NotificationDispatcher vs NotifyDispatcher, three RateLimiter classes, PatternRecorder vs OutcomeTracker, doctor-format.ts vs doctor.ts, retro-formatter/parser vs retro.ts, helpers/sprint-summary vs sprint-summary-rich), creating silent-drift hazards. The dashboard ships ~10 fully-built but never-mounted React components (AppShell, SprintControlPanel, RoutingDistribution, WorkerGrid, Onboarding, 4 analytics classes, theme tokens). Net: deckent's safety/quality/learning posture is materially weaker than its ADR catalogue and tests imply — the proof-of-function and honesty guarantees the project enforces on workers are themselves unwired.

### Top findings (56, deduped)

#### UNW-001 · 🔴 CRITICAL — SandboxSpawnBackend never instantiated — --sandbox only git-stashes, never sandboxes
- **Where:** `src/providers/sandbox.ts`
- **What:** Full sandbox backend (memory limits, scope enforcement, network blocking) has zero callers; RunSprintOptions.sandboxMode (sprint-controller.ts:597) is declared but never read in runSprint, so the --sandbox flag (start.ts) only applies a git-stash, never activates the backend.

#### UNW-002 · 🟠 HIGH — AgentSession.cancel() / setApprovalMode() never called — REPL /cancel and /approve are no-ops on native engine
- **Where:** `src/agent/session.ts`
- **What:** /cancel (app.tsx:405) only drains the view queue; in-flight LLM turns and tool calls run to completion. /approve mutates a legacy variable read only by the dispatcher path; the native engine's confirm never consults it and session.setApprovalMode is never called, so full-auto has zero effect on the native path.

#### UNW-003 · 🟠 HIGH — agents/cross-sprint-analyzer + permission-guard dead — RBAC PermissionGuard and analyzer duplicates unused
- **Where:** `src/agents/permission-guard.ts`
- **What:** PermissionGuard.validateAgentModification (the declared RBAC enforcement) is called only in tests; the live path uses authority-enforcer.checkAuthority. agents/cross-sprint-analyzer.ts is a standalone dead duplicate of the orchestra version (the CLI imports the orchestra one).

#### UNW-004 · 🟠 HIGH — PromptEvolutionLog (agents) fully dead, shadowed by orchestra/prompt-evolution
- **Where:** `src/agents/prompt-evolution.ts`
- **What:** recordEvolution/getEvolutionTimeline never imported in production; agent prompt-evolution history (.deckent/agents/{id}/evolution.json) is never recorded. The orchestra-side evolvePromptCheckRollback/wirePromptEvolutionFromOutcomes chain is also never invoked from the live retro path.

#### UNW-005 · 🟠 HIGH — PromptVersionManager.updateVersionStats never called — prompt stats frozen at 0, dashboard shows false data
- **Where:** `src/agents/prompt-version.ts`
- **What:** Every PromptVersion is born stats{uses:0,successRate:0} and updateVersionStats (the sole mutator, line 132) is never called; the wired /api/evolution/prompt-metrics endpoint surfaces successRate:0 / trend:stable for every agent to the dashboard.

#### UNW-006 · 🟠 HIGH — IPC PAUSE/RESUME/KILL unreachable — WorkerSideChannel never instantiated, registry always empty
- **Where:** `src/agents/worker-ipc.ts`
- **What:** registerWorkerChannel (ipc-registry.ts:49) has zero callers; sprint-lifecycle.ts:484 calls channel.pause()/resume() guarded by 'if(channel)' which is always false, so Brain pause/resume IPC never reaches workers — the tmux kill fallback is always taken.

#### UNW-007 · 🟠 HIGH — enforceVerifyLoop and entire verify-loop suite have zero callers — worker quality gate is dead
- **Where:** `src/agents/worker-verify.ts`
- **What:** enforceVerifyLoop/runTestVerifyLoop/runCompilationLoop/runCoverageVerify are re-exported via worker.ts but never invoked; AI workers run verification via shell, making the Node gate structurally unreachable. The .verify-ran marker it would write is therefore never created, making checkVerifyMarkerHonesty inert too.

#### UNW-008 · 🟠 HIGH — authHealthCheck never called — docker worker auth-loss still silently exits 0
- **Where:** `src/agents/worker.ts`
- **What:** Docker backend injects CLAUDE_AUTH_REQUIRED=1 (spawn-backend-docker.ts:742) but no worker entry point reads it or calls authHealthCheck (def line 680); a worker losing Claude auth in docker produces a silent exit-0 with no .result — the exact bug it was built to fix.

#### UNW-009 · 🟠 HIGH — setupTaskSnapshot never called in any spawn path — worker rollback pipeline is dead
- **Where:** `src/agents/worker.ts`
- **What:** result-evaluator.ts:269 references the pre-spawn git-stash snapshot as if it runs, but no spawn backend calls setupTaskSnapshot (def line 276), so writeStashRef never fires and NO_GO worker rollback (worker-rollback.ts) silently skips for all sprints.

#### UNW-010 · 🟠 HIGH — agentic-session.ts dead — per-turn chat persistence to memory.db never wired
- **Where:** `src/cli/commands/agentic-session.ts`
- **What:** buildChatMemoryAdapter/persistTurn/resumeSession have no production caller; all four runChatNativeLoop callsites (entry.ts:669, chat.ts:443/464) omit the memory: field, so chat turns are never recorded in memory.db.

#### UNW-011 · 🟠 HIGH — chat-mode.ts + chat-native parsers + chat.ts helpers dead — REPL enterprise-mode gating and tool-parse path unwired
- **Where:** `src/cli/commands/chat-mode.ts`
- **What:** resolveChatMode/filterRegistryByMode/isEnterpriseSlash never imported (DECKENT_CHAT_MODE gating dead); parseToolCallFromText (chat-native.ts:367) is a dead <tool_use> parser superseded by parseDeckentToolCallsFull; 7 chat.ts exports (classifyChatIntent/probeProviders/selectProvider/...) are test-only.

#### UNW-012 · 🟠 HIGH — doctor-format.ts entire module dead — incomplete God-Object split, doctor.ts kept its own copies
- **Where:** `src/cli/commands/doctor-format.ts`
- **What:** All 12 exports (formatHumanDoctor, formatSystemProfile, getMemoryHealthLabel, ...) are never imported; doctor.ts re-defines and uses identical copies. retro-formatter.ts/retro-parser.ts are the same incomplete-split pattern vs retro.ts.

#### UNW-013 · 🟠 HIGH — initReplMcpBridge / isMcpClientEnabled / createMcpAuditSink never called — REPL MCP config-gating & audit hook dead (reported 2×)
- **Where:** `src/cli/repl/mcp-bridge.ts`
- **What:** chat-native.ts:619 builds the bridge inline via buildMcpBridge(new McpClientBroker()), bypassing initReplMcpBridge — so the mcp_client_enabled gate is dead and the broker's onCall audit sink (createMcpAuditSink) is always undefined, making emitCall a no-op.

#### UNW-014 · 🟠 HIGH — ConnectorPool fully dead — multi-connector dispatch superseded by ConnectorTarget[]
- **Where:** `src/connectors/connector-pool.ts`
- **What:** register/broadcast/startAll/stopAll/onAnyMessage never imported in production; connector-notify-adapter.ts comment explicitly says NOT to use ConnectorPool.broadcast — production fans out via makeConnectorNotificationAdapter instead.

#### UNW-015 · 🟠 HIGH — getSkillAgentAffinityBonus / SKILL_AGENT_MAP never imported — skill→agent affinity has zero routing effect
- **Where:** `src/core/activation-engine.ts`
- **What:** routing-engine.ts:544 finalScore omits the affinity term; the Sprint-212 fix (lines 341-407) for agent routing imbalance is dead, so assigning the api-builder skill does not boost the api-builder agent.

#### UNW-016 · 🟠 HIGH — audit-export.ts HMAC-chain compliance export has zero callers — F4 audit export dormant
- **Where:** `src/core/audit-export.ts`
- **What:** exportAuditLog/verifyHmacChain (compliance-grade tamper-evident audit) are imported only by tests; no CLI/API/MCP wiring. audit-query lineage helpers (filterByCorrelation/Causation/groupByActor) are similarly dead surface.

#### UNW-017 · 🟠 HIGH — SessionStore (auth-session.ts) has zero callers — SSO session lifecycle absent at runtime
- **Where:** `src/core/auth-session.ts`
- **What:** create/resolve/revoke/prune fully implemented but never instantiated; API auth uses stateless deriveRequestPrincipal/parseOidcClaims instead.

#### UNW-018 · 🟠 HIGH — CascadeDetector never wired — Sprint-140 $42 cost-cascade guard is a dead letter
- **Where:** `src/core/cascade-detector.ts`
- **What:** The SAFE-06 guard (pause after 5 consecutive NO_GO) implemented to prevent the 197-worker/100%-NO_GO cost explosion is never instantiated; sprint-phases/result-collector never call onResult()/onRateLimited().

#### UNW-019 · 🟠 HIGH — CredentialManager + helpers fully dead — AES-256-GCM credential store never wired to any auth path
- **Where:** `src/core/credentials.ts`
- **What:** No CLI/MCP/provider-auth importer; provider-auth-probe.ts reads ~/.claude/.credentials.json directly, bypassing the encrypted store entirely.

#### UNW-020 · 🟠 HIGH — Six decision-config factory/validator functions dead — config.decision_engine/learning/collaboration accepted but never validated
- **Where:** `src/core/decision-config.ts`
- **What:** createDefault*/validate* for the three config blobs have zero callers; config merge never invokes them, so user-supplied config is accepted by the schema but never validated and the defaults are never applied.

#### UNW-021 · 🟠 HIGH — buildErpConnectorFromDeck never called — .deck ERP secret hygiene (ADR-014) bypassed
- **Where:** `src/core/erp-connector.ts`
- **What:** Both ERP bootstrap sites (runtime-loop.ts:308, process-runtime.ts:44) call buildErpConnectorFromConfig(config.erp, process.env) directly, so ERP credentials come from process.env and the .deck secret-loading path is dead.

#### UNW-022 · 🟠 HIGH — emitDependencyResolvedByFix never wired — fix-resolution signal-subscriber path dead (Sprint-178 polling gap)
- **Where:** `src/core/event-stream.ts`
- **What:** result-collector handles fix-resolution via an inline doneIds set but never emits the DEPENDENCY_RESOLVED_BY_FIX event; the auditor/dashboard/Brain depStatuses subscribers the comment promises do not receive the signal. (extractLineage, reconstructState in the same file are also unwired.)

#### UNW-023 · 🟠 HIGH — global-config.ts all six exports dead — config.ts duplicates global-config read/merge inline
- **Where:** `src/core/global-config.ts`
- **What:** ensureGlobalDir/readGlobalConfig/writeGlobalConfig/mergeWithProjectConfig/getGlobalConfigPath/isGlobalConfigPresent have no importer; config.ts:1291/1576 reads GLOBAL_CONFIG_PATH via its own readJsonFile + deepMerge and defines its own loadGlobalConfig/saveGlobalConfig.

#### UNW-024 · 🟠 HIGH — DependencyResolver + RatingSystem (marketplace) + exportAdrsToFs fully dead
- **Where:** `src/core/marketplace/dependency-resolver.ts`
- **What:** Skill dependency resolution (topo sort/cycle/conflict/install ordering) and the skill RatingSystem have zero production callers; the marketplace install flow has no dependency wiring. exportAdrsToFs (memory-export.ts:317) leaves ADR DB→FS reverse sync (ADR-046 Amendment) one-way.

#### UNW-025 · 🟠 HIGH — Notification provider stack dead — Discord/Slack/Webhook providers + NotificationDispatcher + notification-config never wired
- **Where:** `src/core/notifications.ts`
- **What:** 'new NotificationDispatcher' has zero callers; the three NotificationProvider classes and notification-config validators are orphaned by the newer NotifyDispatcher/notify-bootstrap path. Configured Discord/Slack/webhook URLs in config.json are silently ignored at runtime; zod validates config so notification-config validators never run.

#### UNW-026 · 🟠 HIGH — provider-capabilities.ts entire module dead; resolveProviderWithFallback never called
- **Where:** `src/core/provider-capabilities.ts`
- **What:** The canonical capability matrix (streaming/toolUse/vision/cost) is imported only by tests; ModelRegistry supplanted it (TODO line 149 never executed). Separately, provider.ts:641 resolveProviderWithFallback (the canonical ADR-027 fallback chain) has zero callers — orchestra uses its own inline fallback.

#### UNW-027 · 🟠 HIGH — enforceRbac() never imported — RBAC enabled-gate wrapper bypassed by all callers (reported 2×)
- **Where:** `src/core/rbac.ts`
- **What:** rbac.ts importers call can() directly; sprint-runtime/backlog-trigger define a local boolean const named enforceRbac (shadowing the fn) and pass it to checkWorkerAuthority, so the config-driven EnterpriseConfig.rbac.enabled gate (line 120) never runs.

#### UNW-028 · 🟠 HIGH — PendingDispatchQueue has zero callers — autonomous human-approval gate (ADR-040) bypassed
- **Where:** `src/core/self-dispatch.ts`
- **What:** The evaluateAndEnqueue/approveDispatch/listPendingDispatches approval gate (lines 248-299) is never instantiated; runtime-loop uses ad-hoc queues and the older createSelfDispatchCallback, leaving the documented 'Alperen onayı' safeguard unenforced by this class.

#### UNW-029 · 🟠 HIGH — SkillLoadingCache + SkillRegistry have zero callers — skill hot-path re-scans disk every call
- **Where:** `src/core/skill-cache.ts`
- **What:** LRU/mtime SkillLoadingCache and JSON-backed SkillRegistry are never wired into SkillPoolManager; loadSkills() does a raw fs.readdirSync+readJsonSafe per call. AgentSelectionCache (agent-cache.ts) is the analogous dead agent-side cache.

#### UNW-030 · 🟠 HIGH — spawn-safety assertSpawnSafe/isSpawnSafe have zero callers — ADR-006 binary-whitelist guard is dead
- **Where:** `src/core/spawn-safety.ts`
- **What:** The ADR-006 spawn security primitive is never imported; all 75 real spawnSync/spawn callsites (plugin-hooks, provisioner, analyzer, subscription) bypass it and the module is not even re-exported from core/index.ts.

#### UNW-031 · 🟠 HIGH — TelemetryCollector dead and telemetry config never read — feature is inert scaffolding
- **Where:** `src/core/telemetry.ts`
- **What:** Class never instantiated; telemetry_enabled/telemetry_anonymous config fields appear only in schema+dashboard i18n, never read at runtime (observability.ts comments 'telemetry is ALWAYS disabled').

#### UNW-032 · 🟠 HIGH — Four dashboard analytics classes never imported — entire analytics layer (543 LoC) unmounted
- **Where:** `src/dashboard/src/analytics/agent-comparison-data.ts`
- **What:** AgentComparisonData/SkillHeatmapData/SuccessChartData/AnalyticsData are built and tested but no page/endpoint imports them; analytics infra was scaffolded ahead of UI pages that were never created.

#### UNW-033 · 🟠 HIGH — Dashboard ships ~7 fully-built but never-mounted components (AppShell, SprintControlPanel, RoutingDistribution, WorkerGrid, Onboarding, RefreshButton, SidebarNavLinks)
- **Where:** `src/dashboard/src/components/SprintControlPanel.tsx`
- **What:** App.tsx mounts Layout (not AppShell) and pages import WorkerCardGrid (not WorkerGrid); SprintControlPanel/RoutingDistribution/Onboarding/RefreshButton have zero JSX usages. Backend /api/routing/distribution serves data no component renders. theme.ts design-token system and lib/terminal-sessions MultiSessionManager are likewise never imported.

#### UNW-034 · 🟠 HIGH — VS Code extension getMcpConfig has zero callers — extension never connects to MCP server
- **Where:** `src/extensions/vscode/extension.ts`
- **What:** The stub activate() registers 3 no-op commands and never calls getMcpConfig (line 83); the real implementation lives in a separate extensions/vscode/src/extension.ts, leaving this copy stranded and the advertised VS Code↔MCP integration absent at runtime.

#### UNW-035 · 🟠 HIGH — cleanupOrphanHBs / detectOrphans never wired — ADR-043 crash-recovery orphan-HB cleanup is dead
- **Where:** `src/monitor/auditor.ts`
- **What:** After a Brain crash, stale .hb files accumulate and fire false stale-agent CRITICAL alerts every 30s; the cleanup pipeline (lines 2349-2480) is never called from spawn/recover/scan loops and is not re-exported from monitor/index.ts.

#### UNW-036 · 🟠 HIGH — enforceAdrCompliance has zero production callers — ADR-006/008/010 worker-output enforcement is dead (reported 2×)
- **Where:** `src/orchestra/authority-enforcer.ts`
- **What:** Defined at line 573, re-exported only via the never-imported agents/auditor.ts shim; no Brain EVALUATE/result-evaluator/scan path reaches it, so ADR violations in worker output pass silently.

#### UNW-037 · 🟠 HIGH — MissionEventLog never wired into v2 engine — per-mission JSONL event trace never written
- **Where:** `src/orchestra/autonomous/mission-store/mission-events.ts`
- **What:** Zero production import/instantiation; runV2Engine builds only MissionStore+DispatchFn+deliver, with no event-log wiring in mission-engine-wire.ts.

#### UNW-038 · 🟠 HIGH — brain-context.ts entire module dead — planning never enriched with agent/skill stats or history
- **Where:** `src/orchestra/brain-context.ts`
- **What:** All 9 enrichment/format exports (285 lines) have zero callers; planning decisions run without agent-performance stats or sprint-history context. Sibling batch-stats.ts (BatchStatsUpdater → .deckent/stats/) is likewise never wired, so per-agent/skill stat files are never written.

#### UNW-039 · 🟠 HIGH — sprintMetricsUpdater never registered — README sprint/test/API metrics never updated at runtime
- **Where:** `src/orchestra/doc-updaters/metrics-updater.ts`
- **What:** index.ts auto-registers 4 updaters but omits sprintMetricsUpdater; runAllUpdaters only iterates the registered array, so its README update logic never executes.

#### UNW-040 · 🟠 HIGH — handleRateLimitFailover / applyRateLimitFailover never called — 429 provider failover is absent in FIX phase
- **Where:** `src/orchestra/mid-sprint-adapter.ts`
- **What:** FIX phase uses only shouldReroute/applyReroute (sprint-phases.ts:2063); a 429-noted result never triggers fallback to an alternate provider — the task stays on the failed routing.

#### UNW-041 · 🟠 HIGH — MonitorAdapter + multi-agent pipeline fully dead — backend-agnostic monitoring and sequential pipeline unused
- **Where:** `src/orchestra/monitor-adapter.ts`
- **What:** createMonitorAdapter and DockerMonitorAdapter/TmuxMonitorAdapter/SubprocessMonitorAdapter have zero callers; output-collector.ts duplicates the capture logic. definePipeline/runPipeline (multi-agent.ts) is also never imported, leaving SharedContext reachable only through dead code.

#### UNW-042 · 🟠 HIGH — PatternReader/PatternRecorder dead — .brain/learning data written but never consumed
- **Where:** `src/orchestra/pattern-reader.ts`
- **What:** Neither class is imported in production; OutcomeTracker (.deckent/routing/) is the parallel live system. getSuccessfulCombinations/getFailedCombinations/queryPatterns never run; any data PatternRecorder writes to .brain/learning accumulates and is never read.

#### UNW-043 · 🟠 HIGH — Four zero-config planner functions never wired — plan-time ground-truth audit & scope validation are dead
- **Where:** `src/orchestra/planner.ts`
- **What:** callZeroConfigPlanner/auditPlanGroundTruth/validateGoCriteriaScope/buildZeroConfigFallbackPlan (lines 675-865) have zero callers; sprint-planner.ts imports only callBrainPlanner(WithReason), so stale agent-count claims and missing test-dir scope are never caught at plan time.

#### UNW-044 · 🟠 HIGH — runPostSprintSmoke / post-sprint-smoke phase never fires — Sprint-181 verify-task race fix is inactive
- **Where:** `src/orchestra/post-sprint-smoke.ts`
- **What:** classifyVerifyTasks/shouldTriggerPostSprintSmoke/runPostSprintSmoke are re-exported via sprint-reporter.ts but never called by finalizer/phases/controller; defaultSmokeRunner is also a no-op stub returning passed:true.

#### UNW-045 · 🟠 HIGH — applyProofOfFunctionGate / verifyProofOfFunction never called — ADR-079 Tier-1 gate never fires
- **Where:** `src/orchestra/proof-of-function.ts`
- **What:** Tier-1 DONE tasks are never re-run host-side; result-evaluator.ts:49 only re-exports verifyProofOfFunction. sprint-phases/controller/finalizer never invoke the gate, so every Tier-1 DONE self-assessment passes without real-binary verification.

#### UNW-046 · 🟠 HIGH — applyTechDebtDowngrade has zero callers — verify-delta Brain Layer-2 downgrade is dead (reported 2×)
- **Where:** `src/orchestra/result-evaluator.ts`
- **What:** Workers write .verify-delta.json (worker-lifecycle.ts:342) but the EVALUATE phase never reads it nor calls applyTechDebtDowngrade (def line 1425); a worker claiming DONE at 39% completion passes undetected.

#### UNW-047 · 🟠 HIGH — ResultMerger class has zero callers — cross-worker file-write collision merge/dedup is dead
- **Where:** `src/orchestra/result-merger.ts`
- **What:** mergeResults()/detectOverlaps() (lines 30-100) are never imported by result-collector/sprint-phases; multi-worker result deduplication never runs. Related: class-based ConflictResolver (conflict-resolver.ts:25-148) is likewise dead, superseded by plan-time detectScopeCollisions.

#### UNW-048 · 🟠 HIGH — enforceSelfModifyingTask has zero callers — ADR-039 self-modify enforce/advisory decision never runs
- **Where:** `src/orchestra/self-modifying-detector.ts`
- **What:** The enforce-mode decision point (def line 201) and its self_mod_enforce config knob are never invoked; only isSelfModifying/isSelfModifyingSprint are wired, so the block decision has no effect and SelfModEnforceResult is dead.

#### UNW-049 · 🟠 HIGH — sprint-estimator.ts entire module never imported — duration/complexity/parallelism estimation is dead
- **Where:** `src/orchestra/sprint-estimator.ts`
- **What:** 278-line module (estimateSprintDuration/estimateSprintFull/writeEstimateToDashboard/scoreTaskComplexity/...) has no importer anywhere; the wire-point into sprint-phases/controller was never added.

#### UNW-050 · 🟠 HIGH — runHonestyCheck stub + writeHonestCiBaseline have zero callers — honesty/CI-baseline guards bypassed
- **Where:** `src/orchestra/sprint-finalizer.ts`
- **What:** runHonestyCheck (line 156) is a 'Task 5 TODO' stub returning 0 and is never called; the real path uses runSelfAuditGate+containsHonestyTrigger inline. writeHonestCiBaseline (sprint-docs-updater.ts:267), the suspicious-0-pass CI-baseline guard, also has zero callers.

#### UNW-051 · 🟠 HIGH — Six sprint-retro telemetry functions exported but never rendered in retro output
- **Where:** `src/orchestra/sprint-reporter.ts`
- **What:** collectLivenessStats, collectDeferredStats, collectPromptEvolutionSuggestion, collectSpecializationDriftReports (and their build* siblings, lines 210-453) are never imported by sprint-retro-writer/finalizer despite comments claiming they are wired to RETRO; operators never see these diagnostics. Subsumes the SpecializationDriftDetector and prompt-evolution-retro findings.

#### UNW-052 · 🟠 HIGH — applyPersonaDomainCheck + inferFixMode never called — persona rotation and FIX idempotency mode never compute
- **Where:** `src/orchestra/task-builder.ts`
- **What:** applyPersonaDomainCheck (line 1572, 'wire point for sprint-planner Sprint-197' never inserted) means HIGH-mismatch agent rotation never fires; inferFixMode (line 1619) is never called so CreateTaskParams.fixMode (verify-only/amend/re-implement) is never populated. validateGroundTruthClaims (line 553) similarly unwired.

#### UNW-053 · 🟠 HIGH — task-retry.ts module fully dead — result-evaluator reimplements retry inline with divergent constants
- **Where:** `src/orchestra/task-retry.ts`
- **What:** No production importer; result-evaluator.ts:1822 has its own CascadeDecision.shouldRetry logic, so MAX_RETRY_COUNT=2 and 30s second-retry backoff are never applied — a parallel, silently-divergent implementation.

#### UNW-054 · 🟠 HIGH — TimeoutWatcher module fully dead — superseded by sprint-phases evaluateRuntimeExtension
- **Where:** `src/orchestra/timeout-watcher.ts`
- **What:** TimeoutWatcher/createTimeoutWatcher/workerIdToTaskId/parseGitDiffStatLines have zero callers; the live timeout-extension logic lives in sprint-phases.ts (Sprint-191) and the old Sprint-145 module was never removed.

#### UNW-055 · 🟡 MEDIUM — DecisionOrchestrator V1 pipeline never instantiated — entire decision-engine/decision-steps/decision-replay island is dead
- **Where:** `src/orchestra/decision-engine.ts`
- **What:** Self-documented deprecated since Sprint-066; no 'new DecisionOrchestrator' in production. executeAgentStep, executeScopeStep, replayDecision, diffDecisions are transitively unreachable — superseded by routeTaskV2 but never deleted ('do not delete without ADR update', no ADR filed).

#### UNW-056 · 🟡 MEDIUM — recordCrossVerifyVerdict never called — cross-verify REFUTED signals never reach routing (reported 2×)
- **Where:** `src/orchestra/outcome-tracker.ts`
- **What:** EVALUATE phase (sprint-phases.ts:1558) emits a CROSS_VERIFY_REFUTED event that nothing consumes, but never calls recordCrossVerifyVerdict (def line 246); refuted agents/skills are never penalized in routing — the XVER-1 learning loop is structurally dead.

---

## Dormant Features (defined but never read / no-op gates)

_137 confirmed findings._

**Synthesis:** This category exposes a systemic pattern: deckent's config schema, type system, and feature scaffolding consistently outrun their runtime wiring. The dominant failure mode is the "optional-parameter never passed by the production caller" anti-pattern — a feature is implemented behind an optional DI slot or third constructor/function argument, but every composition root omits it, so the gate defaults to off (capability least-privilege, denial audit, policy/risk engine, plugin signature, strict tenant isolation, coverage validation, proof-of-function, rollback policy, runtime-extension config). The second dominant pattern is "config knob with no read side" — dozens of fields are declared in config-types.ts, defaulted in config.ts, validated, and rendered in the dashboard/CLI, yet no orchestration path ever consults them (telemetry_*, cost_optimization, boundary_enforcement, collaboration, learning, min/max_tier, auto_upgrade/downgrade, notifications, output_render_mode, multi_ide_mode). Several behavior-controlling flags (autonomous.engine='v2', native_cost_ceiling_usd, mcp_client_enabled) are read only via unsafe `as` casts because they were never added to the typed schema, making them invisible and effectively unreachable in shipped configs. The security blast-radius is the most concerning: tenant-isolation, RBAC enforcement, least-privilege, denial auditing, the HMAC audit chain, and the autonomous policy/risk gate are all dormant, meaning enterprise security controls users believe are active are silent no-ops. A recurring sub-pattern in the nervous and detector subsystems is "producer half never built" — detectors read event-payload fields (lastUserActivity, notificationsSent, SCOPE_COLLISION) or quiet-hours/idle-throttle gates that no emitter or call-site ever populates. The findings are corroborated by an unusual density of self-incriminating in-code comments ("not yet wired", "type-only follow-up", "unwired here", "not yet implemented", "future use") confirming these are deferred-then-forgotten integration steps, not design intent.

### Top findings (121, deduped)

#### DOR-001 · 🔴 CRITICAL — DeriveRequestPrincipalOptions.authGateVerified / claimsVerified never set in production
- **Where:** `src/api/auth-me-endpoint.ts:82-96,120`
- **What:** All 6 deriveRequestPrincipal call sites use default opts; every principal has claimsVerified absent, defeating the verified-vs-unverified-JWT defense-in-depth signal.

#### DOR-002 · 🔴 CRITICAL — enforce_least_privilege never reaches createAuditedCapabilityRegistry — least-privilege gate permanently off
- **Where:** `src/core/capability-runtime.ts:74,106`
- **What:** Both production callers (runtime-loop.ts:314, process-runtime.ts:46) omit the 3rd config arg, so leastPrivilegeEnabled stays false; setting enforce_least_privilege:true has no effect.

#### DOR-003 · 🔴 CRITICAL — autonomous.engine='v2' flag untyped, no default, absent from all shipped configs — v2 engine dormant by default
- **Where:** `src/orchestra/autonomous/mission-store/mission-engine-wire.ts:27-29`
- **What:** isV2Engine reads engine via off-type cast; config-types.ts has no engine field and config.ts sets no default, so SqliteMissionStore/MissionScheduler/goal-loop are unreachable unless a user hand-injects an untyped JSON key.

#### DOR-004 · 🔴 CRITICAL — rollback_policy config field defined/validated/documented but its value is never read — rollback hardcoded to opts.rollback
- **Where:** `src/orchestra/sprint-controller.ts:870`
- **What:** rollbackEnabled = opts?.rollback !== false; config.rollback_policy ('never'|'on_failure'|'always') is never consulted, so setting it has zero behavioral effect (duplicate-confirmed across two evidence passes).

#### DOR-005 · 🟠 HIGH — ComposeOptions.lang accepted by composeSystemPrompt but never used — system prompt always Turkish IMMUTABLE_CORE
- **Where:** `src/agent/identity.ts:34`
- **What:** lang is threaded through three call layers but the body uses only opts.cwd; the immutable safety instructions stay hardcoded Turkish regardless of user language.

#### DOR-006 · 🟠 HIGH — PromptVersion.stats permanently {uses:0,successRate:0} — updateVersionStats has zero callers
- **Where:** `src/agents/prompt-version.ts:44,132-147`
- **What:** stats is read by collectMetrics/rollback/evolution and surfaced via evolution-endpoint, but never written after creation, so dashboards/API present permanently false metrics.

#### DOR-007 · 🟠 HIGH — Autonomous backlog strictTenantIsolation permanently off — opts/req never passed at server.ts call sites (ENT-2)
- **Where:** `src/api/autonomous-endpoint.ts:159`
- **What:** server.ts:820 and :861 pass only 4 positional args (no req, no opts), so the backlog tenant filter never activates and all tenants' entries are returned regardless of strict_tenant_isolation config.

#### DOR-008 · 🟠 HIGH — Terminal audit HMAC chain never wired — TerminalAudit built with no-op sink and no integrity config
- **Where:** `src/api/server.ts:1458-1459`
- **What:** new TerminalAudit(auditSink) with a no-op insert and no AuditIntegrityConfig; the chain-aware path (audit.ts:74) is never taken, no audit rows persist, and verifyAuditChain always sees zero rows.

#### DOR-009 · 🟠 HIGH — OutboundLimiter never instantiated or wired into attachTerminalGateway — per-tenant outbound byte quota unenforced
- **Where:** `src/api/terminal/outbound-limiter.ts`
- **What:** server.ts:1608 omits the limiter field; ws-gateway.ts:24 limiter is always undefined, so the 24h outbound quota (invariant I5) is silently unenforced — a tenant can stream unlimited PTY output.

#### DOR-010 · 🟠 HIGH — switchProvider option loop-handled but never passed by any production caller
- **Where:** `src/cli/commands/chat-native.ts:334,585`
- **What:** entry.ts:669 never passes switchProvider, so /provider <name> in the legacy readline REPL confirms 'switched' but never rebuilds the adapter — requests keep going to the old provider.

#### DOR-011 · 🟠 HIGH — deckent chat --local flag defined but immediately errors 'not yet wired' (since Sprint 190)
- **Where:** `src/cli/commands/chat.ts:380,401-406`
- **What:** The flag appears in help and ChatOptions but its handler prints an error and exits 1 — a permanently-failing CLI option.

#### DOR-012 · 🟠 HIGH — deckent cost estimate subcommand documented in file header but never registered
- **Where:** `src/cli/commands/cost.ts:8,214`
- **What:** registerCostCommand registers only show/update/budget; no command('estimate') exists, so the documented interface diverges from the implemented one.

#### DOR-013 · 🟠 HIGH — rbac CLI grant/revoke writes an in-memory Map never read by the enforcement system
- **Where:** `src/cli/commands/rbac.ts:15,77,92`
- **What:** userRoles Map is set/deleted by the CLI but core/rbac.ts can() uses only the static PERMISSION_MATRIX and never imports it; every grant/revoke is a no-op, prints GRANTED/REVOKED with no access change, and resets each invocation.

#### DOR-014 · 🟠 HIGH — --auto-approve CLI option on deckent run silently ignored — always forced to true
- **Where:** `src/cli/commands/run.ts:249,257`
- **What:** const autoApprove = true; immediately overwrites opts.autoApprove, so the advertised flag is a ghost option with no behavioral effect.

#### DOR-015 · 🟠 HIGH — Provider cache read path is a no-op — bootstrapProviders runs unconditionally in both branches
- **Where:** `src/cli/commands/start.ts:200-205`
- **What:** Both the fresh and stale branches call bootstrapProviders(config) identically; cached registered/defaultProvider are never used to short-circuit, so the 1h TTL cache never reduces latency.

#### DOR-016 · 🟠 HIGH — mcp_client_enabled config flag absent from DeckentConfig and never read in the live REPL
- **Where:** `src/cli/repl/mcp-bridge.ts:51,79`
- **What:** Defined only in a local interface; not in config-types, and run.tsx never calls isMcpClientEnabled/initReplMcpBridge (chat-native gates on server-presence instead), so the flag is permanently dormant.

#### DOR-017 · 🟠 HIGH — native_cost_ceiling_usd read via cast but absent from config schema — stripped by typed merge
- **Where:** `src/cli/repl/run.tsx:204`
- **What:** loadConfig's typed resolved object omits the field, so a user-set value in config.json is dropped and costCeilingUsd is always undefined; only the DECKENT_NATIVE_COST_CEILING env path works (consolidates two run.tsx evidence passes).

#### DOR-018 · 🟠 HIGH — ConnectorConfig.webhookUrl and .options fields defined but never read by any connector
- **Where:** `src/connectors/types.ts:121-123`
- **What:** Discord/Telegram run bot-polling and read only enabled/token; webhookUrl/options have zero readers, so setting them has no effect.

#### DOR-019 · 🟠 HIGH — denialAudit option never passed to createAuditedCapabilityRegistry — CAPABILITY_DENIED events never written
- **Where:** `src/core/capability-runtime.ts:111`
- **What:** Neither production caller passes denialAudit, so registry.emitDenied is always undefined and denied capability invocations leave no audit trail.

#### DOR-020 · 🟠 HIGH — DeckentConfig.notifications (webhook/slack/discord URLs) never read to wire providers
- **Where:** `src/core/config-types.ts:247`
- **What:** notify-bootstrap.ts never reads config.notifications.*; the new pipeline dropped the config-reading step, so operator-set notification URLs are no-ops.

#### DOR-021 · 🟠 HIGH — boundary_enforcement config flag never read at runtime — auditor boundary check fires unconditionally
- **Where:** `src/core/config-types.ts:248,863`
- **What:** No monitor/orchestra path reads config.boundary_enforcement, so setting it false has no effect; the ADR-037 advisory warn is unconditional.

#### DOR-022 · 🟠 HIGH — cost_optimization config flag defined/validated but never read — no provider cost-ranking logic
- **Where:** `src/core/config-types.ts:275`
- **What:** Documented as 'select cheapest capable provider' but no routing or model-selection code consults it; setting cost_optimization:true changes nothing.

#### DOR-023 · 🟠 HIGH — DeckentConfig.output_render_mode config field never read — only the transient CLI/MCP flag controls render mode
- **Where:** `src/core/config-types.ts:294`
- **What:** resolveOutputMode callers pass opts.mode / MCP param, never config.output_render_mode; the persistent config knob is a documented but inert option.

#### DOR-024 · 🟠 HIGH — telemetry_enabled/telemetry_anonymous config flags never read — no telemetry code exists; TELEMETRY_ENABLED hardcoded false
- **Where:** `src/core/config-types.ts:343-347`
- **What:** Defaulted, validated, and shown in the dashboard, but observability.ts:57 const TELEMETRY_ENABLED=false is the only gate and never reads config; toggling has zero effect (consolidates config-types/debug-log/telemetry/observability evidence).

#### DOR-025 · 🟠 HIGH — daily_max_usd / monthly_max_usd / alert_thresholds settable and displayed but never enforced as a spending gate
- **Where:** `src/core/cost-config-loader.ts:72-82`
- **What:** evaluateCostGate reads only sprint_max_usd; there is no cross-sprint USD ledger, so daily/monthly caps and alert thresholds never block — ten $2 sprints under a $5 daily cap proceed.

#### DOR-026 · 🟠 HIGH — LearningConfig fields never passed from config to OutcomeTracker constructor
- **Where:** `src/core/decision-config.ts:22-25`
- **What:** All 4 production new OutcomeTracker sites use single-arg; config.learning is never propagated, so minSamplesForBonus/recencyBonus/penalty always fall back to hardcoded defaults regardless of config.

#### DOR-027 · 🟠 HIGH — CollaborationConfig (sharedMemoryEnabled/parallelPipelines/conflictStrategy) never read at runtime
- **Where:** `src/core/decision-config.ts:29-33`
- **What:** Defined with meaningful defaults and exposed via config-types.ts:245, but zero production reads — disabling parallelPipelines or changing conflictStrategy has no effect.

#### DOR-028 · 🟠 HIGH — DECKENT_SMTP_* / DECKENT_DB_URL / DECKENT_TELEMETRY_ID listed as known .deck keys but never consumed
- **Where:** `src/core/deck-file.ts:11-21`
- **What:** Recognized in KNOWN_DECK_KEYS and emitted in the createDeck template (implying SMTP email works) but no provider/connector/api code reads them — pure scaffolding.

#### DOR-029 · 🟠 HIGH — EnterpriseConfig schema (parse/merge/defaults) fully dormant — never called in production
- **Where:** `src/core/enterprise-config.ts:33-117`
- **What:** parseEnterpriseConfig/mergeEnterpriseConfig/ENTERPRISE_CONFIG_DEFAULTS have zero production callers; tenancy/rbac/flow sub-configs are test-only — live code uses separate ResolvedConfig fields.

#### DOR-030 · 🟠 HIGH — strictTenantIsolation never wired into any production new MemoryStore() call
- **Where:** `src/core/memory-store.ts:88-90`
- **What:** All 50 production new MemoryStore(dbPath) sites omit the options object; config.ts:1494 resolves strict_tenant_isolation but never threads it, leaving the documented NULL-tenant cross-tenant leak (lines 679-740) always active.

#### DOR-031 · 🟠 HIGH — MemoryQueryParams.min_score documented but never applied in ftsSearch
- **Where:** `src/core/memory-types.ts:204`
- **What:** min_score is never destructured in memory-query.ts; relevance=Math.abs(row.rank) is never filtered against a threshold, so callers passing min_score silently get all results.

#### DOR-032 · 🟠 HIGH — ModelStrategy.auto_upgrade / auto_downgrade stored in config but never read at runtime
- **Where:** `src/core/mode-presets.ts:23-26`
- **What:** Faithfully resolved by config but no orchestra/providers/mcp code branches on these booleans, so tier auto-scaling never occurs.

#### DOR-033 · 🟠 HIGH — ModelRegistry.unregister() exported but never called on the model registry
- **Where:** `src/core/model-registry.ts:407`
- **What:** No modelRegistry.unregister call exists in src/; the only .unregister hit targets a CapabilityRegistry, so the method is dead API on the singleton registry.

#### DOR-034 · 🟠 HIGH — plugin_require_signature config knob never forwarded to loadPluginHooks — signature gate defaults to false
- **Where:** `src/core/plugin-hooks.ts:217,226`
- **What:** sprint-controller.ts:876 calls loadPluginHooks(projectRoot) with no options, so securityConfig is undefined, validatePluginSecurity is never invoked, and require_signature silently defaults off.

#### DOR-035 · 🟠 HIGH — ProviderFailureSummary.auth and .oom computed but never read — FIX wave ignores auth/OOM failure kind
- **Where:** `src/core/provider-failure-classifier.ts:130-133`
- **What:** The only caller (sprint-phases.ts:1982) branches on skipFix/usageLimitRatio only; auth/OOM are counted but never alter FIX behavior, so FIX re-runs futilely against an invalid key.

#### DOR-036 · 🟠 HIGH — RoutingDecision.contextFit computed on every routeTaskV2 but never consumed
- **Where:** `src/core/routing-engine.ts:418,430`
- **What:** assessContextFit runs and emits reasoning, but no planner/runner reads the contextFit field, so 'OVERFLOW — consider splitting' guidance never triggers any behavior.

#### DOR-037 · 🟠 HIGH — Connector.healthCache populated but never read; getAvailableProviders ignores it despite docstring
- **Where:** `src/core/session-interface.ts:107,116-121`
- **What:** healthCache has set/delete/clear but no get(); getAvailableProviders returns all registered providers unfiltered, contradicting its 'uses cached health results' docstring — write-only dead storage.

#### DOR-038 · 🟠 HIGH — computeBackoff always receives null RateLimitState — rate-limit-aware backoff path permanently dead
- **Where:** `src/core/token-quota.ts:59-61`
- **What:** Both sprint-spawner.ts callsites pass null, so backoffMs is always 0 and only the static token_throttle_ms floor applies; the 429-aware dynamic backoff never activates.

#### DOR-039 · 🟠 HIGH — deckent_nervous_subscribe subscribers Set populated but never consumed — push dispatch is a no-op
- **Where:** `src/mcp/tools/nervous.ts:55,217`
- **What:** subscribers.add() is the only write; the Set is read only for a status count, never iterated to sendLoggingMessage, so the documented push-notification registration is dead.

#### DOR-040 · 🟠 HIGH — sandbox=true in MCP deckent_start silently does nothing — runSprint never reads sandboxMode
- **Where:** `src/mcp/tools/start.ts:237`
- **What:** sandboxMode flows into RunSprintOptions but sprint-controller.ts never reads opts.sandboxMode; the git-stash logic lives only in the CLI start.ts, so via MCP the flag is a no-op with no caller indication.

#### DOR-041 · 🟠 HIGH — isWorkerProcessAlive returns false for subprocess backend — stale-detection Signal B disabled for most deployments
- **Where:** `src/monitor/auditor.ts:127-135`
- **What:** subprocess PIDs aren't stored in the heartbeat, so Signal B is always false; non-docker/non-tmux deployments (CI/WSL/Windows) rely on Signal A alone and are uniquely prone to false-positive CRITICAL stale alerts.

#### DOR-042 · 🟠 HIGH — shouldDelay() quiet-hours enforcement implemented but never called in the live nervous pipeline
- **Where:** `src/nervous/decision-engine.ts:124`
- **What:** runPipeline goes decide()→dispatch() with no shouldDelay guard, so nervous_system.quiet_hours (default 22:00-08:00) never suppresses notifications — they fire at any hour.

#### DOR-043 · 🟠 HIGH — NotificationDeliveryHealthDetector — NOTIFICATION_DELIVERY event and notificationsSent/Failed payload never emitted
- **Where:** `src/nervous/detectors/notification-delivery-health.ts:43`
- **What:** Both detection paths require data no producer emits (event type + cron payload fields), so the detector always returns null and notification-bridge health is unmonitored.

#### DOR-044 · 🟠 HIGH — TaskModeIdleDetector permanently inert — cron events never carry lastUserActivity
- **Where:** `src/nervous/detectors/task-mode-idle.ts:45-46`
- **What:** observer.ts:383 builds cron payloads as {intervalMs} only; no producer ever writes lastUserActivity, so detect() returns null on every tick.

#### DOR-045 · 🟠 HIGH — desktop notification channel config field defined/defaulted but structurally undispatchable
- **Where:** `src/nervous/dispatcher.ts:25,33,295`
- **What:** Channel union is mcp|cli|file (no desktop); selectChannels and pushToChannel have no desktop case, so channels.desktop:true delivers nothing — a misleading config option.

#### DOR-046 · 🟠 HIGH — AutonomousRuntimeConfig.tenantId passed but never read — audit entries left tenant-unlabeled
- **Where:** `src/orchestra/autonomous-runtime.ts:159,174`
- **What:** The config is shadowed as _config and never read; the AuditRecord built at line 261 omits tenantId regardless of what the caller provides.

#### DOR-047 · 🟠 HIGH — policyEngine DI slot never wired — F10-001/002 policy+risk gate permanently disabled
- **Where:** `src/orchestra/autonomous/execute-dispatcher.ts:138-148,260`
- **What:** Both prod composition roots (runtime-loop.ts:333, process-controller.ts:161) omit policyEngine, so the activation/condition/RBAC/risk-class gate is structurally unreachable; every autonomous entry bypasses all checks.

#### DOR-048 · 🟠 HIGH — fanOut field defined/validated/planned but never consumed at dispatch (v1 and v2 paths)
- **Where:** `src/orchestra/autonomous/goal-planner-types.ts:24`
- **What:** goal-planner emits fanOut:{over,concurrency} and it is validated/stored, but execute-dispatcher and mission-dispatch ignore it — a fanOut.concurrency=5 entry runs as a single serial task (merges backlog-types.ts:46 duplicate).

#### DOR-049 · 🟠 HIGH — native_skills_passthrough / useNativeSkills doubly dormant — config key absent and realizeCapabilities never called
- **Where:** `src/orchestra/capability-realizer.ts:58-67`
- **What:** native_skills_passthrough is not on ResolvedConfig and the only reader (realizeCapabilities) is never invoked, so .claude/skills are never injected into worker spawns.

#### DOR-050 · 🟠 HIGH — validateWorkerCoverage / parseCoverageFromVitest always receive undefined — coverage cross-check is dead
- **Where:** `src/orchestra/coverage-validator.ts:307`
- **What:** Every evaluateWithRubric callsite passes vitestJsonOutput=undefined, so the system degrades to 'trusting self-reported coverage' on every evaluation; workers can self-report any number.

#### DOR-051 · 🟠 HIGH — verifyProofOfFunction / applyProofOfFunctionGate / runPostSprintSmoke never called in sprint lifecycle (ADR-079)
- **Where:** `src/orchestra/proof-of-function.ts`
- **What:** The Tier-1 gate is only re-exported (result-evaluator.ts:49, sprint-reporter.ts:97); neither sprint-phases nor sprint-finalizer invokes it; PROOF_OF_FUNCTION_CRITERION has weight 0 and is never evaluated.

#### DOR-052 · 🟠 HIGH — SelfModEnforceResult.mode 'enforce' is dead scaffolding — RBAC layer always soft, enforceSelfModifyingTask uncalled
- **Where:** `src/orchestra/self-modifying-detector.ts:237-243`
- **What:** enforceSelfModifyingTask has zero callers and authority-enforcer is permanently soft mode; self_mod_enforce config has zero runtime effect, so a self-modifying task for a user project is never blocked.

#### DOR-053 · 🟠 HIGH — getRuntimeExtensionMax / getAdaptiveMultiplier config knobs never consumed — hard constant RUNTIME_EXTENSION_MAX=3 governs
- **Where:** `src/orchestra/sprint-controller.ts:299`
- **What:** sprint-phases.ts:963 uses a hard-coded constant; the config-reading helpers have zero callers; an explicit TODO comment admits the wire-point was never replaced, so timeout.runtime_extension_max has no effect.

#### DOR-054 · 🟠 HIGH — sandboxMode option defined and passed but never read inside runSprint
- **Where:** `src/orchestra/sprint-controller.ts:597`
- **What:** sandboxMode appears only as the RunSprintOptions type field (line 597) and is never destructured/read in the function body; via MCP deckent_start sandbox=true is a no-op (only the CLI git-stash workaround works); config-types.ts:989 confirms 'not yet implemented'.

#### DOR-055 · 🟠 HIGH — sync_on_finalize doc-tracking knob permanently off — no default and no config sets it true (ADR-090)
- **Where:** `src/orchestra/sprint-finalizer.ts:579`
- **What:** The gate requires ===true, createDefaultConfig has no doc_tracking key, and no repo JSON sets it, so the implemented finalize sync hook (sync.ts) has never executed in production.

#### DOR-056 · 🟠 HIGH — history_scaling_enabled=true by default but SprintHistory is always zero-filled — historyFactor permanently 1.0
- **Where:** `src/orchestra/timeout-estimator.ts:119`
- **What:** Both emitTimeoutEvents callsites pass NO_SPRINT_HISTORY (avgTaskDurationMs:0), so the guard is never true and history-adaptive timeouts never apply despite the default-on flag.

#### DOR-057 · 🟠 HIGH — ClaudeAdapter 'mcp' backend schema-exposed but permanently blocked — all entry points throw/return false
- **Where:** `src/providers/claude.ts:130-131,219-221`
- **What:** claude_backend='mcp' is offered in the config schema, dashboard labels, and the type, but spawn() throws MCP_NOT_IMPLEMENTED and isAvailable returns false — a dead-end option (claude_backend itself deprecated Sprint 150).

#### DOR-058 · 🟠 HIGH — OllamaAdapter.complete()/stream() implemented but never called from production sprint or REPL paths
- **Where:** `src/providers/ollama.ts:443-528`
- **What:** The sprint path uses spawn() and the REPL uses a separate agent/provider-tooluse/ollama adapter, so these HTTP entry points on providers/ollama.ts are dead.

#### DOR-059 · 🟡 MEDIUM — OPENAI_BASE_URL env var never read — only config-file openai_base_url supported
- **Where:** `src/agent/provider-detect.ts:27`
- **What:** detection and native-transport read only config.openai_base_url; the standard OPENAI_BASE_URL env var (OpenAI SDK convention) is never consulted, so custom endpoints set that way silently fail.

#### DOR-060 · 🟡 MEDIUM — AgentSessionDeps.maxIterations wired through session/bridge but never supplied by run.tsx
- **Where:** `src/agent/session.ts:34,65`
- **What:** The only createNativeEngine call (run.tsx:205) omits maxIterations, so the native REPL loop always uses its built-in default — the per-session iteration cap is unconfigurable.

#### DOR-061 · 🟡 MEDIUM — SkillAdaptation.suggestRemove always [] — retro-writer drop-skills branch permanently dead
- **Where:** `src/agents/adaptive-agent.ts:295`
- **What:** The sole creator always emits suggestRemove:[], so sprint-retro-writer.ts:158's removal branch never executes and bloated skill lists cannot be auto-trimmed.

#### DOR-062 · 🟡 MEDIUM — ROLLBACK_SUCCESS_THRESHOLD/ROLLBACK_MIN_USES defined but evolvePromptCheckRollback has zero callers
- **Where:** `src/agents/prompt-rollback.ts:25-26`
- **What:** shouldRollback/rollbackPrompt are reached only via evolvePromptCheckRollback, which is never called in production, so the rollback thresholds are dead configuration.

#### DOR-063 · 🟡 MEDIUM — GET /api/nervous/status returns hardcoded detectors:[] and panicGuard:true — live state never read
- **Where:** `src/api/nervous-endpoint.ts:131-135`
- **What:** The endpoint never imports DetectorRegistry; detectors is an empty-array literal and panicGuard a literal true, so the dashboard NervousPage always shows zero detectors.

#### DOR-064 · 🟡 MEDIUM — AuditIntegrityConfig / HMAC chain in TerminalAudit never wired (api/terminal duplicate of server.ts no-op sink)
- **Where:** `src/api/terminal/audit.ts:28-31,74`
- **What:** The only new TerminalAudit callsite omits the integrity arg and passes a no-op sink, so the chain gate is never satisfied and audit-verify always finds zero chained rows.

#### DOR-065 · 🟡 MEDIUM — DECKENT_CHAT_MODE env var and config.chat.mode have no runtime effect — resolveChatMode never imported
- **Where:** `src/cli/commands/chat-mode.ts:36`
- **What:** chat-mode.ts has zero production importers, so enterprise-mode slash filtering never runs and the env var/config field are dormant knobs.

#### DOR-066 · 🟡 MEDIUM — createLineQueue exported but never called; DECKENT_PINNED_BAR controls a default-off dead pinned-bar path
- **Where:** `src/cli/commands/chat-render-region.ts:279`
- **What:** entry.ts uses its own inline line queue; createLineQueue is superseded, and createLineBufferedSink only activates under DECKENT_PINNED_BAR=1 which the comment admits 'does NOT truly pin the prompt'.

#### DOR-067 · 🟡 MEDIUM — --tenant option in deckent flow run declared but never used
- **Where:** `src/cli/commands/flow.ts:79-80`
- **What:** opts.tenant is never referenced in the action body; FlowRegistry is built without a tenant filter, so all tenants' flows always run regardless of the advertised filter.

#### DOR-068 · 🟡 MEDIUM — multi_ide_mode written at init but never read at runtime
- **Where:** `src/cli/commands/init-steps.ts:367-375`
- **What:** init writes multi_ide_mode:true and the dashboard shows a toggle, but no orchestration/routing path reads it, so it has no behavioral effect.

#### DOR-069 · 🟡 MEDIUM — deckent nervous undo journals a reversal record but dispatches no actual reversal to the executor
- **Where:** `src/cli/commands/nervous.ts:404-435`
- **What:** handleUndo only calls appendHistoryRecord with a rejected record and never signals the executor/IPC, so reversible actions are never reversed — audit-theater.

#### DOR-070 · 🟡 MEDIUM — DECKENT_WATCH_SPLIT env shuttle written/deleted but createWatchLayout hardcodes -p 40
- **Where:** `src/cli/commands/watch.ts:197-202`
- **What:** tmux.ts:397 hardcodes the 40% split and never reads the env var, so computeSplitRatio()'s dynamic ratio is discarded and the dashboard always splits at 40%.

#### DOR-071 · 🟡 MEDIUM — ConnectorId accepts whatsapp/slack/email at the webhook endpoint but has no handler — messages silently lost
- **Where:** `src/connectors/incoming-router.ts:141`
- **What:** server.ts:1091 validates against VALID_CONNECTORS (includes the three) and returns 200 ok, but connector-bootstrap SUPPORTED is only telegram/discord and no INCOMING_MESSAGE subscriber exists, so authenticated messages are accepted and dropped.

#### DOR-072 · 🟡 MEDIUM — SubscriptionTracking.method enum (cccost_interceptor/admin_api) defined but never functionally consumed
- **Where:** `src/core/cost-config-loader.ts:25,54-61`
- **What:** method is never branched on; the subscription quota estimate is a fixed heuristic ignoring the configured strategy — pure decoration.

#### DOR-073 · 🟡 MEDIUM — ModelStrategy.min_tier / max_tier stored in config but never enforced
- **Where:** `src/core/mode-presets.ts:20-22`
- **What:** No runtime selection reads the config-derived tier bounds; model-tier-guard uses its own TIER_RANK constants, so economic-mode tier capping never happens.

#### DOR-074 · 🟡 MEDIUM — NotificationDeliveryHealth/desktop dispatch duplicate — desktop channel field defined/defaulted but undispatchable
- **Where:** `src/core/notification-providers`
- **What:** The nervous desktop-channel dormancy recurs at the core notification layer: config.ts:1211 defaults channels.desktop:false but no Channel union member, selectChannels case, or adapter exists, so desktop is structurally dead end-to-end.

#### DOR-075 · 🟡 MEDIUM — HealthCheckResult.cliVersion always null — field is structurally hardcoded dead
- **Where:** `src/core/session-interface.ts:26,81,103`
- **What:** Both healthCheck paths set cliVersion:null and no code queries the CLI version, so the populated-or-null discriminator is permanently null (doctor sets its own field separately).

#### DOR-076 · 🟡 MEDIUM — InteractionMode (batch/interactive/streaming) defined and forwarded but never branched on
- **Where:** `src/core/work-model.ts:116,163`
- **What:** mode is threaded through execution-request-builder but no live code reads it off a request; the three modes never cause different execution paths and resolveInteractionPolicy is never called.

#### DOR-077 · 🟡 MEDIUM — Live log SSE tail silently disabled for tmux and subprocess backends — no UI indication
- **Where:** `src/dashboard/src/components/WorkerCard.tsx:167-170`
- **What:** useLiveLogTail is gated to backend==='docker' though the /api/output-stream endpoint is backend-agnostic and BACKEND_BADGE renders all three, so most deployments never see a live log tail.

#### DOR-078 · 🟡 MEDIUM — TranslatorProp is a literal alias of Translator — the type-split provides no compile-time distinction
- **Where:** `src/dashboard/src/i18n/types.ts:15-23`
- **What:** type TranslatorProp = Translator (the comment admits 'STRUCTURALLY IDENTICAL'), so the split is documentation-intent only with no enforcement, adding two import paths for no safety.

#### DOR-079 · 🟡 MEDIUM — NavItem.label escape-hatch field defined and threaded but never set — Sidebar/Layout fallback is dead
- **Where:** `src/dashboard/src/nav-items.ts:25`
- **What:** All nav items use labelKey; label is always undefined so the {label ?? t(labelKey)} branch always falls through to t(labelKey).

#### DOR-080 · 🟡 MEDIUM — Planned config fields (search_*/notify_*/telemetry_*/multi_ide_mode/output_theme) rendered in ConfigPage but never read
- **Where:** `src/dashboard/src/pages/ConfigPage.tsx:128-138`
- **What:** Ten 'Planned' fields have schema entries and defaults but no orchestra/api/cli/connector behavioral read, so saving them writes to config.json and drives nothing.

#### DOR-081 · 🟡 MEDIUM — Alert.acknowledged field defined client- and server-side but never set or read
- **Where:** `src/dashboard/src/types/index.ts:19`
- **What:** No UI acknowledges alerts and no filtering gates on it; the server never populates it (monitoring-types.ts:67 also defines it), so it is a definition-only dormant field.

#### DOR-082 · 🟡 MEDIUM — VS Code extension COMMAND_IDS handlers are permanent no-op stubs
- **Where:** `src/extensions/vscode/extension.ts:39,61-65`
- **What:** deckent.start/status/explain register empty arrow handlers ('// Stub — full implementation in Sprint 049'), so the commands are silently inert with no user feedback.

#### DOR-083 · 🟡 MEDIUM — 'usage' key in MCP enrich SUMMARIES/HINTS never triggered; audit/autonomous/process/recover keys missing
- **Where:** `src/mcp/helpers/enrich.ts:32-33,60`
- **What:** usage.ts never calls enrichResponse, so the usage entries are unreachable; conversely 19 enrichResponse calls for four tools have no SUMMARIES key and silently fall back to the generic string.

#### DOR-084 · 🟡 MEDIUM — lang hardcoded to 'en' in deckent_autonomous MCP tool — i18n bypass for user-facing errors
- **Where:** `src/mcp/tools/autonomous.ts:124`
- **What:** const lang='en' is passed to backlogAdd/Remove; the server-resolved config language is never forwarded, so tr-configured users get English backlog error messages.

#### DOR-085 · 🟡 MEDIUM — 'auto' parameter in deckent_init MCP tool accepted then discarded with 'void auto'
- **Where:** `src/mcp/tools/init.ts:73,79-80`
- **What:** The MCP init tool voids auto and runs no analyzeProject/getSystemProfile/detectSubscription (unlike the CLI), but echoes auto back in the response JSON, falsely implying it had effect.

#### DOR-086 · 🟡 MEDIUM — deckent_recover audit gate result collected but GATE_FAILURE never blocks recovery steps
- **Where:** `src/mcp/tools/recover.ts:32-113`
- **What:** Steps 2-4 (cleanOrphanIpcDirs/clearStaleLocks/postFinalizeCleanup) run unconditionally with no if (auditGate !== 'GATE_FAILURE') guard; the gate is informational only, offering no protection against recovering an active sprint.

#### DOR-087 · 🟡 MEDIUM — NervousObserver idleThrottleMultiplier hardcoded to 1 at both call sites — idle_throttle config never read
- **Where:** `src/nervous/bootstrap.ts:193`
- **What:** bootstrap passes literal 1 ('unwired here') and autonomous.ts uses the ctor default; observer.ts:368 short-circuits at <=1, so nervous_system.idle_throttle has no effect (merges observer.ts duplicate).

#### DOR-088 · 🟡 MEDIUM — risk_gate_enabled on NervousSystemConfig read via type-cast and request param never passed — double dormancy
- **Where:** `src/nervous/decision-engine.ts:83,112-113`
- **What:** The field is absent from NervousSystemConfig (read via cast) and bootstrap calls decide(result) with one arg, so the risk gate at line 83 never fires regardless of config.

#### DOR-089 · 🟡 MEDIUM — BuildFailureRecurrenceDetector disabled in production; markdown-heuristic analysis fragile when enabled
- **Where:** `src/nervous/detectors/build-failure-recurrence.ts`
- **What:** enabled:false in both default and project config; even if enabled, extractFailedFilesFromLog parses free-form markdown and the consecutive-count loop breaks on the first sprint missing the file.

#### DOR-090 · 🟡 MEDIUM — DeadEventStreamDetector disabled in default and project config despite 'aktif edildi' fix comment
- **Where:** `src/nervous/detectors/dead-event-stream.ts:7-8`
- **What:** config.ts:1225 and .deckent/config.json both set enabled:false and the registry gate skips it, so the 10-min event-stream-silence critical alarm never fires — contradicting the Sprint 165 re-activation comment.

#### DOR-091 · 🟡 MEDIUM — ScopeCollisionRateDetector's SCOPE_COLLISION event and sprintCollisionCount field never emitted
- **Where:** `src/nervous/detectors/scope-collision-rate.ts:34,64`
- **What:** No producer emits the literal 'SCOPE_COLLISION' type (the real channel uses a different string) or sprintCollisionCount payload, so the detector always returns null.

#### DOR-092 · 🟡 MEDIUM — nervous_system approve_timeout_attended_ms/unattended_ms documented in comments but not in any schema
- **Where:** `src/nervous/executor.ts:68-70`
- **What:** NervousSystemConfig has only approve_timeout_ms; the attended/unattended split is module-load-time via detectAttendedSession, so the two advertised keys are a false config affordance.

#### DOR-093 · 🟡 MEDIUM — Proposer severityMin read via unknown cast — absent from NervousSystemConfig, severity filter is a permanent no-op
- **Where:** `src/nervous/proposer.ts:144`
- **What:** severityMin is never declared or set by any config layer, so minSeverity is always undefined and passesSeverityFilter lets all severities through.

#### DOR-094 · 🟡 MEDIUM — selectRelevantAdrs hardcodes currentSprintNum=146 while project is on sprint-310 — ADR age scoring systematically wrong
- **Where:** `src/orchestra/adr-selector.ts:314`
- **What:** All three callers rely on the frozen default; ADRs after sprint 146 compute negative ages discarded by the age<=0 guard, so age-penalty scoring is incorrect for all newer ADRs.

#### DOR-095 · 🟡 MEDIUM — autonomous.engine / per_tenant_pool_size read via off-type cast — type-invisible runtime toggles
- **Where:** `src/orchestra/autonomous/mission-store/mission-engine-wire.ts:27-29,86`
- **What:** Both behavior-controlling fields are read via (config.autonomous as Record<string,unknown>) because the type-only follow-up acknowledged in the code comment was never executed.

#### DOR-096 · 🟡 MEDIUM — WorkItem.dependsOn stored and typed but never enforced by the scheduler
- **Where:** `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:20,106`
- **What:** queryDue SQL has no predecessor-done check and mission-scheduler never reads dependsOn, so declared dependencies execute out-of-order/in-parallel silently.

#### DOR-097 · 🟡 MEDIUM — ReactiveRule.dedupKey defined but never read — ingester dedups on title only
- **Where:** `src/orchestra/autonomous/reactive/reactive-types.ts:32`
- **What:** makeReactiveIngester dedups on entry.title and never consults rule.dedupKey, so a per-rule dedup override set in reactive-map.json is silently ignored.

#### DOR-098 · 🟡 MEDIUM — reactiveSource slot in BuildEngineRuntimeOptions never supplied — branch permanently dead
- **Where:** `src/orchestra/autonomous/runtime-loop.ts:173,392`
- **What:** The sole caller (autonomous.ts:587) routes reactive sources through the ingester instead, so if (opts.reactiveSource) sources.push(...) is never executed in production.

#### DOR-099 · 🟡 MEDIUM — DECAY_EXEMPT set is @deprecated and consulted by no production code
- **Where:** `src/orchestra/debt-manager.ts:569-578`
- **What:** Memory V2 enforces decay exemption by entry type; the path-based set has zero production reads (tests only) — misleading dead API surface.

#### DOR-100 · 🟡 MEDIUM — SpawnDecision 'replan'/'continue' variants can never be produced — sole factory always returns 'block'
- **Where:** `src/orchestra/decision-engine.ts:61-70,82-88`
- **What:** handleScopeCollision returns 'block' unconditionally and both consumers only handle 'block', so any future 'replan'/'continue' would be silently no-oped.

#### DOR-101 · 🟡 MEDIUM — sprintMetricsUpdater.usageData read via unsafe cast — field absent from SprintResult, branch always false
- **Where:** `src/orchestra/doc-updaters/metrics-updater.ts:70-73`
- **What:** usageData is read via `as unknown as Record` to bypass the type checker; SprintResult has no such field so the README usage-update branch is permanently dead (and the updater itself is unregistered).

#### DOR-102 · 🟡 MEDIUM — DocUpdateContext.store never populated on the sprint finalize path — managed-docs always show 'no history'/'no debt'
- **Where:** `src/orchestra/doc-updaters/types.ts:12-13`
- **What:** The standalone CLI path passes store but sprint-docs-updater.ts builds ctx without it, so content-generators fall back to no-data strings during live sprint doc updates despite rich DB data.

#### DOR-103 · 🟡 MEDIUM — DocUpdater.tier field set on every updater but never read by runAllUpdaters
- **Where:** `src/orchestra/doc-updaters/types.ts:29`
- **What:** registry.ts maps updaters with no sort/filter/branch on tier; shouldRun reads config string keys directly, so tier is write-only dead data.

#### DOR-104 · 🟡 MEDIUM — test-coverage content generator's coveragePercent.toFixed(1) has no NaN guard unlike its sibling
- **Where:** `src/orchestra/managed-docs/content-generators.ts:353`
- **What:** The sprint-metrics generator guards with Number.isFinite but the test-coverage section does not, so NaN renders 'NaN%' and noGoRate applies *100 without a finite guard.

#### DOR-105 · 🟡 MEDIUM — PromptEvolutionResult output computed but never read by any retro renderer
- **Where:** `src/orchestra/prompt-evolution.ts:133`
- **What:** collectPromptEvolutionSuggestion has zero production callers and sprint-retro-writer.ts has no PromptEvolution reference; the evolved prompt with SUCCESS/FAILURE hints is generated then discarded.

#### DOR-106 · 🟡 MEDIUM — resource_monitor only samples Docker — completely dormant for tmux/subprocess backends
- **Where:** `src/orchestra/resource-monitor.ts:114`
- **What:** createAndStartResourceMonitor has no backend guard and runs docker stats unconditionally; on non-Docker backends every tick yields 0 records and deckent resources shows empty.

#### DOR-107 · 🟡 MEDIUM — TimeoutWatcherConfig fields (max_extensions/heartbeat_freshness_seconds/min_diff_lines) absent from config schema
- **Where:** `src/orchestra/timeout-watcher.ts:22-26`
- **What:** The fields are not in config-types.ts and TimeoutWatcher is never instantiated in production, so these knobs are unreachable; live extension policy uses different sprint-phases constants.

#### DOR-108 · 🟡 MEDIUM — BedrockAdapter.send() and Claude cache-control helpers exported with zero production callers
- **Where:** `src/providers/claude.ts:465-576`
- **What:** CACHE_CONTROL_EPHEMERAL/parseCacheUsage/attachCacheControlToMessages and BedrockAdapter.send() have no production consumers ('wired by future API-mode adapters') — dead public surface.

#### DOR-109 · 🟡 MEDIUM — GeminiAdapter/CodexAdapter REST and diagnostic methods exported with zero production callers
- **Where:** `src/providers/gemini.ts:513-683`
- **What:** buildApiScript/buildStreamingApiScript (self-@deprecated), getStreamingEndpoint/getEndpoint, validateApiKey, getCliVersion, and codex detectCliVariant are dead public API surface.

#### DOR-110 · ⚪ LOW — AgenticTokenUsage.cost always 0 and structurally dropped before reaching Brain
- **Where:** `src/agents/agentic-worker-runner.ts:98,304`
- **What:** EntryTokenUsage has no cost field so buildResultFromRunner never copies it; the cost:0 placeholder reaches no budget/cost-guard consumer.

#### DOR-111 · ⚪ LOW — writeFinishedHeartbeat deprecated wrapper exported with no callers
- **Where:** `src/agents/worker.ts:516-519`
- **What:** The @deprecated shim delegates to finalizeHeartbeat but no production module imports it — dead API surface from the Sprint 144 god-object split.

#### DOR-112 · ⚪ LOW — debounceMs <=250 upper-bound documented but never enforced
- **Where:** `src/api/worker-logs.ts:50-51,97`
- **What:** No clamp/assert bounds debounceMs; a caller passing 5000 creates a 5s debounce with no error — documentation-only constraint (mirrored from live-events.ts).

#### DOR-113 · ⚪ LOW — PRE_EXECUTION_STATUSES exported but never imported — auditor lacks an explicit pre-execution suppression guard
- **Where:** `src/core/heartbeat-types.ts:33`
- **What:** auditor.ts imports only ACTIVE/COMPLETED status sets; PRE_EXECUTION_STATUSES is never consulted, so pre-execution tasks are handled by absence-of-match rather than intentional suppression.

#### DOR-114 · ⚪ LOW — useApi unconditionally instantiates a disabled useLiveData on every render for non-polling callers
- **Where:** `src/dashboard/src/hooks/useApi.ts:26-32`
- **What:** useLiveData runs with enabled:false on every render for all callers lacking pollIntervalMs, registering no-op hook slots — premature generalization for a single polling page.

#### DOR-115 · ⚪ LOW — NOTIFICATION_ID_PATTERN ns- branch matches an ID prefix never produced in production
- **Where:** `src/mcp/tools/nervous.ts:90-93`
- **What:** isValidNotificationId accepts ns-* as a bypass but no source emits that prefix (IDs are UUID v4), so an ns- id passes validation then silently fails the IPC/history lookup.

#### DOR-116 · ⚪ LOW — AgentRoutingAnomalyDetector (80% ADR-041) disabled in production config
- **Where:** `src/nervous/detectors/agent-routing-anomaly.ts`
- **What:** enabled:false in default and project config; only the 40% AgentRoutingHealth detector runs, so the higher-severity SPAWN-phase early warning is silently missing.

#### DOR-117 · ⚪ LOW — queryDue _now parameter always ignored — time-based due filtering is a no-op
- **Where:** `src/orchestra/autonomous/backlog.ts:76`
- **What:** queryDue returns all pending entries with zero reference to the passed clock() value, so any future caller expecting time-gated due evaluation gets all-pending instead.

#### DOR-118 · ⚪ LOW — validateReactiveRule exported but has zero production callers outside its own file
- **Where:** `src/orchestra/autonomous/reactive/reactive-map.ts:13`
- **What:** Used only internally by loadReactiveMap and in tests; the export signals programmatic per-rule validation that no production module performs — minor surface inflation.

#### DOR-119 · ⚪ LOW — todoMarkers/TodoMarker/todoToEntry half of WorkGeneratorInput never populated — no production TODO scanner
- **Where:** `src/orchestra/autonomous/work-generator.ts:15-24,55-70`
- **What:** The only generateWorkCandidates caller passes only debtRecords; an in-code comment confirms TODO/FIXME markers have no production scanner, so todoToEntry is dead in production.

#### DOR-120 · ⚪ LOW — partialResultExists L5 liveness signal computed but excluded from the liveVote decision
- **Where:** `src/orchestra/worker-liveness.ts:95,134-142`
- **What:** partialResultExists is set but not in liveVote (only docker/heartbeat/log), so a worker with a written partial result but stale heartbeat/log is classified not-alive despite progress.

#### DOR-121 · ⚪ LOW — queryDue _now / CORE4 private map — minor enumeration/no-op gaps in autonomous and training pipelines
- **Where:** `src/training/cc-trace-extractor.ts:12-17`
- **What:** CORE4 (CC core-4 tool name map) is module-private and only point-lookup is exposed, so extract-traces.mjs cannot enumerate mappable names without re-implementing the list — low-severity API design gap.

---

## Dead / Non-Functional Tests

_12 confirmed findings._

**Synthesis:** deckent's test suite contains a recurring class of tests that pass while validating nothing real: they exercise dead production code, mock the unit-under-test's core dependency so completely that only the mock is asserted, assert against source-text strings instead of behavior, or feed synthetic data shaped to a defunct/incompatible interface. The most damaging instance (notification-flow.test.ts) green-lights the OLD NotificationDispatcher + Slack/Discord/Webhook providers — all zero-production-caller code — while the live NotifyDispatcher + notify-adapters pipeline is entirely untested, so a user with 'webhook' configured silently receives nothing yet CI is green. Several tests fossilize completed migrations: debt.ts went DB-first but resources.test.ts still mocks a removed readFileSync path; format.test.ts feeds .ok-shaped doctor data when production emits .passed; cross-sprint-analyzer.test.ts asserts entry.agentId when the live PatternRecorder writes 'agent'. A second cluster tests unreachable UI islands (SprintControlPanel, WorkerGrid, vscode extension stub) — including one test that encodes silent error-swallowing as expected behavior. Dashboard guard-tests overstate their reach: nav-single-source covers 12 of 17 routes and i18n-no-literal-labels checks 3 pages with a Turkish-only heuristic, missing confirmed hardcoded English in MissionsPage. The category reveals that deckent's coverage metric is inflated by tests that were never retired or migrated after refactors, masking real gaps (new replacement paths, production .passed/.agent schemas, live notification delivery) rather than guarding them. No findings were near-identical; all 12 are distinct mechanisms and survive dedup (the three buildRunTask test locations are already merged into one).

### Top findings (12, deduped)

#### DT-001 · 🟠 HIGH — notification-flow.test.ts tests the dead OLD notification system; live pipeline entirely untested
- **Where:** `tests/integration/notification-flow.test.ts:4-30`
- **What:** Imports NotificationDispatcher + Slack/Discord/Webhook providers (all zero-production-caller) and exercises the dead dispatch path; the live NotifyDispatcher + notify-adapters pipeline is never imported, so a user with 'webhook' configured gets zero notifications while this suite passes.

#### DT-002 · 🟡 MEDIUM — nav-single-source.test.tsx verifies only 12 of 17 Layout routes; 5 silently unguarded
- **Where:** `src/dashboard/src/__tests__/nav-single-source.test.tsx:28-43`
- **What:** expectedRoutes lists 12 entries vs App.tsx's 17; /settings, /debt, /autonomous, /docs-health, /missions are never asserted and could be dropped from nav-items.ts undetected, despite the test name claiming all routes.

#### DT-003 · 🟡 MEDIUM — SprintControlPanel.test.tsx tests an unwired component and encodes silent error-swallow as expected
- **Where:** `src/dashboard/src/components/SprintControlPanel.test.tsx:255-272`
- **What:** Component has zero production callers (not mounted in any route); 17 fully-mocked tests assert mock behavior, and one explicitly asserts refetch not-called after a postJson error — codifying silent swallow as passing.

#### DT-004 · 🟡 MEDIUM — cross-sprint-analyzer.test.ts tests a dead class against a data schema the live producer never writes
- **Where:** `tests/agents/cross-sprint-analyzer.test.ts:3`
- **What:** All 17 cases test a zero-caller class with fs fully mocked; fixtures use entry.agentId while live PatternRecorder writes 'agent' (pattern-recorder.ts:9), so the integration scenario would yield 0 results at runtime even if wired.

#### DT-005 · 🟡 MEDIUM — agentic-session.test.ts mocks the entire MemoryStore — verifies mock calls, not DB persistence
- **Where:** `tests/cli/agentic-session.test.ts:43-47`
- **What:** Replaces MemoryStore with vi.fn() stubs for appendChatTurn/getChatHistory; assertions only check mock call args, no SQLite round-trip, so the tests pass even if appendChatTurn dropped or corrupted all data.

#### DT-006 · 🟡 MEDIUM — worker-grid-live.test.tsx asserts source-file text strings, not component behavior, on a dead component
- **Where:** `tests/dashboard/worker-grid-live.test.tsx:14`
- **What:** Reads WorkerGrid.tsx via readFileSync and asserts toContain('useLiveData') etc. — no mount, no DOM; would pass even if the component crashed, and WorkerGrid is never imported by any production page.

#### DT-007 · 🟡 MEDIUM — vscode extension.test.ts tests the no-op stub, not the real extension
- **Where:** `tests/extensions/vscode/extension.test.ts:6`
- **What:** Imports the stub whose handlers are empty arrows ('Stub — full implementation in Sprint 049'); asserts only command-registration structure and hardcoded getMcpConfig values; the real extension at extensions/vscode/src/extension.ts is covered elsewhere.

#### DT-008 · 🟡 MEDIUM — format.test.ts feeds {ok:} doctor data; production emits {passed:} so the real defect is uncatchable
- **Where:** `tests/mcp/helpers/format.test.ts:26-48`
- **What:** Tests formatDoctorResponse only with synthetic .ok-shaped DoctorData; real runDoctorChecks() emits .passed objects, so the tests are tautological and provide zero coverage of the .ok-vs-.passed production defect.

#### DT-009 · 🟡 MEDIUM — resources.test.ts 'DEBT.md has no table rows' mocks a removed readFileSync path
- **Where:** `tests/mcp/resources/resources.test.ts:317-331`
- **What:** Mocks readFileSync with markdown, but debt.ts is DB-first (zero readFileSync); the test passes only because the MemoryStore mock returns [], asserting a file-parse behavior removed in the DB migration.

#### DT-010 · ⚪ LOW — i18n-no-literal-labels.test.tsx checks 3 pages with a Turkish-only heuristic, misses hardcoded English in MissionsPage
- **Where:** `src/dashboard/src/__tests__/i18n-no-literal-labels.test.tsx:45-48`
- **What:** Covers only Evolution/Nervous/MemoryExplorer pages and matches only Turkish chars; MissionsPage.tsx:146-147 has live-rendered 'No missions' / 'No autonomous missions have been created yet.' that the guard cannot catch.

#### DT-011 · ⚪ LOW — reconcileSpuriousNoGo 'vitest <50% pass' branch is structurally unreachable dead code
- **Where:** `src/orchestra/mid-sprint-adapter.ts:424-426`
- **What:** The early-return on res.status !== 0 fires for any test failure before JSON is parsed, so a real partial ratio is computed only when all pass (ratio 1.0); the documented '>50% → GO_WITH_TECH_DEBT' / '<50% → NO_GO' (lines 567-578) never executes with a real ratio.

#### DT-012 · ⚪ LOW — buildRunTask test suite covers a @deprecated helper with zero production callers
- **Where:** `tests/cli/run.test.ts:115-148`
- **What:** 6 cases assert task structure on a helper run.ts:59-64 marks '@deprecated WM-1 ... No production caller remains'; duplicated at run-overhaul.test.ts:25-30 and multi-provider-spawn-kill-run.test.ts:180-182, masking the absence of coverage on the buildExecutionRequest+resolveToTask replacement.

---

## Appendix — Full Confirmed Finding Index (692)

Compact index of every adversarially-confirmed finding, for Phase-2 cross-check coverage. `ID | sev | category | title | file:line`.

| ID | Sev | Cat | Title | Location |
|----|-----|-----|-------|----------|
| DT-A001 | high | dead-test | tests/integration/notification-flow.test.ts — tests dead production code (old Notification | `tests/integration/notification-flow.test.ts` |
| DT-A002 | medi | dead-test | nav-single-source.test.tsx checks only 12 of 17 Layout-wrapped routes — 5 routes silently  | `src/dashboard/src/__tests__/nav-single-source.test.tsx` |
| DT-A003 | medi | dead-test | SprintControlPanel.test.tsx tests a completely unwired production component and encodes it | `src/dashboard/src/components/SprintControlPanel.test.tsx` |
| DT-A004 | medi | dead-test | tests/agents/cross-sprint-analyzer.test.ts tests a dead, data-incompatible class | `tests/agents/cross-sprint-analyzer.test.ts` |
| DT-A005 | medi | dead-test | agentic-session.test.ts mocks the entire MemoryStore — tests verify mock behavior, not rea | `tests/cli/agentic-session.test.ts` |
| DT-A006 | medi | dead-test | worker-grid-live.test.tsx asserts source-text strings instead of real component behavior | `tests/dashboard/worker-grid-live.test.tsx` |
| DT-A007 | medi | dead-test | tests/extensions/vscode/extension.test.ts tests the no-op stub, not the real VS Code exten | `tests/extensions/vscode/extension.test.ts` |
| DT-A008 | medi | dead-test | formatDoctorResponse unit tests use synthetic {ok:} data that never matches real productio | `tests/mcp/helpers/format.test.ts` |
| DT-A009 | medi | dead-test | debt resource test 'DEBT.md has no table rows' mocks a removed code path | `tests/mcp/resources/resources.test.ts` |
| DT-A010 | low | dead-test | i18n-no-literal-labels.test.tsx only checks 3 pages, misses MissionsPage which has confirm | `src/dashboard/src/__tests__/i18n-no-literal-labels.test.tsx` |
| DT-A011 | low | dead-test | reconcileSpuriousNoGo 'vitest < 50%' branch is structurally unreachable dead code | `src/orchestra/mid-sprint-adapter.ts` |
| DT-A012 | low | dead-test | buildRunTask test suite tests a @deprecated function acknowledged to have no production ca | `tests/cli/run.test.ts` |
| DOR-A001 | crit | dormant | `DeriveRequestPrincipalOptions.authGateVerified` / `RequestPrincipal.claimsVerified` never | `src/api/auth-me-endpoint.ts` |
| DOR-A002 | crit | dormant | enforce_least_privilege config flag never reaches createAuditedCapabilityRegistry — least- | `src/core/capability-runtime.ts` |
| DOR-A003 | crit | dormant | autonomous.engine='v2' flag is untyped and undocumented — v2 engine is permanently unreach | `src/orchestra/autonomous/mission-store/mission-engine-wire.ts` |
| DOR-A004 | crit | dormant | rollback_policy config field is defined and validated but never read by the sprint runner | `src/orchestra/sprint-controller.ts` |
| DOR-A005 | crit | dormant | rollback_policy config field is defined, validated, and documented but its value is NEVER  | `src/orchestra/sprint-controller.ts` |
| DOR-A006 | high | dormant | ComposeOptions.lang accepted by composeSystemPrompt() but never used in function body | `src/agent/identity.ts` |
| DOR-A007 | high | dormant | PromptVersion.stats field is a dormant metric — always {uses:0, successRate:0} at runtime | `src/agents/prompt-version.ts` |
| DOR-A008 | high | dormant | Autonomous backlog `strictTenantIsolation` permanently dormant: opts never passed at call  | `src/api/autonomous-endpoint.ts` |
| DOR-A009 | high | dormant | strictTenantIsolation option on /api/autonomous/backlog is always false — ENT-2 tenant fil | `src/api/autonomous-endpoint.ts` |
| DOR-A010 | high | dormant | TerminalConfig fields (scrollbackBytes, idleTimeoutMs, maxSessions, allowShellKind) ignore | `src/api/server.ts` |
| DOR-A011 | high | dormant | Audit HMAC chain (integrity config + ChainedAuditSink) never wired in production — all ter | `src/api/server.ts` |
| DOR-A012 | high | dormant | OutboundLimiter never instantiated or wired into attachTerminalGateway | `src/api/terminal/outbound-limiter.ts` |
| DOR-A013 | high | dormant | switchProvider option defined and loop-handled but never passed by any production caller | `src/cli/commands/chat-native.ts` |
| DOR-A014 | high | dormant | `deckent chat --local` flag is defined but immediately errors with 'not yet wired' | `src/cli/commands/chat.ts` |
| DOR-A015 | high | dormant | `deckent cost estimate` subcommand documented in file header but never registered | `src/cli/commands/cost.ts` |
| DOR-A016 | high | dormant | rbac CLI grant/revoke writes to in-memory Map that is never read by the RBAC enforcement s | `src/cli/commands/rbac.ts` |
| DOR-A017 | high | dormant | --auto-approve CLI option on deckent run is silently ignored — always forced to true | `src/cli/commands/run.ts` |
| DOR-A018 | high | dormant | Provider cache reads but never uses cached data — always calls bootstrapProviders regardle | `src/cli/commands/start.ts` |
| DOR-A019 | high | dormant | mcp_client_enabled config flag — defined, gated by, but never read from loaded config in p | `src/cli/repl/mcp-bridge.ts` |
| DOR-A020 | high | dormant | mcp_client_enabled config flag defined in a local interface but absent from DeckentConfig  | `src/cli/repl/mcp-bridge.ts` |
| DOR-A021 | high | dormant | native_cost_ceiling_usd config key read from an ad-hoc cast but never declared in the conf | `src/cli/repl/run.tsx` |
| DOR-A022 | high | dormant | ConnectorConfig.webhookUrl and ConnectorConfig.options fields are defined but never read | `src/connectors/types.ts` |
| DOR-A023 | high | dormant | denialAudit option never passed to createAuditedCapabilityRegistry — CAPABILITY_DENIED eve | `src/core/capability-runtime.ts` |
| DOR-A024 | high | dormant | boundary_enforcement config flag is defined but never read at runtime — auditor/monitor co | `src/core/config-types.ts` |
| DOR-A025 | high | dormant | telemetry_enabled and telemetry_anonymous config flags are defined but never read — no tel | `src/core/config-types.ts` |
| DOR-A026 | high | dormant | cost_optimization config flag defined and validated but never read — no provider cost-rank | `src/core/config-types.ts` |
| DOR-A027 | high | dormant | DeckentConfig.notifications (webhook/slack/discord URLs) — defined in config schema but ne | `src/core/config-types.ts` |
| DOR-A028 | high | dormant | DeckentConfig.output_render_mode config field is defined but never read at runtime | `src/core/config-types.ts` |
| DOR-A029 | high | dormant | daily_max_usd and monthly_max_usd defined, settable, and displayed but never enforced as a | `src/core/cost-config-loader.ts` |
| DOR-A030 | high | dormant | CollaborationConfig (sharedMemoryEnabled / parallelPipelines / conflictStrategy) — defined | `src/core/decision-config.ts` |
| DOR-A031 | high | dormant | LearningConfig user-configurable fields (minSamplesForBonus / recentSprintWindow / sprintR | `src/core/decision-config.ts` |
| DOR-A032 | high | dormant | DECKENT_SMTP_HOST / DECKENT_SMTP_USER / DECKENT_SMTP_PASS / DECKENT_TELEMETRY_ID / DECKENT | `src/core/deck-file.ts` |
| DOR-A033 | high | dormant | EnterpriseConfig schema (parseEnterpriseConfig, mergeEnterpriseConfig, ENTERPRISE_CONFIG_D | `src/core/enterprise-config.ts` |
| DOR-A034 | high | dormant | strictTenantIsolation config flag is read by config layer but never wired to MemoryStore c | `src/core/memory-store.ts` |
| DOR-A035 | high | dormant | MemoryQueryParams.min_score field defined but never applied in search implementation | `src/core/memory-types.ts` |
| DOR-A036 | high | dormant | ModelStrategy.auto_upgrade and auto_downgrade fields defined and stored in config but neve | `src/core/mode-presets.ts` |
| DOR-A037 | high | dormant | ModelRegistry.unregister() is exported but never called in any production code path | `src/core/model-registry.ts` |
| DOR-A038 | high | dormant | plugin_require_signature config knob defined but never forwarded to loadPluginHooks | `src/core/plugin-hooks.ts` |
| DOR-A039 | high | dormant | ProviderFailureSummary.auth and .oom fields are computed but never read by any caller | `src/core/provider-failure-classifier.ts` |
| DOR-A040 | high | dormant | RoutingDecision.contextFit field is computed but never read by any caller | `src/core/routing-engine.ts` |
| DOR-A041 | high | dormant | Connector.healthCache is populated but never read | `src/core/session-interface.ts` |
| DOR-A042 | high | dormant | telemetry_enabled and telemetry_anonymous config fields never read at runtime | `src/core/telemetry.ts` |
| DOR-A043 | high | dormant | computeBackoff from token-quota.ts always receives null RateLimitState — rate-limit-aware  | `src/core/token-quota.ts` |
| DOR-A044 | high | dormant | deckent_nervous_subscribe subscribers Set is populated but never consumed — push dispatch  | `src/mcp/tools/nervous.ts` |
| DOR-A045 | high | dormant | sandbox=true in MCP deckent_start silently does nothing (no git-stash) | `src/mcp/tools/start.ts` |
| DOR-A046 | high | dormant | shouldDelay() / quiet-hours enforcement is implemented but never called in the live nervou | `src/nervous/decision-engine.ts` |
| DOR-A047 | high | dormant | NotificationDeliveryHealthDetector: NOTIFICATION_DELIVERY event type is never emitted | `src/nervous/detectors/notification-delivery-health.ts` |
| DOR-A048 | high | dormant | TaskModeIdleDetector is permanently inert: the cron event never carries lastUserActivity | `src/nervous/detectors/task-mode-idle.ts` |
| DOR-A049 | high | dormant | desktop channel config field is defined and defaulted but never dispatched | `src/nervous/dispatcher.ts` |
| DOR-A050 | high | dormant | AutonomousRuntimeConfig.tenantId is defined and passed but never read inside runAutonomous | `src/orchestra/autonomous-runtime.ts` |
| DOR-A051 | high | dormant | policyEngine DI slot never wired — F10-001/002 policy+risk gate permanently disabled | `src/orchestra/autonomous/execute-dispatcher.ts` |
| DOR-A052 | high | dormant | fanOut field defined, validated, and propagated — never consumed by any dispatcher or runt | `src/orchestra/autonomous/goal-planner-types.ts` |
| DOR-A053 | high | dormant | native_skills_passthrough / useNativeSkills option defined but never read at runtime | `src/orchestra/capability-realizer.ts` |
| DOR-A054 | high | dormant | validateWorkerCoverage / parseCoverageFromVitest never receive actual data — vitest JSON o | `src/orchestra/coverage-validator.ts` |
| DOR-A055 | high | dormant | verifyProofOfFunction / applyProofOfFunctionGate / runPostSprintSmoke never called in spri | `src/orchestra/proof-of-function.ts` |
| DOR-A056 | high | dormant | SelfModEnforceResult.mode 'enforce' is structurally a no-op — the RBAC layer always runs i | `src/orchestra/self-modifying-detector.ts` |
| DOR-A057 | high | dormant | getRuntimeExtensionMax and getAdaptiveMultiplier config knobs never consumed by the actual | `src/orchestra/sprint-controller.ts` |
| DOR-A058 | high | dormant | RunSprintOptions.sandboxMode is defined and passed but never read inside runSprint() | `src/orchestra/sprint-controller.ts` |
| DOR-A059 | high | dormant | sandboxMode option accepted by RunSprintOptions but never read inside runSprint | `src/orchestra/sprint-controller.ts` |
| DOR-A060 | high | dormant | sync_on_finalize config knob is permanently off — doc-tracking sprint hook never fires in  | `src/orchestra/sprint-finalizer.ts` |
| DOR-A061 | high | dormant | history_scaling_enabled=true by default but SprintHistory is always zero-filled, making hi | `src/orchestra/timeout-estimator.ts` |
| DOR-A062 | high | dormant | ClaudeAdapter 'mcp' backend is schema-exposed but permanently blocked — all three entry po | `src/providers/claude.ts` |
| DOR-A063 | medi | dormant | OPENAI_BASE_URL environment variable is never read; only config-file openai_base_url is su | `src/agent/provider-detect.ts` |
| DOR-A064 | medi | dormant | AgentSessionDeps.maxIterations is accepted but never passed by the only real caller (run.t | `src/agent/session.ts` |
| DOR-A065 | medi | dormant | suggestRemove in SkillAdaptation is always an empty array — dead code path in retro-writer | `src/agents/adaptive-agent.ts` |
| DOR-A066 | medi | dormant | ROLLBACK_SUCCESS_THRESHOLD and ROLLBACK_MIN_USES constants are defined but their containin | `src/agents/prompt-rollback.ts` |
| DOR-A067 | medi | dormant | writeFinishedHeartbeat deprecated wrapper is never called but still exported | `src/agents/worker.ts` |
| DOR-A068 | medi | dormant | GET /api/nervous/status always returns hardcoded detectors:[] and panicGuard:true — live s | `src/api/nervous-endpoint.ts` |
| DOR-A069 | medi | dormant | AuditIntegrityConfig / HMAC chain feature defined but never wired into production Terminal | `src/api/terminal/audit.ts` |
| DOR-A070 | medi | dormant | DECKENT_CHAT_MODE env var and config.chat.mode field have no runtime effect | `src/cli/commands/chat-mode.ts` |
| DOR-A071 | medi | dormant | createLineQueue exported but never called in production; DECKENT_PINNED_BAR flag controls  | `src/cli/commands/chat-render-region.ts` |
| DOR-A072 | medi | dormant | `--tenant` option in `deckent flow run` is declared but never used | `src/cli/commands/flow.ts` |
| DOR-A073 | medi | dormant | `multi_ide_mode` config flag is set at init but never read at runtime | `src/cli/commands/init-steps.ts` |
| DOR-A074 | medi | dormant | `deckent nervous undo` journals a reversal record but dispatches no actual reversal to the | `src/cli/commands/nervous.ts` |
| DOR-A075 | medi | dormant | DECKENT_WATCH_SPLIT env var is written and immediately deleted — createWatchLayout hardcod | `src/cli/commands/watch.ts` |
| DOR-A076 | medi | dormant | native_cost_ceiling_usd config field — read via type-cast but absent from DeckentConfig sc | `src/cli/repl/run.tsx` |
| DOR-A077 | medi | dormant | ConnectorId includes 'whatsapp', 'slack', 'email' which are accepted by the webhook endpoi | `src/connectors/incoming-router.ts` |
| DOR-A078 | medi | dormant | OutgoingMessage.replyTo field is defined but never set or read in production | `src/connectors/types.ts` |
| DOR-A079 | medi | dormant | notify_channel and notify_url config fields are explicitly marked 'legacy — never wired' b | `src/core/config-types.ts` |
| DOR-A080 | medi | dormant | SubscriptionTracking.method enum values (cccost_interceptor, admin_api) defined but never  | `src/core/cost-config-loader.ts` |
| DOR-A081 | medi | dormant | telemetry_enabled / telemetry_anonymous config fields — schema-defined, behaviorally no-op | `src/core/debug-log.ts` |
| DOR-A082 | medi | dormant | ModelStrategy.min_tier and max_tier defined in config but never enforced at runtime | `src/core/mode-presets.ts` |
| DOR-A083 | medi | dormant | block_on_test_fail config defaults to false and its warning path is structurally unreachab | `src/core/plugin-hooks.ts` |
| DOR-A084 | medi | dormant | SkillBudget.totalSkillTokenBudget and maxTokensPerSkill are computed but never consumed | `src/core/routing-engine.ts` |
| DOR-A085 | medi | dormant | TaskDNA.subIntent field is populated by intent-classifier but never read by routing-engine | `src/core/routing-types.ts` |
| DOR-A086 | medi | dormant | HealthCheckResult.cliVersion is always null — field is structurally hardcoded dead | `src/core/session-interface.ts` |
| DOR-A087 | medi | dormant | InteractionMode (batch/interactive/streaming) field on ExecutionRequest is defined and for | `src/core/work-model.ts` |
| DOR-A088 | medi | dormant | Live log SSE tail silently disabled for tmux and subprocess worker backends | `src/dashboard/src/components/WorkerCard.tsx` |
| DOR-A089 | medi | dormant | TranslatorProp is structurally identical to Translator — the type alias split has no behav | `src/dashboard/src/i18n/types.ts` |
| DOR-A090 | medi | dormant | NavItem.label field defined and threaded but never set on any nav item | `src/dashboard/src/nav-items.ts` |
| DOR-A091 | medi | dormant | Planned config fields (search_*, notify_*, telemetry_*, multi_ide_mode) rendered in Config | `src/dashboard/src/pages/ConfigPage.tsx` |
| DOR-A092 | medi | dormant | Alert.acknowledged field defined in types/index.ts but never read or set anywhere | `src/dashboard/src/types/index.ts` |
| DOR-A093 | medi | dormant | COMMAND_IDS constant and all three registered command handlers are permanent no-ops | `src/extensions/vscode/extension.ts` |
| DOR-A094 | medi | dormant | 'usage' key in SUMMARIES and HINTS maps is never triggered | `src/mcp/helpers/enrich.ts` |
| DOR-A095 | medi | dormant | lang hardcoded to 'en' in deckent_autonomous tool — i18n bypass for user-facing error mess | `src/mcp/tools/autonomous.ts` |
| DOR-A096 | medi | dormant | 'auto' parameter in deckent_init MCP tool is accepted but immediately discarded with 'void | `src/mcp/tools/init.ts` |
| DOR-A097 | medi | dormant | deckent_recover audit gate result is collected but GATE_FAILURE never blocks recovery step | `src/mcp/tools/recover.ts` |
| DOR-A098 | medi | dormant | isWorkerProcessAlive always returns false for the default subprocess backend — Signal B pe | `src/monitor/auditor.ts` |
| DOR-A099 | medi | dormant | idleThrottleMultiplier in NervousObserver is hardcoded to 1 (no-op) by bootstrap — config  | `src/nervous/bootstrap.ts` |
| DOR-A100 | medi | dormant | risk_gate_enabled on NervousSystemConfig is accessed via type-cast — not declared on the i | `src/nervous/decision-engine.ts` |
| DOR-A101 | medi | dormant | BuildFailureRecurrenceDetector disabled in production; historical analysis fragile when en | `src/nervous/detectors/build-failure-recurrence.ts` |
| DOR-A102 | medi | dormant | DeadEventStreamDetector deployed but disabled in project config despite fix comment | `src/nervous/detectors/dead-event-stream.ts` |
| DOR-A103 | medi | dormant | ScopeCollisionRateDetector's SCOPE_COLLISION event type and sprintCollisionCount payload f | `src/nervous/detectors/scope-collision-rate.ts` |
| DOR-A104 | medi | dormant | NervousSystemConfig.notifications.channels.desktop — config flag stored but never dispatch | `src/nervous/dispatcher.ts` |
| DOR-A105 | medi | dormant | nervous_system.approve_timeout_attended_ms and approve_timeout_unattended_ms config keys a | `src/nervous/executor.ts` |
| DOR-A106 | medi | dormant | idleThrottleMultiplier (nervous_system.idle_throttle) is always hardcoded to 1 at the Nerv | `src/nervous/observer.ts` |
| DOR-A107 | medi | dormant | Proposer severity filter reads a config field (severityMin) not present in NervousSystemCo | `src/nervous/proposer.ts` |
| DOR-A108 | medi | dormant | selectRelevantAdrs hardcodes currentSprintNum=146 while project is on sprint-310; all call | `src/orchestra/adr-selector.ts` |
| DOR-A109 | medi | dormant | fanOut field defined, validated, and planned — but never consumed at dispatch time | `src/orchestra/autonomous/backlog-types.ts` |
| DOR-A110 | medi | dormant | autonomous.engine config key untyped — invisible in schema, read via unsafe cast | `src/orchestra/autonomous/mission-store/mission-engine-wire.ts` |
| DOR-A111 | medi | dormant | WorkItem.dependsOn is stored and returned but never enforced by the scheduler | `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts` |
| DOR-A112 | medi | dormant | ReactiveRule.dedupKey field defined but never read in production | `src/orchestra/autonomous/reactive/reactive-types.ts` |
| DOR-A113 | medi | dormant | reactiveSource parameter in BuildEngineRuntimeOptions is never supplied by the sole produc | `src/orchestra/autonomous/runtime-loop.ts` |
| DOR-A114 | medi | dormant | DECAY_EXEMPT set is deprecated and never read in production code | `src/orchestra/debt-manager.ts` |
| DOR-A115 | medi | dormant | SpawnDecision action values 'replan' and 'continue' are defined but can never be produced | `src/orchestra/decision-engine.ts` |
| DOR-A116 | medi | dormant | usageData field accessed via unsafe cast on SprintResult but is never populated in the typ | `src/orchestra/doc-updaters/metrics-updater.ts` |
| DOR-A117 | medi | dormant | DocUpdater.tier field declared in interface and set on every updater but never read at run | `src/orchestra/doc-updaters/types.ts` |
| DOR-A118 | medi | dormant | DocUpdateContext.store field is typed and documented but never populated by the sprint fin | `src/orchestra/doc-updaters/types.ts` |
| DOR-A119 | medi | dormant | test-coverage content generator: coveragePercent.toFixed(1) has no NaN guard unlike the sp | `src/orchestra/managed-docs/content-generators.ts` |
| DOR-A120 | medi | dormant | PromptEvolutionResult.changes and successRate are computed by prompt-evolution wire but th | `src/orchestra/prompt-evolution.ts` |
| DOR-A121 | medi | dormant | resource_monitor config field is read but only starts a Docker-stats monitor — completely  | `src/orchestra/resource-monitor.ts` |
| DOR-A122 | medi | dormant | TimeoutWatcherConfig fields (max_extensions, heartbeat_freshness_seconds, min_diff_lines)  | `src/orchestra/timeout-watcher.ts` |
| DOR-A123 | medi | dormant | BedrockAdapter.send(), parseCacheUsage(), attachCacheControlToMessages(), CACHE_CONTROL_EP | `src/providers/claude.ts` |
| DOR-A124 | medi | dormant | GeminiAdapter.buildApiScript(), buildStreamingApiScript(), getStreamingEndpoint(), getEndp | `src/providers/gemini.ts` |
| DOR-A125 | medi | dormant | OllamaAdapter.complete() and stream() are fully implemented but never called from producti | `src/providers/ollama.ts` |
| DOR-A126 | low | dormant | AgenticTokenUsage.cost field always hardcoded to 0 and never consumed | `src/agents/agentic-worker-runner.ts` |
| DOR-A127 | low | dormant | debounceMs ≤ 250 upper-bound constraint documented but never enforced | `src/api/worker-logs.ts` |
| DOR-A128 | low | dormant | PRE_EXECUTION_STATUSES constant exported from heartbeat-types.ts but never imported anywhe | `src/core/heartbeat-types.ts` |
| DOR-A129 | low | dormant | TELEMETRY_ENABLED constant is exported as false and never read anywhere | `src/core/observability.ts` |
| DOR-A130 | low | dormant | useApi hook unconditionally instantiates a disabled useLiveData on every render for caller | `src/dashboard/src/hooks/useApi.ts` |
| DOR-A131 | low | dormant | NOTIFICATION_ID_PATTERN ns- branch in isValidNotificationId matches an ID prefix that is n | `src/mcp/tools/nervous.ts` |
| DOR-A132 | low | dormant | AgentRoutingAnomalyDetector disabled in production config | `src/nervous/detectors/agent-routing-anomaly.ts` |
| DOR-A133 | low | dormant | queryDue `_now` parameter is always ignored — time-based due filtering is a no-op | `src/orchestra/autonomous/backlog.ts` |
| DOR-A134 | low | dormant | validateReactiveRule exported but has zero production callers outside its own file | `src/orchestra/autonomous/reactive/reactive-map.ts` |
| DOR-A135 | low | dormant | todoMarkers / TodoMarker / todoToEntry dead half of WorkGeneratorInput never populated in  | `src/orchestra/autonomous/work-generator.ts` |
| DOR-A136 | low | dormant | partialResultExists (L5 liveness signal) is computed but never used in branching logic | `src/orchestra/worker-liveness.ts` |
| DOR-A137 | low | dormant | CORE4 map is private and unreachable by any external caller needing to enumerate mappable  | `src/training/cc-trace-extractor.ts` |
| INC-A001 | crit | inconsistent | Two divergent ROLE_CAPABILITY_MAP definitions with different roles and capability sets | `src/core/capability-broker.ts` |
| INC-A002 | crit | inconsistent | NervousSystemConfig is defined twice with divergent schemas — nervous-types.ts vs config-t | `src/core/nervous-types.ts` |
| INC-A003 | crit | inconsistent | deckent_audit readOnlyHint:true but gate action writes files | `src/mcp/tools/audit.ts` |
| INC-A004 | crit | inconsistent | Three divergent implementations of getCurrentSprintId reading different files | `src/monitor/sprint-state.ts` |
| INC-A005 | crit | inconsistent | Two divergent ROLE_CAPABILITY_MAP definitions with conflicting roles and capability sets | `src/nervous/authority-matrix.ts` |
| INC-A006 | crit | inconsistent | SprintMetrics.noGoRate is stored as percentage (0-100) but consumed as fraction (0-1) in t | `src/orchestra/managed-docs/content-generators.ts` |
| INC-A007 | crit | inconsistent | routing_engine defaults to 'v1' in sprint-planner and sprint-controller, 'v2' everywhere e | `src/orchestra/sprint-planner.ts` |
| INC-A008 | high | inconsistent | Two unrelated ProviderAdapter interfaces share the same exported name across subsystems | `src/agent/provider-tooluse/types.ts` |
| INC-A009 | high | inconsistent | buildNoGoResult in error paths uses fabricated testsPassed:false / coverage:0 instead of n | `src/agents/agentic-worker-entry.ts` |
| INC-A010 | high | inconsistent | Duplicate CrossSprintAnalyzer with completely divergent interfaces — agents vs orchestra | `src/agents/cross-sprint-analyzer.ts` |
| INC-A011 | high | inconsistent | Duplicate calculateSelfHealingRate with different return types — number vs SelfHealingRate | `src/agents/worker-lifecycle.ts` |
| INC-A012 | high | inconsistent | Two incompatible checkWorkerAuthority functions with the same name exist in different modu | `src/agents/worker.ts` |
| INC-A013 | high | inconsistent | Duplicate checkWorkerAuthority function with divergent signatures and semantics in worker. | `src/agents/worker.ts` |
| INC-A014 | high | inconsistent | Three divergent RateLimiter classes with incompatible interfaces coexist | `src/api/server.ts` |
| INC-A015 | high | inconsistent | sendJson hardcodes DEFAULT_PORT (3100) in CORS header, breaking non-default-port deploys | `src/api/server.ts` |
| INC-A016 | high | inconsistent | Agent sprint-stats fallback conflates mentions with successful tasks, inflating success ra | `src/cli/commands/agent.ts` |
| INC-A017 | high | inconsistent | Three divergent `isNoColor()` implementations with different signatures | `src/cli/commands/dashboard.ts` |
| INC-A018 | high | inconsistent | Duplicate HumanDoctorInput interface, PreFlightResult/runPreFlightHealthCheck, and helper  | `src/cli/commands/doctor.ts` |
| INC-A019 | high | inconsistent | RichSprintSummary interface defined in three places with diverging shapes (retro.ts, retro | `src/cli/commands/retro.ts` |
| INC-A020 | high | inconsistent | watch.ts private getCurrentSprintId reads config.json/last_sprint_id, a third independent  | `src/cli/commands/watch.ts` |
| INC-A021 | high | inconsistent | Two divergent language-detection functions with different fallback behavior — getLangFromC | `src/cli/helpers/config-reader.ts` |
| INC-A022 | high | inconsistent | Three divergent extractKeywords implementations across three modules | `src/core/agent-selector.ts` |
| INC-A023 | high | inconsistent | audit-writer.ts uses unkeyed SHA-256 but names the field 'hmac'; audit-export.ts uses keye | `src/core/audit-writer.ts` |
| INC-A024 | high | inconsistent | Handler requiredCapability strings use dot-notation ('db.read', 'net.read', 'shell.exec')  | `src/core/capability-handlers-data.ts` |
| INC-A025 | high | inconsistent | dependency_pipeline_enabled default is false in config-types docstring and REGEN_TEMPLATE_ | `src/core/config.ts` |
| INC-A026 | high | inconsistent | CONFIG_METADATA documents memory_budget default as 600 and decay_after_sprints default as  | `src/core/config.ts` |
| INC-A027 | high | inconsistent | like operator has divergent semantics across ERP drivers: SQL wildcards vs. literal substr | `src/core/erp/handler.ts` |
| INC-A028 | high | inconsistent | Three divergent max_workers calculation algorithms coexist across host-detector.ts, system | `src/core/host-detector.ts` |
| INC-A029 | high | inconsistent | BUILTIN_TRUSTED_SKILLS in skill-sandbox.ts contains IDs that do not match any real skill I | `src/core/marketplace/skill-sandbox.ts` |
| INC-A030 | high | inconsistent | actionOverrides is required in config-types.ts NervousSystemConfig but optional in nervous | `src/core/nervous-types.ts` |
| INC-A031 | high | inconsistent | Two parallel notification systems with incompatible types and event taxonomies | `src/core/notifications.ts` |
| INC-A032 | high | inconsistent | Three divergent RateLimiter implementations with different APIs, defaults, and behaviors — | `src/core/rate-limiter.ts` |
| INC-A033 | high | inconsistent | Three divergent RateLimiter implementations — core, api/rate-limiter.ts, api/server.ts — w | `src/core/rate-limiter.ts` |
| INC-A034 | high | inconsistent | Two parallel skill-loading systems with no shared caching: SkillPoolManager re-reads disk  | `src/core/skill-pool.ts` |
| INC-A035 | high | inconsistent | Duplicate suggestMaxWorkers with divergent algorithms in system-capacity.ts vs host-detect | `src/core/system-capacity.ts` |
| INC-A036 | high | inconsistent | DirectivesEditor (component) and DirectivesPage duplicate the same feature with divergent  | `src/dashboard/src/components/DirectivesEditor.tsx` |
| INC-A037 | high | inconsistent | ManualTokenInput uses no i18n for user-facing strings despite the project's i18n-first man | `src/dashboard/src/components/ManualTokenInput.tsx` |
| INC-A038 | high | inconsistent | NO_GO/ERROR status color is yellow in SprintSummary but red in TaskCard and WorkerCard | `src/dashboard/src/components/SprintSummary.tsx` |
| INC-A039 | high | inconsistent | Two divergent useApi hooks with incompatible return shapes both named useApi | `src/dashboard/src/lib/useApi.ts` |
| INC-A040 | high | inconsistent | LoginPage violates i18n-FIRST: zero useTranslation usage, all user-facing strings are hard | `src/dashboard/src/pages/LoginPage.tsx` |
| INC-A041 | high | inconsistent | Two parallel VS Code extension implementations with divergent command IDs, types, and beha | `src/extensions/vscode/extension.ts` |
| INC-A042 | high | inconsistent | cleanup.ts hardcodes memoryBudget=900 and decayAfterSprints=8 but config defaults are 5000 | `src/mcp/tools/cleanup.ts` |
| INC-A043 | high | inconsistent | backlogPath computed three different ways: config-aware in submit path, hardcoded in MCP s | `src/mcp/tools/process.ts` |
| INC-A044 | high | inconsistent | Three divergent alert-deduplication implementations with incompatible keys write to the sa | `src/monitor/alert-emitter.ts` |
| INC-A045 | high | inconsistent | Three divergent parseVitestOutput implementations with incompatible return types | `src/orchestra/baseline-tracker.ts` |
| INC-A046 | high | inconsistent | Two updaters both write README.md with divergent test-count formulas, one of which is sema | `src/orchestra/doc-updaters/readme-metrics.ts` |
| INC-A047 | high | inconsistent | Default HEARTBEAT.md template contains a task that always fails validateCommand | `src/orchestra/heartbeat-daemon.ts` |
| INC-A048 | high | inconsistent | Two parallel learning systems (PatternRecorder/PatternReader vs OutcomeTracker) write to d | `src/orchestra/pattern-recorder.ts` |
| INC-A049 | high | inconsistent | Two divergent evaluateResult implementations with different logic for the same signature | `src/orchestra/result-evaluator.ts` |
| INC-A050 | high | inconsistent | Two waitForResults implementations with divergent behavior — the DI version in result-eval | `src/orchestra/result-evaluator.ts` |
| INC-A051 | high | inconsistent | Three divergent implementations of redactSensitive() with different regex coverage | `src/orchestra/sensitive-redactor.ts` |
| INC-A052 | high | inconsistent | archiveOrphanTasks writes to .brain/archive/ but cleanTasksArchive reads from .tasks/archi | `src/orchestra/sprint-docs-updater.ts` |
| INC-A053 | high | inconsistent | noGoRate stored as percentage (0-100) but generateConfigSuggestions treats it as fraction  | `src/orchestra/sprint-metrics.ts` |
| INC-A054 | high | inconsistent | Duplicate runtime-extension implementations with conflicting defaults: max_extensions=2 (t | `src/orchestra/timeout-watcher.ts` |
| INC-A055 | high | inconsistent | GeminiAdapter.isAvailable() rejects OAuth-only users but spawn() and buildGeminiSpawnEnv() | `src/providers/gemini.ts` |
| INC-A056 | high | inconsistent | tool_result tool_call_id silently falls back to empty string, producing invalid OpenAI mes | `src/training/cc-trace-extractor.ts` |
| INC-A057 | medi | inconsistent | COST_GATE_EXCEEDED string literal duplicated in two modules instead of being imported | `src/agent/guards/cost.ts` |
| INC-A058 | medi | inconsistent | DEFAULT_MAX_ITERATIONS = 25 defined independently in two unrelated modules | `src/agent/guards/recursion.ts` |
| INC-A059 | medi | inconsistent | Two exported functions named createOllamaAdapter with incompatible signatures in different | `src/agent/provider-tooluse/ollama.ts` |
| INC-A060 | medi | inconsistent | declining-performance weakness detected but has no WEAKNESS_SKILL_MAP entry — adaptation s | `src/agents/adaptive-agent.ts` |
| INC-A061 | medi | inconsistent | Triple definition of AgentRole type — core/monitoring-types.ts, orchestra/authority-enforc | `src/agents/permission-guard.ts` |
| INC-A062 | medi | inconsistent | Two independent scope-guard implementations with different semantics: scope-guard.ts (file | `src/agents/scope-guard.ts` |
| INC-A063 | medi | inconsistent | Triple duplicate parseVitestOutput with divergent return types and regex strategies | `src/agents/worker-verify.ts` |
| INC-A064 | medi | inconsistent | runCompilationLoop accepts taskScope but passes it only to the outer guard, not to verifyC | `src/agents/worker-verify.ts` |
| INC-A065 | medi | inconsistent | Duplicate `roleFromClaims` with divergent return types (`Role \| undefined` vs `Role \| nu | `src/api/enterprise-endpoint.ts` |
| INC-A066 | medi | inconsistent | Triple-duplicated `extractBearer` / `extractBearerValue` across auth, auth-me, and enterpr | `src/api/enterprise-endpoint.ts` |
| INC-A067 | medi | inconsistent | sendJson duplicated across 5+ endpoint files, omitting SECURITY_HEADERS present in server. | `src/api/evolution-endpoint.ts` |
| INC-A068 | medi | inconsistent | Audit events use mixed tenant resolution: tenantOf() vs hardcoded 'local' for the same ses | `src/api/terminal/ws-gateway.ts` |
| INC-A069 | medi | inconsistent | watcher.ts debounce timer is not unref()ed, inconsistent with worker-logs.ts and live-even | `src/api/watcher.ts` |
| INC-A070 | medi | inconsistent | AuditChainRow.id typed as number but MemoryStore.queryAuditChain returns id as string; typ | `src/cli/commands/audit-verify.ts` |
| INC-A071 | medi | inconsistent | chat-banner.ts renders a hardcoded Turkish hint string, violating the i18n-first mandate | `src/cli/commands/chat-banner.ts` |
| INC-A072 | medi | inconsistent | Hardcoded Turkish string 'MCP server yok' in renderMcpSlashLines violates i18n-first rule | `src/cli/commands/chat-mcp-bridge.ts` |
| INC-A073 | medi | inconsistent | Two duplicate subscriptionEnv functions strip different env-var sets across modules | `src/cli/commands/chat-native.ts` |
| INC-A074 | medi | inconsistent | Duplicate McpToolRegistry definition: local interface in chat-native.ts vs class in mcp-cl | `src/cli/commands/chat-native.ts` |
| INC-A075 | medi | inconsistent | Five duplicated `getMemoryEntryCount` implementations across unrelated modules | `src/cli/commands/cleanup.ts` |
| INC-A076 | medi | inconsistent | Stale state enumeration diverges between runDocsTrackScan and runDocsTrackStatus | `src/cli/commands/docs.ts` |
| INC-A077 | medi | inconsistent | detectMixedSprints duplicated identically in finalize.ts and review.ts | `src/cli/commands/finalize.ts` |
| INC-A078 | medi | inconsistent | Two completely different parseSprintLog functions with different return types — `SprintSum | `src/cli/commands/history.ts` |
| INC-A079 | medi | inconsistent | `mcp.ts` implements a parallel local i18n system instead of using the shared `getMessage() | `src/cli/commands/mcp.ts` |
| INC-A080 | medi | inconsistent | `deckent mode global` error message omits 'process' from the valid-styles list it prints | `src/cli/commands/mode.ts` |
| INC-A081 | medi | inconsistent | detectMixedSprints function duplicated in review.ts and finalize.ts with identical impleme | `src/cli/commands/review.ts` |
| INC-A082 | medi | inconsistent | Git clone timeout is 60 s in skill install but only 30 s in skill update — same slow-netwo | `src/cli/commands/skill.ts` |
| INC-A083 | medi | inconsistent | Two independent isGitRepo implementations with different git subcommands | `src/cli/commands/sync.ts` |
| INC-A084 | medi | inconsistent | MessageKey type in i18n.ts covers only ~65 of ~475 actual message keys — getMessages() typ | `src/cli/helpers/i18n.ts` |
| INC-A085 | medi | inconsistent | _MCP_TOOL_NAMES list in mcp-attach.ts is stale — reports 31 tools but 34 are registered | `src/cli/helpers/mcp-attach.ts` |
| INC-A086 | medi | inconsistent | Two exported interfaces both named ProgressState with incompatible shapes | `src/cli/helpers/progress-persistence.ts` |
| INC-A087 | medi | inconsistent | ReviewActions and review.ts command define parallel but incompatible ReviewState / ReviewE | `src/cli/helpers/review-actions.ts` |
| INC-A088 | medi | inconsistent | Three divergent getTerminalWidth implementations with different semantics | `src/cli/helpers/terminal-utils.ts` |
| INC-A089 | medi | inconsistent | Two divergent streaming seams: createStreamSegmenter used directly in app.tsx; createStrea | `src/cli/repl/native-transport.ts` |
| INC-A090 | medi | inconsistent | Two independent lang sources for bot messages: config.bot_agent.lang vs CLI --lang | `src/connectors/bot-completion.ts` |
| INC-A091 | medi | inconsistent | criticalTokens 'accept' branch is dead — no bot outbound message ever emits 'accept <id>' | `src/connectors/bot-humanizer.ts` |
| INC-A092 | medi | inconsistent | api-builder incorrectly assigned domain 'react' causing spurious design-task domain bonus | `src/core/agent-pool.ts` |
| INC-A093 | medi | inconsistent | REGEN_TEMPLATE_DEFAULTS sets brain_planning: 'structured' while DEFAULT_MODES sets brain_p | `src/core/config.ts` |
| INC-A094 | medi | inconsistent | DECKENT_E039 registry description says 'skill name must be non-empty' but code uses it for | `src/core/errors.ts` |
| INC-A095 | medi | inconsistent | Node.js version requirement is >=18 in error registry and doctor checks but >=24 in packag | `src/core/errors.ts` |
| INC-A096 | medi | inconsistent | countAdrsFromDb reads a markdown file, not the database, despite its name | `src/core/identity-generator.ts` |
| INC-A097 | medi | inconsistent | regenerateProjectIdentity uses stale hardcoded defaults for cliCommandCount (41) and mcpTo | `src/core/identity-generator.ts` |
| INC-A098 | medi | inconsistent | Two divergent manifest validators for the same manifest schema | `src/core/marketplace/skill-sandbox.ts` |
| INC-A099 | medi | inconsistent | Two separate Relation-like interfaces for the same concept with divergent shapes | `src/core/memory-types.ts` |
| INC-A100 | medi | inconsistent | RegistryProviderName type excludes 'ollama' but runtime code uses ollama as a first-class  | `src/core/model-registry-types.ts` |
| INC-A101 | medi | inconsistent | Duplicate isGitUrl implementations with divergent protocol support | `src/core/plugin.ts` |
| INC-A102 | medi | inconsistent | Codex maxContextTokens is 1_047_576 (off-by-1000 from the true 2^20) vs Gemini's correct 1 | `src/core/provider-capabilities.ts` |
| INC-A103 | medi | inconsistent | authMethod type diverges between DetectedProvider ('session'\|'api_key'\|'none') and Provi | `src/core/provider.ts` |
| INC-A104 | medi | inconsistent | redactSensitive() duplicated in core/redact-sensitive.ts and cli/helpers/output.ts with id | `src/core/redact-sensitive.ts` |
| INC-A105 | medi | inconsistent | resolveComposition asymmetric conflict logic: unrestricted skills incorrectly block restri | `src/core/skill-selector.ts` |
| INC-A106 | medi | inconsistent | keep_last_n default is 2 in sprint-file-retention.ts but 10 in config.ts — fallback bypass | `src/core/sprint-file-retention.ts` |
| INC-A107 | medi | inconsistent | NoGoCategory declares POLICY_CONFLICT and DEPENDENCY_CONFLICT but enrichEvaluationWithCate | `src/core/task-types.ts` |
| INC-A108 | medi | inconsistent | SpawnedProcessLike interface independently duplicated in two core files | `src/core/worker-image-check.ts` |
| INC-A109 | medi | inconsistent | filterByDateRange silently returns all data for any real calendar date — broken date-to-sp | `src/dashboard/analytics/analytics-data.ts` |
| INC-A110 | medi | inconsistent | Layout.tsx defines a private navItems that shadows the same computation in nav-items.ts | `src/dashboard/src/components/Layout.tsx` |
| INC-A111 | medi | inconsistent | Duplicate action-description logic: non-i18n describeCurrentAction vs i18n getTranslatedAc | `src/dashboard/src/components/TaskCard.tsx` |
| INC-A112 | medi | inconsistent | api-client.ts is a pure re-export shim that all callers have already migrated past — it is | `src/dashboard/src/lib/api-client.ts` |
| INC-A113 | medi | inconsistent | DebtPage uses zero i18n despite having translation keys defined in en.ts | `src/dashboard/src/pages/DebtPage.tsx` |
| INC-A114 | medi | inconsistent | MissionsPage violates i18n-FIRST: zero useTranslation usage, multiple hardcoded English st | `src/dashboard/src/pages/MissionsPage.tsx` |
| INC-A115 | medi | inconsistent | dashboard resource hardcodes active:true regardless of sprint state | `src/mcp/resources/dashboard.ts` |
| INC-A116 | medi | inconsistent | generateConfigSuggestion recommends deprecated mode aliases (pro_plan, max_plan) | `src/mcp/tools/analyze.ts` |
| INC-A117 | medi | inconsistent | help.ts TOOLS catalog omits 12 of the 35 registered MCP tools — catalog is incomplete | `src/mcp/tools/help.ts` |
| INC-A118 | medi | inconsistent | Duplicate file-local findModel function in models.ts shadows (but does not conflict with)  | `src/mcp/tools/models.ts` |
| INC-A119 | medi | inconsistent | deckent_review sprint ID derivation may include tasks from wrong sprint or unrelated one-s | `src/mcp/tools/review.ts` |
| INC-A120 | medi | inconsistent | Two 'json' output modes in deckent_status produce incompatible response shapes | `src/mcp/tools/status.ts` |
| INC-A121 | medi | inconsistent | detectDependencyViolations uses a hardcoded channel string while all other auditor events  | `src/monitor/auditor.ts` |
| INC-A122 | medi | inconsistent | Lock-state snapshot event reuses SCOPE_COLLISION_DETECTED channel, which the consumer inte | `src/monitor/auditor.ts` |
| INC-A123 | medi | inconsistent | cleanIpcDirs omits NERVOUS_IPC_DIR/resolved while including PANIC_IPC_DIR/resolved | `src/nervous/maintenance-ops.ts` |
| INC-A124 | medi | inconsistent | Duplicate `deriveCapabilitiesForRisk` function — runtime-loop and execute-dispatcher imple | `src/orchestra/autonomous/execute-dispatcher.ts` |
| INC-A125 | medi | inconsistent | maxRounds field name describes round-count but guards against total cumulative item count | `src/orchestra/autonomous/mission-store/goal-mission.ts` |
| INC-A126 | medi | inconsistent | maxRounds guard in goal-mission.ts compares item COUNT to a 'rounds' constant — semantics  | `src/orchestra/autonomous/mission-store/goal-mission.ts` |
| INC-A127 | medi | inconsistent | dedupKey on ReactiveRule promises rule-level dedup control but ingester uses title-based d | `src/orchestra/autonomous/reactive/reactive-ingester.ts` |
| INC-A128 | medi | inconsistent | backlog-trigger.ts and sprint-runtime.ts are structurally identical files with only the fu | `src/orchestra/backlog-trigger.ts` |
| INC-A129 | medi | inconsistent | shouldRun tier-gate logic is inverted between tier-1 and tier-2 updaters | `src/orchestra/doc-updaters/changelog.ts` |
| INC-A130 | medi | inconsistent | EventBus JSDoc claims publish() 'called automatically by writeEvent()' but writeEvent() ha | `src/orchestra/event-bus.ts` |
| INC-A131 | medi | inconsistent | Duplicate resolvePath functions with divergent Map-handling and null-guard semantics | `src/orchestra/managed-docs/template-renderer.ts` |
| INC-A132 | medi | inconsistent | skill-model tier upgrade in resolveTaskModel silently drops premium_plus to premium | `src/orchestra/model-selector.ts` |
| INC-A133 | medi | inconsistent | Two parallel SmokeRunnerFn type definitions and two defaultSmokeRunner implementations coe | `src/orchestra/post-sprint-smoke.ts` |
| INC-A134 | medi | inconsistent | CODE_VERIFIED_STUB variant in HonestyViolation type is unreachable — both branches of tern | `src/orchestra/result-evaluator.ts` |
| INC-A135 | medi | inconsistent | Duplicate isGitRepo implementations with different git commands | `src/orchestra/rollback.ts` |
| INC-A136 | medi | inconsistent | scope-sanitizer Rule 6 does NOT protect protected files with a directory prefix (e.g. src/ | `src/orchestra/scope-sanitizer.ts` |
| INC-A137 | medi | inconsistent | Duplicate getSharedMemory() factory defined in both worker.ts and result-collector.ts | `src/orchestra/shared-memory.ts` |
| INC-A138 | medi | inconsistent | sprint-runtime.ts casts away enforce_rbac that is already declared on ResolvedConfig | `src/orchestra/sprint-runtime.ts` |
| INC-A139 | medi | inconsistent | SCOPE_COLLISION_DETECTED channel semantically reused for dependency cascade-blocking event | `src/orchestra/sprint-spawner.ts` |
| INC-A140 | medi | inconsistent | computeFileHash duplicated across task-restoration.ts and plugin-loader.ts with identical  | `src/orchestra/task-restoration.ts` |
| INC-A141 | medi | inconsistent | readTaskStatus and ACTIVE_STATUSES duplicated across task-restoration.ts and orphan-cleane | `src/orchestra/task-restoration.ts` |
| INC-A142 | medi | inconsistent | destroy() exported from tmux.ts and re-exported from orchestra/index.ts but never called b | `src/orchestra/tmux.ts` |
| INC-A143 | medi | inconsistent | OllamaAdapter.buildCommand() returns a stale curl command while spawn() runs node agentic- | `src/providers/ollama.ts` |
| INC-A144 | low | inconsistent | DEFAULT_MAX_ITERATIONS = 25 duplicated in two independent modules | `src/agents/agentic-worker-runner.ts` |
| INC-A145 | low | inconsistent | `onboard.ts` uses hardcoded English strings throughout `runOnboard()` instead of `getMessa | `src/cli/commands/onboard.ts` |
| INC-A146 | low | inconsistent | _positiveIsGood parameter accepted but silently ignored in SprintComparison.formatChange | `src/cli/helpers/sprint-comparison.ts` |
| INC-A147 | low | inconsistent | IncomingMessageRouter JSDoc says source:'connector' but implementation sets source:'decken | `src/connectors/incoming-router.ts` |
| INC-A148 | low | inconsistent | compareTiers and isAtLeastTier defined in both mode-presets.ts and model-registry.ts with  | `src/core/mode-presets.ts` |
| INC-A149 | low | inconsistent | Duplicate ProviderNameExt type — types.ts and model-registry-types.ts define the same conc | `src/core/types.ts` |
| INC-A150 | low | inconsistent | DEFAULT_WORKER_IMAGE re-declared as a literal rather than imported — sync risk | `src/core/worker-image-check.ts` |
| INC-A151 | low | inconsistent | AppShell renders nav with `t(labelKey)` only while SidebarNavLinks renders `label ?? t(lab | `src/dashboard/src/components/AppShell.tsx` |
| INC-A152 | low | inconsistent | CallbackPage has hardcoded English string 'Completing sign in…' violating i18n-first rule | `src/dashboard/src/pages/CallbackPage.tsx` |
| INC-A153 | low | inconsistent | WorkerCommsPanel sharedCount is DONE-agent count, not SharedMemory key count as the JSDoc  | `src/dashboard/src/pages/WorkersPage.tsx` |
| INC-A154 | low | inconsistent | helpers/index.ts barrel is incomplete — formatExplainResponse and ExplainData missing | `src/mcp/helpers/index.ts` |
| INC-A155 | low | inconsistent | feature-query.ts and models.ts import from 'zod' (v3 compat layer) while all other MCP too | `src/mcp/tools/feature-query.ts` |
| INC-A156 | low | inconsistent | help.ts TOOLS catalog describes deckent_retro as 'Read the latest sprint retrospective (RE | `src/mcp/tools/help.ts` |
| INC-A157 | low | inconsistent | deckent_sync always reports changeCount=2 even when no files were modified | `src/mcp/tools/sync.ts` |
| INC-A158 | low | inconsistent | DirectivesMidSprintProtection instantiated twice: separate instances in DetectorRegistry a | `src/nervous/detectors/directives-protection.ts` |
| INC-A159 | low | inconsistent | Stale comment in backlog-trigger.ts and sprint-runtime.ts claims enforce_rbac is not yet o | `src/orchestra/backlog-trigger.ts` |
| INC-A160 | low | inconsistent | ConflictResolver test_interference deduplication checks wrong type — test files always get | `src/orchestra/conflict-resolver.ts` |
| INC-A161 | low | inconsistent | health-check.ts labels sprint task count as 'Tests' — semantic mismatch between metric and | `src/orchestra/doc-updaters/health-check.ts` |
| INC-A162 | low | inconsistent | Intent scoring algorithm duplicated verbatim between analyzeNewSkill() and analyzeSkillInM | `src/orchestra/ecosystem-intelligence.ts` |
| INC-A163 | low | inconsistent | scope-sanitizer JSDoc documents 8 rules (1-8) but code executes 10 rules with gaps in the  | `src/orchestra/scope-sanitizer.ts` |
| RC-A001 | crit | root-cause | auto-edit mode bash guard is dead — check compares literal 'bash' but no registered tool h | `src/agent/permission.ts` |
| RC-A002 | crit | root-cause | Skill adaptation suggestions from adaptAgentRuntime are advisory-only with no enforcement  | `src/agents/adaptive-agent.ts` |
| RC-A003 | crit | root-cause | assignVariant() ignores its experimentId parameter — A/B assignment is untracked pure rand | `src/agents/prompt-analytics.ts` |
| RC-A004 | crit | root-cause | checkWorkerAuthority in agents/worker.ts returns true in BOTH branches — authority check i | `src/agents/worker.ts` |
| RC-A005 | crit | root-cause | Worker authority enforcement always returns true (warn-and-permit) regardless of scope vio | `src/agents/worker.ts` |
| RC-A006 | crit | root-cause | checkWorkerAuthority always returns true — scope violation enforcement is permanently disa | `src/agents/worker.ts` |
| RC-A007 | crit | root-cause | Lineage IDOR: server.ts dispatches registerAutonomousRoutes without req — tenant filter is | `src/api/server.ts` |
| RC-A008 | crit | root-cause | Lineage tenant-filter always bypassed: `req` never passed to `registerAutonomousRoutes` | `src/api/server.ts` |
| RC-A009 | crit | root-cause | Enterprise missions-audit tenant isolation dead: `req` omitted from `registerEnterpriseRou | `src/api/server.ts` |
| RC-A010 | crit | root-cause | TerminalAudit HMAC-chain is permanently dormant: production wires a no-op sink with no int | `src/api/server.ts` |
| RC-A011 | crit | root-cause | mTLS client-cert detection falls through without blocking — cert presence is detected, war | `src/api/terminal/ws-gateway.ts` |
| RC-A012 | crit | root-cause | switchProvider option silently no-ops: /provider command confirms switch but does not rebu | `src/cli/commands/chat-native.ts` |
| RC-A013 | crit | root-cause | `deckent chat --native` wires a stub dispatcher that silently returns placeholder strings  | `src/cli/commands/chat.ts` |
| RC-A014 | crit | root-cause | Entire helper subsystem (8 classes) built and tested but never wired into production — tru | `src/cli/helpers/review-actions.ts` |
| RC-A015 | crit | root-cause | Routing engine selectBestAgent() skips skill-affinity signal entirely — advertised fix for | `src/core/activation-engine.ts` |
| RC-A016 | crit | root-cause | audit-writer.ts chainHead is a process-wide singleton — cross-sprint chain verification al | `src/core/audit-writer.ts` |
| RC-A017 | crit | root-cause | AES-256-GCM credential encryption infrastructure is built but the keyring auto-generates s | `src/core/credential-encryption.ts` |
| RC-A018 | crit | root-cause | rebuildWithRelationSafety strict=false default makes the relation-loss safety guard opt-in | `src/core/memory-import.ts` |
| RC-A019 | crit | root-cause | strictTenantIsolation defaults to false and config value is never threaded to MemoryStore  | `src/core/memory-store.ts` |
| RC-A020 | crit | root-cause | Old NotificationDispatcher (notifications.ts) and its provider pipeline is fully supersede | `src/core/notifications.ts` |
| RC-A021 | crit | root-cause | Config-driven Slack/Discord/Webhook notification config is silently accepted but never del | `src/core/notify-bootstrap.ts` |
| RC-A022 | crit | root-cause | coverage metric is always hardcoded 0 throughout CI guardian — track_coverage config has n | `src/core/plugin-hooks.ts` |
| RC-A023 | crit | root-cause | bootstrapProviders health-check result is read into an empty if-body — no behavioral effec | `src/core/provider.ts` |
| RC-A024 | crit | root-cause | enforceRbac in rbac.ts is a NO-OP by design when rbacConfig.enabled is false — default is  | `src/core/rbac.ts` |
| RC-A025 | crit | root-cause | assertSpawnSafe security gate is advisory-only: ADR-006 spawn safety is documented but nev | `src/core/spawn-safety.ts` |
| RC-A026 | crit | root-cause | Task.actor RBAC seam is explicitly flagged 'data only, no enforcement' — actor-based autho | `src/core/task-types.ts` |
| RC-A027 | crit | root-cause | AgentDetail bypasses auth: raw fetch omits Authorization header, silently returns nothing  | `src/dashboard/src/components/AgentDetail.tsx` |
| RC-A028 | crit | root-cause | SprintControlPanel silently swallows all kill/cleanup errors — no user feedback on failure | `src/dashboard/src/components/SprintControlPanel.tsx` |
| RC-A029 | crit | root-cause | Session token (OIDC/manual-login) is never forwarded to shared API fetch functions — all n | `src/dashboard/src/lib/api.ts` |
| RC-A030 | crit | root-cause | deckent_plan writes task files to disk despite documenting itself as dry-run-only | `src/mcp/tools/plan.ts` |
| RC-A031 | crit | root-cause | Signal C (sequence monotonicity) in isWorkerStale can NEVER suppress a stale alert — logic | `src/monitor/auditor.ts` |
| RC-A032 | crit | root-cause | RBAC enforcement is permanently soft by default — enforce_rbac flag defaults to false, mak | `src/nervous/authority-matrix.ts` |
| RC-A033 | crit | root-cause | handleSuggestTimeout auto-applies actions without consulting the canAutoApplyMap predicate | `src/nervous/executor.ts` |
| RC-A034 | crit | root-cause | authority-enforcer ADR compliance (enforceAdrCompliance) fails open on any internal error  | `src/orchestra/authority-enforcer.ts` |
| RC-A035 | crit | root-cause | Sprint-kind entries receive unconditional ok=true — runSprint result is trust-without-veri | `src/orchestra/autonomous/execute-dispatcher.ts` |
| RC-A036 | crit | root-cause | v2 mission scheduler dispatches 'approval-required' and 'risk-tagged' work items without a | `src/orchestra/autonomous/mission-store/mission-scheduler.ts` |
| RC-A037 | crit | root-cause | RBAC authority gate is permanently soft-warn in production: enforce_rbac defaults to undef | `src/orchestra/autonomous/runtime-loop.ts` |
| RC-A038 | crit | root-cause | RBAC enforcement is permanently advisory: enforce_rbac defaults false with no mechanism to | `src/orchestra/backlog-trigger.ts` |
| RC-A039 | crit | root-cause | Cross-verify REFUTED verdict is purely advisory with no enforcement path — a structural tr | `src/orchestra/cross-verify-runner.ts` |
| RC-A040 | crit | root-cause | handleWorkerQuestion always auto-responds 'continue', silently discarding worker's suggest | `src/orchestra/ipc-registry.ts` |
| RC-A041 | crit | root-cause | reconcileRubricNoGo accepts worker-self-reported coverage as ground truth to flip Brain NO | `src/orchestra/mid-sprint-adapter.ts` |
| RC-A042 | crit | root-cause | monitor-adapter.ts uses spawnSync — blocks event loop in async context, violating ADR-087 | `src/orchestra/monitor-adapter.ts` |
| RC-A043 | crit | root-cause | Post-sprint smoke defaultSmokeRunner is an unconditional no-op stub — even when wired, it  | `src/orchestra/post-sprint-smoke.ts` |
| RC-A044 | crit | root-cause | DockerSpawnBackend (the default backend) completely bypasses the toggle-independent SAFETY | `src/orchestra/spawn-backend.ts` |
| RC-A045 | crit | root-cause | PanicGuard BLOCK decision is advisory-only: the worker kill proceeds regardless | `src/orchestra/sprint-controller.ts` |
| RC-A046 | crit | root-cause | runHonestyCheck stub always returns 0 — honesty gate in runSelfAuditGate can never trigger | `src/orchestra/sprint-finalizer.ts` |
| RC-A047 | crit | root-cause | SprintMetrics.boundaryViolations is always hardcoded to 0 — boundary violation check in re | `src/orchestra/sprint-metrics.ts` |
| RC-A048 | crit | root-cause | getRollbackPolicy 'ask' return value is silently ignored — partial NO_GO sprints never pro | `src/orchestra/sprint-phases.ts` |
| RC-A049 | crit | root-cause | RBAC enforcement defaults to advisory-only (warn-not-block) — security gate is structurall | `src/orchestra/sprint-runtime.ts` |
| RC-A050 | crit | root-cause | RBAC enforcement is advisory-only by default with no structural guarantee that hard mode i | `src/orchestra/sprint-runtime.ts` |
| RC-A051 | crit | root-cause | spawnSync in task-restoration.ts runs inside async finalizeSprint, violating ADR-087 and b | `src/orchestra/task-restoration.ts` |
| RC-A052 | crit | root-cause | BedrockAdapter registered as ProviderAdapter but spawn() always throws — HTTP send() path  | `src/providers/bedrock.ts` |
| RC-A053 | high | root-cause | IMMUTABLE_CORE claims rm -rf / force-push / secrets never auto-run but the programmatic SA | `src/agent/identity.ts` |
| RC-A054 | high | root-cause | OpenAI adapter silently drops tool calls when finish_reason is 'stop' instead of 'tool_cal | `src/agent/provider-tooluse/openai.ts` |
| RC-A055 | high | root-cause | F5 evolution feedback loop structurally broken: no version stats ever written, retro wire  | `src/agents/prompt-version.ts` |
| RC-A056 | high | root-cause | Verify loop gate is advisory-only: writeResult does not check for verify-ran marker | `src/agents/worker.ts` |
| RC-A057 | high | root-cause | Honest-gate in writeResult only checks DONE self-assessment — GO_WITH_TECH_DEBT stub bypas | `src/agents/worker.ts` |
| RC-A058 | high | root-cause | Lineage branch calls deriveRequestPrincipal without authGateVerified — isAdmin bypass via  | `src/api/autonomous-endpoint.ts` |
| RC-A059 | high | root-cause | writeNervousIpcApproval silently swallows write failures — HTTP 200 returned even when IPC | `src/api/nervous-endpoint.ts` |
| RC-A060 | high | root-cause | reconcileStatusResponse returns idle for a STARTING sprint (active state, no dashboard yet | `src/api/status-reconcile.ts` |
| RC-A061 | high | root-cause | agentic-session.ts memory adapter built but never wired into the REPL — session persistenc | `src/cli/commands/agentic-session.ts` |
| RC-A062 | high | root-cause | createSubscriptionChatAdapter resolves a ProviderAdapter from registry then immediately di | `src/cli/commands/chat-native.ts` |
| RC-A063 | high | root-cause | Parallel bridge-construction paths: initReplMcpBridge (flag-gated) vs chat-native inline b | `src/cli/commands/chat-native.ts` |
| RC-A064 | high | root-cause | `deckent flow run` daemon callback only prints flow count — never executes the actual flow | `src/cli/commands/flow.ts` |
| RC-A065 | high | root-cause | `deckent nervous edit` bypasses the live-executor IPC gate, causing two-writer race and au | `src/cli/commands/nervous.ts` |
| RC-A066 | high | root-cause | resume command re-enters runSprint without passing completed-task list — already-done task | `src/cli/commands/resume.ts` |
| RC-A067 | high | root-cause | --auto-approve CLI flag description says it controls worker spawning but autoApprove is ha | `src/cli/commands/start.ts` |
| RC-A068 | high | root-cause | getMessage() silently returns the key string on missing key — typos in message keys are in | `src/cli/helpers/messages.ts` |
| RC-A069 | high | root-cause | Discord's sendMessage silently drops the message if the channel is not found or is not tex | `src/connectors/discord.ts` |
| RC-A070 | high | root-cause | Silent catch in resolveAndAck — failed approval resolutions give user zero feedback | `src/connectors/incoming-command-router.ts` |
| RC-A071 | high | root-cause | CascadeDetector.onResult does not re-check paused state — sprint can continue processing a | `src/core/cascade-detector.ts` |
| RC-A072 | high | root-cause | DecisionEngineConfig / LearningConfig / CollaborationConfig validated-but-never-applied: s | `src/core/decision-config.ts` |
| RC-A073 | high | root-cause | nextSequence() claims to be atomic but performs non-atomic read-modify-write on the sequen | `src/core/event-stream.ts` |
| RC-A074 | high | root-cause | FlowRuntime.tick hardcodes empty arrays for triggers and events, silently voiding the even | `src/core/flow-runtime.ts` |
| RC-A075 | high | root-cause | runPostFinalizeHooks: all steps are fail-safe (catch-and-continue) with no way to surface  | `src/core/identity-generator.ts` |
| RC-A076 | high | root-cause | AST security scan in skill-sandbox silently falls back to no-op when TypeScript compiler i | `src/core/marketplace/skill-sandbox.ts` |
| RC-A077 | high | root-cause | OutputCollector uses spawnSync for docker/tmux polling, blocking the event loop in the hot | `src/core/output-collector.ts` |
| RC-A078 | high | root-cause | detectClaude() reports authMethod='session' unconditionally when CLI is installed — no rea | `src/core/provider.ts` |
| RC-A079 | high | root-cause | siem-forwarder is default-off (no-op) with no enforcement: missing transport silently disc | `src/core/siem-forwarder.ts` |
| RC-A080 | high | root-cause | SprintControlPanel passes permanently no-op onSelect to WorkerCardGrid — worker card click | `src/dashboard/src/components/SprintControlPanel.tsx` |
| RC-A081 | high | root-cause | SprintSummary elapsed time and ETA computed from last-poll timestamp instead of sprint sta | `src/dashboard/src/components/SprintSummary.tsx` |
| RC-A082 | high | root-cause | deckent:unauthorized custom event is dispatched on 401 but no listener exists anywhere — 4 | `src/dashboard/src/lib/api.ts` |
| RC-A083 | high | root-cause | WorkersPage kill failure is silently swallowed with no user feedback — operator blindness  | `src/dashboard/src/pages/WorkersPage.tsx` |
| RC-A084 | high | root-cause | enrichResponse produces silent wrong summaries for 4 tools (audit, autonomous, process, re | `src/mcp/helpers/enrich.ts` |
| RC-A085 | high | root-cause | formatDoctorResponse always reports all checks as failed — .ok vs .passed field mismatch | `src/mcp/helpers/format.ts` |
| RC-A086 | high | root-cause | deckent_kill (MCP) only marks task status PAUSED in JSON — actual worker process (tmux/doc | `src/mcp/tools/kill.ts` |
| RC-A087 | high | root-cause | failedTasks hardcoded to 0 in MCP status rich-format path — NO_GO count always silently hi | `src/mcp/tools/status.ts` |
| RC-A088 | high | root-cause | checkBoundaryViolations blames EVERY worker for EVERY out-of-scope changed file — guarante | `src/monitor/auditor.ts` |
| RC-A089 | high | root-cause | DebtTrendAnalyzer always computes 0% debt rate — detector permanently inert | `src/nervous/detectors/debt-trend.ts` |
| RC-A090 | high | root-cause | DebtTrendAnalyzer opens a MemoryStore (SQLite) connection on every detect() call without c | `src/nervous/detectors/debt-trend.ts` |
| RC-A091 | high | root-cause | TaskModeIdleDetector emits METRIC_EMIT with wrong payload schema — handleMetricEmit will a | `src/nervous/detectors/task-mode-idle.ts` |
| RC-A092 | high | root-cause | canAutoApply predicate veto is logged to console.log only, not to the structured audit his | `src/nervous/executor.ts` |
| RC-A093 | high | root-cause | emitViolationEvent in runtime-scope-check uses bare require() in a pure ESM package — alwa | `src/nervous/runtime-scope-check.ts` |
| RC-A094 | high | root-cause | sprint-kind entries get unconditional ok=true without Brain/Auditor evaluation — trust-wit | `src/orchestra/autonomous/execute-dispatcher.ts` |
| RC-A095 | high | root-cause | v2 engine boot path omits store.recover() — items stuck 'running' after a crash are perman | `src/orchestra/autonomous/mission-store/mission-engine-wire.ts` |
| RC-A096 | high | root-cause | SqliteMissionStore.recover() is defined in the interface but never called — crash recovery | `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts` |
| RC-A097 | high | root-cause | captureVitestBaseline uses spawnSync, violating ADR-087 async subprocess requirement and r | `src/orchestra/baseline-tracker.ts` |
| RC-A098 | high | root-cause | sprintLogUpdater appends unconditionally — no idempotency guard causes duplicate sprint se | `src/orchestra/doc-updaters/sprint-log.ts` |
| RC-A099 | high | root-cause | deckent_watch MCP tool subscribes to eventBus but never calls watchFile() — receives zero  | `src/orchestra/event-bus.ts` |
| RC-A100 | high | root-cause | reconcileSpuriousNoGo calls spawnSync with 120-second timeout inside synchronous evaluateW | `src/orchestra/mid-sprint-adapter.ts` |
| RC-A101 | high | root-cause | planner.ts uses spawnSync for AI planner subprocess calls — violates ADR-087 (Async I/O St | `src/orchestra/planner.ts` |
| RC-A102 | high | root-cause | disk-verify MANUAL_REVIEW_REQUIRED reclassification does not block cascade or sprint evalu | `src/orchestra/result-collector.ts` |
| RC-A103 | high | root-cause | applyTechDebtDowngrade verify-delta gate is a trust-without-verify pattern: Brain accepts  | `src/orchestra/result-evaluator.ts` |
| RC-A104 | high | root-cause | Sprint lifecycle events emitted as 'deckent-event' on EventEmitter have no listeners — Ner | `src/orchestra/sprint-controller.ts` |
| RC-A105 | high | root-cause | Adaptive timeout config knobs are soft-defined but never enforced — sprint-phases.ts uses  | `src/orchestra/sprint-controller.ts` |
| RC-A106 | high | root-cause | runDecayPhase drops decaySprints config — memory-loss regression if called | `src/orchestra/sprint-phases.ts` |
| RC-A107 | high | root-cause | Legacy spawn path re-spawns non-PENDING tasks — tasks in EXECUTING/DONE/NO_GO status eligi | `src/orchestra/sprint-spawner.ts` |
| RC-A108 | high | root-cause | task-mode-runner.ts comment claims deckent_run MCP uses runTaskMode, but MCP reimplements  | `src/orchestra/task-mode-runner.ts` |
| RC-A109 | high | root-cause | Codex and Gemini worker heartbeats are written once at spawn with sequence:0 and never upd | `src/providers/codex.ts` |
| RC-A110 | high | root-cause | SandboxSpawnBackend.buildEnv() is never called from spawn() — memory limit and network blo | `src/providers/sandbox.ts` |
| RC-A111 | high | root-cause | aligned and general corpora share the same MsgExample object references | `src/training/cc-trace-extractor.ts` |
| RC-A112 | medi | root-cause | trace-recorder.appendTrace() uses synchronous blocking I/O (appendFileSync) on the hot per | `src/agent/trace-recorder.ts` |
| RC-A113 | medi | root-cause | output-stream sends duplicate lines when CircularBuffer has dropped entries — slice index  | `src/api/output-stream.ts` |
| RC-A114 | medi | root-cause | realPlannerComplete uses spawnSync in the JIT-detail hot path — blocks event loop during a | `src/cli/commands/autonomous.ts` |
| RC-A115 | medi | root-cause | `onboard.ts` uses `spawnSync` for subprocess execution, blocking the event loop for up to  | `src/cli/commands/onboard.ts` |
| RC-A116 | medi | root-cause | IncomingMessageRouter.route() (webhook path) publishes INCOMING_MESSAGE to eventBus but no | `src/connectors/incoming-router.ts` |
| RC-A117 | medi | root-cause | Writer-lease heartbeat is only refreshed on write calls — idle owner window loses lease af | `src/mcp/writer-lease.ts` |
| RC-A118 | medi | root-cause | makeStaticNumstatProvider and makeStaticLsOthersProvider are test-seam helpers exported fr | `src/orchestra/disk-verify.ts` |
| RC-A119 | medi | root-cause | runAllUpdaters silently swallows all updater exceptions — errors are invisible to callers | `src/orchestra/doc-updaters/registry.ts` |
| RC-A120 | medi | root-cause | process-runtime makeProcessResult hardcodes linesAdded=0, linesRemoved=0, coverage=0 regar | `src/orchestra/process-runtime.ts` |
| RC-A121 | medi | root-cause | findTempEntityDir uses CommonJS require('fs') inside an ESM module — violates ADR-001/ADR- | `src/orchestra/promotion-pipeline.ts` |
| RC-A122 | medi | root-cause | maybeRunDocTrackingSync returns ran:true on both success and error, making the flag a no-o | `src/orchestra/sprint-finalizer.ts` |
| RC-A123 | medi | root-cause | SubprocessSpawnBackend fallback result awards GO_WITH_TECH_DEBT for exit-code-0 workers th | `src/providers/subprocess.ts` |
| UNW-A001 | crit | unwired | SandboxSpawnBackend is never instantiated in any production code path | `src/providers/sandbox.ts` |
| UNW-A002 | high | unwired | AgentSession.cancel() is never called in production — in-flight turns cannot be stopped | `src/agent/session.ts` |
| UNW-A003 | high | unwired | AgentSession.setApprovalMode() is never called in production — /approve command has no eff | `src/agent/session.ts` |
| UNW-A004 | high | unwired | src/agents/cross-sprint-analyzer.ts — entire CrossSprintAnalyzer class has zero production | `src/agents/cross-sprint-analyzer.ts` |
| UNW-A005 | high | unwired | src/agents/permission-guard.ts — PermissionGuard class has zero production callers | `src/agents/permission-guard.ts` |
| UNW-A006 | high | unwired | PromptEvolutionLog class (agents/prompt-evolution.ts) has zero production callers | `src/agents/prompt-evolution.ts` |
| UNW-A007 | high | unwired | PromptVersionManager.updateVersionStats never called — prompt version stats permanently fr | `src/agents/prompt-version.ts` |
| UNW-A008 | high | unwired | SpecializationDriftDetector pipeline never invoked in the RETRO phase | `src/agents/specialization-drift.ts` |
| UNW-A009 | high | unwired | IPC PAUSE/RESUME/KILL messages sent to workers but worker-side listener (WorkerSideChannel | `src/agents/worker-ipc.ts` |
| UNW-A010 | high | unwired | enforceVerifyLoop and the entire verify-loop function suite have zero production callers | `src/agents/worker-verify.ts` |
| UNW-A011 | high | unwired | authHealthCheck exported but never called in any production code path | `src/agents/worker.ts` |
| UNW-A012 | high | unwired | setupTaskSnapshot exported but never called in any production spawn path | `src/agents/worker.ts` |
| UNW-A013 | high | unwired | agentic-session.ts exports are never consumed in production | `src/cli/commands/agentic-session.ts` |
| UNW-A014 | high | unwired | chat-mode.ts: resolveChatMode, filterRegistryByMode, isEnterpriseSlash never imported in p | `src/cli/commands/chat-mode.ts` |
| UNW-A015 | high | unwired | parseToolCallFromText exported but has zero production callers | `src/cli/commands/chat-native.ts` |
| UNW-A016 | high | unwired | `renderStatusLine` exported but never called in production | `src/cli/commands/chat-status-line.ts` |
| UNW-A017 | high | unwired | `classifyChatIntent`, `buildNaiveSystemPrompt`, `probeProviders`, `selectProvider`, `loadC | `src/cli/commands/chat.ts` |
| UNW-A018 | high | unwired | doctor-format.ts: entire file is dead — zero production callers | `src/cli/commands/doctor-format.ts` |
| UNW-A019 | high | unwired | ProgressPersistence class has zero production callers | `src/cli/helpers/progress-persistence.ts` |
| UNW-A020 | high | unwired | ProgressRenderer class has zero production callers | `src/cli/helpers/progress.ts` |
| UNW-A021 | high | unwired | QueueDisplay class has zero production callers | `src/cli/helpers/queue-display.ts` |
| UNW-A022 | high | unwired | RecommendationEngine class has zero production callers | `src/cli/helpers/recommendations.ts` |
| UNW-A023 | high | unwired | ReviewActions class has zero production callers | `src/cli/helpers/review-actions.ts` |
| UNW-A024 | high | unwired | ReviewSummary class has zero production callers | `src/cli/helpers/review-summary.ts` |
| UNW-A025 | high | unwired | SelectiveRetry class has zero production callers | `src/cli/helpers/selective-retry.ts` |
| UNW-A026 | high | unwired | RichSprintSummary class (sprint-summary.ts) has zero production callers | `src/cli/helpers/sprint-summary.ts` |
| UNW-A027 | high | unwired | terminal-utils.ts — all exports unreachable from production code | `src/cli/helpers/terminal-utils.ts` |
| UNW-A028 | high | unwired | WorkerStatusTracker class — zero production callers | `src/cli/helpers/worker-status.ts` |
| UNW-A029 | high | unwired | initReplMcpBridge() and isMcpClientEnabled() exported but never called in production | `src/cli/repl/mcp-bridge.ts` |
| UNW-A030 | high | unwired | ConnectorPool class has zero production callers — test-only artifact | `src/connectors/connector-pool.ts` |
| UNW-A031 | high | unwired | getSkillAgentAffinityBonus / SKILL_AGENT_MAP exported but never called in production | `src/core/activation-engine.ts` |
| UNW-A032 | high | unwired | audit-export.ts: exportAuditLog and verifyHmacChain have zero production callers | `src/core/audit-export.ts` |
| UNW-A033 | high | unwired | SessionStore (auth-session.ts) has zero production callers | `src/core/auth-session.ts` |
| UNW-A034 | high | unwired | CascadeDetector: sprint 140 cost-explosion guard has zero production callers | `src/core/cascade-detector.ts` |
| UNW-A035 | high | unwired | CredentialManager and all credential helpers have zero production callers | `src/core/credentials.ts` |
| UNW-A036 | high | unwired | createDefaultDecisionConfig / createDefaultLearningConfig / createDefaultCollaborationConf | `src/core/decision-config.ts` |
| UNW-A037 | high | unwired | buildErpConnectorFromDeck — .deck-aware ERP factory has zero production callers | `src/core/erp-connector.ts` |
| UNW-A038 | high | unwired | emitDependencyResolvedByFix() documented as the fix-resolution signal but never wired | `src/core/event-stream.ts` |
| UNW-A039 | high | unwired | global-config.ts: all six exported functions have zero production callers | `src/core/global-config.ts` |
| UNW-A040 | high | unwired | resolveInteractionPolicy and InteractionPolicy have zero production callers | `src/core/interaction-policy.ts` |
| UNW-A041 | high | unwired | DependencyResolver class has zero production callers | `src/core/marketplace/dependency-resolver.ts` |
| UNW-A042 | high | unwired | RatingSystem class has zero production callers | `src/core/marketplace/rating-system.ts` |
| UNW-A043 | high | unwired | exportAdrsToFs (DB→FS ADR reverse sync) has zero production callers | `src/core/memory-export.ts` |
| UNW-A044 | high | unwired | notification-config.ts is entirely unimported in production — all three exports are test-o | `src/core/notification-config.ts` |
| UNW-A045 | high | unwired | DiscordNotificationProvider (notification-providers/discord.ts) is never wired into the pr | `src/core/notification-providers/discord.ts` |
| UNW-A046 | high | unwired | SlackNotificationProvider, DiscordNotificationProvider, WebhookNotificationProvider — zero | `src/core/notification-providers/slack.ts` |
| UNW-A047 | high | unwired | NotificationDispatcher class (notifications.ts) — never instantiated in production | `src/core/notifications.ts` |
| UNW-A048 | high | unwired | src/core/provider-capabilities.ts has zero production callers — entire module is dead | `src/core/provider-capabilities.ts` |
| UNW-A049 | high | unwired | enforceRbac() exported from rbac.ts but never imported in production code | `src/core/rbac.ts` |
| UNW-A050 | high | unwired | PendingDispatchQueue class (self-dispatch.ts) has zero production callers | `src/core/self-dispatch.ts` |
| UNW-A051 | high | unwired | SkillLoadingCache class has zero production callers | `src/core/skill-cache.ts` |
| UNW-A052 | high | unwired | SkillRegistry class has zero production callers | `src/core/skill-registry.ts` |
| UNW-A053 | high | unwired | spawn-safety.ts — assertSpawnSafe/isSpawnSafe have zero production callers | `src/core/spawn-safety.ts` |
| UNW-A054 | high | unwired | TelemetryCollector class has zero production callers | `src/core/telemetry.ts` |
| UNW-A055 | high | unwired | All 4 dashboard analytics classes have zero production callers | `src/dashboard/analytics/agent-comparison-data.ts` |
| UNW-A056 | high | unwired | AppShell component is never imported in any production code path | `src/dashboard/src/components/AppShell.tsx` |
| UNW-A057 | high | unwired | RoutingDistribution exported but has zero production callers | `src/dashboard/src/components/RoutingDistribution.tsx` |
| UNW-A058 | high | unwired | SprintControlPanel exported but has zero production callers | `src/dashboard/src/components/SprintControlPanel.tsx` |
| UNW-A059 | high | unwired | WorkerGrid component exported but never imported by any production page | `src/dashboard/src/components/WorkerGrid.tsx` |
| UNW-A060 | high | unwired | MultiSessionManager, copyToClipboard, getClipboardText never imported in production | `src/dashboard/src/lib/terminal-sessions.ts` |
| UNW-A061 | high | unwired | theme.ts exports (darkTokens, lightTokens, getThemeTokens, themeClasses) have zero product | `src/dashboard/src/lib/theme.ts` |
| UNW-A062 | high | unwired | getMcpConfig() exported but has zero production callers | `src/extensions/vscode/extension.ts` |
| UNW-A063 | high | unwired | cleanupOrphanHBs / detectOrphans exported but never called in production | `src/monitor/auditor.ts` |
| UNW-A064 | high | unwired | enforceAdrCompliance (ADR layer-4 compliance gate) has zero production callers — only refe | `src/orchestra/authority-enforcer.ts` |
| UNW-A065 | high | unwired | MissionEventLog is exported but has zero production callers | `src/orchestra/autonomous/mission-store/mission-events.ts` |
| UNW-A066 | high | unwired | batch-stats.ts: BatchStatsUpdater class has zero production callers | `src/orchestra/batch-stats.ts` |
| UNW-A067 | high | unwired | brain-context.ts: all exported enrichment functions have zero production callers | `src/orchestra/brain-context.ts` |
| UNW-A068 | high | unwired | capability-realizer.ts: realizeCapabilities() and CapabilitySpec are never used in product | `src/orchestra/capability-realizer.ts` |
| UNW-A069 | high | unwired | capability-realizer.ts (realizeCapabilities) has zero production callers | `src/orchestra/capability-realizer.ts` |
| UNW-A070 | high | unwired | ConflictResolver class has zero production callers | `src/orchestra/conflict-resolver.ts` |
| UNW-A071 | high | unwired | sprintMetricsUpdater exported but never registered — runs on no sprint | `src/orchestra/doc-updaters/metrics-updater.ts` |
| UNW-A072 | high | unwired | handleRateLimitFailover / applyRateLimitFailover never called in production | `src/orchestra/mid-sprint-adapter.ts` |
| UNW-A073 | high | unwired | monitor-adapter.ts (MonitorAdapter / createMonitorAdapter) has zero production callers | `src/orchestra/monitor-adapter.ts` |
| UNW-A074 | high | unwired | multi-agent.ts (definePipeline / runPipeline) is never imported from production code | `src/orchestra/multi-agent.ts` |
| UNW-A075 | high | unwired | PatternReader and PatternRecorder are dead code — zero production callers | `src/orchestra/pattern-reader.ts` |
| UNW-A076 | high | unwired | callZeroConfigPlanner, auditPlanGroundTruth, validateGoCriteriaScope, buildZeroConfigFallb | `src/orchestra/planner.ts` |
| UNW-A077 | high | unwired | runPostSprintSmoke and all post-sprint-smoke exports have zero production callers — the en | `src/orchestra/post-sprint-smoke.ts` |
| UNW-A078 | high | unwired | applyProofOfFunctionGate and verifyProofOfFunction have zero production callers — Tier-1 g | `src/orchestra/proof-of-function.ts` |
| UNW-A079 | high | unwired | applyTechDebtDowngrade has zero production callers — verify-delta downgrade layer is dead | `src/orchestra/result-evaluator.ts` |
| UNW-A080 | high | unwired | ResultMerger class has zero production callers | `src/orchestra/result-merger.ts` |
| UNW-A081 | high | unwired | getEffectClass() exported but has zero production callers; only tests call it | `src/orchestra/rubric-registry.ts` |
| UNW-A082 | high | unwired | enforceSelfModifyingTask() exported but has zero production callers | `src/orchestra/self-modifying-detector.ts` |
| UNW-A083 | high | unwired | writeHonestCiBaseline has zero production callers | `src/orchestra/sprint-docs-updater.ts` |
| UNW-A084 | high | unwired | sprint-estimator.ts: all exports have zero production callers | `src/orchestra/sprint-estimator.ts` |
| UNW-A085 | high | unwired | runHonestyCheck is exported but never called in production | `src/orchestra/sprint-finalizer.ts` |
| UNW-A086 | high | unwired | Six sprint retro telemetry functions exported but never called in the live retro pipeline | `src/orchestra/sprint-reporter.ts` |
| UNW-A087 | high | unwired | applyPersonaDomainCheck has zero production callers — persona rotation never activates | `src/orchestra/task-builder.ts` |
| UNW-A088 | high | unwired | inferFixMode has zero production callers — FIX worker idempotency mode is never computed | `src/orchestra/task-builder.ts` |
| UNW-A089 | high | unwired | restoreFromSnapshot has zero production callers | `src/orchestra/task-restoration.ts` |
| UNW-A090 | high | unwired | task-retry.ts: all exports have zero production callers | `src/orchestra/task-retry.ts` |
| UNW-A091 | high | unwired | TimeoutWatcher class and all its exports are dead code — zero production callers | `src/orchestra/timeout-watcher.ts` |
| UNW-A092 | medi | unwired | isTerminalEvent() exported but never called in production | `src/agent/events.ts` |
| UNW-A093 | medi | unwired | RuleStore.revoke() implemented but never called in production | `src/agent/permission-store.ts` |
| UNW-A094 | medi | unwired | adaptAgent() exported but has zero production callers | `src/agents/adaptive-agent.ts` |
| UNW-A095 | medi | unwired | AgentRetirement.reinstate() has zero production callers | `src/agents/agent-retirement.ts` |
| UNW-A096 | medi | unwired | src/agents/auditor.ts re-export module — enforceAdrCompliance re-export has no production  | `src/agents/auditor.ts` |
| UNW-A097 | medi | unwired | PromptAnalytics unified class — zero production callers; only sub-classes are used directl | `src/agents/prompt-analytics.ts` |
| UNW-A098 | medi | unwired | verifyResultPersisted exported but never called in any production code | `src/agents/worker.ts` |
| UNW-A099 | medi | unwired | src/api/rate-limiter.ts RateLimiter class has zero production callers | `src/api/rate-limiter.ts` |
| UNW-A100 | medi | unwired | OidcAuthProvider exported but never instantiated in production | `src/api/terminal/auth-provider.ts` |
| UNW-A101 | medi | unwired | selectOption exported from agentic-confirm.ts has zero production callers | `src/cli/commands/agentic-confirm.ts` |
| UNW-A102 | medi | unwired | enterpriseSlashNames() exported but never called outside tests | `src/cli/commands/chat-enterprise-bridge.ts` |
| UNW-A103 | medi | unwired | createMcpAuditSink() exported but never called in production | `src/cli/commands/chat-mcp-bridge.ts` |
| UNW-A104 | medi | unwired | createMcpToolDispatcher exported but never called in production code | `src/cli/commands/chat-native.ts` |
| UNW-A105 | medi | unwired | renderMarkdown never called in production code path | `src/cli/commands/chat-render.ts` |
| UNW-A106 | medi | unwired | createReplLines and ReplHistory exported from chat-repl-ux but never used in production | `src/cli/commands/chat-repl-ux.ts` |
| UNW-A107 | medi | unwired | reduceSlashMenu and SlashMenuState exported but never used in production entry point | `src/cli/commands/chat-slash-menu.ts` |
| UNW-A108 | medi | unwired | `cliArgsFor` exported from `chat-tool-bridge.ts` but has no external production callers —  | `src/cli/commands/chat-tool-bridge.ts` |
| UNW-A109 | medi | unwired | listCheckpointedSprints exported from resume.ts with zero production callers | `src/cli/commands/resume.ts` |
| UNW-A110 | medi | unwired | retro-formatter.ts and retro-parser.ts are dead production modules — only referenced by te | `src/cli/commands/retro-formatter.ts` |
| UNW-A111 | medi | unwired | reprovisionWorkerImageAfterUpgrade documented as post-upgrade hook but never called after  | `src/cli/commands/upgrade.ts` |
| UNW-A112 | medi | unwired | cleanupWatchWindow exported with JSDoc saying cleanup.ts can call it — no production calle | `src/cli/commands/watch.ts` |
| UNW-A113 | medi | unwired | AgentPerformanceFormatter class has zero production callers — only called by tests | `src/cli/helpers/agent-performance.ts` |
| UNW-A114 | medi | unwired | ChangeCategorizer class has zero production callers — only called by tests | `src/cli/helpers/change-categorizer.ts` |
| UNW-A115 | medi | unwired | ETACalculator class exported but has zero production callers | `src/cli/helpers/eta-calculator.ts` |
| UNW-A116 | medi | unwired | output-mode module (setOutputMode, wrapLogger, etc.) has zero production callers | `src/cli/helpers/output-mode.ts` |
| UNW-A117 | medi | unwired | SprintComparison class (helpers) has zero production callers — shadows orchestra's SprintC | `src/cli/helpers/sprint-comparison.ts` |
| UNW-A118 | medi | unwired | Theme class and theme singleton — zero production callers | `src/cli/helpers/theme.ts` |
| UNW-A119 | medi | unwired | initReplMcpBridge — composition root never called in any production code path | `src/cli/repl/mcp-bridge.ts` |
| UNW-A120 | medi | unwired | createStreamOutputHandler / StreamOutputHandler exported from native-transport but never c | `src/cli/repl/native-transport.ts` |
| UNW-A121 | medi | unwired | approvalCallbackData — exported helper with zero production callers | `src/connectors/callback-router.ts` |
| UNW-A122 | medi | unwired | AgentSelectionCache class exported from agent-cache.ts has zero production callers | `src/core/agent-cache.ts` |
| UNW-A123 | medi | unwired | suggestNewAgent exported from agent-selector.ts has zero production callers | `src/core/agent-selector.ts` |
| UNW-A124 | medi | unwired | audit-query.ts: filterByCorrelation, filterByCausation, groupByActor exported but never ca | `src/core/audit-query.ts` |
| UNW-A125 | medi | unwired | regenerateConfigSafe and REGEN_TEMPLATE_DEFAULTS exported but never called | `src/core/config.ts` |
| UNW-A126 | medi | unwired | generateConfigReference() in config.ts is never called — a parallel implementation in init | `src/core/config.ts` |
| UNW-A127 | medi | unwired | wroteTestsForStack and getCoverageAdapter exported but never called in production | `src/core/coverage-adapters.ts` |
| UNW-A128 | medi | unwired | isValidTaskType and createDefaultAnalysis — zero production callers | `src/core/decision-types.ts` |
| UNW-A129 | medi | unwired | extractLineage() exported but never called in production code | `src/core/event-stream.ts` |
| UNW-A130 | medi | unwired | reconstructState() exported but never called in production code | `src/core/event-stream.ts` |
| UNW-A131 | medi | unwired | EventTrigger/IncomingEvent/matchTrigger: event-dispatch path structurally unreachable in a | `src/core/event-trigger.ts` |
| UNW-A132 | medi | unwired | LazyMap and lazyLoad utility have zero production callers | `src/core/lazy-loader.ts` |
| UNW-A133 | medi | unwired | migrateAgentManifest and migrateSkillManifest have zero production callers | `src/core/manifest-migrator.ts` |
| UNW-A134 | medi | unwired | Memory rebuild safety functions (backupRelations, restoreRelations, rebuildWithRelationSaf | `src/core/memory-import.ts` |
| UNW-A135 | medi | unwired | buildAutoQuery() exported but never imported in any production file | `src/core/memory-query.ts` |
| UNW-A136 | medi | unwired | MemoryQueryError exported but never caught or referenced outside memory-query.ts | `src/core/memory-query.ts` |
| UNW-A137 | medi | unwired | getModelsInTier() and getProviderModels() in model-equivalence.ts have no production calle | `src/core/model-equivalence.ts` |
| UNW-A138 | medi | unwired | bootstrapFromCatalog in model-registry.ts is a dead duplicate never imported | `src/core/model-registry.ts` |
| UNW-A139 | medi | unwired | isEconomyAllowedForKind and isCodeKindString exported from model-tier-guard.ts with zero p | `src/core/model-tier-guard.ts` |
| UNW-A140 | medi | unwired | SkillMeta interface in monitoring-types.ts is only used in tests | `src/core/monitoring-types.ts` |
| UNW-A141 | medi | unwired | notification-config.ts functions (validateNotificationConfig, getDefaultNotificationConfig | `src/core/notification-config.ts` |
| UNW-A142 | medi | unwired | notifyProgress() exported but has zero production callers | `src/core/notify.ts` |
| UNW-A143 | medi | unwired | PanicGuard.buildNotification() method is never called in production | `src/core/panic-guard.ts` |
| UNW-A144 | medi | unwired | resolveProviderWithFallback() exported from provider.ts has zero production callers | `src/core/provider.ts` |
| UNW-A145 | medi | unwired | src/core/rate-limiter.ts RateLimiter class (FlowConfig-backed) has zero production callers | `src/core/rate-limiter.ts` |
| UNW-A146 | medi | unwired | src/core/rate-limiter.ts (enterprise per-tenant RateLimiter) has zero production callers | `src/core/rate-limiter.ts` |
| UNW-A147 | medi | unwired | enforceRbac() in core/rbac.ts has zero production callers — RBAC enforcement bypasses this | `src/core/rbac.ts` |
| UNW-A148 | medi | unwired | Connector.isProviderReady() has zero production callers | `src/core/session-interface.ts` |
| UNW-A149 | medi | unwired | Connector.unregisterProvider() has zero production callers | `src/core/session-interface.ts` |
| UNW-A150 | medi | unwired | subscription.ts — saveSubscriptionToConfig and checkModeCompatibility never called in prod | `src/core/subscription.ts` |
| UNW-A151 | medi | unwired | ALL_PROVIDER_NAMES constant exported from types.ts has zero production callers | `src/core/types.ts` |
| UNW-A152 | medi | unwired | formatDate and formatRelativeTime from utils.ts have zero production callers | `src/core/utils.ts` |
| UNW-A153 | medi | unwired | shouldRemoveResolvedDebt and deprecated parseDebtTable/generateDebtTable have zero product | `src/core/utils.ts` |
| UNW-A154 | medi | unwired | Three work-model adapter functions exported but never called in production | `src/core/work-model.ts` |
| UNW-A155 | medi | unwired | Onboarding wizard exported but has zero production callers | `src/dashboard/src/components/Onboarding.tsx` |
| UNW-A156 | medi | unwired | RefreshButton exported but has zero production callers | `src/dashboard/src/components/RefreshButton.tsx` |
| UNW-A157 | medi | unwired | SprintSummary exports 4 helper functions with zero production callers | `src/dashboard/src/components/SprintSummary.tsx` |
| UNW-A158 | medi | unwired | TaskCard exports 6 helper functions with zero production callers | `src/dashboard/src/components/TaskCard.tsx` |
| UNW-A159 | medi | unwired | routes.tsx ROUTES/RoutePath exports have zero production callers | `src/dashboard/src/routes.tsx` |
| UNW-A160 | medi | unwired | dedupAlerts (dashboard-manager) exported but has zero production callers | `src/monitor/dashboard-manager.ts` |
| UNW-A161 | medi | unwired | getMatrixByMode() exported but has zero production callers | `src/nervous/authority-matrix.ts` |
| UNW-A162 | medi | unwired | isSafetyFloorAction() in authority-matrix.ts is a dead duplicate — never imported | `src/nervous/authority-matrix.ts` |
| UNW-A163 | medi | unwired | ScopeCollisionMonitor.canAutoApply is never registered in the executor's canAutoApplyMap | `src/nervous/detectors/scope-collision.ts` |
| UNW-A164 | medi | unwired | NervousHistory.markUndone() has zero production callers | `src/nervous/history.ts` |
| UNW-A165 | medi | unwired | evaluatePanicGate exported but has zero production callers | `src/nervous/panic-gate.ts` |
| UNW-A166 | medi | unwired | makeSerialPool / makeBoundedPool exported but never called in production | `src/orchestra/autonomous/execution-pool.ts` |
| UNW-A167 | medi | unwired | baseline-tracker.ts: checkWorkerHonesty composite function is never called; sprint-finaliz | `src/orchestra/baseline-tracker.ts` |
| UNW-A168 | medi | unwired | DecisionOrchestrator class and full V1 pipeline never instantiated in production | `src/orchestra/decision-engine.ts` |
| UNW-A169 | medi | unwired | decision-replay.ts: replayDecision and diffDecisions have zero production callers | `src/orchestra/decision-replay.ts` |
| UNW-A170 | medi | unwired | detectGarbageThrows exported from honest-gate.ts has zero production callers | `src/orchestra/honest-gate.ts` |
| UNW-A171 | medi | unwired | loadUserGeneratorsAsync never wired — MJS plugin support permanently skipped | `src/orchestra/managed-docs/plugin-loader.ts` |
| UNW-A172 | medi | unwired | MultiAgentPipeline (orchestra/multi-agent.ts) definePipeline/runPipeline never imported in | `src/orchestra/multi-agent.ts` |
| UNW-A173 | medi | unwired | recordCrossVerifyVerdict has no production caller — REFUTED signals never fed back to rout | `src/orchestra/outcome-tracker.ts` |
| UNW-A174 | medi | unwired | recordCrossVerifyVerdict on OutcomeTracker is never called — cross-verify REFUTED signals  | `src/orchestra/outcome-tracker.ts` |
| UNW-A175 | medi | unwired | PromotionPipeline.runIdentityMutation() — method defined and exported but never called fro | `src/orchestra/promotion-pipeline.ts` |
| UNW-A176 | medi | unwired | evolvePromptCheckRollback / wirePromptEvolutionFromOutcomes / collectPromptEvolutionSugges | `src/orchestra/prompt-evolution.ts` |
| UNW-A177 | medi | unwired | filterSkillPrompts and computeSkillRelevance exported but never called in production (only | `src/orchestra/prompt-token-optimizer.ts` |
| UNW-A178 | medi | unwired | assessSkillRelevance has zero production callers — skill-relevance feedback loop is broken | `src/orchestra/quality-assessor.ts` |
| UNW-A179 | medi | unwired | checkVerifyMarkerHonesty has zero callers — honesty-marker check is never run | `src/orchestra/result-evaluator.ts` |
| UNW-A180 | medi | unwired | validateTokenUsage has zero production callers — token field validation is test-only | `src/orchestra/result-evaluator.ts` |
| UNW-A181 | medi | unwired | applyTechDebtDowngrade and the verify-delta pipeline are defined but never called | `src/orchestra/result-evaluator.ts` |
| UNW-A182 | medi | unwired | checkVerifyMarkerHonesty exported but never called in production | `src/orchestra/result-evaluator.ts` |
| UNW-A183 | medi | unwired | getDirtyFiles() and getCurrentBranch() exported but never called outside rollback.ts | `src/orchestra/rollback.ts` |
| UNW-A184 | medi | unwired | isDockerAvailable() exported from spawn-backend-docker.ts with no production caller | `src/orchestra/spawn-backend-docker.ts` |
| UNW-A185 | medi | unwired | getResumableTasks exported from sprint-checkpoint.ts but never called in production | `src/orchestra/sprint-checkpoint.ts` |
| UNW-A186 | medi | unwired | consultCollisionDecision exported from sprint-controller.ts but never called | `src/orchestra/sprint-controller.ts` |
| UNW-A187 | medi | unwired | emergencyRestoreDirectives is imported by sprint-reporter but never called | `src/orchestra/sprint-docs-updater.ts` |
| UNW-A188 | medi | unwired | cleanupPreviousSprintOrphans has zero production callers | `src/orchestra/sprint-lifecycle.ts` |
| UNW-A189 | medi | unwired | generateConfigSuggestions / detectRecurringFileErrors / buildBrainInsights in sprint-metri | `src/orchestra/sprint-metrics.ts` |
| UNW-A190 | medi | unwired | runDecayPhase exported but never called | `src/orchestra/sprint-phases.ts` |
| UNW-A191 | medi | unwired | createCostGuardMonitor exported but never instantiated in production | `src/orchestra/sprint-phases.ts` |
| UNW-A192 | medi | unwired | collectPromptEvolutionSuggestion / buildPromptEvolutionSection — exported from sprint-repo | `src/orchestra/sprint-reporter.ts` |
| UNW-A193 | medi | unwired | getSubprocessWorkerLogPath / readSubprocessWorkerLog / hasSubprocessWorkerLog imported but | `src/orchestra/sprint-utils.ts` |
| UNW-A194 | medi | unwired | validateGroundTruthClaims has zero production callers — plan-time stale-count guard never  | `src/orchestra/task-builder.ts` |
| UNW-A195 | medi | unwired | task-router.ts detectTaskType export shadows rubric-registry canonical implementation but  | `src/orchestra/task-router.ts` |
| UNW-A196 | medi | unwired | resolveWorkerAuth and applyUserSurfaceBonus exported but never called outside task-router. | `src/orchestra/task-router.ts` |
| UNW-A197 | low | unwired | AgentGenealogy methods findCommonAncestor / getDescendants / getChildren / getParent / has | `src/agents/agent-genealogy.ts` |
| UNW-A198 | low | unwired | terminationReason field in AgenticRunnerResult is never read outside the agent files | `src/agents/agentic-worker-runner.ts` |
| UNW-A199 | low | unwired | createFeedbackLoop / recordTscAttempt / recordTestAttempt / aggregateFeedbackLoops have ze | `src/agents/worker-lifecycle.ts` |
| UNW-A200 | low | unwired | clearWorkerStateRegistry exported but has no production caller | `src/agents/worker-lifecycle.ts` |
| UNW-A201 | low | unwired | resolveBootstrapApiToken exported but never called in production | `src/api/middleware/token.ts` |
| UNW-A202 | low | unwired | writeSseEvent / writeSseHeaders / parseStreamQuery exported but have no production callers | `src/api/output-stream.ts` |
| UNW-A203 | low | unwired | matchCommandPatterns and COMMAND_GUARD_LOCALHOST_HOSTS exported but have no production cal | `src/api/terminal/command-guard.ts` |
| UNW-A204 | low | unwired | DashboardWatcher interface exported but never used as a type in production code | `src/api/watcher.ts` |
| UNW-A205 | low | unwired | startWorkerLogTail exported but has no external production callers | `src/api/worker-logs.ts` |
| UNW-A206 | low | unwired | formatWorkerLogFrame exported but only referenced in tests, not in external production cod | `src/api/worker-logs.ts` |
| UNW-A207 | low | unwired | createHash re-exported from agent.ts with no callers | `src/cli/commands/agent.ts` |
| UNW-A208 | low | unwired | EXTENDED_MIME_TYPES exported from serve.ts with zero production callers | `src/cli/commands/serve.ts` |
| UNW-A209 | low | unwired | buildEntryArgv is exported only for test compatibility — dead in production | `src/cli/entry.ts` |
| UNW-A210 | low | unwired | dashboardDirFromModuleUrl exported but only used in tests | `src/cli/helpers/dashboard-dir.ts` |
| UNW-A211 | low | unwired | countOpenDebtItems exported and re-exported but never called at a call site | `src/cli/helpers/debt-counter.ts` |
| UNW-A212 | low | unwired | getContextualHints (hints.ts) has zero production callers | `src/cli/helpers/hints.ts` |
| UNW-A213 | low | unwired | runInkProbe — Ink build-probe function with zero callers anywhere | `src/cli/repl/ink-probe.tsx` |
| UNW-A214 | low | unwired | createStreamOutputHandler and StreamOutputHandler exported from native-transport.ts have z | `src/cli/repl/native-transport.ts` |
| UNW-A215 | low | unwired | DECKENT_BOT_SYSTEM_PROMPT — exported const never read in production | `src/connectors/bot-agentic.ts` |
| UNW-A216 | low | unwired | parseBotSlash, renderBotHelp, BOT_COMMAND_NAMES — exported but zero production callers | `src/connectors/bot-commands.ts` |
| UNW-A217 | low | unwired | analyzer.ts: analyzeProjectCached and clearAnalyzeCache have no production callers | `src/core/analyzer.ts` |
| UNW-A218 | low | unwired | anthropic-http-client.ts: getUsageReport and getCostReport have no production callers | `src/core/anthropic-http-client.ts` |
| UNW-A219 | low | unwired | migrateConfigFull, migrateConfigInMemory, needsV2Migration, hasDuplicateKeys, getMissingFi | `src/core/config-migration.ts` |
| UNW-A220 | low | unwired | isNonBuildKind and cleanProofLine exported from criteria-deriver with zero production call | `src/core/criteria-deriver.ts` |
| UNW-A221 | low | unwired | resolveTrackedFiles exported but has zero production callers | `src/core/doc-tracking/code-drift.ts` |
| UNW-A222 | low | unwired | ageThresholdDays exported but has zero production callers outside stale-scorer.ts | `src/core/doc-tracking/stale-scorer.ts` |
| UNW-A223 | low | unwired | emitDependencyBlockedIfChanged() typed helper exported but unused — direct writeEvent used | `src/core/event-stream.ts` |
| UNW-A224 | low | unwired | FlowRegistry.forCurrentTenant static factory has zero production callers | `src/core/flow-registry.ts` |
| UNW-A225 | low | unwired | detectSubIntent is computed but never read by any production caller | `src/core/intent-classifier.ts` |
| UNW-A226 | low | unwired | escapeFts5Query() exported but never imported externally | `src/core/memory-query.ts` |
| UNW-A227 | low | unwired | getRelationsTo() and getRelationsFrom() in MemoryStore have no production callers | `src/core/memory-store.ts` |
| UNW-A228 | low | unwired | TaskRecord interface in memory-types.ts has no production importer | `src/core/memory-types.ts` |
| UNW-A229 | low | unwired | Multiple model-catalog helper exports have no external callers | `src/core/model-catalog.ts` |
| UNW-A230 | low | unwired | isInteractiveTerminal() — exported from notifications.ts, zero production callers | `src/core/notifications.ts` |
| UNW-A231 | low | unwired | shouldRotate(), readArchivedMetrics(), listArchives() are exported but have zero productio | `src/core/observability-rotation.ts` |
| UNW-A232 | low | unwired | cleanOrphanIpcDirsLegacy() is exported but has no production callers | `src/core/orphan-cleaner.ts` |
| UNW-A233 | low | unwired | preflightOrphanCleanup() is exported but has zero production callers | `src/core/orphan-cleaner.ts` |
| UNW-A234 | low | unwired | loadHookModule and registerPluginHooks exported but have zero production callers outside p | `src/core/plugin-hooks.ts` |
| UNW-A235 | low | unwired | SkillPoolManager.listByCategory(), enableSkill(), disableSkill(), removeSkill() have zero  | `src/core/skill-pool.ts` |
| UNW-A236 | low | unwired | SidebarNavLinks exported from Sidebar.tsx but never imported by any production caller | `src/dashboard/src/components/Sidebar.tsx` |
| UNW-A237 | low | unwired | useSheet exported but has zero external callers | `src/dashboard/src/components/ui/sheet.tsx` |
| UNW-A238 | low | unwired | useTabsContext exported but has zero external callers | `src/dashboard/src/components/ui/tabs.tsx` |
| UNW-A239 | low | unwired | McpClientBroker.registerConnection() has zero production callers | `src/mcp-client/broker.ts` |
| UNW-A240 | low | unwired | helpers/index.ts barrel has zero production callers | `src/mcp/helpers/index.ts` |
| UNW-A241 | low | unwired | initializeNotifyDispatcher and mcpNotifyAdapter exported from server.ts with zero producti | `src/mcp/server.ts` |
| UNW-A242 | low | unwired | monitor/index.ts barrel is imported only by src/index.ts for re-export; no production modu | `src/monitor/index.ts` |
| UNW-A243 | low | unwired | dispatchAction() is a public export used only internally — no external production caller | `src/nervous/action-handlers.ts` |
| UNW-A244 | low | unwired | ActionHandlerResult type alias is an unused re-export of ActionDispatchResult | `src/nervous/action-handlers.ts` |
| UNW-A245 | low | unwired | NervousHistory.prune() retention method has zero production callers | `src/nervous/history.ts` |
| UNW-A246 | low | unwired | NervousHistory.indexToMemory() has zero production callers | `src/nervous/history.ts` |
| UNW-A247 | low | unwired | Proposer.clearThrottleState() has no production callers | `src/nervous/proposer.ts` |
| UNW-A248 | low | unwired | mapEvaluation / buildTaskForEval exported but not imported by any production caller | `src/orchestra/autonomous/backlog-eval.ts` |
| UNW-A249 | low | unwired | buildGoalPlanPrompt exported but has zero external production callers | `src/orchestra/autonomous/goal-planner.ts` |
| UNW-A250 | low | unwired | buildJitDetailPrompt exported but has zero external production callers | `src/orchestra/autonomous/jit-detail.ts` |
| UNW-A251 | low | unwired | decision-steps/agent-step.ts executeAgentStep: no production callers | `src/orchestra/decision-steps/agent-step.ts` |
| UNW-A252 | low | unwired | decision-steps/scope-step.ts executeScopeStep: no production callers | `src/orchestra/decision-steps/scope-step.ts` |
| UNW-A253 | low | unwired | EventBus.subscriberCount getter is defined but has zero production callers | `src/orchestra/event-bus.ts` |
| UNW-A254 | low | unwired | getAllGenerators() exported from content-generators.ts has zero callers anywhere | `src/orchestra/managed-docs/content-generators.ts` |
| UNW-A255 | low | unwired | computeCacheKey exported from doc-cache.ts has zero production callers | `src/orchestra/managed-docs/doc-cache.ts` |
| UNW-A256 | low | unwired | ParallelPipelineManager.getExecutionPlan() has zero production callers | `src/orchestra/parallel-pipeline.ts` |
| UNW-A257 | low | unwired | runDecayPhase standalone export has zero callers | `src/orchestra/sprint-phases.ts` |

---

_Generated 2026-06-20 · deckent-last-standing Phase-1 (CC parallel-agent audit) · run wf_5d4fedc5-375 · 196 agents · 16.8M tokens · code-grounded, adversarially-verified._