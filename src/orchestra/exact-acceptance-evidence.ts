/** Immutable, Store-backed accepted-V2 evidence. Never reads mutable project files. */
import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import type { Task, TaskResult } from '../core/types.js';
import {
  acceptanceConfirmationDigest, canonicalAcceptanceConfirmationJson,
} from '../core/acceptance-confirmation-contract.js';
import {
  digestCrossVerifyClaimV2, type CrossVerifyClaimV2,
} from '../core/cross-verify-adjudication.js';
import {
  canonicalTaskAttemptCustodyJson, TaskAttemptCustodyStore,
  type TaskAttemptCustodyPolicyV2,
} from '../core/task-attempt-custody-store.js';
import {
  projectExactTaskResultV2ForEvaluation, readExactAcceptedTaskResultV2,
  type ExactAcceptedTaskResultAuthorityMetadata,
} from './task-result-authority.js';
import { parseExactDockerDispatchTaskSnapshotAuthority } from './exact-docker-dispatch-task-authority.js';
import { createExecutionEffectLifecycleStoreAdmissionAdapterV1 } from './execution-effect-store-adapter.js';
import { readExactAcceptedTaskProviderExitAuthority } from './exact-docker-provider-exit-authority.js';
import { evaluateExactGoNogoCriteria } from './criterion-evaluation.js';
import { evaluateExactAcceptedResultWithRubric, gateProductionWiringVerdict } from './result-evaluator.js';
import { readExactProductionWiringHostSettlement } from './production-wiring-host-observation.js';
import { applyExactAcceptanceEnforcement, type AcceptanceRouteClaim } from './acceptance-enforcement.js';
import { createExecutionEffectStagedChunkRefV1, type ExecutionEffectStagedSourceSealV1 } from '../core/execution-effect-persistence-contract.js';

import {
  EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH, EXACT_ACCEPTANCE_CLAIM_RELATIVE_PATH, EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH,
  createExactAcceptanceAdjudicationContractV2, createExactAcceptanceSemanticClaimV2,
  digestExactAcceptanceEvidenceV2, parseExactAcceptanceVerificationBindingV2,
  isExactAcceptancePlainDataV2 as plain, isExactAcceptanceEvidencePathV2 as safePath,
  type ExactAcceptanceVerificationBindingV2, type ExactAcceptanceEvidenceReadPortV2,
} from '../core/exact-acceptance-verification-contract.js';
export {
  EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH, EXACT_ACCEPTANCE_CLAIM_RELATIVE_PATH, EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH,
  createExactAcceptanceAdjudicationContractV2, createExactAcceptanceSemanticClaimV2,
  digestExactAcceptanceEvidenceV2, parseExactAcceptanceVerificationBindingV2,
  type ExactAcceptanceVerificationBindingV2,
} from '../core/exact-acceptance-verification-contract.js';

declare const sourceBrand: unique symbol;
export interface ExactAcceptanceVerificationSourceV2 { readonly [sourceBrand]: true }
export interface CreateExactAcceptanceVerificationSourceV2Input {
  readonly projectRoot: string;
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly routeClaim: AcceptanceRouteClaim;
  readonly relativePaths?: readonly string[];
  readonly limits?: { readonly maxFiles: number; readonly maxFileBytes: number; readonly maxTotalBytes: number };
}
export type ReadExactAcceptanceVerificationSourceV2 = {
  readonly state: 'ready';
  readonly binding: ExactAcceptanceVerificationBindingV2;
  readonly task: Task;
  readonly result: TaskResult;
  readonly evidence: readonly { readonly relativePath: string; readonly bytes: Uint8Array }[];
  readonly claim: CrossVerifyClaimV2;
} | { readonly state: 'hold'; readonly reasonCode: string };

let sources: WeakMap<ExactAcceptanceVerificationSourceV2, CreateExactAcceptanceVerificationSourceV2Input> | undefined;
const HARD_LIMITS = Object.freeze({ maxFiles: 64, maxFileBytes: 1024 * 1024, maxTotalBytes: 4 * 1024 * 1024 });
const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const hold = (reasonCode: string): ReadExactAcceptanceVerificationSourceV2 => ({ state: 'hold', reasonCode });

function equal(a: unknown, b: unknown): boolean {
  return canonicalAcceptanceConfirmationJson(a) === canonicalAcceptanceConfirmationJson(b);
}

export function createExactAcceptanceVerificationSourceV2(
  input: CreateExactAcceptanceVerificationSourceV2Input,
): ExactAcceptanceVerificationSourceV2 {
  const source = Object.freeze({}) as ExactAcceptanceVerificationSourceV2;
  try {
    if (!input || typeof input !== 'object' || nodeTypes.isProxy(input)) return source;
    const metadata: Record<string, unknown> = {};
    let custodyStore: unknown;
    const allowed = new Set(['projectRoot', 'acceptedAuthority', 'custodyStore', 'policy', 'routeClaim', 'relativePaths', 'limits']);
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || !allowed.has(key)) return source;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return source;
      if (key === 'custodyStore') custodyStore = descriptor.value;
      else if (descriptor.value !== undefined) metadata[key] = descriptor.value;
    }
    if (!(custodyStore instanceof TaskAttemptCustodyStore) || !plain(metadata)) return source;
    const copy = JSON.parse(canonicalAcceptanceConfirmationJson(metadata)) as Omit<CreateExactAcceptanceVerificationSourceV2Input, 'custodyStore'>;
    (sources ??= new WeakMap()).set(source, { ...copy, custodyStore });
  } catch { /* Invalid issuers remain unrecognized; there is no fallback authority. */ }
  return source;
}

export function readExactAcceptanceVerificationSourceV2(source: ExactAcceptanceVerificationSourceV2): ReadExactAcceptanceVerificationSourceV2 {
  const input = sources?.get(source);
  if (!input) return hold('exact-source-unrecognized');
  try { return readSource(input); } catch { return hold('exact-source-custody-unavailable'); }
}

export function createExactAcceptanceEvidenceReadPortV2(
  source: ExactAcceptanceVerificationSourceV2,
): ExactAcceptanceEvidenceReadPortV2 {
  return Object.freeze({ read: () => readExactAcceptanceVerificationSourceV2(source) });
}

/** Byte reconstruction only: this helper cannot mint a source or accepted-result authority. */
export function reconstructExactAcceptanceStagedBytesV2(input: {
  readonly staged: ExecutionEffectStagedSourceSealV1;
  readonly maxBytes: number;
  readonly readChunk: (chunk: ExecutionEffectStagedSourceSealV1['chunks'][number]) => Uint8Array | null;
}): { readonly state: 'ready'; readonly bytes: Uint8Array } | { readonly state: 'hold'; readonly reasonCode: string } {
  const fail = (reasonCode: string) => ({ state: 'hold' as const, reasonCode });
  const { staged, maxBytes } = input;
  if (!plain(staged) || !Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > HARD_LIMITS.maxFileBytes
    || !Number.isSafeInteger(staged.byteLength) || staged.byteLength < 0 || staged.byteLength > maxBytes
    || staged.chunks.length < 1 || staged.chunks.length > 4096
    || staged.chunks.length > Math.max(1, staged.byteLength)) return fail('exact-source-byte-limit');
  let offset = 0;
  const keys = new Set<string>();
  for (const [index, chunk] of staged.chunks.entries()) {
    if (chunk.index !== index || chunk.byteOffset !== offset || !Number.isSafeInteger(chunk.byteLength)
      || chunk.byteLength < 0 || (chunk.byteLength === 0 && staged.chunks.length !== 1)
      || keys.has(chunk.artifactKey)) return fail('exact-source-chunk-layout-mismatch');
    const { chunkDigest, ...unsigned } = chunk;
    try {
      if (createExecutionEffectStagedChunkRefV1(unsigned).chunkDigest !== chunkDigest) return fail('exact-source-chunk-digest-mismatch');
    } catch { return fail('exact-source-chunk-digest-mismatch'); }
    keys.add(chunk.artifactKey); offset += chunk.byteLength;
    if (!Number.isSafeInteger(offset) || offset > staged.byteLength) return fail('exact-source-chunk-layout-mismatch');
  }
  if (offset !== staged.byteLength) return fail('exact-source-chunk-layout-mismatch');
  const bytes = new Uint8Array(staged.byteLength);
  for (const chunk of staged.chunks) {
    const read = input.readChunk(chunk);
    if (!read || read.byteLength !== chunk.byteLength || `sha256:${sha(read)}` !== chunk.contentDigest) return fail('exact-source-chunk-digest-mismatch');
    bytes.set(read, chunk.byteOffset);
  }
  if (`sha256:${sha(bytes)}` !== staged.contentDigest) return fail('exact-source-file-digest-mismatch');
  return { state: 'ready', bytes };
}

function readSource(input: CreateExactAcceptanceVerificationSourceV2Input): ReadExactAcceptanceVerificationSourceV2 {
  const { custodyStore: store, policy, acceptedAuthority, routeClaim } = input;
  const identity = acceptedAuthority.identity;
  const admission = store.readAdmission(identity, policy);
  if (!admission || admission.receiptDigest !== acceptedAuthority.admissionReceiptDigest) return hold('exact-source-admission-mismatch');
  const accepted = readExactAcceptedTaskResultV2({ executionMode: 'normal-docker', authorityKind: 'accepted-result',
    projectRoot: input.projectRoot, taskId: identity.taskId, custodyStore: store, policy, expectedIdentity: identity,
    admission, acceptedResultRef: acceptedAuthority.acceptedResultRef,
    expectedAcceptedResultChainDigest: acceptedAuthority.acceptedResultChainDigest });
  if (accepted.state !== 'exact-accepted' || !accepted.result || !equal(accepted.exactAcceptedAuthority, acceptedAuthority)) return hold('exact-source-accepted-mismatch');
  const exactResult = accepted.result;
  const snapshot = store.readTaskSnapshot({ identity, policy, admissionReceiptDigest: admission.receiptDigest });
  const pinned = snapshot && parseExactDockerDispatchTaskSnapshotAuthority(snapshot.bytes, policy);
  if (!snapshot || snapshot.proof.sha256 !== admission.taskSnapshot.sha256 || !pinned
    || pinned.snapshotSha256 !== snapshot.proof.sha256 || pinned.projectId !== identity.projectId
    || pinned.taskId !== identity.taskId || (pinned.task.sprintId !== undefined && pinned.task.sprintId !== pinned.sprintId)) return hold('exact-source-task-mismatch');
  const task = pinned.task;
  const taskAuthority = { task, taskSnapshotSha256: snapshot.proof.sha256, dispatchTaskMaterialDigest: pinned.taskDigest,
    sprintId: pinned.sprintId, evaluationPolicy: pinned.evaluationPolicy };
  const exit = readExactAcceptedTaskProviderExitAuthority({ acceptedAuthority, custodyStore: store, policy });
  if (exit.state !== 'current') return hold('exact-source-provider-exit-unavailable');
  const initialLanding = store.readVerifiedEffectLanding({ identity, policy,
    artifactKey: exactResult.attemptCustody.effectLanding.landingArtifactKey });
  if (!initialLanding) return hold('exact-source-landing-unavailable');
  const effect = createExecutionEffectLifecycleStoreAdmissionAdapterV1({ store, identity, policy,
    admissionReceiptDigest: admission.receiptDigest, platform: initialLanding.verifiedBundle.workspace.platform,
    now: () => initialLanding.landing.releasedAt }).readAcceptedAuthority(exactResult.attemptCustody.effectLanding.landingArtifactKey);
  if (!equal(effect.binding, exactResult.attemptCustody.effectLanding)) return hold('exact-source-landing-binding-mismatch');
  const landing = effect.verifiedLanding;
  const criterion = evaluateExactGoNogoCriteria({ task, result: exactResult, effectLanding: landing, policy });
  if (criterion.state !== 'evaluated') return hold('exact-source-criterion-unavailable');
  const wiring = readExactProductionWiringHostSettlement({ acceptedAuthority, task, result: exactResult, custodyStore: store, policy });
  if (wiring.state === 'hold') return hold('exact-source-production-wiring-unavailable');
  const evaluation = evaluateExactAcceptedResultWithRubric({ result: exactResult, acceptedAuthority, task,
    jsonBounds: policy.jsonBounds, rubric: { criteria: pinned.evaluationPolicy.rubric.criteria.map(item => ({ ...item })),
      passingScore: pinned.evaluationPolicy.rubric.passingScore, maxRetries: pinned.evaluationPolicy.rubric.maxRetries },
    criterionAuthority: criterion.authority });
  if (evaluation.state === 'hold') return hold('exact-source-evaluation-unavailable');
  const enforcement = applyExactAcceptanceEnforcement({
    evaluation: gateProductionWiringVerdict(evaluation.evaluation, task, wiring.state === 'current' ? wiring.decision : null),
    taskAuthority, result: exactResult, acceptedAuthority, jsonBounds: policy.jsonBounds });
  if (enforcement.state !== 'applied' || !enforcement.enforcement.routeClaim
    || !equal(enforcement.enforcement.routeClaim, routeClaim)) return hold('exact-source-route-mismatch');
  const dispatch = pinned.dispatch as { provider?: unknown };
  if (typeof dispatch.provider !== 'string' || dispatch.provider !== exactResult.provider) return hold('exact-source-provider-mismatch');
  const result = projectExactTaskResultV2ForEvaluation({ result: exactResult, acceptedAuthority, jsonBounds: policy.jsonBounds });
  if (!result) return hold('exact-source-result-unavailable');
  const limits = input.limits ?? HARD_LIMITS;
  for (const key of ['maxFiles', 'maxFileBytes', 'maxTotalBytes'] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > HARD_LIMITS[key]) return hold('exact-source-limits-invalid');
  }
  const files = input.relativePaths ?? result.filesChanged;
  if (!files.length || files.length > limits.maxFiles || new Set(files).size !== files.length) return hold('exact-source-path-count-invalid');
  const requiredFiles = task.goNogo.items?.flatMap(item => item.evidenceRequirements.flatMap(requirement => {
    if (!requirement.startsWith('file:')) return [];
    try { const path: unknown = JSON.parse(requirement.slice(5)); return typeof path === 'string' ? [path] : []; } catch { return []; }
  })) ?? [];
  if (requiredFiles.some(path => !files.includes(path))) return hold('exact-source-required-file-unavailable');
  if (files.some(path => !safePath(path) || !([...task.scope.filesRead, ...task.scope.filesWrite].includes(path)
    || task.scope.directories.some(directory => directory === '.' || path.startsWith(`${directory.replace(/\/$/u, '')}/`))))) return hold('exact-source-path-not-admitted');
  const bundle = landing.verifiedBundle;
  const evidence: { relativePath: string; bytes: Uint8Array }[] = [];
  let total = 0;
  const append = (relativePath: string, bytes: Uint8Array): boolean => {
    total += bytes.byteLength;
    if (!Number.isSafeInteger(total) || total > limits.maxTotalBytes || bytes.byteLength > limits.maxFileBytes) return false;
    evidence.push({ relativePath, bytes }); return true;
  };
  for (const path of [...files].sort()) {
    const final = bundle.final.entries.find(entry => entry.path === path);
    const operation = bundle.terminal.operations.find(item => item.path === path && item.stagedSource !== null);
    const staged = operation?.stagedSource;
    if (!final || final.kind !== 'regular-file' || !staged || staged.path !== path
      || staged.byteLength !== final.size || staged.contentDigest !== final.contentDigest) return hold('exact-source-final-bytes-unavailable');
    if (!Number.isSafeInteger(staged.byteLength) || staged.byteLength < 0 || staged.byteLength > limits.maxFileBytes
      || staged.byteLength + total > limits.maxTotalBytes || staged.chunks.length < 1
      || staged.chunks.length > 4096 || staged.chunks.length > Math.max(1, staged.byteLength)) return hold('exact-source-byte-limit');
    const reconstructed = reconstructExactAcceptanceStagedBytesV2({ staged,
      maxBytes: Math.min(limits.maxFileBytes, limits.maxTotalBytes - total), readChunk: chunk => {
      const read = store.readVerifiedArtifact({ identity, policy, artifactClass: 'execution-effect-staged-content',
        artifactKey: chunk.artifactKey, receiptDigest: chunk.artifactReceiptDigest });
      return read?.bytes ?? null;
    } });
    if (reconstructed.state === 'hold') return reconstructed;
    if (!append(path, reconstructed.bytes)) return hold('exact-source-byte-limit');
  }
  const metadata = { schemaVersion: 2, kind: 'exact-acceptance-scoped-manifests-v2',
    baselineManifestDigest: bundle.baseline.digest, finalManifestDigest: bundle.final.digest,
    files: [...files].sort().map(path => {
      const baseline = bundle.baseline.entries.find(entry => entry.path === path) ?? null;
      const final = bundle.final.entries.find(entry => entry.path === path) ?? null;
      const bytes = evidence.find(entry => entry.relativePath === path)!.bytes;
      const prefix = baseline?.kind === 'regular-file' && baseline.size <= bytes.byteLength
        ? { byteLength: baseline.size, contentDigest: `sha256:${sha(bytes.subarray(0, baseline.size))}`,
          matchesBaseline: `sha256:${sha(bytes.subarray(0, baseline.size))}` === baseline.contentDigest,
          suffixByteLength: bytes.byteLength - baseline.size,
          suffixContentDigest: `sha256:${sha(bytes.subarray(baseline.size))}` } : null;
      return { path, baseline, final, prefix };
    }),
    admittedEffectCount: bundle.terminal.operations.length,
    effectDecisionDigest: bundle.decision.decisionDigest,
    effects: bundle.terminal.operations.filter(operation => files.includes(operation.path))
      .map(operation => ({ path: operation.path, kind: operation.kind })),
  };
  if (!append(EXACT_ACCEPTANCE_MANIFESTS_RELATIVE_PATH, canonicalTaskAttemptCustodyJson(metadata, policy.jsonBounds))) return hold('exact-source-byte-limit');
  const claim = createExactAcceptanceSemanticClaimV2(task, routeClaim);
  if (!append(EXACT_ACCEPTANCE_CLAIM_RELATIVE_PATH, Buffer.from(canonicalAcceptanceConfirmationJson(claim)))) return hold('exact-source-byte-limit');
  const unsigned = { schemaVersion: 2 as const, kind: 'exact-acceptance-verification-binding-v2' as const,
    confirmationId: routeClaim.confirmationId, lineage: routeClaim.lineage, routeClaimDigest: routeClaim.claimDigest,
    acceptedAuthority, effectLandingReceiptDigest: landing.landing.receiptDigest,
    baselineManifestDigest: bundle.baseline.digest, finalManifestDigest: bundle.final.digest,
    producerProvider: dispatch.provider, semanticClaimDigest: digestCrossVerifyClaimV2(claim),
    evidenceDigest: digestExactAcceptanceEvidenceV2(evidence.map(entry => ({ relativePath: entry.relativePath,
      contentSha256: sha(entry.bytes), byteLength: entry.bytes.byteLength }))),
  };
  const binding = parseExactAcceptanceVerificationBindingV2({ ...unsigned, bindingDigest: acceptanceConfirmationDigest(unsigned) });
  if (!binding) return hold('exact-source-binding-invalid');
  if (!append(EXACT_ACCEPTANCE_BINDING_RELATIVE_PATH, Buffer.from(canonicalAcceptanceConfirmationJson(binding)))) return hold('exact-source-byte-limit');
  createExactAcceptanceAdjudicationContractV2(claim, evidence.map(entry => ({ relativePath: entry.relativePath, contentSha256: sha(entry.bytes) })));
  return { state: 'ready', binding, task, result, evidence, claim };
}
