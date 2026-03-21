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
9. [Plugin System Development](#plugin-system-development)
10. [Internationalization (i18n) Contributing](#internationalization-i18n-contributing)
11. [MCP Tool and Resource Development](#mcp-tool-and-resource-development)

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
npm test        # Should pass all tests (3609+)
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
│   ├── providers/          — Provider adapters (Claude, subprocess, sandbox)
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
│   │   ├── server.ts       — 16 endpoints + SSE stream
│   │   └── watcher.ts      — Dashboard file watcher
│   ├── mcp/                — Model Context Protocol server
│   │   ├── server.ts       — MCP server entry: createServer()
│   │   ├── tools/          — 10 MCP tool handlers
│   │   └── resources/      — 5 MCP resource handlers
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
| `src/core` | Types, constants, config loading/validation, shared utilities, project analyzer, system profile, subscription detection |
| `src/orchestra` | Sprint planning (AI + structured + auto fallback), agent spawning, result evaluation, debt decay, layered model selection |
| `src/agents` | Worker lifecycle: task claim, file lock, heartbeat, result write |
| `src/monitor` | Heartbeat scanning, scope boundary enforcement, in-process scan loop, dashboard state, alert dedup |
| `src/api` | HTTP API (16 endpoints + SSE), dashboard file watcher |
| `src/cli` | CLI commands (28 commands), interactive prompts, display helpers, contextual hints, auto setup wizard |
| `src/mcp` | MCP server with 10 tools (enriched responses) and 5 resources for IDE/host integration |
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

## Plugin System Development

Plugins extend Deckent's capabilities through a versioned plugin system. All plugins run in isolated worker contexts with scoped file access.

### Plugin structure

Each plugin is stored in `.deckent/plugins/{pluginName}/`:

```
.deckent/plugins/my-plugin/
├── plugin.json          — Plugin metadata (name, version, description, exports)
├── src/
│   ├── index.ts         — Plugin entry point (exports IPlugin interface)
│   └── *.ts             — Plugin implementation modules
├── tests/
│   └── *.test.ts        — Plugin tests (vitest)
└── README.md            — Plugin documentation
```

### Plugin metadata (plugin.json)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Brief description of what the plugin does",
  "exports": {
    "hooks": ["onTaskStart", "onTaskComplete"],
    "commands": ["my-command"],
    "patterns": ["CustomPattern"]
  },
  "permissions": {
    "directories": ["logs", "data"],
    "filesRead": ["config.json"],
    "filesWrite": ["state.json"]
  }
}
```

### Plugin interface

All plugins must implement the `IPlugin` interface from `src/core/types.ts`:

```typescript
export interface IPlugin {
  name: string;
  version: string;
  hooks?: {
    onTaskStart?: (task: Task) => Promise<void>;
    onTaskComplete?: (result: TaskResult) => Promise<void>;
    onSprintStart?: (directives: string) => Promise<void>;
    onSprintComplete?: (retro: string) => Promise<void>;
  };
  commands?: Record<string, (args: unknown[]) => Promise<unknown>>;
  validate?: () => Promise<boolean>;
}
```

### Plugin development checklist

- [ ] Plugin implements `IPlugin` interface correctly
- [ ] `plugin.json` declares accurate permissions and hooks
- [ ] All permissions in `plugin.json` are actually used by the plugin
- [ ] Plugin is isolated — does not import from non-core modules
- [ ] All plugin functions have ≥ 80% test coverage
- [ ] Plugin has a `validate()` method that checks prerequisites
- [ ] Plugin handles errors gracefully (no unhandled rejections)
- [ ] Plugin cleanup: `onSprintComplete` should clean up temporary files
- [ ] `README.md` documents plugin purpose, installation, and usage
- [ ] Version follows [Semantic Versioning](https://semver.org/)

### Plugin testing

Plugins are tested in isolation using mock core services:

```typescript
// .deckent/plugins/my-plugin/tests/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyPlugin } from '../src/index.js';

describe('MyPlugin', () => {
  let plugin: MyPlugin;

  beforeEach(() => {
    plugin = new MyPlugin();
  });

  it('validates successfully with correct config', async () => {
    const valid = await plugin.validate();
    expect(valid).toBe(true);
  });

  it('calls onTaskStart hook when task begins', async () => {
    const task = { id: '001-001', title: 'Test Task' };
    await plugin.hooks?.onTaskStart?.(task);
    expect(/* assertions */);
  });
});
```

### Plugin registration

Plugins are discovered and loaded from `.deckent/plugins/` by the Brain on startup. To register a new plugin:

1. Create the plugin directory structure
2. Implement `IPlugin` interface
3. Declare permissions and hooks in `plugin.json`
4. Test the plugin with `npm test`
5. The plugin is automatically available on next Brain restart

---

## Internationalization (i18n) Contributing

Deckent supports multiple languages through a runtime i18n system. Currently supported: **English (en)**, **Turkish (tr)**.

### Adding a new language

1. **Create language directory**:

   ```bash
   mkdir -p src/i18n/{languageCode}
   ```

   Use [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) language codes (e.g., `de` for German, `fr` for French).

2. **Create message files** — mirror the structure of `src/i18n/en/`:

   ```
   src/i18n/de/
   ├── index.ts         — Barrel re-export
   ├── cli.ts           — CLI messages
   ├── errors.ts        — Error messages
   ├── hints.ts         — Contextual hints
   └── messages.ts      — General UI messages
   ```

3. **Implement message exports** — each file exports a Messages object:

   ```typescript
   // src/i18n/de/cli.ts
   export const cliMessages = {
     initStart: 'Deckent wird initialisiert...',
     initComplete: 'Initialisierung abgeschlossen',
     planStart: 'Planen Sie den Sprint...',
     // ... all keys matching src/i18n/en/cli.ts
   };
   ```

4. **Update i18n loader** — add the language to `src/core/i18n.ts`:

   ```typescript
   const languages = {
     en: () => import('../i18n/en/index.js'),
     tr: () => import('../i18n/tr/index.js'),
     de: () => import('../i18n/de/index.js'),  // Add new language
   };
   ```

5. **Test coverage** — ensure all keys are present in the new language:

   ```typescript
   // tests/i18n/de.test.ts
   import { describe, it, expect } from 'vitest';
   import { loadMessages } from '../../src/core/i18n.js';
   import * as enMessages from '../../src/i18n/en/index.js';

   describe('German (de) i18n completeness', () => {
     it('has all keys from English', async () => {
       const deMessages = await loadMessages('de');
       const enKeys = Object.keys(enMessages);
       deKeys.forEach(key => {
         expect(deMessages).toHaveProperty(key);
       });
     });
   });
   ```

6. **Update DIRECTIVES.md** — note the new language support in the sprint summary

### i18n conventions

- **Key naming**: Use camelCase, descriptive names (e.g., `taskStartedMessage`, not `msg1`)
- **Consistent terminology**: Keep translated terms consistent across all files
  - If "Sprint" = "Sprint" in German, use it everywhere
  - Maintain a glossary comment at the top of each file
- **Pluralization**: Use message templates for plural forms:

  ```typescript
  tasksCompleted: (count: number) => `${count} Aufgabe${count !== 1 ? 'n' : ''} abgeschlossen`,
  ```

- **Formatting**: Follow the structure of existing language files exactly
- **Do not translate**: variable names, file paths, code snippets, command names

### Available languages

| Code | Language | Status | Maintainer |
|---|---|---|---|
| `en` | English | Complete | @team |
| `tr` | Turkish | Complete | @team |
| `de` | German | Needs contributor | — |
| `fr` | French | Needs contributor | — |

---

## MCP Tool and Resource Development

Deckent exposes its API to IDE hosts (Claude, Cursor, etc.) through the Model Context Protocol (MCP). Tools and resources are the primary extension points for IDE integration.

### MCP architecture

```
src/mcp/
├── server.ts          — MCP server entry point
├── tools/             — Tool implementations (10 tools)
│   ├── directives.ts
│   ├── plan.ts
│   ├── start.ts
│   ├── status.ts
│   ├── doctor.ts
│   ├── init.ts
│   ├── retro.ts
│   ├── history.ts
│   ├── sync.ts
│   └── analyze.ts
├── resources/         — Resource implementations (5 resources)
│   ├── directives.ts
│   ├── brain-memory.ts
│   ├── debt.ts
│   ├── decisions.ts
│   └── patterns.ts
└── helpers/
    └── enrich.ts      — Response enrichment utilities
```

### Adding a new MCP tool

1. **Create tool file** in `src/mcp/tools/{toolName}.ts`:

   ```typescript
   import { Tool } from '@anthropic-ai/sdk/resources/messages.js';
   import { enrichResponse } from '../helpers/enrich.js';
   import type { EnrichedResponse } from '../../core/types.js';

   export const myTool: Tool = {
     type: 'function',
     function: {
       name: 'my_tool',
       description: 'What this tool does',
       inputSchema: {
         type: 'object' as const,
         properties: {
           param1: { type: 'string', description: 'Parameter description' },
         },
         required: ['param1'],
       },
     },
   };

   export async function handleMyTool(params: { param1: string }): Promise<EnrichedResponse> {
     // Implementation
     const result = { /* tool output */ };
     return enrichResponse(result, 'my_tool');
   }
   ```

2. **Register tool** in `src/mcp/server.ts`:

   ```typescript
   import { myTool, handleMyTool } from './tools/my-tool.js';

   // In createServer():
   server.setRequestHandler(ListToolsRequestSchema, async () => ({
     tools: [
       // ... existing tools
       myTool,
     ],
   }));

   server.setRequestHandler(CallToolRequestSchema, async (request) => {
     // ... existing handlers
     if (request.params.name === 'my_tool') {
       const result = await handleMyTool(request.params.arguments as { param1: string });
       return { content: [{ type: 'text', text: JSON.stringify(result) }] };
     }
   }));
   ```

3. **Update index** — export tool from `src/mcp/tools/index.ts` (if barrel exists)

4. **Write tests** in `tests/mcp/tools/my-tool.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { handleMyTool } from '../../../src/mcp/tools/my-tool.js';

   describe('handleMyTool', () => {
     it('returns enriched response', async () => {
       const result = await handleMyTool({ param1: 'test' });
       expect(result._enriched).toBeDefined();
       expect(result._enriched.toolName).toBe('my_tool');
     });
   });
   ```

### Adding a new MCP resource

1. **Create resource file** in `src/mcp/resources/{resourceName}.ts`:

   ```typescript
   import { Resource } from '@anthropic-ai/sdk/resources/messages.js';
   import { readFile } from 'node:fs/promises';
   import { join } from 'node:path';

   export const myResource: Resource = {
     type: 'resource',
     uri: 'deckent://my-resource',
     name: 'My Resource',
     description: 'What this resource exposes',
     mimeType: 'application/json',
   };

   export async function readMyResource(): Promise<string> {
     const filePath = join(process.cwd(), '.brain', 'my-resource.md');
     try {
       return await readFile(filePath, 'utf-8');
     } catch {
       return 'Resource not found';
     }
   }
   ```

2. **Register resource** in `src/mcp/server.ts`:

   ```typescript
   import { myResource, readMyResource } from './resources/my-resource.js';

   // In createServer():
   server.setRequestHandler(ListResourcesRequestSchema, async () => ({
     resources: [
       // ... existing resources
       myResource,
     ],
   }));

   server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
     if (request.params.uri === 'deckent://my-resource') {
       const content = await readMyResource();
       return { contents: [{ uri: request.params.uri, mimeType: 'text/markdown', text: content }] };
     }
   }));
   ```

3. **Write tests** in `tests/mcp/resources/my-resource.test.ts`

### Response enrichment

All tool responses are enriched with metadata via `enrichResponse()`:

```typescript
import { enrichResponse } from '../helpers/enrich.js';

const response = { data: 'tool result' };
const enriched = enrichResponse(response, 'my_tool'); // Adds _enriched field
```

The `_enriched` field contains:
- `toolName`: Name of the tool
- `timestamp`: ISO 8601 timestamp
- `version`: Deckent version
- `locale`: Current language (en/tr)

### Tool/resource checklist

- [ ] Tool/resource implements MCP interface correctly
- [ ] Tool has ≥ 80% test coverage
- [ ] Response includes proper error messages (no stack traces)
- [ ] Long-running tools support `--dry-run` or preview mode
- [ ] Tool description is clear and concise
- [ ] Input schema is complete and validated
- [ ] Tool is registered in `src/mcp/server.ts`
- [ ] All new test mocks include the new tool/resource in exports
- [ ] Documentation mentions the new tool/resource in [docs/API.md](docs/API.md)
- [ ] Response is enriched with `enrichResponse()` if it's a tool

---

## Questions?

- Open an issue on GitHub
- Read the [Blueprint](DECKENT-MASTER-BLUEPRINT.md) for full architecture details
- Check [docs/API.md](docs/API.md) for the programmatic API reference
