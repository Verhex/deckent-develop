import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import * as pty from '@lydell/node-pty';

import {
  ciWorkspacePrefix,
  reapStaleCiWorkspaces,
  runProcess,
} from '../../scripts/ci-sim-workspace.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(__filename, '..', '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'test-ci-sim.mjs');
const sandboxes: string[] = [];

async function git(root: string, args: string[]): Promise<void> {
  const result = await runProcess('git', args, { cwd: root });
  if (result.code !== 0) throw new Error(result.stderr);
}

async function createRepository(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'ci-sim-signal-'));
  sandboxes.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  mkdirSync(join(root, 'node_modules/vitest'), { recursive: true });
  writeFileSync(join(root, 'node_modules/vitest/vitest.mjs'), 'setTimeout(() => {}, 30000);\n');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  for (const name of ['ci-sim-process.mjs', 'ci-sim-runner.mjs']) {
    copyFileSync(join(REPO_ROOT, 'scripts', name), join(root, 'scripts', name));
  }
  writeFileSync(join(root, '.gitignore'), [
    'node_modules/', '.deckent/config.json', '.brain/memory.db*',
  ].join('\n'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: { 'test:ci-sim': `node ${JSON.stringify(SCRIPT)}` },
  }));
  writeFileSync(join(root, 'tracked.txt'), 'committed\n');
  await git(root, ['init']);
  await git(root, ['add', '.gitignore', 'package.json', 'tracked.txt']);
  await git(root, [
    '-c', 'user.name=Deckent Test', '-c', 'user.email=deckent@example.invalid',
    'commit', '-m', 'fixture',
  ]);
  writeFileSync(join(root, 'tracked.txt'), 'dirty\n');
  writeFileSync(join(root, '.deckent/config.json'), '{"live":true}\n');
  writeFileSync(join(root, '.brain/memory.db'), 'sqlite-main');
  writeFileSync(join(root, '.brain/memory.db-wal'), 'sqlite-wal');
  writeFileSync(join(root, '.brain/memory.db-shm'), 'sqlite-shm');
  return root;
}

function state(root: string): Record<string, string> {
  return Object.fromEntries([
    '.deckent/config.json', '.brain/memory.db', '.brain/memory.db-wal', '.brain/memory.db-shm',
  ].map(path => [path, readFileSync(join(root, path), 'utf8')]));
}

function workspaceBases(root: string): string[] {
  const prefix = ciWorkspacePrefix(root);
  return readdirSync(tmpdir(), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith(prefix))
    .map(entry => join(tmpdir(), entry.name));
}

async function waitForChildManifest(
  root: string,
  diagnostics: () => string = () => '',
  timeoutMs = 8_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const base of workspaceBases(root)) {
      try {
        const manifest = JSON.parse(readFileSync(join(base, 'manifest.json'), 'utf8'));
        if (manifest.rootDir === root && Number.isInteger(manifest.childPid)) return base;
      } catch { /* worktree materialization is still in progress */ }
    }
    await sleep(50);
  }
  throw new Error(`ci-sim child manifest did not become ready: ${diagnostics()}`);
}

async function reapEventually(root: string, timeoutMs = 8_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try { return await reapStaleCiWorkspaces(root); } catch (error) { lastError = error; }
    await sleep(50);
  }
  throw lastError;
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: string | null }> {
  return new Promise(resolvePromise => {
    child.once('exit', (code, signal) => resolvePromise({ code, signal }));
  });
}

function childEnvironment(root: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CI_SIM_ROOT: root,
  };
}

afterEach(async () => {
  for (const root of sandboxes.splice(0)) {
    await reapStaleCiWorkspaces(root).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
});

describe('ci-sim process lifecycle keeps live state immutable', () => {
  it.each(process.platform === 'win32' ? ['SIGINT'] : ['SIGINT', 'SIGTERM', 'SIGHUP'])(
    '%s stops the nested runner, cleans the disposable worktree, and never moves live state',
    async (signal) => {
      const root = await createRepository();
      const original = state(root);
      const child = spawn(process.execPath, [SCRIPT], {
        cwd: root,
        env: childEnvironment(root),
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr?.on('data', chunk => { stderr += String(chunk); });
      const exit = waitForExit(child);
      await waitForChildManifest(root, () => stderr);

      child.kill(signal as NodeJS.Signals);
      const outcome = await exit;

      expect(outcome.code).toBe(2);
      expect(state(root)).toEqual(original);
      expect(workspaceBases(root)).toEqual([]);
      expect(readdirSync(join(root, '.brain')).some(name => name.includes('.cisim-stash-'))).toBe(false);
    },
    20_000,
  );

  it('SIGKILL can leak only disposable state; next run reaps it without touching live state', async () => {
    const root = await createRepository();
    const original = state(root);
    const child = spawn(process.execPath, [SCRIPT], {
      cwd: root,
      env: childEnvironment(root),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    const exit = waitForExit(child);
    const base = await waitForChildManifest(root, () => stderr);

    child.kill('SIGKILL');
    const outcome = await exit;

    expect(outcome.signal).toBe('SIGKILL');
    expect(state(root)).toEqual(original);
    expect(existsSync(base)).toBe(true);
    expect(await reapEventually(root)).toEqual([base]);
    expect(existsSync(base)).toBe(false);
    expect(state(root)).toEqual(original);
  }, 20_000);

  it.skipIf(process.platform === 'win32')(
    'literal PTY Ctrl+C follows the real npm-terminal signal shape without displacing state',
    async () => {
      const root = await createRepository();
      const original = state(root);
      const env = Object.fromEntries(
        Object.entries(childEnvironment(root)).filter((entry): entry is [string, string] => entry[1] !== undefined),
      );
      const terminal = pty.spawn('npm', ['run', 'test:ci-sim'], {
        cwd: root,
        env,
        name: 'xterm-color',
        cols: 100,
        rows: 30,
      });
      let terminalOutput = '';
      terminal.onData(chunk => { terminalOutput += chunk; });
      const exited = new Promise<{ exitCode: number; signal?: number }>(resolvePromise => {
        terminal.onExit(resolvePromise);
      });
      await waitForChildManifest(root, () => terminalOutput);

      terminal.write('\x03');
      const outcome = await exited;

      expect(outcome.exitCode !== 0 || outcome.signal !== 0).toBe(true);
      expect(state(root)).toEqual(original);
      expect(workspaceBases(root)).toEqual([]);
    },
    20_000,
  );
});
