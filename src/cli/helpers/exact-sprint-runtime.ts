import { bootstrapApprovalAuthority } from '../../core/approval-authority-bootstrap.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../core/provider-authority-composition.js';
import { SprintStatus } from '../../core/types.js';
import {
  createCanonicalExactSprintExecutor,
  type CanonicalExactSprintExecutor,
  type ExactStartAuthorizationVerifier,
} from '../../orchestra/exact-plan-start-service.js';
import { captureGitBase } from '../../orchestra/run-diff-service.js';
import { getRunFlowCoordinator } from '../../orchestra/run-flow-coordinator-registry.js';
import { runSprint as runSprintLifecycle } from '../../orchestra/sprint-controller.js';

export interface LiveExactSprintExecutorInput {
  readonly providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  readonly approvalAuthority?: ReturnType<typeof bootstrapApprovalAuthority>;
  readonly verifyStartAuthorization?: ExactStartAuthorizationVerifier;
}

/**
 * Production composition for an exact, approved Sprint executed in-process.
 * The canonical start-attempt journal is settled before the matching Flow
 * terminal event is published; publication uncertainty therefore holds the
 * caller without rewriting or concealing the settled attempt truth.
 */
export function createLiveExactSprintExecutor(
  input: LiveExactSprintExecutorInput,
): CanonicalExactSprintExecutor {
  return createCanonicalExactSprintExecutor({
    executeInProcess: async (context) => {
      const gitBase = await captureGitBase(context.projectRoot);
      const sprint = await runSprintLifecycle(
        context.projectRoot,
        { ...context.config, deckent_style: 'sprint' },
        {
          preplannedSprint: context.sprint,
          exactPlanAuthority: {
            ...context.exactRef,
            ...(context.snapshot.sourceAuthority !== undefined
              ? { sourceAuthority: context.snapshot.sourceAuthority }
              : {}),
          },
          flowId: context.exactRef.flowId,
          onExactPlanMaterialize: (_sprint, options) => context.onExactPlanMaterialize(options),
          onExecutionAdmitted: (sprint) => {
            context.onExecutionAdmitted({
              flowId: context.exactRef.flowId,
              jobId: sprint.id,
              logRef: sprint.id,
            }, gitBase);
          },
          ...(input.providerAuthority ? { providerAuthority: input.providerAuthority } : {}),
          ...(input.approvalAuthority?.state === 'ready'
            ? {
                attendedExecutionApprovalAuthority:
                  input.approvalAuthority.runtime.attendedExecutionApprovalAuthority,
              }
            : {}),
        },
      );
      return sprint.status === SprintStatus.COMPLETE
        ? { terminalState: 'COMPLETED', reasonCode: 'SPRINT_COMPLETE' }
        : sprint.status === SprintStatus.ABORTED
          ? { terminalState: 'CANCELLED', reasonCode: 'SPRINT_ABORTED' }
          : { terminalState: 'BLOCKED', reasonCode: `SPRINT_${sprint.status}` };
    },
    spawnDetached: () => {
      throw new Error('LIVE_EXACT_SPRINT_DETACHED_EXECUTOR_UNWIRED');
    },
    ...(input.verifyStartAuthorization
      ? { verifyStartAuthorization: input.verifyStartAuthorization }
      : {}),
    lifecycle: {
      publishStartRequested: ({ projectRoot, exactRef, attempt }) => {
        getRunFlowCoordinator(projectRoot).requestStart({
          flowId: exactRef.flowId,
          revision: exactRef.revision,
          planDigest: exactRef.planDigest,
          commandId: `exact-start:${attempt.attemptId}:requested`,
        });
      },
      publishRunStarted: ({ projectRoot, attempt, handle }) => {
        getRunFlowCoordinator(projectRoot).recordRunStarted({
          handle,
          commandId: `exact-start:${attempt.attemptId}:admitted`,
        });
      },
      publishSettlement: ({ projectRoot, exactRef, attempt, settlement }) => {
        const coordinator = getRunFlowCoordinator(projectRoot);
        const commandId = `exact-start:${attempt.attemptId}:settled:${settlement.state}`;
        let projectedState: string;
        switch (settlement.state) {
          case 'COMPLETED':
            projectedState = coordinator.recordCompletion({
              flowId: exactRef.flowId,
              summary: settlement.detail ?? settlement.code,
              commandId,
            }).context.state;
            break;
          case 'FAILED':
            projectedState = coordinator.recordRunFailure({
              flowId: exactRef.flowId,
              error: settlement.detail ?? settlement.code,
              commandId,
            }).context.state;
            break;
          case 'BLOCKED':
            projectedState = coordinator.recordRunPaused({
              flowId: exactRef.flowId,
              reason: settlement.detail ?? settlement.code,
              commandId,
            }).context.state;
            break;
          case 'CANCELLED':
            projectedState = coordinator.abortFlow({
              flowId: exactRef.flowId,
              reason: settlement.detail ?? settlement.code,
              commandId,
            }).context.state;
            break;
          case 'UNKNOWN':
            throw new Error(
              `EXACT_START_LIFECYCLE_STATE_UNKNOWN:${exactRef.flowId}:${attempt.attemptId}`,
            );
          default: {
            const unreachable: never = settlement.state;
            throw new Error(`EXACT_START_SETTLEMENT_STATE_UNSUPPORTED:${unreachable}`);
          }
        }
        if (projectedState !== settlement.state) {
          throw new Error(
            `EXACT_START_LIFECYCLE_STATE_MISMATCH:${exactRef.flowId}:${settlement.state}:${projectedState}`,
          );
        }
      },
    },
  });
}
