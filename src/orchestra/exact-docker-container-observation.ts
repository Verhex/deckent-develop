import { isExactDockerIsolatedExecution, runIsolatedExactDockerExecution } from './exact-docker-command-transport.js';
import { Worker } from 'node:worker_threads';
import { runExactDockerWorkspaceCommand, type ExactDockerWorkspaceCommandInputV1, type ExactDockerWorkspaceCommandResultV1, type ExactDockerWorkspaceCommandRunnerV1 } from './exact-docker-workspace-command.js';

function unavailable(): ExactDockerWorkspaceCommandResultV1 {
  return Object.freeze({ status: null, signal: null, stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0), error: true, overflow: false });
}

/** A read-only daemon observation owns its subprocess deadline outside the
 * coordinator event loop. Synchronous custody verification may delay delivery,
 * but must not turn an already completed Docker response into a timeout.
 * The worker invokes the same bounded command runner; no authority is cached. */
/** Only exact, shell-free read operations may use the observation worker.
 * In particular this must never move create/rm/run or an option-shaped target
 * across the coordinator's execution authority boundary. */
export function isExactDockerReadOnlyObservation(input: ExactDockerWorkspaceCommandInputV1): boolean {
  if (input.command !== 'docker' || !(input.stdin instanceof Uint8Array)
    || input.stdin.byteLength !== 0 || !Array.isArray(input.args)) return false;
  const args = input.args;
  const fullContainer = args.length === 2 && args[0] === 'inspect'
    && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(args[1] ?? '');
  const container = args.length === 4 && args[0] === 'inspect'
    && args[1] === '--format' && args[2] === '{{.State.Running}}|{{.State.ExitCode}}'
    && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(args[3] ?? '');
  const volume = args.length === 3 && args[0] === 'volume' && args[1] === 'inspect'
    && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(args[2] ?? '');
  const image = args.length === 3 && args[0] === 'image' && args[1] === 'inspect'
    && /^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]*$/u.test(args[2] ?? '');
  return fullContainer || container || volume || image;
}

export async function runIsolatedExactDockerContainerObservation(
  input: ExactDockerWorkspaceCommandInputV1,
): Promise<ExactDockerWorkspaceCommandResultV1> {
  if (input.args[0] !== 'inspect') return unavailable();
  return runIsolatedExactDockerReadOnlyObservation(input);
}

export async function runIsolatedExactDockerReadOnlyObservation(
  input: ExactDockerWorkspaceCommandInputV1,
): Promise<ExactDockerWorkspaceCommandResultV1> {
  if (!isExactDockerReadOnlyObservation(input)) return unavailable();
  return await new Promise(resolveResult => {
    let worker: Worker;
    let result: ExactDockerWorkspaceCommandResultV1 | undefined;
    try {
      worker = new Worker(new URL('./exact-docker-container-observation-worker.js', import.meta.url), {
        workerData: input,
        // --input-type only applies to the calling eval/stdin script, not a file.
        execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')),
      });
    } catch { resolveResult(unavailable()); return; }
    worker.once('message', (message: ExactDockerWorkspaceCommandResultV1) => {
      if (!message || (message.status !== null && !Number.isSafeInteger(message.status))
        || (message.signal !== null && typeof message.signal !== 'string')
        || typeof message.error !== 'boolean' || typeof message.overflow !== 'boolean'
        || !(message.stdout instanceof Uint8Array) || !(message.stderr instanceof Uint8Array)
        || message.stdout.byteLength > input.stdoutCeiling
        || message.stderr.byteLength > input.stderrCeiling) {
        result = unavailable(); return;
      }
      result = Object.freeze(message);
    });
    worker.once('error', () => { result = unavailable(); });
    // Only resolve after the observation thread has retired. No detached poller
    // or subprocess is deliberately left behind after a successful result.
    worker.once('exit', code => resolveResult(code === 0 && result ? result : unavailable()));
  });
}

/** One production command seam covers allocation, containment and compensation.
 * Only the canonical runner is wrapped; injected platform/test runners retain
 * their authority. Mutations use a separate execution thread, never the observation thread. */
const productionObservationRunners = new WeakSet<ExactDockerWorkspaceCommandRunnerV1>();

/** Process-local provenance; custom adapters cannot opt into production capture IO. */
export function isExactDockerProductionRunner(runner: ExactDockerWorkspaceCommandRunnerV1): boolean {
  return runner === runExactDockerWorkspaceCommand || productionObservationRunners.has(runner);
}

export function resolveExactDockerObservationRunner(
  runner: ExactDockerWorkspaceCommandRunnerV1,
): ExactDockerWorkspaceCommandRunnerV1 {
  if (runner !== runExactDockerWorkspaceCommand) return runner;
  const wrapped: ExactDockerWorkspaceCommandRunnerV1 = input => isExactDockerReadOnlyObservation(input)
    ? runIsolatedExactDockerReadOnlyObservation(input)
    : isExactDockerIsolatedExecution(input) ? runIsolatedExactDockerExecution(input) : runner(input);
  productionObservationRunners.add(wrapped);
  return wrapped;
}
