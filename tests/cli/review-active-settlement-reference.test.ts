import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

const authority = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../src/orchestra/task-result-authority.js', () => ({
  readAuthoritativeTaskResult: authority.read,
}));

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { print, printError } from '../../src/cli/helpers/output.js';
import {
  registerReview,
  toReviewSettlementReference,
} from '../../src/cli/commands/review.js';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';

const statuses = ['ACTIVE', 'PAUSED', 'DONE', 'NO_GO'] as const;

function task(id: string, status: typeof statuses[number]): Record<string, unknown> {
  return {
    id,
    title: id,
    description: id,
    model: 'codex',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status,
    sprintId: 'run-live',
  };
}

async function reviewJson(): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerReview(program);
  await program.parseAsync(['node', 'test', 'review', '--json']);
}

describe('review settlement-reference read side', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(existsSync).mockImplementation((path) => String(path).endsWith('.tasks'));
    vi.mocked(readdirSync).mockReturnValue(statuses.map((_, index) => `task-00${index + 1}.json`) as never);
    vi.mocked(readFileSync).mockImplementation((path) => {
      const id = /task-(\d+)\.json$/.exec(String(path))?.[1] ?? '001';
      return JSON.stringify(task(id, statuses[Number(id) - 1] ?? 'ACTIVE'));
    });
  });

  it('returns an exit-0 typed view for ACTIVE, PAUSED, and terminal tasks without writes', async () => {
    authority.read.mockImplementation((_root: string, taskId: string) => {
      if (taskId === '001') return { result: null, settlementRef: null };
      if (taskId === '002') return { result: null, settlementRef: { version: 'broken' } };
      if (taskId === '003') return { result: null, settlementRef: { taskId, attemptId: 'old' } };
      return {
        result: { selfAssessment: 'NO_GO' },
        settlementRef: {
          version: 1,
          taskId,
          attemptId: 'attempt-safe',
          tenantId: 'secret-tenant',
          projectId: 'other-project',
          runId: 'other-run',
        },
      };
    });

    await reviewJson();

    const output = vi.mocked(print).mock.calls.map(([line]) => String(line)).find((line) => line.startsWith('{'));
    const view = JSON.parse(output!);
    expect(view.tasks.map((entry: { status: string }) => entry.status)).toEqual(statuses);
    expect(view.tasks.map((entry: { settlementReference: { kind: string } }) => entry.settlementReference.kind))
      .toEqual(['missing', 'corrupt', 'legacy', 'valid']);
    expect(view.tasks[3].settlementReference).toEqual({
      kind: 'valid', taskId: '004', attemptId: 'attempt-safe',
    });
    expect(output).not.toContain('secret-tenant');
    expect(output).not.toContain('other-project');
    expect(output).not.toContain('other-run');
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(printError).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('turns an authority parse failure into corrupt typed output rather than a stack trace', async () => {
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as never);
    authority.read.mockImplementation(() => { throw new Error('private host path'); });

    await reviewJson();

    const output = vi.mocked(print).mock.calls.map(([line]) => String(line)).find((line) => line.startsWith('{'))!;
    expect(JSON.parse(output).tasks[0].settlementReference).toEqual({ kind: 'corrupt' });
    expect(output).not.toContain('private host path');
    expect(printError).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('rejects cross-task references and catalogs every new user-facing label in EN/TR', () => {
    expect(toReviewSettlementReference(
      { version: 1, taskId: 'outside', attemptId: 'attempt-secret' },
      'inside',
    )).toEqual({ kind: 'corrupt' });

    for (const kind of ['valid', 'missing', 'corrupt', 'legacy']) {
      const key = `review.settlement_reference.${kind}`;
      expect(getMessageLanguages(key)).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en')).not.toBe(key);
      expect(getMessage(key, 'tr')).not.toBe(key);
    }
  });
});
