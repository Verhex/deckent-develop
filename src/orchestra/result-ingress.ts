// ─── Canonical Worker-Ingress Result Assembly ────────────────────────────────
// Sprint-661 closure: extracted from result-assembler.ts so the Docker
// settlement path (spawn-backend-docker) can consume the canonical ingress
// boundary without pulling result-assembler's sprint-utils dependency into
// the CLI/orchestra SCC (ADR-G-041 layer gate; scc-growth fix 2026-08-24).
// This module may import ONLY from core/.

import {
  validateTaskResult,
  AssemblerError,
  type TaskResultV1,
  type FileChange,
} from '../core/task-result-schema.js';

export interface CanonicalIngressAuthority {
  readonly taskId: string;
  readonly workerId: string;
  readonly provider: string;
  readonly model: string;
  readonly sprintId?: string;
  readonly promptCompilePlanId?: string;
  readonly verificationCommands?: readonly string[];
  readonly isPriorityFix?: boolean;
  readonly fixForTaskId?: string | null;
}

/**
 * Canonical worker-ingress boundary used by normal Docker settlement, recovery,
 * evaluation and finalization. Compatibility fields are parsed once here; the
 * returned value is always the strict, defaulted TaskResultV1 dialect.
 */
export function assembleCanonicalIngressResult(
  ingress: Record<string, unknown>,
  authority: CanonicalIngressAuthority,
): TaskResultV1 {
  const claimedChanges = Array.isArray(ingress['filesChanged']) ? ingress['filesChanged'] : [];
  const totalAdded = nonnegativeInteger(ingress['totalLinesAdded'])
    ?? nonnegativeInteger(ingress['linesAdded']) ?? 0;
  const totalRemoved = nonnegativeInteger(ingress['totalLinesRemoved'])
    ?? nonnegativeInteger(ingress['linesRemoved']) ?? 0;
  const filesChanged: FileChange[] = claimedChanges.flatMap((entry, index) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const change = entry as Record<string, unknown>;
      if (typeof change['path'] !== 'string') return [];
      const status = change['status'];
      return [{
        path: change['path'],
        status: status === 'added' || status === 'deleted' ? status : 'modified',
        linesAdded: nonnegativeInteger(change['linesAdded']) ?? 0,
        linesRemoved: nonnegativeInteger(change['linesRemoved']) ?? 0,
      }];
    }
    if (typeof entry !== 'string') return [];
    return [{
      path: entry,
      status: 'modified' as const,
      linesAdded: index === 0 ? totalAdded : 0,
      linesRemoved: index === 0 ? totalRemoved : 0,
    }];
  });
  const verification = ingress['testVerification'] && typeof ingress['testVerification'] === 'object'
    ? ingress['testVerification'] as Record<string, unknown>
    : undefined;
  const outcome = verification?.['outcome'] === 'PASSED' || verification?.['outcome'] === 'FAILED'
    || verification?.['outcome'] === 'NOT_EXECUTED'
    ? verification['outcome']
    : ingress['testsPassed'] === true ? 'PASSED' : ingress['testsPassed'] === false ? 'FAILED' : 'NOT_EXECUTED';
  const applicability = verification?.['applicability'] === 'OPTIONAL'
    || verification?.['applicability'] === 'NOT_APPLICABLE'
    ? verification['applicability'] : 'REQUIRED';
  const usage = ingress['tokenUsage'] && typeof ingress['tokenUsage'] === 'object'
    ? ingress['tokenUsage'] as Record<string, unknown> : {};
  const inputTokens = nonnegativeInteger(usage['inputTokens']) ?? 0;
  const outputTokens = nonnegativeInteger(usage['outputTokens']) ?? 0;
  const cacheReadTokens = nonnegativeInteger(usage['cacheReadTokens']) ?? 0;
  const cacheCreationTokens = nonnegativeInteger(usage['cacheCreationTokens']) ?? 0;
  const source = usage['source'] === 'provider-adapter' || usage['source'] === 'host-runtime-budget'
    ? usage['source'] : 'tokenizer-fallback';
  const tsc = ingress['tsc'] && typeof ingress['tsc'] === 'object'
    ? ingress['tsc'] as Record<string, unknown> : undefined;
  const candidate = {
    schemaVersion: '1.0' as const,
    taskId: authority.taskId,
    workerId: authority.workerId,
    provider: authority.provider,
    model: authority.model,
    ...(authority.sprintId ? { sprintId: authority.sprintId } : {}),
    ...(authority.promptCompilePlanId
      ? { promptCompilePlanId: authority.promptCompilePlanId }
      : {}),
    isPriorityFix: authority.isPriorityFix ?? false,
    fixForTaskId: authority.fixForTaskId ?? null,
    filesChanged,
    totalLinesAdded: totalAdded,
    totalLinesRemoved: totalRemoved,
    diskVerified: ingress['workAttribution'] !== undefined,
    boundaryViolations: Array.isArray(ingress['boundaryViolations']) ? ingress['boundaryViolations'] : [],
    ...(ingress['workAttribution'] ? { workAttribution: ingress['workAttribution'] } : {}),
    ...(ingress['workerWorkClaim'] ? { workerWorkClaim: ingress['workerWorkClaim'] } : {}),
    ...(ingress['promptDeliveryAttribution'] ? { promptDeliveryAttribution: ingress['promptDeliveryAttribution'] } : {}),
    // Host-authored xverify terminal observation must survive the strict
    // cutover — dropping it broke every cross-provider verifier run
    // (framing-invalid regression 2026-08-24).
    ...(ingress['hostTerminalProjection'] ? { hostTerminalProjection: ingress['hostTerminalProjection'] } : {}),
    tokenUsage: {
      inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
      totalTokens: nonnegativeInteger(usage['totalTokens'])
        ?? inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
      source,
    },
    cost: ingress['cost'] && typeof ingress['cost'] === 'object'
      ? ingress['cost']
      : { usd: 0, pricingSource: 'docker-settlement-pending' },
    tests: {
      passed: outcome === 'PASSED' ? 1 : 0,
      failed: outcome === 'FAILED' ? 1 : 0,
      total: outcome === 'NOT_EXECUTED' ? 0 : 1,
      coverage: typeof ingress['coverage'] === 'number' ? ingress['coverage'] : null,
      command: Array.isArray(verification?.['commands'])
        ? (verification['commands'] as string[]).join(' && ') || null : null,
      orchestratorVerified: false,
      applicability,
      outcome,
    },
    tsc: {
      clean: typeof tsc?.['clean'] === 'boolean' ? tsc['clean'] : false,
      errors: nonnegativeInteger(tsc?.['errors']) ?? 0,
    },
    selfAssessment: ingress['selfAssessment'],
    criteriaEvidence: Array.isArray(ingress['criteriaEvidence']) ? ingress['criteriaEvidence'] : [],
    testVerification: {
      applicability,
      outcome,
      commands: authority.verificationCommands
        ? [...authority.verificationCommands]
        : Array.isArray(verification?.['commands'])
          ? (verification['commands'] as unknown[])
            .filter((command): command is string => typeof command === 'string')
          : [],
    },
    techDebtCriterionIds: Array.isArray(ingress['techDebtCriterionIds'])
      ? ingress['techDebtCriterionIds']
        .filter((value): value is string => typeof value === 'string')
      : [],
    notes: typeof ingress['notes'] === 'string' ? ingress['notes'] : '',
    agent: typeof ingress['agentId'] === 'string' ? ingress['agentId'] : null,
    skills: Array.isArray(ingress['skillIds'])
      ? ingress['skillIds'].filter((value): value is string => typeof value === 'string') : [],
  };
  const validated = validateTaskResult(candidate);
  if (!validated.ok) {
    throw new AssemblerError(
      `worker ingress for task ${authority.taskId} failed canonical assembly: ${validated.errors.join('; ')}`,
      validated.missingFields,
      validated.errors,
    );
  }
  return validated.value;
}
function nonnegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}
