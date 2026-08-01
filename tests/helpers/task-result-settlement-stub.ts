/**
 * Settlement-out-of-scope seam for Docker unit suites that replace all of
 * `node:fs`. Real host-authority persistence is covered by the tmpdir-backed
 * task-result-settlement and docker-backend-owned-settlement suites.
 */
import { createHash } from 'node:crypto';
import { vi } from 'vitest';

export function createTaskResultSettlementModuleStub(): Record<string, unknown> {
  const labels = {
    managed: 'io.deckent.managed',
    project: 'io.deckent.project',
    task: 'io.deckent.task',
    attempt: 'io.deckent.attempt',
  } as const;
  const refFor = (taskId: string) => ({
    schemaVersion: 1 as const,
    taskId,
    backend: 'docker' as const,
    projectRootSha256: 'a'.repeat(64),
    attemptId: '00000000-0000-4000-8000-000000000001',
  });
  const promptArtifacts = new Map<string, Record<string, unknown>>();
  const executionContracts = new Map<string, Record<string, unknown>>();
  const executionBudgetAuthorities = new Map<string, Record<string, unknown>>();
  const preparedAttempts = new Map<string, Record<string, unknown>>();
  const dispatchedAttempts = new Map<string, Record<string, unknown>>();
  const keyFor = (ref: ReturnType<typeof refFor>) => `${ref.taskId}\0${ref.attemptId}`;

  return {
    DOCKER_ATTEMPT_LABELS: labels,
    assertTaskResultSettlementRef: (): void => undefined,
    claimTaskResultSettlementAttemptAtomic: (): void => undefined,
    createTaskResultSettlement: (input: {
      ref: ReturnType<typeof refFor>;
      exitCode: number | null;
      result: Record<string, unknown>;
    }) => ({
      ...input.ref,
      state: 'settled',
      settledAt: '2026-07-23T00:00:00.000Z',
      exitCode: input.exitCode,
      resultSha256: 'b'.repeat(64),
      result: input.result,
    }),
    createTaskResultSettlementRef: (_root: string, taskId: string) => refFor(taskId),
    dockerAttemptLabels: (ref: ReturnType<typeof refFor>) => ({
      [labels.managed]: 'true',
      [labels.project]: ref.projectRootSha256,
      [labels.task]: 'c'.repeat(64),
      [labels.attempt]: ref.attemptId,
    }),
    dockerContainerNameForTask: () => `deckent-w-${'d'.repeat(12)}-${'e'.repeat(16)}`,
    listPendingTaskResultSettlementAttempts: () => [],
    readTaskProviderTerminalBillingReceipt: () => null,
    readTaskProviderActualCallReceipt: () => null,
    readTaskProviderTerminalUsageReceipt: () => null,
    readTaskResultSettlementExecutionContract: vi.fn(
      (ref: ReturnType<typeof refFor>) =>
        executionContracts.get(keyFor(ref)) ?? null,
    ),
    readTaskResultSettlementExecutionBudgetAuthority: vi.fn(
      (ref: ReturnType<typeof refFor>) =>
        executionBudgetAuthorities.get(keyFor(ref)) ?? null,
    ),
    readTaskResultSettlement: () => ({ state: 'settled' }),
    readTaskResultSettlementClosure: () => null,
    readTaskResultSettlementDispatch: (ref: ReturnType<typeof refFor>) =>
      dispatchedAttempts.get(keyFor(ref)) ?? null,
    readTaskResultSettlementPrepared: (ref: ReturnType<typeof refFor>) =>
      preparedAttempts.get(keyFor(ref)) ?? null,
    readTaskResultSettlementPrompt: vi.fn((ref: ReturnType<typeof refFor>) =>
      promptArtifacts.get(keyFor(ref)) ?? null),
    taskResultSettlementPromptEvidenceRef: (artifact: { promptSha256: string }) =>
      `task-result-prompt:${artifact.promptSha256}`,
    taskResultSettlementPromptPath: (ref: ReturnType<typeof refFor>) =>
      `/host-state/task-result-settlements/${ref.taskId}/${ref.attemptId}/prompt.txt`,
    taskResultSettlementActiveClaimDigest: (ref: ReturnType<typeof refFor>) =>
      createHash('sha256').update(`${ref.taskId}\0${ref.attemptId}`).digest('hex'),
    taskResultSettlementAttemptPath: (ref: ReturnType<typeof refFor>) =>
      `/host-state/task-result-settlements/${ref.taskId}/${ref.attemptId}/attempt.json`,
    taskResultSettlementWorkAttributionBaselinePath: (ref: ReturnType<typeof refFor>) =>
      `/host-state/task-result-settlements/${ref.taskId}/${ref.attemptId}/work-attribution-baseline.txt`,
    writeTaskResultSettlementWorkAttributionBaselineAtomic: (ref: ReturnType<typeof refFor>) =>
      `/host-state/task-result-settlements/${ref.taskId}/${ref.attemptId}/work-attribution-baseline.txt`,
    writeTaskResultSettlementAttemptAtomic: (): void => undefined,
    writeTaskResultSettlementAtomic: (): void => undefined,
    writeTaskResultSettlementClosureAtomic: (): void => undefined,
    writeTaskResultSettlementDispatchAtomic: (
      ref: ReturnType<typeof refFor>,
      containerId: string,
    ) => {
      const prepared = preparedAttempts.get(keyFor(ref)) ?? {};
      const dispatch = { ...ref, ...prepared, state: 'dispatched', containerId };
      dispatchedAttempts.set(keyFor(ref), dispatch);
      return dispatch;
    },
    writeTaskProviderActualCallReceiptAtomic: () => ({}),
    writeTaskProviderTerminalUsageReceiptAtomic: () => ({}),
    writeTaskResultSettlementExecutionContractAtomic: (
      ref: ReturnType<typeof refFor>,
      contract: Record<string, unknown>,
    ) => {
      executionContracts.set(keyFor(ref), contract);
      return contract;
    },
    writeTaskResultSettlementExecutionBudgetAuthorityAtomic: (
      ref: ReturnType<typeof refFor>,
      input: Record<string, unknown>,
    ) => {
      const authority = { ...ref, ...input, state: 'execution-budget-authority' };
      executionBudgetAuthorities.set(keyFor(ref), authority);
      return authority;
    },
    writeTaskResultSettlementPreparedAtomic: (
      ref: ReturnType<typeof refFor>,
      model: string,
    ) => {
      const prepared = { ...ref, state: 'prepared', model };
      preparedAttempts.set(keyFor(ref), prepared);
      return prepared;
    },
    writeTaskResultSettlementPromptAtomic: (
      ref: ReturnType<typeof refFor>,
      prompt: string,
    ) => {
      const promptSha256 = createHash('sha256').update(prompt).digest('hex');
      const artifact = {
        ...ref,
        state: 'prompt-prepared',
        promptSha256,
        byteLength: Buffer.byteLength(prompt),
      };
      promptArtifacts.set(keyFor(ref), artifact);
      return artifact;
    },
  };
}
