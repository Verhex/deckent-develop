// APPROVE-007 (MASTER-PLAN §4G) — CLI nervous accept/reject route through the
// IPC queue to the live executor (single resolution channel), with a liveness
// guard + dismiss-only fallback when no executor is running.
//
// Two proofs (advisor): (1) CLI-unit — routes to IPC when a heartbeat says the
// executor is alive, dismisses (no execution, no 'accepted' history) when dead;
// (2) integration — drives the REAL poller so a routed approval actually reaches
// executor.resolveApproval and runs the action handler.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mockRoot: string;
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: (): string => mockRoot,
}));

import { registerNervous } from '../../src/cli/commands/nervous.js';
import {
  NervousIpcQueue,
  writeNervousHeartbeat,
  isNervousPollerAlive,
} from '../../src/nervous/ipc-queue.js';
import { Executor } from '../../src/nervous/executor.js';
import { makeFilePendingStore } from '../../src/nervous/bootstrap.js';
import type { NervousNotification } from '../../src/core/nervous-types.js';

function notif(id: string): NervousNotification {
  return {
    id, type: 't', title: 'T', message: 'M', severity: 'warning',
    createdAt: '2026-06-05T00:00:00.000Z', detectorId: 'd',
    actions: [{ id: 'ACT', label: 'Do', policy: 'approve', risk: 'medium', isSafetyFloor: false }],
    timeoutMs: null,
  };
}

function plantPending(root: string, id: string): void {
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'nervous-pending.json'), JSON.stringify([notif(id)]), 'utf-8');
}

function readPending(root: string): unknown[] {
  const p = join(root, '.deckent', 'nervous-pending.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : [];
}

function ipcPendingCount(root: string): number {
  const dir = join(root, '.deckent', 'nervous-ipc', 'pending');
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).length : 0;
}

function runCli(args: string[]): Promise<Command> {
  const program = new Command();
  program.exitOverride();
  registerNervous(program);
  return program.parseAsync(['node', 'test', ...args]);
}

function captureStdout(fn: () => Promise<void>): Promise<string> {
  const captured: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
    captured.push(typeof c === 'string' ? c : String(c)); return true;
  });
  return fn().finally(() => spy.mockRestore()).then(() => captured.join(''));
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

describe('APPROVE-007 — CLI nervous IPC routing + liveness', () => {
  beforeEach(() => { mockRoot = mkdtempSync(join(tmpdir(), 'nervous-ipc-route-')); });
  afterEach(() => rmSync(mockRoot, { recursive: true, force: true }));

  it('routes accept to the IPC queue when the executor is alive (CLI does not mutate pending)', async () => {
    plantPending(mockRoot, 'n1');
    writeNervousHeartbeat(mockRoot); // executor "alive"

    const out = await captureStdout(() => runCli(['nervous', 'accept', 'n1', '--lang', 'en']));

    expect(ipcPendingCount(mockRoot)).toBe(1);            // wrote an IPC approval
    expect(readPending(mockRoot)).toHaveLength(1);        // CLI did NOT remove (executor owns it)
    expect(out.toLowerCase()).toContain('executor');
  });

  it('dismisses accept with a warning when no executor is alive (no execution, no accepted history)', async () => {
    plantPending(mockRoot, 'n1');
    // no heartbeat → dead

    const out = await captureStdout(() => runCli(['nervous', 'accept', 'n1', '--lang', 'en']));

    expect(ipcPendingCount(mockRoot)).toBe(0);            // no IPC routing
    expect(readPending(mockRoot)).toHaveLength(0);        // dismissed from pending
    expect(out.toLowerCase()).toContain('no live');
    const hist = join(mockRoot, '.deckent', 'nervous-history.jsonl');
    const histContent = existsSync(hist) ? readFileSync(hist, 'utf-8') : '';
    expect(histContent).not.toContain('"decision":"accepted"'); // no audit lie
  });

  it('integration: a routed approval reaches the real poller and runs the action handler', async () => {
    const actionCalls: string[] = [];
    const history = { append: async (): Promise<void> => {} };
    const store = makeFilePendingStore(mockRoot);
    const executor = new Executor(
      history,
      async (actionId: string): Promise<{ outcome: 'success' }> => { actionCalls.push(actionId); return { outcome: 'success' }; },
      store,
    );
    const ipc = new NervousIpcQueue(mockRoot);
    const poll = ipc.startPolling(
      (req) => executor.resolveApproval(req.notificationId, req.decision),
      10, // fast tick for the test
    );
    try {
      const n = notif('n2');
      const handlePromise = executor.handle(n); // parks (approve policy)
      await Promise.resolve();

      expect(isNervousPollerAlive(mockRoot)).toBe(false); // heartbeat not written yet by this harness
      writeNervousHeartbeat(mockRoot);
      await new NervousIpcQueue(mockRoot).writeApproval({ notificationId: n.id, decision: 'accepted' });

      // poller ticks → resolveApproval → action handler runs
      for (let i = 0; i < 50 && actionCalls.length === 0; i++) await sleep(20);
      await handlePromise;
      expect(actionCalls).toContain('ACT');
    } finally {
      poll.dispose();
    }
  });
});
