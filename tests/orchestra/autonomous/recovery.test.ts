import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBacklog } from '../../../src/orchestra/autonomous/backlog.js';
import { recoverBacklog } from '../../../src/orchestra/autonomous/execution-pool.js';

function entryJson(id: string, status: string) {
  return { id, title: 't', kind: 'task', spec: { description: 'x' }, policy: 'auto', trigger: { type: 'one-off' }, status, lastRun: null, lastResult: null };
}

describe('crash recovery', () => {
  let dir: string; let path: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rec-')); path = join(dir, 'backlog.json'); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('parks an authority-less running entry instead of blind-redriving it', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entryJson('a', 'running')] }));
    recoverBacklog(path);
    expect(loadBacklog(path).entries[0]).toMatchObject({
      status: 'parked',
      lastResult: {
        ok: false,
        reason: 'RECOVERY_HOLD_ATTEMPT_AUTHORITY_UNAVAILABLE',
        recoveryHold: {
          schemaVersion: 1,
          reasonCode: 'attempt-authority-unavailable',
        },
      },
    });
  });

  it('leaves non-running entries untouched', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entryJson('a', 'done'), entryJson('b', 'pending'), entryJson('c', 'parked')] }));
    recoverBacklog(path);
    const e = loadBacklog(path).entries;
    expect(e.map(x => x.status)).toEqual(['done', 'pending', 'parked']);
  });

  it('is a no-op (no throw) when the backlog file is absent', () => {
    expect(() => recoverBacklog(join(dir, 'missing.json'))).not.toThrow();
  });
});
