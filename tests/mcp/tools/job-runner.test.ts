import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { JOBS_DIR, TASKS_DIR } from '../../../src/core/constants.js';
import {
  JobStateProjectionError,
  buildTaskSummaries,
  createJobId,
  readJobState,
  readLatestJobState,
  writeJobState,
  type JobState,
} from '../../../src/mcp/tools/job-runner.js';

const roots: string[] = [];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'deckent-job-runner-'));
  roots.push(path);
  return path;
}

function writeResult(projectRoot: string, taskId: string, value: unknown): void {
  const tasksDir = join(projectRoot, TASKS_DIR);
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, `task-${taskId}.result`), JSON.stringify(value), 'utf8');
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('buildTaskSummaries', () => {
  it('uses only host evaluationDecision as terminal summary truth', () => {
    const projectRoot = root();
    writeResult(projectRoot, '067-001', {
      selfAssessment: 'NO_GO',
      evaluationDecision: 'DONE',
      notes: 'Host accepted the exact result.',
    });

    expect(buildTaskSummaries(projectRoot, [{
      id: '067-001',
      title: 'Fix bug',
      assignedAgent: 'bug-fixer',
      assignedSkills: ['typescript-expert'],
    }])).toEqual([{
      taskId: '067-001',
      title: 'Fix bug',
      evaluation: 'DONE',
      agent: 'bug-fixer',
      skills: ['typescript-expert'],
      notes: 'Host accepted the exact result.',
    }]);
  });

  it('never turns a missing, malformed, or worker-only result into DONE', () => {
    const projectRoot = root();
    writeResult(projectRoot, '067-002', { selfAssessment: 'DONE', notes: 'worker claim' });
    const tasksDir = join(projectRoot, TASKS_DIR);
    writeFileSync(join(tasksDir, 'task-067-003.result'), 'not-json', 'utf8');

    const summaries = buildTaskSummaries(projectRoot, [
      { id: '067-002', title: 'Worker only' },
      { id: '067-003', title: 'Malformed' },
      { id: '067-004', title: 'Missing' },
    ]);

    expect(summaries.map(summary => summary.evaluation)).toEqual([
      'UNKNOWN',
      'UNKNOWN',
      'UNKNOWN',
    ]);
  });

  it('bounds observational notes without changing evaluation authority', () => {
    const projectRoot = root();
    writeResult(projectRoot, '067-005', {
      evaluationDecision: 'GO_WITH_TECH_DEBT',
      notes: 'A'.repeat(500),
    });
    const [summary] = buildTaskSummaries(projectRoot, [{ id: '067-005', title: 'Bounded' }]);
    expect(summary?.evaluation).toBe('GO_WITH_TECH_DEBT');
    expect(summary?.notes).toBe('A'.repeat(200));
    expect(summary?.agent).toBe('generic');
    expect(summary?.skills).toEqual([]);
  });
});

describe('job state projection', () => {
  it('creates collision-resistant job identities outside the sprint namespace', () => {
    const first = createJobId(
      () => 1780659451558,
      () => '11111111-1111-4111-8111-111111111111',
    );
    const second = createJobId(
      () => 1780659451558,
      () => '22222222-2222-4222-8222-222222222222',
    );
    expect(first).toBe('job-1780659451558-11111111-1111-4111-8111-111111111111');
    expect(second).not.toBe(first);
  });

  it('writes, advances, and reads one durable job projection', () => {
    const projectRoot = root();
    const running: JobState = {
      jobId: 'job-1780659451558-11111111-1111-4111-8111-111111111111',
      status: 'RUNNING',
      startedAt: '2026-03-18T10:00:00.000Z',
    };
    writeJobState(projectRoot, running);
    expect(readJobState(projectRoot, running.jobId)).toEqual(running);

    const complete: JobState = {
      ...running,
      status: 'COMPLETE',
      completedAt: '2026-03-18T10:05:00.000Z',
    };
    writeJobState(projectRoot, complete);
    expect(readJobState(projectRoot, running.jobId)).toEqual(complete);
    expect(readLatestJobState(projectRoot)).toEqual(complete);
  });

  it('refuses a terminal rewrite', () => {
    const projectRoot = root();
    const complete: JobState = {
      jobId: 'job-1780659451558-11111111-1111-4111-8111-111111111111',
      status: 'COMPLETE',
      startedAt: '2026-03-18T10:00:00.000Z',
      completedAt: '2026-03-18T10:05:00.000Z',
    };
    writeJobState(projectRoot, complete);
    expect(() => writeJobState(projectRoot, { ...complete, status: 'FAILED', error: 'late' }))
      .toThrowError(expect.objectContaining<JobStateProjectionError>({
        code: 'JOB_STATE_TERMINAL_CONFLICT',
      }));
    expect(readJobState(projectRoot, complete.jobId)).toEqual(complete);
  });

  it('fails closed while another writer owns the job projection lock', () => {
    const projectRoot = root();
    const state: JobState = {
      jobId: 'job-1780659451558-11111111-1111-4111-8111-111111111111',
      status: 'RUNNING',
      startedAt: '2026-03-18T10:00:00.000Z',
    };
    const jobsDir = join(projectRoot, JOBS_DIR);
    mkdirSync(jobsDir, { recursive: true });
    writeFileSync(join(jobsDir, `.${state.jobId}.projection.lock`), 'other-writer\n', 'utf8');

    expect(() => writeJobState(projectRoot, state)).toThrowError(
      expect.objectContaining<JobStateProjectionError>({ code: 'JOB_STATE_WRITE_CONFLICT' }),
    );
    expect(readJobState(projectRoot, state.jobId)).toBeNull();
  });
});
