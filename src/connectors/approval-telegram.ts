// ─── ApprovalTelegramChannel — Telegram RelayChannel adapter (APR-TG-CHANNEL) ──
// Implements ApprovalRelay's RelayChannel contract (src/core/approval-relay.ts, APR-2)
// for Telegram. Owns ZERO Telegram-connector internals — it depends only on a narrow
// `TelegramApprovalTransport` seam (send / sendMessageReturningId / editMessage /
// onCallback), the SAME public shapes `TelegramConnector` already exposes, so a real
// connector satisfies this structurally with no adapter glue. Rendering + button/
// callback wiring reuses the existing rich-approval-bot infra end to end:
// `InlineButton`/`OutgoingMessage.buttons`/`IncomingCallback` (types.ts),
// `approvalCallbackData`/`parseApprovalCallback` (callback-router.ts),
// `markdownToTelegramHtml`, and `summarizeArgs` — the same pieces chat-bridge.ts's
// makeSendApproval/makeSendToolApproval already compose (feedback_telegram_rich_
// approval_bot precedent). None of those modules are modified here.
//
// Design tenets:
//  • `pending` -> source/reason/short-code card + Approve/Deny inline buttons, sent
//    to one fixed Telegram chat. Critical-risk cards are view-only and carry a CLI
//    decision hint instead of buttons.
//  • `cross-decided` -> edit the original card in place when the platform message id
//    was captured (mirrors bot-action-store.ts's attachApprovalMessageId pattern);
//    falls back to a plain follow-up message otherwise (no editMessage support, or the
//    id-returning send path wasn't available).
//  • `onDecision` -> a Telegram inline-button press arrives via `transport.onCallback`
//    as an `IncomingCallback`; `parseApprovalCallback` decodes it, non-approval
//    payloads are ignored, and `approve`/`reject` map onto the broker's
//    `allow`/`deny` decision vocabulary.
//  • A transport failure (send throws/rejects) is left to propagate — the relay
//    (ApprovalRelay.dispatch) is the single place that catches it and reports
//    'channel-error'; this adapter must never swallow it silently.
//  • Wiring a live `TelegramConnector` instance into a running `ApprovalRelay` is
//    explicit follow-up (bot-daemon bootstrap) — out of scope here.

import { createHash, randomBytes } from 'node:crypto';
import { approvalCallbackData, parseApprovalCallback } from './callback-router.js';
import { markdownToTelegramHtml } from './markdown-to-html.js';
import { getMessage } from '../cli/helpers/messages.js';
import type {
  ChannelDecisionInput,
  RelayChannel,
  RelayCrossDecidedNotification,
  RelayNotification,
} from '../core/approval-relay.js';
import type { ApprovalAction, ApprovalRequest } from '../core/approval-contract.js';
import type { IncomingCallback, InlineButton, OutgoingMessage } from './types.js';

/**
 * Minimal Telegram send/callback surface this channel needs. Satisfied structurally
 * by `TelegramConnector` (sendMessage/sendMessageReturningId/editMessage/onCallback
 * are all public there already) — declared locally so this module never imports the
 * connector (and its grammy-loading machinery); tests inject a plain fake object.
 */
export interface TelegramApprovalTransport {
  sendMessage(msg: OutgoingMessage): Promise<void>;
  sendMessageReturningId?(msg: OutgoingMessage): Promise<string | undefined>;
  editMessage?(channelId: string, messageId: string, text: string, parseMode?: 'HTML' | 'MarkdownV2'): Promise<void>;
  /** Register the handler this channel calls whenever an inline button is pressed. */
  onCallback(handler: (cb: IncomingCallback) => void): void;
}

export interface ApprovalTelegramChannelOptions {
  /** Telegram-capable send/callback surface (real connector or a test fake). */
  transport: TelegramApprovalTransport;
  /** Telegram chat id every approval card is posted to (single approval-ops chat). */
  channelId: string;
  /** UI language for this channel's two fixed labels (header, buttons). Default 'en'. */
  lang?: string;
}

/** callback_data action -> broker decision vocabulary (approve/reject stays the
 *  existing button contract; allow/deny is the contract's own decision enum). */
const DECISION_BY_ACTION: Readonly<Record<'approve' | 'reject', ApprovalAction>> = {
  approve: 'allow',
  reject: 'deny',
};

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Stable 25-bit Crockford code used by human and callback decision paths. */
function shortCodeFor(requestId: string): string {
  const digest = createHash('sha256').update(requestId).digest();
  let value = digest.readUInt32BE(0) >>> 7;
  let code = '';
  for (let index = 0; index < 5; index += 1) {
    code = CROCKFORD_BASE32[value & 31]! + code;
    value >>>= 5;
  }
  return code;
}

/**
 * Telegram channel adapter (APR-TG-CHANNEL). One instance targets one fixed Telegram
 * chat; attach it to an `ApprovalRelay` via `relay.attachChannel('telegram', channel)`.
 */
export class ApprovalTelegramChannel implements RelayChannel {
  private readonly transport: TelegramApprovalTransport;
  private readonly channelId: string;
  private readonly lang: string;
  /** requestId -> platform message id, so a later cross-decided can edit in place. */
  private readonly messageIdByRequestId = new Map<string, string>();
  /** short-code + nonce -> raw broker id; raw ids never leave this process. */
  private readonly requestIdByCallbackKey = new Map<string, string>();

  constructor(opts: ApprovalTelegramChannelOptions) {
    this.transport = opts.transport;
    this.channelId = opts.channelId;
    this.lang = opts.lang ?? 'en';
  }

  send(notification: RelayNotification): Promise<void> {
    if (notification.kind === 'pending') return this.sendPending(notification.request);
    return this.sendCrossDecided(notification);
  }

  onDecision(handler: (input: ChannelDecisionInput) => void): void {
    this.transport.onCallback((cb) => {
      const parsed = parseApprovalCallback(cb.data);
      if (!parsed || !('action' in parsed) || !('triggerId' in parsed)) return;
      let requestId = parsed.triggerId;
      if ('version' in parsed) {
        const versioned = parsed as typeof parsed & {
          readonly ns: 'bot' | 'brk';
          readonly shortCode: string;
          readonly nonce: string;
        };
        if (versioned.ns !== 'brk') return;
        const callbackKey = `${versioned.shortCode}:${versioned.nonce}`;
        const mappedRequestId = this.requestIdByCallbackKey.get(callbackKey);
        if (!mappedRequestId) return;
        requestId = mappedRequestId;
      }
      handler({
        requestId,
        decision: DECISION_BY_ACTION[parsed.action],
        decidedBy: cb.fromUser,
        decidedAt: new Date().toISOString(),
      });
    });
  }

  // ─── internals ──────────────────────────────────────────────────────────

  /** Compact relay card triple: source · reason · human-facing short code. */
  private renderBody(request: ApprovalRequest): string {
    const requestWithOrigin = request as ApprovalRequest & { readonly origin?: unknown };
    const source = typeof requestWithOrigin.origin === 'string' && requestWithOrigin.origin.length > 0
      ? requestWithOrigin.origin
      : `${request.requester.role}/${request.requester.instanceId}`;
    return `source: ${source} · reason: ${request.summary} · #${shortCodeFor(request.id)}`;
  }

  private buildButtons(request: ApprovalRequest, nonce: string): ReadonlyArray<ReadonlyArray<InlineButton>> {
    const shortCode = shortCodeFor(request.id);
    this.requestIdByCallbackKey.set(`${shortCode}:${nonce}`, request.id);
    return [[
      { text: getMessage('cap.btn.approve', this.lang), callbackData: approvalCallbackData('brk', 'approve', shortCode, nonce) },
      { text: getMessage('cap.btn.reject', this.lang), callbackData: approvalCallbackData('brk', 'reject', shortCode, nonce) },
    ]];
  }

  private async sendPending(request: ApprovalRequest): Promise<void> {
    const header = getMessage('cap.approval.header', this.lang);
    const criticalHint = request.risk === 'critical'
      ? `\ndeckent approvals decide #${shortCodeFor(request.id)}`
      : '';
    const html = markdownToTelegramHtml(`🔐 ${header}\n${this.renderBody(request)}${criticalHint}`);
    const msg: OutgoingMessage = {
      connector: 'telegram',
      channelId: this.channelId,
      text: html,
      parseMode: 'HTML',
      ...(request.risk === 'critical' ? {} : { buttons: this.buildButtons(request, randomBytes(4).toString('hex')) }),
    };
    if (this.transport.sendMessageReturningId) {
      const mid = await this.transport.sendMessageReturningId(msg);
      if (mid) this.messageIdByRequestId.set(request.id, mid);
      return;
    }
    await this.transport.sendMessage(msg);
  }

  private async sendCrossDecided(notification: RelayCrossDecidedNotification): Promise<void> {
    const requestId = notification.request.id;
    const mid = this.messageIdByRequestId.get(requestId);
    const html = markdownToTelegramHtml(notification.message);
    if (mid && this.transport.editMessage) {
      await this.transport.editMessage(this.channelId, mid, html, 'HTML');
      this.messageIdByRequestId.delete(requestId);
      return;
    }
    await this.transport.sendMessage({ connector: 'telegram', channelId: this.channelId, text: html });
  }
}
