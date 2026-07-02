// ─── ApprovalTeamsChannel — Microsoft Teams RelayChannel adapter (APR-CLIENTS-CORE) ─
// Implements ApprovalRelay's RelayChannel contract (src/core/approval-relay.ts,
// APR-2) for Teams, following approval-telegram.ts (355-003) structurally: same
// masked-only `pending` render, same edit-in-place-or-fallback `cross-decided`,
// same approve/reject -> allow/deny `onDecision` mapping, same "a transport
// failure propagates, the relay is the sole catcher" invariant.
//
// Unlike Telegram, Teams' real send surface is a Bot Framework activity carrying
// an Adaptive Card attachment, not text+inline_keyboard — so this adapter builds
// a REAL Adaptive Card payload (TextBlock body + Action.Submit actions) instead
// of reusing `OutgoingMessage`/`InlineButton` (types.ts), which would lossily
// flatten it (and `ConnectorId` in types.ts has no `'teams'` member at all).
// This module owns ZERO Teams-connector internals: it depends only on a narrow
// `TeamsApprovalTransport` seam (sendActivity / sendActivityReturningId /
// updateActivity / onCardAction) a real Bot Framework adapter can satisfy
// structurally; tests inject a plain fake object. Wiring a live Teams client is
// explicit follow-up (bot-daemon bootstrap), same boundary as Telegram.
//
// Design tenets:
//  • `pending` -> maskedArgs-only summary (ApprovalRequest has no raw-args field
//    at all, so this invariant holds by construction) + risk/scope + an Adaptive
//    Card with Approve/Deny `Action.Submit` buttons, sent to one fixed Teams
//    conversation/channel.
//  • `cross-decided` -> update the original card in place when the platform
//    activity id was captured on send; falls back to a plain follow-up message
//    otherwise (no updateActivity support, or the id-returning send path wasn't
//    available).
//  • `onDecision` -> a Teams `Action.Submit` invoke arrives via
//    `transport.onCardAction` as a `TeamsAdaptiveCardActionInvocation`; the
//    submitted action's `data.value` (built by `approvalCallbackData`, the SAME
//    convention Telegram's callback_data uses) is decoded with the existing
//    `parseApprovalCallback` — non-approval values are ignored, approve/reject
//    map onto the broker's allow/deny decision vocabulary.
//  • A transport failure (send/update throws or rejects) is left to propagate —
//    ApprovalRelay.dispatch is the single place that catches it and reports
//    'channel-error'; this adapter must never swallow it silently.

import { summarizeArgs } from './bot-agentic.js';
import { approvalCallbackData, parseApprovalCallback } from './callback-router.js';
import { getMessage } from '../cli/helpers/messages.js';
import type {
  ChannelDecisionInput,
  RelayChannel,
  RelayCrossDecidedNotification,
  RelayNotification,
} from '../core/approval-relay.js';
import type { ApprovalAction, ApprovalRequest } from '../core/approval-contract.js';

// ─── Adaptive Card — minimal local subset (TextBlock body + Action.Submit) ───

export interface AdaptiveCardTextBlock {
  readonly type: 'TextBlock';
  readonly text: string;
  readonly wrap?: boolean;
  readonly weight?: 'bolder' | 'default';
}

export interface AdaptiveCardSubmitAction {
  readonly type: 'Action.Submit';
  readonly id: 'approve' | 'reject';
  readonly title: string;
  /** Opaque payload delivered back on submit — `{ value: 'approve:<id>' | 'reject:<id>' }`. */
  readonly data: { readonly value: string };
  readonly style?: 'positive' | 'destructive';
}

export type AdaptiveCardElement = AdaptiveCardTextBlock;

/** Real `application/vnd.microsoft.card.adaptive` card content (schema 1.5). */
export interface AdaptiveCard {
  readonly type: 'AdaptiveCard';
  readonly $schema: 'http://adaptivecards.io/schemas/adaptive-card.json';
  readonly version: '1.5';
  readonly body: ReadonlyArray<AdaptiveCardElement>;
  readonly actions: ReadonlyArray<AdaptiveCardSubmitAction>;
}

export interface TeamsCardAttachment {
  readonly contentType: 'application/vnd.microsoft.card.adaptive';
  readonly content: AdaptiveCard;
}

/** Real Bot Framework activity-shaped payload carrying one Adaptive Card. */
export interface TeamsMessagePayload {
  readonly channelId: string;
  /** Plain-text summary (notifications, clients without card rendering). */
  readonly text: string;
  readonly attachments: ReadonlyArray<TeamsCardAttachment>;
}

/** A decoded Teams `Action.Submit` invoke (adaptive-card button press). */
export interface TeamsAdaptiveCardActionInvocation {
  readonly channelId: string;
  readonly userId: string;
  /** The submitted action's `data.value` (e.g. `approve:<id>`). */
  readonly actionValue: string;
}

/**
 * Minimal Teams send/invoke surface this channel needs. Satisfied structurally
 * by a real Bot Framework adapter (`sendActivity`/`updateActivity`/an
 * `invoke-activity` handler for `Action.Submit`) — declared locally so this
 * module never imports the Bot Framework SDK; tests inject a plain fake object.
 */
export interface TeamsApprovalTransport {
  sendActivity(payload: TeamsMessagePayload): Promise<void>;
  /** Like sendActivity but returns the activity id, Teams' edit-target id. */
  sendActivityReturningId?(payload: TeamsMessagePayload): Promise<string | undefined>;
  updateActivity?(channelId: string, activityId: string, payload: TeamsMessagePayload): Promise<void>;
  /** Register the handler this channel calls whenever an Action.Submit button is pressed. */
  onCardAction(handler: (invocation: TeamsAdaptiveCardActionInvocation) => void): void;
}

export interface ApprovalTeamsChannelOptions {
  /** Teams-capable send/invoke surface (real Bot Framework adapter or a test fake). */
  transport: TeamsApprovalTransport;
  /** Teams channel/conversation id every approval card is sent to (single approval-ops channel). */
  channelId: string;
  /** UI language for this channel's two fixed labels (header, buttons). Default 'en'. */
  lang?: string;
}

/** submitted action value -> broker decision vocabulary (approve/reject stays the
 *  existing button contract; allow/deny is the contract's own decision enum). */
const DECISION_BY_ACTION: Readonly<Record<'approve' | 'reject', ApprovalAction>> = {
  approve: 'allow',
  reject: 'deny',
};

/**
 * Teams channel adapter (APR-CLIENTS-CORE). One instance targets one fixed
 * Teams channel/conversation; attach it to an `ApprovalRelay` via
 * `relay.attachChannel('teams', channel)`.
 */
export class ApprovalTeamsChannel implements RelayChannel {
  private readonly transport: TeamsApprovalTransport;
  private readonly channelId: string;
  private readonly lang: string;
  /** requestId -> Teams activity id, so a later cross-decided can update in place. */
  private readonly activityIdByRequestId = new Map<string, string>();

  constructor(opts: ApprovalTeamsChannelOptions) {
    this.transport = opts.transport;
    this.channelId = opts.channelId;
    this.lang = opts.lang ?? 'en';
  }

  send(notification: RelayNotification): Promise<void> {
    if (notification.kind === 'pending') return this.sendPending(notification.request);
    return this.sendCrossDecided(notification);
  }

  onDecision(handler: (input: ChannelDecisionInput) => void): void {
    this.transport.onCardAction((invocation) => {
      const parsed = parseApprovalCallback(invocation.actionValue);
      if (!parsed) return; // not an approval submit — ignore (e.g. a foreign action value)
      handler({
        requestId: parsed.triggerId,
        decision: DECISION_BY_ACTION[parsed.action],
        decidedBy: invocation.userId,
        decidedAt: new Date().toISOString(),
      });
    });
  }

  // ─── internals ──────────────────────────────────────────────────────────

  /** Label-free `key: value` request-data summary — same convention `summarizeArgs`
   *  already uses for dynamic tool args, extended to risk/scope (also request data,
   *  not fixed UI copy) so no new i18n keys are required for this adapter. */
  private renderBody(request: ApprovalRequest): string {
    const meta = `scope: ${request.scope} · risk: ${request.risk}`;
    const argsLine = request.maskedArgs ? summarizeArgs(request.maskedArgs) : '';
    return [request.summary, meta, argsLine].filter((line) => line.length > 0).join('\n');
  }

  private buildCard(bodyText: string, requestId: string | undefined): AdaptiveCard {
    const actions: AdaptiveCardSubmitAction[] =
      requestId === undefined
        ? []
        : [
            {
              type: 'Action.Submit',
              id: 'approve',
              title: getMessage('cap.btn.approve', this.lang),
              data: { value: approvalCallbackData('approve', requestId) },
              style: 'positive',
            },
            {
              type: 'Action.Submit',
              id: 'reject',
              title: getMessage('cap.btn.reject', this.lang),
              data: { value: approvalCallbackData('reject', requestId) },
              style: 'destructive',
            },
          ];
    return {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.5',
      body: [{ type: 'TextBlock', text: bodyText, wrap: true }],
      actions,
    };
  }

  private buildPendingPayload(request: ApprovalRequest): TeamsMessagePayload {
    const header = getMessage('cap.approval.header', this.lang);
    const bodyText = `🔐 **${header}**\n${this.renderBody(request)}`;
    return {
      channelId: this.channelId,
      text: bodyText,
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: this.buildCard(bodyText, request.id),
        },
      ],
    };
  }

  private async sendPending(request: ApprovalRequest): Promise<void> {
    const payload = this.buildPendingPayload(request);
    if (this.transport.sendActivityReturningId) {
      const activityId = await this.transport.sendActivityReturningId(payload);
      if (activityId) this.activityIdByRequestId.set(request.id, activityId);
      return;
    }
    await this.transport.sendActivity(payload);
  }

  private buildCrossDecidedPayload(message: string): TeamsMessagePayload {
    return {
      channelId: this.channelId,
      text: message,
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: this.buildCard(message, undefined),
        },
      ],
    };
  }

  private async sendCrossDecided(notification: RelayCrossDecidedNotification): Promise<void> {
    const requestId = notification.request.id;
    const activityId = this.activityIdByRequestId.get(requestId);
    const payload = this.buildCrossDecidedPayload(notification.message);
    if (activityId && this.transport.updateActivity) {
      await this.transport.updateActivity(this.channelId, activityId, payload);
      this.activityIdByRequestId.delete(requestId);
      return;
    }
    await this.transport.sendActivity(payload);
  }
}
