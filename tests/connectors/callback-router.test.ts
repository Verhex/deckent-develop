import { describe, it, expect } from 'vitest';
import { parseApprovalCallback, approvalCallbackData } from '../../src/connectors/callback-router.js';

describe('parseApprovalCallback', () => {
  it('round-trips a versioned payload', () => {
    const data = approvalCallbackData('bot', 'approve', 'A3F9C', 'deadbeef');
    expect(parseApprovalCallback(data)).toEqual({
      version: 'dk1',
      ns: 'bot',
      action: 'approve',
      shortCode: 'A3F9C',
      nonce: 'deadbeef',
    });
  });

  it('parses an approve payload as legacy', () => {
    expect(parseApprovalCallback('approve:backlog-dash-ux-6-api')).toEqual({
      state: 'legacy',
      action: 'approve',
      id: 'backlog-dash-ux-6-api',
    });
  });

  it('parses a reject payload as legacy', () => {
    expect(parseApprovalCallback('reject:nervous-001')).toEqual({
      state: 'legacy',
      action: 'reject',
      id: 'nervous-001',
    });
  });

  it('keeps a triggerId that itself contains colons', () => {
    expect(parseApprovalCallback('approve:a:b:c')).toEqual({ state: 'legacy', action: 'approve', id: 'a:b:c' });
  });

  it('returns the invalid state for an unknown prefix', () => {
    expect(parseApprovalCallback('delete:x')).toEqual({ state: 'invalid' });
    expect(parseApprovalCallback('chat message')).toEqual({ state: 'invalid' });
  });

  it('returns the invalid state for a missing/empty id', () => {
    expect(parseApprovalCallback('approve:')).toEqual({ state: 'invalid' });
    expect(parseApprovalCallback('approve')).toEqual({ state: 'invalid' });
    expect(parseApprovalCallback('')).toEqual({ state: 'invalid' });
  });

  it('rejects malformed namespaces, actions, short codes, and nonces', () => {
    expect(parseApprovalCallback('dk1:api:approve:A3F9C:deadbeef')).toEqual({ state: 'invalid' });
    expect(parseApprovalCallback('dk1:bot:delete:A3F9C:deadbeef')).toEqual({ state: 'invalid' });
    expect(parseApprovalCallback('dk1:bot:approve:A3O9C:deadbeef')).toEqual({ state: 'invalid' });
    expect(parseApprovalCallback('dk1:bot:approve:A3F9C:xyz12345')).toEqual({ state: 'invalid' });
  });
});

describe('approvalCallbackData', () => {
  it('round-trips with parseApprovalCallback', () => {
    const data = approvalCallbackData('approve', 'trig-1');
    expect(data).toBe('approve:trig-1');
    expect(parseApprovalCallback(data)).toEqual({ state: 'legacy', action: 'approve', id: 'trig-1' });
  });

  it('stays safely below Telegram callback_data\'s 64-byte limit', () => {
    const data = approvalCallbackData('bot', 'approve', 'A3F9C', 'deadbeef');
    expect(Buffer.byteLength(data, 'utf8')).toBeLessThan(64);
  });

  it('enforces Crockford short-code and hexadecimal nonce character sets', () => {
    expect(() => approvalCallbackData('brk', 'reject', 'A3O9C', 'deadbeef')).toThrow(RangeError);
    expect(() => approvalCallbackData('brk', 'reject', 'A3F9C', 'deadbee!')).toThrow(RangeError);
  });
});
