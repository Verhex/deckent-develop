/**
 * Sprint File Retention Tests — Sprint 150 T-150-035
 *
 * Covers:
 *  1. keep_last_n retention trigger
 *  2. Archive path correctness
 *  3. Size cap enforcement
 *  4. Forensic .md migration to the canonical sprint archive
 *  5. Counter (-seq, -checkpoint-seq) cleanup
 *  6. runRetention combined pipeline
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync,
} from 'node:fs';
import {
  enforceRetention,
  cleanupCounters,
  migrateForensicFiles,
  runRetention,
  listSprintFiles,
  extractSprintId,
  groupBySprintId,
  DEFAULT_RETENTION_CONFIG,
} from '../../src/core/sprint-file-retention.js';
import {
  reconcileSprintArchive,
  verifySprintArchive,
} from '../../src/core/sprint-archive.js';

// ─── Helpers ────────────────────────────────────────────────────────

function createTmpProject(suffix: string): string {
  const dir = join(tmpdir(), `deckent-retention-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(join(dir, '.deckent', 'recently-works'), { recursive: true });
  return dir;
}

function cleanupTmpProject(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function seedSprintFile(root: string, filename: string, content = '{}'): void {
  writeFileSync(join(root, '.deckent', 'recently-works', filename), content);
}

// ─── Extractors ─────────────────────────────────────────────────────

describe('extractSprintId', () => {
  it('extracts sprint ID from sprint-NNN-events.jsonl', () => {
    expect(extractSprintId('sprint-145-events.jsonl')).toBe('sprint-145');
  });

  it('extracts sprint ID from multi-hyphen family', () => {
    expect(extractSprintId('sprint-150-checkpoint-seq')).toBe('sprint-150');
  });

  it('returns null for non-sprint files', () => {
    expect(extractSprintId('config.json')).toBeNull();
    expect(extractSprintId('metrics.jsonl')).toBeNull();
  });
});

// ─── File Discovery ─────────────────────────────────────────────────

describe('listSprintFiles + groupBySprintId', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('discover'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('groups sprint files by sprint ID', () => {
    seedSprintFile(tmpDir, 'sprint-100-events.jsonl');
    seedSprintFile(tmpDir, 'sprint-100-gate.json');
    seedSprintFile(tmpDir, 'sprint-101-events.jsonl');
    seedSprintFile(tmpDir, 'config.json');  // not sprint-prefixed

    const files = listSprintFiles(tmpDir);
    const grouped = groupBySprintId(files);

    expect(Object.keys(grouped).sort()).toEqual(['sprint-100', 'sprint-101']);
    expect(grouped['sprint-100']).toHaveLength(2);
    expect(grouped['sprint-101']).toHaveLength(1);
  });

  it('does not let legacy epoch job ids occupy the ordinal sprint window', () => {
    seedSprintFile(tmpDir, 'sprint-623-events.jsonl');
    seedSprintFile(tmpDir, 'sprint-624-events.jsonl');
    seedSprintFile(tmpDir, 'sprint-1780659451558-events.jsonl');

    const grouped = groupBySprintId(listSprintFiles(tmpDir));

    expect(Object.keys(grouped).sort()).toEqual(['sprint-623', 'sprint-624']);
  });

  it('returns empty when .deckent/ absent', () => {
    const emptyDir = join(tmpdir(), `deckent-empty-${Date.now()}`);
    expect(listSprintFiles(emptyDir)).toEqual([]);
  });
});

// ─── keep_last_n Retention Trigger ──────────────────────────────────

describe('enforceRetention — keep_last_n', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('keepn'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('archives oldest sprints when count exceeds keep_last_n', () => {
    // Seed 4 sprints with keep_last_n=3 → 1 sprint archived
    for (const n of [100, 101, 102, 103]) {
      seedSprintFile(tmpDir, `sprint-${n}-events.jsonl`, `events-${n}`);
      seedSprintFile(tmpDir, `sprint-${n}-gate.json`, `{"gate":${n}}`);
    }

    const result = enforceRetention(tmpDir, { keep_last_n: 3, size_cap_mb: 500, archive_path: '.deckent/archive/sprints/' });

    // Oldest (sprint-100) should be archived
    expect(result.kept.sort()).toEqual(['sprint-101', 'sprint-102', 'sprint-103']);
    expect(result.archived.length).toBe(2);  // events.jsonl + gate.json for sprint-100
    expect(result.archived.every(p => p.includes('sprint-100'))).toBe(true);

    // Source files removed
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-100-events.jsonl'))).toBe(false);
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-101-events.jsonl'))).toBe(true);

    // Archive location correct
    expect(existsSync(join(tmpDir, '.deckent', 'archive', 'sprints', 'sprint-100'))).toBe(true);
  });

  it('no-op when sprint count ≤ keep_last_n', () => {
    seedSprintFile(tmpDir, 'sprint-100-events.jsonl');
    seedSprintFile(tmpDir, 'sprint-101-events.jsonl');

    const result = enforceRetention(tmpDir, { keep_last_n: 10, size_cap_mb: 500, archive_path: '.deckent/archive/sprints/' });

    expect(result.archived).toEqual([]);
    expect(result.kept.sort()).toEqual(['sprint-100', 'sprint-101']);
  });

  it('preserves the canonical sprint-prefixed run filename', () => {
    for (const n of [100, 101]) {
      seedSprintFile(tmpDir, `sprint-${n}-events.jsonl`);
    }

    enforceRetention(tmpDir, { keep_last_n: 1, size_cap_mb: 500, archive_path: '.deckent/archive/sprints/' });

    const archiveDir = join(tmpDir, '.deckent', 'archive', 'sprints', 'sprint-100');
    expect(readdirSync(archiveDir)).toContain('sprint-100-events.jsonl');
    expect(verifySprintArchive(tmpDir, 'sprint-100').ok).toBe(true);
  });

  it('refreshes a pre-existing historical manifest after retention publishes new evidence', () => {
    const archiveDir = join(tmpDir, '.deckent', 'archive', 'sprints', 'sprint-100');
    mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, 'job.json'), '{"prior":true}');
    reconcileSprintArchive(tmpDir, 'sprint-100', { apply: true, indexMemory: false });
    expect(verifySprintArchive(tmpDir, 'sprint-100').ok).toBe(true);

    seedSprintFile(tmpDir, 'sprint-100-events.jsonl', '{"late":true}');
    seedSprintFile(tmpDir, 'sprint-101-events.jsonl', '{"current":true}');

    const result = enforceRetention(tmpDir, {
      keep_last_n: 1,
      size_cap_mb: 500,
      archive_path: '.deckent/archive/sprints/',
    });

    expect(result.reconciledSprintIds).toEqual(['sprint-100']);
    expect(verifySprintArchive(tmpDir, 'sprint-100')).toMatchObject({
      ok: true,
      missing: [],
      mismatched: [],
      untracked: [],
      manifestDigestValid: true,
    });
  });
});

// ─── Size Cap Enforcement ───────────────────────────────────────────

describe('enforceRetention — size_cap_mb', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('sizecap'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('archives oldest sprints when total size exceeds cap', () => {
    // Seed 3 sprints each 500KB → total 1.5MB, cap 1MB → oldest archived
    const bigContent = 'x'.repeat(500 * 1024);  // 500KB
    for (const n of [100, 101, 102]) {
      seedSprintFile(tmpDir, `sprint-${n}-events.jsonl`, bigContent);
    }

    const result = enforceRetention(tmpDir, { keep_last_n: 10, size_cap_mb: 1, archive_path: '.deckent/archive/sprints/' });

    // At least one sprint archived due to size cap
    expect(result.archived.length).toBeGreaterThan(0);
    // Oldest (sprint-100) archived first
    expect(result.archived[0]).toContain('sprint-100');
  });
});

// ─── Counter Cleanup ────────────────────────────────────────────────

describe('cleanupCounters', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('counters'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('deletes -seq and -checkpoint-seq files for given sprint', () => {
    seedSprintFile(tmpDir, 'sprint-150-seq', '42');
    seedSprintFile(tmpDir, 'sprint-150-checkpoint-seq', '3');
    seedSprintFile(tmpDir, 'sprint-150-events.jsonl', '{}');  // not a counter, preserve

    const deleted = cleanupCounters(tmpDir, 'sprint-150');

    expect(deleted.sort()).toEqual(['sprint-150-checkpoint-seq', 'sprint-150-seq']);
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-150-seq'))).toBe(false);
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-150-checkpoint-seq'))).toBe(false);
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-150-events.jsonl'))).toBe(true);
  });

  it('ignores other sprints', () => {
    seedSprintFile(tmpDir, 'sprint-149-seq', '10');
    seedSprintFile(tmpDir, 'sprint-150-seq', '20');

    cleanupCounters(tmpDir, 'sprint-150');

    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-149-seq'))).toBe(true);
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-150-seq'))).toBe(false);
  });
});

// ─── Forensic File Migration ────────────────────────────────────────

describe('migrateForensicFiles', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('forensic'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('moves forensic .md files to the canonical sprint audit namespace', () => {
    seedSprintFile(tmpDir, 'sprint-140-layer3-scorecard.md', '# Scorecard');
    seedSprintFile(tmpDir, 'sprint-140-verifier-log.md', '# Verifier');
    seedSprintFile(tmpDir, 'sprint-140-events.jsonl', '{}');  // not forensic

    const moved = migrateForensicFiles(tmpDir);

    expect(moved.length).toBe(2);
    expect(existsSync(join(tmpDir, '.deckent', 'archive', 'sprints', 'sprint-140', 'audits', 'forensic', 'layer3-scorecard.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.deckent', 'archive', 'sprints', 'sprint-140', 'audits', 'forensic', 'verifier-log.md'))).toBe(true);

    // Source removed
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-140-layer3-scorecard.md'))).toBe(false);

    // Non-forensic preserved in .deckent/
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-140-events.jsonl'))).toBe(true);
  });

  it('no-op when no forensic files', () => {
    seedSprintFile(tmpDir, 'sprint-140-events.jsonl', '{}');
    expect(migrateForensicFiles(tmpDir)).toEqual([]);
  });
});

// ─── Combined runRetention Pipeline ─────────────────────────────────

describe('runRetention — combined pipeline', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('combined'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('runs counter cleanup + forensic migration + retention in one pass', () => {
    // Seed 4 sprints + counters + forensic
    for (const n of [100, 101, 102, 103]) {
      seedSprintFile(tmpDir, `sprint-${n}-events.jsonl`);
      seedSprintFile(tmpDir, `sprint-${n}-gate.json`);
    }
    seedSprintFile(tmpDir, 'sprint-103-seq', '99');
    seedSprintFile(tmpDir, 'sprint-103-checkpoint-seq', '5');
    seedSprintFile(tmpDir, 'sprint-102-layer3-scorecard.md', '# Score');

    const result = runRetention(tmpDir, 'sprint-103', {
      keep_last_n: 3,
      size_cap_mb: 500,
      archive_path: '.deckent/archive/sprints/',
    });

    // Counters deleted for sprint-103
    expect(result.countersDeleted.length).toBe(2);
    // Forensic moved
    expect(result.forensicMoved.length).toBe(1);
    // Retention archived sprint-100
    expect(result.archived.length).toBeGreaterThan(0);
    expect(result.kept).toContain('sprint-101');
    expect(result.kept).toContain('sprint-102');
    expect(result.kept).toContain('sprint-103');
  });

  it('fail-safe: null sprint ID skips counter cleanup', () => {
    seedSprintFile(tmpDir, 'sprint-150-events.jsonl');
    seedSprintFile(tmpDir, 'sprint-150-seq', '1');

    const result = runRetention(tmpDir, null, DEFAULT_RETENTION_CONFIG);

    expect(result.countersDeleted).toEqual([]);
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-150-seq'))).toBe(true);
  });

  it('can defer counter cleanup until after the terminal event is emitted', () => {
    seedSprintFile(tmpDir, 'sprint-151-events.jsonl');
    seedSprintFile(tmpDir, 'sprint-151-seq', '63');

    const result = runRetention(
      tmpDir,
      'sprint-151',
      DEFAULT_RETENTION_CONFIG,
      { deferCounterCleanup: true },
    );

    expect(result.countersDeleted).toEqual([]);
    expect(existsSync(join(tmpDir, '.deckent', 'recently-works', 'sprint-151-seq'))).toBe(true);
  });
});
