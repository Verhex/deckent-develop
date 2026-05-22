import { describe, it, expect, beforeEach } from 'vitest';
import type { Sprint, SprintMetrics, TaskEvaluation, TaskResult } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import {
  buildSprintLogLines,
  buildDirectivesPlaceholder,
  sprintFileNumber,
  parseAddedSrcFiles,
  findMaxAdrNumber,
  buildAdrEntry,
} from '../../src/orchestra/sprint-docs-helpers.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-001',
    tasks: [],
    status: 'PLAN',
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 5,
    completedTasks: 3,
    techDebtTasks: 1,
    noGoTasks: 1,
    coveragePercent: 85.5,
    durationMs: 3600000,
    ...overrides,
  };
}

function makeProjectIdentityInfo(
  overrides: Partial<ProjectIdentityInfo> = {},
): ProjectIdentityInfo {
  return {
    projectName: 'test-project',
    sprintId: 'sprint-001',
    description: 'A test project',
    testCount: 100,
    fileCount: 50,
    lineCount: 5000,
    totalSprints: 1,
    mode: 'performance',
    brainModel: 'opus',
    defaultModel: 'sonnet',
    maxWorkers: 4,
    framework: 'React',
    language: 'TypeScript',
    testFramework: 'vitest',
    buildTool: 'tsc',
    ...overrides,
  };
}

// ═══ buildSprintLogLines ════════════════════════════════════════════════

describe('buildSprintLogLines', () => {
  it('returns lines array with sprint id heading', () => {
    const sprint = makeSprint({ id: 'sprint-042' });
    const metrics = makeMetrics();
    const lines = buildSprintLogLines(sprint, metrics);

    expect(lines[0]).toBe('# sprint-042');
    expect(Array.isArray(lines)).toBe(true);
  });

  it('includes metrics table with all required rows', () => {
    const sprint = makeSprint({
      tasks: [
        { id: '001-001', title: 'Task 1', status: TaskStatus.PENDING } as any,
      ],
    });
    const metrics = makeMetrics({
      totalTasks: 10,
      completedTasks: 7,
      techDebtTasks: 2,
      noGoTasks: 1,
      coveragePercent: 92.3,
      durationMs: 7200000,
    });

    const lines = buildSprintLogLines(sprint, metrics);
    const content = lines.join('\n');

    expect(content).toContain('## Metrics');
    expect(content).toContain('| Total Tasks | 10 |');
    expect(content).toContain('| Completed | 7 |');
    expect(content).toContain('| Tech Debt | 2 |');
    expect(content).toContain('| No-Go | 1 |');
    expect(content).toContain('| Coverage | 92.3% |');
  });

  it('handles empty tasks array gracefully', () => {
    const sprint = makeSprint({ tasks: [] });
    const metrics = makeMetrics();

    const lines = buildSprintLogLines(sprint, metrics);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).toContain('## Metrics');
    expect(lines.join('\n')).toContain('## Agents');
  });

  it('collects agents and skills from task assignments', () => {
    const sprint = makeSprint({
      tasks: [
        {
          id: '001-001',
          title: 'Task 1',
          assignedAgent: 'test-writer',
          assignedSkills: ['testing-expert', 'typescript-expert'],
        } as any,
        {
          id: '001-002',
          title: 'Task 2',
          assignedAgent: 'bug-fixer',
          assignedSkills: ['typescript-expert'],
        } as any,
      ],
    });
    const metrics = makeMetrics();

    const lines = buildSprintLogLines(sprint, metrics);
    const content = lines.join('\n');

    expect(content).toContain('test-writer');
    expect(content).toContain('bug-fixer');
    expect(content).toContain('testing-expert');
    expect(content).toContain('typescript-expert');
  });

  it('shows "-" for agents/skills when none assigned', () => {
    const sprint = makeSprint({
      tasks: [
        {
          id: '001-001',
          title: 'Task 1',
          assignedAgent: 'generic',
          assignedSkills: [],
        } as any,
      ],
    });
    const metrics = makeMetrics();

    const lines = buildSprintLogLines(sprint, metrics);
    const content = lines.join('\n');

    expect(content).toContain('Agents: -');
    expect(content).toContain('Skills: -');
  });

  it('includes task status from evaluations map if provided', () => {
    const sprint = makeSprint({
      tasks: [
        { id: '001-001', title: 'Task 1', status: TaskStatus.DONE } as any,
      ],
    });
    const metrics = makeMetrics();
    const evaluations = new Map<string, TaskEvaluation>([
      ['001-001', 'GO_WITH_TECH_DEBT' as TaskEvaluation],
    ]);

    const lines = buildSprintLogLines(sprint, metrics, evaluations);
    const content = lines.join('\n');

    expect(content).toContain('GO_WITH_TECH_DEBT');
  });

  it('includes notes section when tasks have result notes', () => {
    const sprint = makeSprint({
      tasks: [
        { id: '001-001', title: 'Task 1', status: TaskStatus.DONE } as any,
      ],
    });
    const metrics = makeMetrics();
    const results: TaskResult[] = [
      {
        taskId: '001-001',
        selfAssessment: 'DONE',
        notes: 'Successfully completed the task',
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
      } as any,
    ];

    const lines = buildSprintLogLines(sprint, metrics, undefined, results);
    const content = lines.join('\n');

    expect(content).toContain('## Notes');
    expect(content).toContain('001-001');
    expect(content).toContain('Task 1');
  });

  it('truncates notes to 150 characters', () => {
    const longNote = 'a'.repeat(200);
    const sprint = makeSprint({
      tasks: [
        { id: '001-001', title: 'Task 1', status: TaskStatus.DONE } as any,
      ],
    });
    const metrics = makeMetrics();
    const results: TaskResult[] = [
      {
        taskId: '001-001',
        selfAssessment: 'DONE',
        notes: longNote,
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
      } as any,
    ];

    const lines = buildSprintLogLines(sprint, metrics, undefined, results);
    const content = lines.join('\n');

    expect(content).toContain('a'.repeat(150));
    expect(content).not.toContain('a'.repeat(151));
  });

  it('counts files changed from results', () => {
    const sprint = makeSprint({
      tasks: [
        { id: '001-001', title: 'Task 1', status: TaskStatus.DONE } as any,
      ],
    });
    const metrics = makeMetrics();
    const results: TaskResult[] = [
      {
        taskId: '001-001',
        filesChanged: ['src/file1.ts', 'src/file2.ts', 'tests/file.test.ts'],
        selfAssessment: 'DONE',
        notes: '',
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
      } as any,
    ];

    const lines = buildSprintLogLines(sprint, metrics, undefined, results);
    const content = lines.join('\n');

    expect(content).toContain('| Files Changed | 3 |');
  });
});

// ═══ generateProjectIdentity ════════════════════════════════════════════

describe('buildDirectivesPlaceholder', () => {
  it('includes previous sprint reference', () => {
    const content = buildDirectivesPlaceholder(
      'sprint-042',
      'DIRECTIVES-sprint-042.md',
      43,
    );

    expect(content).toContain('sprint-042');
    expect(content).toContain('DIRECTIVES-sprint-042.md');
  });

  it('includes correct next sprint number', () => {
    const content = buildDirectivesPlaceholder(
      'sprint-010',
      'DIRECTIVES-sprint-010.md',
      11,
    );

    expect(content).toContain('# DIRECTIVES — (Sprint 11 için hazırlanıyor)');
  });

  it('handles string sprint number', () => {
    const content = buildDirectivesPlaceholder(
      'sprint-100',
      'DIRECTIVES-sprint-100.md',
      '101',
    );

    expect(content).toContain('Sprint 101');
  });

  it('includes reference sections', () => {
    const content = buildDirectivesPlaceholder(
      'sprint-005',
      'DIRECTIVES-sprint-005.md',
      6,
    );

    expect(content).toContain('## Referanslar');
    expect(content).toContain('.brain/archive/');
    expect(content).toContain('.brain/RETRO.md');
    expect(content).toContain('.brain/MEMORY.md');
  });

  it('includes template task structure', () => {
    const content = buildDirectivesPlaceholder(
      'sprint-001',
      'DIRECTIVES-sprint-001.md',
      2,
    );

    expect(content).toContain('## Task 1:');
    expect(content).toContain('- Model: sonnet');
    expect(content).toContain('- Effort: normal');
    expect(content).toContain('### Description');
  });

  it('uses "???" for unknown next sprint number', () => {
    const content = buildDirectivesPlaceholder(
      'sprint-099',
      'DIRECTIVES-sprint-099.md',
      '???',
    );

    expect(content).toContain('Sprint ???');
  });
});

// ═══ readPreviousCompletedTasks ═════════════════════════════════════════

describe('sprintFileNumber', () => {
  it('extracts sprint number from filename', () => {
    expect(sprintFileNumber('sprint-001.md')).toBe(1);
    expect(sprintFileNumber('sprint-042.md')).toBe(42);
    expect(sprintFileNumber('sprint-999.md')).toBe(999);
  });

  it('returns 0 for invalid filename', () => {
    expect(sprintFileNumber('random-file.md')).toBe(0);
    expect(sprintFileNumber('no-sprint-here')).toBe(0);
  });

  it('extracts number with leading zeros', () => {
    expect(sprintFileNumber('sprint-007.md')).toBe(7);
    expect(sprintFileNumber('sprint-0001.md')).toBe(1);
  });

  it('handles filename with path', () => {
    expect(sprintFileNumber('/path/to/sprint-050.md')).toBe(50);
  });
});

// ═══ parseAddedSrcFiles ═════════════════════════════════════════════════

describe('parseAddedSrcFiles', () => {
  it('parses added files from git diff output', () => {
    const diffOutput = `A\tsrc/new-file.ts
A\tsrc/core/new-module.ts
M\tsrc/existing.ts`;

    const result = parseAddedSrcFiles(diffOutput);

    expect(result).toContain('src/new-file.ts');
    expect(result).toContain('src/core/new-module.ts');
    expect(result).not.toContain('src/existing.ts');
  });

  it('ignores non-src files', () => {
    const diffOutput = `A\tsrc/new-file.ts
A\tdocs/readme.md
A\ttests/new.test.ts`;

    const result = parseAddedSrcFiles(diffOutput);

    expect(result).toContain('src/new-file.ts');
    expect(result).not.toContain('docs/readme.md');
    expect(result).not.toContain('tests/new.test.ts');
  });

  it('returns empty array for no matches', () => {
    const diffOutput = `M\tsrc/existing.ts
D\tsrc/old.ts`;

    const result = parseAddedSrcFiles(diffOutput);

    expect(result).toEqual([]);
  });

  it('handles empty diff output', () => {
    const result = parseAddedSrcFiles('');
    expect(result).toEqual([]);
  });

  it('ignores lines without proper format', () => {
    const diffOutput = `A\tsrc/valid.ts
invalid line
A src/missing-tab.ts`;

    const result = parseAddedSrcFiles(diffOutput);

    expect(result).toEqual(['src/valid.ts']);
  });
});

// ═══ findMaxAdrNumber ═══════════════════════════════════════════════════

describe('findMaxAdrNumber', () => {
  it('finds maximum ADR number in content', () => {
    const content = `## ADR-001: First Decision
...
## ADR-005: Another Decision
...
## ADR-003: Third Decision`;

    const result = findMaxAdrNumber(content);

    expect(result).toBe(5);
  });

  it('returns 0 when no ADRs found', () => {
    const content = '# No ADRs here';

    const result = findMaxAdrNumber(content);

    expect(result).toBe(0);
  });

  it('handles single ADR', () => {
    const content = '## ADR-001: Single Decision';

    const result = findMaxAdrNumber(content);

    expect(result).toBe(1);
  });

  it('handles large ADR numbers', () => {
    const content = `## ADR-042: The Answer
## ADR-999: Large Number`;

    const result = findMaxAdrNumber(content);

    expect(result).toBe(999);
  });

  it('only matches h2 headings with ADR pattern', () => {
    const content = `## Some Other Section
## ADR-007: Real ADR
# ADR-010: Not h2 (ignored)
Some text about ADR-005 (ignored)`;

    const result = findMaxAdrNumber(content);

    expect(result).toBe(7);
  });
});

// ═══ buildAdrEntry ═════════════════════════════════════════════════════

describe('buildAdrEntry', () => {
  it('generates ADR entry lines with correct format', () => {
    const lines = buildAdrEntry('034', 'new-module', 136);

    expect(lines[0]).toBe('');
    expect(lines[1]).toContain('## ADR-034:');
    expect(lines[1]).toContain('new-module');
    expect(lines[1]).toContain('Sprint #136');
  });

  it('includes status as PROPOSED', () => {
    const lines = buildAdrEntry('050', 'feature-x', 150);

    expect(lines).toContainEqual('**Status:** PROPOSED');
  });

  it('includes context with sprint number', () => {
    const lines = buildAdrEntry('025', 'utilities', 100);

    expect(lines).toContainEqual('**Context:** New module added in Sprint #100');
  });

  it('includes decision placeholder', () => {
    const lines = buildAdrEntry('001', 'core', 1);

    expect(lines).toContainEqual('**Decision:** [To be documented]');
  });

  it('handles string sprint number', () => {
    const lines = buildAdrEntry('099', 'api', '999');

    expect(lines[1]).toContain('Sprint #999');
    expect(lines[3]).toContain('Sprint #999');
  });

  it('handles zero-padded ADR numbers', () => {
    const lines = buildAdrEntry('007', 'test-utils', 50);

    expect(lines[1]).toContain('ADR-007');
  });
});
