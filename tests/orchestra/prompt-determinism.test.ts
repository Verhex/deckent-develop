import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '273-007',
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
    sprintId: 'sprint-273',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

/**
 * Create an ADR fixture with a fixed sprint_num for deterministic age-penalty scoring.
 * created_at/updated_at are fixed ISO strings so they are stable across calls.
 */
function makeAdr(id: string, title: string, content: string, sprintNum: number): MemoryEntryV2 {
  return {
    id,
    title,
    content,
    type: 'adr',
    status: 'accepted',
    sprint_id: `sprint-${sprintNum}`,
    sprint_num: sprintNum,
    tags: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
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
    // ADRs with distinct scores for the default makeTask() (src/core/ scope, intent=core-dev):
    //   adr-015 ≈ 1.025 (scope-path+keyword+intent+preset; sprint 44 → age capped)
    //   adr-001 ≈ 0.800 (scope-path+intent+preset; sprint 1 → age capped)
    //   adr-008 ≈ 0.400 (intent+preset only; sprint 72 → age capped)
    //   adr-029 ≈ 0.195 (keyword 'generation'; sprint 131 → small age penalty)
    //   adr-003 ≈ 0.125 (keyword 'test'; sprint 1 → age capped)
    // All five are distinct, so top-3 is [adr-015, adr-001, adr-008] regardless of input order.
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

// ─── Determinism Guard Tests ───────────────────────────────────────────

describe('prompt-determinism', () => {
  // Test 1: Idempotency — same task+ctx → byte-for-byte identical output on two calls.
  // Catches: new Date() / Math.random() / UUID syzması into the rendered prompt.
  it('same task+ctx produces byte-for-byte identical prompt on repeated calls', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const r1 = buildTaskPrompt(task, ctx);
    const r2 = buildTaskPrompt(task, ctx);
    expect(r1.prompt).toBe(r2.prompt);
  });

  // Test 2: ADR order independence — same ADR pool in different input order → same render.
  // Verifies selectRelevantAdrs score-sorting is deterministic (no tie-breaking by input position).
  // The five ADRs in makeCtx() have deliberately distinct scores for src/core/ scope so the
  // top-3 selection ([adr-015, adr-001, adr-008]) is always the same regardless of array order.
  it('ADR list in different input order renders identical prompt', () => {
    const task = makeTask();
    const adrs = makeCtx().allAdrs!;
    const adrsReversed = [...adrs].reverse();

    const ctx1 = makeCtx({ allAdrs: adrs });
    const ctx2 = makeCtx({ allAdrs: adrsReversed });

    expect(buildTaskPrompt(task, ctx1).prompt).toBe(buildTaskPrompt(task, ctx2).prompt);
  });

  // Test 3: Skill set idempotency — two equal-content (different-instance) skill arrays → same render.
  // Guards against non-determinism in buildSkillBlock (e.g., object-identity or internal state).
  it('equal skill content in separate array instances renders identical prompt', () => {
    const task = makeTask();
    const skills1 = [
      { name: 'typescript-expert', content: '# TypeScript Expert\nStrict mode.' },
      { name: 'testing-expert', content: '# Testing Expert\nUse vitest.' },
    ];
    const skills2 = [
      { name: 'typescript-expert', content: '# TypeScript Expert\nStrict mode.' },
      { name: 'testing-expert', content: '# Testing Expert\nUse vitest.' },
    ];
    const ctx1 = makeCtx({ skillPrompts: skills1 });
    const ctx2 = makeCtx({ skillPrompts: skills2 });
    expect(buildTaskPrompt(task, ctx1).prompt).toBe(buildTaskPrompt(task, ctx2).prompt);
  });

  // Test 4: Block order contract — Skills block BEFORE Agent block (Task 273-008 regression lock).
  // If someone reverts the renderTemplate ordering, this test fails immediately.
  it('Skills block appears before Agent block in rendered prompt', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const { prompt } = buildTaskPrompt(task, ctx);

    const skillsIdx = prompt.indexOf('=== Skills ===');
    const agentIdx = prompt.indexOf('=== Agent:');

    expect(skillsIdx).toBeGreaterThan(-1);
    expect(agentIdx).toBeGreaterThan(-1);
    expect(skillsIdx).toBeLessThan(agentIdx);
  });

  // Test 5: No ISO-8601 timestamp in rendered prompt.
  // Catches: accidental new Date().toISOString() injection into the template that would
  // make the prompt non-deterministic and break worker prompt cache-prefix stability.
  it('rendered prompt contains no ISO-8601 timestamp pattern', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const { prompt } = buildTaskPrompt(task, ctx);
    // Matches YYYY-MM-DDTHH:MM — the characteristic signature of an ISO timestamp
    const isoTimestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    expect(isoTimestampPattern.test(prompt)).toBe(false);
  });
});
