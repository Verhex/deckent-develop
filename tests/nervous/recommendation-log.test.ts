// tests/nervous/recommendation-log.test.ts
//
// Nervous recommendation inbox — the durable feed where medium/safety-floor
// nervous actions land a Brain-actionable proposal (ADR-037: nervous proposes,
// Brain disposes). Hermetic: tmpdir project root, cleaned in afterEach.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recordRecommendation,
  readRecommendations,
  dismissRecommendation,
  RECOMMENDATIONS_FILE,
  type NervousRecommendation,
} from '../../src/nervous/recommendation-log.js';

describe('nervous recommendation-log', () => {
  let root: string;

  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
    root = undefined as unknown as string;
  });

  function makeRoot(): string {
    root = mkdtempSync(join(tmpdir(), 'deckent-rec-'));
    return root;
  }

  it('appends a recommendation as one JSONL line and stamps id + createdAt', () => {
    const r = makeRoot();
    const rec = recordRecommendation(r, 'DEBT_REPRIORITIZE', { debtId: 'D-12', to: 'HIGH' });

    expect(rec.actionId).toBe('DEBT_REPRIORITIZE');
    expect(rec.status).toBe('open');
    expect(rec.id).toMatch(/^rec-/);
    expect(typeof rec.createdAt).toBe('string');
    expect(rec.payload).toEqual({ debtId: 'D-12', to: 'HIGH' });

    const path = join(r, RECOMMENDATIONS_FILE);
    expect(existsSync(path)).toBe(true);
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as NervousRecommendation;
    expect(parsed.id).toBe(rec.id);
  });

  it('creates the .deckent directory when absent', () => {
    const r = makeRoot();
    expect(existsSync(join(r, '.deckent'))).toBe(false);
    recordRecommendation(r, 'AGENT_PERFORMANCE_FLAG', { agent: 'doc-writer' });
    expect(existsSync(join(r, RECOMMENDATIONS_FILE))).toBe(true);
  });

  it('appends multiple recommendations (append-only, newest last)', () => {
    const r = makeRoot();
    recordRecommendation(r, 'SKILL_ROUTING_ADJUST', { skill: 'react-specialist' });
    recordRecommendation(r, 'SCOPE_COLLISION_REORDER', { tasks: ['001', '002'] });
    const all = readRecommendations(r);
    expect(all).toHaveLength(2);
    expect(all[0].actionId).toBe('SKILL_ROUTING_ADJUST');
    expect(all[1].actionId).toBe('SCOPE_COLLISION_REORDER');
  });

  it('readRecommendations returns [] when the feed is absent', () => {
    const r = makeRoot();
    expect(readRecommendations(r)).toEqual([]);
  });

  it('dismissRecommendation flips an open entry to dismissed (by full id)', () => {
    const r = makeRoot();
    const rec = recordRecommendation(r, 'DEBT_REPRIORITIZE', { debtId: 'D-1' });
    expect(dismissRecommendation(r, rec.id)).toBe(true);
    const all = readRecommendations(r);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('dismissed');
  });

  it('dismissRecommendation matches a unique rec- prefix and leaves others open', () => {
    const r = makeRoot();
    const a = recordRecommendation(r, 'SPRINT_START', {});
    recordRecommendation(r, 'COMMIT_PUSH', {});
    const prefix = a.id.slice(0, 14); // 'rec-' + 10 uuid chars
    expect(dismissRecommendation(r, prefix)).toBe(true);
    const all = readRecommendations(r);
    expect(all.find((x) => x.id === a.id)!.status).toBe('dismissed');
    expect(all.filter((x) => x.status === 'open')).toHaveLength(1);
  });

  it('dismissRecommendation returns false when no open match exists', () => {
    const r = makeRoot();
    recordRecommendation(r, 'SPRINT_START', {});
    expect(dismissRecommendation(r, 'rec-nonexistent')).toBe(false);
    // dismissing an already-dismissed id is a no-op false
    const rec = recordRecommendation(r, 'COMMIT_PUSH', {});
    dismissRecommendation(r, rec.id);
    expect(dismissRecommendation(r, rec.id)).toBe(false);
  });

  it('readRecommendations skips malformed lines without throwing', () => {
    const r = makeRoot();
    recordRecommendation(r, 'COST_OVER_THRESHOLD', { estimateUsd: 12.5 });
    // corrupt the file with a junk line
    const path = join(r, RECOMMENDATIONS_FILE);
    const good = readFileSync(path, 'utf-8');
    writeFileSync(path, good + 'not-json\n', 'utf-8');
    const all = readRecommendations(r);
    expect(all).toHaveLength(1);
    expect(all[0].actionId).toBe('COST_OVER_THRESHOLD');
  });
});
