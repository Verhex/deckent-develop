import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JOBS_DIR } from '../../core/constants.js';

export interface JobState {
  jobId: string;
  status: 'RUNNING' | 'COMPLETE' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  error?: string;
  sprintId?: string;
}

export function writeJobState(projectRoot: string, state: JobState): void {
  const jobsDir = join(projectRoot, JOBS_DIR);
  mkdirSync(jobsDir, { recursive: true });
  writeFileSync(
    join(jobsDir, `${state.jobId}.json`),
    JSON.stringify(state, null, 2) + '\n',
  );
}

export function readJobState(projectRoot: string, jobId: string): JobState | null {
  const jobPath = join(projectRoot, JOBS_DIR, `${jobId}.json`);
  if (!existsSync(jobPath)) return null;
  try {
    return JSON.parse(readFileSync(jobPath, 'utf-8')) as JobState;
  } catch { return null; }
}

export function readLatestJobState(projectRoot: string): JobState | null {
  const jobsDir = join(projectRoot, JOBS_DIR);
  if (!existsSync(jobsDir)) return null;
  try {
    const jobFiles = readdirSync(jobsDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    if (jobFiles.length === 0) return null;
    const jobId = jobFiles[0]!.replace('.json', '');
    return readJobState(projectRoot, jobId);
  } catch { return null; }
}
