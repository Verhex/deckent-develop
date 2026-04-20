// tests/nervous/detectors/scope-collision-live.test.ts
//
// ScopeCollisionMonitor — Sprint 148 canlı integration testleri (T-009 Test 1-3)
//
// Bu testler Sprint 148 PLAN phase gerçekçi senaryolarını simüle eder:
// Test 1: 28 task temiz plan → 0 collision (pozitif doğrulama)
// Test 2: Deliberate collision fixture (2 task aynı dosya) → 1 collision event
// Test 3: Collision payload yapısı — taskIds ve file path doğrulaması
//
// ADR-003: vitest over Jest
// Sprint 148 T-009

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  DetectorContext,
  SprintStateSnapshot,
  ObserverEvent,
} from '../../../src/core/nervous-types.js';

// ─── fs mock ─────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { ScopeCollisionMonitor } from '../../../src/nervous/detectors/scope-collision.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(): ObserverEvent {
  return {
    id: 'evt-sprint148-plan',
    source: 'cron',
    type: 'TICK',
    timestamp: '2026-04-20T12:00:00.000Z',
    payload: {},
    sprintId: 'sprint-148',
  };
}

function makePlanPhaseState(): SprintStateSnapshot {
  return {
    sprintId: 'sprint-148',
    currentPhase: 'PLAN',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 28,
    completedTasks: 0,
  };
}

function makePlanCtx(): DetectorContext {
  return {
    event: makeEvent(),
    sprintState: makePlanPhaseState(),
    projectRoot: '/workspace',
    now: new Date('2026-04-20T12:00:00.000Z'),
  };
}

/**
 * Task JSON stub üretici — PENDING status (aktif olarak değerlendirmek için)
 */
function makeTaskJson(
  id: string,
  filesWrite: string[],
  status = 'PENDING',
): string {
  return JSON.stringify({ id, status, scope: { filesWrite } });
}

/**
 * Sprint 148 BLOCK A-D task'larını simüle eden 28 benzersiz task fixture.
 * Her task farklı dosyalara yazıyor — çakışma olmamalı.
 */
function makeSprint148Tasks(): Array<{ filename: string; content: string }> {
  return [
    // BLOCK A — Agent Taxonomy Reform (5 task)
    { filename: 'task-148-001.json', content: makeTaskJson('148-001', ['.deckent/agents/archive/test-writer-removed-sprint-148/agent.json', 'docs/audits/sprint-148/test-writer-removal-justification.md']) },
    { filename: 'task-148-002.json', content: makeTaskJson('148-002', ['src/core/skill-pool.ts', '.deckent/skills/testing-expert/manifest.json', 'tests/core/skill-auto-activation.test.ts']) },
    { filename: 'task-148-003.json', content: makeTaskJson('148-003', ['src/core/intent-classifier.ts', 'src/core/activation-engine.ts', 'src/core/routing-types.ts', 'tests/core/intent-classifier-refactor.test.ts']) },
    { filename: 'task-148-004.json', content: makeTaskJson('148-004', ['src/orchestra/task-router.ts', 'src/core/routing-engine.ts', 'src/core/agent-pool.ts', 'tests/orchestra/router-agent-fallback.test.ts']) },
    { filename: 'task-148-005.json', content: makeTaskJson('148-005', ['scripts/agent-prompt-validator.mjs']) },

    // BLOCK B — Nervous Dogfood (8 task)
    { filename: 'task-148-006.json', content: makeTaskJson('148-006', ['.deckent/config.json', 'src/core/config-defaults.ts', 'tests/core/nervous-enabled-integration.test.ts']) },
    { filename: 'task-148-007.json', content: makeTaskJson('148-007', ['src/nervous/runtime-scope-check.ts', 'src/nervous/dispatcher.ts', 'src/nervous/observer.ts', 'tests/nervous/runtime-scope.test.ts']) },
    { filename: 'task-148-008.json', content: makeTaskJson('148-008', ['src/nervous/detector-registry.ts', 'tests/nervous/detectors/stale-worker-live.test.ts']) },
    { filename: 'task-148-009.json', content: makeTaskJson('148-009', ['tests/nervous/detectors/scope-collision-live.test.ts', 'tests/nervous/detectors/debt-trend-live.test.ts']) },
    { filename: 'task-148-010.json', content: makeTaskJson('148-010', ['tests/nervous/detectors/agent-routing-positive.test.ts']) },
    { filename: 'task-148-011.json', content: makeTaskJson('148-011', ['tests/nervous/detectors/directives-protection-stress.test.ts', 'scripts/directives-stress-simulator.mjs']) },
    { filename: 'task-148-012.json', content: makeTaskJson('148-012', ['scripts/nervous-tui-smoke.sh', 'tests/cli/nervous-tui-live.test.ts']) },
    { filename: 'task-148-013.json', content: makeTaskJson('148-013', ['tests/mcp/nervous-tools-e2e.test.ts', 'scripts/mcp-nervous-e2e.mjs']) },

    // BLOCK C — Cross-Platform (6 task)
    { filename: 'task-148-014.json', content: makeTaskJson('148-014', ['tests/e2e/cross-platform/macos-tmux.test.ts', '.github/workflows/cross-platform-e2e.yml', 'docs/audits/sprint-148/macos-validation.md']) },
    { filename: 'task-148-015.json', content: makeTaskJson('148-015', ['tests/e2e/cross-platform/linux-subprocess.test.ts', 'docs/audits/sprint-148/linux-validation.md']) },
    { filename: 'task-148-016.json', content: makeTaskJson('148-016', ['tests/e2e/cross-platform/wsl2-docker.test.ts', 'docs/audits/sprint-148/wsl2-validation.md']) },
    { filename: 'task-148-017.json', content: makeTaskJson('148-017', ['tests/e2e/provider-matrix/claude-codex-mixed.test.ts', 'docs/audits/sprint-148/provider-parity.md']) },
    { filename: 'task-148-018.json', content: makeTaskJson('148-018', ['tests/i18n/task-description-parity.test.ts', 'docs/audits/sprint-148/i18n-validation.md']) },
    { filename: 'task-148-019.json', content: makeTaskJson('148-019', ['tests/e2e/install-matrix/fresh-install.test.ts', 'scripts/fresh-env-test.sh', 'docs/audits/sprint-148/install-matrix.md']) },

    // BLOCK D — Polish + Debt Liquidation + Docs (9 task)
    { filename: 'task-148-020.json', content: makeTaskJson('148-020', ['docs/audits/sprint-148/vitest-triage.md']) },
    { filename: 'task-148-021.json', content: makeTaskJson('148-021', ['tests/core/intent-v3.test.ts']) },
    { filename: 'task-148-022.json', content: makeTaskJson('148-022', ['src/backends/docker-spawn-backend.ts', 'tests/backends/docker-exit-reproducer.test.ts']) },
    { filename: 'task-148-023.json', content: makeTaskJson('148-023', ['CHANGELOG.md', 'docs/sprint-log/Sprint-148.md']) },
    { filename: 'task-148-024.json', content: makeTaskJson('148-024', ['docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md']) },
    { filename: 'task-148-025.json', content: makeTaskJson('148-025', ['DECKENT-ANA-PLAN-TR.md', 'DECKENT-MASTER-BLUEPRINT.md', 'BETA-TRACKER.md', 'BETA-TRACKER-TR.md']) },
    { filename: 'task-148-026.json', content: makeTaskJson('148-026', ['src/core/memory-store.ts', 'src/nervous/history.ts', 'tests/integration/memory-nervous.test.ts']) },
    { filename: 'task-148-027.json', content: makeTaskJson('148-027', ['package.json', 'scripts/npm-publish-dry.sh', 'docs/audits/sprint-148/npm-publish-dry.md']) },
    { filename: 'task-148-028.json', content: makeTaskJson('148-028', ['.brain/exports/decisions.md']) },
  ];
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('ScopeCollisionMonitor — Sprint 148 Live Integration (T-009)', () => {
  const monitor = new ScopeCollisionMonitor();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1: 28 task temiz plan — 0 collision ──────────────────────────────
  //
  // Sprint 148 PLAN phase gerçeğini simüle eder. DIRECTIVES temiz yazıldı,
  // her task benzersiz dosya setine yazıyor. Detector çalışıyor ama false
  // positive üretmiyor — pozitif doğrulama.
  //
  it('Test 1: 28 Sprint-148 task temiz plan — scope collision tespit edilmez (0 collision)', () => {
    // Arrange
    const tasks = makeSprint148Tasks();
    const filenames = tasks.map(t => t.filename);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      filenames as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      const p = String(path);
      const filename = p.split('/').pop() ?? '';
      const task = tasks.find(t => t.filename === filename);
      return task?.content ?? '{}';
    });

    const ctx = makePlanCtx();

    // Act
    const result = monitor.detect(ctx);

    // Assert — 28 task'ta çakışma yok, detector null döner
    expect(result).toBeNull();
  });

  // ── Test 2: Deliberate collision fixture — 2 task aynı dosya ─────────────
  //
  // Kasıtlı çakışma senaryosu: 2 task aynı dosyaya yazıyor.
  // Detector bu durumu yakalamalı ve DetectorResult üretmeli.
  //
  it('Test 2: Deliberate collision — 2 task detector-registry.ts yazar → 1 collision event üretilir', () => {
    // Arrange — 2 task aynı dosyaya (detector-registry.ts) yazıyor
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['task-collision-A.json', 'task-collision-B.json'] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.endsWith('task-collision-A.json')) {
        return makeTaskJson('collision-A', [
          'src/nervous/detector-registry.ts',
          'tests/nervous/detectors/stale-worker-live.test.ts',
        ]);
      }
      if (p.endsWith('task-collision-B.json')) {
        return makeTaskJson('collision-B', [
          'src/nervous/detector-registry.ts',  // Çakışan dosya!
          'tests/nervous/detectors/scope-collision-live.test.ts',
        ]);
      }
      return '{}';
    });

    const ctx = makePlanCtx();

    // Act
    const result = monitor.detect(ctx);

    // Assert — çakışma tespiti
    expect(result).not.toBeNull();
    expect(result!.shouldNotify).toBe(true);
    expect(result!.severity).toBe('warning');
    expect(result!.risk).toBe('medium');
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0]!.id).toBe('SCOPE_COLLISION_REORDER');
  });

  // ── Test 3: Collision payload yapısı doğrulaması ──────────────────────────
  //
  // Detector'ın ürettiği payload'un yapısını doğrular:
  // taskIds her iki task'ı içermeli, file path collision dosyasını göstermeli.
  //
  it('Test 3: Collision payload — taskIds her iki task ID\'sini ve çakışan dosya yolunu içerir', () => {
    // Arrange — aynı deliberate collision senaryosu
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['task-payload-A.json', 'task-payload-B.json'] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.endsWith('task-payload-A.json')) {
        return makeTaskJson('payload-A', ['src/nervous/detector-registry.ts']);
      }
      if (p.endsWith('task-payload-B.json')) {
        return makeTaskJson('payload-B', ['src/nervous/detector-registry.ts']);
      }
      return '{}';
    });

    const ctx = makePlanCtx();

    // Act
    const result = monitor.detect(ctx);

    // Assert — payload yapısı
    expect(result).not.toBeNull();

    const action = result!.suggestedActions[0]!;
    const payload = action.payload as {
      collisions: Array<{ file: string; taskIds: string[] }>;
    };

    expect(payload).toBeDefined();
    expect(payload.collisions).toHaveLength(1);

    const collision = payload.collisions[0]!;
    // Dosya yolu: normalize edilmiş hali (lowercase)
    expect(collision.file).toBe('src/nervous/detector-registry.ts');
    // Her iki task ID'si mevcut
    expect(collision.taskIds).toContain('payload-A');
    expect(collision.taskIds).toContain('payload-B');
    expect(collision.taskIds).toHaveLength(2);
  });
});
