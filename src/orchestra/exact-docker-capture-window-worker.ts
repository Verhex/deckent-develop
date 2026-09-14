import { parentPort, workerData } from 'node:worker_threads';
import { runExactDockerWorkspaceCommand } from './exact-docker-workspace-command.js';
import type { ExactDockerCaptureWindowInputV1 } from './exact-docker-command-transport.js';

// Only bounded subprocess IO. No coordinator, provider, custody store or receipt
// producer. The parent performs all authority and native-manifest validation.
const input = workerData as ExactDockerCaptureWindowInputV1;
const remaining = (): number => Math.max(1, Math.min(input.helper.timeoutMs, input.deadlineUnixMs - Date.now()));
const helper = await runExactDockerWorkspaceCommand({ ...input.helper, timeoutMs: remaining() });
const succeeded = helper.status === 0 && helper.signal === null && !helper.error && !helper.overflow;
const postGeneration = succeeded && Date.now() < input.deadlineUnixMs
  ? await runExactDockerWorkspaceCommand({
    command: 'docker', args: ['volume', 'inspect', input.volumeName], stdin: new Uint8Array(),
    timeoutMs: Math.min(10_000, remaining()), stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
  }) : null;
parentPort?.postMessage({ helper, postGeneration, completedAt: new Date().toISOString() });
parentPort?.close();
