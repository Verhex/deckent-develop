import { describe, it, expect } from 'vitest';
import { parseApprovalCallback, approvalCallbackData } from '../../src/connectors/callback-router.js';

describe('parseApprovalCallback', () => {
  it('parses an approve payload', () => {
    expect(parseApprovalCallback('approve:backlog-dash-ux-6-api')).toEqual({
      action: 'approve',
      triggerId: 'backlog-dash-ux-6-api',
    });
  });

  it('parses a reject payload', () => {
    expect(parseApprovalCallback('reject:nervous-001')).toEqual({
      action: 'reject',
      triggerId: 'nervous-001',
    });
  });

  it('keeps a triggerId that itself contains colons', () => {
    expect(parseApprovalCallback('approve:a:b:c')).toEqual({ action: 'approve', triggerId: 'a:b:c' });
  });

  it('returns null for an unknown prefix', () => {
    expect(parseApprovalCallback('delete:x')).toBeNull();
    expect(parseApprovalCallback('chat message')).toBeNull();
  });

  it('returns null for a missing/empty triggerId', () => {
    expect(parseApprovalCallback('approve:')).toBeNull();
    expect(parseApprovalCallback('approve')).toBeNull();
    expect(parseApprovalCallback('')).toBeNull();
  });
});

describe('approvalCallbackData', () => {
  it('round-trips with parseApprovalCallback', () => {
    const data = approvalCallbackData('approve', 'trig-1');
    expect(data).toBe('approve:trig-1');
    expect(parseApprovalCallback(data)).toEqual({ action: 'approve', triggerId: 'trig-1' });
  });
});
