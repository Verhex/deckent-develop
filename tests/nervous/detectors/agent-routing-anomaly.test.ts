// tests/nervous/detectors/agent-routing-anomaly.test.ts
//
// AgentRoutingAnomalyDetector — 3 test case
// ADR-003: vitest over Jest
// ADR-041: Agent Taxonomy enforcement

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRoutingAnomalyDetector } from '../../../src/nervous/detectors/agent-routing-anomaly.js';
import type {
  DetectorContext,
  SprintStateSnapshot,
  ObserverEvent,
} from '../../../src/core/nervous-types.js';

// ─── FS Mock ─────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-04-22T10:00:00.000Z');
const PROJECT_ROOT = '/test-project';

function makeSpawnEvent(): ObserverEvent {
  return {
    id: 'event-spawn-001',
    source: 'sprint-lifecycle',
    type: 'SPRINT_PHASE_CHANGE',
    timestamp: BASE_NOW.toISOString(),
    payload: { oldPhase: 'PLAN', newPhase: 'SPAWN' },
    sprintId: 'sprint-151',
  };
}

function makeSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-151',
    currentPhase: 'SPAWN',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 10,
    completedTasks: 0,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    event: makeSpawnEvent(),
    sprintState: makeSprintState(),
    projectRoot: PROJECT_ROOT,
    now: BASE_NOW,
    ...overrides,
  };
}

interface TaskSpec { id: string; assignedAgent?: string }

function setupTasks(tasks: TaskSpec[]): void {
  mockExistsSync.mockReturnValue(true);
  mockReaddirSync.mockReturnValue(
    tasks.map(t => `task-${t.id}.json`) as unknown as ReturnType<typeof readdirSync>,
  );
  mockReadFileSync.mockImplementation((filePath: unknown) => {
    const fp = String(filePath);
    const task = tasks.find(t => fp.endsWith(`task-${t.id}.json`));
    if (!task) throw new Error(`Unexpected file: ${fp}`);
    return JSON.stringify(task) as unknown as ReturnType<typeof readFileSync>;
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentRoutingAnomalyDetector', () => {
  let detector: AgentRoutingAnomalyDetector;

  beforeEach(() => {
    detector = new AgentRoutingAnomalyDetector(); // default 0.80 threshold
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('positive: test-writer gets 9/10 tasks (90%) → ADR-041 warning (Sprint 147 replay)', () => {
    // Arrange — Sprint 147 pattern: test-writer 22/22 → burada 9/10
    const tasks: TaskSpec[] = [];
    for (let i = 1; i <= 9; i++) {
      tasks.push({ id: String(i).padStart(3, '0'), assignedAgent: 'test-writer' });
    }
    tasks.push({ id: '010', assignedAgent: 'architect' });

    setupTasks(tasks);

    // Act
    const result = detector.detect(makeCtx());

    // Assert
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
    expect(result!.risk).toBe('high');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0].label).toContain('ADR-041');
    expect(result!.suggestedActions[0].label).toContain('test-writer');
    expect(result!.suggestedActions[0].label).toContain('9/10');
    expect(result!.suggestedActions[0].payload).toMatchObject({
      adrReference: 'ADR-041',
      agent: 'test-writer',
    });
  });

  it('negative: balanced distribution (all ≤50%) → null', () => {
    // Arrange — 5 agents × 2 tasks each
    setupTasks([
      { id: '001', assignedAgent: 'architect' },
      { id: '002', assignedAgent: 'architect' },
      { id: '003', assignedAgent: 'test-writer' },
      { id: '004', assignedAgent: 'test-writer' },
      { id: '005', assignedAgent: 'bug-fixer' },
      { id: '006', assignedAgent: 'bug-fixer' },
      { id: '007', assignedAgent: 'doc-writer' },
      { id: '008', assignedAgent: 'doc-writer' },
      { id: '009', assignedAgent: 'refactorer' },
      { id: '010', assignedAgent: 'refactorer' },
    ]);

    // Act
    const result = detector.detect(makeCtx());

    // Assert
    expect(result).toBeNull();
  });

  it('edge: fewer than 5 tasks → null (anomaly detection skipped for small sprints)', () => {
    // Arrange — 3 tasks, 3 same agent (100% but too few tasks)
    setupTasks([
      { id: '001', assignedAgent: 'test-writer' },
      { id: '002', assignedAgent: 'test-writer' },
      { id: '003', assignedAgent: 'test-writer' },
    ]);

    // Act
    const result = detector.detect(makeCtx());

    // Assert
    expect(result).toBeNull();
  });
});
