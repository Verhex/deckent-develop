import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSubscriptionLimitOutput,
  probeSubscriptionLimits,
  evaluateLimitGate,
  DEFAULT_LIMIT_GATE_THRESHOLDS,
  resolveWindowedLimitGateThresholds,
  evaluateLimitGateByWindow,
  type SpawnImpl,
  type SpawnedProcessLike,
  type SubscriptionLimitProbe,
} from '../../src/core/limit-preflight.js';

// ─── Hermetic spawn mock ────────────────────────────────────────────────────
// Mirrors the worker-image-check.test.ts pattern: EventEmitter-based fake
// child process, no real `claude` binary is ever invoked.

interface CannedResult {
  code?: number | null;
  stdout?: string;
  error?: Error;
  /** Never emits close/error — used to exercise the timeout path. */
  hang?: boolean;
}

function makeUsageSpawn(result: CannedResult): {
  spawnImpl: ReturnType<typeof vi.fn<SpawnImpl>>;
  kill: ReturnType<typeof vi.fn>;
} {
  const kill = vi.fn(() => true);
  const spawnImpl = vi.fn<SpawnImpl>((_command, _args) => {
    const child = new EventEmitter() as EventEmitter & SpawnedProcessLike;
    child.stdout = Readable.from([result.stdout ?? '']);
    child.stderr = Readable.from(['']);
    child.kill = kill;
    if (!result.hang) {
      process.nextTick(() => {
        if (result.error) {
          child.emit('error', result.error);
        } else {
          child.emit('close', result.code ?? 0, null);
        }
      });
    }
    return child;
  });
  return { spawnImpl, kill };
}

// ─── Fixtures ────────────────────────────────────────────────────────────

const FULL_FIXTURE =
  'Current session: 81% used · resets Jul 2, 8:30pm (Europe/Istanbul)\n' +
  'Current week (all models): 31% used · resets Jul 6, 12:00am (Europe/Istanbul)\n' +
  'Current week (Fable): 26% used · resets Jul 6, 12:00am (Europe/Istanbul)\n';

const NO_FABLE_FIXTURE =
  'Current session: 12% used · resets Jul 2, 8:30pm (Europe/Istanbul)\n' +
  'Current week (all models): 5% used · resets Jul 6, 12:00am (Europe/Istanbul)\n';

const NO_RESET_CLAUSE_FIXTURE =
  'Current session: 40% used\n' +
  'Current week (all models): 20% used\n';

// ─── parseSubscriptionLimitOutput ──────────────────────────────────────────

describe('parseSubscriptionLimitOutput', () => {
  it('parses all three lines including reset text + timezone', () => {
    const result = parseSubscriptionLimitOutput(FULL_FIXTURE);
    expect(result.unavailable).toBe(false);
    const probe = result as SubscriptionLimitProbe;

    expect(probe.sessionPct).toBe(81);
    expect(probe.sessionResetAt).toEqual({ text: 'Jul 2, 8:30pm', timezone: 'Europe/Istanbul' });

    expect(probe.weekAllPct).toBe(31);
    expect(probe.weekAllResetAt).toEqual({ text: 'Jul 6, 12:00am', timezone: 'Europe/Istanbul' });

    expect(probe.weekFablePct).toBe(26);
    expect(probe.raw).toBe(FULL_FIXTURE);
  });

  it('omits weekFablePct when the Fable line is absent', () => {
    const result = parseSubscriptionLimitOutput(NO_FABLE_FIXTURE);
    expect(result.unavailable).toBe(false);
    const probe = result as SubscriptionLimitProbe;

    expect(probe.sessionPct).toBe(12);
    expect(probe.weekAllPct).toBe(5);
    expect(probe.weekFablePct).toBeUndefined();
  });

  it('tolerates a missing "resets" clause — pct still parses, resetAt is null', () => {
    const result = parseSubscriptionLimitOutput(NO_RESET_CLAUSE_FIXTURE);
    expect(result.unavailable).toBe(false);
    const probe = result as SubscriptionLimitProbe;

    expect(probe.sessionPct).toBe(40);
    expect(probe.sessionResetAt).toBeNull();
    expect(probe.weekAllPct).toBe(20);
    expect(probe.weekAllResetAt).toBeNull();
  });

  it('returns unavailable when the "Current session" line is missing', () => {
    const result = parseSubscriptionLimitOutput('Current week (all models): 31% used\n');
    expect(result.unavailable).toBe(true);
    if (result.unavailable) {
      expect(result.reason).toContain('Current session');
    }
  });

  it('returns unavailable when the "Current week (all models)" line is missing', () => {
    const result = parseSubscriptionLimitOutput('Current session: 81% used\n');
    expect(result.unavailable).toBe(true);
  });

  it('returns unavailable, never throws, on garbage/empty input', () => {
    expect(() => parseSubscriptionLimitOutput('')).not.toThrow();
    expect(parseSubscriptionLimitOutput('').unavailable).toBe(true);

    expect(() => parseSubscriptionLimitOutput('not usage output at all\n???')).not.toThrow();
    expect(parseSubscriptionLimitOutput('not usage output at all\n???').unavailable).toBe(true);
  });

  it('returns unavailable when the session line has an unparseable percentage', () => {
    const result = parseSubscriptionLimitOutput(
      'Current session: not-a-number% used\nCurrent week (all models): 31% used\n',
    );
    expect(result.unavailable).toBe(true);
  });

  it('silently omits an unparseable Fable line rather than failing the whole probe', () => {
    const fixture =
      'Current session: 10% used\n' +
      'Current week (all models): 5% used\n' +
      'Current week (Fable): not-a-number% used\n';
    const result = parseSubscriptionLimitOutput(fixture);
    expect(result.unavailable).toBe(false);
    const probe = result as SubscriptionLimitProbe;
    expect(probe.weekFablePct).toBeUndefined();
    expect(probe.sessionPct).toBe(10);
  });
});

// ─── probeSubscriptionLimits ────────────────────────────────────────────────

describe('probeSubscriptionLimits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses a successful spawn (exit 0) into a probe, never invoking real claude', async () => {
    const { spawnImpl } = makeUsageSpawn({ code: 0, stdout: FULL_FIXTURE });
    const result = await probeSubscriptionLimits({ spawnImpl });

    expect(result.unavailable).toBe(false);
    expect((result as SubscriptionLimitProbe).sessionPct).toBe(81);
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(spawnImpl).toHaveBeenCalledWith('claude', ['-p', '/usage'], { shell: false });
  });

  it('honors a custom claudeBin override', async () => {
    const { spawnImpl } = makeUsageSpawn({ code: 0, stdout: FULL_FIXTURE });
    await probeSubscriptionLimits({ spawnImpl, claudeBin: '/opt/claude/bin/claude' });

    expect(spawnImpl).toHaveBeenCalledWith('/opt/claude/bin/claude', ['-p', '/usage'], { shell: false });
  });

  it('returns unavailable when spawn emits an error event (e.g. ENOENT)', async () => {
    const { spawnImpl } = makeUsageSpawn({ error: new Error('spawn claude ENOENT') });
    const result = await probeSubscriptionLimits({ spawnImpl });

    expect(result.unavailable).toBe(true);
  });

  it('returns unavailable when spawnImpl throws synchronously', async () => {
    const spawnImpl = vi.fn<SpawnImpl>(() => {
      throw new Error('spawn failed');
    });
    const result = await probeSubscriptionLimits({ spawnImpl });

    expect(result.unavailable).toBe(true);
  });

  it('returns unavailable when the process exits non-zero', async () => {
    const { spawnImpl } = makeUsageSpawn({ code: 1, stdout: '' });
    const result = await probeSubscriptionLimits({ spawnImpl });

    expect(result.unavailable).toBe(true);
    if (result.unavailable) {
      expect(result.reason).toContain('non-zero code 1');
    }
  });

  it('returns unavailable and kills the child when the timeout elapses', async () => {
    const { spawnImpl, kill } = makeUsageSpawn({ hang: true });
    const promise = probeSubscriptionLimits({ spawnImpl, timeoutMs: 1_000 });

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await promise;

    expect(result.unavailable).toBe(true);
    expect(kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('never throws even when the CLI output format changes unexpectedly', async () => {
    const { spawnImpl } = makeUsageSpawn({ code: 0, stdout: 'Usage information has moved, see docs.\n' });
    await expect(probeSubscriptionLimits({ spawnImpl })).resolves.not.toThrow();
    const result = await probeSubscriptionLimits({ spawnImpl });
    expect(result.unavailable).toBe(true);
  });
});

// ─── evaluateLimitGate ───────────────────────────────────────────────────────

function makeProbe(overrides: Partial<SubscriptionLimitProbe>): SubscriptionLimitProbe {
  return {
    unavailable: false,
    sessionPct: 0,
    sessionResetAt: null,
    weekAllPct: 0,
    weekAllResetAt: null,
    raw: '',
    ...overrides,
  };
}

describe('evaluateLimitGate', () => {
  it('returns ok when every window is below the warn threshold', () => {
    const probe = makeProbe({ sessionPct: 10, weekAllPct: 20 });
    const result = evaluateLimitGate(probe, { warnPct: 70, blockPct: 90 });
    expect(result.verdict).toBe('ok');
  });

  it('returns warn at the exact warnPct boundary', () => {
    const probe = makeProbe({ sessionPct: 70, weekAllPct: 10 });
    const result = evaluateLimitGate(probe, { warnPct: 70, blockPct: 90 });
    expect(result.verdict).toBe('warn');
    expect(result.reason).toContain('session');
  });

  it('returns warn between warnPct and blockPct', () => {
    const probe = makeProbe({ sessionPct: 85, weekAllPct: 10 });
    const result = evaluateLimitGate(probe, { warnPct: 70, blockPct: 90 });
    expect(result.verdict).toBe('warn');
  });

  it('returns block at the exact blockPct boundary', () => {
    const probe = makeProbe({ sessionPct: 90, weekAllPct: 10 });
    const result = evaluateLimitGate(probe, { warnPct: 70, blockPct: 90 });
    expect(result.verdict).toBe('block');
  });

  it('returns block above blockPct', () => {
    const probe = makeProbe({ sessionPct: 10, weekAllPct: 99 });
    const result = evaluateLimitGate(probe, { warnPct: 70, blockPct: 90 });
    expect(result.verdict).toBe('block');
    expect(result.reason).toContain('week (all models)');
  });

  it('uses the worst window across session/weekAll/weekFable, naming it in the reason', () => {
    const probe = makeProbe({ sessionPct: 20, weekAllPct: 30, weekFablePct: 95 });
    const result = evaluateLimitGate(probe, { warnPct: 70, blockPct: 90 });
    expect(result.verdict).toBe('block');
    expect(result.reason).toContain('week (Fable)');
    expect(result.reason).toContain('95%');
  });

  it('ignores weekFablePct in the comparison when absent', () => {
    const probe = makeProbe({ sessionPct: 95, weekAllPct: 10 });
    const result = evaluateLimitGate(probe, { warnPct: 70, blockPct: 90 });
    expect(result.verdict).toBe('block');
    expect(result.reason).toContain('session');
  });

  it('returns unknown when the probe is unavailable — never fabricates a healthy state', () => {
    const result = evaluateLimitGate({ unavailable: true, reason: 'CLI output changed', raw: '' });
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toContain('unavailable');
  });

  it('uses DEFAULT_LIMIT_GATE_THRESHOLDS when no thresholds are passed', () => {
    const okProbe = makeProbe({ sessionPct: DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct - 1, weekAllPct: 0 });
    expect(evaluateLimitGate(okProbe).verdict).toBe('ok');

    const warnProbe = makeProbe({ sessionPct: DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct, weekAllPct: 0 });
    expect(evaluateLimitGate(warnProbe).verdict).toBe('warn');

    const blockProbe = makeProbe({ sessionPct: DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct, weekAllPct: 0 });
    expect(evaluateLimitGate(blockProbe).verdict).toBe('block');
  });
});

// ─── resolveWindowedLimitGateThresholds (LIMITS-WARN-FIELDS) ───────────────

describe('resolveWindowedLimitGateThresholds', () => {
  it('defaults to {warnPct:70,blockPct:90} for both windows when no override is given — byte-identical to the pre-362-004 min(70,block) formula', () => {
    const result = resolveWindowedLimitGateThresholds();
    expect(result.session).toEqual({ warnPct: 70, blockPct: 90 });
    expect(result.weekly).toEqual({ warnPct: 70, blockPct: 90 });
  });

  it('recomputes the min(70,block) warn floor from a custom block override when no warn override is given', () => {
    const result = resolveWindowedLimitGateThresholds({ sessionBlockPct: 50 });
    expect(result.session).toEqual({ warnPct: 50, blockPct: 50 });
    expect(result.weekly).toEqual({ warnPct: 70, blockPct: 90 });
  });

  it('honors an explicit sessionWarnPct override independently of weekly', () => {
    const result = resolveWindowedLimitGateThresholds({ sessionWarnPct: 40 });
    expect(result.session).toEqual({ warnPct: 40, blockPct: 90 });
    expect(result.weekly).toEqual({ warnPct: 70, blockPct: 90 });
  });

  it('honors an explicit weeklyWarnPct override independently of session', () => {
    const result = resolveWindowedLimitGateThresholds({ weeklyWarnPct: 55 });
    expect(result.session).toEqual({ warnPct: 70, blockPct: 90 });
    expect(result.weekly).toEqual({ warnPct: 55, blockPct: 90 });
  });

  it('clamps a warn override down to the block ceiling when the override exceeds it', () => {
    const result = resolveWindowedLimitGateThresholds({ sessionBlockPct: 90, sessionWarnPct: 95 });
    expect(result.session).toEqual({ warnPct: 90, blockPct: 90 });
  });
});

// ─── evaluateLimitGateByWindow (LIMITS-WARN-FIELDS) ────────────────────────

describe('evaluateLimitGateByWindow', () => {
  it('matches evaluateLimitGate/min(70,block) semantics when no thresholds are passed', () => {
    const okProbe = makeProbe({ sessionPct: 69, weekAllPct: 10 });
    expect(evaluateLimitGateByWindow(okProbe).verdict).toBe('ok');

    const warnProbe = makeProbe({ sessionPct: 70, weekAllPct: 10 });
    expect(evaluateLimitGateByWindow(warnProbe).verdict).toBe('warn');

    const blockProbe = makeProbe({ sessionPct: 90, weekAllPct: 10 });
    expect(evaluateLimitGateByWindow(blockProbe).verdict).toBe('block');
  });

  it('evaluates session and weekly independently — a lenient session warn floor stays ok while a tighter weekly floor trips warn', () => {
    const probe = makeProbe({ sessionPct: 75, weekAllPct: 72 });
    const thresholds = resolveWindowedLimitGateThresholds({ sessionWarnPct: 80, weeklyWarnPct: 70 });
    const result = evaluateLimitGateByWindow(probe, thresholds);
    expect(result.verdict).toBe('warn');
    expect(result.reason).toContain('week (all models)');
  });

  it('evaluates the reverse independently — a tight session warn floor trips warn while a lenient weekly floor stays ok', () => {
    const probe = makeProbe({ sessionPct: 72, weekAllPct: 75 });
    const thresholds = resolveWindowedLimitGateThresholds({ sessionWarnPct: 70, weeklyWarnPct: 80 });
    const result = evaluateLimitGateByWindow(probe, thresholds);
    expect(result.verdict).toBe('warn');
    expect(result.reason).toContain('session');
  });

  it('applies the weekly thresholds to the week (Fable) window', () => {
    const probe = makeProbe({ sessionPct: 10, weekAllPct: 10, weekFablePct: 96 });
    const result = evaluateLimitGateByWindow(probe);
    expect(result.verdict).toBe('block');
    expect(result.reason).toContain('week (Fable)');
  });

  it('returns unknown when the probe is unavailable', () => {
    const result = evaluateLimitGateByWindow({ unavailable: true, reason: 'CLI output changed', raw: '' });
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toContain('unavailable');
  });

  it('block always wins over warn even when a warn-triggering window has a higher raw percentage', () => {
    const probe = makeProbe({ sessionPct: 85, weekAllPct: 92 });
    const result = evaluateLimitGateByWindow(probe);
    expect(result.verdict).toBe('block');
    expect(result.reason).toContain('week (all models)');
  });

  it('roundtrip: an explicit warn override actually moves the verdict boundary end-to-end', () => {
    const probe = makeProbe({ sessionPct: 65, weekAllPct: 10 });

    const defaultThresholds = resolveWindowedLimitGateThresholds();
    expect(evaluateLimitGateByWindow(probe, defaultThresholds).verdict).toBe('ok');

    const tightened = resolveWindowedLimitGateThresholds({ sessionWarnPct: 60 });
    const result = evaluateLimitGateByWindow(probe, tightened);
    expect(result.verdict).toBe('warn');
    expect(result.reason).toContain('session');
  });
});
