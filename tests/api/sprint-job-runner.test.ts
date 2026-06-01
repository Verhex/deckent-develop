import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { startSprintDetached } from '../../src/api/sprint-job-runner.js';

const mockSpawn = vi.mocked(spawn);

function makeChild() {
  return {
    unref: vi.fn(),
    on: vi.fn(),
  } as unknown as ReturnType<typeof spawn>;
}

describe('startSprintDetached', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn.mockReturnValue(makeChild());
  });

  it('returns a jobId with job- prefix', () => {
    const result = startSprintDetached('/tmp/project');
    expect(result.jobId).toMatch(/^job-\d+$/);
  });

  it('calls spawn with detached:true and stdio:ignore', () => {
    startSprintDetached('/tmp/project', { autoApprove: true });
    expect(mockSpawn).toHaveBeenCalledOnce();
    const [, , spawnOpts] = mockSpawn.mock.calls[0]!;
    expect(spawnOpts).toMatchObject({ detached: true, stdio: 'ignore' });
  });

  it('calls unref() on the child process so serve event loop is not blocked', () => {
    const child = makeChild();
    mockSpawn.mockReturnValue(child);
    startSprintDetached('/tmp/project');
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it('handles spawn error gracefully — returns jobId even when spawn throws', () => {
    mockSpawn.mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });
    const result = startSprintDetached('/tmp/project');
    expect(result.jobId).toMatch(/^job-\d+$/);
  });
});
