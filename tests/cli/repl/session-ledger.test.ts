import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProviderMessage } from '../../../src/agent/provider-tooluse/types.js';
import { projectSlug } from '../../../src/core/project-slug.js';
import {
  appendLedgerTurn,
  listLedgerSessions,
  readLedgerSession,
} from '../../../src/cli/repl/session-ledger.js';

describe('session ledger', () => {
  let rootDir: string;
  const cwd = join('C:\\', 'work', 'deckent repo');
  const options = () => ({ cwd, rootDir });
  const messages = [
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
    { role: 'user', content: 'second question' },
    { role: 'assistant', content: 'second answer' },
  ] as ProviderMessage[];

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'deckent-ledger-test-'));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  function append(
    sessionId: string,
    turnIndex: number,
    messagesDelta: ProviderMessage[],
    ts = `2026-08-18T00:0${turnIndex}:00.000Z`,
  ): void {
    appendLedgerTurn({
      ...options(),
      sessionId,
      turnIndex,
      ts,
      provider: 'test-provider',
      model: `test-model-${turnIndex}`,
      messagesDelta,
      usage: turnIndex === 1
        ? null
        : {
            inputTokens: 10 + turnIndex,
            outputTokens: 5 + turnIndex,
            cacheReadTokens: 2,
            cacheCreationTokens: 3,
          },
    });
  }

  function fileFor(sessionId: string): string {
    return join(rootDir, 'projects', projectSlug(cwd), `${sessionId}.jsonl`);
  }

  it('roundtrips N turn deltas into the exact transcript and summed usage', () => {
    append('session-a', 0, messages.slice(0, 2));
    append('session-a', 1, messages.slice(2));

    expect(readLedgerSession('session-a', options())).toEqual({
      messages,
      lastModel: 'test-model-1',
      totals: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 2,
        cacheCreationTokens: 3,
      },
      turnCount: 2,
    });
  });

  it('writes only each delta, so equal-sized turns grow linearly rather than copying history', () => {
    const delta = [{ role: 'user', content: 'x'.repeat(200) }] as ProviderMessage[];
    append('linear', 0, delta);
    const oneTurnBytes = statSync(fileFor('linear')).size;
    for (let turnIndex = 1; turnIndex < 8; turnIndex++) append('linear', turnIndex, delta);
    const eightTurnBytes = statSync(fileFor('linear')).size;

    expect(eightTurnBytes).toBeLessThan(oneTurnBytes * 9);
    const records = readFileSync(fileFor('linear'), 'utf8').trim().split('\n').map(JSON.parse);
    expect(records).toHaveLength(8);
    expect(records.every((record) => record.messagesDelta.length === 1)).toBe(true);
    expect(records.every((record) => Object.hasOwn(record, 'usage'))).toBe(true);
  });

  it('skips corrupt, partial, missing-usage, and cross-session lines without crashing', () => {
    append('tolerant', 0, messages.slice(0, 1));
    appendFileSync(
      fileFor('tolerant'),
      [
        '{"v":1,"sessionId":"tolerant"',
        JSON.stringify({ v: 1, sessionId: 'tolerant', turnIndex: 1, ts: 'x', provider: 'p', model: 'm', messagesDelta: [] }),
        JSON.stringify({ v: 1, sessionId: 'other', turnIndex: 2, ts: 'x', provider: 'p', model: 'm', messagesDelta: [], usage: null }),
      ].join('\n') + '\n',
      'utf8',
    );

    expect(readLedgerSession('tolerant', options()).turnCount).toBe(1);
    expect(listLedgerSessions(10, options())).toEqual([
      {
        sessionId: 'tolerant',
        turnCount: 1,
        lastAt: '2026-08-18T00:00:00.000Z',
        preview: 'first question',
      },
    ]);
  });

  it('lists newest sessions with ChatSessionSummary-compatible previews and a limit', () => {
    append('older', 0, messages.slice(0, 1), '2026-08-18T01:00:00.000Z');
    append('newer', 0, [{ role: 'user', content: `  ${'word '.repeat(20)} ` } as ProviderMessage], '2026-08-18T02:00:00.000Z');

    const listed = listLedgerSessions(1, options());
    expect(listed).toHaveLength(1);
    expect(listed[0]?.sessionId).toBe('newer');
    expect(listed[0]?.preview.length).toBeLessThanOrEqual(60);
  });

  it('keeps sanitized session files inside the injected cross-platform path and hardens permissions', () => {
    append('../unsafe\\session:one', 0, messages.slice(0, 1));
    const directory = join(rootDir, 'projects', projectSlug(cwd));
    const file = join(directory, '---unsafe-session-one.jsonl');

    expect(readFileSync(file, 'utf8')).toContain('"sessionId":"../unsafe\\\\session:one"');
    if (process.platform !== 'win32') {
      expect(statSync(directory).mode & 0o777).toBe(0o700);
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it('returns empty results for missing ledger data and non-positive limits', () => {
    expect(readLedgerSession('missing', options())).toEqual({
      messages: [],
      lastModel: null,
      totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      turnCount: 0,
    });
    expect(listLedgerSessions(0, options())).toEqual([]);
  });
});
