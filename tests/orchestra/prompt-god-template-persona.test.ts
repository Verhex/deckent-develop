import { describe, it, expect } from 'vitest';
import { buildTaskPrompt, buildTaskPromptSegmented } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '443-003',
    title: 'Test task',
    description: 'A test task for persona guidance rendering',
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
    sprintId: 'sprint-443',
    assignedAgent: 'bug-fixer',
    assignedSkills: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'bug-fixer',
    agentPrompt: '# Bug Fixer Agent\nYou are a bug-fixing specialist.',
    effort: 'high',
    ...overrides,
  };
}

const MARKED_PROMPT = [
  '# Bug Fixer Agent',
  '',
  '<!-- guidance:bugfix-start -->',
  'Reproduce first. Write a failing test before touching the fix.',
  '<!-- guidance:bugfix-end -->',
  '',
  '<!-- guidance:default-start -->',
  'General-purpose guidance for any intent.',
  '<!-- guidance:default-end -->',
  '',
  '## Full body continues here',
  'Deep-dive section that only belongs in the full persona render.',
].join('\n');

const UNMARKED_PROMPT = '# Bug Fixer Agent\nJust a plain prompt body, no guidance markers at all.';

function withIntent(primary?: string): Task['routingMeta'] {
  return primary ? { taskDNA: { intent: { primary } } } : undefined;
}

function personaSegment(task: Task, ctx: SprintContext) {
  const { segments } = buildTaskPromptSegmented(task, ctx);
  const seg = segments.find(s => s.kind === 'persona');
  if (!seg) throw new Error('expected a persona segment to be present');
  return seg;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('buildAgentBlock persona render modes (U4 443-003)', () => {
  it('full mode (default) renders the CORE body — guidance blocks never duplicate into the transport (F1)', () => {
    // F1 (sprint-443 blast-radius fix): guidance slices are distilled COPIES of the
    // body; rendering the raw marker-carrying file in full mode duplicated them into
    // every prompt (+2-3.5KB) while the flag default was still 'full'. Full mode now
    // ships personaCoreBody + an appendix pointer (ADR-G-027: access never reduced).
    const task = makeTask({ routingMeta: withIntent('bugfix') });
    const ctx = makeCtx({ agentPrompt: MARKED_PROMPT });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('=== Agent: bug-fixer ===\n# Bug Fixer Agent\n\n## Full body continues here');
    expect(prompt).toContain('Deep-dive section that only belongs in the full persona render.');
    expect(prompt).not.toContain('Reproduce first.');
    expect(prompt).not.toContain('guidance:bugfix-start');
    expect(prompt).toContain('[full persona: .deckent/agents/bug-fixer/PROMPT.md — read it if you need the guidance appendix]');
  });

  it('full mode with a MARKER-FREE prompt stays byte-identical to the legacy shape (no pointer)', () => {
    const task = makeTask({ routingMeta: withIntent('bugfix') });
    const ctx = makeCtx({ agentPrompt: UNMARKED_PROMPT });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain(`=== Agent: bug-fixer ===\n${UNMARKED_PROMPT}`);
    expect(prompt).not.toContain('[full persona:');
  });

  it("mode 'full' explicitly set renders identically to the omitted-mode default", () => {
    const task = makeTask({ routingMeta: withIntent('bugfix') });
    const ctxDefault = makeCtx({ agentPrompt: MARKED_PROMPT });
    const ctxExplicitFull = makeCtx({ agentPrompt: MARKED_PROMPT, personaRenderMode: 'full' });

    expect(buildTaskPrompt(task, ctxExplicitFull).prompt).toBe(buildTaskPrompt(task, ctxDefault).prompt);
  });

  it('guidance mode with a matching intent renders the slice + pointer and omits the full body', () => {
    const task = makeTask({ routingMeta: withIntent('bugfix') });
    const ctx = makeCtx({ agentPrompt: MARKED_PROMPT, personaRenderMode: 'guidance' });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('=== Agent: bug-fixer ===');
    expect(prompt).toContain('Reproduce first. Write a failing test before touching the fix.');
    expect(prompt).toContain('[full persona: .deckent/agents/bug-fixer/PROMPT.md — read it if this slice is not enough]');
    expect(prompt).not.toContain('Deep-dive section that only belongs in the full persona render.');
    expect(prompt).not.toContain('General-purpose guidance for any intent.');
  });

  it('guidance mode consumes the persona slice selected by Routing Engine V3', () => {
    const task = makeTask({
      routingMeta: {
        routingVersion: 'v3',
        workType: 'repair',
        personaSlices: ['bugfix', 'default'],
      },
    });
    const ctx = makeCtx({ agentPrompt: MARKED_PROMPT, personaRenderMode: 'guidance' });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('Reproduce first. Write a failing test before touching the fix.');
    expect(prompt).not.toContain('General-purpose guidance for any intent.');
    expect(prompt).not.toContain('Deep-dive section that only belongs in the full persona render.');
  });

  it('guidance mode falls back to the default slice when the intent has no dedicated section', () => {
    const task = makeTask({ routingMeta: withIntent('security') });
    const ctx = makeCtx({ agentPrompt: MARKED_PROMPT, personaRenderMode: 'guidance' });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('General-purpose guidance for any intent.');
    expect(prompt).toContain('[full persona: .deckent/agents/bug-fixer/PROMPT.md — read it if this slice is not enough]');
    expect(prompt).not.toContain('Deep-dive section that only belongs in the full persona render.');
    expect(prompt).not.toContain('Reproduce first.');
  });

  it('guidance mode falls back to the FULL body when the agent PROMPT.md carries no guidance markers at all', () => {
    const task = makeTask({ routingMeta: withIntent('bugfix') });
    const ctxGuidance = makeCtx({ agentPrompt: UNMARKED_PROMPT, personaRenderMode: 'guidance' });
    const ctxFull = makeCtx({ agentPrompt: UNMARKED_PROMPT });

    const guidanceResult = buildTaskPrompt(task, ctxGuidance).prompt;
    const fullResult = buildTaskPrompt(task, ctxFull).prompt;

    expect(guidanceResult).toBe(fullResult);
    expect(guidanceResult).not.toContain('[full persona:');
  });

  it('segment tier/kind classification is unchanged across full and guidance modes', () => {
    const task = makeTask({ routingMeta: withIntent('bugfix') });

    const fullSeg = personaSegment(task, makeCtx({ agentPrompt: MARKED_PROMPT }));
    expect(fullSeg.tier).toBe('T1');
    expect(fullSeg.kind).toBe('persona');

    const guidanceSeg = personaSegment(task, makeCtx({ agentPrompt: MARKED_PROMPT, personaRenderMode: 'guidance' }));
    expect(guidanceSeg.tier).toBe('T1');
    expect(guidanceSeg.kind).toBe('persona');
  });

  it('is deterministic per (agent, intent) — repeated composes with the same inputs render identical content', () => {
    const task = makeTask({ routingMeta: withIntent('bugfix') });
    const ctx = makeCtx({ agentPrompt: MARKED_PROMPT, personaRenderMode: 'guidance' });

    const first = buildTaskPrompt(task, ctx).prompt;
    const second = buildTaskPrompt(task, ctx).prompt;
    expect(first).toBe(second);
  });
});
