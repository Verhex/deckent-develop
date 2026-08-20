import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  writeCrossVerifyDecodedSlice,
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
import { atomicWriteFileSync } from '../agents/worker-lifecycle.js';

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
        | 'xverify_v2_bounded_slice_failed'
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

function bootstrapHold(
  input: BootstrapCrossVerifyRuntimeInput,
  reasonCode: Extract<CrossVerifyRuntimeBootstrapResult, { state: 'hold' }>['reasonCode'],
  detail: string,
): Extract<CrossVerifyRuntimeBootstrapResult, { state: 'hold' }> {
  const directory = join(input.projectRoot, '.analysis', 'xverify');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'hold-details.jsonl');
  const prior = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const digestRef = `xverify-bootstrap-detail:sha256:${sha256(canonicalJson({
    reasonCode,
    detail,
    taskId: input.task.id,
  }))}`;
  const record = JSON.stringify({
    reasonCode,
    detail,
    at: new Date().toISOString(),
    taskId: input.task.id,
    digestRef,
  });
  atomicWriteFileSync(path, `${prior}${prior && !prior.endsWith('\n') ? '\n' : ''}${record}\n`);
  return { state: 'hold', reasonCode, detail };
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

// ─── 7094/7081 ranged-read-verifier ────────────────────────────────────────
// An authored evidence requirement of the form `path:START-END` (1-based
// inclusive — the exact `--target` grammar) binds to a BOUNDED decoded slice
// instead of the full-file snapshot. The slice is cut from the pinned decoded
// blob by the broker (writeCrossVerifyDecodedSlice) and becomes a first-class
// content-addressed evidence entry, so the verifier reads and cites tens of
// lines instead of mapping thousands — the 17-case honest-HOLD class
// ("inaccurate missing-evidence map" / no-output on large files) loses its
// mechanical cause. Full-file requirements keep the exact prior behaviour.
const RANGED_REQUIREMENT_RE = /^(.+):(\d+)-(\d+)$/u;

interface RangedRequirement {
  readonly key: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

function parseRangedRequirement(statement: string): RangedRequirement | null {
  const match = RANGED_REQUIREMENT_RE.exec(statement.trim());
  if (!match) return null;
  const startLine = Number.parseInt(match[2]!, 10);
  const endLine = Number.parseInt(match[3]!, 10);
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)
    || startLine < 1 || endLine < startLine) return null;
  return { key: statement.trim(), path: match[1]!, startLine, endLine };
}

interface ContractEvidenceEntry {
  readonly evidenceId: string;
  readonly locator: string;
  readonly contentSha256: string;
  /** Source path this entry evidences (equals locator for full files). */
  readonly relativePath: string;
}

function matchingEvidenceIds(
  requirement: string,
  entries: readonly ContractEvidenceEntry[],
): string[] {
  const exactLocator = entries
    .filter(entry => entry.locator === requirement.trim())
    .map(entry => entry.evidenceId);
  if (exactLocator.length > 0) return exactLocator;
  const byPath = entries
    .filter(entry => requirement.includes(entry.relativePath))
    .map(entry => entry.evidenceId);
  return byPath.length > 0
    ? byPath
    : entries.map(entry => entry.evidenceId);
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
    return bootstrapHold(input, 'xverify_v2_structured_criteria_missing', input.task.id);
  }
  const relativePaths = [...new Set(
    [
      ...(input.task.scope.filesRead.length > 0
        ? input.task.scope.filesRead
        : input.result.filesChanged ?? []),
      // 7094/7081: a ranged requirement's source file must be pinned in the
      // snapshot even when the authoring surface forgot to list the bare path.
      ...criteria.flatMap(criterion => criterion.evidenceRequirements
        .map(statement => parseRangedRequirement(statement)?.path)
        .filter((path): path is string => Boolean(path))),
    ]
      .map(path => path.trim())
      .filter(Boolean),
  )];
  if (relativePaths.length === 0) {
    return bootstrapHold(input, 'xverify_v2_evidence_scope_missing', input.task.id);
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

    // Ranged requirements → bounded decoded slices (7094/7081). Slices are
    // cut from the PINNED decoded blob; a path with at least one ranged
    // requirement is evidenced ONLY by its slices (the requirement load moves
    // off the full-file sha — that unmappable weight was the HOLD mechanism).
    const rangedByPath = new Map<string, RangedRequirement[]>();
    for (const criterion of criteria) {
      for (const statement of criterion.evidenceRequirements) {
        const ranged = parseRangedRequirement(statement);
        if (!ranged) continue;
        const list = rangedByPath.get(ranged.path) ?? [];
        if (!list.some(existing => existing.key === ranged.key)) list.push(ranged);
        rangedByPath.set(ranged.path, list);
      }
    }
    const contractEntries: ContractEvidenceEntry[] = [];
    for (const entry of manifestEntries) {
      const rangedList = rangedByPath.get(entry.relativePath);
      if (!rangedList || rangedList.length === 0) {
        contractEntries.push({
          evidenceId: evidenceId(entry.relativePath),
          locator: entry.relativePath,
          contentSha256: `sha256:${entry.contentSha256}`,
          relativePath: entry.relativePath,
        });
        continue;
      }
      for (const ranged of rangedList) {
        let slice;
        try {
          slice = writeCrossVerifyDecodedSlice({
            projectRoot: input.projectRoot,
            settlementRef: input.settlementRef,
            sourceContentSha256: entry.contentSha256,
            startLine: ranged.startLine,
            endLine: ranged.endLine,
          });
        } catch (error) {
          return bootstrapHold(
            input,
            'xverify_v2_bounded_slice_failed',
            `${ranged.key}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        contractEntries.push({
          evidenceId: evidenceId(ranged.key),
          locator: ranged.key,
          contentSha256: `sha256:${slice.contentSha256}`,
          relativePath: entry.relativePath,
        });
      }
    }

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
          anyOfEvidenceIds: matchingEvidenceIds(statement, contractEntries),
        })),
      })),
    }, {
      schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
      entries: contractEntries.map(entry => ({
        evidenceId: entry.evidenceId,
        kind: 'file-snapshot' as const,
        locator: entry.locator,
        contentSha256: entry.contentSha256,
      })),
    });
    const built = buildCrossVerifyAdjudicationPromptV2(adjudicationContract);
    if (built.state === 'hold') {
      return bootstrapHold(
        input,
        'xverify_v2_prompt_ceiling_exceeded',
        `${built.promptChars}/${built.maxPromptChars}`,
      );
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
      return bootstrapHold(
        input,
        'xverify_v2_bootstrap_failed',
        'semantic response ceiling exceeds durable raw-output ceiling',
      );
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
    return bootstrapHold(
      input,
      'xverify_v2_bootstrap_failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}
