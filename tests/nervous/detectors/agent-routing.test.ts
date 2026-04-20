// tests/nervous/detectors/agent-routing.test.ts
//
// AgentRoutingHealth detector — 8 test case
// ADR-003: vitest over Jest
//
// Test #3 kritik: Sprint 146 canlı bug'ın (agent='string;') detector tarafından yakalanması

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRoutingHealth } from '../../../src/nervous/detectors/agent-routing.js';
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

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-04-20T10:00:00.000Z');
const PROJECT_ROOT = '/test-project';

function makeEvaluateEvent(): ObserverEvent {
  return {
    id: 'event-001',
    source: 'sprint-lifecycle',
    type: 'SPRINT_PHASE_CHANGE',
    timestamp: BASE_NOW.toISOString(),
    payload: { oldPhase: 'EXECUTE', newPhase: 'EVALUATE' },
    sprintId: 'sprint-147',
  };
}

function makeSprintState(
  overrides: Partial<SprintStateSnapshot> = {},
): SprintStateSnapshot {
  return {
    sprintId: 'sprint-147',
    currentPhase: 'EVALUATE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 10,
    completedTasks: 5,
    ...overrides,
  };
}

function makeCtx(
  overrides: Partial<DetectorContext> = {},
): DetectorContext {
  return {
    event: makeEvaluateEvent(),
    sprintState: makeSprintState(),
    projectRoot: PROJECT_ROOT,
    now: BASE_NOW,
    ...overrides,
  };
}

/** .tasks/ dizininde N task simüle eder */
interface TaskSpec {
  id: string;
  assignedAgent?: string;
}

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

describe('AgentRoutingHealth', () => {
  let detector: AgentRoutingHealth;

  beforeEach(() => {
    detector = new AgentRoutingHealth(); // default 0.40 threshold
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1: .tasks/ dizininde hiç task yoksa null döndürür', () => {
    // Arrange
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 2: tüm agent\'lar geçerli ve anomaly yok → null döndürür', () => {
    // Arrange — 4 task, 4 farklı agent (hepsi %25, threshold altı)
    setupTasks([
      { id: '001', assignedAgent: 'architect' },
      { id: '002', assignedAgent: 'test-writer' },
      { id: '003', assignedAgent: 'bug-fixer' },
      { id: '004', assignedAgent: 'doc-writer' },
    ]);
    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 3: agent="string;" olan 1 task → corrupt-agent + severity=critical (Sprint 146 canlı bug)', () => {
    // Arrange — Sprint 146 T-146-005 replay: TypeScript tipi agent ID'ye sızdı
    setupTasks([
      { id: '005', assignedAgent: 'string;' },
      { id: '006', assignedAgent: 'test-writer' },
      { id: '007', assignedAgent: 'architect' },
    ]);
    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert — Sprint 146 canlı bug detector tarafından yakalanmalı
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0].id).toBe('AGENT_PERFORMANCE_FLAG');
    expect(result!.suggestedActions[0].label).toContain('"string;"');
    expect(result!.suggestedActions[0].payload).toMatchObject({
      type: 'corrupt-agent',
      taskIds: ['005'],
    });
  });

  it('Test 4: agent="a" (çok kısa, min 2 karakter gerekli) → corrupt-agent tespit edilir', () => {
    // Arrange — tek karakterlik ID geçersiz (AGENT_ID_REGEX min 2 char)
    setupTasks([
      { id: '001', assignedAgent: 'a' },
      { id: '002', assignedAgent: 'test-writer' },
    ]);
    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical');
    expect(result!.suggestedActions[0].id).toBe('AGENT_PERFORMANCE_FLAG');
    expect(result!.suggestedActions[0].label).toContain('"a"');
  });

  it('Test 5: 14/17 task test-writer\'a atanmış (%82) → anomaly warning (Sprint 145 replay)', () => {
    // Arrange — Sprint 145 test-writer %53 anomaly'nin daha şiddetli versiyonu
    const tasks: TaskSpec[] = [];
    for (let i = 1; i <= 14; i++) {
      tasks.push({ id: String(i).padStart(3, '0'), assignedAgent: 'test-writer' });
    }
    tasks.push({ id: '015', assignedAgent: 'architect' });
    tasks.push({ id: '016', assignedAgent: 'bug-fixer' });
    tasks.push({ id: '017', assignedAgent: 'doc-writer' });

    setupTasks(tasks);
    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');  // sadece anomaly, corrupt yok
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0].id).toBe('SKILL_ROUTING_ADJUST');
    expect(result!.suggestedActions[0].label).toContain('test-writer');
    expect(result!.suggestedActions[0].label).toContain('14/17');
    expect(result!.suggestedActions[0].payload).toMatchObject({
      type: 'anomaly',
      taskIds: expect.arrayContaining(['001', '002']),
    });
    expect((result!.suggestedActions[0].payload as { taskIds: string[] }).taskIds).toHaveLength(14);
  });

  it('Test 6: Sprint 146 replay — 9/17 test-writer + 1 string; → 2 issue (critical)', () => {
    // Arrange — Sprint 146'nın gerçek dağılımına yakın senaryo
    const tasks: TaskSpec[] = [];
    for (let i = 1; i <= 9; i++) {
      tasks.push({ id: String(i).padStart(3, '0'), assignedAgent: 'test-writer' });
    }
    // Sprint 146 bug: bir task'ta agent ID olarak 'string;' değeri
    tasks.push({ id: '010', assignedAgent: 'string;' });
    tasks.push({ id: '011', assignedAgent: 'architect' });
    tasks.push({ id: '012', assignedAgent: 'bug-fixer' });
    tasks.push({ id: '013', assignedAgent: 'doc-writer' });
    tasks.push({ id: '014', assignedAgent: 'refactorer' });
    tasks.push({ id: '015', assignedAgent: 'code-reviewer' });
    tasks.push({ id: '016', assignedAgent: 'security-auditor' });
    tasks.push({ id: '017', assignedAgent: 'frontend-designer' });

    setupTasks(tasks);
    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert — 2 issue: 1 corrupt-agent (critical) + 1 anomaly (test-writer 9/17 = 52.9%)
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical');  // corrupt-agent nedeniyle critical
    expect(result!.suggestedActions).toHaveLength(2);
    expect(result!.metadata).toMatchObject({ type: 'agent-routing', issueCount: 2 });

    const corruptAction = result!.suggestedActions.find(a => a.id === 'AGENT_PERFORMANCE_FLAG');
    const anomalyAction = result!.suggestedActions.find(a => a.id === 'SKILL_ROUTING_ADJUST');

    expect(corruptAction).toBeDefined();
    expect(anomalyAction).toBeDefined();
    expect(corruptAction!.label).toContain('"string;"');
    expect(anomalyAction!.label).toContain('test-writer');
  });

  it('Test 7: EVALUATE fazı değil → null döndürür', () => {
    // Arrange — farklı phase change event'leri
    const nonEvaluateEvents: ObserverEvent[] = [
      {
        id: 'ev-1',
        source: 'sprint-lifecycle',
        type: 'SPRINT_PHASE_CHANGE',
        timestamp: BASE_NOW.toISOString(),
        payload: { oldPhase: 'PLAN', newPhase: 'SPAWN' },
      },
      {
        id: 'ev-2',
        source: 'cron',  // farklı source
        type: 'SPRINT_PHASE_CHANGE',
        timestamp: BASE_NOW.toISOString(),
        payload: { newPhase: 'EVALUATE' },
      },
      {
        id: 'ev-3',
        source: 'sprint-lifecycle',
        type: 'SPRINT_STARTED',  // farklı tip
        timestamp: BASE_NOW.toISOString(),
        payload: { newPhase: 'EVALUATE' },
      },
    ];

    setupTasks([
      { id: '001', assignedAgent: 'string;' },  // corrupt agent — ama phase yanlış
    ]);

    // Act + Assert — hiçbirinde detect tetiklenmemeli
    for (const event of nonEvaluateEvents) {
      const ctx = makeCtx({ event });
      const result = detector.detect(ctx);
      expect(result).toBeNull();
    }
  });

  it('Test 8: corrupt-agent + anomaly mix → severity="critical" (worst case)', () => {
    // Arrange — hem corrupt ID hem de %80+ anomaly aynı anda
    const tasks: TaskSpec[] = [];
    // 8/10 task test-writer'a atanmış (%80 — anomaly)
    for (let i = 1; i <= 8; i++) {
      tasks.push({ id: String(i).padStart(3, '0'), assignedAgent: 'test-writer' });
    }
    // 1 task corrupt agent
    tasks.push({ id: '009', assignedAgent: 'INVALID_CAPS' });  // büyük harf geçersiz
    tasks.push({ id: '010', assignedAgent: 'architect' });

    setupTasks(tasks);
    const ctx = makeCtx();

    // Act
    const result = detector.detect(ctx);

    // Assert — her iki sorun da yakalanmalı, severity worst-case (critical)
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical');
    expect(result!.risk).toBe('medium');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.suggestedActions.length).toBeGreaterThanOrEqual(2);
    expect(result!.metadata).toMatchObject({ issueCount: expect.any(Number) });
    expect((result!.metadata!['issueCount'] as number)).toBeGreaterThanOrEqual(2);

    // groupKey sprint ID içermeli
    expect(result!.groupKey).toBe('agent-routing:sprint-147');
  });
});
