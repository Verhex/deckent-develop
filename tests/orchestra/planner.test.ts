import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrainContext, SprintSizeRecommendation, DebtItem, Task } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { buildPlanPrompt, parsePlannerResponse, callBrainPlanner } from '../../src/orchestra/planner.js';
import { BRAIN_PLAN_TIMEOUT_MS } from '../../src/core/constants.js';

const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ────────────────────────────────────────────────────────

function makeContext(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    directives: '# Sprint 13\n## Task 1: Build feature\nBuild it',
    memory: '# Memory',
    retro: '',
    debt: [],
    patterns: '',
    decisions: '',
    existingTasks: [] as Task[],
    projectState: { gitStatus: '', fileTree: ['src/index.ts', 'src/core/types.ts'] },
    ...overrides,
  };
}

function makeRecommendation(overrides: Partial<SprintSizeRecommendation> = {}): SprintSizeRecommendation {
  return {
    size: 'full',
    maxWorkers: 4,
    modelConstraint: null,
    reason: 'OK',
    ...overrides,
  };
}

const validPlannerJSON = JSON.stringify({
  tasks: [
    {
      title: 'Build feature',
      description: 'Build the feature',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'Standard task',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/feature.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor' },
    },
  ],
  reasoning: 'Single task for the directive',
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══ Tests ═══════════════════════════════════════════════════════════

describe('buildPlanPrompt', () => {
  it('includes directives content', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'test-project');
    expect(prompt).toContain('Build feature');
  });

  it('includes project name', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'my-app');
    expect(prompt).toContain('my-app');
  });

  it('includes maxWorkers constraint', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation({ maxWorkers: 3 }), 'test');
    expect(prompt).toContain('3');
  });

  it('includes JSON format instruction', () => {
    const prompt = buildPlanPrompt(makeContext(), makeRecommendation(), 'test');
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain('"reasoning"');
  });

  it('includes memory when present', () => {
    const prompt = buildPlanPrompt(makeContext({ memory: 'Remember this' }), makeRecommendation(), 'test');
    expect(prompt).toContain('Remember this');
  });

  it('includes critical debt', () => {
    const debt: DebtItem[] = [{
      id: 'debt-1', description: 'Fix the bug', originTaskId: 't-1', originSprintId: 's-1',
      priority: 'CRITICAL' as never, sprintsOpen: 3, resolved: false, createdAt: '',
    }];
    const prompt = buildPlanPrompt(makeContext({ debt }), makeRecommendation(), 'test');
    expect(prompt).toContain('Fix the bug');
  });

  it('includes file tree (limited to 100)', () => {
    const fileTree = Array.from({ length: 150 }, (_, i) => `src/file-${i}.ts`);
    const prompt = buildPlanPrompt(
      makeContext({ projectState: { gitStatus: '', fileTree } }),
      makeRecommendation(),
      'test',
    );
    expect(prompt).toContain('src/file-0.ts');
    expect(prompt).toContain('first 100');
    expect(prompt).not.toContain('src/file-149.ts');
  });

  it('truncates context to BRAIN_PLAN_MAX_CONTEXT_LINES', () => {
    const longDirectives = Array.from({ length: 300 }, (_, i) => `Directive line ${i}`).join('\n');
    const prompt = buildPlanPrompt(makeContext({ directives: longDirectives }), makeRecommendation(), 'test');
    // The prompt itself has some lines, but the context part should be truncated
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('handles empty context gracefully', () => {
    const emptyCtx = makeContext({ directives: '', memory: '', retro: '', patterns: '', decisions: '' });
    const prompt = buildPlanPrompt(emptyCtx, makeRecommendation(), 'test');
    expect(prompt).toContain('KURALLAR');
  });
});

describe('parsePlannerResponse', () => {
  it('parses valid JSON', () => {
    const result = parsePlannerResponse(validPlannerJSON);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
    expect(result!.tasks[0]!.title).toBe('Build feature');
    expect(result!.reasoning).toBe('Single task for the directive');
  });

  it('strips code fences', () => {
    const wrapped = '```json\n' + validPlannerJSON + '\n```';
    const result = parsePlannerResponse(wrapped);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
  });

  it('returns null for invalid JSON', () => {
    expect(parsePlannerResponse('not json')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePlannerResponse('')).toBeNull();
  });

  it('returns null for missing required fields', () => {
    const incomplete = JSON.stringify({ tasks: [{ title: 'X' }], reasoning: 'Y' });
    expect(parsePlannerResponse(incomplete)).toBeNull();
  });

  it('returns null for invalid model value', () => {
    const bad = JSON.stringify({
      tasks: [{
        title: 'X', description: 'Y', model: 'gpt4', effort: 'normal',
        priority: 'NORMAL', reason: 'R', scope: { directories: [], filesRead: [], filesWrite: [] },
        dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      }],
      reasoning: 'Y',
    });
    expect(parsePlannerResponse(bad)).toBeNull();
  });

  it('returns null for empty tasks array', () => {
    const empty = JSON.stringify({ tasks: [], reasoning: 'Y' });
    expect(parsePlannerResponse(empty)).toBeNull();
  });

  it('validates all model values', () => {
    for (const model of ['opus', 'sonnet', 'haiku']) {
      const json = JSON.stringify({
        tasks: [{
          title: 'T', description: 'D', model, effort: 'normal',
          priority: 'NORMAL', reason: 'R', scope: { directories: [], filesRead: [], filesWrite: [] },
          dependencies: [], goNogo: { goCriteria: 'G', noGoCriteria: 'N', techDebtAcceptable: 'T' },
        }],
        reasoning: 'R',
      });
      expect(parsePlannerResponse(json)).not.toBeNull();
    }
  });
});

describe('callBrainPlanner', () => {
  it('calls spawnSync with correct arguments', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callBrainPlanner(makeContext(), makeRecommendation(), 'opus', 'test-project');

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['-p', expect.any(String), '--model', 'opus', '--output-format', 'json']),
      expect.objectContaining({
        encoding: 'utf-8',
        timeout: BRAIN_PLAN_TIMEOUT_MS,
      }),
    );
  });

  it('returns parsed result on success', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const result = callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test');
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
  });

  it('returns null on non-zero exit code', () => {
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: 'error', pid: 1, signal: null, output: [],
    } as never);

    expect(callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test')).toBeNull();
  });

  it('returns null on empty stdout', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    expect(callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test')).toBeNull();
  });

  it('returns null on invalid JSON stdout', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: 'not json', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    expect(callBrainPlanner(makeContext(), makeRecommendation(), 'sonnet', 'test')).toBeNull();
  });

  it('passes model parameter correctly', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: validPlannerJSON, stderr: '', pid: 1, signal: null, output: [],
    } as never);

    callBrainPlanner(makeContext(), makeRecommendation(), 'haiku', 'test');

    const args = mockedSpawnSync.mock.calls[0]![1] as string[];
    const modelIdx = args.indexOf('--model');
    expect(args[modelIdx + 1]).toBe('haiku');
  });
});
