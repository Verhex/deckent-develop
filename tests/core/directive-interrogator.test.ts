import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';
import {
  buildInterrogationQuestions,
  applyInterrogationAnswers,
  INTERROGATION_MESSAGE_KEYS,
  REFINEMENTS_MARKER,
  type InterrogationQuestion,
} from '../../src/core/directive-interrogator.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MULTI_TASK_DIRECTIVES = `# DIRECTIVES — Sprint 276: PLAN-INT-1 (Pre-PLAN) + XVER-1 (Cross-Provider)

## Goal: PLAN-INT-1 ve XVER-1 iki kalite kaldıracı. F1-CB OAuth fleet.

---

## Task 1: directive-interrogator çekirdeği
- Model: opus
- Effort: high

### Description
Çekirdek soru üretimi.

---

## Task 2: interrogation config
- Model: sonnet
- Effort: low

### Description
Config bloğu.
`;

const ALL_CATEGORIES = ['pain', 'wedge', 'hidden', 'premise', 'effort'];

// ─── buildInterrogationQuestions ─────────────────────────────────────────────

describe('buildInterrogationQuestions', () => {
  it('returns the five structural questions for a multi-task DIRECTIVES', () => {
    const qs = buildInterrogationQuestions(MULTI_TASK_DIRECTIVES);
    expect(qs).toHaveLength(5);
    expect(qs.map((q) => q.category)).toEqual(ALL_CATEGORIES);
  });

  it('covers all five interrogation lenses with unique ids', () => {
    const qs = buildInterrogationQuestions(MULTI_TASK_DIRECTIVES);
    const ids = new Set(qs.map((q) => q.id));
    expect(ids).toEqual(new Set(ALL_CATEGORIES));
  });

  it('handles empty DIRECTIVES — still 5 questions with default params', () => {
    const qs = buildInterrogationQuestions('');
    expect(qs).toHaveLength(5);
    const effort = qs.find((q) => q.category === 'effort');
    expect(effort?.params.taskCount).toBe('0');
  });

  it('injects parsed key-names + task count into params (parametric)', () => {
    const qs = buildInterrogationQuestions(MULTI_TASK_DIRECTIVES);
    const pain = qs.find((q) => q.category === 'pain');
    const premise = qs.find((q) => q.category === 'premise');
    const effort = qs.find((q) => q.category === 'effort');

    // Feature codes extracted from the Goal → subject / keyNames.
    expect(pain?.params.subject).toContain('PLAN-INT-1');
    expect(pain?.params.subject).toContain('XVER-1');
    expect(pain?.params.keyNames).toContain('F1-CB');

    // Task count + titles injected.
    expect(effort?.params.taskCount).toBe('2');
    expect(premise?.params.tasks).toContain('directive-interrogator çekirdeği');
  });

  it('every question carries an i18n key from the public key contract', () => {
    const qs = buildInterrogationQuestions(MULTI_TASK_DIRECTIVES);
    for (const q of qs) {
      expect(INTERROGATION_MESSAGE_KEYS).toContain(q.messageKey);
    }
  });

  it('resolves text through getMessage and honours the requested language', () => {
    const en = buildInterrogationQuestions(MULTI_TASK_DIRECTIVES, { lang: 'en' });
    const tr = buildInterrogationQuestions(MULTI_TASK_DIRECTIVES, { lang: 'tr' });

    expect(en.every((q) => q.lang === 'en')).toBe(true);
    expect(tr.every((q) => q.lang === 'tr')).toBe(true);

    // text is exactly the getMessage resolution (decoupled from whether Task 2 added keys).
    for (const q of en) {
      expect(q.text).toBe(getMessage(q.messageKey, 'en', q.params));
      expect(typeof q.text).toBe('string');
      expect(q.text.length).toBeGreaterThan(0);
    }
  });

  it('does not throw on malformed / heading-less input', () => {
    expect(() => buildInterrogationQuestions('no headings here at all')).not.toThrow();
    const qs = buildInterrogationQuestions('no headings here at all');
    expect(qs).toHaveLength(5);
  });
});

// ─── applyInterrogationAnswers ───────────────────────────────────────────────

describe('applyInterrogationAnswers', () => {
  it('preserves original content and adds a Refinements section', () => {
    const out = applyInterrogationAnswers(MULTI_TASK_DIRECTIVES, [
      { id: 'pain', answer: 'real recurring pain, confirmed by Alperen' },
      { id: 'wedge', answer: 'ship the structural question generator only' },
    ]);

    // Original content is never deleted.
    expect(out).toContain('## Goal: PLAN-INT-1 ve XVER-1');
    expect(out).toContain('## Task 1: directive-interrogator çekirdeği');
    expect(out).toContain('## Task 2: interrogation config');

    // Refinements appended with the answers.
    expect(out).toContain(REFINEMENTS_MARKER);
    expect(out).toContain('real recurring pain, confirmed by Alperen');
    expect(out).toContain('ship the structural question generator only');
  });

  it('is idempotent — re-applying replaces the section, never duplicates', () => {
    const first = applyInterrogationAnswers(MULTI_TASK_DIRECTIVES, [
      { id: 'pain', answer: 'first answer' },
    ]);
    const second = applyInterrogationAnswers(first, [
      { id: 'pain', answer: 'updated answer' },
      { id: 'premise', answer: 'premise questioned' },
    ]);

    const markerCount = second.split(REFINEMENTS_MARKER).length - 1;
    expect(markerCount).toBe(1);
    expect(second).toContain('updated answer');
    expect(second).toContain('premise questioned');
    expect(second).not.toContain('first answer');
  });

  it('tolerates empty / missing answers — returns the original unchanged', () => {
    expect(applyInterrogationAnswers(MULTI_TASK_DIRECTIVES, [])).toBe(MULTI_TASK_DIRECTIVES);
    expect(
      applyInterrogationAnswers(MULTI_TASK_DIRECTIVES, [{ id: 'pain', answer: '   ' }]),
    ).toBe(MULTI_TASK_DIRECTIVES);
    // Defensive: non-array input is tolerated.
    expect(
      applyInterrogationAnswers(MULTI_TASK_DIRECTIVES, undefined as unknown as never),
    ).toBe(MULTI_TASK_DIRECTIVES);
  });

  it('inserts the Refinements section inside the Goal block (before the first ---)', () => {
    const out = applyInterrogationAnswers(MULTI_TASK_DIRECTIVES, [
      { id: 'pain', answer: 'x' },
    ]);
    const lines = out.split('\n');
    const goalIdx = lines.findIndex((l) => l.startsWith('## Goal'));
    const refineIdx = lines.findIndex((l) => l.trim() === REFINEMENTS_MARKER);
    const firstSepAfterRefine = lines.findIndex(
      (l, i) => i > refineIdx && /^---\s*$/.test(l),
    );
    const firstTaskIdx = lines.findIndex((l) => l.startsWith('## Task 1'));

    expect(goalIdx).toBeGreaterThanOrEqual(0);
    expect(refineIdx).toBeGreaterThan(goalIdx);
    // The refinements land before the first task heading.
    expect(refineIdx).toBeLessThan(firstTaskIdx);
    expect(firstSepAfterRefine).toBeGreaterThan(refineIdx);
  });

  it('appends refinements when there is no Goal heading (still content-preserving)', () => {
    const src = 'Just a freeform note with no goal heading.';
    const out = applyInterrogationAnswers(src, [{ id: 'wedge', answer: 'narrow it down' }]);
    expect(out).toContain(src);
    expect(out).toContain(REFINEMENTS_MARKER);
    expect(out).toContain('narrow it down');
  });
});

// ─── contract ────────────────────────────────────────────────────────────────

describe('INTERROGATION_MESSAGE_KEYS contract', () => {
  it('exposes the five question keys plus intro + draft header', () => {
    expect(INTERROGATION_MESSAGE_KEYS).toContain('interrogate.q_pain');
    expect(INTERROGATION_MESSAGE_KEYS).toContain('interrogate.q_wedge');
    expect(INTERROGATION_MESSAGE_KEYS).toContain('interrogate.q_hidden');
    expect(INTERROGATION_MESSAGE_KEYS).toContain('interrogate.q_premise');
    expect(INTERROGATION_MESSAGE_KEYS).toContain('interrogate.q_effort');
    expect(INTERROGATION_MESSAGE_KEYS).toContain('interrogate.intro');
    expect(INTERROGATION_MESSAGE_KEYS).toContain('interrogate.draft_header');
  });

  it('every build question key is declared in the contract (no orphan keys)', () => {
    const qs: InterrogationQuestion[] = buildInterrogationQuestions(MULTI_TASK_DIRECTIVES);
    const declared = new Set<string>(INTERROGATION_MESSAGE_KEYS);
    for (const q of qs) expect(declared.has(q.messageKey)).toBe(true);
  });
});
