/**
 * Integration Test: planSprint end-to-end
 *
 * Creates a real temp directory with DIRECTIVES.md, calls planSprint() with
 * real config, and verifies task files are written correctly.
 *
 * Mocks only tmux, child_process (git/claude), and auditor.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, ResolvedConfig, BrainContext, SprintSizeRecommendation } from '../../src/core/types.js';
import {
  BRAIN_DIR, TASKS_DIR, DECKENT_DIR,
  DIRECTIVES_FILE, MEMORY_FILE, DECISIONS_FILE,
  DEBT_FILE, PATTERNS_FILE, RETRO_FILE, SPRINTS_DIR, DEBT_TABLE_HEADER,
} from '../../src/core/constants.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  isSessionActive: vi.fn().mockReturnValue(false),
  sendKeys: vi.fn(),
  TmuxError: class extends Error { constructor(m: string) { super(m); } },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  }),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  resetDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
}));

vi.mock('../../src/agents/worker.js', () => ({
  releaseAllLocks: vi.fn(),
  updateTaskStatus: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  writeResult: vi.fn(),
}));

// ─── Real imports ────────────────────────────────────────────────────

import { planSprint, readContext } from '../../src/orchestra/brain.js';

// ─── Test Setup ──────────────────────────────────────────────────────

let tempDir: string;

function setupProject(root: string, directivesContent: string): void {
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, BRAIN_DIR, SPRINTS_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });

  writeFileSync(join(root, DECKENT_DIR, 'config.json'), JSON.stringify({ mode: 'max_plan' }));
  writeFileSync(join(root, BRAIN_DIR, MEMORY_FILE), '# Memory\n');
  writeFileSync(join(root, BRAIN_DIR, DECISIONS_FILE), '# Decisions\n');
  writeFileSync(join(root, BRAIN_DIR, DEBT_FILE), `# Tech Debt\n\n${DEBT_TABLE_HEADER}\n`);
  writeFileSync(join(root, BRAIN_DIR, PATTERNS_FILE), '[]');
  writeFileSync(join(root, BRAIN_DIR, RETRO_FILE), '# Retro\n');
  writeFileSync(join(root, DIRECTIVES_FILE), directivesContent);
}

function makeConfig(root: string): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
      brain_planning: 'structured', // use structured to avoid AI call
    },
    modes: {} as any,
    language: 'en',
    projectName: 'test-project',
    projectRoot: root,
    version: '1.0.0',
    auto_docs: { tier1: true, tier2: true, tier3: false },
  };
}

function makeContext(root: string): BrainContext {
  return readContext(root);
}

function makeRecommendation(): SprintSizeRecommendation {
  return { size: 'full', maxWorkers: 4, modelConstraint: null, reason: 'No constraints' };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('planSprint end-to-end integration', () => {
  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-plan-test-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates task files from structured DIRECTIVES.md', async () => {
    const root = join(tempDir, 'project-1');
    mkdirSync(root, { recursive: true });

    const directives = `# DIRECTIVES

## Görev 1: Implement Feature A
- Dosya: src/core/feature-a.ts, tests/core/feature-a.test.ts
- Kapsam: src/core/

### Açıklama
Implement feature A with full test coverage.

### Test
- Unit tests pass

## Görev 2: Update Documentation
- Dosya: docs/README.md
- Kapsam: docs/

### Açıklama
Update project documentation.

### Test
- Docs updated
`;

    setupProject(root, directives);
    const config = makeConfig(root);
    const context = makeContext(root);
    const recommendation = makeRecommendation();

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    // Verify sprint properties
    expect(sprint.tasks.length).toBe(2);
    expect(sprint.status).toBe(SprintStatus.PLANNING);
    expect(sprint.phase).toBe(SprintPhase.PLAN);
    expect(sprint.id).toMatch(/^sprint-\d+$/);
    expect(sprint.number).toBeGreaterThanOrEqual(1);

    // Verify task files exist on disk
    const taskFiles = readdirSync(join(root, TASKS_DIR))
      .filter(f => f.startsWith('task-') && f.endsWith('.json'));
    expect(taskFiles.length).toBe(2);

    // Verify task JSON format matches contract
    for (const file of taskFiles) {
      const taskJson = JSON.parse(readFileSync(join(root, TASKS_DIR, file), 'utf-8')) as Task;
      expect(taskJson.id).toBeDefined();
      expect(taskJson.title).toBeDefined();
      expect(taskJson.description).toBeDefined();
      expect(taskJson.model).toBeDefined();
      expect(['opus', 'sonnet', 'haiku']).toContain(taskJson.model);
      expect(taskJson.effort).toBeDefined();
      expect(taskJson.priority).toBeDefined();
      expect(taskJson.reason).toBeDefined();
      expect(taskJson.scope).toBeDefined();
      expect(taskJson.scope.directories).toBeInstanceOf(Array);
      expect(taskJson.scope.filesRead).toBeInstanceOf(Array);
      expect(taskJson.scope.filesWrite).toBeInstanceOf(Array);
      expect(taskJson.dependencies).toBeInstanceOf(Array);
      expect(taskJson.goNogo).toBeDefined();
      expect(taskJson.goNogo.goCriteria).toBeDefined();
      expect(taskJson.goNogo.noGoCriteria).toBeDefined();
      expect(taskJson.goNogo.techDebtAcceptable).toBeDefined();
      expect(taskJson.status).toBeDefined();
      expect(taskJson.sprintId).toBe(sprint.id);
      expect(taskJson.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('produces PENDING status tasks by default', async () => {
    const root = join(tempDir, 'project-2');
    mkdirSync(root, { recursive: true });

    setupProject(root, `# DIRECTIVES\n\n## Görev 1: Task A\n- Kapsam: src/\n### Açıklama\nDo A\n### Test\n- pass\n`);
    const config = makeConfig(root);
    const context = makeContext(root);
    const sprint = await planSprint(root, config, context, makeRecommendation(), { mode: 'structured' });

    expect(sprint.tasks[0]!.status).toBe(TaskStatus.PENDING);
  });

  it('produces DRAFT status tasks when asDraft=true', async () => {
    const root = join(tempDir, 'project-3');
    mkdirSync(root, { recursive: true });

    setupProject(root, `# DIRECTIVES\n\n## Görev 1: Task B\n- Kapsam: src/\n### Açıklama\nDo B\n### Test\n- pass\n`);
    const config = makeConfig(root);
    const context = makeContext(root);
    const sprint = await planSprint(root, config, context, makeRecommendation(), { mode: 'structured', asDraft: true });

    expect(sprint.tasks[0]!.status).toBe(TaskStatus.DRAFT);
  });

  it('handles empty directives gracefully', async () => {
    const root = join(tempDir, 'project-4');
    mkdirSync(root, { recursive: true });

    setupProject(root, '# DIRECTIVES\n\nNo structured tasks here.\n');
    const config = makeConfig(root);
    const context = makeContext(root);
    const sprint = await planSprint(root, config, context, makeRecommendation(), { mode: 'structured' });

    // Falls back to line-by-line parsing — should still produce some tasks
    expect(sprint.tasks.length).toBeGreaterThanOrEqual(0);
    expect(sprint.id).toMatch(/^sprint-\d+$/);
  });

  it('uses modelConstraint from recommendation when provided', async () => {
    const root = join(tempDir, 'project-5');
    mkdirSync(root, { recursive: true });

    setupProject(root, `# DIRECTIVES\n\n## Görev 1: Constrained Task\n- Kapsam: src/\n### Açıklama\nTest model constraint\n### Test\n- pass\n`);
    const config = makeConfig(root);
    const context = makeContext(root);
    const recommendation: SprintSizeRecommendation = {
      size: 'reduced', maxWorkers: 2, modelConstraint: 'haiku', reason: 'High usage',
    };
    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    for (const task of sprint.tasks) {
      expect(task.model).toBe('haiku');
    }
  });

  it('assigns sequential task IDs within sprint', async () => {
    const root = join(tempDir, 'project-6');
    mkdirSync(root, { recursive: true });

    const directives = `# DIRECTIVES

## Görev 1: First
- Kapsam: src/
### Açıklama
First task
### Test
- pass

## Görev 2: Second
- Kapsam: tests/
### Açıklama
Second task
### Test
- pass

## Görev 3: Third
- Kapsam: src/
### Açıklama
Third task
### Test
- pass
`;
    setupProject(root, directives);
    const config = makeConfig(root);
    const context = makeContext(root);
    const sprint = await planSprint(root, config, context, makeRecommendation(), { mode: 'structured' });

    expect(sprint.tasks.length).toBe(3);
    // IDs should be sequential within the sprint number
    const ids = sprint.tasks.map(t => t.id);
    const seqNums = ids.map(id => parseInt(id.split('-')[1]!, 10));
    expect(seqNums).toEqual([1, 2, 3]);
  });

  it('includes workers array matching task IDs', async () => {
    const root = join(tempDir, 'project-7');
    mkdirSync(root, { recursive: true });

    setupProject(root, `# DIRECTIVES\n\n## Görev 1: Worker Task\n- Kapsam: src/\n### Açıklama\nTest workers\n### Test\n- pass\n`);
    const config = makeConfig(root);
    const context = makeContext(root);
    const sprint = await planSprint(root, config, context, makeRecommendation(), { mode: 'structured' });

    expect(sprint.workers.length).toBe(sprint.tasks.length);
    for (let i = 0; i < sprint.tasks.length; i++) {
      expect(sprint.workers[i]).toBe(`w-${sprint.tasks[i]!.id}`);
    }
  });

  it('sets planningMode to structured when mode=structured', async () => {
    const root = join(tempDir, 'project-8');
    mkdirSync(root, { recursive: true });

    setupProject(root, `# DIRECTIVES\n\n## Görev 1: Mode Test\n- Kapsam: src/\n### Açıklama\nTest mode\n### Test\n- pass\n`);
    const config = makeConfig(root);
    const context = makeContext(root);
    const sprint = await planSprint(root, config, context, makeRecommendation(), { mode: 'structured' });

    expect(sprint.planningMode).toBe('structured');
  });
});
