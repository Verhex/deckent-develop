// ═══ Nervous System E2E — Full Sprint Simulation ═══════════════════════════
// Sprint 147 Task 20
//
// 5 scenarios simulating real sprint events through the full Nervous System
// pipeline: Detector → DecisionEngine → Proposer → Executor → History → Dispatcher
//
// Each test recreates a real-world scenario from Sprint 145/146 incidents:
//   1. Scope collision in PLAN phase
//   2. DIRECTIVES.md emergency restore in EXECUTE phase
//   3. Stale worker detection in EXECUTE phase
//   4. Agent routing `string;` corruption in EVALUATE phase
//   5. Debt trend analysis after RETRO phase

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ── Nervous System modules ──────────────────────────────────────────────────
import { ScopeCollisionMonitor } from '../../src/nervous/detectors/scope-collision.js';
import { DirectivesMidSprintProtection } from '../../src/nervous/detectors/directives-protection.js';
import { StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
import { AgentRoutingHealth } from '../../src/nervous/detectors/agent-routing.js';
import { DecisionEngine } from '../../src/nervous/decision-engine.js';
import { Proposer } from '../../src/nervous/proposer.js';
import { Executor, type ActionHandler } from '../../src/nervous/executor.js';
import { NervousHistory } from '../../src/nervous/history.js';
import { NervousDispatcher, type ChannelAdapter } from '../../src/nervous/dispatcher.js';
import type {
  DetectorContext,
  DetectorResult,
  NervousSystemConfigV1,
  ObserverEvent,
  SprintStateSnapshot,
  NervousNotification,
  ExecutionRecord,
} from '../../src/core/nervous-types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-20T10:00:00.000Z');

function makeRoot(): string {
  const root = join(
    tmpdir(),
    `deckent-e2e-nervous-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function cleanupRoot(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

function makeEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: randomUUID(),
    source: 'cron',
    type: 'TICK',
    timestamp: NOW.toISOString(),
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

function makeContext(root: string, overrides: {
  event?: Partial<ObserverEvent>;
  sprintState?: Partial<SprintStateSnapshot>;
} = {}): DetectorContext {
  return {
    event: makeEvent(overrides.event),
    sprintState: makeSprintState(overrides.sprintState),
    projectRoot: root,
    now: NOW,
  };
}

function makeBalancedConfig(overrides: Partial<NervousSystemConfigV1> = {}): NervousSystemConfigV1 {
  return {
    mode: 'balanced',
    enabled: true,
    ...overrides,
  };
}

function createMockActionHandler(): ActionHandler & { calls: Array<{ actionId: string; payload: Record<string, unknown> }> } {
  const calls: Array<{ actionId: string; payload: Record<string, unknown> }> = [];
  const handler: ActionHandler = async (actionId, payload) => {
    calls.push({ actionId, payload });
    return { outcome: 'success' };
  };
  return Object.assign(handler, { calls });
}

function createMockAdapter(): ChannelAdapter & { notifications: NervousNotification[] } {
  const notifications: NervousNotification[] = [];
  return {
    notifications,
    push: async (n: NervousNotification) => {
      notifications.push(n);
      return true;
    },
  };
}

/**
 * Write a minimal task JSON file to .tasks/ directory.
 */
function writeTask(root: string, task: {
  id: string;
  status?: string;
  assignedAgent?: string;
  scope?: { filesWrite?: string[] };
}): void {
  const filePath = join(root, '.tasks', `task-${task.id}.json`);
  writeFileSync(filePath, JSON.stringify({
    id: task.id,
    title: `Task ${task.id}`,
    status: task.status ?? 'PENDING',
    assignedAgent: task.assignedAgent ?? 'test-writer',
    scope: task.scope ?? { filesWrite: [] },
  }), 'utf-8');
}

/**
 * Run the full Nervous System pipeline for a given detector result.
 *
 * Pipeline: DetectorResult → DecisionEngine → Proposer → Executor → History + Dispatcher
 */
async function runFullPipeline(opts: {
  detectorResult: DetectorResult;
  detectorId: string;
  config: NervousSystemConfigV1;
  root: string;
  title: string;
  message: string;
  sprintId?: string;
}): Promise<{
  decisions: import('../../src/core/nervous-types.js').DecisionOutput[];
  notification: NervousNotification | null;
  records: ExecutionRecord[];
  history: NervousHistory;
  handler: ReturnType<typeof createMockActionHandler>;
  fileAdapter: ReturnType<typeof createMockAdapter>;
  cliAdapter: ReturnType<typeof createMockAdapter>;
  mcpAdapter: ReturnType<typeof createMockAdapter>;
}> {
  const engine = new DecisionEngine(opts.config);
  const proposer = new Proposer(opts.config);
  const history = new NervousHistory(opts.root);
  const handler = createMockActionHandler();
  const executor = new Executor(history, handler);

  const fileAdapter = createMockAdapter();
  const cliAdapter = createMockAdapter();
  const mcpAdapter = createMockAdapter();

  const dispatcher = new NervousDispatcher(opts.config, opts.root, {
    fileAdapter,
    cliAdapter,
    mcpAdapter,
    isMcpActive: () => false,
    isTtyAvailable: () => true,
  });

  // Step 1: Decision
  const decisions = engine.decide(opts.detectorResult);

  // Step 2: Propose
  const notification = proposer.propose(opts.detectorResult, decisions, {
    detectorId: opts.detectorId,
    sprintId: opts.sprintId ?? 'sprint-147',
    title: opts.title,
    message: opts.message,
    now: NOW,
  });

  let records: ExecutionRecord[] = [];

  if (notification) {
    // Step 3: Dispatch
    await dispatcher.dispatch(notification);

    // Step 4: Execute (only for autonomous actions — suggest/approve require user input)
    const hasAutonomous = notification.actions.some(a => a.policy === 'autonomous');
    if (hasAutonomous) {
      records = await executor.handle(notification);
    }
  }

  executor.shutdown();

  return { decisions, notification, records, history, handler, fileAdapter, cliAdapter, mcpAdapter };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Nervous System E2E — Full Sprint Simulation', () => {
  let root: string;

  beforeEach(() => {
    root = makeRoot();
  });

  afterEach(() => {
    cleanupRoot(root);
  });

  // ─── Scenario 1: Scope Collision in PLAN Phase ──────────────────────────────

  it('detects scope collision when 2 tasks write same file in PLAN phase', async () => {
    // Arrange: 2 tasks writing to the same file
    writeTask(root, {
      id: '147-001',
      status: 'PENDING',
      scope: { filesWrite: ['src/core/config.ts'] },
    });
    writeTask(root, {
      id: '147-002',
      status: 'PENDING',
      scope: { filesWrite: ['src/core/config.ts'] },
    });

    const ctx = makeContext(root, {
      event: { source: 'cron', type: 'TICK' },
      sprintState: { currentPhase: 'PLAN', totalTasks: 2, completedTasks: 0 },
    });

    // Act: Detector
    const detector = new ScopeCollisionMonitor();
    const result = detector.detect(ctx);

    // Assert: Detection
    expect(result).not.toBeNull();
    expect(result!.risk).toBe('medium');
    expect(result!.severity).toBe('warning');
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0]!.id).toBe('SCOPE_COLLISION_REORDER');

    // Run full pipeline with balanced mode
    const pipeline = await runFullPipeline({
      detectorResult: result!,
      detectorId: 'scope-collision',
      config: makeBalancedConfig(),
      root,
      title: 'Scope collision detected',
      message: '2 tasks write to src/core/config.ts',
    });

    // Assert: Decision — medium risk in balanced → suggest-30m
    expect(pipeline.decisions).toHaveLength(1);
    expect(pipeline.decisions[0]!.policy).toBe('suggest-30m');
    expect(pipeline.decisions[0]!.isSafetyFloor).toBe(false);

    // Assert: Notification produced
    expect(pipeline.notification).not.toBeNull();
    expect(pipeline.notification!.severity).toBe('warning');
    expect(pipeline.notification!.actions[0]!.policy).toBe('suggest-30m');
    expect(pipeline.notification!.timeoutMs).toBe(1_800_000); // 30 min

    // Assert: Dispatcher — file always, cli because TTY (not critical, no broadcast)
    expect(pipeline.fileAdapter.notifications).toHaveLength(1);
    expect(pipeline.cliAdapter.notifications).toHaveLength(1);
    expect(pipeline.mcpAdapter.notifications).toHaveLength(0);

    // Assert: Executor — suggest-30m actions are NOT auto-executed (need user input)
    expect(pipeline.handler.calls).toHaveLength(0);
  });

  // ─── Scenario 2: DIRECTIVES.md Emergency Restore ───────────────────────────

  it('triggers emergency alert when DIRECTIVES.md reverts to template mid-EXECUTE', async () => {
    // Arrange: Write a tiny DIRECTIVES.md (simulating Sprint 145 08:14 TRT bug)
    const directivesPath = join(root, 'DIRECTIVES.md');
    writeFileSync(directivesPath, '# DIRECTIVES — (Sprint 147 için hazırlanıyor)\n\n## Task 1: (Task başlığı)\n', 'utf-8');

    const ctx = makeContext(root, {
      event: {
        source: 'filesystem',
        type: 'FILE_CHANGE',
        payload: { path: 'DIRECTIVES.md', eventType: 'change' },
      },
      sprintState: { currentPhase: 'EXECUTE' },
    });

    // Act: Detector
    const detector = new DirectivesMidSprintProtection();
    const result = detector.detect(ctx);

    // Assert: Emergency detection
    expect(result).not.toBeNull();
    expect(result!.risk).toBe('high');
    expect(result!.severity).toBe('emergency');
    expect(result!.suggestedActions[0]!.id).toBe('DIRECTIVES_WRITE');
    expect(result!.suggestedActions[0]!.payload).toMatchObject({
      autoRestore: true,
      phase: 'EXECUTE',
    });

    // Run full pipeline
    const pipeline = await runFullPipeline({
      detectorResult: result!,
      detectorId: 'directives-protection',
      config: makeBalancedConfig(),
      root,
      title: 'EMERGENCY: DIRECTIVES.md corrupted',
      message: 'DIRECTIVES.md reverted to template mid-sprint',
    });

    // Assert: Decision — DIRECTIVES_WRITE is medium-risk action, balanced → suggest-30m
    // But severity is emergency — notification should still be produced
    expect(pipeline.decisions).toHaveLength(1);
    expect(pipeline.decisions[0]!.action.id).toBe('DIRECTIVES_WRITE');
    expect(pipeline.decisions[0]!.policy).toBe('suggest-30m');

    // Assert: Notification — emergency severity
    expect(pipeline.notification).not.toBeNull();
    expect(pipeline.notification!.severity).toBe('emergency');
    expect(pipeline.notification!.type).toBe('directives-protection');

    // Assert: Dispatcher — emergency broadcasts to ALL enabled channels
    expect(pipeline.fileAdapter.notifications).toHaveLength(1);
    expect(pipeline.cliAdapter.notifications).toHaveLength(1);
    expect(pipeline.mcpAdapter.notifications).toHaveLength(1);

    // Assert: Executor — suggest-30m, not auto-executed
    expect(pipeline.handler.calls).toHaveLength(0);
  });

  // ─── Scenario 3: Stale Worker Respawn Suggestion ───────────────────────────

  it('detects stale worker with 3+ minutes of no heartbeat', async () => {
    // Arrange: Worker w-147-009 hasn't sent heartbeat in 4 minutes
    const staleTime = new Date(NOW.getTime() - 4 * 60 * 1000).toISOString(); // 4 min ago
    const freshTime = new Date(NOW.getTime() - 30 * 1000).toISOString(); // 30s ago

    const ctx = makeContext(root, {
      event: { source: 'cron', type: 'TICK' },
      sprintState: {
        currentPhase: 'EXECUTE',
        activeWorkers: [
          { id: 'w-147-009', taskId: '147-009', lastHeartbeat: staleTime },
          { id: 'w-147-010', taskId: '147-010', lastHeartbeat: freshTime },
        ],
      },
    });

    // Act: Detector
    const detector = new StaleWorkerDetector();
    const result = detector.detect(ctx);

    // Assert: Only the stale worker detected
    expect(result).not.toBeNull();
    expect(result!.risk).toBe('medium');
    expect(result!.severity).toBe('warning');
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0]!.id).toBe('WORKER_RESPAWN');
    expect(result!.suggestedActions[0]!.payload).toMatchObject({
      workerId: 'w-147-009',
      taskId: '147-009',
    });

    // Run full pipeline
    const pipeline = await runFullPipeline({
      detectorResult: result!,
      detectorId: 'stale-worker',
      config: makeBalancedConfig(),
      root,
      title: 'Stale worker detected',
      message: 'Worker w-147-009 has not sent heartbeat for 4 minutes',
    });

    // Assert: Decision — WORKER_RESPAWN is medium-risk, balanced → suggest-30m
    expect(pipeline.decisions).toHaveLength(1);
    expect(pipeline.decisions[0]!.policy).toBe('suggest-30m');
    expect(pipeline.decisions[0]!.action.id).toBe('WORKER_RESPAWN');

    // Assert: Notification
    expect(pipeline.notification).not.toBeNull();
    expect(pipeline.notification!.severity).toBe('warning');
    expect(pipeline.notification!.timeoutMs).toBe(1_800_000);

    // Assert: Dispatcher — warning level, TTY → file + cli
    expect(pipeline.fileAdapter.notifications).toHaveLength(1);
    expect(pipeline.cliAdapter.notifications).toHaveLength(1);
    expect(pipeline.mcpAdapter.notifications).toHaveLength(0);

    // Assert: History — no records because suggest-30m waits for user
    const allRecords = await pipeline.history.readAll();
    expect(allRecords).toHaveLength(0);
  });

  // ─── Scenario 4: Agent Routing Critical Alert (`string;` corruption) ──────

  it('detects corrupt agent ID and routing anomaly in EVALUATE phase', async () => {
    // Arrange: Sprint 146 real bug — `string;` as agent ID + test-writer anomaly
    // 17 tasks: 1 corrupt, 9 test-writer (52.9%), 7 others
    writeTask(root, {
      id: '147-001',
      status: 'DONE',
      assignedAgent: 'string;', // Sprint 146 corruption
    });
    for (let i = 2; i <= 10; i++) {
      writeTask(root, {
        id: `147-${String(i).padStart(3, '0')}`,
        status: 'DONE',
        assignedAgent: 'test-writer',
      });
    }
    for (let i = 11; i <= 17; i++) {
      writeTask(root, {
        id: `147-${String(i).padStart(3, '0')}`,
        status: 'DONE',
        assignedAgent: i <= 13 ? 'architect' : 'bug-fixer',
      });
    }

    const ctx = makeContext(root, {
      event: {
        source: 'sprint-lifecycle',
        type: 'SPRINT_PHASE_CHANGE',
        payload: { newPhase: 'EVALUATE', oldPhase: 'EXECUTE' },
      },
      sprintState: {
        currentPhase: 'EVALUATE',
        totalTasks: 17,
        completedTasks: 17,
      },
    });

    // Act: Detector
    const detector = new AgentRoutingHealth();
    const result = detector.detect(ctx);

    // Assert: Both corrupt-agent and anomaly detected
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical'); // corrupt-agent escalates to critical
    expect(result!.suggestedActions.length).toBeGreaterThanOrEqual(2);

    // Verify corrupt agent issue
    const corruptAction = result!.suggestedActions.find(
      a => a.id === 'AGENT_PERFORMANCE_FLAG',
    );
    expect(corruptAction).toBeDefined();
    expect(corruptAction!.payload).toMatchObject({ type: 'corrupt-agent' });

    // Verify anomaly issue (test-writer 9/17 = 52.9% > 40%)
    const anomalyAction = result!.suggestedActions.find(
      a => a.id === 'SKILL_ROUTING_ADJUST',
    );
    expect(anomalyAction).toBeDefined();
    expect(anomalyAction!.payload).toMatchObject({ type: 'anomaly' });

    // Run full pipeline
    const pipeline = await runFullPipeline({
      detectorResult: result!,
      detectorId: 'agent-routing',
      config: makeBalancedConfig(),
      root,
      title: 'Agent routing issues detected',
      message: 'Corrupt agent ID + routing anomaly',
    });

    // Assert: Multiple decisions (one per suggested action)
    expect(pipeline.decisions.length).toBeGreaterThanOrEqual(2);

    // Both AGENT_PERFORMANCE_FLAG and SKILL_ROUTING_ADJUST are medium-risk
    // balanced → suggest-30m
    for (const d of pipeline.decisions) {
      expect(d.policy).toBe('suggest-30m');
    }

    // Assert: Notification — critical severity
    expect(pipeline.notification).not.toBeNull();
    expect(pipeline.notification!.severity).toBe('critical');
    expect(pipeline.notification!.type).toBe('agent-routing');

    // Assert: Dispatcher — critical severity broadcasts to ALL
    expect(pipeline.fileAdapter.notifications).toHaveLength(1);
    expect(pipeline.cliAdapter.notifications).toHaveLength(1);
    expect(pipeline.mcpAdapter.notifications).toHaveLength(1);
  });

  // ─── Scenario 5: Debt Trend Suggestion After RETRO ─────────────────────────

  it('detects debt trend when 3-sprint average exceeds 15% threshold', async () => {
    // Arrange: Mock MemoryStore since it requires SQLite DB
    // We create the detector result directly (DebtTrendAnalyzer needs a real DB)
    // and test the pipeline from that point.
    //
    // This simulates what DebtTrendAnalyzer.detect() would return when
    // 3 recent sprints have avg debt rate 17%:
    //   sprint-144: 4/20 tasks = 20%
    //   sprint-145: 3/17 tasks = 17.6%
    //   sprint-146: 2/16 tasks = 12.5%
    //   Average: ~16.7% > 15% threshold
    const simulatedDetectorResult: DetectorResult = {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      groupKey: 'debt-trend:sprint-147',
      suggestedActions: [{
        id: 'DEBT_REPRIORITIZE',
        label: 'Debt trending up (16.7%), re-prioritize next sprint',
        risk: 'medium' as const,
        payload: {
          avgDebtRate: 0.167,
          windowSize: 3,
          sprints: ['sprint-144', 'sprint-145', 'sprint-146'],
        },
      }],
      metadata: {
        type: 'debt-trend',
        avgDebtRate: 0.167,
        threshold: 0.15,
      },
    };

    // Run full pipeline
    const pipeline = await runFullPipeline({
      detectorResult: simulatedDetectorResult,
      detectorId: 'debt-trend',
      config: makeBalancedConfig(),
      root,
      title: 'Debt trending up',
      message: '3-sprint average debt rate: 16.7% (threshold: 15%)',
      sprintId: 'sprint-147',
    });

    // Assert: Decision — DEBT_REPRIORITIZE is medium-risk, balanced → suggest-30m
    expect(pipeline.decisions).toHaveLength(1);
    expect(pipeline.decisions[0]!.policy).toBe('suggest-30m');
    expect(pipeline.decisions[0]!.action.id).toBe('DEBT_REPRIORITIZE');
    expect(pipeline.decisions[0]!.isSafetyFloor).toBe(false);

    // Assert: Notification
    expect(pipeline.notification).not.toBeNull();
    expect(pipeline.notification!.severity).toBe('warning');
    expect(pipeline.notification!.detectorId).toBe('debt-trend');
    expect(pipeline.notification!.sprintId).toBe('sprint-147');
    expect(pipeline.notification!.actions[0]!.payload).toMatchObject({
      avgDebtRate: 0.167,
      windowSize: 3,
    });

    // Assert: Dispatcher — warning + TTY → file + cli
    expect(pipeline.fileAdapter.notifications).toHaveLength(1);
    expect(pipeline.cliAdapter.notifications).toHaveLength(1);
    expect(pipeline.mcpAdapter.notifications).toHaveLength(0);

    // Assert: History — suggest-30m means no auto-execution
    const allRecords = await pipeline.history.readAll();
    expect(allRecords).toHaveLength(0);
  });
});
