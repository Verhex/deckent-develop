import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectorContext, DetectorResult, ObserverEvent, SprintStateSnapshot } from '../../../src/core/nervous-types.js';

// Mock node:fs before importing the detector
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { existsSync, readFileSync, statSync } from 'node:fs';
import { DirectivesMidSprintProtection } from '../../../src/nervous/detectors/directives-protection.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedStatSync = vi.mocked(statSync);

// ─── Test Helpers ────────────────────────────────────────────────────────────

function buildSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-148',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 28,
    completedTasks: 14,
    ...overrides,
  };
}

function buildEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: 'evt-stress-001',
    source: 'filesystem',
    type: 'FILE_CHANGE',
    timestamp: '2026-04-20T14:20:00.000Z',
    payload: { path: 'DIRECTIVES.md', eventType: 'change' },
    ...overrides,
  };
}

function buildCtx(overrides: {
  event?: Partial<ObserverEvent>;
  sprintState?: Partial<SprintStateSnapshot>;
  projectRoot?: string;
} = {}): DetectorContext {
  return {
    event: buildEvent(overrides.event),
    sprintState: buildSprintState(overrides.sprintState),
    projectRoot: overrides.projectRoot ?? '/project',
    now: new Date('2026-04-20T14:20:30.000Z'),
  };
}

// Full DIRECTIVES content (well above 2KB threshold)
const FULL_DIRECTIVES_CONTENT = `# DIRECTIVES — Sprint 148: Agent Taxonomy Reform\n\n## Goal\nNervous system activation with 28 tasks.\n\n---\n\n## Task 1: test-writer Archive\n- Model: opus\n- Effort: low\n\n${'x'.repeat(2500)}\n## Task 28: ADR-041 Draft\n- Model: sonnet\n- Effort: low\n`;

// Template content matching Sprint 144/145 pattern
const TEMPLATE_CONTENT = `# DIRECTIVES — (Sprint 149 için hazırlanıyor)\n\n## Task 1: (Task başlığı)\n- Model: sonnet\n`;

// ─── Regression Tests (Sprint 147 T-147-013 base) ───────────────────────────

describe('DirectivesMidSprintProtection — Regression (Sprint 147 base)', () => {
  let detector: DirectivesMidSprintProtection;

  beforeEach(() => {
    vi.restoreAllMocks();
    detector = new DirectivesMidSprintProtection();
  });

  it('1. should return null for PLAN phase (not protected)', () => {
    const ctx = buildCtx({ sprintState: { currentPhase: 'PLAN' } });
    const result = detector.detect(ctx);
    expect(result).toBeNull();
  });

  it('2. should return null for EXECUTE phase + normal full DIRECTIVES', () => {
    const ctx = buildCtx();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(FULL_DIRECTIVES_CONTENT);
    mockedStatSync.mockReturnValue({ size: FULL_DIRECTIVES_CONTENT.length } as ReturnType<typeof statSync>);

    const result = detector.detect(ctx);
    expect(result).toBeNull();
  });

  it('3. should emit emergency alert for EXECUTE + 463 byte content (Sprint 145 replay)', () => {
    const ctx = buildCtx();
    const smallContent = 'x'.repeat(463);

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(smallContent);
    mockedStatSync.mockReturnValue({ size: 463 } as ReturnType<typeof statSync>);

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('emergency');
    expect(result!.risk).toBe('high');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.suggestedActions[0].id).toBe('DIRECTIVES_WRITE');
    expect(result!.metadata?.reason).toContain('size=463');
  });

  it('4. should emit emergency alert for EXECUTE + template pattern match (>2KB content)', () => {
    const patternContent = `# DIRECTIVES — (Sprint 149 için hazırlanıyor)\n\n${'x'.repeat(3000)}`;
    const ctx = buildCtx();

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(patternContent);
    mockedStatSync.mockReturnValue({ size: patternContent.length } as ReturnType<typeof statSync>);

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('emergency');
    expect(result!.suggestedActions[0].id).toBe('DIRECTIVES_WRITE');
  });

  it('5. should emit emergency alert for EXECUTE + DIRECTIVES deleted', () => {
    const ctx = buildCtx();
    mockedExistsSync.mockReturnValue(false);

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('emergency');
    expect(result!.metadata?.reason).toBe('DIRECTIVES.md DELETED mid-sprint');
    expect(mockedReadFileSync).not.toHaveBeenCalled();
  });

  it('6. should emit emergency alert for FIX phase + template (FIX also protected)', () => {
    const ctx = buildCtx({ sprintState: { currentPhase: 'FIX' } });

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(TEMPLATE_CONTENT);
    mockedStatSync.mockReturnValue({ size: TEMPLATE_CONTENT.length } as ReturnType<typeof statSync>);

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('emergency');
    expect(result!.risk).toBe('high');
  });

  it('7. should include autoRestore:true + sprintId + phase in suggested action payload', () => {
    const ctx = buildCtx();
    const smallContent = 'x'.repeat(100);

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(smallContent);
    mockedStatSync.mockReturnValue({ size: 100 } as ReturnType<typeof statSync>);

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    const payload = result!.suggestedActions[0].payload as Record<string, unknown>;
    expect(payload.autoRestore).toBe(true);
    expect(payload.sprintId).toBe('sprint-148');
    expect(payload.phase).toBe('EXECUTE');
    expect(payload.reason).toContain('reverted to template');
  });
});

// ─── Stress Test (Sprint 148 Wave 6 Simulation) ─────────────────────────────

describe('DirectivesMidSprintProtection — Stress Simulation (Sprint 148)', () => {
  let detector: DirectivesMidSprintProtection;

  beforeEach(() => {
    vi.restoreAllMocks();
    detector = new DirectivesMidSprintProtection();
  });

  it('8. stress simulator overwrite → detector emergency alert → auto-restore → sprint continues', () => {
    // Phase 1: Normal DIRECTIVES — sprint running fine
    const ctx = buildCtx();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(FULL_DIRECTIVES_CONTENT);
    mockedStatSync.mockReturnValue({ size: FULL_DIRECTIVES_CONTENT.length } as ReturnType<typeof statSync>);

    const beforeResult = detector.detect(ctx);
    expect(beforeResult).toBeNull(); // No alert before stress

    // Phase 2: Stress simulator overwrites DIRECTIVES with template
    // (simulates scripts/directives-stress-simulator.mjs behavior)
    const stressContent = `# DIRECTIVES — (Sprint 149 için hazırlanıyor)\n\n## Task 1: (Task başlığı)\n- Model: sonnet\n`;
    mockedReadFileSync.mockReturnValue(stressContent);
    mockedStatSync.mockReturnValue({ size: stressContent.length } as ReturnType<typeof statSync>);

    const stressCtx = buildCtx({
      event: { id: 'evt-stress-overwrite', timestamp: '2026-04-20T14:20:01.000Z' },
    });
    const alertResult = detector.detect(stressCtx);

    // Detector should fire emergency alert
    expect(alertResult).not.toBeNull();
    expect(alertResult!.severity).toBe('emergency');
    expect(alertResult!.shouldNotify).toBe(true);
    expect(alertResult!.suggestedActions[0].id).toBe('DIRECTIVES_WRITE');
    expect(alertResult!.suggestedActions[0].payload).toMatchObject({
      autoRestore: true,
      sprintId: 'sprint-148',
      phase: 'EXECUTE',
    });
    expect(alertResult!.metadata?.reason).toContain('reverted to template');

    // Phase 3: Auto-restore happens (simulator's setTimeout fires)
    // DIRECTIVES is restored to original content
    mockedReadFileSync.mockReturnValue(FULL_DIRECTIVES_CONTENT);
    mockedStatSync.mockReturnValue({ size: FULL_DIRECTIVES_CONTENT.length } as ReturnType<typeof statSync>);

    const afterRestoreCtx = buildCtx({
      event: { id: 'evt-stress-restore', timestamp: '2026-04-20T14:20:06.000Z' },
    });
    const afterResult = detector.detect(afterRestoreCtx);

    // After restore, detector should NOT alert anymore
    expect(afterResult).toBeNull();

    // Phase 4: Sprint continues — subsequent events normal
    const continuedCtx = buildCtx({
      event: { id: 'evt-continued', timestamp: '2026-04-20T14:21:00.000Z' },
      sprintState: { completedTasks: 15 }, // progress continued
    });
    const continuedResult = detector.detect(continuedCtx);
    expect(continuedResult).toBeNull(); // Sprint uninterrupted
  });
});
