import { framedOutputDigest } from './output-digest.js';

import {
  partitionVerificationObservations,
  type VerificationIsolationDecision,
  type VerificationIsolationGrant,
  type VerificationObservation,
  type VerificationObservationAmbientReason,
} from './verification-isolation-authority.js';

/** Immutable identity of a TypeScript configuration admitted with a verification grant. */
export interface TypeScriptVerificationConfigIdentity {
  readonly configId: string;
  /** Path to a pre-materialized configuration inside the admitted generation. */
  readonly configPath: string;
  readonly contentDigest: string;
  /** Files the configuration is allowed to compile, in repository-relative form. */
  readonly filePaths: readonly string[];
}

export interface TypeScriptScopedVerificationRequest {
  readonly grant: VerificationIsolationDecision;
  readonly projectRoot: string;
  readonly config: TypeScriptVerificationConfigIdentity;
  readonly timeoutMs: number;
  /** Observations collected concurrently by the host, never compiler output inferred by this adapter. */
  readonly observations?: readonly VerificationObservation[];
}

/** argv-only command; callers must pass it to their process boundary with `shell: false`. */
export interface TypeScriptScopedVerificationInvocation {
  readonly executable: 'tsc';
  readonly argv: readonly ['--noEmit', '--pretty', 'false', '--project', string];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly shell: false;
}

export interface TypeScriptScopedVerificationProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export type TypeScriptScopedVerificationExecutor = (
  invocation: TypeScriptScopedVerificationInvocation,
) => Promise<TypeScriptScopedVerificationProcessResult>;

export interface TypeScriptForeignErrorDiagnostics {
  readonly observations: readonly VerificationObservation[];
  readonly reasonCodes: readonly VerificationObservationAmbientReason[];
}

export interface TypeScriptScopedVerificationEvidence {
  readonly grant: VerificationIsolationGrant;
  readonly config: TypeScriptVerificationConfigIdentity;
  readonly invocation: TypeScriptScopedVerificationInvocation;
  readonly executedFiles: readonly string[];
  readonly exitCode: number;
  readonly outputDigest: string;
}

export type TypeScriptScopedVerificationResult =
  | {
      readonly kind: 'completed';
      readonly outcome: 'passed' | 'failed';
      readonly evidence: TypeScriptScopedVerificationEvidence;
      readonly foreignErrorDiagnostics: TypeScriptForeignErrorDiagnostics;
    }
  | {
      readonly kind: 'hold';
      readonly reason:
        | 'isolation-not-granted'
        | 'invalid-request'
        | 'config-not-admitted'
        | 'execution-failed'
        | 'execution-timeout';
      readonly detail: string;
      readonly foreignErrorDiagnostics: TypeScriptForeignErrorDiagnostics;
    };

/**
 * Invokes TypeScript only through an admitted configuration already materialized
 * in the immutable snapshot or attempt-scoped worktree. It never emits a
 * tsconfig, never widens to an ambient project command, and keeps concurrent
 * foreign observations outside this attempt's compiler verdict.
 */
export class TypeScriptScopedVerificationAdapter {
  async run(
    request: TypeScriptScopedVerificationRequest,
    execute: TypeScriptScopedVerificationExecutor,
  ): Promise<TypeScriptScopedVerificationResult> {
    const grant = request.grant;
    const foreignErrorDiagnostics = diagnosticsFor(grant, request.observations ?? []);
    if (grant.decision === 'hold') {
      return hold('isolation-not-granted', `Verification isolation is on hold: ${grant.reasonCode}`, foreignErrorDiagnostics);
    }
    if (!validRequest(request)) {
      return hold('invalid-request', 'The scoped TypeScript verification request is invalid', foreignErrorDiagnostics);
    }
    if (!configIsAdmitted(grant, request.config)) {
      return hold('config-not-admitted', 'The TypeScript configuration is outside the admitted verification surface', foreignErrorDiagnostics);
    }

    const invocation: TypeScriptScopedVerificationInvocation = {
      executable: 'tsc',
      argv: ['--noEmit', '--pretty', 'false', '--project', request.config.configPath],
      cwd: request.projectRoot,
      timeoutMs: request.timeoutMs,
      shell: false,
    };

    let processResult: TypeScriptScopedVerificationProcessResult;
    try {
      processResult = await execute(invocation);
    } catch (error: unknown) {
      return hold('execution-failed', errorDetail(error), foreignErrorDiagnostics);
    }
    if (processResult.timedOut) {
      return hold('execution-timeout', 'TypeScript verification exceeded its deadline', foreignErrorDiagnostics);
    }
    if (processResult.exitCode === null) {
      return hold('execution-failed', 'TypeScript verification ended without an exit code', foreignErrorDiagnostics);
    }

    // See self-audit-vitest-adapter: the digest is framed per stream so a line
    // crossing the stdout/stderr boundary cannot collapse two outcomes into one
    // identity.
    const outputDigest = framedOutputDigest([processResult.stdout, processResult.stderr]);
    return {
      kind: 'completed',
      outcome: processResult.exitCode === 0 ? 'passed' : 'failed',
      evidence: {
        grant,
        config: request.config,
        invocation,
        executedFiles: Object.freeze([...request.config.filePaths]),
        exitCode: processResult.exitCode,
        outputDigest,
      },
      foreignErrorDiagnostics,
    };
  }
}

function validRequest(request: TypeScriptScopedVerificationRequest): boolean {
  return request.projectRoot.trim().length > 0
    && Number.isSafeInteger(request.timeoutMs)
    && request.timeoutMs > 0
    && request.config.configId.trim().length > 0
    && isNormalizedRepoPath(request.config.configPath)
    && request.config.contentDigest.trim().length > 0
    && request.config.filePaths.length > 0
    && request.config.filePaths.every(isNormalizedRepoPath);
}

function configIsAdmitted(
  grant: VerificationIsolationGrant,
  config: TypeScriptVerificationConfigIdentity,
): boolean {
  const grantedPaths = new Set(grant.verificationPaths);
  const uniqueFiles = new Set(config.filePaths);
  return uniqueFiles.size === config.filePaths.length
    && config.filePaths.every(filePath => grantedPaths.has(filePath));
}

function diagnosticsFor(
  grant: VerificationIsolationDecision,
  observations: readonly VerificationObservation[],
): TypeScriptForeignErrorDiagnostics {
  if (grant.decision === 'hold') {
    return { observations: Object.freeze([]), reasonCodes: Object.freeze([]) };
  }
  const partition = partitionVerificationObservations(grant, observations);
  return {
    observations: partition.ambient,
    reasonCodes: partition.ambientReasonCodes,
  };
}

function hold(
  reason: Extract<TypeScriptScopedVerificationResult, { kind: 'hold' }>['reason'],
  detail: string,
  foreignErrorDiagnostics: TypeScriptForeignErrorDiagnostics,
): Extract<TypeScriptScopedVerificationResult, { kind: 'hold' }> {
  return { kind: 'hold', reason, detail, foreignErrorDiagnostics };
}

function isNormalizedRepoPath(value: string): boolean {
  return value.length > 0
    && !value.includes('\\')
    && !value.includes('\0')
    && !value.startsWith('/')
    && !/^[A-Za-z]:/.test(value)
    && value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
