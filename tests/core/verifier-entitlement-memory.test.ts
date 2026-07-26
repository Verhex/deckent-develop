// tests/core/verifier-entitlement-memory.test.ts
//
// MASTER-PLAN 671(b) — the entitlement memory: remember which
// (auth mode, provider, model) triples the provider actually refused.
//
// The three properties under test are the three rules the module promises, and
// each of them is a way this layer could become worse than the blindness it
// replaces: remembering a transient failure would blacklist a good model; a
// hard read failure would break verification instead of degrading; a permanent
// record would outlive the entitlement it describes.
//
// Hermetic: every call injects a tmpdir `env` (DECKENT_HOME override), so no
// host global state dir is read or written and no gitignored state is touched.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  findVerifierRefusal,
  isDurableRefusalOutcome,
  recordVerifierRefusal,
  resolveVerifierRefusalLogPath,
  VERIFIER_REFUSAL_SCHEMA_VERSION,
  VERIFIER_REFUSAL_TTL_MS,
  type VerifierRefusalMemoryDeps,
} from '../../src/core/verifier-entitlement-memory.js';

let home: string;
let deps: VerifierRefusalMemoryDeps;

/** Fixed clock: TTL behaviour must be asserted, not raced against wall time. */
const NOW = new Date('2026-07-26T12:00:00.000Z');

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'deckent-entitlement-'));
  deps = { platform: 'linux', env: { DECKENT_HOME: home }, now: () => NOW };
});

afterEach(() => {
  try { chmodSync(dirname(resolveVerifierRefusalLogPath(deps)), 0o700); } catch { /* ignore */ }
  rmSync(home, { recursive: true, force: true });
});

/** The measured sprint-460 refusal, which is what this memory exists to hold. */
const CODEX_REFUSAL = {
  authMode: 'subscription',
  provider: 'codex',
  model: 'gpt-4.1',
  outcome: 'model-not-found',
  message: "The 'gpt-4.1' model is not supported when using Codex with a ChatGPT account.",
  status: 400,
  errorType: 'invalid_request_error',
} as const;

const query = { authMode: 'subscription', provider: 'codex', model: 'gpt-4.1' };

describe('verifier entitlement memory · recall', () => {
  it('remembers a live refusal with the provider wording intact', () => {
    expect(recordVerifierRefusal(CODEX_REFUSAL, deps)).toBe(true);

    expect(findVerifierRefusal(query, deps)).toEqual({
      schemaVersion: VERIFIER_REFUSAL_SCHEMA_VERSION,
      ...CODEX_REFUSAL,
      observedAt: NOW.toISOString(),
    });
  });

  it('keeps the account under the global state dir, not per project', () => {
    // Entitlement belongs to the account behind the CLI login. A project-scoped
    // record would make every new project re-pay the same rejection to learn it.
    expect(resolveVerifierRefusalLogPath(deps)).toBe(
      join(home, 'runtime', 'verifier-entitlement', 'refusals.jsonl'),
    );
  });

  it('does not match a different auth mode, provider or model', () => {
    recordVerifierRefusal(CODEX_REFUSAL, deps);

    // The auth-mode dimension is the whole point: the measured refusal said
    // "not supported when using Codex with a ChatGPT account", which claims
    // nothing about the same model under an API key.
    expect(findVerifierRefusal({ ...query, authMode: 'api' }, deps)).toBeNull();
    expect(findVerifierRefusal({ ...query, provider: 'claude' }, deps)).toBeNull();
    expect(findVerifierRefusal({ ...query, model: 'gpt-5.6-sol' }, deps)).toBeNull();
  });

  it('returns the newest record when a pair was refused more than once', () => {
    recordVerifierRefusal({ ...CODEX_REFUSAL, message: 'first wording' }, {
      ...deps,
      now: () => new Date('2026-07-20T00:00:00.000Z'),
    });
    recordVerifierRefusal({ ...CODEX_REFUSAL, message: 'latest wording' }, deps);

    expect(findVerifierRefusal(query, deps)?.message).toBe('latest wording');
  });
});

describe('verifier entitlement memory · what must NOT be remembered', () => {
  it('refuses to persist transient failures', () => {
    // A rate limit or a dropped connection is a property of one bad minute, not
    // of the (auth mode, model) pair. Remembering them would permanently
    // blacklist a working model after a blip.
    for (const outcome of ['rate-limited', 'transport-error', 'timeout', 'succeeded']) {
      expect(isDurableRefusalOutcome(outcome)).toBe(false);
      expect(recordVerifierRefusal({ ...CODEX_REFUSAL, outcome }, deps)).toBe(false);
    }
    expect(findVerifierRefusal(query, deps)).toBeNull();
  });

  it('refuses to persist a refusal with no provider wording', () => {
    // The wording IS the diagnostic value; a record without it would suppress a
    // future dispatch while explaining nothing.
    expect(recordVerifierRefusal({ ...CODEX_REFUSAL, message: '   ' }, deps)).toBe(false);
    expect(findVerifierRefusal(query, deps)).toBeNull();
  });

  it('forgets a refusal older than the TTL', () => {
    // Plan upgrades and account switches change entitlement. Being briefly wrong
    // toward "retry and find out" is recoverable; permanent suppression is not.
    const stale = new Date(NOW.getTime() - VERIFIER_REFUSAL_TTL_MS - 1_000);
    recordVerifierRefusal(CODEX_REFUSAL, { ...deps, now: () => stale });

    expect(findVerifierRefusal(query, deps)).toBeNull();
    // Still inside the window one second earlier.
    const fresh = new Date(NOW.getTime() - VERIFIER_REFUSAL_TTL_MS + 1_000);
    recordVerifierRefusal(CODEX_REFUSAL, { ...deps, now: () => fresh });
    expect(findVerifierRefusal(query, deps)).not.toBeNull();
  });
});

describe('verifier entitlement memory · fail-open', () => {
  it('reports nothing learned when no log exists', () => {
    expect(findVerifierRefusal(query, deps)).toBeNull();
  });

  it('skips corrupt and unknown-schema lines instead of throwing', () => {
    const logPath = resolveVerifierRefusalLogPath(deps);
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, [
      'not json at all',
      '{"truncated":',
      JSON.stringify({ schemaVersion: 999, ...CODEX_REFUSAL, observedAt: NOW.toISOString() }),
      JSON.stringify({ schemaVersion: 1, ...CODEX_REFUSAL, observedAt: 'not-a-date' }),
      JSON.stringify({ schemaVersion: 1, ...CODEX_REFUSAL, observedAt: NOW.toISOString() }),
      '',
    ].join('\n'), 'utf-8');

    // The one well-formed line survives; nothing throws on the rest.
    expect(findVerifierRefusal(query, deps)?.message).toBe(CODEX_REFUSAL.message);
  });

  it('degrades to nothing learned when the log cannot be read', () => {
    const logPath = resolveVerifierRefusalLogPath(deps);
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, `${JSON.stringify({
      schemaVersion: 1, ...CODEX_REFUSAL, observedAt: NOW.toISOString(),
    })}\n`, 'utf-8');
    chmodSync(logPath, 0o000);

    let readable = true;
    try { readFileSync(logPath, 'utf-8'); } catch { readable = false; }
    if (!readable) {
      // Never a throw: this layer may not be the reason verification stops.
      expect(findVerifierRefusal(query, deps)).toBeNull();
    }
    chmodSync(logPath, 0o600);
  });

  it('reports a failed write instead of throwing', () => {
    const dir = dirname(resolveVerifierRefusalLogPath(deps));
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o500);

    // On a filesystem/user that still permits the write (e.g. root), the call
    // legitimately succeeds — assert only that it never throws.
    expect(() => recordVerifierRefusal(CODEX_REFUSAL, deps)).not.toThrow();
    chmodSync(dir, 0o700);
  });
});
