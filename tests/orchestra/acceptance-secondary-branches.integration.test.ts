import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const phaseSource = readFileSync(
  new URL('../../src/orchestra/sprint-phases.ts', import.meta.url),
  'utf8',
);

function section(start: string, end: string): string {
  const from = phaseSource.indexOf(start);
  const to = phaseSource.indexOf(end, from + start.length);
  expect(from, `missing phase-harness boundary: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing phase-harness boundary: ${end}`).toBeGreaterThan(from);
  return phaseSource.slice(from, to);
}

const prepareService = section(
  'export async function prepareResultEvaluationAttempt',
  '/** Finish the service transaction',
);
const completeService = section(
  'export function completeResultEvaluationAttempt',
  '/** Write error dashboard state',
);
const fixHarness = section(
  'const fixVerdicts = new Map',
  '// ─── Provider-Limit FIX Guard',
);

describe('secondary result branches use the production phase acceptance harness', () => {
  it('pins the five secondary branches to the same typed service contract', () => {
    const branches = [
      'extension',
      'alive-grace',
      'fix-ingest',
      'not-dispatched-redispatch',
      'postfix',
    ] as const;

    for (const branch of branches) {
      expect(phaseSource).toContain(`| '${branch}'`);
      expect(phaseSource).toMatch(
        branch === 'extension' || branch === 'alive-grace'
          ? new RegExp(`branch:\\s*'${branch}'`)
          : new RegExp(`[?:]\\s*'${branch}'`),
      );
    }

    // Extension and grace each own a call site; the three FIX-side branches
    // deliberately share one call site selected by its typed branch value.
    expect(phaseSource.match(/await prepareResultEvaluationAttempt\(/g)?.length)
      .toBe(4);
    expect(phaseSource.match(/completeResultEvaluationAttempt\(/g)?.length)
      .toBe(5);
  });

  it('one preparation service owns rubric/cache, enforcement, and the durable receipt digest', () => {
    expect(prepareService).toContain('readRuntimeBudgetEvaluationAuthority');
    expect(prepareService).toContain('safeRubricReconcile');
    expect(prepareService).toContain('evaluateWithRubric');
    expect(prepareService).toContain('applyAcceptanceEnforcement');
    expect(prepareService).toContain('persistDurableAcceptanceConfirmation');
    expect(prepareService.indexOf('readRuntimeBudgetEvaluationAuthority'))
      .toBeLessThan(prepareService.indexOf('applyAcceptanceEnforcement'));
    // The immutable audit writer is the single receipt/digest producer. No
    // secondary branch constructs or substitutes a receipt of its own.
    expect(completeService).toContain('writeTaskEvaluationAudit');
    expect(completeService).toContain('input.prepared.rubric');
    expect(completeService).toContain('input.prepared.postRubricCauses');
  });

  it('completion preserves exact attempt identity before publishing dependency-visible state', () => {
    expect(completeService).toContain('settleEvaluationWithRepairAuthority');
    expect(completeService).toContain('writeTaskEvaluationAudit');
    expect(completeService).toMatch(/attempt/i);
    expect(completeService.indexOf('settleEvaluationWithRepairAuthority'))
      .toBeLessThan(completeService.indexOf('writeTaskEvaluationAudit'));
    expect(fixHarness).toContain('await prepareResultEvaluationAttempt');
    expect(fixHarness).toContain('completeResultEvaluationAttempt');
    expect(fixHarness.indexOf('completeResultEvaluationAttempt'))
      .toBeLessThan(fixHarness.indexOf('fixVerdicts.set'));
  });

  it('has no secondary evaluator or cache-miss fallback', () => {
    expect(fixHarness).not.toContain('safeRubricReconcile');
    const afterFixIngress = phaseSource.slice(phaseSource.indexOf('const fixVerdicts = new Map'));
    expect(afterFixIngress).not.toMatch(/\?\?\s*await safeRubricReconcile/);
    expect(afterFixIngress.match(/missing service receipt — HOLD/g)).toHaveLength(3);
    for (const branch of [
      'extension',
      'alive-grace',
      'fix-ingest',
      'not-dispatched-redispatch',
      'postfix',
    ]) {
      expect(phaseSource).not.toMatch(
        new RegExp(`branch\\s*===?\\s*['"]${branch}['"][\\s\\S]{0,240}evaluateWithRubric`),
      );
    }
  });
});
