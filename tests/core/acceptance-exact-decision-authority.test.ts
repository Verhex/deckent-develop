import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptanceConfirmationDigest, canonicalAcceptanceConfirmationJson, deriveAcceptanceConfirmationId } from '../../src/core/acceptance-confirmation-contract.js';
import { canonicalJson } from '../../src/core/audit-writer.js';
import { createCrossVerifyAdjudicationContractV2, deriveCrossVerifyAdjudicationV2,
  digestCrossVerifyAdjudicationContractV2, digestCrossVerifyClaimV2 } from '../../src/core/cross-verify-adjudication.js';
import { createCrossVerifyEnforcedAttemptContractV2 } from '../../src/core/cross-verify-execution-contract.js';
import { buildCrossVerifyAdjudicationPromptV2 } from '../../src/core/cross-verify-prompt.js';
import { claimCrossVerifyEvidenceSnapshotAtomic, captureCrossVerifyEvidenceSnapshotAtomic,
  crossVerifyVerdictReceiptRef, readCrossVerifyEvidenceBlobBytes, writeCrossVerifyVerdictReceiptAtomic,
  crossVerifyEvidenceBlobReceiptPath } from '../../src/core/cross-verify-evidence-broker.js';
import { createTaskResultSettlementRefForAttempt, writeTaskResultSettlementAttemptAtomic,
  claimTaskResultSettlementAttemptAtomic, taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementExecutionContractAtomic, writeTaskProviderTerminalUsageReceiptAtomic,
  writeTaskResultSettlementPreparedAtomic, writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementAtomic, createTaskResultSettlement,
  writeTaskProviderActualCallReceiptFromTransportUsageAtomic, writeTaskResultSettlementClosureAtomic,
  taskProviderActualCallReceiptPath, taskResultSettlementClosurePath,
  taskResultSettlementExecutionContractPath, taskProviderTerminalUsageReceiptPath } from '../../src/core/task-result-settlement.js';
import { writeLlmAcceptanceDecisionBindingFirstWriterWins, verifyExactLlmAcceptanceDecision,
  verifyLlmAcceptanceDecision, createAcceptanceDecisionAuthorityVerifier } from '../../src/core/acceptance-decision-authority.js';
import { digestExactAcceptanceEvidenceV2, parseExactAcceptanceVerificationBindingV2,
  type ExactAcceptanceVerificationBindingV2, type ExactAcceptanceEvidenceReadPortV2 } from '../../src/core/exact-acceptance-verification-contract.js';

// The explicit host read port isolates producer Store reconstruction. All broker
// bytes/hashes, execution contracts, usage, closed verifier settlements, semantic
// adjudication and acceptance readers remain real, without mocking module exports.

const cleanup: Array<() => Promise<void>> = [];
const priorHome = process.env.DECKENT_HOME;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const d = (character: string) => `sha256:${character.repeat(64)}` as const;
const bindingPath = '__deckent__/acceptance-binding.json';
const claimPath = '__deckent__/acceptance-claim.json';
afterEach(async () => {
  if (priorHome === undefined) delete process.env.DECKENT_HOME; else process.env.DECKENT_HOME = priorHome;
  await Promise.all(cleanup.splice(0).map(remove => remove()));
});

async function fixture(options: { provider?: string; status?: 'supported' | 'contradicted' | 'undecidable';
  claimDrift?: boolean; evidenceDrift?: boolean; receiptVerdict?: 'CONFIRMED' | 'REFUTED' | 'UNCLEAR'; unbound?: boolean; contractFence?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'exact-acceptance-authority-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const projectRoot = join(root, 'project'); await mkdir(projectRoot);
  process.env.DECKENT_HOME = join(root, 'state');
  const lineage = { tenantId: 'tenant-a', projectId: 'project-a', sprintId: '720', taskId: '720-001',
    attemptId: randomUUID(), generation: 1, evaluationDigest: hash('evaluation'),
    resultDigest: hash('result'), policyDigest: hash('policy'), sourceDigest: hash('source') };
  const confirmationId = deriveAcceptanceConfirmationId(lineage);
  const claim = { schemaVersion: 2 as const, claimId: 'exact-acceptance-claim', summary: confirmationId,
    assertions: [{ id: 'criterion-a', kind: 'factual' as const, polarity: 'go' as const, statement: 'The authored outcome is satisfied',
      evidenceRequirements: [{ id: 'binding-required', statement: bindingPath,
        anyOfEvidenceIds: [`E-${hash(bindingPath).slice(0, 48)}`] }] }] };
  const identity = { schemaVersion: 2 as const, backend: 'docker' as const, projectRootSha256: hash(resolve(projectRoot)),
    projectId: lineage.projectId, taskId: lineage.taskId, attemptId: lineage.attemptId, generation: lineage.generation };
  const originalEvidence = [
    { relativePath: claimPath, bytes: Buffer.from(canonicalJson(claim)) },
    { relativePath: 'result.txt', bytes: Buffer.from('Exact accepted producer bytes') },
  ];
  const evidenceDigest = digestExactAcceptanceEvidenceV2(originalEvidence.map(entry => ({ relativePath: entry.relativePath,
    contentSha256: hash(entry.bytes), byteLength: entry.bytes.byteLength })));
  const payload = { schemaVersion: 2 as const, kind: 'exact-acceptance-verification-binding-v2' as const,
    confirmationId, lineage, routeClaimDigest: hash('route'), semanticClaimDigest: digestCrossVerifyClaimV2(claim),
    producerProvider: 'codex', acceptedAuthority: { executionMode: 'normal-docker' as const, identity,
      admissionReceiptDigest: d('a'), acceptedResultRef: { schemaVersion: 2 as const,
        kind: 'task-accepted-result-v2-ref' as const, identity, artifactKey: 'accepted-result', artifactReceiptDigest: d('b') },
      acceptedResultChainDigest: d('c'), resultDigest: d('d') },
    effectLandingReceiptDigest: d('e'), baselineManifestDigest: d('f'), finalManifestDigest: d('1'), evidenceDigest };
  const binding = { ...payload, bindingDigest: acceptanceConfirmationDigest(payload) } as ExactAcceptanceVerificationBindingV2;
  expect(parseExactAcceptanceVerificationBindingV2(binding)).toEqual(binding);
  const evidence = [
    { relativePath: bindingPath, bytes: Buffer.from(canonicalAcceptanceConfirmationJson(binding)) },
    { relativePath: claimPath, bytes: Buffer.from(canonicalJson(options.claimDrift ? { ...claim, summary: 'sibling claim' } : claim)) },
    { relativePath: 'result.txt', bytes: options.evidenceDrift ? Buffer.from('Substituted verifier evidence') : originalEvidence[1]!.bytes },
  ];
  const source: ExactAcceptanceEvidenceReadPortV2 = Object.freeze({
    read: () => ({ state: 'ready' as const, binding, evidence }),
  });
  const ref = createTaskResultSettlementRefForAttempt(projectRoot, 'verify-720-001', randomUUID());
  writeTaskResultSettlementAttemptAtomic(ref, '2026-09-05T00:00:00.000Z');
  claimTaskResultSettlementAttemptAtomic(ref, '2026-09-05T00:00:00.000Z');
  if (options.unbound) {
    await mkdir(join(projectRoot, '__deckent__'));
    await writeFile(join(projectRoot, bindingPath), evidence[0]!.bytes);
    await writeFile(join(projectRoot, claimPath), evidence[1]!.bytes);
    await writeFile(join(projectRoot, 'result.txt'), evidence[2]!.bytes);
  }
  const evidenceClaim = claimCrossVerifyEvidenceSnapshotAtomic({ projectRoot, settlementRef: ref,
    fenceTokenHash: taskResultSettlementActiveClaimDigest(ref), relativePaths: evidence.map(item => item.relativePath),
    ...(!options.unbound ? { immutableSource: source } : {}) });
  const snapshot = captureCrossVerifyEvidenceSnapshotAtomic({ projectRoot, settlementRef: ref, claim: evidenceClaim,
    ...(!options.unbound ? { immutableSource: source } : {}) });
  const adjudicationContract = createCrossVerifyAdjudicationContractV2(claim, { schemaVersion: 2,
    entries: snapshot.manifest.entries.map(entry => ({ evidenceId: `E-${hash(entry.relativePath).slice(0, 48)}`,
      kind: 'file-snapshot', locator: entry.relativePath, contentSha256: `sha256:${entry.contentSha256}` })) });
  const prompt = buildCrossVerifyAdjudicationPromptV2(adjudicationContract);
  if (prompt.state !== 'ready') throw new Error('fixture prompt exceeds its real limit');
  const provider = options.provider ?? 'claude';
  const contract = createCrossVerifyEnforcedAttemptContractV2({
    tenantId: lineage.tenantId, projectId: lineage.projectId, runId: 'run-a', taskId: lineage.taskId,
    verifierTaskId: ref.taskId, callId: 'call-a', attemptId: ref.attemptId,
    fenceTokenHash: options.contractFence ?? taskResultSettlementActiveClaimDigest(ref), operationClass: 'verify-implementation',
    basePromptSha256: hash(prompt.prompt), dispatchedPromptSha256: hash(prompt.prompt), taskSnapshotSha256: hash('task'),
    budget: { maxTurns: 3 }, budgetFingerprint: hash('budget'), budgetProfileRef: 'execution-budget:xverify-test',
    budgetPolicyDigest: hash('budget-policy'), landingPolicy: { reserve_ratio: 0.25 }, attendanceMode: 'unattended',
    provider, model: provider === 'codex' ? 'gpt-5.6-sol' : 'claude-fable-5', authMode: 'subscription',
    accountRefHash: hash('account'), transport: 'cli', executionBackend: 'docker', endpointRefHash: null,
    executionProfileRef: 'execution-profile:xverify-test', providerLimitEstimates: [{ windowId: 'tokens-all', unit: 'tokens', amount: 100 }],
    timeoutMs: 120000, modelEffort: 'low', toolProfileDigest: hash('tools'), isolatedContext: true, settlementAttemptRef: ref,
    adjudication: { protocol: adjudicationContract.protocol, producerSettlementDigest: `sha256:${binding.bindingDigest}`,
      claimDigest: adjudicationContract.claimDigest, evidenceManifestDigest: adjudicationContract.evidenceManifestDigest,
      adjudicationContractDigest: digestCrossVerifyAdjudicationContractV2(adjudicationContract),
      evidenceBrokerRef: `cross-verify-evidence-manifest:sha256:${snapshot.manifestSha256}`,
      evidenceBrokerManifestSha256: snapshot.manifestSha256, evidenceMountPath: '/deckent/xverify-evidence',
      evidenceManifestRelativePath: 'manifest.json', runtimeImageRef: d('2'), finalPromptDigest: `sha256:${hash(prompt.prompt)}`,
      finalPromptChars: prompt.prompt.length, maxPromptChars: 100000, maxEvidenceOutputChars: 10000, maxRationaleChars: 10000,
      evidenceAccess: 'snapshot-read-only', artifactMutationPolicy: 'attempt-private-output-only' },
  });
  writeTaskResultSettlementExecutionContractAtomic(ref, contract);
  writeTaskProviderTerminalUsageReceiptAtomic(ref, { version: 2, projectId: ref.projectRootSha256,
    taskId: ref.taskId, attemptId: ref.attemptId, budgetFingerprint: contract.budgetFingerprint, backend: 'docker', terminal: true,
    decision: { state: 'within-budget', counters: { turns: 1, inputTokens: 12, outputTokens: 8, cacheReadTokens: 0,
      cacheCreationTokens: 0, totalTokens: 20, maxContextTokens: 20 } }, updatedAt: '2026-09-05T00:00:01.000Z' });
  const status = options.status ?? 'supported';
  const bindingEntry = snapshot.manifest.entries.find(entry => entry.relativePath === bindingPath)!;
  const response = { schemaVersion: 2, protocol: adjudicationContract.protocol,
    claimDigest: adjudicationContract.claimDigest, evidenceManifestDigest: adjudicationContract.evidenceManifestDigest,
    assertionResults: [{ assertionId: 'criterion-a', status,
      citations: status === 'undecidable' ? [] : [{ evidenceId: `E-${hash(bindingPath).slice(0, 48)}`,
        locator: bindingPath, evidenceSha256: `sha256:${bindingEntry.contentSha256}` }],
      reason: 'Evidence adjudicated', ...(status === 'undecidable' ? { missingRequirementIds: ['binding-required'] } : {}) }] };
  const declared = status === 'supported' ? 'confirmed' : status === 'contradicted' ? 'refuted' : 'unclear';
  const output = `XVERIFY_RESPONSE_JSON: ${canonicalJson(response)}\nVERDICT: ${declared.toUpperCase()} Evidence adjudicated`;
  const adjudication = deriveCrossVerifyAdjudicationV2({ contract: adjudicationContract, response,
    executionOutcome: 'completed', providerDeclaredVerdict: declared });
  writeTaskResultSettlementPreparedAtomic(ref, contract.model);
  writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), '2026-09-05T00:00:02.000Z');
  writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 0, settledAt: '2026-09-05T00:00:03.000Z',
    result: { taskId: ref.taskId, selfAssessment: 'DONE', hostTerminalProjection: { version: 1, protocol: 'xverify-v1', observedBy: 'host' }, notes: output } }));
  writeTaskProviderActualCallReceiptFromTransportUsageAtomic(ref);
  writeTaskResultSettlementClosureAtomic(ref, { containerDisposition: 'stopped-removed', locksReleased: true });
  const effectiveVerdict = options.receiptVerdict ?? declared.toUpperCase() as 'CONFIRMED' | 'REFUTED' | 'UNCLEAR';
  const receipt = writeCrossVerifyVerdictReceiptAtomic({ projectRoot, settlementRef: ref,
    claimSha256: evidenceClaim.claimSha256, evidenceManifestSha256: snapshot.manifestSha256,
    effectiveVerdict, disposition: effectiveVerdict === 'CONFIRMED' ? 'allow' : effectiveVerdict === 'REFUTED' ? 'no-go' : 'hold',
    adjudicationReceiptSha256: hash(canonicalJson(adjudication)), outputSha256: hash(output), outputByteLength: Buffer.byteLength(output) });
  const receiptRef = crossVerifyVerdictReceiptRef(receipt);
  const input = { projectRoot, confirmationId, lineage, verdict: 'CONFIRMED' as const, receiptRef, settlementRef: ref, exactBinding: binding };
  const decision = { confirmationId, lineage, verdict: 'CONFIRMED' as const, authorityReceipt: receiptRef, decidedAt: '2026-09-05T00:00:04.000Z' };
  const corrupt = async (artifact: 'actual-call' | 'usage' | 'closure' | 'contract' | 'snapshot') => {
    const canonicalTarget = artifact === 'actual-call' ? taskProviderActualCallReceiptPath(ref)
      : artifact === 'usage' ? taskProviderTerminalUsageReceiptPath(ref)
        : artifact === 'closure' ? taskResultSettlementClosurePath(ref)
          : artifact === 'contract' ? taskResultSettlementExecutionContractPath(ref)
            : crossVerifyEvidenceBlobReceiptPath(ref, snapshot.manifest.entries[0]!.blobReceiptSha256);
    const validatedRelativeArtifactPath = relative(root, canonicalTarget);
    if (!validatedRelativeArtifactPath || isAbsolute(validatedRelativeArtifactPath)
      || validatedRelativeArtifactPath === '..' || validatedRelativeArtifactPath.startsWith(`..${sep}`)) {
      throw new Error('Fixture artifact escaped its own temporary root');
    }
    const target = join(root, validatedRelativeArtifactPath);
    if (target !== canonicalTarget) throw new Error('Fixture artifact is not its canonical temporary path');
    await writeFile(target, '{}');
  };
  return { input, decision, binding, ref, snapshot, projectRoot, source, evidenceClaim, corrupt };
}

describe.skipIf(process.platform !== 'linux')('exact semantic acceptance authority with real durable verifier receipts', () => {
  it('publishes and freshly verifies one exact lineage with real closed usage evidence', async () => {
    const f = await fixture();
    writeLlmAcceptanceDecisionBindingFirstWriterWins(f.input);
    expect(verifyExactLlmAcceptanceDecision(f.projectRoot, f.decision, f.binding)).toBe(true);
    expect(writeLlmAcceptanceDecisionBindingFirstWriterWins(f.input).exactBinding).toEqual(f.binding);
  });

  it('requires an independent fresh binding on every factory verification, never its own stored expected value', async () => {
    const f = await fixture(); writeLlmAcceptanceDecisionBindingFirstWriterWins(f.input);
    expect(verifyLlmAcceptanceDecision(f.projectRoot, f.decision)).toBe(false);
    let current: ExactAcceptanceVerificationBindingV2 | null = f.binding;
    const verify = createAcceptanceDecisionAuthorityVerifier({ branch: 'llm', projectRoot: f.projectRoot,
      readExactBinding: () => current });
    expect(verify(f.decision)).toBe(true);
    current = null;
    expect(verify(f.decision)).toBe(false);
    const { bindingDigest: _digest, ...prior } = f.binding;
    const changed = { ...prior, evidenceDigest: hash('changed-source') };
    current = { ...changed, bindingDigest: acceptanceConfirmationDigest(changed) };
    expect(verify(f.decision)).toBe(false);
    expect(createAcceptanceDecisionAuthorityVerifier({ branch: 'llm', projectRoot: f.projectRoot,
      readExactBinding: () => { throw new Error('custody missing'); } })(f.decision)).toBe(false);
  });

  it.each(['tenantId', 'attemptId', 'generation', 'evaluationDigest', 'resultDigest', 'policyDigest', 'sourceDigest'] as const)(
    'cannot rebind a genuine CONFIRMED receipt to changed %s', async field => {
      const f = await fixture();
      const lineage = { ...f.binding.lineage, [field]: field === 'generation' ? 2 : field.endsWith('Digest') ? hash('sibling') : 'sibling' };
      const { bindingDigest: _digest, ...prior } = f.binding;
      const payload = { ...prior, lineage, confirmationId: deriveAcceptanceConfirmationId(lineage) };
      const foreign = { ...payload, bindingDigest: acceptanceConfirmationDigest(payload) };
      expect(() => writeLlmAcceptanceDecisionBindingFirstWriterWins({ ...f.input, confirmationId: payload.confirmationId,
        lineage, exactBinding: foreign })).toThrow('Exact semantic acceptance authority evidence mismatch');
    });

  it.each(['contradicted', 'undecidable'] as const)('rejects %s output behind a genuine but misleading CONFIRMED receipt', async status => {
    const f = await fixture({ status, receiptVerdict: 'CONFIRMED' });
    expect(() => writeLlmAcceptanceDecisionBindingFirstWriterWins(f.input)).toThrow();
  });

  it.each([{ provider: 'codex' }, { unbound: true }, { claimDrift: true }, { evidenceDrift: true }, { contractFence: hash('foreign-fence') }])('rejects missing independence or semantic source binding %j', async options => {
    const f = await fixture(options);
    expect(() => writeLlmAcceptanceDecisionBindingFirstWriterWins(f.input)).toThrow();
  });

  it.each(['actual-call', 'usage', 'closure', 'contract', 'snapshot'] as const)('rejects fresh %s corruption after a valid first decision', async artifact => {
    const f = await fixture(); writeLlmAcceptanceDecisionBindingFirstWriterWins(f.input);
    await f.corrupt(artifact);
    expect(verifyExactLlmAcceptanceDecision(f.projectRoot, f.decision, f.binding)).toBe(false);
  });

  it('rejects immutable-source omission on capture replay and reads exact envelope bytes', async () => {
    const f = await fixture();
    expect(Buffer.from(readCrossVerifyEvidenceBlobBytes(f.projectRoot, f.ref, bindingPath)).toString('utf8'))
      .toBe(canonicalAcceptanceConfirmationJson(f.binding));
    expect(() => captureCrossVerifyEvidenceSnapshotAtomic({ projectRoot: f.projectRoot, settlementRef: f.ref,
      claim: f.evidenceClaim })).toThrow('Immutable evidence source cannot be omitted, added, or replaced after claim');
  });

  it('cannot add immutable custody authority to a legacy project-file claim on replay', async () => {
    const f = await fixture({ unbound: true });
    expect(() => captureCrossVerifyEvidenceSnapshotAtomic({ projectRoot: f.projectRoot, settlementRef: f.ref,
      claim: f.evidenceClaim, immutableSource: f.source }))
      .toThrow('Immutable evidence source cannot be omitted, added, or replaced after claim');
  });
});
