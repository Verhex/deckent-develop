/**
 * Provider- and language-neutral production-wiring authority contract.
 *
 * This module is intentionally pure. It records declared topology and resolves
 * bounded evidence; verifier adapters and orchestration settlement live in
 * downstream layers. Presence in source, tests, or an import graph is never
 * promoted to executed production wiring here.
 */

export const PRODUCTION_WIRING_CONTRACT_VERSION = 1 as const;

export type ProductionWiringChangeKind =
  | 'runtime-addition'
  | 'runtime-change'
  | 'refactor'
  | 'removal'
  | 'foundation'
  | 'public-library'
  | 'documentation'
  | 'data';

export type CompleteEvidenceBasis =
  | 'authority-record'
  | 'executed-production-path'
  | 'host-attested-execution';

export type PresenceOnlyEvidenceBasis =
  | 'code-presence'
  | 'test-presence'
  | 'static-reachability'
  | 'import-count';

export type ProductionWiringEvidence =
  | {
      readonly state: 'complete';
      readonly basis: CompleteEvidenceBasis;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly state: 'presence-only';
      readonly basis: PresenceOnlyEvidenceBasis;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly state: 'incomplete';
      readonly reasonCode: 'absent' | 'unresolved' | 'not-executed';
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly state: 'unsupported';
      readonly reasonCode:
        | 'adapter-unavailable'
        | 'capability-unavailable'
        | 'environment-unavailable';
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly state: 'contradictory';
      readonly reasonCode:
        | 'authority-conflict'
        | 'identity-conflict'
        | 'observation-conflict';
      readonly evidenceRefs: readonly string[];
    };

export interface ProductionWiringProducer {
  readonly producerId: string;
  readonly evidence: ProductionWiringEvidence;
}

export interface ProductionWiringCanonicalConsumer {
  readonly consumerId: string;
  readonly relationship: 'invokes-producer' | 'removed-or-migrated';
  readonly evidence: ProductionWiringEvidence;
}

export interface ProductionWiringIngress {
  readonly ingressId: string;
  readonly kind: 'ingress' | 'entrypoint';
  readonly evidence: ProductionWiringEvidence;
}

export interface ProductionWiringEnablementAuthority {
  readonly authorityId: string;
  readonly mechanism: 'configuration' | 'policy' | 'registration' | 'unconditional';
  readonly evidence: ProductionWiringEvidence;
}

export interface ProductionWiringProofTarget {
  readonly proofTargetId: string;
  readonly kind:
    | 'consumer-execution'
    | 'ingress-execution'
    | 'enablement-resolution'
    | 'removal-verification'
    | 'platform'
    | 'scale';
  readonly evidence: ProductionWiringEvidence;
}

export interface ProductionWiringDisposition {
  readonly kind: 'production-wiring';
}

export interface StagedFoundationClosureTask {
  readonly taskId: string;
  readonly dagId: string;
}

export interface StagedFoundationDisposition {
  readonly kind: 'staged-foundation';
  readonly foundationTaskId: string;
  readonly dagId: string;
  readonly closureTasks: readonly StagedFoundationClosureTask[];
  readonly outerSettlementBarrier: {
    readonly kind: 'block-until-exact-closure-settles';
    readonly dagId: string;
    readonly closureTaskIds: readonly string[];
  };
}

export interface ProductionWiringContractV1 {
  readonly version: typeof PRODUCTION_WIRING_CONTRACT_VERSION;
  readonly changeKind: ProductionWiringChangeKind;
  readonly producer: ProductionWiringProducer;
  readonly canonicalConsumer: ProductionWiringCanonicalConsumer;
  readonly affectedIngresses: readonly ProductionWiringIngress[];
  readonly enablementAuthority: ProductionWiringEnablementAuthority;
  readonly disposition: ProductionWiringDisposition | StagedFoundationDisposition;
  readonly proofTargets: readonly ProductionWiringProofTarget[];
}

export type ProductionWiringContract = ProductionWiringContractV1;

export type ProductionWiringIssueTarget =
  | 'contract'
  | 'producer'
  | 'canonical-consumer'
  | 'affected-ingress'
  | 'enablement-authority'
  | 'disposition'
  | 'proof-target';

export type ProductionWiringIssueReason =
  | 'unsupported-contract-version'
  | 'missing-identity'
  | 'missing-affected-ingress'
  | 'missing-proof-target'
  | 'missing-evidence-reference'
  | 'presence-only-evidence'
  | 'proof-target-not-executed'
  | 'evidence-incomplete'
  | 'evidence-unsupported'
  | 'evidence-contradictory'
  | 'foundation-disposition-required'
  | 'foundation-change-kind-required'
  | 'missing-closure-task'
  | 'duplicate-closure-task'
  | 'closure-task-dag-conflict'
  | 'closure-barrier-dag-conflict'
  | 'closure-barrier-task-conflict'
  | 'foundation-self-closure';

export interface ProductionWiringIssue {
  readonly target: ProductionWiringIssueTarget;
  readonly targetId: string | null;
  readonly reasonCode: ProductionWiringIssueReason;
  readonly evidenceRefs: readonly string[];
}

export type ProductionWiringDecision =
  | {
      readonly version: typeof PRODUCTION_WIRING_CONTRACT_VERSION;
      readonly decision: 'complete';
      readonly disposition: 'production-wired';
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly version: typeof PRODUCTION_WIRING_CONTRACT_VERSION;
      readonly decision: 'staged-foundation';
      readonly disposition: 'staged-foundation';
      readonly dagId: string;
      readonly foundationTaskId: string;
      readonly closureTaskIds: readonly string[];
      readonly outerSettlement: 'blocked-pending-exact-closure';
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly version: typeof PRODUCTION_WIRING_CONTRACT_VERSION;
      readonly decision: 'incomplete' | 'unsupported' | 'contradictory';
      readonly disposition: 'hold';
      readonly outerSettlement: 'blocked';
      readonly issues: readonly ProductionWiringIssue[];
    };

function issue(
  target: ProductionWiringIssueTarget,
  targetId: string | null,
  reasonCode: ProductionWiringIssueReason,
  evidenceRefs: readonly string[] = [],
): ProductionWiringIssue {
  return { target, targetId, reasonCode, evidenceRefs };
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function evidenceIssues(
  target: ProductionWiringIssueTarget,
  targetId: string,
  evidence: ProductionWiringEvidence,
  requiresExecution: boolean,
): ProductionWiringIssue[] {
  if (isBlank(targetId)) {
    return [issue(target, null, 'missing-identity', evidence.evidenceRefs)];
  }

  switch (evidence.state) {
    case 'complete': {
      if (evidence.evidenceRefs.length === 0 || evidence.evidenceRefs.some(isBlank)) {
        return [issue(target, targetId, 'missing-evidence-reference', evidence.evidenceRefs)];
      }
      if (
        requiresExecution
        && evidence.basis !== 'executed-production-path'
        && evidence.basis !== 'host-attested-execution'
      ) {
        return [issue(target, targetId, 'proof-target-not-executed', evidence.evidenceRefs)];
      }
      return [];
    }
    case 'presence-only':
      return [issue(target, targetId, 'presence-only-evidence', evidence.evidenceRefs)];
    case 'incomplete':
      return [issue(target, targetId, 'evidence-incomplete', evidence.evidenceRefs)];
    case 'unsupported':
      return [issue(target, targetId, 'evidence-unsupported', evidence.evidenceRefs)];
    case 'contradictory':
      return [issue(target, targetId, 'evidence-contradictory', evidence.evidenceRefs)];
  }
}

function collectEvidenceRefs(contract: ProductionWiringContractV1): string[] {
  const refs = [
    ...contract.producer.evidence.evidenceRefs,
    ...contract.canonicalConsumer.evidence.evidenceRefs,
    ...contract.affectedIngresses.flatMap(ingress => ingress.evidence.evidenceRefs),
    ...contract.enablementAuthority.evidence.evidenceRefs,
    ...contract.proofTargets.flatMap(target => target.evidence.evidenceRefs),
  ];
  return [...new Set(refs.filter(ref => !isBlank(ref)))];
}

function stagedDispositionIssues(
  contract: ProductionWiringContractV1,
  disposition: StagedFoundationDisposition,
): ProductionWiringIssue[] {
  const issues: ProductionWiringIssue[] = [];
  if (contract.changeKind !== 'foundation') {
    issues.push(issue('disposition', disposition.foundationTaskId, 'foundation-change-kind-required'));
  }
  if (isBlank(disposition.foundationTaskId) || isBlank(disposition.dagId)) {
    issues.push(issue('disposition', null, 'missing-identity'));
  }
  if (disposition.closureTasks.length === 0) {
    issues.push(issue('disposition', disposition.foundationTaskId, 'missing-closure-task'));
  }

  const taskIds = disposition.closureTasks.map(task => task.taskId);
  if (taskIds.some(isBlank) || disposition.closureTasks.some(task => isBlank(task.dagId))) {
    issues.push(issue('disposition', disposition.foundationTaskId, 'missing-identity'));
  }
  if (new Set(taskIds).size !== taskIds.length) {
    issues.push(issue('disposition', disposition.foundationTaskId, 'duplicate-closure-task'));
  }
  if (taskIds.includes(disposition.foundationTaskId)) {
    issues.push(issue('disposition', disposition.foundationTaskId, 'foundation-self-closure'));
  }
  if (disposition.closureTasks.some(task => task.dagId !== disposition.dagId)) {
    issues.push(issue('disposition', disposition.foundationTaskId, 'closure-task-dag-conflict'));
  }

  const barrier = disposition.outerSettlementBarrier;
  if (barrier.dagId !== disposition.dagId) {
    issues.push(issue('disposition', disposition.foundationTaskId, 'closure-barrier-dag-conflict'));
  }
  const barrierIds = barrier.closureTaskIds;
  const exactClosureSet = taskIds.length === barrierIds.length
    && new Set(taskIds).size === taskIds.length
    && new Set(barrierIds).size === barrierIds.length
    && taskIds.every(taskId => barrierIds.includes(taskId));
  if (!exactClosureSet) {
    issues.push(issue('disposition', disposition.foundationTaskId, 'closure-barrier-task-conflict'));
  }
  return issues;
}

function classifyDecision(issues: readonly ProductionWiringIssue[]): 'incomplete' | 'unsupported' | 'contradictory' {
  const contradictoryReasons: ReadonlySet<ProductionWiringIssueReason> = new Set([
    'evidence-contradictory',
    'foundation-disposition-required',
    'foundation-change-kind-required',
    'duplicate-closure-task',
    'closure-task-dag-conflict',
    'closure-barrier-dag-conflict',
    'closure-barrier-task-conflict',
    'foundation-self-closure',
  ]);
  if (issues.some(candidate => contradictoryReasons.has(candidate.reasonCode))) return 'contradictory';
  if (issues.some(candidate => candidate.reasonCode === 'unsupported-contract-version'
    || candidate.reasonCode === 'evidence-unsupported')) return 'unsupported';
  return 'incomplete';
}

/**
 * Resolve one immutable wiring declaration against its bounded evidence.
 * Contradiction outranks unsupported evidence, which outranks incompleteness.
 * A valid staged foundation remains blocked at the outer settlement boundary.
 */
export function resolveProductionWiringContract(
  contract: ProductionWiringContractV1,
): ProductionWiringDecision {
  const issues: ProductionWiringIssue[] = [];

  if (contract.version !== PRODUCTION_WIRING_CONTRACT_VERSION) {
    issues.push(issue('contract', null, 'unsupported-contract-version'));
  }
  issues.push(...evidenceIssues(
    'producer',
    contract.producer.producerId,
    contract.producer.evidence,
    false,
  ));
  issues.push(...evidenceIssues(
    'canonical-consumer',
    contract.canonicalConsumer.consumerId,
    contract.canonicalConsumer.evidence,
    false,
  ));

  if (contract.affectedIngresses.length === 0) {
    issues.push(issue('affected-ingress', null, 'missing-affected-ingress'));
  }
  for (const ingress of contract.affectedIngresses) {
    issues.push(...evidenceIssues(
      'affected-ingress',
      ingress.ingressId,
      ingress.evidence,
      false,
    ));
  }

  issues.push(...evidenceIssues(
    'enablement-authority',
    contract.enablementAuthority.authorityId,
    contract.enablementAuthority.evidence,
    false,
  ));

  if (contract.proofTargets.length === 0) {
    issues.push(issue('proof-target', null, 'missing-proof-target'));
  }
  for (const proofTarget of contract.proofTargets) {
    issues.push(...evidenceIssues(
      'proof-target',
      proofTarget.proofTargetId,
      proofTarget.evidence,
      true,
    ));
  }

  if (contract.disposition.kind === 'staged-foundation') {
    issues.push(...stagedDispositionIssues(contract, contract.disposition));
  } else if (contract.changeKind === 'foundation') {
    issues.push(issue('disposition', null, 'foundation-disposition-required'));
  }

  if (issues.length > 0) {
    return {
      version: PRODUCTION_WIRING_CONTRACT_VERSION,
      decision: classifyDecision(issues),
      disposition: 'hold',
      outerSettlement: 'blocked',
      issues,
    };
  }

  const evidenceRefs = collectEvidenceRefs(contract);
  if (contract.disposition.kind === 'staged-foundation') {
    return {
      version: PRODUCTION_WIRING_CONTRACT_VERSION,
      decision: 'staged-foundation',
      disposition: 'staged-foundation',
      dagId: contract.disposition.dagId,
      foundationTaskId: contract.disposition.foundationTaskId,
      closureTaskIds: contract.disposition.closureTasks.map(task => task.taskId),
      outerSettlement: 'blocked-pending-exact-closure',
      evidenceRefs,
    };
  }
  return {
    version: PRODUCTION_WIRING_CONTRACT_VERSION,
    decision: 'complete',
    disposition: 'production-wired',
    evidenceRefs,
  };
}
