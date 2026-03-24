# DIRECTIVES — Sprint 044: Foundation Upgrade

## Goal: .deck secrets, full config, rich output, kraken splash, Router, Connector, sync, explain

This sprint establishes the foundation for Deckent's multi-environment beta. It adds the `.deck` secret file system, makes all config parameters visible, introduces Router and Connector modules, enriches sprint output, adds the Kraken ASCII splash, and creates `deckent sync` + `deckent explain` commands.

---

## Task 1: .deck Secret File System
- Model: sonnet
- Effort: high
- Files: src/core/deck-file.ts (new), tests/core/deck-file.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Create `.deck` secret file system — Deckent's own `.env` equivalent that never conflicts with project `.env` files.

**deck-file.ts exports:**
- `parseDeckFile(content: string): Record<string, string>` — parse key=value format, `#` comments, blank lines skip, trim whitespace
- `loadDeckSecrets(projectRoot: string): Record<string, string>` — read `.deck` file, return parsed secrets. Does NOT inject into process.env (Brain decides what to pass)
- `validateDeckFile(secrets: Record<string, string>): DeckFileValidation` — check for unknown keys, empty required keys, format errors
- `createDeckTemplate(projectRoot: string): void` — create `.deck` with all known keys as empty values with comments
- `ensureDeckGitignore(projectRoot: string): void` — ensure `.deck` is in `.gitignore`, add if missing
- `isDeckFileCommitted(projectRoot: string): boolean` — check git status, return true if `.deck` is tracked

**Known keys (all start with DECKENT_ prefix):**
```
# === Provider API Keys ===
DECKENT_CLAUDE_API_KEY=
DECKENT_OPENAI_API_KEY=
DECKENT_GOOGLE_API_KEY=

# === Notifications ===
DECKENT_SMTP_HOST=
DECKENT_SMTP_USER=
DECKENT_SMTP_PASS=
DECKENT_WEBHOOK_URL=

# === Storage ===
DECKENT_DB_URL=

# === Telemetry ===
DECKENT_TELEMETRY_ID=

# === Custom (for plugins) ===
# DECKENT_CUSTOM_*=
```

**Security rules:**
- Worker processes NEVER receive `.deck` path or full contents — Brain injects only needed env vars
- Auditor checks: if `.deck` is committed to git → CRITICAL alert
- `.deck` is always in `.gitignore`

### Tests
- Parse valid .deck file (key=value, comments, blanks)
- Parse edge cases (= in value, quotes, unicode)
- Empty/missing file returns empty record
- Template creation includes all known keys
- .gitignore ensured (append, no duplicate)
- Committed detection works
- Validation catches unknown keys
- 15+ tests

---

## Task 2: Config — All Parameters Visible
- Model: sonnet
- Effort: high
- Files: src/core/config.ts, src/core/config-types.ts, tests/core/config.test.ts
- Scope: src/core/, tests/core/

### Description
Extend DeckentConfig type and createDefaultConfig() so every possible parameter is present, even if null/default. User opening `.deckent/config.json` sees ALL capabilities.

**New config fields to add (with defaults):**

```typescript
interface DeckentConfig {
  // ... existing fields ...

  // Output
  output_splash: boolean;          // true — show kraken on init/version
  output_mode: 'quiet' | 'normal' | 'verbose';  // 'normal'
  output_theme: 'default' | 'minimal' | 'rich';  // 'default'

  // Skill Routing
  skill_routing: {
    design: ProviderName | 'auto' | null;    // null
    testing: ProviderName | 'auto' | null;   // null
    docs: ProviderName | 'auto' | null;      // null
    default: ProviderName | 'auto';          // 'auto'
  };

  // Online Search
  search_enabled: boolean;         // true
  search_provider: 'context7' | 'web' | 'none';  // 'context7'
  search_cache_ttl: number;        // 3600

  // Notifications
  notify_on_complete: boolean;     // false
  notify_channel: 'slack' | 'discord' | 'email' | 'webhook' | null;  // null
  notify_url: string | null;       // null

  // Telemetry
  telemetry_enabled: boolean;      // false
  telemetry_anonymous: boolean;    // true

  // Environment
  detected_env: 'vscode' | 'codex' | 'gemini' | 'cursor' | 'tmux' | 'shell' | null;  // null (auto)
  multi_ide_mode: boolean;         // false

  // Auth
  auth_mode: 'subscription' | 'api' | 'hybrid';  // 'subscription'
}
```

**createDefaultConfig() must include ALL fields with their defaults.**
**Config validation must accept null values for optional fields.**
**Existing tests must not break — backward compatible.**

### Tests
- Default config has all new fields
- Null values accepted for optional fields
- Existing config files load without errors (missing new fields get defaults)
- Config validation catches invalid enum values
- 10+ tests

---

## Task 3: Task Router Module
- Model: opus
- Effort: high
- Files: src/orchestra/task-router.ts (new), tests/orchestra/task-router.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
New TaskRouter module — decides which provider, agent, and skill handles each task.

**Exports:**
- `routeTask(task: Task, config: ResolvedConfig, availableProviders: ProviderName[]): TaskRouting`
- `TaskRouting = { provider: ProviderName; agent: string; skills: string[]; reason: string }`

**Routing logic (priority order):**
1. **Config override** — if `skill_routing.design = 'gemini'` and task matches design skill → gemini
2. **Task force** — if task has `forceModel` → use that provider
3. **Agent preference** — if assigned agent has `preferredProvider` → use it
4. **Skill affinity** — match task type to skill, skill to provider (e.g., design skills → gemini)
5. **Provider availability** — fallback if primary unavailable
6. **Default** — use `skill_routing.default` (default: 'auto' → brain_provider)

**Task type detection:**
- Source code patterns (src/, .ts, .py, .java) → code task
- Test patterns (tests/, .test., .spec.) → test task
- Doc patterns (docs/, .md, README) → doc task
- Design patterns (ui/, components/, .css, .html) → design task

### Tests
- Config override respected
- Force model respected
- Agent preference used when available
- Skill affinity routing correct
- Fallback when provider unavailable
- Default routing works
- Task type detection accurate
- 15+ tests

---

## Task 4: Connector Module
- Model: opus
- Effort: high
- Files: src/orchestra/connector.ts (new), tests/orchestra/connector.test.ts (new)
- Scope: src/orchestra/, tests/orchestra/

### Description
MCP connection manager — handles provider lifecycle.

**Exports:**
- `Connector` class:
  - `registerProvider(name: ProviderName, adapter: ProviderAdapter): void`
  - `getProvider(name: ProviderName): ProviderAdapter | null`
  - `healthCheck(name?: ProviderName): HealthCheckResult[]`
  - `getAvailableProviders(): ProviderName[]`
  - `isProviderReady(name: ProviderName): boolean`

- `HealthCheckResult = { provider: ProviderName; available: boolean; authStatus: 'ok' | 'missing' | 'expired'; cliVersion: string | null; error: string | null }`

**Behavior:**
- Lazy initialization: provider started only when first needed
- Health check: CLI exists? Auth valid? Connection alive?
- Auditor integration: emits alerts on connection failure
- Thread-safe: no race conditions on concurrent access

### Tests
- Provider registration and retrieval
- Health check detects missing CLI
- Health check detects missing auth
- Available providers list correct
- Unavailable provider returns null
- 10+ tests

---

## Task 5: Rich Sprint Output
- Model: opus
- Effort: high
- Files: src/cli/helpers/output.ts, src/cli/helpers/sprint-summary-rich.ts (new), tests/cli/helpers/sprint-summary-rich.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
Replace plain formatSprintSummary() with rich, informative output.

**New formatRichSprintSummary(sprint, evaluations, gitDiff?, agentPerf?): string**

**Sections:**
1. **Header** — `● Sprint #N Complete` + duration (right-aligned)
2. **Results** — `✓ X done  ⚡ Y debt  ✗ Z no-go  coverage%` with ANSI colors
3. **Changes** — git diff stat per file (path, +lines, -lines, tags like `(new)`, `(deleted)`)
   - Show max 5 files, "... N more files" if truncated
   - Use `git diff --stat` output parsing
4. **Tests** — `+N new │ total │ fail │ coverage (delta)`
5. **Agent Performance** — table with agent name, tasks, done ratio, provider, avg coverage
   - Use existing `buildAgentPerformance()` from sprint-reporter.ts
6. **Learnings** — Top 3 items from MEMORY.md sprint entry (✓ success, ⚠ warning)
7. **Next Steps** — Auto-generated actionable items:
   - If NO_GO tasks: "Fix N NO_GO tasks..."
   - If debt: "Review tech debt..."
   - Always: "Run `deckent start` to continue"

**Color system:**
- Use ANSI escape codes directly (no new dependency — chalk is optional, stick with existing approach)
- Respect NO_COLOR env var
- Respect output_mode: quiet → only Results line, normal → full, verbose → full + worker logs

**Integration:**
- Replace call to formatSprintSummary() in finalizeSprint flow with formatRichSprintSummary()
- Keep formatSprintSummary() as fallback for quiet mode

### Tests
- Full output contains all 7 sections
- NO_COLOR produces clean text (no ANSI)
- Quiet mode shows only results
- Verbose mode includes extra detail
- Git diff parsing handles various formats
- Agent performance table renders correctly
- Empty sprint (0 tasks) handles gracefully
- 10+ tests

---

## Task 6: Kraken ASCII Splash
- Model: sonnet
- Effort: normal
- Files: src/cli/helpers/splash.ts (new), tests/cli/helpers/splash.test.ts (new), src/cli/commands/init.ts, src/cli/commands/version.ts
- Scope: src/cli/, tests/cli/

### Description
Add Deckent's Kraken mascot splash screen.

**Finalized Kraken design (V2 — small head, 8 tentacles, even length):**
```
        ▄████▄
       ████████
        ██████
      ▐▌▐▌▐▌▐▌▐▌
     ▐▌▐▌ ▐▌ ▐▌▐▌
    ▐▌ ▐▌ ▐▌ ▐▌ ▐▌
    ▀  ▀  ▀  ▀  ▀
```

**splash.ts exports:**
- `KRAKEN_ASCII: string` — the raw ASCII art (no colors)
- `showSplash(version: string): string` — returns colored splash:
  - Kraken body: teal ANSI color (38;2;77;184;164)
  - "DECKENT" text: gold ANSI color (38;2;196;168;85), bold
  - Version: dim/gray
  - Tagline: "AI Agent Orchestrator" in dim
- `showSplashIfEnabled(config: { output_splash: boolean }, version: string): string | null`

**Where to show:**
- `deckent init` — after successful init, before summary
- `deckent --version` — splash + version info

**Config:** `output_splash = true` (default). Set to `false` to disable.
**NO_COLOR:** When set, splash renders without ANSI colors (plain ASCII).

### Tests
- Splash renders with correct kraken shape
- ANSI colors applied (teal body, gold text)
- NO_COLOR returns plain text
- output_splash=false returns null
- Version string included
- 5+ tests

---

## Task 7: deckent sync Command
- Model: sonnet
- Effort: normal
- Files: src/cli/commands/sync.ts (new), tests/cli/commands/sync.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
New CLI command: detect out-of-band changes made while Deckent wasn't running.

**`deckent sync` behavior:**
1. Find last sprint's end timestamp from `.brain/sprints/` (latest file mtime)
2. Run `git log --oneline --since=<timestamp>` to find commits since last sprint
3. Run `git diff HEAD~N --stat` to get changed files summary
4. Categorize changes: new files, modified files, deleted files
5. Write summary to MEMORY.md under `## Out-of-band Changes`
6. Print summary to terminal

**Output format:**
```
Synced: 3 commits since Sprint #42
  Modified: src/auth/jwt.ts, src/middleware/guard.ts
  New: src/utils/crypto.ts
  Deleted: src/old-auth.ts
  → Added to MEMORY.md for next sprint context
```

**Edge cases:**
- No git repo → skip, print warning
- No previous sprint → skip, print info
- No changes → print "No changes since last sprint"

### Tests
- Detects commits since last sprint
- Writes to MEMORY.md correctly
- Handles no git repo
- Handles no previous sprint
- Handles no changes
- 8+ tests

---

## Task 8: deckent explain Command
- Model: sonnet
- Effort: normal
- Files: src/cli/commands/explain.ts (new), tests/cli/commands/explain.test.ts (new)
- Scope: src/cli/, tests/cli/

### Description
New CLI command: explain what the last sprint did in human-friendly language.

**`deckent explain` behavior:**
1. Find latest sprint log from `.brain/sprints/`
2. Read sprint log + RETRO.md
3. Format a human-readable summary:
   - What was the goal (from original directives)
   - What tasks were planned
   - Which succeeded, which failed
   - Key learnings
   - What to do next

**Output format:**
```
Sprint #42 Summary
━━━━━━━━━━━━━━━━━

Goal: Fix hardcoded provider fallbacks and stabilize tests

What happened:
  • 5 tasks completed successfully (provider fix, semver, identity update...)
  • 3 tasks failed (doc generation tasks — workers struggled with output format)
  • Added 43 new tests, bringing total to 9,406

Key learnings:
  • Doc tasks need structured templates to succeed
  • Worker verify loop prevented false NO_GO on code tasks

Next: Run `deckent start` to continue, or `deckent plan` to see next sprint
```

### Tests
- Reads latest sprint log correctly
- Formats readable output
- Handles missing sprint log
- Handles empty retro
- 5+ tests

---

## Task 9: DEBT Auto-Resolve & DECISIONS Auto-Draft
- Model: sonnet
- Effort: normal
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/sprint-reporter.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Two improvements to automatic documentation:

**9a. DEBT.md auto-resolve:**
When FIX phase successfully fixes a NO_GO task, mark the corresponding DEBT.md entry as `resolved`.
- In `writeRetrospective()` or `finalizeSprint()`: scan evaluations for tasks that were NO_GO in initial eval but GO after FIX
- Find matching DEBT.md entry by task title/ID
- Update status column from `open` to `resolved`
- Add resolution date

**9b. DECISIONS.md auto-draft:**
When sprint introduces a new module (new directory under src/) or significantly changes architecture:
- In `finalizeSprint()`: detect new directories in git diff
- If new directory found: append draft ADR to DECISIONS.md
- Format: `### ADR-NNN: [Module Name] (Draft — Sprint #N)\nStatus: PROPOSED\nContext: Added in Sprint #N\nDecision: [placeholder]\n`
- Brain can refine in next sprint

### Tests
- DEBT entry marked resolved after successful fix
- No false resolves (task must actually pass after fix)
- ADR draft created for new directories
- No ADR for existing directories
- 8+ tests

---

## Task 10: Environment Detection
- Model: sonnet
- Effort: normal
- Files: src/core/environment.ts (new), tests/core/environment.test.ts (new)
- Scope: src/core/, tests/core/

### Description
Auto-detect which IDE/environment Deckent is running in.

**detectEnvironment(): DetectedEnv**

```typescript
type DetectedEnv = 'vscode' | 'codex' | 'gemini' | 'cursor' | 'tmux' | 'shell';

function detectEnvironment(): DetectedEnv {
  // VS Code: VSCODE_PID, VSCODE_CWD, TERM_PROGRAM='vscode'
  // Codex: CODEX_SESSION, process.argv includes 'codex'
  // Gemini: GEMINI_CLI, parent process is 'gemini'
  // Cursor: CURSOR_SESSION, TERM_PROGRAM='cursor'
  // tmux: TMUX env var present
  // shell: fallback
}
```

**Integration:**
- `deckent doctor` shows detected environment
- `deckent init` uses detected env to choose config file template (CLAUDE.md vs AGENTS.md vs GEMINI.md)
- Stored in config as `detected_env` (auto-updated on each run)

### Tests
- VS Code detected from VSCODE_PID
- Codex detected from CODEX_SESSION
- Gemini detected from GEMINI_CLI
- Cursor detected from CURSOR_SESSION
- tmux detected from TMUX
- Fallback to shell
- 5+ tests

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing 9,406 tests: 0 regression
- All code in English (comments, variables, docs)
- All CLI output respects NO_COLOR env var
- output_mode quiet/normal/verbose respected where applicable
- No new runtime dependencies (use existing ANSI codes, not chalk)
- Every new file has JSDoc on exported functions
