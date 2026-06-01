import { spawn } from 'node:child_process';

export interface SprintJobOpts {
  autoApprove?: boolean;
}

export interface StartSprintResult {
  jobId: string;
}

/**
 * Spawns `deckent start` as a detached child process so the serve HTTP event
 * loop is never blocked. Returns a jobId immediately.
 *
 * onExit is called asynchronously when the child exits (code 0 = success).
 * unref() ensures the parent can exit even if the sprint is still running.
 */
export function startSprintDetached(
  projectRoot: string,
  opts: SprintJobOpts = {},
  onExit?: (code: number | null) => void,
): StartSprintResult {
  const jobId = `job-${Date.now()}`;
  const args = ['start'];
  if (opts.autoApprove) args.push('--auto-approve');

  try {
    const child = spawn('deckent', args, {
      detached: true,
      stdio: 'ignore',
      cwd: projectRoot,
    });
    if (onExit) {
      child.on('exit', onExit);
    }
    child.unref();
  } catch (err) {
    // Log but don't propagate — serve loop must not crash on spawn failure
    console.error(`[sprint-job-runner] spawn failed: ${err instanceof Error ? err.message : String(err)}`);
    if (onExit) {
      process.nextTick(() => onExit(1));
    }
  }

  return { jobId };
}
