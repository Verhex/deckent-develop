// ─── ApprovalSlackChannel — Slack RelayChannel adapter (APR-CLIENTS-CORE) ─────
// Implements ApprovalRelay's RelayChannel contract (src/core/approval-relay.ts,
// APR-2) for Slack, following approval-telegram.ts (355-003) structurally:
// same masked-only `pending` render, same edit-in-place-or-fallback
// `cross-decided`, same approve/reject -> allow/deny `onDecision` mapping, same
// "a transport failure propagates, the relay is the sole catcher" invariant.
//
// Unlike Telegram, Slack's real send surface is Block Kit (`blocks: [...]`), not
// text+inline_keyboard — so this adapter builds a REAL Slack message payload
// (section block + actions block with button `value`s) instead of reusing
// `OutgoingMessage`/`InlineButton` (types.ts), which would lossily flatten it.
// This module owns ZERO Slack-connector internals: it depends only on a narrow
// `SlackApprovalTransport` seam (postMessage / postMessageReturningTs /
// updateMessage / onBlockAction) a real Slack SDK client can satisfy
// structurally; tests inject a plain fake object. Wiring a live Slack client is
// explicit follow-up (bot-daemon bootstrap), same boundary as Telegram.
//
// Design tenets:
//  • `pending` -> maskedArgs-only summary (ApprovalRequest has no raw-args field
//    at all, so this invariant holds by construction) + risk/scope + a Block Kit
//    `actions` block with Approve/Deny buttons, posted to one fixed Slack channel.
//  • `cross-decided` -> update the original card in place when the platform
//    message timestamp (`ts`) was captured on send; falls back to a plain
//    follow-up message otherwise (no updateMessage support, or the
//    ts-returning post path wasn't available).
//  • `onDecision` -> a Slack `block_actions` button press arrives via
//    `transport.onBlockAction` as a `SlackBlockActionInteraction`; the pressed
//    button's `value` (built by `approvalCallbackData`, the SAME convention
//    Telegram's callback_data uses) is decoded with the existing
//    `parseApprovalCallback` — non-approval values are ignored, approve/reject
//    map onto the broker's allow/deny decision vocabulary.
//  • A transport failure (post/update throws or rejects) is left to propagate —
//    ApprovalRelay.dispatch is the single place that catches it and reports
//    'channel-error'; this adapter must never swallow it silently.

import { randomBytes } from 'node:crypto';
import { approvalCallbackData, parseApprovalCallback } from './callback-router.js';
import { getMessage } from '../cli/helpers/messages.js';
import { shortCodeFor } from '../core/approval-short-code.js';
import type {
  ChannelDecisionInput,
  RelayChannel,
  RelayCrossDecidedNotification,
  RelayNotification,
} from '../core/approval-relay.js';
import type { ApprovalAction, ApprovalRequest } from '../core/approval-contract.js';

// ─── Slack Block Kit — minimal local subset (section + actions block) ────────

export interface SlackTextObject {
  readonly type: 'plain_text' | 'mrkdwn';
  readonly text: string;
}

export interface SlackButtonElement {
  readonly type: 'button';
  readonly action_id: 'approve' | 'reject';
  readonly text: SlackTextObject;
  /** Opaque versioned payload delivered back on press. */
  readonly value: string;
  readonly style?: 'primary' | 'danger';
}

export interface SlackSectionBlock {
  readonly type: 'section';
  readonly text: SlackTextObject;
}

export interface SlackActionsBlock {
  readonly type: 'actions';
  readonly block_id: string;
  readonly elements: ReadonlyArray<SlackButtonElement>;
}

export type SlackBlock = SlackSectionBlock | SlackActionsBlock;

/** Real Slack `chat.postMessage`/`chat.update`-shaped payload. */
export interface SlackMessagePayload {
  readonly channel: string;
  /** Plain-text fallback (notifications, accessibility) — Slack requires it alongside blocks. */
  readonly text: string;
  readonly blocks: ReadonlyArray<SlackBlock>;
}

/** A decoded Slack `block_actions` interaction (button press). */
export interface SlackBlockActionInteraction {
  readonly channelId: string;
  readonly userId: string;
  /** The pressed button's `value` (e.g. `approve:<id>`). */
  readonly actionValue: string;
}

/**
 * Minimal Slack send/interaction surface this channel needs. Satisfied
 * structurally by a real Slack SDK client (`chat.postMessage`/`chat.update`/
 * `app.action` handler) — declared locally so this module never imports a Slack
 * SDK; tests inject a plain fake object.
 */
export interface SlackApprovalTransport {
  postMessage(payload: SlackMessagePayload): Promise<void>;
  /** Like postMessage but returns the message timestamp (`ts`), Slack's edit-target id. */
  postMessageReturningTs?(payload: SlackMessagePayload): Promise<string | undefined>;
  updateMessage?(channelId: string, ts: string, payload: SlackMessagePayload): Promise<void>;
  /** Register the handler this channel calls whenever a Block Kit button is pressed. */
  onBlockAction(handler: (interaction: SlackBlockActionInteraction) => void): void;
}

export interface ApprovalSlackChannelOptions {
  /** Slack-capable send/interaction surface (real client or a test fake). */
  transport: SlackApprovalTransport;
  /** Slack channel id every approval card is posted to (single approval-ops channel). */
  channelId: string;
  /** UI language for this channel's two fixed labels (header, buttons). Default 'en'. */
  lang?: string;
}

/** callback value action -> broker decision vocabulary (approve/reject stays the
 *  existing button contract; allow/deny is the contract's own decision enum). */
const DECISION_BY_ACTION: Readonly<Record<'approve' | 'reject', ApprovalAction>> = {
  approve: 'allow',
  reject: 'deny',
};

const ACTIONS_BLOCK_ID = 'deckent_approval_actions';

/**
 * Slack channel adapter (APR-CLIENTS-CORE). One instance targets one fixed
 * Slack channel; attach it to an `ApprovalRelay` via
 * `relay.attachChannel('slack', channel)`.
 */
export class ApprovalSlackChannel implements RelayChannel {
  private readonly transport: SlackApprovalTransport;
  private readonly channelId: string;
  private readonly lang: string;
  /** requestId -> Slack message ts, so a later cross-decided can update in place. */
  private readonly tsByRequestId = new Map<string, string>();
  /** short-code + nonce -> raw broker id; raw ids never leave this process. */
  private readonly requestIdByCallbackKey = new Map<string, string>();

  constructor(opts: ApprovalSlackChannelOptions) {
    this.transport = opts.transport;
    this.channelId = opts.channelId;
    this.lang = opts.lang ?? 'en';
  }

  send(notification: RelayNotification): Promise<void> {
    if (notification.kind === 'pending') return this.sendPending(notification.request);
    return this.sendCrossDecided(notification);
  }

  onDecision(handler: (input: ChannelDecisionInput) => void): void {
    this.transport.onBlockAction((interaction) => {
      const parsed = parseApprovalCallback(interaction.actionValue);
      if (!parsed || !('action' in parsed) || !('triggerId' in parsed)) return;
      let requestId = parsed.triggerId;
      if ('version' in parsed) {
        const versioned = parseApprovalCallback(interaction.actionValue as `dk1:${string}`);
        if (!('version' in versioned) || versioned.ns !== 'brk') return;
        const mappedRequestId = this.requestIdByCallbackKey.get(`${versioned.shortCode}:${versioned.nonce}`);
        if (!mappedRequestId) return;
        requestId = mappedRequestId;
      }
      handler({
        requestId,
        decision: DECISION_BY_ACTION[parsed.action],
        decidedBy: interaction.userId,
        decidedAt: new Date().toISOString(),
      });
    });
  }

  // ─── internals ──────────────────────────────────────────────────────────

  /** Compact relay card triple: source · reason · human-facing short code. */
  private renderBody(request: ApprovalRequest): string {
    const source = `${request.requester.role}/${request.requester.instanceId}`;
    return `source: ${source} · reason: ${request.summary} · #${shortCodeFor(request.id)}`;
  }

  private buildActionsBlock(shortCode: string, nonce: string): SlackActionsBlock {
    return {
      type: 'actions',
      block_id: ACTIONS_BLOCK_ID,
      elements: [
        {
          type: 'button',
          action_id: 'approve',
          text: { type: 'plain_text', text: getMessage('cap.btn.approve', this.lang) },
          value: approvalCallbackData('brk', 'approve', shortCode, nonce),
          style: 'primary',
        },
        {
          type: 'button',
          action_id: 'reject',
          text: { type: 'plain_text', text: getMessage('cap.btn.reject', this.lang) },
          value: approvalCallbackData('brk', 'reject', shortCode, nonce),
          style: 'danger',
        },
      ],
    };
  }

  private buildPendingPayload(request: ApprovalRequest): SlackMessagePayload {
    const header = getMessage('cap.approval.header', this.lang);
    const shortCode = shortCodeFor(request.id);
    const body = this.renderBody(request);
    const isCritical = request.risk === 'critical';
    const criticalHint = isCritical ? `\ndeckent approvals decide #${shortCode}` : '';
    const text = `🔐 ${header}\n${body}${criticalHint}`;
    const blocks: SlackBlock[] = [
      { type: 'section', text: { type: 'mrkdwn', text: `🔐 *${header}*\n${body}${criticalHint}` } },
    ];
    if (!isCritical) {
      const nonce = randomBytes(4).toString('hex');
      this.requestIdByCallbackKey.set(`${shortCode}:${nonce}`, request.id);
      blocks.push(this.buildActionsBlock(shortCode, nonce));
    }
    return {
      channel: this.channelId,
      text,
      blocks,
    };
  }

  private async sendPending(request: ApprovalRequest): Promise<void> {
    const payload = this.buildPendingPayload(request);
    if (this.transport.postMessageReturningTs) {
      const ts = await this.transport.postMessageReturningTs(payload);
      if (ts) this.tsByRequestId.set(request.id, ts);
      return;
    }
    await this.transport.postMessage(payload);
  }

  private buildCrossDecidedPayload(message: string): SlackMessagePayload {
    return {
      channel: this.channelId,
      text: message,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: message } }],
    };
  }

  private async sendCrossDecided(notification: RelayCrossDecidedNotification): Promise<void> {
    const requestId = notification.request.id;
    const ts = this.tsByRequestId.get(requestId);
    const payload = this.buildCrossDecidedPayload(notification.message);
    if (ts && this.transport.updateMessage) {
      await this.transport.updateMessage(this.channelId, ts, payload);
      this.tsByRequestId.delete(requestId);
      return;
    }
    await this.transport.postMessage(payload);
  }
}
