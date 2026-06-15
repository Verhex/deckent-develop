// tests/nervous/respawn-request.test.ts — cooperative respawn-request queue (N3).
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  requestWorkerRespawn,
  drainRespawnRequests,
  RESPAWN_REQUESTS_FILE,
} from '../../src/nervous/respawn-request.js';

let root: string;
afterEach(() => {
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  root = undefined as unknown as string;
});
function mk(): string { root = mkdtempSync(join(tmpdir(), 'deckent-rsp-')); return root; }

describe('respawn-request queue', () => {
  it('requestWorkerRespawn appends + drain returns the taskId then clears the file', () => {
    const r = mk();
    requestWorkerRespawn(r, '001-003');
    expect(existsSync(join(r, RESPAWN_REQUESTS_FILE))).toBe(true);

    expect(drainRespawnRequests(r)).toEqual(['001-003']);
    // consume-once: file removed, a second drain is empty
    expect(existsSync(join(r, RESPAWN_REQUESTS_FILE))).toBe(false);
    expect(drainRespawnRequests(r)).toEqual([]);
  });

  it('dedupes repeated requests for the same task', () => {
    const r = mk();
    requestWorkerRespawn(r, 'A');
    requestWorkerRespawn(r, 'A');
    requestWorkerRespawn(r, 'B');
    expect(drainRespawnRequests(r).sort()).toEqual(['A', 'B']);
  });

  it('drain on a fresh project returns []', () => {
    expect(drainRespawnRequests(mk())).toEqual([]);
  });

  it('skips corrupt lines without throwing', () => {
    const r = mk();
    requestWorkerRespawn(r, 'good');
    appendFileSync(join(r, RESPAWN_REQUESTS_FILE), 'not-json\n', 'utf-8');
    expect(drainRespawnRequests(r)).toEqual(['good']);
  });
});
