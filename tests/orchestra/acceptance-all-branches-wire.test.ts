import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../src/orchestra/sprint-phases.ts', import.meta.url),
  'utf8',
);
const controllerSource = readFileSync(
  new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
  'utf8',
);

function bodyBetween(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('all result-bearing sprint branches share one acceptance service', () => {
  it.each([
    'main',
    'extension',
    'alive-grace',
    'fix-ingest',
    'not-dispatched-redispatch',
    'postfix',
  ] as const)('%s is a typed service branch', branch => {
    expect(source).toContain(`| '${branch}'`);
    if (branch === 'main' || branch === 'extension' || branch === 'alive-grace') {
      expect(source).toContain(`branch: '${branch}'`);
    } else {
      expect(source).toMatch(new RegExp(`[?:]\\s*'${branch}'`));
    }
  });

  it('owns rubric, runtime-budget authority, enforcement and confirmation in one preparation boundary', () => {
    const service = bodyBetween(
      'export async function prepareResultEvaluationAttempt',
      '/** Finish the service transaction',
    );
    expect(service).toContain('readRuntimeBudgetEvaluationAuthority');
    expect(service).toContain('safeRubricReconcile');
    expect(service).toContain('evaluateWithRubric');
    expect(service).toContain('applyAcceptanceEnforcement');
    expect(service).toContain('persistDurableAcceptanceConfirmation');
    expect(service.indexOf('readRuntimeBudgetEvaluationAuthority'))
      .toBeLessThan(service.indexOf('applyAcceptanceEnforcement'));
  });

  it('publishes the final repair-authorized verdict and audit receipt before returning', () => {
    const completion = bodyBetween(
      'export function completeResultEvaluationAttempt',
      '/** Write error dashboard state',
    );
    expect(completion).toContain('settleEvaluationWithRepairAuthority');
    expect(completion).toContain('writeTaskEvaluationAudit');
    expect(completion.indexOf('settleEvaluationWithRepairAuthority'))
      .toBeLessThan(completion.indexOf('writeTaskEvaluationAudit'));
  });

  it('FIX dependency ingress waits for the service result and cache misses HOLD instead of re-evaluating', () => {
    const fix = bodyBetween(
      'const fixVerdicts = new Map',
      '// ─── Provider-Limit FIX Guard',
    );
    expect(fix).toContain('await prepareResultEvaluationAttempt');
    expect(fix).toContain('completeResultEvaluationAttempt');
    expect(fix.indexOf('completeResultEvaluationAttempt'))
      .toBeLessThan(fix.indexOf('fixVerdicts.set'));
    expect(fix).not.toContain('safeRubricReconcile');

    const remainder = source.slice(source.indexOf('const fixVerdicts = new Map'));
    expect(remainder).not.toMatch(/\?\?\s*await safeRubricReconcile/);
    expect(remainder.match(/missing service receipt — HOLD/g)?.length).toBe(3);
  });

  it('controller-only result discovery settles through the same authority before handoff publication', () => {
    expect(controllerSource).toContain('const evaluateAndConsumeCollectedAttempt = async');
    expect(controllerSource).toContain('evaluateCollectedResult: evaluateAndConsumeCollectedAttempt');
    const sweep = bodyFromController(
      '// Results discovered outside the collector callback',
      '// Wire handoffs for completed tasks',
    );
    expect(sweep).toContain('await evaluateAndConsumeCollectedAttempt(task, result)');
    expect(controllerSource.indexOf('// Results discovered outside the collector callback'))
      .toBeLessThan(controllerSource.indexOf('// Wire handoffs for completed tasks'));
    expect(sweep).not.toContain('evaluateWithRubric');
    expect(sweep).not.toContain('selfAssessment');
  });
});

function bodyFromController(start: string, end: string): string {
  const from = controllerSource.indexOf(start);
  const to = controllerSource.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return controllerSource.slice(from, to);
}
