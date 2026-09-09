// src/agent/provider-tooluse/transport-errors.ts
// ═══ Typed transport failures (7108 TERMINAL-REASONING-CONTROL-001 §3) ══════
// undici wraps every network failure as `TypeError: fetch failed` and buries the
// real cause two levels down (`error.cause.cause.code`, e.g. ECONNRESET /
// UND_ERR_SOCKET / UND_ERR_BODY_TIMEOUT). The measured incident showed exactly
// that shape: the terminal printed "fetch failed" while the server log said
// "Connection handling canceled". This module walks the cause chain, classifies
// the failure into a small typed vocabulary, and carries it on a typed error so
// the loop can localize honestly ("connection dropped (ECONNRESET) — retried
// N time(s)", N = the CONFIGURED transportRetry count actually performed, 0..3)
// instead of relaying an opaque string. 7108-b: an AbortError ANYWHERE in the
// cause chain is the caller's cancel (never retried), and only an explicit
// allowlist of codes counts as transient — TLS/certificate and DNS-resolution
// failures are permanent and are reported as such.

export type TransportFailureClass = 'connect' | 'reset' | 'timeout' | 'abort' | 'http';

export interface TransportFailure {
  readonly class: TransportFailureClass;
  /** OS / undici code from the deepest cause (`ECONNRESET`, `UND_ERR_SOCKET`, …) or null. */
  readonly code: string | null;
  /** 7108-b: the code is on the explicit transient allowlist (retry-eligible
   *  in the connect phase). Unknown / permanent codes are never retried. */
  readonly transient: boolean;
  readonly errno?: number;
  readonly syscall?: string;
  /** Bounded, control-character-free text of the outermost message. */
  readonly detail: string;
}

/** Phase in which the failure happened. `stream` = at least one response byte
 *  (headers) had arrived; such a failure is NEVER retried, because the backend
 *  may already have generated (and billed) part of the answer. */
export type TransportFailurePhase = 'connect' | 'stream';

const DETAIL_CAP = 200;
const MAX_CAUSE_DEPTH = 6;

const CONNECT_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL',
  'UND_ERR_CONNECT',
  // Permanent TLS identity/trust failures: the connection can never be
  // established by retrying; they are connect-class but NOT transient.
  'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_HANDSHAKE_TIMEOUT',
]);
/** 7108-b: the ONLY codes a bounded retry may act on (explicit allowlist —
 *  everything else, including `ENOTFOUND` (DNS says no) and every certificate
 *  code, is permanent for the life of this request). */
const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'EAI_AGAIN',
]);
const RESET_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_DESTROYED', 'UND_ERR_CLOSED', 'ECONNABORTED',
]);
const TIMEOUT_CODES: ReadonlySet<string> = new Set([
  'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_RESPONSE_STATUS_CODE_TIMEOUT',
]);
const ABORT_CODES: ReadonlySet<string> = new Set(['UND_ERR_ABORTED', 'ABORT_ERR']);

function cleanDetail(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : String(value);
  return text.replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim().slice(0, DETAIL_CAP);
}

/** Walk `error → cause → cause…` and return the deepest node carrying a `code`. */
function deepestCoded(error: unknown): { code: string; errno?: number; syscall?: string } | null {
  let node: unknown = error;
  let found: { code: string; errno?: number; syscall?: string } | null = null;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && node && typeof node === 'object'; depth++) {
    const record = node as { code?: unknown; errno?: unknown; syscall?: unknown; cause?: unknown };
    if (typeof record.code === 'string' && record.code !== '') {
      found = {
        code: record.code,
        ...(typeof record.errno === 'number' ? { errno: record.errno } : {}),
        ...(typeof record.syscall === 'string' ? { syscall: record.syscall } : {}),
      };
    }
    node = record.cause;
  }
  return found;
}

/** True for the caller's own cancellation (AbortSignal) — never a transport
 *  failure. 7108-b: abort has PRIORITY over every other classification — an
 *  `AbortError` (Error or DOMException, matched by name) or an abort code
 *  ANYWHERE in the bounded cause chain makes the whole failure an abort. */
export function isAbortError(error: unknown): boolean {
  let node: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && node && typeof node === 'object'; depth++) {
    const record = node as { name?: unknown; code?: unknown; cause?: unknown };
    if (record.name === 'AbortError') return true;
    if (typeof record.code === 'string' && ABORT_CODES.has(record.code)) return true;
    node = record.cause;
  }
  return false;
}

/**
 * Classify a thrown fetch/stream error. Unknown codes before any byte was
 * received are a connect-class failure (undici's own `fetch failed` wrapper
 * carries no code when the socket never opened); unknown codes mid-stream are
 * a reset (the connection existed and went away).
 */
export function classifyTransportFailure(error: unknown, phase: TransportFailurePhase): TransportFailure {
  const coded = deepestCoded(error);
  const detail = cleanDetail(error);
  const base = coded
    ? {
        code: coded.code, transient: TRANSIENT_CODES.has(coded.code),
        ...(coded.errno !== undefined ? { errno: coded.errno } : {}), ...(coded.syscall ? { syscall: coded.syscall } : {}),
      }
    : { code: null, transient: false };
  if (isAbortError(error)) return { class: 'abort', ...base, transient: false, detail };
  if (coded) {
    if (TIMEOUT_CODES.has(coded.code)) return { class: 'timeout', ...base, detail };
    if (RESET_CODES.has(coded.code)) return { class: 'reset', ...base, detail };
    if (CONNECT_CODES.has(coded.code)) return { class: 'connect', ...base, detail };
  }
  return { class: phase === 'connect' ? 'connect' : 'reset', ...base, detail };
}

/** Retry-eligible = an allowlisted transient code, BEFORE any byte arrived.
 *  An unknown code, a permanent (TLS/DNS) code, an abort or any stream-phase
 *  failure is never retried. */
export function isTransientTransportFailure(failure: TransportFailure, phase: TransportFailurePhase): boolean {
  return phase === 'connect' && failure.class !== 'abort' && failure.transient;
}

/** Why a failure ended the request without (further) retries — the honest
 *  reason the user-facing line names. */
export type TransportNoRetryReason = 'exhausted' | 'stream-phase' | 'permanent' | 'not-authorized';

/** Typed transport error. `attempts` counts every try INCLUDING the first, so
 *  `attempts - 1` is the number of retries actually performed; `retryBudget`
 *  is the CONFIGURED retry count the caller authorized (0..N). */
export class ProviderTransportError extends Error {
  readonly code = 'PROVIDER_TRANSPORT_FAILURE' as const;
  readonly noRetryReason: TransportNoRetryReason;
  constructor(
    readonly transport: string,
    readonly phase: TransportFailurePhase,
    readonly failure: TransportFailure,
    readonly attempts: number,
    readonly retryBudget: number = 0,
  ) {
    const retries = attempts - 1;
    const noRetryReason: TransportNoRetryReason = retries > 0 ? 'exhausted'
      : phase === 'stream' ? 'stream-phase'
        : !isTransientTransportFailure(failure, phase) ? 'permanent'
          : 'not-authorized';
    const parts = [failure.detail];
    const meta = [`class=${failure.class}`, failure.code ? `code=${failure.code}` : null,
      failure.syscall ? `syscall=${failure.syscall}` : null].filter(Boolean).join(' ');
    parts.push(`(${meta})`);
    parts.push(retries > 0
      ? `— retried ${retries}× of ${retryBudget} configured`
      : `— not retried (${noRetryReason === 'not-authorized' ? `transportRetry=${retryBudget}` : noRetryReason})`);
    super(`${transport} ${phase === 'connect' ? 'connect' : 'stream'} failed — ${parts.join(' ')}`);
    this.name = 'ProviderTransportError';
    this.noRetryReason = noRetryReason;
  }
  /** Retries actually performed before giving up. */
  get retries(): number { return this.attempts - 1; }
}

/** Config-resolved retry authorization for one request. Fail-closed: a budget
 *  that does not carry BOTH fields as safe non-negative integers (e.g. a partial
 *  test fixture) authorizes NO retry rather than an invalid request. */
export function resolveTransportRetryPolicy(
  budget: { readonly transportRetry?: number; readonly transportRetryBackoffMs?: number } | undefined,
): { attempts: number; backoffMs: number } | undefined {
  if (!budget) return undefined;
  const { transportRetry, transportRetryBackoffMs } = budget;
  if (!Number.isSafeInteger(transportRetry) || (transportRetry as number) < 0) return undefined;
  if (!Number.isSafeInteger(transportRetryBackoffMs) || (transportRetryBackoffMs as number) < 0) return undefined;
  return { attempts: transportRetry as number, backoffMs: transportRetryBackoffMs as number };
}

/** Abortable delay for retry backoff: rejects with an AbortError when the turn is cancelled. */
export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => { clearTimeout(timer); reject(abortError()); };
    if (signal?.aborted) { reject(abortError()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, Math.max(0, ms));
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}
