// tests/cli/autonomous-command.test.ts
//
// Hermetic CLI tests for `deckent autonomous` (Sprint 226 — Task 226-007).
// Verify start kurar loop, status özet, stop temiz, default-deny korunur.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  registerAutonomous,
  handleStart,
  handleStatus,
  handleStop,
} from '../../src/cli/commands/autonomous.js';
import { useSandboxHome } from '../helpers/sandbox-home.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function mkRoot(): string {
  return mkdtempSync(join(tmpdir(), 'autonomous-cli-'));
}

function writeFlow(
  root: string,
  flow: { id: string; cronExpr: string; action: string; tenantId: string; enabled: boolean },
): void {
  const dir = join(root, '.deckent', 'flows', flow.tenantId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${flow.id}.json`), JSON.stringify(flow, null, 2), 'utf-8');
}

function runCli(args: string[]): Promise<Command> {
  const program = new Command();
  program.exitOverride();
  registerAutonomous(program);
  return program.parseAsync(['node', 'deckent', ...args]);
}

function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  const captured: string[] = [];
  const restore = (): void => spy.mockRestore();
  const result = fn();
  if (result instanceof Promise) {
    return result.finally(restore).then(() => captured.join(''));
  }
  restore();
  return Promise.resolve(captured.join(''));
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('deckent autonomous CLI (226-007)', () => {
  let root: string;

  // Isolate HOME so loadConfig cannot read the real ~/.deckent/config.json.
  const { beforeEach: sandboxBefore, afterEach: sandboxAfter } = useSandboxHome();
  beforeEach(sandboxBefore);
  afterEach(sandboxAfter);

  beforeEach(() => {
    root = mkRoot();
    process.exitCode = undefined;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('stop → writes stop marker file under .deckent/autonomous/', async () => {
    const out = await captureStdout(() => handleStop({ root, lang: 'en' }));
    const marker = join(root, '.deckent', 'autonomous', 'stop');
    expect(existsSync(marker)).toBe(true);
    expect(out).toContain('Stop signal written');
  });

  it('status → summary with pending count + last audit events', async () => {
    // Plant pending.json with 2 entries
    const pendingDir = join(root, '.deckent', 'autonomous');
    mkdirSync(pendingDir, { recursive: true });
    writeFileSync(
      join(pendingDir, 'pending.json'),
      JSON.stringify([
        { triggerId: 'a', action: 'mrp.refresh', requestedBy: 'worker', enqueuedAt: '2026-06-04T00:00:00.000Z' },
        { triggerId: 'b', action: 'mrp.refresh', requestedBy: 'worker', enqueuedAt: '2026-06-04T00:01:00.000Z' },
      ]),
      'utf-8',
    );
    // Plant audit JSONL with one event
    const eventsFile = join(root, '.deckent', 'autonomous-events.jsonl');
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(eventsFile, JSON.stringify({
      timestamp: '2026-06-04T00:02:00.000Z',
      sequence: 1,
      protocol_version: '1.0',
      source: 'deckent',
      target: '*',
      channel: 'AUTONOMOUS:AUDIT',
      payload: {
        triggerId: 'a', action: 'mrp.refresh', requestedBy: 'worker',
        outcome: 'denied', reason: 'default-deny test',
        timestamp: '2026-06-04T00:02:00.000Z',
      },
    }) + '\n', 'utf-8');

    const out = await captureStdout(() => handleStatus({ root, lang: 'en' }));
    expect(out).toContain('Autonomous runtime status');
    expect(out).toContain('Pending approvals: 2');
    expect(out).toContain('Recent audit (1)');
    expect(out).toContain('mrp.refresh');
    expect(out).toContain('denied');
  });

  it('start → loop kurar, maxIterations=1 ile temiz biter (idle, no flows)', async () => {
    // Enable autonomous engine via config (flag-gate requires autonomous.enabled=true).
    const configDir = join(root, '.deckent');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ autonomous: { enabled: true } }, null, 2),
      'utf-8',
    );
    const out = await captureStdout(() =>
      handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' }),
    );
    expect(out).toContain('Autonomous runtime started');
    expect(out).toContain('Autonomous loop finished');
    // 1 iteration, idle → no audit events written
    const eventsFile = join(root, '.deckent', 'autonomous-events.jsonl');
    expect(existsSync(eventsFile)).toBe(false);
  });

  it('start refuses when autonomous.enabled is false (flag-gate)', async () => {
    // No config written → autonomous.enabled is undefined/falsy → engine must NOT run.
    const out = await captureStdout(() =>
      handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' }),
    );
    expect(out).toContain('Autonomous mode is disabled');
    // Loop never ran — no banner, no "finished" line.
    expect(out).not.toContain('Autonomous runtime started');
    expect(out).not.toContain('Autonomous loop finished');
  });

  it('default-deny korunur — bilinmeyen tenant flow → audit "denied", oto-exec yok', async () => {
    // Enable autonomous engine via config (flag-gate requires autonomous.enabled=true).
    const configDir = join(root, '.deckent');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ autonomous: { enabled: true } }, null, 2),
      'utf-8',
    );

    // Plant a flow whose tenantId is not a known role → authority adapter denies.
    writeFlow(root, {
      id: 'flow-external',
      cronExpr: '* * * * *',
      action: 'mrp.refresh',
      tenantId: 'external-tenant-x',
      enabled: true,
    });

    await captureStdout(() =>
      handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' }),
    );

    const eventsFile = join(root, '.deckent', 'autonomous-events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const lines = readFileSync(eventsFile, 'utf-8').split('\n').filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const ev = JSON.parse(lines[0]!) as { payload: { outcome: string; reason: string } };
    expect(ev.payload.outcome).toBe('denied');
    expect(ev.payload.reason.toLowerCase()).toContain('default-deny');
  });

  it('CLI wiring — `autonomous status` parses + emits status header', async () => {
    // Use --root since process.cwd() may not be tmpdir.
    const out = await captureStdout(() =>
      runCli(['autonomous', 'status', '--root', root]),
    );
    expect(out).toContain('Autonomous runtime status');
    expect(out).toContain('Pending approvals: 0');
  });
});
