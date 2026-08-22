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
  it('keeps authored GO and NO_GO while omitting wave verification commands', () => {
    const result = extractGoNogoCriteria([
      '**GO:** preserve this sentence; including punctuation.',
      'And this continuation exactly.',
      '**NO_GO:** reject when the wire is absent.',
      '**TECH_DEBT:** only wording polish is acceptable.',
    ].join('\n'), undefined, context);

    expect(result.goCriteria).toBe([
      'preserve this sentence; including punctuation.',
      'And this continuation exactly.',
      'Implementation satisfies the task requirements for the typescript stack',
    ].join('\n'));
    expect(result.noGoCriteria).toBe('reject when the wire is absent.');
    expect(result.techDebtAcceptable).toBe('only wording polish is acceptable.');
  });

  it('uses the derived NO_GO fallback when only GO is authored', () => {
    const result = extractGoNogoCriteria('GO: authored success contract', undefined, context);

    expect(result.goCriteria).toContain('authored success contract\nImplementation satisfies the task requirements');
    expect(result.noGoCriteria).toBe('Implementation does not satisfy the task requirements');
    expect(result.techDebtAcceptable).toContain('Minor style issues');
  });

  it('derives task acceptance without global verification when GO is not authored', () => {
    const result = extractGoNogoCriteria('ordinary task description', undefined, context);

    expect(result).toEqual({
      goCriteria: 'Implementation satisfies the task requirements for the typescript stack',
      noGoCriteria: 'Implementation does not satisfy the task requirements',
      techDebtAcceptable: 'Minor style issues that do not affect the task requirements',
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
    expect(result.goCriteria).not.toContain('tsc');
    expect(result.noGoCriteria).toHaveLength(2_000);
    expect(result.techDebtAcceptable).toHaveLength(2_000);
  });

  it('adds an explicitly authored scoped Test only to that task acceptance contract', () => {
    const scoped = extractGoNogoCriteria(
      'ordinary task description',
      'npx vitest run tests/core/criteria-deriver.test.ts',
      context,
    );
    const unscoped = extractGoNogoCriteria('ordinary task description', undefined, context);

    expect(scoped.goCriteria).toContain('npx vitest run tests/core/criteria-deriver.test.ts');
    expect(scoped.items.some(item => item.statement.includes('criteria-deriver.test.ts'))).toBe(true);
    expect(unscoped.goCriteria).not.toContain('vitest');
    expect(unscoped.items.some(item => item.statement.includes('vitest'))).toBe(false);
  });
});
