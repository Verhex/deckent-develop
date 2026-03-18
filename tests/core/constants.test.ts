import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  BRAIN_PLAN_TIMEOUT_MS,
  BRAIN_PLAN_MAX_CONTEXT_LINES,
  DECKENT_DIR,
  PROJECT_CONFIG_PATH,
  GLOBAL_DECKENT_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_DIR,
  BRAIN_DIR,
  TASKS_DIR,
  LOCKS_DIR,
  CONTRACTS_DIR,
  CLAUDE_RULES_DIR,
  WORKSPACE_DIR,
  PLUGINS_DIR,
  I18N_DIR,
  DASHBOARD_FILE,
  MEMORY_FILE,
  DECISIONS_FILE,
  DEBT_FILE,
  PATTERNS_FILE,
  RETRO_FILE,
  SPRINTS_DIR,
  ARCHIVE_DIR,
  AGENTS_FILE,
  CLAUDE_FILE,
  DIRECTIVES_FILE,
  AUDITOR_SCAN_INTERVAL_MS,
  HEARTBEAT_STALE_THRESHOLD_MS,
  HEARTBEAT_WRITE_INTERVAL_MS,
  LOCK_TIMEOUT_MS,
  LOCK_STALE_THRESHOLD_MS,
  MEMORY_MAX_LINES,
  PATTERNS_MAX_LINES,
  RETRO_MAX_LINES,
  SPRINT_LOG_MAX_LINES,
  BRAIN_TOTAL_LINE_BUDGET,
  MEMORY_DECAY_SPRINTS,
  PATTERN_DECAY_SPRINTS,
  TMUX_SESSION_NAME,
  TMUX_BRAIN_WINDOW,
  TMUX_AUDITOR_WINDOW,
  TMUX_DASHBOARD_WINDOW,
  TMUX_WORKER_PREFIX,
  DEBT_HIGH_PRIORITY_SPRINTS,
  DEBT_CRITICAL_SPRINTS,
  DEFAULT_LANGUAGE,
  DEFAULT_MODE,
  DECKENT_VERSION,
  SUPPORTED_LANGUAGES,
  TASK_FILE_EXTENSIONS,
} from '../../src/core/constants.js';

describe('Path constants', () => {
  const pathConstants = [
    DECKENT_DIR, PROJECT_CONFIG_PATH, GLOBAL_DECKENT_DIR, GLOBAL_CONFIG_PATH,
    GLOBAL_CREDENTIALS_DIR, BRAIN_DIR, TASKS_DIR, LOCKS_DIR, CONTRACTS_DIR,
    CLAUDE_RULES_DIR, WORKSPACE_DIR, PLUGINS_DIR, I18N_DIR, DASHBOARD_FILE,
    MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE, RETRO_FILE,
    SPRINTS_DIR, ARCHIVE_DIR, AGENTS_FILE, CLAUDE_FILE, DIRECTIVES_FILE,
  ];

  it('are all non-empty strings', () => {
    for (const c of pathConstants) {
      expect(typeof c).toBe('string');
      expect(c.length).toBeGreaterThan(0);
    }
  });
});

describe('Timing constants', () => {
  it('are all positive numbers', () => {
    const timings = [
      AUDITOR_SCAN_INTERVAL_MS,
      HEARTBEAT_STALE_THRESHOLD_MS,
      HEARTBEAT_WRITE_INTERVAL_MS,
      LOCK_TIMEOUT_MS,
      LOCK_STALE_THRESHOLD_MS,
    ];
    for (const t of timings) {
      expect(typeof t).toBe('number');
      expect(t).toBeGreaterThan(0);
    }
  });

  it('AUDITOR_SCAN_INTERVAL_MS === 30_000 (Blueprint 5.2)', () => {
    expect(AUDITOR_SCAN_INTERVAL_MS).toBe(30_000);
  });

  it('HEARTBEAT_STALE_THRESHOLD_MS === 120_000 (Blueprint 5.2)', () => {
    expect(HEARTBEAT_STALE_THRESHOLD_MS).toBe(120_000);
  });
});

describe('Memory limits', () => {
  it('are all positive integers', () => {
    const limits = [
      MEMORY_MAX_LINES, PATTERNS_MAX_LINES, RETRO_MAX_LINES,
      SPRINT_LOG_MAX_LINES, BRAIN_TOTAL_LINE_BUDGET,
      MEMORY_DECAY_SPRINTS, PATTERN_DECAY_SPRINTS,
    ];
    for (const l of limits) {
      expect(typeof l).toBe('number');
      expect(l).toBeGreaterThan(0);
      expect(Number.isInteger(l)).toBe(true);
    }
  });

  it('MEMORY_MAX_LINES === 100 (Blueprint 6)', () => {
    expect(MEMORY_MAX_LINES).toBe(100);
  });

  it('BRAIN_TOTAL_LINE_BUDGET === 300 (Blueprint 6)', () => {
    expect(BRAIN_TOTAL_LINE_BUDGET).toBe(300);
  });

  it('MEMORY_DECAY_SPRINTS === 3, PATTERN_DECAY_SPRINTS === 5 (Blueprint 6)', () => {
    expect(MEMORY_DECAY_SPRINTS).toBe(3);
    expect(PATTERN_DECAY_SPRINTS).toBe(5);
  });
});

describe('Tech debt escalation', () => {
  it('DEBT_HIGH_PRIORITY_SPRINTS === 2 (Blueprint 8)', () => {
    expect(DEBT_HIGH_PRIORITY_SPRINTS).toBe(2);
  });

  it('DEBT_CRITICAL_SPRINTS === 3 (Blueprint 8)', () => {
    expect(DEBT_CRITICAL_SPRINTS).toBe(3);
  });
});

describe('Defaults', () => {
  it('SUPPORTED_LANGUAGES includes en and tr', () => {
    expect(SUPPORTED_LANGUAGES).toContain('en');
    expect(SUPPORTED_LANGUAGES).toContain('tr');
  });

  it('DEFAULT_MODE === max_plan', () => {
    expect(DEFAULT_MODE).toBe('max_plan');
  });

  it('DEFAULT_LANGUAGE === en', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
  });

  it('DECKENT_VERSION matches package.json version', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    expect(DECKENT_VERSION).toBe(pkg.version);
  });

  it('DECKENT_VERSION is a valid semver string', () => {
    expect(DECKENT_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('tmux constants', () => {
  it('TMUX_SESSION_NAME === deckent', () => {
    expect(TMUX_SESSION_NAME).toBe('deckent');
  });

  it('TMUX_WORKER_PREFIX === w-', () => {
    expect(TMUX_WORKER_PREFIX).toBe('w-');
  });

  it('other tmux constants are non-empty strings', () => {
    expect(TMUX_BRAIN_WINDOW.length).toBeGreaterThan(0);
    expect(TMUX_AUDITOR_WINDOW.length).toBeGreaterThan(0);
    expect(TMUX_DASHBOARD_WINDOW.length).toBeGreaterThan(0);
  });
});

describe('Brain AI planner constants', () => {
  it('BRAIN_PLAN_TIMEOUT_MS === 60_000', () => {
    expect(BRAIN_PLAN_TIMEOUT_MS).toBe(60_000);
  });

  it('BRAIN_PLAN_MAX_CONTEXT_LINES === 200', () => {
    expect(BRAIN_PLAN_MAX_CONTEXT_LINES).toBe(200);
  });
});

describe('Task file extensions', () => {
  it('contains expected extensions', () => {
    expect(TASK_FILE_EXTENSIONS).toContain('.json');
    expect(TASK_FILE_EXTENSIONS).toContain('.plan');
    expect(TASK_FILE_EXTENSIONS).toContain('.hb');
    expect(TASK_FILE_EXTENSIONS).toContain('.result');
    expect(TASK_FILE_EXTENSIONS).toContain('.paused');
  });
});
