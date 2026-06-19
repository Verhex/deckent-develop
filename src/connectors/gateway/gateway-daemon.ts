// src/connectors/gateway/gateway-daemon.ts
import type { IMessageConnector } from '../types.js';
import { makeRuntimeSupervisor, type RuntimeSupervisor } from './runtime-supervisor.js';
import { makeGatewayRouter } from './gateway-router.js';
import { loadSessionRegistry } from './session-registry.js';
import { loadProjectRegistry } from './project-registry.js';
import { runRuntimeLoop } from './gateway-runtime.js';
import { getLanguage, getMessage } from '../../cli/helpers/messages.js';
import { chunkMessage } from '../message-format.js';

export interface GatewayListenDeps {
  /** Test seam: construct a connector instead of lazy-loading the real module. */
  makeConnector?: (id: 'telegram' | 'discord') => IMessageConnector | null;
  /** Test seam: inject the supervisor. Default: real spawned children. */
  supervisor?: RuntimeSupervisor;
  /** Test seam: block until stopped. Default: resolve on SIGINT/SIGTERM. */
  waitForever?: () => Promise<void>;
  /** Output sink. */
  print?: (s: string) => void;
}

export interface GatewayListenOptions {
  lang?: string;
  /** Gateway-level bot token (one bot, many chats). */
  gatewayToken: string;
  deps?: GatewayListenDeps;
}

export interface GatewayHandle {
  active: string[];
  dispose: () => Promise<void>;
}

let idCounter = 0;
const nextId = (): string => `g${++idCounter}`;

async function loadRealConnector(id: 'telegram' | 'discord'): Promise<IMessageConnector | null> {
  try {
    if (id === 'telegram') {
      const m = await import('../telegram.js');
      return new m.TelegramConnector();
    }
    const m = await import('../discord.js');
    return new m.DiscordConnector();
  } catch {
    return null;
  }
}

/** Bring up the single connector + wire the gateway router. */
export async function startGatewayListen(opts: GatewayListenOptions): Promise<GatewayHandle> {
  const lang = getLanguage(opts.lang);
  const print = opts.deps?.print ?? ((s: string): void => console.log(s));

  const sessions = await loadSessionRegistry();
  const projects = await loadProjectRegistry();
  const supervisor = opts.deps?.supervisor ?? makeRuntimeSupervisor();

  const connector = opts.deps?.makeConnector
    ? opts.deps.makeConnector('telegram')
    : await loadRealConnector('telegram');

  if (!connector) {
    print(getMessage('gateway.listen_none', lang));
    return { active: [], dispose: async () => { await supervisor.dispose(); } };
  }

  const send = async (chatKey: string, parts: string[]): Promise<void> => {
    const channelId = chatKey.split(':').slice(1).join(':');
    for (const part of parts) {
      for (const chunk of chunkMessage(part)) {
        await connector.sendMessage({ connector: connector.id, channelId, text: chunk });
      }
    }
  };

  const router = makeGatewayRouter({
    sessions, projects, supervisor, send,
    isAuthorized: () => true, // G1: allowlist hook (per-project allowlist hardening = G3)
    lang, newId: nextId,
  });
  connector.onMessage(router);

  // NOTE (G1 scope): approval-callback handling (inline-button approve/reject →
  // resolve the bound project's parked action) is deferred to the G1 follow-up
  // together with /pending + pairing. We intentionally do NOT wire onCallback
  // here, so a button press is never silently misrouted into the chat runtime.

  await connector.start({ enabled: true, token: opts.gatewayToken });
  print(getMessage('gateway.listen_active', lang, { connectors: connector.id }));

  const wait = opts.deps?.waitForever ?? waitForSignal;
  const handle: GatewayHandle = {
    active: [connector.id],
    dispose: async () => {
      await connector.stop().catch(() => {});
      await supervisor.dispose();
    },
  };
  // Fire the wait in the background so callers (and tests) get the handle immediately.
  void wait().then(() => handle.dispose()).catch(() => {});
  return handle;
}

/**
 * Child entry: serve ONE project via the gated agentic chat responder.
 *
 * CRITICAL: makeChatResponder returns a ChatResponder which is a CALLABLE FUNCTION
 * `(sessionId: string, text: string) => Promise<string>`, NOT an object with `.chat`.
 * Call it as `responder(sessionId, text)` directly.
 */
export function runGatewayRuntimeChild(opts: { projectPath: string; lang?: string }): void {
  const lang = getLanguage(opts.lang);
  // Lazy import to keep the daemon's module graph light; respond is the gated
  // agentic chat for this project (same engine the single-project bot uses).
  void import('../chat-bridge.js').then(({ makeChatResponder }) => {
    const responder = makeChatResponder({ agentic: true, root: opts.projectPath, lang });
    runRuntimeLoop({
      input: process.stdin,
      output: (line) => process.stdout.write(line),
      // responder IS the callable function — call it directly (not .chat())
      respond: (text) => responder(`gateway:${opts.projectPath}`, text),
    });
  });
}

function waitForSignal(): Promise<void> {
  return new Promise<void>((resolve) => {
    const stop = (): void => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}
