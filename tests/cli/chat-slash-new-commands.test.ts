import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildSlashRegistry,
  resolveSlash,
} from '../../src/cli/commands/chat-slash-registry.js';
import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
} from '../../src/cli/commands/chat-native.js';
import { dispatchAgenticIntent } from '../../src/cli/commands/chat-agentic-dispatch.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

// Sprint 269 T-269-003 — /autonomous, /audit, /directives, /mcp slash commands
// + i18n cleanup (audit findings C-Slash, C-i18n, A3).
//
// Registry-level tests verify the subaction → MCP arg mapping (pure
// resolveSlash); wire-level tests drive runChatNativeLoop with a mock
// dispatcher (hermetic — no subprocess, no network, tmpdir-only file I/O).

// ─── helpers (mirrors repl-agentic-enterprise-wire.test.ts) ──────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function idleProvider(): { adapter: ChatProviderAdapter; sendSpy: ReturnType<typeof vi.fn> } {
  const sendSpy = vi.fn(async () => {
    throw new Error('provider should not be called');
  });
  return { adapter: { send: sendSpy }, sendSpy };
}

function fakeDispatcher(canned: string = 'tool-ok'): {
  dispatcher: McpToolDispatcher;
  dispatchSpy: ReturnType<typeof vi.fn>;
} {
  const dispatchSpy = vi.fn(async () => canned);
  return { dispatcher: { dispatch: dispatchSpy }, dispatchSpy };
}

function baseOpts(overrides: Partial<ChatNativeOptions> & {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  input: AsyncIterable<string>;
}): ChatNativeOptions {
  return {
    output: vi.fn(),
    agenticConfirm: async () => true,
    ...overrides,
  };
}

// ─── registry catalog ─────────────────────────────────────────────────────────

describe('buildSlashRegistry — 269-003 new commands registered', () => {
  it('includes /autonomous, /audit, /directives, /mcp', () => {
    const names = buildSlashRegistry().map((c) => c.name);
    expect(names).toContain('/autonomous');
    expect(names).toContain('/audit');
    expect(names).toContain('/directives');
    expect(names).toContain('/mcp');
  });

  it('/autonomous and /audit map to their MCP tools in the catalog', () => {
    const registry = buildSlashRegistry();
    expect(registry.find((c) => c.name === '/autonomous')?.agenticTool).toBe('deckent_autonomous');
    expect(registry.find((c) => c.name === '/audit')?.agenticTool).toBe('deckent_audit');
    expect(registry.find((c) => c.name === '/directives')?.agenticTool).toBe('deckent_set_directives');
  });
});

// ─── /autonomous subaction parsing ────────────────────────────────────────────

describe('resolveSlash — /autonomous subactions → deckent_autonomous', () => {
  const registry = buildSlashRegistry();

  it.each([['status'], ['start'], ['stop']])('/autonomous %s → action:%s', (sub) => {
    const result = resolveSlash(`/autonomous ${sub}`, registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.tool).toBe('deckent_autonomous');
      expect(result.args).toEqual({ action: sub });
    }
  });

  it('bare /autonomous defaults to the read-only status action', () => {
    const result = resolveSlash('/autonomous', registry);
    expect(result).toEqual({ action: 'agentic', tool: 'deckent_autonomous', args: { action: 'status' } });
  });

  it('/autonomous backlog list → backlog_list', () => {
    const result = resolveSlash('/autonomous backlog list', registry);
    expect(result).toEqual({ action: 'agentic', tool: 'deckent_autonomous', args: { action: 'backlog_list' } });
  });

  it('/autonomous backlog add <title> --cron <expr> → backlog_add with id/title/cron', () => {
    const result = resolveSlash('/autonomous backlog add Daily digest --cron 0 9 * * 1', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.tool).toBe('deckent_autonomous');
      expect(result.args).toEqual({
        action: 'backlog_add',
        id: 'daily-digest',
        title: 'Daily digest',
        cron: '0 9 * * 1',
      });
    }
  });

  it('/autonomous backlog add <title> without --cron omits cron (one-off)', () => {
    const result = resolveSlash('/autonomous backlog add Fix flaky test', registry);
    expect(result.action).toBe('agentic');
    if (result.action === 'agentic') {
      expect(result.args).toEqual({ action: 'backlog_add', id: 'fix-flaky-test', title: 'Fix flaky test' });
    }
  });

  it('/autonomous backlog add without a title → i18n usage message', () => {
    const result = resolveSlash('/autonomous backlog add', registry);
    expect(result).toEqual({ action: 'message', messageKey: 'chat.autonomous_title_required' });
  });

  it.each([['approve'], ['reject']])('/autonomous %s <id> → triggerId mapped', (sub) => {
    const result = resolveSlash(`/autonomous ${sub} t-42`, registry);
    expect(result).toEqual({
      action: 'agentic',
      tool: 'deckent_autonomous',
      args: { action: sub, triggerId: 't-42' },
    });
  });

  it('/autonomous approve without id → i18n usage message', () => {
    const result = resolveSlash('/autonomous approve', registry);
    expect(result).toEqual({
      action: 'message',
      messageKey: 'chat.autonomous_id_required',
      params: { sub: 'approve' },
    });
  });

  it('unknown subaction → i18n error message (no fabricated dispatch)', () => {
    const result = resolveSlash('/autonomous bogus', registry);
    expect(result.action).toBe('message');
    if (result.action === 'message') {
      expect(result.messageKey).toBe('chat.slash_unknown_subaction');
      expect(result.params).toEqual({ command: '/autonomous', sub: 'bogus' });
    }
  });
});

// ─── /audit subaction parsing ─────────────────────────────────────────────────

describe('resolveSlash — /audit subactions → deckent_audit', () => {
  const registry = buildSlashRegistry();

  it('/audit gate sprint-269 → action gate + sprintId', () => {
    const result = resolveSlash('/audit gate sprint-269', registry);
    expect(result).toEqual({
      action: 'agentic',
      tool: 'deckent_audit',
      args: { action: 'gate', sprintId: 'sprint-269' },
    });
  });

  it('/audit gate without sprint omits sprintId', () => {
    const result = resolveSlash('/audit gate', registry);
    expect(result).toEqual({ action: 'agentic', tool: 'deckent_audit', args: { action: 'gate' } });
  });

  it('/audit query api → action query + channel', () => {
    const result = resolveSlash('/audit query api', registry);
    expect(result).toEqual({
      action: 'agentic',
      tool: 'deckent_audit',
      args: { action: 'query', channel: 'api' },
    });
  });

  it('/audit compliance → action compliance', () => {
    const result = resolveSlash('/audit compliance', registry);
    expect(result).toEqual({ action: 'agentic', tool: 'deckent_audit', args: { action: 'compliance' } });
  });

  it('CLI-only actions not in MCP (forward/retention) → honest i18n message', () => {
    for (const sub of ['forward', 'retention']) {
      const result = resolveSlash(`/audit ${sub}`, registry);
      expect(result).toEqual({
        action: 'message',
        messageKey: 'chat.audit_not_in_mcp',
        params: { sub },
      });
    }
  });

  it('bare /audit and flag args resolve to none (legacy enterprise CLI bridge keeps them)', () => {
    expect(resolveSlash('/audit', registry)).toEqual({ action: 'none' });
    expect(resolveSlash('/audit --json', registry)).toEqual({ action: 'none' });
  });
});

// ─── /directives subaction parsing ────────────────────────────────────────────

describe('resolveSlash — /directives', () => {
  const registry = buildSlashRegistry();

  it('bare /directives → show-directives action', () => {
    expect(resolveSlash('/directives', registry)).toEqual({ action: 'show-directives' });
  });

  it('/directives set <content> → deckent_set_directives with content', () => {
    const result = resolveSlash('/directives set ## Task 1: hedef', registry);
    expect(result).toEqual({
      action: 'agentic',
      tool: 'deckent_set_directives',
      args: { content: '## Task 1: hedef' },
    });
  });

  it('/directives set without content → i18n usage message', () => {
    expect(resolveSlash('/directives set', registry)).toEqual({
      action: 'message',
      messageKey: 'chat.directives_set_usage',
    });
  });

  it('unknown /directives subaction → i18n error', () => {
    const result = resolveSlash('/directives frobnicate', registry);
    expect(result).toEqual({
      action: 'message',
      messageKey: 'chat.slash_unknown_subaction',
      params: { command: '/directives', sub: 'frobnicate' },
    });
  });
});

// ─── /mcp honest notice ───────────────────────────────────────────────────────

describe('resolveSlash — /mcp (audit finding A3)', () => {
  it('/mcp → honest i18n not-wired message (never round-trips to provider)', () => {
    const result = resolveSlash('/mcp', buildSlashRegistry());
    expect(result).toEqual({ action: 'message', messageKey: 'chat.mcp_not_wired' });
  });
});

// ─── runChatNativeLoop wire (mock dispatcher) ────────────────────────────────

describe('runChatNativeLoop — 269-003 slash wire', () => {
  it('/autonomous approve t-1 dispatches deckent_autonomous end-to-end', async () => {
    const { adapter, sendSpy } = idleProvider();
    const { dispatcher, dispatchSpy } = fakeDispatcher('{"approved":true}');
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/autonomous approve t-1'),
      output,
    }));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_autonomous', { action: 'approve', triggerId: 't-1' });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('{"approved":true}');
  });

  it('/audit gate sprint-269 dispatches deckent_audit (enterprise bridge NOT used)', async () => {
    const { adapter, sendSpy } = idleProvider();
    const { dispatcher, dispatchSpy } = fakeDispatcher('{"overallGate":"PASS"}');
    const output = vi.fn();
    const enterpriseSpawn = vi.fn(async () => 'should-not-fire');

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/audit gate sprint-269'),
      output,
      enterpriseSpawn,
    }));

    expect(dispatchSpy).toHaveBeenCalledWith('deckent_audit', { action: 'gate', sprintId: 'sprint-269' });
    expect(enterpriseSpawn).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('{"overallGate":"PASS"}');
  });

  it('bare /audit still goes through the legacy enterprise CLI bridge (behaviour preserved)', async () => {
    const { adapter, sendSpy } = idleProvider();
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();
    const enterpriseSpawn = vi.fn(async () => 'audit: PASS');

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/audit'),
      output,
      enterpriseSpawn,
    }));

    expect(enterpriseSpawn).toHaveBeenCalledTimes(1);
    expect(enterpriseSpawn).toHaveBeenCalledWith(['audit']);
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('audit: PASS');
  });

  it('confirm gate: declined /directives set is cancelled and never dispatched', async () => {
    const { adapter } = idleProvider();
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/directives set yeni hedef'),
      output,
      agenticConfirm: async () => false,
    }));

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('[slash] cancelled: deckent_set_directives');
  });

  it('approved /directives set dispatches deckent_set_directives with content', async () => {
    const { adapter } = idleProvider();
    const { dispatcher, dispatchSpy } = fakeDispatcher('{"success":true}');
    const output = vi.fn();
    const confirmSpy = vi.fn(async () => true);

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/directives set yeni hedef'),
      output,
      agenticConfirm: confirmSpy,
    }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_set_directives', { content: 'yeni hedef' });
    expect(output).toHaveBeenCalledWith('{"success":true}');
  });

  it('unknown subaction renders the localized i18n error (en)', async () => {
    const { adapter, sendSpy } = idleProvider();
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/autonomous bogus'),
      output,
    }));

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('/autonomous: unknown subaction "bogus". See /help for usage.');
  });

  it('/mcp outputs the honest not-wired notice without a provider round-trip', async () => {
    const { adapter, sendSpy } = idleProvider();
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/mcp'),
      output,
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith(getMessage('chat.mcp_not_wired', 'en'));
  });
});

// ─── /directives show (hermetic tmpdir) ───────────────────────────────────────

describe('runChatNativeLoop — /directives show (tmpdir fixture)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-269-003-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('outputs the DIRECTIVES.md content from projectRoot', async () => {
    const content = '# DIRECTIVES — Sprint 999: test\n\n## Task 1: örnek\n';
    writeFileSync(join(root, 'DIRECTIVES.md'), content, 'utf-8');
    const { adapter, sendSpy } = idleProvider();
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/directives'),
      output,
      projectRoot: root,
    }));

    expect(output).toHaveBeenCalledWith(content);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('missing DIRECTIVES.md → localized not-found message (no throw)', async () => {
    const { adapter } = idleProvider();
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/directives'),
      output,
      projectRoot: root,
    }));

    expect(output).toHaveBeenCalledWith(getMessage('chat.directives_not_found', 'en', { root }));
  });
});

// ─── i18n dictionary coverage ─────────────────────────────────────────────────

describe('messages — 269-003 en/tr key pairs exist', () => {
  const NEW_KEYS = [
    'chat.max_turns_reached',
    'chat.max_tool_hops_reached',
    'chat.provider_error',
    'chat.agentic_no_match',
    'chat.mcp_not_wired',
    'chat.slash_unknown_subaction',
    'chat.autonomous_id_required',
    'chat.autonomous_title_required',
    'chat.audit_not_in_mcp',
    'chat.directives_set_usage',
    'chat.directives_not_found',
    'tui.render_error',
  ] as const;

  it.each(NEW_KEYS.map((k) => [k]))('%s resolves in both en and tr', (key) => {
    const en = getMessage(key, 'en');
    const tr = getMessage(key, 'tr');
    // getMessage returns the key itself for unknown keys — both langs must resolve.
    expect(en).not.toBe(key);
    expect(tr).not.toBe(key);
    expect(en.length).toBeGreaterThan(0);
    expect(tr.length).toBeGreaterThan(0);
    expect(en).not.toBe(tr);
  });

  it('moved en templates stay byte-identical to the prior hardcodes', () => {
    expect(getMessage('chat.max_turns_reached', 'en', { max: '5' }))
      .toBe('[chat-native] maxTurns (5) reached — ending session.');
    expect(getMessage('chat.max_tool_hops_reached', 'en', { max: '2' }))
      .toBe('[chat-native] maxToolHops (2) reached — aborting tool chain.');
    expect(getMessage('chat.provider_error', 'en', { message: 'spawn ENOENT' }))
      .toBe('[chat-native] error: spawn ENOENT');
    expect(getMessage('chat.agentic_no_match', 'en'))
      .toBe('[agentic] no matching intent — falling back to chat.');
  });
});

// ─── dispatchAgenticIntent lang pass-through ──────────────────────────────────

describe('dispatchAgenticIntent — localized no-match notice', () => {
  const noopDispatcher: McpToolDispatcher = { dispatch: async () => 'unused' };

  it('default (two-arg) keeps the exact English output (backward compat)', async () => {
    const result = await dispatchAgenticIntent('xyzzy nothing matches', noopDispatcher);
    expect(result.matched).toBe(false);
    expect(result.output).toBe('[agentic] no matching intent — falling back to chat.');
  });

  it('lang=tr renders the Turkish notice', async () => {
    const result = await dispatchAgenticIntent('xyzzy nothing matches', noopDispatcher, 'tr');
    expect(result.matched).toBe(false);
    expect(result.output).toBe(getMessage('chat.agentic_no_match', 'tr'));
    expect(result.output).toContain('sohbete dönülüyor');
  });
});
