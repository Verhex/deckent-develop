import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  NAMED_START_LOGS,
  applyRuntimeLogRetention,
  planRuntimeLogRetention,
  reconcileRuntimeLogRetention,
} from '../../src/core/runtime-log-retention.js';

let root: string;
const now = new Date('2026-08-23T12:00:00.000Z');
const old = new Date('2026-07-01T00:00:00.000Z');

function file(relative: string, content: string, mtime: Date = old): string {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  utimesSync(path, mtime, mtime);
  return path;
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'runtime-log-retention-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('runtime log retention', () => {
  it('retires the four named zero-byte start logs only in apply mode and writes receipts', () => {
    for (const name of NAMED_START_LOGS) file(name, '');
    const plan = reconcileRuntimeLogRetention(root, { now });
    expect(plan).toMatchObject({ retire: expect.arrayContaining(
      NAMED_START_LOGS.map(source => expect.objectContaining({ source, action: 'retire-empty', bytes: 0 })),
    ) });
    for (const name of NAMED_START_LOGS) expect(existsSync(join(root, name))).toBe(true);

    const result = reconcileRuntimeLogRetention(root, { now, apply: true });
    expect(result).toMatchObject({ failures: [] });
    expect((result as { retired: readonly string[] }).retired).toEqual(expect.arrayContaining([...NAMED_START_LOGS]));
    expect((result as { receipts: readonly string[] }).receipts).toHaveLength(4);
    for (const name of NAMED_START_LOGS) expect(existsSync(join(root, name))).toBe(false);
  });

  it('archives non-empty bot and JSONL logs before retiring them', () => {
    const content = new Map([
      ['.deckent/runtime/telegram-bot.log', 'bot output\n'],
      ['.deckent/runtime/prompt-lint-events.jsonl', '{"ok":true}\n'],
      ['.deckent/settings/resource-log.jsonl', '{"costUsd":1}\n'],
    ]);
    for (const [name, bytes] of content) file(name, bytes);
    const plan = planRuntimeLogRetention(root, { now });
    expect(plan.retire).toHaveLength(3);
    expect(plan.retire.every(item => item.action === 'archive-then-retire')).toBe(true);
    const result = applyRuntimeLogRetention(plan, { now });
    expect(result.failures).toEqual([]);
    expect(result.archived).toHaveLength(3);
    for (const [source, bytes] of content) {
      expect(existsSync(join(root, source))).toBe(false);
      const manifestPath = result.archived.find(path => {
        const manifest = JSON.parse(readFileSync(join(root, path), 'utf8')) as { source: string };
        return manifest.source === source;
      });
      expect(manifestPath).toBeDefined();
      const manifest = JSON.parse(readFileSync(join(root, manifestPath!), 'utf8')) as { contentPath: string };
      expect(readFileSync(join(root, manifest.contentPath), 'utf8')).toBe(bytes);
    }
  });

  it('archives expired detached CLI logs from their dedicated runtime namespace', () => {
    const source = '.deckent/runtime/logs/detached/start-flow-42-123456.log';
    const path = file(source, 'detached output\n');

    const plan = planRuntimeLogRetention(root, { now });
    expect(plan.retire).toContainEqual(expect.objectContaining({
      source,
      kind: 'start-log',
      action: 'archive-then-retire',
    }));

    const result = applyRuntimeLogRetention(plan, { now });
    expect(result.failures).toEqual([]);
    expect(result.retired).toContain(source);
    expect(existsSync(path)).toBe(false);
  });

  it('preserves current writers and detects an append between inspect and apply', () => {
    const live = file('.deckent/runtime/discord-bot.log', 'live\n');
    const changing = file('.deckent/runtime/prompt-lint.jsonl', 'old\n');
    const plan = planRuntimeLogRetention(root, { now, currentWriters: ['.deckent/runtime/discord-bot.log'] });
    writeFileSync(changing, 'old\nnew\n');
    const result = applyRuntimeLogRetention(plan, { now });
    expect(result.preserved).toContainEqual({ source: '.deckent/runtime/discord-bot.log', reason: 'current-writer' });
    expect(readFileSync(live, 'utf8')).toBe('live\n');
    expect(result.failures).toEqual(['.deckent/runtime/prompt-lint.jsonl:SOURCE_CHANGED']);
    expect(readFileSync(changing, 'utf8')).toBe('old\nnew\n');
  });

  it('retires expired temp residue but preserves fresh logs, databases, and tokens', () => {
    file('.deckent/runtime/stale-write.tmp', 'partial');
    const fresh = file('.deckent/runtime/fresh-bot.log', 'writing', now);
    const database = file('.deckent/runtime/state.db', 'state');
    const wal = file('.deckent/runtime/state.db-wal', 'wal');
    const token = file('.deckent/runtime/access-token', 'secret');
    const result = reconcileRuntimeLogRetention(root, { now, apply: true });
    expect(result).toMatchObject({ retired: ['.deckent/runtime/stale-write.tmp'], failures: [] });
    for (const path of [fresh, database, wal, token]) expect(existsSync(path)).toBe(true);
    expect(readFileSync(token, 'utf8')).toBe('secret');
  });
});
