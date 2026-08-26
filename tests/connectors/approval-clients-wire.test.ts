// ─── attachConfiguredApprovalChannels tests (CLIENTS-RELAY-WIRE, task 362-007) ─
// Fake-transport + real ApprovalBroker/ApprovalRelay coverage for the
// config-driven Slack/Teams/Telegram registration layer: config-on+transport -> attach,
// off/absent -> nothing, unresolved/missing secret -> skip, one channel's
// misconfiguration never blocks the other, secret value never leaks into any
// log call, and a full pending -> decision roundtrip through the wired channel.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalRelay } from '../../src/core/approval-relay.js';
import {
  attachConfiguredApprovalChannels,
  type ApprovalClientsWireConfig,
} from '../../src/connectors/approval-clients-wire.js';
import type {
  SlackApprovalTransport,
  SlackBlockActionInteraction,
  SlackMessagePayload,
} from '../../src/connectors/approval-slack.js';
import type {
  TeamsApprovalTransport,
  TeamsAdaptiveCardActionInvocation,
  TeamsMessagePayload,
} from '../../src/connectors/approval-teams.js';
import type { TelegramApprovalTransport } from '../../src/connectors/approval-telegram.js';
import { EventEmitter } from "node:events";
import type { OutgoingMessage } from "../../src/connectors/types.js";
import type { ApprovalRequest } from "../../src/core/approval-contract.js";
import type { ApprovalSlaEvidence } from "../../src/core/approval-sla.js";

const CREATED_AT = '2099-07-02T21:00:00.000Z';
const EXPIRES_AT = '2099-07-02T21:15:00.000Z';
const SECRET_VALUE = 'xoxb-real-secret-should-never-leak-123456';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-362-007' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-362',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    maskedArgs: { cmd: '[REDACTED]' },
    ...overrides,
  };
}

function makeFakeSlackTransport() {
  const sent: SlackMessagePayload[] = [];
  let actionHandler: ((interaction: SlackBlockActionInteraction) => void) | undefined;
  let nextTs = 1;

  const transport: SlackApprovalTransport = {
    async postMessage(payload) {
      sent.push(payload);
    },
    async postMessageReturningTs(payload) {
      sent.push(payload);
      return String(nextTs++);
    },
    onBlockAction(handler) {
      actionHandler = handler;
    },
  };

  return {
    transport,
    sent,
    fireAction(interaction: SlackBlockActionInteraction) {
      if (!actionHandler) throw new Error('onBlockAction handler was never registered');
      actionHandler(interaction);
    },
  };
}

function makeFakeTeamsTransport() {
  const sent: TeamsMessagePayload[] = [];
  let cardActionHandler: ((invocation: TeamsAdaptiveCardActionInvocation) => void) | undefined;
  let nextActivityId = 1;

  const transport: TeamsApprovalTransport = {
    async sendActivity(payload) {
      sent.push(payload);
    },
    async sendActivityReturningId(payload) {
      sent.push(payload);
      return String(nextActivityId++);
    },
    onCardAction(handler) {
      cardActionHandler = handler;
    },
  };

  return {
    transport,
    sent,
    fireCardAction(invocation: TeamsAdaptiveCardActionInvocation) {
      if (!cardActionHandler) throw new Error('onCardAction handler was never registered');
      cardActionHandler(invocation);
    },
  };
}

function makeFakeTelegramTransport(): TelegramApprovalTransport {
  return {
    async sendMessage() {},
    onCallback() {},
  };
}

function setup() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'approval-clients-wire-'));
  const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
  const relay = new ApprovalRelay(broker);
  return { projectRoot, broker, relay };
}

describe('attachConfiguredApprovalChannels — config-on + fake transport -> attach', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches slack when enabled with a resolved token + channel_id + transport', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: true, token: SECRET_VALUE, channel_id: 'C-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport });

    expect(relay.channelNames).toContain('slack');
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('attaches teams when enabled with a resolved token + channel_id + transport', () => {
    const { relay, projectRoot } = setup();
    const teams = makeFakeTeamsTransport();

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        teams: { enabled: true, token: SECRET_VALUE, channel_id: 'T-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { teams: teams.transport });

    expect(relay.channelNames).toContain('teams');
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('attaches telegram when enabled with chat_id + transport', () => {
    const { relay, projectRoot } = setup();
    const telegram = makeFakeTelegramTransport();

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        telegram: { enabled: true, chat_id: 'TG-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { telegram });

    expect(relay.channelNames).toContain('telegram');
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('silently skips telegram when no transport is provided', () => {
    const { relay, projectRoot } = setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        telegram: { enabled: true, chat_id: 'TG-1' },
      },
    };

    expect(() => attachConfiguredApprovalChannels(relay, config, {})).not.toThrow();
    expect(relay.channelNames).not.toContain('telegram');
    expect(errorSpy).not.toHaveBeenCalled();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('attaches both slack and teams from one config + transports call', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();
    const teams = makeFakeTeamsTransport();

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: true, token: SECRET_VALUE, channel_id: 'C-1' },
        teams: { enabled: true, token: SECRET_VALUE, channel_id: 'T-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport, teams: teams.transport });

    expect(relay.channelNames).toContain('slack');
    expect(relay.channelNames).toContain('teams');
    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe('attachConfiguredApprovalChannels — off/absent -> nothing attached', () => {
  it('attaches nothing when approval_channels is absent entirely', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();
    const teams = makeFakeTeamsTransport();

    attachConfiguredApprovalChannels(relay, {}, { slack: slack.transport, teams: teams.transport });

    expect(relay.channelNames).toHaveLength(0);
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('attaches nothing when config itself is undefined', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();

    attachConfiguredApprovalChannels(relay, undefined, { slack: slack.transport });

    expect(relay.channelNames).toHaveLength(0);
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('does not attach a channel whose enabled flag is false', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();
    const teams = makeFakeTeamsTransport();

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: false, token: SECRET_VALUE, channel_id: 'C-1' },
        teams: { enabled: true, token: SECRET_VALUE, channel_id: 'T-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport, teams: teams.transport });

    expect(relay.channelNames).not.toContain('slack');
    expect(relay.channelNames).toContain('teams');
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('does not attach a channel whose enabled flag is absent (default-off)', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { token: SECRET_VALUE, channel_id: 'C-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport });

    expect(relay.channelNames).toHaveLength(0);
    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe('attachConfiguredApprovalChannels — unresolved/missing secret -> skip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips slack when the token is still the unresolved $DECK: placeholder', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: true, token: '$DECK:SLACK_APPROVAL_TOKEN', channel_id: 'C-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport });

    expect(relay.channelNames).not.toContain('slack');
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('skips teams when the token is missing entirely', () => {
    const { relay, projectRoot } = setup();
    const teams = makeFakeTeamsTransport();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        teams: { enabled: true, channel_id: 'T-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { teams: teams.transport });

    expect(relay.channelNames).not.toContain('teams');
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('skips a channel when channel_id is missing, even with a resolved token', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: true, token: SECRET_VALUE },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport });

    expect(relay.channelNames).not.toContain('slack');
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('skips a channel enabled+resolved but with no transport provided (never throws)', () => {
    const { relay, projectRoot } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: true, token: SECRET_VALUE, channel_id: 'C-1' },
      },
    };

    expect(() => attachConfiguredApprovalChannels(relay, config, {})).not.toThrow();
    expect(relay.channelNames).not.toContain('slack');
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('one misconfigured channel (unresolved token) never blocks the other (valid) channel', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();
    const teams = makeFakeTeamsTransport();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: true, token: '$DECK:SLACK_APPROVAL_TOKEN', channel_id: 'C-1' },
        teams: { enabled: true, token: SECRET_VALUE, channel_id: 'T-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport, teams: teams.transport });

    expect(relay.channelNames).not.toContain('slack');
    expect(relay.channelNames).toContain('teams');
    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe('attachConfiguredApprovalChannels — secret never leaks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never logs the resolved secret value, on a successful attach', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: true, token: SECRET_VALUE, channel_id: 'C-1' },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport });

    const allCalls = [...errorSpy.mock.calls, ...logSpy.mock.calls].flat().map(String);
    expect(allCalls.some((s) => s.includes(SECRET_VALUE))).toBe(false);
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('never logs the resolved secret value, on a skip path (missing channel_id)', () => {
    const { relay, projectRoot } = setup();
    const slack = makeFakeSlackTransport();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: true, token: SECRET_VALUE },
      },
    };

    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport });

    const allCalls = [...errorSpy.mock.calls, ...logSpy.mock.calls].flat().map(String);
    expect(allCalls.some((s) => s.includes(SECRET_VALUE))).toBe(false);
    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe('attachConfiguredApprovalChannels — full pending -> decision roundtrip', () => {
  it('slack: a wired button press resolves the broker awaitDecision end-to-end', async () => {
    const { relay, broker, projectRoot } = setup();
    const slack = makeFakeSlackTransport();

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        slack: { enabled: true, token: SECRET_VALUE, channel_id: 'C-1' },
      },
    };
    attachConfiguredApprovalChannels(relay, config, { slack: slack.transport });

    const req = broker.submit(buildRequest('apr-wire-sl-1'));
    const waiting = broker.awaitDecision(req.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(slack.sent).toHaveLength(1);
    expect(slack.sent[0]!.channel).toBe('C-1');

    const actionValue = (slack.sent[0]!.blocks[1] as {
      elements: ReadonlyArray<{ value: string }>;
    }).elements[0]!.value;
    slack.fireAction({ channelId: 'C-1', userId: 'alperen', actionValue });

    const decision = await waiting;
    expect(decision.decision).toBe('allow');
    expect(decision.channel).toBe('slack');
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('teams: a wired card action resolves the broker awaitDecision end-to-end', async () => {
    const { relay, broker, projectRoot } = setup();
    const teams = makeFakeTeamsTransport();

    const config: ApprovalClientsWireConfig = {
      approval_channels: {
        teams: { enabled: true, token: SECRET_VALUE, channel_id: 'T-1' },
      },
    };
    attachConfiguredApprovalChannels(relay, config, { teams: teams.transport });

    const req = broker.submit(buildRequest('apr-wire-tm-1'));
    const waiting = broker.awaitDecision(req.id);
    await Promise.resolve();
    await Promise.resolve();

    expect(teams.sent).toHaveLength(1);
    expect(teams.sent[0]!.channelId).toBe('T-1');

    const actionValue = (teams.sent[0]!.attachments[0]!.content.actions[1]!.data as {
      value: string;
    }).value;
    teams.fireCardAction({ channelId: 'T-1', userId: 'alperen', actionValue });

    const decision = await waiting;
    expect(decision.decision).toBe('deny');
    expect(decision.channel).toBe('teams');
    rmSync(projectRoot, { recursive: true, force: true });
  });
});

// WIRE-020: physically merged from tests/connectors/approval-clients-wire-sla.test.ts.
{
class RelayBrokerStub extends EventEmitter {
    decideChecked(): never { throw new Error('decision path is outside this lifecycle delivery test'); }
}

function request(): ApprovalRequest {
    return {
        id: 'approval-client-sla',
        version: '1.0',
        requester: { role: 'worker', instanceId: 'worker-1' },
        summary: 'review deployment',
        details: {},
        scopeId: 'scope-1',
        scope: 'shell-exec',
        risk: 'high',
        policy: 'require-approval',
        defaultAction: 'deny',
        tenantId: 'tenant-1',
        userId: 'operator-1',
        createdAt: '2026-08-21T12:00:00.000Z',
        expiresAt: '2026-08-21T12:10:00.000Z',
        maskedArgs: {},
        rawArgsRef: null,
    } as ApprovalRequest;
}

function evidence(stage: 'renotify' | 'expired', suffix: string): ApprovalSlaEvidence {
    return {
        eventId: `approval-sla:${suffix.repeat(64).slice(0, 64)}`,
        requestId: 'approval-client-sla',
        lifecycleGeneration: 'generation-1',
        stage,
        ordinal: stage === 'expired' ? 4 : 1,
        kind: stage === 'expired' ? 'expired' : 'due',
        dueAt: stage === 'expired' ? '2026-08-21T12:10:00.000Z' : '2026-08-21T12:01:00.000Z',
        observedAt: stage === 'expired' ? '2026-08-21T12:10:00.001Z' : '2026-08-21T12:01:00.001Z',
        authoredPolicyDigest: 'a'.repeat(64),
        appliedPolicyDigest: 'b'.repeat(64),
    };
}

function transports(options: {
    failSlack?: boolean;
} = {}) {
    const slack: SlackMessagePayload[] = [];
    const teams: TeamsMessagePayload[] = [];
    const telegram: OutgoingMessage[] = [];
    const slackTransport: SlackApprovalTransport = {
        async postMessage(payload) {
            if (options.failSlack)
                throw new Error('slack transport failed');
            slack.push(payload);
        },
        onBlockAction() { },
    };
    const teamsTransport: TeamsApprovalTransport = {
        async sendActivity(payload) { teams.push(payload); },
        onCardAction() { },
    };
    const telegramTransport: TelegramApprovalTransport = {
        async sendMessage(message) { telegram.push(message); },
        onCallback() { },
    };
    return {
        slack,
        teams,
        telegram,
        wire: { slack: slackTransport, teams: teamsTransport, telegram: telegramTransport },
    };
}

const config: ApprovalClientsWireConfig = {
    approval_channels: {
        slack: { enabled: true, token: 'resolved-slack-token', channel_id: 'slack-ops', lang: 'en' },
        teams: { enabled: true, token: 'resolved-teams-token', channel_id: 'teams-ops', lang: 'en' },
        telegram: { enabled: true, chat_id: 'telegram-ops', lang: 'en' },
    },
};

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
}

function relay(): ApprovalRelay {
    return new ApprovalRelay(new RelayBrokerStub() as never);
}

describe('approval client lifecycle-stage wire', () => {
    it('fans one stable event to every configured client and durable per-client ACKs suppress restart replay', async () => {
        const ackRoot = mkdtempSync(join(tmpdir(), 'approval-client-acks-'));
        const first = transports();
        const firstRelay = relay();
        attachConfiguredApprovalChannels(firstRelay, config, first.wire, { lifecycleAckRoot: ackRoot });
        firstRelay.dispatchLifecycleStage(request(), evidence('renotify', 'c'));
        firstRelay.dispatchLifecycleStage(request(), evidence('renotify', 'c'));
        await settle();
        expect(first.slack).toHaveLength(1);
        expect(first.teams).toHaveLength(1);
        expect(first.telegram).toHaveLength(1);
        expect(first.slack[0]!.blocks.some(block => block.type === 'actions')).toBe(false);
        expect(first.teams[0]!.attachments[0]!.content.actions).toEqual([]);
        expect(first.telegram[0]!.buttons).toBeUndefined();
        const restarted = transports();
        const restartedRelay = relay();
        attachConfiguredApprovalChannels(restartedRelay, config, restarted.wire, { lifecycleAckRoot: ackRoot });
        restartedRelay.dispatchLifecycleStage(request(), evidence('renotify', 'c'));
        await settle();
        expect(restarted.slack).toHaveLength(0);
        expect(restarted.teams).toHaveLength(0);
        expect(restarted.telegram).toHaveLength(0);
    });
    it('does not ACK a failed transport send, so the same event remains retryable', async () => {
        const ackRoot = mkdtempSync(join(tmpdir(), 'approval-client-retry-'));
        const failed = transports({ failSlack: true });
        const failedRelay = relay();
        const channelError = vi.fn();
        failedRelay.on('channel-error', channelError);
        attachConfiguredApprovalChannels(failedRelay, {
            approval_channels: { slack: config.approval_channels!.slack },
        }, { slack: failed.wire.slack }, { lifecycleAckRoot: ackRoot });
        failedRelay.dispatchLifecycleStage(request(), evidence('renotify', 'd'));
        await settle();
        expect(channelError).toHaveBeenCalledTimes(1);
        const retry = transports();
        const retryRelay = relay();
        attachConfiguredApprovalChannels(retryRelay, {
            approval_channels: { slack: config.approval_channels!.slack },
        }, { slack: retry.wire.slack }, { lifecycleAckRoot: ackRoot });
        retryRelay.dispatchLifecycleStage(request(), evidence('renotify', 'd'));
        await settle();
        expect(retry.slack).toHaveLength(1);
    });
    it('renders expiry through the injected i18n formatter as a view-only message on every client', async () => {
        const output = transports();
        const lifecycleRelay = relay();
        attachConfiguredApprovalChannels(lifecycleRelay, config, output.wire);
        lifecycleRelay.dispatchLifecycleStage(request(), evidence('expired', 'e'));
        await settle();
        expect(output.slack[0]!.blocks.some(block => block.type === 'actions')).toBe(false);
        expect(output.teams[0]!.attachments[0]!.content.actions).toEqual([]);
        expect(output.telegram[0]!.buttons).toBeUndefined();
        expect(output.slack[0]!.text).toMatch(/expired|approvals\.expired/iu);
        expect(output.teams[0]!.text).toMatch(/expired|approvals\.expired/iu);
        expect(output.telegram[0]!.text).toMatch(/expired|approvals\.expired/iu);
    });
});
}
