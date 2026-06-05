// MSG-003 (MASTER-PLAN §4G) — checkpoint CLI i18n.
//
// checkpoint.ts printed hardcoded English (empty-state, table headers, approve/
// reject confirmations, not-found errors) with zero getMessage usage — a human
// approval-gate surface that ignored the session language. This retrofits it
// through getMessage so --lang tr / en is honoured (CLAUDE.md i18n-FIRST).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mockRoot: string;
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: (): string => mockRoot,
}));

import { registerCheckpoint } from '../../src/cli/commands/checkpoint.js';

function runCli(args: string[]): Promise<Command> {
  const program = new Command();
  program.exitOverride();
  registerCheckpoint(program);
  return program.parseAsync(['node', 'test', ...args]);
}

function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const captured: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  const restore = (): void => spy.mockRestore();
  const result = fn();
  if (result instanceof Promise) return result.finally(restore).then(() => captured.join(''));
  restore();
  return Promise.resolve(captured.join(''));
}

function writeCheckpoint(root: string, sprintId: string, phase: string): void {
  const dir = join(root, '.deckent', 'checkpoints');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `checkpoint-${sprintId}-${phase}.json`),
    JSON.stringify({ phase, summary: 'S', status: 'pending', createdAt: '2026-06-05T00:00:00.000Z' }),
    'utf-8',
  );
}

describe('checkpoint CLI i18n (MSG-003)', () => {
  beforeEach(() => {
    mockRoot = mkdtempSync(join(tmpdir(), 'checkpoint-i18n-'));
  });
  afterEach(() => rmSync(mockRoot, { recursive: true, force: true }));

  it('list empty-state is localized by --lang', async () => {
    const en = await captureStdout(() => runCli(['checkpoint', 'list', '--lang', 'en']));
    const tr = await captureStdout(() => runCli(['checkpoint', 'list', '--lang', 'tr']));
    expect(en).toContain('No checkpoints found.');
    expect(tr).toContain('Checkpoint bulunamadı.');
    expect(tr).not.toContain('No checkpoints found.');
  });

  it('approve confirmation is localized', async () => {
    writeCheckpoint(mockRoot, 's1', 'plan');
    const tr = await captureStdout(() =>
      runCli(['checkpoint', 'approve', 's1', 'plan', '--lang', 'tr']),
    );
    expect(tr).toContain('onaylandı');
  });

  it('reject confirmation is localized', async () => {
    writeCheckpoint(mockRoot, 's2', 'evaluate');
    const tr = await captureStdout(() =>
      runCli(['checkpoint', 'reject', 's2', 'evaluate', '--lang', 'tr']),
    );
    expect(tr).toContain('reddedildi');
  });
});
