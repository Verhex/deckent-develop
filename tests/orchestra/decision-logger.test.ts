import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DecisionLogger } from '../../src/orchestra/decision-logger.js';
import { createDecisionLogEntry } from '../../src/core/decision-types.js';
import type { DecisionLogEntry } from '../../src/core/decision-types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

const TEST_ROOT = path.join(process.cwd(), '.test-decision-logger-' + process.pid);

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

function makeEntries(count: number): DecisionLogEntry[] {
  return Array.from({ length: count }, (_, i) =>
    createDecisionLogEntry(i + 1, `Step${i + 1}`, `Reason ${i + 1}`),
  );
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(() => {
  cleanup();
});

// ─── DecisionLogger.log ────────────────────────────────────────────────────

describe('DecisionLogger.log', () => {
  it('creates decision log file', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(3));
    const filePath = path.join(TEST_ROOT, '.tasks', 'decisions', 'decision-031-001.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('creates decisions directory if missing', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(1));
    const dir = path.join(TEST_ROOT, '.tasks', 'decisions');
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('writes valid JSON', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(2));
    const filePath = path.join(TEST_ROOT, '.tasks', 'decisions', 'decision-031-001.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('stores correct taskId', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-005', makeEntries(1));
    const filePath = path.join(TEST_ROOT, '.tasks', 'decisions', 'decision-031-005.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.taskId).toBe('031-005');
  });

  it('stores correct sprintId', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(1));
    const filePath = path.join(TEST_ROOT, '.tasks', 'decisions', 'decision-031-001.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.sprintId).toBe('sprint-031');
  });

  it('stores all step entries', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    const entries = makeEntries(6);
    logger.log('sprint-031', '031-001', entries);
    const filePath = path.join(TEST_ROOT, '.tasks', 'decisions', 'decision-031-001.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.steps).toHaveLength(6);
  });

  it('stores decidedAt as ISO string', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(1));
    const filePath = path.join(TEST_ROOT, '.tasks', 'decisions', 'decision-031-001.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('overwrites existing log for same taskId', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(2));
    logger.log('sprint-031', '031-001', makeEntries(4));
    const filePath = path.join(TEST_ROOT, '.tasks', 'decisions', 'decision-031-001.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.steps).toHaveLength(4);
  });
});

// ─── DecisionLogger.readDecisionLog ────────────────────────────────────────

describe('DecisionLogger.readDecisionLog', () => {
  it('returns null for non-existent task', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    const result = logger.readDecisionLog('999-999');
    expect(result).toBeNull();
  });

  it('reads back logged entries', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(3));
    const result = logger.readDecisionLog('031-001');
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(3);
  });

  it('returns decidedAt timestamp', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(1));
    const result = logger.readDecisionLog('031-001');
    expect(result!.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('preserves step names', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    const entries = makeEntries(3);
    logger.log('sprint-031', '031-001', entries);
    const result = logger.readDecisionLog('031-001');
    expect(result!.steps[0].name).toBe('Step1');
    expect(result!.steps[2].name).toBe('Step3');
  });

  it('returns null for corrupted JSON', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    const dir = path.join(TEST_ROOT, '.tasks', 'decisions');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'decision-031-001.json'), 'NOT JSON', 'utf-8');
    const result = logger.readDecisionLog('031-001');
    expect(result).toBeNull();
  });
});

// ─── DecisionLogger.listDecisions ──────────────────────────────────────────

describe('DecisionLogger.listDecisions', () => {
  it('returns empty array when no decisions directory', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    const result = logger.listDecisions('sprint-031');
    expect(result).toEqual([]);
  });

  it('returns empty array when no decisions for sprint', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-030', '030-001', makeEntries(1));
    const result = logger.listDecisions('sprint-031');
    expect(result).toEqual([]);
  });

  it('lists task IDs for a sprint', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(1));
    logger.log('sprint-031', '031-002', makeEntries(1));
    logger.log('sprint-030', '030-001', makeEntries(1));
    const result = logger.listDecisions('sprint-031');
    expect(result).toHaveLength(2);
    expect(result).toContain('031-001');
    expect(result).toContain('031-002');
  });

  it('skips corrupted files in listing', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(1));
    const dir = path.join(TEST_ROOT, '.tasks', 'decisions');
    fs.writeFileSync(path.join(dir, 'decision-031-bad.json'), 'BROKEN', 'utf-8');
    const result = logger.listDecisions('sprint-031');
    expect(result).toContain('031-001');
  });

  it('ignores non-decision files', () => {
    const logger = new DecisionLogger(TEST_ROOT);
    logger.log('sprint-031', '031-001', makeEntries(1));
    const dir = path.join(TEST_ROOT, '.tasks', 'decisions');
    fs.writeFileSync(path.join(dir, 'other-file.txt'), 'hello', 'utf-8');
    const result = logger.listDecisions('sprint-031');
    expect(result).toEqual(['031-001']);
  });
});
