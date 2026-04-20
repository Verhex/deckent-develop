import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DetectorContext, DetectorResult, ObserverEvent, SprintStateSnapshot } from '../../../src/core/nervous-types.js';

// Mock node:fs before importing the detector
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

import { existsSync, readFileSync, statSync } from 'node:fs';
import { DirectivesMidSprintProtection } from '../../../src/nervous/detectors/directives-protection.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedStatSync = vi.mocked(statSync);

// ─── Test Helpers ────────────────────────────────────────────────────────────

function buildSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-147',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 22,
    completedTasks: 10,
    ...overrides,
  };
}

function buildEvent(overrides: Partial<ObserverEvent> = {}): ObserverEvent {
  return {
    id: 'evt-001',
    source: 'filesystem',
    type: 'FILE_CHANGE',
    timestamp: '2026-04-20T08:14:00.000Z',
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
    now: new Date('2026-04-20T08:14:30.000Z'),
  };
}

// Full DIRECTIVES content (well above 2KB threshold)
const FULL_DIRECTIVES_CONTENT = `# DIRECTIVES — Sprint 147: Pure Nervous System\n\n## Goal\nNervous system implementation with 22 tasks.\n\n---\n\n## Task 1: Types\n- Model: opus\n- Effort: normal\n- Skills: typescript-expert\n\n${'x'.repeat(2500)}\n## Task 22: ADR-040 Accept\n- Model: sonnet\n- Effort: low\n`;

// Template content matching Sprint 144/145 pattern (463 bytes)
const TEMPLATE_CONTENT = `# DIRECTIVES — (Sprint 148 için hazırlanıyor)\n\n## Task 1: (Task başlığı)\n- Model: sonnet\n- Effort: normal\n`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DirectivesMidSprintProtection', () => {
  let detector: DirectivesMidSprintProtection;

  beforeEach(() => {
    vi.restoreAllMocks();
    detector = new DirectivesMidSprintProtection();
  });

  it('should return null for PLAN phase + DIRECTIVES change (not protected)', () => {
    const ctx = buildCtx({ sprintState: { currentPhase: 'PLAN' } });

    const result = detector.detect(ctx);

    expect(result).toBeNull();
  });

  it('should return null for EXECUTE phase + normal DIRECTIVES (full content)', () => {
    const ctx = buildCtx();

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(FULL_DIRECTIVES_CONTENT);
    mockedStatSync.mockReturnValue({ size: FULL_DIRECTIVES_CONTENT.length } as ReturnType<typeof statSync>);

    const result = detector.detect(ctx);

    expect(result).toBeNull();
  });

  it('should emit emergency alert for EXECUTE phase + 463 byte template (Sprint 145 replay)', () => {
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

  it('should emit emergency alert for EXECUTE phase + template pattern match', () => {
    // Content is > 2KB but matches template pattern
    const patternContent = `# DIRECTIVES — (Sprint 148 için hazırlanıyor)\n\n${'x'.repeat(3000)}`;
    const ctx = buildCtx();

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(patternContent);
    mockedStatSync.mockReturnValue({ size: patternContent.length } as ReturnType<typeof statSync>);

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('emergency');
    expect(result!.suggestedActions[0].id).toBe('DIRECTIVES_WRITE');
  });

  it('should emit emergency alert for EXECUTE phase + DIRECTIVES deleted', () => {
    const ctx = buildCtx();

    mockedExistsSync.mockReturnValue(false);

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('emergency');
    expect(result!.metadata?.reason).toBe('DIRECTIVES.md DELETED mid-sprint');
    expect(result!.suggestedActions[0].id).toBe('DIRECTIVES_WRITE');
    // readFileSync/statSync should NOT be called if file doesn't exist
    expect(mockedReadFileSync).not.toHaveBeenCalled();
  });

  it('should emit emergency alert for FIX phase + template (FIX also protected)', () => {
    const ctx = buildCtx({ sprintState: { currentPhase: 'FIX' } });

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(TEMPLATE_CONTENT);
    mockedStatSync.mockReturnValue({ size: TEMPLATE_CONTENT.length } as ReturnType<typeof statSync>);

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('emergency');
    expect(result!.risk).toBe('high');
  });

  it('should return null for RETRO phase + template (not protected, expected transition)', () => {
    const ctx = buildCtx({ sprintState: { currentPhase: 'RETRO' } });

    const result = detector.detect(ctx);

    expect(result).toBeNull();
    // fs functions should not be called since phase check returns early
    expect(mockedExistsSync).not.toHaveBeenCalled();
  });

  it('should include autoRestore: true in suggested action payload', () => {
    const ctx = buildCtx();
    const smallContent = 'x'.repeat(100);

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(smallContent);
    mockedStatSync.mockReturnValue({ size: 100 } as ReturnType<typeof statSync>);

    const result = detector.detect(ctx);

    expect(result).not.toBeNull();
    const payload = result!.suggestedActions[0].payload as Record<string, unknown>;
    expect(payload.autoRestore).toBe(true);
    expect(payload.sprintId).toBe('sprint-147');
    expect(payload.phase).toBe('EXECUTE');
    expect(payload.reason).toContain('reverted to template');
  });
});
