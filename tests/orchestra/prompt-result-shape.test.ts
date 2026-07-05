// ─── Result-Shape Source Guard (born-484 source-side prevention) ─────────────
// The consumer-side fix (coerceNotesToString / normalizeTaskResultShape,
// src/core/task-result-schema.ts, commit 14f0a244) already tolerates a worker
// that writes `notes` as an array. This test pins the SOURCE-side guard: the
// worker-prompt result-format instructions must explicitly state field shapes
// so a provider CLI (the live codex-CLI incident) is told the correct shape up
// front, instead of guessing and drifting into an array.
//
// Hermetic: pure-function over buildTaskPrompt; no spawn, no network.

import { describe, it, expect } from 'vitest';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '367-003-fixture',
    title: 'Result shape fixture task',
    description: 'A fixture task for result-shape prompt assertions.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/prompt-god-template.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-367',
    assignedAgent: 'architect',
    assignedSkills: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect Agent\nYou are a system architect.',
    skillPrompts: [],
    allAdrs: [],
    effort: 'high',
    ...overrides,
  };
}

describe('worker-prompt result-shape source guard (born-484)', () => {
  it('states notes must be a single string and forbids array/object', () => {
    const prompt = buildTaskPrompt(makeTask(), makeCtx()).prompt;
    expect(prompt).toContain('## Result & Self-Assessment');
    expect(prompt).toMatch(/`notes`.*SINGLE string/);
    expect(prompt).toMatch(/never an array or object/);
    expect(prompt).toContain('\\n');
  });

  it('states selfAssessment is exactly one of the three literal values', () => {
    const prompt = buildTaskPrompt(makeTask(), makeCtx()).prompt;
    expect(prompt).toMatch(/`selfAssessment`.*"DONE".*"GO_WITH_TECH_DEBT".*"NO_GO"/);
    expect(prompt).toMatch(/never an array, never any other value/);
  });

  it('states filesChanged is an array of file-path strings', () => {
    const prompt = buildTaskPrompt(makeTask(), makeCtx()).prompt;
    expect(prompt).toMatch(/`filesChanged`.*array of file-path strings/);
  });

  it('reaches the prompt identically across claude/codex/gemini provider paths', () => {
    const claudePrompt = buildTaskPrompt(makeTask({ provider: 'claude' }), makeCtx()).prompt;
    const codexPrompt = buildTaskPrompt(makeTask({ provider: 'codex' }), makeCtx()).prompt;
    const geminiPrompt = buildTaskPrompt(makeTask({ provider: 'gemini' }), makeCtx()).prompt;

    const guardLine = 'a SINGLE string, never an array or object';
    expect(claudePrompt).toContain(guardLine);
    expect(codexPrompt).toContain(guardLine);
    expect(geminiPrompt).toContain(guardLine);
  });
});
