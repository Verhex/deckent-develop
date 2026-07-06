/**
 * tests/core/pending-approvals-lifecycle.test.ts — W0-TRUTH (#491)
 *
 * Live lie (2026-07-06): four scope-collision approvals from 2026-07-01 still
 * showed as "⏳ Bekleyen onaylar: 4" five days later — `deckent nervous accept`
 * (MCP/CLI path) only enqueues to the executor IPC queue and never removes the
 * entry from the durable hub (`.deckent/nervous/nervous-pending.json`), and
 * nothing ever prunes entries whose own timeoutMs has long expired.
 *
 * Contract under test (write-side siblings of readPendingApprovals):
 *   1. removeNervousPending(root, id) — deletes exactly that entry, honest
 *      boolean result, tolerant of missing/corrupt files (never throws).
 *   2. pruneExpiredNervousPending(root, nowMs) — removes entries whose
 *      createdAt+timeoutMs < now; keeps unexpired; returns removed ids.
 *   3. handleNervousAccept removes the entry from the durable hub (both the
 *      nervous-enabled queue path and the disabled stub path).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readPendingApprovals,
  removeNervousPending,
  pruneExpiredNervousPending,
} from '../../src/core/pending-approvals.js';
import { NERVOUS_PENDING_FILE } from '../../src/core/constants.js';
import { handleNervousAccept } from '../../src/mcp/tools/nervous.js';

const NOW = Date.parse('2026-07-06T16:00:00.000Z');
const ID_EXPIRED = 'bde9980d-8dfe-4e91-ae2c-7f9ace020cf6';
const ID_FRESH = '11111111-2222-4333-8444-555555555555';

function seed(root: string): void {
  const p = join(root, NERVOUS_PENDING_FILE);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify([
    { id: ID_EXPIRED, title: 'Scope collision on 1 file(s)', type: 'scope-collision', createdAt: '2026-07-01T22:10:48.672Z', timeoutMs: 300_000 },
    { id: ID_FRESH, title: 'Fresh approval', type: 'scope-collision', createdAt: new Date(NOW - 60_000).toISOString(), timeoutMs: 3_600_000 },
  ]));
}

describe('W0 pending-approvals lifecycle', () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `w0-pending-${Math.random().toString(36).slice(2)}`);
    mkdirSync(root, { recursive: true });
    seed(root);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('removeNervousPending deletes exactly the named entry', () => {
    expect(removeNervousPending(root, ID_EXPIRED)).toBe(true);
    const left = readPendingApprovals(root).map(p => p.id);
    expect(left).toEqual([ID_FRESH]);
  });

  it('removeNervousPending is honest on a missing id and never throws on a missing file', () => {
    expect(removeNervousPending(root, 'no-such-id')).toBe(false);
    rmSync(join(root, NERVOUS_PENDING_FILE));
    expect(removeNervousPending(root, ID_EXPIRED)).toBe(false);
  });

  it('pruneExpiredNervousPending removes only expired entries and reports them', () => {
    const removed = pruneExpiredNervousPending(root, NOW);
    expect(removed).toEqual([ID_EXPIRED]);
    expect(readPendingApprovals(root).map(p => p.id)).toEqual([ID_FRESH]);
  });

  it('handleNervousAccept clears the durable-hub entry (the 5-day-stale live lie)', async () => {
    const res = await handleNervousAccept({ id: ID_EXPIRED, root });
    expect(res.accepted).toBe(true);
    const left = JSON.parse(readFileSync(join(root, NERVOUS_PENDING_FILE), 'utf-8')) as Array<{ id: string }>;
    expect(left.map(e => e.id)).toEqual([ID_FRESH]);
    expect(existsSync(join(root, NERVOUS_PENDING_FILE))).toBe(true);
  });
});
