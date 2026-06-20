// src/connectors/gateway/gateway-router.ts
import type { IncomingMessage, InlineButton } from '../types.js';
import type { SessionRegistry } from './session-registry.js';
import type { ProjectRegistry } from './project-registry.js';
import type { RuntimeSupervisor } from './runtime-supervisor.js';
import { getMessage } from '../../cli/helpers/messages.js';

export interface GatewayRouterDeps {
  sessions: SessionRegistry;
  projects: ProjectRegistry;
  supervisor: RuntimeSupervisor;
  send: (chatKey: string, parts: string[], buttons?: ReadonlyArray<ReadonlyArray<InlineButton>>) => Promise<void>;
  isAuthorized: (chatKey: string, projectPath: string) => boolean;
  requestPairing: (chatKey: string) => Promise<string>;
  lang: string;
  newId: () => string;
}

/** Canonical chat identity used as the session key. */
export function chatKeyOf(connector: string, channelId: string): string {
  return `${connector}:${channelId}`;
}

/** Build the inbound message handler for the gateway. */
export function makeGatewayRouter(deps: GatewayRouterDeps): (msg: IncomingMessage) => void {
  const { sessions, projects, supervisor, send, isAuthorized, requestPairing, lang } = deps;

  return (msg: IncomingMessage): void => {
    const chatKey = chatKeyOf(msg.connector, msg.channelId);
    void route(msg, chatKey).catch(() => { /* never crash the poller */ });
  };

  async function route(msg: IncomingMessage, chatKey: string): Promise<void> {
    const text = msg.text.trim();

    // Gateway-level slashes (never forwarded to a runtime).
    if (text.startsWith('/')) {
      await handleSlash(text, chatKey);
      return;
    }

    const binding = sessions.resolve(chatKey);
    if (!binding) {
      await send(chatKey, [getMessage('gateway.unbound', lang)]);
      return;
    }
    if (!isAuthorized(chatKey, binding.projectPath)) return; // silent drop

    const handle = supervisor.getOrSpawn(binding.projectPath);
    const resp = await handle.send({ id: deps.newId(), chatKey, kind: 'message', text });
    if (resp.kind === 'final') await send(chatKey, resp.parts, resp.buttons);
  }

  async function handleSlash(text: string, chatKey: string): Promise<void> {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ').trim();
    switch (cmd) {
      case '/use': {
        if (!arg) { await send(chatKey, [getMessage('gateway.use_usage', lang)]); return; }
        const proj = projects.resolve(arg);
        if (!proj) { await send(chatKey, [getMessage('gateway.use_unknown', lang, { name: arg })]); return; }
        if (!isAuthorized(chatKey, proj.path)) {
          const code = await requestPairing(chatKey);
          await send(chatKey, [getMessage('gateway.pair_needed', lang, { project: proj.name, code })]);
          return;
        }
        await sessions.bind(chatKey, proj.path, chatKey);
        await send(chatKey, [getMessage('gateway.bound_ok', lang, { project: proj.name })]);
        return;
      }
      case '/unbind': {
        const ok = await sessions.unbind(chatKey);
        await send(chatKey, [getMessage(ok ? 'gateway.unbind_ok' : 'gateway.not_bound', lang)]);
        return;
      }
      case '/whoami': {
        const b = sessions.resolve(chatKey);
        await send(chatKey, [b ? getMessage('gateway.whoami', lang, { project: b.projectPath }) : getMessage('gateway.unbound', lang)]);
        return;
      }
      case '/projects': {
        const rows = projects.list().map((p) => getMessage('gateway.projects_row', lang, { name: p.name, path: p.path }));
        await send(chatKey, [getMessage('gateway.projects_header', lang), ...rows]);
        return;
      }
      default: {
        // Unknown slash → treat as unbound-style guidance (no CLI leak).
        await send(chatKey, [getMessage('gateway.unbound', lang)]);
      }
    }
  }
}
