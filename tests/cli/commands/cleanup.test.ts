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

vi.mock('../../../src/orchestra/brain.js', () => ({
  cleanup: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../../src/orchestra/tmux.js', () => ({
  destroy: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { cleanup, runDecay } from '../../../src/orchestra/brain.js';
import { destroy } from '../../../src/orchestra/tmux.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
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
    vi.mocked(destroy).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(cleanup).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith(expect.stringContaining('2 tasks'));
  });

  it('calls destroy() to kill tmux session', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(destroy).mockImplementation(() => {});
    await runCommand(['cleanup']);
    expect(destroy).toHaveBeenCalled();
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
    vi.mocked(destroy).mockImplementation(() => {});
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

  it('silently handles destroy() failure', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(destroy).mockImplementation(() => { throw new Error('no tmux'); });
    await runCommand(['cleanup']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Cleanup complete'));
    expect(process.exitCode).toBeUndefined();
  });
});

// ─── i18n integration ─────────────────────────────────────────────────

describe('cleanup i18n integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('uses en language by default when config missing', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(cleanup).mockImplementation(() => {});
    vi.mocked(destroy).mockImplementation(() => {});
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
    vi.mocked(destroy).mockImplementation(() => {});
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
    vi.mocked(destroy).mockImplementation(() => {});
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
