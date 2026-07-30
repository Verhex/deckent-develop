import { describe, expect, it, onTestFinished } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  beginPauseAuthorityResume,
  restorePauseAuthority,
} from '../../src/cli/commands/resume.js';
import {
  PROVIDER_EXECUTION_HOLD_CHANNEL,
  readProviderExecutionHolds,
} from '../../src/core/provider-execution-hold.js';
import { writeEvent } from '../../src/core/event-stream.js';

function fixture(sprintId = 'sprint-905'): { root: string; path: string; content: string } {
  const root = mkdtempSync(join(tmpdir(), 'deckent-resume-pause-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, '.deckent', 'pause-state.json');
  mkdirSync(join(root, '.deckent'), { recursive: true });
  const content = JSON.stringify({ sprintId, status: 'PAUSED', reason: 'test' }, null, 2);
  writeFileSync(path, content, 'utf-8');
  return { root, path, content };
}

describe('resume pause authority lease', () => {
  it('removes only the matching authority and restores it after failed resume', () => {
    const { root, path, content } = fixture();
    const transition = beginPauseAuthorityResume(root, 'sprint-905');
    expect(transition.ok).toBe(true);
    if (!transition.ok) throw new Error('expected transition');
    expect(existsSync(path)).toBe(false);

    expect(restorePauseAuthority(transition.lease)).toBe(true);
    expect(readFileSync(path, 'utf-8')).toBe(content);
  });

  it('refuses to remove another run authority', () => {
    const { root, path } = fixture('sprint-906');
    expect(beginPauseAuthorityResume(root, 'sprint-905')).toEqual({ ok: false, lease: null });
    expect(existsSync(path)).toBe(true);
  });

  it('does not overwrite a newer pause emitted by the resumed run', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-resume-newer-pause-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const path = join(root, '.deckent', 'pause-state.json');
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(path, JSON.stringify({ sprintId: 'sprint-905', reason: 'new pause' }), 'utf-8');

    expect(restorePauseAuthority({
      path,
      content: JSON.stringify({ sprintId: 'sprint-905', reason: 'old pause' }),
      projectRoot: root,
      sprintId: 'sprint-905',
      providerHolds: [],
    })).toBe(true);
    expect(readFileSync(path, 'utf-8')).toContain('new pause');
  });

  it('leases provider holds and restores them when resume fails', () => {
    const { root } = fixture();
    writeEvent(root, 'sprint-905', 'brain', 'auditor', PROVIDER_EXECUTION_HOLD_CHANNEL, {
      provider: 'claude',
      kind: 'auth',
      sourceTaskId: '905-001',
      reason: 'revoked',
    });

    const transition = beginPauseAuthorityResume(root, 'sprint-905');
    if (!transition.ok) throw new Error('expected transition');
    expect(readProviderExecutionHolds(root, 'sprint-905')).toEqual([]);

    expect(restorePauseAuthority(transition.lease)).toBe(true);
    expect(readProviderExecutionHolds(root, 'sprint-905')).toEqual([
      expect.objectContaining({
        provider: 'claude',
        kind: 'auth',
        sourceTaskId: '905-001',
      }),
    ]);
  });
});
