// tests/nervous/integration/observer-to-detector.test.ts
//
// Integration: Observer event → Detector dispatch
// Sprint 147 Task 19

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectorContext, ObserverEvent, SprintStateSnapshot } from '../../../src/core/nervous-types.js';
import { StaleWorkerDetector } from '../../../src/nervous/detectors/stale-worker.js';
import { ScopeCollisionMonitor } from '../../../src/nervous/detectors/scope-collision.js';
import { DirectivesMidSprintProtection } from '../../../src/nervous/detectors/directives-protection.js';
import { AgentRoutingHealth } from '../../../src/nervous/detectors/agent-routing.js';

// Mock fs for detectors that read the filesystem
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => ''),
  statSync: vi.fn(() => ({ size: 5000 })),
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeObserverEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: 'evt-001',
    source: 'cron',
    type: 'TICK',
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

function makeSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-147',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 10,
    completedTasks: 5,
    ...overrides,
  };
}

function makeContext(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    event: makeObserverEvent(),
    sprintState: makeSprintState(),
    projectRoot: '/tmp/test-project',
    now: new Date('2026-04-20T12:00:00Z'),
    ...overrides,
  };
}

describe('Observer → Detector Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Observer cron event → StaleWorkerDetector', () => {
    it('should detect stale worker on cron tick with outdated heartbeat', () => {
      const detector = new StaleWorkerDetector(180000); // 3 min
      const now = new Date('2026-04-20T12:10:00Z');
      const staleHb = '2026-04-20T12:05:00Z'; // 5 min ago → stale

      const ctx = makeContext({
        event: makeObserverEvent({ source: 'cron', type: 'TICK' }),
        sprintState: makeSprintState({
          currentPhase: 'EXECUTE',
          activeWorkers: [{ id: 'w-147-001', taskId: 'T-001', lastHeartbeat: staleHb }],
        }),
        now,
      });

      const result = detector.detect(ctx);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.suggestedActions[0].id).toBe('WORKER_RESPAWN');
      expect(result!.suggestedActions[0].payload).toMatchObject({ workerId: 'w-147-001' });
    });

    it('should return null when all workers are fresh', () => {
      const detector = new StaleWorkerDetector(180000);
      const now = new Date('2026-04-20T12:10:00Z');
      const freshHb = '2026-04-20T12:09:30Z'; // 30s ago → fresh

      const ctx = makeContext({
        event: makeObserverEvent({ source: 'cron', type: 'TICK' }),
        sprintState: makeSprintState({
          activeWorkers: [{ id: 'w-147-001', taskId: 'T-001', lastHeartbeat: freshHb }],
        }),
        now,
      });

      expect(detector.detect(ctx)).toBeNull();
    });

    it('should not trigger on event-bus events (only cron/fs)', () => {
      const detector = new StaleWorkerDetector(180000);
      const ctx = makeContext({
        event: makeObserverEvent({ source: 'event-bus', type: 'WORKER_HEARTBEAT' }),
        sprintState: makeSprintState({
          activeWorkers: [{ id: 'w-001', taskId: 'T-001', lastHeartbeat: '2020-01-01T00:00:00Z' }],
        }),
      });
      expect(detector.detect(ctx)).toBeNull();
    });
  });

  describe('Observer filesystem event → DirectivesMidSprintProtection', () => {
    it('should detect template reversion on filesystem event during EXECUTE', () => {
      const detector = new DirectivesMidSprintProtection();
      vi.mocked(statSync).mockReturnValue({ size: 463 } as any);
      vi.mocked(readFileSync).mockReturnValue('# DIRECTIVES — (Sprint 147 için hazırlanıyor)');

      const ctx = makeContext({
        event: makeObserverEvent({
          source: 'filesystem',
          type: 'FILE_CHANGE',
          payload: { path: 'DIRECTIVES.md', eventType: 'change' },
        }),
        sprintState: makeSprintState({ currentPhase: 'EXECUTE' }),
      });

      const result = detector.detect(ctx);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('emergency');
      expect(result!.suggestedActions[0].id).toBe('DIRECTIVES_WRITE');
      expect(result!.suggestedActions[0].payload).toMatchObject({ autoRestore: true });
    });

    it('should not trigger in PLAN phase', () => {
      const detector = new DirectivesMidSprintProtection();
      const ctx = makeContext({
        event: makeObserverEvent({
          source: 'filesystem',
          type: 'FILE_CHANGE',
          payload: { path: 'DIRECTIVES.md' },
        }),
        sprintState: makeSprintState({ currentPhase: 'PLAN' }),
      });
      expect(detector.detect(ctx)).toBeNull();
    });

    it('should not trigger for non-DIRECTIVES filesystem events', () => {
      const detector = new DirectivesMidSprintProtection();
      const ctx = makeContext({
        event: makeObserverEvent({
          source: 'filesystem',
          type: 'FILE_CHANGE',
          payload: { path: '.tasks/task-001.json' },
        }),
        sprintState: makeSprintState({ currentPhase: 'EXECUTE' }),
      });
      expect(detector.detect(ctx)).toBeNull();
    });
  });

  describe('Observer sprint-lifecycle event → AgentRoutingHealth', () => {
    it('should detect corrupt agent ID on EVALUATE phase change', () => {
      const detector = new AgentRoutingHealth();
      // Use 5 tasks so test-writer at 1/5=20% won't trigger anomaly threshold (40%)
      const files = ['task-001.json', 'task-002.json', 'task-003.json', 'task-004.json', 'task-005.json'];
      vi.mocked(readdirSync).mockReturnValue(files as any);
      vi.mocked(readFileSync).mockImplementation((path: any) => {
        if (path.toString().includes('task-001')) {
          return JSON.stringify({ id: 'T-001', assignedAgent: 'string;' });
        }
        if (path.toString().includes('task-002')) {
          return JSON.stringify({ id: 'T-002', assignedAgent: 'test-writer' });
        }
        if (path.toString().includes('task-003')) {
          return JSON.stringify({ id: 'T-003', assignedAgent: 'architect' });
        }
        if (path.toString().includes('task-004')) {
          return JSON.stringify({ id: 'T-004', assignedAgent: 'bug-fixer' });
        }
        return JSON.stringify({ id: 'T-005', assignedAgent: 'doc-writer' });
      });

      const ctx = makeContext({
        event: makeObserverEvent({
          source: 'sprint-lifecycle',
          type: 'SPRINT_PHASE_CHANGE',
          payload: { newPhase: 'EVALUATE', oldPhase: 'EXECUTE' },
        }),
        sprintState: makeSprintState({ currentPhase: 'EVALUATE' }),
      });

      const result = detector.detect(ctx);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('critical');
      // Only corrupt agent issue (no anomaly since no agent has >= 40%)
      expect(result!.suggestedActions).toHaveLength(1);
      expect(result!.suggestedActions[0].id).toBe('AGENT_PERFORMANCE_FLAG');
    });

    it('should not trigger on non-EVALUATE phase changes', () => {
      const detector = new AgentRoutingHealth();
      const ctx = makeContext({
        event: makeObserverEvent({
          source: 'sprint-lifecycle',
          type: 'SPRINT_PHASE_CHANGE',
          payload: { newPhase: 'RETRO', oldPhase: 'EVALUATE' },
        }),
      });
      expect(detector.detect(ctx)).toBeNull();
    });
  });

  describe('Observer cron event → ScopeCollisionMonitor', () => {
    it('should detect scope collisions during PLAN phase', () => {
      const monitor = new ScopeCollisionMonitor();
      vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-002.json'] as any);
      vi.mocked(readFileSync).mockImplementation((path: any) => {
        if (path.toString().includes('task-001')) {
          return JSON.stringify({
            id: 'T-001',
            status: 'PENDING',
            scope: { filesWrite: ['src/core/config.ts'] },
          });
        }
        return JSON.stringify({
          id: 'T-002',
          status: 'PENDING',
          scope: { filesWrite: ['src/core/config.ts'] },
        });
      });

      const ctx = makeContext({
        event: makeObserverEvent({ source: 'cron', type: 'TICK' }),
        sprintState: makeSprintState({ currentPhase: 'PLAN' }),
      });

      const result = monitor.detect(ctx);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.suggestedActions[0].id).toBe('SCOPE_COLLISION_REORDER');
    });

    it('should not trigger in RETRO phase', () => {
      const monitor = new ScopeCollisionMonitor();
      const ctx = makeContext({
        sprintState: makeSprintState({ currentPhase: 'RETRO' }),
      });
      expect(monitor.detect(ctx)).toBeNull();
    });
  });
});
