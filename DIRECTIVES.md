# DIRECTIVES — Sprint 027 (Technical Gap Closure)

## Goal: Close critical technical gaps to prepare deckent for global launch. Provider abstraction, subprocess spawn, zero-config mode, coverage validation, rollback, usage tracking, sandbox foundation, Worker IPC, pause/resume fix, global config completion. 30 tasks — all opus model, effort high/max.

---

## Task 1: Provider Abstraction Interface
- Files: src/core/provider.ts (new), tests/core/provider.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Define ProviderAdapter interface: spawn(opts), checkUsage(), isAvailable(), supportedModels, name. ProviderRegistry class: registerProvider, getProvider, listProviders, getDefault. Define the abstract structure that buildClaudeCommand and spawnWorker from tmux.ts will delegate to. Interface-only + registry + 20 tests.

### Tests
- ProviderAdapter interface types are correct
- ProviderRegistry register/get/list/default works
- Throws error for non-existent provider
- 20+ tests

---

## Task 2: Claude Provider Adapter
- Files: src/providers/claude.ts (new), tests/providers/claude.test.ts (new)
- Scope: src/providers/, tests/providers/

### Description
ClaudeAdapter implements ProviderAdapter. Wrap (not copy) existing tmux.ts logic: buildClaudeCommand, spawnWorker, killWorker, listWorkers, isSessionActive. checkUsage() uses existing brain.ts checkUsage. isAvailable() checks claude --version. supportedModels: ['opus', 'sonnet', 'haiku']. IMPORTANT: buildClaudeCommand creates a tmpfile for worker prompts — ensure this tmpfile is deleted after the worker process finishes (add cleanup logic in spawn completion/kill). 15+ tests.

### Tests
- spawn generates correct tmux command
- checkUsage returns usage metrics
- isAvailable checks claude CLI
- supportedModels correct
- tmpfile is cleaned up after worker finishes
- 15+ tests

---

## Task 3: Subprocess Spawn Backend
- Files: src/providers/subprocess.ts (new), tests/providers/subprocess.test.ts (new)
- Scope: src/providers/, tests/providers/

### Description
SubprocessSpawnBackend: run workers via child_process.spawn WITHOUT tmux. Each worker is a separate child_process. stdout/stderr redirected to log files (.tasks/task-{id}.log). Process management: pid tracking, kill signal, timeout. Heartbeat files written in same format. This backend is the foundation for Windows (non-WSL2) support. 20+ tests.

### Tests
- Worker spawns as subprocess
- stdout/stderr written to log file
- Kill signal terminates process
- Timeout auto-kills
- Heartbeat files created
- 20+ tests

---

## Task 4: SpawnBackend Abstraction
- Files: src/core/spawn-backend.ts (new), tests/core/spawn-backend.test.ts (new)
- Scope: src/core/, tests/core/

### Description
SpawnBackend interface: spawn(taskId, model, prompt, opts), kill(taskId), list(), isAvailable(). TmuxBackend (wraps existing tmux.ts) and SubprocessBackend (Task 3) implement this interface. SpawnBackendFactory: selects backend based on config or environment (tmux available → tmux, otherwise → subprocess). brain.ts spawnWorkers will use this factory. 15+ tests.

### Tests
- TmuxBackend preserves existing functionality
- SubprocessBackend same interface
- Factory selects tmux when available
- Factory selects subprocess when tmux unavailable
- 15+ tests

---

## Task 5: brain.ts Provider Integration
- Files: src/orchestra/brain.ts, tests/orchestra/brain-provider.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Convert direct tmux imports in brain.ts to calls through ProviderAdapter and SpawnBackend. spawnWorkers() now uses SpawnBackendFactory.create(). checkUsage() now uses ProviderAdapter.checkUsage(). Backward compatibility: existing behavior must not change, only abstraction layer added. Also fix cleanup() function to clean .tasks/.prompt-* hidden files (leftover prompt tmpfiles from buildClaudeCommand). 15+ tests.

### Tests
- All existing brain.test.ts tests continue passing (0 regression)
- Provider adapter usage check works
- SpawnBackend worker spawn works
- cleanup() removes .tasks/.prompt-* hidden files
- 15+ tests

---

## Task 6: Coverage Validation Mechanism
- Files: src/orchestra/coverage-validator.ts (new), tests/orchestra/coverage-validator.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Mechanism to validate worker result self-reported coverage. parseCoverageFromVitest(jsonOutput): parse vitest --reporter=json output. validateCoverage(reported, actual, threshold): warn if reported vs actual diff >5%. Integrate into Brain evaluateResult: validate coverage unless doc task. 15+ tests.

### Tests
- vitest JSON output parsed correctly
- Coverage match validated
- Diff >5% returns WARNING
- Doc tasks skip validation
- 15+ tests

---

## Task 7: evaluateResult Coverage Integration
- Files: src/orchestra/brain.ts, tests/orchestra/brain-coverage.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Integrate coverage-validator into Brain evaluateResult function. Steps: 1) Read coverage from worker result, 2) Call validateCoverage, 3) Adjust evaluation based on result (if coverage not validated, treat as GO_WITH_TECH_DEBT). Existing evaluateResult logic must not break. 10+ tests.

### Tests
- Validated coverage task returns DONE
- Unvalidated coverage task returns GO_WITH_TECH_DEBT
- Doc task returns DONE without coverage validation
- 10+ tests

---

## Task 8: Usage Tracking — Core Infrastructure
- Files: src/core/usage-tracker.ts (new), tests/core/usage-tracker.test.ts (new)
- Scope: src/core/, tests/core/

### Description
UsageTracker class: recordCall(model, tokenEstimate, taskId), getSprintUsage(sprintId), getTotalUsage(), getModelBreakdown(). Data storage: .deckent/usage/{sprintId}.json. Model-based token/call counting. Sprint-based and cumulative reporting. 20+ tests.

### Tests
- recordCall saves correctly
- getSprintUsage returns sprint data
- getModelBreakdown returns model-based breakdown
- Resilient to file I/O errors
- 20+ tests

---

## Task 9: Usage Tracking — Brain Integration
- Files: src/orchestra/brain.ts, tests/orchestra/brain-usage.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Integrate UsageTracker into Brain sprint lifecycle. recordCall in spawnWorkers for each spawn. recordCall in evaluateResult for each evaluation. Add usage summary in writeRetrospective. Sprint usage report at end of runSprint. 10+ tests.

### Tests
- Usage recorded during sprint
- Sprint end usage report correct
- Model distribution calculated correctly
- 10+ tests

---

## Task 10: deckent usage Real Implementation
- Files: src/cli/commands/usage.ts, tests/cli/usage.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
Replace existing stub with real implementation. Read data from UsageTracker. Table format: model-based call/token count, sprint-based cost estimate (for API mode). --json flag. --sprint <id> filter. 10+ tests.

### Tests
- usage command returns table
- --json outputs JSON
- --sprint filter works
- Informative message when no data
- 10+ tests

---

## Task 11: Zero-Config Mode — Basic
- Files: src/cli/commands/quick-start.ts (new), tests/cli/quick-start.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
`deckent start "Add login page with Google OAuth"` — start sprint with single-line natural language without writing DIRECTIVES.md. Steps: 1) Accept description as argument, 2) Create temporary DIRECTIVES.md (## Task 1: {description}), 3) Feed into normal planSprint flow, 4) Clean up temporary DIRECTIVES after sprint. Add as optional positional argument to existing `start` command. 15+ tests.

### Tests
- Sprint starts with string argument
- Temporary DIRECTIVES.md created in correct format
- Warning if DIRECTIVES.md already exists
- Cleanup after sprint
- 15+ tests

---

## Task 12: Zero-Config Mode — AI Planner Integration
- Files: src/orchestra/planner.ts, tests/orchestra/planner-zeroconfig.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Split single-line natural language input into multiple tasks via AI planner. When user says "Add login page with Google OAuth", AI planner splits into: 1) Auth API endpoints, 2) Google OAuth integration, 3) Login page UI, 4) Tests — 3-5 tasks. Add zero-config context to buildPlanPrompt. 10+ tests.

### Tests
- Single-line input split into multiple tasks
- AI planner assigns correct scopes
- Fallback to structured mode works
- 10+ tests

---

## Task 13: Rollback Mechanism — Git Safety
- Files: src/orchestra/rollback.ts (new), tests/orchestra/rollback.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Automatic git safety point before sprint starts. createSafetyPoint(projectRoot): git stash or new branch (deckent-backup-{sprintId}). rollback(projectRoot, safetyPointId): undo after failed sprint. isCleanWorkingTree(projectRoot): check for uncommitted changes. Rollback policy: auto-offer if all tasks NO_GO, ask user for partial success. 15+ tests.

### Tests
- createSafetyPoint creates git branch
- rollback returns to branch
- Dirty working tree warning
- isCleanWorkingTree works correctly
- 15+ tests

---

## Task 14: Rollback — Brain Integration
- Files: src/orchestra/brain.ts, tests/orchestra/brain-rollback.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Integrate rollback into runSprint. Call createSafetyPoint before PLAN phase. In EVALUATE phase, offer rollback if all NO_GO (ask user if not auto-approve). Record in DEBT.md after rollback. Add rollback: boolean to runSprint options. 10+ tests.

### Tests
- Safety point created before sprint
- Rollback works on all NO_GO
- No rollback on partial success
- Can skip with rollback: false
- 10+ tests

---

## Task 15: Pause/Resume Real Environment Fix
- Files: src/orchestra/brain.ts, tests/orchestra/brain-pause-resume.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Real environment testing and fixes for existing pauseSprint and resumeSprint functions. Checklist: 1) pauseSprint stops all active workers? 2) .paused files written correctly? 3) resumeSprint PAUSED → PENDING transition works? 4) Workers re-spawned after resume? 5) Dashboard shows pause state? Fix discovered bugs. 15+ tests.

### Tests
- pauseSprint stops workers
- .paused files in correct format
- resumeSprint restores task states
- Dashboard shows PAUSED phase
- 15+ tests

---

## Task 16: checkAndAutoPause Real Environment Fix
- Files: src/orchestra/brain.ts, tests/orchestra/brain-autopause.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Real scenario testing of checkAndAutoPause function. Check: 1) Pause triggered when 5hr threshold exceeded? 2) Pause triggered when weekly threshold exceeded? 3) Usage decreases after pause? 4) Auto-resume logic exists? (if not, add: auto-resume when usage drops). 10+ tests.

### Tests
- Pause works when 5hr threshold exceeded
- Pause works when weekly threshold exceeded
- Resume triggered when usage drops (new feature)
- 10+ tests

---

## Task 17: Worker IPC Foundation — MessageChannel
- Files: src/agents/worker-ipc.ts (new), tests/agents/worker-ipc.test.ts (new)
- Scope: src/agents/, tests/agents/

### Description
Process.send/message based Worker IPC instead of file-based communication. WorkerChannel class: send(type, payload), onMessage(type, handler), close(). Message types: HEARTBEAT, STATUS_REQUEST, STATUS_RESPONSE, PAUSE, RESUME, KILL. Integrates with subprocess backend (not tmux — use child_process.fork for subprocess spawn). File-based heartbeat remains as fallback (backward compatible). 15+ tests.

### Tests
- send/onMessage works
- HEARTBEAT message delivered
- PAUSE/RESUME reaches worker
- close() cleans up
- 15+ tests

---

## Task 18: Worker IPC — Brain Integration
- Files: src/orchestra/brain.ts, tests/orchestra/brain-ipc.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Brain communication with workers via WorkerChannel. Listen for IPC messages in waitForResults (in addition to file polling). Send PAUSE message in pauseSprint. Dual check in heartbeat monitoring: IPC + file-based. Fallback: if no IPC (tmux backend), continue with file-based. 10+ tests.

### Tests
- Heartbeat received via IPC
- Pause command sent via IPC
- File-based fallback works when no IPC
- 10+ tests

---

## Task 19: Sandbox Mode — Subprocess Isolation
- Files: src/providers/sandbox.ts (new), tests/providers/sandbox.test.ts (new)
- Scope: src/providers/, tests/providers/

### Description
Sandbox mode basic implementation. SandboxSpawnBackend extends SubprocessSpawnBackend. Additional security layers: 1) Memory limit via NODE_OPTIONS for worker process, 2) Scope enforcement runtime check (chroot-like directory restriction), 3) Network access restriction (optional), 4) File system permissions (read-only areas). --sandbox flag activates it. 15+ tests.

### Tests
- Memory limit applied verified
- File access outside scope blocked
- Network restriction works (optional)
- Fallback to normal subprocess
- 15+ tests

---

## Task 20: start --sandbox-mode Real Implementation
- Files: src/cli/commands/start.ts, tests/cli/start-sandbox.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
Replace existing stub with real implementation. --sandbox-mode flag activates SandboxSpawnBackend. Add sandbox requirements to doctor check. In sandbox mode, haiku_allowed automatically false (security). 10+ tests.

### Tests
- --sandbox-mode selects SandboxSpawnBackend
- Existing behavior preserved without sandbox
- Doctor sandbox check works
- 10+ tests

---

## Task 21: Global Config Full Implementation
- Files: src/core/global-config.ts (new), tests/core/global-config.test.ts (new)
- Scope: src/core/, tests/core/

### Description
~/.deckent/ directory full implementation. GlobalConfig: mode, language, defaultModel, credentials path. readGlobalConfig(): read ~/.deckent/config.json. writeGlobalConfig(): write. mergeWithProjectConfig(): merge global + project config (project takes priority). ensureGlobalDir(): create directory on first use. 15+ tests.

### Tests
- ~/.deckent/ directory created
- Global config read/written
- Project config overrides global
- Defaults used when no config
- 15+ tests

---

## Task 22: Global Config — CLI Integration
- Files: src/cli/commands/config.ts, tests/cli/config-global.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
Add global config support to `deckent config` command. `deckent config --global` shows global config. `deckent config set --global <key> <value>` writes global setting. `deckent config export --global` exports global config. Add global config layer to resolveConfig. 10+ tests.

### Tests
- --global flag shows global config
- set --global writes correctly
- Global + project merge correct
- 10+ tests

---

## Task 23: Credentials Management
- Files: src/core/credentials.ts (new), tests/core/credentials.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Secure key management in ~/.deckent/credentials/ directory. storeCredential(provider, key): encrypted (or file-permission-based) storage. getCredential(provider): read. listCredentials(): provider list. ANTHROPIC_API_KEY stored here for API mode. File permissions 0600. 15+ tests.

### Tests
- Credential saved
- Credential read
- File permissions correct (0600)
- Returns null for non-existent credential
- 15+ tests

---

## Task 24: Task Retry Real Environment Validation
- Files: src/orchestra/task-retry.ts, tests/orchestra/task-retry-e2e.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
Real scenario validation of existing task-retry.ts. Check: 1) shouldRetry returns true after NO_GO? 2) createRetryTask adds correct id suffix? 3) retryDelay backoff works? 4) Stops after max 2 retries. 5) brain.ts FIX phase retry integration correct? 10+ tests.

### Tests
- Retry triggered after NO_GO
- Retry task id gets -r1, -r2 suffix
- Retry stops at 3rd attempt
- Backoff timing correct (0, 30s)
- 10+ tests

---

## Task 25: Deadlock Detection Real Environment Validation
- Files: src/monitor/auditor.ts, tests/monitor/auditor-deadlock-e2e.test.ts (new)
- Scope: src/monitor/, tests/monitor/

### Description
Real scenario validation of Kahn's algorithm deadlock detection. Check: 1) A->B->C->A cycle detected? 2) Self-dependency detected? 3) Independent tasks no false positives? 4) Performance with 10+ tasks. 5) Deadlock alert written to dashboard? 10+ tests.

### Tests
- Circular dependency detected
- Self-dependency detected
- Independent tasks no false positive
- 10+ task performance test
- 10+ tests

---

## Task 26: Pattern Learning Enhancement
- Files: src/monitor/auditor.ts, tests/monitor/auditor-patterns.test.ts (new)
- Scope: src/monitor/, tests/monitor/

### Description
Improve Auditor pattern detection. Existing: boundary violation patterns. New: 1) Recurring NO_GO patterns (same file/directory 3+ times NO_GO), 2) Model failure patterns (tasks done with haiku consistently NO_GO), 3) Duration patterns (certain task types consistently timeout). Brain reads these patterns during planning and adjusts model/effort. 10+ tests.

### Tests
- Recurring NO_GO pattern detected
- Model failure pattern detected
- Brain uses patterns in planning
- 10+ tests

---

## Task 27: Doc Updater — Sprint Metrics
- Files: src/orchestra/doc-updaters/metrics-updater.ts (new), tests/orchestra/doc-updaters/metrics-updater.test.ts (new)
- Scope: src/orchestra/doc-updaters/, tests/orchestra/doc-updaters/

### Description
Updater that automatically updates README.md metrics. After sprint: test count, coverage, sprint count, total tasks, success rate. Extend existing readmeMetricsUpdater: add usage tracking data. 10+ tests.

### Tests
- README.md metrics updated
- Usage data added
- Skipped if no README
- 10+ tests

---

## Task 28: Config Validation Strengthening
- Files: src/core/config.ts, tests/core/config-validation.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Strengthen validateConfig function. Additional validations: 1) Provider validity (registered provider?), 2) spawn_backend validity (tmux/subprocess/sandbox), 3) usage_tracker settings, 4) Credential path validity (in API mode). Error messages user-friendly with solution suggestions. 10+ tests.

### Tests
- Invalid provider error is descriptive
- Invalid backend error suggests solution
- API mode credential check
- 10+ tests

---

## Task 29: Integration Test — Provider Flow
- Files: tests/integration/provider-flow.test.ts (new)
- Scope: tests/integration/

### Description
Provider abstraction end-to-end integration test. Scenario: 1) Register ClaudeAdapter, 2) Create backend with SpawnBackendFactory, 3) Mock sprint plan, 4) Worker spawn (mock), 5) Write result, 6) Evaluate. All layers working together? 15+ tests.

### Tests
- Provider -> SpawnBackend -> Brain flow works
- Claude adapter generates correct command
- Subprocess backend starts correct process
- Fallback works correctly
- 15+ tests

---

## Task 30: Integration Test — Zero-Config -> Sprint -> Rollback
- Files: tests/integration/zero-config-flow.test.ts (new)
- Scope: tests/integration/

### Description
End-to-end test from zero-config mode to sprint to rollback. Scenario: 1) Call `deckent start "Fix all TypeScript errors"`, 2) Temporary DIRECTIVES created, 3) Plan generated, 4) Safety point created, 5) Worker mock runs, 6) All NO_GO -> rollback triggered, 7) Git state restored. 15+ tests.

### Tests
- Single-line input -> DIRECTIVES -> plan -> spawn flow
- Safety point created correctly
- Rollback works on all NO_GO
- Cleanup done correctly
- 15+ tests

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run MUST pass — existing 3442 tests 0 regression
- All tasks opus model, effort high
- Each task independent, can run in parallel (max 8 workers)
- Provider abstraction backward compatible — existing tmux flow must not break
- New files must be under src/ and tests/