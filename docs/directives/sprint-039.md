# DIRECTIVES — Sprint 039 (Multi-Provider UX + Integration Tests + Documentation)

## Goal: Complete multi-provider user experience (init wizard, environment detection, health dashboard, smart routing, agent-provider compat), cost estimation, comprehensive integration tests, and full documentation. 11 tasks — final sprint before beta publish.

---

## Task 1: Init Wizard — Provider Selection
- Model: opus
- Effort: normal
- Files: src/cli/commands/init.ts, src/cli/helpers/wizard.ts
- Scope: src/cli/

### Description
Extend init wizard with multi-provider setup:
1. After detecting subscription, run `detectAvailableProviders()`
2. Show detected providers with status: `✓ Claude CLI v2.1 (session auth)`, `✓ Codex CLI v1.0 (API key)`, `✗ Gemini (no API key)`
3. Multi-select: "Which providers do you want to use?" (pre-check detected ones)
4. For each selected provider: verify auth (API key prompt if missing)
5. Ask: "Brain provider?" (single select from verified), "Worker provider?" (single select)
6. Write provider config to .deckent/config.json
7. If only one provider available, skip questions and auto-configure
10+ tests.

### Tests
- Single provider auto-configured without questions
- Multiple providers shown with status
- API key prompt for missing keys
- Provider config written correctly
- Invalid provider selection handled
- 10+ tests

---

## Task 2: Cross-Environment Detection
- Model: opus
- Effort: normal
- Files: src/core/environment.ts (new), tests/core/environment.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Create `.deckent/environment.json` tracking:
```typescript
interface EnvironmentInfo {
  detectedAt: string;          // ISO timestamp
  hostname: string;            // Machine identifier
  cli: string;                 // 'claude-code' | 'codex' | 'terminal' | 'unknown'
  os: string;                  // process.platform
  nodeVersion: string;         // process.version
  providers: DetectedProvider[];
  lastSprintId?: string;
  pid: number;                 // Process ID for conflict detection
}
```
`detectEnvironment()`: detect current environment (check parent process for Claude Code, Codex IDE, etc.). `writeEnvironment()`: atomic write to environment.json. `checkConflict()`: if another instance is running (PID check), warn user. Updated on every `deckent start`. 15+ tests.

### Tests
- Environment detected correctly
- Claude Code parent process detected
- Terminal fallback works
- Conflict detection finds active PID
- Stale PID (dead process) not flagged as conflict
- Environment file written atomically
- 15+ tests

---

## Task 3: Provider Health Dashboard
- Model: opus
- Effort: normal
- Files: src/cli/commands/status.ts, src/api/server.ts, src/dashboard/src/pages/StatusPage.tsx
- Scope: src/cli/, src/api/, src/dashboard/

### Description
Add provider panel to `deckent status` and web dashboard:
- Per provider: name, available (✓/✗), quota (%), active workers count, last used
- Color coding: green (ok), yellow (>70% quota), red (>90% or unavailable)
- API endpoint: `GET /api/providers` returning provider status array
- SSE events: `provider_status_change` when availability changes
- CLI: table format with provider rows
10+ tests.

### Tests
- Status shows all configured providers
- Color coding correct for quota levels
- API endpoint returns provider array
- SSE event fires on status change
- Unavailable provider shown in red
- 10+ tests

---

## Task 4: Smart Provider Routing
- Model: opus
- Effort: high
- Files: src/orchestra/provider-router.ts (new), tests/orchestra/provider-router.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
`ProviderRouter` class — intelligent task-to-provider assignment:
```typescript
routeTask(task: Task, context: RoutingContext): RoutingDecision {
  // 1. Check directive override (task.provider set by user)
  // 2. Check agent-provider compatibility (agent.supportedProviders)
  // 3. Check task requirements vs provider capabilities (vision, tools)
  // 4. Check provider quota (usage balancer)
  // 5. If cost_optimization enabled: select cheapest capable provider
  // 6. Apply model equivalence mapping
  // Return: { provider, model, reason, alternatives }
}
```
RoutingContext includes: available providers, usage metrics, config, cost data.
RoutingDecision includes: chosen provider + model, reasoning string, alternative options.
Integrated into planSprint after task creation, before spawn. 20+ tests.

### Tests
- Directive override respected
- Agent compatibility filters providers
- Capability requirement filters providers
- Quota-based selection works
- Cost optimization selects cheapest
- Routing reason documented
- Alternatives provided
- All providers unavailable → clear error
- 20+ tests

---

## Task 5: Agent-Provider Compatibility
- Model: opus
- Effort: normal
- Files: src/core/agent-pool.ts, src/agents/agent-types.ts (if split), .deckent/agents/*/agent.json
- Scope: src/core/, src/agents/, .deckent/agents/

### Description
Add `supportedProviders?: ProviderName[]` to AgentDefinition. Default: all providers (undefined = no restriction). For built-in agents that rely on Claude-specific features (e.g., tool use patterns), set explicit provider list. Agent selection algorithm filters by task.provider before scoring. If best agent doesn't support task's provider, select next best or use generic. Update all 8 built-in agent.json files. 10+ tests.

### Tests
- Agent with no supportedProviders works with all providers
- Agent with ['claude'] only selected for Claude tasks
- Agent selection filters by provider
- Generic worker used when no compatible agent
- Built-in agents have correct provider lists
- 10+ tests

---

## Task 6: Cost Estimator
- Model: opus
- Effort: normal
- Files: src/core/cost-estimator.ts (new), tests/core/cost-estimator.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Token cost estimation per provider + model:
```typescript
interface CostEstimate {
  provider: ProviderName;
  model: ModelType;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUSD: number;
  isSubscription: boolean;  // true = no $ cost, uses quota
}
```
`estimateTaskCost(task, provider, model)`: estimate tokens from task description length + scope size. `estimateSprintCost(tasks[])`: sum all tasks. For subscription plans (Claude Max, Codex Pro): return `isSubscription=true, estimatedCostUSD=0` but show quota impact. Show estimate before sprint starts: "This sprint will use ~$4.50 on Codex API + 3 Claude quota messages". 15+ tests.

### Tests
- Claude subscription shows quota impact
- API provider shows USD cost
- Sprint total calculated correctly
- Large task estimates more tokens
- Mixed provider sprint totals both costs
- 15+ tests

---

## Task 7: Multi-Provider Integration Test
- Model: opus
- Effort: high
- Files: tests/integration/multi-provider.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end integration test for multi-provider sprint:
1. Setup: register mock Claude + mock Codex providers
2. Configure: brain_provider='claude', worker_provider='codex'
3. Plan: Brain plans 4 tasks (structured mode)
4. Verify: tasks have correct provider assignment
5. Spawn: spawnWorkers routes to correct adapters
6. Mixed: 2 tasks on Claude, 2 on Codex (via cost optimization)
7. Evaluate: results collected from both providers
8. Retro: metrics include per-provider breakdown
9. Fallback: simulate Codex failure mid-sprint, verify fallback to Claude
10. Cost: sprint cost estimate includes both providers
30+ tests.

### Tests
- Brain plans with correct provider assignments
- Tasks routed to correct provider adapters
- Mixed provider spawn works
- Results collected from multiple providers
- Retro shows per-provider metrics
- Provider failure triggers fallback
- Cost estimate covers both providers
- Model equivalence applied during fallback
- 30+ tests

---

## Task 8: Multi-Provider Documentation
- Model: opus
- Effort: normal
- Files: docs/MULTI-PROVIDER-GUIDE.md (new)
- Scope: docs/

### Description
Comprehensive multi-provider user guide:
1. Overview: what multi-provider means, why it matters
2. Quick Start: setup with two providers in 5 minutes
3. Provider Setup: Claude (session auth), Codex (API key), Gemini (API key)
4. Configuration: all config options with examples
5. Cost Optimization: how auto-routing saves money
6. Model Equivalence: tier mapping table
7. Troubleshooting: common issues (auth, fallback, compatibility)
8. Best Practices: when to use which provider
9. FAQ: "Can I use Claude brain with Codex workers?" etc.

### Tests
- All sections present
- Config examples valid
- Troubleshooting covers common errors

---

## Task 9: Provider Config in Dashboard Settings
- Model: opus
- Effort: normal
- Files: src/dashboard/src/pages/SettingsPage.tsx, src/api/server.ts
- Scope: src/dashboard/, src/api/

### Description
Add provider configuration section to web dashboard settings page:
- Provider selection dropdowns (brain_provider, worker_provider, fallback_provider)
- Provider status indicators (green/yellow/red)
- API key input fields (masked, stored via credential system)
- Cost optimization toggle
- Save button → POST /api/config with provider config
- Real-time validation: selected provider available?
10+ tests.

### Tests
- Provider dropdowns show available options
- Status indicators reflect provider health
- API key masked in UI
- Save persists config
- Invalid provider selection shows error
- 10+ tests

---

## Task 10: Blueprint & Architecture Update
- Model: opus
- Effort: normal
- Files: DECKENT-MASTER-BLUEPRINT.md, docs/ARCHITECTURE.md
- Scope: docs/

### Description
Update master blueprint and architecture docs to reflect all beta changes:
- Multi-provider architecture diagram
- Updated module responsibility table (new files: sprint-controller, result-evaluator, usage-manager, provider-router, cost-estimator, model-equivalence, provider-capabilities, environment)
- Provider adapter interface documentation
- Updated sprint lifecycle diagram (with provider routing step)
- Updated config reference (provider config block)
- Phase 3 → COMPLETE status

### Tests
- Architecture diagram matches actual code structure
- All new modules documented
- Config reference complete

---

## Task 11: Pre-Publish Validation
- Model: opus
- Effort: high
- Files: scripts/validate-publish.ts (new or extend existing)
- Scope: scripts/, tests/

### Description
Final pre-publish validation script:
1. `tsc --noEmit` — zero errors
2. `npx vitest run` — all tests pass (expect 7,500+)
3. `npm pack --dry-run` — verify included files, no leaks
4. Size check: packed tarball < 500KB
5. Shebang check: dist/cli/index.js has `#!/usr/bin/env node`
6. Import check: no circular dependencies
7. Provider check: all 3 adapters load without error
8. Config check: default config valid
9. MCP check: all tools and resources register
10. README check: no stale badges/metrics
Run as `npm run validate:publish`. Must pass before `npm publish`. 15+ tests.

### Tests
- Script exits 0 when all checks pass
- Script exits 1 with clear message on any failure
- Each check has descriptive output
- 15+ tests
