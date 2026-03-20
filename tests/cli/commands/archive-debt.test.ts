import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { DEBT_TABLE_HEADER } from '../../../src/core/constants.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { registerArchiveDebt } from '../../../src/cli/commands/archive-debt.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockAppendFileSync = vi.mocked(appendFileSync);

const SEPARATOR = '|----|-------------|------|--------|----------|------|----------|----------|---------|';

function buildDebtContent(rows: string[]): string {
  return [DEBT_TABLE_HEADER, SEPARATOR, ...rows].join('\n');
}

function makeRow(id: string, desc: string, resolved: 'true' | 'false', fixedIn = '-'): string {
  return `| ${id} | ${desc} | task-001 | sprint-001 | NORMAL | 0 | ${resolved} | ${fixedIn} | 2026-01-01 |`;
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

  // ─── Registration ─────────────────────────────────────────────────────────

  it('registers archive-debt command on program', () => {
    const program = new Command();
    program.exitOverride();
    registerArchiveDebt(program);
    const cmd = program.commands.find(c => c.name() === 'archive-debt');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('resolved debt');
  });

  // ─── Empty debt table — no-op behavior ────────────────────────────────────

  it('prints no resolved items when DEBT.md does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const output = await runCommand();
    expect(output).toContain('No resolved debt items to archive.');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it('prints no resolved items when table has no rows', async () => {
    const content = buildDebtContent([]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(content);
    const output = await runCommand();
    expect(output).toContain('No resolved debt items to archive.');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  // ─── Non-resolved debt preservation ───────────────────────────────────────

  it('does not archive when all items are unresolved', async () => {
    const content = buildDebtContent([
      makeRow('debt-001', 'Active debt 1', 'false'),
      makeRow('debt-002', 'Active debt 2', 'false'),
    ]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(content);
    const output = await runCommand();
    expect(output).toContain('No resolved debt items to archive.');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it('preserves unresolved items unchanged in DEBT.md after archiving resolved ones', async () => {
    const content = buildDebtContent([
      makeRow('debt-001', 'Keep me', 'false'),
      makeRow('debt-002', 'Remove me', 'true', 'sprint-002'),
      makeRow('debt-003', 'Keep me too', 'false'),
    ]);
    mockExistsSync.mockImplementation((p: unknown) => !String(p).includes('DEBT-ARCHIVE'));
    mockReadFileSync.mockReturnValue(content);

    await runCommand();

    const debtWrite = mockWriteFileSync.mock.calls.find(c => String(c[0]).includes('DEBT.md') && !String(c[0]).includes('ARCHIVE'));
    expect(debtWrite).toBeDefined();
    const written = debtWrite![1] as string;
    expect(written).toContain('debt-001');
    expect(written).toContain('debt-003');
    expect(written).not.toContain('debt-002');
  });

  // ─── Resolved debt archiving ───────────────────────────────────────────────

  it('moves single resolved item to archive', async () => {
    const content = buildDebtContent([
      makeRow('debt-001', 'Unresolved', 'false'),
      makeRow('debt-002', 'Resolved', 'true', 'sprint-003'),
    ]);
    mockExistsSync.mockImplementation((p: unknown) => !String(p).includes('DEBT-ARCHIVE'));
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();

    expect(output).toContain('Archived 1 resolved debt items. 1 items remaining.');
    const appendCall = mockAppendFileSync.mock.calls[0];
    expect(appendCall).toBeDefined();
    expect(String(appendCall![1])).toContain('debt-002');
    expect(String(appendCall![1])).not.toContain('debt-001');
  });

  it('moves multiple resolved items to archive in one operation', async () => {
    const content = buildDebtContent([
      makeRow('debt-001', 'Resolved 1', 'true', 'sprint-002'),
      makeRow('debt-002', 'Resolved 2', 'true', 'sprint-003'),
      makeRow('debt-003', 'Active', 'false'),
    ]);
    mockExistsSync.mockImplementation((p: unknown) => !String(p).includes('DEBT-ARCHIVE'));
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();

    expect(output).toContain('Archived 2 resolved debt items. 1 items remaining.');
    const appendContent = String(mockAppendFileSync.mock.calls[0]![1]);
    expect(appendContent).toContain('debt-001');
    expect(appendContent).toContain('debt-002');
    expect(appendContent).not.toContain('debt-003');
  });

  it('archives all items when all are resolved leaving empty table', async () => {
    const content = buildDebtContent([
      makeRow('debt-001', 'Resolved 1', 'true', 'sprint-002'),
      makeRow('debt-002', 'Resolved 2', 'true', 'sprint-003'),
    ]);
    mockExistsSync.mockImplementation((p: unknown) => !String(p).includes('DEBT-ARCHIVE'));
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();

    expect(output).toContain('Archived 2 resolved debt items. 0 items remaining.');

    const debtWrite = mockWriteFileSync.mock.calls.find(c => String(c[0]).includes('DEBT.md') && !String(c[0]).includes('ARCHIVE'));
    expect(debtWrite).toBeDefined();
    const written = debtWrite![1] as string;
    // Only header and separator, no data rows
    expect(written).toContain(DEBT_TABLE_HEADER);
    expect(written).not.toContain('debt-001');
    expect(written).not.toContain('debt-002');
  });

  // ─── Archive file creation — correct format ───────────────────────────────

  it('creates archive file with table header when it does not exist', async () => {
    const content = buildDebtContent([makeRow('debt-001', 'Resolved', 'true', 'sprint-002')]);
    mockExistsSync.mockImplementation((p: unknown) => !String(p).includes('DEBT-ARCHIVE'));
    mockReadFileSync.mockReturnValue(content);

    await runCommand();

    const archiveCreate = mockWriteFileSync.mock.calls.find(c => String(c[0]).includes('DEBT-ARCHIVE'));
    expect(archiveCreate).toBeDefined();
    expect(String(archiveCreate![1])).toContain(DEBT_TABLE_HEADER);
    expect(String(archiveCreate![1])).toContain(SEPARATOR);
  });

  it('does not recreate archive header when file already exists', async () => {
    const content = buildDebtContent([makeRow('debt-001', 'Resolved', 'true', 'sprint-002')]);
    // Both DEBT.md and DEBT-ARCHIVE.md exist
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(content);

    await runCommand();

    const archiveCreate = mockWriteFileSync.mock.calls.find(c => String(c[0]).includes('DEBT-ARCHIVE'));
    expect(archiveCreate).toBeUndefined();
    // But append should still be called
    expect(mockAppendFileSync).toHaveBeenCalledOnce();
  });

  it('creates archive directory with recursive flag', async () => {
    const content = buildDebtContent([makeRow('debt-001', 'Resolved', 'true', 'sprint-002')]);
    mockExistsSync.mockImplementation((p: unknown) => !String(p).includes('DEBT-ARCHIVE'));
    mockReadFileSync.mockReturnValue(content);

    await runCommand();

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('archive'),
      { recursive: true },
    );
  });

  // ─── Malformed debt entries — graceful handling ───────────────────────────

  it('skips rows with fewer than 9 columns without crashing', async () => {
    const content = buildDebtContent([
      '| debt-bad | Only two cols |',
      makeRow('debt-001', 'Resolved', 'true', 'sprint-002'),
    ]);
    mockExistsSync.mockImplementation((p: unknown) => !String(p).includes('DEBT-ARCHIVE'));
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();
    expect(output).toContain('Archived 1 resolved debt items. 0 items remaining.');
  });

  it('ignores separator and header lines without treating them as data rows', async () => {
    const content = [
      DEBT_TABLE_HEADER,
      SEPARATOR,
      makeRow('debt-001', 'Resolved', 'true', 'sprint-002'),
    ].join('\n');
    mockExistsSync.mockImplementation((p: unknown) => !String(p).includes('DEBT-ARCHIVE'));
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();
    expect(output).toContain('Archived 1 resolved debt items. 0 items remaining.');
  });

  it('handles content with no table header gracefully — no rows parsed', async () => {
    const content = 'Just some text\nwithout a proper table header\n| col1 | col2 |';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(content);

    const output = await runCommand();
    // No header found → no rows parsed → nothing to archive
    expect(output).toContain('No resolved debt items to archive.');
  });
});
