import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { DEBT_TABLE_HEADER } from '../../src/core/constants.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { registerArchiveDebt } from '../../src/cli/commands/archive-debt.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockAppendFileSync = vi.mocked(appendFileSync);

function buildDebtContent(rows: string[]): string {
  const separator = '|----|-------------|------|--------|----------|------|----------|----------|---------|';
  return [DEBT_TABLE_HEADER, separator, ...rows].join('\n');
}

let stdoutData: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;

function captureOutput(): void {
  stdoutData = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdoutData.push(String(data));
    return true;
  });
}

function restoreOutput(): void {
  stdoutSpy?.mockRestore();
}

async function runCommand(): Promise<string> {
  const program = new Command();
  program.exitOverride();
  registerArchiveDebt(program);
  try {
    await program.parseAsync(['node', 'test', 'archive-debt']);
  } catch (err) {
    if (err instanceof Error && err.message.includes('commander.')) {
      // expected
    }
  }
  return stdoutData.join('');
}

describe('archive-debt command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
  });

  afterEach(() => {
    restoreOutput();
  });

  it('prints no resolved items when DEBT.md does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const output = await runCommand();
    expect(output).toContain('No resolved debt items to archive.');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('prints no resolved items when all items are unresolved', async () => {
    const content = buildDebtContent([
      '| debt-001 | Some desc | 001 | sprint-001 | NORMAL | 0 | false | - | 2026-01-01 |',
    ]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();
    expect(output).toContain('No resolved debt items to archive.');
  });

  it('archives resolved items and keeps unresolved', async () => {
    const content = buildDebtContent([
      '| debt-001 | Unresolved desc | 001 | sprint-001 | NORMAL | 0 | false | - | 2026-01-01 |',
      '| debt-002 | Resolved desc | 002 | sprint-002 | HIGH | 2 | true | sprint-003 | 2026-01-02 |',
    ]);
    mockExistsSync.mockImplementation((p: unknown) => {
      if (String(p).includes('DEBT-ARCHIVE')) return false;
      return true;
    });
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();

    expect(output).toContain('Archived 1 resolved debt items. 1 items remaining.');

    // DEBT.md should be written with only unresolved items
    const debtWriteCall = mockWriteFileSync.mock.calls.find(c => String(c[0]).includes('DEBT.md') && !String(c[0]).includes('ARCHIVE'));
    expect(debtWriteCall).toBeDefined();
    const debtContent = debtWriteCall![1] as string;
    expect(debtContent).toContain('debt-001');
    expect(debtContent).not.toContain('debt-002');

    // Archive file should be created with header then appended
    const archiveWriteCall = mockWriteFileSync.mock.calls.find(c => String(c[0]).includes('DEBT-ARCHIVE'));
    expect(archiveWriteCall).toBeDefined();
    expect(String(archiveWriteCall![1])).toContain(DEBT_TABLE_HEADER);

    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const appendContent = mockAppendFileSync.mock.calls[0]![1] as string;
    expect(appendContent).toContain('debt-002');
  });

  it('archives all items when all are resolved', async () => {
    const content = buildDebtContent([
      '| debt-001 | Resolved 1 | 001 | sprint-001 | NORMAL | 0 | true | sprint-002 | 2026-01-01 |',
      '| debt-002 | Resolved 2 | 002 | sprint-002 | HIGH | 1 | true | sprint-003 | 2026-01-02 |',
    ]);
    mockExistsSync.mockImplementation((p: unknown) => {
      if (String(p).includes('DEBT-ARCHIVE')) return true;
      return true;
    });
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();

    expect(output).toContain('Archived 2 resolved debt items. 0 items remaining.');

    // DEBT.md should have empty table (header + separator only)
    const debtWriteCall = mockWriteFileSync.mock.calls.find(c => String(c[0]).includes('DEBT.md') && !String(c[0]).includes('ARCHIVE'));
    expect(debtWriteCall).toBeDefined();
    const debtContent = debtWriteCall![1] as string;
    expect(debtContent).toContain(DEBT_TABLE_HEADER);
    expect(debtContent.split('\n').length).toBe(2); // header + separator

    // Archive file already exists — should not create header, just append
    const archiveCreateCall = mockWriteFileSync.mock.calls.find(c => String(c[0]).includes('DEBT-ARCHIVE'));
    expect(archiveCreateCall).toBeUndefined();

    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const appendContent = mockAppendFileSync.mock.calls[0]![1] as string;
    expect(appendContent).toContain('debt-001');
    expect(appendContent).toContain('debt-002');
  });

  it('creates archive directory if it does not exist', async () => {
    const content = buildDebtContent([
      '| debt-001 | Resolved | 001 | sprint-001 | NORMAL | 0 | true | sprint-002 | 2026-01-01 |',
    ]);
    mockExistsSync.mockImplementation((p: unknown) => {
      if (String(p).includes('DEBT-ARCHIVE')) return false;
      return true;
    });
    mockReadFileSync.mockReturnValue(content);

    await runCommand();

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('archive'),
      { recursive: true },
    );
  });

  it('skips malformed rows with fewer than 9 columns', async () => {
    const content = buildDebtContent([
      '| debt-001 | Short row |',
      '| debt-002 | Resolved desc | 002 | sprint-002 | HIGH | 2 | true | sprint-003 | 2026-01-02 |',
    ]);
    mockExistsSync.mockImplementation((p: unknown) => {
      if (String(p).includes('DEBT-ARCHIVE')) return false;
      return true;
    });
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();

    expect(output).toContain('Archived 1 resolved debt items. 0 items remaining.');
  });
});
