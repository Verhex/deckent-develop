# Contributing to deckent

Thanks for your interest in deckent — the open-source AI agent orchestration CLI. This guide is everything you need to go from a fresh clone to a merged pull request.

deckent is, unusually, **built with deckent** — the maintainers run sprints on the project itself (dogfooding). That means the codebase is held to the same quality gates it enforces on your projects: strict TypeScript, scope discipline, ADR governance, and a green CI. This guide reflects that.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Code Standards](#code-standards)
5. [Testing Guide](#testing-guide)
6. [How to Add a CLI Command](#how-to-add-a-cli-command)
7. [MCP Tool and Resource Development](#mcp-tool-and-resource-development)
8. [Plugin System Development](#plugin-system-development)
9. [Adding a Language (i18n)](#adding-a-language-i18n)
10. [Branches, Commits, and PRs](#branches-commits-and-prs)
11. [Pull Request Process](#pull-request-process)
12. [How deckent Builds deckent](#how-deckent-builds-deckent)

---

## Getting Started

```bash
git clone https://github.com/VerhexIO/deckent.git
cd deckent
npm install

npm run lint     # tsc --noEmit — must be clean
npm test         # the full vitest suite — must pass
npm run build    # compile to dist/ — must succeed
```

If those three pass, your environment is ready. Look for issues labeled `good first issue` or `help wanted` to get started.

---

## Development Setup

### Prerequisites

- **Node.js >= 24** — enforced via `package.json` `engines`. deckent uses modern ESM, `node:` built-ins, and the native test runner; older Node will fail.
- **npm** (bundled with Node 24+)
- **git**

```bash
node --version   # must be >= 24
npm --version
git --version
```

### Key commands

```bash
# Build
npm run build         # TypeScript → dist/ (tsc + copy-assets)
npm run build:all     # full build incl. the web dashboard (Vite)
npm run dev           # incremental compile in watch mode
npm run clean         # remove dist/

# Test
npm test              # full suite (vitest run)
npm run test:watch    # watch mode
npm run test:coverage # coverage report (gated — see Testing)
npm run test:ci-sim   # CI hermeticity reproducer (hides local state)
npm run test:dashboard  # dashboard tests (separate vitest config)

# Lint / validation gates
npm run lint          # type-check, no emit (tsc --noEmit)
npm run lint:adr      # validate ADR governance
npm run lint:link     # no dead doc links
npm run lint:errors   # error-handling lint

# Documentation automation (single source of truth)
npm run docs:stats        # regenerate README/IDENTITY stat blocks
npm run docs:stats:check  # CI gate: fail if stat blocks are stale
npm run docs:ref          # regenerate docs/reference/* (CLI/MCP/ADR/agents)
npm run docs:ref:check    # CI gate: fail if reference docs are stale
npm run validate:publish  # aggregate pre-publish validation
```

> `prepublishOnly` runs `docs:stats:check && docs:ref:check && build` — keep the generated docs in sync, or `npm publish` will fail.

---

## Project Structure

```
deckent/
├── src/core/         — types, constants, layered config, memory store (SQLite),
│                       model registry, routing engine, plugin loader
├── src/orchestra/    — the sprint engine: sprint-controller (PLAN→…→CLEANUP),
│                       planner, task-builder, result-evaluator, task-router,
│                       debt-manager, dependency waves, nervous/autonomous wiring
├── src/agents/       — worker lifecycle: claim, file lock, heartbeat, result write
├── src/monitor/      — Auditor scan loop, dashboard state, sprint tracking
├── src/nervous/      — proactive meta-orchestrator (ADR-040): observe → detect →
│                       decide → propose → dispatch
├── src/providers/    — provider adapters (Claude, Codex, Gemini) + fallback chain
├── src/connectors/   — Discord / Telegram / WhatsApp + incoming router
├── src/api/          — HTTP API server, SSE stream, dashboard watcher, auth
├── src/mcp/          — MCP server (stdio): tools/, resources/, helpers/enrich.ts
├── src/mcp-client/   — outgoing MCP client (broker, registry) for external servers
├── src/cli/          — Commander.js CLI: entry.ts, commands/, repl/, helpers/ (i18n)
├── src/agent/        — native-terminal-agent core (experimental): loop, session,
│                       permission engine, provider adapters, tool registry
├── src/training/     — training-data tooling (trace extraction → JSONL)
├── src/dashboard/    — web dashboard (React + Vite + Tailwind)
├── src/extensions/   — VS Code extension host integration
├── tests/            — mirrors src/, plus e2e/, integration/, dashboard/, security/,
│                       docker/, agent/, training/, …
├── docs/             — reference (auto-generated), architecture, ADRs, guides
├── scripts/          — build, docs, and verify:* (PTY proof-of-function) scripts
└── DIRECTIVES.md     — the active sprint's goals (read before contributing)
```

> Exact module/file/tool counts drift fast and are **auto-generated** — see the
> README badges (`npm run docs:stats`) and `docs/reference/*` (`npm run docs:ref`).
> Do not hand-maintain count tables.

---

## Code Standards

### TypeScript

Strict TypeScript with `module: "Node16"` / `moduleResolution: "Node16"`:

- No `any` — use explicit types or `unknown` with narrowing
- No unused locals or parameters (prefix intentional ones with `_`)
- No unchecked indexed access — guard array/object access
- Every `switch` case must `break` or `return`

### ESM

Native ESM (`"type": "module"`). Always:

```typescript
// Relative imports carry the .js extension — even for .ts source (Node16 resolution):
import { loadConfig } from './config.js';   // correct
import { loadConfig } from './config';       // WRONG — fails at runtime

// Node built-ins use the node: prefix:
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
```

### Conventions

- **Pure functions** where possible — prefer returning values to side effects.
- **Collect errors** in validators rather than fail-fast (better DX). Throw a typed `DeckentError` from `src/core/` code paths.
- **No shell injection** — use `spawn`/`spawnSync` with array args, never string concatenation.
- **Minimal dependencies** — check for a Node built-in before adding a package (ADR-010: deckent ships with a single runtime dependency, `commander`).
- **i18n-first** — no user-facing string is hardcoded; route it through `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en + tr).
- **Barrel `index.ts` files are re-export only** — no logic in barrels.

---

## Testing Guide

Tests use **[vitest](https://vitest.dev/)**. Test files live in `tests/`, mirroring `src/`.

```bash
npm test                      # run once
npm run test:watch            # watch mode
npm run test:coverage         # coverage (gated)
npx vitest run tests/core/    # a single subdirectory
```

### Hermeticity is mandatory (ADR-087)

CI runs on a clean machine with no `.deckent/config.json`, no `.brain/memory.db`, and no `~/.deckent`. A test that reads local state passes on your laptop and fails in CI. Every test MUST be hermetic:

- **Use a tmpdir** for all file I/O (`os.tmpdir()` / `mkdtempSync`); clean up in `afterEach`. Never write to the repo root or `$HOME`.
- **Never read gitignored local state** (`.deckent/config.json`, `.brain/memory.db`, `~/.deckent`).
- **No `spawnSync` for subprocesses** — use async `spawn` so the event loop doesn't freeze.
- **No network** — inject `fetch`/adapters and return canned data.

Reproduce the CI environment locally before pushing:

```bash
npm run test:ci-sim   # hides gitignored state, then runs the suite
```

### Coverage

The project aims high (~88%+ lines) and the coverage job fails if a dimension drops below its floor. New code should not meaningfully drop coverage; if a function is hard to test, explain why in the PR.

### Writing tests

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/core/config.js';

describe('loadConfig', () => {
  it('returns a usable config when no files exist', async () => {
    const config = await loadConfig('/nonexistent/path');
    expect(config.deckent_style).toBe('sprint');
    expect(['performance', 'balanced', 'economic', 'api']).toContain(config.mode);
  });
});
```

- One `describe` per exported function.
- Name `it` blocks as behaviour: `'returns X when Y'`, `'throws when Z'`.
- Test happy path, error path, and edge cases separately.
- Assert the public contract, not implementation details.
- For user-surface changes (CLI/dashboard/API), a mock-only test is not enough — add a real-binary proof (`scripts/verify:*`, ADR-079).

---

## How to Add a CLI Command

deckent uses Commander.js. Each command is its own file under `src/cli/commands/` and exports a `register<Name>(program)` function.

```typescript
// src/cli/commands/my-command.ts
import type { Command } from 'commander';

export function registerMyCommand(program: Command): void {
  program
    .command('my-command')
    .description('Brief, clear description.')
    .option('--flag', 'What the flag does')
    .action(async (opts) => {
      // implementation
    });
}
```

Wire it in the CLI entry, write a test in `tests/cli/`, then regenerate the auto-generated CLI reference:

```bash
npm run docs:generate-cli   # rewrites docs/reference/cli.md
npm run docs:stats          # refreshes README counts
```

---

## MCP Tool and Resource Development

deckent's MCP server uses the official `@modelcontextprotocol/sdk`. Each tool/resource is a file under `src/mcp/tools/` or `src/mcp/resources/` exporting `register<Name>Tool(server)` / `register<Name>Resource(server)`.

### Adding a new MCP tool

A tool is an invokable, parameterized action. Create a file under `src/mcp/tools/`,
export a `register<Name>Tool(server)` function, and mark its `annotations`
(`readOnlyHint` / `destructiveHint` / `idempotentHint`) accurately:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { enrichResponse } from '../helpers/enrich.js';

export function registerMyTool(server: McpServer): void {
  server.registerTool(
    'deckent_my_tool',
    {
      title: 'My Tool',
      description: 'Clear, model-facing description.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (/* params */) => {
      try {
        const enriched = enrichResponse('my_tool', { /* result */ });
        return { content: [{ type: 'text' as const, text: JSON.stringify(enriched) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }], isError: true };
      }
    },
  );
}
```

Wire it into `src/mcp/tools/index.ts` (or `resources/index.ts`), add tests under `tests/mcp/`, then run `npm run docs:ref` to regenerate the tool/resource reference. Mark destructive/long-running tools with correct `annotations`.

### Adding a new MCP resource

A resource is read-only context exposed via a `deckent://` URI (e.g. `deckent://dashboard`).
Create a file under `src/mcp/resources/`, export `register<Name>Resource(server)`, wire it
into `src/mcp/resources/index.ts`, and add tests under `tests/mcp/`. Resources never mutate
state — they only return a serialized snapshot of project data.

---

## Plugin System Development

Plugins add reusable, skill-style capabilities. Each is a directory under `.deckent/plugins/` described by a `manifest.json` (validated against the `PluginManifest` interface in `src/core/plugin.ts`).

```bash
deckent plugin create my-plugin   # scaffolds manifest.json + SKILL.md + README.md
```

```jsonc
{
  "name": "code-reviewer",                 // required
  "version": "0.1.0",                      // required (semver)
  "description": "Code review and checks", // required
  "entrypoint": "SKILL.md",                // required
  "enabled": true,                         // optional
  "triggers": ["code review", "review pr"],// optional: activation phrases
  "permissions": ["src/**", "tests/**"],   // optional: flat glob strings
  "model": "opus",                         // optional: ModelType
  "hooks": { "beforeSprint": null, "afterSprint": null }  // optional: script paths
}
```

`permissions` is a flat array of glob strings; `hooks` keys are `beforeSprint`/`afterSprint`/`beforeTask`/`afterTask`. Verify with `deckent plugin list`.

---

## Adding a Language (i18n)

deckent ships a dependency-free runtime i18n system (`src/cli/helpers/`). Languages are keys in one flat `MESSAGES` map — there are no per-language directories.

1. Add the ISO 639-1 code to `SUPPORTED_LANGS` in `src/cli/helpers/i18n.ts`.
2. Add a value for that code to **every** entry of `MESSAGES` in `src/cli/helpers/messages.ts` (keep `{placeholder}` tokens unchanged):

   ```typescript
   'status.tasks_running': {
     en: '{taskCount} tasks running',
     tr: '{taskCount} görev çalışıyor',
     de: '{taskCount} Aufgaben laufen',   // ← new
   },
   ```

3. Add a parity test under `tests/i18n/` asserting the new language covers every key.
4. `npm run lint && npm test` — the typed `MessageKey` union surfaces a missing key at compile time.

A missing translation falls back to `en` and never throws. Language priority: config `language` → `LC_ALL` → `LANG` → `en`.

### Documentation language convention

Docs are bilingual EN/TR: the base filename is EN (e.g. `README.md`), the Turkish variant gets a `-TR` suffix (`README-TR.md`). Update the EN file first, keep the TR variant in sync. Never hand-edit content between `<!-- AUTOGEN:START -->` / `<!-- AUTOGEN:END -->` markers — run the generator instead.

---

## Branches, Commits, and PRs

### Branches

```
main              — stable, releasable; protected
feature/<name>    — new features
fix/<name>        — bug fixes
docs/<name>       — docs only
refactor/<name>   — internal refactor, no behaviour change
test/<name>       — test-only additions
```

Branch from `main`; never push directly to `main`; keep branches short-lived; delete after merge.

> The maintainer team dogfoods deckent and commits sprint work directly to `main` with prefixed messages — that internal exception does not apply to outside contributions.

### Commits

Format: `type(scope): description`

| Type | When |
|------|------|
| `feat` | new feature |
| `fix` | bug fix |
| `docs` | docs only |
| `test` | tests |
| `refactor` | no behaviour change |
| `chore` | build, deps, tooling |
| `ci` | pipeline |

Use a module name (`core`, `orchestra`, `cli`, `mcp`, …) or an area scope (`repo-cleanup`, `sprint-NNN`) as the scope. Imperative mood ("add", "fix"), ~72 chars.

## Pull Request Process

1. Branch from `main`; keep the PR focused on one concern.
2. Write tests for new code; keep them hermetic.
3. Run the full gate before opening:

   ```bash
   npm run lint                                       # zero errors
   npm test                                           # all green
   npm run test:ci-sim                                # hermetic reproducer
   npm run lint:link                                  # no dead doc links
   npm run docs:stats:check && npm run docs:ref:check # generated docs in sync
   npm run build                                      # dist/ compiles
   ```

4. Open the PR with a clear title (commit format) and a description of what changed and why.
5. Address every review comment; squash and merge once approved.

**PR checklist**

- [ ] `npm run lint` clean
- [ ] `npm test` green
- [ ] `npm run test:ci-sim` green (hermetic)
- [ ] `npm run lint:link` passes
- [ ] generated docs in sync (`docs:stats:check && docs:ref:check`)
- [ ] `npm run build` succeeds
- [ ] new public functions have JSDoc; user-surface changes have a real-binary proof

---

## How deckent Builds deckent

deckent is developed in sprints, each driven by a `DIRECTIVES.md` that defines goals, tasks, and quality rules. **Read it before starting work.**

Large sprints split into **waves** — dependency-ordered groups that run in parallel. A wave completes when all its tasks have a `.result` file in `.tasks/`. Each task writes a result with `selfAssessment` ∈ `DONE` / `GO_WITH_TECH_DEBT` / `NO_GO`. This is the same lifecycle deckent runs on your projects — contributing is the best way to understand the product.

---

## Questions?

- Open an issue on [GitHub](https://github.com/VerhexIO/deckent/issues)
- Read the [Architecture docs](docs/en/architecture.md)
- Visit [deckent.ai](https://deckent.ai)
