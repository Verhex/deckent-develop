# Contributing to Deckent

Thank you for your interest in contributing to Deckent -- the AI agent orchestration CLI. This guide covers everything you need to get started, from development setup to submitting pull requests.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Code Standards](#code-standards)
5. [Testing Guide](#testing-guide)
6. [How to Add a CLI Command](#how-to-add-a-cli-command)
7. [Branch Strategy](#branch-strategy)
8. [Commit Messages](#commit-messages)
9. [Pull Request Process](#pull-request-process)
10. [Sprint Contribution](#sprint-contribution)
11. [Plugin System Development](#plugin-system-development)
12. [Internationalization (i18n) Contributing](#internationalization-i18n-contributing)
13. [MCP Tool and Resource Development](#mcp-tool-and-resource-development)

---

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Install dependencies and verify the setup
4. Create a feature branch
5. Make your changes with tests
6. Open a pull request

If you are not sure where to start, look for issues labeled `good first issue` or `help wanted` on GitHub.

---

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0 — enforced via `package.json` `engines` (required for `node:readline/promises`, `structuredClone`, native ESM)
- **npm** — any version bundled with Node 18+ works (npm 9+ recommended; not enforced in `engines`)
- **git**

```bash
node --version  # must be >= 18.0.0
npm --version
git --version
```

### Installation

```bash
# Clone the repository
git clone https://github.com/VerhexIO/deckent.git
cd deckent

# Install dependencies
npm install
```

### Key commands

```bash
# Build
npm run build        # Compile TypeScript → dist/ (tsc + copy-assets)
npm run build:all    # Full build including the web dashboard (Vite)
npm run dev          # Incremental compile in watch mode (tsc --watch)
npm run clean        # Remove dist/

# Test
npm test             # Run all tests (vitest run)
npm run test:watch   # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
npm run test:dashboard   # Run dashboard tests (vitest.dashboard.config.ts)

# Lint / validation gates
npm run lint         # Type-check without emitting (tsc --noEmit)
npm run lint:adr     # Validate ADR governance (scripts/adr-validator.mjs)
npm run lint:link    # Validate doc links — no dead links (scripts/lint-links.mjs)
npm run lint:errors  # Error-handling lint (scripts/check-error-handling.mjs)

# Documentation automation (single source of truth — see "Documentation"
# language convention" below)
npm run docs:stats       # Regenerate README/IDENTITY stat blocks
npm run docs:stats:check # CI gate: fail if stat blocks are stale
npm run docs:ref         # Regenerate docs/reference/* (MCP/ADR/CLI/agents)
npm run docs:ref:check   # CI gate: fail if reference docs are stale
npm run docs:generate-cli  # Regenerate docs/reference/cli.md from Commander
npm run validate:publish   # Pre-publish validation aggregate
```

> `prepublishOnly` runs `docs:stats:check && docs:ref:check && build` — keep
> the generated docs in sync or `npm publish` will fail.

### Verifying your setup

```bash
npm run lint    # Should exit with no errors
npm test        # Should pass the full suite
npm run build   # Should produce dist/ with no errors
```

---

## Project Structure

```
deckent/
├── src/
│   ├── index.ts            --Top-level barrel: re-exports public API
│   ├── core/               --Types, constants, 3-layer config, utils,
│   │                         analyzer, memory store, plugin loader, i18n types
│   ├── providers/          --Provider adapters: claude, codex, gemini,
│   │                         subprocess, sandbox
│   ├── orchestra/          --Sprint orchestration
│   │   ├── brain.ts        --Slim re-export layer (delegates to
│   │   │                     sprint-controller / result-evaluator /
│   │   │                     model-selector / task-builder / debt-manager /
│   │   │                     sprint-reporter)
│   │   ├── sprint-controller.ts --Full sprint lifecycle (PLAN→…→CLEANUP)
│   │   ├── planner.ts      --AI task planning (Zod-validated, imports core/ only)
│   │   └── tmux.ts         --tmux session / window management
│   ├── agents/             --Agent worker lifecycle (worker.ts: claim, lock,
│   │                         heartbeat, result write)
│   ├── monitor/            --Auditor scan loop, dashboard state, sprint tracking
│   ├── connectors/         --External messaging adapters (Discord, Telegram,
│   │                         WhatsApp, incoming-router)
│   ├── nervous/            --Proactive meta-orchestrator (ADR-040): observer,
│   │                         detector, decision-engine, dispatcher, executor
│   ├── cli/                --Commander.js CLI
│   │   ├── index.ts        --CLI entry: registers all commands
│   │   ├── commands/       --One file per command (register<Name>(program))
│   │   └── helpers/        --Shared CLI helpers, incl. i18n.ts + messages.ts
│   ├── api/                --HTTP API server + SSE stream + dashboard watcher
│   ├── mcp/                --Model Context Protocol server (stdio transport)
│   │   ├── server.ts       --MCP server entry + registerTools/registerResources
│   │   ├── tools/          --One file per MCP tool (register<Name>Tool)
│   │   ├── resources/      --One file per MCP resource (register<Name>Resource)
│   │   └── helpers/        --enrich.ts (response enrichment)
│   ├── dashboard/          --Web Dashboard (React + Vite + Tailwind)
│   └── extensions/         --VS Code extension host integration
├── tests/                  --Test files; mirror src/ plus dedicated suites
│                             (e2e/, integration/, dashboard/, security/,
│                             docker/, load/, smoke/, …)
├── docs/                   --Reference, architecture, ADR, vision docs
│   ├── reference/          --Auto-generated reference (cli.md, mcp-tools.md,
│   │                         mcp-resources.md, agents.md, api-surface.md)
│   ├── adr/                --Architecture Decision Records + README.md index
│   └── vision/             --blueprint.md (full architecture reference), roadmap
├── package.json            --Dependencies, scripts, engine constraints
├── tsconfig.json           --TypeScript compiler config (strict, Node16, ESM)
├── vitest.config.ts        --Test runner config (coverage include/exclude)
└── DIRECTIVES.md           --Active sprint directives (read before contributing)
```

> Exact module/file counts intentionally omitted here — they drift fast. The
> live counts are auto-generated; see [the auto-generated reference docs](docs/index.md) and
> the README badges (kept in sync by `npm run docs:stats` / `docs:ref`).

### Module responsibilities

| Module | Responsibility |
|---|---|
| `src/core` | Types, constants, config loading/validation, shared utilities, project analyzer, memory store (SQLite), plugin loader |
| `src/providers` | Provider adapters (Claude, Codex, Gemini, subprocess, sandbox), fallback chain, model equivalence mapping, provider registry |
| `src/orchestra` | Sprint planning (AI + structured + auto fallback), agent spawning, result evaluation, debt decay, layered model selection |
| `src/agents` | Worker lifecycle: task claim, file lock, heartbeat, result write |
| `src/monitor` | Heartbeat scanning, scope boundary enforcement, in-process scan loop, dashboard state, alert dedup |
| `src/connectors` | External messaging adapters (Discord, Telegram, WhatsApp) + incoming router |
| `src/nervous` | Proactive meta-orchestrator (ADR-040): observe → detect → decide → propose → dispatch |
| `src/api` | HTTP API server + SSE stream + dashboard file watcher |
| `src/cli` | CLI commands, interactive prompts, display helpers, contextual hints, auto setup wizard — see [docs/reference/cli.md](docs/reference/cli.md) |
| `src/mcp` | MCP server (enriched responses) for IDE/host integration — see [docs/reference/mcp-tools.md](docs/reference/mcp-tools.md) and [mcp-resources.md](docs/reference/mcp-resources.md) |
| `src/dashboard` | Web Dashboard: React + Vite + Tailwind, shadcn/ui components |
| `src/extensions` | VS Code extension host integration |

> Tool / command / resource / page counts are deliberately not stated here —
> they are auto-generated. The single source of truth is
> [the auto-generated reference docs](docs/index.md) (`npm run docs:ref`) and the README
> badges (`npm run docs:stats`).

---

## Code Standards

### TypeScript

The project uses **strict TypeScript** with `module: "Node16"` and `moduleResolution: "Node16"`. See `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true
  }
}
```

Rules enforced:
- No `any` --use explicit types or `unknown` with narrowing
- No implicit returns --all code paths must return a value
- No unused locals or parameters --remove or prefix with `_`
- No unchecked indexed access --guard array/object access with bounds checks
- No fallthrough in switch --every case must `break` or `return`

### ESM modules

The project uses native ESM (`"type": "module"` in `package.json`). Always:

- Use `import`/`export`, never `require()`
- Include `.js` extension in all relative imports (even for `.ts` source files):

```typescript
// Correct
import { loadConfig } from './config.js';

// Wrong --will fail with Node16 module resolution
import { loadConfig } from './config';
```

- Use `node:` prefix for Node built-ins:

```typescript
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
```

### General conventions

- **Pure functions** where possible --avoid side effects, prefer returning values
- **Collect errors** rather than fail-fast in validators (better developer experience)
- **No shell injection** --use `spawnSync('cmd', [...args])` with array args, never string concatenation
- **Minimal dependencies** --check if a Node built-in suffices before adding a package
- Barrel `index.ts` files are re-export only --no logic in barrels

---

## Testing Guide

### Framework

Tests use **[vitest](https://vitest.dev/)** with v8 coverage provider.

```
tests/                 --All test files live here, mirroring src/
vitest.config.ts       --Config: include pattern, coverage exclude list
```

### Running tests

```bash
npm test                     # Run all tests once
npm run test:watch           # Watch mode (re-runs on change)
npm run test:coverage        # Run with coverage report
npx vitest run tests/core/   # Run a specific subdirectory
```

### Coverage goal

The project **aims for high coverage** (~95% target) on non-barrel source
files. Barrel `index.ts` files and the dashboard are excluded from coverage
(see the `exclude` list in `vitest.config.ts`).

> **Enforced gate (Sprint 189+, WrongStack WS-Z1):** `vitest.config.ts` now
> defines numeric `coverage.thresholds`, so `npm run test:coverage` (and the
> CI `coverage` job) will **exit non-zero** if any dimension drops below the
> current floor — the build turns red on regression.
>
> **Current floors** (calibrated -5% from the sprint-189 baseline 2026-05-22
> lines 87.96 / functions 94.61 / branches 85.19 / statements 87.96):
>
> | Dimension  | Floor | Baseline |
> |------------|-------|----------|
> | Lines      | 82%   | 87.96%   |
> | Functions  | 89%   | 94.61%   |
> | Branches   | 80%   | 85.19%   |
> | Statements | 82%   | 87.96%   |
>
> **Ratchet policy:** each sprint that improves coverage, raise the floor by
> ~1% (or to `currentBaseline - 3`, whichever is lower). The ratchet is
> manual today — bump the four numbers in `vitest.config.ts` during the
> sprint that earns the improvement and note the new floor in the
> `## [Unreleased]` block of `docs/CHANGELOG.md`. A `coverage:reportOnFailure`
> flag is enabled so the report is written even when tests fail; this keeps
> the gate evaluating on every CI run.

```bash
npm run test:coverage
# Inspect: Lines | Branches | Functions | Statements
# If any dimension < floor → exit 1 (build fails in CI).
```

New code should not meaningfully drop overall coverage. If a function is
difficult to test, explain why in a PR comment. If your change *raises*
coverage past the next ratchet step, bump the floors in the same PR.

### Writing tests

Follow the existing test structure:

```typescript
// tests/core/config.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/core/config.js';

describe('loadConfig', () => {
  it('returns default config when no files exist', async () => {
    const config = await loadConfig('/nonexistent/path');
    expect(config.mode).toBe('haiku_default');
  });
});
```

### Mocking Node built-ins

Use `vi.mock` at the module level. Always use `vi.clearAllMocks()` in `beforeEach` to prevent test pollution:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock at module scope, before imports
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Import AFTER vi.mock declarations
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();  // REQUIRED --call history bleeds between tests
});
```

### Mocking child processes

```typescript
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
}));

import { spawnSync } from 'node:child_process';
const mockedSpawnSync = vi.mocked(spawnSync);
```

### Test organisation

- One `describe` block per exported function
- Name `it` descriptions as behaviour: `'returns X when Y'`, `'throws when Z'`
- Test happy path, error path, and edge cases separately
- Do not assert on implementation details --test the public contract

---

## How to Add a CLI Command

Deckent uses Commander.js for CLI commands. Each command lives in its own file under `src/cli/commands/`.

### 1. Create the command file

```typescript
// src/cli/commands/my-command.ts
import { Command } from 'commander';

export function registerMyCommand(program: Command): void {
  program
    .command('my-command')
    .description('Brief description of what this command does')
    .option('--flag', 'Description of the flag')
    .action(async (opts) => {
      // Command implementation
      console.log('Running my-command');
    });
}
```

### 2. Register in the CLI entry point

```typescript
// src/cli/index.ts
import { registerMyCommand } from './commands/my-command.js';

// Inside the setup function:
registerMyCommand(program);
```

### 3. Write tests

```typescript
// tests/cli/commands/my-command.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('my-command', () => {
  it('executes successfully', async () => {
    // Test the command handler function directly
  });
});
```

### 4. Regenerate documentation

The CLI reference is **auto-generated** from Commander metadata — do not
hand-edit command tables. Regenerate and commit the result:

```bash
npm run docs:generate-cli   # rewrites docs/reference/cli.md
npm run docs:stats          # refreshes README/IDENTITY counts
```

Add usage examples to the relevant guide if the command introduces a new
workflow.

---

## Branch Strategy

```
main              --stable, releasable code; protected
feature/<name>    --new features
fix/<name>        --bug fixes
docs/<name>       --documentation-only changes
refactor/<name>   --internal refactors with no behaviour change
test/<name>       --test-only additions
```

- Always branch from `main`
- Never push directly to `main`
- Keep branches short-lived (complete within a sprint wave)
- Delete the branch after the PR is merged

> **Note for external contributors:** the above is the required workflow for
> all community PRs. The core maintainer team develops Deckent *with* Deckent
> (dogfooding) and commits sprint work directly to `main` with prefixed
> messages — that internal flow is an exception to "never push to `main`" and
> does not apply to outside contributions.

---

## Commit Messages

Format: `type(scope): description [task-XXX]`

### Types

| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `refactor` | Code change with no behaviour change |
| `chore` | Build, deps, tooling |
| `ci` | CI/CD pipeline changes |

### Scopes

Use a module name (`core`, `orchestra`, `agents`, `monitor`, `cli`, `mcp`, …)
**or** an area/sprint scope when the change spans modules (e.g.
`repo-cleanup`, `sprint-172`). Omit the scope for small cross-cutting
changes. Maintainer sprint commits commonly use `sprint-NNN` as the scope.

### Examples

```
feat(core): add 3-layer config loader [task-001]
fix(config): handle malformed JSON gracefully [task-012]
test(core): add config validation edge cases
docs: add ARCHITECTURE.md and ROADMAP.md
refactor(types): split enums into separate file [task-008]
chore: upgrade vitest to v3
```

- Aim to keep the description concise (~72 characters); not strictly enforced
- Use imperative mood: "add", "fix", "remove" --not "added", "fixes"
- Optionally append `[task-XXX]` when the commit maps to a tracked sprint
  task (used by maintainers; not required for community PRs)

---

## Pull Request Process

1. **Create a branch** from `main` with the appropriate prefix
2. **Make your changes** --keep PRs focused on a single concern
3. **Write tests** for all new code; do not reduce coverage
4. **Run the full check suite** before opening the PR:

   ```bash
   npm run lint            # tsc --noEmit must be clean (zero errors)
   npm test                # All tests must pass
   npm run test:coverage   # Inspect coverage (target ~95%, not auto-gated)
   npm run lint:link       # No dead doc links
   npm run docs:stats:check && npm run docs:ref:check  # Generated docs in sync
   npm run build           # dist/ must compile cleanly
   ```

   > `docs:stats:check` / `docs:ref:check` mirror the `prepublishOnly` gate —
   > if you changed CLI commands, MCP tools/resources, ADRs, or stat-bearing
   > docs, run `npm run docs:stats && npm run docs:ref` and commit the result.

5. **Open the PR** with:
   - A clear title matching the commit format
   - A description of what changed and why
   - References to related sprint tasks or issues
6. **Respond to review comments** --address or discuss every comment
7. **Squash and merge** once approved

### PR checklist

- [ ] `npm run lint` exits with no errors
- [ ] `npm test` passes (all existing tests green)
- [ ] Coverage reviewed via `npm run test:coverage` (no meaningful drop)
- [ ] `npm run lint:link` passes (no dead doc links)
- [ ] `npm run docs:stats:check && npm run docs:ref:check` pass (or regenerated)
- [ ] `npm run build` succeeds
- [ ] New public functions are documented with JSDoc
- [ ] `DIRECTIVES.md` is updated if scope or approach changed

---

## Sprint Contribution

Deckent is developed in sprints. Each sprint has an active `DIRECTIVES.md` that defines the goals, tasks, and quality rules for that sprint. **Read `DIRECTIVES.md` before starting work.**

### DIRECTIVES.md format

```markdown
# DIRECTIVES --Sprint N (Sprint Name)

## Goal: <Sprint Goal>
One-paragraph description of the sprint's objective.

## Task 1: <Task Name>
- Bullet list of requirements for this task
- Each bullet is a specific deliverable

## Task 2: <Task Name>
- ...

## Quality Rules
- Quality rules that apply to ALL tasks in this sprint
- e.g., "existing tests must not regress", "tsc --noEmit clean"
```

### Wave plan

Large sprints are broken into **waves** --logical groups of tasks that can be parallelised. A wave completes when all its tasks have a `.result` file in `.tasks/`.

```
Wave 1: Foundation tasks (types, config, constants)
Wave 2: Core logic (brain, worker, auditor)
Wave 3: Interfaces (CLI, MCP)
Wave 4: Documentation and cleanup
```

### Task result files

Every task produces a result file at `.tasks/task-XXX-YYY.result`:

```json
{
  "taskId": "001-001",
  "filesChanged": ["src/core/types.ts", "src/core/config.ts"],
  "linesAdded": 120,
  "linesRemoved": 0,
  "testsPassed": true,
  "coverage": 97.5,
  "selfAssessment": "DONE",
  "notes": "Implemented 3-layer config loader with validation"
}
```

`selfAssessment` values:
- `"DONE"` --task complete, all quality rules met
- `"GO_WITH_TECH_DEBT"` --task complete, known debt logged
- `"NO_GO"` --task blocked or failing; explain in `notes`

---

## Plugin System Development

Plugins extend Deckent with reusable, skill-style capabilities. Each plugin
is a directory under `.deckent/plugins/` described by a **`manifest.json`**
(not `plugin.json`). The plugin loader lives in
[`src/core/plugin.ts`](src/core/plugin.ts) — read it as the source of truth.

### Plugin structure

Each plugin is stored in `.deckent/plugins/{pluginName}/`:

```
.deckent/plugins/my-plugin/
├── manifest.json   --Plugin metadata (validated by src/core/plugin.ts)
├── SKILL.md        --Default entrypoint: skill instructions / prompt
└── README.md       --Plugin documentation
```

Scaffold this layout with the CLI instead of creating it by hand:

```bash
deckent plugin create my-plugin   # writes manifest.json + SKILL.md + README.md
```

### Plugin manifest (manifest.json)

The manifest shape is the `PluginManifest` interface in `src/core/plugin.ts`:

```jsonc
{
  "name": "code-reviewer",                 // required
  "version": "0.1.0",                      // required
  "description": "Code review and quality checks", // required
  "entrypoint": "SKILL.md",                // required
  "enabled": true,                         // optional (default: true)
  "triggers": ["code review", "review pr"],// optional: activation phrases
  "permissions": ["src/**", "tests/**"],   // optional: glob scope strings
  "model": "opus",                         // optional: ModelType
  "hooks": {                               // optional lifecycle hook scripts
    "beforeSprint": null,
    "afterSprint": null
  },
  "dependencies": []                       // optional: other plugin names
}
```

Notes (verified against `validateManifest()` in `src/core/plugin.ts`):

- **Required**: `name`, `version`, `description`, `entrypoint` (non-empty strings).
- `permissions` is a flat array of **glob strings** (e.g. `"src/**"`), not an
  object of directories/filesRead/filesWrite.
- `hooks` keys are **`beforeSprint` / `afterSprint` / `beforeTask` /
  `afterTask`** (string script paths), *not* `onTaskStart` / `onTaskComplete`.
- `model` must be a valid `ModelType`; `signature` (optional) must be
  `{ "algorithm": "sha256", "value": "<hash>" }`.
- `enabled: false` excludes the plugin from `listPlugins()` / `scanPlugins()`.

### Plugin lifecycle API

`src/core/plugin.ts` exposes the loader/management functions:

| Function | Purpose |
|---|---|
| `scanPlugins(projectRoot)` | List enabled plugins in `{root}/.deckent/plugins/` |
| `loadPlugin(dir)` / `listPlugins(dir)` | Load one / all valid plugins |
| `installPlugin(source, dir)` | Install from npm name, git URL, or local path (auto-enables; `--ignore-scripts` for npm safety) |
| `enablePlugin` / `disablePlugin` | Flip `enabled` in `manifest.json` |
| `createPlugin(name, dir)` | Scaffold a new plugin |
| `removePlugin(name, dir)` | Remove (refuses `system: true` plugins) |

### Plugin development checklist

- [ ] `manifest.json` has all required fields (`name`, `version`,
      `description`, `entrypoint`) as non-empty strings
- [ ] `permissions` are glob strings and minimal (only what the plugin needs)
- [ ] `triggers` are specific activation phrases (avoid over-broad terms)
- [ ] `entrypoint` file (usually `SKILL.md`) exists and is documented
- [ ] `README.md` documents purpose, installation, and usage
- [ ] Version follows [Semantic Versioning](https://semver.org/)
- [ ] Manifest validates: `deckent plugin list` loads it without error

### Plugin registration

Plugins are discovered from `.deckent/plugins/` via `scanPlugins()`:

1. `deckent plugin create <name>` (or `deckent plugin install <source>`)
2. Fill in `manifest.json` and the `SKILL.md` entrypoint
3. `deckent plugin list` to verify the manifest validates and is enabled
4. The plugin is picked up on the next run (enabled plugins only)

---

## Internationalization (i18n) Contributing

Deckent ships a small, dependency-free runtime i18n system for CLI output.
Currently supported: **English (en)**, **Turkish (tr)**.

The system lives in **`src/cli/helpers/`** (not `src/i18n/`, and there is no
`src/core/i18n.ts`):

- [`src/cli/helpers/messages.ts`](src/cli/helpers/messages.ts) — a single flat
  `MESSAGES: Record<MessageKey, Record<lang, string>>` map plus `getMessage()`
  and `getLanguage()`.
- [`src/cli/helpers/i18n.ts`](src/cli/helpers/i18n.ts) — language detection
  (`detectLang`), the `MessageKey` union type, `getMessages(lang)` binder, and
  `SUPPORTED_LANGS` / `isSupportedLang`.

Design constraints: **ADR-010** (no external i18n libraries — plain
TypeScript) and **ADR-008** (i18n lives in `cli/helpers/`, not `core/`, since
it reads CLI config). Language priority: `.deckent/config.json` `language` →
`LC_ALL` → `LANG` → `en`.

### Adding a new language

There are no per-language directories. A language is just an extra key in
every entry of the `MESSAGES` map.

1. **Add the language code** to `SUPPORTED_LANGS` in
   `src/cli/helpers/i18n.ts` (use an [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)
   code, e.g. `de`):

   ```typescript
   export const SUPPORTED_LANGS = ['en', 'tr', 'de'] as const;
   ```

2. **Translate every entry** in `MESSAGES` (in
   `src/cli/helpers/messages.ts`) — add the new code alongside `en` / `tr`.
   Keep `{placeholder}` tokens unchanged; they are substituted at runtime by
   `getMessage(key, lang, vars)`:

   ```typescript
   'status.tasks_running': {
     en: '{taskCount} tasks running',
     tr: '{taskCount} görev çalışıyor',
     de: '{taskCount} Aufgaben laufen',   // ← new
   },
   ```

   Every `MessageKey` in the `MessageKey` union (in `i18n.ts`) must have a
   value for the new language — missing keys are a parity failure.

3. **Add a parity test** under `tests/i18n/` asserting the new language
   covers all keys present for `en`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { getMessage } from '../../src/cli/helpers/i18n.js';

   it('de has every key en has', () => {
     // iterate the MessageKey union / MESSAGES keys and assert
     // getMessage(key, 'de') !== getMessage(key, 'en') fallback-only
   });
   ```

4. Run `npm test` and `npm run lint` (the `MessageKey` union keeps this
   type-safe — a missing key surfaces at compile time).

### i18n conventions

- **Key naming**: dotted, namespaced keys (e.g. `status.tasks_running`,
  `error.node_version_low`) — match the existing `MessageKey` union.
- **Placeholders**: use `{name}` tokens; never translate the token itself.
  Substitution is handled by `getMessage(key, lang, vars)`.
- **Consistent terminology**: keep domain terms (Sprint, Worker, Brain)
  consistent across all languages.
- **Do not translate**: variable names, file paths, code snippets, command
  names, `{placeholders}`.
- A missing translation falls back to `en` — never throws.

### Available languages

| Code | Language | Status |
|---|---|---|
| `en` | English | Complete (fallback language) |
| `tr` | Turkish | Complete |

Additional languages are welcome — follow "Adding a new language" above.

### Documentation language convention

All documentation follows a bilingual EN/TR pattern:

- **Primary language**: English (EN)
- **Base filename** = EN version (e.g., `VISION.md`, `BETA-TRACKER.md`)
- **Turkish variant** = `-TR` suffix (e.g., `VISION-TR.md`, `BETA-TRACKER-TR.md`)
- **Exception**: `README.md` (EN) / `README-TR.md` (TR) -- follows GitHub convention

When adding or updating documentation:
- Always update the EN (base) file first
- Keep the TR variant in sync -- same structure, same section headings (translated)
- Auto-generated sections are delimited by `<!-- AUTOGEN:START id="..." -->`
  … `<!-- AUTOGEN:END id="..." -->` markers and are managed by the
  documentation scripts (`npm run docs:stats` / `docs:ref`, configured via
  `.deckent/docs.json`). **Never hand-edit content between these markers** —
  run the generator and commit its output instead.

---

## MCP Tool and Resource Development

Deckent exposes its API to IDE hosts (Claude, Cursor, etc.) through the Model Context Protocol (MCP). Tools and resources are the primary extension points for IDE integration.

### MCP architecture

```
src/mcp/
├── server.ts          --MCP server entry (McpServer + stdio transport);
│                         calls registerTools() / registerResources()
├── tools/             --One file per tool, exports register<Name>Tool(server)
│   ├── index.ts       --registerTools(server): wires every tool
│   └── *.ts           --e.g. analyze.ts, plan.ts, start.ts, status.ts, …
├── resources/         --One file per resource, exports register<Name>Resource(server)
│   ├── index.ts       --registerResources(server): wires every resource
│   └── *.ts           --e.g. directives.ts, tasks.ts, agents.ts, …
└── helpers/
    └── enrich.ts      --Response enrichment utilities
```

> The exact tool/resource list and counts are **auto-generated** — see
> [docs/reference/mcp-tools.md](docs/reference/mcp-tools.md) and
> [docs/reference/mcp-resources.md](docs/reference/mcp-resources.md)
> (`npm run docs:ref`). Do not maintain a hand-written list here.

### Adding a new MCP tool

Deckent uses the official **`@modelcontextprotocol/sdk`** (`McpServer`), not
the Anthropic SDK. Each tool file exports a `register<Name>Tool(server)`
function that calls `server.registerTool(...)`. Use an existing tool such as
[`src/mcp/tools/analyze.ts`](src/mcp/tools/analyze.ts) as the template.

1. **Create tool file** in `src/mcp/tools/{tool-name}.ts`:

   ```typescript
   import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
   import { enrichResponse } from '../helpers/enrich.js';

   export function registerMyTool(server: McpServer): void {
     server.registerTool(
       'deckent_my_tool',
       {
         title: 'My Tool',
         description: 'What this tool does (clear, model-facing description).',
         // inputSchema?: { type: 'object', properties: {...}, required: [...] }
         annotations: {
           readOnlyHint: true,
           destructiveHint: false,
           idempotentHint: true,
         },
       },
       async (/* params */) => {
         try {
           const result = { /* tool output */ };
           // enrichResponse(toolName, response, context?) — name FIRST
           const enriched = enrichResponse('my_tool', result);
           return {
             content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
           };
         } catch (err) {
           const message = err instanceof Error ? err.message : String(err);
           return {
             content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
             isError: true,
           };
         }
       },
     );
   }
   ```

2. **Wire it** in `src/mcp/tools/index.ts` — import `registerMyTool` and call
   it inside `registerTools(server)` (the server itself just calls
   `registerTools()` / `registerResources()`; there is no manual
   `setRequestHandler` list to maintain).

3. **Write tests** in `tests/mcp/tools/my-tool.test.ts` — register the tool
   against a test `McpServer` (or assert on the handler's enriched output);
   check `result._enriched` has `summary`, `hints`, `timestamp`.

### Adding a new MCP resource

Resources follow the same `register<Name>Resource(server)` convention. Use
[`src/mcp/resources/directives.ts`](src/mcp/resources/directives.ts) as the
template.

1. **Create resource file** in `src/mcp/resources/{resource-name}.ts`:

   ```typescript
   import { readFileSync, existsSync } from 'node:fs';
   import { join } from 'node:path';
   import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

   export function registerMyResource(server: McpServer): void {
     server.registerResource(
       'my-resource',
       'deckent://my-resource',
       {
         title: 'My Resource',
         description: 'What this resource exposes',
         mimeType: 'text/markdown',
       },
       async (uri) => {
         const filePath = join(process.cwd(), '.brain', 'my-resource.md');
         const text = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
         return {
           contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }],
         };
       },
     );
   }
   ```

2. **Wire it** in `src/mcp/resources/index.ts` — import `registerMyResource`
   and call it inside `registerResources(server)`.

3. **Write tests** in `tests/mcp/resources/my-resource.test.ts`

### Response enrichment

Tool responses are enriched with metadata via `enrichResponse()` from
[`src/mcp/helpers/enrich.ts`](src/mcp/helpers/enrich.ts). **The tool name is
the first argument**, the response object is second:

```typescript
import { enrichResponse } from '../helpers/enrich.js';

const response = { data: 'tool result' };
const enriched = enrichResponse('my_tool', response, { lang: 'en' });
// → { ...response, _enriched: { summary, hints, timestamp } }
```

The injected `_enriched` field (`EnrichedMeta`) contains exactly:
- `summary`: localized one-line summary (en/tr; falls back to a generic line)
- `hints`: array of suggested next-step hints (may be empty)
- `timestamp`: ISO 8601 timestamp

Language comes from the optional `context.lang` (default `'en'`). There is no
`toolName`, `version`, or `locale` field on `_enriched`.

### Tool/resource checklist

- [ ] Exports a `register<Name>Tool(server)` / `register<Name>Resource(server)`
- [ ] Wired into `src/mcp/tools/index.ts` (or `resources/index.ts`)
- [ ] Has tests under `tests/mcp/`
- [ ] Errors return `{ isError: true }` with a clean message (no stack traces)
- [ ] Destructive/long-running tools set correct `annotations` and/or a
      `--dry-run`/preview path
- [ ] Description is clear and model-facing; input schema complete
- [ ] Tool responses are enriched with `enrichResponse('name', result)`
- [ ] `npm run docs:ref` regenerated and committed (the reference docs in
      [the auto-generated reference docs](docs/index.md) are auto-generated — do not hand-edit)

---

## Questions?

- Open an issue on [GitHub](https://github.com/VerhexIO/deckent/issues)
- Read the [Architecture docs](docs/architecture/architecture.md) for system design details
- Check [docs/reference/api.md](docs/reference/api.md) for the full API reference
- Visit [deckent.agency](https://deckent.agency) for more information
