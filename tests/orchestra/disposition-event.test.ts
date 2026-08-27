import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('../../src/nervous/dispatcher.js', () => ({
  NervousDispatcher: class {
    async dispatch(): Promise<{ channels: string[]; success: boolean }> {
      dispatch();
      return { channels: ['file'], success: true };
    }
  },
}));

import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';
import { publishDispositionEvent } from '../../src/orchestra/result-collector.js';

const roots: string[] = [];

afterEach(() => {
  dispatch.mockClear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('disposition event publication', () => {
  it('writes a stable owner-outbox event and remains complete with Nervous off', async () => {
    const root = mkdtempSync(join(tmpdir(), 'disposition-event-'));
    roots.push(root);

    const first = await publishDispositionEvent(
      root,
      'sprint-699',
      '699-003',
      'FORCED_SKILL_UNAVAILABLE',
      'NOT_DISPATCHED',
    );
    const replay = await publishDispositionEvent(
      root,
      'sprint-699',
      '699-003',
      'FORCED_SKILL_UNAVAILABLE',
      'NOT_DISPATCHED',
      { enabled: false } as never,
    );

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      id: 'disposition:sprint-699:699-003:FORCED_SKILL_UNAVAILABLE:NOT_DISPATCHED',
      reasonCode: 'FORCED_SKILL_UNAVAILABLE',
      taskId: '699-003',
      disposition: 'NOT_DISPATCHED',
    });
    const outbox = readFileSync(
      join(root, '.deckent', 'runtime', 'owner-notifications.jsonl'),
      'utf8',
    ).trim().split('\n').map(line => JSON.parse(line) as { id: string; message: string });
    expect(outbox).toHaveLength(2);
    expect(new Set(outbox.map(entry => entry.id))).toEqual(new Set([first.id]));
    expect(outbox[0]?.message).toContain(first.remediationHint);
    expect(() => readFileSync(join(root, '.deckent', 'nervous', 'nervous-log.jsonl'))).toThrow();
  });

  it('registers bilingual remediation messages', () => {
    for (const key of [
      'disposition.remediation.forced_skill_unavailable',
      'disposition.remediation.provider_adapter_unavailable',
      'disposition.remediation.default',
    ]) {
      expect(getMessageLanguages(key)).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en')).not.toBe(key);
      expect(getMessage(key, 'tr')).not.toBe(key);
    }
  });

  it('bridges the same informational event only when Nervous is enabled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'disposition-event-nervous-'));
    roots.push(root);

    await publishDispositionEvent(
      root,
      'sprint-699',
      '699-provider',
      'PROVIDER_ADAPTER_UNAVAILABLE',
      'NOT_DISPATCHED',
      { enabled: true, mode: 'balanced' } as never,
    );

    expect(dispatch).toHaveBeenCalledOnce();
  });
});
