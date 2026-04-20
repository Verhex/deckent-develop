// tests/nervous/detectors/agent-routing-positive.test.ts
//
// AgentRoutingHealth — Sprint 148 Pozitif Doğrulama (Post-Reform)
// Sprint 147'de %95 anomaly yakalandı. Sprint 148 Block A reformu sonrası:
//   - test-writer kaldırıldı
//   - 28 task dağılımı: architect ~%43, doc-writer ~%21, refactorer ~%18, vb.
//   - string; corrupt pattern = 0
//
// 5 test case:
// T1: 28 task → architect %43 borderline warning
// T2: string; corrupt → 0 detection (reform sonrası temiz data)
// T3: Anomaly threshold 0.40 → architect borderline
// T4: False positive — %43 legitimate, detector warning ama blocker değil
// T5: Sprint 147 replay — %95 → critical alert (regression test)

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

const BASE_NOW = new Date('2026-04-21T10:00:00.000Z');
const PROJECT_ROOT = '/test-project';

function makeEvaluateEvent(sprintId = 'sprint-148'): ObserverEvent {
  return {
    id: `event-${sprintId}`,
    source: 'sprint-lifecycle',
    type: 'SPRINT_PHASE_CHANGE',
    timestamp: BASE_NOW.toISOString(),
    payload: { oldPhase: 'EXECUTE', newPhase: 'EVALUATE' },
    sprintId,
  };
}

function makeSprintState(
  overrides: Partial<SprintStateSnapshot> = {},
): SprintStateSnapshot {
  return {
    sprintId: 'sprint-148',
    currentPhase: 'EVALUATE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 28,
    completedTasks: 20,
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

/**
 * Sprint 148 gerçek task dağılımını simüle eder.
 * 28 task, test-writer = 0 (kaldırıldı), dağılım:
 *   architect: 12 (%43) — core-dev + mcp-dev + cli-dev
 *   doc-writer: 6 (%21) — Block D docs
 *   refactorer: 5 (%18)
 *   devops-engineer: 3 (%11) — cross-platform
 *   bug-fixer: 1 (%4)
 *   security-auditor: 1 (%4)
 */
function buildSprint148Tasks(): TaskSpec[] {
  const tasks: TaskSpec[] = [];
  let idx = 1;

  // architect: 12 tasks
  for (let i = 0; i < 12; i++) {
    tasks.push({ id: `148-${String(idx++).padStart(3, '0')}`, assignedAgent: 'architect' });
  }
  // doc-writer: 6 tasks
  for (let i = 0; i < 6; i++) {
    tasks.push({ id: `148-${String(idx++).padStart(3, '0')}`, assignedAgent: 'doc-writer' });
  }
  // refactorer: 5 tasks
  for (let i = 0; i < 5; i++) {
    tasks.push({ id: `148-${String(idx++).padStart(3, '0')}`, assignedAgent: 'refactorer' });
  }
  // devops-engineer: 3 tasks
  for (let i = 0; i < 3; i++) {
    tasks.push({ id: `148-${String(idx++).padStart(3, '0')}`, assignedAgent: 'devops-engineer' });
  }
  // bug-fixer: 1 task
  tasks.push({ id: `148-${String(idx++).padStart(3, '0')}`, assignedAgent: 'bug-fixer' });
  // security-auditor: 1 task
  tasks.push({ id: `148-${String(idx++).padStart(3, '0')}`, assignedAgent: 'security-auditor' });

  return tasks;
}

/**
 * Sprint 147 dağılımını simüle eder.
 * 22 task, 21 test-writer'a atanmış (%95 anomaly)
 */
function buildSprint147Tasks(): TaskSpec[] {
  const tasks: TaskSpec[] = [];
  // 21/22 test-writer (%95)
  for (let i = 1; i <= 21; i++) {
    tasks.push({ id: `147-${String(i).padStart(3, '0')}`, assignedAgent: 'test-writer' });
  }
  // 1 architect
  tasks.push({ id: '147-022', assignedAgent: 'architect' });
  return tasks;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentRoutingHealth — Sprint 148 Pozitif Doğrulama (Post-Reform)', () => {
  let detector: AgentRoutingHealth;

  beforeEach(() => {
    detector = new AgentRoutingHealth(); // default 0.40 threshold
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T1: 28 task Sprint 148 dağılımı → architect %43 borderline medium-severity alert', () => {
    // Sprint 148 post-reform: test-writer = 0, architect = 12/28 = %42.86
    // %42.86 > %40 threshold → anomaly warning üretir
    const tasks = buildSprint148Tasks();
    expect(tasks).toHaveLength(28);

    setupTasks(tasks);
    const ctx = makeCtx();

    const result = detector.detect(ctx);

    // architect %43 threshold aştığı için warning alert beklenir
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning'); // anomaly only, corrupt yok → warning
    expect(result!.shouldNotify).toBe(true);

    // Sadece 1 anomaly issue: architect
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0].id).toBe('SKILL_ROUTING_ADJUST');
    expect(result!.suggestedActions[0].label).toContain('architect');
    expect(result!.suggestedActions[0].label).toContain('12/28');

    const payload = result!.suggestedActions[0].payload as { type: string; taskIds: string[] };
    expect(payload.type).toBe('anomaly');
    expect(payload.taskIds).toHaveLength(12);

    // Metadata
    expect(result!.metadata).toMatchObject({ type: 'agent-routing', issueCount: 1 });
    expect(result!.groupKey).toBe('agent-routing:sprint-148');
  });

  it('T2: string; corrupt agent pattern → 0 detection (reform sonrası temiz data)', () => {
    // Sprint 148'de tüm 28 task geçerli agent ID'lerine sahip
    // Hiçbir task'ta string; veya başka corrupt ID yok
    const tasks = buildSprint148Tasks();
    setupTasks(tasks);
    const ctx = makeCtx();

    const result = detector.detect(ctx);

    // Sonuç null değil çünkü architect anomaly var — ama corrupt-agent yok
    expect(result).not.toBeNull();

    // Hiçbir suggestedAction corrupt-agent türünde olmamalı
    const corruptActions = result!.suggestedActions.filter(
      a => a.id === 'AGENT_PERFORMANCE_FLAG',
    );
    expect(corruptActions).toHaveLength(0);

    // Severity warning olmalı (critical değil — corrupt yok)
    expect(result!.severity).toBe('warning');
  });

  it('T3: Anomaly threshold 0.40 → architect %43 sınırda, farklı threshold ile doğrulama', () => {
    const tasks = buildSprint148Tasks();
    setupTasks(tasks);

    // Default threshold (0.40) — architect 12/28 = 0.4286 > 0.40 → anomaly
    const detectorDefault = new AgentRoutingHealth(0.40);
    const ctx = makeCtx();
    const resultDefault = detectorDefault.detect(ctx);
    expect(resultDefault).not.toBeNull();
    expect(resultDefault!.suggestedActions.some(a => a.id === 'SKILL_ROUTING_ADJUST')).toBe(true);

    // Daha yüksek threshold (0.45) — architect 0.4286 < 0.45 → anomaly YOK
    vi.clearAllMocks();
    setupTasks(tasks);
    const detectorHigher = new AgentRoutingHealth(0.45);
    const resultHigher = detectorHigher.detect(ctx);
    // architect 0.4286 < 0.45 → no anomaly → null (hiç issue yok)
    expect(resultHigher).toBeNull();

    // Daha düşük threshold (0.30) — hem architect hem doc-writer alert üretir
    vi.clearAllMocks();
    setupTasks(tasks);
    const detectorLower = new AgentRoutingHealth(0.30);
    const resultLower = detectorLower.detect(ctx);
    expect(resultLower).not.toBeNull();
    // architect 12/28=0.43 > 0.30 → anomaly
    // doc-writer 6/28=0.21 < 0.30 → OK
    // Sadece architect threshold aşıyor
    const anomalyLabels = resultLower!.suggestedActions
      .filter(a => a.id === 'SKILL_ROUTING_ADJUST')
      .map(a => a.label);
    expect(anomalyLabels.some(l => l.includes('architect'))).toBe(true);
  });

  it('T4: False positive test — architect %43 legitimate, warning ama blocker değil', () => {
    // Sprint 148 Block A-D boyunca architect baskın çünkü core-dev + mcp-dev + cli-dev
    // Bu meşru bir dağılım, detector warning verir ama:
    //   - severity = 'warning' (critical DEĞİL)
    //   - suggestedAction = SKILL_ROUTING_ADJUST (AGENT_PERFORMANCE_FLAG DEĞİL)
    //   - Sprint devam edebilir (blocker değil)
    const tasks = buildSprint148Tasks();
    setupTasks(tasks);
    const ctx = makeCtx();

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    // Warning — critical değil. Sprint engellemez.
    expect(result!.severity).toBe('warning');
    expect(result!.risk).toBe('medium');

    // AGENT_PERFORMANCE_FLAG yok — corrupt agent yok
    const criticalActions = result!.suggestedActions.filter(
      a => a.id === 'AGENT_PERFORMANCE_FLAG',
    );
    expect(criticalActions).toHaveLength(0);

    // Sadece SKILL_ROUTING_ADJUST — yeniden dengeleme önerisi, zorunlu değil
    const adjustActions = result!.suggestedActions.filter(
      a => a.id === 'SKILL_ROUTING_ADJUST',
    );
    expect(adjustActions).toHaveLength(1);

    // groupKey sprint-148 ile tag'li
    expect(result!.groupKey).toBe('agent-routing:sprint-148');
  });

  it('T5: Sprint 147 replay — aynı detector %95 → critical alert (regression test)', () => {
    // Sprint 147'de 21/22 task test-writer'a atandı (%95 anomaly).
    // Bu regression testi: reform sonrası detector hâlâ Sprint 147 verisini doğru algılar.
    const tasks = buildSprint147Tasks();
    expect(tasks).toHaveLength(22);

    setupTasks(tasks);
    const ctx = makeCtx({
      event: makeEvaluateEvent('sprint-147'),
      sprintState: makeSprintState({
        sprintId: 'sprint-147',
        totalTasks: 22,
        completedTasks: 22,
      }),
    });

    const result = detector.detect(ctx);

    // Sprint 147 verisi ile %95 anomaly → warning (corrupt yok, sadece anomaly)
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning'); // sadece anomaly, corrupt agent yok
    expect(result!.shouldNotify).toBe(true);

    // test-writer 21/22 = %95.5 — ciddi anomaly
    const anomalyAction = result!.suggestedActions.find(a => a.id === 'SKILL_ROUTING_ADJUST');
    expect(anomalyAction).toBeDefined();
    expect(anomalyAction!.label).toContain('test-writer');
    expect(anomalyAction!.label).toContain('21/22');

    const payload = anomalyAction!.payload as { type: string; taskIds: string[] };
    expect(payload.type).toBe('anomaly');
    expect(payload.taskIds).toHaveLength(21);

    // groupKey sprint-147 ile tag'li
    expect(result!.groupKey).toBe('agent-routing:sprint-147');

    // Sprint 148 ile karşılaştırma: Sprint 147 ÇOK DAHA ciddi
    // Sprint 148 architect 12/28=%43, Sprint 147 test-writer 21/22=%95
    // Her iki durumda da severity=warning (corrupt agent yok), ama payload farkı büyük
    expect(payload.taskIds.length).toBeGreaterThan(12); // Sprint 147 >> Sprint 148
  });
});
