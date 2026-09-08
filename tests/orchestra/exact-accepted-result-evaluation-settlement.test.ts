import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { createGoNoGoCriterionItem } from '../../src/core/task-types.js';
import { TaskEvaluation } from '../../src/core/types.js';
import { createExactAcceptanceVerificationSourceV2, readExactAcceptanceVerificationSourceV2 } from '../../src/orchestra/exact-acceptance-evidence.js';
import { produceExactAcceptanceFixtureEffectsV2, EXACT_ACCEPTANCE_FIXTURE_PATH,
  EXACT_ACCEPTANCE_FIXTURE_FINAL } from '../helpers/exact-acceptance-evidence-fixture.js';
import { createExactAcceptanceVerifierFixture } from '../helpers/exact-acceptance-verifier-fixture.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { confirmExactAcceptance, openAcceptanceConfirmationComposition } from '../../src/orchestra/acceptance-confirmation-composition.js';
import { writeLlmAcceptanceDecisionBindingFirstWriterWins } from '../../src/core/acceptance-decision-authority.js';
import { settleConfirmation } from '../../src/core/confirmation-store.js';
import { settleAcceptanceConfirmation } from '../../src/orchestra/acceptance-confirmation-service.js';
import { taskProviderActualCallReceiptPath } from '../../src/core/task-result-settlement.js';

import {
  canonicalTaskAttemptCustodyJson,
  type Sha256Digest,
} from '../../src/core/task-attempt-custody-store.js';
import { createExactAcceptedTaskResultRefV2 } from '../../src/core/task-settlement-authority.js';
import {
  readExactAcceptedTaskTerminalAuthority,
  settleExactAcceptedTaskEvaluation,
  type SettleExactAcceptedTaskEvaluationInput,
} from '../../src/orchestra/evaluation-audit-trail.js';
import { readExactDockerTrustedTaskWorkProjection } from '../../src/orchestra/spawn-backend-docker.js';
import {
  buildFinalizerTerminalTruth,
  projectFinalizerTrustedWorkVector,
} from '../../src/orchestra/sprint-finalizer.js';
import { buildFilesChangedCostSection } from '../../src/orchestra/sprint-reporter.js';
import {
  exactDockerDispatchCanonicalDigest,
  parseExactDockerDispatchTaskSnapshotAuthority,
  parseExactDockerDispatchTaskMaterial,
} from '../../src/orchestra/exact-docker-dispatch-task-authority.js';
import { parseExactNormalTaskApprovedMaterialV3 } from '../../src/orchestra/exact-evaluation-policy-authority.js';
import { readExactAcceptedTaskResultV2 } from '../../src/orchestra/task-result-authority.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';

const digest = (character: string): Sha256Digest => `sha256:${character.repeat(64)}`;

function settleWithCustodyDiagnostics(request: SettleExactAcceptedTaskEvaluationInput) {
  const store = request.custodyStore;
  const diagnostics: Array<Record<string, unknown>> = [];
  const restores: Array<() => void> = [];
  const observedChainTimes = new Map<string, string>();
  const token = (value: unknown): string | undefined =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(value) ? value : undefined;
  const timestamp = (value: unknown): string | undefined =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
      ? value : undefined;
  const field = (value: unknown, key: string): unknown => value && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
  try {
    for (const method of ['readAdmission', 'readTaskSnapshot', 'readArtifactReceipt',
      'readVerifiedArtifact', 'readVerifiedEffectLanding', 'readChain',
      'publishHostArtifact', 'appendChain'] as const) {
      const original = store[method];
      const descriptor = Object.getOwnPropertyDescriptor(store, method);
      restores.push(() => {
        if (descriptor) Object.defineProperty(store, method, descriptor);
        else Reflect.deleteProperty(store, method);
      });
      Object.defineProperty(store, method, { configurable: true, writable: true,
        value: (...args: unknown[]) => {
          const stage = token(method === 'readChain' ? args[2] : field(args[0], 'stage'));
          try {
            const result = Reflect.apply(original, store, args);
            const occurredAt = timestamp(field(result, 'occurredAt'));
            if (method === 'readChain' && stage && occurredAt) observedChainTimes.set(stage, occurredAt);
            return result;
          } catch (error) {
            if (diagnostics.length < 8) {
              const artifact = field(args[0], 'artifactReceipt');
              const stack = field(error, 'stack');
              // Emit only the canonical source basename's numeric location, never raw stack/path/message.
              const locations = typeof stack === 'string'
                ? Array.from(stack.matchAll(/task-attempt-custody-store\.(?:ts|js):(\d+):(\d+)/gu))
                  .slice(0, 4).map(match => ({ line: Number(match[1]), column: Number(match[2]) })) : [];
              diagnostics.push({ method, code: token(field(error, 'code')),
                operation: token(field(error, 'operation')), stage,
                artifactClass: token(field(args[0], 'artifactClass') ?? field(artifact, 'artifactClass')),
                capturedAt: timestamp(field(args[0], 'capturedAt') ?? field(artifact, 'capturedAt')),
                occurredAt: timestamp(field(args[0], 'occurredAt')),
                observedChainTimes: Object.fromEntries(observedChainTimes),
                custodySourceLocations: locations });
            }
            throw error;
          }
        },
      });
    }
    return { settled: settleExactAcceptedTaskEvaluation(request), diagnostics };
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

afterEach(() => vi.restoreAllMocks());
const exactCleanups: Array<() => Promise<void>> = [];
const previousDeckentHome = process.env.DECKENT_HOME;
afterEach(async () => {
  if (previousDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = previousDeckentHome;
  await Promise.all(exactCleanups.splice(0).map(cleanup => cleanup()));
});

async function semanticAcceptedInput(): Promise<{
  request: SettleExactAcceptedTaskEvaluationInput;
  task: NonNullable<ReturnType<typeof parseExactDockerDispatchTaskMaterial>>;
  readDebt: (id: string, tenantId: string) => ReturnType<MemoryStore['getById']>;
}> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'exact-acceptance-t11-'));
  exactCleanups.push(() => rm(fixtureRoot, { recursive: true, force: true }));
  const projectRoot = join(fixtureRoot, 'project');
  await mkdir(projectRoot);
  process.env.DECKENT_HOME = join(fixtureRoot, 'fixture-state');
  await mkdir(join(projectRoot, '.brain'));
  new MemoryStore(join(projectRoot, '.brain', 'memory.db')).close();
  const fixture = await createTaskResultSettlementV2Fixture({ terminal: 'accepted-only',
    projectRoot, tailArtifactKey: 'semantic-t11', reserveDispatch: true,
    taskOverrides: { type: 'documentation', provider: 'codex',
      scope: { directories: [], filesRead: [EXACT_ACCEPTANCE_FIXTURE_PATH], filesWrite: [EXACT_ACCEPTANCE_FIXTURE_PATH] },
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: 'none', items: [
        createGoNoGoCriterionItem({ polarity: 'go', statement: 'Append the exact new line while preserving the original prefix.',
          evidenceRequirements: ['assertion:"The original prefix is preserved and the requested line is appended."'] }),
        createGoNoGoCriterionItem({ polarity: 'no-go', statement: 'Existing content was removed or replaced.',
          evidenceRequirements: ['assertion:"Existing content was removed or replaced."'] }),
      ] },
    },
    evaluationConfig: { acceptance_enforcement: 'enforce' },
    filesChanged: [EXACT_ACCEPTANCE_FIXTURE_PATH], effectProducer: produceExactAcceptanceFixtureEffectsV2,
  });
  const snapshot = fixture.store.readTaskSnapshot({ identity: fixture.identity, policy: fixture.policy,
    admissionReceiptDigest: fixture.admission.receiptDigest });
  expect(snapshot).not.toBeNull();
  const material = JSON.parse(Buffer.from(snapshot!.bytes).toString('utf8')).material;
  const parsedTask = parseExactDockerDispatchTaskMaterial(material.dispatch, fixture.policy);
  expect(parsedTask, JSON.stringify(material.dispatch)).not.toBeNull();
  expect(parseExactNormalTaskApprovedMaterialV3({ value: material.approved, expectedTask: parsedTask!,
    expectedDispatchTaskMaterialDigest: material.dispatchSha256, policy: fixture.policy }), JSON.stringify(material.approved)).not.toBeNull();
  const accepted = readExactAcceptedTaskResultV2({ executionMode: 'normal-docker', authorityKind: 'accepted-result',
    projectRoot, taskId: fixture.identity.taskId, custodyStore: fixture.store, policy: fixture.policy,
    expectedIdentity: fixture.identity, admission: fixture.admission,
    acceptedResultRef: createExactAcceptedTaskResultRefV2(fixture.acceptedResultArtifact),
    expectedAcceptedResultChainDigest: fixture.acceptedResultChain.receiptDigest });
  if (accepted.state !== 'exact-accepted' || !accepted.exactAcceptedAuthority) {
    throw new Error(`semantic accepted fixture unavailable: ${accepted.state}`);
  }
  return {
    request: { projectRoot, acceptedAuthority: accepted.exactAcceptedAuthority, custodyStore: fixture.store, policy: fixture.policy },
    task: parsedTask!,
    readDebt: (id, tenantId) => {
      const memory = new MemoryStore(join(projectRoot, '.brain', 'memory.db'));
      try { return memory.getById(id, { tenantId }); }
      finally { memory.close(); }
    },
  };
}

describe('exact semantic acceptance production custody', () => {
  it('folds only the finalizer trusted work vector while preserving the legacy reporter path', () => {
    const workResult = (
      taskId: string,
      attemptId: string,
      filesChanged: string[],
      linesAdded: number,
      linesRemoved: number,
    ) => ({
      taskId,
      workerId: `worker-${taskId}`,
      filesChanged,
      linesAdded,
      linesRemoved,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'legacy exact attribution fixture',
      workAttribution: {
        state: 'VERIFIED' as const,
        attemptId,
        baselineRef: `task-result-work-attribution-baseline:sha256:${'a'.repeat(64)}`,
        baselineSha256: 'a'.repeat(64),
        scopeDigest: 'b'.repeat(64),
      },
    });
    const originalTask = {
      id: 'logical-root',
      title: 'original',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
    };
    const fixTask = { ...originalTask, id: 'logical-root-fix', fixForTaskId: 'logical-root' };
    const original = workResult(
      originalTask.id,
      'attempt-original',
      ['docs/original.md'],
      4,
      1,
    );
    const fix = workResult(
      fixTask.id,
      'attempt-fix',
      ['docs/original.md', 'docs/fix.md'],
      7,
      2,
    );
    const terminalTruth = buildFinalizerTerminalTruth({
      tasks: [originalTask, fixTask] as never,
      evaluations: new Map([
        [originalTask.id, TaskEvaluation.NO_GO],
        [fixTask.id, TaskEvaluation.DONE],
      ]),
      results: [original, fix] as never,
    });
    const trustedWork = projectFinalizerTrustedWorkVector(terminalTruth);
    expect(trustedWork.entries).toMatchObject([
      { logicalTaskId: originalTask.id, attemptId: 'attempt-original' },
      { logicalTaskId: originalTask.id, attemptId: 'attempt-fix' },
    ]);
    const publicResults = [{
      filesChanged: ['docs/public-claim.md'],
      linesAdded: 99,
      linesRemoved: 88,
      cost: { usd: 2.5 },
      workAttribution: { state: 'VERIFIED' as const },
    }];
    const trusted = buildFilesChangedCostSection(publicResults, { trustedWork });
    expect(trusted).toContain('- Files changed: 2');
    expect(trusted).toContain('- Lines: +11 / -3');
    expect(trusted).toContain('- Task cost: $2.5000');
    expect(trusted).not.toContain('public-claim');

    const legacy = buildFilesChangedCostSection(publicResults, {
      requireVerifiedAttribution: true,
    });
    expect(legacy).toContain('- Files changed: 1');
    expect(legacy).toContain('- Lines: +99 / -88');
    expect(legacy).toContain('- Task cost: $2.5000');
  });

  it('settles genuine semantic custody with a Date-only frozen wall clock without future fixture receipts', async () => {
    const frozenAt = new Date();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(frozenAt);
    try {
      const { request } = await semanticAcceptedInput();
      const acceptedChain = request.custodyStore.readChain(
        request.acceptedAuthority.identity, request.policy, 'accepted-result');
      expect(acceptedChain).not.toBeNull();
      expect(Date.parse(acceptedChain!.occurredAt)).toBeLessThanOrEqual(frozenAt.getTime());
      const routed = settleExactAcceptedTaskEvaluation(request);
      expect(routed.state, JSON.stringify(routed)).toBe('route-required');
      if (routed.state !== 'route-required') return;
      const source = createExactAcceptanceVerificationSourceV2({ ...request, routeClaim: routed.enforcement.routeClaim });
      const verifier = await createExactAcceptanceVerifierFixture({ projectRoot: request.projectRoot, source });
      await expect(confirmExactAcceptance({ projectRoot: request.projectRoot, source,
        enforcement: routed.enforcement, lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
        runVerifier: async () => verifier.outcome })).resolves.toEqual({ state: 'applied' });
      const { settled, diagnostics } = settleWithCustodyDiagnostics(request);
      expect(settled.state, JSON.stringify({ frozenAt: frozenAt.toISOString(), settled, diagnostics })).toBe('settled');
      if (settled.state === 'settled') {
        expect(readExactAcceptedTaskTerminalAuthority({ ...request, settlementRef: settled.settlementRef,
          expectedSettlementDigest: settled.settlementDigest }).state).toBe('current');
      }
    } finally { vi.useRealTimers(); }
  }, 120_000);

  it('rederives the producer route from real Store lifecycle and immutable landed bytes before any terminal write', async () => {
    const { request } = await semanticAcceptedInput();
    const routed = settleExactAcceptedTaskEvaluation(request);
    expect(routed.state, JSON.stringify(routed)).toBe('route-required');
    if (routed.state !== 'route-required') return;
    const source = createExactAcceptanceVerificationSourceV2({ ...request, routeClaim: routed.enforcement.routeClaim });
    const evidence = readExactAcceptanceVerificationSourceV2(source);
    expect(evidence.state, JSON.stringify(evidence)).toBe('ready');
    if (evidence.state !== 'ready') return;
    expect(evidence.binding.routeClaimDigest).toBe(routed.enforcement.routeClaim.claimDigest);
    expect(Buffer.from(evidence.evidence.find(entry => entry.relativePath === EXACT_ACCEPTANCE_FIXTURE_PATH)!.bytes).toString('utf8'))
      .toBe(EXACT_ACCEPTANCE_FIXTURE_FINAL);
    expect(request.custodyStore.readChain(request.acceptedAuthority.identity, request.policy, 'evaluation')).toBeNull();
    expect(request.custodyStore.readChain(request.acceptedAuthority.identity, request.policy, 'settlement')).toBeNull();
  }, 120_000);

  it('applies a bound durable verifier decision, settles T11, and rejects missing actual-call evidence on terminal reread', async () => {
    const { request, task } = await semanticAcceptedInput();
    const routed = settleExactAcceptedTaskEvaluation(request);
    expect(routed.state).toBe('route-required');
    if (routed.state !== 'route-required') return;
    const source = createExactAcceptanceVerificationSourceV2({ ...request, routeClaim: routed.enforcement.routeClaim });
    const verifier = await createExactAcceptanceVerifierFixture({ projectRoot: request.projectRoot, source });
    const runVerifier = vi.fn(async () => verifier.outcome);
    const confirmation = { projectRoot: request.projectRoot, source, enforcement: routed.enforcement,
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }), runVerifier };
    await expect(confirmExactAcceptance(confirmation)).resolves.toEqual({ state: 'applied' });
    expect(runVerifier).toHaveBeenCalledTimes(1);
    await expect(confirmExactAcceptance(confirmation)).resolves.toEqual({ state: 'applied' });
    expect(runVerifier).toHaveBeenCalledTimes(1);
    const settled = settleExactAcceptedTaskEvaluation(request);
    expect(settled.state, JSON.stringify(settled)).toBe('settled');
    if (settled.state !== 'settled') return;
    const terminalInput = { ...request, settlementRef: settled.settlementRef, expectedSettlementDigest: settled.settlementDigest };
    const current = readExactAcceptedTaskTerminalAuthority(terminalInput);
    expect(current.state).toBe('current');
    if (current.state !== 'current') return;
    expect(readExactDockerTrustedTaskWorkProjection(current)).toBeNull();
    const cloned = structuredClone(current);
    expect(readExactDockerTrustedTaskWorkProjection(cloned)).toBeNull();
    const noPrefix = structuredClone(current);
    (noPrefix as unknown as { result: { workAttribution: unknown } }).result.workAttribution = {
      state: 'VERIFIED',
      attemptId: current.terminalAuthority.acceptedAuthority.identity.attemptId,
      baselineRef: 'worker-asserted-baseline',
      baselineSha256: 'a'.repeat(64),
      scopeDigest: 'b'.repeat(64),
    };
    expect(readExactDockerTrustedTaskWorkProjection(noPrefix)).toBeNull();
    const sibling = structuredClone(current);
    (sibling as unknown as { result: { taskId: string } }).result.taskId =
      `${current.result.taskId}-sibling`;
    expect(readExactDockerTrustedTaskWorkProjection(sibling)).toBeNull();

    const forgedPublicResult = {
      ...current.projectedResult,
      filesChanged: ['docs/forged-public-claim.md'],
      linesAdded: 9,
      linesRemoved: 1,
      workAttribution: {
        state: 'VERIFIED' as const,
        attemptId: current.terminalAuthority.acceptedAuthority.identity.attemptId,
        baselineRef: `task-result-work-attribution-baseline:sha256:${'a'.repeat(64)}`,
        baselineSha256: 'a'.repeat(64),
        scopeDigest: 'b'.repeat(64),
      },
    };

    const truth = buildFinalizerTerminalTruth({
      tasks: [task],
      evaluations: new Map(),
      results: [forgedPublicResult],
      exactTerminalAuthorities: new Map([[task.id, current]]),
    });
    expect(truth.attempts).toHaveLength(1);
    expect(truth.attempts[0]?.attribution).toEqual({
      state: 'HOLD',
      reasonCode: 'EXACT_WORK_ATTRIBUTION_AUTHORITY_MISSING',
    });
    expect(truth.terminalEvidence.cleanupEligibility).toMatchObject({ candidate: false });
    // Hermetic corruption boundary: a previously genuine verifier call disappears.
    // The accepted worker result and all host settlement receipts remain untouched.
    const callEvidencePath = taskProviderActualCallReceiptPath(verifier.ref);
    const callEvidenceRelativePath = relative(join(dirname(request.projectRoot), 'fixture-state'), callEvidencePath);
    expect(isAbsolute(callEvidenceRelativePath)).toBe(false);
    expect(callEvidenceRelativePath.split(/[\\/]/u)).not.toContain('..');
    await rm(callEvidencePath);
    expect(readExactAcceptedTaskTerminalAuthority(terminalInput).state).toBe('hold');
  }, 120_000);

  it.each(['binding-only', 'decision-only', 'prepared', 'debt-resolved'] as const)(
    'reconciles the %s restart cut without a second verifier dispatch', async cut => {
      const { request, readDebt } = await semanticAcceptedInput();
      const routed = settleExactAcceptedTaskEvaluation(request);
      expect(routed.state).toBe('route-required');
      if (routed.state !== 'route-required') return;
      const source = createExactAcceptanceVerificationSourceV2({ ...request, routeClaim: routed.enforcement.routeClaim });
      const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
      const confirmation = { projectRoot: request.projectRoot, source, enforcement: routed.enforcement, lifecycle };
      await expect(confirmExactAcceptance({ ...confirmation, runVerifier: async () => ({ ran: false }) }))
        .resolves.toMatchObject({ state: 'hold' });
      const verifier = await createExactAcceptanceVerifierFixture({ projectRoot: request.projectRoot, source });
      const binding = verifier.binding;
      writeLlmAcceptanceDecisionBindingFirstWriterWins({ projectRoot: request.projectRoot,
        confirmationId: binding.confirmationId, lineage: binding.lineage, verdict: 'CONFIRMED',
        receiptRef: verifier.receiptRef, settlementRef: verifier.ref, exactBinding: binding });
      if (cut !== 'binding-only') {
        const decidedAt = new Date().toISOString();
        settleConfirmation(request.projectRoot, binding.confirmationId, { verdict: 'CONFIRMED', decidedBy: 'llm',
          reason: 'exact-acceptance-verification', receipt: verifier.receiptRef, decidedAt },
        { lifecycle, clock: () => new Date(decidedAt) });
      }
      if (cut === 'prepared' || cut === 'debt-resolved') {
        const composition = openAcceptanceConfirmationComposition({ projectRoot: request.projectRoot,
          tenantId: binding.lineage.tenantId, projectId: binding.lineage.projectId, lifecycle,
          clock: () => new Date(), decisionAuthority: { branch: 'llm', projectRoot: request.projectRoot,
            readExactBinding: () => {
              const current = readExactAcceptanceVerificationSourceV2(source);
              return current.state === 'ready' ? current.binding : null;
            } } });
        try {
          if (cut === 'prepared') {
            // Inject only the crash boundary after genuine PREPARED publication.
            await expect(settleAcceptanceConfirmation({ ...composition.service,
              debts: { ...composition.service.debts, transitionExact: async () => 'not-found' as const } }, binding.confirmationId))
              .resolves.toMatchObject({ state: 'HOLD', reasonCode: 'DEBT_NOT_FOUND' });
          } else {
            // The production debt CAS succeeds; only the final receipt write crashes.
            await expect(settleAcceptanceConfirmation({ ...composition.service,
              receipts: { ...composition.service.receipts, appendFirstWriterWins: async receipt => {
                if (receipt.state === 'APPLIED') throw new Error('fixture-crash-before-applied');
                return composition.service.receipts.appendFirstWriterWins(receipt);
              } } }, binding.confirmationId)).rejects.toThrow('fixture-crash-before-applied');
            expect(readDebt(`debt-${binding.confirmationId}`, binding.lineage.tenantId))
              .toMatchObject({ status: 'resolved' });
            await expect(composition.service.receipts.read(binding.confirmationId, 'APPLIED')).resolves.toBeUndefined();
          }
        } finally { composition.close(); }
      }
      const runVerifier = vi.fn(async () => { throw new Error('unexpected duplicate verifier dispatch'); });
      await expect(confirmExactAcceptance({ ...confirmation, runVerifier })).resolves.toEqual({ state: 'applied' });
      expect(runVerifier).not.toHaveBeenCalled();
      const { settled, diagnostics } = settleWithCustodyDiagnostics(request);
      expect(settled.state, JSON.stringify({ settled, diagnostics })).toBe('settled');
      if (settled.state === 'settled') {
        expect(readExactAcceptedTaskTerminalAuthority({ ...request, settlementRef: settled.settlementRef,
          expectedSettlementDigest: settled.settlementDigest }).state).toBe('current');
      }
    }, 120_000,
  );

  it.each(['contradicted', 'undecidable'] as const)(
    'never promotes an %s semantic verifier outcome to accepted T11 authority', async status => {
      const { request } = await semanticAcceptedInput();
      const routed = settleExactAcceptedTaskEvaluation(request);
      expect(routed.state).toBe('route-required');
      if (routed.state !== 'route-required') return;
      const source = createExactAcceptanceVerificationSourceV2({ ...request, routeClaim: routed.enforcement.routeClaim });
      const verifier = await createExactAcceptanceVerifierFixture({ projectRoot: request.projectRoot, source, status });
      const confirmed = await confirmExactAcceptance({ projectRoot: request.projectRoot, source,
        enforcement: routed.enforcement, lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
        runVerifier: async () => verifier.outcome });
      const { settled: terminal, diagnostics } = settleWithCustodyDiagnostics(request);
      if (status === 'undecidable') {
        expect(confirmed.state).toBe('hold');
        expect(terminal.state).toBe('route-required');
        expect(request.custodyStore.readChain(request.acceptedAuthority.identity, request.policy, 'settlement')).toBeNull();
      } else {
        expect(confirmed.state, JSON.stringify(confirmed)).toBe('applied');
        expect(terminal.state, JSON.stringify({ terminal, diagnostics })).toBe('settled');
        if (terminal.state === 'settled') {
          expect(terminal.authority.terminalDecisionAuthority.evaluationReceipt.verdict).toBe('NO_GO');
        }
      }
    }, 120_000,
  );
});

function installProviderExitAuthority(
  fixture: ReturnType<typeof createTaskResultSettlementV2Fixture>,
): void {
  const snapshot = fixture.store.readTaskSnapshot({
    identity: fixture.identity,
    policy: fixture.policy,
    admissionReceiptDigest: fixture.admission.receiptDigest,
  });
  const taskAuthority = snapshot === null
    ? null
    : parseExactDockerDispatchTaskSnapshotAuthority(snapshot.bytes, fixture.policy);
  if (taskAuthority === null) throw new Error('fixture dispatch authority unavailable');
  const admissionRef = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'task-attempt-custody-dispatch-admission-ref' as const,
    state: 'admitted' as const,
    dispatchRequestId: taskAuthority.dispatchRequestId,
    dispatchRequestMaterialDigest: digest('1'),
    reservationReceiptDigest: digest('2'),
    identity: fixture.identity,
    admissionReceiptDigest: fixture.admission.receiptDigest,
    refDigest: digest('3'),
  });
  const observedAt = '2026-08-30T20:00:06.000Z';
  const waitEvidence = Object.freeze({
    admissionRefDigest: admissionRef.refDigest,
    containerId: 'container-fixture-001',
    exitCode: 0,
    dockerWaitProcessExitCode: 0,
    dockerWaitSignal: null,
    stdoutSha256: digest('4'),
    stderrSha256: digest('5'),
    observedAt,
  });
  const bytes = canonicalTaskAttemptCustodyJson({
    schemaVersion: 2,
    kind: 'exact-docker-provider-exit',
    ...waitEvidence,
    waitEvidenceDigest: exactDockerDispatchCanonicalDigest(waitEvidence, fixture.policy),
  }, fixture.policy.jsonBounds);
  vi.spyOn(fixture.store, 'readDispatchAdmission').mockImplementation(() => ({
    state: 'admitted',
    reservation: {
      receiptDigest: admissionRef.reservationReceiptDigest,
      dispatchRequestMaterialDigest: admissionRef.dispatchRequestMaterialDigest,
    },
    admission: fixture.admission,
    ref: admissionRef,
  }) as never);
  vi.spyOn(fixture.store, 'readDispatchAuthority').mockImplementation(() => ({
    state: 'terminal',
    reconciliation: null,
    authority: {
      state: 'RELEASED',
      admissionRef,
      backendExecutionId: 'container-fixture-001',
      providerExecutionAttempt: {
        providerExecutionAttemptId: 'provider-attempt-fixture-001',
        backendExecutionId: 'container-fixture-001',
        custodyIdentity: fixture.identity,
        admissionReceiptDigest: fixture.admission.receiptDigest,
      },
      releaseEvidence: { releasedAt: '2026-08-30T20:00:04.000Z' },
      recordedAt: '2026-08-30T20:00:04.000Z',
      projectionFence: digest('6'),
      receiptDigest: digest('7'),
    },
  }) as never);
  vi.spyOn(fixture.store, 'readDispatchObservationByClass').mockImplementation(() => ({
    receipt: {
      observedAt,
      receiptDigest: digest('8'),
      evidenceDigest: digest('9'),
    },
    bytes,
  }) as never);
}

function acceptedAuthority(key: string) {
  const fixture = createTaskResultSettlementV2Fixture({
    terminal: 'accepted-only',
    tailArtifactKey: key,
  });
  const acceptedResultRef = createExactAcceptedTaskResultRefV2(
    fixture.acceptedResultArtifact,
  );
  const read = readExactAcceptedTaskResultV2({
    executionMode: 'normal-docker',
    authorityKind: 'accepted-result',
    projectRoot: '/fixture/project',
    taskId: fixture.identity.taskId,
    custodyStore: fixture.store,
    policy: fixture.policy,
    expectedIdentity: fixture.identity,
    admission: fixture.admission,
    acceptedResultRef,
    expectedAcceptedResultChainDigest: fixture.acceptedResultChain.receiptDigest,
  });
  if (read.state !== 'exact-accepted' || read.exactAcceptedAuthority === undefined) {
    throw new Error(`fixture accepted authority unavailable: ${read.holdReason ?? read.state}`);
  }
  return { fixture, authority: read.exactAcceptedAuthority };
}

function input(key: string): SettleExactAcceptedTaskEvaluationInput {
  const { fixture, authority } = acceptedAuthority(key);
  installProviderExitAuthority(fixture);
  return {
    projectRoot: '/fixture/project',
    acceptedAuthority: authority,
    custodyStore: fixture.store,
    policy: fixture.policy,
  };
}

describe('exact accepted-result evaluation settlement', () => {
  it('re-reads the accepted result and admitted Task, then emits one durable terminal chain', () => {
    const request = input('t11-terminal');
    const { settled, diagnostics } = settleWithCustodyDiagnostics(request);
    expect(settled, JSON.stringify({ settled, diagnostics }))
      .toMatchObject({ state: 'settled' });
    if (settled.state !== 'settled') return;
    expect(settled.authority.acceptedAuthority).toEqual(request.acceptedAuthority);
    expect(settled.authority.terminalDecisionAuthority.evaluationReceipt.verdict)
      .toMatch(/^(DONE|GO_WITH_TECH_DEBT|NO_GO)$/u);
    const settlementChain = request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'settlement',
    );
    const archiveChain = request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'archive',
    );
    expect(archiveChain).toMatchObject({
      predecessorDigest: settlementChain?.receiptDigest,
      stage: 'archive',
    });
    const archiveArtifact = archiveChain === null ? null : request.custodyStore.readVerifiedArtifact({
      identity: request.acceptedAuthority.identity,
      policy: request.policy,
      artifactClass: 'archive-receipt',
      artifactKey: archiveChain.artifactKey,
      receiptDigest: archiveChain.artifactReceiptDigest,
    });
    expect(archiveArtifact).not.toBeNull();
    expect(archiveArtifact === null ? null : JSON.parse(
      Buffer.from(archiveArtifact.bytes).toString('utf8'),
    )).toMatchObject({
      kind: 'task-result-settlement-v2-archive',
      state: 'archived',
      identity: request.acceptedAuthority.identity,
      predecessorDigest: settlementChain?.receiptDigest,
      externalAuthorityRefs: [{
        authorityType: 'task-result-settlement-v2',
        digest: settled.settlementDigest,
      }],
    });

    const reread = readExactAcceptedTaskTerminalAuthority({
      projectRoot: request.projectRoot,
      acceptedAuthority: request.acceptedAuthority,
      custodyStore: request.custodyStore,
      policy: request.policy,
      settlementRef: settled.settlementRef,
      expectedSettlementDigest: settled.settlementDigest,
    });
    expect(reread.state).toBe('current');
    if (reread.state === 'current') {
      const landingChain = request.custodyStore.readChain(
        request.acceptedAuthority.identity,
        request.policy,
        'effect-landing',
      );
      const landing = landingChain === null ? null : request.custodyStore.readVerifiedEffectLanding({
        identity: request.acceptedAuthority.identity,
        policy: request.policy,
        artifactKey: landingChain.artifactKey,
      });
      expect(reread.evaluationReceipt).toMatchObject({
        productionWiringSettlementDigest: null,
        effectLandingReceiptDigest: landing?.landing.receiptDigest,
      });
      expect(reread.evaluationReceipt.effectLandingBindingDigest)
        .toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(reread.evaluationReceipt.evaluationPolicyDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(reread.evaluationReceipt.providerExitAuthorityDigest)
        .toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(reread.evaluationReceipt.criterionEvaluationAuthorityDigest)
        .toMatch(/^sha256:[a-f0-9]{64}$/u);
    }
    const second = settleExactAcceptedTaskEvaluation(request);
    expect(second.state).toBe('settled');
    if (second.state !== 'settled') return;
    expect(second.settlementDigest).toBe(settled.settlementDigest);
    expect(second.settlementRef).toEqual(settled.settlementRef);
    expect(second.authority).toEqual(settled.authority);
    expect(request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'archive',
    )?.receiptDigest).toBe(archiveChain?.receiptDigest);
  }, 120_000);

  it('keeps terminal chain timestamps causal when the host clock steps backward', () => {
    const request = input('t11-falling-clock');
    const publishHostArtifact = request.custodyStore.publishHostArtifact
      .bind(request.custodyStore);
    const steppedTimes = new Map([
      ['evaluation-receipt', '2026-09-05T16:40:03.000Z'],
      ['finalizer-receipt', '2026-09-05T16:40:02.000Z'],
      ['settlement-receipt', '2026-09-05T16:40:01.000Z'],
      ['archive-receipt', '2026-09-05T16:40:00.000Z'],
    ]);
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-05T16:40:04.000Z');
    const publishSpy = vi.spyOn(request.custodyStore, 'publishHostArtifact')
      .mockImplementation(next => {
        const published = publishHostArtifact(next);
        const stepped = steppedTimes.get(next.artifactClass);
        if (stepped) vi.setSystemTime(stepped);
        return published;
      });
    try {
      const { settled, diagnostics } = settleWithCustodyDiagnostics(request);
      expect(settled, JSON.stringify({ settled, diagnostics }))
        .toMatchObject({ state: 'settled' });
      const chainStages = [
        'accepted-result', 'evaluation', 'finalizer', 'settlement', 'archive',
      ] as const;
      const chainTimes = chainStages.map(stage => request.custodyStore.readChain(
        request.acceptedAuthority.identity,
        request.policy,
        stage,
      )?.occurredAt ?? '');
      expect(chainTimes.every((value, index) => index === 0
        || Date.parse(value) >= Date.parse(chainTimes[index - 1]!))).toBe(true);
    } finally {
      publishSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('adopts a durable evaluation artifact after a crash before chain publication', () => {
    const stage = 'evaluation' as const;
    const request = input('t11-partial-evaluation');
    const appendChain = request.custodyStore.appendChain.bind(request.custodyStore);
    let interrupted = false;
    const appendSpy = vi.spyOn(request.custodyStore, 'appendChain').mockImplementation(next => {
      if (!interrupted && next.stage === stage) {
        interrupted = true;
        throw new Error(`simulated-${stage}-chain-crash`);
      }
      return appendChain(next);
    });
    expect(settleExactAcceptedTaskEvaluation(request)).toEqual({
      state: 'hold',
      reasonCode: 'custody-hold',
    });
    appendSpy.mockRestore();

    const resumed = settleExactAcceptedTaskEvaluation(request);
    expect(interrupted).toBe(true);
    expect(resumed, JSON.stringify({
      resumed,
      evaluation: request.custodyStore.readChain(
        request.acceptedAuthority.identity,
        request.policy,
        'evaluation',
      )?.receiptDigest ?? null,
      finalizer: request.custodyStore.readChain(
        request.acceptedAuthority.identity,
        request.policy,
        'finalizer',
      )?.receiptDigest ?? null,
      settlement: request.custodyStore.readChain(
        request.acceptedAuthority.identity,
        request.policy,
        'settlement',
      )?.receiptDigest ?? null,
    })).toMatchObject({ state: 'settled' });
  }, 60_000);

  it('adopts a durable archive artifact after a crash before chain publication', () => {
    const request = input('t11-partial-archive');
    const appendChain = request.custodyStore.appendChain.bind(request.custodyStore);
    let interrupted = false;
    const appendSpy = vi.spyOn(request.custodyStore, 'appendChain').mockImplementation(next => {
      if (!interrupted && next.stage === 'archive') {
        interrupted = true;
        throw new Error('simulated-archive-chain-crash');
      }
      return appendChain(next);
    });
    expect(settleExactAcceptedTaskEvaluation(request)).toEqual({
      state: 'hold',
      reasonCode: 'custody-hold',
    });
    appendSpy.mockRestore();

    const { settled: resumed, diagnostics } = settleWithCustodyDiagnostics(request);
    expect(interrupted).toBe(true);
    expect(resumed, JSON.stringify({ resumed, diagnostics })).toMatchObject({ state: 'settled' });
    expect(request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'archive',
    )).toMatchObject({ stage: 'archive' });
  }, 60_000);

  it('rejects caller fields, accessors, and proxies before writing evaluation state', () => {
    const request = input('t11-forged-input');
    const forged = {
      ...request,
      result: { selfAssessment: 'DONE', totalScore: 100 },
      evaluation: { decision: 'DONE', totalScore: 100 },
    } as unknown as SettleExactAcceptedTaskEvaluationInput;
    expect(settleExactAcceptedTaskEvaluation(forged)).toEqual({
      state: 'hold',
      reasonCode: 'invalid-terminal-input',
    });
    expect(request.custodyStore.readChain(
      request.acceptedAuthority.identity,
      request.policy,
      'evaluation',
    )).toBeNull();
    let invoked = 0;
    const accessor = { ...request } as Record<string, unknown>;
    Object.defineProperty(accessor, 'projectRoot', {
      enumerable: true,
      get: () => {
        invoked += 1;
        return '/fixture/project';
      },
    });
    expect(settleExactAcceptedTaskEvaluation(
      accessor as unknown as SettleExactAcceptedTaskEvaluationInput,
    )).toEqual({ state: 'hold', reasonCode: 'invalid-terminal-input' });
    expect(invoked).toBe(0);

    const proxy = new Proxy(request, { get: (target, key, receiver) => {
      invoked += 1;
      return Reflect.get(target, key, receiver);
    } });
    expect(settleExactAcceptedTaskEvaluation(proxy)).toEqual({
      state: 'hold',
      reasonCode: 'invalid-terminal-input',
    });
    expect(invoked).toBe(0);
  });

  it('holds before evaluation when durable provider-exit authority is absent', () => {
    const { fixture, authority } = acceptedAuthority('t11-provider-exit-missing');
    expect(settleExactAcceptedTaskEvaluation({
      projectRoot: '/fixture/project',
      acceptedAuthority: authority,
      custodyStore: fixture.store,
      policy: fixture.policy,
    })).toEqual({
      state: 'hold',
      reasonCode: 'provider-exit-dispatch-admission-unavailable',
    });
    expect(fixture.store.readChain(fixture.identity, fixture.policy, 'evaluation')).toBeNull();
  });
});
