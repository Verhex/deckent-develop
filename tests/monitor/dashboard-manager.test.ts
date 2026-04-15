import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
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
