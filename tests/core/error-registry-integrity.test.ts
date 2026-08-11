import { describe, expect, it } from 'vitest';
import { ErrorRegistry } from '../../src/core/errors.js';
import {
  DECKENT_ERROR_CODE_PATTERN,
  getRegisteredErrorEntries,
  inspectErrorRegistryIntegrity,
} from '../../src/core/error-registry.js';

describe('ErrorRegistry integrity', () => {
  it('gives every runtime-registered code a unique, well-formed code, message, and remediation', () => {
    const entries = getRegisteredErrorEntries(() => ErrorRegistry.getAll());
    const codes = [...entries.keys()];

    expect(codes).not.toHaveLength(0);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(DECKENT_ERROR_CODE_PATTERN);
    }
    expect(inspectErrorRegistryIntegrity(entries)).toEqual([]);
  });

  it('fails closed for absent or blank registry metadata', () => {
    const entries = new Map([
      ['DECKENT_E900', { message: '   ', suggestion: 'Repair the configuration.' }],
      ['DECKENT_E901', { message: 'Connection failed', suggestion: '' }],
      ['INVALID', { message: 'Malformed code', suggestion: 'Use a Deckent error code.' }],
    ]);

    expect(inspectErrorRegistryIntegrity(entries)).toEqual([
      { code: 'DECKENT_E900', kind: 'empty-message' },
      { code: 'DECKENT_E901', kind: 'missing-remediation' },
      { code: 'INVALID', kind: 'malformed-code' },
    ]);
  });

  it('accepts an explicit typed no-remediation reason', () => {
    const entries = new Map([
      [
        'DECKENT_E902',
        {
          message: 'Informational state',
          remediation: { kind: 'none' as const, reason: 'The state resolves without user action.' },
        },
      ],
    ]);

    expect(inspectErrorRegistryIntegrity(entries)).toEqual([]);
  });
});
