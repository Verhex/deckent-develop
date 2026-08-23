import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { CHANNELS, emitProgress, readEvents } from '../../src/core/event-stream.js';

const roots: string[] = [];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('PROGRESS terminal-journal ownership', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('keeps a stale terminal journal byte/hash stable and writes the exact live target', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-terminal-ownership-'));
    roots.push(root);
    const recentWorks = join(root, '.deckent', 'recently-works');
    mkdirSync(recentWorks, { recursive: true });
    const terminalId = 'sprint-627';
    const liveId = 'sprint-628';
    const terminalPath = join(recentWorks, `${terminalId}-events.jsonl`);
    const terminalSeqPath = join(recentWorks, `${terminalId}-seq`);
    const sealed = '{"sequence":9,"channel":"SPRINT_STATUS","payload":{"status":"COMPLETE"}}\n';
    writeFileSync(terminalPath, sealed, 'utf-8');
    writeFileSync(terminalSeqPath, '9', 'utf-8');
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({ sprintId: terminalId }), 'utf-8');
    const beforeHash = sha256(readFileSync(terminalPath, 'utf-8'));

    emitProgress({ root, sprintId: liveId, phase: 'PLAN' });

    expect(readFileSync(terminalPath, 'utf-8')).toBe(sealed);
    expect(sha256(readFileSync(terminalPath, 'utf-8'))).toBe(beforeHash);
    expect(readFileSync(terminalSeqPath, 'utf-8')).toBe('9');
    expect(readEvents(root, liveId, { channel: CHANNELS.PROGRESS })).toHaveLength(1);
    expect(existsSync(join(recentWorks, `${liveId}-seq`))).toBe(true);
  });
});
