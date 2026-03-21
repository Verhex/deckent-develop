import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptRollback } from '../../src/agents/prompt-rollback.js';
import { PromptVersionManager } from '../../src/agents/prompt-version.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function setup(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-rb-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('PromptRollback', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── shouldRollback ────────────────────────────────────────────

  describe('shouldRollback', () => {
    it('returns false when uses < 3', () => {
      const rb = new PromptRollback(tmpDir);
      expect(rb.shouldRollback('agent-1', { uses: 2, successRate: 0 })).toBe(false);
    });

    it('returns false when uses is 0', () => {
      const rb = new PromptRollback(tmpDir);
      expect(rb.shouldRollback('agent-1', { uses: 0, successRate: 0 })).toBe(false);
    });

    it('returns true when successRate < 50% and uses >= 3', () => {
      const rb = new PromptRollback(tmpDir);
      expect(rb.shouldRollback('agent-1', { uses: 3, successRate: 0.4 })).toBe(true);
    });

    it('returns false when successRate >= 50%', () => {
      const rb = new PromptRollback(tmpDir);
      expect(rb.shouldRollback('agent-1', { uses: 5, successRate: 0.5 })).toBe(false);
    });

    it('returns true when successRate is 0 and uses is 3', () => {
      const rb = new PromptRollback(tmpDir);
      expect(rb.shouldRollback('agent-1', { uses: 3, successRate: 0 })).toBe(true);
    });

    it('returns false when successRate is exactly 50%', () => {
      const rb = new PromptRollback(tmpDir);
      expect(rb.shouldRollback('agent-1', { uses: 4, successRate: 0.5 })).toBe(false);
    });
  });

  // ─── canRollback ──────────────────────────────────────────────

  describe('canRollback', () => {
    it('returns false when no versions exist', () => {
      const rb = new PromptRollback(tmpDir);
      expect(rb.canRollback('agent-1')).toBe(false);
    });

    it('returns false with only 1 version', () => {
      const rb = new PromptRollback(tmpDir);
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      expect(rb.canRollback('agent-1')).toBe(false);
    });

    it('returns true with 2+ versions', () => {
      const rb = new PromptRollback(tmpDir);
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.createVersion('agent-1', 'v2', 'second');
      expect(rb.canRollback('agent-1')).toBe(true);
    });
  });

  // ─── rollbackPrompt ───────────────────────────────────────────

  describe('rollbackPrompt', () => {
    it('returns null when canRollback is false', () => {
      const rb = new PromptRollback(tmpDir);
      expect(rb.rollbackPrompt('agent-1')).toBeNull();
    });

    it('rolls back to best historical version', () => {
      const rb = new PromptRollback(tmpDir);
      const mgr = new PromptVersionManager(tmpDir);

      mgr.createVersion('agent-1', 'v1 prompt', 'first');
      // Simulate v1 had good stats
      mgr.updateVersionStats('agent-1', 1, 'DONE');
      mgr.updateVersionStats('agent-1', 1, 'DONE');

      mgr.createVersion('agent-1', 'v2 prompt', 'second');
      // v2 is current but bad stats
      mgr.updateVersionStats('agent-1', 2, 'NO_GO');
      mgr.updateVersionStats('agent-1', 2, 'NO_GO');

      const result = rb.rollbackPrompt('agent-1');
      expect(result).not.toBeNull();
      expect(result!.rolledBackTo).toBe(1);
      expect(result!.reason).toContain('Rolled back to version 1');
    });

    it('activates the rolled-back version', () => {
      const rb = new PromptRollback(tmpDir);
      const mgr = new PromptVersionManager(tmpDir);

      mgr.createVersion('agent-1', 'good prompt', 'first');
      mgr.updateVersionStats('agent-1', 1, 'DONE');

      mgr.createVersion('agent-1', 'bad prompt', 'second');

      rb.rollbackPrompt('agent-1');

      const promptPath = path.join(tmpDir, '.deckent', 'agents', 'agent-1', 'PROMPT.md');
      expect(fs.readFileSync(promptPath, 'utf-8')).toBe('good prompt');
    });

    it('logs the rollback event', () => {
      const rb = new PromptRollback(tmpDir);
      const mgr = new PromptVersionManager(tmpDir);

      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.createVersion('agent-1', 'v2', 'second');

      rb.rollbackPrompt('agent-1');

      const log = rb.getRollbackLog('agent-1');
      expect(log.length).toBe(1);
      expect(log[0]!.fromVersion).toBe(2);
      expect(log[0]!.toVersion).toBe(1);
    });
  });

  // ─── logRollback ──────────────────────────────────────────────

  describe('logRollback', () => {
    it('writes rollback log to disk', () => {
      const rb = new PromptRollback(tmpDir);
      rb.logRollback('agent-1', 2, 1, 'Performance issue');
      const logPath = path.join(tmpDir, '.deckent', 'agents', 'agent-1', 'rollback-log.json');
      expect(fs.existsSync(logPath)).toBe(true);
    });

    it('appends to existing log', () => {
      const rb = new PromptRollback(tmpDir);
      rb.logRollback('agent-1', 2, 1, 'First rollback');
      rb.logRollback('agent-1', 3, 1, 'Second rollback');
      const log = rb.getRollbackLog('agent-1');
      expect(log.length).toBe(2);
      expect(log[0]!.reason).toBe('First rollback');
      expect(log[1]!.reason).toBe('Second rollback');
    });

    it('includes timestamp in log entry', () => {
      const rb = new PromptRollback(tmpDir);
      rb.logRollback('agent-1', 2, 1, 'test');
      const log = rb.getRollbackLog('agent-1');
      expect(log[0]!.timestamp).toBeTruthy();
    });
  });

  // ─── getRollbackLog ───────────────────────────────────────────

  describe('getRollbackLog', () => {
    it('returns empty array when no log exists', () => {
      const rb = new PromptRollback(tmpDir);
      expect(rb.getRollbackLog('agent-1')).toEqual([]);
    });

    it('returns all log entries', () => {
      const rb = new PromptRollback(tmpDir);
      rb.logRollback('agent-1', 2, 1, 'a');
      rb.logRollback('agent-1', 3, 2, 'b');
      rb.logRollback('agent-1', 4, 1, 'c');
      const log = rb.getRollbackLog('agent-1');
      expect(log.length).toBe(3);
    });
  });
});
