/**
 * Sprint 168 C0c RC3 — Brain TASK_ASSIGN fresh task.json disk read tests.
 *
 * Sprint 167 cascade root layer: the spawn pipeline emitted TASK_ASSIGN events
 * from the in-memory plan-state object, never re-reading task.json from disk.
 * Manual patches applied between PLAN and SPAWN phases (operator-driven
 * recovery, --resume, race with Auditor) were invisible to the worker payload.
 *
 * readTaskJsonFresh() is the missing invariant: always read from disk, no
 * in-memory cache. The test mutates task.json between two calls and asserts
 * the second call returns the updated contents.
 *
 * The companion helper consultCollisionDecision() wraps the pure
 * decision-engine.ts handler with a BRAIN→SPAWN:BLOCKED event emit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readTaskJsonFresh,
  consultCollisionDecision,
} from '../../src/orchestra/sprint-controller.js';

const FIXTURE_TASK = {
  id: '168-001',
  title: 'Fresh-read fixture',
  description: 'C0c RC3 invariant test fixture',
  scope: {
    directories: ['src/'],
    filesRead: [],
    filesWrite: ['initial.md'],
  },
};

describe('readTaskJsonFresh (Sprint 168 C0c RC3)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'c0c-fresh-read-'));
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('always reads from disk (no cache)', () => {
    const taskJson = { ...FIXTURE_TASK, scope: { ...FIXTURE_TASK.scope, filesWrite: ['initial.md'] } };
    writeFileSync(
      join(testRoot, '.tasks', 'task-168-001.json'),
      JSON.stringify(taskJson),
    );

    const task1 = readTaskJsonFresh(testRoot, '168-001');
    expect(task1.scope?.filesWrite).toEqual(['initial.md']);

    // Patch disk between calls (simulates manual patch / recovery)
    taskJson.scope.filesWrite = ['updated.md'];
    writeFileSync(
      join(testRoot, '.tasks', 'task-168-001.json'),
      JSON.stringify(taskJson),
    );

    const task2 = readTaskJsonFresh(testRoot, '168-001');
    expect(task2.scope?.filesWrite).toEqual(['updated.md']); // FRESH, not cached
  });

  it('throws if task.json missing', () => {
    expect(() => readTaskJsonFresh(testRoot, '168-NEVER')).toThrow(/task\.json not found/);
  });

  it('reads full task payload (id, scope, etc.)', () => {
    writeFileSync(
      join(testRoot, '.tasks', `task-${FIXTURE_TASK.id}.json`),
      JSON.stringify(FIXTURE_TASK),
    );
    const read = readTaskJsonFresh(testRoot, FIXTURE_TASK.id);
    expect(read.id).toBe(FIXTURE_TASK.id);
    expect(read.title).toBe(FIXTURE_TASK.title);
  });
});

describe('consultCollisionDecision (Sprint 168 C0c RC2 wire)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'c0c-collision-wire-'));
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('returns block decision and emits BRAIN→SPAWN:BLOCKED event', () => {
    const decision = consultCollisionDecision(testRoot, 'sprint-168', {
      taskIds: ['168-001', '168-002'],
      files: ['.audit/shared.md'],
      detectedAt: 'plan-time',
    });

    expect(decision.action).toBe('block');
    expect(decision.taskIds).toEqual(['168-001', '168-002']);

    // Verify event written to .deckent/sprint-168-events.jsonl
    const eventsPath = join(testRoot, '.deckent', 'sprint-168-events.jsonl');
    expect(existsSync(eventsPath)).toBe(true);

    const raw = readFileSync(eventsPath, 'utf-8');
    const events = raw.trim().split('\n').map(l => JSON.parse(l));
    expect(events).toHaveLength(1);
    expect(events[0].channel).toBe('BRAIN→SPAWN:BLOCKED');
    expect(events[0].source).toBe('brain');
    expect(events[0].payload.taskIds).toEqual(['168-001', '168-002']);
    expect(events[0].payload.files).toEqual(['.audit/shared.md']);
  });

  it('event payload preserves reason and detectedAt context', () => {
    consultCollisionDecision(testRoot, 'sprint-168', {
      taskIds: ['t1', 't2'],
      files: ['shared.json'],
      detectedAt: 'spawn-time',
    });
    const eventsPath = join(testRoot, '.deckent', 'sprint-168-events.jsonl');
    const raw = readFileSync(eventsPath, 'utf-8');
    const event = JSON.parse(raw.trim().split('\n')[0]!);
    expect(event.payload.reason).toContain('shared.json');
    expect(event.payload.detectedAt).toBe('spawn-time');
  });
});
