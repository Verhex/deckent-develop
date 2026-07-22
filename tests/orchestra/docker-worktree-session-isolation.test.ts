import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DockerSpawnBackend,
  buildDockerGitIsolation,
  buildProviderPrivateHomeBootstrap,
} from '../../src/orchestra/spawn-backend-docker.js';

const sandboxes: string[] = [];

function sandbox(): string {
  const path = mkdtempSync(join(tmpdir(), 'deckent-docker-git-'));
  sandboxes.push(path);
  return path;
}

afterEach(() => {
  for (const path of sandboxes.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('buildDockerGitIsolation', () => {
  it('overlays a primary checkout Git directory read-only', () => {
    const root = sandbox();
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');

    const isolation = buildDockerGitIsolation(root);

    expect(isolation.available).toBe(true);
    expect(isolation.mountArgs).toEqual([
      '--mount', `type=bind,src=${join(root, '.git')},dst=/workspace/.git,readonly`,
      '--mount', `type=bind,src=${join(root, '.git')},dst=/run/deckent-git/common,readonly`,
    ]);
    expect(isolation.envArgs).toEqual([
      '-e', 'GIT_WORK_TREE=/workspace',
      '-e', 'GIT_COMMON_DIR=/run/deckent-git/common',
      '-e', 'GIT_DIR=/run/deckent-git/common',
    ]);
  });

  it('maps a linked worktree to container-native Git paths', () => {
    const base = sandbox();
    const commonGit = join(base, 'main', '.git');
    const worktreeGit = join(commonGit, 'worktrees', 'feature');
    const worktree = join(base, 'feature');
    mkdirSync(worktreeGit, { recursive: true });
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, '.git'), `gitdir: ${worktreeGit}\n`);
    writeFileSync(join(worktreeGit, 'commondir'), '../..\n');

    const isolation = buildDockerGitIsolation(worktree);

    expect(isolation.hostCommonDir).toBe(commonGit);
    expect(isolation.containerGitDir).toBe('/run/deckent-git/common/worktrees/feature');
    expect(isolation.mountArgs).toContain(
      `type=bind,src=${join(worktree, '.git')},dst=/workspace/.git,readonly`,
    );
    expect(isolation.mountArgs).toContain(
      `type=bind,src=${commonGit},dst=/run/deckent-git/common,readonly`,
    );
    expect(isolation.envArgs.join('\n')).not.toContain(base);
  });

  it('preserves non-Git project support without synthetic metadata', () => {
    expect(buildDockerGitIsolation(sandbox())).toEqual({
      available: false,
      mountArgs: [],
      envArgs: [],
    });
  });

  it('fails loudly for a malformed linked-worktree pointer', () => {
    const root = sandbox();
    writeFileSync(join(root, '.git'), 'not-a-gitdir-pointer\n');

    expect(() => buildDockerGitIsolation(root)).toThrow(/Malformed Git worktree pointer/);
  });
});

describe('buildProviderPrivateHomeBootstrap', () => {
  it('creates Claude session-env as a private directory, never a file', () => {
    const lines = buildProviderPrivateHomeBootstrap('/tmp/deckent-home', 'claude');

    expect(lines).toEqual([
      'mkdir -p "/tmp/deckent-home/.claude/session-env" || exit 78',
    ]);
    expect(lines.join('\n')).not.toContain('touch');
  });

  it('does not create Claude state for another provider', () => {
    expect(buildProviderPrivateHomeBootstrap('/tmp/deckent-home', 'codex')).toEqual([]);
  });
});

describe('DockerSpawnBackend effective project context', () => {
  it('keeps an override worktree root for kill/result/lock teardown paths', () => {
    const backend = new DockerSpawnBackend('/main-checkout');
    const internal = backend as unknown as {
      containers: Map<string, {
        containerId: string;
        containerName: string;
        model: string;
        projectDir: string;
        tasksDir: string;
      }>;
      resolveExecutionContext(taskId: string): { projectDir: string; tasksDir: string; containerId: string };
    };
    internal.containers.set('wt-001', {
      containerId: 'container-id',
      containerName: 'display-only',
      model: 'claude-sonnet-5',
      projectDir: '/linked-worktree',
      tasksDir: '/linked-worktree/.tasks',
    });

    expect(internal.resolveExecutionContext('wt-001')).toEqual({
      projectDir: '/linked-worktree',
      tasksDir: '/linked-worktree/.tasks',
      containerId: 'container-id',
    });
    expect(() => internal.resolveExecutionContext('unknown')).toThrow(/No exact Docker container authority/);
  });
});
