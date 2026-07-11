// tests/cli/init-backend-transaction.test.ts — Task 412-002 (RC2-B / INIT-02)
//
// Root cause (disk-verified, sol-sweep INIT-02): `deckent init`'s backend
// selection (`init-steps.ts::writeConfig`) only ever probed the docker CLI
// (`docker --version`, system-capacity.ts::detectSystemCapacity). A host with
// the CLI installed but the DAEMON dead/unreachable (Docker Desktop not
// started, dockerd crashed, socket permission denied) still got
// `spawn_backend: docker` written to config.json and left there — nothing
// downstream ever rewrote it. The user's first sprint then crashed against a
// dead daemon. This suite proves the fix:
//
//   1. `probeDockerDaemon` (system-capacity.ts) is a SEPARATE, injectable,
//      timeout-bounded async probe from the CLI-presence check.
//   2. `decideSpawnBackendTransaction` only returns 'docker' when BOTH signals
//      are alive; CLI-present-daemon-dead downgrades to subprocess.
//   3. `writeConfig` wires the transaction end-to-end: CLI-present +
//      daemon-down now writes `subprocess` + an honest, actionable message
//      (en+tr) instead of the pre-fix silent `docker`. This is the RED→GREEN
//      proof — the RED state is documented in each test's title/comments
//      (this exact scenario used to write `docker`); the assertion below is
//      the GREEN, currently-passing behavior.
//   4. `maybeOfferWorkerImageBuild` (init.ts) never leaves `spawn_backend:
//      docker` in config when the image-build offer is declined or the build
//      fails — same "lying config" bug, caught one step later.
//
// Fully hermetic: no real docker is ever spawned. `node:child_process` is
// mocked (mirrors tests/cli/deckent-bash-timeout-platform.test.ts /
// tests/cli/init-outcome-honesty.test.ts); all docker probes used directly
// (`probeDockerDaemon`) take an injected fake spawn. All fs I/O is real,
// scoped to per-test tmpdir roots (mirrors tests/cli/init-image-integration.test.ts).
//
// Note on the honest-outcome contract (412-001): these backend-downgrade
// messages are pure information, printed via `print()` only — they are never
// added to `buildInitUsageBlockers` / `classifyInitOutcome`, so a docker→
// subprocess downgrade can NEVER turn a run SETUP_INCOMPLETE. No wiring exists
// between the two by construction (goCriteria item 4).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── system-capacity.ts: pure + injectable-probe unit tests (no mocking) ────

import {
  probeDockerDaemon,
  decideSpawnBackendTransaction,
  type SystemCapacity,
} from '../../src/core/system-capacity.js';

type FakeDaemonChild = EventEmitter & { kill: ReturnType<typeof vi.fn> };

function fakeDaemonChild(mode: 'close-ok' | 'close-fail' | 'spawn-error'): FakeDaemonChild {
  const ee = new EventEmitter() as FakeDaemonChild;
  ee.kill = vi.fn();
  queueMicrotask(() => {
    if (mode === 'spawn-error') ee.emit('error', new Error('spawn docker ENOENT'));
    else ee.emit('close', mode === 'close-ok' ? 0 : 1);
  });
  return ee;
}

describe('probeDockerDaemon — separate from the CLI probe, injectable, never depends on real docker', () => {
  it('resolves true when `docker info` exits 0 (daemon reachable)', async () => {
    const spawnImpl = vi.fn(() => fakeDaemonChild('close-ok'));
    await expect(probeDockerDaemon(spawnImpl)).resolves.toBe(true);
    expect(spawnImpl).toHaveBeenCalledWith('docker', ['info']);
  });

  it('resolves false when `docker info` exits non-zero (daemon down — the RC2-B scenario)', async () => {
    const spawnImpl = vi.fn(() => fakeDaemonChild('close-fail'));
    await expect(probeDockerDaemon(spawnImpl)).resolves.toBe(false);
  });

  it('resolves false when the spawn itself errors (docker missing entirely)', async () => {
    const spawnImpl = vi.fn(() => fakeDaemonChild('spawn-error'));
    await expect(probeDockerDaemon(spawnImpl)).resolves.toBe(false);
  });

  it('resolves false when spawn throws synchronously', async () => {
    const spawnImpl = vi.fn((): FakeDaemonChild => {
      throw new Error('boom');
    });
    await expect(probeDockerDaemon(spawnImpl)).resolves.toBe(false);
  });

  it('resolves false (and kills the child) after the timeout when the daemon never responds', async () => {
    vi.useFakeTimers();
    try {
      const hanging = new EventEmitter() as FakeDaemonChild;
      hanging.kill = vi.fn();
      const spawnImpl = vi.fn(() => hanging);

      const promise = probeDockerDaemon(spawnImpl);
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(promise).resolves.toBe(false);
      expect(hanging.kill).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('decideSpawnBackendTransaction — docker only when CLI AND daemon are both alive', () => {
  const linuxCap = (dockerAvailable: boolean): SystemCapacity => ({
    totalRamGB: 16,
    freeRamGB: 8,
    cpuCores: 8,
    dockerAvailable,
    platform: 'linux',
  });

  it('CLI + daemon both alive -> docker, not downgraded', () => {
    expect(decideSpawnBackendTransaction(linuxCap(true), true)).toEqual({
      backend: 'docker',
      daemonDowngraded: false,
    });
  });

  it('CLI present, daemon dead -> subprocess, flagged as downgraded (never docker)', () => {
    expect(decideSpawnBackendTransaction(linuxCap(true), false)).toEqual({
      backend: 'subprocess',
      daemonDowngraded: true,
    });
  });

  it('CLI absent -> subprocess, not downgraded (nothing to downgrade from)', () => {
    expect(decideSpawnBackendTransaction(linuxCap(false), false)).toEqual({
      backend: 'subprocess',
      daemonDowngraded: false,
    });
  });

  it('win32 -> subprocess regardless of docker signals', () => {
    const cap: SystemCapacity = { totalRamGB: 16, freeRamGB: 8, cpuCores: 8, dockerAvailable: true, platform: 'win32' };
    expect(decideSpawnBackendTransaction(cap, true)).toEqual({ backend: 'subprocess', daemonDowngraded: false });
  });
});

// ─── writeConfig integration: end-to-end transaction (hermetic child_process mock) ──

const hoisted = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: hoisted.spawnSyncMock,
  spawn: hoisted.spawnMock,
}));

// Imported AFTER the mock — both init-steps.ts (detectSystemCapacity's CLI
// probe + the image-presence spawnSync) and system-capacity.ts's
// probeDockerDaemon (default spawn path) resolve to the mocked functions above.
import { writeConfig } from '../../src/cli/commands/init-steps.js';
import { maybeOfferWorkerImageBuild, type WorkerImageOfferSeams } from '../../src/cli/commands/init.js';

function mockCliPresent(): void {
  hoisted.spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === 'docker' && args[0] === '--version') {
      return { status: 0, stdout: 'Docker version 24.0.7, build afdd53b\n', stderr: '' };
    }
    if (cmd === 'docker' && args[0] === 'images') {
      return { status: 0, stdout: '', stderr: '' }; // image absent — irrelevant to these assertions
    }
    return { status: 1, stdout: '', stderr: '' };
  });
}

function mockCliAbsent(): void {
  hoisted.spawnSyncMock.mockImplementation(() => ({ status: 1, stdout: '', stderr: 'command not found' }));
}

describe('writeConfig — transactional spawn_backend (RC2-B / INIT-02)', () => {
  const roots: string[] = [];
  let writeSpy: ReturnType<typeof vi.spyOn>;

  function freshRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'init-backend-tx-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    roots.push(root);
    return root;
  }

  function readConfig(root: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(root, '.deckent', 'config.json'), 'utf-8')) as Record<string, unknown>;
  }

  function printedOutput(): string {
    return writeSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  beforeEach(() => {
    hoisted.spawnSyncMock.mockReset();
    hoisted.spawnMock.mockReset();
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    for (const r of roots.splice(0)) {
      try {
        rmSync(r, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('CLI present + daemon DOWN (the RC2-B bug scenario) -> GREEN: subprocess written, honest fallback message printed, docker never written', async () => {
    mockCliPresent();
    hoisted.spawnMock.mockImplementation(() => fakeDaemonChild('close-fail'));

    const root = freshRoot();
    await writeConfig(root, 'balanced', 'en', 'my-project');

    const config = readConfig(root);
    expect(config['spawn_backend']).toBe('subprocess');
    expect(config['spawn_backend']).not.toBe('docker');
    const out = printedOutput();
    expect(out).toContain('daemon is not running');
    expect(out).toContain('deckent config set spawn_backend docker');
  });

  it('CLI present + daemon spawn errors (docker binary vanished mid-probe) -> subprocess, honest message', async () => {
    mockCliPresent();
    hoisted.spawnMock.mockImplementation(() => fakeDaemonChild('spawn-error'));

    const root = freshRoot();
    await writeConfig(root, 'balanced', 'en', 'my-project');

    expect(readConfig(root)['spawn_backend']).toBe('subprocess');
    expect(printedOutput()).toContain('daemon is not running');
  });

  it('CLI present + daemon ALIVE -> docker selected, no fallback message', async () => {
    mockCliPresent();
    hoisted.spawnMock.mockImplementation(() => fakeDaemonChild('close-ok'));

    const root = freshRoot();
    await writeConfig(root, 'balanced', 'en', 'my-project');

    const config = readConfig(root);
    expect(config['spawn_backend']).toBe('docker');
    const out = printedOutput();
    expect(out).toContain('Docker CLI + daemon detected');
    expect(out).not.toContain('daemon is not running');
  });

  it('CLI absent -> subprocess, daemon never probed at all (no wasted `docker info` spawn)', async () => {
    mockCliAbsent();
    hoisted.spawnMock.mockImplementation(() => fakeDaemonChild('close-ok'));

    const root = freshRoot();
    await writeConfig(root, 'balanced', 'en', 'my-project');

    expect(readConfig(root)['spawn_backend']).toBe('subprocess');
    expect(hoisted.spawnMock).not.toHaveBeenCalled();
  });

  it('honest fallback message localizes to Turkish (i18n en+tr requirement)', async () => {
    mockCliPresent();
    hoisted.spawnMock.mockImplementation(() => fakeDaemonChild('close-fail'));

    const root = freshRoot();
    await writeConfig(root, 'balanced', 'tr', 'my-project');

    const out = printedOutput();
    expect(out).toContain('daemon çalışmıyor');
    expect(out).toContain('deckent config set spawn_backend docker');
  });
});

// ─── maybeOfferWorkerImageBuild: image-decline / build-failed downgrade ─────

describe('maybeOfferWorkerImageBuild — image-decline/build-failed never leave spawn_backend: docker (RC2-B / INIT-02)', () => {
  const roots: string[] = [];

  function withConfig(config: Record<string, unknown>): string {
    const root = mkdtempSync(join(tmpdir(), 'init-backend-tx-image-'));
    const deckentDir = join(root, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    writeFileSync(join(deckentDir, 'config.json'), JSON.stringify(config, null, 2));
    roots.push(root);
    return root;
  }

  function readConfig(root: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(root, '.deckent', 'config.json'), 'utf-8')) as Record<string, unknown>;
  }

  function makeSeams(opts: { confirm: boolean; buildExitCode?: number }): WorkerImageOfferSeams {
    return {
      isDockerAvailable: vi.fn(async () => true),
      isWorkerImagePresent: vi.fn(async () => false),
      confirm: vi.fn(async () => opts.confirm),
      buildImage: vi.fn(async () => opts.buildExitCode ?? 0),
    };
  }

  afterEach(() => {
    for (const r of roots.splice(0)) {
      try {
        rmSync(r, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('decline -> config downgraded docker->subprocess + remediation command printed', async () => {
    const root = withConfig({ worker_provider: 'claude', spawn_backend: 'docker' });
    const seams = makeSeams({ confirm: false });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const outcome = await maybeOfferWorkerImageBuild(root, {}, seams);

    expect(outcome).toBe('declined');
    expect(readConfig(root)['spawn_backend']).toBe('subprocess');
    const out = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('deckent config set spawn_backend docker');
    writeSpy.mockRestore();
  });

  it('build failure (non-zero exit) -> config downgraded docker->subprocess + remediation command printed', async () => {
    const root = withConfig({ worker_provider: 'claude', spawn_backend: 'docker' });
    const seams = makeSeams({ confirm: true, buildExitCode: 1 });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const outcome = await maybeOfferWorkerImageBuild(root, {}, seams);

    expect(outcome).toBe('build-failed');
    expect(readConfig(root)['spawn_backend']).toBe('subprocess');
    const out = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('deckent config set spawn_backend docker');
    writeSpy.mockRestore();
  });

  it('decline when config was already subprocess -> no-op, no fallback message (nothing to downgrade)', async () => {
    const root = withConfig({ worker_provider: 'claude', spawn_backend: 'subprocess' });
    const seams = makeSeams({ confirm: false });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    await maybeOfferWorkerImageBuild(root, {}, seams);

    expect(readConfig(root)['spawn_backend']).toBe('subprocess');
    const out = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(out).not.toContain('deckent config set spawn_backend docker');
    writeSpy.mockRestore();
  });

  it('successful build -> stays docker, no downgrade', async () => {
    const root = withConfig({ worker_provider: 'claude', spawn_backend: 'docker' });
    const seams = makeSeams({ confirm: true, buildExitCode: 0 });

    const outcome = await maybeOfferWorkerImageBuild(root, {}, seams);

    expect(outcome).toBe('built');
    expect(readConfig(root)['spawn_backend']).toBe('docker');
  });
});
