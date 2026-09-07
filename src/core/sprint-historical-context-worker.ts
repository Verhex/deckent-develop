import { parentPort, workerData } from 'node:worker_threads';
import { readVerifiedSprintArchiveDocument } from './sprint-archive.js';

interface WorkerInput {
  readonly projectRoot: string;
  readonly sprintId: string;
  readonly maxBytes: number;
  readonly verificationResourceBytes: number;
  readonly artifactPath: 'docs/brain-sprint.md';
}

const input = workerData as WorkerInput;
const result = readVerifiedSprintArchiveDocument(input);
parentPort?.postMessage(result);
