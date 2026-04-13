import { describe, it, expect, beforeEach } from 'vitest';
import type { Sprint, SprintMetrics, TaskEvaluation, TaskResult } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import {
  buildSprintLogLines,
  generateProjectIdentity,
  buildCurrentStateLines,
  buildDirectivesPlaceholder,
  readPreviousCompletedTasks,
  readPreviousCoverage,
  replaceCurrentStateSection,
  sprintFileNumber,
  parseAddedSrcFiles,
  findMaxAdrNumber,
  buildAdrEntry,
  type ProjectIdentityInfo,
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

describe('generateProjectIdentity', () => {
  it('includes project name and description', () => {
    const info = makeProjectIdentityInfo({
      projectName: 'my-app',
      description: 'An excellent application',
    });

    const content = generateProjectIdentity(info);

    expect(content).toContain('# Project Identity');
    expect(content).toContain('- Name: my-app');
    expect(content).toContain('- Description: An excellent application');
  });

  it('includes architecture section with optional fields', () => {
    const info = makeProjectIdentityInfo({
      language: 'TypeScript',
      framework: 'React',
      testFramework: 'vitest',
      buildTool: 'tsc',
    });

    const content = generateProjectIdentity(info);

    expect(content).toContain('## Architecture');
    expect(content).toContain('- Language: TypeScript');
    expect(content).toContain('- Framework: React');
    expect(content).toContain('- Test Framework: vitest');
    expect(content).toContain('- Build Tool: tsc');
  });

  it('includes current state section with metrics', () => {
    const info = makeProjectIdentityInfo({
      testCount: 250,
      fileCount: 120,
      lineCount: 25000,
      sprintId: 'sprint-015',
      totalSprints: 15,
    });

    const content = generateProjectIdentity(info);

    expect(content).toContain('## Current State');
    expect(content).toContain('- Test Count: 250');
    expect(content).toContain('- File Count: 120');
    expect(content).toContain('- Line Count: 25000');
    expect(content).toContain('- Last Sprint: sprint-015');
    expect(content).toContain('- Total Sprints: 15');
  });

  it('includes active configuration section', () => {
    const info = makeProjectIdentityInfo({
      mode: 'performance',
      brainModel: 'opus',
      defaultModel: 'sonnet',
      maxWorkers: 4,
    });

    const content = generateProjectIdentity(info);

    expect(content).toContain('## Active Configuration');
    expect(content).toContain('- Mode: performance');
    expect(content).toContain('- Brain Model: opus');
    expect(content).toContain('- Default Model: sonnet');
    expect(content).toContain('- Max Workers: 4');
  });

  it('includes module map when provided', () => {
    const info = makeProjectIdentityInfo({
      moduleMap: {
        'src/core': 'Type definitions and configuration',
        'src/orchestra': 'Sprint orchestration logic',
        'tests': 'Test suites',
      },
    });

    const content = generateProjectIdentity(info);

    expect(content).toContain('## Module Map');
    expect(content).toContain('- src/core: Type definitions and configuration');
    expect(content).toContain('- src/orchestra: Sprint orchestration logic');
    expect(content).toContain('- tests: Test suites');
  });

  it('shows "(auto-populated...)" when module map is empty', () => {
    const info = makeProjectIdentityInfo({ moduleMap: {} });

    const content = generateProjectIdentity(info);

    expect(content).toContain('(auto-populated after first sprint)');
  });

  it('handles missing optional fields gracefully', () => {
    const info: ProjectIdentityInfo = {
      projectName: 'minimal-project',
      sprintId: 'sprint-001',
    };

    const content = generateProjectIdentity(info);

    expect(content).toContain('# Project Identity');
    expect(content).toContain('- Name: minimal-project');
    // Should not crash and should include basic sections
    expect(content).toContain('## Architecture');
    expect(content).toContain('## Current State');
  });
});

// ═══ buildCurrentStateLines ═════════════════════════════════════════════

describe('buildCurrentStateLines', () => {
  it('formats test count and coverage with correct precision', () => {
    const lines = buildCurrentStateLines(
      250,  // testCount
      89.5, // coveragePercent
      'sprint-010',
      10,   // totalSprints
      45,   // completedTasks
      8.5,  // noGoRate
    );

    expect(lines).toContain('- Test Count: 250');
    expect(lines).toContain('- Coverage: 89.5%');
  });

  it('adds coverage note when coverage is zero', () => {
    const lines = buildCurrentStateLines(
      100,
      0,
      'sprint-001',
      1,
      5,
      0,
    );

    expect(lines).toContainEqual('- Coverage Note: coverage not measured');
  });

  it('includes sprint and task metrics', () => {
    const lines = buildCurrentStateLines(
      300,
      95.2,
      'sprint-025',
      25,
      120,
      5.5,
    );

    expect(lines).toContain('- Last Sprint: sprint-025');
    expect(lines).toContain('- Total Sprints: 25');
    expect(lines).toContain('- Completed Tasks: 120');
    expect(lines).toContain('- No-Go Rate: 5.5%');
  });

  it('formats percentages with one decimal place', () => {
    const lines = buildCurrentStateLines(
      150,
      75.333,
      'sprint-008',
      8,
      30,
      10.666,
    );

    const coverageLine = lines.find(l => l.includes('Coverage'));
    const noGoLine = lines.find(l => l.includes('No-Go'));

    expect(coverageLine).toContain('75.3%');
    expect(noGoLine).toContain('10.7%');
  });
});

// ═══ buildDirectivesPlaceholder ═════════════════════════════════════════

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

describe('readPreviousCompletedTasks', () => {
  it('extracts completed tasks number from content', () => {
    const content = `
## Current State
- Test Count: 200
- Coverage: 92.1%
- Last Sprint: sprint-010
- Completed Tasks: 47
- No-Go Rate: 2.1%
    `;

    const result = readPreviousCompletedTasks(content);

    expect(result).toBe(47);
  });

  it('returns 0 when field not found', () => {
    const content = '# No completed tasks info here';

    const result = readPreviousCompletedTasks(content);

    expect(result).toBe(0);
  });

  it('handles various whitespace patterns', () => {
    const content = '- Completed Tasks:   123';
    const result = readPreviousCompletedTasks(content);
    expect(result).toBe(123);
  });

  it('extracts zero correctly', () => {
    const content = '- Completed Tasks: 0';
    const result = readPreviousCompletedTasks(content);
    expect(result).toBe(0);
  });

  it('handles large numbers', () => {
    const content = '- Completed Tasks: 9999';
    const result = readPreviousCompletedTasks(content);
    expect(result).toBe(9999);
  });
});

// ═══ readPreviousCoverage ═══════════════════════════════════════════════

describe('readPreviousCoverage', () => {
  it('extracts coverage percentage', () => {
    const content = `
## Current State
- Coverage: 85.5%
- Last Sprint: sprint-010
    `;

    const result = readPreviousCoverage(content);

    expect(result).toBe(85.5);
  });

  it('returns null when coverage not found', () => {
    const content = '# No coverage info';

    const result = readPreviousCoverage(content);

    expect(result).toBeNull();
  });

  it('handles whole number percentages', () => {
    const content = '- Coverage: 100%';

    const result = readPreviousCoverage(content);

    expect(result).toBe(100);
  });

  it('returns null for invalid percentage', () => {
    const content = '- Coverage: abc%';

    const result = readPreviousCoverage(content);

    expect(result).toBeNull();
  });

  it('handles zero coverage', () => {
    const content = '- Coverage: 0%';

    const result = readPreviousCoverage(content);

    expect(result).toBe(0);
  });

  it('handles high precision decimals', () => {
    const content = '- Coverage: 95.6789%';

    const result = readPreviousCoverage(content);

    expect(result).toBeCloseTo(95.6789, 4);
  });
});

// ═══ replaceCurrentStateSection ═════════════════════════════════════════

describe('replaceCurrentStateSection', () => {
  it('replaces existing current state section', () => {
    const content = `# Project Identity

## Current State
- Old Value: 123
- Coverage: 50%

## Active Configuration
- Mode: test`;

    const newLines = [
      '- Test Count: 200',
      '- Coverage: 95%',
      '- Completed Tasks: 40',
    ];

    const result = replaceCurrentStateSection(content, newLines);

    expect(result).toContain('## Current State');
    expect(result).toContain('- Test Count: 200');
    expect(result).toContain('- Coverage: 95%');
    expect(result).not.toContain('- Old Value: 123');
    expect(result).toContain('## Active Configuration');
  });

  it('appends new current state section if missing', () => {
    const content = `# Project Identity

## Architecture
- Framework: React`;

    const newLines = ['- Test Count: 100', '- Coverage: 90%'];

    const result = replaceCurrentStateSection(content, newLines);

    expect(result).toContain('## Current State');
    expect(result).toContain('- Test Count: 100');
    expect(result).toContain('## Architecture');
  });

  it('preserves other sections', () => {
    const content = `# Project Identity

## Architecture
- Language: TypeScript

## Current State
- Old: 1

## Active Configuration
- Mode: test`;

    const newLines = ['- New: 2'];

    const result = replaceCurrentStateSection(content, newLines);

    expect(result).toContain('## Architecture');
    expect(result).toContain('- Language: TypeScript');
    expect(result).toContain('## Active Configuration');
    expect(result).toContain('- Mode: test');
  });

  it('handles empty new lines array', () => {
    const content = `# Title

## Current State
- Old Value: 1`;

    const result = replaceCurrentStateSection(content, []);

    expect(result).toContain('## Current State');
  });
});

// ═══ sprintFileNumber ═══════════════════════════════════════════════════

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
