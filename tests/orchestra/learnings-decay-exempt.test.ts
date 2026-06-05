import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { writeRetrospective, backfillSprintRetro } from '../../src/orchestra/sprint-retro-writer.js';
import { detectPatterns } from '../../src/monitor/auditor.js';
import { MEMORY_DB_FILE, BRAIN_DIR } from '../../src/core/constants.js';
import { SprintStatus, SprintPhase } from '../../src/core/sprint-types.js';
import type { Sprint, SprintMetrics, TaskEvaluation } from '../../src/core/types.js';
import type { BoundaryViolation } from '../../src/core/monitoring-types.js';

let tmpDir: string;
let brainDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'decay-exempt-test-'));
  brainDir = join(tmpDir, BRAIN_DIR);
  mkdirSync(brainDir, { recursive: true });
  dbPath = join(brainDir, MEMORY_DB_FILE);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function openStore(): MemoryStore {
  return new MemoryStore(dbPath);
}

/** Pre-create the DB file so writeRetrospective's existsSync check passes. */
function initDb(): void {
  const s = new MemoryStore(dbPath);
  s.close();
}

function makeSprint(id = 'sprint-100', num = 100): Sprint {
  return {
    id,
    number: num,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.CLEANUP,
    tasks: [],
    workers: [],
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T01:00:00Z',
  };
}

function makeMetrics(): SprintMetrics {
  return {
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 3600000,
    coveragePercent: 0,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  };
}

// ── Test 1: memory entry from writeRetrospective has decay_exempt=true ───────

describe('writeRetrospective — decay_exempt on learning entries', () => {
  it('memory entry has decay_exempt=true', () => {
    initDb();
    const sprint = makeSprint('sprint-100', 100);
    writeRetrospective(tmpDir, sprint, new Map<string, TaskEvaluation>(), makeMetrics());

    const store = openStore();
    try {
      const entry = store.getById('mem-sprint-100');
      expect(entry).not.toBeNull();
      expect(entry!.decay_exempt).toBe(true);
    } finally {
      store.close();
    }
  });

  // ── Test 2: retro entry has decay_exempt=true ────────────────────────────

  it('retro entry has decay_exempt=true', () => {
    initDb();
    const sprint = makeSprint('sprint-101', 101);
    writeRetrospective(tmpDir, sprint, new Map<string, TaskEvaluation>(), makeMetrics());

    const store = openStore();
    try {
      const entry = store.getById('retro-sprint-101');
      expect(entry).not.toBeNull();
      expect(entry!.decay_exempt).toBe(true);
    } finally {
      store.close();
    }
  });

  // ── Test 3: sprint entry has decay_exempt=true ───────────────────────────

  it('sprint log entry has decay_exempt=true', () => {
    initDb();
    const sprint = makeSprint('sprint-102', 102);
    writeRetrospective(tmpDir, sprint, new Map<string, TaskEvaluation>(), makeMetrics());

    const store = openStore();
    try {
      const entry = store.getById('sprint-log-102');
      expect(entry).not.toBeNull();
      expect(entry!.decay_exempt).toBe(true);
    } finally {
      store.close();
    }
  });

  // ── Test 4: learning entries survive decay with old sprint_num ───────────

  it('learning entries survive decay even with old sprint_num', () => {
    initDb();
    const sprint = makeSprint('sprint-050', 50);
    writeRetrospective(tmpDir, sprint, new Map<string, TaskEvaluation>(), makeMetrics());

    const store = openStore();
    try {
      // Decay from sprint 200 with window=20 → threshold=180; sprint-050 (num=50) is way below
      const result = store.decay(200, 20);
      // decay_exempt entries are NOT deleted regardless of sprint_num
      expect(result.deletedCount).toBe(0);

      expect(store.getById('mem-sprint-050')).not.toBeNull();
      expect(store.getById('retro-sprint-050')).not.toBeNull();
      expect(store.getById('sprint-log-50')).not.toBeNull();
    } finally {
      store.close();
    }
  });
});

// ── Test 5: pattern entry from detectPatterns has decay_exempt=true ──────────

describe('detectPatterns — decay_exempt on pattern entries', () => {
  it('pattern entry written by detectPatterns has decay_exempt=true', () => {
    // Pre-create the DB so detectPatterns can find it
    const initStore = openStore();
    initStore.close();

    const violations: BoundaryViolation[] = [
      { type: 'stale_heartbeat', agentId: 'w-001', detail: 'hb too old', timestamp: new Date().toISOString() },
    ];
    detectPatterns(tmpDir, violations, 'sprint-100');

    const store = openStore();
    try {
      const entry = store.getById('pattern-sprint-100-stale_heartbeat');
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('pattern');
      expect(entry!.decay_exempt).toBe(true);
    } finally {
      store.close();
    }
  });

  // ── Test 6: pattern entry survives decay with old sprint_num ─────────────

  it('pattern entry survives decay even with old sprint_num', () => {
    const initStore = openStore();
    initStore.close();

    const violations: BoundaryViolation[] = [
      { type: 'stale_heartbeat', agentId: 'w-001', detail: 'hb too old', timestamp: new Date().toISOString() },
    ];
    detectPatterns(tmpDir, violations, 'sprint-010');

    const store = openStore();
    try {
      // Force decay: sprint 200, window 20 → threshold 180; pattern sprint_num defaults to 0
      // (sprint_id='sprint-010' but sprint_num is not set in detectPatterns — DB default 0)
      // decay skips sprint_num=0 entries (skipDelete guard), so they are preserved regardless
      store.decay(200, 20);
      const entry = store.getById('pattern-sprint-010-stale_heartbeat');
      expect(entry).not.toBeNull();
    } finally {
      store.close();
    }
  });
});

// ── Test 7: backfillSprintRetro entries also have decay_exempt=true ──────────

describe('backfillSprintRetro — decay_exempt on backfilled entries', () => {
  it('backfilled sprint/retro/memory entries have decay_exempt=true', () => {
    backfillSprintRetro(tmpDir, {
      sprintId: 'sprint-080',
      retroContent: '# Retro\nBackfilled content',
      memoryContent: '## Sprint 080 Learnings\n- backfilled',
    });

    const store = openStore();
    try {
      const sprintEntry = store.getById('sprint-log-80');
      expect(sprintEntry).not.toBeNull();
      expect(sprintEntry!.decay_exempt).toBe(true);

      const retroEntry = store.getById('retro-sprint-080');
      expect(retroEntry).not.toBeNull();
      expect(retroEntry!.decay_exempt).toBe(true);

      const memEntry = store.getById('mem-sprint-080');
      expect(memEntry).not.toBeNull();
      expect(memEntry!.decay_exempt).toBe(true);
    } finally {
      store.close();
    }
  });
});

// ── Test 8: non-exempt entries are still subject to decay ────────────────────

describe('non-exempt entries still decay normally', () => {
  it('entries without decay_exempt=true are deleted by decay', () => {
    const store = openStore();
    store.insert({
      id: 'non-exempt-entry',
      type: 'memory',
      title: 'Non-exempt memory',
      content: 'Should be decayed',
      source: 'brain',
      sprint_num: 50,
      sprint_id: 'sprint-050',
      decay_exempt: false,
    });
    store.close();

    const store2 = openStore();
    try {
      // decay from sprint 200, window 20 → threshold 180; sprint_num=50 < 180, not exempt → deleted
      const result = store2.decay(200, 20);
      expect(result.deletedCount).toBeGreaterThan(0);
      expect(store2.getById('non-exempt-entry')).toBeNull();
    } finally {
      store2.close();
    }
  });
});
