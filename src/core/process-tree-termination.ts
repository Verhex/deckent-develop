import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';

/**
 * Grace window between a process-tree SIGTERM and its SIGKILL escalation.
 * The timer is always unref'd so shutdown bookkeeping cannot pin the host.
 */
export const SIGKILL_ESCALATION_MS = 2_000;

export interface ProcessTreeTerminationHooks {
  readonly processKill?: typeof process.kill;
  readonly spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
}

function signalDirectChild(proc: ChildProcess, signal: NodeJS.Signals): void {
  try {
    proc.kill(signal);
  } catch {
    // The child may already have been reaped.
  }
}

/**
 * Signal a complete subprocess tree.
 *
 * POSIX callers must spawn the child with `detached: true`, which makes the
 * child PID its process-group ID. Windows uses `taskkill /T`; a launch error or
 * non-zero taskkill settlement falls back to the direct child signal.
 */
export function signalProcessGroup(
  proc: ChildProcess,
  signal: NodeJS.Signals,
  platform: NodeJS.Platform,
  hooks: ProcessTreeTerminationHooks = {},
): void {
  const pid = proc.pid;

  if (platform !== 'win32' && typeof pid === 'number') {
    try {
      (hooks.processKill ?? process.kill)(-pid, signal);
      return;
    } catch {
      signalDirectChild(proc, signal);
      return;
    }
  }

  if (platform === 'win32' && typeof pid === 'number') {
    const args = ['/PID', String(pid), '/T'];
    if (signal === 'SIGKILL') args.push('/F');

    let fallbackSent = false;
    const fallback = (): void => {
      if (fallbackSent) return;
      fallbackSent = true;
      signalDirectChild(proc, signal);
    };

    try {
      const killer = (hooks.spawnProcess ?? spawn)(
        'taskkill',
        args,
        { stdio: 'ignore', windowsHide: true },
      );
      killer.once('error', fallback);
      killer.once('close', code => {
        if (code !== 0) fallback();
      });
      killer.unref();
      return;
    } catch {
      fallback();
      return;
    }
  }

  signalDirectChild(proc, signal);
}

/**
 * Send the requested signal to a subprocess tree and, for SIGTERM, enforce a
 * bounded SIGKILL escalation. The escalation is cancelled on child exit.
 */
export function killProcessGroupWithEscalation(
  proc: ChildProcess,
  signal: NodeJS.Signals,
  platform: NodeJS.Platform,
  graceMs: number = SIGKILL_ESCALATION_MS,
  hooks: ProcessTreeTerminationHooks = {},
): void {
  if (signal !== 'SIGTERM') {
    signalProcessGroup(proc, signal, platform, hooks);
    return;
  }

  let escalation: ReturnType<typeof setTimeout> | undefined;
  let exited = false;
  const onExit = (): void => {
    exited = true;
    if (escalation) clearTimeout(escalation);
  };

  proc.once('exit', onExit);
  signalProcessGroup(proc, signal, platform, hooks);
  const alreadySettled = typeof proc.exitCode === 'number'
    || (proc.signalCode !== null && proc.signalCode !== undefined);
  if (exited || alreadySettled) {
    proc.removeListener('exit', onExit);
    return;
  }

  escalation = setTimeout(() => {
    signalProcessGroup(proc, 'SIGKILL', platform, hooks);
  }, graceMs);
  escalation.unref?.();
}
