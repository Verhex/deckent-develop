import { describe, it, expect } from 'vitest';
import { buildWorkerPrompt, truncateAtParagraph } from '../../src/orchestra/task-builder.js';
import { selectSkills } from '../../src/core/skill-selector.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';
import type { SkillDefinition, ProjectStack } from '../../src/core/skill-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '059-003',
    title: 'Test Task',
    description: 'A test task description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-059',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSkill(id: string, overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return createSkillDefinition({ id, name: id, ...overrides });
}

const defaultStack: ProjectStack = {
  language: 'typescript',
  framework: 'vitest',
  dependencies: ['vitest', 'zod'],
  buildTool: 'tsc',
  testFramework: 'vitest',
  detectedAt: new Date().toISOString(),
};

// ─── A) Task-Specific Skill Selection ───────────────────────────────────────

describe('selectSkills — scope directory matching', () => {
  it('boosts test-related skills when scope includes tests/', () => {
    const pool = new Map<string, SkillDefinition>([
      ['testing-expert', makeSkill('testing-expert', { category: 'domain', triggers: ['test', 'vitest'], priority: 1 })],
      ['doc-writer', makeSkill('doc-writer', { category: 'domain', triggers: ['documentation', 'docs'], priority: 1 })],
    ]);
    const task = { title: 'Write unit tests', description: 'Add tests for module', scope: { directories: ['tests/core/'] } };
    const result = selectSkills(task, defaultStack, pool);
    const testScore = result.scores.get('testing-expert') ?? 0;
    const docScore = result.scores.get('doc-writer') ?? 0;
    expect(testScore).toBeGreaterThan(docScore);
  });

  it('boosts api-related skills when scope includes api/', () => {
    const pool = new Map<string, SkillDefinition>([
      ['api-builder', makeSkill('api-builder', { category: 'domain', triggers: ['api', 'rest', 'endpoint'], priority: 1 })],
      ['testing-expert', makeSkill('testing-expert', { category: 'domain', triggers: ['test', 'vitest'], priority: 1 })],
    ]);
    const task = { title: 'Build API endpoint', description: 'REST endpoint', scope: { directories: ['src/api/'] } };
    const result = selectSkills(task, defaultStack, pool);
    const apiScore = result.scores.get('api-builder') ?? 0;
    const testScore = result.scores.get('testing-expert') ?? 0;
    expect(apiScore).toBeGreaterThan(testScore);
  });

  it('boosts doc-related skills when scope includes docs/', () => {
    const pool = new Map<string, SkillDefinition>([
      ['doc-writer', makeSkill('doc-writer', { category: 'domain', triggers: ['documentation', 'docs'], priority: 1 })],
      ['api-builder', makeSkill('api-builder', { category: 'domain', triggers: ['api', 'rest'], priority: 1 })],
    ]);
    const task = { title: 'Update documentation', description: 'Write docs', scope: { directories: ['docs/'] } };
    const result = selectSkills(task, defaultStack, pool);
    const docScore = result.scores.get('doc-writer') ?? 0;
    const apiScore = result.scores.get('api-builder') ?? 0;
    expect(docScore).toBeGreaterThan(apiScore);
  });

  it('does not boost unrelated skills for directory', () => {
    const pool = new Map<string, SkillDefinition>([
      ['security', makeSkill('security', { category: 'domain', triggers: ['security', 'owasp'], priority: 0 })],
    ]);
    const task = { title: 'Add feature', description: 'New feature', scope: { directories: ['src/core/'] } };
    const result = selectSkills(task, null, pool);
    expect(result.scores.get('security')).toBe(0);
  });
});

// ─── B) Skill Truncation Fix ────────────────────────────────────────────────

describe('truncateAtParagraph', () => {
  it('returns content unchanged if within budget', () => {
    expect(truncateAtParagraph('short content', 1500)).toBe('short content');
  });

  it('truncates at paragraph boundary (double newline)', () => {
    const content = 'A'.repeat(30) + '\n\n' + 'B'.repeat(30) + '\n\n' + 'C'.repeat(2000);
    const result = truncateAtParagraph(content, 80);
    // Should cut at the second \n\n (position 62), not mid-C-block
    expect(result).toBe('A'.repeat(30) + '\n\n' + 'B'.repeat(30));
    expect(result.length).toBeLessThanOrEqual(80);
  });

  it('truncates at line boundary when no paragraph break found late enough', () => {
    // Content with only single newlines, no double newline after 50%
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}: ${'X'.repeat(50)}`);
    const content = lines.join('\n');
    const result = truncateAtParagraph(content, 300);
    expect(result.endsWith('X')).toBe(true); // ends at line boundary, not mid-word
    expect(result.length).toBeLessThanOrEqual(300);
  });

  it('does not cut mid-sentence when sentence boundary available', () => {
    const content = 'First sentence here. Second sentence here. Third sentence here. Fourth very long sentence that extends. ' + 'X'.repeat(200);
    const result = truncateAtParagraph(content, 150);
    // Should end at a sentence boundary (period)
    expect(result.endsWith('.')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(150);
  });

  it('falls back to raw slice when no good boundary exists', () => {
    const content = 'X'.repeat(3000); // no boundaries at all
    const result = truncateAtParagraph(content, 1500);
    expect(result.length).toBeLessThanOrEqual(1500);
  });
});

// ─── C) Skill Budget Dynamic ────────────────────────────────────────────────

describe('buildWorkerPrompt — dynamic skill budget', () => {
  it('allows more skill content for high-effort tasks', () => {
    const longContent = 'Paragraph one.\n\n' + 'Y'.repeat(1800) + '\n\nParagraph three.';
    const skillPrompts = [{ name: 'skill-a', content: longContent }];

    const highTask = makeTask({ effort: 'high', forceEffort: 'high' });
    const lowTask = makeTask({ effort: 'low', forceEffort: 'low' });

    const highPrompt = buildWorkerPrompt(highTask, undefined, skillPrompts);
    const lowPrompt = buildWorkerPrompt(lowTask, undefined, skillPrompts);

    const highSkillLen = (highPrompt.split('=== Skills ===')[1]?.split('You are a Deckent')[0] ?? '').length;
    const lowSkillLen = (lowPrompt.split('=== Skills ===')[1]?.split('You are a Deckent')[0] ?? '').length;

    expect(highSkillLen).toBeGreaterThan(lowSkillLen);
  });

  it('truncates at paragraph boundary instead of mid-content', () => {
    const content = 'First paragraph with rules.\n\nSecond paragraph with more rules.\n\n' + 'Z'.repeat(2000);
    const skillPrompts = [{ name: 'test-skill', content }];
    const task = makeTask({ effort: 'low', forceEffort: 'low' });
    const prompt = buildWorkerPrompt(task, undefined, skillPrompts);

    // With low effort (1000 budget), content should be truncated
    // but NOT in the middle of the Z block — should end at a paragraph boundary
    const skillSection = prompt.split('--- test-skill ---')[1]?.split('\n\nYou are a Deckent')[0] ?? '';
    // Should not contain the full Z block
    const zCount = (skillSection.match(/Z/g) || []).length;
    expect(zCount).toBeLessThan(2000);
  });
});
