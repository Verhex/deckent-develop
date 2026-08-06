import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isDashboardState,
  ensureDashboard,
  readDashboardSafe,
  validateDashboardSchema,
  DASHBOARD_INITIAL_STATE,
} from '../../src/monitor/dashboard-manager.js';

// Canonical valid dashboard state for tests
function makeValidDashboard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sprint: { id: 'sprint-100', number: 100, phase: 'EXECUTE', status: 'ACTIVE' },
    agents: [{ id: 'w-100-001', status: 'EXECUTING' }],
    progress: { done: 3, active: 1, blocked: 0, total: 10 },
    alerts: [],
    updatedAt: '2026-04-15T06:00:00.000Z',
    ...overrides,
  };
}

describe('dashboard-manager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'dashboard-mgr-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── isDashboardState ───────────────────────────────────────────────

  describe('isDashboardState', () => {
    it('should return true for a valid dashboard state', () => {
      expect(isDashboardState(makeValidDashboard())).toBe(true);
    });

    it('should return false for null', () => {
      expect(isDashboardState(null)).toBe(false);
    });

    it('should return false for a string', () => {
      expect(isDashboardState('not an object')).toBe(false);
    });

    it('should return false when sprint is missing', () => {
      const data = makeValidDashboard();
      delete data['sprint'];
      expect(isDashboardState(data)).toBe(false);
    });

    it('should return false when sprint.id is missing', () => {
      const data = makeValidDashboard({ sprint: { number: 1 } });
      expect(isDashboardState(data)).toBe(false);
    });

    it('should return false when agents is not an array', () => {
      const data = makeValidDashboard({ agents: 'not-array' });
      expect(isDashboardState(data)).toBe(false);
    });

    it('should return false when progress is missing', () => {
      const data = makeValidDashboard();
      delete data['progress'];
      expect(isDashboardState(data)).toBe(false);
    });

    it('should return false when progress.done is not a number', () => {
      const data = makeValidDashboard({ progress: { done: 'three', total: 10 } });
      expect(isDashboardState(data)).toBe(false);
    });

    it('should return false when progress.total is not a number', () => {
      const data = makeValidDashboard({ progress: { done: 3, total: 'ten' } });
      expect(isDashboardState(data)).toBe(false);
    });

    it('should return false when alerts is not an array', () => {
      const data = makeValidDashboard({ alerts: {} });
      expect(isDashboardState(data)).toBe(false);
    });

    it('should return false when updatedAt is missing', () => {
      const data = makeValidDashboard();
      delete data['updatedAt'];
      expect(isDashboardState(data)).toBe(false);
    });

    it('should accept DASHBOARD_INITIAL_STATE constant as valid', () => {
      expect(isDashboardState(DASHBOARD_INITIAL_STATE)).toBe(true);
    });
  });

  // ─── validateDashboardSchema ────────────────────────────────────────

  describe('validateDashboardSchema', () => {
    it('should return null for valid data', () => {
      expect(validateDashboardSchema(makeValidDashboard() as Record<string, unknown>)).toBeNull();
    });

    it('should report missing sprint', () => {
      const result = validateDashboardSchema({ agents: [], progress: { done: 0, total: 0 }, alerts: [], updatedAt: 'x' });
      expect(result).toContain('sprint');
    });

    it('should report missing progress.done', () => {
      const result = validateDashboardSchema({
        sprint: { id: 's' }, agents: [], progress: { total: 0 }, alerts: [], updatedAt: 'x',
      });
      expect(result).toContain('progress.done');
    });

    it('should report missing updatedAt', () => {
      const result = validateDashboardSchema({
        sprint: { id: 's' }, agents: [], progress: { done: 0, total: 0 }, alerts: [],
      });
      expect(result).toContain('updatedAt');
    });
  });

  // ─── ensureDashboard ────────────────────────────────────────────────

  describe('ensureDashboard', () => {
    it('should create .dashboard when file does not exist', () => {
      const dashPath = join(tempDir, '.dashboard');
      expect(existsSync(dashPath)).toBe(false);

      const result = ensureDashboard(tempDir);
      expect(result).toBe(true);
      expect(existsSync(dashPath)).toBe(true);

      const content = JSON.parse(readFileSync(dashPath, 'utf-8'));
      expect(isDashboardState(content)).toBe(true);
    });

    it('should not touch valid .dashboard file', () => {
      const dashPath = join(tempDir, '.dashboard');
      const validState = makeValidDashboard();
      writeFileSync(dashPath, JSON.stringify(validState, null, 2), 'utf-8');

      const result = ensureDashboard(tempDir);
      expect(result).toBe(false);

      // File content should be unchanged
      const content = JSON.parse(readFileSync(dashPath, 'utf-8'));
      expect(content.sprint.id).toBe('sprint-100');
    });

    it('should repair corrupt JSON in .dashboard', () => {
      const dashPath = join(tempDir, '.dashboard');
      writeFileSync(dashPath, '{invalid json!!!', 'utf-8');

      const result = ensureDashboard(tempDir);
      expect(result).toBe(true);

      const content = JSON.parse(readFileSync(dashPath, 'utf-8'));
      expect(isDashboardState(content)).toBe(true);
    });

    it('should repair valid JSON with wrong schema', () => {
      const dashPath = join(tempDir, '.dashboard');
      writeFileSync(dashPath, JSON.stringify({ foo: 'bar' }), 'utf-8');

      const result = ensureDashboard(tempDir);
      expect(result).toBe(true);

      const content = JSON.parse(readFileSync(dashPath, 'utf-8'));
      expect(isDashboardState(content)).toBe(true);
    });
  });

  // ─── readDashboardSafe ──────────────────────────────────────────────

  describe('readDashboardSafe', () => {
    it('should return valid=false when file does not exist', () => {
      const result = readDashboardSafe(tempDir);
      expect(result.valid).toBe(false);
      expect(result.repaired).toBe(false);
      expect(result.error).toContain('does not exist');
      expect(isDashboardState(result.state)).toBe(true);
    });

    it('should return valid=true for a correctly shaped file', () => {
      const dashPath = join(tempDir, '.dashboard');
      writeFileSync(dashPath, JSON.stringify(makeValidDashboard(), null, 2), 'utf-8');

      const result = readDashboardSafe(tempDir);
      expect(result.valid).toBe(true);
      expect(result.repaired).toBe(false);
      expect(result.error).toBeUndefined();
      expect(result.state.sprint.id).toBe('sprint-100');
    });

    it('should auto-repair and report corrupt JSON', () => {
      const dashPath = join(tempDir, '.dashboard');
      writeFileSync(dashPath, 'totally{broken}json[', 'utf-8');

      const result = readDashboardSafe(tempDir);
      expect(result.valid).toBe(false);
      expect(result.repaired).toBe(true);
      expect(result.error).toContain('JSON parse error');
      expect(isDashboardState(result.state)).toBe(true);

      // File on disk should now be repaired
      const repaired = JSON.parse(readFileSync(dashPath, 'utf-8'));
      expect(isDashboardState(repaired)).toBe(true);
    });

    it('should merge defaults for partial but parseable JSON objects', () => {
      const dashPath = join(tempDir, '.dashboard');
      // Valid JSON object with only some fields — should merge with defaults
      writeFileSync(dashPath, JSON.stringify({ sprint: { id: 'sprint-50' }, agents: [] }), 'utf-8');

      const result = readDashboardSafe(tempDir);
      expect(result.valid).toBe(true);
      expect(result.repaired).toBe(false);
      expect(result.state.sprint.id).toBe('sprint-50');
      // Merged defaults
      expect(result.state.progress.done).toBe(0);
      expect(result.state.progress.total).toBe(0);
      expect(Array.isArray(result.state.alerts)).toBe(true);
      expect(typeof result.state.updatedAt).toBe('string');
    });

    it('should handle empty file gracefully (corrupt JSON)', () => {
      const dashPath = join(tempDir, '.dashboard');
      writeFileSync(dashPath, '', 'utf-8');

      const result = readDashboardSafe(tempDir);
      expect(result.valid).toBe(false);
      expect(result.repaired).toBe(true);
      expect(result.error).toContain('JSON parse error');
    });

    it('should handle truncated JSON (partial write) gracefully', () => {
      const dashPath = join(tempDir, '.dashboard');
      writeFileSync(dashPath, '{"sprint":{"id":"sprint-100","number":100}', 'utf-8');

      const result = readDashboardSafe(tempDir);
      expect(result.valid).toBe(false);
      expect(result.repaired).toBe(true);
      expect(result.error).toContain('JSON parse error');
    });

    it('should treat non-object JSON (array) as invalid', () => {
      const dashPath = join(tempDir, '.dashboard');
      writeFileSync(dashPath, '[1, 2, 3]', 'utf-8');

      const result = readDashboardSafe(tempDir);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not an object');
    });

    it('should preserve extra fields from dashboard file', () => {
      const dashPath = join(tempDir, '.dashboard');
      const data = { ...makeValidDashboard(), customField: 'preserved', violations: 5 };
      writeFileSync(dashPath, JSON.stringify(data), 'utf-8');

      const result = readDashboardSafe(tempDir);
      expect(result.valid).toBe(true);
      const state = result.state as unknown as Record<string, unknown>;
      expect(state['customField']).toBe('preserved');
      expect(state['violations']).toBe(5);
    });
  });
});

// ═══ 485a — terminal-receipt overlay (RECOVERY-BORN-485-TERMINAL-PUBLICATION) ═
describe('readDashboardSafe — terminal receipt overlay (485a)', () => {
  function seedDashboard(root: string, sprintId: string, status: string): void {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, '.dashboard'), JSON.stringify({
      sprint: { id: sprintId, number: 1, phase: 'EXECUTE', status },
      agents: [], progress: { done: 2, active: 3, blocked: 0, total: 4 },
      alerts: [], updatedAt: new Date().toISOString(),
    }));
  }
  function seedReceipt(root: string, sprintId: string, outcome: string): void {
    const dir = join(root, '.deckent', 'recently-works');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sprintId}-terminal-receipt.json`), JSON.stringify({
      receipt: {
        version: 1, sprintId, runId: 'run-1', coordinatorGeneration: 1,
        terminalOutcome: outcome, logicalSettlementDigest: 'd'.repeat(64),
        priorAuthorityVersion: 0, authorityVersion: 1,
      },
    }));
  }

  it('pins COMPLETE even when the raw snapshot still says ACTIVE (no regression)', () => {
    const root = mkdtempSync(join(tmpdir(), 'dash-termpub-'));
    try {
      seedDashboard(root, 'sprint-880', 'ACTIVE');
      seedReceipt(root, 'sprint-880', 'COMPLETE');
      const result = readDashboardSafe(root);
      expect(result.valid).toBe(true);
      expect(result.state.sprint.status).toBe('COMPLETE');
      expect(result.state.sprint.phase).toBe('COMPLETE');
      // progress cannot exceed N/N and nothing stays "active" after terminal
      expect(result.state.progress.done).toBeLessThanOrEqual(result.state.progress.total);
      expect(result.state.progress.active).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('projects ABORTED outcomes and leaves progress untouched', () => {
    const root = mkdtempSync(join(tmpdir(), 'dash-termpub-abort-'));
    try {
      seedDashboard(root, 'sprint-881', 'ACTIVE');
      seedReceipt(root, 'sprint-881', 'ABORTED');
      const result = readDashboardSafe(root);
      expect(result.state.sprint.status).toBe('ABORTED');
      expect(result.state.progress.active).toBe(3);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('fails soft on a malformed receipt — raw projection survives', () => {
    const root = mkdtempSync(join(tmpdir(), 'dash-termpub-bad-'));
    try {
      seedDashboard(root, 'sprint-882', 'ACTIVE');
      const dir = join(root, '.deckent', 'recently-works');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'sprint-882-terminal-receipt.json'), '{ not json');
      const result = readDashboardSafe(root);
      expect(result.valid).toBe(true);
      expect(result.state.sprint.status).toBe('ACTIVE');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('ignores a receipt belonging to a different sprint (mismatch is fail-soft)', () => {
    const root = mkdtempSync(join(tmpdir(), 'dash-termpub-mismatch-'));
    try {
      seedDashboard(root, 'sprint-883', 'ACTIVE');
      seedReceipt(root, 'sprint-883', 'COMPLETE');
      // rewrite the receipt body with a foreign sprintId
      const p2 = join(root, '.deckent', 'recently-works', 'sprint-883-terminal-receipt.json');
      const parsed = JSON.parse(readFileSync(p2, 'utf-8')) as { receipt: Record<string, unknown> };
      parsed.receipt['sprintId'] = 'sprint-999';
      writeFileSync(p2, JSON.stringify(parsed));
      const result = readDashboardSafe(root);
      expect(result.state.sprint.status).toBe('ACTIVE');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
