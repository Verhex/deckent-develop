// ═══ resolveLiveTraceEnabled — 583/N5 TRACE-FLIP env-twin resolver ══════════
//
// The ONE gate every live_trace producer reads (sprint-spawner /
// scheduler-effects spawn opts, worker.ts heartbeat tap, agentic-worker-entry
// progress stream). Contract mirrors DECKENT_CONTROL_MUTATIONS
// (api/server.ts): `DECKENT_LIVE_TRACE=1` wins first; anything else falls
// through to the config block; absent config = off (the pre-N5 default,
// pinned here so headless/CI fleets keep the zero-cost no-op tap).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveLiveTraceEnabled, LIVE_TRACE_ENV } from '../../src/core/config.js';

describe('resolveLiveTraceEnabled — env twin + config fallback (583/N5)', () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env[LIVE_TRACE_ENV];
    delete process.env[LIVE_TRACE_ENV];
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env[LIVE_TRACE_ENV];
    else process.env[LIVE_TRACE_ENV] = savedEnv;
  });

  it('exports the env-twin name (single source — writers import it, no literal drift)', () => {
    expect(LIVE_TRACE_ENV).toBe('DECKENT_LIVE_TRACE');
  });

  it('DECKENT_LIVE_TRACE=1 → true, even with no config at all', () => {
    process.env[LIVE_TRACE_ENV] = '1';
    expect(resolveLiveTraceEnabled(undefined)).toBe(true);
    expect(resolveLiveTraceEnabled(null)).toBe(true);
    expect(resolveLiveTraceEnabled({})).toBe(true);
  });

  it('DECKENT_LIVE_TRACE=1 → true, even when the config block explicitly disables', () => {
    process.env[LIVE_TRACE_ENV] = '1';
    expect(resolveLiveTraceEnabled({ live_trace: { enabled: false } })).toBe(true);
  });

  it('no env + config { enabled: true } → true (the classic global opt-in still works)', () => {
    expect(resolveLiveTraceEnabled({ live_trace: { enabled: true } })).toBe(true);
  });

  it('no env + absent/disabled config → false (pre-N5 default pinned: headless stays off)', () => {
    expect(resolveLiveTraceEnabled(undefined)).toBe(false);
    expect(resolveLiveTraceEnabled({})).toBe(false);
    expect(resolveLiveTraceEnabled({ live_trace: {} })).toBe(false);
    expect(resolveLiveTraceEnabled({ live_trace: { enabled: false } })).toBe(false);
  });

  it("only the exact string '1' activates the twin — '0'/'true'/'yes' fall through to config", () => {
    for (const v of ['0', 'true', 'yes', '', ' 1']) {
      process.env[LIVE_TRACE_ENV] = v;
      expect(resolveLiveTraceEnabled(undefined)).toBe(false);
      expect(resolveLiveTraceEnabled({ live_trace: { enabled: true } })).toBe(true);
    }
  });
});
