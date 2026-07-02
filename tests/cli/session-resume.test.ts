/**
 * TERM-RESUME (Sprint 357, Task 357-007) — hermetic tests.
 *
 * Real tmpdir fixtures (no fs mocking) writing actual `.deckent/runtime/jobs/*.json`
 * files, mirroring the "real tmpdir" layer used by the sibling progress-reader.test.ts.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  listRecentSessions,
  pickSession,
  parseSessionRecord,
  type SessionRecord,
} from '../../src/cli/helpers/session-resume.js';

// ─── fixture helpers ────────────────────────────────────────────────────────

let tmpRoot: string;

afterEach(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

function makeRoot(): string {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-session-resume-'));
  return tmpRoot;
}

function jobsDirOf(root: string): string {
  const dir = join(root, '.deckent', 'runtime', 'jobs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJob(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, 'utf-8');
}

function record(overrides: Partial<{
  jobId: string; sprintId: string; status: string; summary: string;
  startedAt: string; completedAt: string; endedAt: string;
}> = {}): string {
  return JSON.stringify({
    jobId: 'sprint-100',
    status: 'COMPLETE',
    startedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  });
}

// ─── parseSessionRecord — pure core ────────────────────────────────────────

describe('parseSessionRecord', () => {
  it('parses a full modern job record', () => {
    const rec = parseSessionRecord(record({
      sprintId: 'sprint-353', summary: 'Sprint sprint-353 tamamlandı — 16/16 task başarılı',
      completedAt: '2026-07-01T22:59:04.279Z',
    }));
    expect(rec).toEqual<SessionRecord>({
      id: 'sprint-353',
      title: 'Sprint sprint-353 tamamlandı — 16/16 task başarılı',
      date: '2026-07-01T22:59:04.279Z',
      status: 'COMPLETE',
    });
  });

  it('falls back to jobId for id and title, and startedAt for date, when minimal (RUNNING)', () => {
    const rec = parseSessionRecord(record({ jobId: 'run-mnomfzeq', status: 'RUNNING' }));
    expect(rec).toEqual<SessionRecord>({
      id: 'run-mnomfzeq',
      title: 'run-mnomfzeq',
      date: '2026-07-01T10:00:00.000Z',
      status: 'RUNNING',
    });
  });

  it('prefers sprintId over jobId for id when both present but summary is absent', () => {
    const rec = parseSessionRecord(record({ jobId: 'sprint-1774178344077', sprintId: 'sprint-033' }));
    expect(rec?.id).toBe('sprint-033');
    expect(rec?.title).toBe('sprint-033');
  });

  it('prefers completedAt, then endedAt, then startedAt for date', () => {
    const withCompleted = parseSessionRecord(record({
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T01:00:00.000Z',
      completedAt: '2026-01-01T02:00:00.000Z',
    }));
    expect(withCompleted?.date).toBe('2026-01-01T02:00:00.000Z');

    const withEnded = parseSessionRecord(record({
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T01:00:00.000Z',
    }));
    expect(withEnded?.date).toBe('2026-01-01T01:00:00.000Z');
  });

  it('returns null on malformed JSON', () => {
    expect(parseSessionRecord('{not valid json')).toBeNull();
  });

  it('returns null when JSON is not an object', () => {
    expect(parseSessionRecord('"just a string"')).toBeNull();
    expect(parseSessionRecord('42')).toBeNull();
    expect(parseSessionRecord('null')).toBeNull();
  });

  it('returns null when neither sprintId nor jobId is present', () => {
    expect(parseSessionRecord(JSON.stringify({ status: 'COMPLETE', startedAt: '2026-01-01T00:00:00.000Z' }))).toBeNull();
  });

  it('returns null when status is missing', () => {
    expect(parseSessionRecord(JSON.stringify({ jobId: 'run-x', startedAt: '2026-01-01T00:00:00.000Z' }))).toBeNull();
  });

  it('returns null when no valid date field is present', () => {
    expect(parseSessionRecord(JSON.stringify({ jobId: 'run-x', status: 'RUNNING' }))).toBeNull();
  });

  it('returns null when the only date field is an unparseable string', () => {
    expect(parseSessionRecord(JSON.stringify({ jobId: 'run-x', status: 'RUNNING', startedAt: 'not-a-date' }))).toBeNull();
  });
});

// ─── listRecentSessions — disk-verified, degrade-safe ──────────────────────

describe('listRecentSessions', () => {
  it('returns [] when the jobs directory does not exist (fresh checkout / pre-init)', () => {
    const root = makeRoot();
    expect(listRecentSessions(root, 5)).toEqual([]);
  });

  it('returns [] when n <= 0', () => {
    const root = makeRoot();
    const dir = jobsDirOf(root);
    writeJob(dir, 'sprint-1.json', record({ sprintId: 'sprint-1' }));
    expect(listRecentSessions(root, 0)).toEqual([]);
    expect(listRecentSessions(root, -3)).toEqual([]);
  });

  it('lists sessions newest-first', () => {
    const root = makeRoot();
    const dir = jobsDirOf(root);
    writeJob(dir, 'sprint-1.json', record({ sprintId: 'sprint-1', completedAt: '2026-07-01T00:00:00.000Z' }));
    writeJob(dir, 'sprint-2.json', record({ sprintId: 'sprint-2', completedAt: '2026-07-03T00:00:00.000Z' }));
    writeJob(dir, 'sprint-3.json', record({ sprintId: 'sprint-3', completedAt: '2026-07-02T00:00:00.000Z' }));

    const sessions = listRecentSessions(root, 10);
    expect(sessions.map(s => s.id)).toEqual(['sprint-2', 'sprint-3', 'sprint-1']);
  });

  it('caps the result at n', () => {
    const root = makeRoot();
    const dir = jobsDirOf(root);
    for (let i = 0; i < 5; i++) {
      writeJob(dir, `sprint-${i}.json`, record({
        sprintId: `sprint-${i}`,
        completedAt: `2026-07-0${i + 1}T00:00:00.000Z`,
      }));
    }
    const sessions = listRecentSessions(root, 2);
    expect(sessions).toHaveLength(2);
    expect(sessions.map(s => s.id)).toEqual(['sprint-4', 'sprint-3']);
  });

  it('skips corrupted records and non-json files without throwing', () => {
    const root = makeRoot();
    const dir = jobsDirOf(root);
    writeJob(dir, 'sprint-good.json', record({ sprintId: 'sprint-good', completedAt: '2026-07-01T00:00:00.000Z' }));
    writeJob(dir, 'sprint-bad.json', '{not valid json');
    writeJob(dir, 'sprint-empty.json', JSON.stringify({ status: 'RUNNING' }));
    writeJob(dir, 'readme.txt', 'not a job file at all');

    const sessions = listRecentSessions(root, 10);
    expect(sessions.map(s => s.id)).toEqual(['sprint-good']);
  });

  it('ignores an unreadable directory gracefully', () => {
    const root = makeRoot();
    // No jobs dir at all under a root that does exist -> still degrade-safe.
    mkdirSync(join(root, '.deckent'), { recursive: true });
    expect(listRecentSessions(root, 5)).toEqual([]);
  });
});

// ─── pickSession — number / id / title-prefix, ambiguity-safe ─────────────

describe('pickSession', () => {
  const sessions: SessionRecord[] = [
    { id: 'sprint-353', title: 'Fix login bug', date: '2026-07-02T00:00:00.000Z', status: 'COMPLETE' },
    { id: 'sprint-352', title: 'Fix logout race', date: '2026-07-01T00:00:00.000Z', status: 'COMPLETE' },
    { id: 'sprint-351', title: 'Add billing export', date: '2026-06-30T00:00:00.000Z', status: 'FAILED' },
  ];

  it('picks by 1-based number matching list position', () => {
    expect(pickSession('1', sessions)).toEqual({ kind: 'found', session: sessions[0] });
    expect(pickSession('3', sessions)).toEqual({ kind: 'found', session: sessions[2] });
  });

  it('reports not-found for an out-of-range number', () => {
    expect(pickSession('0', sessions)).toEqual({ kind: 'not-found' });
    expect(pickSession('99', sessions)).toEqual({ kind: 'not-found' });
  });

  it('picks by exact id', () => {
    expect(pickSession('sprint-352', sessions)).toEqual({ kind: 'found', session: sessions[1] });
  });

  it('picks by unique case-insensitive title prefix', () => {
    expect(pickSession('add bill', sessions)).toEqual({ kind: 'found', session: sessions[2] });
    expect(pickSession('FIX LOGIN', sessions)).toEqual({ kind: 'found', session: sessions[0] });
  });

  it('reports ambiguous when a title prefix matches multiple sessions', () => {
    const result = pickSession('fix log', sessions);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.matches.map(m => m.id).sort()).toEqual(['sprint-352', 'sprint-353']);
    }
  });

  it('reports ambiguous when the session list itself has a duplicate id', () => {
    const dupeSessions: SessionRecord[] = [
      { id: 'sprint-x', title: 'First', date: '2026-07-02T00:00:00.000Z', status: 'COMPLETE' },
      { id: 'sprint-x', title: 'Second', date: '2026-07-01T00:00:00.000Z', status: 'COMPLETE' },
    ];
    const result = pickSession('sprint-x', dupeSessions);
    expect(result.kind).toBe('ambiguous');
  });

  it('reports not-found for empty input and no match', () => {
    expect(pickSession('', sessions)).toEqual({ kind: 'not-found' });
    expect(pickSession('   ', sessions)).toEqual({ kind: 'not-found' });
    expect(pickSession('does-not-exist', sessions)).toEqual({ kind: 'not-found' });
  });

  it('returns not-found against an empty session list', () => {
    expect(pickSession('1', [])).toEqual({ kind: 'not-found' });
    expect(pickSession('sprint-353', [])).toEqual({ kind: 'not-found' });
  });
});
