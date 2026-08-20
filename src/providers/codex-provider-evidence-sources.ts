import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readdirSync, readSync } from 'node:fs';
import { posix, win32 } from 'node:path';

import {
  normalizeGlobalScopePlatform,
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
} from '../core/global-scope-resolver.js';
import {
  deriveProviderAccountBackendScopeRefHash,
  type ProviderAccountIdentityAuthority,
  type ProviderAccountIdentityRequest,
  type ProviderAccountIdentityResult,
  type ProviderLimitEvidenceSource,
  type ProviderLimitSourceObservation,
  type ProviderReachabilityEvidenceSource,
} from '../core/provider-evidence-producer.js';
import { PROVIDER_COMMAND_SPECS } from '../core/provider-command-spec.js';
import {
  ProviderEvidenceSourceRegistry,
  type ProviderEvidenceSourceRegistration,
} from '../core/provider-evidence-source-registry.js';
import type { ProviderLimitWindow } from '../core/provider-limit-truth.js';
import {
  assertCanonicalModelApiId,
  assertOpaqueEvidenceRef,
  assertOpaqueSha256,
  type ReachabilityProbeObservation,
  type ReachabilityProbeRequest,
} from '../core/provider-truth.js';
import {
  isExecutionProfileRef,
  type BoundedReachabilityProbeTransport,
} from '../core/provider-evidence-probe-contract.js';

// ─── Codex durable on-disk state contract ────────────────────────────────────
//
// Every source in this module is READ-ONLY over state the codex CLI itself
// persisted. Nothing here spawns a process, opens a socket, refreshes a token or
// writes a byte: the whole module is a projector over two locations the repo
// already documents for codex —
//   - the CLI state dir: `$CODEX_HOME`, else `<home>/.codex`
//     (`oauthHomeDir` in core/provider-command-spec.ts is the SSOT for the dir name),
//   - its usage/rollout event log: `<stateDir>/sessions/**/*.jsonl`
//     (documented in providers/codex.ts — the persisted twin of `codex exec --json`).
//
// The field contract below (`tokens.account_id`, the API-key field, and the
// `rate_limits` snapshot windows) is the codex CLI's own shape. Validation is
// deliberately strict and never lenient-by-guess: an absent, oversize, corrupt or
// unrecognized state file yields a typed `hold`/`unavailable` with an opaque
// evidence ref, never an invented identity or an invented limit window.

const CODEX_HOME_ENV = 'CODEX_HOME';
const AUTH_STATE_FILE = 'auth.json';
const SESSIONS_DIR = 'sessions';
const ACCOUNT_ID_FIELD = 'account_id';
const TOKENS_FIELD = 'tokens';
const API_KEY_FIELD = 'OPENAI_API_KEY';
const RATE_LIMIT_FIELD = 'rate_limits';
const PRIMARY_WINDOW_ID = 'codex.primary';
const SECONDARY_WINDOW_ID = 'codex.secondary';

const DEFAULT_TTL_MS = 60_000;
/** Bounded read of the durable state file; a larger file is refused, not streamed. */
const MAX_AUTH_STATE_BYTES = 64 * 1024;
/** Only the tail of a rollout log can hold the newest snapshot; the rest is never read. */
const MAX_USAGE_TAIL_BYTES = 256 * 1024;
const MAX_DIR_ENTRIES = 4096;
/** `sessions/<yyyy>/<mm>/<dd>/<file>` — four bounded readdir levels, never a recursive walk. */
const MAX_SESSION_DESCENT = 4;
const MAX_EVENT_DEPTH = 8;
const MAX_EVENT_LINES = 512;

export interface CodexHostSubscriptionEvidenceRegistryOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  /**
   * Lazy resolver for the canonical Docker-backed bounded probe transport
   * (§12.2 clause 4). Registration stays provider-free: the resolver is only
   * invoked when a probe actually runs, and a composition root that cannot
   * supply a canonical transport simply omits it — the docker slot then keeps
   * the honest typed-unsupported source instead of a raw fallback.
   */
  readonly dockerReachabilityTransport?: () => BoundedReachabilityProbeTransport | null;
}

function digest(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function accountRef(kind: string, ...parts: readonly string[]): string {
  return `codex-account-${kind}:${digest(kind, ...parts)}`;
}

function limitRef(kind: string, ...parts: readonly string[]): string {
  return `codex-limit-${kind}:${digest(kind, ...parts)}`;
}

function reachabilityRef(kind: string, ...parts: readonly string[]): string {
  return `codex-reachability-${kind}:${digest(kind, ...parts)}`;
}

/** The codex CLI state dir name, taken from the canonical provider command spec. */
function codexStateDirName(): string {
  const dir = PROVIDER_COMMAND_SPECS['codex']?.oauthHomeDir;
  if (!dir) throw new Error('Codex evidence sources require the canonical codex state dir spec');
  return dir;
}

interface CodexStatePaths {
  readonly authStateFile: string;
  readonly sessionsDir: string;
}

/**
 * Resolve the codex CLI state dir from the injected env/platform only.
 *
 * `CODEX_HOME` wins (the CLI's own override); otherwise the platform-correct user
 * home from {@link resolveGlobalScopePaths} — so win32 resolves through
 * `USERPROFILE`/`HOMEDRIVE`+`HOMEPATH` with win32 path joining, exactly like the
 * rest of deckent. Returns null when no home can be derived: an unresolvable
 * location is a typed absence, never a fallback to this process's own home.
 */
function resolveCodexStatePaths(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): CodexStatePaths | null {
  const scopeEnv: GlobalScopeEnv = env;
  let stateDir: string | null = null;
  let pathApi = platform === 'win32' ? win32 : posix;
  const override = env[CODEX_HOME_ENV];
  if (override !== undefined && override.trim() !== '') {
    stateDir = override;
  } else {
    try {
      const scopePlatform = normalizeGlobalScopePlatform(platform, scopeEnv);
      pathApi = scopePlatform === 'win32' ? win32 : posix;
      const home = resolveGlobalScopePaths(scopePlatform, scopeEnv).home;
      stateDir = home === null ? null : pathApi.join(home, codexStateDirName());
    } catch {
      stateDir = null;
    }
  }
  if (stateDir === null) return null;
  return {
    authStateFile: pathApi.join(stateDir, AUTH_STATE_FILE),
    sessionsDir: pathApi.join(stateDir, SESSIONS_DIR),
  };
}

interface BoundedRead {
  readonly text: string;
  /** True when the head of the file was skipped (tail-only read). */
  readonly partial: boolean;
}

/** Bounded tail read. Returns null for any unreadable/oversize-refused state. */
function readBoundedTail(path: string, maxBytes: number, refuseOversize: boolean): BoundedRead | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    if (!Number.isSafeInteger(size) || size <= 0) return null;
    if (refuseOversize && size > maxBytes) return null;
    const length = Math.min(size, maxBytes);
    const start = size - length;
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const bytes = readSync(fd, buffer, read, length - read, start + read);
      if (bytes <= 0) break;
      read += bytes;
    }
    return { text: buffer.subarray(0, read).toString('utf8'), partial: start > 0 };
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // The descriptor is already gone; the bounded read result stands.
      }
    }
  }
}

function parseObject(raw: string): Readonly<Record<string, unknown>> | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>>
      : null;
  } catch {
    return null;
  }
}

function canonicalSubject(value: unknown): string | null {
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

// ─── Durable auth state ──────────────────────────────────────────────────────

type CodexAuthState =
  | { readonly kind: 'unreadable'; readonly reason: 'location-unresolved' | 'state-absent' }
  | { readonly kind: 'invalid'; readonly reason: 'not-an-object' | 'no-credential'; readonly stateDigest: string }
  | { readonly kind: 'account'; readonly accountId: string; readonly stateDigest: string }
  | { readonly kind: 'credential-only'; readonly stateDigest: string };

/**
 * Project the codex CLI's durable auth state onto a typed evidence state.
 *
 * `stateDigest` is a one-way SHA-256 over the persisted bytes: it changes when
 * the CLI rotates the stored credential, which is exactly the credential
 * *generation* signal the producer needs, and it never carries the material
 * itself (raw token/key text never leaves this function).
 */
function readCodexAuthState(paths: CodexStatePaths | null): CodexAuthState {
  if (paths === null) return { kind: 'unreadable', reason: 'location-unresolved' };
  const read = readBoundedTail(paths.authStateFile, MAX_AUTH_STATE_BYTES, true);
  if (read === null) return { kind: 'unreadable', reason: 'state-absent' };
  const stateDigest = digest('auth-state', read.text);
  const state = parseObject(read.text);
  if (state === null) return { kind: 'invalid', reason: 'not-an-object', stateDigest };
  const tokens = state[TOKENS_FIELD];
  const accountId = tokens !== null && typeof tokens === 'object' && !Array.isArray(tokens)
    ? canonicalSubject((tokens as Record<string, unknown>)[ACCOUNT_ID_FIELD])
    : null;
  if (accountId !== null) return { kind: 'account', accountId, stateDigest };
  if (canonicalSubject(state[API_KEY_FIELD]) !== null) return { kind: 'credential-only', stateDigest };
  return { kind: 'invalid', reason: 'no-credential', stateDigest };
}

function authStateEvidenceRef(state: CodexAuthState): string {
  return state.kind === 'unreadable'
    ? accountRef('state', state.kind, state.reason)
    : accountRef(
      'state',
      state.kind,
      state.kind === 'invalid' ? state.reason : 'parsed',
      state.stateDigest,
    );
}

function accountScopeEvidenceRef(input: ProviderAccountIdentityRequest, reason: string): string {
  return accountRef(
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

function isExactAccountScope(input: ProviderAccountIdentityRequest): boolean {
  return input.provider === 'codex'
    && input.authMode === 'subscription'
    && input.backend.transport === 'cli'
    && input.executionProfile.provider === 'codex'
    && input.executionProfile.profileRef === input.backend.executionProfileRef
    && input.executionProfile.allowed.some(allowed =>
      allowed.authMode === input.authMode
      && allowed.transport === input.backend.transport
      && allowed.executionBackend === input.backend.executionBackend);
}

/**
 * Host-side codex subscription account authority.
 *
 * The provider-native account subject exists only in the returned host-memory
 * object; ProviderEvidenceProducer pseudonymizes it immediately, so durable
 * evidence carries opaque SHA-256 references only. A stored API key is
 * `credential-only`: a key proves a credential, never a subscription account
 * authority — the same distinction the claude authority draws.
 */
export class CodexAccountIdentityAuthority implements ProviderAccountIdentityAuthority {
  readonly authorityRef = accountRef('authority', 'codex-cli-state-file-v1');
  private readonly env: NodeJS.ProcessEnv;
  private readonly platform: NodeJS.Platform;
  private readonly now: () => Date;

  constructor(options: CodexHostSubscriptionEvidenceRegistryOptions = {}) {
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.now = options.now ?? (() => new Date());
  }

  async resolve(input: ProviderAccountIdentityRequest): Promise<ProviderAccountIdentityResult> {
    if (!isExactAccountScope(input)) {
      return { state: 'hold', evidenceRef: accountScopeEvidenceRef(input, 'scope-mismatch') };
    }
    const state = readCodexAuthState(resolveCodexStatePaths(this.env, this.platform));
    const evidenceRef = authStateEvidenceRef(state);
    if (state.kind === 'unreadable' || state.kind === 'invalid') {
      return { state: 'hold', evidenceRef };
    }

    const fetchedAt = this.now();
    if (!Number.isFinite(fetchedAt.getTime())) return { state: 'hold', evidenceRef };
    const common = {
      credentialGenerationRef: accountRef('credential', 'codex', state.stateDigest),
      evidenceRef,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt: new Date(fetchedAt.getTime() + DEFAULT_TTL_MS).toISOString(),
    } as const;
    if (state.kind === 'credential-only') return { state: 'credential-only', ...common };

    return {
      state: 'ready',
      provider: 'codex',
      authMode: 'subscription',
      identityKind: 'provider-account',
      assurance: 'provider-verified',
      issuer: 'codex-cli-state-file',
      stableSubject: state.accountId,
      backendScopeRefHash: deriveProviderAccountBackendScopeRefHash(input),
      ...common,
    };
  }
}

// ─── Durable usage state ─────────────────────────────────────────────────────

type LimitSourceInput = Parameters<ProviderLimitEvidenceSource['observe']>[0];

interface CodexRateLimitWindow {
  readonly usedPercent: number;
  readonly displayRefHash: string | null;
}

type CodexUsageState =
  | {
      readonly kind: 'snapshot';
      readonly stateDigest: string;
      readonly primary: CodexRateLimitWindow | null;
      readonly secondary: CodexRateLimitWindow | null;
    }
  | {
      readonly kind: 'unavailable';
      readonly reason:
        | 'location-unresolved'
        | 'sessions-absent'
        | 'log-absent'
        | 'no-rate-limit-snapshot';
    };

function boundedEntries(dir: string): readonly string[] | null {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    if (entries.length > MAX_DIR_ENTRIES) return null;
    return entries.map(entry => entry.name);
  } catch {
    return null;
  }
}

/**
 * How many newest-named leaf logs the usage reader may try. Short-lived codex
 * sessions (a few seconds — exactly the shape of OUR OWN verifier probes) can
 * close without ever writing a `rate_limits` snapshot; picking only THE
 * greatest-named file then starves the limit source on its own probe debris
 * (measured live 2026-08-20: two ~86KB snapshot-less rollouts shadowed a
 * 15.7MB snapshot-rich session and every verifier candidacy fell to
 * `source_unavailable`). A bounded candidate list keeps the read finite while
 * surviving that shape.
 */
const MAX_SESSION_LOG_CANDIDATES = 5;

/**
 * Newest rollout logs under a date-partitioned `sessions/` tree.
 *
 * codex partitions by zero-padded date segments and prefixes each log with its
 * own timestamp, so "greatest name per level" is a deterministic newest-first
 * descent that needs at most {@link MAX_SESSION_DESCENT}+1 bounded readdir
 * calls — never a recursive tree walk. At the LEAF level this returns the
 * newest-named `limit` entries (newest first) instead of only the greatest
 * one, so a snapshot-less short session cannot shadow its siblings.
 */
function newestSessionLogs(
  sessionsDir: string,
  pathApi: typeof posix,
  limit: number,
): string[] {
  let current = sessionsDir;
  // Each directory is read exactly ONCE: the greatest child's listing is
  // probed to detect the leaf level and then CARRIED into the next iteration
  // instead of being re-read, keeping the total at MAX_SESSION_DESCENT+1
  // bounded readdir calls.
  let names = boundedEntries(current);
  for (let level = 0; level < MAX_SESSION_DESCENT; level += 1) {
    if (names === null || names.length === 0) return level === 0 ? [] : [current];
    const sorted = [...names].sort();
    const next = pathApi.join(current, sorted.at(-1)!);
    const nextNames = boundedEntries(next);
    if (nextNames === null) {
      // Leaf directory: its entries are the log files themselves.
      return sorted.slice(-limit).reverse().map(name => pathApi.join(current, name));
    }
    current = next;
    names = nextNames;
  }
  return [current];
}

function rateLimitWindow(value: unknown): CodexRateLimitWindow | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const usedPercent = record['used_percent'];
  if (typeof usedPercent !== 'number'
    || !Number.isFinite(usedPercent)
    || usedPercent < 0
    || usedPercent > 100) {
    return null;
  }
  const windowMinutes = record['window_minutes'];
  const resetsInSeconds = record['resets_in_seconds'];
  const displayParts = [windowMinutes, resetsInSeconds]
    .filter((part): part is number => typeof part === 'number' && Number.isFinite(part))
    .map(String);
  return {
    usedPercent,
    // A durable file can be arbitrarily old, so its relative reset countdown is
    // display evidence only — hashed, never re-based onto the current clock.
    displayRefHash: displayParts.length > 0 ? digest('reset-display', ...displayParts) : null,
  };
}

/** Bounded-depth search for the codex `rate_limits` snapshot in one persisted event. */
function findRateLimitSnapshot(value: unknown, depth: number): Record<string, unknown> | null {
  if (depth > MAX_EVENT_DEPTH || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRateLimitSnapshot(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  const candidate = record[RATE_LIMIT_FIELD];
  if (candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)) {
    const snapshot = candidate as Record<string, unknown>;
    if (rateLimitWindow(snapshot['primary']) !== null
      || rateLimitWindow(snapshot['secondary']) !== null) {
      return snapshot;
    }
  }
  for (const nested of Object.values(record)) {
    const found = findRateLimitSnapshot(nested, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Project the codex CLI's persisted usage log onto the newest rate-limit snapshot.
 *
 * codex has emitted more than one event envelope for the same usage payload
 * (classic `msg.type = token_count` and the newer thread/turn item stream — both
 * documented in providers/codex.ts), so the reader keys on the `rate_limits`
 * payload itself rather than betting on one envelope. No recognized snapshot in
 * the bounded tail is a typed absence, not an assumed zero.
 */
function readCodexUsageState(
  paths: CodexStatePaths | null,
  platform: NodeJS.Platform,
): CodexUsageState {
  if (paths === null) return { kind: 'unavailable', reason: 'location-unresolved' };
  const pathApi = platform === 'win32' ? win32 : posix;
  const logs = newestSessionLogs(paths.sessionsDir, pathApi, MAX_SESSION_LOG_CANDIDATES);
  if (logs.length === 0) return { kind: 'unavailable', reason: 'sessions-absent' };
  let sawReadableLog = false;
  for (const log of logs) {
    const read = readBoundedTail(log, MAX_USAGE_TAIL_BYTES, false);
    if (read === null) continue;
    sawReadableLog = true;
    const lines = read.text.split('\n');
    // A tail read can start mid-line; that fragment is never a parseable event.
    if (read.partial) lines.shift();
    const bounded = lines.slice(-MAX_EVENT_LINES);
    for (let index = bounded.length - 1; index >= 0; index -= 1) {
      const line = bounded[index]?.trim();
      if (line === undefined || line === '') continue;
      const event = parseObject(line);
      if (event === null) continue;
      const snapshot = findRateLimitSnapshot(event, 0);
      if (snapshot === null) continue;
      const primary = rateLimitWindow(snapshot['primary']);
      const secondary = rateLimitWindow(snapshot['secondary']);
      return {
        kind: 'snapshot',
        stateDigest: digest('usage-state', JSON.stringify({ primary, secondary })),
        primary,
        secondary,
      };
    }
    // No snapshot in this candidate's bounded tail — try the next-newest
    // sibling (short probe sessions legitimately never write one).
  }
  return { kind: 'unavailable', reason: sawReadableLog ? 'no-rate-limit-snapshot' : 'log-absent' };
}

function percentWindow(
  windowId: string,
  kind: ProviderLimitWindow['kind'],
  window: CodexRateLimitWindow,
): ProviderLimitWindow {
  return {
    windowId,
    kind,
    model: null,
    unit: 'percent',
    consumed: window.usedPercent,
    remaining: 100 - window.usedPercent,
    limit: 100,
    reset: { state: 'unknown', at: null, displayRefHash: window.displayRefHash },
  };
}

function isExactLimitScope(input: LimitSourceInput): boolean {
  try {
    assertCanonicalModelApiId(input.model);
    assertOpaqueSha256('accountRefHash', input.accountRefHash, true);
    assertOpaqueSha256(
      'account backend scope ref',
      input.accountEvidence?.backendScopeRefHash ?? null,
      true,
    );
    assertOpaqueEvidenceRef(
      'account identity evidence',
      input.accountEvidence?.identityEvidenceRef ?? null,
      true,
    );
    assertOpaqueEvidenceRef(
      'credential generation evidence',
      input.accountEvidence?.credentialGenerationRef ?? null,
      true,
    );
  } catch {
    return false;
  }
  return input.provider === 'codex'
    && input.authMode === 'subscription'
    && input.backend.transport === 'cli'
    && input.accountEvidence !== null;
}

function limitScopeDigest(input: LimitSourceInput): string {
  return digest(
    input.tenantId,
    input.projectId,
    input.provider,
    input.model,
    input.authMode,
    input.accountRefHash ?? 'none',
    input.accountEvidence?.identityEvidenceRef ?? 'none',
    input.accountEvidence?.credentialGenerationRef ?? 'none',
    input.accountEvidence?.backendScopeRefHash ?? 'none',
    input.backend.transport,
    input.backend.executionBackend,
    input.backend.endpointRefHash ?? 'none',
  );
}

/**
 * codex persisted-usage projector.
 *
 * The rate-limit percentages codex writes into its own session log are useful
 * current display evidence, but they prove neither per-call quota burn nor an
 * account-bound reservation — so this source is permanently `advisory`, exactly
 * like the claude `/usage` projector. Canonical limit materialization therefore
 * keeps it advisory even when both display windows are present.
 */
export class CodexUsageStateLimitEvidenceSource implements ProviderLimitEvidenceSource {
  readonly authorityRef = limitRef('authority', 'codex-usage-state-v1');
  readonly kind = 'provider-cli' as const;
  readonly authority = 'advisory' as const;
  private readonly env: NodeJS.ProcessEnv;
  private readonly platform: NodeJS.Platform;
  private readonly now: () => Date;

  constructor(options: CodexHostSubscriptionEvidenceRegistryOptions = {}) {
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.now = options.now ?? (() => new Date());
  }

  async observe(input: LimitSourceInput): Promise<ProviderLimitSourceObservation> {
    const scopeDigest = limitScopeDigest(input);
    const fetchedAt = this.now();
    const expiresAt = new Date(fetchedAt.getTime() + DEFAULT_TTL_MS);
    if (!isExactLimitScope(input) || !Number.isFinite(fetchedAt.getTime())) {
      return {
        state: 'unavailable',
        requiredWindowIds: [],
        windows: [],
        source: {
          operatorApprovalRef: null,
          evidenceRef: limitRef('unavailable', 'scope', scopeDigest),
          fetchedAt: Number.isFinite(fetchedAt.getTime())
            ? fetchedAt.toISOString()
            : new Date(0).toISOString(),
          expiresAt: Number.isFinite(expiresAt.getTime())
            ? expiresAt.toISOString()
            : new Date(1).toISOString(),
          incorporatedReservationEventRefs: [],
        },
      };
    }

    const state = readCodexUsageState(
      resolveCodexStatePaths(this.env, this.platform),
      this.platform,
    );
    const accountEvidenceRefs = [
      input.accountEvidence!.identityEvidenceRef,
      input.accountEvidence!.credentialGenerationRef,
    ];
    const window = {
      fetchedAt: fetchedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      incorporatedReservationEventRefs: [] as readonly string[],
      operatorApprovalRef: null,
    } as const;
    if (state.kind === 'unavailable') {
      return {
        state: 'unavailable',
        requiredWindowIds: [],
        windows: [],
        source: {
          ...window,
          evidenceRef: limitRef('unavailable', scopeDigest, state.reason),
        },
        evidenceRefs: accountEvidenceRefs,
      };
    }

    const windows: ProviderLimitWindow[] = [];
    const requiredWindowIds: string[] = [];
    if (state.primary !== null) {
      windows.push(percentWindow(PRIMARY_WINDOW_ID, 'session', state.primary));
      requiredWindowIds.push(PRIMARY_WINDOW_ID);
    }
    if (state.secondary !== null) {
      windows.push(percentWindow(SECONDARY_WINDOW_ID, 'week-all', state.secondary));
      requiredWindowIds.push(SECONDARY_WINDOW_ID);
    }
    return {
      state: 'known',
      // Required = the windows the VALID snapshot actually declares. The codex
      // CLI truthfully reports `secondary: null` on plans without a secondary
      // window (measured live 2026-08-12, pro plan) — an absent-by-design
      // window is provider shape, not incomplete evidence, and must not hold
      // every probe forever. Corrupt/unreadable state still fails closed above
      // as typed `unavailable`; this list can never widen past what was read.
      requiredWindowIds,
      windows,
      source: {
        ...window,
        evidenceRef: limitRef('snapshot', scopeDigest, state.stateDigest),
      },
      evidenceRefs: [...accountEvidenceRefs, limitRef('model-scope', input.model)],
    };
  }
}

// ─── Reachability slot ───────────────────────────────────────────────────────

/**
 * Typed-unsupported codex reachability.
 *
 * The registration contract requires a reachability source, and reachability can
 * only be proven by an authorized live provider invocation. This read-only state
 * projector holds no such authority, so it reports `unsupported` with an opaque
 * evidence ref: upstream keeps holding on an unproven probe instead of receiving
 * a fabricated reachable verdict. A live codex transport belongs to a task that
 * carries invocation authority.
 */
export class CodexReachabilityUnavailableEvidenceSource
implements ProviderReachabilityEvidenceSource {
  readonly authorityRef = reachabilityRef('authority', 'codex-no-live-transport-v1');

  readonly probe = async (
    request: Readonly<ReachabilityProbeRequest>,
  ): Promise<ReachabilityProbeObservation> => ({
    outcome: 'unsupported',
    calledProvider: null,
    calledModel: null,
    providerRequestRefHash: null,
    latencyMs: null,
    evidenceRefs: [reachabilityRef(
      'scope',
      request.provider,
      request.model,
      request.auth.mode,
      request.backend.transport,
      request.backend.executionBackend,
      request.backend.executionProfileRef,
    )],
  });
}

/**
 * Live codex reachability over the canonical Docker bounded-probe transport
 * (§12.2 clause 4).
 *
 * Exact scope: subscription · cli · docker with a resolvable execution profile
 * ref. Anything else — and any probe arriving without a resolvable canonical
 * transport or a billing-mode budget projection — is a typed non-live outcome,
 * never a fabricated verdict. The source emits provider-native observations
 * only; `reachable`/`liveProven` promotion stays in canonical core
 * (provider-truth), which also enforces called-identity match.
 */
const DOCKER_PROBE_PROMPT = 'Reply with exactly DECKENT_REACHABILITY_OK. Do not use tools.';

export class CodexDockerReachabilityEvidenceSource
implements ProviderReachabilityEvidenceSource {
  readonly authorityRef = reachabilityRef('authority', 'codex-docker-bounded-probe-v1');

  constructor(
    private readonly resolveTransport: () => BoundedReachabilityProbeTransport | null,
  ) {}

  readonly probe = async (
    request: Readonly<ReachabilityProbeRequest>,
  ): Promise<ReachabilityProbeObservation> => {
    const scopeRefs = [reachabilityRef(
      'scope',
      request.provider,
      request.model,
      request.auth.mode,
      request.backend.transport,
      request.backend.executionBackend,
      request.backend.executionProfileRef,
    )];
    const notLive = (
      outcome: 'unsupported' | 'not-run',
      detail: string,
    ): ReachabilityProbeObservation => ({
      outcome,
      calledProvider: null,
      calledModel: null,
      providerRequestRefHash: null,
      latencyMs: null,
      evidenceRefs: [...scopeRefs, reachabilityRef('hold', detail)],
    });

    if (request.provider !== 'codex'
      || request.auth.mode !== 'subscription'
      || request.backend.transport !== 'cli'
      || request.backend.executionBackend !== 'docker'
      || !isExecutionProfileRef(request.backend.executionProfileRef)) {
      return notLive('unsupported', 'scope-mismatch');
    }
    const projection = request.admission.budget.projection;
    if (!projection) return notLive('not-run', 'budget-projection-unavailable');
    const transport = this.resolveTransport();
    if (!transport) return notLive('unsupported', 'no-canonical-docker-transport');

    const native = await transport.invoke({
      provider: request.provider,
      model: request.model,
      executionProfileRef: request.backend.executionProfileRef,
      promptBytes: new TextEncoder().encode(DOCKER_PROBE_PROMPT),
      timeoutMs: projection.timeoutMs,
      maxOutputTokens: projection.maxOutputTokens,
    });

    switch (native.outcome) {
      case 'completed':
        // Called identity is structurally pinned: the canonical builder derives
        // argv from the provider command spec + registry apiId for exactly this
        // request, so echoing the requested identity is backed by the executed
        // command, not by parsing provider output.
        return {
          outcome: 'succeeded',
          calledProvider: request.provider,
          calledModel: request.model,
          providerRequestRefHash: native.providerRequestRef
            ? digest('provider-request-ref', native.providerRequestRef)
            : null,
          latencyMs: native.latencyMs,
          evidenceRefs: scopeRefs,
        };
      case 'timed-out':
        return {
          outcome: 'timeout',
          calledProvider: null,
          calledModel: null,
          providerRequestRefHash: null,
          latencyMs: native.elapsedMs,
          evidenceRefs: scopeRefs,
        };
      case 'rejected':
        return {
          outcome: 'invalid-response',
          calledProvider: null,
          calledModel: null,
          providerRequestRefHash: null,
          latencyMs: native.latencyMs,
          evidenceRefs: [...scopeRefs, reachabilityRef('rejected', native.providerCode ?? 'unclassified')],
        };
      case 'transport-error':
        return {
          outcome: native.errorCode === 'backend_unreachable' ? 'backend-unreachable'
            : native.errorCode === 'backend_unsupported' ? 'unsupported'
              : native.errorCode === 'credential_unavailable' ? 'auth-rejected'
                : 'transport-error',
          calledProvider: null,
          calledModel: null,
          providerRequestRefHash: null,
          latencyMs: native.elapsedMs,
          evidenceRefs: [...scopeRefs, reachabilityRef('transport-error', native.errorCode)],
        };
    }
  };
}

// ─── Registrations ───────────────────────────────────────────────────────────

/**
 * Canonical registrations for the codex subscription CLI scope on a host
 * subprocess. Construction is provider-free and every producer stays lazy — the
 * durable state is read when a source is actually observed, never at wiring time.
 */
export function createCodexHostSubscriptionEvidenceSourceRegistrations(
  options: CodexHostSubscriptionEvidenceRegistryOptions = {},
): readonly ProviderEvidenceSourceRegistration[] {
  const accountAuthority = new CodexAccountIdentityAuthority(options);
  const limitSource = new CodexUsageStateLimitEvidenceSource(options);
  const hostReachabilitySource = new CodexReachabilityUnavailableEvidenceSource();
  // The docker slot gains a LIVE source only when the composition root supplies
  // the canonical Docker bounded-probe transport (§12.2 clause 4); otherwise it
  // keeps the honest typed-unsupported source. The host-subprocess slot always
  // stays the honest stub — no live codex transport exists on that scope.
  const dockerReachabilitySource = options.dockerReachabilityTransport
    ? new CodexDockerReachabilityEvidenceSource(options.dockerReachabilityTransport)
    : hostReachabilitySource;
  // The xverify verifier runs the codex CLI inside the DOCKER backend while the
  // authoring flow's default probe is host-subprocess — the SAME durable
  // auth/usage state backs both, so both scopes register over the same lazy
  // producers (measured live 2026-08-12: docker-scope authoring held with
  // source-unavailable until this second registration existed).
  const backends = ['host-subprocess', 'docker'] as const;
  return Object.freeze(backends.map((executionBackend) => {
    const reachabilitySource = executionBackend === 'docker'
      ? dockerReachabilitySource
      : hostReachabilitySource;
    return {
      provider: 'codex' as const,
      authMode: 'subscription' as const,
      transport: 'cli' as const,
      executionBackend,
      sources: {
        account: {
          authorityRef: accountAuthority.authorityRef,
          resolve: (input: ProviderAccountIdentityRequest) => accountAuthority.resolve(input),
        },
        limit: {
          authorityRef: limitSource.authorityRef,
          kind: limitSource.kind,
          authority: limitSource.authority,
          observe: (input: LimitSourceInput) => limitSource.observe(input),
        },
        reachability: {
          authorityRef: reachabilitySource.authorityRef,
          probe: (input: ReachabilityProbeRequest) => reachabilitySource.probe(input),
        },
      },
    } satisfies ProviderEvidenceSourceRegistration;
  }));
}

/**
 * Concrete codex source registry for the exact subscription CLI host-subprocess
 * scope. Host state evidence is intentionally not projected onto Docker, tmux,
 * API or hybrid backends.
 */
export function createCodexHostSubscriptionEvidenceSourceRegistry(
  options: CodexHostSubscriptionEvidenceRegistryOptions = {},
): ProviderEvidenceSourceRegistry {
  return new ProviderEvidenceSourceRegistry(
    createCodexHostSubscriptionEvidenceSourceRegistrations(options),
  );
}
