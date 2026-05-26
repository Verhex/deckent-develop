import { describe, it, expect } from 'vitest';
import {
  parseSprintNum,
  parseMetricsFromContent,
  parseTasksFromLogContent,
  categorizeTitle,
  buildEntry,
  detectExistingEntries,
  insertEntries,
} from '../../scripts/changelog-backfill.mjs';

describe('parseSprintNum', () => {
  it('parses valid sprint ids', () => {
    expect(parseSprintNum('sprint-157')).toBe(157);
    expect(parseSprintNum('sprint-194')).toBe(194);
  });

  it('returns NaN for invalid input', () => {
    expect(parseSprintNum('not-a-sprint')).toBeNaN();
  });
});

describe('parseMetricsFromContent', () => {
  it('parses markdown table format from sprint log files', () => {
    const content = `# sprint-156
## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 22 |
| Completed | 10 |
| Tech Debt | 4 |
| No-Go | 12 |
| Coverage | NaN% |
`;
    const m = parseMetricsFromContent(content);
    expect(m.total).toBe(22);
    expect(m.done).toBe(10);
    expect(m.techDebt).toBe(4);
    expect(m.noGo).toBe(12);
  });

  it('parses bullet format from newer DB sprint entries', () => {
    const content = `# sprint-185\n\n- Total tasks: 7\n- Completed: 7\n- NO_GO: 0\n- Coverage: 0.0%\n`;
    const m = parseMetricsFromContent(content);
    expect(m.total).toBe(7);
    expect(m.done).toBe(7);
    expect(m.noGo).toBe(0);
  });

  it('returns zeros for empty content', () => {
    const m = parseMetricsFromContent('');
    expect(m.total).toBe(0);
    expect(m.done).toBe(0);
  });
});

describe('parseTasksFromLogContent', () => {
  const sampleLogContent = `# sprint-163
## Metrics
| Total Tasks | 6 |
| Completed | 6 |

## Tasks
| Task | Agent | Skills | Status |
|------|-------|--------|--------|
| 163-001: Brain Spurious NO_GO Reconciliation Wire Restore (B1) | bug-fixer | typescript-expert | DONE |
| 163-002: Docker container_start_failed Health Check (B2) | bug-fixer | typescript-expert | DONE |
| 163-003: Fix legacy crash | bug-fixer | - | GO_WITH_TECH_DEBT |
| 163-004: Some task | doc-writer | - | NO_GO |
`;

  it('parses task list from ## Tasks section only', () => {
    const tasks = parseTasksFromLogContent(sampleLogContent);
    expect(tasks.length).toBeGreaterThanOrEqual(3);
    expect(tasks[0].title).toBe('Brain Spurious NO_GO Reconciliation Wire Restore (B1)');
    expect(tasks[0].status).toBe('DONE');
  });

  it('includes GO_WITH_TECH_DEBT tasks', () => {
    const tasks = parseTasksFromLogContent(sampleLogContent);
    const techDebt = tasks.find(t => t.status === 'GO_WITH_TECH_DEBT');
    expect(techDebt).toBeDefined();
    expect(techDebt?.title).toBe('Fix legacy crash');
  });

  it('returns empty array when no ## Tasks section exists', () => {
    const noTasksContent = '# sprint-157\n\n## Metrics\n| Total | 0 |\n';
    expect(parseTasksFromLogContent(noTasksContent)).toHaveLength(0);
  });

  it('does not pick up narrative bullet points from retro content', () => {
    const retroContent = `# Sprint sprint-162 Retrospective\n\n## Highlights\n- 3 tasks completed on first try\n- No boundary violations detected\n\n## Metrics\n| Tasks completed | 2/4 |\n`;
    const tasks = parseTasksFromLogContent(retroContent);
    expect(tasks).toHaveLength(0);
  });
});

describe('categorizeTitle', () => {
  it('categorizes fix/bug titles as fixed', () => {
    expect(categorizeTitle('Fix something broken')).toBe('fixed');
    expect(categorizeTitle('Bug fix for auth')).toBe('fixed');
    expect(categorizeTitle('hotfix crash on startup')).toBe('fixed');
  });

  it('categorizes other titles as added', () => {
    expect(categorizeTitle('New feature for routing')).toBe('added');
    expect(categorizeTitle('ADR-045 documentation')).toBe('added');
  });
});

describe('buildEntry', () => {
  it('generates a valid changelog entry with tasks', () => {
    const metrics = { total: 5, done: 3, techDebt: 1, noGo: 1 };
    const tasks = [
      { title: 'New routing engine', status: 'DONE' },
      { title: 'Fix auth bug', status: 'DONE' },
      { title: 'Cleanup old code', status: 'GO_WITH_TECH_DEBT' },
      { title: 'Broken task', status: 'NO_GO' },
    ];
    const entry = buildEntry(157, '2026-05-13', metrics, tasks);

    expect(entry).toContain('## [1.0.0-beta.1-sprint157] - 2026-05-13');
    expect(entry).toContain('### Added');
    expect(entry).toContain('- New routing engine');
    expect(entry).toContain('### Fixed');
    expect(entry).toContain('- Fix auth bug');
    expect(entry).toContain('### Changed');
    expect(entry).toContain('(completed with tech debt)');
    expect(entry).not.toContain('Broken task');
    expect(entry).toContain('_Tasks: 5 total, 3 done, 1 tech debt, 1 no-go_');
  });

  it('uses "No completed tasks" placeholder when no done tasks', () => {
    const metrics = { total: 3, done: 0, techDebt: 0, noGo: 3 };
    const entry = buildEntry(160, '2026-05-13', metrics, []);
    expect(entry).toContain('### Added');
    expect(entry).toContain('- No completed tasks');
    expect(entry).toContain('_Tasks: 3 total, 0 done, 0 tech debt, 3 no-go_');
  });
});

describe('detectExistingEntries', () => {
  it('detects sprint entries in CHANGELOG content', () => {
    const content = `# Changelog\n\n## [1.0.0-beta.1-sprint193] - 2026-05-24\n\n### Added\n- foo\n\n## [1.0.0-beta.1-sprint172] - 2026-05-18\n\n### Added\n- bar\n`;
    const existing = detectExistingEntries(content);
    expect(existing.has(193)).toBe(true);
    expect(existing.has(172)).toBe(true);
    expect(existing.has(157)).toBe(false);
  });

  it('returns empty set for changelog with no sprint entries', () => {
    const empty = detectExistingEntries('# Changelog\n\n## [Unreleased]\n\n');
    expect(empty.size).toBe(0);
  });
});

describe('insertEntries', () => {
  const baseChangelog = `# Changelog

> Header note.

## [1.0.0-beta.1-sprint175] - 2026-05-19

### Added

- Task A

_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint172] - 2026-05-18

### Added

- Task B

_Tasks: 2 total, 2 done, 0 tech debt, 0 no-go_
`;

  it('inserts new entries in newest-first order', () => {
    const newEntries = new Map([
      [194, '## [1.0.0-beta.1-sprint194] - 2026-05-26\n\n### Added\n\n- Sprint 194\n\n_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_\n'],
      [162, '## [1.0.0-beta.1-sprint162] - 2026-05-12\n\n### Added\n\n- Sprint 162\n\n_Tasks: 4 total, 2 done, 0 tech debt, 2 no-go_\n'],
    ]);
    const result = insertEntries(baseChangelog, newEntries);

    // 194 should appear before 175
    const idx194 = result.indexOf('sprint194');
    const idx175 = result.indexOf('sprint175');
    const idx172 = result.indexOf('sprint172');
    const idx162 = result.indexOf('sprint162');

    expect(idx194).toBeLessThan(idx175);
    expect(idx175).toBeLessThan(idx172);
    expect(idx172).toBeLessThan(idx162);
  });

  it('is idempotent — duplicate insertions do not create new entries', () => {
    const entry = '## [1.0.0-beta.1-sprint194] - 2026-05-26\n\n### Added\n\n- Sprint 194\n\n_Tasks: 0 total, 0 done, 0 tech debt, 0 no-go_\n';
    const firstInsert = insertEntries(baseChangelog, new Map([[194, entry]]));
    const secondInsert = insertEntries(firstInsert, new Map([[194, entry]]));

    const countFirst = (firstInsert.match(/sprint194/g) ?? []).length;
    const countSecond = (secondInsert.match(/sprint194/g) ?? []).length;
    expect(countFirst).toBe(countSecond);
  });

  it('preserves the header section', () => {
    const result = insertEntries(baseChangelog, new Map());
    expect(result).toContain('# Changelog');
    expect(result).toContain('> Header note.');
  });
});
