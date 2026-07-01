/**
 * TERM-LIVE (Sprint 353, Task 353-007) — live-footer hermetic tests.
 *
 * buildLiveFooter() is a pure render function: no fs/network I/O, all data
 * arrives via the injected LiveFooterState seam. Proves: each of the 5
 * questions renders as its own line only when supplied (1-5 lines total),
 * an entirely empty state honestly collapses to "idle", NO_COLOR/FORCE_COLOR
 * are respected (via theme.ts env-awareness), and long lines are
 * width-truncated.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  buildLiveFooter,
  DEFAULT_LIVE_FOOTER_LABELS,
  type LiveFooterState,
} from '../../src/cli/helpers/live-footer.js';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[/;

let origNoColor: string | undefined;
let origForceColor: string | undefined;
function saveEnv(): void {
  origNoColor = process.env['NO_COLOR'];
  origForceColor = process.env['FORCE_COLOR'];
}
function restoreEnv(): void {
  if (origNoColor === undefined) delete process.env['NO_COLOR']; else process.env['NO_COLOR'] = origNoColor;
  if (origForceColor === undefined) delete process.env['FORCE_COLOR']; else process.env['FORCE_COLOR'] = origForceColor;
}
afterEach(restoreEnv);

// ─── Empty state → honest "idle" ────────────────────────────────────────────

describe('buildLiveFooter — empty state', () => {
  it('collapses an entirely empty state to a single honest "idle" line', () => {
    const lines = buildLiveFooter({});
    expect(lines).toEqual([DEFAULT_LIVE_FOOTER_LABELS.idle]);
  });

  it('empty strings for running/next are treated as absent (still idle)', () => {
    const lines = buildLiveFooter({ running: '', next: '' });
    expect(lines).toEqual([DEFAULT_LIVE_FOOTER_LABELS.idle]);
  });
});

// ─── Per-question line presence (1-5 lines) ─────────────────────────────────

describe('buildLiveFooter — per-question lines', () => {
  it('renders exactly one line when only "running" (Q1) is supplied', () => {
    const lines = buildLiveFooter({ running: 'task-353-007 · EXECUTE' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Running: task-353-007 · EXECUTE');
  });

  it('renders an elapsed line (Q2) from startedAt vs the injected clock', () => {
    const now = new Date('2026-07-01T12:10:00.000Z');
    const startedAt = '2026-07-01T12:00:00.000Z';
    const lines = buildLiveFooter({ startedAt }, { now });
    expect(lines).toEqual(['Elapsed: 10m']);
  });

  it('elapsed formats hours+minutes once past 60 minutes', () => {
    const now = new Date('2026-07-01T14:05:00.000Z');
    const startedAt = '2026-07-01T12:00:00.000Z';
    const lines = buildLiveFooter({ startedAt }, { now });
    expect(lines).toEqual(['Elapsed: 2h 5m']);
  });

  it('elapsed formats seconds when under a minute', () => {
    const now = new Date('2026-07-01T12:00:30.000Z');
    const startedAt = '2026-07-01T12:00:00.000Z';
    const lines = buildLiveFooter({ startedAt }, { now });
    expect(lines).toEqual(['Elapsed: 30s']);
  });

  it('an unparseable startedAt degrades to the unknown label rather than throwing', () => {
    const lines = buildLiveFooter({ startedAt: 'not-a-date' });
    expect(lines).toEqual([`Elapsed: ${DEFAULT_LIVE_FOOTER_LABELS.unknown}`]);
  });

  it('renders provider-health (Q3) — healthy/degraded/unknown', () => {
    const healthy = buildLiveFooter({ provider: { name: 'claude', healthy: true } });
    const degraded = buildLiveFooter({ provider: { name: 'claude', healthy: false } });
    const unknown = buildLiveFooter({ provider: { name: 'claude', healthy: 'unknown' } });
    expect(healthy).toEqual(['Provider: claude (healthy)']);
    expect(degraded).toEqual(['Provider: claude (degraded)']);
    expect(unknown).toEqual(['Provider: claude (unknown)']);
  });

  it('renders auth-state (Q4) — logged-in/logged-out/unknown', () => {
    expect(buildLiveFooter({ auth: 'logged-in' })).toEqual(['Auth: logged-in']);
    expect(buildLiveFooter({ auth: 'logged-out' })).toEqual(['Auth: logged-out']);
    expect(buildLiveFooter({ auth: 'unknown' })).toEqual(['Auth: unknown']);
  });

  it('renders "next" (Q5)', () => {
    const lines = buildLiveFooter({ next: '353-008' });
    expect(lines).toEqual(['Next: 353-008']);
  });

  it('renders all 5 questions as 5 lines, in Q1..Q5 order, when fully populated', () => {
    const now = new Date('2026-07-01T12:10:00.000Z');
    const state: LiveFooterState = {
      running: 'task-353-007',
      startedAt: '2026-07-01T12:00:00.000Z',
      provider: { name: 'claude', healthy: true },
      auth: 'logged-in',
      next: '353-008',
    };
    const lines = buildLiveFooter(state, { now });
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('Running: task-353-007');
    expect(lines[1]).toBe('Elapsed: 10m');
    expect(lines[2]).toBe('Provider: claude (healthy)');
    expect(lines[3]).toBe('Auth: logged-in');
    expect(lines[4]).toBe('Next: 353-008');
  });

  it('omits lines for questions the caller did not supply (partial state)', () => {
    const lines = buildLiveFooter({ running: 'task-353-007', next: '353-008' });
    expect(lines).toEqual(['Running: task-353-007', 'Next: 353-008']);
  });
});

// ─── NO_COLOR / FORCE_COLOR ──────────────────────────────────────────────────

describe('buildLiveFooter — color handling', () => {
  it('respects NO_COLOR — no ANSI escape codes on colorized lines', () => {
    saveEnv();
    process.env['NO_COLOR'] = '1';
    delete process.env['FORCE_COLOR'];
    const lines = buildLiveFooter({
      provider: { name: 'claude', healthy: true },
      auth: 'logged-out',
    });
    for (const line of lines) expect(line).not.toMatch(ANSI_RE);
    expect(lines).toEqual(['Provider: claude (healthy)', 'Auth: logged-out']);
  });

  it('emits ANSI color when FORCE_COLOR=1 on health/auth lines', () => {
    saveEnv();
    process.env['FORCE_COLOR'] = '1';
    delete process.env['NO_COLOR'];
    const lines = buildLiveFooter({
      provider: { name: 'claude', healthy: true },
      auth: 'logged-out',
    });
    for (const line of lines) expect(line).toMatch(ANSI_RE);
  });

  it('plain (uncolored) lines like "running"/"next" stay ANSI-free even under FORCE_COLOR', () => {
    saveEnv();
    process.env['FORCE_COLOR'] = '1';
    delete process.env['NO_COLOR'];
    const lines = buildLiveFooter({ running: 'task-353-007', next: '353-008' });
    for (const line of lines) expect(line).not.toMatch(ANSI_RE);
  });
});

// ─── Width truncation ────────────────────────────────────────────────────────

describe('buildLiveFooter — width truncation', () => {
  it('truncates a line exceeding the given width, preserving an ellipsis', () => {
    const lines = buildLiveFooter(
      { running: 'a very long running-task label that will not fit' },
      { width: 20 },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.length).toBe(20);
    expect(lines[0]?.endsWith('…')).toBe(true);
  });

  it('leaves a line untouched when it already fits the width', () => {
    const lines = buildLiveFooter({ running: 'short' }, { width: 80 });
    expect(lines).toEqual(['Running: short']);
  });

  it('does not corrupt ANSI escapes when truncating a colorized line (truncate-then-color)', () => {
    saveEnv();
    process.env['FORCE_COLOR'] = '1';
    delete process.env['NO_COLOR'];
    const lines = buildLiveFooter(
      { auth: 'logged-in' },
      { width: 6 },
    );
    // visible text still starts with the truncated content, wrapped in a single valid SGR pair
    expect(lines[0]).toMatch(/^\x1b\[32m.*\x1b\[0m$/);
  });
});

// ─── Label injection (string-free mechanism) ────────────────────────────────

describe('buildLiveFooter — label injection', () => {
  it('uses caller-supplied labels instead of the English defaults', () => {
    const lines = buildLiveFooter(
      { running: 'gorev-353-007' },
      { labels: { running: 'Çalışıyor' } },
    );
    expect(lines).toEqual(['Çalışıyor: gorev-353-007']);
  });

  it('falls back to English defaults for any label not overridden', () => {
    const lines = buildLiveFooter({}, { labels: { running: 'Çalışıyor' } });
    expect(lines).toEqual([DEFAULT_LIVE_FOOTER_LABELS.idle]);
  });
});
