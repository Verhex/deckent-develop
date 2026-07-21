#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { terminateOwnedChild } from './ci-sim-process.mjs';

runRunner();

function runRunner() {
  const [runNonce, executable, ...commandArgs] = process.argv.slice(2);
  let nested;
  let admitted = false;
  let stopping = false;
  const debug = message => {
    if (process.env.CI_SIM_DEBUG === '1') process.stderr.write(`[ci-sim-runner] ${message}\n`);
  };

  async function stop(code = 2) {
    if (stopping) return;
    stopping = true;
    try {
      if (process.platform === 'win32') await terminateOwnedChild(nested, { graceMs: 1_000 });
      else if (nested && nested.exitCode === null && nested.signalCode === null) {
        try { process.kill(-process.pid, 'SIGTERM'); } catch { /* group already gone */ }
        await Promise.race([
          new Promise(resolveExit => nested.once('exit', resolveExit)),
          delay(1_000),
        ]);
        if (nested.exitCode === null && nested.signalCode === null) {
          try { process.kill(-process.pid, 'SIGKILL'); } catch { /* group already gone */ }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[ci-sim-runner] termination HOLD: ${message}\n`);
      process.send?.({ type: 'HOLD', error: message });
      setInterval(() => {}, 60_000);
      return;
    }
    process.exit(code);
  }

  function launch() {
    if (stopping || admitted) return;
    admitted = true;
    const args = [resolve(executable), 'run', '--no-cache', ...commandArgs];
    nested = spawn(process.execPath, args, {
      cwd: process.cwd(), env: process.env, detached: false, shell: false,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    debug(`nested-start pid=${nested.pid}`);
    nested.once('error', async error => {
      process.stderr.write(`[ci-sim-runner] ${error.message}\n`);
      await stop(2);
    });
    nested.once('exit', code => {
      debug(`nested-exit code=${code}`);
      if (stopping) return;
      const exitCode = code ?? 1;
      if (process.connected) {
        process.send?.({ type: 'DONE', code: exitCode }, () => process.exit(exitCode));
      } else process.exit(exitCode);
    });
  }

  process.on('message', message => {
    if (message?.type !== 'GO' || message.runNonce !== runNonce) {
      void stop(2);
      return;
    }
    launch();
  });
  process.on('disconnect', () => { debug('parent-disconnect'); void stop(admitted ? 2 : 3); });

  for (const signal of process.platform === 'win32'
    ? ['SIGINT', 'SIGBREAK']
    : ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => { void stop(2); });
  }
}
