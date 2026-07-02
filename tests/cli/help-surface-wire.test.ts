import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  runChatNativeLoop,
  buildHelpCatalogEntries,
  buildHelpCatalogLabels,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';
import { getVisibleCommands } from '../../src/cli/commands/chat-mode.js';
import { buildSlashRegistry } from '../../src/cli/commands/chat-slash-registry.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

// Sprint 358 T-358-005 — HELP-SURFACE-WIRE.
//
// Verifies /help wires (1) getVisibleCommands(mode) — mode-filtered command
// list, mode sourced from ChatNativeOptions.termMode ('control' -> enterprise,
// everything else -> user) and (2) a trust-badged "Tools/Actions" catalog
// section (357-002 renderCatalog + 357-001 classifyToolTrust) appended to the
// SAME single output() call as the registry render.

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[/;

// ─── Harness (mirrors repl-slash-registry-wire.test.ts) ────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function queuedProvider(responses: ProviderResponse[]): {
  adapter: ChatProviderAdapter;
  sendSpy: ReturnType<typeof vi.fn>;
} {
  const remaining = [...responses];
  const sendSpy = vi.fn(async () => {
    const next = remaining.shift();
    if (!next) throw new Error('queuedProvider: response queue exhausted');
    return next;
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
    ...overrides,
  };
}

// ─── NO_COLOR env save/restore ──────────────────────────────────────────────

let origNoColor: string | undefined;
function saveEnv(): void {
  origNoColor = process.env['NO_COLOR'];
}
function restoreEnv(): void {
  if (origNoColor === undefined) delete process.env['NO_COLOR'];
  else process.env['NO_COLOR'] = origNoColor;
}
afterEach(restoreEnv);

// ─── /help mode-filtered render (goCriteria: user-mode excludes, control-mode includes) ──

describe('runChatNativeLoop — /help mode-filtered visibility (T-358-005)', () => {
  it('default (no termMode) /help hides /audit — user mode is the safe default', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    // Single-emit regression guard (matches repl-slash-registry-wire.test.ts).
    expect(output).toHaveBeenCalledTimes(1);
    const helpText = output.mock.calls[0]![0] as string;
    expect(helpText).toContain('Komutlar:');
    expect(helpText).toContain('/help');
    expect(helpText).toContain('/status');
    expect(helpText).not.toContain('/audit');
    expect(transcript).toEqual([]);
  });

  it("termMode: 'ask' /help hides /audit (maps to user)", async () => {
    const { adapter } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
      termMode: 'ask',
    }));

    const helpText = output.mock.calls[0]![0] as string;
    expect(helpText).not.toContain('/audit');
  });

  it("termMode: 'run' /help hides /audit (maps to user)", async () => {
    const { adapter } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
      termMode: 'run',
    }));

    const helpText = output.mock.calls[0]![0] as string;
    expect(helpText).not.toContain('/audit');
  });

  it("termMode: 'control' /help INCLUDES /audit (enterprise mode)", async () => {
    const { adapter } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
      termMode: 'control',
    }));

    expect(output).toHaveBeenCalledTimes(1);
    const helpText = output.mock.calls[0]![0] as string;
    expect(helpText).toContain('/audit');
    expect(helpText).toContain('/help');
    expect(helpText).toContain('/status');
  });
});

// ─── /help "Tools/Actions" trust-badge catalog section ──────────────────────

describe('runChatNativeLoop — /help trust-badge catalog section (T-358-005)', () => {
  it('appends a trust-badge catalog section after the command list, in the SAME output() call', async () => {
    saveEnv();
    process.env['NO_COLOR'] = '1'; // structural assertion below needs plain (unpainted) badge text
    const { adapter } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
    }));

    expect(output).toHaveBeenCalledTimes(1);
    const helpText = output.mock.calls[0]![0] as string;
    // Section header (getMessage('nervous.actions_label', 'en') === 'Actions:').
    expect(helpText).toContain(getMessage('nervous.actions_label', 'en'));
    // Core trust badge glyph must appear for at least one builtin command.
    expect(helpText).toContain('C /help');
    // Danger trust badge glyph for the always-confirm destructive commands.
    expect(helpText).toContain('! /kill');
    expect(helpText).toContain('! /cleanup');
    expect(helpText).toContain('! /recover');
  });

  it('control-mode catalog section shows /audit under the Enterprise trust tier', async () => {
    saveEnv();
    process.env['NO_COLOR'] = '1'; // structural assertion below needs plain (unpainted) badge text
    const { adapter } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
      termMode: 'control',
    }));

    const helpText = output.mock.calls[0]![0] as string;
    expect(helpText).toContain('E /audit');
  });

  it('honors NO_COLOR — no ANSI escape codes anywhere in /help output', async () => {
    saveEnv();
    process.env['NO_COLOR'] = '1';
    const { adapter } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
    }));

    const helpText = output.mock.calls[0]![0] as string;
    expect(helpText).not.toMatch(ANSI_RE);
  });

  it('emits ANSI color codes by default when NO_COLOR is unset (color path is reachable)', async () => {
    saveEnv();
    delete process.env['NO_COLOR'];
    const { adapter } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/help'),
      output,
    }));

    const helpText = output.mock.calls[0]![0] as string;
    expect(helpText).toMatch(ANSI_RE);
  });
});

// ─── buildHelpCatalogEntries — direct unit coverage ─────────────────────────

describe('buildHelpCatalogEntries — trust classification', () => {
  it('classifies /kill /cleanup /recover as Danger (always-confirm clamp)', () => {
    const entries = buildHelpCatalogEntries(getVisibleCommands('enterprise'));
    const byId = new Map(entries.map((e) => [e.id, e]));
    expect(byId.get('/kill')?.trustTier).toBe('Danger');
    expect(byId.get('/cleanup')?.trustTier).toBe('Danger');
    expect(byId.get('/recover')?.trustTier).toBe('Danger');
    expect(byId.get('/kill')?.riskLevel).toBe('critical');
  });

  it('classifies a plain builtin read command (/status) as Core, non-critical', () => {
    const entries = buildHelpCatalogEntries(getVisibleCommands('enterprise'));
    const status = entries.find((e) => e.id === '/status');
    expect(status?.trustTier).toBe('Core');
    expect(status?.riskLevel).not.toBe('critical');
  });

  it('classifies /audit as Enterprise', () => {
    const entries = buildHelpCatalogEntries(getVisibleCommands('enterprise'));
    const audit = entries.find((e) => e.id === '/audit');
    expect(audit?.trustTier).toBe('Enterprise');
  });

  it('drops the /quit alias, mirroring renderHelp', () => {
    const entries = buildHelpCatalogEntries(buildSlashRegistry());
    expect(entries.some((e) => e.id === '/quit')).toBe(false);
  });

  it('every visible command maps to exactly one catalog entry', () => {
    const visible = getVisibleCommands('user');
    const entries = buildHelpCatalogEntries(visible);
    expect(entries.length).toBe(visible.filter((c) => c.name !== '/quit').length);
  });
});

// ─── buildHelpCatalogLabels — string-free / i18n-sourced ────────────────────

describe('buildHelpCatalogLabels — labels injected via getMessage', () => {
  it('emptyState resolves through getMessage for both supported languages, distinct text', () => {
    const en = buildHelpCatalogLabels('en').emptyState;
    const tr = buildHelpCatalogLabels('tr').emptyState;
    expect(en).toBeTruthy();
    expect(tr).toBeTruthy();
    expect(en).not.toBe(tr);
  });

  it('categoryName/entryName are pure identity passthroughs (technical tokens, not prose)', () => {
    const labels = buildHelpCatalogLabels('en');
    expect(labels.categoryName('Core')).toBe('Core');
    expect(labels.entryName('/status')).toBe('/status');
  });
});
