// ─── ApprovalSlackChannel / ApprovalTeamsChannel tests (APR-CLIENTS-CORE, task 361-010) ─
// Fake-transport unit tests for the Slack and Teams RelayChannel adapters, mirroring
// approval-telegram.test.ts's coverage groups per adapter: pending -> real platform
// payload (Slack Block Kit / Teams Adaptive Card, masked-only, schema-correct),
// cross-decided -> edit-in-place/fallback send, callback -> decision (approve/reject
// -> allow/deny, unrelated payload ignored), and an end-to-end wire through a REAL
// ApprovalBroker + ApprovalRelay proving a transport failure never kills the relay
// or blocks another attached channel.
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalRelay, type RelayChannel, type RelayNotification } from '../../src/core/approval-relay.js';
import {
  ApprovalSlackChannel,
  type SlackApprovalTransport,
  type SlackBlockActionInteraction,
  type SlackMessagePayload,
} from '../../src/connectors/approval-slack.js';
import {
  ApprovalTeamsChannel,
  type TeamsApprovalTransport,
  type TeamsAdaptiveCardActionInvocation,
  type TeamsMessagePayload,
} from '../../src/connectors/approval-teams.js';

const CREATED_AT = '2099-07-01T21:00:00.000Z';
const EXPIRES_AT = '2099-07-01T21:15:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-361-010' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-361',
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

// ─── Slack fake transport ─────────────────────────────────────────────────────

function makeFakeSlackTransport(
  opts: { withReturningTs?: boolean; withUpdateMessage?: boolean; failSend?: boolean } = {},
) {
  const sent: SlackMessagePayload[] = [];
  const updates: Array<{ channelId: string; ts: string; payload: SlackMessagePayload }> = [];
  let actionHandler: ((interaction: SlackBlockActionInteraction) => void) | undefined;
  let nextTs = 1;

  const transport: SlackApprovalTransport = {
    async postMessage(payload) {
      if (opts.failSend) throw new Error('boom: slack post failed');
      sent.push(payload);
    },
    onBlockAction(handler) {
      actionHandler = handler;
    },
  };
  if (opts.withReturningTs !== false) {
    transport.postMessageReturningTs = async (payload) => {
      if (opts.failSend) throw new Error('boom: slack post failed');
      sent.push(payload);
      return String(nextTs++);
    };
  }
  if (opts.withUpdateMessage !== false) {
    transport.updateMessage = async (channelId, ts, payload) => {
      updates.push({ channelId, ts, payload });
    };
  }

  return {
    transport,
    sent,
    updates,
    fireAction(interaction: SlackBlockActionInteraction) {
      if (!actionHandler) throw new Error('onBlockAction handler was never registered');
      actionHandler(interaction);
    },
  };
}

// ─── Teams fake transport ─────────────────────────────────────────────────────

function makeFakeTeamsTransport(
  opts: { withReturningId?: boolean; withUpdateActivity?: boolean; failSend?: boolean } = {},
) {
  const sent: TeamsMessagePayload[] = [];
  const updates: Array<{ channelId: string; activityId: string; payload: TeamsMessagePayload }> = [];
  let cardActionHandler: ((invocation: TeamsAdaptiveCardActionInvocation) => void) | undefined;
  let nextActivityId = 1;

  const transport: TeamsApprovalTransport = {
    async sendActivity(payload) {
      if (opts.failSend) throw new Error('boom: teams send failed');
      sent.push(payload);
    },
    onCardAction(handler) {
      cardActionHandler = handler;
    },
  };
  if (opts.withReturningId !== false) {
    transport.sendActivityReturningId = async (payload) => {
      if (opts.failSend) throw new Error('boom: teams send failed');
      sent.push(payload);
      return String(nextActivityId++);
    };
  }
  if (opts.withUpdateActivity !== false) {
    transport.updateActivity = async (channelId, activityId, payload) => {
      updates.push({ channelId, activityId, payload });
    };
  }

  return {
    transport,
    sent,
    updates,
    fireCardAction(invocation: TeamsAdaptiveCardActionInvocation) {
      if (!cardActionHandler) throw new Error('onCardAction handler was never registered');
      cardActionHandler(invocation);
    },
  };
}

// ─── ApprovalSlackChannel ──────────────────────────────────────────────────────

describe('ApprovalSlackChannel — pending -> Block Kit payload', () => {
  it('sends masked-args + risk/scope summary as a section+actions Block Kit payload, never a raw value', async () => {
    const fake = makeFakeSlackTransport();
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C-1' });

    const req = buildRequest('apr-sl-1');
    await channel.send({ kind: 'pending', request: req as never });

    expect(fake.sent).toHaveLength(1);
    const payload = fake.sent[0]!;
    expect(payload.channel).toBe('C-1');
    expect(payload.text).toContain('approval request apr-sl-1');
    // D3 card-triple (source · reason · #code): risk/scope/masked summaries
    // moved out of the text by design; the raw-never-leaks guarantee below is
    // structural (the contract has no rawArgs field at all).
    expect(payload.text).toMatch(/source: .+ · reason: .+ · #[0-9A-HJ-NP-TV-Z]{5}/u);
    // No raw-args field exists on the contract at all — only maskedArgs — so this
    // is the strongest "raw never leaks" guarantee available (same as approval-relay).
    expect(Object.keys(req)).not.toContain('rawArgs');

    expect(payload.blocks).toHaveLength(2);
    const section = payload.blocks[0]!;
    expect(section.type).toBe('section');
    // D3 card-triple: the section text now carries source · reason · #code
    // (masked/risk summaries left the text by design; raw-args stay structurally
    // impossible — the contract has no such field).
    expect((section as { text: { text: string } }).text.text)
      .toMatch(/source: .+ · reason: .+ · #[0-9A-HJ-NP-TV-Z]{5}/u);

    const actions = payload.blocks[1]!;
    expect(actions.type).toBe('actions');
    const elements = (actions as { elements: ReadonlyArray<{ action_id: string; value: string }> }).elements;
    expect(elements).toHaveLength(2);
    expect(elements[0]!.action_id).toBe('approve');
    // D3: nonce'd namespaced short-code payloads — the raw request id never
    // rides callback data (Telegram 64-byte class constraint, applied uniformly).
    expect(elements[0]!.value).toMatch(/^dk1:brk:approve:[0-9A-HJ-NP-TV-Z]{5}:[0-9a-f]{8}$/u);
    expect(elements[1]!.action_id).toBe('reject');
    expect(elements[1]!.value).toMatch(/^dk1:brk:reject:[0-9A-HJ-NP-TV-Z]{5}:[0-9a-f]{8}$/u);
  });

  it('falls back to postMessage (no ts captured) when the transport lacks postMessageReturningTs', async () => {
    const fake = makeFakeSlackTransport({ withReturningTs: false });
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C-1' });

    await channel.send({ kind: 'pending', request: buildRequest('apr-sl-2') as never });

    expect(fake.sent).toHaveLength(1);
  });
});

describe('ApprovalSlackChannel — cross-decided -> update in place or fallback send', () => {
  it('updates the original card in place when a message ts was captured', async () => {
    const fake = makeFakeSlackTransport();
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C-1' });

    const req = buildRequest('apr-sl-3');
    await channel.send({ kind: 'pending', request: req as never });
    expect(fake.sent).toHaveLength(1);

    await channel.send({
      kind: 'cross-decided',
      request: req as never,
      decision: { requestId: 'apr-sl-3', decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: EXPIRES_AT, reason: '' } as never,
      message: 'terminal kanalında karar verildi',
    });

    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]).toMatchObject({ channelId: 'C-1', ts: '1' });
    expect(fake.updates[0]!.payload.text).toContain('terminal kanalında karar verildi');
    expect(fake.sent).toHaveLength(1); // no extra fallback send once updated
  });

  it('sends a plain follow-up message when no ts was captured (or no updateMessage support)', async () => {
    const fake = makeFakeSlackTransport({ withReturningTs: false, withUpdateMessage: false });
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C-1' });

    const req = buildRequest('apr-sl-4');
    await channel.send({ kind: 'pending', request: req as never });

    await channel.send({
      kind: 'cross-decided',
      request: req as never,
      decision: { requestId: 'apr-sl-4', decision: 'deny', decidedBy: 'alperen', channel: 'terminal', decidedAt: EXPIRES_AT, reason: '' } as never,
      message: 'terminal kanalında karar verildi',
    });

    expect(fake.updates).toHaveLength(0);
    expect(fake.sent).toHaveLength(2);
    expect(fake.sent[1]!.text).toContain('terminal kanalında karar verildi');
  });
});

describe('ApprovalSlackChannel — onDecision (block action -> decision)', () => {
  it('maps an approve press to an allow decision', async () => {
    const fake = makeFakeSlackTransport();
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C-1' });

    const handler = vi.fn();
    channel.onDecision(handler);
    await channel.send({ kind: 'pending', request: buildRequest('apr-sl-5') as never });
    const actionValue = (fake.sent[0]!.blocks[1] as {
      elements: ReadonlyArray<{ value: string }>;
    }).elements[0]!.value;
    fake.fireAction({ channelId: 'C-1', userId: 'u-1', actionValue });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'apr-sl-5', decision: 'allow', decidedBy: 'u-1' }),
    );
  });

  it('maps a reject press to a deny decision', async () => {
    const fake = makeFakeSlackTransport();
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C-1' });

    const handler = vi.fn();
    channel.onDecision(handler);
    await channel.send({ kind: 'pending', request: buildRequest('apr-sl-6') as never });
    const actionValue = (fake.sent[0]!.blocks[1] as {
      elements: ReadonlyArray<{ value: string }>;
    }).elements[1]!.value;
    fake.fireAction({ channelId: 'C-1', userId: 'u-2', actionValue });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'apr-sl-6', decision: 'deny', decidedBy: 'u-2' }),
    );
  });

  it('ignores a non-approval action value', () => {
    const fake = makeFakeSlackTransport();
    const channel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C-1' });

    const handler = vi.fn();
    channel.onDecision(handler);
    fake.fireAction({ channelId: 'C-1', userId: 'u-3', actionValue: 'unrelated-payload' });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('ApprovalSlackChannel — wired into a real ApprovalRelay + ApprovalBroker', () => {
  let projectRoot: string;

  function setup() {
    projectRoot = mkdtempSync(join(tmpdir(), 'approval-slack-'));
    const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    const relay = new ApprovalRelay(broker);
    return { broker, relay };
  }

  it('a transport failure reports channel-error without blocking another attached channel', async () => {
    const failing = makeFakeSlackTransport({ failSend: true });
    const slackChannel = new ApprovalSlackChannel({ transport: failing.transport, channelId: 'C-1' });
    const { broker, relay } = setup();

    const goodSent: RelayNotification[] = [];
    const goodChannel: RelayChannel = {
      send(n) {
        goodSent.push(n);
      },
      onDecision() {},
    };

    relay.attachChannel('slack', slackChannel);
    relay.attachChannel('good', goodChannel);

    const errorListener = vi.fn();
    relay.on('channel-error', errorListener);

    expect(() => broker.submit(buildRequest('apr-sl-7'))).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(goodSent).toHaveLength(1);
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'slack', error: expect.any(Error) }),
    );

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('a button press resolves the broker awaitDecision end-to-end', async () => {
    const fake = makeFakeSlackTransport();
    const slackChannel = new ApprovalSlackChannel({ transport: fake.transport, channelId: 'C-1' });
    const { broker, relay } = setup();

    relay.attachChannel('slack', slackChannel);

    const req = broker.submit(buildRequest('apr-sl-8'));
    const waiting = broker.awaitDecision(req.id);

    const actionValue = (fake.sent[0]!.blocks[1] as {
      elements: ReadonlyArray<{ value: string }>;
    }).elements[0]!.value;
    fake.fireAction({ channelId: 'C-1', userId: 'alperen', actionValue });

    const decision = await waiting;
    expect(decision.decision).toBe('allow');
    expect(decision.channel).toBe('slack');

    rmSync(projectRoot, { recursive: true, force: true });
  });
});

// ─── ApprovalTeamsChannel ──────────────────────────────────────────────────────

describe('ApprovalTeamsChannel — pending -> Adaptive Card payload', () => {
  it('sends masked-args + risk/scope summary as an Adaptive Card attachment, never a raw value', async () => {
    const fake = makeFakeTeamsTransport();
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'T-1' });

    const req = buildRequest('apr-tm-1');
    await channel.send({ kind: 'pending', request: req as never });

    expect(fake.sent).toHaveLength(1);
    const payload = fake.sent[0]!;
    expect(payload.channelId).toBe('T-1');
    expect(payload.text).toContain('approval request apr-tm-1');
    // D3 card-triple — same alignment as the Slack pin above.
    expect(payload.text).toMatch(/source: .+ · reason: .+ · #[0-9A-HJ-NP-TV-Z]{5}/u);
    expect(Object.keys(req)).not.toContain('rawArgs');

    expect(payload.attachments).toHaveLength(1);
    const attachment = payload.attachments[0]!;
    expect(attachment.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(attachment.content.type).toBe('AdaptiveCard');
    expect(attachment.content.body).toHaveLength(1);
    // D3 card-triple — same alignment as the Slack section pin.
    expect(attachment.content.body[0]!.text)
      .toMatch(/source: .+ · reason: .+ · #[0-9A-HJ-NP-TV-Z]{5}/u);

    expect(attachment.content.actions).toHaveLength(2);
    expect(attachment.content.actions[0]!.id).toBe('approve');
    expect((attachment.content.actions[0]!.data as { value: string }).value).toMatch(/^dk1:brk:approve:[0-9A-HJ-NP-TV-Z]{5}:[0-9a-f]{8}$/u);
    expect(attachment.content.actions[1]!.id).toBe('reject');
    expect((attachment.content.actions[1]!.data as { value: string }).value).toMatch(/^dk1:brk:reject:[0-9A-HJ-NP-TV-Z]{5}:[0-9a-f]{8}$/u);
  });

  it('falls back to sendActivity (no id captured) when the transport lacks sendActivityReturningId', async () => {
    const fake = makeFakeTeamsTransport({ withReturningId: false });
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'T-1' });

    await channel.send({ kind: 'pending', request: buildRequest('apr-tm-2') as never });

    expect(fake.sent).toHaveLength(1);
  });
});

describe('ApprovalTeamsChannel — cross-decided -> update in place or fallback send', () => {
  it('updates the original card in place when an activity id was captured', async () => {
    const fake = makeFakeTeamsTransport();
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'T-1' });

    const req = buildRequest('apr-tm-3');
    await channel.send({ kind: 'pending', request: req as never });
    expect(fake.sent).toHaveLength(1);

    await channel.send({
      kind: 'cross-decided',
      request: req as never,
      decision: { requestId: 'apr-tm-3', decision: 'allow', decidedBy: 'alperen', channel: 'terminal', decidedAt: EXPIRES_AT, reason: '' } as never,
      message: 'terminal kanalında karar verildi',
    });

    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]).toMatchObject({ channelId: 'T-1', activityId: '1' });
    expect(fake.updates[0]!.payload.text).toContain('terminal kanalında karar verildi');
    // cross-decided card carries no actions — nothing left to press on a resolved request.
    expect(fake.updates[0]!.payload.attachments[0]!.content.actions).toHaveLength(0);
    expect(fake.sent).toHaveLength(1); // no extra fallback send once updated
  });

  it('sends a plain follow-up message when no activity id was captured (or no updateActivity support)', async () => {
    const fake = makeFakeTeamsTransport({ withReturningId: false, withUpdateActivity: false });
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'T-1' });

    const req = buildRequest('apr-tm-4');
    await channel.send({ kind: 'pending', request: req as never });

    await channel.send({
      kind: 'cross-decided',
      request: req as never,
      decision: { requestId: 'apr-tm-4', decision: 'deny', decidedBy: 'alperen', channel: 'terminal', decidedAt: EXPIRES_AT, reason: '' } as never,
      message: 'terminal kanalında karar verildi',
    });

    expect(fake.updates).toHaveLength(0);
    expect(fake.sent).toHaveLength(2);
    expect(fake.sent[1]!.text).toContain('terminal kanalında karar verildi');
  });
});

describe('ApprovalTeamsChannel — onDecision (card action -> decision)', () => {
  it('maps an approve press to an allow decision', async () => {
    const fake = makeFakeTeamsTransport();
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'T-1' });

    const handler = vi.fn();
    channel.onDecision(handler);
    await channel.send({ kind: 'pending', request: buildRequest('apr-tm-5') as never });
    const actionValue = (fake.sent[0]!.attachments[0]!.content.actions[0]!.data as {
      value: string;
    }).value;
    fake.fireCardAction({ channelId: 'T-1', userId: 'u-1', actionValue });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'apr-tm-5', decision: 'allow', decidedBy: 'u-1' }),
    );
  });

  it('maps a reject press to a deny decision', async () => {
    const fake = makeFakeTeamsTransport();
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'T-1' });

    const handler = vi.fn();
    channel.onDecision(handler);
    await channel.send({ kind: 'pending', request: buildRequest('apr-tm-6') as never });
    const actionValue = (fake.sent[0]!.attachments[0]!.content.actions[1]!.data as {
      value: string;
    }).value;
    fake.fireCardAction({ channelId: 'T-1', userId: 'u-2', actionValue });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'apr-tm-6', decision: 'deny', decidedBy: 'u-2' }),
    );
  });

  it('ignores a non-approval action value', () => {
    const fake = makeFakeTeamsTransport();
    const channel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'T-1' });

    const handler = vi.fn();
    channel.onDecision(handler);
    fake.fireCardAction({ channelId: 'T-1', userId: 'u-3', actionValue: 'unrelated-payload' });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('ApprovalTeamsChannel — wired into a real ApprovalRelay + ApprovalBroker', () => {
  let projectRoot: string;

  function setup() {
    projectRoot = mkdtempSync(join(tmpdir(), 'approval-teams-'));
    const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    const relay = new ApprovalRelay(broker);
    return { broker, relay };
  }

  it('a transport failure reports channel-error without blocking another attached channel', async () => {
    const failing = makeFakeTeamsTransport({ failSend: true });
    const teamsChannel = new ApprovalTeamsChannel({ transport: failing.transport, channelId: 'T-1' });
    const { broker, relay } = setup();

    const goodSent: RelayNotification[] = [];
    const goodChannel: RelayChannel = {
      send(n) {
        goodSent.push(n);
      },
      onDecision() {},
    };

    relay.attachChannel('teams', teamsChannel);
    relay.attachChannel('good', goodChannel);

    const errorListener = vi.fn();
    relay.on('channel-error', errorListener);

    expect(() => broker.submit(buildRequest('apr-tm-7'))).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(goodSent).toHaveLength(1);
    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'teams', error: expect.any(Error) }),
    );

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('a button press resolves the broker awaitDecision end-to-end', async () => {
    const fake = makeFakeTeamsTransport();
    const teamsChannel = new ApprovalTeamsChannel({ transport: fake.transport, channelId: 'T-1' });
    const { broker, relay } = setup();

    relay.attachChannel('teams', teamsChannel);

    const req = broker.submit(buildRequest('apr-tm-8'));
    const waiting = broker.awaitDecision(req.id);

    const actionValue = (fake.sent[0]!.attachments[0]!.content.actions[0]!.data as {
      value: string;
    }).value;
    fake.fireCardAction({ channelId: 'T-1', userId: 'alperen', actionValue });

    const decision = await waiting;
    expect(decision.decision).toBe('allow');
    expect(decision.channel).toBe('teams');

    rmSync(projectRoot, { recursive: true, force: true });
  });
});
