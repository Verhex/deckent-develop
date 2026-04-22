// ─── Sprint 044+045 Module Integration Smoke Tests ──────────────────
// Validates core modules work together: init flow, routing, sync/explain,
// rich output, config roundtrip, debt auto-resolve, env detection.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { detectEnvironment } from '../../src/core/environment.js';
import { Connector } from '../../src/orchestra/connector.js';
import { routeTask } from '../../src/orchestra/task-router.js';
import { showSplash, KRAKEN_ASCII } from '../../src/cli/helpers/splash.js';
import { formatRichSprintSummary } from '../../src/cli/helpers/sprint-summary-rich.js';
import { createDefaultConfig } from '../../src/core/config.js';
import { parseDeckFile, createDeckTemplate, KNOWN_DECK_KEYS } from '../../src/core/deck-file.js';
import { autoResolveDebt } from '../../src/orchestra/sprint-reporter.js';
import { formatSyncOutput, type SyncResult } from '../../src/cli/commands/sync.js';
import { buildExplainOutput, type SprintSummary, type RetroLearnings } from '../../src/cli/commands/explain.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import type { Task } from '../../src/core/task-types.js';
import type { ModelType } from '../../src/core/types.js';
import type { ProviderName } from '../../src/core/task-types.js';
import type { TaskRouterConfig } from '../../src/orchestra/task-router.js';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function freshTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-s044-'));
}

function createMockAdapter(name: string): ProviderAdapter {
  return {
    name,
    supportedModels: ['opus', 'sonnet', 'haiku'] as ModelType[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(true),
    buildCommand: vi.fn().mockReturnValue(`${name} --model opus`),
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'A test task',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: ['src/foo.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'passes tests',
      noGoCriteria: 'fails tests',
      techDebtAcceptable: 'minor issues ok',
    },
    status: 'PENDING',
    ...overrides,
  };
}

// ─── Setup / Teardown ───────────────────────────────────────────────

beforeEach(() => {
  tmpDir = freshTmpDir();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════
// 1. Full init flow
// ═══════════════════════════════════════════════════════════════════════

describe('Full init flow', () => {
  it('detectEnvironment() returns a valid DetectedEnv value', () => {
    const env = detectEnvironment();
    expect(['vscode', 'codex', 'gemini', 'cursor', 'tmux', 'shell']).toContain(env);
  });

  it('createDeckTemplate() creates .deck file with all 9 known keys', () => {
    createDeckTemplate(tmpDir);
    const deckPath = join(tmpDir, '.deck');
    const content = readFileSync(deckPath, 'utf-8');
    const parsed = parseDeckFile(content);

    // All 9 known keys should appear (even if empty value)
    for (const key of KNOWN_DECK_KEYS) {
      expect(content).toContain(key);
    }
    expect(KNOWN_DECK_KEYS.length).toBe(9);
  });

  it('showSplash() returns string with KRAKEN_ASCII and DECKENT text', () => {
    const output = showSplash('1.0.0');
    expect(output).toContain('DECKENT');
    // The raw ASCII lines should be embedded in the output
    for (const line of KRAKEN_ASCII.split('\n').filter(l => l.trim())) {
      // The colored version wraps each line, so check the trimmed content exists
      expect(output).toContain(line.trim());
    }
    expect(output).toContain('1.0.0');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Route + Connect flow
// ═══════════════════════════════════════════════════════════════════════

describe('Route + Connect flow', () => {
  it('creates Connector, registers mock Claude adapter, and retrieves it', () => {
    const connector = new Connector();
    const adapter = createMockAdapter('claude-mock');
    connector.registerProvider('claude', adapter);

    expect(connector.isProviderReady('claude')).toBe(true);
    expect(connector.getProvider('claude')).toBe(adapter);
    expect(connector.size).toBe(1);
  });

  it('routeTask() with code task returns provider=claude when claude is available', () => {
    const task = makeTask({
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/index.ts'] },
    });
    const config: TaskRouterConfig = {};
    const available: ProviderName[] = ['claude'];

    const routing = routeTask(task, config, available);
    expect(routing.provider).toBe('claude');
    expect(routing.agent).toBeDefined();
    expect(routing.skills).toBeDefined();
  });

  it('routeTask() with doc task + skill_routing.docs=gemini returns provider=gemini', () => {
    const task = makeTask({
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/README.md'] },
    });
    const config: TaskRouterConfig = {
      skill_routing: { docs: 'gemini' },
    };
    const available: ProviderName[] = ['claude', 'gemini'];

    const routing = routeTask(task, config, available);
    expect(routing.provider).toBe('gemini');
    expect(routing.reason).toContain('skill_routing.docs');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Sync + Explain flow
// ═══════════════════════════════════════════════════════════════════════

describe('Sync + Explain flow', () => {
  it('formatSyncOutput produces readable output for mock changes', () => {
    const syncResult: SyncResult = {
      commits: 3,
      sprintId: 'sprint-044',
      modified: ['src/core/config.ts', 'src/cli/entry.ts'],
      added: ['src/core/environment.ts'],
      deleted: [],
      renamed: [],
    };
    const output = formatSyncOutput(syncResult);
    expect(output).toContain('3 commit(s)');
    expect(output).toContain('Sprint #044');
    expect(output).toContain('Modified:');
    expect(output).toContain('New:');
    expect(output).toContain('MEMORY.md');
  });

  it('buildExplainOutput produces sprint summary with task counts', () => {
    const summary: SprintSummary = {
      sprintNumber: 44,
      totalTasks: 8,
      completed: 5,
      techDebt: 2,
      noGo: 1,
      durationMs: 120000,
      goal: 'Stabilization sprint',
      tasks: ['Fix tests', 'Update docs'],
    };
    const learnings: RetroLearnings = {
      items: ['Env detection works across platforms'],
    };
    const output = buildExplainOutput(summary, learnings);
    expect(output).toContain('Sprint #44');
    expect(output).toContain('7 tasks completed'); // completed + techDebt
    expect(output).toContain('1 tasks failed');
    expect(output).toContain('2m 0s');
    expect(output).toContain('Env detection works across platforms');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Rich output flow
// ═══════════════════════════════════════════════════════════════════════

describe('Rich output flow', () => {
  it('formatRichSprintSummary() with mock data has all 7 sections', () => {
    const sprint = {
      id: 'sprint-044',
      number: 44,
      tasks: [
        { id: '001', title: 'Fix tests' },
        { id: '002', title: 'Update docs' },
        { id: '003', title: 'Refactor config' },
      ],
      metrics: {
        totalTasks: 3,
        completedTasks: 2,
        techDebtTasks: 1,
        noGoTasks: 0,
        durationMs: 90000,
        coveragePercent: 85.5,
      },
      startedAt: '2026-03-24T10:00:00Z',
      completedAt: '2026-03-24T10:01:30Z',
    };

    const evaluations = new Map<string, string>([
      ['001', 'DONE'],
      ['002', 'DONE'],
      ['003', 'GO_WITH_TECH_DEBT'],
    ]);

    const output = formatRichSprintSummary(sprint, evaluations, {
      gitDiff: 'src/core/config.ts | 10 +++\nsrc/cli/entry.ts | 5 +-',
      agentPerf: [{ agentId: 'worker-1', totalTasks: 3, doneTasks: 2, successRate: 66.7 }],
      learnings: ['Config roundtrip validated', 'Env detection stable'],
    });

    // All 7 sections: Header, Results, Changes, Tests, Agent Performance, Learnings, Next Steps
    expect(output).toContain('Sprint #44');       // Header
    expect(output).toContain('done');              // Results
    expect(output).toContain('config.ts');         // Changes
    expect(output).toContain('coverage');           // Tests
    expect(output).toContain('worker-1');          // Agent Performance
    expect(output).toContain('Config roundtrip');  // Learnings
    expect(output).toMatch(/Next Steps|next sprint/i); // Next Steps
  });

  it('NO_COLOR suppresses ANSI codes in output', () => {
    const origNoColor = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';

    try {
      const sprint = {
        id: 'sprint-044',
        tasks: [{ id: '001', title: 'Test' }],
        metrics: { totalTasks: 1, completedTasks: 1 },
      };
      const evaluations = new Map([['001', 'DONE']]);
      const output = formatRichSprintSummary(sprint, evaluations);

      // ANSI escape codes should NOT be present
      expect(output).not.toMatch(/\x1b\[/);
    } finally {
      if (origNoColor === undefined) {
        delete process.env['NO_COLOR'];
      } else {
        process.env['NO_COLOR'] = origNoColor;
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Config roundtrip
// ═══════════════════════════════════════════════════════════════════════

describe('Config roundtrip', () => {
  it('createDefaultConfig() has ALL new fields', () => {
    const config = createDefaultConfig();

    // New Sprint 044/045 fields
    expect(config).toHaveProperty('output_splash');
    expect(config).toHaveProperty('skill_routing');
    expect(config).toHaveProperty('search_enabled');
    expect(config).toHaveProperty('notify_on_complete');
    expect(config).toHaveProperty('telemetry_enabled');
    expect(config).toHaveProperty('detected_env');
    expect(config).toHaveProperty('auth_mode');
    // claude_backend removed in Sprint 150 (use spawn_backend instead)
    expect(config).not.toHaveProperty('claude_backend');

    // Default values
    expect(config.output_splash).toBe(true);
    expect(config.telemetry_enabled).toBe(false);
    expect(config.auth_mode).toBe('subscription');
  });

  it('config with custom values survives JSON roundtrip', () => {
    const config = createDefaultConfig();
    config.output_splash = false;
    config.notify_on_complete = true;
    config.telemetry_enabled = true;
    config.auth_mode = 'api';

    const serialized = JSON.stringify(config);
    const restored = JSON.parse(serialized);

    expect(restored.output_splash).toBe(false);
    expect(restored.notify_on_complete).toBe(true);
    expect(restored.telemetry_enabled).toBe(true);
    expect(restored.auth_mode).toBe('api');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. DEBT auto-resolve
// ═══════════════════════════════════════════════════════════════════════

describe('DEBT auto-resolve', () => {
  it('autoResolveDebt with mock fix task resolves debt entry', () => {
    // Create .brain/DEBT.md with a debt entry referencing task 001-001
    const brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
    writeFileSync(
      join(brainDir, 'DEBT.md'),
      '| ID | Description | Task | Resolved |\n| D001 | Missing tests | 001-001 | resolved=false |\n',
      'utf-8',
    );

    const sprint = {
      id: 'sprint-044',
      tasks: [
        { id: '002-001', isPriorityFix: true, fixForTaskId: '001-001' },
      ],
    };
    const evaluations = new Map<string, string>([['002-001', 'DONE']]);

    const resolved = autoResolveDebt(tmpDir, sprint, evaluations);
    expect(resolved).toBe(1);

    // Verify the file was updated
    const updated = readFileSync(join(brainDir, 'DEBT.md'), 'utf-8');
    expect(updated).toContain('sprint-044');
  });

  it('autoResolveDebt with no fix tasks returns 0', () => {
    const brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
    writeFileSync(
      join(brainDir, 'DEBT.md'),
      '| ID | Description | Task | Resolved |\n| D001 | Missing tests | 001-001 | resolved=false |\n',
      'utf-8',
    );

    const sprint = {
      id: 'sprint-044',
      tasks: [
        { id: '003-001' }, // not a priority fix
      ],
    };
    const evaluations = new Map<string, string>([['003-001', 'DONE']]);

    const resolved = autoResolveDebt(tmpDir, sprint, evaluations);
    expect(resolved).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Env detection matrix
// ═══════════════════════════════════════════════════════════════════════

describe('Env detection matrix', () => {
  // Save and restore all relevant env vars
  const envKeys = [
    'VSCODE_PID', 'VSCODE_CWD', 'TERM_PROGRAM',
    'CURSOR_SESSION', 'CODEX_SESSION', 'GEMINI_CLI', 'TMUX',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] !== undefined) {
        process.env[key] = saved[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('detects vscode when VSCODE_PID is set', () => {
    process.env.VSCODE_PID = '12345';
    expect(detectEnvironment()).toBe('vscode');
  });

  it('detects tmux when TMUX is set', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
    expect(detectEnvironment()).toBe('tmux');
  });

  it('falls back to shell when all env vars cleared', () => {
    // All env vars already cleared in beforeEach
    expect(detectEnvironment()).toBe('shell');
  });
});
