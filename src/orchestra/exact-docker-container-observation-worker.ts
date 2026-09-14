import { parentPort, workerData } from 'node:worker_threads';
import { runExactDockerWorkspaceCommand, type ExactDockerWorkspaceCommandInputV1 } from './exact-docker-workspace-command.js';

// This entrypoint never imports the coordinator or custody store. Its event
// loop exclusively drains this bounded command's pipes and deadline.
const result = await runExactDockerWorkspaceCommand(workerData as ExactDockerWorkspaceCommandInputV1);
parentPort?.postMessage(result);
parentPort?.close();
