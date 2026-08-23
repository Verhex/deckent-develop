import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  JOBS_DIR: '.deckent/jobs',
}));

import { createJobId, writeJobState, readJobState, readLatestJobState } from '../../src/mcp/tools/job-runner.js';
import type { JobState } from '../../src/mcp/tools/job-runner.js';

describe('job-runner', () => {
  it('creates collision-resistant job identities outside the sprint namespace', () => {
    expect(createJobId(() => 1780659451558, () => '11111111-1111-4111-8111-111111111111'))
      .toBe('job-1780659451558-11111111-1111-4111-8111-111111111111');
  });

  it('does not collide when multiple jobs are admitted in the same millisecond', () => {
    const first = createJobId(
      () => 1780659451558,
      () => '11111111-1111-4111-8111-111111111111',
    );
    const second = createJobId(
      () => 1780659451558,
      () => '22222222-2222-4222-8222-222222222222',
    );

    expect(first).not.toBe(second);
    expect(first.startsWith('sprint-')).toBe(false);
    expect(second.startsWith('sprint-')).toBe(false);
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('writeJobState', () => {
    it('creates jobs directory and writes state file', () => {
      const state: JobState = {
        jobId: 'sprint-1234567890',
        status: 'RUNNING',
        startedAt: '2026-03-18T10:00:00Z',
      };

      writeJobState('/tmp/project', state);

      expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
        expect.stringContaining('.deckent/jobs'),
        { recursive: true },
      );
      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('sprint-1234567890.json'),
        expect.stringContaining('"status": "RUNNING"'),
      );
    });

    it('writes complete state with all fields', () => {
      const state: JobState = {
        jobId: 'sprint-1234567890',
        status: 'COMPLETE',
        startedAt: '2026-03-18T10:00:00Z',
        completedAt: '2026-03-18T10:05:00Z',
        sprintId: 'sprint-015',
      };

      writeJobState('/tmp/project', state);

      const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.status).toBe('COMPLETE');
      expect(parsed.sprintId).toBe('sprint-015');
      expect(parsed.completedAt).toBe('2026-03-18T10:05:00Z');
    });

    it('writes failed state with error', () => {
      const state: JobState = {
        jobId: 'sprint-999',
        status: 'FAILED',
        startedAt: '2026-03-18T10:00:00Z',
        completedAt: '2026-03-18T10:01:00Z',
        error: 'Plan failed',
      };

      writeJobState('/tmp/project', state);

      const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.status).toBe('FAILED');
      expect(parsed.error).toBe('Plan failed');
    });
  });

  describe('readJobState', () => {
    it('reads existing job file', () => {
      const state: JobState = {
        jobId: 'sprint-1234567890',
        status: 'COMPLETE',
        startedAt: '2026-03-18T10:00:00Z',
        completedAt: '2026-03-18T10:05:00Z',
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

      const result = readJobState('/tmp/project', 'sprint-1234567890');
      expect(result).toEqual(state);
    });

    it('returns null for missing job file', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = readJobState('/tmp/project', 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns null on parse error', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not valid json');

      const result = readJobState('/tmp/project', 'bad-job');
      expect(result).toBeNull();
    });
  });

  describe('readLatestJobState', () => {
    it('returns latest job across current and legacy timestamp namespaces', () => {
      const state: JobState = {
        jobId: 'job-1780659451559-11111111-1111-4111-8111-111111111111',
        status: 'RUNNING',
        startedAt: '2026-03-18T10:00:00Z',
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(
        [
          'sprint-1780659451558.json',
          'job-1780659451559-11111111-1111-4111-8111-111111111111.json',
        ] as unknown as ReturnType<typeof readdirSync>,
      );
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

      const result = readLatestJobState('/tmp/project');
      expect(result).toEqual(state);
    });

    it('returns a newer legacy job when it follows a current job', () => {
      const state: JobState = {
        jobId: 'sprint-1780659451560',
        status: 'COMPLETE',
        startedAt: '2026-03-18T10:00:00Z',
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(
        [
          'job-1780659451559-11111111-1111-4111-8111-111111111111.json',
          'sprint-1780659451560.json',
        ] as unknown as ReturnType<typeof readdirSync>,
      );
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

      expect(readLatestJobState('/tmp/project')).toEqual(state);
      expect(vi.mocked(readFileSync).mock.calls[0]?.[0]).toEqual(
        expect.stringContaining('sprint-1780659451560.json'),
      );
    });

    it('returns null when jobs dir does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = readLatestJobState('/tmp/project');
      expect(result).toBeNull();
    });

    it('returns null when jobs dir is empty', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

      const result = readLatestJobState('/tmp/project');
      expect(result).toBeNull();
    });

    it('ignores non-json files', () => {
      const state: JobState = {
        jobId: 'sprint-1000',
        status: 'COMPLETE',
        startedAt: '2026-03-18T10:00:00Z',
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(
        ['README.md', 'sprint-1000.json', '.gitkeep'] as unknown as ReturnType<typeof readdirSync>,
      );
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

      const result = readLatestJobState('/tmp/project');
      expect(result).toEqual(state);
    });
  });
});
