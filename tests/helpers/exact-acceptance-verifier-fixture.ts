/** Component-only simulated verifier transport; no external provider is invoked.
 * The caller owns a temporary project and DECKENT_HOME. Producer custody is real:
 * this helper accepts only the opaque production Store issuer, never raw evidence.
 */
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '../../src/core/audit-writer.js';
import { deriveCrossVerifyAdjudicationV2, digestCrossVerifyAdjudicationContractV2 } from '../../src/core/cross-verify-adjudication.js';
import { createCrossVerifyEnforcedAttemptContractV2 } from '../../src/core/cross-verify-execution-contract.js';
import { buildCrossVerifyAdjudicationPromptV2 } from '../../src/core/cross-verify-prompt.js';
import { claimCrossVerifyEvidenceSnapshotAtomic, captureCrossVerifyEvidenceSnapshotAtomic,
  crossVerifyVerdictReceiptRef, writeCrossVerifyVerdictReceiptAtomic } from '../../src/core/cross-verify-evidence-broker.js';
import { createTaskResultSettlementRefForAttempt, writeTaskResultSettlementAttemptAtomic,
  claimTaskResultSettlementAttemptAtomic, taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementExecutionContractAtomic, writeTaskProviderTerminalUsageReceiptAtomic,
  writeTaskResultSettlementPreparedAtomic, writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementAtomic, createTaskResultSettlement,
  writeTaskProviderActualCallReceiptFromTransportUsageAtomic, writeTaskResultSettlementClosureAtomic } from '../../src/core/task-result-settlement.js';
import { readExactAcceptanceVerificationSourceV2, createExactAcceptanceEvidenceReadPortV2,
  createExactAcceptanceAdjudicationContractV2,
  type ExactAcceptanceVerificationSourceV2 } from '../../src/orchestra/exact-acceptance-evidence.js';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

export function createExactAcceptanceVerifierFixture(input: {
  readonly projectRoot: string;
  readonly source: ExactAcceptanceVerificationSourceV2;
  /** supported means overall CONFIRMED, including contradicted authored NO_GO assertions. */
  readonly status?: 'supported' | 'contradicted' | 'undecidable';
}) {
  const source = readExactAcceptanceVerificationSourceV2(input.source);
  if (source.state !== 'ready') throw new Error(`Producer source is not ready: ${source.reasonCode}`);
  const { binding, claim } = source;
  const { projectRoot } = input;
  const ref = createTaskResultSettlementRefForAttempt(projectRoot, `verify-${source.task.id}`, randomUUID());
  writeTaskResultSettlementAttemptAtomic(ref, '2026-09-05T00:00:00.000Z');
  claimTaskResultSettlementAttemptAtomic(ref, '2026-09-05T00:00:00.000Z');
  const immutableSource = createExactAcceptanceEvidenceReadPortV2(input.source);
  const evidenceClaim = claimCrossVerifyEvidenceSnapshotAtomic({ projectRoot, settlementRef: ref,
    fenceTokenHash: taskResultSettlementActiveClaimDigest(ref),
    relativePaths: source.evidence.map(entry => entry.relativePath), immutableSource });
  const snapshot = captureCrossVerifyEvidenceSnapshotAtomic({ projectRoot, settlementRef: ref,
    claim: evidenceClaim, immutableSource });
  const adjudicationContract = createExactAcceptanceAdjudicationContractV2(claim, snapshot.manifest.entries);
  const prompt = buildCrossVerifyAdjudicationPromptV2(adjudicationContract);
  if (prompt.state !== 'ready') throw new Error('Fixture semantic prompt exceeds the production limit');
  const provider = binding.producerProvider === 'claude' ? 'codex' : 'claude';
  const contract = createCrossVerifyEnforcedAttemptContractV2({
    tenantId: binding.lineage.tenantId, projectId: binding.lineage.projectId,
    runId: 'component-verifier-run', taskId: source.task.id, verifierTaskId: ref.taskId,
    callId: 'component-verifier-call', attemptId: ref.attemptId,
    fenceTokenHash: taskResultSettlementActiveClaimDigest(ref), operationClass: 'verify-implementation',
    basePromptSha256: hash(prompt.prompt), dispatchedPromptSha256: hash(prompt.prompt),
    taskSnapshotSha256: hash(canonicalJson(source.task)),
    budget: { maxTurns: 3 }, budgetFingerprint: hash('component-budget'),
    budgetProfileRef: 'execution-budget:xverify-component', budgetPolicyDigest: hash('component-budget-policy'),
    landingPolicy: { reserve_ratio: 0.25 }, attendanceMode: 'unattended', provider,
    model: provider === 'codex' ? 'gpt-5.6-sol' : 'claude-fable-5', authMode: 'subscription',
    accountRefHash: hash('component-account'), transport: 'cli', executionBackend: 'docker',
    endpointRefHash: null, executionProfileRef: 'execution-profile:xverify-component',
    providerLimitEstimates: [{ windowId: 'tokens-all', unit: 'tokens', amount: 100 }],
    timeoutMs: 120000, modelEffort: 'low', toolProfileDigest: hash('component-tools'),
    isolatedContext: true, settlementAttemptRef: ref,
    adjudication: { protocol: adjudicationContract.protocol, producerSettlementDigest: `sha256:${binding.bindingDigest}`,
      claimDigest: adjudicationContract.claimDigest, evidenceManifestDigest: adjudicationContract.evidenceManifestDigest,
      adjudicationContractDigest: digestCrossVerifyAdjudicationContractV2(adjudicationContract),
      evidenceBrokerRef: `cross-verify-evidence-manifest:sha256:${snapshot.manifestSha256}`,
      evidenceBrokerManifestSha256: snapshot.manifestSha256, evidenceMountPath: '/deckent/xverify-evidence',
      evidenceManifestRelativePath: 'manifest.json', runtimeImageRef: `sha256:${hash('component-image')}`,
      finalPromptDigest: `sha256:${hash(prompt.prompt)}`, finalPromptChars: prompt.prompt.length,
      maxPromptChars: 100000, maxEvidenceOutputChars: 10000, maxRationaleChars: 10000,
      evidenceAccess: 'snapshot-read-only', artifactMutationPolicy: 'attempt-private-output-only' },
  });
  writeTaskResultSettlementExecutionContractAtomic(ref, contract);
  writeTaskProviderTerminalUsageReceiptAtomic(ref, { version: 2, projectId: ref.projectRootSha256,
    taskId: ref.taskId, attemptId: ref.attemptId, budgetFingerprint: contract.budgetFingerprint,
    backend: 'docker', terminal: true, decision: { state: 'within-budget', counters: {
      turns: 1, inputTokens: 12, outputTokens: 8, cacheReadTokens: 0, cacheCreationTokens: 0,
      totalTokens: 20, maxContextTokens: 20 } }, updatedAt: '2026-09-05T00:00:01.000Z' });
  const status = input.status ?? 'supported';
  const citations = snapshot.manifest.entries.map(entry => ({
    evidenceId: `E-${hash(entry.relativePath).slice(0, 48)}`, locator: entry.relativePath,
    evidenceSha256: `sha256:${entry.contentSha256}` as const,
  }));
  const response = { schemaVersion: 2, protocol: adjudicationContract.protocol,
    claimDigest: adjudicationContract.claimDigest, evidenceManifestDigest: adjudicationContract.evidenceManifestDigest,
    assertionResults: claim.assertions.map(assertion => ({ assertionId: assertion.id,
      status: status === 'undecidable' ? 'undecidable' as const
        : (status === 'supported') === (assertion.polarity === 'go') ? 'supported' as const : 'contradicted' as const,
      citations: status === 'undecidable' ? [] : citations.filter(citation => assertion.evidenceRequirements
        .some(requirement => requirement.anyOfEvidenceIds.includes(citation.evidenceId))),
      reason: 'Component transport adjudicated every immutable evidence requirement',
      ...(status === 'undecidable' ? { missingRequirementIds: assertion.evidenceRequirements.map(requirement => requirement.id) } : {}),
    })) };
  const declared = status === 'supported' ? 'confirmed' : status === 'contradicted' ? 'refuted' : 'unclear';
  const output = `XVERIFY_RESPONSE_JSON: ${canonicalJson(response)}\nVERDICT: ${declared.toUpperCase()} Component adjudication`;
  const adjudication = deriveCrossVerifyAdjudicationV2({ contract: adjudicationContract, response,
    executionOutcome: 'completed', providerDeclaredVerdict: declared });
  if (adjudication.verdict !== declared) {
    throw new Error(`Component adjudication failed production validation: ${canonicalJson(adjudication)}`);
  }
  writeTaskResultSettlementPreparedAtomic(ref, contract.model);
  writeTaskResultSettlementDispatchAtomic(ref, hash('component-dispatch'), '2026-09-05T00:00:02.000Z');
  writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 0,
    settledAt: '2026-09-05T00:00:03.000Z', result: { taskId: ref.taskId, selfAssessment: 'DONE',
      hostTerminalProjection: { version: 1, protocol: 'xverify-v1', observedBy: 'host' }, notes: output } }));
  writeTaskProviderActualCallReceiptFromTransportUsageAtomic(ref);
  writeTaskResultSettlementClosureAtomic(ref, { containerDisposition: 'stopped-removed', locksReleased: true });
  const effectiveVerdict = declared.toUpperCase() as 'CONFIRMED' | 'REFUTED' | 'UNCLEAR';
  const receipt = writeCrossVerifyVerdictReceiptAtomic({ projectRoot, settlementRef: ref,
    claimSha256: evidenceClaim.claimSha256, evidenceManifestSha256: snapshot.manifestSha256,
    effectiveVerdict, disposition: effectiveVerdict === 'CONFIRMED' ? 'allow' : effectiveVerdict === 'REFUTED' ? 'no-go' : 'hold',
    adjudicationReceiptSha256: hash(canonicalJson(adjudication)), outputSha256: hash(output),
    outputByteLength: Buffer.byteLength(output) });
  return { binding, ref, receiptRef: crossVerifyVerdictReceiptRef(receipt),
    outcome: { ran: true, evidencePersisted: true, validatedAdjudicationReceipt: receipt } };
}
