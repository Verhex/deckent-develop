// tests/cli/slash-case-translit.test.ts
// ═══ SLASH-CASE-TRANSLIT (388-011, born-531) ═════════════════════════════════
//
// Two independent fixes, both surfaced by the same bug report:
//   1. Slash-command matching must be case-insensitive. `resolveSlash`'s own
//      top-level dispatch (chat-slash-registry.ts) already lowercases before
//      comparing — this suite locks that in with a regression test — but
//      `parseBusyCommand` (busy-controls.ts) and `slashCompleter`'s Tab-complete
//      prefix filter (chat-slash-registry.ts) did NOT fold case; both are
//      fixed here.
//   2. `/autonomous backlog add <title>`'s id-slugify (chat-slash-registry.ts
//      `slugifyBacklogId`) did not transliterate Turkish characters, so a
//      Turkish title collapsed into a near-empty, unreadable id. Fixed via a
//      transliteration pass before the ASCII slug fold.

import { describe, it, expect } from 'vitest';
import { buildSlashRegistry, resolveSlash, slashCompleter } from '../../src/cli/commands/chat-slash-registry.js';
import { parseBusyCommand } from '../../src/cli/repl/busy-controls.js';

const registry = buildSlashRegistry();

describe('resolveSlash — case-insensitive matching (born-531)', () => {
  it('/Help resolves identically to /help (task goCriteria example)', () => {
    expect(resolveSlash('/Help', registry)).toEqual(resolveSlash('/help', registry));
    expect(resolveSlash('/Help', registry)).toEqual({ action: 'help', registry });
  });

  it('meta-commands (/Exit, /QUIT, /Clear) resolve regardless of case', () => {
    expect(resolveSlash('/Exit', registry)).toEqual({ action: 'exit' });
    expect(resolveSlash('/QUIT', registry)).toEqual({ action: 'exit' });
    expect(resolveSlash('/Clear', registry)).toEqual({ action: 'clear' });
  });

  it('generic catalog entries (/STATUS, /Recall) dispatch to their agenticTool regardless of case', () => {
    expect(resolveSlash('/STATUS', registry)).toEqual(resolveSlash('/status', registry));
    expect(resolveSlash('/Recall docker', registry)).toEqual(resolveSlash('/recall docker', registry));
  });

  it('structured subaction commands (/Autonomous Status, /MCP) fold case on both name and subaction', () => {
    expect(resolveSlash('/Autonomous Status', registry)).toEqual({
      action: 'agentic',
      tool: 'deckent_autonomous',
      args: { action: 'status' },
    });
    expect(resolveSlash('/MCP', registry)).toEqual(resolveSlash('/mcp', registry));
  });
});

describe('parseBusyCommand — case-insensitive keyword matching (born-531 fix)', () => {
  it('/Queue and /QUEUE resolve like /queue', () => {
    expect(parseBusyCommand('/Queue')).toEqual({ kind: 'queue' });
    expect(parseBusyCommand('/QUEUE')).toEqual({ kind: 'queue' });
  });

  it('/Interrupt resolves like /interrupt', () => {
    expect(parseBusyCommand('/Interrupt')).toEqual({ kind: 'interrupt' });
    expect(parseBusyCommand('  /INTERRUPT  ')).toEqual({ kind: 'interrupt' });
  });

  it('/Steer <msg> resolves like /steer <msg>, preserving the message casing', () => {
    expect(parseBusyCommand('/Steer Focus On The Auth Module')).toEqual({
      kind: 'steer',
      message: 'Focus On The Auth Module',
    });
    expect(parseBusyCommand('/STEER')).toEqual({ kind: 'steer', message: '' });
  });

  it('still rejects unrelated input regardless of case', () => {
    expect(parseBusyCommand('/Nope')).toEqual({ kind: 'none' });
  });
});

describe('slashCompleter — case-insensitive Tab-complete prefix match (born-531 fix)', () => {
  it('/St and /ST match /status just like /st', () => {
    const [hits] = slashCompleter('/St');
    expect(hits).toContain('/status');
    const [upperHits] = slashCompleter('/ST');
    expect(upperHits).toContain('/status');
  });

  it('returns the line as-typed (completer contract), not case-folded', () => {
    const [, line] = slashCompleter('/St');
    expect(line).toBe('/St');
  });

  it('no case-insensitive match still falls back to the full list', () => {
    const [hits] = slashCompleter('/ZzZ');
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('slugifyBacklogId (via /autonomous backlog add) — Turkish transliteration (born-531 fix)', () => {
  it('transliterates ç/ş/ı/ğ/ö/ü to their ASCII equivalents', () => {
    const result = resolveSlash('/autonomous backlog add Çalışma Güncelleme', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.args).toEqual({
        action: 'backlog_add',
        id: 'calisma-guncelleme',
        title: 'Çalışma Güncelleme',
      });
    }
  });

  it('transliterates the dotted capital İ correctly', () => {
    const result = resolveSlash('/autonomous backlog add İşçi Değişikliği', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.args).toMatchObject({ id: 'isci-degisikligi' });
    }
  });

  it('ASCII-only titles are unaffected (no regression, matches prior expectations)', () => {
    const result = resolveSlash('/autonomous backlog add Daily digest --cron 0 9 * * 1', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.args).toEqual({
        action: 'backlog_add',
        id: 'daily-digest',
        title: 'Daily digest',
        cron: '0 9 * * 1',
      });
    }
  });
});
