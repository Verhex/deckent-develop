/**
 * U4-026 — guidance-mode integration e2e (sprint-443 Task-26, cascade-skipped; delivered here)
 *
 * Unlike `tests/orchestra/prompt-god-template-persona.test.ts` (synthetic-persona UNIT coverage
 * of the render-mode switch itself), this suite runs the REAL production compose path —
 * `buildTaskPromptSegmented` / `buildTaskPrompt` (`src/orchestra/prompt-god-template.ts`) — over
 * REAL builtin agent PROMPT.md content read straight off disk, and proves the `.deckent/agents/`
 * shadow-precedence contract through a hermetic tmpdir project fixture. Four assertions
 * (goCriteria "all four e2e assertions green"):
 *   1. devops-intent task + devops-engineer, guidance mode → devops slice + pointer, not the
 *      full body.
 *   2. implementation-intent coordinator-style task (sprint-442 442-003 shape) on refactorer →
 *      NO Docker guidance leaks in.
 *   3. full-mode pin (post-F1 contract): a marker-free persona renders byte-identical; a
 *      marker-carrying persona renders core-body + appendix pointer.
 *   4. shadow-precedence: a `.deckent/agents/<id>` copy in a project SHADOWS the builtin, both
 *      at the `getAgentPrompt` resolution layer and end-to-end through the compose path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildTaskPrompt, buildTaskPromptSegmented } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import { getAgentPrompt } from '../../src/core/agent-pool.js';
import { personaCoreBody } from '../../src/core/persona-guidance.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Real builtin fixtures (read-only — never mutated) ──────────────────────

const REPO_ROOT = process.cwd();
const DEVOPS_ENGINEER_PROMPT_PATH = join(
  REPO_ROOT, 'src', 'core', 'builtins', 'agents', 'devops-engineer', 'PROMPT.md',
);
const REFACTORER_PROMPT_PATH = join(
  REPO_ROOT, 'src', 'core', 'builtins', 'agents', 'refactorer', 'PROMPT.md',
);

// ─── Test helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '444-006-fx',
    title: 'Fixture task',
    description: 'U4-026 integration fixture task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: ['src/fixture.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-444',
    assignedAgent: 'bug-fixer',
    assignedSkills: [],
    ...overrides,
  };
}

function withIntent(primary: string): Task['routingMeta'] {
  return { taskDNA: { intent: { primary } } };
}

let projectRoot: string;

beforeEach(() => {
  projectRoot = join(tmpdir(), `deckent-u4-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  if (existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true });
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('U4-026 guidance-mode integration e2e (real compose path + real builtin personas)', () => {
  it('1. devops-intent task + devops-engineer, guidance mode → devops slice + pointer, NOT the full body', () => {
    const devopsPrompt = readFileSync(DEVOPS_ENGINEER_PROMPT_PATH, 'utf8');
    expect(devopsPrompt).toContain('<!-- guidance:devops-start -->');

    const task = makeTask({ assignedAgent: 'devops-engineer', routingMeta: withIntent('devops') });
    const ctx: SprintContext = {
      agentId: 'devops-engineer',
      agentPrompt: devopsPrompt,
      effort: 'high',
      personaRenderMode: 'guidance',
    };
    const { prompt } = buildTaskPromptSegmented(task, ctx);

    expect(prompt).toContain('=== Agent: devops-engineer ===');
    // devops guidance slice content present
    expect(prompt).toContain('pin action versions by commit SHA');
    expect(prompt).toContain(
      '[full persona: .deckent/agents/devops-engineer/PROMPT.md — read it if this slice is not enough]',
    );
    // full-body-only content (outside the devops marker span) must NOT be rendered
    expect(prompt).not.toContain('FROM node:20-alpine AS builder');
    expect(prompt).not.toContain('Blue-Green Deployment');
    expect(prompt).not.toContain('Canary Deployment');
    // a different intent's slice (security) must not leak into a devops-intent render
    expect(prompt).not.toContain('Rotate secrets on a schedule');
    // raw marker comments never leak into the rendered prompt
    expect(prompt).not.toContain('<!-- guidance:');
  });

  it('2. implementation-intent coordinator-style task (sprint-442 442-003 shape) on refactorer → NO Docker guidance', () => {
    const refactorerPrompt = readFileSync(REFACTORER_PROMPT_PATH, 'utf8');
    expect(refactorerPrompt.toLowerCase()).not.toContain('docker');
    expect(refactorerPrompt).not.toContain('<!-- guidance:implementation-');

    // Real sprint-442 442-003 shape (scripts/measure-prompt-cost.mjs corpus, FIXTURES_B64):
    // title "Hermetik coordinator test-ailesi alti senaryo" — hermetic tests for
    // src/orchestra/run-flow-coordinator.ts — assignedAgent 'refactorer', intent 'implementation'.
    const task = makeTask({
      id: '442-003',
      title: 'Hermetik coordinator test-ailesi alti senaryo',
      description: 'run-flow-coordinator.ts icin hermetik alti-senaryolu test ailesi.',
      assignedAgent: 'refactorer',
      assignedSkills: ['sh-portability'],
      scope: {
        directories: ['src/orchestra/', 'tests/orchestra/'],
        filesRead: [],
        filesWrite: ['tests/orchestra/run-flow-coordinator.test.ts'],
      },
      routingMeta: withIntent('implementation'),
    });
    const ctx: SprintContext = {
      agentId: 'refactorer',
      agentPrompt: refactorerPrompt,
      effort: 'high',
      personaRenderMode: 'guidance',
    };
    const { prompt } = buildTaskPromptSegmented(task, ctx);

    expect(prompt).toContain('=== Agent: refactorer ===');
    // refactorer's PROMPT.md has no 'implementation' guidance key -> falls back to 'default'
    expect(prompt).toContain('Mission: improve code structure and readability');
    expect(prompt).toContain(
      '[full persona: .deckent/agents/refactorer/PROMPT.md — read it if this slice is not enough]',
    );
    expect(prompt.toLowerCase()).not.toContain('docker');
    expect(prompt).not.toContain('<!-- guidance:');
  });

  it('3a. full mode with a marker-free persona stays byte-identical (no pointer)', () => {
    const unmarkedPrompt = '# Copy Writer Agent\nJust a plain prompt body, no guidance markers at all.';
    const task = makeTask({ assignedAgent: 'copy-writer', routingMeta: withIntent('documentation') });
    const ctx: SprintContext = { agentId: 'copy-writer', agentPrompt: unmarkedPrompt, effort: 'high' };

    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain(`=== Agent: copy-writer ===\n${unmarkedPrompt}`);
    expect(prompt).not.toContain('[full persona:');
  });

  it("3b. full mode with a MARKER-CARRYING persona (devops-engineer) renders core-body + appendix pointer (post-F1 contract)", () => {
    const devopsPrompt = readFileSync(DEVOPS_ENGINEER_PROMPT_PATH, 'utf8');
    const task = makeTask({ assignedAgent: 'devops-engineer', routingMeta: withIntent('devops') });
    // personaRenderMode omitted -> defaults to 'full'
    const ctx: SprintContext = { agentId: 'devops-engineer', agentPrompt: devopsPrompt, effort: 'high' };

    const { prompt } = buildTaskPrompt(task, ctx);
    const expectedCoreBody = personaCoreBody(devopsPrompt);

    expect(expectedCoreBody).not.toBe(devopsPrompt); // sanity: this persona genuinely has guidance blocks to strip
    expect(prompt).toContain(`=== Agent: devops-engineer ===\n${expectedCoreBody}`);
    expect(prompt).toContain(
      '[full persona: .deckent/agents/devops-engineer/PROMPT.md — read it if you need the guidance appendix]',
    );
    expect(prompt).not.toContain('<!-- guidance:');
    // F1 only strips the marked guidance SLICES — the rest of the document (including
    // full-body-only sections) still renders in full mode, unlike guidance mode (assertion 1).
    expect(prompt).toContain('FROM node:20-alpine AS builder');
    expect(prompt).toContain('Blue-Green Deployment');
  });

  it('4. shadow-precedence — a .deckent/agents/<id> copy SHADOWS the builtin (tmpdir fixture), both at getAgentPrompt and through the compose path', () => {
    const builtinDevopsPrompt = readFileSync(DEVOPS_ENGINEER_PROMPT_PATH, 'utf8');
    const shadowPrompt = [
      '# DevOps Engineer Agent (project shadow override)',
      '',
      'SHADOW-MARKER-4471: this text exists ONLY in the project .deckent/agents shadow copy,',
      'never in the builtin src/core/builtins/agents tree.',
      '',
      '## Guidance Slices',
      '',
      '<!-- guidance:devops-start -->',
      'SHADOW-DEVOPS-SLICE-4471: project-local devops guidance overriding the builtin slice.',
      '<!-- guidance:devops-end -->',
    ].join('\n');

    const shadowDir = join(projectRoot, '.deckent', 'agents', 'devops-engineer');
    mkdirSync(shadowDir, { recursive: true });
    const shadowPath = join(shadowDir, 'PROMPT.md');
    writeFileSync(shadowPath, shadowPrompt, 'utf8');

    const resolution = getAgentPrompt('devops-engineer', projectRoot);

    expect(resolution.source).toBe('prompt-md');
    expect(resolution.degraded).toBe(false);
    expect(resolution.content).toBe(shadowPrompt);
    expect(resolution.content).not.toBe(builtinDevopsPrompt);
    expect(resolution.content).toContain('SHADOW-MARKER-4471');
    expect(resolution.resolvedFrom).toBe(shadowPath);

    // End-to-end: the SHADOW-resolved content — not the builtin's — is what reaches the
    // actual composed worker prompt through the production compose path.
    const task = makeTask({ assignedAgent: 'devops-engineer', routingMeta: withIntent('devops') });
    const ctx: SprintContext = {
      agentId: 'devops-engineer',
      agentPrompt: resolution.content,
      effort: 'high',
      personaRenderMode: 'guidance',
    };
    const { prompt } = buildTaskPromptSegmented(task, ctx);

    expect(prompt).toContain('SHADOW-DEVOPS-SLICE-4471');
    // the builtin's own devops slice text must NOT appear — the shadow fully overrode it
    expect(prompt).not.toContain('pin action versions by commit SHA');
  });
});
