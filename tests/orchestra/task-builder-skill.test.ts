import { describe, it, expect } from 'vitest';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '030-001',
    title: 'Test Task',
    description: 'A test task description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing purposes',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-030',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── buildWorkerPrompt — skillPrompts injection ─────────────────────────────

describe('buildWorkerPrompt — skillPrompts parameter', () => {
  it('includes skill section when skillPrompts are provided', () => {
    const task = makeTask();
    const skillPrompts = [
      { name: 'typescript-expert', content: 'You are a TypeScript expert. Enforce strict types.' },
    ];
    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);
    expect(prompt).toContain('=== Skills ===');
    expect(prompt).toContain('--- typescript-expert ---');
    expect(prompt).toContain('You are a TypeScript expert. Enforce strict types.');
  });

  it('does not include skill section when skillPrompts is undefined', () => {
    const task = makeTask();
    const prompt = buildWorkerPrompt(task);
    expect(prompt).not.toContain('=== Skills ===');
  });

  it('does not include skill section when skillPrompts is empty array', () => {
    const task = makeTask();
    const prompt = buildWorkerPrompt(task, undefined, []);
    expect(prompt).not.toContain('=== Skills ===');
  });

  it('includes multiple skills in section', () => {
    const task = makeTask();
    const skillPrompts = [
      { name: 'typescript-expert', content: 'TS rules' },
      { name: 'security-specialist', content: 'Security rules' },
    ];
    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);
    expect(prompt).toContain('--- typescript-expert ---');
    expect(prompt).toContain('TS rules');
    expect(prompt).toContain('--- security-specialist ---');
    expect(prompt).toContain('Security rules');
  });

  it('injects individual skill content in full (Sprint 182 PQ-2 F2: no per-item cap)', () => {
    const task = makeTask();
    const longContent = 'X'.repeat(3000);
    const skillPrompts = [{ name: 'verbose-skill', content: longContent }];
    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);
    expect(prompt).toContain(longContent);
    const skillSection = prompt.split('--- verbose-skill ---')[1]?.split('\n=== ')[0] ?? '';
    const xCount = (skillSection.match(/X/g) || []).length;
    expect(xCount).toBe(3000);
  });

  it('injects every skill without total-section cap (Sprint 182 PQ-2 F2)', () => {
    const task = makeTask();
    const content = 'A'.repeat(1400);
    const skillPrompts = [
      { name: 'skill-1', content },
      { name: 'skill-2', content },
      { name: 'skill-3', content },
      { name: 'skill-4', content },
    ];
    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);
    // All four skills must survive (previously skill-4 was dropped by the 4K cap).
    for (const sp of skillPrompts) {
      expect(prompt).toContain(`--- ${sp.name} ---`);
      expect(prompt).toContain(sp.content);
    }
  });

  it('skill section appears before main task content', () => {
    const task = makeTask();
    const skillPrompts = [{ name: 'test-skill', content: 'Skill content here' }];
    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);
    const skillIdx = prompt.indexOf('=== Skills ===');
    const workerIdx = prompt.indexOf('You are a Deckent worker agent');
    expect(skillIdx).toBeLessThan(workerIdx);
  });

  it('skill section appears after agent section when both present', () => {
    const task = makeTask({ assignedAgent: 'my-agent' });
    const skillPrompts = [{ name: 'test-skill', content: 'Skill content' }];
    const prompt = buildWorkerPrompt(task, 'Agent instructions', skillPrompts);
    const agentIdx = prompt.indexOf('=== Agent:');
    const skillIdx = prompt.indexOf('=== Skills ===');
    const workerIdx = prompt.indexOf('You are a Deckent worker agent');
    expect(agentIdx).toBeLessThan(skillIdx);
    expect(skillIdx).toBeLessThan(workerIdx);
  });

  it('standard prompt unchanged when no agent and no skills', () => {
    const task = makeTask({ id: '030-010' });
    const withoutBoth = buildWorkerPrompt(task);
    const withEmptySkills = buildWorkerPrompt(task, undefined, []);
    expect(withoutBoth).toBe(withEmptySkills);
  });

  it('handles skill content with special characters', () => {
    const task = makeTask();
    const skillPrompts = [{ name: 'regex-skill', content: 'Pattern: /[a-z]+/g and $1 $2' }];
    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);
    expect(prompt).toContain('Pattern: /[a-z]+/g and $1 $2');
  });

  it('handles skill content with newlines', () => {
    const task = makeTask();
    const skillPrompts = [{ name: 'multiline-skill', content: 'Rule 1\nRule 2\nRule 3' }];
    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);
    expect(prompt).toContain('Rule 1');
    expect(prompt).toContain('Rule 3');
  });

  it('drops skills that would exceed total section cap', () => {
    const task = makeTask();
    // Each skill entry: "--- name ---\n" + 1500 chars ~= 1520 chars
    // 4000 / 1520 ~= 2.6 skills, so 3rd skill may not fit
    const skillPrompts = [
      { name: 'skill-a', content: 'B'.repeat(1500) },
      { name: 'skill-b', content: 'C'.repeat(1500) },
      { name: 'skill-c', content: 'D'.repeat(1500) },
    ];
    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);
    // At minimum first two should be there
    expect(prompt).toContain('--- skill-a ---');
    expect(prompt).toContain('--- skill-b ---');
  });
});
