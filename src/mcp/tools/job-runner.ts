import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JOBS_DIR, TASKS_DIR } from '../../core/constants.js';

export interface TaskSummary {
  taskId: string;
  title: string;
  evaluation: string;
  agent: string;
  skills: string[];
  notes: string;
}

export interface JobState {
  jobId: string;
  status: 'RUNNING' | 'COMPLETE' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  error?: string;
  sprintId?: string;
  /** Task-level evaluations and summaries (populated on COMPLETE) */
  tasks?: TaskSummary[];
  /** High-level sprint metrics */
  metrics?: {
    totalTasks: number;
    done: number;
    techDebt: number;
    noGo: number;
    duration: string;
  };
  /** Human-readable completion summary */
  summary?: string;
  /** Agent usage breakdown: agentId → task count */
  agentBreakdown?: Record<string, number>;
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

/**
 * Build TaskSummary array from sprint tasks + result files on disk.
 * Notes are truncated to 200 characters. Falls back gracefully when result
 * files are missing (e.g., after cleanup).
 */
export function buildTaskSummaries(
  projectRoot: string,
  tasks: ReadonlyArray<{ id: string; title: string; assignedAgent?: string; assignedSkills?: string[] }>,
): TaskSummary[] {
  return tasks.map(task => {
    const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
    let evaluation = 'DONE';
    let notes = '';
    if (existsSync(resultPath)) {
      try {
        const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as { selfAssessment?: string; notes?: string };
        if (result.selfAssessment) evaluation = result.selfAssessment;
        notes = (result.notes ?? '').substring(0, 200);
      } catch { /* skip malformed result file */ }
    }
    return {
      taskId: task.id,
      title: task.title,
      evaluation,
      agent: task.assignedAgent ?? 'generic',
      skills: task.assignedSkills ?? [],
      notes,
    };
  });
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
    const jobId = (jobFiles[0] ?? '').replace('.json', '');
    return readJobState(projectRoot, jobId);
  } catch { return null; }
}
