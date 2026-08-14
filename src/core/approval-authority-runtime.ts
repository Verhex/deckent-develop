import { realpathSync } from 'node:fs';
import { join } from 'node:path';

import { ApprovalBroker } from './approval-broker.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  type ApprovalDecisionCommand,
  type ApprovalDecisionIngressOutcome,
} from './approval-decision-ingress.js';
import { ApprovalStore } from './approval-store.js';
import {
  AttendedExecutionApprovalAuthority,
  attendedExecutionProjectId,
  createAttendedExecutionApprovalBinding,
  type AttendedExecutionApprovalExpectedDispatch,
} from './attended-execution-approval.js';
import type { ApprovalRequest, RequesterRole } from './approval-contract.js';
import {
  createAttendedExecutionProposalDigests,
  type AttendedExecutionProposalMaterial,
  type AttendedExecutionProposalReference,
} from './attended-execution-proposal.js';
import {
  ApprovalAuthorityKeyringError,
  defaultApprovalDecisionCustodyAdapter,
  type ApprovalDecisionCustodyAdapter,
  type ApprovalDecisionCustodyHandle,
} from './approval-authority-keyring.js';
import {
  ApprovalLiveSessionAuthority,
  ApprovalLiveSessionStore,
} from './approval-live-session.js';
import {
  OidcLiveApprovalAuthenticator,
  type ApprovalOidcAssertionVerifier,
  type ApprovalOidcPolicy,
} from './approval-oidc-authenticator.js';
import {
  LocalTerminalLiveApprovalAuthenticator,
  type LocalTerminalReauthenticationProvider,
} from './approval-terminal-authenticator.js';
import {
  normalizeGlobalScopePlatform,
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
  type GlobalScopePlatform,
} from './global-scope-resolver.js';
import { createExecutionAuthorityError } from './errors.js';

export type ApprovalAuthorityRuntimeHoldReason =
  | 'approval_authority_scope_unresolved'
  | 'approval_authority_key_not_provisioned'
  | 'approval_authority_custody_unsupported'
  | 'approval_authority_custody_invalid'
  | 'approval_authority_session_store_unavailable'
  | 'approval_authority_composition_failed';

export interface ApprovalAuthorityRuntimeHold {
  readonly state: 'hold';
  readonly reasonCode: ApprovalAuthorityRuntimeHoldReason;
  readonly detailCode: string;
  readonly authorityEvidenceRef: string | null;
}

export interface ApprovalAuthorityRuntimeReady {
  readonly state: 'ready';
  readonly service: ApprovalAuthorityRuntimeService;
  readonly authorityEvidenceRef: string;
}

export type ApprovalAuthorityRuntimeOpenResult =
  | ApprovalAuthorityRuntimeHold
  | ApprovalAuthorityRuntimeReady;

export interface ApprovalAuthorityRuntimeOpenOptions {
  readonly projectRoot: string;
  readonly tenantId: string;
  readonly platform?: GlobalScopePlatform;
  readonly env?: GlobalScopeEnv;
  readonly custodyAdapter?: ApprovalDecisionCustodyAdapter;
  readonly broker?: ApprovalBroker;
  readonly store?: ApprovalStore;
  readonly now?: () => Date;
}

export interface CreateApprovalOidcIngressInput {
  readonly token: string;
  readonly policy: ApprovalOidcPolicy;
  readonly verifier: ApprovalOidcAssertionVerifier;
  readonly channel: string;
}

export interface CreateApprovalTerminalIngressInput {
  readonly provider: LocalTerminalReauthenticationProvider;
  readonly channel: string;
}

export interface PrepareAttendedExecutionApprovalInput {
  readonly requester: {
    readonly role: RequesterRole;
    readonly instanceId: string;
  };
  readonly userId: string;
  readonly summary: string;
  readonly material: AttendedExecutionProposalMaterial;
  readonly dispatch: Omit<
    AttendedExecutionApprovalExpectedDispatch,
    keyof AttendedExecutionProposalReference
  >;
  readonly attemptId?: string;
  readonly expiresAt: string;
  readonly createdAt?: string;
}

export interface PreparedAttendedExecutionApproval {
  readonly request: ApprovalRequest;
  readonly approvalEvidenceRef: string;
  readonly approvalProposal: AttendedExecutionProposalReference;
  readonly expectedDispatch: AttendedExecutionApprovalExpectedDispatch;
  readonly attemptId: string;
}

function assertIdentity(value: string, field: string): void {
  if (!value
    || value !== value.trim()
    || value.length > 512
    || /[\r\n\0]/u.test(value)) {
    throw createExecutionAuthorityError(`${field} must be a non-empty bounded identity`);
  }
}

/**
 * One process-scoped composition root. Callers inject this same object into
 * Goal-v2 and every attended dispatch surface; no surface creates a signer.
 */
export class ApprovalAuthorityRuntimeService {
  readonly decisionAuthority: ApprovalDecisionAuthority;
  readonly attendedExecutionApprovalAuthority: AttendedExecutionApprovalAuthority;
  readonly authorityEvidenceRef: string;
  private closed = false;

  constructor(
    readonly projectRoot: string,
    readonly tenantId: string,
    readonly broker: ApprovalBroker,
    readonly store: ApprovalStore,
    readonly custody: ApprovalDecisionCustodyHandle,
    readonly sessions: ApprovalLiveSessionStore,
    private readonly now: () => Date = () => new Date(),
    attendedReceiptStoreDir?: string,
  ) {
    assertIdentity(tenantId, 'tenantId');
    const sessionAuthority = new ApprovalLiveSessionAuthority(sessions);
    this.decisionAuthority = new ApprovalDecisionAuthority(custody, sessionAuthority);
    this.attendedExecutionApprovalAuthority = new AttendedExecutionApprovalAuthority(
      projectRoot,
      broker,
      this.decisionAuthority,
      {
        now,
        ...(attendedReceiptStoreDir ? { receiptStoreDir: attendedReceiptStoreDir } : {}),
      },
    );
    this.authorityEvidenceRef = [
      'approval-authority',
      custody.snapshot.keyringId,
      custody.snapshot.revision,
      custody.snapshot.revisionHash,
      custody.snapshot.custodyAdapterId,
    ].join(':');
  }

  private createOidcIngress(input: CreateApprovalOidcIngressInput): ApprovalDecisionIngress {
    if (this.closed) throw createExecutionAuthorityError('APPROVAL_AUTHORITY_RUNTIME_CLOSED');
    assertIdentity(input.channel, 'channel');
    if (input.policy.authorityRef !== input.verifier.authorityRef) {
      throw createExecutionAuthorityError('APPROVAL_AUTHORITY_OIDC_VERIFIER_MISMATCH');
    }
    const authenticator = new OidcLiveApprovalAuthenticator({
      token: input.token,
      policy: input.policy,
      verifier: input.verifier,
      sessions: this.sessions,
      now: this.now,
    });
    return new ApprovalDecisionIngress({
      broker: this.broker,
      authenticator,
      integrity: this.custody,
      channel: input.channel,
      now: this.now,
    });
  }

  async decideOidc(
    input: CreateApprovalOidcIngressInput,
    command: ApprovalDecisionCommand,
  ): Promise<ApprovalDecisionIngressOutcome> {
    const request = this.broker.getRequest(command.requestId);
    if (!request || request.tenantId !== this.tenantId) {
      return { kind: 'rejected', reason: request ? 'unauthorized' : 'unknown-request' };
    }
    return this.createOidcIngress(input).decide(command);
  }

  async decideTerminal(
    input: CreateApprovalTerminalIngressInput,
    command: ApprovalDecisionCommand,
  ): Promise<ApprovalDecisionIngressOutcome> {
    if (this.closed) throw createExecutionAuthorityError('APPROVAL_AUTHORITY_RUNTIME_CLOSED');
    assertIdentity(input.channel, 'channel');
    const request = this.broker.getRequest(command.requestId);
    if (!request || request.tenantId !== this.tenantId) {
      return { kind: 'rejected', reason: request ? 'unauthorized' : 'unknown-request' };
    }
    const authenticator = new LocalTerminalLiveApprovalAuthenticator({
      provider: input.provider,
      sessions: this.sessions,
      now: this.now,
    });
    return new ApprovalDecisionIngress({
      broker: this.broker,
      authenticator,
      integrity: this.custody,
      channel: input.channel,
      now: this.now,
    }).decide(command);
  }

  prepareAttendedExecutionApproval(
    input: PrepareAttendedExecutionApprovalInput,
  ): PreparedAttendedExecutionApproval {
    if (this.closed) throw createExecutionAuthorityError('APPROVAL_AUTHORITY_RUNTIME_CLOSED');
    if (input.dispatch.tenantId !== this.tenantId) {
      throw createExecutionAuthorityError('APPROVAL_AUTHORITY_TENANT_MISMATCH');
    }
    if (input.dispatch.projectId !== attendedExecutionProjectId(this.projectRoot)) {
      throw createExecutionAuthorityError('APPROVAL_AUTHORITY_PROJECT_MISMATCH');
    }
    const digests = createAttendedExecutionProposalDigests(input.material);
    const binding = createAttendedExecutionApprovalBinding({
      ...input.dispatch,
      ...digests,
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      expiresAt: input.expiresAt,
    });
    const request = this.attendedExecutionApprovalAuthority.submit({
      requester: input.requester,
      userId: input.userId,
      summary: input.summary,
      binding,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    });
    const approvalProposal: AttendedExecutionProposalReference = Object.freeze({
      proposalDigest: binding.proposalDigest,
      taskDigest: binding.taskDigest,
      promptDigest: binding.promptDigest,
      scopeDigest: binding.scopeDigest,
      acceptanceDigest: binding.acceptanceDigest,
    });
    return Object.freeze({
      request,
      approvalEvidenceRef: request.id,
      approvalProposal,
      expectedDispatch: Object.freeze({
        ...input.dispatch,
        ...approvalProposal,
      }),
      attemptId: binding.attemptId,
    });
  }

  close(): void {
    this.closed = true;
  }
}

function mapOpenError(error: unknown): ApprovalAuthorityRuntimeHold {
  if (error instanceof ApprovalAuthorityKeyringError) {
    const reasonCode: ApprovalAuthorityRuntimeHoldReason =
      error.code === 'APPROVAL_KEYRING_NOT_PROVISIONED'
        ? 'approval_authority_key_not_provisioned'
        : error.code === 'APPROVAL_KEYRING_ACL_UNSUPPORTED'
          ? 'approval_authority_custody_unsupported'
          : error.code === 'APPROVAL_KEYRING_SCOPE_UNRESOLVED'
            ? 'approval_authority_scope_unresolved'
            : 'approval_authority_custody_invalid';
    return {
      state: 'hold',
      reasonCode,
      detailCode: error.code,
      authorityEvidenceRef: null,
    };
  }
  return {
    state: 'hold',
    reasonCode: 'approval_authority_composition_failed',
    detailCode: error instanceof Error ? error.name : 'unknown-error',
    authorityEvidenceRef: null,
  };
}

/**
 * Open-only production composition. Missing custody is a normal typed HOLD;
 * this function never creates, imports, rotates or repairs a keyring.
 */
export function openApprovalAuthorityRuntime(
  options: ApprovalAuthorityRuntimeOpenOptions,
): ApprovalAuthorityRuntimeOpenResult {
  try {
    assertIdentity(options.tenantId, 'tenantId');
    const projectRoot = realpathSync(options.projectRoot);
    const env = options.env ?? process.env;
    const platform = options.platform
      ?? normalizeGlobalScopePlatform(process.platform, env);
    const paths = resolveGlobalScopePaths(platform, env);
    const custodyAdapter = options.custodyAdapter
      ?? defaultApprovalDecisionCustodyAdapter(platform);
    const custody = custodyAdapter.open({
      dataDir: paths.dataDir,
      projectRoot,
      platform,
    });
    let sessions: ApprovalLiveSessionStore;
    try {
      sessions = new ApprovalLiveSessionStore({
        projectRoot,
        stateDir: paths.stateDir,
        now: options.now,
      });
    } catch (error) {
      return {
        state: 'hold',
        reasonCode: 'approval_authority_session_store_unavailable',
        detailCode: error instanceof Error ? error.name : 'unknown-error',
        authorityEvidenceRef: null,
      };
    }
    const broker = options.broker ?? new ApprovalBroker(projectRoot);
    const store = options.store ?? new ApprovalStore(projectRoot);
    const service = new ApprovalAuthorityRuntimeService(
      projectRoot,
      options.tenantId,
      broker,
      store,
      custody,
      sessions,
      options.now,
      join(
        paths.stateDir,
        'runtime',
        'attended-execution-approvals',
        attendedExecutionProjectId(projectRoot),
        'receipts',
      ),
    );
    return {
      state: 'ready',
      service,
      authorityEvidenceRef: service.authorityEvidenceRef,
    };
  } catch (error) {
    return mapOpenError(error);
  }
}
