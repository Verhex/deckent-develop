/**
 * PCOMP-6 D3 (sprint-440 + CC completion of the cascade-skipped 440-003/004).
 *
 * 440-001's honest NO_GO established the ADR-G-023 ground truth: post-Sprint-148
 * there is NO 'testing' primary intent — pure test-authorship classifies as
 * 'implementation' + a test-coverage tag. The D3 fix therefore lands at the
 * CONSUMERS, not the intent union:
 *   - buildBehaviorPrecedenceNote suppresses the behavior-CHANGE override for
 *     all-test write scopes (the 19/19 corpus false-positive class);
 *   - prompt-lint W3 mirrors the same suppression (no stale findings);
 *   - intent-classifier no longer double-counts 'test'/'spec'/'coverage'/'vitest'
 *     toward 'implementation' (440-001 Part 1).
 */
import { describe, it, expect } from 'vitest';
import { buildBehaviorPrecedenceNote } from '../../src/orchestra/prompt-god-template.js';
import { lintWorkerPromptContract } from '../../src/orchestra/prompt-lint.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import type { Task } from '../../src/core/types.js';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: '440-900',
    title: 'fixture',
    description: 'fixture',
    model: 'sonnet',
    scope: { directories: [], filesRead: [], filesWrite: ['tests/orchestra/x.test.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
    assignedAgent: 'refactorer',
    routingMeta: { routingVersion: 'v2', taskDNA: { intent: { primary: 'implementation' } } } as never,
    ...over,
  } as Task;
}

describe('buildBehaviorPrecedenceNote — all-test write scope suppression (D3)', () => {
  it('suppresses the behavior-CHANGE override when every write target is a test file', () => {
    const t = makeTask({
      scope: {
        directories: [], filesRead: [],
        filesWrite: ['tests/orchestra/a.test.ts', 'tests/core/b.spec.ts'],
      },
    });
    expect(buildBehaviorPrecedenceNote(t)).toBe('');
  });

  it('still renders for a genuine implementation task writing src files', () => {
    const t = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: ['src/core/foo.ts', 'tests/core/foo.test.ts'] },
    });
    const note = buildBehaviorPrecedenceNote(t);
    expect(note).toContain('CHANGES external behavior');
    expect(note).toContain('implementation');
  });

  it('still empty for refactor/documentation/unknown intents and non-refactorer agents (pre-existing gates)', () => {
    expect(buildBehaviorPrecedenceNote(makeTask({
      routingMeta: { routingVersion: 'v2', taskDNA: { intent: { primary: 'refactor' } } } as never,
      scope: { directories: [], filesRead: [], filesWrite: ['src/x.ts'] },
    }))).toBe('');
    expect(buildBehaviorPrecedenceNote(makeTask({
      assignedAgent: 'ci-guardian',
      scope: { directories: [], filesRead: [], filesWrite: ['src/x.ts'] },
    }))).toBe('');
  });
});

describe('prompt-lint W3 mirrors the suppression (no stale findings)', () => {
  it('no behavior-precedence-suspect finding for an all-test additive task (block will not render)', () => {
    const t = makeTask({
      description: 'Additive-only regression testleri yaz; davranış değişmez.',
    });
    expect(
      lintWorkerPromptContract(t).some((f) => f.check === 'behavior-precedence-suspect'),
    ).toBe(false);
  });

  it('still flags an src-writing task whose text claims additive-only', () => {
    const t = makeTask({
      description: 'Additive-only alan ekle; davranış değişmez.',
      scope: { directories: [], filesRead: [], filesWrite: ['src/core/contract.ts'] },
    });
    expect(
      lintWorkerPromptContract(t).some((f) => f.check === 'behavior-precedence-suspect'),
    ).toBe(true);
  });
});

describe('intent-classifier — 440-001 Part 1 regression pins', () => {
  it("a pure test-authoring title no longer double-counts toward 'implementation' via test keywords", () => {
    const withTestWords = classifyIntent({
      title: 'Write vitest spec coverage for the parser',
      description: 'Add test spec files with coverage assertions.',
      scope: { directories: [], filesRead: [], filesWrite: ['tests/core/parser.test.ts'] },
    });
    // Post-Sprint-148 contract: primary stays a non-'testing' member (ADR-G-023)
    // and the test-coverage TAG carries the signal.
    expect(withTestWords.intent.primary).not.toBe('test');
    expect(JSON.stringify(withTestWords)).toContain('test-coverage');
  });

  it("an src-writing feature task still classifies as 'implementation'", () => {
    const impl = classifyIntent({
      title: 'Add retry endpoint to the API server',
      description: 'Implement a new endpoint module with a feature flag.',
      scope: { directories: [], filesRead: [], filesWrite: ['src/api/retry-endpoint.ts'] },
    });
    expect(impl.intent.primary).toBe('implementation');
  });
});
