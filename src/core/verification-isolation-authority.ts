import { createHash } from 'node:crypto';

/**
 * Verification isolation authority.
 *
 * A verification run may only observe the repository through an isolation
 * surface that is bound to one exact `(taskId, attemptId, generationId)` triple.
 * This module is the single decision point for that surface. It is deliberately
 * language-neutral: the project graph carries an opaque `ecosystem` label that
 * the decision never reads, so a Python, Go or Rust workspace resolves through
 * exactly the same rules — and produces the same evidence ref — as any other.
 *
 * Three non-negotiable properties, enforced by construction rather than by
 * convention:
 *
 * - **No mutable HEAD authority.** A live working tree is never an isolation
 *   surface; it resolves to a typed HOLD.
 * - **No repository-global lock.** Isolation leases are scoped to project units.
 *   A repository-scoped lease is rejected outright.
 * - **No fail-open fallback.** Every branch either returns an explicitly granted
 *   surface or a typed HOLD; there is no default-allow path and no shape of
 *   missing authority that widens access.
 */

/** Verification surfaces that may consume an isolation grant. */
export type VerificationConsumer = 'worker-verify' | 'evaluator' | 'self-audit';

/** How the repository generation is materialized for the verification run. */
export type VerificationMaterialization =
  | 'immutable-snapshot'
  | 'attempt-scoped-worktree'
  | 'live-head';

/**
 * A content-addressed repository generation. `generationId` is the durable
 * identity the grant binds to; `contentDigest` is the host-observed content
 * fingerprint of that generation.
 */
export interface VerificationRepositoryGeneration {
  readonly generationId: string;
  readonly contentDigest: string;
  /** True only when the generation cannot change for the life of the grant. */
  readonly immutable: boolean;
  readonly materialization: VerificationMaterialization;
}

/**
 * One unit of the language-neutral project graph. `ecosystem` is an opaque
 * label for reporting only — no decision in this module branches on it.
 */
export interface VerificationProjectUnit {
  readonly unitId: string;
  readonly ecosystem: string;
  /** Repository-relative root of the unit, `''` for the repository root unit. */
  readonly rootPath: string;
  /** Extra repository-relative paths owned by the unit outside its root. */
  readonly ownedPaths: readonly string[];
  /** Unit ids this unit consumes; used to compute the reverse impact closure. */
  readonly dependsOn: readonly string[];
}

export interface VerificationProjectGraph {
  readonly units: readonly VerificationProjectUnit[];
}

export type VerificationLeaseScope =
  | { readonly kind: 'project-unit'; readonly unitId: string }
  | { readonly kind: 'repository' };

/** An attempt-scoped isolation lease over part of the project graph. */
export interface VerificationIsolationLease {
  readonly scope: VerificationLeaseScope;
  readonly attemptId: string;
  readonly generationId: string;
}

export interface VerificationIsolationRequest {
  readonly taskId: string;
  readonly attemptId: string;
  readonly generationId: string;
  readonly consumer: VerificationConsumer;
  readonly allowedConsumers: readonly VerificationConsumer[];
  /** Repository-relative paths attributed to this attempt. */
  readonly changedPaths: readonly string[];
  readonly generation: VerificationRepositoryGeneration;
  readonly projectGraph: VerificationProjectGraph;
  readonly leases: readonly VerificationIsolationLease[];
}

/** The exact identity a granted verification surface is bound to. */
export interface VerificationIsolationBinding {
  readonly taskId: string;
  readonly attemptId: string;
  readonly generationId: string;
  readonly contentDigest: string;
  readonly consumer: VerificationConsumer;
}

export interface VerificationIsolationGrant {
  readonly binding: VerificationIsolationBinding;
  /** Impact closure: units owning a changed path plus their reverse dependents. */
  readonly impactedUnitIds: readonly string[];
  /** Sorted, de-duplicated repository-relative paths the grant covers. */
  readonly verificationPaths: readonly string[];
  readonly allowedConsumers: readonly VerificationConsumer[];
  readonly authorityEvidenceRef: string;
}

export type VerificationIsolationHoldReason =
  | 'binding_incomplete'
  | 'generation_binding_mismatch'
  | 'consumer_not_authorized'
  | 'repository_global_lock_rejected'
  | 'changed_path_binding_unavailable'
  | 'changed_path_not_normalized'
  | 'project_graph_unavailable'
  | 'unattributed_changed_path'
  | 'mutable_head_authority'
  | 'generation_not_immutable'
  | 'unit_isolation_lease_unavailable'
  | 'unknown_materialization_authority';

export type VerificationIsolationDecision =
  | ({ readonly decision: 'immutable-snapshot' } & VerificationIsolationGrant)
  | ({ readonly decision: 'scoped-project-graph' } & VerificationIsolationGrant)
  | {
      readonly decision: 'hold';
      readonly reasonCode: VerificationIsolationHoldReason;
      readonly authorityEvidenceRefs: readonly string[];
    };

export class VerificationIsolationHoldError extends Error {
  readonly code = 'VERIFICATION_ISOLATION_AUTHORITY_HOLD';

  constructor(
    readonly reasonCode: VerificationIsolationHoldReason,
    readonly authorityEvidenceRefs: readonly string[],
    readonly taskId: string,
    readonly attemptId: string,
  ) {
    super(`VERIFICATION_ISOLATION_AUTHORITY_HOLD:${reasonCode}`);
    this.name = 'VerificationIsolationHoldError';
  }
}

/**
 * Cross-realm/worktree-safe classifier for the typed isolation HOLD.
 * `instanceof` alone is not stable when ESM test graphs or linked worktrees
 * load more than one copy of this module.
 */
export function isVerificationIsolationHoldError(
  value: unknown,
): value is VerificationIsolationHoldError {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record['code'] === 'VERIFICATION_ISOLATION_AUTHORITY_HOLD'
    && typeof record['reasonCode'] === 'string'
    && Array.isArray(record['authorityEvidenceRefs'])
    && typeof record['taskId'] === 'string'
    && typeof record['attemptId'] === 'string';
}

function isBoundIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Repository-relative, traversal-free path check. Absolute paths, drive-letter
 * paths, backslash separators and `..` segments are all rejected: a verification
 * surface that cannot state its own extent is not a surface.
 */
function isNormalizedRepoPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

function isWithin(parent: string, candidate: string): boolean {
  if (parent === '') return true;
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

/**
 * Most-specific owner of a repository-relative path: an explicit `ownedPaths`
 * entry wins over a root prefix, and the longest matching prefix wins overall.
 * Ties are broken by `unitId` so the decision stays deterministic.
 */
function resolveOwningUnit(
  graph: VerificationProjectGraph,
  path: string,
): VerificationProjectUnit | undefined {
  let best: VerificationProjectUnit | undefined;
  let bestLength = -1;
  for (const unit of graph.units) {
    let matchLength = -1;
    for (const owned of unit.ownedPaths) {
      if (isNormalizedRepoPath(owned) && isWithin(owned, path)) {
        matchLength = Math.max(matchLength, owned.length + 1);
      }
    }
    if ((unit.rootPath === '' || isNormalizedRepoPath(unit.rootPath)) && isWithin(unit.rootPath, path)) {
      matchLength = Math.max(matchLength, unit.rootPath.length);
    }
    if (matchLength < 0) continue;
    if (matchLength > bestLength || (matchLength === bestLength && best !== undefined && unit.unitId < best.unitId)) {
      best = unit;
      bestLength = matchLength;
    }
  }
  return best;
}

/**
 * Reverse-dependency closure over the project graph. A changed unit impacts
 * every unit that transitively depends on it. Pure graph traversal — no build
 * system, no language, no toolchain is consulted.
 */
function resolveImpactClosure(
  graph: VerificationProjectGraph,
  seedUnitIds: readonly string[],
): string[] {
  const dependents = new Map<string, string[]>();
  for (const unit of graph.units) {
    for (const dependency of unit.dependsOn) {
      const existing = dependents.get(dependency);
      if (existing) existing.push(unit.unitId);
      else dependents.set(dependency, [unit.unitId]);
    }
  }

  const closure = new Set<string>();
  const queue = [...seedUnitIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (closure.has(current)) continue;
    closure.add(current);
    for (const dependent of dependents.get(current) ?? []) {
      if (!closure.has(dependent)) queue.push(dependent);
    }
  }
  return [...closure].sort((a, b) => a.localeCompare(b));
}

function isolationEvidenceRef(
  request: VerificationIsolationRequest,
  outcome: string,
  detail: Readonly<Record<string, unknown>>,
): string {
  return `verification-isolation:${createHash('sha256')
    .update(JSON.stringify({
      outcome,
      taskId: request.taskId,
      attemptId: request.attemptId,
      generationId: request.generationId,
      contentDigest: request.generation?.contentDigest ?? null,
      materialization: request.generation?.materialization ?? null,
      consumer: request.consumer,
      allowedConsumers: [...request.allowedConsumers].sort(),
      changedPaths: [...new Set(request.changedPaths)].sort(),
      detail,
    }))
    .digest('hex')}`;
}

function hold(
  request: VerificationIsolationRequest,
  reasonCode: VerificationIsolationHoldReason,
  detail: Readonly<Record<string, unknown>> = {},
): VerificationIsolationDecision {
  return {
    decision: 'hold',
    reasonCode,
    authorityEvidenceRefs: Object.freeze([
      isolationEvidenceRef(request, `hold:${reasonCode}`, detail),
    ]),
  };
}

/**
 * Decide the verification isolation surface for one attempt.
 *
 * Returns an `immutable-snapshot` grant, a `scoped-project-graph` grant, or a
 * typed HOLD. There is no fallback branch: any missing, ambiguous or
 * repository-global authority resolves to HOLD.
 */
export function decideVerificationIsolation(
  request: VerificationIsolationRequest,
): VerificationIsolationDecision {
  if (
    !isBoundIdentifier(request.taskId)
    || !isBoundIdentifier(request.attemptId)
    || !isBoundIdentifier(request.generationId)
    || !request.generation
    || !isBoundIdentifier(request.generation.generationId)
    || !isBoundIdentifier(request.generation.contentDigest)
  ) {
    return hold(request, 'binding_incomplete');
  }

  if (request.generation.generationId !== request.generationId) {
    return hold(request, 'generation_binding_mismatch', {
      generationId: request.generation.generationId,
    });
  }

  if (
    request.allowedConsumers.length === 0
    || !request.allowedConsumers.includes(request.consumer)
  ) {
    return hold(request, 'consumer_not_authorized', { consumer: request.consumer });
  }

  // A repository-global lock is never a valid isolation authority: it would make
  // every concurrent attempt observable to — and blockable by — this one.
  if (request.leases.some(lease => lease.scope.kind === 'repository')) {
    return hold(request, 'repository_global_lock_rejected');
  }

  const changedPaths = [...new Set(request.changedPaths)].sort((a, b) => a.localeCompare(b));
  if (changedPaths.length === 0) {
    return hold(request, 'changed_path_binding_unavailable');
  }
  const invalidPath = changedPaths.find(path => !isNormalizedRepoPath(path));
  if (invalidPath !== undefined) {
    return hold(request, 'changed_path_not_normalized', { path: invalidPath });
  }

  if (!request.projectGraph || request.projectGraph.units.length === 0) {
    return hold(request, 'project_graph_unavailable');
  }

  const seedUnitIds: string[] = [];
  for (const path of changedPaths) {
    const owner = resolveOwningUnit(request.projectGraph, path);
    if (!owner || !isBoundIdentifier(owner.unitId)) {
      return hold(request, 'unattributed_changed_path', { path });
    }
    seedUnitIds.push(owner.unitId);
  }
  const impactedUnitIds = resolveImpactClosure(request.projectGraph, seedUnitIds);

  const binding: VerificationIsolationBinding = Object.freeze({
    taskId: request.taskId,
    attemptId: request.attemptId,
    generationId: request.generationId,
    contentDigest: request.generation.contentDigest,
    consumer: request.consumer,
  });
  const allowedConsumers = Object.freeze(
    [...new Set(request.allowedConsumers)].sort((a, b) => a.localeCompare(b)),
  );

  switch (request.generation.materialization) {
    case 'live-head':
      // A mutable working tree can change under the verifier mid-run; it is never
      // an isolation surface, regardless of how the caller labels it.
      return hold(request, 'mutable_head_authority');

    case 'immutable-snapshot': {
      if (!request.generation.immutable) {
        return hold(request, 'generation_not_immutable');
      }
      return {
        decision: 'immutable-snapshot',
        binding,
        impactedUnitIds: Object.freeze(impactedUnitIds),
        verificationPaths: Object.freeze(changedPaths),
        allowedConsumers,
        authorityEvidenceRef: isolationEvidenceRef(request, 'grant:immutable-snapshot', {
          impactedUnitIds,
        }),
      };
    }

    case 'attempt-scoped-worktree': {
      const leasedUnitIds = new Set(
        request.leases
          .filter(lease =>
            lease.scope.kind === 'project-unit'
            && lease.attemptId === request.attemptId
            && lease.generationId === request.generationId)
          .map(lease => (lease.scope as { readonly unitId: string }).unitId),
      );
      const unleased = impactedUnitIds.find(unitId => !leasedUnitIds.has(unitId));
      if (unleased !== undefined) {
        return hold(request, 'unit_isolation_lease_unavailable', { unitId: unleased });
      }
      return {
        decision: 'scoped-project-graph',
        binding,
        impactedUnitIds: Object.freeze(impactedUnitIds),
        verificationPaths: Object.freeze(changedPaths),
        allowedConsumers,
        authorityEvidenceRef: isolationEvidenceRef(request, 'grant:scoped-project-graph', {
          impactedUnitIds,
        }),
      };
    }

    default:
      // Unknown materialization is an authority gap, not a permission.
      return hold(request, 'unknown_materialization_authority');
  }
}

/** An error observed while a verification run was in flight. */
export interface VerificationObservation {
  readonly source: string;
  readonly errorCode: string;
  /** Attempt the observation is bound to, or `null` when unattributed. */
  readonly attemptId: string | null;
  /** Generation the observation was produced against, or `null` when unknown. */
  readonly generationId: string | null;
  /** Repository-relative paths the observation names. */
  readonly paths: readonly string[];
}

export type VerificationObservationAmbientReason =
  | 'foreign_attempt'
  | 'unbound_attempt'
  | 'foreign_generation'
  | 'outside_verification_surface';

export type VerificationObservationAttribution =
  | { readonly attribution: 'attempt'; readonly attemptId: string }
  | {
      readonly attribution: 'ambient';
      readonly reasonCode: VerificationObservationAmbientReason;
    };

/**
 * Attribute one in-flight observation to the current attempt, or classify it as
 * ambient concurrency.
 *
 * Attribution requires positive evidence on every axis: the observation must
 * name this attempt, be produced against the granted generation, and stay inside
 * the granted verification surface. Anything else is ambient — another attempt's
 * work, a shared-host effect, or an unbound error — and must never be reported as
 * the current task's failure.
 */
export function classifyVerificationObservation(
  grant: VerificationIsolationGrant,
  observation: VerificationObservation,
): VerificationObservationAttribution {
  if (observation.attemptId === null) {
    return { attribution: 'ambient', reasonCode: 'unbound_attempt' };
  }
  if (observation.attemptId !== grant.binding.attemptId) {
    return { attribution: 'ambient', reasonCode: 'foreign_attempt' };
  }
  if (observation.generationId !== grant.binding.generationId) {
    return { attribution: 'ambient', reasonCode: 'foreign_generation' };
  }
  const withinSurface = observation.paths.every(path =>
    grant.verificationPaths.some(granted => isWithin(granted, path)));
  if (!withinSurface) {
    return { attribution: 'ambient', reasonCode: 'outside_verification_surface' };
  }
  return { attribution: 'attempt', attemptId: grant.binding.attemptId };
}

export interface VerificationObservationPartition {
  /** Observations that are genuinely this attempt's failures. */
  readonly attributed: readonly VerificationObservation[];
  /** Concurrent/ambient observations — never this attempt's failure. */
  readonly ambient: readonly VerificationObservation[];
  readonly ambientReasonCodes: readonly VerificationObservationAmbientReason[];
}

/** Fold a batch of in-flight observations into attributed vs ambient. */
export function partitionVerificationObservations(
  grant: VerificationIsolationGrant,
  observations: readonly VerificationObservation[],
): VerificationObservationPartition {
  const attributed: VerificationObservation[] = [];
  const ambient: VerificationObservation[] = [];
  const reasons = new Set<VerificationObservationAmbientReason>();

  for (const observation of observations) {
    const classified = classifyVerificationObservation(grant, observation);
    if (classified.attribution === 'attempt') {
      attributed.push(observation);
      continue;
    }
    ambient.push(observation);
    reasons.add(classified.reasonCode);
  }

  return {
    attributed: Object.freeze(attributed),
    ambient: Object.freeze(ambient),
    ambientReasonCodes: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b))),
  };
}
