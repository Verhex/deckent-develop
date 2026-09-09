// src/agent/provider-tooluse/transport-errors.ts
// ═══ Typed transport failures (7108 TERMINAL-REASONING-CONTROL-001 §3) ══════
// undici wraps every network failure as `TypeError: fetch failed` and buries the
// real cause two levels down (`error.cause.cause.code`, e.g. ECONNRESET /
// UND_ERR_SOCKET / UND_ERR_BODY_TIMEOUT). The measured incident showed exactly
// that shape: the terminal printed "fetch failed" while the server log said
// "Connection handling canceled". This module walks the cause chain, classifies
// the failure into a small typed vocabulary, and carries it on a typed error so
// the loop can localize honestly ("connection dropped (ECONNRESET) — retried
// once") instead of relaying an opaque string.

export type TransportFailureClass = 'connect' | 'reset' | 'timeout' | 'abort' | 'http';

export interface TransportFailure {
  readonly class: TransportFailureClass;
  /** OS / undici code from the deepest cause (`ECONNRESET`, `UND_ERR_SOCKET`, …) or null. */
  readonly code: string | null;
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
  'UND_ERR_CONNECT', 'ERR_TLS_CERT_ALTNAME_INVALID',
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

/** True for the caller's own cancellation (AbortSignal) — never a transport failure. */
export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  const coded = deepestCoded(error);
  return coded !== null && ABORT_CODES.has(coded.code);
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
    ? { code: coded.code, ...(coded.errno !== undefined ? { errno: coded.errno } : {}), ...(coded.syscall ? { syscall: coded.syscall } : {}) }
    : { code: null };
  if (isAbortError(error)) return { class: 'abort', ...base, detail };
  if (coded) {
    if (TIMEOUT_CODES.has(coded.code)) return { class: 'timeout', ...base, detail };
    if (RESET_CODES.has(coded.code)) return { class: 'reset', ...base, detail };
    if (CONNECT_CODES.has(coded.code)) return { class: 'connect', ...base, detail };
  }
  return { class: phase === 'connect' ? 'connect' : 'reset', ...base, detail };
}

/** Transient = worth ONE bounded retry when it happened BEFORE any byte arrived. */
export function isTransientTransportFailure(failure: TransportFailure, phase: TransportFailurePhase): boolean {
  return phase === 'connect' && (failure.class === 'connect' || failure.class === 'reset' || failure.class === 'timeout');
}

/** Typed transport error. `attempts` counts every try INCLUDING the first, so
 *  `attempts - 1` is the number of retries actually performed. */
export class ProviderTransportError extends Error {
  readonly code = 'PROVIDER_TRANSPORT_FAILURE' as const;
  constructor(
    readonly transport: string,
    readonly phase: TransportFailurePhase,
    readonly failure: TransportFailure,
    readonly attempts: number,
  ) {
    const parts = [failure.detail];
    const meta = [`class=${failure.class}`, failure.code ? `code=${failure.code}` : null,
      failure.syscall ? `syscall=${failure.syscall}` : null].filter(Boolean).join(' ');
    parts.push(`(${meta})`);
    if (attempts > 1) parts.push(`— retried ${attempts - 1}×`);
    super(`${transport} ${phase === 'connect' ? 'connect' : 'stream'} failed — ${parts.join(' ')}`);
    this.name = 'ProviderTransportError';
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
