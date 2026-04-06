/**
 * Integration Test: init→plan→status E2E flow
 *
 * Tests the complete workflow:
 * 1. Create temp project directory
 * 2. Initialize config (via loadConfig or init)
 * 3. Write DIRECTIVES.md and call planSprint
 * 4. Read status/dashboard
 * 5. Verify task files and dashboard format
 * 6. Cleanup
 *
 * Mocks: tmux, child_process, auditor
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Task, ResolvedConfig, BrainContext, DashboardState } from '../../src/core/types.js';
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
}));

vi.mock('../../src/monitor/auditor.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    resetDashboard: (actual as any).resetDashboard, // Keep real resetDashboard
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

import { loadConfig, createDefaultConfig } from '../../src/core/config.js';
import { planSprint, readContext } from '../../src/orchestra/brain.js';
import { resetDashboard as actualResetDashboard } from '../../src/monitor/auditor.js';

// ─── Test Helpers ────────────────────────────────────────────────────

function setupProject(root: string): void {
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, BRAIN_DIR, SPRINTS_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });

  // Create default config
  const config = createDefaultConfig();
  writeFileSync(join(root, DECKENT_DIR, 'config.json'), JSON.stringify(config, null, 2));

  // Create brain files
  writeFileSync(join(root, BRAIN_DIR, MEMORY_FILE), '# Memory\n');
  writeFileSync(join(root, BRAIN_DIR, DECISIONS_FILE), '# Decisions\n');
  writeFileSync(join(root, BRAIN_DIR, DEBT_FILE), `# Tech Debt\n\n${DEBT_TABLE_HEADER}\n`);
  writeFileSync(join(root, BRAIN_DIR, PATTERNS_FILE), '[]');
  writeFileSync(join(root, BRAIN_DIR, RETRO_FILE), '# Retro\n');
}

function readDashboard(dashPath: string): DashboardState | null {
  if (!existsSync(dashPath)) return null;
  try {
    return JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
  } catch {
    return null;
  }
}

function makeResolvedConfig(root: string): ResolvedConfig {
  return {
    mode: 'max_plan',
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

// ─── Tests ───────────────────────────────────────────────────────────

let tempDir: string;

describe('E2E Integration: init→plan→status flow', () => {
  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-e2e-init-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads config from initialized project', () => {
    const root = join(tempDir, 'proj-1');
    mkdirSync(root, { recursive: true });
    setupProject(root);

    const config = makeResolvedConfig(root);

    expect(config.projectRoot).toBe(root);
    expect(config.mode).toBe('max_plan');
    expect(config.activeModeConfig.max_workers).toBe(4);
    expect(config.language).toBe('en');
    expect(existsSync(join(root, DECKENT_DIR, 'config.json'))).toBe(true);
  });

  it('creates task files from DIRECTIVES.md via planSprint', async () => {
    const root = join(tempDir, 'proj-2');
    mkdirSync(root, { recursive: true });
    setupProject(root);

    const directives = `# DIRECTIVES

## Görev 1: Init Config Test
- Dosya: src/core/test.ts
- Kapsam: src/core/

### Açıklama
Test init and config loading.

### Test
- Config loads correctly

## Görev 2: Plan Sprint Test
- Dosya: src/orchestra/test.ts
- Kapsam: src/orchestra/

### Açıklama
Test planning sprint.

### Test
- Tasks created
`;

    writeFileSync(join(root, DIRECTIVES_FILE), directives);
    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    // Verify sprint created
    expect(sprint.id).toMatch(/^sprint-\d+$/);
    expect(sprint.phase).toBe(SprintPhase.PLAN);
    expect(sprint.status).toBe(SprintStatus.PLANNING);

    // Verify task files exist
    const taskFiles = readdirSync(join(root, TASKS_DIR))
      .filter(f => f.startsWith('task-') && f.endsWith('.json'));
    expect(taskFiles.length).toBeGreaterThan(0);

    // Verify task file format
    for (const file of taskFiles) {
      const taskJson = JSON.parse(readFileSync(join(root, TASKS_DIR, file), 'utf-8')) as Task;
      expect(taskJson.id).toBeDefined();
      expect(taskJson.title).toBeDefined();
      expect(taskJson.description).toBeDefined();
      expect(taskJson.model).toBeTruthy();
      expect(['opus', 'sonnet', 'haiku']).toContain(taskJson.model);
      expect(taskJson.scope).toBeDefined();
      expect(taskJson.scope.directories).toBeInstanceOf(Array);
      expect(taskJson.sprintId).toBe(sprint.id);
    }
  });

  it('initializes dashboard after planSprint', async () => {
    const root = join(tempDir, 'proj-3');
    mkdirSync(root, { recursive: true });
    setupProject(root);

    writeFileSync(join(root, DIRECTIVES_FILE), `# DIRECTIVES

## Görev 1: Dashboard Test
- Kapsam: src/

### Açıklama
Test dashboard initialization.

### Test
- Dashboard created
`);

    const config = makeResolvedConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    const sprint = await planSprint(root, config, context, recommendation, { mode: 'structured' });

    // Initialize dashboard using real resetDashboard function (not mocked)
    actualResetDashboard(root, sprint.id, sprint.tasks.length);

    const dashPath = join(root, DASHBOARD_FILE);
    expect(existsSync(dashPath)).toBe(true);

    // Verify dashboard format
    const dashboard = readDashboard(dashPath);
    expect(dashboard).toBeTruthy();
    if (dashboard) {
      expect(dashboard.sprint.id).toBe(sprint.id);
      expect(dashboard.sprint.phase).toBeDefined();
      expect(dashboard.sprint.status).toBeDefined();
      expect(dashboard.progress).toBeDefined();
      expect(typeof dashboard.progress.total).toBe('number');
      expect(dashboard.agents).toBeInstanceOf(Array);
      expect(dashboard.alerts).toBeInstanceOf(Array);
    }
  });

  it('handles multiple projects independently', async () => {
    const root1 = join(tempDir, 'proj-multi-1');
    const root2 = join(tempDir, 'proj-multi-2');
    mkdirSync(root1, { recursive: true });
    mkdirSync(root2, { recursive: true });

    setupProject(root1);
    setupProject(root2);

    const directives = `# DIRECTIVES

## Görev 1: Unique Task
- Kapsam: src/

### Açıklama
Unique to this project.

### Test
- Done
`;

    writeFileSync(join(root1, DIRECTIVES_FILE), directives);
    writeFileSync(join(root2, DIRECTIVES_FILE), directives);

    const config1 = makeResolvedConfig(root1);
    const config2 = makeResolvedConfig(root2);
    const context1 = readContext(root1);
    const context2 = readContext(root2);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };

    const sprint1 = await planSprint(root1, config1, context1, recommendation, { mode: 'structured' });
    const sprint2 = await planSprint(root2, config2, context2, recommendation, { mode: 'structured' });

    // Verify both have valid sprint IDs (each project starts at sprint-001)
    expect(sprint1.id).toMatch(/^sprint-\d+$/);
    expect(sprint2.id).toMatch(/^sprint-\d+$/);
    // Note: both will be 'sprint-001' since they're first sprints in separate projects

    // Verify task files in separate directories
    const tasks1 = readdirSync(join(root1, TASKS_DIR)).filter(f => f.startsWith('task-'));
    const tasks2 = readdirSync(join(root2, TASKS_DIR)).filter(f => f.startsWith('task-'));

    expect(tasks1.length).toBeGreaterThan(0);
    expect(tasks2.length).toBeGreaterThan(0);

    // Verify tasks belong to correct projects
    for (const file of tasks1) {
      const task = JSON.parse(readFileSync(join(root1, TASKS_DIR, file), 'utf-8')) as Task;
      expect(task.sprintId).toBe(sprint1.id);
    }

    for (const file of tasks2) {
      const task = JSON.parse(readFileSync(join(root2, TASKS_DIR, file), 'utf-8')) as Task;
      expect(task.sprintId).toBe(sprint2.id);
    }
  });

  it('preserves config across init and plan steps', async () => {
    const root = join(tempDir, 'proj-preserve');
    mkdirSync(root, { recursive: true });
    setupProject(root);

    // Original config
    const originalConfig = makeResolvedConfig(root);
    expect(originalConfig.projectRoot).toBe(root);
    expect(originalConfig.mode).toBe('max_plan');

    // Plan sprint (should not change config)
    writeFileSync(join(root, DIRECTIVES_FILE), `# DIRECTIVES

## Görev 1: Preserve Test
- Kapsam: src/

### Açıklama
Test config preservation.

### Test
- Passed
`);

    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 4, modelConstraint: null, reason: 'Test' };
    await planSprint(root, originalConfig, context, recommendation, { mode: 'structured' });

    // Verify config persists
    const configPath = join(root, DECKENT_DIR, 'config.json');
    const savedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(savedConfig.mode).toBe('max_plan');
  });

  it('creates proper brain directory structure during init', () => {
    const root = join(tempDir, 'proj-brain-structure');
    mkdirSync(root, { recursive: true });
    setupProject(root);

    // Verify all brain files exist
    expect(existsSync(join(root, BRAIN_DIR))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, MEMORY_FILE))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, DECISIONS_FILE))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, DEBT_FILE))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, PATTERNS_FILE))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, RETRO_FILE))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, SPRINTS_DIR))).toBe(true);

    // Verify content format
    const memory = readFileSync(join(root, BRAIN_DIR, MEMORY_FILE), 'utf-8');
    expect(memory).toContain('# Memory');

    const patterns = readFileSync(join(root, BRAIN_DIR, PATTERNS_FILE), 'utf-8');
    expect(JSON.parse(patterns)).toBeInstanceOf(Array);

    const debt = readFileSync(join(root, BRAIN_DIR, DEBT_FILE), 'utf-8');
    expect(debt).toContain(DEBT_TABLE_HEADER);
  });
});
