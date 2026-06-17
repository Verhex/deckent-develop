import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBacklog, updateStatus } from '../../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

describe('BacklogEntry.lastResult rich verdict round-trip', () => {
  it('persists decision + reconciled + quality + audit + crossVerify and reloads them', () => {
    dir = mkdtempSync(join(tmpdir(), 'bl-rich-'));
    mkdirSync(join(dir, '.deckent', 'autonomous'), { recursive: true });
    const path = join(dir, '.deckent', 'autonomous', 'backlog.json');
    const entry: BacklogEntry = {
      id: 'e1', title: 't', kind: 'task', spec: { scopeDir: 'src/api/' }, policy: 'auto',
      trigger: { type: 'one-off' }, status: 'running', lastRun: null, lastResult: null,
    };
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entry] }), 'utf-8');

    const bl = loadBacklog(path);
    updateStatus(path, bl, 'e1', 'done', {
      ok: true,
      reason: 'decision=GO_WITH_TECH_DEBT',
      decision: 'GO_WITH_TECH_DEBT',
      reconciled: true,
      quality: 78,
      audit: { boundary: 'clean', adr: 'ok', functional: 'pass' },
      crossVerify: { ran: true, verdict: 'confirmed' },
    });

    const saved = JSON.parse(readFileSync(path, 'utf-8')).entries[0];
    expect(saved.status).toBe('done');
    expect(saved.lastResult.decision).toBe('GO_WITH_TECH_DEBT');
    expect(saved.lastResult.reconciled).toBe(true);
    expect(saved.lastResult.quality).toBe(78);
    expect(saved.lastResult.audit.functional).toBe('pass');
    expect(saved.lastResult.crossVerify.verdict).toBe('confirmed');
  });
});
