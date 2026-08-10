import { describe, it, expect } from 'vitest';
import { buildReplanProposal, extractReferencedPaths } from '../../src/orchestra/replan-proposal.js';
import { classifyFixFailure } from '../../src/orchestra/fix-failure-classification.js';
import type { TaskResult } from '../../src/core/task-types.js';

// An escalated failure used to park as a bare PAUSE plus a reason string, leaving
// the operator to reconstruct the situation by hand. These tests pin the record
// that replaces it — and pin the boundary it must never cross: naming a path is
// evidence, never a grant. `fix-repair-authority` refuses to let worker prose
// widen scope, and ADR-G-020 keeps write authority host-controlled; a re-plan
// that quietly added whatever a worker asked for would defeat both.

function makeResult(over: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 't-1',
    workerId: 'w-1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: '',
    ...over,
  } as TaskResult;
}

const SCOPE = {
  directories: ['docs/reference/'],
  filesRead: [],
  filesWrite: ['docs/reference/model-activation.md'],
};

describe('buildReplanProposal', () => {
  it('produces no proposal when the classification still allows a fix task', () => {
    const classification = classifyFixFailure({ result: makeResult({ notes: 'criteria not met' }) });
    expect(classification.allowsFixTask).toBe(true);
    expect(buildReplanProposal({ taskId: 't-1', classification, scope: SCOPE, result: makeResult() }))
      .toBeNull();
  });

  it('records the sprint-496 shape: needed source paths outside the reviewed scope', () => {
    const result = makeResult({
      notes: 'Bounded discovery inspected only docs/reference/. Command registration in '
        + 'src/cli/commands/models.ts and the store in src/core/model-activation-store.ts '
        + 'are outside the permitted read scope.',
    });
    const classification = classifyFixFailure({ result, taskDefinitionUnsatisfiable: true });
    const proposal = buildReplanProposal({ taskId: '496-001', classification, scope: SCOPE, result });

    expect(proposal).not.toBeNull();
    expect(proposal!.disposition).toBe('escalateReplan');
    expect(proposal!.requiresNewAuthority).toBe(true);
    const paths = proposal!.requestedPaths.map(p => p.path);
    expect(paths).toContain('src/cli/commands/models.ts');
    expect(paths).toContain('src/core/model-activation-store.ts');
    // Both sit outside the single reviewed directory, so both need a decision.
    expect(proposal!.requestedPaths.every(p => p.path.startsWith('src/') ? !p.alreadyReviewed : true))
      .toBe(true);
  });

  it('carries the current scope verbatim so the decision is made against real authority', () => {
    const result = makeResult({ notes: '[honest-gate] BOUNDARY_VIOLATION: wrote outside scope' });
    const classification = classifyFixFailure({ result });
    const proposal = buildReplanProposal({ taskId: 't-1', classification, scope: SCOPE, result });

    expect(proposal!.currentScope.directories).toEqual(['docs/reference/']);
    expect(proposal!.currentScope.filesWrite).toEqual(['docs/reference/model-activation.md']);
    expect(proposal!.disposition).toBe('reviseScope');
  });

  it('states that a named path is evidence and never a grant', () => {
    const result = makeResult({ notes: 'needed src/core/thing.ts' });
    const classification = classifyFixFailure({ result, taskDefinitionUnsatisfiable: true });
    const proposal = buildReplanProposal({ taskId: 't-1', classification, scope: SCOPE, result });
    // The proposal must never read as an approval.
    expect(proposal!.decisionRequired).toMatch(/decide/iu);
    expect(JSON.stringify(proposal)).not.toMatch(/granted|approved/iu);
  });

  it('treats a host attribution claim outside scope as a write request even when prose omits it', () => {
    const result = makeResult({
      notes: 'nothing unusual to report',
      workAttribution: {
        state: 'HOLD',
        attemptId: 'a-1',
        baselineRef: 'ref',
        scopeDigest: 'digest',
        claimedOutsideScope: ['src/elsewhere.ts'],
      },
    });
    const classification = classifyFixFailure({ result });
    const proposal = buildReplanProposal({ taskId: 't-1', classification, scope: SCOPE, result });

    const claimed = proposal!.requestedPaths.find(p => p.path === 'src/elsewhere.ts');
    expect(claimed).toBeDefined();
    expect(claimed!.access).toBe('write');
    expect(claimed!.alreadyReviewed).toBe(false);
  });

  it('marks a path already inside the reviewed directories as needing no new authority', () => {
    const result = makeResult({ notes: 'could not finish docs/reference/model-activation.md' });
    const classification = classifyFixFailure({ result, taskDefinitionUnsatisfiable: true });
    const proposal = buildReplanProposal({ taskId: 't-1', classification, scope: SCOPE, result });

    const known = proposal!.requestedPaths.find(p => p.path === 'docs/reference/model-activation.md');
    expect(known?.alreadyReviewed).toBe(true);
    expect(known?.access).toBe('write'); // it is a declared write target
    expect(proposal!.requiresNewAuthority).toBe(false);
  });
});

describe('extractReferencedPaths', () => {
  it('de-duplicates repeated mentions', () => {
    const result = makeResult({ notes: 'src/a.ts and again src/a.ts' });
    expect(extractReferencedPaths(result, SCOPE).filter(p => p.path === 'src/a.ts')).toHaveLength(1);
  });

  it('does not swallow a sentence-final period into the filename', () => {
    // sprint-503 recorded `src/core/run-status-read-model.ts.` and would have sent
    // an operator hunting for a file that does not exist.
    const result = makeResult({ notes: 'the consumer lives in src/core/run-status-read-model.ts.' });
    const paths = extractReferencedPaths(result, SCOPE).map(p => p.path);
    expect(paths).toContain('src/core/run-status-read-model.ts');
    expect(paths).not.toContain('src/core/run-status-read-model.ts.');
  });

  it('returns nothing when the notes name no repo path', () => {
    expect(extractReferencedPaths(makeResult({ notes: 'it just did not work' }), SCOPE)).toEqual([]);
  });
});
