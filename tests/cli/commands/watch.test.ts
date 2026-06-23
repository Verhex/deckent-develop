import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// R4-SPRINTID (Sprint 318) — faithful regression for the conscious semantic
// change: `watch` now resolves the "current sprint" via the canonical
// core/event-stream getCurrentSprintId (sprint-active.json → sprint-state.json),
// NOT the stale `config.last_sprint_id` it used before. The PRE-FIX config-based
// reader is RED on test (1) below (it would warn) and on test (2) (it would name
// the config sprint); both are GREEN after the redirect (pre-fix red / post-fix
// green verified via git stash).
//
// node:fs is intentionally NOT mocked — the canonical getCurrentSprintId and the
// watch helpers read real fixture files in a tmpdir. Only tmux (side effects),
// output (capture), and resolveProjectRoot (point at tmpdir) are mocked.

let mockRoot = '';

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => mockRoot),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/orchestra/tmux.js', () => {
  // Defined inside the factory — vi.mock is hoisted, so a top-level class
  // reference would hit the temporal dead zone.
  class FakeTmuxError extends Error {}
  return {
    isSessionActive: vi.fn(() => true),
    createWatchLayout: vi.fn(),
    attachToWorkerPane: vi.fn(),
    TmuxError: FakeTmuxError,
  };
});

import { print } from '../../../src/cli/helpers/output.js';
import { registerWatch } from '../../../src/cli/commands/watch.js';

function runWatch(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerWatch(program);
  return program.parseAsync(['node', 'test', 'watch', ...args]).then(
    () => undefined,
    () => undefined, // commander exitOverride throws on error
  );
}

function seedProject(opts: {
  stateSprintId?: string;
  activeSprintId?: string;
  configLastSprintId?: string;
  taskSprintId?: string;
  taskId: string;
}): void {
  mkdirSync(join(mockRoot, '.deckent'), { recursive: true });
  mkdirSync(join(mockRoot, '.tasks'), { recursive: true });
  // Required for the action to proceed past the "no active sprint" guard.
  writeFileSync(join(mockRoot, '.dashboard'), '{}', 'utf-8');
  if (opts.stateSprintId !== undefined) {
    writeFileSync(
      join(mockRoot, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: opts.stateSprintId }),
      'utf-8',
    );
  }
  if (opts.activeSprintId !== undefined) {
    writeFileSync(
      join(mockRoot, '.deckent', 'sprint-active.json'),
      JSON.stringify({ sprintId: opts.activeSprintId }),
      'utf-8',
    );
  }
  if (opts.configLastSprintId !== undefined) {
    writeFileSync(
      join(mockRoot, '.deckent', 'config.json'),
      JSON.stringify({ last_sprint_id: opts.configLastSprintId }),
      'utf-8',
    );
  }
  writeFileSync(
    join(mockRoot, '.tasks', `task-${opts.taskId}.json`),
    JSON.stringify({ sprintId: opts.taskSprintId, provider: 'claude' }),
    'utf-8',
  );
}

function staleWarnings(): string[] {
  return vi.mocked(print).mock.calls
    .map((c) => String(c[0]))
    .filter((m) => /Warning: Task .* is from sprint/.test(m));
}

describe('watch command — getCurrentSprintId reflects ACTIVE sprint (R4-SPRINTID)', () => {
  beforeEach(() => {
    mockRoot = mkdtempSync(join(tmpdir(), 'deckent-watch-test-'));
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    try { rmSync(mockRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('(1) does NOT warn when the followed task matches the ACTIVE sprint, even if config.last_sprint_id is stale (pre-fix RED)', async () => {
    // Active sprint = sprint-NEW (sprint-state.json); config points at sprint-OLD.
    // PRE-FIX: watch read config.last_sprint_id = sprint-OLD ≠ task sprint-NEW → warning.
    seedProject({
      stateSprintId: 'sprint-NEW',
      configLastSprintId: 'sprint-OLD',
      taskSprintId: 'sprint-NEW',
      taskId: '042',
    });

    await runWatch(['--follow', '042']);

    expect(staleWarnings()).toEqual([]);
  });

  it('(2) when the task IS stale, the warning names the ACTIVE sprint (not config.last_sprint_id)', async () => {
    seedProject({
      stateSprintId: 'sprint-NEW',
      configLastSprintId: 'sprint-OLD',
      taskSprintId: 'sprint-STALE',
      taskId: '042',
    });

    await runWatch(['--follow', '042']);

    const warnings = staleWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('current sprint is sprint-NEW');
    expect(warnings[0]).not.toContain('sprint-OLD');
  });

  it('(3) honors the sprint-active.json override (canonical active→state)', async () => {
    // active=sprint-ACTIVE overrides state=sprint-STATE; task matches the active one → no warning.
    seedProject({
      stateSprintId: 'sprint-STATE',
      activeSprintId: 'sprint-ACTIVE',
      configLastSprintId: 'sprint-OLD',
      taskSprintId: 'sprint-ACTIVE',
      taskId: '042',
    });

    await runWatch(['--follow', '042']);

    expect(staleWarnings()).toEqual([]);
  });
});
