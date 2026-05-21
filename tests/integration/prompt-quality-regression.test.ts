/**
 * Integration Smoke Test: Prompt Quality Regression
 *
 * Verifies Sprint 182 PQ fix improvements over Sprint 181 baseline prompts.
 * Two tests model Sprint 181-001 (devops-engineer CI workflow) and 181-002
 * (refactorer package.json).
 *
 * Quality assertions tracked:
 *   (b) "(content truncated)" marker absent          — PQ-2/3 ✓ implemented
 *   (c) Agent block injected from PROMPT.md          — ✓ implemented
 *   (d) Full skill content, no clipping              — PQ-2 ✓ implemented
 *   (f) filesWrite list explicit in scope block      — ✓ implemented
 *
 * Pending (tasks returned NO_GO / not yet applied):
 *   (a) ${IDEMPOTENCY_KEY} literal removed            — PQ-1 pending (182-007 NO_GO)
 *   (e) ADR relevance threshold 0.3 filtering        — PQ-5 pending (182-011 not run)
 */

import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

/**
 * Devops-engineer PROMPT.md content (Sprint 181-001 agent prompt).
 * Used to verify (c): agent block is sourced from PROMPT.md, not systemPrompt.
 */
const DEVOPS_AGENT_PROMPT = `# DevOps Engineer Agent

You are a DevOps engineer agent. Your mission is to build reliable CI/CD pipelines,
optimize container workflows, and automate deployment with security and reproducibility
as first-class concerns.

## Core Responsibilities

1. **CI/CD Pipelines** -- Design and maintain GitHub Actions workflows
2. **Containerization** -- Docker multi-stage builds, image optimization
3. **Deployment** -- Automated, safe deployment strategies
4. **Monitoring** -- Actionable alerts, health checks, observability

## GitHub Actions Best Practices

- One workflow per concern (CI, deploy, release, scheduled checks)
- Pin action versions by commit SHA, not tag (supply-chain security)
- Set permissions explicitly -- never use default read-write
- Cache node_modules with hash of package-lock.json

## Output Quality Checklist

Before marking any task as done, verify:
- [ ] Workflow runs successfully on a clean checkout
- [ ] All secrets are properly masked in logs
- [ ] Cache hit rate is > 80% on subsequent runs
- [ ] Documentation updated (README, runbooks)

DEVOPS_PROMPT_SENTINEL_END`;

/**
 * Refactorer PROMPT.md content (Sprint 181-002 agent prompt).
 */
const REFACTORER_AGENT_PROMPT = `# Refactorer Agent

You are a code refactoring specialist agent. Your mission is to improve code structure
and readability without changing external behavior. Every refactoring must preserve
the existing test suite results.

## Core Responsibilities

1. **Improve Structure** -- Reorganize code for clarity and maintainability
2. **Preserve Behavior** -- Zero functional changes during refactoring
3. **Verify with Tests** -- Run tests before and after every refactoring
4. **Document Changes** -- Explain what was moved, renamed, or restructured

## Refactoring Safety Protocol

Before any refactoring:
1. Run the full test suite and record results
2. Understand the current code and its callers
3. Plan the refactoring steps in small increments
4. Apply one refactoring at a time
5. Run tests after each step

## Verification Steps

After completing all refactorings:
1. Run tsc --noEmit to verify type correctness
2. Run npx vitest run to verify all tests pass
3. Compare test count before and after (must be equal or greater)
4. Confirm all imports resolve correctly

REFACTORER_PROMPT_SENTINEL_END`;

/**
 * Long CI skill content (>3000 chars) — simulates what ci-testing skill would inject.
 * Pre-PQ-2: effort=low would have truncated this at ~4000 chars (1000 tokens × 4).
 * Post-PQ-2: full content injected, LONG_SKILL_CONTENT_TAIL_MARKER visible.
 */
const LONG_CI_SKILL_CONTENT = `# CI Testing Skill

## Test Execution in CI

CI environments differ from local development. Key differences to account for:
- No persistent cache by default
- Stricter environment variable requirements
- Different filesystem permissions
- Platform-specific line endings (LF vs CRLF)

## Setting Up Test Runners

### Vitest in CI
Configure vitest for CI environments:
- Set CI=true environment variable
- Use --reporter=verbose for better diagnostics
- Set --no-coverage when coverage is handled separately
- Use --bail=1 to fail fast on first error

### Test Isolation
Each test must be fully isolated:
- No shared state between tests
- Clean temp directories before and after
- Mock all external services
- Use unique resource identifiers per test run

## Mock Hygiene Protocol

Critical for CI consistency:
1. Always explicitly list all mocked exports in vi.mock() factory
2. When adding new exports to a module, update all vi.mock() factories
3. Never rely on auto-mocking for modules with many exports
4. Test with CI=true locally to catch env-specific failures early

### Common Mock Failures

#### Missing export in vi.mock() factory
Error: 'No "renameSync" export is defined on the "node:fs" mock'
Root cause: vi.mock factory does not include all exports used by code under test.
Fix: Add missing exports to factory; run with CI=true to verify parity.

#### Factory returns wrong types
Error: TypeError: xxx.mockReturnValue is not a function
Root cause: Factory returns plain values instead of vi.fn() wrappers.
Fix: Wrap all function exports with vi.fn().

## Regression Detection

After every code change:
1. Run targeted tests on changed files
2. Compare test count against baseline (zero regressions allowed)
3. Verify CI=true and local environments produce identical results
4. Flag any test that passes locally but fails in CI

## Coverage Tracking

- Use vitest v8 coverage provider
- Exclude barrel files (index.ts) from coverage
- Set coverage thresholds per module type:
  - Core business logic: 90%+
  - CLI commands: 80%+
  - Integration paths: 70%+
- Never reduce coverage below sprint baseline

## Environment Parity Checklist

Before marking tests as passing:
- [ ] npx vitest run (local) passes
- [ ] CI=true npx vitest run (local) passes
- [ ] Node.js version matches CI matrix (.nvmrc or engines field)
- [ ] All vi.mock() factories include complete export surface
- [ ] No test uses process.env.HOME or other user-specific paths

CI_SKILL_LONG_CONTENT_TAIL_MARKER_PQ2_VERIFICATION
This final section exists to verify PQ-2 fix: before Sprint 182 PQ-2, effort=low
tasks would truncate skill content at approximately 4000 characters, cutting this
section off. Post-PQ-2, this marker must appear in the rendered prompt.`;

/**
 * Long TypeScript skill content for 181-002 test.
 */
const LONG_TS_SKILL_CONTENT = `# TypeScript Expert Skill

## Type System Fundamentals

TypeScript's type system enables compile-time correctness verification. Key concepts:

### Strict Mode Requirements
Always use strict: true in tsconfig.json:
- strictNullChecks: catches null/undefined access errors
- noImplicitAny: prevents implicit any types
- strictFunctionTypes: enables contravariant function parameters

### ESM + Node16 Module Resolution
Critical for this project (ADR-001, ADR-002):
- All imports require .js extension: import { foo } from './bar.js'
- Never use .ts extension in imports
- Re-exports through index.ts must use .js extensions too
- Dynamic imports: await import('./module.js')

## Type Composition Patterns

### Union and Intersection Types
Use union for "one of these" scenarios:
type Status = 'DONE' | 'NO_GO' | 'GO_WITH_TECH_DEBT';

Use intersection for "has all of these" scenarios:
type TaskWithResult = Task & { result: TaskResult };

### Generic Constraints
Constrain generics to ensure type safety:
function getField<T extends Record<string, unknown>>(obj: T, key: keyof T): T[typeof key]

### Discriminated Unions
Use literal types as discriminants:
type Result = { ok: true; value: string } | { ok: false; error: Error };

## Common TypeScript Errors and Fixes

### Error: Property does not exist on type
Cause: Accessing property not defined in type
Fix: Add property to type definition or use optional chaining (obj?.prop)

### Error: Argument of type X is not assignable to parameter of type Y
Cause: Type mismatch in function call
Fix: Check type definitions, add type assertion only as last resort

### Error: Object is possibly undefined
Cause: Strict null checks enabled, value may be undefined
Fix: Add null check (if (val !== undefined)) or non-null assertion (val!)

## Refactoring for Type Safety

When improving existing code:
1. Replace any with concrete types first
2. Enable strict: true and fix all errors
3. Extract shared types to *-types.ts files
4. Use type predicates for type narrowing

TS_SKILL_LONG_CONTENT_TAIL_MARKER_PQ2_VERIFICATION
This section verifies PQ-2 fix for 181-002 (refactorer, package.json).
Before Sprint 182 PQ-2, this would have been truncated for low-effort tasks.`;

function makeAdr(id: string, title: string, content: string, sprintNum = 100): MemoryEntryV2 {
  return {
    id,
    title,
    content,
    type: 'adr',
    status: 'accepted',
    sprint_id: `sprint-${sprintNum}`,
    sprint_num: sprintNum,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    decay_exempt: false,
  } as MemoryEntryV2;
}

/** Minimal ADR set — deliberately limited to avoid selecting >2 in post-PQ-5 world */
const SPRINT_181_ADRS: MemoryEntryV2[] = [
  makeAdr('adr-001', 'TypeScript + ESM', 'TypeScript + ESM standard for core development. All imports use .js extension (Node16 resolution).', 1),
  makeAdr('adr-002', 'Node16 Module Resolution', 'Node16 module resolution requires .js extension in all imports.', 1),
  makeAdr('adr-006', 'spawnSync Security Pattern', 'spawnSync security pattern for subprocess execution.', 44),
  makeAdr('adr-037', 'Brain-Auditor-Worker Authority Matrix', 'RBAC Protocol V1.0 for authority separation between Brain, Auditor, and Worker roles.', 139),
];

// ─── Test 1: Sprint 181-001 style — devops-engineer CI workflow ────────────

describe('Prompt Quality Regression (Sprint 181-001/002)', () => {
  it('Sprint 181-001 (devops-engineer CI workflow): PQ quality assertions pass', () => {
    // Arrange: simulate the Sprint 181-001 task
    const task181_001: Task = {
      id: '181-001',
      title: 'W1-1 — CI/CD workflow: add dashboard deps install step',
      description:
        'Add npm ci step for src/dashboard before vitest run in CI workflow. ' +
        'Sprint 181 root cause: dashboard package-lock.json was missing from CI, causing typecheck failure. ' +
        'Fix: add "cd src/dashboard && npm ci" step to .github/workflows/ci.yml before test matrix.',
      model: 'sonnet',
      effort: 'low',
      priority: 'HIGH',
      reason: 'CI pipeline fix',
      scope: {
        directories: ['.github/workflows/'],
        filesRead: [],
        filesWrite: ['.github/workflows/ci.yml'],
      },
      dependencies: [],
      goNogo: {
        goCriteria: 'CI workflow passes with dashboard deps installed',
        noGoCriteria: 'Dashboard typecheck fails in CI',
        techDebtAcceptable: 'No',
      },
      status: TaskStatus.EXECUTING,
      sprintId: 'sprint-181',
      assignedAgent: 'devops-engineer',
      assignedSkills: ['devops-engineer', 'ci-testing'],
    };

    const ctx181_001: SprintContext = {
      agentId: 'devops-engineer',
      agentPrompt: DEVOPS_AGENT_PROMPT,
      skillPrompts: [
        { name: 'devops-engineer', content: LONG_CI_SKILL_CONTENT },
        { name: 'ci-testing', content: LONG_CI_SKILL_CONTENT },
      ],
      allAdrs: SPRINT_181_ADRS,
      effort: 'low',
    };

    // Act
    const { prompt, metadata } = buildTaskPrompt(task181_001, ctx181_001);

    // ── (b) PQ-2/3: No truncation markers ───────────────────────────────
    // Pre-PQ-2: skill content was clipped via truncateAtParagraph() at EFFORT_TOKEN_MAP.low * 2.67 chars
    // Pre-PQ-3: ADR section was hard-capped at ADR_SECTION_MAX = 6000 chars with marker
    expect(prompt).not.toContain('(content truncated)');
    expect(prompt).not.toContain('(ADR content truncated for prompt size)');
    expect(prompt).not.toContain('content truncated');

    // ── (c) Agent block from PROMPT.md ──────────────────────────────────
    // The agentPrompt (simulating PROMPT.md) must appear in the rendered prompt.
    // Pre-fix: some code paths concatenated systemPrompt + PROMPT.md.
    // Post-fix (PQ-4 goal): PROMPT.md is the sole source; systemPrompt excluded.
    // Current state: agentPrompt is injected directly — sentinel at end must be present.
    expect(prompt).toContain('=== Agent: devops-engineer ===');
    expect(prompt).toContain('DEVOPS_PROMPT_SENTINEL_END');

    // ── (d) Full skill content — PQ-2 ───────────────────────────────────
    // The tail marker of LONG_CI_SKILL_CONTENT must appear verbatim in prompt.
    // Before PQ-2 (effort=low, ~1000 tokens max per skill), the tail section
    // starting with "CI_SKILL_LONG_CONTENT_TAIL_MARKER_PQ2_VERIFICATION" would
    // have been cut by truncateAtParagraph().
    expect(prompt).toContain('CI_SKILL_LONG_CONTENT_TAIL_MARKER_PQ2_VERIFICATION');

    // ── (f) filesWrite explicit in scope block ───────────────────────────
    // Scope block must list the task's filesWrite entries explicitly.
    expect(prompt).toContain('.github/workflows/ci.yml');

    // ── Metadata sanity ──────────────────────────────────────────────────
    expect(metadata.agent).toBe('devops-engineer');
    expect(metadata.skills).toContain('devops-engineer');
    expect(metadata.skills).toContain('ci-testing');
    expect(metadata.charCount).toBeGreaterThan(1000);

    // ── PQ-1 current state (pending fix) ────────────────────────────────
    // When PQ-1 (182-007) is applied, ${IDEMPOTENCY_KEY} literal should be
    // replaced with a deterministic key of format `${sprintId}-${taskId}-${retryCount}`.
    // Current state: literal placeholder still present (PQ-1 returned NO_GO).
    // Assertion to enable once PQ-1 lands:
    //   expect(prompt).not.toContain('${IDEMPOTENCY_KEY}');
    //   expect(prompt).toContain('sprint-181-181-001-0'); // sprintId-taskId-retryCount=0
  });

  // ─── Test 2: Sprint 181-002 style — refactorer package.json ────────────

  it('Sprint 181-002 (refactorer package.json): PQ quality assertions pass', () => {
    // Arrange: simulate the Sprint 181-002 task
    const task181_002: Task = {
      id: '181-002',
      title: 'W1-2 — Sync src/dashboard/package.json dependencies',
      description:
        'Sprint 181 root cause: dashboard package-lock.json out of sync with package.json. ' +
        'Refactor: run npm install in src/dashboard, commit updated package-lock.json. ' +
        'Ensure better-sqlite3, react, vite versions match across package.json and lock file. ' +
        'No functional changes — only dependency sync and lock file update.',
      model: 'sonnet',
      effort: 'low',
      priority: 'HIGH',
      reason: 'Dashboard deps sync for CI fix',
      scope: {
        directories: ['src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/dashboard/package.json', 'src/dashboard/package-lock.json'],
      },
      dependencies: [],
      goNogo: {
        goCriteria: 'package-lock.json in sync, npm ci succeeds in CI',
        noGoCriteria: 'npm ci fails or lock file has conflicts',
        techDebtAcceptable: 'No',
      },
      status: TaskStatus.EXECUTING,
      sprintId: 'sprint-181',
      assignedAgent: 'refactorer',
      assignedSkills: ['typescript-expert', 'monorepo-expert'],
    };

    const ctx181_002: SprintContext = {
      agentId: 'refactorer',
      agentPrompt: REFACTORER_AGENT_PROMPT,
      skillPrompts: [
        { name: 'typescript-expert', content: LONG_TS_SKILL_CONTENT },
        { name: 'monorepo-expert', content: LONG_TS_SKILL_CONTENT },
      ],
      allAdrs: SPRINT_181_ADRS,
      effort: 'low',
    };

    // Act
    const { prompt, metadata } = buildTaskPrompt(task181_002, ctx181_002);

    // ── (b) PQ-2/3: No truncation markers ───────────────────────────────
    expect(prompt).not.toContain('(content truncated)');
    expect(prompt).not.toContain('(ADR content truncated for prompt size)');
    expect(prompt).not.toContain('content truncated');

    // ── (c) Agent block from PROMPT.md ──────────────────────────────────
    expect(prompt).toContain('=== Agent: refactorer ===');
    expect(prompt).toContain('REFACTORER_PROMPT_SENTINEL_END');

    // ── (d) Full skill content — PQ-2 ───────────────────────────────────
    // Tail marker must be present; pre-PQ-2 it would have been truncated.
    expect(prompt).toContain('TS_SKILL_LONG_CONTENT_TAIL_MARKER_PQ2_VERIFICATION');

    // ── (f) filesWrite explicit in scope block ───────────────────────────
    expect(prompt).toContain('src/dashboard/package.json');
    expect(prompt).toContain('src/dashboard/package-lock.json');

    // ── Metadata sanity ──────────────────────────────────────────────────
    expect(metadata.agent).toBe('refactorer');
    expect(metadata.skills).toContain('typescript-expert');
    expect(metadata.charCount).toBeGreaterThan(1000);

    // ── ADR selection sanity (current state, pre-PQ-5) ──────────────────
    // Post-PQ-5 (minScore=0.3): only ADRs with score >= 0.3 would appear.
    // Current (no threshold): up to 3 ADRs with score > 0.
    // The current code selects based on relevance; with dashboard scope
    // the dashboard-related ADRs (adr-001, adr-002) may score highest.
    expect(metadata.adrIds.length).toBeGreaterThanOrEqual(0);
    expect(metadata.adrIds.length).toBeLessThanOrEqual(3); // topN cap
  });
});
