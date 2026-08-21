import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  attachConfiguredApprovalChannels,
  type ApprovalClientsWireConfig,
} from '../../src/connectors/approval-clients-wire.js';
import type { SlackApprovalTransport, SlackMessagePayload } from '../../src/connectors/approval-slack.js';
import type { TeamsApprovalTransport, TeamsMessagePayload } from '../../src/connectors/approval-teams.js';
import type { TelegramApprovalTransport } from '../../src/connectors/approval-telegram.js';
import type { OutgoingMessage } from '../../src/connectors/types.js';
import { ApprovalRelay } from '../../src/core/approval-relay.js';
import type { ApprovalRequest } from '../../src/core/approval-contract.js';
import type { ApprovalSlaEvidence } from '../../src/core/approval-sla.js';

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

function transports(options: { failSlack?: boolean } = {}) {
  const slack: SlackMessagePayload[] = [];
  const teams: TeamsMessagePayload[] = [];
  const telegram: OutgoingMessage[] = [];
  const slackTransport: SlackApprovalTransport = {
    async postMessage(payload) {
      if (options.failSlack) throw new Error('slack transport failed');
      slack.push(payload);
    },
    onBlockAction() {},
  };
  const teamsTransport: TeamsApprovalTransport = {
    async sendActivity(payload) { teams.push(payload); },
    onCardAction() {},
  };
  const telegramTransport: TelegramApprovalTransport = {
    async sendMessage(message) { telegram.push(message); },
    onCallback() {},
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
