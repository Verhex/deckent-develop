// Activity-truth + episode-dedupe pins (Alperen, 2026-08-12).
//
// Live measurement (sprints 522-523): workers legitimately go hb-silent during
// long read/analysis turns (the hb contract writes on FILE CHANGE), while still
// writing .partial-result/.landing-proposal/.plan/.log — and the nervous
// stale-worker detector flooded the inbox with false positives on ALIVE workers,
// re-emitting on every cron tick. These tests pin the fix: staleness reads the
// freshest task-artifact mtime (not the hb file alone), a settled worker is
// never a candidate, and one silence-episode notifies exactly once.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
import type { DetectorContext } from '../../src/core/nervous-types.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-stale-truth-'));
  mkdirSync(join(root, '.tasks'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const THRESHOLD = 120_000;

function ctx(now: number, hbIso: string): DetectorContext {
  return {
    event: { source: 'cron' },
    now: new Date(now),
    projectRoot: root,
    sprintState: {
      sprintId: 'sprint-900',
      currentPhase: 'EXECUTE',
      activeWorkers: [{ id: 'w-900-001', taskId: '900-001', lastHeartbeat: hbIso }],
      openDebtCount: 0,
      totalTasks: 1,
      completedTasks: 0,
    },
  } as unknown as DetectorContext;
}

function touch(name: string, epochMs: number): void {
  const p = join(root, '.tasks', name);
  writeFileSync(p, 'x', 'utf-8');
  utimesSync(p, epochMs / 1000, epochMs / 1000);
}

describe('stale-worker activity truth (2026-08-12)', () => {
  it('a worker with an old hb but a fresh partial-result is NOT stale', () => {
    const now = Date.now();
    const oldHb = new Date(now - 10 * THRESHOLD).toISOString();
    touch('task-900-001.partial-result', now - 5_000);
    const d = new StaleWorkerDetector(THRESHOLD);
    expect(d.detect(ctx(now, oldHb))).toBeNull();
  });

  it('a settled worker (.result on disk) is never a stale candidate', () => {
    const now = Date.now();
    const oldHb = new Date(now - 10 * THRESHOLD).toISOString();
    touch('task-900-001.result', now - 9 * THRESHOLD);
    const d = new StaleWorkerDetector(THRESHOLD);
    expect(d.detect(ctx(now, oldHb))).toBeNull();
  });

  it('one silence-episode notifies exactly once — cron re-ticks stay silent', () => {
    const now = Date.now();
    const oldHb = new Date(now - 10 * THRESHOLD).toISOString();
    const d = new StaleWorkerDetector(THRESHOLD);
    const first = d.detect(ctx(now, oldHb));
    expect(first).not.toBeNull();
    expect(first!.title).toContain('w-900-001');
    // aynı sessizlik, sonraki cron tick'leri
    expect(d.detect(ctx(now + 30_000, oldHb))).toBeNull();
    expect(d.detect(ctx(now + 60_000, oldHb))).toBeNull();
  });

  it('activity refresh re-arms the episode — a NEW silence notifies again', () => {
    const start = Date.now();
    const oldHb = new Date(start - 10 * THRESHOLD).toISOString();
    const d = new StaleWorkerDetector(THRESHOLD);
    expect(d.detect(ctx(start, oldHb))).not.toBeNull();
    // worker canlandı: taze partial-result yazıyor → stale değil, episode
    // sıfırlanır (7094-F1d: .plan protokolden çıktı, aktivite listesinde değil)
    touch('task-900-001.partial-result', start + 60_000);
    expect(d.detect(ctx(start + 90_000, oldHb))).toBeNull();
    // sonra YENİDEN uzun sessizlik → yeni episode, yeniden bildirir
    const later = start + 60_000 + 10 * THRESHOLD;
    expect(d.detect(ctx(later, oldHb))).not.toBeNull();
  });
});
