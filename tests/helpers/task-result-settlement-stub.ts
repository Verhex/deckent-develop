/**
 * Settlement-out-of-scope seam for Docker unit suites that replace all of
 * `node:fs`. Real host-authority persistence is covered by the tmpdir-backed
 * task-result-settlement and docker-backend-owned-settlement suites.
 */
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
    readTaskResultSettlement: () => ({ state: 'settled' }),
    readTaskResultSettlementClosure: () => null,
    writeTaskResultSettlementAttemptAtomic: (): void => undefined,
    writeTaskResultSettlementAtomic: (): void => undefined,
    writeTaskResultSettlementClosureAtomic: (): void => undefined,
    writeTaskResultSettlementDispatchAtomic: (): void => undefined,
    writeTaskResultSettlementPreparedAtomic: (): void => undefined,
  };
}
