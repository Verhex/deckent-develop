/**
 * Canonical, dependency-free response limits for the cross-verify protocol.
 *
 * JavaScript string lengths count UTF-16 code units. Every individual code unit
 * serializes to at most three UTF-8 bytes (a surrogate pair consumes four bytes
 * across two code units), so the raw-output ceiling safely bounds every valid
 * response at the complete-response character limit.
 */
const RESPONSE_LIMIT_VALUES = {
  reasonMaxChars: 8_192,
  completeResponseMaxChars: 65_536,
  utf8WorstCaseBytesPerJavaScriptChar: 3,
  rawOutputMaxBytes: 65_536 * 3,
} as const;

/** Immutable canonical source of truth for cross-verify response budgets. */
export const CROSS_VERIFY_RESPONSE_LIMITS = Object.freeze(RESPONSE_LIMIT_VALUES);

export const CROSS_VERIFY_ADJUDICATION_REASON_MAX_CHARS =
  CROSS_VERIFY_RESPONSE_LIMITS.reasonMaxChars;
export const CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS =
  CROSS_VERIFY_RESPONSE_LIMITS.completeResponseMaxChars;
export const CROSS_VERIFY_UTF8_WORST_CASE_BYTES_PER_JAVASCRIPT_CHAR =
  CROSS_VERIFY_RESPONSE_LIMITS.utf8WorstCaseBytesPerJavaScriptChar;
export const CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES = CROSS_VERIFY_RESPONSE_LIMITS.rawOutputMaxBytes;
