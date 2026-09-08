import { describe, expect, it } from 'vitest';
import { formatPlannerEvidenceRefusal } from '../../src/cli/helpers/planner-evidence-presentation.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const CODES = [
  'PLANNER_EVIDENCE_HOLD',
  'PLANNER_EVIDENCE_REPLAN_REQUIRED',
  'EXACT_START_PLANNER_EVIDENCE_HOLD',
  'EXACT_START_PLANNER_EVIDENCE_REPLAN_REQUIRED',
] as const;

describe('formatPlannerEvidenceRefusal', () => {
  it.each(['en', 'tr'] as const)('renders every allowlisted code and safe action in %s', (lang) => {
    for (const code of CODES) {
      const rendered = formatPlannerEvidenceRefusal(
        Object.assign(new Error('RAW_SECRET_/private/path'), {
          code,
          cause: new Error('RAW_CAUSE'),
          stack: 'RAW_STACK',
        }),
        (key) => getMessage(key, lang),
      );

      expect(rendered).toContain(code);
      expect(rendered).not.toMatch(/RAW_SECRET|RAW_CAUSE|RAW_STACK|\/private\/path/);
      expect(rendered).not.toMatch(/retry|yeniden dene/i);
      expect(rendered).toMatch(/^[\x20-\x7EÇÖÜĞİŞçöüğış]+$/u);
      if (code.endsWith('REPLAN_REQUIRED')) {
        expect(rendered).toContain(getMessage('planner_evidence.next.replan', lang));
      } else {
        expect(rendered).toContain(getMessage('planner_evidence.next.inspect_evidence', lang));
      }
    }
  });

  it.each([
    null,
    17,
    { code: 'PLANNER_EVIDENCE_HOLD\u0000FORGED' },
    { code: 'UNKNOWN' },
    { code: 'constructor' },
    { code: 'toString' },
    { code: '__proto__' },
  ])(
    'returns null for non-scope input',
    (error) => {
      expect(formatPlannerEvidenceRefusal(error, (key) => key)).toBeNull();
    },
  );
});
