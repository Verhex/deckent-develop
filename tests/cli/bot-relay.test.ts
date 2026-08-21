import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleBotListen, setupBotApprovalRelay } from '../../src/cli/commands/bot.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { shortCodeFor } from '../../src/core/approval-short-code.js';
import type { ApprovalAuthorityRuntimeOpenResult } from '../../src/core/approval-authority-runtime.js';
import type { DeckentConfig } from '../../src/core/types.js';
import type { TelegramApprovalTransport } from '../../src/connectors/approval-telegram.js';
import type { ResolvedPrincipal } from '../../src/connectors/identity/provider.js';

const roots: string[] = [];

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-bot-relay-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function config(relayEnabled: boolean): DeckentConfig {
  return {
    approval: {
      relay_enabled: relayEnabled,
      authority: { enabled: true, tenant_id: 'main' },
    },
  } as unknown as DeckentConfig;
}

function request(id: string, risk: ApprovalRequestInput['risk'] = 'high'): ApprovalRequestInput {
  const now = Date.now();
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-602-001' },
    summary: 'approve bounded action',
    details: { command: 'echo safe' },
    scopeId: 'sprint-602',
    scope: 'shell-exec',
    risk,
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'main',
    userId: 'operator',
    createdAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    maskedArgs: {},
  };
}

function principal(): ResolvedPrincipal {
  return {
    userId: 'operator',
    role: 'owner',
    permissions: [],
    tenantId: 'main',
    verified: true,
    source: 'test',
  };
}

function chatCtx() {
  return {
    connector: 'telegram' as const,
    fromUser: 'tg-operator',
    channelId: '555',
    resolvePrincipal: () => principal(),
    isAuthorized: () => true,
  };
}

function readyRuntime(broker: ApprovalBroker, decideChannel: ReturnType<typeof vi.fn>) {
  const service = {
    broker,
    decideChannel,
    close: vi.fn(),
  };
  const opened = {
    state: 'ready',
    service,
    authorityEvidenceRef: 'approval-authority:test',
  } as unknown as ApprovalAuthorityRuntimeOpenResult;
  return { service, openRuntime: vi.fn(() => opened) };
}

describe('setupBotApprovalRelay flag gate and Telegram push', () => {
  it('handleBotListen keeps the disabled path byte-compatible with the two-argument bootstrap', async () => {
    const dispose = vi.fn(async () => {});
    const bootstrap = vi.fn(async () => ({ adapter: null, active: [], dispose }));

    await handleBotListen({ root: projectRoot(), bootstrap, print: vi.fn() });

    expect(bootstrap).toHaveBeenCalledOnce();
    expect(bootstrap.mock.calls[0]).toHaveLength(2);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('relay_enabled=false performs zero authority or relay construction', () => {
    const openRuntime = vi.fn();
    const result = setupBotApprovalRelay({
      root: projectRoot(),
      config: config(false),
      lang: 'en',
      print: vi.fn(),
      openRuntime,
    });

    expect(result).toBeNull();
    expect(openRuntime).not.toHaveBeenCalled();
  });

  it('attaches the existing Telegram transport and pushes pending requests', async () => {
    const root = projectRoot();
    const broker = new ApprovalBroker(root);
    broker.submit(request('telegram-push-1'));
    const runtime = readyRuntime(broker, vi.fn());
    const sent: unknown[] = [];
    const transport: TelegramApprovalTransport = {
      sendMessage: vi.fn(async (message) => { sent.push(message); }),
      onCallback: vi.fn(),
    };
    const handle = setupBotApprovalRelay({
      root,
      config: config(true),
      lang: 'en',
      print: vi.fn(),
      openRuntime: runtime.openRuntime,
    });

    expect(handle).not.toBeNull();
    handle!.attachTelegram(transport, '555');
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ connector: 'telegram', channelId: '555' });
    handle!.dispose();
  });
});

describe('bot brk decision chain', () => {
  it('resolves a short code and returns the localized decided outcome', async () => {
    const root = projectRoot();
    const broker = new ApprovalBroker(root);
    const pending = broker.submit(request('decision-golden-1'));
    const decideChannel = vi.fn(async () => ({ kind: 'decided', decision: {} }));
    const runtime = readyRuntime(broker, decideChannel);
    const handle = setupBotApprovalRelay({
      root,
      config: config(true),
      lang: 'en',
      print: vi.fn(),
      openRuntime: runtime.openRuntime,
    })!;

    const reply = await handle.brkDecider({
      version: 'dk1', ns: 'brk', action: 'approve', shortCode: shortCodeFor(pending.id), nonce: '0123abcd',
    }, chatCtx());

    expect(decideChannel).toHaveBeenCalledWith(
      root,
      expect.anything(),
      expect.objectContaining({ requestId: pending.id, action: 'allow' }),
    );
    expect(reply).toContain('was decided');
    handle.dispose();
  });

  it('rejects an ambiguous short code before invoking authority', async () => {
    const root = projectRoot();
    const broker = new ApprovalBroker(root);
    const seen = new Map<string, string>();
    let collision: [string, string] | undefined;
    for (let index = 0; index < 40_000 && !collision; index += 1) {
      const id = 'collision-' + index;
      const code = shortCodeFor(id);
      const prior = seen.get(code);
      if (prior) collision = [prior, id];
      else seen.set(code, id);
    }
    expect(collision).toBeDefined();
    broker.submit(request(collision![0]));
    broker.submit(request(collision![1]));
    const decideChannel = vi.fn();
    const runtime = readyRuntime(broker, decideChannel);
    const handle = setupBotApprovalRelay({
      root, config: config(true), lang: 'en', print: vi.fn(), openRuntime: runtime.openRuntime,
    })!;

    const reply = await handle.brkDecider({
      version: 'dk1', ns: 'brk', action: 'reject', shortCode: shortCodeFor(collision![0]), nonce: '89abcdef',
    }, chatCtx());

    expect(reply).toContain('ambiguous');
    expect(decideChannel).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('critical requests fail authentication and return the CLI-only hint', async () => {
    const root = projectRoot();
    const broker = new ApprovalBroker(root);
    const pending = broker.submit(request('critical-1', 'critical'));
    const decideChannel = vi.fn(async (_root, authenticator, command) => {
      const live = await authenticator.reauthenticate({
        request: pending,
        requestDigest: 'digest',
        action: command.action,
        channel: 'channel',
      });
      return live === null
        ? { kind: 'rejected', reason: 'unauthorized' }
        : { kind: 'decided', decision: {} };
    });
    const runtime = readyRuntime(broker, decideChannel);
    const handle = setupBotApprovalRelay({
      root, config: config(true), lang: 'en', print: vi.fn(), openRuntime: runtime.openRuntime,
    })!;

    const reply = await handle.brkDecider({
      version: 'dk1', ns: 'brk', action: 'approve', shortCode: shortCodeFor(pending.id), nonce: 'fedcba98',
    }, chatCtx());

    expect(reply).toContain('Decide via CLI');
    handle.dispose();
  });
});
