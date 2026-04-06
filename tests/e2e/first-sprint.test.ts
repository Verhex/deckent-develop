/**
 * E2E Test: First Sprint Flow
 *
 * Simulates a new user's first sprint after init:
 * 1. Write DIRECTIVES.md with tasks
 * 2. Run plan (structured mode)
 * 3. Verify task files created
 * 4. Check status shows planned tasks
 * 5. Doctor health check on project with plan
 *
 * Mocks: tmux, child_process, auditor, worker
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Task, ResolvedConfig, DashboardState } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import {
  BRAIN_DIR, TASKS_DIR, DECKENT_DIR, DASHBOARD_FILE,
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
  spawn: vi.fn(),
  fork: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/monitor/auditor.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    resetDashboard: (actual as any).resetDashboard,
    updateDashboard: vi.fn(),
    detectDeadlocks: vi.fn().mockReturnValue([]),
    startScanLoop: vi.fn(),
    writeScanToDashboard: vi.fn(),
  };
});

vi.mock('../../src/agents/worker.js', () => ({
  releaseAllLocks: vi.fn(),
  updateTaskStatus: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  writeResult: vi.fn(),
}));

// ─── Real imports ────────────────────────────────────────────────────

import { createDefaultConfig } from '../../src/core/config.js';
import { planSprint, readContext } from '../../src/orchestra/brain.js';
import { resetDashboard as actualResetDashboard } from '../../src/monitor/auditor.js';
import { loadTaskFiles } from '../../src/cli/commands/status.js';
import { runDoctorChecks } from '../../src/cli/commands/doctor.js';
import {
  formatHumanDoctor, getReadinessLabel, getMemoryHealthLabel,
  getProviderSummary, getProviderTips, countDebtItems,
} from '../../src/cli/commands/doctor.js';

// ─── Test Helpers ────────────────────────────────────────────────────

function setupProject(root: string): void {
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, BRAIN_DIR, SPRINTS_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });

  const config = createDefaultConfig();
  writeFileSync(join(root, DECKENT_DIR, 'config.json'), JSON.stringify(config, null, 2));

  writeFileSync(join(root, BRAIN_DIR, MEMORY_FILE), '# Memory\n');
  writeFileSync(join(root, BRAIN_DIR, DECISIONS_FILE), '# Decisions\n');
  writeFileSync(join(root, BRAIN_DIR, DEBT_FILE), `# Tech Debt\n\n${DEBT_TABLE_HEADER}\n`);
  writeFileSync(join(root, BRAIN_DIR, PATTERNS_FILE), '[]');
  writeFileSync(join(root, BRAIN_DIR, RETRO_FILE), '# Retro\n');
}

function makeResolvedConfig(root: string): ResolvedConfig {
  return {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
      brain_planning: 'structured',
    },
    modes: {} as any,
    language: 'en',
    projectName: 'test-project',
    projectRoot: root,
    version: '1.0.0',
    auto_docs: { tier1: true, tier2: true, tier3: false },
  };
}

function writeDirectives(root: string, content: string): void {
  writeFileSync(join(root, DIRECTIVES_FILE), content);
}

function readDashboard(dashPath: string): DashboardState | null {
  if (!existsSync(dashPath)) return null;
  try {
    return JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
  } catch {
    return null;
  }
}

const SIMPLE_DIRECTIVES = `# DIRECTIVES — Sprint 001 (Hello World)

## Goal: Add a hello world function

---

## Task 1: Create hello.ts
- Model: sonnet
- Effort: low
- Files: src/hello.ts
- Scope: src/

### Description
Create a simple hello world function that returns a greeting.

### Tests
- Function returns "Hello, World!"
- Function accepts name parameter
`;

const MULTI_TASK_DIRECTIVES = `# DIRECTIVES — Sprint 002 (Feature Build)

## Goal: Add user auth and API endpoint

---

## Task 1: Auth Module
- Model: opus
- Effort: high
- Files: src/auth/login.ts, src/auth/register.ts
- Scope: src/auth/

### Description
Implement user authentication with login and register.

### Tests
- Login validates credentials
- Register creates user

---

## Task 2: API Endpoint
- Model: sonnet
- Effort: normal
- Files: src/api/users.ts
- Scope: src/api/

### Description
Create REST API endpoints for user management.

### Tests
- GET /users returns list
- POST /users creates user
`;

// ─── Tests ───────────────────────────────────────────────────────────

let tempDir: string;

describe('E2E: First Sprint Flow', () => {
  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-e2e-sprint-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- Plan creates task files ---

  it('planSprint creates task files from single-task directives', async () => {
    const root = join(tempDir, 'sprint-01');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, SIMPLE_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.id).toMatch(/^sprint-\d+$/);
    expect(sprint.tasks.length).toBeGreaterThanOrEqual(1);

    const taskFiles = readdirSync(join(root, TASKS_DIR))
      .filter(f => f.startsWith('task-') && f.endsWith('.json'));
    expect(taskFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('planSprint creates task files from multi-task directives', async () => {
    const root = join(tempDir, 'sprint-02');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, MULTI_TASK_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.tasks.length).toBeGreaterThanOrEqual(2);

    const taskFiles = readdirSync(join(root, TASKS_DIR))
      .filter(f => f.startsWith('task-') && f.endsWith('.json'));
    expect(taskFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('task files have valid schema', async () => {
    const root = join(tempDir, 'sprint-03');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, SIMPLE_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    for (const task of sprint.tasks) {
      expect(task.id).toBeDefined();
      expect(task.title).toBeDefined();
      expect(task.description).toBeDefined();
      expect(task.model).toBeTruthy();
      expect(['opus', 'sonnet', 'haiku']).toContain(task.model);
      expect(task.scope).toBeDefined();
      expect(task.scope.directories).toBeInstanceOf(Array);
      expect(task.sprintId).toBe(sprint.id);
    }
  });

  it('task files have correct sprint ID', async () => {
    const root = join(tempDir, 'sprint-04');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, SIMPLE_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    const taskFiles = readdirSync(join(root, TASKS_DIR))
      .filter(f => f.startsWith('task-') && f.endsWith('.json'));

    for (const file of taskFiles) {
      const task = JSON.parse(readFileSync(join(root, TASKS_DIR, file), 'utf-8')) as Task;
      expect(task.sprintId).toBe(sprint.id);
    }
  });

  it('sprint has correct phase and status after planning', async () => {
    const root = join(tempDir, 'sprint-05');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, SIMPLE_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    expect(sprint.phase).toBe(SprintPhase.PLAN);
    expect(sprint.status).toBe(SprintStatus.PLANNING);
  });

  // --- Status shows planned tasks ---

  it('loadTaskFiles reads task files from .tasks/', async () => {
    const root = join(tempDir, 'sprint-06');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, MULTI_TASK_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    await planSprint(root, config, context, recommendation, { mode: 'structured' });

    const tasks = loadTaskFiles(root);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    for (const task of tasks) {
      expect(task.id).toBeDefined();
      expect(task.title).toBeDefined();
    }
  });

  it('loadTaskFiles returns empty array when no tasks', () => {
    const root = join(tempDir, 'sprint-07');
    mkdirSync(root, { recursive: true });
    setupProject(root);

    const tasks = loadTaskFiles(root);
    expect(tasks).toEqual([]);
  });

  it('loadTaskFiles ignores non-task files', async () => {
    const root = join(tempDir, 'sprint-08');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, SIMPLE_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    await planSprint(root, config, context, recommendation, { mode: 'structured' });

    // Add some non-task files
    writeFileSync(join(root, TASKS_DIR, 'task-001-001.hb'), '{}');
    writeFileSync(join(root, TASKS_DIR, 'task-001-001.plan'), 'plan');
    writeFileSync(join(root, TASKS_DIR, 'README.md'), '# Tasks');

    const tasks = loadTaskFiles(root);
    // Should only read .json task files
    for (const task of tasks) {
      expect(task.id).toBeDefined();
    }
  });

  // --- Dashboard initialization ---

  it('resetDashboard creates .dashboard file after plan', async () => {
    const root = join(tempDir, 'sprint-09');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, SIMPLE_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });
    actualResetDashboard(root, sprint.id, sprint.tasks.length);

    const dashPath = join(root, DASHBOARD_FILE);
    expect(existsSync(dashPath)).toBe(true);

    const dashboard = readDashboard(dashPath);
    expect(dashboard).toBeTruthy();
    expect(dashboard!.sprint.id).toBe(sprint.id);
    expect(dashboard!.progress).toBeDefined();
    expect(typeof dashboard!.progress.total).toBe('number');
  });

  // --- Doctor on project with plan ---

  it('doctor passes on project with active plan', async () => {
    const root = join(tempDir, 'sprint-10');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, SIMPLE_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    await planSprint(root, config, context, recommendation, { mode: 'structured' });

    const result = runDoctorChecks(root);
    const wsCheck = result.checks.find(c => c.name === 'Workspace');
    const brainCheck = result.checks.find(c => c.name === 'Brain Dir');
    const dirCheck = result.checks.find(c => c.name === 'Directives');
    expect(wsCheck?.passed).toBe(true);
    expect(brainCheck?.passed).toBe(true);
    expect(dirCheck?.passed).toBe(true);
  });

  // --- Doctor helper functions ---

  it('getMemoryHealthLabel returns correct labels', () => {
    expect(getMemoryHealthLabel(30)).toBe('healthy');
    expect(getMemoryHealthLabel(50)).toBe('moderate');
    expect(getMemoryHealthLabel(80)).toBe('high');
    expect(getMemoryHealthLabel(101)).toBe('OVER BUDGET');
  });

  it('getProviderSummary formats correctly', () => {
    const providers = [
      { name: 'claude' as const, available: true, version: '1.0', authMethod: 'session' as const },
      { name: 'codex' as const, available: false },
      { name: 'gemini' as const, available: false },
    ];
    const summary = getProviderSummary(providers);
    expect(summary).toBe('1/3 providers ready');
  });

  it('getReadinessLabel returns READY when all required pass', () => {
    const result = {
      ok: true,
      checks: [
        { name: 'Node.js', passed: true, message: 'ok', required: true },
        { name: 'git', passed: true, message: 'ok', required: true },
      ],
    };
    const label = getReadinessLabel(result, 100, 600);
    expect(label).toBe('READY');
  });

  it('getReadinessLabel returns NOT READY when required fails', () => {
    const result = {
      ok: false,
      checks: [
        { name: 'Node.js', passed: false, message: 'missing', required: true },
      ],
    };
    const label = getReadinessLabel(result, 100, 600);
    expect(label).toBe('NOT READY');
  });

  it('getReadinessLabel returns READY with warnings for optional failures', () => {
    const result = {
      ok: true,
      checks: [
        { name: 'Node.js', passed: true, message: 'ok', required: true },
        { name: 'Workspace', passed: false, message: 'missing', required: false },
      ],
    };
    const label = getReadinessLabel(result, 100, 600);
    expect(label).toBe('READY (with warnings)');
  });

  it('countDebtItems returns zero for fresh project', () => {
    const root = join(tempDir, 'sprint-debt');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    const items = countDebtItems(root);
    expect(items.total).toBe(0);
    expect(items.critical).toBe(0);
  });

  it('getProviderTips suggests correct setup for missing providers', () => {
    const providers = [
      { name: 'claude' as const, available: true },
      { name: 'codex' as const, available: false },
      { name: 'gemini' as const, available: false },
    ];
    const tips = getProviderTips(providers);
    expect(tips.length).toBe(2);
    expect(tips.some(t => t.includes('OPENAI_API_KEY'))).toBe(true);
    expect(tips.some(t => t.includes('GOOGLE_API_KEY'))).toBe(true);
  });

  // --- Full cleanup ---

  it('full cleanup removes all project artifacts', async () => {
    const root = join(tempDir, 'sprint-cleanup');
    mkdirSync(root, { recursive: true });
    setupProject(root);
    writeDirectives(root, SIMPLE_DIRECTIVES);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    await planSprint(root, config, context, recommendation, { mode: 'structured' });
    actualResetDashboard(root, 'sprint-001', 1);

    // Verify artifacts exist
    expect(existsSync(join(root, DECKENT_DIR))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR))).toBe(true);
    expect(existsSync(join(root, TASKS_DIR))).toBe(true);
    expect(existsSync(join(root, DASHBOARD_FILE))).toBe(true);

    // Clean up
    rmSync(root, { recursive: true, force: true });
    expect(existsSync(root)).toBe(false);
  });
});
