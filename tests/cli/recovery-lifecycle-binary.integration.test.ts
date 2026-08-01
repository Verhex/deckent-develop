import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { processStartToken } from '../../src/core/pid-ownership.js';

const entryPath = resolve('dist/cli/entry.js');

function runBinary(
  args: string[],
  cwd = process.cwd(),
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const childEnv = { ...process.env, NO_COLOR: '1', DECKENT_OFFLINE: '1' };
    delete childEnv['VITEST'];
    delete childEnv['VITEST_POOL_ID'];
    delete childEnv['VITEST_WORKER_ID'];
    delete childEnv['NODE_ENV'];
    delete childEnv['DECKENT_TEST_HERMETICITY'];
    delete childEnv['NODE_CHANNEL_FD'];
    delete childEnv['NODE_CHANNEL_SERIALIZATION_MODE'];
    const child = spawn(process.execPath, [entryPath, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: childEnv,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', code => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

async function waitForFile(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for coordinator signal marker: ${path}`);
    }
    await new Promise<void>(resolveWait => { setTimeout(resolveWait, 10); });
  }
}

// A Vitest `forks` worker already owns an IPC channel. On affected Node/Vitest
// hosts, spawning another Node CLI from that nested worker can report exit 0
// while dropping both captured stdio streams. That is a runner transport fault,
// not a valid binary observation. The dedicated binary-contract command runs
// this suite in the threads pool; default fork runs skip it honestly.
const NESTED_FORK_RUNNER = typeof process.send === 'function';

describe.skipIf(NESTED_FORK_RUNNER)('recovery lifecycle real binary', () => {
  it('inspects an isolated paused run read-only and never calls a provider', async () => {
    const root = mkdtempSync(join(tmpdir(), 'recovery-binary-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: 'sprint-991',
      phase: 'EVALUATE',
      status: 'PAUSED',
    }));
    writeFileSync(join(root, '.deckent', 'pause-state.json'), JSON.stringify({
      sprintId: 'sprint-991',
      phase: 'EVALUATE',
      status: 'PAUSED',
    }));
    writeFileSync(join(root, '.tasks', 'task-991-001.json'), JSON.stringify({
      id: '991-001',
      sprintId: 'sprint-991',
      status: 'PENDING',
    }));

    const before = JSON.stringify({
      state: await import('node:fs/promises').then(fs =>
        fs.readFile(join(root, '.deckent', 'sprint-state.json'), 'utf8')),
      task: await import('node:fs/promises').then(fs =>
        fs.readFile(join(root, '.tasks', 'task-991-001.json'), 'utf8')),
    });
    const result = await runBinary([
      'recover',
      'sprint-991',
      '--dry-run',
      '--json',
    ], root);
    const after = JSON.stringify({
      state: await import('node:fs/promises').then(fs =>
        fs.readFile(join(root, '.deckent', 'sprint-state.json'), 'utf8')),
      task: await import('node:fs/promises').then(fs =>
        fs.readFile(join(root, '.tasks', 'task-991-001.json'), 'utf8')),
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout, JSON.stringify(result)).not.toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      sprintId: 'sprint-991',
      dryRun: true,
      identity: {
        executionId: 'sprint-991',
        generation: 0,
        taskId: 'sprint-991',
        attemptId: 'sprint-991:recovery:0',
      },
      taskFilesPreserved: 1,
    });
    expect(after).toBe(before);
  });

  const linuxIt = process.platform === 'linux' ? it : it.skip;
  linuxIt('force-finalize proves exact coordinator death before COMPLETE authority publication', async () => {
    const root = mkdtempSync(join(tmpdir(), 'finalize-containment-binary-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'containment-fixture', version: '1.0.0' }));
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({
      language: 'en',
      cleanup_delay_ms: 0,
      lifecycle_recovery: {
        coordinator_termination_grace_ms: 1_000,
        termination_poll_interval_ms: 20,
        forced_termination_verify_ms: 1_000,
      },
    }));
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: 'sprint-992',
      phase: 'EVALUATE',
      status: 'ACTIVE',
      startedAt: '2026-07-31T00:00:00.000Z',
      taskIds: ['992-001'],
    }));
    writeFileSync(join(root, '.tasks', 'task-992-001.json'), JSON.stringify({
      id: '992-001',
      title: 'Containment fixture',
      description: 'Real-binary coordinator containment proof',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'integration proof',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'done', noGoCriteria: 'failed', techDebtAcceptable: 'none' },
      status: 'DONE',
      sprintId: 'sprint-992',
      createdAt: '2026-07-31T00:00:00.000Z',
    }));
    writeFileSync(join(root, '.tasks', 'task-992-001.result'), JSON.stringify({
      taskId: '992-001',
      workerId: 'w-992-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      evaluationDecision: 'DONE',
      notes: 'fixture complete',
      workAttribution: {
        state: 'VERIFIED',
        attemptId: 'binary-contract-attempt-992-001',
        baselineRef: 'binary-contract:fixture-baseline',
        scopeDigest: '9'.repeat(64),
      },
    }));

    const signalMarker = join(root, 'coordinator-sigterm.marker');
    const coordinator = spawn(process.execPath, ['-e', [
      "const fs = require('node:fs');",
      "process.on('SIGTERM', () => {",
      "  fs.writeFileSync(process.env.DECKENT_TEST_SIGNAL_MARKER, 'received');",
      '  setInterval(() => {}, 1000);',
      '});',
      'setInterval(() => {}, 1000);',
    ].join('\n')], {
      cwd: root,
      stdio: 'ignore',
      shell: false,
      env: { ...process.env, DECKENT_TEST_SIGNAL_MARKER: signalMarker },
    });
    const closed = new Promise<number | null>(resolveClose => {
      coordinator.once('close', code => resolveClose(code));
    });
    onTestFinished(() => {
      try { coordinator.kill('SIGKILL'); } catch { /* already dead */ }
    });
    expect(coordinator.pid).toBeTypeOf('number');
    const pid = coordinator.pid!;
    const startToken = processStartToken(pid);
    expect(startToken).toMatch(/^s\d+$/);
    writeFileSync(join(root, '.deckent', 'pids', 'sprint-992.pid'), JSON.stringify({
      pid,
      sprintId: 'sprint-992',
      startedAt: '2026-07-31T00:00:00.000Z',
      startToken,
    }));

    const finalize = runBinary([
      'finalize',
      '--sprint', 'sprint-992',
      '--force',
      '--skip-hooks',
      '--skip-decay',
    ], root);
    await waitForFile(signalMarker, 5_000);
    expect(JSON.parse(readFileSync(join(root, '.deckent', 'sprint-state.json'), 'utf-8'))).toMatchObject({
      sprintId: 'sprint-992',
      phase: 'EVALUATE',
      status: 'ACTIVE',
    });
    expect(existsSync(join(root, '.deckent', 'pids', 'sprint-992.pid'))).toBe(true);
    const result = await finalize;
    await closed;

    expect(result.code, JSON.stringify(result)).toBe(0);
    expect(existsSync(join(root, '.deckent', 'pids', 'sprint-992.pid'))).toBe(false);
    expect(JSON.parse(readFileSync(
      join(root, '.deckent', 'recently-works', 'sprint-992-terminal-receipt.json'),
      'utf-8',
    ))).toMatchObject({ receipt: { sprintId: 'sprint-992' } });
    expect(JSON.parse(readFileSync(join(root, '.deckent', 'sprint-state.json'), 'utf-8'))).toMatchObject({
      sprintId: 'sprint-992',
      phase: 'COMPLETE',
      status: 'COMPLETE',
    });
  }, 30_000);
});
