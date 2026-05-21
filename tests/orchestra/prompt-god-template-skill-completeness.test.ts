import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '182-008',
    title: 'Skill completeness test',
    description: 'Verify that assigned skill content is injected verbatim with no truncation',
    model: 'sonnet',
    effort: 'low',
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
    sprintId: 'sprint-182',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

/**
 * Build a deterministic skill body of at least `minChars` characters.
 * Uses numbered lines so we can probe head/tail/middle in assertions.
 */
function makeSkillContent(name: string, minChars: number): string {
  const header = `# ${name}\n\n`;
  const body: string[] = [];
  let i = 1;
  while ((header + body.join('\n')).length < minChars) {
    body.push(`Line ${i}: This is a detailed instruction paragraph for the ${name} skill domain.`);
    i++;
  }
  return header + body.join('\n');
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect Agent\nYou design systems.',
    skillPrompts: [],
    allAdrs: [],
    effort: 'low',
    ...overrides,
  };
}

// ─── Tests (Sprint 182 PQ-2 — F2) ──────────────────────────────────────

describe('buildTaskPrompt — skill completeness (F2, Sprint 182 PQ-2)', () => {
  // T1: 3 skills, each 5000+ chars, effort='low' → all 3 inject fully
  it('injects 3 skills × 5000+ chars in full, even with effort=low', () => {
    const skillA = makeSkillContent('alpha-skill', 5000);
    const skillB = makeSkillContent('beta-skill', 5000);
    const skillC = makeSkillContent('gamma-skill', 5000);

    expect(skillA.length).toBeGreaterThanOrEqual(5000);
    expect(skillB.length).toBeGreaterThanOrEqual(5000);
    expect(skillC.length).toBeGreaterThanOrEqual(5000);

    const ctx = makeCtx({
      effort: 'low',
      skillPrompts: [
        { name: 'alpha-skill', content: skillA },
        { name: 'beta-skill', content: skillB },
        { name: 'gamma-skill', content: skillC },
      ],
    });
    const result = buildTaskPrompt(makeTask(), ctx);

    expect(result.prompt).toContain(skillA);
    expect(result.prompt).toContain(skillB);
    expect(result.prompt).toContain(skillC);
    expect(result.metadata.skills).toEqual(['alpha-skill', 'beta-skill', 'gamma-skill']);
  });

  // T2: 5000-char skill, effort='low' → tail (last paragraph) is present
  it('preserves the tail of a 5000-char skill (no head-only clipping) at effort=low', () => {
    const content = makeSkillContent('tail-probe-skill', 5000);
    // Compute the last line in the generated body deterministically.
    const lines = content.trim().split('\n');
    const lastLine = lines[lines.length - 1]!;
    expect(lastLine).toMatch(/^Line \d+:/);

    const ctx = makeCtx({
      effort: 'low',
      skillPrompts: [{ name: 'tail-probe-skill', content }],
    });
    const result = buildTaskPrompt(makeTask(), ctx);

    expect(result.prompt).toContain(lastLine);
    expect(result.prompt).toContain(content);
  });

  // T3: 10 skills → all 10 inject (no skip on overflow)
  it('injects every assigned skill when 10 are passed (no skip on overflow)', () => {
    const skills = Array.from({ length: 10 }, (_, i) => ({
      name: `skill-${i + 1}`,
      content: makeSkillContent(`skill-${i + 1}`, 2000),
    }));

    const ctx = makeCtx({
      effort: 'low',
      skillPrompts: skills,
    });
    const result = buildTaskPrompt(makeTask(), ctx);

    for (const sp of skills) {
      expect(result.prompt).toContain(`--- ${sp.name} ---`);
      expect(result.prompt).toContain(sp.content);
    }
    expect(result.metadata.skills).toHaveLength(10);
  });

  // T4: No truncation artifacts present in output (no ellipsis or paragraph clip)
  it('does not introduce truncation artifacts in the skill section', () => {
    const content = makeSkillContent('artifact-probe-skill', 8000);

    const ctx = makeCtx({
      effort: 'low',
      skillPrompts: [{ name: 'artifact-probe-skill', content }],
    });
    const result = buildTaskPrompt(makeTask(), ctx);

    // Locate the skill section bounds.
    const skillHeader = '--- artifact-probe-skill ---';
    const startIdx = result.prompt.indexOf(skillHeader);
    expect(startIdx).toBeGreaterThanOrEqual(0);

    // Slice from start of skill body to end of section (no other --- markers).
    const sliceEnd = result.prompt.indexOf('\n=== ', startIdx + skillHeader.length);
    const skillSlice = result.prompt.slice(
      startIdx,
      sliceEnd === -1 ? undefined : sliceEnd,
    );

    // Behaviour from `truncateAtParagraph`: appends nothing visible, but the
    // skill body would be cut short. Assert the exact original tail survives.
    const lines = content.trim().split('\n');
    const lastLine = lines[lines.length - 1]!;
    expect(skillSlice).toContain(lastLine);

    // No common truncation markers (defensive — previous logic could append
    // "…" or other indicators in future refactors).
    expect(skillSlice).not.toMatch(/\.{3,}\s*$/);
    expect(skillSlice).not.toContain('(truncated)');
    expect(skillSlice).not.toContain('(content truncated');
  });
});
