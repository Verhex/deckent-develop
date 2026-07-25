import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  deriveProviderAccountBackendScopeRefHash,
  type ProviderAccountIdentityAuthority,
  type ProviderAccountIdentityRequest,
  type ProviderAccountIdentityResult,
} from '../core/provider-evidence-producer.js';
import {
  buildCliInvocation,
  scrubCrossProviderEnv,
} from '../core/provider.js';
import { resolveCrossProviderCredentialKeys } from './cross-provider-keys.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_TTL_MS = 60_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export interface ClaudeAuthStatusCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly timedOut: boolean;
  readonly spawnError?: boolean;
  readonly outputTruncated?: boolean;
}

export type ClaudeAuthStatusRunner = (
  command: string,
  args: readonly string[],
  options: {
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
    readonly env: NodeJS.ProcessEnv;
  },
) => Promise<ClaudeAuthStatusCommandResult>;

export interface ClaudeAccountIdentityAuthorityOptions {
  readonly runner?: ClaudeAuthStatusRunner;
  readonly now?: () => Date;
  readonly ttlMs?: number;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  /** Additional config-defined credential keys. Canonical built-ins are always scrubbed. */
  readonly additionalCredentialKeys?: readonly string[];
}

function digest(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function evidenceRef(kind: string, ...parts: readonly string[]): string {
  return `claude-account-${kind}:${digest(kind, ...parts)}`;
}

function requireBoundedInteger(name: string, value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new TypeError(`${name} must be a positive integer no greater than ${maximum}`);
  }
}

function canonicalOrganizationSubject(value: unknown): string | null {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 256
    || value !== value.trim()
    || value !== value.normalize('NFC')
    || /[\u0000-\u001f\u007f]/u.test(value)) {
    return null;
  }
  return value;
}

function statusEvidenceRef(result: ClaudeAuthStatusCommandResult): string {
  return evidenceRef(
    'status',
    String(result.status),
    result.timedOut ? 'timeout' : 'completed',
    result.spawnError ? 'spawn-error' : 'spawned',
    result.outputTruncated ? 'truncated' : 'bounded',
    result.stdout,
  );
}

function scopeEvidenceRef(input: ProviderAccountIdentityRequest, reason: string): string {
  return evidenceRef(
    'scope',
    reason,
    input.tenantId,
    input.provider,
    input.authMode,
    input.backend.transport,
    input.backend.executionBackend,
    input.backend.endpointRefHash ?? 'none',
    input.backend.runtimeFingerprint ?? 'none',
    input.backend.executionProfileRef,
    input.executionProfile.profileRef,
    input.executionProfile.provider,
  );
}

function isExactExecutionScope(input: ProviderAccountIdentityRequest): boolean {
  return input.provider === 'claude'
    && input.authMode === 'subscription'
    && input.backend.transport === 'cli'
    && input.executionProfile.provider === 'claude'
    && input.executionProfile.profileRef === input.backend.executionProfileRef
    && input.executionProfile.allowed.some(allowed =>
      allowed.authMode === input.authMode
      && allowed.transport === input.backend.transport
      && allowed.executionBackend === input.backend.executionBackend);
}

function parseObject(raw: string): Readonly<Record<string, unknown>> | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>>
      : null;
  } catch {
    return null;
  }
}

const defaultRunner: ClaudeAuthStatusRunner = (
  command,
  args,
  options,
) => new Promise<ClaudeAuthStatusCommandResult>((resolve) => {
  const { timeoutMs, maxOutputBytes } = options;
  let settled = false;
  let timer: NodeJS.Timeout | null = null;
  let stdout = '';
  let stdoutBytes = 0;
  let timedOut = false;
  let outputTruncated = false;

  const done = (result: ClaudeAuthStatusCommandResult): void => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    resolve(result);
  };

  let child: ReturnType<typeof nodeSpawn>;
  try {
    child = nodeSpawn(command, [...args], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: options.env,
    });
  } catch {
    done({ status: null, stdout: '', timedOut: false, spawnError: true });
    return;
  }

  child.stdout?.on('data', (value: Buffer | string) => {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const remaining = maxOutputBytes - stdoutBytes;
    if (remaining > 0) {
      const accepted = chunk.subarray(0, remaining);
      stdout += accepted.toString('utf8');
      stdoutBytes += accepted.length;
    }
    if (chunk.length > remaining) {
      outputTruncated = true;
      child.kill('SIGKILL');
      done({
        status: null,
        stdout,
        timedOut: false,
        outputTruncated: true,
      });
    }
  });
  child.stderr?.resume();
  child.once('error', () => {
    done({ status: null, stdout: '', timedOut: false, spawnError: true });
  });
  child.once('close', code => {
    done({
      status: code,
      stdout,
      timedOut,
      outputTruncated,
    });
  });

  timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
    done({ status: null, stdout, timedOut: true, outputTruncated });
  }, timeoutMs);
});

/**
 * Host-side Claude subscription account authority.
 *
 * The provider-native organization subject exists only in the returned
 * host-memory object. ProviderEvidenceProducer pseudonymizes it immediately;
 * durable evidence receives only opaque SHA-256 references.
 */
export class ClaudeAccountIdentityAuthority implements ProviderAccountIdentityAuthority {
  readonly authorityRef = evidenceRef('authority', 'claude-auth-status-v1');
  private readonly runner: ClaudeAuthStatusRunner;
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly platform: NodeJS.Platform;
  private readonly childEnv: NodeJS.ProcessEnv;

  constructor(options: ClaudeAccountIdentityAuthorityOptions = {}) {
    this.runner = options.runner ?? defaultRunner;
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.platform = options.platform ?? process.platform;
    requireBoundedInteger('ttlMs', this.ttlMs, DEFAULT_TTL_MS);
    requireBoundedInteger('timeoutMs', this.timeoutMs, MAX_TIMEOUT_MS);
    requireBoundedInteger('maxOutputBytes', this.maxOutputBytes, MAX_OUTPUT_BYTES);
    const credentialKeys = [
      ...new Set([
        ...resolveCrossProviderCredentialKeys(),
        ...(options.additionalCredentialKeys ?? []),
      ]),
    ];
    this.childEnv = scrubCrossProviderEnv(options.env ?? process.env, credentialKeys);
  }

  async resolve(input: ProviderAccountIdentityRequest): Promise<ProviderAccountIdentityResult> {
    if (!isExactExecutionScope(input)) {
      return { state: 'hold', evidenceRef: scopeEvidenceRef(input, 'scope-mismatch') };
    }

    const invocation = buildCliInvocation(
      'claude',
      ['auth', 'status', '--json'],
      this.platform,
    );
    const result = await this.runner(invocation.command, invocation.args, {
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      env: { ...this.childEnv },
    });
    const observedEvidenceRef = statusEvidenceRef(result);
    if (result.spawnError || result.timedOut || result.outputTruncated) {
      return { state: 'hold', evidenceRef: observedEvidenceRef };
    }

    const status = parseObject(result.stdout);
    if (!status || status['loggedIn'] !== true || result.status !== 0) {
      return { state: 'hold', evidenceRef: observedEvidenceRef };
    }
    if (status['apiProvider'] !== 'firstParty') {
      return { state: 'hold', evidenceRef: observedEvidenceRef };
    }

    const fetchedAt = this.now();
    if (!Number.isFinite(fetchedAt.getTime())) {
      return { state: 'hold', evidenceRef: observedEvidenceRef };
    }
    const expiresAt = new Date(fetchedAt.getTime() + this.ttlMs);
    const credentialGenerationRef = evidenceRef(
      'credential',
      'claude',
      String(status['authMethod'] ?? 'missing'),
      String(status['apiProvider']),
      result.stdout,
    );
    const common = {
      credentialGenerationRef,
      evidenceRef: observedEvidenceRef,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    } as const;

    if (status['authMethod'] !== 'claude.ai') {
      return { state: 'credential-only', ...common };
    }
    const organizationSubject = canonicalOrganizationSubject(status['orgId']);
    if (!organizationSubject) {
      return { state: 'credential-only', ...common };
    }

    return {
      state: 'ready',
      provider: 'claude',
      authMode: 'subscription',
      identityKind: 'organization',
      assurance: 'provider-verified',
      issuer: 'claude-auth-status',
      stableSubject: organizationSubject,
      backendScopeRefHash: deriveProviderAccountBackendScopeRefHash(input),
      ...common,
    };
  }
}
