import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Helpers ───────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '156-007',
    title: 'Worker Prompt Previous-Result Enrichment',
    description: 'Test task',
    model: 'opus',
    effort: 'high',
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
    sprintId: 'sprint-156',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect\nTest agent prompt.',
    skillPrompts: [],
    allAdrs: [],
    effort: 'high',
    ...overrides,
  };
}

function writeResult(dir: string, taskId: string, body: unknown): void {
  writeFileSync(join(dir, `task-${taskId}.result`), JSON.stringify(body), 'utf-8');
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('buildDependenciesBlock — previous-result enrichment (Task 156-007)', () => {
  let tasksDir: string;

  beforeEach(() => {
    tasksDir = mkdtempSync(join(tmpdir(), 'deckent-deps-'));
  });

  afterEach(() => {
    rmSync(tasksDir, { recursive: true, force: true });
  });

  it('embeds DONE dependency selfAssessment, files, and notes into prompt', () => {
    writeResult(tasksDir, '154-001', {
      taskId: '154-001',
      filesChanged: ['src/orchestra/rubric-registry.ts'],
      linesAdded: 196,
      linesRemoved: 0,
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'TaskType taxonomy created and registered.',
    });

    const task = makeTask({ dependencies: ['154-001'] });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('## Dependency 154-001 (DONE)');
    expect(prompt).toContain('src/orchestra/rubric-registry.ts');
    expect(prompt).toContain('+196');
    expect(prompt).toContain('TaskType taxonomy created');
  });

  it('renders "Pending (not yet complete)" when .result file is missing', () => {
    const task = makeTask({ dependencies: ['154-999'] });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('## Dependency 154-999 (Pending)');
    expect(prompt).toContain('Pending (not yet complete)');
  });

  it('includes both added and removed line counts when both present', () => {
    writeResult(tasksDir, '154-002', {
      taskId: '154-002',
      filesChanged: ['src/a.ts', 'tests/a.test.ts'],
      linesAdded: 42,
      linesRemoved: 13,
      selfAssessment: 'NO_GO',
      notes: 'Build broke after edit.',
    });

    const task = makeTask({ dependencies: ['154-002'] });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('## Dependency 154-002 (NO_GO)');
    expect(prompt).toContain('src/a.ts, tests/a.test.ts');
    expect(prompt).toContain('(+42/-13)');
  });

  it('falls back to "Pending" sentinel when .result file is malformed JSON', () => {
    writeFileSync(join(tasksDir, 'task-154-003.result'), '{not valid json', 'utf-8');

    const task = makeTask({ dependencies: ['154-003'] });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('## Dependency 154-003 (Pending)');
    expect(prompt).toContain('Pending (not yet complete)');
  });

  it('omits Dependencies block when task has no deps', () => {
    const task = makeTask({ dependencies: [] });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).not.toContain('## Dependencies');
    expect(prompt).not.toContain('Pending (not yet complete)');
  });

  it('embeds T1 result content in T2 prompt for a 2-task dependency chain', () => {
    // T1 finished and wrote its result
    writeResult(tasksDir, '156-001', {
      taskId: '156-001',
      filesChanged: ['src/core/config.ts'],
      linesAdded: 24,
      linesRemoved: 3,
      selfAssessment: 'DONE',
      notes: 'dependency_pipeline_enabled default flipped to true.',
    });

    // T2 depends on T1
    const t2 = makeTask({
      id: '156-002',
      dependencies: ['156-001'],
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/sprint-phases.ts'],
      },
    });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(t2, ctx);

    // Header summary line preserved
    expect(prompt).toContain('This task depends on: 156-001');
    // Enriched per-dep section
    expect(prompt).toContain('## Dependency 156-001 (DONE)');
    expect(prompt).toContain('src/core/config.ts');
    expect(prompt).toContain('(+24/-3)');
    expect(prompt).toContain('dependency_pipeline_enabled default flipped');
  });

  it('handles a mix of present and missing dependency results', () => {
    writeResult(tasksDir, '156-010', {
      taskId: '156-010',
      filesChanged: ['src/orchestra/x.ts'],
      linesAdded: 10,
      linesRemoved: 0,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Partial — missing test coverage.',
    });

    const task = makeTask({ dependencies: ['156-010', '156-011'] });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('## Dependency 156-010 (GO_WITH_TECH_DEBT)');
    expect(prompt).toContain('Partial — missing test coverage.');
    expect(prompt).toContain('## Dependency 156-011 (Pending)');
  });

  it('emits "UNKNOWN" status when selfAssessment field is absent', () => {
    writeResult(tasksDir, '156-020', {
      taskId: '156-020',
      filesChanged: ['src/a.ts'],
      linesAdded: 5,
    });

    const task = makeTask({ dependencies: ['156-020'] });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('## Dependency 156-020 (UNKNOWN)');
    expect(prompt).toContain('src/a.ts');
  });

  it('does NOT touch real .tasks/ when tasksDir is explicitly provided', () => {
    // Ensure isolated tmp dir is the one being read — sentinel id with no match
    const task = makeTask({ dependencies: ['999-999'] });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(task, ctx);

    // Should be "Pending" because tmp dir has no such file (even if real .tasks/ has)
    expect(prompt).toContain('## Dependency 999-999 (Pending)');
  });

  it('renders only file list when linesAdded/linesRemoved are absent', () => {
    writeResult(tasksDir, '156-030', {
      taskId: '156-030',
      filesChanged: ['docs/audits/sprint-156/foo.md'],
      selfAssessment: 'DONE',
      notes: 'Audit document written.',
    });

    const task = makeTask({ dependencies: ['156-030'] });
    const ctx = makeCtx({ tasksDir });
    const { prompt } = buildTaskPrompt(task, ctx);

    expect(prompt).toContain('## Dependency 156-030 (DONE)');
    expect(prompt).toContain('- Files: docs/audits/sprint-156/foo.md');
    expect(prompt).not.toMatch(/docs\/audits\/sprint-156\/foo\.md \(/);
  });
});

describe('buildDependenciesBlock — directory resolution', () => {
  it('does not throw when default tasksDir (cwd/.tasks) has no result files', () => {
    // No tasksDir override — falls back to process.cwd() + '/.tasks'.
    // Using a guaranteed-non-existent dep ID ensures we hit the missing branch.
    const stamp = `nonexistent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const task = makeTask({ dependencies: [stamp] });
    const ctx = makeCtx();

    // The prompt build itself must succeed.
    const { prompt } = buildTaskPrompt(task, ctx);
    expect(prompt).toContain(`## Dependency ${stamp} (Pending)`);
  });

  it('creates an empty tasksDir and still resolves missing deps as Pending', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deckent-deps-empty-'));
    try {
      // Empty nested directory just to confirm path joining works.
      mkdirSync(join(dir, 'nested'), { recursive: true });
      const task = makeTask({ dependencies: ['ABC-1'] });
      const ctx = makeCtx({ tasksDir: dir });
      const { prompt } = buildTaskPrompt(task, ctx);
      expect(prompt).toContain('## Dependency ABC-1 (Pending)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
