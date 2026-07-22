/**
 * Task 021-001: planSprint Task Limit Fix
 *
 * Tests verifying that:
 * - parseStructuredDirectives parses ALL ## Görev N: blocks (no max_workers cap)
 * - planSprint creates ALL task JSONs regardless of max_workers
 * - spawnWorkers spawns only Math.min(taskCount, max_workers) initially
 * - Dashboard progress.total = all task count
 * - buildPlanPrompt does NOT limit task count to max_workers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, BrainContext, SprintSizeRecommendation } from '../../src/core/types.js';
import type { SpawnBackend } from '../../src/orchestra/spawn-backend.js';
import {
  TASKS_DIR, BRAIN_DIR, DECKENT_DIR, SPRINTS_DIR,
  DIRECTIVES_FILE, DASHBOARD_FILE,
} from '../../src/core/constants.js';
import { buildPlanPrompt } from '../../src/orchestra/planner.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  isSessionActive: vi.fn().mockReturnValue(false),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  sendKeys: vi.fn(),
  TmuxError: class TmuxError extends Error {
    command?: string;
    constructor(m: string, c?: string) { super(m); this.name = 'TmuxError'; this.command = c; }
  },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  }),
}));

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn().mockResolvedValue('y'),
    close: vi.fn(),
  })),
}));

// ─── Import after mocks ──────────────────────────────────────────────

import { planSprint, spawnWorkers, parseStructuredDirectives } from '../../src/orchestra/brain.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function setupProjectDir(root: string): void {
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, BRAIN_DIR, SPRINTS_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  const emptyDash = {
    sprint: null, agents: [], progress: { done: 0, active: 0, blocked: 0, total: 0 },
    alerts: [], updatedAt: '',
  };
  writeFileSync(join(root, DASHBOARD_FILE), JSON.stringify(emptyDash));
}

function setupBrainDir(root: string, directives = ''): void {
  writeFileSync(join(root, DECKENT_DIR, 'config.json'), JSON.stringify({ mode: 'max_plan' }, null, 2));
  writeFileSync(join(root, DIRECTIVES_FILE), directives);
  writeFileSync(join(root, BRAIN_DIR, 'MEMORY.md'), '# Memory\n');
  writeFileSync(join(root, BRAIN_DIR, 'DECISIONS.md'), '# Decisions\n');
  writeFileSync(join(root, BRAIN_DIR, 'DEBT.md'), '# Debt\n\n| ID | Description | Priority | Resolved |\n|---|---|---|---|\n');
  writeFileSync(join(root, BRAIN_DIR, 'PATTERNS.md'), '[]');
  writeFileSync(join(root, BRAIN_DIR, 'RETRO.md'), '# Retro\n');
}

function makeConfig(root: string, maxWorkers = 8): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: maxWorkers,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
      haiku_allowed: true,
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test',
    projectRoot: root,
    version: '0.1.0',
  };
}

function makeRecommendation(maxWorkers = 8): SprintSizeRecommendation {
  return { size: 'full', maxWorkers, modelConstraint: null, reason: '' };
}

function makeBrainContext(directives: string): BrainContext {
  return {
    directives,
    memory: '',
    decisions: '',
    debt: [],
    patterns: '',
    retro: '',
    existingTasks: [],
    projectState: { gitStatus: '', fileTree: ['src/index.ts'] },
  };
}

/** Generate a DIRECTIVES.md with N structured ## Görev N: blocks */
function makeStructuredDirectives(count: number): string {
  const header = `# DIRECTIVES — Sprint Test\n\n## Hedef\nTest sprint.\n\n---\n\n`;
  const blocks = Array.from({ length: count }, (_, i) =>
    `## Görev ${i + 1}: Task ${i + 1} description (P${i % 3 === 0 ? '0' : '1'})\n` +
    `- Dosya: src/core/module${i + 1}.ts\n` +
    `- Kapsam: src/core/\n` +
    `- Test: unit tests for module ${i + 1}\n`,
  );
  return header + blocks.join('\n');
}

function makeTask(id: string, sprintId = 'sprint-001', overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId,
    createdAt: new Date().toISOString(),
    budget: { maxTurns: 1 },
    ...overrides,
  };
}

function makeMockBackend(): SpawnBackend {
  return {
    name: 'measured-test',
    liveUsageBudgetSupport: 'measured-stream',
    spawn: vi.fn(),
    kill: vi.fn(),
    list: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: 'planning' as Sprint['status'],
    phase: 'PLAN' as Sprint['phase'],
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// GROUP 1: buildPlanPrompt — no max_workers task cap in AI prompt
// ═══════════════════════════════════════════════════════════════════════

describe('buildPlanPrompt — max_workers is execution limit, not task count cap', () => {
  it('does NOT instruct AI to limit task count to maxWorkers', () => {
    const ctx = makeBrainContext('## Görev 1: Task 1\n## Görev 2: Task 2');
    const prompt = buildPlanPrompt(ctx, makeRecommendation(8), 'test-project');
    expect(prompt).not.toMatch(/Maksimum\s+\d+\s+görev oluştur/);
  });

  it('instructs AI to plan ALL directive tasks', () => {
    const ctx = makeBrainContext('## Görev 1: Task 1\n## Görev 2: Task 2');
    const prompt = buildPlanPrompt(ctx, makeRecommendation(3), 'test-project');
    expect(prompt).toContain('Plan ALL tasks');
  });

  it('includes maxWorkers value as concurrent execution limit info', () => {
    const ctx = makeBrainContext('## Görev 1: Task 1');
    const prompt = buildPlanPrompt(ctx, makeRecommendation(12), 'test-project');
    // maxWorkers is mentioned as concurrent limit, not task cap
    expect(prompt).toContain('12');
    expect(prompt).toContain('max_workers');
  });

  it('max_workers=8 does not create a "create at most 8 tasks" instruction', () => {
    const ctx = makeBrainContext('directives content');
    const prompt = buildPlanPrompt(ctx, makeRecommendation(8), 'test-project');
    expect(prompt).not.toContain('Maksimum 8 görev');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 2: parseStructuredDirectives — parses ALL blocks
// ═══════════════════════════════════════════════════════════════════════

describe('parseStructuredDirectives — parses ALL ## Görev blocks regardless of count', () => {
  it('parses 14 ## Görev blocks from a 14-task directive', () => {
    const content = makeStructuredDirectives(14);
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(14);
  });

  it('parses 20 ## Görev blocks from a 20-task directive', () => {
    const content = makeStructuredDirectives(20);
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(20);
  });

  it('parses 12 blocks (Sprint 21 size)', () => {
    const content = makeStructuredDirectives(12);
    const tasks = parseStructuredDirectives(content);
    expect(tasks).toHaveLength(12);
  });

  it('each parsed task has a non-empty title', () => {
    const content = makeStructuredDirectives(14);
    const tasks = parseStructuredDirectives(content);
    for (const task of tasks) {
      expect(task.title.length).toBeGreaterThan(0);
    }
  });

  it('each parsed task has a non-empty description', () => {
    const content = makeStructuredDirectives(14);
    const tasks = parseStructuredDirectives(content);
    for (const task of tasks) {
      expect(task.description.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 3: planSprint — creates ALL tasks regardless of max_workers
// ═══════════════════════════════════════════════════════════════════════

describe('planSprint — creates ALL task JSONs regardless of max_workers', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-tasklimit-plan-'));
    setupProjectDir(root);
    setupBrainDir(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates 14 task JSONs when max_workers=8 and 14 structured directives', async () => {
    const directives = makeStructuredDirectives(14);
    const context = makeBrainContext(directives);
    const config = makeConfig(root, 8);
    const recommendation = makeRecommendation(8);

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.tasks.length).toBe(14);
    const taskFiles = readdirSync(join(root, TASKS_DIR)).filter(f => f.endsWith('.json'));
    expect(taskFiles.length).toBe(14);
  });

  it('creates 20 task JSONs when max_workers=6 and 20 structured directives', async () => {
    const directives = makeStructuredDirectives(20);
    const context = makeBrainContext(directives);
    const config = makeConfig(root, 6);
    const recommendation = makeRecommendation(6);

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.tasks.length).toBe(20);
    const taskFiles = readdirSync(join(root, TASKS_DIR)).filter(f => f.endsWith('.json'));
    expect(taskFiles.length).toBe(20);
  });

  it('sprint.workers length equals all task count (not max_workers)', async () => {
    const directives = makeStructuredDirectives(14);
    const context = makeBrainContext(directives);
    const config = makeConfig(root, 8);
    const recommendation = makeRecommendation(8);

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.workers.length).toBe(14);
  });

  it('each task JSON file is valid and contains required fields', async () => {
    const directives = makeStructuredDirectives(5);
    const context = makeBrainContext(directives);
    const config = makeConfig(root, 2);
    const recommendation = makeRecommendation(2);

    await planSprint(root, config, context, recommendation, { mode: 'structured' });

    const taskFiles = readdirSync(join(root, TASKS_DIR)).filter(f => f.endsWith('.json'));
    for (const file of taskFiles) {
      const task = JSON.parse(readFileSync(join(root, TASKS_DIR, file), 'utf-8'));
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('model');
      expect(task).toHaveProperty('status');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 4: spawnWorkers — max_workers limits spawn, not total task count
// ═══════════════════════════════════════════════════════════════════════

describe('spawnWorkers — max_workers limits concurrent spawn only', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-tasklimit-spawn-'));
    setupProjectDir(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('with 14 tasks and max_workers=8, spawns exactly 8 workers', async () => {
    const tasks = Array.from({ length: 14 }, (_, i) => makeTask(`001-${String(i + 1).padStart(3, '0')}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 8);
    const backend = makeMockBackend();

    await spawnWorkers(root, sprint, config, { spawnBackend: backend });

    expect(backend.spawn).toHaveBeenCalledTimes(8);
  });

  it('with 14 tasks and max_workers=8, returns 6 queued tasks', async () => {
    const tasks = Array.from({ length: 14 }, (_, i) => makeTask(`001-${String(i + 1).padStart(3, '0')}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 8);

    const queue = await spawnWorkers(root, sprint, config, { spawnBackend: makeMockBackend() });

    expect(queue.length).toBe(6);
  });

  it('with 20 tasks and max_workers=8, returns 12 queued tasks', async () => {
    const tasks = Array.from({ length: 20 }, (_, i) => makeTask(`001-${String(i + 1).padStart(3, '0')}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 8);

    const backend = makeMockBackend();
    const queue = await spawnWorkers(root, sprint, config, { spawnBackend: backend });

    expect(queue.length).toBe(12);
    expect(backend.spawn).toHaveBeenCalledTimes(8);
  });

  it('dashboard progress.total = all 14 tasks (not just active 8)', async () => {
    const tasks = Array.from({ length: 14 }, (_, i) => makeTask(`001-${String(i + 1).padStart(3, '0')}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 8);

    await spawnWorkers(root, sprint, config, { spawnBackend: makeMockBackend() });

    const dashboard = JSON.parse(readFileSync(join(root, DASHBOARD_FILE), 'utf-8'));
    expect(dashboard.progress.total).toBe(14);
    expect(dashboard.progress.active).toBe(8);
  });

  it('dashboard progress.total = all 20 tasks when max_workers=8', async () => {
    const tasks = Array.from({ length: 20 }, (_, i) => makeTask(`001-${String(i + 1).padStart(3, '0')}`));
    const sprint = makeSprint(tasks);
    const config = makeConfig(root, 8);

    await spawnWorkers(root, sprint, config, { spawnBackend: makeMockBackend() });

    const dashboard = JSON.parse(readFileSync(join(root, DASHBOARD_FILE), 'utf-8'));
    expect(dashboard.progress.total).toBe(20);
  });
});
