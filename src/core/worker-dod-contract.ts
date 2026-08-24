// ═══ Worker Definition-of-Done Contract ════════════════════════════════════
// Shared objective self-assessment policy consumed by prompt compilation and
// WORKER-GUIDE generation. Keeping it here prevents documentation from
// re-introducing the retired percentage rubric.

import type { GoNoGoCriterionItem } from './task-types.js';

export function renderWorkerDodChecklist(
  criteria: readonly GoNoGoCriterionItem[] | string = [],
): string {
  // Legacy display text is accepted only for caller compatibility and never parsed.
  const items = typeof criteria === 'string' ? [] : criteria;

  if (items.length === 0) {
    return 'Assess yourself honestly against structured goCriteria. Missing structured authority cannot be inferred from prose; report NO_GO when required evidence is unavailable.';
  }

  const checklist = items.map(item => {
    const disposition = item.polarity === 'go'
      ? 'required condition; DONE expects outcome=MET'
      : 'forbidden condition; DONE expects outcome=UNMET';
    return `- [ ] [${item.id}] ${item.statement}\n  polarity: ${item.polarity}; ${disposition}\n  evidence: <explicit evidence for ${item.id}>`;
  }).join('\n');
  const count = items.length;
  return `Self-assessment rubric — "Code written" ≠ "DONE". Tick each criterion only when its polarity-specific safe outcome is verified WITH EVIDENCE:
${checklist}
Outcome semantics are statement truth, not success labels: GO + MET is closed; NO-GO + UNMET is closed. A NO-GO criterion marked MET means the forbidden condition occurred and BLOCKS DONE.
Verdict: all ${count}/${count} polarity-specific outcomes closed → DONE | GO_WITH_TECH_DEBT requires exact open criterion IDs | a critical item open → NO_GO (explain which ID and why).`;
}

export const WORKER_DOD_POLICY_SUMMARY = Object.freeze({
  done: 'Every Definition-of-Done item is verified with evidence.',
  techDebt: 'Core items are verified; exact structured criterion IDs name every open item.',
  noGo: 'At least one critical item is unverified; the exact blocker is named.',
});
