import { createHash } from 'node:crypto';

import { canonicalJson } from '../core/audit-writer.js';
import {
  CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
  createCrossVerifyAdjudicationContractV2,
  digestCrossVerifyAdjudicationContractV2,
  type CrossVerifyAdjudicationContractV2,
  type CrossVerifyClaimAssertionV2,
} from '../core/cross-verify-adjudication.js';
import {
  captureCrossVerifyEvidenceSnapshotAtomic,
  claimCrossVerifyEvidenceSnapshotAtomic,
  crossVerifyEvidenceReceiptRef,
  type CrossVerifyEvidenceClaimEnvelopeV1,
  type CrossVerifyEvidenceReceiptEnvelopeV1,
} from '../core/cross-verify-evidence-broker.js';
import type { CrossVerifyAdjudicationExecutionBindingV2 } from '../core/cross-verify-execution-contract.js';
import {
  buildCrossVerifyAdjudicationPromptV2,
  CROSS_VERIFY_ADJUDICATION_RESPONSE_MAX_CHARS,
  CROSS_VERIFY_EVIDENCE_OUTPUT_MAX_CHARS,
  CROSS_VERIFY_PROMPT_MAX_CHARS,
  CROSS_VERIFY_RATIONALE_MAX_CHARS,
} from '../core/cross-verify-prompt.js';
import type {
  GoNoGoCriterionItem,
  Task,
  TaskResult,
} from '../core/task-types.js';
import type { TaskResultSettlementRefV1 } from '../core/task-result-settlement.js';

export interface CrossVerifyRuntimeBootstrapReady {
  readonly state: 'ready';
  readonly prompt: string;
  readonly adjudicationContract: Readonly<CrossVerifyAdjudicationContractV2>;
  readonly evidenceClaim: Readonly<CrossVerifyEvidenceClaimEnvelopeV1>;
  readonly evidenceSnapshot: Readonly<CrossVerifyEvidenceReceiptEnvelopeV1>;
  readonly executionBinding: Readonly<CrossVerifyAdjudicationExecutionBindingV2>;
}

export type CrossVerifyRuntimeBootstrapResult =
  | CrossVerifyRuntimeBootstrapReady
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'xverify_v2_structured_criteria_missing'
        | 'xverify_v2_evidence_scope_missing'
        | 'xverify_v2_prompt_ceiling_exceeded'
        | 'xverify_v2_bootstrap_failed';
      readonly detail: string;
    };

export interface BootstrapCrossVerifyRuntimeInput {
  readonly projectRoot: string;
  readonly task: Task;
  readonly result: TaskResult;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly fenceTokenHash: string;
  readonly runtimeImageRef: string;
  readonly producerSettlementDigest: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requirementId(criterionId: string, statement: string): string {
  return `R-${sha256(canonicalJson([criterionId, statement])).slice(0, 48)}`;
}

function evidenceId(relativePath: string): string {
  return `E-${sha256(relativePath).slice(0, 48)}`;
}

function criterionKind(
  criterion: GoNoGoCriterionItem,
): CrossVerifyClaimAssertionV2['kind'] {
  return /\b(?:before|after|precede|follow|dependency|order)\b/iu.test(
    criterion.statement,
  )
    ? 'dependency-order'
    : 'factual';
}

function matchingEvidenceIds(
  requirement: string,
  entries: CrossVerifyEvidenceReceiptEnvelopeV1['manifest']['entries'],
): string[] {
  const exact = entries
    .filter(entry => requirement.includes(entry.relativePath))
    .map(entry => evidenceId(entry.relativePath));
  return exact.length > 0
    ? exact
    : entries.map(entry => evidenceId(entry.relativePath));
}

/**
 * Freeze the semantic claim and its project evidence before any provider call.
 *
 * The broker owns filesystem truth; this layer only maps already-authored
 * criterion boundaries onto that immutable snapshot.
 */
export function bootstrapCrossVerifyRuntimeV2(
  input: BootstrapCrossVerifyRuntimeInput,
): CrossVerifyRuntimeBootstrapResult {
  const criteria = input.task.goNogo.items;
  if (!criteria || criteria.length === 0) {
    return {
      state: 'hold',
      reasonCode: 'xverify_v2_structured_criteria_missing',
      detail: input.task.id,
    };
  }
  const relativePaths = [...new Set(
    (input.task.scope.filesRead.length > 0
      ? input.task.scope.filesRead
      : input.result.filesChanged ?? [])
      .map(path => path.trim())
      .filter(Boolean),
  )];
  if (relativePaths.length === 0) {
    return {
      state: 'hold',
      reasonCode: 'xverify_v2_evidence_scope_missing',
      detail: input.task.id,
    };
  }

  try {
    const evidenceClaim = claimCrossVerifyEvidenceSnapshotAtomic({
      projectRoot: input.projectRoot,
      settlementRef: input.settlementRef,
      fenceTokenHash: input.fenceTokenHash,
      relativePaths,
    });
    const evidenceSnapshot = captureCrossVerifyEvidenceSnapshotAtomic({
      projectRoot: input.projectRoot,
      settlementRef: input.settlementRef,
      claim: evidenceClaim,
    });
    const manifestEntries = evidenceSnapshot.manifest.entries;
    const adjudicationContract = createCrossVerifyAdjudicationContractV2({
      schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
      claimId: `claim-${input.task.id}`,
      summary: input.task.title,
      assertions: criteria.map(criterion => ({
        id: criterion.id,
        kind: criterionKind(criterion),
        polarity: criterion.polarity,
        statement: criterion.statement,
        evidenceRequirements: criterion.evidenceRequirements.map(statement => ({
          id: requirementId(criterion.id, statement),
          statement,
          anyOfEvidenceIds: matchingEvidenceIds(statement, manifestEntries),
        })),
      })),
    }, {
      schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
      entries: manifestEntries.map(entry => ({
        evidenceId: evidenceId(entry.relativePath),
        kind: 'file-snapshot' as const,
        locator: entry.relativePath,
        contentSha256: `sha256:${entry.contentSha256}`,
      })),
    });
    const built = buildCrossVerifyAdjudicationPromptV2(adjudicationContract);
    if (built.state === 'hold') {
      return {
        state: 'hold',
        reasonCode: 'xverify_v2_prompt_ceiling_exceeded',
        detail: `${built.promptChars}/${built.maxPromptChars}`,
      };
    }
    const executionBinding: CrossVerifyAdjudicationExecutionBindingV2 = {
      protocol: adjudicationContract.protocol,
      producerSettlementDigest: input.producerSettlementDigest,
      claimDigest: adjudicationContract.claimDigest,
      evidenceManifestDigest: adjudicationContract.evidenceManifestDigest,
      adjudicationContractDigest:
        digestCrossVerifyAdjudicationContractV2(adjudicationContract),
      evidenceBrokerRef: crossVerifyEvidenceReceiptRef(evidenceSnapshot),
      evidenceBrokerManifestSha256: evidenceSnapshot.manifestSha256,
      evidenceMountPath: '/deckent/xverify-evidence',
      evidenceManifestRelativePath: 'manifest.json',
      runtimeImageRef: input.runtimeImageRef,
      finalPromptDigest: `sha256:${sha256(built.prompt)}`,
      finalPromptChars: built.promptChars,
      maxPromptChars: CROSS_VERIFY_PROMPT_MAX_CHARS,
      maxEvidenceOutputChars: CROSS_VERIFY_EVIDENCE_OUTPUT_MAX_CHARS,
      maxRationaleChars: CROSS_VERIFY_RATIONALE_MAX_CHARS,
      evidenceAccess: 'snapshot-read-only',
      artifactMutationPolicy: 'attempt-private-output-only',
    };
    if (CROSS_VERIFY_ADJUDICATION_RESPONSE_MAX_CHARS
      > CROSS_VERIFY_EVIDENCE_OUTPUT_MAX_CHARS) {
      return {
        state: 'hold',
        reasonCode: 'xverify_v2_bootstrap_failed',
        detail: 'semantic response ceiling exceeds durable raw-output ceiling',
      };
    }
    return Object.freeze({
      state: 'ready',
      prompt: built.prompt,
      adjudicationContract,
      evidenceClaim,
      evidenceSnapshot,
      executionBinding: Object.freeze(executionBinding),
    });
  } catch (error) {
    return {
      state: 'hold',
      reasonCode: 'xverify_v2_bootstrap_failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
