# DIRECTIVES — Sprint 038 (Multi-Provider Infrastructure + Platform Decoupling)

## Goal: Build the complete multi-provider foundation AND decouple Claude hardcoding from orchestration layer. Extend ModelType, add provider field to tasks, implement Codex and Gemini adapters, provider auto-detection, multi-provider config, provider-aware model selection, capability matrix, model equivalence mapping. Also fix platform support matrix, CLI entrypoint side-effect, planner/tmux/subprocess Claude hardcoding, and add cross-platform test helpers. 20 tasks — architecturally the most critical sprint. Findings from Codex (Windows) and Antigravity (Gemini) analyses integrated.

---

## Task 1: ModelType Extension
- Model: opus
- Effort: high
- Files: src/core/types.ts (or task-types.ts after split), src/orchestra/model-selector.ts, 20+ consuming files
- Scope: src/core/, src/orchestra/, src/agents/, src/cli/, src/mcp/, src/api/

### Description
CRITICAL FOUNDATION. Extend ModelType from Claude-only to all providers:
```typescript
type ClaudeModel = 'opus' | 'sonnet' | 'haiku';
type OpenAIModel = 'gpt-4.1' | 'o3' | 'o4-mini';
type GeminiModel = 'gemini-2.5-pro' | 'gemini-2.5-flash';
type ModelType = ClaudeModel | OpenAIModel | GeminiModel;
type ProviderName = 'claude' | 'codex' | 'gemini';
```
Add `ProviderModelMap`: `Record<ProviderName, readonly ModelType[]>` mapping each provider to its models. Add `getProviderForModel(model: ModelType): ProviderName` helper. Update ALL hardcoded `'opus' | 'sonnet' | 'haiku'` checks to use provider-agnostic helpers. This touches 20+ files — careful, methodical migration. 25+ tests.

### Tests
- All Claude models still valid
- OpenAI models accepted
- Gemini models accepted
- getProviderForModel returns correct provider
- ProviderModelMap complete and accurate
- Existing model-dependent logic still works for Claude models
- Config validation accepts new models
- 25+ tests

---

## Task 2: Task Provider Field
- Model: opus
- Effort: high
- Files: src/core/types.ts, src/orchestra/task-builder.ts, src/orchestra/brain.ts (planSprint section)
- Scope: src/core/, src/orchestra/

### Description
Add `provider?: ProviderName` field to Task interface. During planSprint:
1. If directive specifies `- Provider: codex`, set task.provider = 'codex'
2. If no directive override, use config's worker_provider (or brain_provider for planning tasks)
3. task.model must be compatible with task.provider (validate against ProviderModelMap)
4. If model incompatible with provider, auto-select equivalent model (using Task 6's equivalence map)
Update task-builder.ts directive parsing to extract provider field. 15+ tests.

### Tests
- Directive provider override parsed correctly
- Config default provider applied when no override
- Model-provider compatibility validated
- Incompatible model auto-resolved to equivalent
- Provider field written to task JSON
- 15+ tests

---

## Task 3: Provider Auto-Detection
- Model: opus
- Effort: normal
- Files: src/core/provider.ts, src/cli/commands/doctor.ts, src/cli/commands/init.ts
- Scope: src/core/, src/cli/

### Description
`detectAvailableProviders(): Promise<DetectedProvider[]>`. For each known provider:
- Claude: check `claude --version` in PATH + Claude session auth
- Codex: check `codex --version` in PATH + `OPENAI_API_KEY` env
- Gemini: check for `GOOGLE_API_KEY` env (no standard CLI yet)
Return: `{ name: ProviderName, available: boolean, version?: string, authMethod: 'session' | 'api_key' | 'none', models: ModelType[] }`.
Integrate into `deckent doctor --profile` and `deckent init` (show detected providers, recommend config). 15+ tests.

### Tests
- Claude detected when CLI in PATH
- Codex detected when CLI + API key present
- Gemini detected when API key present
- Missing CLI returns available=false
- Doctor shows provider status
- Init recommends providers
- 15+ tests

---

## Task 4: Codex CLI Adapter
- Model: opus
- Effort: high
- Files: src/providers/codex.ts (new), tests/providers/codex.test.ts (new)
- Scope: src/providers/, tests/providers/

### Description
`CodexAdapter implements ProviderAdapter`. Full implementation:
- `spawn(taskId, model, prompt, opts)`: build codex CLI command, spawn via subprocess backend. Command: `codex --model {model} --quiet` with prompt on stdin.
- `kill(taskId)`: kill subprocess by PID
- `listWorkers()`: track spawned PIDs
- `checkUsage()`: query OpenAI API for rate limit headers (X-RateLimit-Remaining)
- `isAvailable()`: `codex --version` + OPENAI_API_KEY check
- `buildCommand()`: return full command string for dry-run display
- `supportedModels`: ['gpt-4.1', 'o3', 'o4-mini']
Handle Codex-specific prompt format differences from Claude. 20+ tests.

### Tests
- spawn builds correct codex command
- Model parameter passed correctly
- API key from environment used
- kill terminates subprocess
- listWorkers tracks active PIDs
- checkUsage parses rate limit headers
- isAvailable checks CLI and key
- Unsupported model rejected
- 20+ tests

---

## Task 5: Gemini CLI Adapter
- Model: opus
- Effort: high
- Files: src/providers/gemini.ts (new), tests/providers/gemini.test.ts (new)
- Scope: src/providers/, tests/providers/

### Description
`GeminiAdapter implements ProviderAdapter`. Implementation via Google AI API (subprocess with curl or dedicated SDK):
- `spawn`: create subprocess that calls Gemini API with prompt
- `checkUsage`: query quota from Google AI API
- `isAvailable`: check GOOGLE_API_KEY
- `supportedModels`: ['gemini-2.5-pro', 'gemini-2.5-flash']
Since Gemini has no standard CLI like Claude/Codex, use API-based subprocess: spawn a Node script that calls the API and writes results. 15+ tests.

### Tests
- spawn creates correct API call subprocess
- API key from environment used
- isAvailable checks key presence
- checkUsage returns quota info
- Unsupported model rejected
- 15+ tests

---

## Task 6: Model Equivalence Mapping
- Model: opus
- Effort: normal
- Files: src/core/model-equivalence.ts (new), tests/core/model-equivalence.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Define model tiers and cross-provider equivalence:
```typescript
const MODEL_TIERS = {
  premium: ['opus', 'gpt-4.1', 'gemini-2.5-pro'],
  standard: ['sonnet', 'o3', 'gemini-2.5-flash'],
  economy: ['haiku', 'o4-mini'],
} as const;
```
Functions:
- `getModelTier(model: ModelType): 'premium' | 'standard' | 'economy'`
- `getEquivalentModel(model: ModelType, targetProvider: ProviderName): ModelType`
- `isModelAvailable(model: ModelType, provider: ProviderName): boolean`
When Brain says "this task needs opus-tier", and target provider is Codex, auto-select gpt-4.1. 15+ tests.

### Tests
- opus maps to gpt-4.1 for codex
- sonnet maps to o3 for codex
- haiku maps to o4-mini for codex
- opus maps to gemini-2.5-pro for gemini
- Same-provider returns same model
- Economy tier has no gemini equivalent (fallback to standard)
- 15+ tests

---

## Task 7: Provider Capability Matrix
- Model: opus
- Effort: normal
- Files: src/core/provider-capabilities.ts (new), tests/core/provider-capabilities.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Define what each provider can do:
```typescript
interface ProviderCapability {
  streaming: boolean;
  toolUse: boolean;
  vision: boolean;
  codeExecution: boolean;
  maxContextTokens: number;
  costPerMillionTokens: { input: number; output: number };
}
```
`getCapabilities(provider: ProviderName): ProviderCapability`. Brain uses this to match task requirements to provider capabilities. Example: task requires vision → only send to provider with vision=true. 10+ tests.

### Tests
- Claude capabilities correct
- Codex capabilities correct
- Gemini capabilities correct
- Task requiring vision filters providers
- Task requiring tool use filters providers
- Unknown provider throws ProviderNotFoundError
- 10+ tests

---

## Task 8: Multi-Provider Config
- Model: opus
- Effort: high
- Files: src/core/config.ts, src/core/types.ts
- Scope: src/core/

### Description
Add provider configuration to DeckentConfig:
```typescript
interface ProviderConfig {
  brain_provider: ProviderName;      // Provider for Brain planning
  worker_provider: ProviderName;     // Default provider for workers
  fallback_provider?: ProviderName;  // Fallback when primary unavailable
  provider_overrides?: Record<string, ProviderName>; // Per-task-type overrides
  cost_optimization?: boolean;       // Auto-select cheapest capable provider
  api_keys?: Record<ProviderName, string>; // Optional API keys (prefer env vars)
}
```
Merge into existing config system. Default: brain_provider='claude', worker_provider='claude'. Validate provider names. Support env var override: `DECKENT_BRAIN_PROVIDER`, `DECKENT_WORKER_PROVIDER`. 15+ tests.

### Tests
- Default config has claude for both
- Config overrides work
- Env vars override config
- Invalid provider name rejected
- api_keys stored (but prefer env)
- cost_optimization defaults to false
- 15+ tests

---

## Task 9: Provider-Aware Model Selector
- Model: opus
- Effort: high
- Files: src/orchestra/model-selector.ts
- Scope: src/orchestra/

### Description
Update `resolveTaskModel()` to accept provider parameter. New resolution logic:
1. If task.forceModel set → validate against provider's supportedModels → use or error
2. Calculate model tier from existing scoring logic (keyword analysis, complexity, etc.)
3. Map tier to provider-specific model using model-equivalence
4. Apply usage pressure (current logic, but per-provider quota)
5. Apply plan access filter (provider-specific: Claude plan limits, OpenAI rate limits)
6. Return final model + provider pair
Keep backward compatible: if no provider specified, assume 'claude' (current behavior). 15+ tests.

### Tests
- Claude tasks still resolve correctly (backward compat)
- Codex tasks resolve to gpt-4.1/o3/o4-mini
- Gemini tasks resolve to gemini-2.5-pro/flash
- Tier mapping works across providers
- Usage pressure downgrades within provider's models
- forceModel validated against provider
- 15+ tests

---

## Task 10: Provider Usage Balancer
- Model: opus
- Effort: high
- Files: src/orchestra/usage-manager.ts (extracted in Sprint 036)
- Scope: src/orchestra/

### Description
Extend usage-manager with multi-provider quota tracking:
- `checkAllProviderUsage(): Promise<Map<ProviderName, UsageMetrics>>`
- `selectOptimalProvider(taskTier, providerUsage): ProviderName` — pick provider with most remaining quota for the needed tier
- When primary provider >80% quota, automatically suggest switching to fallback
- For API providers: track token count, estimate remaining budget
- Integrate with adjustSprintSize: if all providers are high usage, reduce sprint. 15+ tests.

### Tests
- All provider usage checked in parallel
- Optimal provider selected based on remaining quota
- High usage triggers fallback suggestion
- API token budget tracked
- Sprint size adjusted when all providers high
- 15+ tests

---

## Task 11: spawnWorkers Provider Routing
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts (extracted in Sprint 036)
- Scope: src/orchestra/

### Description
Update spawnWorkers() to route each task to the correct provider:
1. Read task.provider field
2. Get ProviderAdapter from ProviderRegistry
3. Call adapter.spawn(taskId, task.model, prompt, opts)
4. Track which provider owns which worker (for kill/status)
Mixed sprint support: Task A on Claude, Task B on Codex, Task C on Gemini — all in same sprint. Worker status tracking must handle multiple providers. 15+ tests.

### Tests
- Task with provider='claude' spawns via ClaudeAdapter
- Task with provider='codex' spawns via CodexAdapter
- Mixed sprint: Claude + Codex workers run simultaneously
- Kill routes to correct provider
- Status shows provider per worker
- Provider unavailable triggers fallback
- 15+ tests

---

## Task 12: Provider Fallback Chain
- Model: opus
- Effort: normal
- Files: src/core/provider.ts, src/orchestra/sprint-controller.ts
- Scope: src/core/, src/orchestra/

### Description
When a provider fails (CLI not found, API key expired, rate limited):
1. Log warning with reason
2. Check config.fallback_provider
3. If fallback available: remap task to fallback provider, select equivalent model
4. If no fallback: fail task with clear error (not silent failure)
5. Notify user via notification system (if configured)
Retry logic: attempt primary once, fallback once, then fail. No infinite retry loops. 10+ tests.

### Tests
- Primary failure triggers fallback
- Fallback selects equivalent model
- No fallback configured → clear error
- Rate limit triggers fallback
- CLI not found triggers fallback
- Notification sent on provider switch
- No infinite retry
- 10+ tests

---

## Task 13: Platform Support Matrix & Doctor Check
- Model: sonnet
- Effort: normal
- Files: README.md, src/cli/commands/doctor.ts, .github/workflows/ci.yml
- Scope: src/cli/, .github/, ./

### Description
SOURCE: Codex analysis Phase 1. Define explicit platform support matrix: Linux FULL SUPPORT, macOS FULL SUPPORT, WSL2 FULL SUPPORT, Native Windows UNSUPPORTED (requires WSL2). Add to README.md in clear Platform Support section. In deckent doctor, detect native Windows (process.platform === 'win32' without WSL) and show early warning. In CI, keep Ubuntu as merge gate; Windows job informational only (allow failure). 10+ tests.

### Tests
- Doctor detects native Windows and warns
- Doctor passes on Linux/WSL2
- README contains platform matrix
- CI Windows job is allow-failure
- 10+ tests

---

## Task 14: CLI Entrypoint Side-Effect Fix
- Model: opus
- Effort: normal
- Files: src/cli/index.ts, src/cli/entry.ts (new), tests/cli/index.test.ts
- Scope: src/cli/, tests/cli/

### Description
SOURCE: Codex analysis Phase 2. src/cli/index.ts runs parseAsync on import causing side-effects and test timeouts. Extract buildProgram(): Command function that configures program without parsing. Create src/cli/entry.ts as thin wrapper that imports buildProgram and calls parseAsync. Update package.json bin to point to dist/cli/entry.js. index.ts only exports buildProgram with no side effects. Update tests to not hardcode command count. Add import smoke test. 10+ tests.

### Tests
- Importing index.ts does not trigger parse
- buildProgram returns Command with all commands registered
- entry.ts calls parseAsync
- bin field points to entry.js
- 10+ tests

---

## Task 15: Planner Provider Decoupling
- Model: opus
- Effort: high
- Files: src/orchestra/planner.ts, tests/orchestra/planner.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
SOURCE: All three analyses (CC audit, Codex, Antigravity). planner.ts hardcodes spawnSync('claude', ...). Decouple: callBrainPlanner should accept ProviderAdapter parameter or get from registry. Use adapter.buildCommand() instead of hardcoded claude command. For structured mode no provider call needed. For AI mode call adapter.spawn() or equivalent. callZeroConfigPlanner same treatment. Backward compat: if no provider passed use ProviderRegistry.getDefault(). Most impactful decoupling task. 15+ tests.

### Tests
- AI planner works with Claude adapter (backward compat)
- AI planner works with mock Codex adapter
- Structured planner needs no provider
- Zero-config planner uses adapter
- Missing provider falls back to registry default
- 15+ tests

---

## Task 16: tmux.ts Provider Decoupling
- Model: opus
- Effort: normal
- Files: src/orchestra/tmux.ts, tests/orchestra/tmux.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
SOURCE: All three analyses. tmux.ts buildClaudeCommand hardcodes claude CLI syntax. Rename to buildWorkerCommand (backward compat alias). Accept ProviderAdapter parameter. Use adapter.buildCommand() instead of claude-specific string. spawnWorker receives adapter from caller. tmux.ts becomes provider-agnostic terminal manager. 10+ tests.

### Tests
- buildWorkerCommand produces Claude command with ClaudeAdapter
- buildWorkerCommand produces Codex command with mock adapter
- spawnWorker accepts adapter parameter
- Backward compat: no adapter = Claude default
- 10+ tests

---

## Task 17: subprocess.ts Provider Decoupling
- Model: opus
- Effort: normal
- Files: src/providers/subprocess.ts, tests/providers/subprocess.test.ts
- Scope: src/providers/, tests/providers/

### Description
SOURCE: Codex + Antigravity. subprocess.ts hardcodes claude. SubprocessBackend should accept ProviderAdapter in constructor or per-spawn. Use adapter.buildCommand() for command construction. Use adapter.supportedModels for model validation. Remove all hardcoded claude references. Enables SubprocessBackend + CodexAdapter combination — ideal first integration path for non-Claude providers. 10+ tests.

### Tests
- Subprocess spawns Claude with ClaudeAdapter
- Subprocess spawns Codex with CodexAdapter (mock)
- Model validated against adapter.supportedModels
- No hardcoded claude strings remain
- 10+ tests

---

## Task 18: Provider Bootstrap Centralization
- Model: opus
- Effort: normal
- Files: src/core/provider.ts, src/cli/commands/start.ts, src/mcp/tools/start.ts
- Scope: src/core/, src/cli/, src/mcp/

### Description
SOURCE: Codex + Antigravity. ProviderRegistry exists but not used as central bootstrap point. Create bootstrapProviders(config): detect available providers, register adapters, set default based on config. Called once at startup (CLI start, MCP start). All subsequent code gets providers from registry. Brain, planner, sprint-controller all receive registry reference. Single source of truth. 10+ tests.

### Tests
- bootstrapProviders registers all available providers
- Default provider matches config.brain_provider
- Unavailable providers skipped with warning
- Registry passed to brain/planner/sprint-controller
- 10+ tests

---

## Task 19: Cross-Platform Test Helper
- Model: sonnet
- Effort: normal
- Files: tests/helpers/platform.ts (new), tests/helpers/paths.ts (new)
- Scope: tests/helpers/

### Description
SOURCE: Codex analysis Phase 5. Create shared test utilities: normalizePath (separator handling), isUnixOnly, skipOnWindows, createTempDir (platform-safe), assertPathEquals (ignore separator differences). Update 5-10 most commonly failing test files as proof of concept. 15+ tests.

### Tests
- normalizePath handles Windows backslashes
- normalizePath handles Unix forward slashes
- skipOnWindows skips on win32
- assertPathEquals matches equivalent paths
- 15+ tests

---

## Task 20: Platform-Conditional Test Tags
- Model: sonnet
- Effort: normal
- Files: tests/orchestra/tmux.test.ts, tests/orchestra/tmux-edge.test.ts, tests/scripts/scripts.test.ts, vitest.config.ts
- Scope: tests/, vitest.config.ts

### Description
SOURCE: Codex analysis Phase 1. Unix-only test suites should be conditionally skipped: describe.skipIf(process.platform === 'win32') for tmux tests, scripts tests. Document which test patterns are platform-specific in tests/PLATFORM.md. 5+ tests.

### Tests
- tmux tests skip on Windows
- tmux tests run on Linux/WSL
- scripts tests skip on Windows
- PLATFORM.md documents categories
- 5+ tests
