import { describe, expect, it } from 'vitest';

import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';

const PUBLIC_STATE_KEYS = [
  'acceptance.confirmation.list',
  'acceptance.confirmation.route',
  'acceptance.confirmation.hold',
  'acceptance.confirmation.created',
  'acceptance.confirmation.routed',
  'acceptance.confirmation.prepared',
  'acceptance.confirmation.applied',
  'acceptance.confirmation.replay',
  'acceptance.confirmation.tenant_mismatch',
  'acceptance.confirmation.corruption',
  'acceptance.confirmation.expired',
  'acceptance.confirmation.authority_hold',
  'acceptance.confirmation.service_unavailable',
  'acceptance.confirmation.corrupt',
  'acceptance.confirmation.foreign',
  'acceptance.confirmation.provider_separation',
  'acceptance.confirmation.runtime_audit',
] as const;

const ROUTING_AND_LEGACY_KEYS = [
  'acceptance.confirmation.pending',
  'acceptance.confirmation.confirmed',
  'acceptance.confirmation.residual',
  'acceptance.confirmation.conflict',
  'acceptance.confirmation.reconciliation_hold',
  'acceptance.confirmation.authenticated_surface_route',
] as const;

const ALL_KEYS = [...PUBLIC_STATE_KEYS, ...ROUTING_AND_LEGACY_KEYS] as const;

const VARIABLES = {
  confirmationId: 'acceptance-42',
  surface: 'operator-console',
  reason: 'evidence-mismatch',
  count: '2',
  outcome: 'APPLIED',
};

describe('acceptance confirmation lifecycle message catalog', () => {
  it.each(ALL_KEYS)('%s is a genuine EN/TR catalog entry', (key) => {
    expect(getMessageLanguages(key)).toEqual(['en', 'tr']);

    const en = getMessage(key, 'en', VARIABLES);
    const tr = getMessage(key, 'tr', VARIABLES);
    expect(en).not.toBe(key);
    expect(tr).not.toBe(key);
    expect(en).not.toBe(tr);
    expect(en).not.toMatch(/\{\w+\}/u);
    expect(tr).not.toMatch(/\{\w+\}/u);
  });

  it.each(ALL_KEYS)('%s has identical EN/TR placeholders', (key) => {
    const placeholders = (message: string): string[] =>
      [...message.matchAll(/\{(\w+)\}/gu)].map(match => match[1]!).sort();

    expect(placeholders(getMessage(key, 'en')))
      .toEqual(placeholders(getMessage(key, 'tr')));
  });

  it('catalogs every public service state explicitly', () => {
    expect(PUBLIC_STATE_KEYS).toHaveLength(17);
    for (const state of ['list', 'route', 'hold', 'created', 'routed', 'prepared', 'applied', 'replay',
      'tenant_mismatch', 'corruption', 'expired', 'authority_hold', 'service_unavailable',
      'corrupt', 'foreign', 'provider_separation', 'runtime_audit']) {
      expect(PUBLIC_STATE_KEYS).toContain(`acceptance.confirmation.${state}` as typeof PUBLIC_STATE_KEYS[number]);
    }
  });

  it('covers list, route, HOLD, APPLIED, expiry, corrupt, foreign, provider separation and runtime audit copy', () => {
    const expectedCopy = [
      ['acceptance.confirmation.list', '2'],
      ['acceptance.confirmation.route', VARIABLES.surface],
      ['acceptance.confirmation.hold', 'HOLD'],
      ['acceptance.confirmation.applied', 'APPLIED'],
      ['acceptance.confirmation.expired', VARIABLES.confirmationId],
      ['acceptance.confirmation.corrupt', VARIABLES.confirmationId],
      ['acceptance.confirmation.foreign', VARIABLES.confirmationId],
      ['acceptance.confirmation.provider_separation', VARIABLES.confirmationId],
      ['acceptance.confirmation.runtime_audit', VARIABLES.outcome],
    ] as const;

    for (const [key, evidence] of expectedCopy) {
      for (const lang of ['en', 'tr'] as const) {
        expect(getMessage(key, lang, VARIABLES)).toContain(evidence);
      }
    }
  });

  it('keeps stable reasonCode values separate from localized user copy', () => {
    for (const key of ALL_KEYS) {
      expect(getMessage(key, 'en')).not.toContain('{reasonCode}');
      expect(getMessage(key, 'tr')).not.toContain('{reasonCode}');
    }
  });

  it('keeps state copy provider/model-neutral and routes through the supplied authenticated surface', () => {
    for (const key of ALL_KEYS) {
      for (const lang of ['en', 'tr'] as const) {
        const rendered = getMessage(key, lang, VARIABLES);
        expect(rendered).not.toMatch(/openai|anthropic|gemini|claude|gpt[-\s]?\d/iu);
      }
    }

    const route = getMessage(
      'acceptance.confirmation.authenticated_surface_route',
      'en',
      VARIABLES,
    );
    expect(route).toContain(VARIABLES.surface);
    expect(route).toContain(VARIABLES.confirmationId);
  });
});
