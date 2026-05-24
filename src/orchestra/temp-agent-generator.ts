// ─── Temp Agent PROMPT.md Generator ─────────────────────────────────────────
// Generates Karpathy-aligned PROMPT.md files for auto-generated temp agents.
// Companion to temp-skill-generator.ts:generateTempAgents() — fixes the
// "PROMPT.md missing — degraded fallback" warning emitted by agent-pool.ts.
//
// Output contract: .deckent/agents/<agentId>/PROMPT.md exists for every
// temp agent the planner persists. Source of truth is THIS file; the writer
// is idempotent and never overwrites a hand-edited PROMPT.md (ensureAgentPromptMd).

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentDefinition } from '../core/agent-types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';
const PROMPT_FILENAME = 'PROMPT.md';

// ─── Template Types ─────────────────────────────────────────────────────────

/**
 * Stack-specific guidance injected into the rendered PROMPT.md.
 * Discipline blocks (Think/Simplicity/Surgical/Goal) are universal and
 * always included by renderAgentPromptMd — templates only contribute the
 * stack-specific section.
 */
export interface AgentPromptTemplate {
  /** Human heading for the stack section (e.g. "React + TypeScript"). */
  stackHeading: string;
  /** Short tagline describing the specialty. */
  tagline: string;
  /** Bullet points describing domain best practices. */
  bestPractices: string[];
  /** Bullet points listing anti-patterns to avoid. */
  antiPatterns: string[];
  /** Test framework hint shown under "Testing". */
  testingHint: string;
}

/**
 * Lookup table indexed by AgentTemplate.idSuffix (see temp-skill-generator.ts).
 * Adding a new temp-agent template means: (1) extend AGENT_TEMPLATES there,
 * (2) add a matching entry here. Falling back to GENERIC_TEMPLATE is supported
 * for any unknown id (e.g. user-defined temp agents).
 */
export const AGENT_PROMPT_TEMPLATES: Readonly<Record<string, AgentPromptTemplate>> = {
  'react-ts-specialist': {
    stackHeading: 'React + TypeScript',
    tagline: 'Build typed, composable, testable React components.',
    bestPractices: [
      'Prefer functional components + hooks; lift state only when sharing requires it.',
      'Use strict TypeScript: explicit prop types, discriminated unions for variants.',
      'Co-locate component + test + styles; one folder per public component.',
      'Memoize at the boundary, not by reflex — measure before optimizing.',
    ],
    antiPatterns: [
      'class components, any-typed props, or untyped useState.',
      'Inline anonymous handlers in lists (creates new ref each render).',
      'useEffect for derivations that should be computed during render.',
    ],
    testingHint: 'Vitest + React Testing Library — query by role/label, never by class.',
  },
  'react-specialist': {
    stackHeading: 'React',
    tagline: 'Build composable, testable React components.',
    bestPractices: [
      'Functional components + hooks; one concern per component.',
      'Lift state late; prop-drill rather than reach for context too early.',
      'Keep effects minimal — derive during render when possible.',
    ],
    antiPatterns: [
      'Mutating props or shared refs.',
      'useEffect for sync state that React already derives.',
    ],
    testingHint: 'Vitest/Jest + RTL — assert observable behavior, not implementation.',
  },
  'ts-architect': {
    stackHeading: 'TypeScript (strict mode)',
    tagline: 'Design precise type systems for ESM TypeScript libraries.',
    bestPractices: [
      'Always import with `.js` extension (Node16 ESM resolution).',
      'Prefer discriminated unions + exhaustive switches over class hierarchies.',
      'Use `satisfies` for object literals that must keep narrow inferred types.',
      'Constrain generics with `extends` — never leave `<T>` unbounded if shape matters.',
    ],
    antiPatterns: [
      '`any`, `as` assertions without a type guard, or `// @ts-ignore` without a reason comment.',
      'Default exports for types (breaks rename refactors).',
      'Re-exporting half of a module through a barrel — keep imports explicit.',
    ],
    testingHint: 'vitest run — leverage tsc --noEmit alongside tests for type-level coverage.',
  },
  'python-api-specialist': {
    stackHeading: 'Python + FastAPI',
    tagline: 'Design typed, async, validated REST endpoints.',
    bestPractices: [
      'Define request/response models with Pydantic; never accept raw dicts.',
      'Make handlers `async def` only when they `await` real I/O.',
      'Group routers by resource; mount under a versioned prefix (/v1).',
      'Use dependency injection (`Depends`) for auth, db sessions, settings.',
    ],
    antiPatterns: [
      'Returning ORM models directly from handlers (leaks schema).',
      'Bare `except:` clauses — always narrow the exception type.',
      'Blocking sync libraries inside async handlers.',
    ],
    testingHint: 'pytest + httpx.AsyncClient — exercise the ASGI app, not bare functions.',
  },
  'python-specialist': {
    stackHeading: 'Python (idiomatic, typed)',
    tagline: 'Write small, typed, testable Python.',
    bestPractices: [
      'Type hint every public function; rely on `mypy --strict` discipline.',
      'Prefer dataclasses / pydantic over plain dicts for structured data.',
      'Use context managers for any resource that needs cleanup.',
    ],
    antiPatterns: [
      'Mutable default arguments (`def f(x=[])` — classic footgun).',
      'Catching `Exception` broadly without re-raising.',
      'Mixing sync/async without clear boundary.',
    ],
    testingHint: 'pytest with fixtures + parametrize; mock at boundary, not internals.',
  },
  'go-specialist': {
    stackHeading: 'Go',
    tagline: 'Write idiomatic, concurrent Go.',
    bestPractices: [
      'Return errors as values; wrap with `fmt.Errorf("%w", err)` to preserve chain.',
      'Define small interfaces at the consumer, not the producer.',
      'Use channels for coordination, mutexes for shared state — pick one per concern.',
      'Keep packages cohesive; avoid `util/` or `common/`.',
    ],
    antiPatterns: [
      'Panicking in library code (panic is for unrecoverable program bugs only).',
      'Naked returns in long functions (cargo-cult readability harm).',
      'Goroutine leaks — every spawned goroutine must have a clear shutdown path.',
    ],
    testingHint: 'go test ./... with table-driven tests; use `t.Parallel()` where safe.',
  },
  'rust-specialist': {
    stackHeading: 'Rust',
    tagline: 'Write safe, ownership-correct, async Rust.',
    bestPractices: [
      'Prefer `Result<T, E>` over panics for any recoverable error path.',
      'Borrow over clone — reach for `.clone()` only when ownership semantics demand it.',
      'Use `?` for error propagation; define a crate-level error enum with `thiserror`.',
      'Async runtime: pick Tokio early and stay consistent.',
    ],
    antiPatterns: [
      '`unwrap()` / `expect()` in non-test code without a justified invariant.',
      'Premature use of `Rc<RefCell<_>>` — try `&mut` first.',
      'Holding a `MutexGuard` across an `.await` (deadlock risk).',
    ],
    testingHint: 'cargo test — keep unit tests in `#[cfg(test)] mod tests` next to code.',
  },
};

const GENERIC_TEMPLATE: AgentPromptTemplate = {
  stackHeading: 'Generic',
  tagline: 'Apply your assigned specialty within the task scope.',
  bestPractices: [
    'Read the task scope before editing; respect filesWrite boundaries.',
    'Keep changes small and reversible.',
    'Add tests that exercise the new behavior, including edge cases.',
  ],
  antiPatterns: [
    'Touching files outside scope (the auditor will flag this).',
    'Speculative refactoring beyond what the task requires.',
    'Suppressing errors to make tests pass without understanding the failure.',
  ],
  testingHint: 'Run the project test suite and fix regressions before reporting DONE.',
};

// ─── Template lookup ────────────────────────────────────────────────────────

/**
 * Strip the canonical `temp-` prefix to map an agent ID back to its template id.
 * `temp-react-ts-specialist` → `react-ts-specialist`.
 */
function templateKey(agentId: string): string {
  return agentId.startsWith('temp-') ? agentId.slice(5) : agentId;
}

/**
 * Returns the prompt template for an agent id, or the generic fallback.
 * Never throws — unknown ids always get the generic template.
 */
export function getPromptTemplate(agentId: string): AgentPromptTemplate {
  return AGENT_PROMPT_TEMPLATES[templateKey(agentId)] ?? GENERIC_TEMPLATE;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/**
 * Render the PROMPT.md content for a given agent.
 *
 * Layout:
 *   # <Agent name>
 *   Identity + expertise blurb.
 *   ## Stack: <stackHeading>
 *   ## Best Practices
 *   ## Avoid
 *   ## Testing
 *   ## Discipline (Karpathy 4-discipline — universal)
 *     - Think Before Coding
 *     - Simplicity First
 *     - Surgical Changes
 *     - Goal-Driven Execution
 *
 * The Discipline section is identical for every temp agent — it codifies the
 * worker.md rules in PROMPT.md form so the agent prompt block is self-contained.
 */
export function renderAgentPromptMd(
  agent: Pick<AgentDefinition, 'id' | 'name' | 'description' | 'expertise'>,
  template?: AgentPromptTemplate,
): string {
  const tpl = template ?? getPromptTemplate(agent.id);
  const lines: string[] = [];

  // Header
  lines.push(`# ${agent.name}`);
  lines.push('');
  if (agent.description) {
    lines.push(agent.description);
    lines.push('');
  }
  if (agent.expertise.length > 0) {
    lines.push(`**Expertise:** ${agent.expertise.join(', ')}`);
    lines.push('');
  }

  // Stack-specific section
  lines.push(`## Stack: ${tpl.stackHeading}`);
  lines.push('');
  lines.push(tpl.tagline);
  lines.push('');

  lines.push('## Best Practices');
  for (const bp of tpl.bestPractices) {
    lines.push(`- ${bp}`);
  }
  lines.push('');

  lines.push('## Avoid');
  for (const ap of tpl.antiPatterns) {
    lines.push(`- ${ap}`);
  }
  lines.push('');

  lines.push('## Testing');
  lines.push(`- ${tpl.testingHint}`);
  lines.push('');

  // Karpathy 4-discipline — universal, identical across templates
  lines.push('## Discipline');
  lines.push('');
  lines.push('### Think Before Coding');
  lines.push('- Read the task JSON, scope, and the GO/NO-GO criteria first.');
  lines.push('- Write your execution plan to `.tasks/task-XXX.plan` before touching code.');
  lines.push('- Identify the minimum set of files needed to satisfy the criteria.');
  lines.push('');
  lines.push('### Simplicity First');
  lines.push('- Prefer the smallest change that passes the GO criteria.');
  lines.push('- Reach for a new abstraction only on the third repetition, not the first.');
  lines.push('- Delete dead code on contact; never leave commented-out blocks.');
  lines.push('');
  lines.push('### Surgical Changes');
  lines.push('- Stay strictly within `scope.filesWrite` — the auditor verifies via `git diff --stat`.');
  lines.push('- One concern per commit-sized unit; avoid drive-by edits to unrelated files.');
  lines.push('- If the task forces a scope violation, stop and write NO_GO + ADR amendment.');
  lines.push('');
  lines.push('### Goal-Driven Execution');
  lines.push('- After each edit, re-check the GO criteria — would they pass right now?');
  lines.push('- Run lint/build and the full test suite before marking DONE (max 3 attempts).');
  lines.push('- Write an honest `.result` file: DONE only when functional outcome matches spec.');
  lines.push('');

  return lines.join('\n');
}

// ─── Filesystem helpers ─────────────────────────────────────────────────────

/**
 * Compute the canonical PROMPT.md path for an agent under projectRoot.
 */
export function promptMdPath(projectRoot: string, agentId: string): string {
  return path.join(projectRoot, AGENTS_DIR, agentId, PROMPT_FILENAME);
}

/**
 * Write PROMPT.md for an agent. Creates the agent directory if needed.
 * Always overwrites — use ensureAgentPromptMd() if you want to preserve
 * a hand-edited PROMPT.md.
 */
export function writeAgentPromptMd(
  projectRoot: string,
  agentId: string,
  content: string,
): void {
  const target = promptMdPath(projectRoot, agentId);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

/**
 * Promotion gate / planner safety net: ensure a PROMPT.md exists for the agent.
 * - If a non-empty PROMPT.md already exists at .deckent/agents/<id>/PROMPT.md,
 *   leave it alone (preserves user edits + already-rendered files).
 * - Otherwise render a fresh one using the agent's template (or generic fallback)
 *   and write it.
 * Returns true if a write occurred, false if the existing file was preserved.
 */
export function ensureAgentPromptMd(
  projectRoot: string,
  agent: Pick<AgentDefinition, 'id' | 'name' | 'description' | 'expertise'>,
): boolean {
  const target = promptMdPath(projectRoot, agent.id);
  if (fs.existsSync(target)) {
    try {
      const existing = fs.readFileSync(target, 'utf8');
      if (existing.trim().length > 0) return false;
    } catch {
      // Read failure → fall through to write a fresh copy.
    }
  }
  writeAgentPromptMd(projectRoot, agent.id, renderAgentPromptMd(agent));
  return true;
}

/**
 * Bulk variant — used by the planner right after generateTempAgents() to
 * eliminate the Sprint 190 "PROMPT.md missing" warning for every spawned agent
 * in a single call. Returns the number of PROMPT.md files written.
 */
export function persistTempAgentPrompts(
  projectRoot: string,
  agents: ReadonlyArray<Pick<AgentDefinition, 'id' | 'name' | 'description' | 'expertise'>>,
): number {
  let written = 0;
  for (const agent of agents) {
    if (ensureAgentPromptMd(projectRoot, agent)) written++;
  }
  return written;
}
