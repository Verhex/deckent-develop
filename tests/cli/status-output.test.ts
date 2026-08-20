/**
 * 590-001: blocked/next/stale status lines must be i18n (not hardcoded) and
 * the blocked line must NOT claim "dependencies" as the sole cause — it also
 * covers file-collision ordering. This test pins the rendered EN+TR text
 * hermetically (tmpdir fixture for language resolution, no spawnSync / no
 * real CLI process).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatHumanStatus, type HumanStatusInput } from '../../src/cli/helpers/output.js';
import { AgentStatus, SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type { DashboardState, Task } from '../../src/core/types.js';

// ─── Factories (mirrors tests/cli/helpers/human-status.test.ts) ───────

function makeDashboard(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    sprint: { id: 'sprint-590', number: 590, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [],
    progress: { done: 3, active: 2, blocked: 0, total: 10 },
    alerts: [],
    updatedAt: '2026-03-23T10:00:00Z',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

// ─── Hermetic language isolation ───────────────────────────────────────
// resolveLanguage() checks DECKENT_LANGUAGE/DECKENT_LANG/config/LC_ALL/LANG
// in that order. To pin deterministic EN/TR output regardless of the host
// shell's locale, every language-sensitive env var is cleared per test and
// language is steered purely through a tmpdir `.deckent/config.json`
// fixture (or its absence, for the English default).

const LANG_ENV_KEYS = ['DECKENT_LANGUAGE', 'DECKENT_LANG', 'LC_ALL', 'LANG'] as const;

describe('status blocked/next/stale i18n (590-001)', () => {
  let projectRoot: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-status-i18n-'));
    for (const key of LANG_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    for (const key of LANG_ENV_KEYS) {
      const val = savedEnv[key];
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  function writeLangConfig(lang: string): void {
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    writeFileSync(join(projectRoot, '.deckent', 'config.json'), JSON.stringify({ language: lang }), 'utf-8');
  }

  // ─── Blocked line ─────────────────────────────────────────────────

  it('renders the neutral-honest blocked line in English (no single-cause claim)', () => {
    const input: HumanStatusInput = {
      dashboard: makeDashboard({ progress: { done: 3, active: 2, blocked: 2, total: 10 } }),
      tasks: [],
      projectRoot,
      nowMs: new Date('2026-03-23T10:12:00Z').getTime(),
    };
    const output = formatHumanStatus(input);
    expect(output).toContain('Blocked: 2 task(s) waiting (dependencies or file-collision ordering)');
    expect(output).not.toContain('blocked by dependencies');
  });

  it('renders the neutral-honest blocked line in Turkish', () => {
    writeLangConfig('tr');
    const input: HumanStatusInput = {
      dashboard: makeDashboard({ progress: { done: 3, active: 2, blocked: 5, total: 10 } }),
      tasks: [],
      projectRoot,
      nowMs: new Date('2026-03-23T10:12:00Z').getTime(),
    };
    const output = formatHumanStatus(input);
    expect(output).toContain('Bekleyen: 5 görev (bağımlılık ya da dosya-çakışması sıralaması)');
  });

  it('does not show the blocked section when blocked count is 0', () => {
    const input: HumanStatusInput = {
      dashboard: makeDashboard({ progress: { done: 3, active: 2, blocked: 0, total: 10 } }),
      tasks: [],
      projectRoot,
    };
    const output = formatHumanStatus(input);
    expect(output).not.toContain('Blocked:');
  });

  // ─── Next line ────────────────────────────────────────────────────

  it('renders the "Next" line via i18n in English', () => {
    const input: HumanStatusInput = {
      dashboard: makeDashboard(),
      tasks: [makeTask({ id: '010', status: TaskStatus.PENDING })],
      projectRoot,
    };
    const output = formatHumanStatus(input);
    expect(output).toContain('Next: 1 task(s) will start as workers free up');
  });

  it('renders the "Next" line via i18n in Turkish', () => {
    writeLangConfig('tr');
    const input: HumanStatusInput = {
      dashboard: makeDashboard(),
      tasks: [
        makeTask({ id: '010', status: TaskStatus.PENDING }),
        makeTask({ id: '011', status: TaskStatus.PENDING }),
      ],
      projectRoot,
    };
    const output = formatHumanStatus(input);
    expect(output).toContain('Sıradaki: 2 görev worker boşaldıkça başlayacak');
  });

  it('does not show the "Next" section when there are no waiting tasks', () => {
    const input: HumanStatusInput = {
      dashboard: makeDashboard(),
      tasks: [makeTask({ status: TaskStatus.DONE })],
      projectRoot,
    };
    const output = formatHumanStatus(input);
    expect(output).not.toContain('Next:');
  });

  // ─── Stale-dashboard warning ──────────────────────────────────────

  it('renders the stale-dashboard warning via i18n in English', () => {
    const input: HumanStatusInput = {
      dashboard: makeDashboard({ updatedAt: '2026-03-23T10:00:00Z' }),
      tasks: [],
      projectRoot,
      nowMs: new Date('2026-03-23T10:05:00Z').getTime(), // 5 min old, > 60s staleness threshold
    };
    const output = formatHumanStatus(input);
    expect(output).toContain('Warning: Dashboard data is 5 min old — may be stale');
  });

  it('renders the stale-dashboard warning via i18n in Turkish', () => {
    writeLangConfig('tr');
    const input: HumanStatusInput = {
      dashboard: makeDashboard({ updatedAt: '2026-03-23T10:00:00Z' }),
      tasks: [],
      projectRoot,
      nowMs: new Date('2026-03-23T10:05:00Z').getTime(),
    };
    const output = formatHumanStatus(input);
    expect(output).toContain('Uyarı: Dashboard verisi 5 min eski — bayat olabilir');
  });

  // ─── Sanity: unrelated fields still render (agent status touched for import use) ──

  it('still renders the sprint header alongside the localized lines', () => {
    const input: HumanStatusInput = {
      dashboard: makeDashboard({
        progress: { done: 1, active: 1, blocked: 1, total: 5 },
        agents: [{ id: 'w-001', role: 'worker', status: AgentStatus.EXECUTING, model: 'sonnet', tmuxWindow: 'w-001', spawnedAt: '2026-03-23T10:00:00Z' }],
      }),
      tasks: [],
      projectRoot,
    };
    const output = formatHumanStatus(input);
    expect(output).toContain('Sprint 590');
    expect(output).toContain('Blocked: 1 task(s) waiting (dependencies or file-collision ordering)');
  });
});
