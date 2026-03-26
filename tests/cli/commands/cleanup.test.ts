import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { SprintStatus, SprintPhase } from '../../../src/core/types.js';
import type { Task } from '../../../src/core/types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0 }),
}));

vi.mock('../../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  cleanup: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { cleanup, runDecay } from '../../../src/orchestra/brain.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { countBrainLines } from '../../../src/core/utils.js';
import { registerCleanup } from '../../../src/cli/commands/cleanup.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Test', description: 'test', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: 'DONE' as any, sprintId: 'sprint-001', createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerCleanup(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('cleanup command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers cleanup command on program', () => {
    const program = new Command();
    registerCleanup(program);
    const cmd = program.commands.find(c => c.name() === 'cleanup');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('Clean up');
  });

  it('has --decay option', () => {
    const program = new Command();
    registerCleanup(program);
    const cmd = program.commands.find(c => c.name() === 'cleanup');
    const decayOpt = cmd!.options.find(o => o.long === '--decay');
    expect(decayOpt).toBeDefined();
  });

  it('reads task files from .tasks/ directory', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-002.json'] as any);
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (String(path).includes('task-001')) return JSON.stringify(makeTask({ id: '001-001' }));
      return JSON.stringify(makeTask({ id: '001-002' }));
    });
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(cleanup).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith(expect.stringContaining('2 tasks'));
  });

  it('kills the tmux session via spawnSync', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(spawnSync).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['kill-session']),
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('--decay calls runDecay with force and prints result', async () => {
    vi.mocked(runDecay).mockReturnValue({
      linesBefore: 400, linesAfter: 250,
      archivedSprints: ['sprint-001.md', 'sprint-002.md'],
      removedDebtCount: 3, removedPatternCount: 2,
    });
    await runCommand(['cleanup', '--decay']);
    expect(runDecay).toHaveBeenCalledWith(expect.any(String), 'sprint-cleanup', { force: true });
    expect(print).toHaveBeenCalledWith(expect.stringContaining('400'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('250'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('sprint-001.md'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('3 debt'));
  });

  it('--decay with zero removals does not print removal line', async () => {
    vi.mocked(runDecay).mockReturnValue({
      linesBefore: 100, linesAfter: 100,
      archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0,
    });
    await runCommand(['cleanup', '--decay']);
    const printCalls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(printCalls.some(c => c.includes('Archived'))).toBe(false);
    expect(printCalls.some(c => c.includes('Removed'))).toBe(false);
  });

  it('filters only task-*.json files from .tasks/', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      'task-001.json', 'task-001.hb', 'task-001.result', 'README.md',
    ] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeTask()));
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('1 tasks'));
  });

  it('sets exitCode=1 when cleanup throws', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => { throw new Error('disk full'); });
    await runCommand(['cleanup']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('silently handles spawnSync failure (session may not exist)', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);
    await runCommand(['cleanup']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Cleanup complete'));
    expect(process.exitCode).toBeUndefined();
  });

  // Budget warning after cleanup
  it('shows budget warning when .brain/ exceeds budget after cleanup', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(countBrainLines).mockReturnValue(700); // over 600 budget
    await runCommand(['cleanup']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('deckent cleanup --decay'))).toBe(true);
  });

  it('does not show budget warning when .brain/ is within budget', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(countBrainLines).mockReturnValue(400); // under 600 budget
    await runCommand(['cleanup']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('deckent cleanup --decay'))).toBe(false);
  });

  // --decay + normal cleanup combo
  it('--decay also runs normal cleanup (no early return)', async () => {
    vi.mocked(runDecay).mockReturnValue({
      linesBefore: 400, linesAfter: 250,
      archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0,
    });
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup', '--decay']);
    // Both decay and normal cleanup should have run
    expect(runDecay).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalled();
    expect(spawnSync).toHaveBeenCalled();
  });

  // Active lock guard: warn about EXECUTING tasks
  it('warns when EXECUTING tasks are present', async () => {
    const executingTask = makeTask({ id: '001-001', status: 'EXECUTING' as any });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(executingTask));
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).toLowerCase().includes('active') || String(c).toLowerCase().includes('warning'))).toBe(true);
  });

  it('warns when CLAIMED tasks are present', async () => {
    const claimedTask = makeTask({ id: '001-002', status: 'CLAIMED' as any });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-002.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(claimedTask));
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).toLowerCase().includes('active') || String(c).toLowerCase().includes('warning'))).toBe(true);
  });

  // ─── A) Single readdirSync pass in dry-run ────────────────────────

  it('A) dry-run calls readdirSync exactly once for tasksDir (single pass)', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('.tasks'));
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-001.hb'] as any);
    await runCommand(['cleanup', '--dry-run']);
    const tasksDirCalls = vi.mocked(readdirSync).mock.calls.filter(
      c => String(c[0]).includes('.tasks'),
    );
    expect(tasksDirCalls).toHaveLength(1);
  });

  it('A) dry-run correctly separates task files and prompt files in single pass', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('.tasks'));
    vi.mocked(readdirSync).mockReturnValue([
      'task-001.json', 'task-001.hb', '.prompt-abc.txt',
    ] as any);
    await runCommand(['cleanup', '--dry-run']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('2 task file(s)'))).toBe(true);
    expect(calls.some(c => String(c).includes('1 prompt file(s)'))).toBe(true);
  });

  // ─── B) Sprint derived from real data ────────────────────────────

  it('B) sprint ID derived from sprint-state.json when it exists', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('sprint-state'));
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('sprint-state')) {
        return JSON.stringify({ sprintId: 'sprint-042', phase: 'COMPLETE' });
      }
      return '';
    });
    let capturedSprint: any;
    vi.mocked(cleanup).mockImplementation((_root: string, sprint: any) => {
      capturedSprint = sprint;
    });
    await runCommand(['cleanup']);
    expect(cleanup).toHaveBeenCalled();
    expect(capturedSprint.id).toBe('sprint-042');
    expect(capturedSprint.number).toBe(42);
  });

  it('B) sprint ID falls back to task sprintId when sprint-state.json is missing', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('.tasks'));
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify(makeTask({ sprintId: 'sprint-099' })),
    );
    let capturedSprint: any;
    vi.mocked(cleanup).mockImplementation((_root: string, sprint: any) => {
      capturedSprint = sprint;
    });
    await runCommand(['cleanup']);
    expect(cleanup).toHaveBeenCalled();
    expect(capturedSprint.id).toBe('sprint-099');
    expect(capturedSprint.number).toBe(99);
  });

  it('B) sprint falls back to cleanup-timestamp when no state or tasks', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    let capturedSprint: any;
    vi.mocked(cleanup).mockImplementation((_root: string, sprint: any) => {
      capturedSprint = sprint;
    });
    await runCommand(['cleanup']);
    expect(cleanup).toHaveBeenCalled();
    expect(capturedSprint.id).toMatch(/^cleanup-\d+$/);
    expect(capturedSprint.number).toBe(0);
  });

  // ─── C) Session name from config ─────────────────────────────────

  it('C) uses tmux_session from config when available', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('config.json'));
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('config.json')) {
        return JSON.stringify({ tmux_session: 'my-project-session' });
      }
      return '';
    });
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(spawnSync).toHaveBeenCalledWith(
      'tmux',
      ['kill-session', '-t', 'my-project-session'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('C) falls back to default TMUX_SESSION_NAME when no config', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(spawnSync).toHaveBeenCalledWith(
      'tmux',
      ['kill-session', '-t', 'deckent'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('C) falls back to default when config has no tmux_session field', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('config.json'));
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('config.json')) return JSON.stringify({ language: 'tr' });
      return '';
    });
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(spawnSync).toHaveBeenCalledWith(
      'tmux',
      ['kill-session', '-t', 'deckent'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  // ─── D) .gitignore archive exception ─────────────────────────────

  it('D) adds !.brain/archive/ exception to .gitignore when archive is ignored', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('.gitignore'));
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.gitignore')) return '.brain/archive/\nnode_modules/\n';
      return '';
    });
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.gitignore'),
      expect.stringContaining('!.brain/archive/'),
      'utf-8',
    );
  });

  it('D) inserts !.brain/archive/ immediately after .brain/archive/ line', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('.gitignore'));
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.gitignore')) return '.brain/archive/\nnode_modules/\n';
      return '';
    });
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    const call = vi.mocked(writeFileSync).mock.calls.find(c =>
      String(c[0]).includes('.gitignore'),
    );
    expect(call).toBeDefined();
    const content = String(call![1]);
    const lines = content.split('\n');
    const archiveIdx = lines.indexOf('.brain/archive/');
    expect(archiveIdx).toBeGreaterThanOrEqual(0);
    expect(lines[archiveIdx + 1]).toBe('!.brain/archive/');
  });

  it('D) skips .gitignore update when !.brain/archive/ already present', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('.gitignore'));
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.gitignore')) return '.brain/archive/\n!.brain/archive/\nnode_modules/\n';
      return '';
    });
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(writeFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining('.gitignore'),
      expect.any(String),
      'utf-8',
    );
  });

  it('D) appends !.brain/archive/ when .brain/archive/ line not found in .gitignore', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => String(p).includes('.gitignore'));
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.gitignore')) return 'node_modules/\ndist/\n';
      return '';
    });
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    const call = vi.mocked(writeFileSync).mock.calls.find(c =>
      String(c[0]).includes('.gitignore'),
    );
    expect(call).toBeDefined();
    expect(String(call![1])).toContain('!.brain/archive/');
  });
});

// ─── i18n integration ─────────────────────────────────────────────────

describe('cleanup i18n integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('uses en language by default when config missing', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('Cleanup complete'))).toBe(true);
  });

  it('reads language from config and uses tr output when language=tr', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return JSON.stringify({ language: 'tr' });
      return '';
    });
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    // Turkish: 'Temizlik tamamlandı. {count} görevin artifaktları silindi.'
    expect(calls.some(c => String(c).includes('Temizlik tamamlandı'))).toBe(true);
  });

  it('decay complete uses tr language when config language=tr', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return JSON.stringify({ language: 'tr' });
      return '';
    });
    vi.mocked(runDecay).mockReturnValue({
      linesBefore: 300, linesAfter: 200,
      archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0,
    });
    await runCommand(['cleanup', '--decay']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    // Turkish: 'Decay tamamlandı: {before} → {after} satır'
    expect(calls.some(c => String(c).includes('Decay tamamlandı'))).toBe(true);
  });

  it('falls back to en when config has malformed JSON', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return 'INVALID JSON';
      return '';
    });
    vi.mocked(cleanup).mockImplementation(() => {});
    await runCommand(['cleanup']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(c => String(c).includes('Cleanup complete'))).toBe(true);
  });

  it('archived_sprints message uses tr language when language=tr', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockImplementation((p: string) => {
      if (String(p).includes('config.json')) return JSON.stringify({ language: 'tr' });
      return '';
    });
    vi.mocked(runDecay).mockReturnValue({
      linesBefore: 300, linesAfter: 200,
      archivedSprints: ['sprint-001.md'],
      removedDebtCount: 0, removedPatternCount: 0,
    });
    await runCommand(['cleanup', '--decay']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    // Turkish: 'Arşivlendi: {sprints}'
    expect(calls.some(c => String(c).includes('Arşivlendi'))).toBe(true);
  });
});
