import { parentPort, workerData } from 'node:worker_threads';
import { runExactDockerWorkspaceCommand, type ExactDockerWorkspaceCommandInputV1 } from './exact-docker-workspace-command.js';
import { isExactDockerIsolatedExecution } from './exact-docker-command-transport.js';

// No store, provider, configuration or authority mutation in this thread.
// The admitted command's bounded IO and deadline live together off the Brain loop.
const input = workerData as ExactDockerWorkspaceCommandInputV1;
if (!isExactDockerIsolatedExecution(input)) throw new TypeError('Invalid exact Docker execution transport input');
const result = await runExactDockerWorkspaceCommand(input);
parentPort?.postMessage(result);
parentPort?.close();
