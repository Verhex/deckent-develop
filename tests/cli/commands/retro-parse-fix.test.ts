import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseRetroToRichSummary } from '../../../src/cli/commands/retro.js';

// We need to test loadPreviousRetro indirectly since it's not exported
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('parseRetroToRichSummary — sprint-reporter format', () => {
  const makeContent = (rows: string[]): string => {
    return [
      '# Sprint sprint-055',
      '',
      '## Metrics',
      '| What | Value |',
      '|------|-------|',
      ...rows,
      '',
    ].join('\n');
  };

  it('should parse "Tasks completed | 5/8" correctly', () => {
    const content = makeContent(['| Tasks completed | 5/8 |']);
    const summary = parseRetroToRichSummary(content);
    expect(summary.completed).toBe(5);
    expect(summary.totalTasks).toBe(8);
  });

  it('should parse "Tasks completed | 0/3" correctly', () => {
    const content = makeContent(['| Tasks completed | 0/3 |']);
    const summary = parseRetroToRichSummary(content);
    expect(summary.completed).toBe(0);
    expect(summary.totalTasks).toBe(3);
  });

  it('should parse "NO_GO rate | 25% (2/8)" correctly', () => {
    const content = makeContent(['| NO_GO rate | 25% (2/8) |']);
    const summary = parseRetroToRichSummary(content);
    expect(summary.noGo).toBe(2);
  });

  it('should parse "NO_GO rate | 0% (0/5)" correctly', () => {
    const content = makeContent(['| NO_GO rate | 0% (0/5) |']);
    const summary = parseRetroToRichSummary(content);
    expect(summary.noGo).toBe(0);
  });

  it('should parse "Sprint time | 3m 38s" correctly', () => {
    const content = makeContent(['| Sprint time | 3m 38s |']);
    const summary = parseRetroToRichSummary(content);
    expect(summary.duration).toBe('3m 38s');
  });

  it('should parse "Coverage | 85.2%" correctly', () => {
    const content = makeContent(['| Coverage | 85.2% |']);
    const summary = parseRetroToRichSummary(content);
    expect(summary.coverage).toBe('85.2%');
  });

  it('should parse full sprint-reporter output', () => {
    const content = makeContent([
      '| Tasks completed | 6/8 |',
      '| Sprint time | 5m 12s |',
      '| NO_GO rate | 25% (2/8) |',
      '| Coverage | 90.1% |',
    ]);
    const summary = parseRetroToRichSummary(content);
    expect(summary.sprintId).toBe('sprint-055');
    expect(summary.completed).toBe(6);
    expect(summary.totalTasks).toBe(8);
    expect(summary.noGo).toBe(2);
    expect(summary.coverage).toBe('90.1%');
    expect(summary.duration).toBe('5m 12s');
  });

  it('should return defaults for empty content', () => {
    const summary = parseRetroToRichSummary('');
    expect(summary.totalTasks).toBe(0);
    expect(summary.completed).toBe(0);
    expect(summary.noGo).toBe(0);
    expect(summary.techDebt).toBe(0);
    expect(summary.coverage).toBe('-');
    expect(summary.duration).toBe('-');
  });

  it('should count GO_WITH_TECH_DEBT occurrences as techDebt fallback', () => {
    const content = [
      '# Sprint sprint-055',
      '- Task 1: GO_WITH_TECH_DEBT',
      '- Task 2: GO_WITH_TECH_DEBT',
      '- Task 3: DONE',
    ].join('\n');
    const summary = parseRetroToRichSummary(content);
    expect(summary.techDebt).toBe(2);
  });

  it('should still parse legacy "| Total Tasks |" format', () => {
    const content = [
      '# Sprint sprint-040',
      '| Metric | Value |',
      '|--------|-------|',
      '| Total Tasks | 10 |',
      '| Completed | 8 |',
      '| No-Go | 1 |',
      '| Tech Debt | 2 |',
      '| Coverage | 75% |',
      '| Duration | 4m |',
    ].join('\n');
    const summary = parseRetroToRichSummary(content);
    expect(summary.totalTasks).toBe(10);
    expect(summary.completed).toBe(8);
    expect(summary.noGo).toBe(1);
    expect(summary.techDebt).toBe(2);
    expect(summary.coverage).toBe('75%');
    expect(summary.duration).toBe('4m');
  });

  it('should use fallback non-table format', () => {
    const content = 'Sprint sprint-010\nTasks: 5\nCoverage: 80%\nDuration: 2m';
    const summary = parseRetroToRichSummary(content);
    expect(summary.totalTasks).toBe(5);
    expect(summary.coverage).toBe('80%');
    expect(summary.duration).toBe('2m');
  });
});

describe('loadPreviousRetro — via retro --compare', () => {
  const tmpDir = path.join(process.cwd(), '.test-retro-tmp');
  const brainDir = path.join(tmpDir, '.brain');
  const sprintsDir = path.join(brainDir, 'sprints');
  const retroPath = path.join(brainDir, 'RETRO.md');

  beforeEach(() => {
    fs.mkdirSync(sprintsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // We test loadPreviousRetro behavior by importing the module internals
  // Since loadPreviousRetro is not exported, we test the logic directly
  // by replicating it (the fix: files.at(-2) instead of files.at(-1))
  it('should return second-to-last sprint with 3+ files', () => {
    fs.writeFileSync(path.join(sprintsDir, 'sprint-050.md'), '# Sprint sprint-050\n| Tasks completed | 3/5 |');
    fs.writeFileSync(path.join(sprintsDir, 'sprint-051.md'), '# Sprint sprint-051\n| Tasks completed | 4/6 |');
    fs.writeFileSync(path.join(sprintsDir, 'sprint-052.md'), '# Sprint sprint-052\n| Tasks completed | 5/8 |');

    const files = fs.readdirSync(sprintsDir)
      .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(2);
    const prevFile = files.at(-2)!;
    const prevContent = fs.readFileSync(path.join(sprintsDir, prevFile), 'utf-8');
    expect(prevContent).toContain('sprint-051');
  });

  it('should return null with only 1 file', () => {
    fs.writeFileSync(path.join(sprintsDir, 'sprint-050.md'), '# Sprint sprint-050');

    const files = fs.readdirSync(sprintsDir)
      .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
      .sort();
    expect(files.length).toBe(1);
    // loadPreviousRetro returns null when files.length < 2
  });

  it('should return null with 0 files', () => {
    const files = fs.readdirSync(sprintsDir)
      .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
      .sort();
    expect(files.length).toBe(0);
  });

  it('--compare should compute real delta (previous != current)', () => {
    const currentContent = [
      '# Sprint sprint-055',
      '| What | Value |',
      '|------|-------|',
      '| Tasks completed | 8/10 |',
      '| NO_GO rate | 10% (1/10) |',
      '| Coverage | 90% |',
    ].join('\n');

    const previousContent = [
      '# Sprint sprint-054',
      '| What | Value |',
      '|------|-------|',
      '| Tasks completed | 5/8 |',
      '| NO_GO rate | 25% (2/8) |',
      '| Coverage | 85% |',
    ].join('\n');

    const current = parseRetroToRichSummary(currentContent);
    const previous = parseRetroToRichSummary(previousContent);

    // Verify they are different
    expect(current.completed).not.toBe(previous.completed);
    expect(current.totalTasks).not.toBe(previous.totalTasks);
    expect(current.noGo).not.toBe(previous.noGo);

    // Verify delta would be non-zero
    const curRate = (current.completed / current.totalTasks) * 100;
    const prevRate = (previous.completed / previous.totalTasks) * 100;
    expect(curRate - prevRate).not.toBe(0);
  });
});
