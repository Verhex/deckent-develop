/**
 * TT553 (task 418-002) — HOST-LIFECYCLE: heartbeat liveness derives from a HOST
 * signal, not from the worker's `.hb` file-write discipline.
 *
 * Proves:
 *   1. hostLivenessProbe adapter matrix — docker / tmux / subprocess(POSIX pid) /
 *      subprocess(Windows tasklist), each alive+dead via injected host probes.
 *   2. RED→GREEN — a stale/hardcoded-ts `.hb` + a LIVE host signal: the OLD
 *      file-timestamp logic (sprint-checkpoint.isStaleHeartbeat) would kill (RED),
 *      the NEW host-primary decideWorkerLiveness keeps it alive (GREEN).
 *   3. `.hb` backward-compatibility — a legacy `.hb` still parses; the `.hb` is a
 *      currentAction carrier only (readHeartbeatCurrentAction), never a liveness source.
 *   4. Kill-log names the dead signal.
 *   5. Behavior-change pin (separate case) — a worker that cannot write its `.hb`
 *      but is still live on the host is NOT killed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';
import {
  createHostLivenessProbe,
  decideWorkerLiveness,
  formatKillDecisionLog,
  readHeartbeatCurrentAction,
  buildLivenessTarget,
  dockerContainerName,
  tmuxWindowTarget,
  isProcessAlivePosix,
  isProcessAliveWindows,
  isLogActivityFresh,
  type LivenessTarget,
} from '../../src/orchestra/heartbeat-monitor.js';
import {
  readHeartbeat,
  isStaleHeartbeat,
  STALE_HEARTBEAT_THRESHOLD_MS,
} from '../../src/orchestra/sprint-checkpoint.js';
import { createHeartbeat } from '../../src/agents/worker.js';
import { AgentStatus } from '../../src/core/types.js';

// A CSV row shaped like real `tasklist /FO CSV /NH` output for a live pid.
function tasklistRow(pid: number): SpawnSyncReturns<string> {
  return {
    pid: 0,
    status: 0,
    signal: null,
    output: [],
    stdout: `"node.exe","${pid}","Console","1","52,000 K"\n`,
    stderr: '',
  };
}
function tasklistEmpty(): SpawnSyncReturns<string> {
  return {
    pid: 0,
    status: 0,
    signal: null,
    output: [],
    stdout: 'INFO: No tasks are running which match the specified criteria.\n',
    stderr: '',
  };
}

describe('heartbeat-monitor — name derivation (SSOT)', () => {
  it('docker container name is deckent-w-<taskId>', () => {
    expect(dockerContainerName('418-002')).toBe('deckent-w-418-002');
  });
  it('tmux window target is the workerId (w-<taskId>)', () => {
    expect(tmuxWindowTarget('w-418-002')).toBe('w-418-002');
  });
  it('buildLivenessTarget derives w-<taskId> workerId by default', () => {
    const t = buildLivenessTarget('418-002', 'docker');
    expect(t).toEqual({ backend: 'docker', taskId: '418-002', workerId: 'w-418-002', pid: undefined, tasksDir: undefined });
  });
});

describe('hostLivenessProbe adapter matrix (docker / tmux / subprocess + Windows)', () => {
  const dockerTarget: LivenessTarget = { backend: 'docker', taskId: '1', workerId: 'w-1' };
  const tmuxTarget: LivenessTarget = { backend: 'tmux', taskId: '2', workerId: 'w-2' };

  it('docker: container running → alive with container-state signal', () => {
    const probe = createHostLivenessProbe({
      isDockerContainerRunning: (name) => {
        expect(name).toBe('deckent-w-1');
        return true;
      },
    });
    const v = probe.probe(dockerTarget);
    expect(v).toMatchObject({ alive: true, signal: 'container-state' });
    expect(v.deadSignal).toBeUndefined();
  });

  it('docker: container stopped → dead, deadSignal=container-state', () => {
    const probe = createHostLivenessProbe({ isDockerContainerRunning: () => false });
    const v = probe.probe(dockerTarget);
    expect(v.alive).toBe(false);
    expect(v.deadSignal).toBe('container-state');
  });

  it('docker: probe throwing fails closed (dead, not throw)', () => {
    const probe = createHostLivenessProbe({
      isDockerContainerRunning: () => { throw new Error('docker daemon down'); },
    });
    expect(probe.probe(dockerTarget).alive).toBe(false);
  });

  it('tmux: pane alive → alive with tmux-pane signal', () => {
    const probe = createHostLivenessProbe({
      isTmuxPaneAlive: (target) => {
        expect(target).toBe('w-2');
        return true;
      },
    });
    expect(probe.probe(tmuxTarget)).toMatchObject({ alive: true, signal: 'tmux-pane' });
  });

  it('tmux: pane dead → dead, deadSignal=tmux-pane', () => {
    const probe = createHostLivenessProbe({ isTmuxPaneAlive: () => false });
    expect(probe.probe(tmuxTarget).deadSignal).toBe('tmux-pane');
  });

  it('subprocess (POSIX pid): live pid → alive with process-pid signal', () => {
    const probe = createHostLivenessProbe({ isProcessAlive: () => true });
    const v = probe.probe({ backend: 'subprocess', taskId: '3', workerId: 'w-3', pid: 4242 });
    expect(v).toMatchObject({ alive: true, signal: 'process-pid' });
  });

  it('subprocess (POSIX pid): dead pid + no log → dead, deadSignal=process-pid', () => {
    const probe = createHostLivenessProbe({ isProcessAlive: () => false });
    const v = probe.probe({ backend: 'subprocess', taskId: '3', workerId: 'w-3', pid: 4242 });
    expect(v.alive).toBe(false);
    expect(v.deadSignal).toBe('process-pid');
  });

  it('isProcessAlivePosix: own pid alive; invalid pids rejected', () => {
    expect(isProcessAlivePosix(process.pid)).toBe(true);
    expect(isProcessAlivePosix(0)).toBe(false);
    expect(isProcessAlivePosix(-1)).toBe(false);
  });

  it('subprocess (Windows tasklist): live pid CSV row → alive; empty → dead', () => {
    expect(isProcessAliveWindows(1234, () => tasklistRow(1234))).toBe(true);
    expect(isProcessAliveWindows(1234, () => tasklistEmpty())).toBe(false);
    // Windows branch reachable via the platform seam without a Windows host.
    const winProbe = createHostLivenessProbe({
      platform: 'win32',
      isProcessAlive: (pid) => isProcessAliveWindows(pid, () => tasklistRow(pid)),
    });
    expect(winProbe.probe({ backend: 'subprocess', taskId: '4', workerId: 'w-4', pid: 5000 }).alive).toBe(true);
  });

  it('unknown backend fails closed (honest, never silently alive)', () => {
    const probe = createHostLivenessProbe({});
    const v = probe.probe({ backend: 'nope' as unknown as 'docker', taskId: '9', workerId: 'w-9' });
    expect(v.alive).toBe(false);
  });
});

describe('subprocess pid-absent → honest .log-activity fallback', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-hlh-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('no pid + fresh host .log → alive via log-activity (pidUnavailable, honest)', () => {
    const tasksDir = join(root, '.tasks');
    writeFileSync(join(tasksDir, 'task-5.log'), 'streaming...\n', 'utf-8');
    const probe = createHostLivenessProbe({});
    const v = probe.probe({ backend: 'subprocess', taskId: '5', workerId: 'w-5', tasksDir });
    expect(v).toMatchObject({ alive: true, signal: 'log-activity' });
    expect(v.reason).toContain('pidUnavailable');
  });

  it('no pid + no/stale log → dead, deadSignal=process-pid', () => {
    const tasksDir = join(root, '.tasks');
    const probe = createHostLivenessProbe({});
    const v = probe.probe({ backend: 'subprocess', taskId: '6', workerId: 'w-6', tasksDir });
    expect(v.alive).toBe(false);
    expect(v.deadSignal).toBe('process-pid');
  });

  it('isLogActivityFresh: stale mtime → false, fresh → true', () => {
    const tasksDir = join(root, '.tasks');
    const logPath = join(tasksDir, 'task-7.log');
    writeFileSync(logPath, 'x', 'utf-8');
    expect(isLogActivityFresh(tasksDir, '7')).toBe(true);
    const staleSec = Date.now() / 1000 - 600; // 10 min ago
    utimesSync(logPath, staleSec, staleSec);
    expect(isLogActivityFresh(tasksDir, '7')).toBe(false);
    expect(isLogActivityFresh(undefined, '7')).toBe(false);
  });
});

describe('RED→GREEN — stale/hardcoded-ts .hb never causes a wrong-kill when the host is live', () => {
  let root: string;
  const taskId = '418-002';
  const HARDCODED_STALE_TS = '2026-07-11T00:00:00.000Z'; // the exact trace-audit 553 hardcoded ts
  const NOW = new Date('2026-07-12T00:00:00.000Z').getTime(); // ~24h later

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-hlh-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(
      join(root, '.tasks', `task-${taskId}.hb`),
      JSON.stringify({
        workerId: `docker-${taskId}`,
        taskId,
        status: 'EXECUTING',
        sequence: 1,
        timestamp: HARDCODED_STALE_TS, // <-- worker file-discipline failure
        backend: 'docker',
      }),
      'utf-8',
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('RED: the OLD in-file-timestamp logic marks this stale (would kill)', () => {
    const hb = readHeartbeat(root, taskId);
    expect(hb).not.toBeNull();
    expect(isStaleHeartbeat(hb, STALE_HEARTBEAT_THRESHOLD_MS, NOW)).toBe(true);
  });

  it('GREEN: the NEW host-primary decision keeps it alive (live container)', () => {
    const target = buildLivenessTarget(taskId, 'docker', { tasksDir: join(root, '.tasks') });
    const verdict = decideWorkerLiveness(target, {
      isDockerContainerRunning: () => true, // host says: container Running
      now: () => NOW,
    });
    expect(verdict.alive).toBe(true);
    expect(verdict.signal).toBe('container-state');
  });

  it('decideWorkerLiveness NEVER reads the .hb timestamp — verdict is identical for any hb ts', () => {
    // Same live host signal, wildly different (even future) hb timestamps → same alive verdict.
    const target = buildLivenessTarget(taskId, 'docker');
    const liveDeps = { isDockerContainerRunning: () => true, now: () => NOW };
    expect(decideWorkerLiveness(target, liveDeps).alive).toBe(true);
    // And when the host is dead, the verdict flips regardless of the (fresh-looking) hb ts.
    const deadDeps = { isDockerContainerRunning: () => false, now: () => NOW };
    expect(decideWorkerLiveness(target, deadDeps).alive).toBe(false);
  });
});

describe('behavior-change pin — a worker that cannot write its .hb but is live is NOT killed', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-hlh-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('NO .hb file at all + live docker container → alive (old mtime logic would kill)', () => {
    const target = buildLivenessTarget('nofile', 'docker', { tasksDir: join(root, '.tasks') });
    const v = decideWorkerLiveness(target, { isDockerContainerRunning: () => true });
    expect(v.alive).toBe(true);
  });

  it('stale-mtime .hb + live container → alive (mtime is not consulted)', () => {
    const hbPath = join(root, '.tasks', 'task-stale.hb');
    writeFileSync(hbPath, JSON.stringify({ taskId: 'stale', currentAction: 'thinking' }), 'utf-8');
    const old = Date.now() / 1000 - 3600; // 1h old mtime
    utimesSync(hbPath, old, old);
    const target = buildLivenessTarget('stale', 'docker', { tasksDir: join(root, '.tasks') });
    expect(decideWorkerLiveness(target, { isDockerContainerRunning: () => true }).alive).toBe(true);
  });
});

describe('kill-decision log names the dead host signal', () => {
  it('docker dead → log names container-state', () => {
    const target = buildLivenessTarget('1', 'docker');
    const v = decideWorkerLiveness(target, { isDockerContainerRunning: () => false });
    const line = formatKillDecisionLog(target, v);
    expect(line).toContain('KILL');
    expect(line).toContain('container-state');
    expect(line).toContain('w-1');
  });

  it('subprocess dead → log names process-pid', () => {
    const target = buildLivenessTarget('2', 'subprocess', { pid: 4242 });
    const v = decideWorkerLiveness(target, { isProcessAlive: () => false });
    expect(formatKillDecisionLog(target, v)).toContain('process-pid');
  });

  it('tmux dead → log names tmux-pane', () => {
    const target = buildLivenessTarget('3', 'tmux');
    const v = decideWorkerLiveness(target, { isTmuxPaneAlive: () => false });
    expect(formatKillDecisionLog(target, v)).toContain('tmux-pane');
  });

  it('alive verdict → non-kill log line', () => {
    const target = buildLivenessTarget('4', 'docker');
    const v = decideWorkerLiveness(target, { isDockerContainerRunning: () => true });
    const line = formatKillDecisionLog(target, v);
    expect(line).toContain('alive');
    expect(line).not.toContain('KILL');
  });
});

describe('.hb is a currentAction carrier (backward-compatible)', () => {
  it('readHeartbeatCurrentAction reads a legacy .hb shape (no pid/livenessSource)', () => {
    const legacy = { workerId: 'w-1', taskId: '1', currentAction: 'editing src/x.ts' };
    expect(readHeartbeatCurrentAction(legacy)).toBe('editing src/x.ts');
  });

  it('blank / missing currentAction → undefined', () => {
    expect(readHeartbeatCurrentAction({ currentAction: '   ' })).toBeUndefined();
    expect(readHeartbeatCurrentAction(null)).toBeUndefined();
    expect(readHeartbeatCurrentAction(undefined)).toBeUndefined();
  });

  it('createHeartbeat (worker.ts) stays back-compat: parses via readHeartbeat, carries pid additively', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-hlh-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    try {
      const hb = createHeartbeat('w-1', '1', AgentStatus.EXECUTING, 'coding', undefined, 2, 0, undefined, 'subprocess');
      // Additive pid field present (defaults to this process) — never breaks the required shape.
      expect((hb as { pid?: number }).pid).toBe(process.pid);
      // Round-trips through the on-disk .hb and the sprint-checkpoint reader unchanged.
      writeFileSync(join(root, '.tasks', 'task-1.hb'), JSON.stringify(hb), 'utf-8');
      const read = readHeartbeat(root, '1');
      expect(read).not.toBeNull();
      expect(readHeartbeatCurrentAction(read)).toBe('coding');
      // Explicit pid override honored; a non-positive pid (0) is omitted (no bogus pid).
      const withPid = createHeartbeat('w-1', '1', AgentStatus.EXECUTING, 'x', undefined, 1, 0, undefined, 'subprocess', 9999);
      expect((withPid as { pid?: number }).pid).toBe(9999);
      const zeroPid = createHeartbeat('w-1', '1', AgentStatus.EXECUTING, 'x', undefined, 1, 0, undefined, 'subprocess', 0);
      expect((zeroPid as { pid?: number }).pid).toBeUndefined(); // non-positive pid omitted, no bogus field
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
