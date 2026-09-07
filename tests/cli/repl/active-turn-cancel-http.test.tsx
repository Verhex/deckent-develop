// TERMINAL-TOOLS-008 — mounted native-turn cancellation custody.
//
// This test deliberately uses the production OpenAI-compatible HTTP adapter
// and Node's real loopback transport. It proves the App's Ctrl-C path reaches
// the native bridge/session AbortController, closes the active response, does
// not render a late server success, and leaves the next turn usable.

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReplApp } from '../../../src/cli/repl/app.js';
import { createNativeEngine } from '../../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../../src/cli/repl/native-tool-registry.js';
import { createOpenAIAdapter } from '../../../src/agent/provider-tooluse/openai.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { buildReplLabels, buildShortcutsPanel } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const CTRL_C = '\x03';
const ENTER = '\r';
const t = (key: string): string => getMessage(key, 'en');
const labels = buildReplLabels(t);
const pickerLabels = buildPickerLabels(t);
const roots: string[] = [];
const servers: Server[] = [];

const tick = (ms = 20): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function within<T>(promise: Promise<T>, label: string, timeoutMs = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function eventually(assertion: () => void, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try { assertion(); return; } catch (error) { last = error; }
    await tick();
  }
  throw last;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  server.closeAllConnections();
  await within(new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }), 'loopback server shutdown');
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('mounted ReplApp native Ctrl-C → real HTTP abort', () => {
  it('closes the active SSE response without a late terminal and accepts a fresh next turn', async () => {
    let requests = 0;
    let firstResponseClosed = false;
    let firstResponseOpen = false;
    let naturalDoneSent = false;
    let lateWriteAttempted = false;
    let releaseFirstRequest!: () => void;
    const firstRequest = new Promise<void>((resolve) => { releaseFirstRequest = resolve; });
    let releaseFirstClose!: () => void;
    const firstClose = new Promise<void>((resolve) => { releaseFirstClose = resolve; });
    let releaseLateWrite!: () => void;
    const lateWriteRelease = new Promise<void>((resolve) => { releaseLateWrite = resolve; });

    const server = createServer((request, response) => {
      requests += 1;
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      if (requests === 1) {
        firstResponseOpen = !response.destroyed;
        response.write('data: {"choices":[{"delta":{"content":"partial-native"}}]}\n\n');
        releaseFirstRequest();
        response.once('close', () => {
          firstResponseClosed = true;
          releaseFirstClose();
        });
        // The test releases this only AFTER Ctrl-C's observed response close.
        // Thus a natural DONE can never explain the close event under test.
        void lateWriteRelease.then(() => {
          lateWriteAttempted = true;
          if (!response.destroyed) {
            naturalDoneSent = true;
            response.write('data: {"choices":[{"delta":{"content":"LATE_SUCCESS"}}]}\n\n');
            response.end('data: [DONE]\n\n');
          }
        });
        return;
      }
      response.end('data: {"choices":[{"delta":{"content":"fresh-turn"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\ndata: [DONE]\n\n');
    });
    servers.push(server);
    await within(new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => { server.off('listening', onListening); reject(error); };
      const onListening = (): void => { server.off('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(0, '127.0.0.1');
    }), 'loopback server listen');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('loopback server has no TCP address');

    const cwd = mkdtempSync(join(tmpdir(), 'deckent-l2-abort-'));
    roots.push(cwd);
    const adapter = createOpenAIAdapter({ baseUrl: `http://127.0.0.1:${address.port}/v1`, name: 'loopback' });
    const engine = createNativeEngine({
      adapter,
      model: 'fixture-model',
      lang: 'en',
      cwd,
      registry: buildNativeToolRegistry({ cwd: () => cwd }),
      confirm: async () => 'y',
      toolSink: () => {},
    });
    let mounted: ReturnType<typeof render> | undefined;
    try {
      mounted = render(
        <ReplApp
          provider={{} as never}
          dispatcher={{ dispatch: async () => '' }}
          labels={labels}
          providerName="loopback"
          cwd={cwd}
          registerConfirm={() => {}}
          registerToolSink={() => {}}
          slashRegistry={buildSlashRegistry('en')}
          initialSelection={{ provider: 'loopback', model: 'fixture-model' }}
          onSwitch={() => ({ provider: 'loopback', model: 'fixture-model' })}
          onApprovalMode={() => {}}
          inboxLabels={{} as never}
          pickerLabels={pickerLabels}
          liveFooterLabels={{} as never}
          approvalLabels={{} as never}
          runFlowCardLabels={{} as never}
          runFlowMountLabels={{} as never}
          doSlashLabels={{} as never}
          caretStyle="marker"
          dualStreamOverflow="..."
          shortcutsPanel={buildShortcutsPanel(t)}
          nativeEngine={engine}
        />,
      );

      mounted.stdin.write('first');
      mounted.stdin.write(ENTER);
      await within(firstRequest, 'first loopback request');
      await eventually(() => expect(mounted!.lastFrame() ?? '').toContain('partial-native'));
      expect(firstResponseOpen).toBe(true);
      expect(firstResponseClosed).toBe(false);
      expect(naturalDoneSent).toBe(false);

      mounted.stdin.write(CTRL_C);
      await within(firstClose, 'Ctrl-C response close');
      await eventually(() => expect(mounted!.lastFrame() ?? '').toContain(labels.ctrlCInterrupt));
      // Attempt a late server write only after the real socket has closed.
      releaseLateWrite();
      await eventually(() => expect(lateWriteAttempted).toBe(true));
      expect(firstResponseClosed).toBe(true);
      expect(naturalDoneSent).toBe(false);
      expect(mounted.frames.join('\n')).not.toContain('LATE_SUCCESS');

      mounted.stdin.write('second');
      mounted.stdin.write(ENTER);
      await eventually(() => expect(requests).toBe(2));
      await eventually(() => expect(mounted!.frames.join('\n')).toContain('fresh-turn'));
      expect(mounted.frames.join('\n')).not.toContain('LATE_SUCCESS');
    } finally {
      releaseLateWrite();
      mounted?.unmount();
      await engine.close?.();
    }

  }, 10_000);
});
