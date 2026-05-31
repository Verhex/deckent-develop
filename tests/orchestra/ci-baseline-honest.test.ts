import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeHonestCiBaseline } from '../../src/orchestra/sprint-docs-updater.js';

function makeBaseline(testPassed: number, testFailed: number, sprintId = 'sprint-204') {
  return {
    sprintId,
    baseline: {
      tscPassed: true,
      testCount: testPassed + testFailed,
      testPassed,
      testFailed,
      coverage: 0,
      timestamp: new Date().toISOString(),
    },
  };
}

function readBaseline(root: string) {
  const p = join(root, '.deckent', 'ci-baseline.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ci-baseline-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeHonestCiBaseline', () => {
  it('preserves old baseline when 0-pass suspicious and old exists', () => {
    // Seed a known-good baseline
    const deckentDir = join(tmpDir, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    const oldBaseline = makeBaseline(17700, 0, 'sprint-203');
    writeFileSync(join(deckentDir, 'ci-baseline.json'), JSON.stringify(oldBaseline, null, 2));

    // Attempt to write suspicious 0-pass result
    const written = writeHonestCiBaseline(tmpDir, makeBaseline(0, 33));

    expect(written).toBe(false);
    // Old baseline must still be on disk, unchanged
    const onDisk = readBaseline(tmpDir);
    expect(onDisk.baseline.testPassed).toBe(17700);
    expect(onDisk.baseline.testFailed).toBe(0);
    expect(onDisk.sprintId).toBe('sprint-203');
  });

  it('writes real baseline when testPassed > 0', () => {
    const written = writeHonestCiBaseline(tmpDir, makeBaseline(17258, 2));

    expect(written).toBe(true);
    const onDisk = readBaseline(tmpDir);
    expect(onDisk.baseline.testPassed).toBe(17258);
    expect(onDisk.baseline.testFailed).toBe(2);
    expect(onDisk.sprintId).toBe('sprint-204');
  });

  it('writes baseline on first run even when 0-pass (no old to preserve)', () => {
    // No existing baseline in .deckent/
    const written = writeHonestCiBaseline(tmpDir, makeBaseline(0, 33));

    expect(written).toBe(true);
    const onDisk = readBaseline(tmpDir);
    expect(onDisk.baseline.testPassed).toBe(0);
    expect(onDisk.baseline.testFailed).toBe(33);
  });

  it('is idempotent — calling twice with same valid data yields same result', () => {
    const data = makeBaseline(17258, 0);
    writeHonestCiBaseline(tmpDir, data);
    writeHonestCiBaseline(tmpDir, data);

    const onDisk = readBaseline(tmpDir);
    expect(onDisk.baseline.testPassed).toBe(17258);
    expect(onDisk.baseline.testFailed).toBe(0);
    expect(onDisk.sprintId).toBe('sprint-204');
  });

  it('writes baseline when testFailed is 0 (all pass — not suspicious)', () => {
    const written = writeHonestCiBaseline(tmpDir, makeBaseline(17258, 0));

    expect(written).toBe(true);
    const onDisk = readBaseline(tmpDir);
    expect(onDisk.baseline.testFailed).toBe(0);
  });

  it('treats 0-pass/0-fail as not suspicious (empty suite — write it)', () => {
    // testPassed=0 && testFailed=0 is not the suspicious pattern
    const written = writeHonestCiBaseline(tmpDir, makeBaseline(0, 0));

    expect(written).toBe(true);
  });
});
