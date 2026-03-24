import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { print } from '../../../src/cli/helpers/output.js';
import {
  registerExplain,
  parseSprintLog,
  parseSprintNumber,
  parseRetroLearnings,
  formatDuration,
  buildExplainOutput,
  findLatestSprintLog,
} from '../../../src/cli/commands/explain.js';

// ─── Helpers ─────────────────────────────────────────────────────────

const SAMPLE_SPRINT_LOG = `# sprint-042

## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 8 |
| Completed | 3 |
| Tech Debt | 3 |
| No-Go | 5 |
| Coverage | 0.0% |
| Duration | 2405394ms |

## Tasks
- 042-001: Close All Open Tech Debt (NO_GO)
- 042-002: Test Suite Stabilization (NO_GO)
- 042-003: npm Publish Validation (GO_WITH_TECH_DEBT)
- 042-004: Global Install E2E Test (GO_WITH_TECH_DEBT)
- 042-005: Provider Adapter Smoke Tests (GO_WITH_TECH_DEBT)
- 042-006: Documentation Final Review (NO_GO)
- 042-007: CHANGELOG + Release Notes (NO_GO)
- 042-008: Version Bump + Git Tag (NO_GO)`;

const SAMPLE_RETRO = `# Sprint sprint-042 Retrospective

## Summary
Completed 3/8 tasks in 40 minutes 5s.

## Highlights
- 3 tasks completed on first try
- No boundary violations detected

## Issues
- Task 042-001 (Close All Open Tech Debt) failed

## Learnings
- npm Publish Validation: completed with tech debt — schedule cleanup
- Global Install E2E Test: completed with tech debt — schedule cleanup
- Provider Adapter Smoke Tests: completed with tech debt — schedule cleanup
- Documentation Final Review: failed — investigate root cause
- Version Bump + Git Tag: failed — investigate root cause
`;

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerExplain(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Unit Tests ─────────────────────────────────────────────────────

describe('parseSprintNumber', () => {
  it('parses sprint number from filename', () => {
    expect(parseSprintNumber('sprint-042.md')).toBe(42);
    expect(parseSprintNumber('sprint-001.md')).toBe(1);
    expect(parseSprintNumber('sprint-100.md')).toBe(100);
  });

  it('returns 0 for invalid filenames', () => {
    expect(parseSprintNumber('invalid.md')).toBe(0);
    expect(parseSprintNumber('')).toBe(0);
  });
});

describe('parseSprintLog', () => {
  it('parses all metrics from sprint log', () => {
    const summary = parseSprintLog(SAMPLE_SPRINT_LOG);
    expect(summary.sprintNumber).toBe(42);
    expect(summary.totalTasks).toBe(8);
    expect(summary.completed).toBe(3);
    expect(summary.techDebt).toBe(3);
    expect(summary.noGo).toBe(5);
    expect(summary.durationMs).toBe(2405394);
  });

  it('parses task list', () => {
    const summary = parseSprintLog(SAMPLE_SPRINT_LOG);
    expect(summary.tasks).toHaveLength(8);
    expect(summary.tasks[0]).toContain('Close All Open Tech Debt');
  });

  it('handles empty content gracefully', () => {
    const summary = parseSprintLog('');
    expect(summary.sprintNumber).toBe(0);
    expect(summary.totalTasks).toBe(0);
    expect(summary.goal).toBe('No goal recorded');
    expect(summary.tasks).toHaveLength(0);
  });

  it('handles content with missing metrics', () => {
    const content = '# sprint-010\n\nSome text without metrics table.';
    const summary = parseSprintLog(content);
    expect(summary.sprintNumber).toBe(10);
    expect(summary.totalTasks).toBe(0);
    expect(summary.completed).toBe(0);
  });
});

describe('parseRetroLearnings', () => {
  it('extracts learnings from RETRO content', () => {
    const learnings = parseRetroLearnings(SAMPLE_RETRO);
    expect(learnings.items).toHaveLength(3);
    expect(learnings.items[0]).toContain('npm Publish Validation');
  });

  it('limits to max 3 learnings', () => {
    const learnings = parseRetroLearnings(SAMPLE_RETRO);
    expect(learnings.items.length).toBeLessThanOrEqual(3);
  });

  it('returns empty for content without learnings section', () => {
    const learnings = parseRetroLearnings('# Retro\n\n## Summary\nDone.');
    expect(learnings.items).toHaveLength(0);
  });

  it('returns empty for empty content', () => {
    const learnings = parseRetroLearnings('');
    expect(learnings.items).toHaveLength(0);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds to human-readable', () => {
    expect(formatDuration(2405394)).toBe('40m 5s');
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(5000)).toBe('5s');
  });

  it('returns unknown for zero or negative', () => {
    expect(formatDuration(0)).toBe('unknown');
    expect(formatDuration(-100)).toBe('unknown');
  });
});

describe('buildExplainOutput', () => {
  it('builds formatted output with all sections', () => {
    const summary = parseSprintLog(SAMPLE_SPRINT_LOG);
    const learnings = parseRetroLearnings(SAMPLE_RETRO);
    const output = buildExplainOutput(summary, learnings);

    expect(output).toContain('Sprint #42 Summary');
    expect(output).toContain('6 tasks completed successfully');
    expect(output).toContain('5 tasks failed (NO_GO)');
    expect(output).toContain('3 tasks completed with tech debt');
    expect(output).toContain('Duration: 40m 5s');
    expect(output).toContain('Key learnings:');
    expect(output).toContain('deckent start');
    expect(output).toContain('deckent plan');
  });

  it('skips learnings section when empty', () => {
    const summary = parseSprintLog(SAMPLE_SPRINT_LOG);
    const learnings = { items: [] };
    const output = buildExplainOutput(summary, learnings);

    expect(output).not.toContain('Key learnings:');
  });

  it('skips duration when zero', () => {
    const summary = parseSprintLog('# sprint-001\n\nNo metrics.');
    const learnings = { items: [] };
    const output = buildExplainOutput(summary, learnings);

    expect(output).not.toContain('Duration:');
  });
});

describe('findLatestSprintLog', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
    vi.mocked(readdirSync).mockReset();
  });

  it('returns latest sprint file by sort order', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['sprint-040.md', 'sprint-042.md', 'sprint-041.md'] as unknown as ReturnType<typeof readdirSync>,
    );
    expect(findLatestSprintLog('/mock/root')).toBe('sprint-042.md');
  });

  it('returns null when no sprints directory', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(findLatestSprintLog('/mock/root')).toBeNull();
  });

  it('returns null when sprints directory is empty', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);
    expect(findLatestSprintLog('/mock/root')).toBeNull();
  });

  it('filters non-sprint files', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['README.md', 'sprint-005.md', '.DS_Store'] as unknown as ReturnType<typeof readdirSync>,
    );
    expect(findLatestSprintLog('/mock/root')).toBe('sprint-005.md');
  });
});

// ─── Integration: CLI Command ───────────────────────────────────────

describe('deckent explain command', () => {
  beforeEach(() => {
    vi.mocked(print).mockReset();
    vi.mocked(existsSync).mockReset();
    vi.mocked(readdirSync).mockReset();
    vi.mocked(readFileSync).mockReset();
  });

  it('prints no-sprints message when none exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await runCommand(['explain']);

    expect(vi.mocked(print)).toHaveBeenCalledWith(
      'No sprints found. Run `deckent start` to begin.',
    );
  });

  it('reads latest sprint log and formats output', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['sprint-042.md'] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p.includes('sprint-042.md')) return SAMPLE_SPRINT_LOG;
      if (p.includes('RETRO.md')) return SAMPLE_RETRO;
      return '';
    });

    await runCommand(['explain']);

    const output = vi.mocked(print).mock.calls[0]?.[0] ?? '';
    expect(output).toContain('Sprint #42 Summary');
    expect(output).toContain('6 tasks completed successfully');
    expect(output).toContain('5 tasks failed (NO_GO)');
  });

  it('handles empty RETRO gracefully', async () => {
    vi.mocked(existsSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p.includes('sprints')) return true;
      if (p.includes('RETRO')) return false;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(
      ['sprint-010.md'] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockReturnValue('# sprint-010\n\n## Metrics\n| Metric | Value |\n|--------|-------|\n| Total Tasks | 2 |\n| Completed | 2 |\n| Tech Debt | 0 |\n| No-Go | 0 |\n| Duration | 30000ms |');

    await runCommand(['explain']);

    const output = vi.mocked(print).mock.calls[0]?.[0] ?? '';
    expect(output).toContain('Sprint #10 Summary');
    expect(output).not.toContain('Key learnings:');
  });

  it('shows next steps in output', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      ['sprint-042.md'] as unknown as ReturnType<typeof readdirSync>,
    );
    vi.mocked(readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p.includes('sprint-042.md')) return SAMPLE_SPRINT_LOG;
      if (p.includes('RETRO.md')) return SAMPLE_RETRO;
      return '';
    });

    await runCommand(['explain']);

    const output = vi.mocked(print).mock.calls[0]?.[0] ?? '';
    expect(output).toContain('Next: Run `deckent start` to continue, or `deckent plan` to see next sprint');
  });
});
