import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAuthorityChecks, isFileInScope } from '../../src/monitor/auditor.js';
import { AlertLevel } from '../../src/core/types.js';
import type { TaskScope, BoundaryViolation } from '../../src/core/types.js';

vi.mock('../../src/orchestra/authority-enforcer.js', () => ({
  checkAuthority: vi.fn(),
  emitAuthorityViolation: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  readEvents: vi.fn().mockReturnValue([]),
  CHANNELS: {
    AUTHORITY_VIOLATION: 'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
  },
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { checkAuthority, emitAuthorityViolation } from '../../src/orchestra/authority-enforcer.js';

const mockedCheckAuthority = vi.mocked(checkAuthority);
const mockedEmitAuthorityViolation = vi.mocked(emitAuthorityViolation);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GATE-W1: runAuthorityChecks boundary-violation alert level', () => {
  it('out-of-scope write → CRITICAL alert (not WARNING)', () => {
    mockedCheckAuthority.mockReturnValue({ allowed: false, reason: 'file not in scope' });

    const workerId = 'w-001';
    const filePath = 'src/other/module.ts';

    const scope: TaskScope = {
      directories: ['src/monitor/'],
      filesRead: [],
      filesWrite: ['src/monitor/auditor.ts'],
    };
    const workerScopes = new Map<string, TaskScope>([[workerId, scope]]);

    const violations: BoundaryViolation[] = [
      {
        type: 'file_outside_scope',
        agentId: workerId,
        detail: `File outside scope: ${filePath}`,
        timestamp: new Date().toISOString(),
      },
    ];

    const alerts = runAuthorityChecks('/project', 'sprint-test', workerScopes, violations);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.level).toBe(AlertLevel.CRITICAL);
    expect(alerts[0]!.source).toBe(workerId);
    expect(alerts[0]!.message).toContain('boundary-violation');
  });

  it('out-of-scope write → alert message contains worker id and file path', () => {
    mockedCheckAuthority.mockReturnValue({ allowed: false, reason: 'not in filesWrite' });

    const workerId = 'w-007';
    const filePath = 'src/core/config.ts';

    const scope: TaskScope = {
      directories: ['src/monitor/'],
      filesRead: [],
      filesWrite: ['src/monitor/auditor.ts'],
    };
    const workerScopes = new Map<string, TaskScope>([[workerId, scope]]);

    const violations: BoundaryViolation[] = [
      {
        type: 'file_outside_scope',
        agentId: workerId,
        detail: `File outside scope: ${filePath}`,
        timestamp: new Date().toISOString(),
      },
    ];

    const alerts = runAuthorityChecks('/project', 'sprint-test', workerScopes, violations);

    expect(alerts[0]!.level).toBe(AlertLevel.CRITICAL);
    expect(alerts[0]!.message).toContain(workerId);
  });

  it('out-of-scope write → emits authority violation to event stream', () => {
    mockedCheckAuthority.mockReturnValue({ allowed: false, reason: 'not in scope' });

    const workerId = 'w-002';
    const scope: TaskScope = {
      directories: ['src/monitor/'],
      filesRead: [],
      filesWrite: [],
    };
    const workerScopes = new Map<string, TaskScope>([[workerId, scope]]);

    const violations: BoundaryViolation[] = [
      {
        type: 'file_outside_scope',
        agentId: workerId,
        detail: 'File outside scope: src/other/file.ts',
        timestamp: new Date().toISOString(),
      },
    ];

    runAuthorityChecks('/project', 'sprint-test', workerScopes, violations);

    expect(mockedEmitAuthorityViolation).toHaveBeenCalledOnce();
  });

  it('in-scope file (allowed) → no alert emitted', () => {
    mockedCheckAuthority.mockReturnValue({ allowed: true, reason: 'in scope' });

    const workerId = 'w-003';
    const scope: TaskScope = {
      directories: ['src/monitor/'],
      filesRead: [],
      filesWrite: ['src/monitor/auditor.ts'],
    };
    const workerScopes = new Map<string, TaskScope>([[workerId, scope]]);

    const violations: BoundaryViolation[] = [
      {
        type: 'file_outside_scope',
        agentId: workerId,
        detail: 'File outside scope: src/monitor/auditor.ts',
        timestamp: new Date().toISOString(),
      },
    ];

    const alerts = runAuthorityChecks('/project', 'sprint-test', workerScopes, violations);

    expect(alerts).toHaveLength(0);
    expect(mockedEmitAuthorityViolation).not.toHaveBeenCalled();
  });

  it('non-file_outside_scope violation type → skipped (no alert)', () => {
    const workerId = 'w-004';
    const scope: TaskScope = {
      directories: ['src/monitor/'],
      filesRead: [],
      filesWrite: [],
    };
    const workerScopes = new Map<string, TaskScope>([[workerId, scope]]);

    const violations: BoundaryViolation[] = [
      {
        type: 'stale_heartbeat',
        agentId: workerId,
        detail: 'stale',
        timestamp: new Date().toISOString(),
      },
    ];

    const alerts = runAuthorityChecks('/project', 'sprint-test', workerScopes, violations);

    expect(alerts).toHaveLength(0);
    expect(mockedCheckAuthority).not.toHaveBeenCalled();
  });

  it('multiple out-of-scope violations → each gets a CRITICAL alert', () => {
    mockedCheckAuthority.mockReturnValue({ allowed: false, reason: 'not in scope' });

    const workerId = 'w-005';
    const scope: TaskScope = {
      directories: ['src/monitor/'],
      filesRead: [],
      filesWrite: [],
    };
    const workerScopes = new Map<string, TaskScope>([[workerId, scope]]);

    const violations: BoundaryViolation[] = [
      {
        type: 'file_outside_scope',
        agentId: workerId,
        detail: 'File outside scope: src/core/config.ts',
        timestamp: new Date().toISOString(),
      },
      {
        type: 'file_outside_scope',
        agentId: workerId,
        detail: 'File outside scope: src/orchestra/planner.ts',
        timestamp: new Date().toISOString(),
      },
    ];

    const alerts = runAuthorityChecks('/project', 'sprint-test', workerScopes, violations);

    expect(alerts).toHaveLength(2);
    expect(alerts[0]!.level).toBe(AlertLevel.CRITICAL);
    expect(alerts[1]!.level).toBe(AlertLevel.CRITICAL);
  });
});

describe('isFileInScope helper', () => {
  it('file inside directory → in scope', () => {
    const scope: TaskScope = {
      directories: ['src/monitor/'],
      filesRead: [],
      filesWrite: [],
    };
    expect(isFileInScope('src/monitor/auditor.ts', scope)).toBe(true);
  });

  it('file outside directory → not in scope', () => {
    const scope: TaskScope = {
      directories: ['src/monitor/'],
      filesRead: [],
      filesWrite: [],
    };
    expect(isFileInScope('src/core/config.ts', scope)).toBe(false);
  });

  it('file matching explicit filesWrite → in scope', () => {
    const scope: TaskScope = {
      directories: [],
      filesRead: [],
      filesWrite: ['src/core/config.ts'],
    };
    expect(isFileInScope('src/core/config.ts', scope)).toBe(true);
  });
});
