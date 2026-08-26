// ─── CFG-APR-WIRE — approval config block tests (sprint-355 task 355-013) ───
// Hermetic tests for the `approval` config block: validateConfig shallow
// gate/relay flag checks, resolveApprovalConfig (the single authority turning
// raw approval.rules JSON into a validated ApprovalPolicyRule[]), and
// loadConfig/validatePartialConfig integration. No gitignored state read; no
// spawnSync; runs on a fresh checkout.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateConfig,
  ConfigValidationError,
  resolveApprovalConfig,
  validatePartialConfig,
  loadConfig,
  clearConfigCache,
} from '../../src/core/config.js';
import { SAFE_DEFAULT_APPROVAL_RULES } from '../../src/core/approval-rules-load.js';
import type { DeckentConfig } from '../../src/core/config-types.js';
import { createHmac, timingSafeEqual } from "node:crypto";
import { ApprovalBroker } from "../../src/core/approval-broker.js";
import type { ApprovalRequest } from "../../src/core/approval-contract.js";
import { ApprovalDecisionAuthority, ApprovalDecisionIngress, type ApprovalDecisionIntegrityAuthority, type LiveApprovalAuthenticator } from "../../src/core/approval-decision-ingress.js";
import { RuleEngineApprovalAuthenticator, liveRuleFor } from "../../src/core/approval-rules-engine.js";
import { saveApprovalRules, type ApprovalRule } from "../../src/core/approval-rules.js";
import { AttendedExecutionApprovalAuthority, AttendedExecutionApprovalError, attendedExecutionProjectId } from "../../src/core/attended-execution-approval.js";
import type { ProviderEvidenceProbeSubject } from "../../src/core/provider-evidence-probe-contract.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function minimalConfig(overrides: Partial<DeckentConfig> = {}): DeckentConfig {
  return {
    mode: 'balanced',
    modes: {},
    ...overrides,
  } as DeckentConfig;
}

/** Collect only approval-related validation errors without rethrowing unrelated ones. */
function collectApprovalErrors(config: DeckentConfig): string[] {
  try {
    validateConfig(config);
    return [];
  } catch (err: unknown) {
    if (err instanceof ConfigValidationError) {
      return err.errors.filter((e) => e.includes('approval'));
    }
    throw err;
  }
}

const dirs: string[] = [];
function project(cfg: Record<string, unknown>): string {
  const d = mkdtempSync(join(tmpdir(), 'cfg-apr-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  writeFileSync(join(d, '.deckent', 'config.json'), JSON.stringify({ mode: 'balanced', ...cfg }));
  return d;
}
afterEach(() => {
  clearConfigCache();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ─── validateConfig — shallow gate/relay flag checks ─────────────────────────

describe('approval config block — validateConfig', () => {
  it('absent block produces no approval errors (default off)', () => {
    expect(collectApprovalErrors(minimalConfig())).toHaveLength(0);
  });

  it('accepts an empty approval object', () => {
    expect(collectApprovalErrors(minimalConfig({ approval: {} }))).toHaveLength(0);
  });

  it('accepts gate_enabled / relay_enabled set to valid booleans', () => {
    expect(
      collectApprovalErrors(
        minimalConfig({ approval: { gate_enabled: true, relay_enabled: false } }),
      ),
    ).toHaveLength(0);
  });

  it('accepts a well-formed rules array alongside the flags', () => {
    expect(
      collectApprovalErrors(
        minimalConfig({
          approval: {
            gate_enabled: true,
            relay_enabled: true,
            rules: [{ match: { risk: 'high' }, action: 'require-approval' }],
          },
        }),
      ),
    ).toHaveLength(0);
  });

  it('returns error when gate_enabled is a non-boolean value', () => {
    const errors = collectApprovalErrors(
      minimalConfig({ approval: { gate_enabled: 'yes' as unknown as boolean } }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/approval\.gate_enabled/);
  });

  it('returns error when relay_enabled is a non-boolean value', () => {
    const errors = collectApprovalErrors(
      minimalConfig({ approval: { relay_enabled: 1 as unknown as boolean } }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/approval\.relay_enabled/);
  });

  it('never throws for a malformed rules array — rule validation is NOT this layer', () => {
    // approval.rules validation is fully owned by loadApprovalRules (fail-soft,
    // never throws). validateConfig must not duplicate/tighten that contract.
    expect(
      collectApprovalErrors(
        minimalConfig({
          approval: { rules: [{ match: { risk: 'bogus-risk' }, action: 'bogus-action' }] as never },
        }),
      ),
    ).toHaveLength(0);
  });
});

// ─── resolveApprovalConfig — single authority: raw JSON -> validated rules ──

describe('resolveApprovalConfig', () => {
  it('absent approval -> safe default rules, gate/relay both false', () => {
    const resolved = resolveApprovalConfig({});
    expect(resolved.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
    expect(resolved.gate_enabled).toBe(false);
    expect(resolved.relay_enabled).toBe(false);
  });

  it('passes through a valid custom rule set unchanged', () => {
    const resolved = resolveApprovalConfig({
      approval: {
        rules: [{ match: { scope: 'credential' }, action: 'deny' }],
      },
    });
    expect(resolved.rules).toEqual([{ match: { scope: 'credential' }, action: 'deny' }]);
  });

  it('resolves gate_enabled / relay_enabled from config, defaulting absent to false', () => {
    const resolved = resolveApprovalConfig({ approval: { gate_enabled: true } });
    expect(resolved.gate_enabled).toBe(true);
    expect(resolved.relay_enabled).toBe(false);
  });

  it('a malformed rule entry is skipped (fail-soft) — never throws, never blocks', () => {
    expect(() =>
      resolveApprovalConfig({
        approval: { rules: [{ match: {}, action: 'notify' }, { match: {}, action: 'bogus-action' }] as never },
      }),
    ).not.toThrow();
    const resolved = resolveApprovalConfig({
      approval: { rules: [{ match: {}, action: 'notify' }, { match: {}, action: 'bogus-action' }] as never },
    });
    expect(resolved.rules).toEqual([{ match: {}, action: 'notify' }]);
  });

  it('an all-invalid rules array resolves to an empty list, NOT silently substituted defaults', () => {
    const resolved = resolveApprovalConfig({
      approval: { rules: [{ match: {}, action: 'bogus-action' }] as never },
    });
    expect(resolved.rules).toEqual([]);
    expect(resolved.rules).not.toEqual(SAFE_DEFAULT_APPROVAL_RULES);
  });
});

// ─── validatePartialConfig compatibility ─────────────────────────────────────

describe('validatePartialConfig — approval compatibility', () => {
  it('accepts a valid approval partial', () => {
    expect(() =>
      validatePartialConfig({
        approval: { gate_enabled: true, rules: [{ match: { risk: 'low' }, action: 'auto-approve' }] },
      }),
    ).not.toThrow();
  });

  it('rejects an invalid gate_enabled type', () => {
    expect(() =>
      validatePartialConfig({ approval: { gate_enabled: 'nope' as unknown as boolean } }),
    ).toThrow(ConfigValidationError);
  });
});

// ─── loadConfig — hermetic tmpdir fixtures (goCriteria: valid/broken fixtures) ──

describe('loadConfig — approval config fixtures', () => {
  it('valid config.json: rules + gate/relay flags resolve correctly', async () => {
    const d = project({
      approval: {
        gate_enabled: true,
        relay_enabled: true,
        rules: [
          { match: { scope: 'network' }, action: 'deny' },
          { match: { risk: 'high' }, action: 'require-approval', timeoutMs: 30_000 },
        ],
      },
    });
    const cfg = await loadConfig(d, { force: true });
    expect(cfg.approval?.gate_enabled).toBe(true);
    expect(cfg.approval?.relay_enabled).toBe(true);
    expect(cfg.approval?.rules).toEqual([
      { match: { scope: 'network' }, action: 'deny' },
      { match: { risk: 'high' }, action: 'require-approval', timeoutMs: 30_000 },
    ]);
  });

  it('absent approval block: default-safe (SAFE_DEFAULT_APPROVAL_RULES, gate/relay off)', async () => {
    const d = project({});
    const cfg = await loadConfig(d, { force: true });
    expect(cfg.approval?.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
    expect(cfg.approval?.gate_enabled).toBe(false);
    expect(cfg.approval?.relay_enabled).toBe(false);
  });

  it('broken config.json (malformed rule entry): loadConfig does NOT throw — bad entry dropped', async () => {
    const d = project({
      approval: {
        rules: [
          { match: { scope: 'network' }, action: 'deny' },
          { match: { risk: 'not-a-real-risk-tier' }, action: 'deny' },
        ],
      },
    });
    const cfg = await loadConfig(d, { force: true });
    expect(cfg.approval?.rules).toEqual([{ match: { scope: 'network' }, action: 'deny' }]);
  });

  it('broken config.json (approval.rules not an array): loadConfig does NOT throw — safe defaults used', async () => {
    const d = project({ approval: { rules: 'not-an-array' } });
    const cfg = await loadConfig(d, { force: true });
    expect(cfg.approval?.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
  });
});

// WIRE-022: physically merged from tests/core/approval-probe-rule-wire.integration.test.ts.
{
const NOW = new Date('2026-08-21T12:00:00.000Z');

const roots: string[] = [];

class Integrity implements ApprovalDecisionIntegrityAuthority {
    sign(payload: string) {
        return {
            keyId: 'rule-wire-key',
            mac: createHmac('sha256', 'rule-wire-secret').update(payload).digest('hex'),
        };
    }
    verify(keyId: string, payload: string, mac: string): boolean {
        const expected = this.sign(payload).mac;
        return keyId === 'rule-wire-key'
            && mac.length === expected.length
            && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
    }
}

const unavailableHuman: LiveApprovalAuthenticator = {
    reauthenticate: async () => null,
    isSessionActive: () => false,
};

function ownerRule(overrides: Partial<ApprovalRule> = {}): ApprovalRule {
    return {
        id: 'rule-owner-01',
        createdAt: new Date(NOW.getTime() - 60000).toISOString(),
        createdBy: 'owner-a',
        reason: 'owner delegated exact routine provider probes',
        match: {
            idPrefix: 'aprp-',
            summaryIncludes: 'exact codex probe',
            riskTierMax: 'routine',
        },
        decision: 'allow',
        source: 'manual',
        ...overrides,
    };
}

function fixture() {
    let now = NOW;
    const base = mkdtempSync(join(tmpdir(), 'approval-rule-wire-'));
    roots.push(base);
    const projectRoot = join(base, 'project');
    const broker = new ApprovalBroker(projectRoot, {
        storeDir: join(base, 'broker'),
        clock: () => now,
    });
    const integrity = new Integrity();
    const ruleAuthenticator = new RuleEngineApprovalAuthenticator(projectRoot, () => now);
    const decisions = new ApprovalDecisionAuthority(integrity, unavailableHuman, ruleAuthenticator);
    const authority = new AttendedExecutionApprovalAuthority(projectRoot, broker, decisions, {
        receiptStoreDir: join(base, 'receipts'),
        proposalStoreDir: join(base, 'proposals'),
        dispatchClaimStoreDir: join(base, 'dispatch-claims'),
        operationClaimStoreDir: join(base, 'operation-claims'),
        now: () => now,
    });
    const ingress = new ApprovalDecisionIngress({
        broker,
        authenticator: ruleAuthenticator,
        integrity,
        channel: 'rules-engine',
        now: () => now,
    });
    const subject: ProviderEvidenceProbeSubject = {
        kind: 'provider-evidence-probe',
        tenantId: 'tenant-a',
        projectId: attendedExecutionProjectId(projectRoot),
        provider: 'codex',
        model: 'gpt-5.6-sol',
        backendScope: 'subprocess',
        executionProfileRef: 'probe.production-chain',
        attemptNonce: 'c'.repeat(64),
        budget: {
            billingMode: 'subscription',
            maxInputTokens: 100,
            maxOutputTokens: 10,
            maxTokens: 110,
            timeoutMs: 5000,
        },
        ttl: {
            startsAt: new Date(NOW.getTime() - 1000).toISOString(),
            expiresAt: new Date(NOW.getTime() + 90000).toISOString(),
        },
    };
    const request = authority.submitProviderEvidenceProbe({
        requester: { role: 'brain', instanceId: 'brain-rule-wire' },
        userId: 'owner-a',
        summary: 'exact codex probe',
        subject,
        createdAt: NOW.toISOString(),
    });
    return {
        projectRoot,
        broker,
        authority,
        ingress,
        request,
        subject,
        setNow(value: Date) {
            now = value;
        },
    };
}

async function applyRule(projectRoot: string, ingress: ApprovalDecisionIngress, request: ApprovalRequest, now: Date) {
    const matched = liveRuleFor(projectRoot, request, now);
    if (matched === null)
        return null;
    return ingress.decide({
        requestId: request.id,
        action: matched.decision,
        idempotencyKey: `rules-engine:${request.id}:${matched.id}`,
        reason: matched.reason,
    });
}

afterEach(() => {
    for (const root of roots.splice(0))
        rmSync(root, { recursive: true, force: true });
});

describe('provider probe production rule wire', () => {
    it('flows the real producer through the persisted first owner rule, signed ingress, and immutable one-shot claim', async () => {
        const f = fixture();
        saveApprovalRules(f.projectRoot, [
            ownerRule(),
            ownerRule({ id: 'rule-owner-02', reason: 'must lose first-write-wins' }),
        ]);
        expect(liveRuleFor(f.projectRoot, f.request, NOW)?.id).toBe('rule-owner-01');
        const outcome = await applyRule(f.projectRoot, f.ingress, f.request, NOW);
        expect(outcome).toMatchObject({
            kind: 'decided',
            decision: { decision: 'allow', decidedBy: 'rule:rule-owner-01', channel: 'rules-engine' },
        });
        expect(f.broker.getDecision(f.request.id)?.decidedBy).toBe('rule:rule-owner-01');
        const claim = f.authority.verifyAndClaimProviderEvidenceProbe(f.request.id, f.subject);
        expect(claim).toMatchObject({
            evidenceRef: `approval:${f.request.id}`,
            subject: f.subject,
        });
        expect(Object.isFrozen(claim)).toBe(true);
        expect(() => f.authority.verifyAndClaimProviderEvidenceProbe(f.request.id, f.subject))
            .toThrowError(expect.objectContaining<Partial<AttendedExecutionApprovalError>>({
            code: 'APPROVAL_ALREADY_CONSUMED',
        }));
    });
    it('fails closed for elevated/critical requests and a disabled owner rule', async () => {
        const f = fixture();
        saveApprovalRules(f.projectRoot, [ownerRule()]);
        for (const riskTier of ['elevated', 'critical'] as const) {
            const higherRisk = { ...f.request, riskTier } as ApprovalRequest;
            expect(liveRuleFor(f.projectRoot, higherRisk, NOW)).toBeNull();
        }
        saveApprovalRules(f.projectRoot, [ownerRule({ disabled: true })]);
        expect(await applyRule(f.projectRoot, f.ingress, f.request, NOW)).toBeNull();
        expect(f.broker.getDecision(f.request.id)).toBeNull();
        expect(() => f.authority.verifyAndClaimProviderEvidenceProbe(f.request.id, f.subject))
            .toThrowError(expect.objectContaining<Partial<AttendedExecutionApprovalError>>({
            code: 'DECISION_NOT_FOUND',
        }));
    });
    it('does not turn an expired produced request into a rule authorization or claim', async () => {
        const f = fixture();
        saveApprovalRules(f.projectRoot, [ownerRule()]);
        const expiredAt = new Date(Date.parse(f.request.expiresAt) + 1);
        f.setNow(expiredAt);
        const outcome = await applyRule(f.projectRoot, f.ingress, f.request, expiredAt);
        expect(outcome).toMatchObject({ kind: 'expired', requestId: f.request.id });
        expect(f.broker.getDecision(f.request.id)).toBeNull();
        expect(() => f.authority.verifyAndClaimProviderEvidenceProbe(f.request.id, f.subject))
            .toThrowError();
    });
});
}
