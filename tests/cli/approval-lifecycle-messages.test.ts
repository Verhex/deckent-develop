import { describe, expect, it } from 'vitest';

import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';

describe('approval lifecycle message catalog', () => {
  it('provides every lifecycle state and timeout disposition in EN/TR', () => {
    const keys = [
      'approval.lifecycle.stage.initial',
      'approval.lifecycle.stage.renotify',
      'approval.lifecycle.stage.alternate-channel',
      'approval.lifecycle.stage.park-alert',
      'approval.lifecycle.stage.expired',
      'approval.lifecycle.risk.routine',
      'approval.lifecycle.risk.elevated',
      'approval.lifecycle.risk.critical',
      'approval.lifecycle.timeout.park-undecidable',
      'approval.lifecycle.timeout.park-alert',
      'approval.lifecycle.timeout.deny-expire',
      'approval.lifecycle.timeout.request-default',
      'confirmations.err_expired',
      'confirmations.quarantine_row',
      'approvals.lifecycle_detail',
      'approvals.federated.row_quarantined',
      'approvals.federated.row_lifecycle',
      'approvals.lifecycle_disabled_hold',
    ];
    for (const key of keys) {
      expect(getMessageLanguages(key)).toEqual(expect.arrayContaining(['en', 'tr']));
      expect(getMessage(key, 'en')).not.toBe(key);
      expect(getMessage(key, 'tr')).not.toBe(key);
    }
  });

  it('renders expiry and quarantine evidence without unresolved placeholders', () => {
    expect(getMessage('confirmations.err_expired', 'en', { id: 'cnf-123' }))
      .toContain('cnf-123');
    const rendered = getMessage('confirmations.quarantine_row', 'tr', {
      file: 'bad.json',
      reasonCode: 'unreadable-json',
      sourceReference: 'confirmation-quarantine:bad.json:abc',
    });
    expect(rendered).toContain('bad.json');
    expect(rendered).not.toMatch(/\{\w+\}/u);
    const row = getMessage('approvals.federated.row_lifecycle', 'en', {
      code: '42', origin: 'confirmation', id: 'cnf-1', summary: 'review',
      riskTier: 'elevated', stage: 'renotify', expiresAt: '2026-08-21T16:00:00.000Z',
      hint: 'deckent confirmations decide',
    });
    expect(row).toContain('#42');
    expect(row).not.toMatch(/\{\w+\}/u);
  });
});
