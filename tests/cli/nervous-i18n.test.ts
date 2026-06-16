// MSG-002 (MASTER-PLAN §4G) — nervous CLI i18n.
//
// nervous.ts printed hardcoded English prose (dashboard labels, accept/reject/
// edit/undo confirmations, history headers) AND a hardcoded-Turkish timeAgo —
// zero getMessage usage, so the surface ignored --lang. This retrofits the
// human-facing strings through getMessage (CLAUDE.md i18n-FIRST).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mockRoot: string;
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: (): string => mockRoot,
}));

import { registerNervous } from '../../src/cli/commands/nervous.js';
import { handleNervousSlash } from '../../src/cli/commands/chat-nervous-bridge.js';

function runCli(args: string[]): Promise<Command> {
  const program = new Command();
  program.exitOverride();
  registerNervous(program);
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

function plantPending(root: string, id: string): void {
  mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
  writeFileSync(
    join(root, '.deckent', 'nervous', 'nervous-pending.json'),
    JSON.stringify([
      {
        id,
        type: 't',
        title: 'T',
        message: 'M',
        severity: 'warning',
        createdAt: '2026-06-05T00:00:00.000Z',
        detectorId: 'd',
        actions: [{ id: 'a1', label: 'Do', policy: 'approve', risk: 'medium', isSafetyFloor: false }],
        timeoutMs: null,
      },
    ]),
    'utf-8',
  );
}

describe('nervous CLI i18n (MSG-002)', () => {
  beforeEach(() => {
    mockRoot = mkdtempSync(join(tmpdir(), 'nervous-i18n-'));
  });
  afterEach(() => rmSync(mockRoot, { recursive: true, force: true }));

  it('dashboard empty-state is localized by --lang', async () => {
    const tr = await captureStdout(() => runCli(['nervous', '--lang', 'tr']));
    expect(tr).toContain('Bekleyen bildirim yok');
    expect(tr).not.toContain('No pending notifications');
  });

  it('accept confirmation is localized (dismiss fallback — no live executor)', async () => {
    plantPending(mockRoot, 'n1');
    // No nervous executor runs in this test → accept falls back to dismiss
    // (APPROVE-007); the fallback message is localized too.
    const tr = await captureStdout(() => runCli(['nervous', 'accept', 'n1', '--lang', 'tr']));
    expect(tr).toContain('kapatıldı');
  });

  it('history empty-state is localized', async () => {
    const tr = await captureStdout(() => runCli(['nervous', 'history', '--lang', 'tr']));
    expect(tr).toContain('Geçmiş kaydı bulunamadı');
  });

  it('REPL /nervous bridge is localized', () => {
    expect(handleNervousSlash([], mockRoot, false, 'tr')).toContain('bekleyen bildirim yok');
    expect(handleNervousSlash([], mockRoot, false, 'en')).toContain('no pending notifications');
    expect(handleNervousSlash(['accept'], mockRoot, false, 'tr')).toContain('id gerekli');
  });
});
