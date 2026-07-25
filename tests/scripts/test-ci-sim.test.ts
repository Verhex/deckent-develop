import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

import { sanitizedCiEnvironment, spawnGatedRunner, terminateOwnedChild } from '../../scripts/ci-sim-process.mjs';
import { claimCiChild } from '../../scripts/ci-sim-state.mjs';
import {
  acquireCiCapacity,
  disposeCiWorkspace,
  materializeCiWorkspace,
  reapStaleCiWorkspaces,
  releaseCiCapacity,
  runProcess,
  validateCiVitestArgs,
} from '../../scripts/ci-sim-workspace.mjs';
import { parseArgs, runCiSim } from '../../scripts/test-ci-sim.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/test-ci-sim.mjs');
const sandboxes: string[] = [];
const liveWorkspaces: Awaited<ReturnType<typeof materializeCiWorkspace>>[] = [];

async function git(root: string, args: string[]): Promise<void> {
  const result = await runProcess('git', args, { cwd: root });
  if (result.code !== 0) throw new Error(result.stderr);
}

async function createDirtyRepository(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'ci-sim-repo-'));
  sandboxes.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.deckent/settings'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  mkdirSync(join(root, 'node_modules/pkg'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), [
    'node_modules/',
    '.deckent/config.json',
    '.brain/memory.db',
    '.brain/memory.db-wal',
    '.brain/memory.db-shm',
  ].join('\n'));
  writeFileSync(join(root, 'tracked.txt'), 'committed\n');
  writeFileSync(join(root, '.deckent/settings/resource-log.jsonl'), 'committed runtime\n');
  writeFileSync(join(root, 'node_modules/pkg/index.js'), 'live dependency\n');
  await git(root, ['init']);
  await git(root, ['add', '.gitignore', 'tracked.txt', '.deckent/settings/resource-log.jsonl']);
  await git(root, [
    '-c', 'user.name=Deckent Test', '-c', 'user.email=deckent@example.invalid',
    'commit', '-m', 'fixture',
  ]);
  writeFileSync(join(root, 'tracked.txt'), 'dirty tracked\n');
  writeFileSync(join(root, '.deckent/settings/resource-log.jsonl'), 'dirty protected runtime\n');
  writeFileSync(join(root, 'untracked.txt'), 'dirty untracked\n');
  writeFileSync(join(root, '.deckent/config.json'), '{"live":true}\n');
  writeFileSync(join(root, '.brain/memory.db'), 'sqlite-main');
  writeFileSync(join(root, '.brain/memory.db-wal'), 'sqlite-wal');
  writeFileSync(join(root, '.brain/memory.db-shm'), 'sqlite-shm');
  return root;
}

function liveState(root: string): Record<string, string> {
  return Object.fromEntries([
    '.deckent/config.json',
    '.brain/memory.db',
    '.brain/memory.db-wal',
    '.brain/memory.db-shm',
  ].map(path => [path, readFileSync(join(root, path), 'utf8')]));
}

function capacityFixturePath(): string {
  const path = mkdtempSync(join(tmpdir(), 'deckent-ci-sim-capacity-test-'));
  rmSync(path, { recursive: true });
  sandboxes.push(path, `${path}.mutex`);
  return path;
}

beforeEach(() => {
  liveWorkspaces.length = 0;
});

afterEach(async () => {
  for (const workspace of liveWorkspaces.splice(0)) {
    await disposeCiWorkspace(workspace).catch(() => undefined);
  }
  for (const root of sandboxes.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('isolated CI workspace', () => {
  it('projects a stable dirty source snapshot without exposing ignored live state', async () => {
    const root = await createDirtyRepository();
    const original = liveState(root);

    const workspace = await materializeCiWorkspace(root, { includeUntracked: ['untracked.txt'] });
    liveWorkspaces.push(workspace);

    expect(readFileSync(join(workspace.workspaceDir, 'tracked.txt'), 'utf8')).toBe('dirty tracked\n');
    expect(readFileSync(join(workspace.workspaceDir, 'untracked.txt'), 'utf8')).toBe('dirty untracked\n');
    expect(existsSync(join(workspace.workspaceDir, '.deckent/config.json'))).toBe(false);
    expect(existsSync(join(workspace.workspaceDir, '.brain/memory.db'))).toBe(false);
    expect(existsSync(join(workspace.workspaceDir, '.deckent/settings/resource-log.jsonl'))).toBe(false);
    expect(existsSync(join(workspace.workspaceDir, 'node_modules'))).toBe(true);
    expect(workspace.snapshotRef).toMatch(/^ci-sim-snapshot:[a-f0-9]{64}$/u);
    expect(workspace.preview.skippedTracked).toContain('.deckent/settings/resource-log.jsonl');
    expect(liveState(root)).toEqual(original);

    expect(await disposeCiWorkspace(workspace)).toEqual([]);
    liveWorkspaces.pop();
    expect(existsSync(workspace.baseDir)).toBe(false);
    expect(liveState(root)).toEqual(original);
  });

  it('omits every implicit untracked file and rejects explicit protected state', async () => {
    const root = await createDirtyRepository();
    const workspace = await materializeCiWorkspace(root);
    liveWorkspaces.push(workspace);

    expect(existsSync(join(workspace.workspaceDir, 'untracked.txt'))).toBe(false);
    expect(workspace.preview.omittedUntracked).toEqual(['untracked.txt']);
    await expect(materializeCiWorkspace(root, { includeUntracked: ['.analysis'] }))
      .rejects.toThrow('E_CI_SIM_PROTECTED_PATH');
  });

  it('materializes and removes concurrent exact worktrees without global pruning', async () => {
    const root = await createDirtyRepository();
    const workspaces = await Promise.all([
      materializeCiWorkspace(root),
      materializeCiWorkspace(root),
    ]);
    liveWorkspaces.push(...workspaces);
    expect(workspaces[0].workspaceDir).not.toBe(workspaces[1].workspaceDir);
    expect(await Promise.all(workspaces.map(disposeCiWorkspace))).toEqual([[], []]);
    liveWorkspaces.length = 0;
  });

  it.skipIf(process.platform === 'win32')('fails closed on an explicit untracked external symlink', async () => {
    const root = await createDirtyRepository();
    const original = liveState(root);
    symlinkSync(tmpdir(), join(root, 'outside-link'));

    await expect(materializeCiWorkspace(root, { includeUntracked: ['outside-link'] }))
      .rejects.toThrow('E_CI_SIM_EXTERNAL_SYMLINK');
    expect(liveState(root)).toEqual(original);
  });

  it.skipIf(process.platform === 'win32')('fails closed on a dirty tracked external symlink', async () => {
    const root = await createDirtyRepository();
    rmSync(join(root, 'tracked.txt'));
    symlinkSync(tmpdir(), join(root, 'tracked.txt'));

    await expect(materializeCiWorkspace(root)).rejects.toThrow('E_CI_SIM_EXTERNAL_SYMLINK');
  });

  it.skipIf(process.platform === 'win32')('rejects a symlinked parent before reading tracked content', async () => {
    const root = await createDirtyRepository();
    const outside = mkdtempSync(join(tmpdir(), 'ci-sim-outside-'));
    sandboxes.push(outside);
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'nested/file.txt'), 'inside\n');
    await git(root, ['add', 'nested/file.txt']);
    await git(root, [
      '-c', 'user.name=Deckent Test', '-c', 'user.email=deckent@example.invalid',
      'commit', '-m', 'nested fixture',
    ]);
    writeFileSync(join(outside, 'file.txt'), 'outside\n');
    rmSync(join(root, 'nested'), { recursive: true });
    symlinkSync(outside, join(root, 'nested'));

    await expect(materializeCiWorkspace(root)).rejects.toThrow('E_CI_SIM_EXTERNAL_SYMLINK');
  });

  it('copies dependencies so workspace writes never reach the live dependency tree', async () => {
    const root = await createDirtyRepository();
    if (process.platform !== 'win32') {
      symlinkSync('pkg/index.js', join(root, 'node_modules/.bin-entry'));
    }
    const workspace = await materializeCiWorkspace(root);
    liveWorkspaces.push(workspace);

    writeFileSync(join(workspace.workspaceDir, 'node_modules/pkg/index.js'), 'workspace mutation\n');
    expect(readFileSync(join(root, 'node_modules/pkg/index.js'), 'utf8')).toBe('live dependency\n');
    if (process.platform !== 'win32') {
      expect(readFileSync(join(workspace.workspaceDir, 'node_modules/.bin-entry'), 'utf8'))
        .toBe('workspace mutation\n');
    }
  });

  it.skipIf(process.platform === 'win32')(
    'materializes a symlinked worktree dependency root as an independent directory',
    async () => {
      const root = await createDirtyRepository();
      const dependencyStore = mkdtempSync(join(tmpdir(), 'ci-sim-dependency-store-'));
      sandboxes.push(dependencyStore);
      mkdirSync(join(dependencyStore, 'pkg'), { recursive: true });
      writeFileSync(join(dependencyStore, 'pkg/index.js'), 'store dependency\n');
      rmSync(join(root, 'node_modules'), { recursive: true });
      symlinkSync(dependencyStore, join(root, 'node_modules'));

      const workspace = await materializeCiWorkspace(root);
      liveWorkspaces.push(workspace);

      const materializedRoot = join(workspace.workspaceDir, 'node_modules');
      expect(lstatSync(materializedRoot).isSymbolicLink()).toBe(false);
      writeFileSync(join(materializedRoot, 'pkg/index.js'), 'workspace mutation\n');
      expect(readFileSync(join(dependencyStore, 'pkg/index.js'), 'utf8'))
        .toBe('store dependency\n');
    },
  );

  it.skipIf(process.platform === 'win32')('rejects a dependency symlink outside node_modules', async () => {
    const root = await createDirtyRepository();
    const outside = mkdtempSync(join(tmpdir(), 'ci-sim-dependency-outside-'));
    sandboxes.push(outside);
    writeFileSync(join(outside, 'index.js'), 'outside dependency\n');
    symlinkSync(outside, join(root, 'node_modules/outside-package'));

    await expect(materializeCiWorkspace(root))
      .rejects.toThrow('E_CI_SIM_EXTERNAL_DEPENDENCY:outside-package');
  });

  it('skips dependency materialization during dry-run and records that fact', async () => {
    const root = await createDirtyRepository();
    const workspace = await materializeCiWorkspace(root, { dryRun: true });
    liveWorkspaces.push(workspace);

    expect(existsSync(join(workspace.workspaceDir, 'node_modules'))).toBe(false);
    expect(workspace.preview.dependencyRef).toBe('not-materialized:dry-run');
  });

  it('uses an isolated credential-free Git environment for every workspace operation', async () => {
    const root = await createDirtyRepository();
    process.env.ANTHROPIC_API_KEY = 'must-not-leak-to-git';
    const workspace = await materializeCiWorkspace(root, { dryRun: true });
    delete process.env.ANTHROPIC_API_KEY;
    liveWorkspaces.push(workspace);

    expect(workspace.gitEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(workspace.gitEnv.HOME).toBe(workspace.homeDir);
    expect(workspace.gitEnv.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(workspace.gitEnv.GIT_CONFIG_GLOBAL).toBe(join(workspace.homeDir, '.gitconfig-empty'));
  });

  it('fails closed on repo-local executable Git filters', async () => {
    const root = await createDirtyRepository();
    await git(root, ['config', '--local', 'filter.ci-sim-evil.clean', 'never-run-this-command']);

    await expect(materializeCiWorkspace(root, { dryRun: true }))
      .rejects.toThrow('E_CI_SIM_GIT_EXECUTABLE_CONFIG');
  });

  it('rejects protected path traversal before touching source state', async () => {
    const root = await createDirtyRepository();
    const original = liveState(root);
    await expect(materializeCiWorkspace(root, { protectedPaths: ['../outside'] }))
      .rejects.toThrow('E_CI_SIM_UNSAFE_PATH');
    expect(liveState(root)).toEqual(original);
  });

  it('binds the effective exclusion policy and executed tree into the receipt', async () => {
    const root = await createDirtyRepository();
    const normal = await materializeCiWorkspace(root, { dryRun: true });
    const excluded = await materializeCiWorkspace(root, {
      dryRun: true, protectedPaths: ['tracked.txt'],
    });
    liveWorkspaces.push(normal, excluded);

    expect(normal.snapshotRef).not.toBe(excluded.snapshotRef);
    expect(excluded.preview.excludedPolicy).toContain('tracked.txt');
    expect(normal.preview.materializedTreeRef).not.toBe(excluded.preview.materializedTreeRef);
  });

  it('reaps only a dead-owner disposable worktree and leaves live state untouched', async () => {
    const root = await createDirtyRepository();
    const original = liveState(root);
    const workspace = await materializeCiWorkspace(root);
    writeFileSync(workspace.manifestPath, JSON.stringify({
      schemaVersion: 2,
      runNonce: workspace.runNonce,
      rootDir: root,
      workspaceDir: workspace.workspaceDir,
      ownerPid: 2_147_483_647,
      state: 'ready',
      createdAt: new Date(0).toISOString(),
    }));

    expect(await reapStaleCiWorkspaces(root)).toEqual([workspace.baseDir]);
    expect(existsSync(workspace.baseDir)).toBe(false);
    expect(liveState(root)).toEqual(original);
  });

  it('never signals a manifest PID that may have been reused', async () => {
    const root = await createDirtyRepository();
    const workspace = await materializeCiWorkspace(root);
    liveWorkspaces.push(workspace);
    writeFileSync(workspace.manifestPath, JSON.stringify({
      schemaVersion: 2,
      runNonce: workspace.runNonce,
      rootDir: root,
      workspaceDir: workspace.workspaceDir,
      ownerPid: 2_147_483_647,
      childPid: process.pid,
      state: 'child-recorded',
    }));

    await expect(reapStaleCiWorkspaces(root))
      .rejects.toThrow('E_CI_SIM_STALE_HOLD:PROCESS_ID_UNVERIFIED');
    expect(existsSync(workspace.baseDir)).toBe(true);
  });

  it('holds a crash-window child claim even before the manifest update', async () => {
    const root = await createDirtyRepository();
    const workspace = await materializeCiWorkspace(root, { dryRun: true });
    liveWorkspaces.push(workspace);
    await claimCiChild(workspace, process.pid);
    writeFileSync(workspace.manifestPath, JSON.stringify({
      schemaVersion: 2, runNonce: workspace.runNonce, rootDir: root,
      workspaceDir: workspace.workspaceDir, ownerPid: 2_147_483_647, state: 'ready',
    }));

    await expect(reapStaleCiWorkspaces(root))
      .rejects.toThrow('E_CI_SIM_STALE_HOLD:PROCESS_ID_UNVERIFIED');
    expect(existsSync(workspace.baseDir)).toBe(true);
  });

  it('preserves malformed stale state for an honest manual HOLD', async () => {
    const root = await createDirtyRepository();
    const workspace = await materializeCiWorkspace(root);
    liveWorkspaces.push(workspace);
    writeFileSync(workspace.manifestPath, '{not-json');

    await expect(reapStaleCiWorkspaces(root))
      .rejects.toThrow('E_CI_SIM_STALE_HOLD:MALFORMED_MANIFEST');
    expect(existsSync(workspace.baseDir)).toBe(true);
  });

  it('retains the exact workspace when Git removal fails', async () => {
    const root = await createDirtyRepository();
    const workspace = await materializeCiWorkspace(root);
    liveWorkspaces.push(workspace);
    await git(root, ['worktree', 'lock', workspace.workspaceDir]);

    const errors = await disposeCiWorkspace(workspace);

    expect(errors[0]).toContain('E_CI_SIM_CLEANUP');
    expect(existsSync(workspace.baseDir)).toBe(true);
    await git(root, ['worktree', 'unlock', workspace.workspaceDir]);
  });
});

describe('runCiSim orchestration', () => {
  it('disposes the isolated workspace after a successful injected run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ci-sim-unit-'));
    sandboxes.push(root);
    const workspace = {
      rootDir: root,
      baseDir: join(root, 'base'),
      workspaceDir: join(root, 'base', 'worktree'),
      homeDir: join(root, 'base', 'home'),
      manifestPath: join(root, 'base', 'manifest.json'),
      snapshotRef: `ci-sim-snapshot:${'a'.repeat(64)}`,
    };
    let disposed = false;
    let runnerWorkspace: unknown;
    const result = await runCiSim({
      rootDir: root,
      createWorkspace: async () => workspace,
      disposeWorkspace: async () => { disposed = true; return []; },
      runner: (received: unknown) => {
        runnerWorkspace = received;
        return { outcome: Promise.resolve({ code: 0, signal: null }) };
      },
      acquireCapacity: async () => null,
      releaseCapacity: async () => undefined,
      reapWorkspaces: async () => [],
      stdio: 'pipe',
    });

    expect(result).toMatchObject({ code: 0, snapshotRef: workspace.snapshotRef, cleanupErrors: [] });
    expect(runnerWorkspace).toBe(workspace);
    expect(disposed).toBe(true);
  });

  it('turns cleanup failure into an honest gate failure', async () => {
    const result = await runCiSim({
      rootDir: '/unused',
      createWorkspace: async () => ({ workspaceDir: '/tmp/work', snapshotRef: 'snapshot:test' }),
      disposeWorkspace: async () => ['cleanup failed'],
      runner: () => ({ outcome: Promise.resolve({ code: 0, signal: null }) }),
      acquireCapacity: async () => null,
      releaseCapacity: async () => undefined,
      reapWorkspaces: async () => [],
    });
    expect(result).toMatchObject({ code: 2, cleanupErrors: ['cleanup failed'] });
  });
});

describe('process and environment boundaries', () => {
  it('makes the child claim first-writer-wins with equal replay only', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ci-claim-'));
    sandboxes.push(root);
    const workspace = { manifestPath: join(root, 'manifest.json'), runNonce: 'nonce-a' };
    await claimCiChild(workspace, 101);
    await claimCiChild(workspace, 101);
    await expect(claimCiChild(workspace, 202))
      .rejects.toThrow('E_CI_SIM_MANIFEST_CHILD_CONFLICT');
  });

  it('admits only one host-wide two-fork lease at a time', async () => {
    const capacityPath = capacityFixturePath();
    const lease = await acquireCiCapacity({ path: capacityPath });
    await expect(acquireCiCapacity({ path: capacityPath }))
      .rejects.toThrow('E_CI_SIM_CAPACITY_HOLD:ACTIVE');
    await releaseCiCapacity(lease);
  });

  it('serializes stale capacity takeover so exactly one contender wins', async () => {
    const capacityPath = capacityFixturePath();
    await acquireCiCapacity({ path: capacityPath, ownerPid: 2_147_483_647, pidAlive: () => false });

    const attempts = await Promise.allSettled([
      acquireCiCapacity({ path: capacityPath, pidAlive: pid => pid === process.pid }),
      acquireCiCapacity({ path: capacityPath, pidAlive: pid => pid === process.pid }),
    ]);
    const winners = attempts.filter(result => result.status === 'fulfilled');
    const losers = attempts.filter(result => result.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    await releaseCiCapacity(winners[0].value);
  });

  it('reclaims a dead-owner mutex but holds malformed and live mutex state', async () => {
    const deadPath = capacityFixturePath();
    mkdirSync(`${deadPath}.mutex`);
    writeFileSync(join(`${deadPath}.mutex`, 'owner.json'), JSON.stringify({
      marker: 'deckent-ci-sim-capacity-v2', kind: 'mutex', runNonce: 'dead-mutex',
      ownerPid: 2_147_483_647,
    }));
    const lease = await acquireCiCapacity({ path: deadPath, pidAlive: () => false });
    await releaseCiCapacity(lease);

    const malformedPath = capacityFixturePath();
    mkdirSync(`${malformedPath}.mutex`);
    writeFileSync(join(`${malformedPath}.mutex`, 'owner.json'), '{bad-json');
    await expect(acquireCiCapacity({ path: malformedPath, pidAlive: () => false }))
      .rejects.toThrow('E_CI_SIM_CAPACITY_HOLD:MALFORMED_MUTEX');

    const livePath = capacityFixturePath();
    mkdirSync(`${livePath}.mutex`);
    writeFileSync(join(`${livePath}.mutex`, 'owner.json'), JSON.stringify({
      marker: 'deckent-ci-sim-capacity-v2', kind: 'mutex', runNonce: 'live-mutex',
      ownerPid: process.pid,
    }));
    await expect(acquireCiCapacity({ path: livePath }))
      .rejects.toThrow('E_CI_SIM_CAPACITY_HOLD:MUTEX');
  });

  it('rejects unsafe capacity paths and fail-loud lease mismatches', async () => {
    await expect(acquireCiCapacity({ path: join(REPO_ROOT, '.unsafe-capacity') }))
      .rejects.toThrow('E_CI_SIM_CAPACITY_HOLD:UNSAFE_PATH');
    const capacityPath = capacityFixturePath();
    const lease = await acquireCiCapacity({ path: capacityPath });
    await expect(releaseCiCapacity({ ...lease, runNonce: 'wrong-nonce' }))
      .rejects.toThrow('E_CI_SIM_CAPACITY_HOLD:LEASE_CONFLICT');
    await releaseCiCapacity(lease);
  });

  it('rejects resource-cap overrides and unknown wrapper flags', () => {
    expect(() => validateCiVitestArgs(['--maxWorkers=8']))
      .toThrow('E_CI_SIM_RESOURCE_OVERRIDE');
    expect(() => validateCiVitestArgs(['--config', 'custom.ts']))
      .toThrow('E_CI_SIM_RESOURCE_OVERRIDE');
    expect(() => validateCiVitestArgs(['--']))
      .toThrow('E_CI_SIM_RESOURCE_OVERRIDE');
    expect(() => parseArgs(['node', 'test-ci-sim.mjs', '--unknown']))
      .toThrow('E_CI_SIM_UNKNOWN_FLAG');
  });

  it('drains large stdout before resolving the subprocess result', async () => {
    const size = 2_000_000;
    const root = await createDirtyRepository();
    writeFileSync(join(root, 'large.txt'), 'x'.repeat(size));
    await git(root, ['add', 'large.txt']);
    await git(root, [
      '-c', 'user.name=Deckent Test', '-c', 'user.email=deckent@example.invalid',
      'commit', '-m', 'large fixture',
    ]);
    const result = await runProcess('git', ['show', 'HEAD:large.txt'], { cwd: root });
    expect(result.stdout).toHaveLength(size);
  });

  it.skipIf(process.platform === 'win32')(
    'does not expose completion until an owned delayed grandchild can no longer resurrect HOME',
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'ci-sim-tree-finality-'));
      sandboxes.push(root);
      const homeDir = join(root, 'home');
      const nested = join(root, 'nested.mjs');
      const childCode = [
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'import { join } from "node:path";',
        'setTimeout(() => {',
        '  mkdirSync(process.env.HOME, { recursive: true });',
        '  writeFileSync(join(process.env.HOME, "late.txt"), "late\\n");',
        '}, 350);',
      ].join('\n');
      writeFileSync(nested, [
        'import { spawn } from "node:child_process";',
        `const childCode = ${JSON.stringify(childCode)};`,
        'spawn(process.execPath, ["--input-type=module", "-e", childCode], {',
        '  stdio: "ignore", env: process.env,',
        '});',
        'process.exit(7);',
      ].join('\n'));

      const execution = await spawnGatedRunner(process.execPath, [
        resolve(REPO_ROOT, 'scripts/ci-sim-runner.mjs'), 'tree-finality', nested,
      ], {
        cwd: REPO_ROOT,
        env: sanitizedCiEnvironment({ homeDir }),
        stdio: 'pipe',
        runNonce: 'tree-finality',
        recordChild: async () => undefined,
      });
      const outcome = await execution.outcome;

      expect(outcome).toMatchObject({ code: 7, signal: null });
      rmSync(homeDir, { recursive: true, force: true });
      await new Promise(resolveDelay => setTimeout(resolveDelay, 700));
      expect(existsSync(homeDir)).toBe(false);
    },
  );

  it('fails closed on a malformed gated-runner completion message', async () => {
    const child = await spawnGatedRunner(process.execPath, [
      '--input-type=module',
      '-e',
      [
        'process.on("message", () => {',
        '  process.send?.({ type: "DONE", code: "not-an-exit-code" });',
        '  setInterval(() => {}, 30000);',
        '});',
      ].join('\n'),
    ], {
      cwd: tmpdir(),
      env: process.env,
      stdio: 'pipe',
      runNonce: 'malformed-completion',
      recordChild: async () => undefined,
    });

    await expect(child.outcome)
      .rejects.toThrow('E_CI_SIM_CHILD_COMPLETION_HOLD:INVALID_OR_CONFLICTING_COMPLETION');
  });

  it('does not inherit provider credentials and isolates all temp homes', () => {
    process.env.ANTHROPIC_API_KEY = 'must-not-leak';
    const env = sanitizedCiEnvironment({ homeDir: '/tmp/ci-home' });
    delete process.env.ANTHROPIC_API_KEY;
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.HOME).toBe('/tmp/ci-home');
    expect(env.TMPDIR).toBe('/tmp/ci-home/tmp');
    expect(env.VITEST_MAX_FORKS).toBe('2');
  });

  it('terminates the Windows process tree with /T and escalates with /F', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 42, exitCode: null, signalCode: null });
    const calls: string[][] = [];
    const fakeRun = async (_command: string, args: string[]) => {
      calls.push(args);
      if (args.includes('/F')) {
        child.exitCode = 1;
        queueMicrotask(() => child.emit('close', 1, null));
      }
      return { code: 0, signal: null, stdout: '', stderr: '' };
    };
    await terminateOwnedChild(child, { platform: 'win32', graceMs: 1, runProcess: fakeRun });
    expect(calls).toEqual([['/PID', '42', '/T'], ['/PID', '42', '/T', '/F']]);
  });

  it('holds when Windows process-tree termination cannot be verified', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 42, exitCode: null, signalCode: null });
    const failedTaskkill = async () => ({
      code: 1, signal: null, stdout: '', stderr: 'access denied',
    });
    await expect(terminateOwnedChild(child, {
      platform: 'win32', graceMs: 1, runProcess: failedTaskkill,
    })).rejects.toThrow('E_CI_SIM_CHILD_TERMINATION_HOLD');
  });

  it('kills a gated wrapper when durable child recording fails', async () => {
    const result = spawnGatedRunner(process.execPath, [
      '-e', "process.stdin.resume(); setTimeout(() => {}, 30000)",
    ], {
      cwd: tmpdir(), env: process.env, stdio: 'pipe', runNonce: 'nonce',
      recordChild: async () => { throw new Error('manifest-failure'); },
    });
    await expect(result).rejects.toThrow('manifest-failure');
  });
});

describe('script artifact', () => {
  it('contains no live-state rename/delete protocol and stays a thin orchestrator', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf8');
    const workspaceSource = readFileSync(resolve(REPO_ROOT, 'scripts/ci-sim-workspace.mjs'), 'utf8');
    expect(source).not.toContain('renameSync');
    expect(source).not.toContain('restorePaths');
    expect(source).not.toContain('.brain/memory.db');
    expect(workspaceSource).not.toContain('CI_SIM_RUNNER_SLEEP_MS');
    expect(workspaceSource).not.toContain('CI_SIM_CAPACITY_DIR');
    expect(source.split('\n').length).toBeLessThanOrEqual(180);
  });
});
