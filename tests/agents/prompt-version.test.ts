import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptVersionManager } from '../../src/agents/prompt-version.js';
import type { PromptVersion } from '../../src/agents/prompt-version.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function setup(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-ver-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('PromptVersionManager', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── createVersion ─────────────────────────────────────────────

  describe('createVersion', () => {
    it('creates version 1 as first version', () => {
      const mgr = new PromptVersionManager(tmpDir);
      const v = mgr.createVersion('agent-1', 'prompt content', 'initial version');
      expect(v.version).toBe(1);
      expect(v.content).toBe('prompt content');
      expect(v.reason).toBe('initial version');
      expect(v.createdAt).toBeTruthy();
      expect(v.stats.uses).toBe(0);
      expect(v.stats.successRate).toBe(0);
    });

    it('increments version number', () => {
      const mgr = new PromptVersionManager(tmpDir);
      const v1 = mgr.createVersion('agent-1', 'v1 content', 'first');
      const v2 = mgr.createVersion('agent-1', 'v2 content', 'second');
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
    });

    it('persists version file to disk', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'content', 'reason');
      const versionPath = path.join(tmpDir, '.deckent', 'agents', 'agent-1', 'versions', 'v1.json');
      expect(fs.existsSync(versionPath)).toBe(true);
    });

    it('writes PROMPT.md file', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'my prompt', 'reason');
      const promptPath = path.join(tmpDir, '.deckent', 'agents', 'agent-1', 'PROMPT.md');
      expect(fs.existsSync(promptPath)).toBe(true);
      expect(fs.readFileSync(promptPath, 'utf-8')).toBe('my prompt');
    });

    it('sets current version', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'content', 'first');
      mgr.createVersion('agent-1', 'content v2', 'second');
      const current = mgr.getCurrentVersion('agent-1');
      expect(current).not.toBeNull();
      expect(current!.version).toBe(2);
    });

    it('prunes oldest when exceeding max 10 versions', () => {
      const mgr = new PromptVersionManager(tmpDir);
      for (let i = 0; i < 12; i++) {
        mgr.createVersion('agent-1', `content ${i}`, `version ${i}`);
      }
      const versions = mgr.listVersions('agent-1');
      expect(versions.length).toBe(10);
      // Version 1 and 2 should be pruned
      expect(versions[0]!.version).toBe(3);
    });
  });

  // ─── getVersion ────────────────────────────────────────────────

  describe('getVersion', () => {
    it('returns null for non-existent version', () => {
      const mgr = new PromptVersionManager(tmpDir);
      expect(mgr.getVersion('agent-1', 99)).toBeNull();
    });

    it('returns version by number', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1 content', 'first');
      const v = mgr.getVersion('agent-1', 1);
      expect(v).not.toBeNull();
      expect(v!.content).toBe('v1 content');
    });

    it('returns correct version among multiple', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.createVersion('agent-1', 'v2', 'second');
      mgr.createVersion('agent-1', 'v3', 'third');
      const v2 = mgr.getVersion('agent-1', 2);
      expect(v2!.content).toBe('v2');
    });
  });

  // ─── getCurrentVersion ─────────────────────────────────────────

  describe('getCurrentVersion', () => {
    it('returns null when no versions exist', () => {
      const mgr = new PromptVersionManager(tmpDir);
      expect(mgr.getCurrentVersion('agent-1')).toBeNull();
    });

    it('returns the most recent version after create', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.createVersion('agent-1', 'v2', 'second');
      const current = mgr.getCurrentVersion('agent-1');
      expect(current!.version).toBe(2);
    });

    it('returns activated version after activateVersion', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.createVersion('agent-1', 'v2', 'second');
      mgr.activateVersion('agent-1', 1);
      const current = mgr.getCurrentVersion('agent-1');
      expect(current!.version).toBe(1);
    });
  });

  // ─── listVersions ─────────────────────────────────────────────

  describe('listVersions', () => {
    it('returns empty array when no versions exist', () => {
      const mgr = new PromptVersionManager(tmpDir);
      expect(mgr.listVersions('agent-1')).toEqual([]);
    });

    it('returns all versions sorted by number', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.createVersion('agent-1', 'v2', 'second');
      mgr.createVersion('agent-1', 'v3', 'third');
      const versions = mgr.listVersions('agent-1');
      expect(versions.length).toBe(3);
      expect(versions[0]!.version).toBe(1);
      expect(versions[1]!.version).toBe(2);
      expect(versions[2]!.version).toBe(3);
    });

    it('returns versions for correct agent only', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.createVersion('agent-2', 'v1', 'first');
      mgr.createVersion('agent-2', 'v2', 'second');
      expect(mgr.listVersions('agent-1').length).toBe(1);
      expect(mgr.listVersions('agent-2').length).toBe(2);
    });
  });

  // ─── activateVersion ──────────────────────────────────────────

  describe('activateVersion', () => {
    it('returns false for non-existent version', () => {
      const mgr = new PromptVersionManager(tmpDir);
      expect(mgr.activateVersion('agent-1', 99)).toBe(false);
    });

    it('activates version and writes PROMPT.md', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1 prompt', 'first');
      mgr.createVersion('agent-1', 'v2 prompt', 'second');
      mgr.activateVersion('agent-1', 1);

      const promptPath = path.join(tmpDir, '.deckent', 'agents', 'agent-1', 'PROMPT.md');
      expect(fs.readFileSync(promptPath, 'utf-8')).toBe('v1 prompt');
    });

    it('returns true on success', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      expect(mgr.activateVersion('agent-1', 1)).toBe(true);
    });
  });

  // ─── updateVersionStats ───────────────────────────────────────

  describe('updateVersionStats', () => {
    it('increments uses count', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.updateVersionStats('agent-1', 1, 'DONE');
      const v = mgr.getVersion('agent-1', 1);
      expect(v!.stats.uses).toBe(1);
    });

    it('calculates successRate correctly for DONE', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.updateVersionStats('agent-1', 1, 'DONE');
      mgr.updateVersionStats('agent-1', 1, 'DONE');
      const v = mgr.getVersion('agent-1', 1);
      expect(v!.stats.successRate).toBe(1);
    });

    it('calculates successRate correctly for mixed evaluations', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.updateVersionStats('agent-1', 1, 'DONE');
      mgr.updateVersionStats('agent-1', 1, 'NO_GO');
      const v = mgr.getVersion('agent-1', 1);
      expect(v!.stats.successRate).toBe(0.5);
    });

    it('counts GO_WITH_TECH_DEBT as success', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.updateVersionStats('agent-1', 1, 'GO_WITH_TECH_DEBT');
      const v = mgr.getVersion('agent-1', 1);
      expect(v!.stats.successRate).toBe(1);
    });

    it('is no-op for non-existent version', () => {
      const mgr = new PromptVersionManager(tmpDir);
      // Should not throw
      mgr.updateVersionStats('agent-1', 99, 'DONE');
    });
  });

  describe('recordCurrentVersionUse (F5 wire)', () => {
    it('records a use against the agent CURRENT version', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.createVersion('agent-1', 'v2', 'second'); // current = v2
      mgr.recordCurrentVersionUse('agent-1', 'DONE');
      expect(mgr.getVersion('agent-1', 2)!.stats.uses).toBe(1);
      expect(mgr.getVersion('agent-1', 2)!.stats.successRate).toBe(1);
      // v1 (not current) untouched
      expect(mgr.getVersion('agent-1', 1)!.stats.uses).toBe(0);
    });

    it('reflects the evaluation in successRate (NO_GO → 0)', () => {
      const mgr = new PromptVersionManager(tmpDir);
      mgr.createVersion('agent-1', 'v1', 'first');
      mgr.recordCurrentVersionUse('agent-1', 'NO_GO');
      const v = mgr.getVersion('agent-1', 1)!;
      expect(v.stats.uses).toBe(1);
      expect(v.stats.successRate).toBe(0);
    });

    it('is a no-op when the agent has no versioned prompt', () => {
      const mgr = new PromptVersionManager(tmpDir);
      // Should not throw and must not create any version files.
      mgr.recordCurrentVersionUse('never-versioned', 'DONE');
      expect(mgr.getCurrentVersion('never-versioned')).toBeNull();
    });
  });
});
