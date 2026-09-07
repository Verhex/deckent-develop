import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

import { ReplApp, routeNativeMcpInput, type ReplEngine } from '../../src/cli/repl/app.js';
import { dispatchMcpSlash, type ReplMcpBridge } from '../../src/cli/repl/mcp-bridge.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { buildSlashRegistry } from '../../src/cli/commands/chat-slash-registry.js';
import { buildPickerLabels } from '../../src/cli/repl/picker-labels.js';
import { buildReplLabels, buildShortcutsPanel, resolveNativeMcpUnavailableMessage } from '../../src/cli/repl/run.js';

const tick = (ms = 80): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function mountNative(nativeMcpSlash?: (args: readonly string[]) => Promise<string>, mode: 'ask' | 'run' = 'run') {
  const t = (key: string): string => getMessage(key, 'en');
  const engine = Object.assign(async () => {}, { close: vi.fn() }) as unknown as ReplEngine;
  return render(<ReplApp
    provider={{} as never} dispatcher={{ dispatch: vi.fn(async () => 'provider-fallback') }}
    labels={buildReplLabels(t)} providerName="fixture" cwd={process.cwd()}
    registerConfirm={() => {}} registerToolSink={() => {}}
    slashRegistry={buildSlashRegistry('en')} initialSelection={{ provider: 'fixture', model: 'fixture' }}
    onSwitch={() => ({ provider: 'fixture', model: 'fixture' })} onApprovalMode={() => {}}
    inboxLabels={{} as never} pickerLabels={buildPickerLabels(t)} liveFooterLabels={{} as never}
    approvalLabels={{} as never} runFlowCardLabels={{} as never} runFlowMountLabels={{} as never}
    doSlashLabels={{} as never} caretStyle="marker" dualStreamOverflow="..."
    shortcutsPanel={buildShortcutsPanel(t)} nativeEngine={engine} initialTermMode={mode}
    {...(nativeMcpSlash ? { nativeMcpSlash } : {})}
  />);
}

function bridge(overrides: Partial<ReplMcpBridge> = {}): ReplMcpBridge {
  return {
    loadAndConnectAll: vi.fn(async () => ['fixture']),
    listSlashLines: vi.fn(() => ['fixture__read', 'fixture__write']),
    listTools: vi.fn(() => [
      { namespacedName: 'fixture__write', server: 'fixture', tool: 'write', descriptor: { name: 'write' } },
    ]),
    connectAndRefresh: vi.fn(async () => []),
    connectionObservation: vi.fn(() => ({ configured: 1, connected: 1, failed: 0 })),
    dispatch: vi.fn(async (_name, _args, confirm) => {
      const allowed = await confirm({
        name: 'fixture__write', server: 'fixture', tool: 'write', tier: 'confirm',
        args: {}, description: 'fixture__write',
      });
      return allowed ? { ok: true, output: 'called' } : { ok: false, output: 'cancelled', cancelled: true };
    }),
    ...overrides,
  };
}

describe('native Ink /mcp ingress', () => {
  it.each(['en', 'tr'])('routes bare/list and localized unknown in %s without provider fallback', async (lang) => {
    const live = bridge();
    const dispatch = (args: readonly string[]) => dispatchMcpSlash({ args, bridge: live, lang, confirm: async () => false });
    expect(await routeNativeMcpInput({ input: '/mcp', dispatch, authorizeCall: () => undefined })).toContain('fixture__read');
    expect(await routeNativeMcpInput({ input: '/mcp list', dispatch, authorizeCall: () => undefined })).toContain('fixture__write');
    expect(await routeNativeMcpInput({ input: '/mcp unknown', dispatch, authorizeCall: () => undefined }))
      .toBe(getMessage('chat.slash_unknown_subaction', lang, { command: '/mcp', sub: 'unknown' }));
  });

  it.each([
    ['/mcp call fixture__write {"count":2}', { count: 2 }],
    ['/mcp call fixture__write count=2 mode=safe', { count: '2', mode: 'safe' }],
  ] as const)('parses %s and preserves the explicit confirm denial', async (input, expectedArgs) => {
    const confirm = vi.fn(async () => false);
    const live = bridge({
      dispatch: vi.fn(async (name, args, gate) => {
        expect(name).toBe('fixture__write');
        expect(args).toEqual(expectedArgs);
        return (await gate({ name, server: 'fixture', tool: 'write', tier: 'confirm', args, description: name }))
          ? { ok: true, output: 'called' }
          : { ok: false, output: 'cancelled', cancelled: true };
      }),
    });
    const dispatch = (args: readonly string[]) => dispatchMcpSlash({ args, bridge: live, lang: 'en', confirm });
    expect(await routeNativeMcpInput({ input, dispatch, authorizeCall: () => undefined })).toBe('cancelled');
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('gates call before bridge connect/dispatch and delegates no-bridge honestly', async () => {
    const dispatch = vi.fn(async () => 'must-not-run');
    expect(await routeNativeMcpInput({
      input: '/mcp call fixture__write x=1', dispatch,
      authorizeCall: () => 'denied-by-posture',
    })).toBe('denied-by-posture');
    expect(dispatch).not.toHaveBeenCalled();
    expect(await routeNativeMcpInput({ input: '/mcp list', authorizeCall: () => undefined })).toBeUndefined();
  });

  it.each([
    ['en', { configured: 0, connected: 0, failed: 0 }, 'chat.mcp_no_servers_configured'],
    ['tr', { configured: 1, connected: 0, failed: 1 }, 'chat.mcp_connection_failed'],
    ['en', { configured: 1, connected: 1, failed: 0 }, 'chat.mcp_connected_no_tools'],
  ] as const)('renders typed empty list state in %s', async (lang, observation, key) => {
    const live = bridge({
      listSlashLines: vi.fn(() => []),
      connectionObservation: vi.fn(() => observation),
    });
    expect(await dispatchMcpSlash({ args: ['list'], bridge: live, lang }))
      .toBe(getMessage(key, lang));
  });

  it.each(['en', 'tr'])('describes configured-zero without the obsolete not-wired roadmap claim (%s)', async (lang) => {
    const live = bridge({
      listSlashLines: vi.fn(() => []),
      connectionObservation: vi.fn(() => ({ configured: 0, connected: 0, failed: 0 })),
    });
    const output = await dispatchMcpSlash({ args: ['list'], bridge: live, lang });
    expect(output).toBe(getMessage('chat.mcp_no_servers_configured', lang));
    expect(output.toLowerCase()).not.toContain('roadmap');
    expect(output.toLowerCase()).not.toContain('not wired');
    expect(output.toLocaleLowerCase('tr')).not.toContain('henüz bağlı değil');
  });

  it.each(['en', 'tr'])('native composition distinguishes no-config and disabled at command time (%s)', (lang) => {
    expect(resolveNativeMcpUnavailableMessage({ connect: false, includeProjectScope: false, notice: false }, lang))
      .toBe(getMessage('chat.mcp_no_servers_configured', lang));
    expect(resolveNativeMcpUnavailableMessage({ connect: false, includeProjectScope: false, notice: true }, lang))
      .toBe(getMessage('chat.mcp_client_disabled', lang));
    expect(resolveNativeMcpUnavailableMessage({ connect: true, includeProjectScope: true, notice: false }, lang))
      .toBeUndefined();
  });

  it.each(['en', 'tr'])('legacy absent-bridge copy is truthful and has no roadmap claim (%s)', (lang) => {
    const output = getMessage('chat.mcp_not_wired', lang);
    expect(output.toLowerCase()).not.toMatch(/roadmap|f9 phase|yol haritas|f9 faz/);
    expect(output).toMatch(/MCP/);
  });

  it.each(['en', 'tr'])('keeps healthy tool output and reports partial connection in %s', async (lang) => {
    const live = bridge({
      connectionObservation: vi.fn(() => ({ configured: 2, connected: 1, failed: 1 })),
    });
    const output = await dispatchMcpSlash({ args: ['list'], bridge: live, lang });
    expect(output).toContain('fixture__read');
    expect(output).toContain(getMessage('chat.mcp_partial_connection', lang, { connected: '1', failed: '1' }));
  });

  it('does not expose a thrown connection error', async () => {
    const live = bridge({ loadAndConnectAll: vi.fn(async () => { throw new Error('token=secret'); }) });
    const output = await dispatchMcpSlash({ args: ['list'], bridge: live, lang: 'en' });
    expect(output).toBe(getMessage('chat.mcp_operation_failed', 'en'));
    expect(output).not.toContain('secret');
  });

  it('reports connected-no-tools together with a partial failure', async () => {
    const live = bridge({
      listSlashLines: vi.fn(() => []),
      connectionObservation: vi.fn(() => ({ configured: 2, connected: 1, failed: 1 })),
    });
    const output = await dispatchMcpSlash({ args: ['list'], bridge: live, lang: 'tr' });
    expect(output).toContain(getMessage('chat.mcp_connected_no_tools', 'tr'));
    expect(output).toContain(getMessage('chat.mcp_partial_connection', 'tr', { connected: '1', failed: '1' }));
  });

  it('mounted native App dispatches list once and never falls through to provider', async () => {
    const callback = vi.fn(async () => 'native-mcp-list');
    const mounted = mountNative(callback);
    mounted.stdin.write('/mcp list\r');
    await tick();
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(['list']);
    expect(mounted.lastFrame()).toContain('native-mcp-list');
    expect(mounted.lastFrame()).not.toContain('provider-fallback');
    mounted.unmount();
  });

  it.each(['en', 'tr'])('keeps the project-only disabled notice available at command time (%s)', async (lang) => {
    const notice = getMessage('chat.mcp_client_disabled', lang);
    const callback = vi.fn(async () => notice);
    const mounted = mountNative(callback);
    mounted.stdin.write('/mcp\r');
    await tick();
    expect(callback).toHaveBeenCalledWith([]);
    // Ink may wrap prose, so assert stable semantic fragments while the pure
    // catalog assertion above pins the complete EN/TR copy.
    expect(mounted.lastFrame()).toContain('mcp_client_enabled');
    mounted.unmount();
  });

  it('mounted native App denies call in Ask before callback and no-bridge uses registry fallback', async () => {
    const callback = vi.fn(async () => 'must-not-dispatch');
    const denied = mountNative(callback, 'ask');
    denied.stdin.write('/mcp call fixture__write x=1\r');
    await tick();
    expect(callback).not.toHaveBeenCalled();
    expect(denied.lastFrame()).not.toContain('must-not-dispatch');
    denied.unmount();

    const absent = mountNative();
    absent.stdin.write('/mcp list\r');
    await tick();
    expect(absent.lastFrame()).toContain('No external MCP client connection');
    expect(absent.lastFrame()).toContain('enablement.');
    absent.unmount();
  });

  it('does not claim unrelated or legacy slash input', async () => {
    const dispatch = vi.fn(async () => 'unexpected');
    expect(await routeNativeMcpInput({ input: '/memory', dispatch, authorizeCall: () => undefined })).toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    [{ configured: 0, connected: 0, failed: 0 }, []],
    [{ configured: 1, connected: 0, failed: 1 }, []],
  ] as const)('refuses a stale call after config removal or refresh failure', async (observation, connected) => {
    const dispatch = vi.fn(async () => ({ ok: true, output: 'stale-call' }));
    const live = bridge({
      loadAndConnectAll: vi.fn(async () => [...connected]),
      connectionObservation: vi.fn(() => observation),
      dispatch,
    });
    expect(await dispatchMcpSlash({ args: ['call', 'fixture__write'], bridge: live, lang: 'en', confirm: async () => true }))
      .toBe(getMessage('chat.mcp_tool_unavailable', 'en', { tool: 'fixture__write' }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps explicit legacy bridge compatibility without invented observation', async () => {
    const legacy = bridge();
    Object.defineProperty(legacy, 'connectionObservation', { value: undefined });
    expect(await dispatchMcpSlash({ args: ['list'], bridge: legacy, lang: 'en' })).toContain('fixture__read');
  });
});
