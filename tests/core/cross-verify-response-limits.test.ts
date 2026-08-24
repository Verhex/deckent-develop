import { describe, expect, it } from 'vitest';

import {
  CROSS_VERIFY_ADJUDICATION_REASON_MAX_CHARS,
  CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS,
  CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES,
  CROSS_VERIFY_RESPONSE_LIMITS,
  CROSS_VERIFY_UTF8_WORST_CASE_BYTES_PER_JAVASCRIPT_CHAR,
} from '../../src/core/cross-verify-response-limits.js';

describe('cross-verify response limits', () => {
  it('defines the exact canonical budgets and their arithmetic invariant', () => {
    expect(CROSS_VERIFY_ADJUDICATION_REASON_MAX_CHARS).toBe(8_192);
    expect(CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS).toBe(65_536);
    expect(CROSS_VERIFY_UTF8_WORST_CASE_BYTES_PER_JAVASCRIPT_CHAR).toBe(3);
    expect(CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES).toBe(196_608);
    expect(CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES).toBe(
      CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS
        * CROSS_VERIFY_UTF8_WORST_CASE_BYTES_PER_JAVASCRIPT_CHAR,
    );
    expect(Number.isSafeInteger(CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES)).toBe(true);
  });

  it('safely bounds UTF-8 output at the complete JavaScript-character limit', () => {
    const worstCase = '\u0800'.repeat(CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS);
    const overLimit = `${worstCase}\u0800`;
    const supplementaryPlane = '😀'.repeat(CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS / 2);

    expect(worstCase).toHaveLength(CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS);
    expect(Buffer.byteLength(worstCase, 'utf8')).toBe(CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES);
    expect(Buffer.byteLength(overLimit, 'utf8')).toBeGreaterThan(CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES);
    expect(Buffer.byteLength(supplementaryPlane, 'utf8')).toBeLessThanOrEqual(
      CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES,
    );
  });

  it('exposes an immutable limits object', () => {
    expect(Object.isFrozen(CROSS_VERIFY_RESPONSE_LIMITS)).toBe(true);
    expect(Reflect.set(CROSS_VERIFY_RESPONSE_LIMITS, 'reasonMaxChars', 1)).toBe(false);
    expect(CROSS_VERIFY_RESPONSE_LIMITS.reasonMaxChars).toBe(8_192);
  });
});
