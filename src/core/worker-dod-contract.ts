// ═══ Worker Definition-of-Done Contract ════════════════════════════════════
// Shared objective self-assessment policy consumed by prompt compilation and
// WORKER-GUIDE generation. Keeping it here prevents documentation from
// re-introducing the retired percentage rubric.

function splitTopLevelCriteria(goCriteria: string): string[] {
  const items: string[] = [];
  let buffer = '';
  let depth = 0;
  for (const char of goCriteria) {
    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
      buffer += char;
    } else if (char === ')' || char === ']' || char === '}') {
      if (depth > 0) depth -= 1;
      buffer += char;
    } else if ((char === ';' || char === '\n') && depth === 0) {
      items.push(buffer);
      buffer = '';
    } else {
      buffer += char;
    }
  }
  if (buffer.length > 0) items.push(buffer);
  return items;
}

export function renderWorkerDodChecklist(goCriteria?: string): string {
  const items = splitTopLevelCriteria(goCriteria ?? '')
    .map((item) => item.trim().replace(/^[-*]\s*/, ''))
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    return 'Assess yourself honestly against the goCriteria above. "Code written" ≠ "DONE": core criteria met with a minor gap → GO_WITH_TECH_DEBT (name the gap); a critical criterion unmet → NO_GO (explain).';
  }

  const checklist = items.map((item) => `- [ ] ${item}`).join('\n');
  const count = items.length;
  return `Self-assessment rubric — "Code written" ≠ "DONE". Tick each Definition-of-Done item only when you verified it WITH EVIDENCE:
${checklist}
Verdict: all ${count}/${count} ticked → DONE | core items ticked, a minor item open → GO_WITH_TECH_DEBT (name the open item) | a critical item unticked → NO_GO (explain which and why).`;
}

export const WORKER_DOD_POLICY_SUMMARY = Object.freeze({
  done: 'Every Definition-of-Done item is verified with evidence.',
  techDebt: 'Core items are verified; each minor open item is named explicitly.',
  noGo: 'At least one critical item is unverified; the exact blocker is named.',
});
