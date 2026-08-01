/**
 * Provider- and language-neutral contract for bounded self-audit test execution.
 * Concrete ecosystem adapters own command selection and output parsing; this
 * module owns capability resolution, authority checks, and fail-closed evidence.
 */

export type SelfAuditScope =
  | {
      readonly kind: 'scoped';
      readonly testFiles: readonly string[];
    }
  | {
      readonly kind: 'full-suite';
      readonly authority: FullSuiteAuthority;
    };

export type FullSuiteAuthority =
  | { readonly state: 'absent' }
  | {
      readonly state: 'granted';
      readonly authorityId: string;
    };

export interface SelfAuditRequest {
  readonly ecosystem: string;
  readonly projectRoot: string;
  readonly scope: SelfAuditScope;
  readonly timeoutMs: number;
}

/** A process description, never a shell command string. */
export interface SelfAuditInvocation {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
}

/** The only execution boundary accepted by the registry. */
export interface ShellFreeSelfAuditInvocation extends SelfAuditInvocation {
  readonly shell: false;
}

export interface SelfAuditProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export type SelfAuditExecutor = (
  invocation: ShellFreeSelfAuditInvocation,
) => Promise<SelfAuditProcessResult>;

export interface SelfAuditExecutedUnit {
  /** Adapter-defined, ecosystem-neutral label such as file, test, or assertion. */
  readonly kind: string;
  readonly count: number;
}

export interface SelfAuditExecutedEvidence {
  readonly adapterId: string;
  readonly invocation: ShellFreeSelfAuditInvocation;
  readonly exitCode: number;
  readonly executedUnits: readonly SelfAuditExecutedUnit[];
  readonly outputDigest: string;
}

export type SelfAuditHoldReason =
  | 'unsupported-ecosystem'
  | 'adapter-unavailable'
  | 'invalid-request'
  | 'full-suite-authority-required'
  | 'invocation-rejected'
  | 'execution-failed'
  | 'execution-timeout'
  | 'missing-executed-evidence';

export type SelfAuditResult =
  | {
      readonly kind: 'completed';
      readonly outcome: 'passed' | 'failed';
      readonly evidence: SelfAuditExecutedEvidence;
    }
  | {
      readonly kind: 'unsupported';
      readonly reason: 'unsupported-ecosystem';
      readonly ecosystem: string;
    }
  | {
      readonly kind: 'hold';
      readonly reason: Exclude<SelfAuditHoldReason, 'unsupported-ecosystem'>;
      readonly detail: string;
      readonly adapterId?: string;
    };

export type SelfAuditPreparation =
  | { readonly kind: 'ready'; readonly invocation: SelfAuditInvocation }
  | {
      readonly kind: 'unsupported';
      readonly reason: 'unsupported-ecosystem';
      readonly detail: string;
    }
  | {
      readonly kind: 'hold';
      readonly reason: 'adapter-unavailable' | 'invalid-request' | 'invocation-rejected';
      readonly detail: string;
    };

export type SelfAuditEvidenceDecision =
  | {
      readonly kind: 'evidence';
      readonly executedUnits: readonly SelfAuditExecutedUnit[];
      readonly outputDigest: string;
    }
  | {
      readonly kind: 'hold';
      readonly reason: 'execution-failed' | 'missing-executed-evidence';
      readonly detail: string;
    };

export interface SelfAuditAdapter {
  readonly id: string;
  supports(ecosystem: string): boolean;
  isAvailable(): boolean;
  prepare(request: SelfAuditRequest): SelfAuditPreparation;
  collectEvidence(
    request: SelfAuditRequest,
    result: SelfAuditProcessResult,
  ): SelfAuditEvidenceDecision;
}

interface RegisteredSelfAuditAdapter {
  readonly adapter: SelfAuditAdapter;
  readonly priority: number;
  readonly order: number;
}

export class SelfAuditAdapterRegistry {
  private readonly entries: RegisteredSelfAuditAdapter[] = [];
  private registrationOrder = 0;

  register(adapter: SelfAuditAdapter, priority = 0): void {
    this.entries.push({ adapter, priority, order: this.registrationOrder++ });
  }

  list(): readonly SelfAuditAdapter[] {
    return this.entries
      .slice()
      .sort((left, right) => right.priority - left.priority || right.order - left.order)
      .map(({ adapter }) => adapter);
  }

  resolve(ecosystem: string): SelfAuditAdapter | undefined {
    return this.list().find((adapter) => adapter.supports(ecosystem));
  }

  async run(request: SelfAuditRequest, execute: SelfAuditExecutor): Promise<SelfAuditResult> {
    const requestHold = validateRequest(request);
    if (requestHold !== undefined) return requestHold;

    const adapter = this.resolve(request.ecosystem);
    if (adapter === undefined) {
      return {
        kind: 'unsupported',
        reason: 'unsupported-ecosystem',
        ecosystem: request.ecosystem,
      };
    }
    if (!adapter.isAvailable()) {
      return hold('adapter-unavailable', 'The selected self-audit adapter is unavailable', adapter.id);
    }

    let preparation: SelfAuditPreparation;
    try {
      preparation = adapter.prepare(request);
    } catch (error: unknown) {
      return hold('invocation-rejected', errorDetail(error), adapter.id);
    }
    if (preparation.kind === 'unsupported') {
      return {
        kind: 'unsupported',
        reason: preparation.reason,
        ecosystem: request.ecosystem,
      };
    }
    if (preparation.kind === 'hold') {
      return hold(preparation.reason, preparation.detail, adapter.id);
    }

    const invocation = preparation.invocation;
    if (!validInvocation(invocation, request)) {
      return hold('invocation-rejected', 'Adapter produced an invalid or out-of-scope invocation', adapter.id);
    }
    const shellFreeInvocation: ShellFreeSelfAuditInvocation = {
      ...invocation,
      shell: false,
    };

    let processResult: SelfAuditProcessResult;
    try {
      processResult = await execute(shellFreeInvocation);
    } catch (error: unknown) {
      return hold('execution-failed', errorDetail(error), adapter.id);
    }
    if (processResult.timedOut) {
      return hold('execution-timeout', 'Self-audit execution exceeded its deadline', adapter.id);
    }

    let decision: SelfAuditEvidenceDecision;
    try {
      decision = adapter.collectEvidence(request, processResult);
    } catch (error: unknown) {
      return hold('execution-failed', errorDetail(error), adapter.id);
    }
    if (decision.kind === 'hold') return hold(decision.reason, decision.detail, adapter.id);
    if (!hasExecutedEvidence(decision.executedUnits)) {
      return hold('missing-executed-evidence', 'Adapter reported no positive executed unit', adapter.id);
    }
    if (processResult.exitCode === null) {
      return hold('execution-failed', 'Self-audit process ended without an exit code', adapter.id);
    }

    return {
      kind: 'completed',
      outcome: processResult.exitCode === 0 ? 'passed' : 'failed',
      evidence: {
        adapterId: adapter.id,
        invocation: shellFreeInvocation,
        exitCode: processResult.exitCode,
        executedUnits: decision.executedUnits,
        outputDigest: decision.outputDigest,
      },
    };
  }
}

function validateRequest(request: SelfAuditRequest): Extract<SelfAuditResult, { kind: 'hold' }> | undefined {
  if (
    request.ecosystem.trim().length === 0
    || request.projectRoot.trim().length === 0
    || !Number.isSafeInteger(request.timeoutMs)
    || request.timeoutMs <= 0
  ) {
    return hold('invalid-request', 'Self-audit request fields are invalid');
  }
  if (request.scope.kind === 'scoped' && request.scope.testFiles.length === 0) {
    return hold('invalid-request', 'Scoped self-audit requires at least one test file');
  }
  if (
    request.scope.kind === 'full-suite'
    && (request.scope.authority.state !== 'granted'
      || request.scope.authority.authorityId.trim().length === 0)
  ) {
    return hold('full-suite-authority-required', 'Full-suite self-audit requires explicit authority');
  }
  return undefined;
}

function validInvocation(invocation: SelfAuditInvocation, request: SelfAuditRequest): boolean {
  return invocation.executable.trim().length > 0
    && Array.isArray(invocation.argv)
    && invocation.argv.every((argument) => typeof argument === 'string')
    && invocation.cwd === request.projectRoot
    && invocation.timeoutMs === request.timeoutMs;
}

function hasExecutedEvidence(units: readonly SelfAuditExecutedUnit[]): boolean {
  return units.length > 0 && units.some((unit) => (
    unit.kind.trim().length > 0
    && Number.isSafeInteger(unit.count)
    && unit.count > 0
  ));
}

function hold(
  reason: Exclude<SelfAuditHoldReason, 'unsupported-ecosystem'>,
  detail: string,
  adapterId?: string,
): Extract<SelfAuditResult, { kind: 'hold' }> {
  return adapterId === undefined
    ? { kind: 'hold', reason, detail }
    : { kind: 'hold', reason, detail, adapterId };
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
