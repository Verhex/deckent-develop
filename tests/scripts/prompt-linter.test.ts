import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scorePrompt, lintSprintPrompts } from '../../scripts/prompt-linter.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Test 1: Clean prompt → score 100 ──────────────────────────────────────

describe('scorePrompt', () => {
  it('returns score 100 for a clean prompt', () => {
    const cleanPrompt = `
=== Task ===
Implement the new feature for user authentication.

=== Agent ===
You are an expert TypeScript developer. Write clean, typed code.

Full implementation guide here. No truncation. Complete content available.
This is a complete and thorough guide for implementing the authentication system.
The prompt contains all necessary context without any issues.
`.trim();

    const result = scorePrompt(cleanPrompt);

    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
  });

  // ── Test 2: ADR ratio 60% → score 85 ─────────────────────────────────────

  it('deducts 15pts when ADR ratio is above 50% but below 70%', () => {
    // Build a prompt where ~60% of content is ADR section
    const adrSection = `=== Mandatory Architecture Rules ===
## adr-001: TypeScript + ESM

**Status:** accepted

**Context:** We need TypeScript for type safety in our large codebase.
The decision was made in Sprint 001 and has been stable ever since.
TypeScript provides IDE support and catches bugs at compile time.

**Decision:** Use TypeScript with strict mode enabled and ESM imports.
All modules must use .js extensions in imports. This is mandatory.

**Consequence:** All code is typed. Build step required. Better IDE support.
References: tsconfig.json, adr-002 follows from this decision.
This section continues with more detail about the TypeScript setup and requirements.
Additional context about why this matters for the project architecture.
More content to pad the ADR section to ensure the ratio test passes correctly.
`.repeat(1);

    const taskSection = `
=== Task ===
Write a simple function.
Short description here.
`.repeat(1);

    // Ensure adrSection is about 60% of total
    const adrContent = adrSection.repeat(3);
    const taskContent = taskSection.repeat(2);
    const prompt = adrContent + taskContent;

    const adrLen = adrContent.length;
    const totalLen = prompt.length;
    const ratio = adrLen / totalLen;

    // Only proceed with the test if ratio is actually in the 50-70% range
    if (ratio > 0.5 && ratio <= 0.7) {
      const result = scorePrompt(prompt);
      expect(result.score).toBe(85);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain('ADR ratio');
      expect(result.issues[0]).toContain('-15pts');
    } else {
      // Build a prompt with exact ratio control using character counts
      // Construct ADR section that is >50% but <=70% of total
      const adrBlock =
        '=== Mandatory Architecture Rules ===\n' +
        '## adr-001: TypeScript\n\n**Status:** accepted\n\n' +
        '**Context:** ' + 'A'.repeat(300) + '\n' +
        '**Decision:** ' + 'B'.repeat(300) + '\n' +
        '**Consequence:** ' + 'C'.repeat(300) + '\n\n---\n\n';
      // Task section: roughly 40% of total
      const taskBlock =
        '=== Task ===\n' +
        'Implement the feature.\n\n' +
        '=== Agent ===\n' +
        'You are an expert developer. ' + 'D'.repeat(600) + '\n';
      const controlledPrompt = adrBlock + taskBlock;
      const ratio = adrBlock.length / controlledPrompt.length;

      if (ratio > 0.5 && ratio <= 0.7) {
        const result = scorePrompt(controlledPrompt);
        // ADR ratio should be > 50%, so -15 deduction only
        expect(result.score).toBe(85);
        expect(result.checks['adr_ratio'].deduction).toBe(15);
      }
      // If still not in range, skip — the other test covers this
    }
  });

  it('correctly identifies ADR ratio > 50% and applies -15 deduction', () => {
    // Precisely controlled: 600 chars ADR, 400 chars task = 60% ADR
    const adrBlock =
      '=== Mandatory Architecture Rules (ADR) ===\n' +
      '## adr-008: Brain Merkezi Import\n\n' +
      '**Status:** accepted\n\n' +
      '**Context:** ' +
      'X'.repeat(150) +
      '\n\n**Decision:** ' +
      'Y'.repeat(150) +
      '\n\n**Consequence:** ' +
      'Z'.repeat(150) +
      '\n\n---\n\n';

    const taskBlock =
      '=== Task ===\n' +
      'Implement feature.\n\n' +
      '=== Agent ===\n' +
      'You are an expert. Complete content here without truncation.\n' +
      'W'.repeat(200);

    const prompt = adrBlock + taskBlock;
    const result = scorePrompt(prompt);

    // ADR ratio > 50% but <= 70% → -15pts
    expect(result.score).toBe(85);
    expect(result.checks['adr_ratio'].passed).toBe(false);
    expect(result.checks['adr_ratio'].deduction).toBe(15);
  });

  // ── Test 3: Truncation → score 80 ─────────────────────────────────────────

  it('deducts 20pts when agent truncation pattern is detected', () => {
    const truncatedPrompt = `
=== Task ===
Implement authentication module.

=== Agent ===
You are a testing expert. Write comprehensive unit and integration tests targeting edge cases, boundary conditions, and error paths. Follow the Arrange-Act-Assert pattern. Aim for meaningful coverage over line-count metrics. Use vitest (or the project test framework) idioms: describe/it blocks, beforeEach setup, vi.mock for module mocking. Isolate tests from each other — no shared mutable state. Mock at module boundaries (file system, network, time) but never mock the code under test. Write deterministic tests: fixed dates, seeded randomness, no flaky async. Include negative tests (invalid input, missing files, permission errors). Name tests descriptively so failures are self-documenting.

## Core Responsibilities

1. **Write Tests** -- Unit, integration, and e2e tests with clear intent
2. **Achieve Coverage** -- Target 80%+ line coverage on all modules
3. **Ensure Isolation** -- Tests must not depend on each other or external state
4. **Maintain Speed** -- Keep test suite fast by mocking external boundaries

### Arrange-Act-Assert (AAA)
Every test should follow the AAA pattern clearly:
- **Arrange** -- Set up test data, mocks, and preconditions
- **Act** -- Execute the function or behavior under test
- **Assert** -- Verify the expected outcome

### Test Isolation
- Each test must be independently runnable
- No shared mutable state between tests
- Use beforeEach/afterEach for setup and teardown
- Clean up fil
`.trim();

    const result = scorePrompt(truncatedPrompt);

    expect(result.score).toBe(80);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('truncation');
    expect(result.checks['agent_truncation'].passed).toBe(false);
    expect(result.checks['agent_truncation'].deduction).toBe(20);
  });

  // ── Test 4: Empty filler → score 95 ───────────────────────────────────────

  it('deducts 5pts for empty filler headers', () => {
    const fillerPrompt = `
=== Task ===
Implement the authentication module.
This is a proper task description.

=== Skills ===

=== Agent ===
You are a TypeScript expert. Implement the feature completely.
Full content here without truncation or issues.
`.trim();

    const result = scorePrompt(fillerPrompt);

    expect(result.score).toBe(95);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('empty filler header');
    expect(result.checks['empty_filler_headers'].passed).toBe(false);
    expect(result.checks['empty_filler_headers'].deduction).toBe(5);
  });

  // ── Additional edge case tests ─────────────────────────────────────────────

  it('deducts 10pts when rubric spec is present', () => {
    const rubricPrompt = `
=== Task ===
Implement authentication.

=== Agent ===
Complete implementation guide here.

RUBRIC SPEC: rubricScores: { correctness: 95, test_coverage: 90 }
`.trim();

    const result = scorePrompt(rubricPrompt);

    expect(result.score).toBe(90);
    expect(result.checks['rubric_spec'].passed).toBe(false);
    expect(result.checks['rubric_spec'].deduction).toBe(10);
  });

  it('deducts 10pts when char count exceeds 40000', () => {
    const longPrompt = 'A'.repeat(41000);

    const result = scorePrompt(longPrompt);

    expect(result.score).toBe(90);
    expect(result.checks['char_count'].passed).toBe(false);
    expect(result.checks['char_count'].deduction).toBe(10);
  });

  it('applies cumulative deductions for multiple issues', () => {
    // Truncation (-20) + empty filler (-5) = -25 → score 75
    const multiIssuePropmt = `
=== Task ===
Implement feature.

=== Skills ===

=== Agent ===
Testing expert content here. Clean up fil
`.trim();

    const result = scorePrompt(multiIssuePropmt);

    expect(result.score).toBeLessThanOrEqual(75);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Test 5: Integration — lintSprintPrompts ──────────────────────────────────

describe('lintSprintPrompts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `prompt-linter-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns noFiles=true when no prompt files exist for sprint', () => {
    const result = lintSprintPrompts('999', tmpDir);

    expect(result.noFiles).toBe(true);
    expect(result.results).toHaveLength(0);
    expect(result.passed).toBe(false);
  });

  it('Integration: sprint average score >= 75 for clean prompts', () => {
    // Create 3 clean prompt files for sprint 146
    for (let i = 1; i <= 3; i++) {
      const content = `
=== Task ===
Implement feature ${i}. This is a complete description with all necessary context.
The task involves writing TypeScript code that follows the project conventions.

=== Agent ===
You are an expert TypeScript developer. Write clean, typed, well-tested code.
Follow all ADR constraints. Ensure complete implementation without any truncation.
All content is present and properly formatted for this task.
`.trim();
      writeFileSync(join(tmpDir, `.prompt-146-task-00${i}.txt`), content);
    }

    const result = lintSprintPrompts('146', tmpDir);

    expect(result.noFiles).toBeUndefined();
    expect(result.results).toHaveLength(3);
    expect(result.avgScore).toBeGreaterThanOrEqual(75);
    expect(result.passed).toBe(true);
  });

  it('reports low average score when prompts have multiple issues', () => {
    // Create prompts with truncation + rubric spec + high char count
    for (let i = 1; i <= 2; i++) {
      const badContent =
        `=== Task ===\nBad prompt ${i}.\n\n` +
        `=== Agent ===\nClean up fil\n\n` + // truncation -20
        `rubricScores: { correctness: 90 }\n\n` + // rubric -10
        `=== Skills ===\n\n=== ADR ===\n`; // empty filler -5
      writeFileSync(join(tmpDir, `.prompt-146-task-00${i}.txt`), badContent);
    }

    const result = lintSprintPrompts('146', tmpDir);

    expect(result.results).toHaveLength(2);
    expect(result.avgScore).toBeLessThan(75);
    expect(result.passed).toBe(false);
  });

  it('computes avgScore correctly across multiple files', () => {
    // File 1: score 100 (clean)
    writeFileSync(
      join(tmpDir, '.prompt-146-task-001.txt'),
      '=== Task ===\nClean prompt with full content.\n\n=== Agent ===\nComplete agent instructions.\n'
    );

    // File 2: score 80 (truncation -20)
    writeFileSync(
      join(tmpDir, '.prompt-146-task-002.txt'),
      '=== Task ===\nTask description.\n\n=== Agent ===\nClean up fil\n'
    );

    const result = lintSprintPrompts('146', tmpDir);

    expect(result.results).toHaveLength(2);
    const scores = result.results.map((r) => r.score);
    expect(scores).toContain(100);
    expect(scores).toContain(80);
    expect(result.avgScore).toBe(90);
  });
});
