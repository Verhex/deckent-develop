import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionEventLog } from '../../../../src/orchestra/autonomous/mission-store/mission-events.js';

const dirs: string[] = [];
function sandbox() { const d = mkdtempSync(join(tmpdir(), 'mev-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('MissionEventLog (per-mission jsonl)', () => {
  it('append + readTail round-trips; reset unlinks the mission file', () => {
    const root = sandbox();
    const log = new MissionEventLog(root);
    log.append('m1', { ts: '2026-01-01T00:00:00Z', type: 'tick', data: { i: 1 } });
    log.append('m1', { ts: '2026-01-01T00:00:01Z', type: 'progress', data: { done: 1 } });
    const path = join(root, '.deckent', 'autonomous', 'events', 'm1.jsonl');
    expect(existsSync(path)).toBe(true);
    const tail = log.readTail('m1', 1);
    expect(tail.length).toBe(1);
    expect(tail[0].type).toBe('progress');
    log.reset('m1');
    expect(existsSync(path)).toBe(false);
    expect(log.readTail('m1')).toEqual([]); // missing file → empty, no throw
  });
});
