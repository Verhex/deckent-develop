import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordOutcome, readCellsSnapshot } from "../../src/core/routing/learning-cells.js";
import { BUILTIN_DOMAINS } from "../../src/core/routing/vocabulary-builtin.js";

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

// WIRE-029: physically merged from tests/orchestra/finalizer-cells-wire.test.ts.
{
/**
 * 673-002/007 wire pins (D1 catcher). The finalizer's V3 cells write now
 * (a) sources the domain from route-time `routingMeta.dominantDomain`,
 * (b) NEVER mints a fallback key, (c) lives outside the V2
 * `statsAlreadyRecorded` marker relying on learning-cells' own idempotency,
 * and (d) skips infra deaths. These pins exercise the ledger contract the
 * finalizer feeds — the exact drift class that let `core-runtime|*` keys
 * rot unread for 279 uses.
 */
describe('finalizer→learning-cells wire contract', () => {
    const root = () => {
        const r = mkdtempSync(join(tmpdir(), 'cells-wire-'));
        mkdirSync(join(r, '.deckent', 'stats'), { recursive: true });
        return r;
    };
    it('every written cell key carries a real vocabulary domain id (D1 catcher)', () => {
        const r = root();
        recordOutcome(r, { taskId: 't1', sprintId: 's1', workType: 'build',
            domain: 'core/runtime', agentId: 'implementer', verdict: 'DONE', quality: 80 });
        const file = readCellsSnapshot(r);
        const vocabularyIds = new Set(BUILTIN_DOMAINS.map((d) => d.id));
        const keys = Object.keys(file.cells);
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) {
            const domainPart = key.split('|')[1]!;
            expect(vocabularyIds.has(domainPart), `${key} domain must be a vocabulary id`).toBe(true);
        }
    });
    it('is idempotent per (taskId, sprintId) — a re-finalize cannot double-count', () => {
        const r = root();
        const input = { taskId: 't1', sprintId: 's1', workType: 'build' as const,
            domain: 'core/runtime', agentId: 'implementer', verdict: 'DONE' as const, quality: 80 };
        recordOutcome(r, input);
        recordOutcome(r, input);
        const cell = readCellsSnapshot(r).cells['build|core/runtime|implementer'];
        expect(cell?.uses).toBe(1);
    });
    it('skips infra-classified failures entirely — no penalty, no reward, visible counter', () => {
        const r = root();
        recordOutcome(r, { taskId: 't1', sprintId: 's1', workType: 'build',
            domain: 'core/runtime', agentId: 'implementer', verdict: 'NO_GO', quality: 0,
            failureClass: 'oom' });
        const file = readCellsSnapshot(r);
        expect(Object.keys(file.cells)).toEqual([]);
        expect(file.skippedInfraOutcomes).toBe(1);
    });
});
}
