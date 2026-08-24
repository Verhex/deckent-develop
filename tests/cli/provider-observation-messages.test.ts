import { describe, expect, it } from 'vitest';
import {
  getMessage,
  getMessageLanguages,
  MESSAGE_KEYS,
} from '../../src/cli/helpers/messages.js';

const migrationCases = [
  ['provider_observation.migration.inspect', {
    sourcePath: '.deckent/provider-observations.json',
    schemaVersion: '1',
    action: 'migrate',
  }],
  ['provider_observation.migration.dry_run', {}],
  ['provider_observation.migration.pending_approval', { approvalId: 'approval-17' }],
  ['provider_observation.migration.backup', { backupPath: '.deckent/provider-observations.v1.bak' }],
  ['provider_observation.migration.migrated', { count: '12' }],
  ['provider_observation.migration.adopted', { path: '.deckent/provider-observations.v2.json' }],
  ['provider_observation.migration.already_v2', {}],
  ['provider_observation.migration.hold', { reasonCode: 'approval_required', detail: 'owner approval is absent' }],
  ['provider_observation.migration.error', { errorCode: 'E_BACKUP', detail: 'backup could not be verified' }],
  ['provider_observation.migration.forensic_counts', {
    inspected: '21',
    eligible: '18',
    migrated: '12',
    adopted: '3',
    held: '2',
    rejected: '1',
  }],
] as const satisfies readonly (readonly [string, Readonly<Record<string, string>>])[];

const adoptionCases = [
  ['provider_observation.adoption.receipt_persisted', ['receiptId']],
  ['provider_observation.adoption.replay_verified', ['receiptId']],
  ['provider_observation.adoption.hold', ['detail', 'reasonCode']],
] as const satisfies readonly (readonly [string, readonly string[]])[];

const runtimeAdoptionCases = [
  ['provider_observation.runtime_adoption.preimage', []],
  ['provider_observation.runtime_adoption.apply', []],
  ['provider_observation.runtime_adoption.plan_digest', []],
  ['provider_observation.runtime_adoption.dry_run', ['planDigest']],
  ['provider_observation.runtime_adoption.receipt_persisted', ['providerReceiptId', 'runtimeReceiptId']],
  ['provider_observation.runtime_adoption.replay_verified', ['providerReceiptId', 'runtimeReceiptId']],
  ['provider_observation.runtime_adoption.hold', ['reasonCode']],
] as const satisfies readonly (readonly [string, readonly string[]])[];

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/gu)]
    .map((match) => match[1]!)
    .sort();
}

describe('provider-observation migration messages', () => {
  it.each(migrationCases)('%s has an exact EN/TR catalog pair', (key) => {
    expect(MESSAGE_KEYS).toContain(key);
    expect([...getMessageLanguages(key)].sort()).toEqual(['en', 'tr']);
    expect(getMessage(key, 'en')).not.toBe(key);
    expect(getMessage(key, 'tr')).not.toBe(key);
  });

  it.each(migrationCases)('%s interpolates every supplied field in both languages', (key, vars) => {
    for (const lang of ['en', 'tr'] as const) {
      const rendered = getMessage(key, lang, { ...vars });
      expect(rendered).not.toMatch(/\{\w+\}/);
      for (const value of Object.values(vars)) {
        expect(rendered).toContain(value);
      }
    }
  });

  it('keeps the dry-run and already-v2 outcomes explicitly side-effect free', () => {
    expect(getMessage('provider_observation.migration.dry_run', 'en')).toContain('nothing was written');
    expect(getMessage('provider_observation.migration.dry_run', 'tr')).toContain('hiçbir şey yazılmadı');
    expect(getMessage('provider_observation.migration.already_v2', 'en')).toContain('no migration was required');
    expect(getMessage('provider_observation.migration.already_v2', 'tr')).toContain('migration gerekmedi');
  });

  it('preserves typed HOLD and error identifiers during interpolation', () => {
    expect(getMessage('provider_observation.migration.hold', 'en', {
      reasonCode: 'approval_required',
      detail: 'owner approval is absent',
    })).toBe('HOLD (approval_required): owner approval is absent. Existing provider observations were preserved.');
    expect(getMessage('provider_observation.migration.error', 'tr', {
      errorCode: 'E_BACKUP',
      detail: 'backup doğrulanamadı',
    })).toBe('Provider observation migration başarısız oldu (E_BACKUP): backup doğrulanamadı.');
  });
});

describe('provider-observation adoption receipt messages', () => {
  it.each(adoptionCases)('%s is explicitly cataloged in both locales', (key) => {
    expect(MESSAGE_KEYS).toContain(key);
    // Inspect catalog membership directly so getMessage's English fallback cannot
    // make a missing Turkish entry appear complete.
    expect([...getMessageLanguages(key)].sort()).toEqual(['en', 'tr']);
    expect(getMessage(key, 'en')).not.toBe(getMessage(key, 'tr'));
  });

  it.each(adoptionCases)('%s pins the complete placeholder contract in EN and TR', (key, expected) => {
    for (const lang of ['en', 'tr'] as const) {
      expect(placeholders(getMessage(key, lang))).toEqual([...expected].sort());
    }
  });

  it.each(adoptionCases)('%s does not expose raw provider identity fields', (key) => {
    const forbiddenIdentityFields = /^(?:account|accountId|email|identity|model|organization|password|path|projectId|provider|secret|sourcePath|targetPath|tenantId|token|userId|\w+Path)$/iu;

    for (const lang of ['en', 'tr'] as const) {
      expect(placeholders(getMessage(key, lang)))
        .not.toEqual(expect.arrayContaining([expect.stringMatching(forbiddenIdentityFields)]));
    }
  });
});

describe('provider-observation runtime-adoption messages', () => {
  it.each(runtimeAdoptionCases)('%s has exact, distinct EN/TR entries', (key) => {
    expect(MESSAGE_KEYS).toContain(key);
    expect([...getMessageLanguages(key)].sort()).toEqual(['en', 'tr']);
    expect(getMessage(key, 'en')).not.toBe(getMessage(key, 'tr'));
  });

  it.each(runtimeAdoptionCases)('%s pins its bounded placeholder contract', (key, expected) => {
    for (const language of ['en', 'tr'] as const) {
      expect(placeholders(getMessage(key, language))).toEqual([...expected].sort());
    }
  });

  it.each(runtimeAdoptionCases)('%s never asks for a raw identity or path', (key) => {
    for (const language of ['en', 'tr'] as const) {
      expect(placeholders(getMessage(key, language))).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/^(?:account|email|identity|path|provider|secret|tenant|token|user|\w+Path)$/iu),
      ]));
    }
  });
});
