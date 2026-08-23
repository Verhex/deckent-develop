import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  mkdirSync, existsSync, readFileSync, writeFileSync,
  rmSync, readdirSync, symlinkSync,
} from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';

import {
  rotateMetricsFile,
  shouldRotate,
  enforceKeepLastN,
  readArchivedMetrics,
  listArchives,
  DEFAULT_ROTATION_CONFIG,
} from '../../src/core/observability-rotation.js';
import { SprintArchivePublicationError } from '../../src/core/sprint-archive.js';

import {
  initObservability,
  resetObservability,
  metric,
  getPerSprintMetricsPath,
  setObservabilitySprintId,
  getObservabilitySprintId,
} from '../../src/core/observability.js';

const TEST_ROOT = join(process.cwd(), '.test-obs-rotation-' + process.pid);
const METRICS_PATH = join(TEST_ROOT, '.deckent', 'metrics.jsonl');
const ARCHIVE_DIR = join(TEST_ROOT, '.deckent', 'archive', 'metrics');

function writeMetricsLines(lines: string[]): void {
  mkdirSync(join(TEST_ROOT, '.deckent'), { recursive: true });
  writeFileSync(METRICS_PATH, lines.join('\n') + '\n', 'utf-8');
}

function createSampleMetric(name: string, value: number, sprintId?: string): string {
  const entry: Record<string, unknown> = {
    type: 'metric',
    name,
    value,
    timestamp: new Date().toISOString(),
  };
  if (sprintId) {
    entry.tags = { sprintId };
  }
  return JSON.stringify(entry);
}

function expectPublicationError(
  action: () => void,
  code: SprintArchivePublicationError['code'],
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(SprintArchivePublicationError);
    expect((error as SprintArchivePublicationError).code).toBe(code);
    return;
  }
  throw new Error('Expected SprintArchivePublicationError');
}

beforeEach(() => {
  mkdirSync(join(TEST_ROOT, '.deckent'), { recursive: true });
});

afterEach(() => {
  resetObservability();
  try {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  } catch { /* cleanup best effort */ }
});

// ═══ Rotation Core ═══════════════════════════════════════════════

describe('rotateMetricsFile()', () => {
  it('should compress and archive metrics file then truncate original', () => {
    const lines = [
      createSampleMetric('test.a', 1),
      createSampleMetric('test.b', 2),
      createSampleMetric('test.c', 3),
    ];
    writeMetricsLines(lines);

    const result = rotateMetricsFile(TEST_ROOT, 'sprint-150');

    expect(result.rotated).toBe(true);
    expect(result.archivePath).toContain(join(
      '.deckent', 'archive', 'sprints', 'sprint-150', 'metrics', 'metrics-',
    ));
    expect(result.archivePath).toMatch(/metrics-[0-9a-f]{16}\.jsonl\.gz$/u);
    expect(result.originalSizeBytes).toBeGreaterThan(0);
    expect(result.archivedSizeBytes).toBeGreaterThan(0);

    // Original file should be empty
    expect(readFileSync(METRICS_PATH, 'utf-8')).toBe('');

    // Archive should exist and be valid gzip
    expect(existsSync(result.archivePath!)).toBe(true);
    const archived = readArchivedMetrics(result.archivePath!);
    const archivedLines = archived.split('\n').filter(l => l.trim().length > 0);
    expect(archivedLines).toHaveLength(3);
  });

  it('should return rotated=false when metrics file does not exist', () => {
    const result = rotateMetricsFile(TEST_ROOT, 'sprint-999');
    expect(result.rotated).toBe(false);
    expect(result.pruned).toEqual([]);
  });

  it('should return rotated=false when metrics file is empty', () => {
    writeFileSync(METRICS_PATH, '', 'utf-8');
    const result = rotateMetricsFile(TEST_ROOT, 'sprint-999');
    expect(result.rotated).toBe(false);
  });

  it('should decompress archive and recover original content (gzip roundtrip)', () => {
    const originalContent = [
      createSampleMetric('roundtrip.a', 42),
      createSampleMetric('roundtrip.b', 99),
    ].join('\n') + '\n';
    writeFileSync(METRICS_PATH, originalContent, 'utf-8');

    const result = rotateMetricsFile(TEST_ROOT, 'sprint-151');

    const recovered = readArchivedMetrics(result.archivePath!);
    expect(recovered).toBe(originalContent);
  });

  it('rejects redirected metrics namespaces without mutating hot metrics', () => {
    const originalContent = `${createSampleMetric('namespace.safe', 1)}\n`;
    writeFileSync(METRICS_PATH, originalContent, 'utf-8');
    const archiveDir = join(TEST_ROOT, '.deckent', 'archive', 'sprints', 'sprint-153');
    const namespace = join(archiveDir, 'metrics');
    const outside = join(TEST_ROOT, 'outside');
    mkdirSync(archiveDir, { recursive: true });
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, namespace, process.platform === 'win32' ? 'junction' : 'dir');

    expectPublicationError(
      () => rotateMetricsFile(TEST_ROOT, 'sprint-153'),
      'ARCHIVE_UNSAFE_DESTINATION_PATH',
    );
    expect(readFileSync(METRICS_PATH, 'utf-8')).toBe(originalContent);
    expect(readdirSync(outside)).toEqual([]);
    expect(readdirSync(join(TEST_ROOT, '.deckent')).filter(name => name.startsWith('.metrics-rotation-')))
      .toEqual([]);
  });

  it('does not mutate a terminal-sealed archive or hot metrics', () => {
    const originalContent = `${createSampleMetric('sealed.safe', 1)}\n`;
    writeFileSync(METRICS_PATH, originalContent, 'utf-8');
    const archiveDir = join(TEST_ROOT, '.deckent', 'archive', 'sprints', 'sprint-154');
    mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, 'terminal-seal-application.json'), '{"state":"applied"}', 'utf-8');

    expectPublicationError(
      () => rotateMetricsFile(TEST_ROOT, 'sprint-154'),
      'ARCHIVE_TERMINAL_PUBLICATION_REJECTED',
    );
    expect(readFileSync(METRICS_PATH, 'utf-8')).toBe(originalContent);
    expect(readdirSync(archiveDir)).toEqual(['terminal-seal-application.json']);
    expect(readdirSync(join(TEST_ROOT, '.deckent')).filter(name => name.startsWith('.metrics-rotation-')))
      .toEqual([]);
  });
});

// ═══ keepLastN Enforcement ══════════════════════════════════════

describe('enforceKeepLastN()', () => {
  it('preserves immutable archives when the legacy hot-cache limit is exceeded', () => {
    mkdirSync(ARCHIVE_DIR, { recursive: true });

    // Create 5 archive files
    for (let i = 1; i <= 5; i++) {
      const name = `metrics-sprint-${String(i).padStart(3, '0')}.jsonl.gz`;
      writeFileSync(join(ARCHIVE_DIR, name), gzipSync('test'));
    }

    const pruned = enforceKeepLastN(TEST_ROOT, 3);

    expect(pruned).toEqual([]);
    const remaining = readdirSync(ARCHIVE_DIR);
    expect(remaining).toHaveLength(5);
    expect(remaining).toContain('metrics-sprint-001.jsonl.gz');
    expect(remaining).toContain('metrics-sprint-002.jsonl.gz');
    expect(remaining).toContain('metrics-sprint-003.jsonl.gz');
    expect(remaining).toContain('metrics-sprint-004.jsonl.gz');
    expect(remaining).toContain('metrics-sprint-005.jsonl.gz');
  });

  it('should not prune when under limit', () => {
    mkdirSync(ARCHIVE_DIR, { recursive: true });

    for (let i = 1; i <= 3; i++) {
      const name = `metrics-sprint-${String(i).padStart(3, '0')}.jsonl.gz`;
      writeFileSync(join(ARCHIVE_DIR, name), gzipSync('test'));
    }

    const pruned = enforceKeepLastN(TEST_ROOT, 10);
    expect(pruned).toHaveLength(0);

    const remaining = readdirSync(ARCHIVE_DIR);
    expect(remaining).toHaveLength(3);
  });

  it('should return empty when archive dir does not exist', () => {
    const pruned = enforceKeepLastN(TEST_ROOT, 10);
    expect(pruned).toEqual([]);
  });
});

// ═══ shouldRotate ═══════════════════════════════════════════════

describe('shouldRotate()', () => {
  it('should return true when file exceeds maxSizeMB', () => {
    // Write >1MB of data
    const bigLine = createSampleMetric('big', 1).repeat(100);
    const lines = Array(200).fill(bigLine);
    writeMetricsLines(lines);

    expect(shouldRotate(TEST_ROOT, { maxSizeMB: 0.001 })).toBe(true);
  });

  it('should return false when file is under threshold', () => {
    writeMetricsLines([createSampleMetric('small', 1)]);
    expect(shouldRotate(TEST_ROOT, { maxSizeMB: 1 })).toBe(false);
  });

  it('should return false when file does not exist', () => {
    expect(shouldRotate(TEST_ROOT)).toBe(false);
  });
});

// ═══ SprintId Tagging ══════════════════════════════════════════

describe('SprintId auto-injection', () => {
  it('should inject sprintId tag into metric entries', () => {
    initObservability(TEST_ROOT, 'sprint-150');

    metric('tagged.metric', 42);

    const lines = readFileSync(METRICS_PATH, 'utf-8').split('\n').filter(l => l.trim());
    const entry = JSON.parse(lines[0]) as { tags?: Record<string, string> };
    expect(entry.tags?.sprintId).toBe('sprint-150');
  });

  it('should not inject sprintId when not set', () => {
    initObservability(TEST_ROOT);

    metric('untagged.metric', 42);

    const lines = readFileSync(METRICS_PATH, 'utf-8').split('\n').filter(l => l.trim());
    const entry = JSON.parse(lines[0]) as { tags?: Record<string, string> };
    expect(entry.tags?.sprintId).toBeUndefined();
  });

  it('should allow setting sprintId after initialization', () => {
    initObservability(TEST_ROOT);
    setObservabilitySprintId('sprint-151');

    metric('late.set', 10);

    const lines = readFileSync(METRICS_PATH, 'utf-8').split('\n').filter(l => l.trim());
    const entry = JSON.parse(lines[0]) as { tags?: Record<string, string> };
    expect(entry.tags?.sprintId).toBe('sprint-151');
  });

  it('should preserve existing tags alongside sprintId', () => {
    initObservability(TEST_ROOT, 'sprint-150');

    metric('tagged', 42, { env: 'test', taskId: '001' });

    const lines = readFileSync(METRICS_PATH, 'utf-8').split('\n').filter(l => l.trim());
    const entry = JSON.parse(lines[0]) as { tags?: Record<string, string> };
    expect(entry.tags?.sprintId).toBe('sprint-150');
    expect(entry.tags?.env).toBe('test');
    expect(entry.tags?.taskId).toBe('001');
  });
});

// ═══ Per-Sprint File ════════════════════════════════════════════

describe('Per-sprint metrics file', () => {
  it('should write to per-sprint file when enabled', () => {
    initObservability(TEST_ROOT, 'sprint-150', { perSprintFile: true });

    metric('per.sprint', 1);

    const perSprintPath = getPerSprintMetricsPath(TEST_ROOT, 'sprint-150');
    expect(perSprintPath).not.toBeNull();
    expect(existsSync(perSprintPath!)).toBe(true);

    const content = readFileSync(perSprintPath!, 'utf-8');
    const entry = JSON.parse(content.trim()) as { name: string; tags?: Record<string, string> };
    expect(entry.name).toBe('per.sprint');
    expect(entry.tags?.sprintId).toBe('sprint-150');
  });

  it('should also write to main metrics file when per-sprint is enabled', () => {
    initObservability(TEST_ROOT, 'sprint-150', { perSprintFile: true });

    metric('dual.write', 1);

    // Main file
    expect(existsSync(METRICS_PATH)).toBe(true);
    const mainContent = readFileSync(METRICS_PATH, 'utf-8');
    expect(mainContent.trim().length).toBeGreaterThan(0);

    // Per-sprint file
    const perSprintPath = getPerSprintMetricsPath(TEST_ROOT, 'sprint-150');
    expect(existsSync(perSprintPath!)).toBe(true);
  });

  it('should not write per-sprint file when disabled', () => {
    initObservability(TEST_ROOT, 'sprint-150', { perSprintFile: false });

    metric('no.per.sprint', 1);

    const perSprintPath = getPerSprintMetricsPath(TEST_ROOT, 'sprint-150');
    expect(perSprintPath).not.toBeNull();
    expect(existsSync(perSprintPath!)).toBe(false);
  });
});

// ═══ Retro-compat ══════════════════════════════════════════════

describe('Retro-compatibility', () => {
  it('should handle entries without sprintId tag (legacy entries)', () => {
    // Write legacy entries without sprintId
    const legacyLines = [
      JSON.stringify({ type: 'metric', name: 'old.metric', value: 1, timestamp: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ type: 'metric', name: 'old.metric', value: 2, tags: { env: 'prod' }, timestamp: '2026-01-02T00:00:00Z' }),
    ];
    writeMetricsLines(legacyLines);

    // Rotation should still work
    const result = rotateMetricsFile(TEST_ROOT, 'sprint-152');
    expect(result.rotated).toBe(true);

    // Archived content should be recoverable
    const recovered = readArchivedMetrics(result.archivePath!);
    const recoveredLines = recovered.split('\n').filter(l => l.trim());
    expect(recoveredLines).toHaveLength(2);

    // Parse and verify legacy format preserved
    const entry1 = JSON.parse(recoveredLines[0]) as { name: string; tags?: Record<string, string> };
    expect(entry1.name).toBe('old.metric');
    expect(entry1.tags?.sprintId).toBeUndefined();
  });
});

// ═══ listArchives ══════════════════════════════════════════════

describe('listArchives()', () => {
  it('should list archives in sorted order', () => {
    mkdirSync(ARCHIVE_DIR, { recursive: true });

    writeFileSync(join(ARCHIVE_DIR, 'metrics-sprint-003.jsonl.gz'), gzipSync('c'));
    writeFileSync(join(ARCHIVE_DIR, 'metrics-sprint-001.jsonl.gz'), gzipSync('a'));
    writeFileSync(join(ARCHIVE_DIR, 'metrics-sprint-002.jsonl.gz'), gzipSync('b'));

    const archives = listArchives(TEST_ROOT);
    expect(archives).toHaveLength(3);
    expect(archives[0]).toContain('sprint-001');
    expect(archives[1]).toContain('sprint-002');
    expect(archives[2]).toContain('sprint-003');
  });

  it('should return empty array when no archive dir', () => {
    expect(listArchives(TEST_ROOT)).toEqual([]);
  });
});

// ═══ Config Defaults ═══════════════════════════════════════════

describe('DEFAULT_ROTATION_CONFIG', () => {
  it('should have correct defaults', () => {
    expect(DEFAULT_ROTATION_CONFIG.maxSizeMB).toBe(1);
    expect(DEFAULT_ROTATION_CONFIG.archiveFormat).toBe('gzip');
    expect(DEFAULT_ROTATION_CONFIG.keepLastN).toBe(10);
  });
});

// ═══ getObservabilitySprintId ═══════════════════════════════════

describe('getObservabilitySprintId()', () => {
  it('should return null when not set', () => {
    initObservability(TEST_ROOT);
    expect(getObservabilitySprintId()).toBeNull();
  });

  it('should return sprintId when set via init', () => {
    initObservability(TEST_ROOT, 'sprint-150');
    expect(getObservabilitySprintId()).toBe('sprint-150');
  });

  it('should return sprintId when set via setter', () => {
    initObservability(TEST_ROOT);
    setObservabilitySprintId('sprint-151');
    expect(getObservabilitySprintId()).toBe('sprint-151');
  });

  it('should reset to null on resetObservability', () => {
    initObservability(TEST_ROOT, 'sprint-150');
    resetObservability();
    expect(getObservabilitySprintId()).toBeNull();
  });
});
