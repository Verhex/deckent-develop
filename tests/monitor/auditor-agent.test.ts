import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanHeartbeats,
  checkBoundaryViolations,
  clearHeartbeatCache,
} from '../../src/monitor/auditor.js';
import type { BoundaryViolation, TaskScope } from '../../src/core/types.js';

// ─── Mock node:fs ────────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedStatSync = vi.mocked(statSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
  mockedStatSync.mockReturnValue({ mtimeMs: Date.now() } as never);
  clearHeartbeatCache();
});

// ─── scanHeartbeats with agent context ──────────────────────────────────

describe('scanHeartbeats — agentId in heartbeats', () => {
  it('includes agentId from heartbeat file', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-001.hb'] as any);
    const heartbeat = {
      workerId: 'w-001',
      taskId: '001',
      status: 'EXECUTING',
      currentAction: 'working',
      timestamp: new Date().toISOString(),
      filesChangedCount: 0,
      sequence: 0,
      progress: 10,
      agentId: 'security-auditor',
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(heartbeat) as any);

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(1);
    expect(result.heartbeats[0].agentId).toBe('security-auditor');
  });

  it('handles heartbeat without agentId', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['task-002.hb'] as any);
    const heartbeat = {
      workerId: 'w-002',
      taskId: '002',
      status: 'CODING',
      currentAction: 'coding',
      timestamp: new Date().toISOString(),
      filesChangedCount: 2,
      sequence: 1,
      progress: 30,
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(heartbeat) as any);

    const result = scanHeartbeats('/project');
    expect(result.heartbeats).toHaveLength(1);
    expect(result.heartbeats[0].agentId).toBeUndefined();
  });
});
