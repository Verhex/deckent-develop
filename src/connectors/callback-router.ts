// ─── Connector callback router (rich-approval bot) ──────────────────────
// Pure parsing of inline-button callback payloads delivered by a connector
// (Telegram callback_query.data) into a structured approve/reject decision.
// The button's callback_data is built by approvalCallbackData() so the two
// stay in lockstep. Keeps the bot's button path free of LLM routing — a press
// is a machine decision, never a chat prompt.

import { isExpiredDecideResult, type ApprovalDecideResult } from '../core/approval-broker.js';
import { getMessage } from '../cli/helpers/messages.js';

export type ApprovalCallbackNamespace = 'bot' | 'brk';
export type ApprovalCallbackAction = 'approve' | 'reject';

/** A parsed approval button press from the versioned callback contract. */
export interface VersionedApprovalCallback {
  readonly version: 'dk1';
  readonly ns: ApprovalCallbackNamespace;
  readonly action: ApprovalCallbackAction;
  readonly shortCode: string;
  readonly nonce: string;
}

/** A callback emitted before the versioned callback contract was introduced. */
export interface LegacyApprovalCallback {
  readonly state: 'legacy';
  readonly action: ApprovalCallbackAction;
  readonly id: string;
}

export interface InvalidApprovalCallback {
  readonly state: 'invalid';
}

export type ApprovalCallbackParseResult =
  | VersionedApprovalCallback
  | LegacyApprovalCallback
  | InvalidApprovalCallback;

/** A parsed approval button press (compatibility view for existing consumers). */
export interface ApprovalCallback {
  readonly action: ApprovalCallbackAction;
  /** The trigger/approval id to resolve (autonomous trigger id or nervous code). */
  readonly triggerId: string;
}

const SHORT_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{5}$/i;
const NONCE_RE = /^[0-9a-f]{8}$/i;

/** Build a compact, versioned callback payload containing no raw approval id. */
export function approvalCallbackData(
  ns: ApprovalCallbackNamespace,
  action: ApprovalCallbackAction,
  shortCode: string,
  nonce: string,
): string;
/**
 * Build the legacy `action:id` callback payload.
 * @deprecated Use the four-argument versioned signature. Raw ids must not be used
 * in newly produced callback payloads.
 */
export function approvalCallbackData(action: ApprovalCallbackAction, triggerId: string): string;
export function approvalCallbackData(
  nsOrAction: ApprovalCallbackNamespace | ApprovalCallbackAction,
  actionOrId: ApprovalCallbackAction | string,
  shortCode?: string,
  nonce?: string,
): string {
  if (shortCode === undefined && nonce === undefined) {
    return `${nsOrAction}:${actionOrId}`;
  }
  if (
    (nsOrAction !== 'bot' && nsOrAction !== 'brk') ||
    (actionOrId !== 'approve' && actionOrId !== 'reject') ||
    shortCode === undefined ||
    !SHORT_CODE_RE.test(shortCode) ||
    nonce === undefined ||
    !NONCE_RE.test(nonce)
  ) {
    throw new RangeError('Invalid approval callback payload fields');
  }
  return `dk1:${nsOrAction}:${actionOrId}:${shortCode}:${nonce}`;
}

/**
 * Parse either the versioned callback contract or the legacy `action:id` shape.
 * The generic return preserves the old view for existing wide-string consumers;
 * literal inputs receive the new discriminated result type during migration.
 */
export function parseApprovalCallback<const T extends string>(
  data: T,
): string extends T ? ApprovalCallback | null : ApprovalCallbackParseResult;
export function parseApprovalCallback(data: string): ApprovalCallbackParseResult | ApprovalCallback | null {
  const parts = data.split(':');
  if (parts.length === 5 && parts[0] === 'dk1') {
    const [, ns, action, shortCode, nonce] = parts;
    if (
      (ns === 'bot' || ns === 'brk') &&
      (action === 'approve' || action === 'reject') &&
      shortCode !== undefined &&
      SHORT_CODE_RE.test(shortCode) &&
      nonce !== undefined &&
      NONCE_RE.test(nonce)
    ) {
      const result: VersionedApprovalCallback = { version: 'dk1', ns, action, shortCode, nonce };
      Object.defineProperty(result, 'triggerId', { value: shortCode, enumerable: false });
      return result;
    }
    return { state: 'invalid' };
  }

  const sep = data.indexOf(':');
  if (sep > 0) {
    const action = data.slice(0, sep);
    const id = data.slice(sep + 1);
    if ((action === 'approve' || action === 'reject') && id.length > 0) {
      const result: LegacyApprovalCallback = { state: 'legacy', action, id };
      Object.defineProperty(result, 'triggerId', { value: id, enumerable: false });
      return result;
    }
  }
  return { state: 'invalid' };
}

/**
 * Render an {@link ApprovalDecideResult} (from `ApprovalBroker.decideChecked()`)
 * for a button-press reply. Returns `getMessage('approval.decide.expired', ...)`
 * for the expired outcome — a Telegram/bot button press on an expired card gets
 * an honest "süresi dolmuş" reply instead of silence. Returns `null` for a
 * normal `ApprovalDecision` — the caller's existing approve/reject ack path
 * already renders that case, this helper only owns the additive expired one.
 * Pure and connector-agnostic, so any approve/reject surface (bot callback or
 * a future CLI command wiring) can reuse it verbatim.
 */
export function renderExpiredDecideReply(result: ApprovalDecideResult, lang: string): string | null {
  if (!isExpiredDecideResult(result)) return null;
  return getMessage('approval.decide.expired', lang, { expiresAt: result.expiresAt });
}
