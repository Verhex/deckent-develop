import { describe, it, expect } from 'vitest';
import { redactSensitive } from '../../src/core/redact-sensitive.js';

/**
 * Regression suite for born-663 / task 427-017 (REDACT-SK):
 * the general `sk-[…]{20,}` rule has a 20-char floor, so short Anthropic-style
 * fixture keys (e.g. `sk-ant-test-111`, 12 chars after `sk-`) slipped through to
 * disk. A length-independent `sk-ant-` rule redacts them at every length while
 * keeping the general `sk-` rule and every other pattern byte-identical.
 */
describe('redactSensitive — sk-ant- length-independent redaction', () => {
  // ─── Length independence (the born-663 fix) ───────────────────────

  it('redacts a short sk-ant- fixture key that the {20,} rule misses', () => {
    // 12 chars after `sk-` → old rule left this intact (red-before-green proof).
    const input = 'key is sk-ant-test-111 done';
    const result = redactSensitive(input);
    expect(result).toBe('key is [REDACTED] done');
    expect(result).not.toContain('sk-ant-test-111');
  });

  it('redacts a very short single-char sk-ant- key', () => {
    expect(redactSensitive('sk-ant-a')).toBe('[REDACTED]');
  });

  it('redacts a long sk-ant- key (regression — already covered by general rule)', () => {
    const input = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
    const result = redactSensitive(input);
    expect(result).toBe('[REDACTED]');
    expect(result).not.toContain('sk-ant-api03');
  });

  it('redacts sk-ant- as an assignment value', () => {
    const result = redactSensitive('KEY=sk-ant-x');
    expect(result).toBe('KEY=[REDACTED]');
  });

  // ─── False-positive boundary guard (`ask-ant`) ────────────────────

  it('does NOT redact an embedded sk-ant substring inside another word', () => {
    // No word boundary before `sk` in `ask-ant-...`, so it must not anchor.
    const input = 'the ask-ant-test-111 value stays';
    expect(redactSensitive(input)).toBe(input);
  });

  it('discriminates: a hyphen before sk IS a boundary, so it redacts', () => {
    // `-` before `sk` = boundary exists → guard is discriminating, not merely conservative.
    const result = redactSensitive('foo-sk-ant-test-111');
    expect(result).toBe('foo-[REDACTED]');
    expect(result).not.toContain('sk-ant-test-111');
  });

  // ─── Existing sk- behavior stays bit-identical ────────────────────

  it('general sk- rule unchanged: long non-ant sk- key still redacts', () => {
    const input = 'Using key sk-proj-abc123def456ghi789jkl012mno';
    expect(redactSensitive(input)).toBe('Using key [REDACTED]');
  });

  it('general sk- rule unchanged: short sk- non-ant string stays intact', () => {
    const input = 'sk-short is not a key';
    expect(redactSensitive(input)).toBe(input);
  });

  // ─── Other patterns stay bit-identical ────────────────────────────

  it('other patterns unchanged: Bearer token still redacts', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def';
    expect(redactSensitive(input)).toBe('Authorization: Bearer [REDACTED]');
  });

  it('other patterns unchanged: URL password still redacts', () => {
    const input = 'connecting to https://admin:supersecret123@db.example.com/mydb';
    const result = redactSensitive(input);
    expect(result).toBe('connecting to https://admin:[REDACTED]@db.example.com/mydb');
    expect(result).not.toContain('supersecret123');
  });
});
