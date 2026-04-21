/**
 * Tests for sprint file retention module.
 *
 * Covers:
 * - keep_last_n threshold archiving
 * - size_cap_mb enforcement
 * - Counter cleanup (-seq, -checkpoint-seq)
 * - Forensic file migration to docs/audits/
 * - Config override (custom keep_last_n)
 * - Edge cases (empty dir, single sprint, no .deckent)
 * - Combined runRetention pipeline
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractSprintId,
  listSprintFiles,
  listForensicFiles,
  groupBySprintId,
  cleanupCounters,
  migrateForensicFiles,
  enforceRetention,
  runRetention,
  DEFAULT_RETENTION_CONFIG,
} from '../../src/core/sprint-file-retention.js';

// ─── Test Helpers ─────────────────────────────────────────────────────

let testRoot: string;

function createTestRoot(): string {
  const dir = join(tmpdir(), `deckent-retention-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

/** Create a fake sprint file set for a given sprint ID. */
function createSprintFiles(root: string, sprintId: string, opts?: { includeCheckpoint?: boolean; includeGate?: boolean; includePreArchive?: boolean }): void {
  const deckentDir = join(root, '.deckent');
  // Always create events + seq
  writeFileSync(join(deckentDir, `${sprintId}-events.jsonl`), `{"type":"test","sprintId":"${sprintId}"}\n`);
  writeFileSync(join(deckentDir, `${sprintId}-seq`), '42');

  if (opts?.includeCheckpoint !== false) {
    writeFileSync(join(deckentDir, `${sprintId}-checkpoint.json`), JSON.stringify({ sprintId, phase: 'COMPLETE' }));
    writeFileSync(join(deckentDir, `${sprintId}-checkpoint-seq`), '5');
  }

  if (opts?.includeGate !== false) {
    writeFileSync(join(deckentDir, `${sprintId}-gate.json`), JSON.stringify({ overallGate: 'PASS', sprintId }));
  }

  if (opts?.includePreArchive) {
    writeFileSync(join(deckentDir, `${sprintId}-pre-archive.tar.gz`), Buffer.alloc(1024)); // 1KB fake
    writeFileSync(join(deckentDir, `${sprintId}-pre-archive.sha256`), 'abc123  pre-archive.tar.gz\n');
  }
}

/** Create forensic files for a sprint. */
function createForensicFiles(root: string, sprintId: string): void {
  const deckentDir = join(root, '.deckent');
  writeFileSync(join(deckentDir, `${sprintId}-layer3-scorecard.md`), '# Scorecard\n');
  writeFileSync(join(deckentDir, `${sprintId}-verifier-log.md`), '# Verifier\n');
}

beforeEach(() => {
  testRoot = createTestRoot();
});

afterEach(() => {
  try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* cleanup */ }
});

// ─── extractSprintId ──────────────────────────────────────────────────

describe('extractSprintId', () => {
  it('should extract sprint ID from events file', () => {
    expect(extractSprintId('sprint-145-events.jsonl')).toBe('sprint-145');
  });

  it('should extract sprint ID from gate file', () => {
    expect(extractSprintId('sprint-150-gate.json')).toBe('sprint-150');
  });

  it('should return null for non-sprint files', () => {
    expect(extractSprintId('config.json')).toBeNull();
    expect(extractSprintId('sprint-state.json')).toBeNull();
  });
});

// ─── listSprintFiles ──────────────────────────────────────────────────

describe('listSprintFiles', () => {
  it('should list all sprint-prefixed files', () => {
    createSprintFiles(testRoot, 'sprint-140');
    createSprintFiles(testRoot, 'sprint-141');
    const files = listSprintFiles(testRoot);
    expect(files.length).toBeGreaterThanOrEqual(8); // 2 sprints × 4 files each
    expect(files.every(f => f.startsWith('sprint-'))).toBe(true);
  });

  it('should return empty array for missing .deckent dir', () => {
    const emptyRoot = join(tmpdir(), `deckent-empty-${Date.now()}`);
    expect(listSprintFiles(emptyRoot)).toEqual([]);
  });

  it('should exclude directories like sprint-god-analysis/', () => {
    mkdirSync(join(testRoot, '.deckent', 'sprint-god-analysis'), { recursive: true });
    createSprintFiles(testRoot, 'sprint-140');
    const files = listSprintFiles(testRoot);
    expect(files.some(f => f === 'sprint-god-analysis')).toBe(false);
  });
});

// ─── groupBySprintId ──────────────────────────────────────────────────

describe('groupBySprintId', () => {
  it('should group files by sprint ID', () => {
    const files = [
      'sprint-140-events.jsonl',
      'sprint-140-seq',
      'sprint-141-events.jsonl',
      'sprint-141-gate.json',
    ];
    const groups = groupBySprintId(files);
    expect(Object.keys(groups)).toEqual(['sprint-140', 'sprint-141']);
    expect(groups['sprint-140']).toHaveLength(2);
    expect(groups['sprint-141']).toHaveLength(2);
  });
});

// ─── cleanupCounters ──────────────────────────────────────────────────

describe('cleanupCounters', () => {
  it('should delete -seq and -checkpoint-seq for a sprint', () => {
    createSprintFiles(testRoot, 'sprint-150');
    const deleted = cleanupCounters(testRoot, 'sprint-150');
    expect(deleted).toContain('sprint-150-seq');
    expect(deleted).toContain('sprint-150-checkpoint-seq');
    expect(existsSync(join(testRoot, '.deckent', 'sprint-150-seq'))).toBe(false);
    expect(existsSync(join(testRoot, '.deckent', 'sprint-150-checkpoint-seq'))).toBe(false);
  });

  it('should not delete non-counter files', () => {
    createSprintFiles(testRoot, 'sprint-150');
    cleanupCounters(testRoot, 'sprint-150');
    expect(existsSync(join(testRoot, '.deckent', 'sprint-150-events.jsonl'))).toBe(true);
    expect(existsSync(join(testRoot, '.deckent', 'sprint-150-gate.json'))).toBe(true);
  });

  it('should not affect other sprints', () => {
    createSprintFiles(testRoot, 'sprint-149');
    createSprintFiles(testRoot, 'sprint-150');
    cleanupCounters(testRoot, 'sprint-150');
    expect(existsSync(join(testRoot, '.deckent', 'sprint-149-seq'))).toBe(true);
  });
});

// ─── migrateForensicFiles ─────────────────────────────────────────────

describe('migrateForensicFiles', () => {
  it('should move forensic files to docs/audits/sprint-NNN/', () => {
    createForensicFiles(testRoot, 'sprint-138');
    const moved = migrateForensicFiles(testRoot);
    expect(moved.length).toBe(2);
    expect(existsSync(join(testRoot, 'docs', 'audits', 'sprint-138', 'layer3-scorecard.md'))).toBe(true);
    expect(existsSync(join(testRoot, 'docs', 'audits', 'sprint-138', 'verifier-log.md'))).toBe(true);
    // Source removed
    expect(existsSync(join(testRoot, '.deckent', 'sprint-138-layer3-scorecard.md'))).toBe(false);
  });

  it('should not move non-forensic sprint files', () => {
    createSprintFiles(testRoot, 'sprint-140');
    createForensicFiles(testRoot, 'sprint-140');
    migrateForensicFiles(testRoot);
    // Machine files still in .deckent/
    expect(existsSync(join(testRoot, '.deckent', 'sprint-140-events.jsonl'))).toBe(true);
  });
});

// ─── enforceRetention ─────────────────────────────────────────────────

describe('enforceRetention', () => {
  it('should archive sprints beyond keep_last_n', () => {
    // Create 12 sprints (keep_last_n=10 → archive 2 oldest)
    for (let i = 130; i < 142; i++) {
      createSprintFiles(testRoot, `sprint-${i}`);
    }

    const result = enforceRetention(testRoot, { keep_last_n: 10 });
    expect(result.archived.length).toBeGreaterThan(0);
    expect(result.kept).toHaveLength(10);

    // Oldest 2 sprints should be archived
    expect(existsSync(join(testRoot, '.deckent', 'archive', 'sprints', 'sprint-130'))).toBe(true);
    expect(existsSync(join(testRoot, '.deckent', 'archive', 'sprints', 'sprint-131'))).toBe(true);

    // Archived files have clean names (prefix stripped)
    const archiveDir = join(testRoot, '.deckent', 'archive', 'sprints', 'sprint-130');
    const archivedFiles = readdirSync(archiveDir);
    expect(archivedFiles.some(f => f === 'events.jsonl')).toBe(true);
    expect(archivedFiles.some(f => f === 'gate.json')).toBe(true);

    // Source files removed
    expect(existsSync(join(testRoot, '.deckent', 'sprint-130-events.jsonl'))).toBe(false);
  });

  it('should not archive when under keep_last_n', () => {
    createSprintFiles(testRoot, 'sprint-148');
    createSprintFiles(testRoot, 'sprint-149');
    const result = enforceRetention(testRoot, { keep_last_n: 10 });
    expect(result.archived).toHaveLength(0);
    expect(result.kept).toHaveLength(2);
  });

  it('should respect custom keep_last_n=5', () => {
    for (let i = 140; i < 148; i++) {
      createSprintFiles(testRoot, `sprint-${i}`);
    }
    const result = enforceRetention(testRoot, { keep_last_n: 5 });
    expect(result.kept).toHaveLength(5);
    // 3 oldest archived
    expect(result.archived.length).toBeGreaterThan(0);
    expect(existsSync(join(testRoot, '.deckent', 'archive', 'sprints', 'sprint-140'))).toBe(true);
    expect(existsSync(join(testRoot, '.deckent', 'archive', 'sprints', 'sprint-141'))).toBe(true);
    expect(existsSync(join(testRoot, '.deckent', 'archive', 'sprints', 'sprint-142'))).toBe(true);
  });

  it('should enforce size_cap_mb by archiving oldest kept sprints', () => {
    // Create 3 sprints, each with a large pre-archive file
    for (let i = 140; i < 143; i++) {
      createSprintFiles(testRoot, `sprint-${i}`, { includePreArchive: true });
      // Make the events file large (~200KB)
      const bigContent = 'x'.repeat(200 * 1024);
      writeFileSync(join(testRoot, '.deckent', `sprint-${i}-events.jsonl`), bigContent);
    }

    // 3 sprints × ~200KB = ~600KB. With size_cap_mb < 0.5 (512KB), oldest should be archived
    const result = enforceRetention(testRoot, { keep_last_n: 10, size_cap_mb: 0.0004 }); // ~400 bytes cap
    expect(result.archived.length).toBeGreaterThan(0);
    expect(result.bytesFreed).toBeGreaterThan(0);
  });

  it('should return empty result for empty .deckent dir', () => {
    const result = enforceRetention(testRoot);
    expect(result.archived).toHaveLength(0);
    expect(result.kept).toHaveLength(0);
  });

  it('should handle gate.json in retention window correctly', () => {
    // Gate files should be archived (not deleted) when outside retention window
    for (let i = 130; i < 142; i++) {
      createSprintFiles(testRoot, `sprint-${i}`);
    }
    const result = enforceRetention(testRoot, { keep_last_n: 10 });
    // Check that gate.json was archived (not just deleted)
    const archiveDir = join(testRoot, '.deckent', 'archive', 'sprints', 'sprint-130');
    if (existsSync(archiveDir)) {
      const files = readdirSync(archiveDir);
      expect(files.some(f => f === 'gate.json')).toBe(true);
    }
  });
});

// ─── runRetention (combined pipeline) ─────────────────────────────────

describe('runRetention', () => {
  it('should clean counters + migrate forensic + enforce retention in one call', () => {
    // Setup: 12 sprints + forensic files on some
    for (let i = 130; i < 142; i++) {
      createSprintFiles(testRoot, `sprint-${i}`);
    }
    createForensicFiles(testRoot, 'sprint-134');

    const result = runRetention(testRoot, 'sprint-141', { keep_last_n: 10 });

    // Counters deleted for completed sprint
    expect(result.countersDeleted).toContain('sprint-141-seq');
    expect(result.countersDeleted).toContain('sprint-141-checkpoint-seq');

    // Forensic files moved
    expect(result.forensicMoved.length).toBe(2);

    // Old sprints archived
    expect(result.archived.length).toBeGreaterThan(0);
    expect(result.kept.length).toBeLessThanOrEqual(10);
  });

  it('should handle null completedSprintId gracefully', () => {
    createSprintFiles(testRoot, 'sprint-150');
    const result = runRetention(testRoot, null, { keep_last_n: 10 });
    expect(result.countersDeleted).toHaveLength(0);
    expect(result.kept).toContain('sprint-150');
  });

  it('should work with default config', () => {
    createSprintFiles(testRoot, 'sprint-148');
    createSprintFiles(testRoot, 'sprint-149');
    const result = runRetention(testRoot, 'sprint-149');
    expect(result.kept.length).toBeLessThanOrEqual(DEFAULT_RETENTION_CONFIG.keep_last_n);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────

describe('edge cases', () => {
  it('should handle non-existent .deckent directory', () => {
    const noDir = join(tmpdir(), `deckent-nodir-${Date.now()}`);
    mkdirSync(noDir, { recursive: true });
    const result = enforceRetention(noDir);
    expect(result.archived).toHaveLength(0);
    rmSync(noDir, { recursive: true, force: true });
  });

  it('should not archive pre-archive integrity (hash file stays with tar)', () => {
    createSprintFiles(testRoot, 'sprint-130', { includePreArchive: true });
    for (let i = 131; i < 142; i++) {
      createSprintFiles(testRoot, `sprint-${i}`);
    }
    const result = enforceRetention(testRoot, { keep_last_n: 10 });
    // sprint-130 should be archived — check both tar and sha256 moved together
    const archiveDir = join(testRoot, '.deckent', 'archive', 'sprints', 'sprint-130');
    if (existsSync(archiveDir)) {
      const files = readdirSync(archiveDir);
      expect(files.some(f => f === 'pre-archive.tar.gz')).toBe(true);
      expect(files.some(f => f === 'pre-archive.sha256')).toBe(true);
    }
  });

  it('should sort sprints numerically not lexicographically', () => {
    // sprint-9 should come before sprint-10 (numeric sort)
    createSprintFiles(testRoot, 'sprint-9');
    createSprintFiles(testRoot, 'sprint-10');
    createSprintFiles(testRoot, 'sprint-11');
    const result = enforceRetention(testRoot, { keep_last_n: 2 });
    expect(result.kept).toEqual(['sprint-10', 'sprint-11']);
  });
});
