import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import type { ProviderReachabilityEvidenceSource } from '../core/provider-evidence-producer.js';
import {
  buildCliInvocation,
  scrubCrossProviderEnv,
} from '../core/provider.js';
import {
  PROVIDER_COMMAND_SPECS,
  type ProviderCommandSpec,
} from '../core/provider-command-spec.js';
import {
  assertCanonicalModelApiId,
  type ReachabilityProbeObservation,
  type ReachabilityProbeRequest,
} from '../core/provider-truth.js';
import { resolveCrossProviderCredentialKeys } from './cross-provider-keys.js';
import { parseClaudeReachabilityObservation } from './claude.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const PROBE_PROMPT = 'Reply with exactly DECKENT_REACHABILITY_OK. Do not use tools.';

export interface ClaudeReachabilityCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly spawnError?: boolean;
  readonly outputTruncated?: boolean;
}

export interface ClaudeReachabilityCommandOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly input: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export type ClaudeReachabilityCommandRunner = (
  command: string,
  args: readonly string[],
  options: ClaudeReachabilityCommandOptions,
) => Promise<ClaudeReachabilityCommandResult>;

export interface ClaudeReachabilityEvidenceSourceOptions {
  readonly projectRoot: string;
  readonly runner?: ClaudeReachabilityCommandRunner;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  /** Additional config-defined credential keys. Canonical built-ins are always scrubbed. */
  readonly additionalCredentialKeys?: readonly string[];
}

function digest(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function evidenceRef(kind: string, ...parts: readonly string[]): string {
  return `claude-reachability-${kind}:${digest(kind, ...parts)}`;
}

function requireBoundedInteger(name: string, value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new TypeError(`${name} must be a positive integer no greater than ${maximum}`);
  }
}

function claudeSpec(): ProviderCommandSpec {
  const spec = PROVIDER_COMMAND_SPECS['claude'];
  if (!spec
    || spec.promptFeed !== 'stdin'
    || spec.availableToolsFlag === null
    || spec.isolatedContextArgs.length === 0) {
    throw new Error('Claude reachability requires the canonical isolated stdin command spec');
  }
  return spec;
}

function buildArgs(model: string): string[] {
  assertCanonicalModelApiId(model);
  const spec = claudeSpec();
  const args = [...spec.baseArgs];
  const formatFlagIndex = args.indexOf('--output-format');
  if (formatFlagIndex < 0 || args[formatFlagIndex + 1] === undefined) {
    throw new Error('Claude reachability requires provider-native structured output');
  }
  args[formatFlagIndex + 1] = 'stream-json';
  args.push('--verbose', spec.modelFlag, model);
  args.push(spec.availableToolsFlag!, '');
  args.push(...spec.isolatedContextArgs);
  return args;
}

function emptyObservation(
  outcome: ReachabilityProbeObservation['outcome'],
  ref: string,
  durationMs: number | null = null,
): ReachabilityProbeObservation {
  return {
    outcome,
    calledProvider: null,
    calledModel: null,
    providerRequestRefHash: null,
    latencyMs: durationMs,
    evidenceRefs: [ref],
  };
}

function exactScope(request: Readonly<ReachabilityProbeRequest>): boolean {
  try {
    assertCanonicalModelApiId(request.model);
  } catch {
    return false;
  }
  return request.provider === 'claude'
    && request.auth.mode === 'subscription'
    && request.auth.accountRefHash !== null
    && request.backend.transport === 'cli'
    && request.backend.executionBackend === 'host-subprocess'
    && request.executionProfile.provider === 'claude'
    && request.executionProfile.profileRef === request.backend.executionProfileRef
    && request.executionProfile.allowed.some(item =>
      item.authMode === request.auth.mode
      && item.transport === request.backend.transport
      && item.executionBackend === request.backend.executionBackend);
}

const defaultRunner: ClaudeReachabilityCommandRunner = (
  command,
  args,
  options,
) => new Promise<ClaudeReachabilityCommandResult>((resolve) => {
  const startedAt = Date.now();
  let settled = false;
  let timer: NodeJS.Timeout | null = null;
  let stdout = '';
  let stdoutBytes = 0;
  let timedOut = false;
  let outputTruncated = false;

  const done = (result: Omit<ClaudeReachabilityCommandResult, 'durationMs'>): void => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    resolve({ ...result, durationMs: Math.max(0, Date.now() - startedAt) });
  };

  let child: ReturnType<typeof nodeSpawn>;
  try {
    child = nodeSpawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch {
    done({ status: null, stdout: '', timedOut: false, spawnError: true });
    return;
  }

  child.stdin?.on('error', () => {
    // A timeout/overflow kill may close stdin before the bounded prompt is flushed.
  });
  child.stdout?.on('data', (value: Buffer | string) => {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const remaining = options.maxOutputBytes - stdoutBytes;
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
    done({ status: code, stdout, timedOut, outputTruncated });
  });
  timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
    done({ status: null, stdout, timedOut: true, outputTruncated });
  }, options.timeoutMs);
  child.stdin?.end(options.input);
});

/**
 * Exact Claude subscription reachability transport for a host subprocess.
 *
 * Admission, account identity, provider limits, approval, budget and receipt
 * ownership remain upstream in ProviderEvidenceProducer. This class only owns
 * the bounded provider process and returns the sanitized provider-native
 * observation.
 */
export class ClaudeReachabilityEvidenceSource implements ProviderReachabilityEvidenceSource {
  readonly authorityRef: string;
  private readonly projectRoot: string;
  private readonly runner: ClaudeReachabilityCommandRunner;
  private readonly platform: NodeJS.Platform;
  private readonly childEnv: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(options: ClaudeReachabilityEvidenceSourceOptions) {
    if (!options.projectRoot.trim()) throw new TypeError('projectRoot must be non-empty');
    this.projectRoot = options.projectRoot;
    this.runner = options.runner ?? defaultRunner;
    this.platform = options.platform ?? process.platform;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    requireBoundedInteger('timeoutMs', this.timeoutMs, MAX_TIMEOUT_MS);
    requireBoundedInteger('maxOutputBytes', this.maxOutputBytes, MAX_OUTPUT_BYTES);
    const credentialKeys = [
      ...new Set([
        ...resolveCrossProviderCredentialKeys(),
        ...(options.additionalCredentialKeys ?? []),
      ]),
    ];
    this.childEnv = scrubCrossProviderEnv(options.env ?? process.env, credentialKeys);
    this.authorityRef = evidenceRef(
      'authority',
      'claude-subscription-cli-host-subprocess-v1',
      JSON.stringify({
        binary: claudeSpec().binary,
        baseArgs: claudeSpec().baseArgs,
        modelFlag: claudeSpec().modelFlag,
        availableToolsFlag: claudeSpec().availableToolsFlag,
        isolatedContextArgs: claudeSpec().isolatedContextArgs,
      }),
      String(this.timeoutMs),
      String(this.maxOutputBytes),
    );
  }

  readonly probe = async (
    request: Readonly<ReachabilityProbeRequest>,
  ): Promise<ReachabilityProbeObservation> => {
    const scopeRef = evidenceRef(
      'scope',
      request.provider,
      request.model,
      request.auth.mode,
      request.backend.transport,
      request.backend.executionBackend,
      request.backend.executionProfileRef,
    );
    if (!exactScope(request)) return emptyObservation('unsupported', scopeRef);

    const spec = claudeSpec();
    const invocation = buildCliInvocation(spec.binary, buildArgs(request.model), this.platform);
    const result = await this.runner(invocation.command, invocation.args, {
      cwd: this.projectRoot,
      env: { ...this.childEnv },
      input: PROBE_PROMPT,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
    });
    const transportRef = evidenceRef(
      'transport',
      scopeRef,
      String(result.status),
      result.timedOut ? 'timeout' : 'completed',
      result.spawnError ? 'spawn-error' : 'spawned',
      result.outputTruncated ? 'truncated' : 'bounded',
      String(result.durationMs),
    );
    if (result.spawnError) return emptyObservation('backend-unreachable', transportRef, result.durationMs);
    if (result.timedOut) return emptyObservation('timeout', transportRef, result.durationMs);
    if (result.outputTruncated) return emptyObservation('invalid-response', transportRef, result.durationMs);

    const observed = parseClaudeReachabilityObservation(result.stdout);
    if (result.status !== 0) {
      if (observed.outcome === 'auth-rejected'
        || observed.outcome === 'rate-limited'
        || observed.outcome === 'model-not-found'
        || observed.outcome === 'timeout') {
        return { ...observed, evidenceRefs: [...(observed.evidenceRefs ?? []), transportRef] };
      }
      return emptyObservation('transport-error', transportRef, result.durationMs);
    }
    if (observed.outcome !== 'succeeded') {
      return { ...observed, evidenceRefs: [...(observed.evidenceRefs ?? []), transportRef] };
    }
    if (observed.calledProvider !== request.provider || observed.calledModel !== request.model) {
      return emptyObservation('invalid-response', transportRef, result.durationMs);
    }
    return {
      ...observed,
      evidenceRefs: [...(observed.evidenceRefs ?? []), transportRef],
    };
  };
}
