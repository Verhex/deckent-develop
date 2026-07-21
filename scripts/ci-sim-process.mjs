import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function runProcess(command, args, options = {}) {
  const { cwd, env, input, stdio = 'pipe', detached = false, onChild } = options;
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd, env, detached, shell: false,
      stdio: stdio === 'inherit'
        ? 'inherit'
        : [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    onChild?.(child);
    const stdout = [];
    const stderr = [];
    child.stdout?.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr?.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.once('error', error => {
      if (!settled) {
        settled = true;
        rejectPromise(error);
      }
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resolvePromise({
        code: code ?? 1,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

function childDone(child) {
  return !child?.pid || child.exitCode !== null || child.signalCode !== null;
}

async function waitForClose(child, timeoutMs) {
  if (childDone(child)) return true;
  return Promise.race([
    new Promise(resolvePromise => child.once('close', () => resolvePromise(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

async function taskkill(pid, force, run = runProcess) {
  const args = ['/PID', String(pid), '/T'];
  if (force) args.push('/F');
  return run('taskkill', args, { stdio: 'pipe' });
}

export async function terminateOwnedChild(child, options = {}) {
  if (childDone(child)) return;
  const graceMs = options.graceMs ?? 2_000;
  if (process.platform === 'win32' || options.platform === 'win32') {
    const soft = await taskkill(child.pid, false, options.runProcess).catch(error => ({ error }));
    if (!await waitForClose(child, graceMs)) {
      const forced = await taskkill(child.pid, true, options.runProcess).catch(error => ({ error }));
      if (!await waitForClose(child, graceMs)) {
        throw new Error(`E_CI_SIM_CHILD_TERMINATION_HOLD:${JSON.stringify({ soft, forced })}`);
      }
    }
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  if (!await waitForClose(child, graceMs)) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    if (!await waitForClose(child, graceMs)) {
      throw new Error('E_CI_SIM_CHILD_TERMINATION_HOLD');
    }
  }
}

export function sanitizedCiEnvironment(workspace, overrides = {}) {
  const inherited = {};
  for (const key of [
    'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT',
    'LANG', 'LC_ALL', 'TZ', 'TERM', 'GITHUB_ACTIONS',
  ]) {
    if (process.env[key] !== undefined) inherited[key] = process.env[key];
  }
  const tempDir = join(workspace.homeDir, 'tmp');
  return {
    ...inherited,
    CI: '1',
    DECKENT_OFFLINE: '1',
    HOME: workspace.homeDir,
    USERPROFILE: workspace.homeDir,
    XDG_CONFIG_HOME: join(workspace.homeDir, '.config'),
    XDG_CACHE_HOME: join(workspace.homeDir, '.cache'),
    APPDATA: join(workspace.homeDir, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(workspace.homeDir, 'AppData', 'Local'),
    TMPDIR: tempDir,
    TMP: tempDir,
    TEMP: tempDir,
    npm_config_cache: join(workspace.homeDir, '.npm'),
    VITEST_MAX_FORKS: '2',
    ...overrides,
  };
}

export async function spawnGatedRunner(command, args, options) {
  const stdout = [];
  const stderr = [];
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: ['ignore', options.stdio === 'inherit' ? 'inherit' : 'pipe',
      options.stdio === 'inherit' ? 'inherit' : 'pipe', 'ipc'],
  });
  options.onChild?.(child);
  child.stdout?.on('data', chunk => stdout.push(Buffer.from(chunk)));
  child.stderr?.on('data', chunk => stderr.push(Buffer.from(chunk)));
  const outcome = new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    child.once('error', error => {
      if (!settled) { settled = true; rejectPromise(error); }
    });
    child.once('exit', async (code, signal) => {
      if (settled) return;
      settled = true;
      const drained = stream => (!stream || stream.readableEnded)
        ? Promise.resolve()
        : new Promise(resolveDrain => stream.once('end', resolveDrain));
      await Promise.all([drained(child.stdout), drained(child.stderr)]);
      resolvePromise({
        code: code ?? 1, signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
  try {
    if (!child.pid) throw new Error('E_CI_SIM_CHILD_PID_MISSING');
    await options.recordChild(child.pid);
    await new Promise((resolveSend, rejectSend) => {
      child.send({ type: 'GO', runNonce: options.runNonce }, error => {
        if (error) rejectSend(error);
        else resolveSend();
      });
    });
  } catch (error) {
    if (child.connected) child.disconnect();
    await terminateOwnedChild(child, { graceMs: 500 });
    await outcome.catch(() => undefined);
    throw error;
  }
  return { child, outcome };
}
