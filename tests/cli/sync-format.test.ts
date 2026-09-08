import { describe, it, expect } from 'vitest';
import { formatSyncOutput, truncateFileList } from '../../src/cli/commands/sync.js';
import type { SyncResult } from '../../src/cli/commands/sync.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

/**
 * Focused, hermetic unit tests for the i18n localization of
 * `formatSyncOutput` / `truncateFileList` (bounded correction
 * 7104-sync-20260908). Pure functions only — no fs, no mocks, no process
 * spawning.
 */

// `MAX_FILE_LIST` is a module-private constant in sync.ts (not exported,
// and exporting it is out of scope for this bounded correction). Rather
// than hardcoding its current value, derive it from `truncateFileList`'s
// own observable behaviour so this test keeps working if the threshold
// is ever changed in sync.ts.
function deriveMaxFileList(): number {
  const probe = Array.from({ length: 500 }, (_, i) => `probe-file-${i}.ts`);
  const output = truncateFileList(probe, 'en');
  const match = output.match(/^(.+), and (\d+) more\.\.\.$/);
  if (!match) {
    throw new Error(
      'truncateFileList did not truncate a 500-file probe list — cannot derive MAX_FILE_LIST',
    );
  }
  const visible = match[1]!.split(', ').length;
  const remaining = Number(match[2]);
  expect(visible + remaining).toBe(probe.length);
  return visible;
}

describe('formatSyncOutput — zero commits', () => {
  const zero: SyncResult = {
    commits: 0,
    sprintId: 'sprint-001',
    modified: [],
    added: [],
    deleted: [],
    renamed: [],

      detection: { mode: 'range', issue: null },
    };

  it('EN: returns sync.no_changes', () => {
    expect(formatSyncOutput(zero, 'en')).toBe(getMessage('sync.no_changes', 'en'));
    expect(formatSyncOutput(zero, 'en')).toBe('No changes since last sprint');
  });

  it('TR: returns sync.no_changes', () => {
    expect(formatSyncOutput(zero, 'tr')).toBe(getMessage('sync.no_changes', 'tr'));
    expect(formatSyncOutput(zero, 'tr')).toBe('Son sprintten bu yana değişiklik yok');
  });
});

describe('formatSyncOutput — full result (modified/added/deleted/renamed)', () => {
  const full: SyncResult = {
    commits: 2,
    sprintId: 'sprint-042',
    modified: ['a.ts', 'b.ts'],
    added: ['c.ts'],
    deleted: ['d.ts'],
    renamed: ['e.ts -> f.ts'],

      detection: { mode: 'range', issue: null },
    };

  it("EN: matches the getMessage-composed output and today's legacy literal text byte-for-byte", () => {
    const sprintLabel = getMessage('sync.format_sprint_label', 'en', { n: '042' });
    const expected = [
      getMessage('sync.format_synced', 'en', { commits: '2', sprint: sprintLabel }),
      getMessage('sync.format_modified', 'en', { files: 'a.ts, b.ts' }),
      getMessage('sync.format_new', 'en', { files: 'c.ts' }),
      getMessage('sync.format_deleted', 'en', { files: 'd.ts' }),
      getMessage('sync.format_renamed', 'en', { files: 'e.ts -> f.ts' }),
      getMessage('sync.format_recorded', 'en'),
    ].join('\n');

    const output = formatSyncOutput(full, 'en');
    expect(output).toBe(expected);

    // Legacy pre-i18n hardcoded EN text, preserved byte-for-byte.
    expect(output).toBe(
      [
        'Synced: 2 commit(s) since Sprint #042',
        '  Modified: a.ts, b.ts',
        '  New: c.ts',
        '  Deleted: d.ts',
        '  Renamed: e.ts -> f.ts',
        '  → Recorded to memory.db for next sprint context',
      ].join('\n'),
    );
  });

  it('TR: matches the getMessage-composed output', () => {
    const sprintLabel = getMessage('sync.format_sprint_label', 'tr', { n: '042' });
    const expected = [
      getMessage('sync.format_synced', 'tr', { commits: '2', sprint: sprintLabel }),
      getMessage('sync.format_modified', 'tr', { files: 'a.ts, b.ts' }),
      getMessage('sync.format_new', 'tr', { files: 'c.ts' }),
      getMessage('sync.format_deleted', 'tr', { files: 'd.ts' }),
      getMessage('sync.format_renamed', 'tr', { files: 'e.ts -> f.ts' }),
      getMessage('sync.format_recorded', 'tr'),
    ].join('\n');

    expect(formatSyncOutput(full, 'tr')).toBe(expected);
    expect(formatSyncOutput(full, 'tr')).toBe(
      [
        'Senkronlandı: Sprint #042 sonrası 2 commit',
        '  Değiştirilen: a.ts, b.ts',
        '  Yeni: c.ts',
        '  Silinen: d.ts',
        '  Yeniden adlandırılan: e.ts -> f.ts',
        "  → Sonraki sprint bağlamı için memory.db'ye kaydedildi",
      ].join('\n'),
    );
  });
});

describe('formatSyncOutput — sprintId null falls back to "last sprint"', () => {
  const noSprint: SyncResult = {
    commits: 1,
    sprintId: null,
    modified: ['x.ts'],
    added: [],
    deleted: [],
    renamed: [],

      detection: { mode: 'range', issue: null },
    };

  it('EN: uses sync.format_last_sprint', () => {
    const output = formatSyncOutput(noSprint, 'en');
    expect(output).toContain(getMessage('sync.format_last_sprint', 'en'));
    expect(output).toContain('Synced: 1 commit(s) since last sprint');
    expect(output).not.toContain('Sprint #');
  });

  it('TR: uses sync.format_last_sprint', () => {
    const output = formatSyncOutput(noSprint, 'tr');
    expect(output).toContain(getMessage('sync.format_last_sprint', 'tr'));
    expect(output).toContain('Senkronlandı: son sprint sonrası 1 commit');
  });
});

describe('truncateFileList — "more" suffix over MAX_FILE_LIST', () => {
  it('EN: MAX_FILE_LIST+3 files → ", and 3 more..." suffix with the right remainder', () => {
    const maxFileList = deriveMaxFileList();
    const files = Array.from({ length: maxFileList + 3 }, (_, i) => `file-${i}.ts`);

    const output = truncateFileList(files, 'en');
    expect(output.endsWith(', and 3 more...')).toBe(true);

    const match = output.match(/^(.+), and (\d+) more\.\.\.$/);
    expect(match).not.toBeNull();
    expect(Number(match![2])).toBe(3);
    expect(match![1]!.split(', ')).toHaveLength(maxFileList);
  });

  it('TR: MAX_FILE_LIST+3 files → " ve 3 tane daha..." suffix', () => {
    const maxFileList = deriveMaxFileList();
    const files = Array.from({ length: maxFileList + 3 }, (_, i) => `file-${i}.ts`);

    const output = truncateFileList(files, 'tr');
    expect(output.endsWith(' ve 3 tane daha...')).toBe(true);
    expect(output).toBe(
      `${files.slice(0, maxFileList).join(', ')} ve 3 tane daha...`,
    );
  });

  it('does not truncate when file count is at or below MAX_FILE_LIST', () => {
    const maxFileList = deriveMaxFileList();
    const files = Array.from({ length: maxFileList }, (_, i) => `file-${i}.ts`);

    expect(truncateFileList(files, 'en')).toBe(files.join(', '));
    expect(truncateFileList(files, 'en')).not.toContain('more...');
    expect(truncateFileList(files, 'tr')).not.toContain('tane daha');
  });

  it('omitting lang falls back to getLanguage() without throwing (below-threshold path)', () => {
    const files = ['solo.ts'];
    expect(truncateFileList(files)).toBe('solo.ts');
  });

  it('omitting lang falls back to getLanguage() without throwing (over-threshold path, either language suffix)', () => {
    const maxFileList = deriveMaxFileList();
    const files = Array.from({ length: maxFileList + 3 }, (_, i) => `file-${i}.ts`);

    const output = truncateFileList(files);
    const hasEnSuffix = output.includes(', and 3 more...');
    const hasTrSuffix = output.includes(' ve 3 tane daha...');
    expect(hasEnSuffix || hasTrSuffix).toBe(true);
  });
});
