# Contributing to Deckent

Thank you for your interest in contributing to Deckent — the AI agent orchestration system. This guide covers everything you need to get started.

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Project Structure](#project-structure)
3. [Code Standards](#code-standards)
4. [Testing Guide](#testing-guide)
5. [Branch Strategy](#branch-strategy)
6. [Commit Messages](#commit-messages)
7. [Pull Request Process](#pull-request-process)
8. [Sprint Contribution](#sprint-contribution)

---

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0 (required for `node:readline/promises`, `structuredClone`, native ESM)
- **npm** >= 9.0.0
- **git**

```bash
node --version  # must be >= 18.0.0
npm --version
git --version
```

### Installation

```bash
# Clone the repository
git clone https://github.com/verhex/deckent.git
cd deckent

# Install dependencies
npm install
```

### Key commands

```bash
npm run build        # Compile TypeScript → dist/ (tsc)
npm test             # Run all tests (vitest run)
npm run test:watch   # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
npm run lint         # Type-check without emitting (tsc --noEmit)
npm run clean        # Remove dist/
```

### Verifying your setup

```bash
npm run lint    # Should exit with no errors
npm test        # Should pass all tests (938+)
npm run build   # Should produce dist/ with no errors
```

---

## Project Structure

```
deckent/
├── src/
│   ├── index.ts            — Top-level barrel: re-exports all public API
│   ├── core/               — Foundational types, constants, config, utils
│   │   ├── types.ts        — All shared TypeScript interfaces and enums
│   │   ├── constants.ts    — App-wide constants (DEFAULT_MODE, file paths)
│   │   ├── config.ts       — 3-layer config loader and validator
│   │   ├── utils.ts        — Shared utility functions (countBrainLines, etc.)
│   │   ├── analyzer.ts     — Project stack/size/methodology analysis
│   │   └── index.ts        — Barrel: re-exports core public API
│   ├── orchestra/          — Sprint orchestration and tmux management
│   │   ├── brain.ts        — Sprint lifecycle: plan → run → evaluate → decay
│   │   ├── planner.ts      — AI task planning (Zod-validated, imports only core/)
│   │   ├── tmux.ts         — tmux session and window management
│   │   └── index.ts        — Barrel
│   ├── agents/             — Agent worker lifecycle
│   │   ├── worker.ts       — Task claiming, locking, result writing
│   │   └── index.ts        — Barrel
│   ├── monitor/            — Observability and audit
│   │   ├── auditor.ts      — Heartbeat scanning, boundary checks, dashboard
│   │   └── index.ts        — Barrel
│   ├── cli/                — Commander.js CLI entry point
│   │   ├── index.ts        — CLI entry: registers all commands
│   │   ├── commands/       — One file per command (init, start, status, …)
│   │   └── helpers/        — Shared CLI helpers (prompt, display)
│   ├── api/                — HTTP API + SSE
│   │   ├── server.ts       — 15 endpoints + SSE stream
│   │   └── watcher.ts      — Dashboard file watcher
│   ├── mcp/                — Model Context Protocol server
│   │   ├── server.ts       — MCP server entry: createServer()
│   │   ├── tools/          — 9 MCP tool handlers
│   │   └── resources/      — 4 MCP resource handlers
│   └── dashboard/          — Web Dashboard (React+Vite+Tailwind, 4 pages)
├── tests/                  — Test files mirroring src/ structure
│   ├── core/
│   ├── orchestra/
│   ├── agents/
│   ├── monitor/
│   ├── cli/
│   ├── mcp/
│   └── integration/        — End-to-end integration tests
├── docs/                   — API reference and architecture docs
├── package.json            — Dependencies, scripts, engine constraints
├── tsconfig.json           — TypeScript compiler config (strict, Node16, ESM)
├── vitest.config.ts        — Test runner config (coverage, include patterns)
├── DIRECTIVES.md           — Active sprint directives (read before contributing)
└── DECKENT-MASTER-BLUEPRINT.md  — Full architecture reference
```

### Module responsibilities

| Module | Responsibility |
|---|---|
| `src/core` | Types, constants, config loading/validation, shared utilities, project analyzer |
| `src/orchestra` | Sprint planning (AI + structured), agent spawning, result evaluation, debt decay |
| `src/agents` | Worker lifecycle: task claim, file lock, heartbeat, result write |
| `src/monitor` | Heartbeat scanning, scope boundary enforcement, in-process scan loop, dashboard state |
| `src/api` | HTTP API (15 endpoints + SSE), dashboard file watcher |
| `src/cli` | CLI commands (21 files), interactive prompts, display helpers |
| `src/mcp` | MCP server with 9 tools and 4 resources for IDE/host integration |
| `src/dashboard` | Web Dashboard: React+Vite+Tailwind, 4 pages, shadcn/ui components |

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
- No `any` — use explicit types or `unknown` with narrowing
- No implicit returns — all code paths must return a value
- No unused locals or parameters — remove or prefix with `_`
- No unchecked indexed access — guard array/object access with bounds checks
- No fallthrough in switch — every case must `break` or `return`

### ESM modules

The project uses native ESM (`"type": "module"` in `package.json`). Always:

- Use `import`/`export`, never `require()`
- Include `.js` extension in all relative imports (even for `.ts` source files):

```typescript
// Correct
import { loadConfig } from './config.js';

// Wrong — will fail with Node16 module resolution
import { loadConfig } from './config';
```

- Use `node:` prefix for Node built-ins:

```typescript
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
```

### General conventions

- **Pure functions** where possible — avoid side effects, prefer returning values
- **Collect errors** rather than fail-fast in validators (better developer experience)
- **No shell injection** — use `spawnSync('cmd', [...args])` with array args, never string concatenation
- **Minimal dependencies** — check if a Node built-in suffices before adding a package
- Barrel `index.ts` files are re-export only — no logic in barrels

---

## Testing Guide

### Framework

Tests use **[vitest](https://vitest.dev/)** with v8 coverage provider.

```
tests/                 — All test files live here, mirroring src/
vitest.config.ts       — Config: include pattern, coverage exclude list
```

### Running tests

```bash
npm test                     # Run all tests once
npm run test:watch           # Watch mode (re-runs on change)
npm run test:coverage        # Run with coverage report
npx vitest run tests/core/   # Run a specific subdirectory
```

### Coverage goal

The project targets **≥ 95% coverage** on non-barrel source files. Barrel `index.ts` files are excluded from coverage (see `vitest.config.ts` exclude list).

```bash
npm run test:coverage
# Look for: Lines | Branches | Functions | Statements all ≥ 95%
```

New code should not drop overall coverage. If a function is difficult to test, explain why in a PR comment.

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
  vi.clearAllMocks();  // REQUIRED — call history bleeds between tests
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
- Do not assert on implementation details — test the public contract

---

## Branch Strategy

```
main              — stable, releasable code; protected
feature/<name>    — new features
fix/<name>        — bug fixes
docs/<name>       — documentation-only changes
refactor/<name>   — internal refactors with no behaviour change
test/<name>       — test-only additions
```

- Always branch from `main`
- Never push directly to `main`
- Keep branches short-lived (complete within a sprint wave)
- Delete the branch after the PR is merged

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

Use the module name: `core`, `orchestra`, `agents`, `monitor`, `cli`, `mcp`, or omit for cross-cutting changes.

### Examples

```
feat(core): add 3-layer config loader [task-001]
fix(config): handle malformed JSON gracefully [task-012]
test(core): add config validation edge cases
docs: add ARCHITECTURE.md and ROADMAP.md
refactor(types): split enums into separate file [task-008]
chore: upgrade vitest to v3
```

- Keep the description under 72 characters
- Use imperative mood: "add", "fix", "remove" — not "added", "fixes"
- Include `[task-XXX]` when the commit is part of a tracked sprint task

---

## Pull Request Process

1. **Create a branch** from `main` with the appropriate prefix
2. **Make your changes** — keep PRs focused on a single concern
3. **Write tests** for all new code; do not reduce coverage
4. **Run the full check suite** before opening the PR:

   ```bash
   npm run lint          # tsc --noEmit must be clean (zero errors)
   npm test              # All tests must pass
   npm run test:coverage # Coverage must stay ≥ 95%
   npm run build         # dist/ must compile cleanly
   ```

5. **Open the PR** with:
   - A clear title matching the commit format
   - A description of what changed and why
   - References to related sprint tasks or issues
6. **Respond to review comments** — address or discuss every comment
7. **Squash and merge** once approved

### PR checklist

- [ ] `npm run lint` exits with no errors
- [ ] `npm test` passes (all existing tests green)
- [ ] Coverage is ≥ 95% on modified files
- [ ] `npm run build` succeeds
- [ ] New public functions are documented with JSDoc
- [ ] `DIRECTIVES.md` is updated if scope or approach changed

---

## Sprint Contribution

Deckent is developed in sprints. Each sprint has an active `DIRECTIVES.md` that defines the goals, tasks, and quality rules for that sprint. **Read `DIRECTIVES.md` before starting work.**

### DIRECTIVES.md format

```markdown
# DIRECTIVES — Sprint N (Sprint Name)

## Hedef: <Sprint Goal>
One-paragraph description of the sprint's objective.

## Görev 1: <Task Name>
- Bullet list of requirements for this task
- Each bullet is a specific deliverable

## Görev 2: <Task Name>
- ...

## Kalite Kuralları
- Quality rules that apply to ALL tasks in this sprint
- e.g., "existing tests must not regress", "tsc --noEmit clean"
```

### Wave plan

Large sprints are broken into **waves** — logical groups of tasks that can be parallelised. A wave completes when all its tasks have a `.result` file in `.tasks/`.

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
- `"DONE"` — task complete, all quality rules met
- `"GO_WITH_TECH_DEBT"` — task complete, known debt logged
- `"NO_GO"` — task blocked or failing; explain in `notes`

---

## Questions?

- Open an issue on GitHub
- Read the [Blueprint](DECKENT-MASTER-BLUEPRINT.md) for full architecture details
- Check [docs/API.md](docs/API.md) for the programmatic API reference
