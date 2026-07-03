// ─── attachConfiguredApprovalChannels tests (CLIENTS-RELAY-WIRE, task 362-007) ─
// Fake-transport + real ApprovalBroker/ApprovalRelay coverage for the
// config-driven Slack/Teams registration layer: config-on+transport -> attach,
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

const CREATED_AT = '2026-07-02T21:00:00.000Z';
const EXPIRES_AT = '2026-07-02T21:15:00.000Z';
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

    slack.fireAction({ channelId: 'C-1', userId: 'alperen', actionValue: `approve:${req.id}` });

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

    teams.fireCardAction({ channelId: 'T-1', userId: 'alperen', actionValue: `reject:${req.id}` });

    const decision = await waiting;
    expect(decision.decision).toBe('deny');
    expect(decision.channel).toBe('teams');
    rmSync(projectRoot, { recursive: true, force: true });
  });
});
