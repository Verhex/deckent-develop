# DIRECTIVES — Sprint 045: MCP-Native Providers & Module Integration

## Goal: Connect Sprint 044 modules to real providers, enable Codex/Gemini execution, integrate Router+Connector into sprint lifecycle

Sprint 044 built the foundation (Router, Connector, .deck, env detection, rich output). Sprint 045 wires these modules into the live sprint pipeline and upgrades provider adapters to use real CLI commands with subscription auth.

---

## Task 1: Connector Integration into bootstrapProviders
- Model: opus
- Effort: high
- Files: src/core/provider.ts, src/orchestra/connector.ts, tests/core/provider.test.ts
- Scope: src/core/, src/orchestra/, tests/

### Description
Wire the Connector module (Sprint 044) into the existing bootstrapProviders() flow.

**Changes:**
- `bootstrapProviders()` now creates a Connector instance and registers providers through it
- Connector tracks health status for each registered provider
- `bootstrapProviders()` returns `{ connector, registered, skipped }` instead of just `{ registered, skipped }`
- All downstream code that calls `providerRegistry.get()` continues to work (backward compat)
- Connector.healthCheck() called during bootstrap — unhealthy providers logged as warning but still registered

**Integration points:**
- `src/cli/commands/start.ts` — receives connector from bootstrap
- `src/mcp/tools/start.ts` — receives connector from bootstrap
- Sprint-controller receives connector reference for runtime health checks

### Tests
- Bootstrap creates Connector with all available providers
- Health check runs during bootstrap
- Unhealthy provider still registered (with warning)
- Connector accessible from sprint-controller
- Backward compat: existing providerRegistry.get() still works
- 10+ tests

---

## Task 2: Router Integration into Sprint Lifecycle
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts, tests/orchestra/sprint-controller.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Wire the TaskRouter (Sprint 044) into sprint-controller.ts between planSprint() and spawnWorkers().

**Changes to sprint-controller.ts:**
- After `planSprint()` creates tasks, call `routeTask()` for each task
- Router assigns: `task.provider`, refines `task.assignedAgent`, adds `task.assignedSkills`
- Router uses Connector to check provider availability
- If Router assigns a non-Claude provider, spawnWorkers() uses SubprocessBackend (not tmux)
- Config `skill_routing.*` overrides respected

**Flow:**
```
planSprint() → tasks created
  ↓
routeTask(task, config, connector.getAvailableProviders()) → each task gets provider+agent+skill
  ↓
spawnWorkers() → uses task.provider to select backend
```

**Backward compat:** If Router is not available or fails, fall back to existing behavior (all tasks → brain_provider).

### Tests
- Router called after planSprint
- Task.provider set by router
- Skill routing config respected
- Router failure falls back to default
- Non-Claude provider routes to subprocess
- 10+ tests

---

## Task 3: Codex Adapter — Real CLI Integration
- Model: opus
- Effort: high
- Files: src/providers/codex.ts, tests/providers/codex.test.ts
- Scope: src/providers/, tests/providers/

### Description
Upgrade CodexAdapter to use real Codex CLI commands with subscription auth.

**Current state:** CodexAdapter exists but uses mock/placeholder commands.

**Target:**
- `spawn()`: runs `codex exec --full-auto "<prompt>" --model <model>` via SubprocessBackend
- `buildCommand()`: generates correct `codex exec` command string
- `isAvailable()`: checks `which codex` + auth status via `codex auth status` or similar
- `checkUsage()`: returns usage metrics (parse from codex CLI if available, else estimate)
- Auth: supports both ChatGPT subscription (browser auth) and API key (OPENAI_API_KEY / DECKENT_OPENAI_API_KEY from .deck)

**Model mapping update:**
```typescript
const CODEX_MODELS = {
  premium: 'gpt-5',           // was gpt-5 ✓
  standard: 'gpt-4.1',        // was gpt-4.1 ✓
  economy: 'gpt-4.1-mini',    // update
  codex: 'gpt-5.3-codex',     // new — codex-specific model
};
```

**Important:** Do NOT break existing mock tests. Add new test file for real CLI integration: `tests/providers/codex-integration.test.ts` (skipped in CI if codex CLI not available).

### Tests
- buildCommand generates correct codex exec string
- spawn calls SubprocessBackend with correct command
- isAvailable checks CLI existence
- Auth mode detection (subscription vs API key)
- .deck file API key loaded when present
- Model mapping correct
- 12+ tests

---

## Task 4: Gemini Adapter — Real CLI Integration
- Model: opus
- Effort: high
- Files: src/providers/gemini.ts, tests/providers/gemini.test.ts
- Scope: src/providers/, tests/providers/

### Description
Upgrade GeminiAdapter to use real Gemini CLI commands.

**Target:**
- `spawn()`: runs `gemini -p "<prompt>" --output-format json` via SubprocessBackend
- `buildCommand()`: generates `gemini -p` command with correct flags
- `isAvailable()`: checks `which gemini` + auth (GOOGLE_API_KEY or Google account)
- `checkUsage()`: parse JSON output stats (token counts from headless mode response)
- Result parsing: extract response from JSON output `{ response: "...", stats: {...} }`

**Model mapping update:**
```typescript
const GEMINI_MODELS = {
  premium: 'gemini-2.5-pro',
  standard: 'gemini-2.5-flash',
  economy: 'gemini-2.0-flash',
};
```

**Gemini CLI specifics:**
- Uses `-p` flag for headless/non-interactive mode
- `--output-format json` gives structured output with stats
- Auth: Google account (default) or GOOGLE_API_KEY env var
- GEMINI.md context file support (equivalent to CLAUDE.md)

### Tests
- buildCommand generates correct gemini -p string
- JSON output parsing extracts response and stats
- isAvailable checks CLI + auth
- .deck file API key loaded when present
- Model mapping correct
- 10+ tests

---

## Task 5: Claude Adapter — MCP Server Mode Option
- Model: sonnet
- Effort: normal
- Files: src/providers/claude.ts, tests/providers/claude.test.ts
- Scope: src/providers/, tests/providers/

### Description
Add MCP server mode to ClaudeAdapter alongside existing tmux mode.

**Current:** ClaudeAdapter uses tmux backend exclusively.

**Add:** Config option `claude_backend: 'tmux' | 'subprocess' | 'mcp'`
- `tmux` (default): existing behavior
- `subprocess`: uses SubprocessBackend with `claude -p` headless
- `mcp`: future — Claude as MCP server (stub for now, full implementation Sprint 046)

**Subprocess mode details:**
- `claude -p "<prompt>" --dangerously-skip-permissions` 
- Output captured via stdout
- No tmux dependency — works in any terminal
- Useful for environments where tmux is unavailable

### Tests
- Subprocess mode generates correct command
- tmux mode unchanged (backward compat)
- Config claude_backend respected
- MCP mode stub returns not-implemented error
- 8+ tests

---

## Task 6: .deck Secret Loading in Provider Auth
- Model: sonnet
- Effort: normal
- Files: src/core/provider.ts, src/core/deck-file.ts, tests/core/provider.test.ts
- Scope: src/core/, tests/core/

### Description
When auth_mode is 'api' or 'hybrid', load API keys from .deck file.

**Flow:**
1. bootstrapProviders() calls loadDeckSecrets()
2. For each provider, check .deck for API key:
   - Codex: DECKENT_OPENAI_API_KEY → set as OPENAI_API_KEY in spawn env
   - Gemini: DECKENT_GOOGLE_API_KEY → set as GOOGLE_API_KEY in spawn env
   - Claude: DECKENT_CLAUDE_API_KEY → set as ANTHROPIC_API_KEY in spawn env
3. .deck keys take precedence over system env vars (explicit > implicit)
4. If auth_mode = 'subscription', skip .deck loading entirely

**Worker env injection:**
- SubprocessBackend.spawn() receives `env` override parameter
- Only the needed key is passed to worker process (not full .deck contents)

### Tests
- .deck API key loaded for codex provider
- .deck API key loaded for gemini provider
- .deck takes precedence over system env
- subscription mode skips .deck
- Worker receives only needed key (not full secrets)
- 8+ tests

---

## Task 7: Provider Health in deckent doctor
- Model: sonnet
- Effort: normal
- Files: src/cli/commands/doctor.ts, tests/cli/commands/doctor.test.ts
- Scope: src/cli/, tests/cli/

### Description
Extend `deckent doctor` to show provider health status using Connector.

**New checks:**
```
[PASS] Claude CLI    claude v2.1.81 — session auth active
[PASS] Codex CLI     codex v1.2.0 — ChatGPT subscription
[WARN] Gemini CLI    not installed — install: npm i -g @google/gemini-cli
[PASS] .deck file    found, 3/9 keys configured
[PASS] Environment   vscode detected
```

**Implementation:**
- Call Connector.healthCheck() for all providers
- Show CLI version, auth status, and availability
- Show .deck file status (found/missing, keys configured count)
- Show detected environment

### Tests
- Doctor shows provider health
- Missing CLI shows install command
- .deck status reported
- Environment shown
- 8+ tests

---

## Task 8: Rich Output Integration into finalizeSprint
- Model: sonnet
- Effort: normal
- Files: src/orchestra/sprint-controller.ts, src/cli/helpers/sprint-summary-rich.ts
- Scope: src/orchestra/, src/cli/

### Description
Wire Sprint 044's formatRichSprintSummary into the actual finalizeSprint flow.

**Changes:**
- finalizeSprint() calls formatRichSprintSummary() instead of formatSprintSummary()
- Pass git diff stats (from `git diff --stat HEAD~1`)
- Pass agent performance data (from buildAgentPerformance())
- Pass evaluations map for learnings section
- Respect config.output_mode: quiet → minimal, normal → rich, verbose → rich + logs
- Kraken splash shown at sprint START (not end) — first sprint only

**Fallback:** If formatRichSprintSummary throws, fall back to formatSprintSummary.

### Tests
- Rich output called during finalize
- Git diff stats included
- Agent performance table populated
- Output mode respected
- Fallback works on error
- 8+ tests

---

## Task 9: Environment-Aware deckent init
- Model: sonnet
- Effort: normal
- Files: src/cli/commands/init.ts, tests/cli/commands/init.test.ts
- Scope: src/cli/, tests/cli/

### Description
Upgrade `deckent init` to use environment detection and create correct config files.

**Flow:**
1. Show Kraken splash
2. detectEnvironment() → detected_env
3. Based on env, create appropriate config file:
   - vscode/shell → CLAUDE.md with @DECKENT.md (existing)
   - codex → AGENTS.md with Deckent instructions
   - gemini → GEMINI.md with Deckent context
   - cursor → .cursor/rules/deckent.mdc (if not exists)
4. Create .deck template
5. Run deckent doctor (provider health check)
6. Show summary: what was created, what providers are available

**AGENTS.md template (for Codex):**
```markdown
# AGENTS.md — Deckent Integration

This project uses Deckent for AI agent orchestration.

## Sprint Instructions
- Read DIRECTIVES.md for current sprint goals
- Follow task scope boundaries strictly
- Write tests for all changes
- Report results in .tasks/ directory

## Project Context
@DECKENT.md
```

**GEMINI.md template (for Gemini CLI):**
```markdown
# GEMINI.md — Deckent Integration

This project uses Deckent for AI agent orchestration.

## Context
@DECKENT.md

## Rules
- Follow DIRECTIVES.md for sprint goals
- Respect file scope boundaries
- Run tests before reporting completion
```

### Tests
- Init creates CLAUDE.md in vscode env
- Init creates AGENTS.md in codex env
- Init creates GEMINI.md in gemini env
- Init creates .cursor/rules in cursor env
- Init creates .deck template
- Kraken splash shown
- Doctor runs after init
- 10+ tests

---

## Task 10: Sprint 044 Module Smoke Tests
- Model: sonnet
- Effort: normal
- Files: tests/integration/sprint-044-modules.test.ts (new)
- Scope: tests/integration/

### Description
Integration tests verifying all Sprint 044 modules work together in a realistic flow.

**Test scenarios:**
1. **Full init flow:** detectEnvironment() → createDeckTemplate() → loadConfig() → showSplash() → formatDoctorResult()
2. **Route + Connect flow:** Connector registers Claude → routeTask() → task gets provider=claude
3. **Sync + Explain flow:** git changes detected → MEMORY.md updated → explain reads sprint log
4. **Rich output flow:** mock sprint data → formatRichSprintSummary() → all 7 sections present
5. **Config roundtrip:** createDefaultConfig() → add all new fields → validate → resolve → all fields present
6. **DEBT auto-resolve:** create debt entry → mark task fixed → debt entry resolved
7. **Env detection matrix:** set various env vars → correct env detected each time

### Tests
- Init flow produces valid output
- Route+Connect assigns provider correctly
- Sync writes to MEMORY.md
- Rich output has all sections
- Config roundtrip preserves all fields
- DEBT auto-resolve works end-to-end
- Env detection correct for all 6 environments
- 15+ tests

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing 9,626 tests: 0 regression
- All code in English
- No new runtime dependencies
- Codex/Gemini integration tests: skip if CLI not available (`describe.skipIf`)
- Every modified function retains JSDoc
- Backward compatibility: existing Claude-only sprints must work identically
