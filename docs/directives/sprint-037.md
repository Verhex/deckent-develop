# DIRECTIVES — Sprint 037 (Beta Cleanup Wave 5+6: Security, Performance + Plugin Full Implementation)

## Goal: Harden security (timing-safe auth, credential redaction, stale lock cleanup), optimize performance (agent pool LRU, N+1 elimination, skill sandbox AST), implement full plugin system (npm install, runtime hooks), and complete remaining P2/P3 fixes. 13 tasks.

---

## Task 1: Agent Pool LRU Cleanup
- Model: sonnet
- Effort: normal
- Files: src/core/agent-pool.ts, tests/core/agent-pool.test.ts
- Scope: src/core/, tests/core/

### Description
P1-003. AgentPool loads all agents from `.tasks/agents/` every sprint but never cleans up old temp agents. Implement LRU eviction: keep max N temp agents (configurable, default 50). On loadAgents(), check agent lastUsedInSprint — remove agents not used in last 5 sprints. Add `cleanup(maxAge: number)` method. 10+ tests.

### Tests
- Agents used within 5 sprints retained
- Agents older than 5 sprints removed
- Builtin agents never removed
- Max pool size enforced
- 10+ tests

---

## Task 2: Bearer Token Timing-Safe
- Model: sonnet
- Effort: low
- Files: src/api/server.ts
- Scope: src/api/

### Description
P1-004. Replace `===` token comparison (server.ts:45) with `crypto.timingSafeEqual()`. Handle different-length tokens gracefully (timingSafeEqual requires equal length — pad or hash first). 5+ tests.

### Tests
- Valid token accepted
- Invalid token rejected
- Different-length token handled without crash
- Timing is constant regardless of token prefix match
- 5+ tests

---

## Task 3: API Token Warning
- Model: sonnet
- Effort: low
- Files: src/api/server.ts
- Scope: src/api/

### Description
P1-005. When API server starts without auth token configured (server.ts:40-41), log a warning to stderr: `[deckent:warn] API server running without authentication. Set DECKENT_API_TOKEN or config.api_token to enable auth.` Log once at startup, not per request. 3+ tests.

### Tests
- Warning logged when no token configured
- No warning when token is set
- Warning appears exactly once
- 3+ tests

---

## Task 4: CLI Credential Redaction
- Model: opus
- Effort: normal
- Files: src/cli/helpers/output.ts (or new redaction.ts), src/agents/worker.ts
- Scope: src/cli/, src/agents/

### Description
P2-009. Worker logs may contain credentials from environment or config. Create `redactSensitive(text: string): string` that masks:
- API keys (patterns: `sk-...`, `key-...`, `OPENAI_API_KEY=...`)
- Bearer tokens
- Passwords in URLs
- Credential file paths
Apply redaction in worker log output, CLI print helpers, and API log responses. 10+ tests.

### Tests
- API key patterns redacted
- Bearer tokens masked
- URL passwords masked
- Non-sensitive text unchanged
- Redaction applied in worker log output
- 10+ tests

---

## Task 5: Stale Lock Auto-Remove
- Model: sonnet
- Effort: normal
- Files: src/monitor/auditor.ts, src/core/constants.ts
- Scope: src/monitor/, src/core/

### Description
P2-010. Auditor detects stale locks (>5min) but doesn't remove them. Add configurable auto-cleanup: `config.auto_clean_locks: boolean` (default: false). When enabled, auditor removes stale locks and logs the action. Add `--auto-clean-locks` flag to `deckent cleanup` command. 10+ tests.

### Tests
- Stale locks removed when auto_clean_locks=true
- Stale locks kept when auto_clean_locks=false (current behavior)
- Lock removal logged
- CLI flag works
- 10+ tests

---

## Task 6: Agent Pool Batch Read
- Model: sonnet
- Effort: normal
- Files: src/core/agent-pool.ts
- Scope: src/core/

### Description
P2-015. loadAgents() reads each agent.json separately (N+1 pattern). Refactor to single readdirSync + batch read: read directory once, then map over entries. Use readJsonSafe for each file. Reduces syscalls from O(2N) to O(N+1). 5+ tests.

### Tests
- All agents loaded correctly (same result as before)
- Single readdirSync call
- Invalid agent.json files skipped gracefully
- 5+ tests

---

## Task 7: Skill Sandbox AST Enhancement
- Model: opus
- Effort: high
- Files: src/core/marketplace/skill-sandbox.ts, tests/core/marketplace/skill-sandbox.test.ts
- Scope: src/core/marketplace/, tests/core/marketplace/

### Description
P3-004. Current sandbox uses regex pattern matching — bypassable with obfuscation. Add basic AST-level check using TypeScript compiler API (ts.createSourceFile + ts.forEachChild). Check for: CallExpression with `eval`, `Function`, `require('child_process')`, `import('child_process')`. Keep regex as fast first-pass, AST as second-pass for .ts/.js files. 15+ tests.

### Tests
- eval() detected by AST
- Dynamic Function() detected
- child_process import detected
- Obfuscated eval (e.g., `global['ev'+'al']`) detected
- Regex fallback works for non-TS files
- Clean SKILL.md passes both checks
- 15+ tests

---

## Task 8: DIRECTIVES Zod Schema
- Model: sonnet
- Effort: normal
- Files: src/orchestra/task-builder.ts
- Scope: src/orchestra/

### Description
P3-005. Add Zod schema validation for parsed DIRECTIVES.md sections. Define DirectiveSchema: { goal: string, tasks: DirectiveTask[] }. DirectiveTask: { title: string, model?: ModelType, effort?: TaskEffort, files: string[], scope: string[], description: string, tests?: string[] }. Validate after parsing, before task creation. Return clear error messages for malformed directives. 10+ tests.

### Tests
- Valid directive passes schema
- Missing required field detected
- Invalid model value rejected
- Empty task list rejected
- Clear error message returned
- 10+ tests

---

## Task 9: Config Mode Aliases
- Model: sonnet
- Effort: low
- Files: src/core/config.ts
- Scope: src/core/

### Description
P3-010. Add user-friendly mode aliases: `performance` -> `max_plan`, `balanced` -> `max5x_plan`, `economic` -> `pro_plan`, `unlimited` -> `api`. Accept aliases in config.mode field and CLI `--mode` flag. Resolve alias to canonical mode name in loadConfig. 5+ tests.

### Tests
- Alias 'performance' resolves to 'max_plan'
- Alias 'balanced' resolves to 'max5x_plan'
- Alias 'economic' resolves to 'pro_plan'
- Alias 'unlimited' resolves to 'api'
- Canonical names still work
- 5+ tests

---

## Task 10: Plugin Install — Full Implementation
- Model: opus
- Effort: high
- Files: src/cli/commands/plugin.ts, src/core/plugin.ts
- Scope: src/cli/, src/core/

### Description
P2-014a. Replace `plugin install` stub with full implementation. Support two sources:
1. npm registry: `deckent plugin install <package-name>` — runs npm install in temp dir, copies plugin to .deckent/plugins/, validates manifest
2. Git URL: `deckent plugin install https://github.com/user/plugin.git` — git clone to temp, copy, validate
3. Local path: `deckent plugin install ./my-plugin` — copy directory, validate
After install: validate manifest, check dependencies (using existing DependencyResolver), auto-enable. Rollback on validation failure. 15+ tests.

### Tests
- npm package installed correctly
- Git URL cloned and installed
- Local path copied and installed
- Invalid manifest causes rollback
- Dependencies resolved before enable
- Duplicate install detected
- 15+ tests

---

## Task 11: Plugin Runtime Hook Execution
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts, src/core/plugin-hooks.ts, src/core/plugin.ts
- Scope: src/orchestra/, src/core/

### Description
P2-014b. Integrate plugin hooks into sprint lifecycle. In sprint-controller.ts (extracted from brain.ts):
- Before planSprint: `runHooks('beforeSprint', { sprintId, tasks, config, projectRoot })`
- After evaluateResult per task: `runHooks('afterTask', { task, result, projectRoot })`
- After retro: `runHooks('afterSprint', { sprint, projectRoot })`
At sprint start, scan .deckent/plugins/, load enabled plugins, register their hooks. Hooks are non-fatal — errors logged but don't abort sprint. 15+ tests.

### Tests
- beforeSprint hook called before planning
- afterTask hook called after each evaluation
- afterSprint hook called after retro
- Hook error doesn't abort sprint
- Disabled plugins' hooks skipped
- Multiple plugins' hooks run in order
- 15+ tests

---

## Task 12: Dashboard API Documentation
- Model: sonnet
- Effort: normal
- Files: docs/API.md
- Scope: docs/

### Description
P2-007. docs/API.md is missing dashboard-specific endpoints. Add documentation for all 15 API endpoints including: request/response examples, authentication requirements, SSE event types, error codes. Add curl examples for each endpoint. Document dashboard WebSocket/SSE connection setup.

### Tests
- All 15 endpoints documented
- Request/response examples present
- Authentication documented
- SSE events documented

---

## Task 13: JSDoc for Public Functions
- Model: opus
- Effort: high
- Files: src/core/*.ts, src/orchestra/*.ts (50+ functions)
- Scope: src/core/, src/orchestra/

### Description
P3-002. Add JSDoc comments to 50+ public exported functions in core/ and orchestra/. Each JSDoc must include: @param descriptions, @returns description, @throws (if applicable), @example (for complex functions). Priority files: utils.ts, config.ts, brain.ts (remaining functions), model-selector.ts, task-builder.ts, debt-manager.ts, sprint-reporter.ts. 10+ test assertions that JSDoc exists.

### Tests
- All exported functions in core/utils.ts have JSDoc
- All exported functions in core/config.ts have JSDoc
- All exported functions in orchestra/brain.ts have JSDoc
- JSDoc includes @param and @returns
- 10+ tests
