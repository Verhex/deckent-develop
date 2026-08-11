import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CRASH_ARTIFACT_SCHEMA_VERSION,
  DEFAULT_CRASH_RETENTION_MAX_AGE_DAYS,
  DEFAULT_CRASH_RETENTION_MAX_COUNT,
  DEFAULT_CRASH_RETENTION_MAX_SIZE_MB,
  CRASH_ARTIFACT_READ_HARD_CAP,
  resolveCrashRetentionConfig,
  listCrashArtifacts,
  selectCrashArtifactsToPrune,
  applyCrashRetention,
  formatFatalAndExit,
  type CrashArtifactV1,
  type CrashArtifactV1Entry,
  type CrashRetentionConfig,
} from '../../src/cli/helpers/error-handler.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeArtifact(overrides: Partial<CrashArtifactV1> = {}): CrashArtifactV1 {
  return {
    schemaVersion: CRASH_ARTIFACT_SCHEMA_VERSION,
    timestamp: new Date(0).toISOString(),
    pid: 1,
    command: 'node cli.js',
    deckentVersion: '1.0.0',
    projectRootDigest: '0000000000000000',
    name: 'Error',
    message: 'boom',
    stack: null,
    ...overrides,
  };
}

function makeEntry(fileName: string, mtimeMs: number, sizeBytes: number): CrashArtifactV1Entry {
  return { kind: 'v1', fileName, mtimeMs, sizeBytes, artifact: makeArtifact() };
}

function writeFileWithMtime(dir: string, fileName: string, content: string, mtimeMs: number): void {
  const filePath = join(dir, fileName);
  writeFileSync(filePath, content, 'utf8');
  const seconds = mtimeMs / 1000;
  utimesSync(filePath, seconds, seconds);
}

// ─── resolveCrashRetentionConfig ───────────────────────────────────────

describe('resolveCrashRetentionConfig', () => {
  it('returns the documented defaults when no env is set', () => {
    expect(resolveCrashRetentionConfig({})).toEqual({
      maxAgeDays: DEFAULT_CRASH_RETENTION_MAX_AGE_DAYS,
      maxCount: DEFAULT_CRASH_RETENTION_MAX_COUNT,
      maxSizeMB: DEFAULT_CRASH_RETENTION_MAX_SIZE_MB,
    });
  });

  it('honors valid env overrides', () => {
    const config = resolveCrashRetentionConfig({
      DECKENT_CRASH_RETENTION_MAX_AGE_DAYS: '7',
      DECKENT_CRASH_RETENTION_MAX_COUNT: '25',
      DECKENT_CRASH_RETENTION_MAX_SIZE_MB: '5',
    });
    expect(config).toEqual({ maxAgeDays: 7, maxCount: 25, maxSizeMB: 5 });
  });

  it('falls back to defaults for non-numeric or non-positive env values', () => {
    const config = resolveCrashRetentionConfig({
      DECKENT_CRASH_RETENTION_MAX_AGE_DAYS: 'not-a-number',
      DECKENT_CRASH_RETENTION_MAX_COUNT: '0',
      DECKENT_CRASH_RETENTION_MAX_SIZE_MB: '-5',
    });
    expect(config).toEqual({
      maxAgeDays: DEFAULT_CRASH_RETENTION_MAX_AGE_DAYS,
      maxCount: DEFAULT_CRASH_RETENTION_MAX_COUNT,
      maxSizeMB: DEFAULT_CRASH_RETENTION_MAX_SIZE_MB,
    });
  });
});

// ─── selectCrashArtifactsToPrune (pure, boundary-pinned) ───────────────

describe('selectCrashArtifactsToPrune', () => {
  it('prunes beyond maxCount, keeping the newest N', () => {
    const config: CrashRetentionConfig = { maxAgeDays: 3650, maxCount: 3, maxSizeMB: 10_000 };
    const now = 1_000_000_000_000;
    const entries = [
      makeEntry('e0.log', now, 100),
      makeEntry('e1.log', now - 1_000, 100),
      makeEntry('e2.log', now - 2_000, 100),
      makeEntry('e3.log', now - 3_000, 100),
      makeEntry('e4.log', now - 4_000, 100),
    ];
    const pruned = selectCrashArtifactsToPrune(entries, config, now);
    expect(pruned.map((e) => e.fileName).sort()).toEqual(['e3.log', 'e4.log']);
  });

  it('keeps an artifact exactly at the age boundary, prunes one ms past it', () => {
    const config: CrashRetentionConfig = { maxAgeDays: 1, maxCount: 100, maxSizeMB: 10_000 };
    const now = 1_000_000_000_000;
    const maxAgeMs = MS_PER_DAY;
    const atBoundary = makeEntry('at-boundary.log', now - maxAgeMs, 100);
    const pastBoundary = makeEntry('past-boundary.log', now - maxAgeMs - 1, 100);

    const pruned = selectCrashArtifactsToPrune([atBoundary, pastBoundary], config, now);
    expect(pruned.map((e) => e.fileName)).toEqual(['past-boundary.log']);
  });

  it('prunes oldest entries once the size cap would be exceeded', () => {
    const config: CrashRetentionConfig = { maxAgeDays: 3650, maxCount: 100, maxSizeMB: 1 };
    const now = 1_000_000_000_000;
    const sizeEach = 400_000; // 3 * 400_000 = 1_200_000 > 1 MiB (1_048_576)
    const entries = [
      makeEntry('newest.log', now, sizeEach),
      makeEntry('middle.log', now - 1_000, sizeEach),
      makeEntry('oldest.log', now - 2_000, sizeEach),
    ];
    const pruned = selectCrashArtifactsToPrune(entries, config, now);
    expect(pruned.map((e) => e.fileName)).toEqual(['oldest.log']);
  });

  it('returns nothing to prune when every entry fits under all three limits', () => {
    const config: CrashRetentionConfig = { maxAgeDays: 3650, maxCount: 100, maxSizeMB: 10_000 };
    const now = 1_000_000_000_000;
    const entries = [makeEntry('a.log', now, 100), makeEntry('b.log', now - 1_000, 100)];
    expect(selectCrashArtifactsToPrune(entries, config, now)).toEqual([]);
  });
});

// ─── listCrashArtifacts — legacy classification, ordering, hard cap ────

describe('listCrashArtifacts', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deckent-crash-reader-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('classifies non-JSON (pre-schema free-text) content as legacy, never v1', () => {
    writeFileWithMtime(dir, 'old-plain.log', 'FATAL: TypeError: boom\n  at x (y.js:1:1)\n', Date.now());
    const entries = listCrashArtifacts(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('legacy');
  });

  it('classifies JSON without a matching schemaVersion as legacy', () => {
    writeFileWithMtime(dir, 'pre-schema.log', JSON.stringify({ message: 'boom' }), Date.now());
    const entries = listCrashArtifacts(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('legacy');
  });

  it('classifies a well-formed CrashArtifactV1 body as v1', () => {
    writeFileWithMtime(dir, 'v1.log', JSON.stringify(makeArtifact()), Date.now());
    const entries = listCrashArtifacts(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('v1');
    if (entries[0].kind === 'v1') {
      expect(entries[0].artifact.schemaVersion).toBe(CRASH_ARTIFACT_SCHEMA_VERSION);
      expect(entries[0].artifact.message).toBe('boom');
    }
  });

  it('lists newest-first by file mtime', () => {
    const base = 1_000_000_000_000;
    writeFileWithMtime(dir, 'older.log', JSON.stringify(makeArtifact()), base - 5_000);
    writeFileWithMtime(dir, 'newer.log', JSON.stringify(makeArtifact()), base);
    const entries = listCrashArtifacts(dir);
    expect(entries.map((e) => e.fileName)).toEqual(['newer.log', 'older.log']);
  });

  it('enforces the hard cap even when a much larger limit is requested', () => {
    for (let i = 0; i < 5; i++) {
      writeFileWithMtime(dir, `a${i}.log`, JSON.stringify(makeArtifact()), 1_000_000_000_000 + i);
    }
    expect(listCrashArtifacts(dir, { limit: 3 })).toHaveLength(3);
    expect(listCrashArtifacts(dir, { limit: 1_000_000 }).length).toBeLessThanOrEqual(CRASH_ARTIFACT_READ_HARD_CAP);
  });

  it('returns an empty array for a nonexistent directory', () => {
    expect(listCrashArtifacts(join(dir, 'does-not-exist'))).toEqual([]);
  });
});

// ─── applyCrashRetention — legacy never pruned, v1 pruned, never-mask ──

describe('applyCrashRetention', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deckent-crash-retention-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('never deletes legacy artifacts regardless of age/count/size pressure', () => {
    const now = 1_000_000_000_000;
    writeFileWithMtime(dir, 'legacy-ancient.log', 'plain text fatal, pre-schema', now - 10_000 * MS_PER_DAY);
    for (let i = 0; i < 5; i++) {
      writeFileWithMtime(dir, `v1-${i}.log`, JSON.stringify(makeArtifact()), now - i * 1_000);
    }

    applyCrashRetention(dir, { maxAgeDays: 3650, maxCount: 2, maxSizeMB: 10_000 }, now);

    expect(readdirSync(dir)).toContain('legacy-ancient.log');
  });

  it('prunes v1 artifacts beyond maxCount, keeping the newest', () => {
    const now = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) {
      writeFileWithMtime(dir, `v1-${i}.log`, JSON.stringify(makeArtifact()), now - i * 1_000);
    }

    applyCrashRetention(dir, { maxAgeDays: 3650, maxCount: 2, maxSizeMB: 10_000 }, now);

    expect(readdirSync(dir).sort()).toEqual(['v1-0.log', 'v1-1.log']);
  });

  it('never throws even when the target path cannot be read as a directory (never-mask)', () => {
    const notADir = join(dir, 'actually-a-file.log');
    writeFileSync(notADir, 'not a directory', 'utf8');
    expect(() => applyCrashRetention(notADir, resolveCrashRetentionConfig())).not.toThrow();
  });

  it('never throws when a pruned file vanishes before unlink races it (never-mask)', () => {
    const now = 1_000_000_000_000;
    writeFileWithMtime(dir, 'v1-only.log', JSON.stringify(makeArtifact()), now);
    // maxCount: 0 forces every v1 entry to be selected for pruning.
    expect(() => applyCrashRetention(dir, { maxAgeDays: 3650, maxCount: 0, maxSizeMB: 10_000 }, now)).not.toThrow();
    expect(readdirSync(dir)).not.toContain('v1-only.log');
  });
});

// ─── formatFatalAndExit — retention runs at write time, never masks ───

describe('formatFatalAndExit — retention runs at write time without masking the fatal', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let tempCwd: string;
  let originalCwd: string;
  let originalMaxCountEnv: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempCwd = mkdtempSync(join(tmpdir(), 'deckent-fatal-retention-'));
    process.chdir(tempCwd);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as never);
    originalMaxCountEnv = process.env.DECKENT_CRASH_RETENTION_MAX_COUNT;
    process.env.DECKENT_CRASH_RETENTION_MAX_COUNT = '1';
  });

  afterEach(() => {
    if (originalMaxCountEnv === undefined) delete process.env.DECKENT_CRASH_RETENTION_MAX_COUNT;
    else process.env.DECKENT_CRASH_RETENTION_MAX_COUNT = originalMaxCountEnv;
    exitSpy.mockRestore();
    process.chdir(originalCwd);
    rmSync(tempCwd, { recursive: true, force: true });
  });

  it('prunes down to maxCount after repeated fatals while still exiting(1) every time', () => {
    formatFatalAndExit(new Error('first'));
    formatFatalAndExit(new Error('second'));

    const crashDir = join(tempCwd, '.deckent', 'crashes');
    expect(readdirSync(crashDir)).toHaveLength(1);
    expect(exitSpy).toHaveBeenCalledTimes(2);
    expect(exitSpy).toHaveBeenNthCalledWith(1, 1);
    expect(exitSpy).toHaveBeenNthCalledWith(2, 1);
  });
});
