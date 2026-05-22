// archive-debt command — Task #4f: the command is now a DB-first reporter.
// Tech debt lives in memory.db; the legacy .brain/DEBT.md + DEBT-ARCHIVE.md
// file-archiving behavior was removed. These tests exercise the reporter
// against a real tmpdir-backed SQLite DB (the MemoryStore harness the old
// suite's TODO comment asked for).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { MemoryStore } from '../../../src/core/memory-store.js';
import { registerArchiveDebt } from '../../../src/cli/commands/archive-debt.js';

const ROOT = join(process.cwd(), '.test-archive-debt-' + process.pid);
const ORIG_CWD = process.cwd();

let stdout: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;

function seedDebt(items: Array<{ id: string; status: 'active' | 'resolved'; sprint: string }>): void {
  const store = new MemoryStore(join(ROOT, '.brain', 'memory.db'));
  for (const it of items) {
    store.insert({
      id: it.id, type: 'debt', title: `debt ${it.id}`, content: '',
      source: 'brain', status: it.status, priority: 'normal',
      sprint_id: it.sprint, sprint_num: parseInt(it.sprint.replace(/\D/g, ''), 10) || 0,
      tags: ['debt'],
      metadata: { originTaskId: it.id, originSprintId: it.sprint, sprintsOpen: 0 },
    });
  }
  store.close();
}

async function run(args: string[] = []): Promise<string> {
  const program = new Command();
  program.exitOverride();
  registerArchiveDebt(program);
  try {
    await program.parseAsync(['node', 'test', 'archive-debt', ...args]);
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('commander.'))) throw err;
  }
  return stdout.join('');
}

describe('archive-debt command (DB-first)', () => {
  beforeEach(() => {
    if (fs.existsSync(ROOT)) fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(join(ROOT, '.brain'), { recursive: true });
    fs.mkdirSync(join(ROOT, '.deckent'), { recursive: true });
    process.chdir(ROOT);
    stdout = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((d) => {
      stdout.push(String(d));
      return true;
    });
  });

  afterEach(() => {
    stdoutSpy?.mockRestore();
    process.chdir(ORIG_CWD);
    if (fs.existsSync(ROOT)) fs.rmSync(ROOT, { recursive: true, force: true });
  });

  it('registers the archive-debt command on the program', () => {
    const program = new Command();
    registerArchiveDebt(program);
    expect(program.commands.some(c => c.name() === 'archive-debt')).toBe(true);
  });

  it('reports zero debt when the DB is empty', async () => {
    seedDebt([]);
    const out = await run();
    expect(out).toContain('0 open, 0 resolved');
  });

  it('reports open and resolved debt counts from the DB', async () => {
    seedDebt([
      { id: 'debt-a', status: 'active', sprint: 'sprint-200' },
      { id: 'debt-b', status: 'active', sprint: 'sprint-201' },
      { id: 'debt-c', status: 'resolved', sprint: 'sprint-200' },
    ]);
    const out = await run();
    expect(out).toContain('2 open, 1 resolved');
  });

  it('--before counts resolved items originating before a sprint', async () => {
    seedDebt([
      { id: 'debt-old', status: 'resolved', sprint: 'sprint-100' },
      { id: 'debt-new', status: 'resolved', sprint: 'sprint-300' },
    ]);
    const out = await run(['--before', 'sprint-200']);
    expect(out).toContain('1 resolved item(s) originate before sprint-200');
  });

  it('--count suppresses the explanatory footer', async () => {
    seedDebt([{ id: 'debt-a', status: 'active', sprint: 'sprint-200' }]);
    const out = await run(['--count']);
    expect(out).toContain('1 open, 0 resolved');
    expect(out).not.toContain('no manual archival step');
  });
});
