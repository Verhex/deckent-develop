import { describe, expect, it } from 'vitest';
import {
  getMessage,
  getMessageLanguages,
  MESSAGE_KEYS,
} from '../../src/cli/helpers/messages.js';

const cases = [
  ['runtime_hygiene.inventory', ['bytes', 'count', 'families']],
  ['runtime_hygiene.plan', ['bytes', 'count']],
  ['runtime_hygiene.preserve', ['count', 'family']],
  ['runtime_hygiene.archive', ['bytes', 'count', 'family']],
  ['runtime_hygiene.retire', ['bytes', 'count', 'family']],
  ['runtime_hygiene.hold', ['reasonCode']],
  ['runtime_hygiene.receipt', ['receiptState', 'status']],
  ['runtime_hygiene.summary', ['attempted', 'failures', 'families', 'retired']],
] as const satisfies readonly (readonly [string, readonly string[]])[];

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/gu)]
    .map(match => match[1]!)
    .sort();
}

describe('runtime-hygiene operator messages', () => {
  it.each(cases)('%s resolves directly in EN and TR', (key) => {
    expect(MESSAGE_KEYS).toContain(key);
    // Direct catalog membership prevents English fallback from hiding a TR gap.
    expect([...getMessageLanguages(key)].sort()).toEqual(['en', 'tr']);
    expect(getMessage(key, 'en')).not.toBe(key);
    expect(getMessage(key, 'tr')).not.toBe(key);
    expect(getMessage(key, 'en')).not.toBe(getMessage(key, 'tr'));
  });

  it.each(cases)('%s has exact placeholder parity', (key, expected) => {
    for (const lang of ['en', 'tr'] as const) {
      expect(placeholders(getMessage(key, lang))).toEqual([...expected].sort());
    }
  });

  it.each(cases)('%s uses only bounded, non-sensitive placeholders', (key) => {
    const forbidden = /^(?:account|accountId|digest|email|identity|password|path|planDigest|projectId|provider|receiptPath|secret|sha256|source|sourcePath|targetPath|tenantId|token|userId|\w+Path)$/iu;

    for (const lang of ['en', 'tr'] as const) {
      expect(placeholders(getMessage(key, lang)))
        .not.toEqual(expect.arrayContaining([expect.stringMatching(forbidden)]));
    }
  });

  it('keeps HOLD typed and explicitly side-effect free in both locales', () => {
    const vars = { reasonCode: 'AUTHORITY_CHANGED' };
    for (const lang of ['en', 'tr'] as const) {
      const rendered = getMessage('runtime_hygiene.hold', lang, vars);
      expect(rendered).toContain('HOLD (AUTHORITY_CHANGED)');
      expect(rendered).not.toMatch(/\{\w+\}/u);
    }
    expect(getMessage('runtime_hygiene.hold', 'en', vars)).toContain('no artifact was changed');
    expect(getMessage('runtime_hygiene.hold', 'tr', vars)).toContain('hiçbir artifact değiştirilmedi');
  });

  it('renders every state without unresolved placeholders when safe aggregates are supplied', () => {
    const vars = {
      attempted: '8',
      bytes: '4096',
      count: '12',
      failures: '0',
      families: '5',
      family: 'logs',
      reasonCode: 'AUTHORITY_CHANGED',
      receiptState: 'published',
      retired: '8',
      status: 'complete',
    };

    for (const [key] of cases) {
      for (const lang of ['en', 'tr'] as const) {
        expect(getMessage(key, lang, vars)).not.toMatch(/\{\w+\}/u);
      }
    }
  });
});
