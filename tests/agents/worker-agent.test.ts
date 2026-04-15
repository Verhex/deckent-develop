import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createHeartbeat,
  writeHeartbeat,
  writeResult,
} from '../../src/agents/worker.js';
import { AgentStatus, TaskStatus } from '../../src/core/types.js';
import type { TaskResult } from '../../src/core/types.js';

// ─── Mock node:fs ────────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  realpathSync: vi.fn(),
  appendFileSync: vi.fn(),
  openSync: vi.fn(() => 42),
  closeSync: vi.fn(),
  // Sprint 139 Task 13 Docker HB Core Fix: atomicWriteFileSync uses fsyncSync + renameSync
  fsyncSync: vi.fn(),
  renameSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 0 })),
  constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128 },
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
});

// ─── createHeartbeat — agentId field ────────────────────────────────────

describe('createHeartbeat — agentId', () => {
  it('includes agentId when provided', () => {
    const hb = createHeartbeat('w-001', '001', AgentStatus.EXECUTING, 'working', undefined, 0, 0, 'security-auditor');
    expect(hb.agentId).toBe('security-auditor');
  });

  it('agentId is undefined when not provided', () => {
    const hb = createHeartbeat('w-001', '001', AgentStatus.EXECUTING, 'working');
    expect(hb.agentId).toBeUndefined();
  });

  it('agentId is included in JSON serialization', () => {
    const hb = createHeartbeat('w-001', '001', AgentStatus.CODING, 'coding', undefined, 1, 2, 'my-agent');
    const json = JSON.stringify(hb);
    const parsed = JSON.parse(json);
    expect(parsed.agentId).toBe('my-agent');
  });

  it('other heartbeat fields remain correct with agentId', () => {
    const hb = createHeartbeat('w-002', '002', AgentStatus.TESTING, 'running tests', 'src/test.ts', 5, 3, 'test-agent');
    expect(hb.workerId).toBe('w-002');
    expect(hb.taskId).toBe('002');
    expect(hb.status).toBe(AgentStatus.TESTING);
    expect(hb.currentAction).toBe('running tests');
    expect(hb.currentFile).toBe('src/test.ts');
    expect(hb.sequence).toBe(5);
    expect(hb.filesChangedCount).toBe(3);
    expect(hb.agentId).toBe('test-agent');
  });

  it('progress is calculated correctly with agentId present', () => {
    const hb = createHeartbeat('w-003', '003', AgentStatus.DOCUMENTING, 'documenting', undefined, 0, 0, 'doc-agent');
    expect(hb.progress).toBe(85); // DOCUMENTING = 85
  });

  it('handles empty string agentId', () => {
    const hb = createHeartbeat('w-004', '004', AgentStatus.EXECUTING, 'start', undefined, 0, 0, '');
    expect(hb.agentId).toBe('');
  });
});

// ─── writeHeartbeat — agentId persisted ─────────────────────────────────

describe('writeHeartbeat — agentId persisted', () => {
  it('writes heartbeat with agentId to file', () => {
    mockedExistsSync.mockReturnValue(true);
    const hb = createHeartbeat('w-001', '001', AgentStatus.EXECUTING, 'working', undefined, 0, 0, 'special-agent');
    writeHeartbeat('/project', hb);

    expect(mockedWriteFileSync).toHaveBeenCalled();
    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.agentId).toBe('special-agent');
  });

  it('writes heartbeat without agentId correctly', () => {
    mockedExistsSync.mockReturnValue(true);
    const hb = createHeartbeat('w-002', '002', AgentStatus.CODING, 'coding');
    writeHeartbeat('/project', hb);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.agentId).toBeUndefined();
  });
});

// ─── writeResult — agentId in result ────────────────────────────────────

describe('writeResult — agentId in TaskResult', () => {
  it('persists agentId in result file', () => {
    mockedExistsSync.mockReturnValue(true);
    // mock readTask for updateTaskStatus
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      id: '001',
      title: 'Test',
      description: 'desc',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: TaskStatus.EXECUTING,
    }) as any);

    const result: TaskResult = {
      taskId: '001',
      workerId: 'w-001',
      filesChanged: ['src/test.ts'],
      linesAdded: 10,
      linesRemoved: 2,
      testsPassed: true,
      coverage: 90,
      selfAssessment: 'DONE',
      notes: 'All good',
      agentId: 'security-auditor',
    };
    writeResult('/project', result);

    // First writeFileSync call is the result file
    const resultWritten = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(resultWritten.agentId).toBe('security-auditor');
  });

  it('handles result without agentId', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      id: '002',
      title: 'Test',
      description: 'desc',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: TaskStatus.EXECUTING,
    }) as any);

    const result: TaskResult = {
      taskId: '002',
      workerId: 'w-002',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'Done',
    };
    writeResult('/project', result);

    const resultWritten = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(resultWritten.agentId).toBeUndefined();
  });
});
