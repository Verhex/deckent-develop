// ═══ provider-failure-classifier — Sprint 272 Task 006 (F1-LIM faz-2b) ══
// 269 live lesson: usage-limit exhaustion made every worker exit-without-
// result and the FIX wave re-ran into the SAME dead limit. These tests pin
// the pure classifier + the FIX-skip threshold + the bilingual notice.
//
// Signatures are evidence-based (docs/audits/sprint-152, result-evaluator
// exit-137 rule, Anthropic API error types) — anything unrecognized must
// fall through to 'unknown', never a guess.

import { describe, it, expect } from 'vitest';
import {
  classifyProviderFailure,
  summarizeProviderFailures,
  providerLimitFixSkipMessage,
  FIX_SKIP_USAGE_LIMIT_RATIO,
} from '../../src/core/provider-failure-classifier.js';

describe('classifyProviderFailure — signatures', () => {
  // ── usage-limit ───────────────────────────────────────────────────
  it('classifies the Claude CLI "Usage limit reached" message', () => {
    expect(classifyProviderFailure({
      workerLog: 'Claude usage limit reached. Your limit will reset at 3pm.',
    })).toBe('usage-limit');
  });

  it('classifies an HTTP 429 / too many requests as usage-limit', () => {
    expect(classifyProviderFailure({
      resultNotes: 'request failed: 429 Too Many Requests',
    })).toBe('usage-limit');
  });

  it('classifies a generic rate limit / rate_limit_error as usage-limit', () => {
    expect(classifyProviderFailure({ workerLog: 'rate_limit_error: slow down' }))
      .toBe('usage-limit');
    expect(classifyProviderFailure({ resultNotes: 'hit the rate limit' }))
      .toBe('usage-limit');
  });

  // ── auth ──────────────────────────────────────────────────────────
  it('classifies authentication_error / invalid api key as auth', () => {
    expect(classifyProviderFailure({ workerLog: 'authentication_error' }))
      .toBe('auth');
    expect(classifyProviderFailure({ workerLog: 'invalid x-api-key provided' }))
      .toBe('auth');
  });

  it('classifies a 401 / "Please run /login" as auth', () => {
    expect(classifyProviderFailure({ resultNotes: 'HTTP 401 Unauthorized' }))
      .toBe('auth');
    expect(classifyProviderFailure({ workerLog: 'Please run /login to continue' }))
      .toBe('auth');
  });

  // ── oom ───────────────────────────────────────────────────────────
  it('classifies exitCode 137 as oom (hard rule, beats any text)', () => {
    expect(classifyProviderFailure({ exitCode: 137 })).toBe('oom');
    // 137 hard rule wins even when text looks like a usage-limit.
    expect(classifyProviderFailure({
      exitCode: 137,
      resultNotes: 'usage limit reached',
    })).toBe('oom');
  });

  it('classifies OOM/SIGKILL text (oomkilled, exit 137, sigkill) as oom', () => {
    expect(classifyProviderFailure({ resultNotes: 'container OOMKilled' }))
      .toBe('oom');
    expect(classifyProviderFailure({
      resultNotes: 'Worker exited without writing result (exitCode=137)',
    })).toBe('oom');
    expect(classifyProviderFailure({ workerLog: 'process received SIGKILL' }))
      .toBe('oom');
  });

  // ── unknown (no guessing) ─────────────────────────────────────────
  it('returns unknown for empty / whitespace input', () => {
    expect(classifyProviderFailure({})).toBe('unknown');
    expect(classifyProviderFailure({ workerLog: '   ', resultNotes: '' }))
      .toBe('unknown');
  });

  it('returns unknown for ordinary code failures (tsc/test) — not a provider failure', () => {
    expect(classifyProviderFailure({
      resultNotes: 'tsc error TS2345; 3 tests failed',
    })).toBe('unknown');
    expect(classifyProviderFailure({ exitCode: 1, resultNotes: 'assertion failed' }))
      .toBe('unknown');
  });

  it('prefers usage-limit over auth when both signatures co-occur', () => {
    // usage-limit is scanned first (most actionable park signal).
    expect(classifyProviderFailure({
      workerLog: '429 too many requests; also 401 earlier',
    })).toBe('usage-limit');
  });
});

describe('summarizeProviderFailures — FIX-skip threshold', () => {
  const limit = { resultNotes: 'usage limit reached' };
  const code = { resultNotes: '3 tests failed' };

  it('flags skipFix when ALL failures are usage-limit', () => {
    const s = summarizeProviderFailures([limit, limit, limit]);
    expect(s.total).toBe(3);
    expect(s.usageLimit).toBe(3);
    expect(s.usageLimitRatio).toBe(1);
    expect(s.skipFix).toBe(true);
  });

  it('flags skipFix at exactly the 50% boundary (>=)', () => {
    const s = summarizeProviderFailures([limit, code]);
    expect(s.usageLimitRatio).toBe(0.5);
    expect(s.usageLimitRatio).toBeGreaterThanOrEqual(FIX_SKIP_USAGE_LIMIT_RATIO);
    expect(s.skipFix).toBe(true);
  });

  it('does NOT skip when a single/sparse limit is below threshold (normal FIX preserved)', () => {
    const s = summarizeProviderFailures([limit, code, code, code, code]);
    expect(s.usageLimit).toBe(1);
    expect(s.usageLimitRatio).toBeCloseTo(0.2, 5);
    expect(s.skipFix).toBe(false);
  });

  it('does NOT skip for an empty failure set (total=0 never blocks FIX)', () => {
    const s = summarizeProviderFailures([]);
    expect(s.total).toBe(0);
    expect(s.usageLimitRatio).toBe(0);
    expect(s.skipFix).toBe(false);
  });

  it('counts each category accurately in a mixed set', () => {
    const s = summarizeProviderFailures([
      limit,
      { exitCode: 137 },
      { resultNotes: 'authentication_error' },
      code,
    ]);
    expect(s.usageLimit).toBe(1);
    expect(s.oom).toBe(1);
    expect(s.auth).toBe(1);
    expect(s.unknown).toBe(1);
    expect(s.total).toBe(4);
    expect(s.skipFix).toBe(false); // 1/4 usage-limit < 0.5
  });
});

describe('providerLimitFixSkipMessage — i18n (en+tr)', () => {
  it('returns the Turkish notice for lang=tr', () => {
    const msg = providerLimitFixSkipMessage('tr');
    expect(msg.summary).toContain('provider limiti tükenmiş');
    expect(msg.summary).toMatch(/spawn|resume/);
    expect(msg.title).toContain('ertelendi');
  });

  it('returns the English notice for lang=en and for unknown langs (default en)', () => {
    const en = providerLimitFixSkipMessage('en');
    expect(en.summary).toContain('usage limit');
    expect(en.summary).toMatch(/spawn|resume/);
    const fallback = providerLimitFixSkipMessage('de');
    expect(fallback.summary).toBe(en.summary);
    expect(fallback.title).toBe(en.title);
  });
});
