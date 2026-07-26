// src/core/verifier-entitlement-memory.ts
//
// MASTER-PLAN 671(b) — remember which (auth mode, provider, model) triples the
// provider has actually REFUSED, so the same known-bad verifier dispatch is not
// paid for twice.
//
// Why this is not `ProviderTruthStore`: that store answers "was this pair probed
// under evidenced admission?" and its records require an account ref hash, an
// approval ref, a limit-evidence chain and an execution-profile ref. A verifier
// refusal observed mid-sprint has none of those. Filling them in to satisfy the
// record shape would be inventing evidence — inside the fix for a finding about
// claiming more than the evidence supports. This module makes the smaller claim
// it can actually support: *this pair was live-refused, here is the provider's
// own wording, here is when*.
//
// Three rules keep this a learning layer and not a new failure mode:
//
//  1. **Only durable refusals are remembered.** `model-not-found` and
//     `auth-rejected` are properties of the (auth mode, model) pair. A
//     `rate-limited` or `transport-error` refusal is a property of one bad
//     minute; persisting those would blacklist a perfectly good model forever.
//  2. **Fail-open, always.** A missing, unreadable or corrupt log means "nothing
//     learned" and callers proceed exactly as they did before. This layer may
//     never be the reason verification stops happening.
//  3. **Entitlement expires.** Plan upgrades and account switches change what an
//     account may call, so a remembered refusal ages out (see
//     {@link VERIFIER_REFUSAL_TTL_MS}). Being briefly wrong in the direction of
//     "retry and find out" is recoverable; being permanently wrong is not.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  normalizeGlobalScopePlatform,
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
  type GlobalScopePlatform,
} from './global-scope-resolver.js';
import { debugLog } from './utils.js';

export const VERIFIER_REFUSAL_SCHEMA_VERSION = 1 as const;

/**
 * How long a remembered refusal suppresses a re-attempt. Long enough that a
 * sprint series does not re-pay the same rejection, short enough that a plan
 * change or account switch heals itself without operator action.
 */
export const VERIFIER_REFUSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The refusal arms that describe the pair rather than the moment. Deliberately
 * narrower than `ReachabilityOutcome`: see rule 1 in the module header.
 */
export type DurableRefusalOutcome = 'model-not-found' | 'auth-rejected';

export function isDurableRefusalOutcome(outcome: string): outcome is DurableRefusalOutcome {
  return outcome === 'model-not-found' || outcome === 'auth-rejected';
}

/** One live-observed provider refusal. Append-only; newest wins on read. */
export interface VerifierRefusalRecord {
  readonly schemaVersion: typeof VERIFIER_REFUSAL_SCHEMA_VERSION;
  /**
   * Auth mode in force when the refusal happened. This dimension is the whole
   * point: the measured sprint-460 refusal said "not supported when using Codex
   * with a ChatGPT account" — the same model may well be callable under `api`.
   */
  readonly authMode: string;
  readonly provider: string;
  readonly model: string;
  readonly outcome: DurableRefusalOutcome;
  /** The provider's OWN wording, verbatim — never a paraphrase. */
  readonly message: string;
  readonly status?: number;
  readonly errorType?: string;
  readonly observedAt: string;
}

export interface VerifierRefusalQuery {
  readonly authMode: string;
  readonly provider: string;
  readonly model: string;
}

/** Injectable seams. Tests pass a tmpdir env; production passes nothing. */
export interface VerifierRefusalMemoryDeps {
  readonly platform?: GlobalScopePlatform;
  readonly env?: GlobalScopeEnv;
  readonly now?: () => Date;
}

/**
 * Account-scoped, not project-scoped: entitlement is a property of the account
 * behind the CLI login, so a per-project record would make every new project
 * re-pay the same rejection to learn the same fact.
 */
export function resolveVerifierRefusalLogPath(deps: VerifierRefusalMemoryDeps = {}): string {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? normalizeGlobalScopePlatform(process.platform, env);
  const { stateDir } = resolveGlobalScopePaths(platform, env);
  return join(stateDir, 'runtime', 'verifier-entitlement', 'refusals.jsonl');
}

/**
 * Remember a refusal. Returns whether it was persisted — false covers both
 * "transient, deliberately not remembered" and "write failed", because neither
 * changes what the caller does next.
 */
export function recordVerifierRefusal(
  // `outcome` is deliberately the WIDE type: callers hand over whatever the
  // provider said and this function decides what is worth remembering, so no
  // caller has to narrow (and none can accidentally narrow it wrongly).
  input: Omit<VerifierRefusalRecord, 'schemaVersion' | 'observedAt' | 'outcome'>
    & { readonly outcome: string },
  deps: VerifierRefusalMemoryDeps = {},
): boolean {
  if (!isDurableRefusalOutcome(input.outcome)) return false;
  if (input.message.trim() === '') return false;
  try {
    const now = deps.now ?? (() => new Date());
    const record: VerifierRefusalRecord = {
      schemaVersion: VERIFIER_REFUSAL_SCHEMA_VERSION,
      authMode: input.authMode,
      provider: input.provider,
      model: input.model,
      outcome: input.outcome,
      message: input.message.trim(),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.errorType !== undefined ? { errorType: input.errorType } : {}),
      observedAt: now().toISOString(),
    };
    const logPath = resolveVerifierRefusalLogPath(deps);
    mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
    appendFileSync(logPath, `${JSON.stringify(record)}\n`, { encoding: 'utf-8', mode: 0o600 });
    return true;
  } catch (err) {
    debugLog('verifier-entitlement:record-failed', String(err));
    return false;
  }
}

/**
 * The newest un-expired refusal for this exact triple, or null.
 *
 * Null is returned for every uncertainty — no log, unreadable log, corrupt line,
 * expired record, unknown schema. Callers must treat null as "nothing learned"
 * and proceed as before (rule 2).
 */
export function findVerifierRefusal(
  query: VerifierRefusalQuery,
  deps: VerifierRefusalMemoryDeps = {},
): VerifierRefusalRecord | null {
  try {
    const logPath = resolveVerifierRefusalLogPath(deps);
    if (!existsSync(logPath)) return null;
    const now = (deps.now ?? (() => new Date()))().getTime();
    let newest: VerifierRefusalRecord | null = null;
    let newestAt = Number.NEGATIVE_INFINITY;
    for (const line of readFileSync(logPath, 'utf-8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const record = asRecord(parsed);
      if (record === null) continue;
      if (record.authMode !== query.authMode
        || record.provider !== query.provider
        || record.model !== query.model) continue;
      const observedAt = Date.parse(record.observedAt);
      if (Number.isNaN(observedAt)) continue;
      // An entitlement fact older than the TTL is history, not current truth.
      if (now - observedAt > VERIFIER_REFUSAL_TTL_MS) continue;
      if (observedAt >= newestAt) {
        newest = record;
        newestAt = observedAt;
      }
    }
    return newest;
  } catch (err) {
    debugLog('verifier-entitlement:read-failed', String(err));
    return null;
  }
}

/** Validate a parsed line. An unknown schema version is ignored, never guessed. */
function asRecord(value: unknown): VerifierRefusalRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v['schemaVersion'] !== VERIFIER_REFUSAL_SCHEMA_VERSION) return null;
  if (typeof v['authMode'] !== 'string'
    || typeof v['provider'] !== 'string'
    || typeof v['model'] !== 'string'
    || typeof v['message'] !== 'string'
    || typeof v['observedAt'] !== 'string'
    || typeof v['outcome'] !== 'string'
    || !isDurableRefusalOutcome(v['outcome'])) return null;
  return {
    schemaVersion: VERIFIER_REFUSAL_SCHEMA_VERSION,
    authMode: v['authMode'],
    provider: v['provider'],
    model: v['model'],
    outcome: v['outcome'],
    message: v['message'],
    ...(typeof v['status'] === 'number' ? { status: v['status'] } : {}),
    ...(typeof v['errorType'] === 'string' ? { errorType: v['errorType'] } : {}),
    observedAt: v['observedAt'],
  };
}
