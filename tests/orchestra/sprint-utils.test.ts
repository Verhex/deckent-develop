import { describe, expect, it } from 'vitest';
import { extractGoNogoCriteria } from '../../src/orchestra/sprint-utils.js';

const context = {
  kind: 'code-development' as const,
  stack: 'typescript' as const,
  commands: {
    typecheck: 'npx tsc --noEmit',
    test: 'npx vitest run',
  },
};

describe('extractGoNogoCriteria — authored acceptance contracts', () => {
  it('keeps authored GO and NO_GO verbatim while appending derived verification', () => {
    const result = extractGoNogoCriteria([
      '**GO:** preserve this sentence; including punctuation.',
      'And this continuation exactly.',
      '**NO_GO:** reject when the wire is absent.',
      '**TECH_DEBT:** only wording polish is acceptable.',
    ].join('\n'), undefined, context);

    expect(result.goCriteria).toBe([
      'preserve this sentence; including punctuation.',
      'And this continuation exactly.',
      '`npx tsc --noEmit` passes; the targeted test file(s) for the modules you changed pass',
    ].join('\n'));
    expect(result.noGoCriteria).toBe('reject when the wire is absent.');
    expect(result.techDebtAcceptable).toBe('only wording polish is acceptable.');
  });

  it('uses the derived NO_GO fallback when only GO is authored', () => {
    const result = extractGoNogoCriteria('GO: authored success contract', undefined, context);

    expect(result.goCriteria).toContain('authored success contract\n`npx tsc --noEmit` passes');
    expect(result.noGoCriteria).toBe('Build fails or tests fail');
    expect(result.techDebtAcceptable).toBe('Minor style issues if build and tests pass');
  });

  it('preserves the existing derived result byte-for-byte without an authored GO', () => {
    const result = extractGoNogoCriteria('ordinary task description', undefined, context);

    expect(result).toEqual({
      goCriteria: '`npx tsc --noEmit` passes; the targeted test file(s) for the modules you changed pass',
      noGoCriteria: 'Build fails or tests fail',
      techDebtAcceptable: 'Minor style issues if build and tests pass',
      items: expect.any(Array),
    });
    expect(result.items).toHaveLength(2);
  });

  it('caps every authored field at 2000 characters and retains derived verification', () => {
    const long = 'x'.repeat(2_100);
    const result = extractGoNogoCriteria([
      `GO: ${long}`,
      `NO_GO otherwise: ${long}`,
      `techDebtAcceptable: ${long}`,
    ].join('\n'), undefined, context);

    expect(result.goCriteria).toHaveLength(2_000);
    expect(result.goCriteria).toContain('`npx tsc --noEmit` passes');
    expect(result.noGoCriteria).toHaveLength(2_000);
    expect(result.techDebtAcceptable).toHaveLength(2_000);
  });
});
