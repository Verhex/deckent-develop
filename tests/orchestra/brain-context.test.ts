import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrainContext } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import type { ProjectStack, SkillDefinition } from '../../src/core/skill-types.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReaddirSync = vi.mocked(readdirSync);

import {
  enrichContextWithStack,
  formatStackContext,
  enrichContextWithAgentStats,
  formatAgentStats,
  enrichContextWithSkillStats,
  formatSkillStats,
  enrichContextWithHistory,
  formatHistoryContext,
} from '../../src/orchestra/brain-context.js';
import type { SprintHistoryData } from '../../src/orchestra/brain-context.js';

function makeBrainContext(overrides?: Partial<BrainContext>): BrainContext {
  return {
    directives: '# DIRECTIVES',
    memory: '',
    retro: '',
    debt: [],
    patterns: '',
    decisions: '',
    existingTasks: [],
    projectState: { gitStatus: '', fileTree: [] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══ Task 23: Stack Context ═══════════════════════════════════════════════

describe('formatStackContext', () => {
  it('formats full stack', () => {
    const stack: ProjectStack = {
      language: 'TypeScript',
      framework: 'React',
      buildTool: 'tsc',
      testFramework: 'Vitest',
      dependencies: [],
      detectedAt: '2026-01-01',
    };
    expect(formatStackContext(stack)).toBe('Language: TypeScript | Framework: React | Test: Vitest | Build: tsc');
  });

  it('returns "Unknown stack" for empty stack', () => {
    const stack: ProjectStack = {
      language: '',
      framework: '',
      buildTool: '',
      testFramework: '',
      dependencies: [],
      detectedAt: '',
    };
    expect(formatStackContext(stack)).toBe('Unknown stack');
  });

  it('omits missing fields', () => {
    const stack: ProjectStack = {
      language: 'Python',
      framework: '',
      buildTool: '',
      testFramework: 'pytest',
      dependencies: [],
      detectedAt: '',
    };
    expect(formatStackContext(stack)).toBe('Language: Python | Test: pytest');
  });

  it('handles language-only stack', () => {
    const stack: ProjectStack = {
      language: 'Rust',
      framework: '',
      buildTool: '',
      testFramework: '',
      dependencies: [],
      detectedAt: '',
    };
    expect(formatStackContext(stack)).toBe('Language: Rust');
  });
});

describe('enrichContextWithStack', () => {
  it('appends stack info to directives when cache exists', () => {
    const stackData: ProjectStack = {
      language: 'TypeScript',
      framework: 'Express',
      buildTool: 'tsc',
      testFramework: 'Vitest',
      dependencies: [],
      detectedAt: '2026-01-01',
    };
    mockedExistsSync.mockReturnValue(true as any);
    mockedReadFileSync.mockReturnValue(JSON.stringify(stackData) as any);

    const ctx = makeBrainContext();
    const enriched = enrichContextWithStack(ctx, '/project');
    expect(enriched.directives).toContain('## Project Stack');
    expect(enriched.directives).toContain('Language: TypeScript');
  });

  it('returns context unchanged when no stack cache', () => {
    mockedExistsSync.mockReturnValue(false as any);
    const ctx = makeBrainContext();
    const enriched = enrichContextWithStack(ctx, '/project');
    expect(enriched.directives).toBe('# DIRECTIVES');
  });

  it('returns context unchanged on read error', () => {
    mockedExistsSync.mockReturnValue(true as any);
    mockedReadFileSync.mockImplementation(() => { throw new Error('read error'); });
    const ctx = makeBrainContext();
    const enriched = enrichContextWithStack(ctx, '/project');
    expect(enriched.directives).toBe('# DIRECTIVES');
  });

  it('does not mutate original context', () => {
    mockedExistsSync.mockReturnValue(false as any);
    const ctx = makeBrainContext();
    const original = ctx.directives;
    enrichContextWithStack(ctx, '/project');
    expect(ctx.directives).toBe(original);
  });
});

// ═══ Task 24: Agent Stats ═════════════════════════════════════════════════

describe('formatAgentStats', () => {
  it('returns "No agents available." for empty list', () => {
    expect(formatAgentStats([])).toBe('No agents available.');
  });

  it('formats agent table with stats', () => {
    const agents: AgentDefinition[] = [
      createAgentDefinition({
        id: 'code-agent',
        name: 'CodeAgent',
        preferredModel: 'opus',
        stats: { totalUses: 10, successRate: 0.85, avgCoverage: 90, lastUsedInSprint: 'sprint-001' },
      }),
    ];
    const table = formatAgentStats(agents);
    expect(table).toContain('CodeAgent');
    expect(table).toContain('10');
    expect(table).toContain('85%');
    expect(table).toContain('90%');
    expect(table).toContain('opus');
  });

  it('formats multiple agents', () => {
    const agents: AgentDefinition[] = [
      createAgentDefinition({ id: 'a', name: 'Alpha', stats: { totalUses: 5, successRate: 0.6, avgCoverage: 70, lastUsedInSprint: '' } }),
      createAgentDefinition({ id: 'b', name: 'Beta', stats: { totalUses: 3, successRate: 1.0, avgCoverage: 95, lastUsedInSprint: '' } }),
    ];
    const table = formatAgentStats(agents);
    expect(table).toContain('Alpha');
    expect(table).toContain('Beta');
  });

  it('includes table headers', () => {
    const agents: AgentDefinition[] = [
      createAgentDefinition({ id: 'a', name: 'Test', stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' } }),
    ];
    const table = formatAgentStats(agents);
    expect(table).toContain('| Agent |');
    expect(table).toContain('| Uses |');
  });
});

describe('enrichContextWithAgentStats', () => {
  it('returns context unchanged for empty agents', () => {
    const ctx = makeBrainContext();
    const enriched = enrichContextWithAgentStats(ctx, []);
    expect(enriched.directives).toBe('# DIRECTIVES');
  });

  it('appends agent stats to directives', () => {
    const agents: AgentDefinition[] = [
      createAgentDefinition({ id: 'x', name: 'XAgent', stats: { totalUses: 2, successRate: 0.5, avgCoverage: 60, lastUsedInSprint: '' } }),
    ];
    const ctx = makeBrainContext();
    const enriched = enrichContextWithAgentStats(ctx, agents);
    expect(enriched.directives).toContain('## Agent Pool Stats');
    expect(enriched.directives).toContain('XAgent');
  });

  it('does not mutate original context', () => {
    const agents: AgentDefinition[] = [
      createAgentDefinition({ id: 'x', name: 'X', stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' } }),
    ];
    const ctx = makeBrainContext();
    const original = ctx.directives;
    enrichContextWithAgentStats(ctx, agents);
    expect(ctx.directives).toBe(original);
  });
});

// ═══ Task 25: Skill Stats ═════════════════════════════════════════════════

describe('formatSkillStats', () => {
  it('returns "No skills available." for empty list', () => {
    expect(formatSkillStats([])).toBe('No skills available.');
  });

  it('formats skill table with stats', () => {
    const skills: SkillDefinition[] = [
      createSkillDefinition({
        id: 'ts-skill',
        name: 'TypeScript',
        category: 'language',
        stats: { totalUses: 20, successRate: 0.9, avgCoverage: 88, lastUsedInSprint: 'sprint-002' },
      }),
    ];
    const table = formatSkillStats(skills);
    expect(table).toContain('TypeScript');
    expect(table).toContain('20');
    expect(table).toContain('90%');
    expect(table).toContain('88%');
    expect(table).toContain('language');
  });

  it('formats multiple skills', () => {
    const skills: SkillDefinition[] = [
      createSkillDefinition({ id: 'a', name: 'SkillA', stats: { totalUses: 1, successRate: 0.5, avgCoverage: 50, lastUsedInSprint: '' } }),
      createSkillDefinition({ id: 'b', name: 'SkillB', stats: { totalUses: 2, successRate: 0.8, avgCoverage: 75, lastUsedInSprint: '' } }),
    ];
    const table = formatSkillStats(skills);
    expect(table).toContain('SkillA');
    expect(table).toContain('SkillB');
  });

  it('includes table headers', () => {
    const skills: SkillDefinition[] = [
      createSkillDefinition({ id: 'x', name: 'X', stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' } }),
    ];
    const table = formatSkillStats(skills);
    expect(table).toContain('| Skill |');
    expect(table).toContain('| Category |');
  });
});

describe('enrichContextWithSkillStats', () => {
  it('returns context unchanged for empty skills', () => {
    const ctx = makeBrainContext();
    const enriched = enrichContextWithSkillStats(ctx, []);
    expect(enriched.directives).toBe('# DIRECTIVES');
  });

  it('appends skill stats to directives', () => {
    const skills: SkillDefinition[] = [
      createSkillDefinition({ id: 'ts', name: 'TS', stats: { totalUses: 5, successRate: 0.7, avgCoverage: 80, lastUsedInSprint: '' } }),
    ];
    const ctx = makeBrainContext();
    const enriched = enrichContextWithSkillStats(ctx, skills);
    expect(enriched.directives).toContain('## Skill Pool Stats');
    expect(enriched.directives).toContain('TS');
  });

  it('does not mutate original context', () => {
    const skills: SkillDefinition[] = [
      createSkillDefinition({ id: 'x', name: 'X', stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' } }),
    ];
    const ctx = makeBrainContext();
    const original = ctx.directives;
    enrichContextWithSkillStats(ctx, skills);
    expect(ctx.directives).toBe(original);
  });
});

// ═══ Task 26: History Context ═════════════════════════════════════════════

describe('formatHistoryContext', () => {
  it('formats basic history data', () => {
    const history: SprintHistoryData = {
      taskTypes: { feature: 5, fix: 3 },
      models: { opus: 4, sonnet: 2 },
      successRate: 0.8,
      noGoPatterns: [],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('Success: 80%');
    expect(result).toContain('Models:');
    expect(result).toContain('Tasks:');
  });

  it('includes NoGo patterns', () => {
    const history: SprintHistoryData = {
      taskTypes: {},
      models: {},
      successRate: 0.5,
      noGoPatterns: ['Config validation failed'],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('NoGo patterns:');
    expect(result).toContain('Config validation failed');
  });

  it('limits to 3 NoGo patterns', () => {
    const history: SprintHistoryData = {
      taskTypes: {},
      models: {},
      successRate: 0.3,
      noGoPatterns: ['p1', 'p2', 'p3', 'p4', 'p5'],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('p1');
    expect(result).toContain('p3');
    expect(result).not.toContain('p4');
  });

  it('limits to 5 task types', () => {
    const history: SprintHistoryData = {
      taskTypes: { a: 10, b: 8, c: 6, d: 4, e: 2, f: 1 },
      models: {},
      successRate: 1,
      noGoPatterns: [],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('a:10');
    expect(result).not.toContain('f:1');
  });

  it('enforces max 500 chars', () => {
    const longPattern = 'A'.repeat(200);
    const history: SprintHistoryData = {
      taskTypes: { feature: 100 },
      models: { opus: 50 },
      successRate: 0.9,
      noGoPatterns: [longPattern, longPattern, longPattern],
    };
    const result = formatHistoryContext(history);
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('handles zero success rate', () => {
    const history: SprintHistoryData = {
      taskTypes: {},
      models: {},
      successRate: 0,
      noGoPatterns: [],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('Success: 0%');
  });

  it('handles 100% success rate', () => {
    const history: SprintHistoryData = {
      taskTypes: {},
      models: {},
      successRate: 1.0,
      noGoPatterns: [],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('Success: 100%');
  });
});

describe('enrichContextWithHistory', () => {
  it('returns context unchanged when no sprints dir', () => {
    mockedExistsSync.mockReturnValue(false as any);
    const ctx = makeBrainContext();
    const enriched = enrichContextWithHistory(ctx, '/project');
    expect(enriched.directives).toBe('# DIRECTIVES');
  });

  it('appends history to directives when sprint files exist', () => {
    mockedExistsSync.mockReturnValue(true as any);
    mockedReaddirSync.mockReturnValue(['sprint-001.md'] as any);
    const sprintContent = [
      '# sprint-001',
      '## Tasks',
      '- 001-001: Add feature (DONE)',
      '- 001-002: Fix bug (NO_GO)',
    ].join('\n');
    mockedReadFileSync.mockReturnValue(sprintContent as any);

    const ctx = makeBrainContext();
    const enriched = enrichContextWithHistory(ctx, '/project');
    expect(enriched.directives).toContain('## Sprint History');
    expect(enriched.directives).toContain('Success:');
  });

  it('returns context unchanged when sprint dir is empty', () => {
    mockedExistsSync.mockReturnValue(true as any);
    mockedReaddirSync.mockReturnValue([] as any);
    const ctx = makeBrainContext();
    const enriched = enrichContextWithHistory(ctx, '/project');
    expect(enriched.directives).toBe('# DIRECTIVES');
  });

  it('does not mutate original context', () => {
    mockedExistsSync.mockReturnValue(false as any);
    const ctx = makeBrainContext();
    const original = ctx.directives;
    enrichContextWithHistory(ctx, '/project');
    expect(ctx.directives).toBe(original);
  });

  it('uses default sprintRange of 5', () => {
    mockedExistsSync.mockReturnValue(true as any);
    mockedReaddirSync.mockReturnValue(
      Array.from({ length: 10 }, (_, i) => `sprint-${String(i).padStart(3, '0')}.md`) as any,
    );
    mockedReadFileSync.mockReturnValue('# sprint\n## Tasks\n- 001: Task (DONE)' as any);

    const ctx = makeBrainContext();
    enrichContextWithHistory(ctx, '/project');
    // Should only read last 5 files (default range)
    expect(mockedReadFileSync).toHaveBeenCalled();
  });
});
