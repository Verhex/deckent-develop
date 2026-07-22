import { describe, expect, it } from 'vitest';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

function makeInspectionTask(): Task {
  return {
    id: 'readonly-001',
    title: 'Read-only runtime budget audit',
    description: 'Inspect only the exact scoped files and report durable evidence.',
    model: 'claude-sonnet-5',
    forceModel: 'claude-sonnet-5',
    provider: 'claude',
    authMode: 'subscription',
    backend: 'docker',
    effort: 'low',
    priority: 'LOW',
    reason: 'Hermetic prompt contract regression.',
    type: 'audit',
    scope: {
      directories: ['src/core/', 'src/orchestra/'],
      filesRead: [
        'src/core/live-execution-budget.ts',
        'src/orchestra/runtime-budget-monitor.ts',
        'src/orchestra/spawn-backend-docker.ts',
      ],
      filesWrite: [],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'READONLY_ACCEPTANCE_MARKER is proven with file and command evidence.',
      noGoCriteria: 'Any project write or invented runtime identity.',
      techDebtAcceptable: 'None.',
    },
    status: TaskStatus.PENDING,
    budget: {
      maxTokens: 948000,
      maxTurns: 8,
      maxInputTokens: 40000,
      maxOutputTokens: 8000,
      maxCacheReadTokens: 750000,
      maxCacheCreationTokens: 150000,
      maxContextTokens: 300000,
    },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'audit',
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'execution_budget.roles.worker.default',
      policyDigest: '030676bc747f4c9537db3cf2d8b80eb82f4a1d99b5b1d2978fb181bb6009df79',
      requestedBudget: {
        maxTokens: 948000,
        maxTurns: 8,
        maxInputTokens: 40000,
        maxOutputTokens: 8000,
        maxCacheReadTokens: 750000,
        maxCacheCreationTokens: 150000,
        maxContextTokens: 300000,
      },
    },
  };
}

describe('inspection-only worker prompt contract', () => {
  it('renders exact read/provenance/budget truth and removes construction instructions', () => {
    const { prompt } = buildTaskPrompt(makeInspectionTask(), { effort: 'low' });

    for (const path of makeInspectionTask().scope.filesRead) expect(prompt).toContain(`  - ${path}`);
    expect(prompt).toContain('PROJECT WRITE authority: NONE');
    expect(prompt).toContain('A directory above never grants Write/Edit permission');
    expect(prompt).toContain('.tasks/task-readonly-001.plan');
    expect(prompt).toContain('.tasks/task-readonly-001.hb');
    expect(prompt).toContain('.tasks/task-readonly-001.result');

    expect(prompt).toContain('- Task kind: audit');
    expect(prompt).toContain('- Requested provider: claude');
    expect(prompt).toContain('- Requested model override: claude-sonnet-5');
    expect(prompt).toContain('- Plan-resolved provider: claude');
    expect(prompt).toContain('- Plan-resolved model: claude-sonnet-5');
    expect(prompt).toContain('- Auth override: subscription');
    expect(prompt).toContain('- Backend override: docker');
    expect(prompt).toContain('"maxTurns":8');
    expect(prompt).toContain('"maxCacheReadTokens":750000');
    expect(prompt).toContain('execution_budget.roles.worker.default');
    expect(prompt).toContain('Called provider/model, live usage, fallback, and receipt identity do not exist at prompt-compilation time');

    expect(prompt).not.toContain('Write the code changes described above');
    expect(prompt).not.toContain('BEFORE coding');
    expect(prompt).not.toContain('## CRITICAL VERIFY STEPS');
    expect(prompt).not.toContain('Type check / static analysis');
    expect(prompt).not.toContain('<path-to-the-test-file');
    expect(prompt).not.toContain('## Dependency-Mutation Advisory');
    expect(prompt).not.toContain('editing src/x.ts');
    expect(prompt).not.toContain('see the VERIFY STEPS section below');
    expect(prompt.match(/READONLY_ACCEPTANCE_MARKER/g)).toHaveLength(1);
  });

  it('preserves the ordinary code-task compiler path', () => {
    const task = makeInspectionTask();
    task.type = 'implementation';
    task.scope.filesRead = [];
    task.scope.filesWrite = ['src/core/live-execution-budget.ts'];
    const { prompt } = buildTaskPrompt(task, { effort: 'low' });

    expect(prompt).toContain('Write the code changes described above');
    expect(prompt).toContain('## CRITICAL VERIFY STEPS');
    expect(prompt).toContain('Type check / static analysis');
    expect(prompt).toContain('## Dependency-Mutation Advisory');
  });

  it('rejecting every authored read path never widens authority to the directories', () => {
    const task = makeInspectionTask();
    task.scope.filesRead = ['../outside.ts'];
    const { prompt } = buildTaskPrompt(task, { effort: 'low' });

    expect(prompt).toContain('## Scope Rules (inspection-only)');
    expect(prompt).toContain('PROJECT WRITE authority: NONE');
    expect(prompt).toContain('no valid read targets remain after path validation');
    expect(prompt).not.toContain('You may ONLY modify files in these directories');
    expect(prompt).not.toContain('you may write to any file within the directories above');
  });

  it('renders exact repo-root manifests as reads while preserving zero project-write authority', () => {
    const task = makeInspectionTask();
    task.scope.filesRead = ['package.json', 'tsconfig.json'];
    const { prompt } = buildTaskPrompt(task, { effort: 'low' });

    expect(prompt).toContain('## Scope Rules (inspection-only)');
    expect(prompt).toContain('  - package.json');
    expect(prompt).toContain('  - tsconfig.json');
    expect(prompt).toContain('PROJECT WRITE authority: NONE');
    expect(prompt).not.toContain('no valid read targets remain after path validation');
    expect(prompt).not.toContain('you may write to any file within the directories above');
  });

  it('rejects mixed-platform path escapes without dropping a valid exact root read', () => {
    const task = makeInspectionTask();
    task.scope.filesRead = [
      '/etc/passwd',
      'C:\\Windows\\system.ini',
      '\\\\server\\share\\file.txt',
      '../outside.ts',
      'src/**/*.ts',
      'src/',
      'package.json',
    ];
    const { prompt } = buildTaskPrompt(task, { effort: 'low' });
    const exactReads = prompt.slice(
      prompt.indexOf('Exact project files to inspect:'),
      prompt.indexOf('PROJECT WRITE authority: NONE'),
    );

    expect(exactReads).toContain('  - package.json');
    for (const rejected of task.scope.filesRead.slice(0, -1)) {
      expect(exactReads).not.toContain(`  - ${rejected}`);
    }
    expect(prompt).toContain('PROJECT WRITE authority: NONE');
  });
});
