// ═══ Provider Failure Classifier ═══════════════════════════════════
// Sprint 272 Task 006 (F1-LIM faz-2b).
//
// 269 live lesson: when the provider usage-limit was exhausted, EVERY
// worker exited without writing a `.result`, and the FIX wave re-ran
// into the SAME dead limit — burning tokens on work that could not
// possibly succeed until the limit reset.
//
// This module is the pure SSOT that discriminates a provider-side
// failure (usage-limit / auth / OOM) from an ordinary code failure, so
// the FIX phase can PARK instead of wasting a whole retry wave.
//
// Design mirrors the existing classifyFailure() in result-evaluator.ts:
// readonly RegExp arrays + a side-effect-free classifier returning a
// small discriminated kind. No new runtime dependency (ADR-010).
//
// SIGNATURE PROVENANCE — every pattern below is grounded in a real
// observation, never invented (DIRECTIVES: "uydurma regex yazma";
// unknown signatures must fall through to 'unknown'):
//   • usage-limit — docs/audits/sprint-152 explicitly records the Claude
//     CLI emitting "Usage limit reached" / "429" when the Max-plan
//     sliding window is exhausted; sprint-utils.ts:369 already keys spawn
//     retry hints off rate/limit/429.
//   • oom — exitCode 137 (SIGKILL) is the hard OOM rule already enforced
//     in result-evaluator.ts:1582; spawn-backend-docker.ts:1266 maps
//     exit 137 → OOM notes ("oomkilled", "exit 137", "SIGKILL").
//   • auth — Anthropic API authentication errors surface as
//     `authentication_error` / "invalid x-api-key" / HTTP 401, and the
//     Claude CLI prompts "Please run /login" when the session is dead.

/** Discriminated provider-failure kind. `unknown` = not a recognized provider failure. */
export type ProviderFailureKind = 'usage-limit' | 'auth' | 'oom' | 'unknown';

/** Input to {@link classifyProviderFailure} — any subset may be present. */
export interface ProviderFailureInput {
  /** Raw worker process log / CLI stdout+stderr, if captured. */
  workerLog?: string;
  /** A task result's `notes` field (often carries the synthetic crash text). */
  resultNotes?: string;
  /** Worker process exit code, if available (137 = SIGKILL/OOM). */
  exitCode?: number;
}

/**
 * Usage-limit (provider quota/rate exhaustion) signatures.
 *
 * Re-running a worker against any of these will fail identically until
 * the provider's limit window resets — the FIX guard parks on these.
 */
const USAGE_LIMIT_PATTERNS: readonly RegExp[] = [
  /usage\s+limit\s+reached/i, // Claude CLI Max-plan exhaustion (sprint-152 audit)
  /limit\s+will\s+reset/i, // Claude CLI: "Your limit will reset at ..."
  /rate[\s_-]?limit/i, // generic rate-limit (rate_limit_error / "rate limit")
  /\b429\b/, // HTTP 429 Too Many Requests (sprint-152 audit, sprint-utils:369)
  /too\s+many\s+requests/i, // HTTP 429 canonical reason phrase
  /\bquota\b/i, // quota exhausted
];

/**
 * Authentication / authorization failure signatures.
 *
 * These mean the credential is invalid or absent — a retry wastes effort
 * until the user re-authenticates. Distinct from usage-limit so callers
 * can message accurately.
 */
const AUTH_PATTERNS: readonly RegExp[] = [
  /authentication_error/i, // Anthropic API error type
  /invalid\s+(x-)?api[\s_-]?key/i, // Anthropic invalid key
  /\b401\b/, // HTTP 401 Unauthorized
  /unauthorized/i,
  /not\s+authenticated/i,
  /please\s+run\s+\/?login/i, // Claude CLI re-login prompt
];

/**
 * OOM / SIGKILL signatures (text path — the exitCode 137 hard rule is
 * checked separately, mirroring result-evaluator.ts).
 */
const OOM_PATTERNS: readonly RegExp[] = [
  /oom[\s-]?killed/i,
  /out\s+of\s+memory/i,
  /exit(?:code)?[=:\s-]*137\b/i, // "exit 137" / "exitCode=137"
  /sigkill/i,
  /signal\s+9\b/i,
];

/** OOM/SIGKILL exit code — kernel OOM-killer or `docker stop`. */
const SIGKILL_EXIT_CODE = 137;

/**
 * Classify a provider-side failure from any combination of worker log,
 * result notes, and exit code.
 *
 * Pure — no I/O, no mutation. Decision order:
 *   1. exitCode === 137 → 'oom' (hard rule, matches classifyFailure).
 *   2. Scan combined text: usage-limit → auth → oom (first match wins).
 *   3. No recognized signature → 'unknown' (never guess).
 *
 * usage-limit is scanned before auth/oom because a 429/usage-limit is the
 * single most actionable provider-park signal; the categories rarely
 * co-occur in practice.
 */
export function classifyProviderFailure(input: ProviderFailureInput): ProviderFailureKind {
  // ── Hard rule: exit 137 = SIGKILL (kernel OOM or docker stop) ───────
  if (input.exitCode === SIGKILL_EXIT_CODE) {
    return 'oom';
  }

  const text = `${input.workerLog ?? ''}\n${input.resultNotes ?? ''}`;
  if (text.trim().length === 0) {
    return 'unknown';
  }

  if (USAGE_LIMIT_PATTERNS.some(p => p.test(text))) return 'usage-limit';
  if (AUTH_PATTERNS.some(p => p.test(text))) return 'auth';
  if (OOM_PATTERNS.some(p => p.test(text))) return 'oom';
  return 'unknown';
}

/** Threshold: skip the FIX wave when this fraction of NO_GOs are usage-limit. */
export const FIX_SKIP_USAGE_LIMIT_RATIO = 0.5;

/** Aggregate classification over a set of failures. */
export interface ProviderFailureSummary {
  /** Total failures classified. */
  total: number;
  /** Count classified 'usage-limit'. */
  usageLimit: number;
  /** Count classified 'oom'. */
  oom: number;
  /** Count classified 'auth'. */
  auth: number;
  /** Count classified 'unknown'. */
  unknown: number;
  /** usageLimit / total (0 when total === 0). */
  usageLimitRatio: number;
  /**
   * true when the caller should SKIP the FIX wave — i.e. the provider
   * looks exhausted (usageLimitRatio ≥ {@link FIX_SKIP_USAGE_LIMIT_RATIO})
   * across a non-empty failure set. A single/sparse limit stays below the
   * threshold → normal FIX behavior is preserved.
   */
  skipFix: boolean;
}

/**
 * Classify each failure and aggregate, computing the FIX-skip verdict.
 *
 * Pure. `total === 0` (no failures) → `skipFix: false` so an empty set
 * never blocks FIX.
 */
export function summarizeProviderFailures(
  inputs: readonly ProviderFailureInput[],
): ProviderFailureSummary {
  let usageLimit = 0;
  let oom = 0;
  let auth = 0;
  let unknown = 0;
  for (const input of inputs) {
    switch (classifyProviderFailure(input)) {
      case 'usage-limit': usageLimit++; break;
      case 'oom': oom++; break;
      case 'auth': auth++; break;
      default: unknown++; break;
    }
  }
  const total = inputs.length;
  const usageLimitRatio = total > 0 ? usageLimit / total : 0;
  return {
    total,
    usageLimit,
    oom,
    auth,
    unknown,
    usageLimitRatio,
    skipFix: total > 0 && usageLimitRatio >= FIX_SKIP_USAGE_LIMIT_RATIO,
  };
}

/**
 * Build the localized, honest user notice shown when the FIX wave is
 * deferred because the provider limit looks exhausted (i18n-FIRST: en+tr).
 *
 * Co-located here rather than in `src/cli/helpers/messages.ts` because
 * that file is outside this task's write-scope; this module is the SSOT
 * for provider-failure messaging.
 */
export function providerLimitFixSkipMessage(
  lang: string,
): { title: string; summary: string } {
  const isTr = lang === 'tr';
  return isTr
    ? {
        title: 'Provider limiti tükendi — FIX ertelendi',
        summary:
          'provider limiti tükenmiş görünüyor — FIX ertelendi; limit reset sonrası `deckent spawn` veya `deckent resume` ile devam edin.',
      }
    : {
        title: 'Provider limit exhausted — FIX deferred',
        summary:
          'Provider usage limit appears exhausted — FIX phase deferred. After the limit resets, run `deckent spawn` or `deckent resume` to continue.',
      };
}
