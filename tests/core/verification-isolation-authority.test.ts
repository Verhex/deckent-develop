import { describe, expect, it } from 'vitest';

import {
  classifyVerificationObservation,
  decideVerificationIsolation,
  isVerificationIsolationHoldError,
  partitionVerificationObservations,
  VerificationIsolationHoldError,
  type VerificationIsolationDecision,
  type VerificationIsolationGrant,
  type VerificationIsolationRequest,
  type VerificationProjectGraph,
} from '../../src/core/verification-isolation-authority.js';

const TASK_ID = 'task-488-008';
const ATTEMPT_ID = 'attempt-78c6c855';
const GENERATION_ID = 'gen-0001';

function graph(ecosystem: string): VerificationProjectGraph {
  return {
    units: [
      { unitId: 'app', ecosystem, rootPath: 'app', ownedPaths: [], dependsOn: ['lib'] },
      { unitId: 'lib', ecosystem, rootPath: 'lib', ownedPaths: ['shared/lib.conf'], dependsOn: [] },
      { unitId: 'tools', ecosystem, rootPath: 'tools', ownedPaths: [], dependsOn: [] },
    ],
  };
}

function request(
  overrides: Partial<VerificationIsolationRequest> = {},
): VerificationIsolationRequest {
  return {
    taskId: TASK_ID,
    attemptId: ATTEMPT_ID,
    generationId: GENERATION_ID,
    consumer: 'worker-verify',
    allowedConsumers: ['worker-verify', 'evaluator', 'self-audit'],
    changedPaths: ['lib/core.rs'],
    generation: {
      generationId: GENERATION_ID,
      contentDigest: `sha256:${'a'.repeat(64)}`,
      immutable: true,
      materialization: 'immutable-snapshot',
    },
    projectGraph: graph('rust'),
    leases: [],
    ...overrides,
  };
}

function expectHold(decision: VerificationIsolationDecision, reasonCode: string): void {
  expect(decision.decision).toBe('hold');
  if (decision.decision !== 'hold') return;
  expect(decision.reasonCode).toBe(reasonCode);
  expect(decision.authorityEvidenceRefs.length).toBeGreaterThan(0);
  for (const ref of decision.authorityEvidenceRefs) {
    expect(ref).toMatch(/^verification-isolation:[0-9a-f]{64}$/);
  }
}

function grantOf(decision: VerificationIsolationDecision): VerificationIsolationGrant {
  if (decision.decision === 'hold') throw new Error(`expected grant, got hold:${decision.reasonCode}`);
  return decision;
}

describe('decideVerificationIsolation — grants', () => {
  it('grants an immutable snapshot bound to task, attempt and generation', () => {
    const decision = decideVerificationIsolation(request());
    expect(decision.decision).toBe('immutable-snapshot');

    const grant = grantOf(decision);
    expect(grant.binding).toEqual({
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      generationId: GENERATION_ID,
      contentDigest: `sha256:${'a'.repeat(64)}`,
      consumer: 'worker-verify',
    });
    // `app` depends on `lib`, so it is inside the reverse-impact closure.
    expect(grant.impactedUnitIds).toEqual(['app', 'lib']);
    expect(grant.verificationPaths).toEqual(['lib/core.rs']);
    expect(grant.allowedConsumers).toEqual(['evaluator', 'self-audit', 'worker-verify']);
    expect(grant.authorityEvidenceRef).toMatch(/^verification-isolation:[0-9a-f]{64}$/);
  });

  it('grants a scoped project graph only when every impacted unit holds an attempt lease', () => {
    const base = request({
      generation: {
        generationId: GENERATION_ID,
        contentDigest: `sha256:${'b'.repeat(64)}`,
        immutable: false,
        materialization: 'attempt-scoped-worktree',
      },
    });

    expectHold(decideVerificationIsolation(base), 'unit_isolation_lease_unavailable');

    const partial = decideVerificationIsolation({
      ...base,
      leases: [{ scope: { kind: 'project-unit', unitId: 'lib' }, attemptId: ATTEMPT_ID, generationId: GENERATION_ID }],
    });
    expectHold(partial, 'unit_isolation_lease_unavailable');

    const full = decideVerificationIsolation({
      ...base,
      leases: [
        { scope: { kind: 'project-unit', unitId: 'lib' }, attemptId: ATTEMPT_ID, generationId: GENERATION_ID },
        { scope: { kind: 'project-unit', unitId: 'app' }, attemptId: ATTEMPT_ID, generationId: GENERATION_ID },
      ],
    });
    expect(full.decision).toBe('scoped-project-graph');
    expect(grantOf(full).impactedUnitIds).toEqual(['app', 'lib']);
  });

  it('rejects a lease issued to a different attempt or generation', () => {
    const base = request({
      generation: {
        generationId: GENERATION_ID,
        contentDigest: `sha256:${'b'.repeat(64)}`,
        immutable: false,
        materialization: 'attempt-scoped-worktree',
      },
    });

    expectHold(decideVerificationIsolation({
      ...base,
      leases: [
        { scope: { kind: 'project-unit', unitId: 'lib' }, attemptId: 'attempt-other', generationId: GENERATION_ID },
        { scope: { kind: 'project-unit', unitId: 'app' }, attemptId: 'attempt-other', generationId: GENERATION_ID },
      ],
    }), 'unit_isolation_lease_unavailable');

    expectHold(decideVerificationIsolation({
      ...base,
      leases: [
        { scope: { kind: 'project-unit', unitId: 'lib' }, attemptId: ATTEMPT_ID, generationId: 'gen-9999' },
        { scope: { kind: 'project-unit', unitId: 'app' }, attemptId: ATTEMPT_ID, generationId: 'gen-9999' },
      ],
    }), 'unit_isolation_lease_unavailable');
  });

  it('attributes a path to its most specific owning unit', () => {
    const decision = decideVerificationIsolation(request({ changedPaths: ['shared/lib.conf'] }));
    expect(grantOf(decision).impactedUnitIds).toEqual(['app', 'lib']);
  });

  it('is deterministic across repeated calls and changed-path ordering', () => {
    const first = decideVerificationIsolation(request({ changedPaths: ['tools/x.py', 'lib/core.rs'] }));
    const second = decideVerificationIsolation(request({ changedPaths: ['lib/core.rs', 'tools/x.py', 'lib/core.rs'] }));
    expect(first).toEqual(second);
    expect(grantOf(first).verificationPaths).toEqual(['lib/core.rs', 'tools/x.py']);
    expect(grantOf(first).impactedUnitIds).toEqual(['app', 'lib', 'tools']);
  });
});

describe('decideVerificationIsolation — language neutrality', () => {
  it('produces byte-identical decisions for every ecosystem label', () => {
    const decisions = ['typescript', 'python', 'go', 'rust', 'cobol'].map(ecosystem =>
      decideVerificationIsolation(request({ projectGraph: graph(ecosystem) })));
    for (const decision of decisions) {
      expect(decision).toEqual(decisions[0]);
    }
  });

  it('holds identically for a non-TypeScript graph that fails a rule', () => {
    const py = decideVerificationIsolation(request({
      projectGraph: graph('python'),
      changedPaths: ['vendor/opaque.py'],
    }));
    const ts = decideVerificationIsolation(request({
      projectGraph: graph('typescript'),
      changedPaths: ['vendor/opaque.ts'],
    }));
    expectHold(py, 'unattributed_changed_path');
    expectHold(ts, 'unattributed_changed_path');
  });
});

describe('decideVerificationIsolation — fail-closed holds', () => {
  it('holds when the identity binding is incomplete', () => {
    expectHold(decideVerificationIsolation(request({ taskId: '  ' })), 'binding_incomplete');
    expectHold(decideVerificationIsolation(request({ attemptId: '' })), 'binding_incomplete');
    expectHold(decideVerificationIsolation(request({ generationId: '' })), 'binding_incomplete');
    expectHold(decideVerificationIsolation(request({
      generation: {
        generationId: GENERATION_ID,
        contentDigest: '',
        immutable: true,
        materialization: 'immutable-snapshot',
      },
    })), 'binding_incomplete');
  });

  it('holds when the generation does not bind the requested generation id', () => {
    expectHold(decideVerificationIsolation(request({
      generation: {
        generationId: 'gen-drifted',
        contentDigest: `sha256:${'a'.repeat(64)}`,
        immutable: true,
        materialization: 'immutable-snapshot',
      },
    })), 'generation_binding_mismatch');
  });

  it('holds when the consumer is not on the allowed list', () => {
    expectHold(
      decideVerificationIsolation(request({ consumer: 'self-audit', allowedConsumers: ['worker-verify'] })),
      'consumer_not_authorized',
    );
    expectHold(
      decideVerificationIsolation(request({ allowedConsumers: [] })),
      'consumer_not_authorized',
    );
  });

  it('rejects a repository-global lock outright', () => {
    expectHold(decideVerificationIsolation(request({
      leases: [{ scope: { kind: 'repository' }, attemptId: ATTEMPT_ID, generationId: GENERATION_ID }],
    })), 'repository_global_lock_rejected');
  });

  it('never treats a mutable HEAD as an isolation surface', () => {
    expectHold(decideVerificationIsolation(request({
      generation: {
        generationId: GENERATION_ID,
        contentDigest: `sha256:${'a'.repeat(64)}`,
        immutable: true,
        materialization: 'live-head',
      },
    })), 'mutable_head_authority');
  });

  it('holds when a snapshot claims immutability it does not have', () => {
    expectHold(decideVerificationIsolation(request({
      generation: {
        generationId: GENERATION_ID,
        contentDigest: `sha256:${'a'.repeat(64)}`,
        immutable: false,
        materialization: 'immutable-snapshot',
      },
    })), 'generation_not_immutable');
  });

  it('holds instead of falling open on an unknown materialization', () => {
    const decision = decideVerificationIsolation(request({
      generation: {
        generationId: GENERATION_ID,
        contentDigest: `sha256:${'a'.repeat(64)}`,
        immutable: true,
        // Simulates a future/foreign materialization reaching an older authority.
        materialization: 'kubernetes-ephemeral-volume' as never,
      },
    }));
    expectHold(decision, 'unknown_materialization_authority');
  });

  it('holds on missing, unnormalized or unattributable changed paths', () => {
    expectHold(decideVerificationIsolation(request({ changedPaths: [] })), 'changed_path_binding_unavailable');
    expectHold(decideVerificationIsolation(request({ changedPaths: ['/etc/passwd'] })), 'changed_path_not_normalized');
    expectHold(decideVerificationIsolation(request({ changedPaths: ['lib/../../escape'] })), 'changed_path_not_normalized');
    expectHold(decideVerificationIsolation(request({ changedPaths: ['C:/win/x'] })), 'changed_path_not_normalized');
    expectHold(decideVerificationIsolation(request({ changedPaths: ['lib\\core.rs'] })), 'changed_path_not_normalized');
    expectHold(decideVerificationIsolation(request({ changedPaths: ['nowhere/x'] })), 'unattributed_changed_path');
  });

  it('holds when no project graph authority exists', () => {
    expectHold(decideVerificationIsolation(request({ projectGraph: { units: [] } })), 'project_graph_unavailable');
  });
});

describe('ambient concurrency attribution', () => {
  const grant = grantOf(decideVerificationIsolation(request({ changedPaths: ['lib/core.rs'] })));

  it('attributes only observations bound to this attempt, generation and surface', () => {
    expect(classifyVerificationObservation(grant, {
      source: 'verify',
      errorCode: 'ASSERTION_FAILED',
      attemptId: ATTEMPT_ID,
      generationId: GENERATION_ID,
      paths: ['lib/core.rs'],
    })).toEqual({ attribution: 'attempt', attemptId: ATTEMPT_ID });
  });

  it('never classifies a concurrent attempt error as this task failure', () => {
    expect(classifyVerificationObservation(grant, {
      source: 'verify',
      errorCode: 'ASSERTION_FAILED',
      attemptId: 'attempt-concurrent',
      generationId: GENERATION_ID,
      paths: ['lib/core.rs'],
    })).toEqual({ attribution: 'ambient', reasonCode: 'foreign_attempt' });

    expect(classifyVerificationObservation(grant, {
      source: 'host',
      errorCode: 'ENOSPC',
      attemptId: null,
      generationId: GENERATION_ID,
      paths: ['lib/core.rs'],
    })).toEqual({ attribution: 'ambient', reasonCode: 'unbound_attempt' });

    expect(classifyVerificationObservation(grant, {
      source: 'verify',
      errorCode: 'ASSERTION_FAILED',
      attemptId: ATTEMPT_ID,
      generationId: 'gen-later',
      paths: ['lib/core.rs'],
    })).toEqual({ attribution: 'ambient', reasonCode: 'foreign_generation' });

    expect(classifyVerificationObservation(grant, {
      source: 'verify',
      errorCode: 'ASSERTION_FAILED',
      attemptId: ATTEMPT_ID,
      generationId: GENERATION_ID,
      paths: ['tools/other.py'],
    })).toEqual({ attribution: 'ambient', reasonCode: 'outside_verification_surface' });
  });

  it('partitions a mixed batch and reports sorted ambient reason codes', () => {
    const partition = partitionVerificationObservations(grant, [
      { source: 'verify', errorCode: 'A', attemptId: ATTEMPT_ID, generationId: GENERATION_ID, paths: ['lib/core.rs'] },
      { source: 'verify', errorCode: 'B', attemptId: 'attempt-other', generationId: GENERATION_ID, paths: ['lib/core.rs'] },
      { source: 'host', errorCode: 'C', attemptId: null, generationId: null, paths: [] },
      { source: 'verify', errorCode: 'D', attemptId: ATTEMPT_ID, generationId: GENERATION_ID, paths: ['tools/x.py'] },
    ]);

    expect(partition.attributed.map(o => o.errorCode)).toEqual(['A']);
    expect(partition.ambient.map(o => o.errorCode)).toEqual(['B', 'C', 'D']);
    expect(partition.ambientReasonCodes).toEqual([
      'foreign_attempt',
      'outside_verification_surface',
      'unbound_attempt',
    ]);
  });
});

describe('typed HOLD error', () => {
  it('classifies native and cross-realm-shaped hold errors', () => {
    expect(isVerificationIsolationHoldError(
      new VerificationIsolationHoldError('mutable_head_authority', ['verification-isolation:x'], TASK_ID, ATTEMPT_ID),
    )).toBe(true);
    expect(isVerificationIsolationHoldError({
      code: 'VERIFICATION_ISOLATION_AUTHORITY_HOLD',
      reasonCode: 'mutable_head_authority',
      authorityEvidenceRefs: ['verification-isolation:x'],
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
    })).toBe(true);
    expect(isVerificationIsolationHoldError({
      code: 'VERIFICATION_ISOLATION_AUTHORITY_HOLD',
      reasonCode: 'mutable_head_authority',
    })).toBe(false);
    expect(isVerificationIsolationHoldError(null)).toBe(false);
  });
});
