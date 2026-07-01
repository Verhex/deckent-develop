// ─── FallbackResolver tests (APR-FALLBACK, task 353-005) ─────────────────────
// Property-table coverage for the pure resolveFallback() decision core: every
// {risk × channelsAlive × expired} combination must resolve to exactly one of
// deny/pause/timeout-default/escalate — never hang, never throw, never touch IO.
import { describe, it, expect } from 'vitest';
import {
  resolveFallback,
  ESCALATION_CHANNELS,
  type FallbackRequest,
  type FallbackContext,
  type FallbackDecisionKind,
} from '../../src/core/approval-fallback.js';
import { ALL_APPROVAL_RISKS, type ApprovalRisk } from '../../src/core/approval-contract.js';

const NOW = '2026-07-01T21:10:00.000Z';
const NOT_YET_EXPIRED = '2026-07-01T21:15:00.000Z'; // request.expiresAt > NOW
const ALREADY_EXPIRED = '2026-07-01T21:05:00.000Z'; // request.expiresAt <= NOW

function buildRequest(overrides: Partial<FallbackRequest> = {}): FallbackRequest {
  return { risk: 'high', expiresAt: NOT_YET_EXPIRED, ...overrides };
}

function buildCtx(overrides: Partial<FallbackContext> = {}): FallbackContext {
  return { channelsAlive: [], expiresAt: NOW, policyDefault: 'deny', ...overrides };
}

// ─── goCriteria: "expiry→default" ────────────────────────────────────────────

describe('resolveFallback — expiry always resolves via policyDefault', () => {
  it.each<[ApprovalRisk, readonly string[]]>([
    ['none', []],
    ['low', ['dashboard']],
    ['medium', ['api']],
    ['high', ['dashboard', 'api']],
    ['critical', ['dashboard']],
    ['critical', ['api']],
  ])('risk=%s channelsAlive=%j → timeout-default with policyDefault', (risk, channelsAlive) => {
    const decision = resolveFallback(
      buildRequest({ risk, expiresAt: ALREADY_EXPIRED }),
      buildCtx({ channelsAlive, policyDefault: 'allow' }),
    );
    expect(decision).toEqual({
      kind: 'timeout-default',
      action: 'allow',
      reason: expect.any(String),
    });
  });

  it('expiry boundary is inclusive (request.expiresAt === ctx.expiresAt counts as expired)', () => {
    const decision = resolveFallback(buildRequest({ risk: 'low', expiresAt: NOW }), buildCtx({ expiresAt: NOW }));
    expect(decision.kind).toBe('timeout-default');
  });
});

// ─── goCriteria: "kanal-yokken critical→deny" ────────────────────────────────

describe('resolveFallback — critical risk with no reachable escalation channel denies', () => {
  it.each<[readonly string[], boolean]>([
    [[], false],
    [[], true],
    [['terminal'], false],
    [['terminal'], true],
    [['slack'], true],
  ])('channelsAlive=%j expired=%s → deny (overrides expiry-default too)', (channelsAlive, expired) => {
    const decision = resolveFallback(
      buildRequest({ risk: 'critical', expiresAt: expired ? ALREADY_EXPIRED : NOT_YET_EXPIRED }),
      buildCtx({ channelsAlive, policyDefault: 'allow' }),
    );
    expect(decision).toEqual({ kind: 'deny', reason: expect.any(String) });
  });

  it('critical risk WITH a reachable channel does not deny — escalates or times out', () => {
    const escalated = resolveFallback(
      buildRequest({ risk: 'critical', expiresAt: NOT_YET_EXPIRED }),
      buildCtx({ channelsAlive: ['dashboard'] }),
    );
    expect(escalated.kind).toBe('escalate');
  });
});

// ─── escalation channel selection ────────────────────────────────────────────

describe('resolveFallback — escalation channel preference', () => {
  it('prefers dashboard over api when both are alive', () => {
    const decision = resolveFallback(buildRequest(), buildCtx({ channelsAlive: ['api', 'dashboard'] }));
    expect(decision).toEqual({ kind: 'escalate', channel: 'dashboard', reason: expect.any(String) });
  });

  it('falls back to api when dashboard is not alive', () => {
    const decision = resolveFallback(buildRequest(), buildCtx({ channelsAlive: ['api'] }));
    expect(decision).toEqual({ kind: 'escalate', channel: 'api', reason: expect.any(String) });
  });

  it('ignores unrecognized channel names for escalation purposes', () => {
    const decision = resolveFallback(buildRequest({ risk: 'medium' }), buildCtx({ channelsAlive: ['terminal', 'slack'] }));
    expect(decision.kind).toBe('pause');
  });

  it('only recognizes dashboard and api as escalation channels', () => {
    expect(ESCALATION_CHANNELS).toEqual(['dashboard', 'api']);
  });
});

// ─── pause (bounded parking) ──────────────────────────────────────────────────

describe('resolveFallback — pause when not expired, no channel, non-critical', () => {
  it('parks pending rather than hanging', () => {
    const decision = resolveFallback(buildRequest({ risk: 'high' }), buildCtx({ channelsAlive: [] }));
    expect(decision).toEqual({ kind: 'pause', reason: expect.any(String) });
  });
});

// ─── purity / determinism ────────────────────────────────────────────────────

describe('resolveFallback — pure and deterministic', () => {
  it('returns the same decision for the same inputs across repeated calls', () => {
    const request = buildRequest({ risk: 'medium', expiresAt: ALREADY_EXPIRED });
    const ctx = buildCtx({ channelsAlive: ['api'], policyDefault: 'defer' });
    const first = resolveFallback(request, ctx);
    const second = resolveFallback(request, ctx);
    expect(second).toEqual(first);
  });

  it('never mutates the channelsAlive input array', () => {
    const channelsAlive = ['dashboard', 'api'];
    const frozen = Object.freeze([...channelsAlive]);
    expect(() => resolveFallback(buildRequest(), buildCtx({ channelsAlive: frozen }))).not.toThrow();
    expect(frozen).toEqual(['dashboard', 'api']);
  });
});

// ─── full property-table: every {risk × channelsAlive × expired} combination ─
// resolves to exactly one finite decision kind — this is the "her ctx-kombinasyonu
// sonlu-karar" goCriteria, exercised directly rather than inferred from the unit
// tests above.

const CHANNEL_SCENARIOS: Array<{ label: string; channelsAlive: readonly string[]; escalatesTo?: 'dashboard' | 'api' }> = [
  { label: 'none', channelsAlive: [] },
  { label: 'irrelevant-only', channelsAlive: ['terminal'] },
  { label: 'dashboard-only', channelsAlive: ['dashboard'], escalatesTo: 'dashboard' },
  { label: 'api-only', channelsAlive: ['api'], escalatesTo: 'api' },
  { label: 'both', channelsAlive: ['dashboard', 'api'], escalatesTo: 'dashboard' },
];

describe('resolveFallback — full ctx-combination property table', () => {
  for (const risk of ALL_APPROVAL_RISKS) {
    for (const channelScenario of CHANNEL_SCENARIOS) {
      for (const expired of [false, true]) {
        const label = `risk=${risk} channels=${channelScenario.label} expired=${expired}`;

        it(`${label} → finite decision matching the documented precedence`, () => {
          const decision = resolveFallback(
            buildRequest({ risk, expiresAt: expired ? ALREADY_EXPIRED : NOT_YET_EXPIRED }),
            buildCtx({ channelsAlive: channelScenario.channelsAlive, policyDefault: 'defer' }),
          );

          // Every branch is finite and synchronous by construction (resolveFallback
          // has no loop/recursion/async) — the assertion below is the "no hang"
          // property expressed as: a decision object was returned at all.
          expect(decision).toBeDefined();

          let expectedKind: FallbackDecisionKind;
          if (risk === 'critical' && !channelScenario.escalatesTo) {
            expectedKind = 'deny';
          } else if (expired) {
            expectedKind = 'timeout-default';
          } else if (channelScenario.escalatesTo) {
            expectedKind = 'escalate';
          } else {
            expectedKind = 'pause';
          }

          expect(decision.kind).toBe(expectedKind);
          if (decision.kind === 'timeout-default') expect(decision.action).toBe('defer');
          if (decision.kind === 'escalate') expect(decision.channel).toBe(channelScenario.escalatesTo);
        });
      }
    }
  }
});
