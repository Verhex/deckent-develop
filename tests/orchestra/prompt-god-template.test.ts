import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '146-005',
    title: 'Test task',
    description: 'A test task for prompt generation',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: ['src/core/config.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-146',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

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

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect Agent\nYou are a system architect.',
    skillPrompts: [
      { name: 'typescript-expert', content: '# TypeScript Expert\nUse strict mode.' },
    ],
    allAdrs: [
      makeAdr('adr-001', 'TypeScript + ESM', 'TypeScript + ESM standard for core development.', 1),
      makeAdr('adr-008', 'Brain Merkezi Import', 'Brain central import pattern for orchestra modules.', 72),
      makeAdr('adr-015', 'TaskRouter Module', 'TaskRouter 6-level routing for task-to-provider assignment.', 44),
      makeAdr('adr-003', 'vitest over Jest', 'vitest chosen as test framework for speed and ESM compat.', 1),
      makeAdr('adr-029', 'Managed-Docs', 'Managed-Docs Universalization for sprint document generation.', 131),
    ],
    effort: 'high',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('buildTaskPrompt', () => {
  // Test 1: Core dev task selects correct agent + ADR
  it('should select correct agent for core-dev task', () => {
    const task = makeTask({
      title: 'Config validation engine',
      description: 'Build a config validation engine in src/core/',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config-validator.ts'] },
    });
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.agent).toBe('architect');
    // Core dev tasks should pick core-related ADRs
    expect(result.metadata.adrIds.length).toBeGreaterThan(0);
    expect(result.metadata.adrIds.length).toBeLessThanOrEqual(3);
  });

  // Test 2: Documentation task
  it('should handle documentation task correctly', () => {
    const task = makeTask({
      title: 'Update README documentation',
      description: 'Update project README with new API docs',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/README.md'] },
      assignedAgent: 'doc-writer',
    });
    const ctx = makeCtx({
      agentId: 'doc-writer',
      agentPrompt: '# Doc Writer\nYou write documentation.',
      allAdrs: [
        makeAdr('adr-029', 'Managed-Docs', 'Documentation template system.', 131),
        makeAdr('adr-030', 'Template Engine', 'Template engine for docs rendering pipeline.', 131),
        makeAdr('adr-032', 'i18n Pattern', 'i18n for TR/EN content diversity.', 131),
        makeAdr('adr-001', 'TypeScript + ESM', 'TypeScript + ESM standard.', 1),
      ],
    });
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.agent).toBe('doc-writer');
    expect(result.prompt).toContain('Doc Writer');
  });

  // Test 3: Test task
  it('should handle test task correctly', () => {
    const task = makeTask({
      title: 'Add unit tests for memory store',
      description: 'Write unit tests for memory store CRUD operations',
      scope: { directories: ['tests/core/'], filesRead: [], filesWrite: ['tests/core/memory-store.test.ts'] },
      assignedAgent: 'test-writer',
    });
    const ctx = makeCtx({
      agentId: 'test-writer',
      agentPrompt: '# Test Writer\nYou write tests.',
      skillPrompts: [{ name: 'testing-expert', content: '# Testing Expert\nUse vitest.' }],
    });
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.agent).toBe('test-writer');
    expect(result.metadata.skills).toContain('testing-expert');
  });

  // Test 4: charCount < 30000
  it('should produce prompt with charCount < 30000', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.charCount).toBeLessThan(30000);
    expect(result.metadata.charCount).toBe(result.prompt.length);
  });

  // Test 5: estimatedTokens < 25000
  it('should produce prompt with estimatedTokens < 25000', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.estimatedTokens).toBeLessThan(25000);
    expect(result.metadata.estimatedTokens).toBeGreaterThan(0);
  });

  // Test 6: ADR renders in full regardless of content length
  // Sprint 182 PQ-2 (F3): summary-mode threshold and ADR_SECTION_MAX cap removed.
  // ADR content is now injected verbatim per `feedback_prompt_completeness_over_brevity`.
  it('should render ADR content in full even when > 3000 chars (F3, Sprint 182)', () => {
    // Create a long ADR with realistic multi-line content
    const longLines = Array.from({ length: 200 }, (_, i) =>
      `Line ${i + 1}: This is a detailed architecture decision about TypeScript ESM configuration and module resolution.`,
    ).join('\n');
    const longContent = `**Context:** TypeScript ESM configuration.\n\n**Decision:** Use ESM.\n\n${longLines}`;
    expect(longContent.length).toBeGreaterThan(3000);

    const task = makeTask();
    const ctx = makeCtx({
      allAdrs: [
        makeAdr('adr-001', 'TypeScript + ESM', longContent, 1),
        makeAdr('adr-008', 'Brain Merkezi Import', 'Short content about brain import.', 72),
      ],
    });
    const result = buildTaskPrompt(task, ctx);

    // Full mode is now mandatory — tail of the long ADR must survive
    expect(result.prompt).toContain('Line 200:');
    expect(result.prompt).not.toContain('(ADR content truncated for prompt size)');
    // ADR IDs are still in metadata
    expect(result.metadata.adrIds.length).toBeGreaterThan(0);
  });

  // Test 7: Empty filler headers are skipped
  it('should skip empty filler headers', () => {
    const task = makeTask();
    // No agent prompt, no skills, no ADRs
    const ctx: SprintContext = {
      effort: 'medium',
    };
    const result = buildTaskPrompt(task, ctx);

    // Should NOT contain agent or skill headers
    expect(result.prompt).not.toContain('=== Agent:');
    expect(result.prompt).not.toContain('=== Skills ===');
    expect(result.prompt).not.toContain('=== Mandatory Architecture');
  });

  // Test 8: Agent prompt is NOT truncated
  it('should include full agent prompt without truncation', () => {
    const longAgentPrompt = Array.from({ length: 100 }, (_, i) =>
      `Line ${i + 1}: This is a detailed instruction for the architect agent.`,
    ).join('\n');

    const task = makeTask();
    const ctx = makeCtx({ agentPrompt: longAgentPrompt });
    const result = buildTaskPrompt(task, ctx);

    // Full agent prompt should be in the output
    expect(result.prompt).toContain('Line 100:');
    expect(result.prompt).toContain(longAgentPrompt);
  });

  // Test 9: Skill prompts are injected in order
  it('should inject skill prompts in order', () => {
    const task = makeTask();
    const ctx = makeCtx({
      skillPrompts: [
        { name: 'typescript-expert', content: '# TypeScript Expert\nStrict mode required.' },
        { name: 'testing-expert', content: '# Testing Expert\nUse vitest framework.' },
      ],
    });
    const result = buildTaskPrompt(task, ctx);

    const tsIdx = result.prompt.indexOf('--- typescript-expert ---');
    const testIdx = result.prompt.indexOf('--- testing-expert ---');

    expect(tsIdx).toBeGreaterThan(-1);
    expect(testIdx).toBeGreaterThan(-1);
    expect(tsIdx).toBeLessThan(testIdx);
    expect(result.metadata.skills).toEqual(['typescript-expert', 'testing-expert']);
  });

  // Test 10: Scope warnings are visible in metadata
  it('should include scope warnings in metadata', () => {
    const task = makeTask({
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/config.ts', '/etc/passwd', '../secret.txt'],
      },
    });
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    // Rejected paths should appear in warnings
    expect(result.metadata.scopeWarnings.length).toBeGreaterThan(0);
    expect(result.metadata.scopeWarnings.some(w => w.includes('/etc/passwd'))).toBe(true);
  });

  // Test 11: ADR topN=3 limit
  it('should limit ADRs to top 3', () => {
    const task = makeTask({
      title: 'Full stack feature',
      description: 'A task touching everything: config, routing, CLI, MCP, docs, tests, security',
      scope: {
        directories: ['src/core/', 'src/orchestra/', 'src/cli/', 'src/mcp/', 'docs/', 'tests/'],
        filesRead: [],
        filesWrite: ['src/core/types.ts', 'src/orchestra/brain.ts', 'src/cli/entry.ts'],
      },
    });
    const ctx = makeCtx({
      allAdrs: [
        makeAdr('adr-001', 'TypeScript + ESM', 'TS ESM standard.', 1),
        makeAdr('adr-002', 'Node16 Resolution', 'Node16 module resolution.', 1),
        makeAdr('adr-003', 'vitest', 'vitest over Jest.', 1),
        makeAdr('adr-008', 'Brain Import', 'Brain central import.', 72),
        makeAdr('adr-010', 'Commander.js', 'Tek runtime dependency.', 44),
        makeAdr('adr-015', 'TaskRouter', 'TaskRouter 6-level routing.', 44),
      ],
    });
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.adrIds.length).toBeLessThanOrEqual(3);
  });

  // Test 12: Dependencies info present in prompt when task has deps
  it('should include dependencies info in prompt', () => {
    const task = makeTask({
      dependencies: ['146-002', '146-003'],
    });
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.prompt).toContain('146-002');
    expect(result.prompt).toContain('146-003');
    expect(result.prompt).toContain('Dependencies');
  });

  // Test 13: Rubric spec NOT in prompt (Task 10 — worker self-report removed)
  it('should NOT contain rubric spec in prompt', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    // Rubric scoring section should not be present (rubric spec removed from prompt)
    expect(result.prompt).not.toMatch(/## Rubric\b/i);
    expect(result.prompt).not.toContain('rubricSpec');
    // rubricScores was removed from prompt template (Sprint 148 cleanup)
    expect(result.prompt).not.toContain('rubricScores');
  });

  // Test 14: Token usage spec present
  it('should include token usage specification', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.prompt).toContain('tokenUsage');
    expect(result.prompt).toContain('inputTokens');
    expect(result.prompt).toContain('outputTokens');
    expect(result.prompt).toContain('cacheReadTokens');
  });

  // Test 15: self-assessment authority block present (merged Result + honesty)
  it('should include the result & self-assessment block', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.prompt).toContain('## Result & Self-Assessment');
    expect(result.prompt).toContain('GO_WITH_TECH_DEBT');
    expect(result.prompt).toContain('"Code written" ≠ "DONE"');
  });
});
