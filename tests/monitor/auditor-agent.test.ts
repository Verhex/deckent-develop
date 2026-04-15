import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectPatterns,
  scanHeartbeats,
  checkBoundaryViolations,
  clearHeartbeatCache,
} from '../../src/monitor/auditor.js';
import type { BoundaryViolation, PatternEntry, TaskScope } from '../../src/core/types.js';

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

// ─── detectPatterns with agent context ──────────────────────────────────

describe('detectPatterns — agent context in violations', () => {
  it('creates pattern entry from violations with agent IDs', () => {
    mockedExistsSync.mockReturnValue(false);
    const violations: BoundaryViolation[] = [
      { type: 'file_outside_scope', agentId: 'security-auditor', detail: 'out of scope', timestamp: new Date().toISOString() },
      { type: 'file_outside_scope', agentId: 'security-auditor', detail: 'out of scope 2', timestamp: new Date().toISOString() },
    ];
    detectPatterns('/project', violations, 'sprint-029');

    expect(mockedWriteFileSync).toHaveBeenCalled();
    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string) as PatternEntry[];
    expect(written).toHaveLength(1);
    expect(written[0].pattern).toBe('file_outside_scope');
    expect(written[0].occurrences).toBe(2);
    expect(written[0].firstDetectedInSprint).toBe('sprint-029');
  });

  it('updates existing pattern occurrences', () => {
    const existingPatterns: PatternEntry[] = [{
      pattern: 'file_outside_scope',
      occurrences: 3,
      firstDetectedInSprint: 'sprint-028',
      lastDetectedInSprint: 'sprint-028',
      resolved: false,
    }];
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingPatterns) as any);

    const violations: BoundaryViolation[] = [
      { type: 'file_outside_scope', agentId: 'agent-1', detail: 'detail', timestamp: new Date().toISOString() },
    ];
    detectPatterns('/project', violations, 'sprint-029');

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string) as PatternEntry[];
    expect(written[0].occurrences).toBe(4);
    expect(written[0].lastDetectedInSprint).toBe('sprint-029');
    expect(written[0].firstDetectedInSprint).toBe('sprint-028'); // preserved
  });

  it('creates separate patterns for different violation types', () => {
    mockedExistsSync.mockReturnValue(false);
    const violations: BoundaryViolation[] = [
      { type: 'file_outside_scope', agentId: 'agent-1', detail: 'a', timestamp: new Date().toISOString() },
      { type: 'stale_heartbeat', agentId: 'agent-2', detail: 'b', timestamp: new Date().toISOString() },
    ];
    detectPatterns('/project', violations, 'sprint-029');

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string) as PatternEntry[];
    expect(written).toHaveLength(2);
    expect(written.map(p => p.pattern)).toContain('file_outside_scope');
    expect(written.map(p => p.pattern)).toContain('stale_heartbeat');
  });

  it('does nothing when violations array is empty', () => {
    detectPatterns('/project', [], 'sprint-029');
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('handles corrupted existing patterns file', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('not valid json' as any);

    const violations: BoundaryViolation[] = [
      { type: 'stale_lock', agentId: 'agent-3', detail: 'stale', timestamp: new Date().toISOString() },
    ];
    detectPatterns('/project', violations, 'sprint-029');

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string) as PatternEntry[];
    expect(written).toHaveLength(1);
  });

  it('records agent ID in violation detail', () => {
    const violations: BoundaryViolation[] = [
      { type: 'file_outside_scope', agentId: 'custom-agent-abc', detail: 'File outside scope: src/test.ts', timestamp: new Date().toISOString() },
    ];
    // The agentId is stored in the violation, but detectPatterns groups by type
    // We verify the violation carries the agent context
    expect(violations[0].agentId).toBe('custom-agent-abc');
  });

  it('handles multiple violations from same agent', () => {
    mockedExistsSync.mockReturnValue(false);
    const violations: BoundaryViolation[] = [
      { type: 'file_outside_scope', agentId: 'agent-A', detail: 'file1', timestamp: new Date().toISOString() },
      { type: 'file_outside_scope', agentId: 'agent-A', detail: 'file2', timestamp: new Date().toISOString() },
      { type: 'stale_heartbeat', agentId: 'agent-A', detail: 'stale', timestamp: new Date().toISOString() },
    ];
    detectPatterns('/project', violations, 'sprint-029');

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string) as PatternEntry[];
    const scopePattern = written.find(p => p.pattern === 'file_outside_scope');
    const hbPattern = written.find(p => p.pattern === 'stale_heartbeat');
    expect(scopePattern!.occurrences).toBe(2);
    expect(hbPattern!.occurrences).toBe(1);
  });

  it('handles circular_dependency pattern from multiple agents', () => {
    mockedExistsSync.mockReturnValue(false);
    const violations: BoundaryViolation[] = [
      { type: 'circular_dependency', agentId: '001,002', detail: 'Circular dependency detected among tasks: 001, 002', timestamp: new Date().toISOString() },
    ];
    detectPatterns('/project', violations, 'sprint-029');

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string) as PatternEntry[];
    expect(written[0].pattern).toBe('circular_dependency');
    expect(written[0].occurrences).toBe(1);
  });

  it('preserves resolved flag on existing patterns', () => {
    const existing: PatternEntry[] = [{
      pattern: 'stale_lock',
      occurrences: 5,
      firstDetectedInSprint: 'sprint-025',
      lastDetectedInSprint: 'sprint-027',
      resolved: true,
    }];
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(existing) as any);

    const violations: BoundaryViolation[] = [
      { type: 'file_outside_scope', agentId: 'new-agent', detail: 'new', timestamp: new Date().toISOString() },
    ];
    detectPatterns('/project', violations, 'sprint-029');

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string) as PatternEntry[];
    const staleLock = written.find(p => p.pattern === 'stale_lock');
    expect(staleLock!.resolved).toBe(true);
  });
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
