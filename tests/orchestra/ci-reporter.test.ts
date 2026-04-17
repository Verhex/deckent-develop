import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MemoryStore } from '../../src/core/memory-store.js';
import {
  appendCiHealthToRetro,
  appendCiLearningsToMemory,
  formatCiHealthSection,
  runCiLearningAnalysis,
} from '../../src/orchestra/ci-reporter.js';

const TEST_ROOT = path.join(process.cwd(), '.test-ci-reporter-' + process.pid);
const BRAIN = path.join(TEST_ROOT, '.brain');

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

function makeStore(): MemoryStore {
  const dbPath = path.join(BRAIN, 'memory.db');
  return new MemoryStore(dbPath);
}

function writeCiReport(sprintId: string) {
  const report = {
    sprintId,
    tscPassed: true,
    result: { testCount: 100, testPassed: 98, testFailed: 2, coverage: 85.5 },
    delta: { newTests: 5, regressions: 2, coverageDelta: 1.2 },
    buildPassed: true,
  };
  fs.writeFileSync(
    path.join(BRAIN, `ci-report-${sprintId}.json`),
    JSON.stringify(report),
    'utf-8',
  );
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(BRAIN, { recursive: true });
});

afterEach(cleanup);

// ─── appendCiHealthToRetro — DB-first ─────────────────────────────────

describe('appendCiHealthToRetro with store', () => {
  it('upserts retro entry to DB when store is provided', () => {
    const store = makeStore();
    writeCiReport('sprint-100');
    appendCiHealthToRetro(TEST_ROOT, 'sprint-100', store);

    const entry = store.getById('retro-ci-health-sprint-100');
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('retro');
    expect(entry!.content).toContain('CI Health');
    expect(entry!.content).toContain('85.5');
  });

  it('is idempotent — second call does not duplicate', () => {
    const store = makeStore();
    writeCiReport('sprint-101');
    appendCiHealthToRetro(TEST_ROOT, 'sprint-101', store);
    appendCiHealthToRetro(TEST_ROOT, 'sprint-101', store);

    const entries = store.getByType('retro');
    const ciHealthEntries = entries.filter(e => e.id === 'retro-ci-health-sprint-101');
    expect(ciHealthEntries.length).toBe(1);
  });

  it('skips when no CI report file exists', () => {
    const store = makeStore();
    appendCiHealthToRetro(TEST_ROOT, 'sprint-999', store);
    expect(store.getById('retro-ci-health-sprint-999')).toBeNull();
  });
});

// ─── appendCiHealthToRetro — no-op without store (V2) ─────────────────

describe('appendCiHealthToRetro without store (V2: DB-only)', () => {
  it('is a no-op when no store is provided', () => {
    const retroPath = path.join(BRAIN, 'RETRO.md');
    fs.writeFileSync(retroPath, '# Retro\nSome content\n', 'utf-8');
    writeCiReport('sprint-102');

    appendCiHealthToRetro(TEST_ROOT, 'sprint-102');

    // V2: without store, RETRO.md is NOT modified (DB is single source of truth)
    const content = fs.readFileSync(retroPath, 'utf-8');
    expect(content).not.toContain('## CI Health');
    expect(content).toBe('# Retro\nSome content\n');
  });
});

// ─── appendCiLearningsToMemory — DB-first ─────────────────────────────

describe('appendCiLearningsToMemory with store', () => {
  it('upserts memory entry to DB when store is provided', () => {
    const store = makeStore();
    const fakeResult = {
      reports: [{
        sprintId: 'sprint-100', tscPassed: true, buildPassed: true, timestamp: '',
        baseline: { testCount: 90, coverage: 80 },
        result: { testCount: 100, testPassed: 98, testFailed: 2, coverage: 85 },
        delta: { newTests: 10, regressions: 2, coverageDelta: 5 },
      }],
      patterns: [{ category: 'coverage' as const, severity: 'medium' as const, description: 'Coverage dropped', sprintIds: ['sprint-100'], occurrences: 1 }],
      suggestions: [],
      configSuggestions: [],
      summary: 'CI analysis complete',
    };

    appendCiLearningsToMemory(TEST_ROOT, fakeResult, store);

    const entry = store.getById('ci-learnings-latest');
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('memory');
    expect(entry!.title).toBe('CI Learnings');
  });

  it('upsert replaces existing entry on second call', () => {
    const store = makeStore();
    const fakeResult = {
      reports: [{
        sprintId: 'sprint-100', tscPassed: true, buildPassed: true, timestamp: '',
        baseline: { testCount: 90, coverage: 80 },
        result: { testCount: 100, testPassed: 98, testFailed: 2, coverage: 85 },
        delta: { newTests: 10, regressions: 2, coverageDelta: 5 },
      }],
      patterns: [{ category: 'coverage' as const, severity: 'medium' as const, description: 'First', sprintIds: ['sprint-100'], occurrences: 1 }],
      suggestions: [],
      configSuggestions: [],
      summary: 'First run',
    };
    appendCiLearningsToMemory(TEST_ROOT, fakeResult, store);

    const fakeResult2 = {
      reports: [{
        sprintId: 'sprint-101', tscPassed: true, buildPassed: true, timestamp: '',
        baseline: { testCount: 95, coverage: 85 },
        result: { testCount: 105, testPassed: 103, testFailed: 2, coverage: 87 },
        delta: { newTests: 10, regressions: 2, coverageDelta: 2 },
      }],
      patterns: [{ category: 'coverage' as const, severity: 'high' as const, description: 'Second', sprintIds: ['sprint-101'], occurrences: 1 }],
      suggestions: [],
      configSuggestions: [],
      summary: 'Second run',
    };
    appendCiLearningsToMemory(TEST_ROOT, fakeResult2, store);

    const entries = store.getByType('memory');
    const ciEntries = entries.filter(e => e.id === 'ci-learnings-latest');
    expect(ciEntries.length).toBe(1);
  });
});

// ─── appendCiLearningsToMemory — no-op without store (V2) ────────────

describe('appendCiLearningsToMemory without store (V2: DB-only)', () => {
  it('is a no-op when no store is provided', () => {
    const memoryPath = path.join(BRAIN, 'MEMORY.md');
    fs.writeFileSync(memoryPath, '# Memory\nExisting content\n', 'utf-8');

    const fakeResult = {
      reports: [{
        sprintId: 'sprint-100', tscPassed: true, buildPassed: true, timestamp: '',
        baseline: { testCount: 90, coverage: 80 },
        result: { testCount: 100, testPassed: 98, testFailed: 2, coverage: 85 },
        delta: { newTests: 10, regressions: 2, coverageDelta: 5 },
      }],
      patterns: [{ category: 'coverage' as const, severity: 'medium' as const, description: 'Coverage dropped', sprintIds: ['sprint-100'], occurrences: 1 }],
      suggestions: [],
      configSuggestions: [],
      summary: 'CI analysis complete',
    };

    appendCiLearningsToMemory(TEST_ROOT, fakeResult);

    // V2: without store, MEMORY.md is NOT modified (DB is single source of truth)
    const content = fs.readFileSync(memoryPath, 'utf-8');
    expect(content).toBe('# Memory\nExisting content\n');
  });
});
