// ─── Connector callback router (rich-approval bot) ──────────────────────
// Pure parsing of inline-button callback payloads delivered by a connector
// (Telegram callback_query.data) into a structured approve/reject decision.
// The button's callback_data is built by approvalCallbackData() so the two
// stay in lockstep. Keeps the bot's button path free of LLM routing — a press
// is a machine decision, never a chat prompt.

/** A parsed approval button press. */
export interface ApprovalCallback {
  readonly action: 'approve' | 'reject';
  /** The trigger/approval id to resolve (autonomous trigger id or nervous code). */
  readonly triggerId: string;
}

/** Build the callback_data payload for an approve/reject button. */
export function approvalCallbackData(action: 'approve' | 'reject', triggerId: string): string {
  return `${action}:${triggerId}`;
}

/**
 * Parse a connector callback payload into an {@link ApprovalCallback}.
 * Recognizes `approve:<id>` and `reject:<id>` (the id may itself contain colons).
 * Returns null for any other shape so the caller can ignore non-approval presses.
 */
export function parseApprovalCallback(data: string): ApprovalCallback | null {
  if (typeof data !== 'string') return null;
  const sep = data.indexOf(':');
  if (sep <= 0) return null;
  const action = data.slice(0, sep);
  const triggerId = data.slice(sep + 1);
  if (action !== 'approve' && action !== 'reject') return null;
  if (triggerId.length === 0) return null;
  return { action, triggerId };
}
