// ─── RoutingEngineV3 Slice-1 — deterministic engine suite ────────────────────
// Hand-coded close of the sprint-446 cascade (Brain, 2026-07-14). Covers:
// stage-eliminate · axis scorers · stage-rank · verifier (+policy, anti-temp,
// catalog-gap) · decision-story · journal+replay · routeTaskV3 e2e, including
// the word-inference-ban full-pipeline pins.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eliminate } from '../../../src/core/routing/stage-eliminate.js';
import type { AgentCandidate } from '../../../src/core/routing/stage-eliminate.js';
import { scoreContentDeterministic, PROFICIENCY_SCORE } from '../../../src/core/routing/axis-content.js';
import { scorePositional } from '../../../src/core/routing/axis-positional.js';
import { scoreNumerical, NEUTRAL, CELL_MIN_USES } from '../../../src/core/routing/axis-numerical.js';
import { rank, calibrateConfidence, TIE_EPSILON } from '../../../src/core/routing/stage-rank.js';
import {
  verify,
  enforceAntiTemp,
  contentStructuralConflict,
  CatalogGapError,
} from '../../../src/core/routing/verifier.js';
import { loadPolicyPacks, PROJECT_POLICY_PACK_RELATIVE_PATH } from '../../../src/core/routing/policy-pack.js';
import { buildStory } from '../../../src/core/routing/decision-story.js';
import {
  appendDecision,
  readSprintJournal,
  replayDecision,
  hashConfig,
  JournalReplayMismatchError,
} from '../../../src/core/routing/journal.js';
import { routeTaskV3 } from '../../../src/core/routing/route-task-v3.js';
import type { RouteCatalog, RoutableTask } from '../../../src/core/routing/route-task-v3.js';
import { matchSpace } from '../../../src/core/routing/capability-vector.js';
import type { CapabilityVector } from '../../../src/core/routing/capability-vector.js';
import type { RequirementVector } from '../../../src/core/routing/requirement-vector.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../../src/core/routing/config.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';
import type { RoutingDecisionV3, JournalEntryV3 } from '../../../src/core/routing/decision-types.js';
import { deriveCanonicalSkillProfile } from '../../../src/core/skill-profile-derivation.js';
import { createSkillDefinition } from '../../../src/core/skill-types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function cap(overrides: {
  workTypes?: CapabilityVector['content']['workTypes'];
  domains?: CapabilityVector['positional']['domains'];
  writeAuthority?: boolean;
  role?: string;
  deliverables?: CapabilityVector['positional']['deliverables'];
  personaSlices?: string[];
  costTier?: CapabilityVector['numerical']['costTier'];
  preferredModel?: string;
}): CapabilityVector {
  return {
    capabilitiesVersion: 3,
    content: {
      workTypes: overrides.workTypes ?? [{ type: 'build', proficiency: 'primary' }],
      expertise: [],
      personaSlices: overrides.personaSlices ?? ['implementation', 'default'],
    },
    positional: {
      domains: overrides.domains ?? [{ id: '*', proficiency: 'able' }],
      surfaces: [],
      writeAuthority: overrides.writeAuthority ?? true,
      role: overrides.role ?? 'implementer',
      deliverables: overrides.deliverables ?? [],
    },
    numerical: {
      ...(overrides.preferredModel ? { preferredModel: overrides.preferredModel } : {}),
      costTier: overrides.costTier ?? 'standard',
      maxParallel: null,
    },
  };
}

function agent(
  agentId: string,
  capabilities: CapabilityVector,
  source: AgentCandidate['source'] = 'builtin',
): AgentCandidate {
  return { agentId, capabilities, source };
}

const KNOWN_DOMAINS = new Set(['core-runtime', 'i18n', 'security', 'docs']);

function req(overrides: {
  workType?: string;
  needsWrite?: boolean;
  domains?: Array<{ id: string; weight: number }>;
  deliverables?: Array<{ type: string; ratio: number }>;
  riskClass?: 'low' | 'medium' | 'high';
  effortClass?: 'low' | 'normal' | 'high';
}): RequirementVector {
  return {
    content: {
      workType: overrides.workType ?? 'build',
      subtype: null,
      summary: null,
      semanticTags: null,
      provenance: 'structural',
      calibratedConfidence: 0.7,
    },
    positional: {
      domains: (overrides.domains ?? [{ id: 'core-runtime', weight: 1 }]).map((d) => ({
        ...d,
        evidence: 'test-fixture',
      })),
      deliverables: (overrides.deliverables ?? [{ type: 'code-src', ratio: 1 }]) as RequirementVector['positional']['deliverables'],
      surfaces: [],
      needsWrite: overrides.needsWrite ?? true,
      language: 'en',
    },
    numerical: {
      estimatedSize: 'small',
      fileCount: 2,
      moduleCount: 1,
      effortClass: overrides.effortClass ?? 'normal',
      riskClass: overrides.riskClass ?? 'low',
    },
  };
}

const builder = agent('builder', cap({ workTypes: [{ type: 'build', proficiency: 'primary' }, { type: 'fix', proficiency: 'secondary' }] }));
const refactorer = agent('refactorer', cap({
  workTypes: [{ type: 'refactor', proficiency: 'primary' }, { type: 'build', proficiency: 'never' }],
}));
const reviewer = agent('reviewer', cap({
  workTypes: [{ type: 'review', proficiency: 'primary' }, { type: 'analyze', proficiency: 'secondary' }],
  writeAuthority: false,
  role: 'reviewer',
}));
const i18nSpecialist = agent('i18n-spec', cap({
  workTypes: [{ type: 'build', proficiency: 'secondary' }],
  domains: [{ id: 'i18n', proficiency: 'primary' }],
}));
const tempAgent = agent('temp-x', cap({ workTypes: [{ type: 'build', proficiency: 'primary' }] }), 'learned');

function catalogOf(...agents: AgentCandidate[]): RouteCatalog {
  return {
    agents,
    skills: [],
    vocabulary: { domains: BUILTIN_DOMAINS, knownDomainIds: KNOWN_DOMAINS },
  };
}

const CONFIG = { ...DEFAULT_ROUTING_V3_CONFIG, enabled: true };

// ─── stage-eliminate ─────────────────────────────────────────────────────────

describe('stage-1 elimination', () => {
  it('V2 parity: construction work never reaches a Write-denied agent', () => {
    const { survivors, eliminated } = eliminate(req({ needsWrite: true }), [reviewer, builder]);
    expect(survivors.map((s) => s.agentId)).toEqual(['builder']);
    expect(eliminated[0]).toMatchObject({ entityId: 'reviewer', reason: 'write-authority-missing' });
  });

  it('work-type never eliminates (refactorer out of build work)', () => {
    const { survivors, eliminated } = eliminate(req({ workType: 'build' }), [refactorer, builder]);
    expect(survivors.map((s) => s.agentId)).toEqual(['builder']);
    expect(eliminated[0]).toMatchObject({ entityId: 'refactorer', reason: 'work-type-never' });
  });

  it('role contradiction: implementer persona out of review work unless explicitly granted', () => {
    const reviewReq = req({ workType: 'review', needsWrite: false, deliverables: [{ type: 'doc', ratio: 1 }] });
    const { survivors, eliminated } = eliminate(reviewReq, [builder, reviewer]);
    expect(survivors.map((s) => s.agentId)).toEqual(['reviewer']);
    expect(eliminated[0]).toMatchObject({ entityId: 'builder', reason: 'role-contradiction' });

    const grantedBuilder = agent('granted', cap({
      workTypes: [{ type: 'build', proficiency: 'primary' }, { type: 'review', proficiency: 'able' }],
    }));
    expect(eliminate(reviewReq, [grantedBuilder]).survivors).toHaveLength(1);
  });

  it('deliverable mismatch is SOFT (positional), never a hard elimination (Slice-2 amendment)', () => {
    // A manifest-writing build task must not produce a false catalog gap just
    // because no builder enumerates 'manifest' — coverage lowers the
    // positional score instead of eliminating.
    const docAgent = agent('doc-only', cap({ deliverables: ['doc'] }));
    const r = req({ deliverables: [{ type: 'code-src', ratio: 0.6 }, { type: 'code-test', ratio: 0.4 }] });
    expect(eliminate(r, [docAgent]).survivors).toHaveLength(1);

    const srcAgent = agent('src-only', cap({ deliverables: ['code-src'] }));
    const covered = scorePositional(r, matchSpace(srcAgent.capabilities), { knownDomainIds: KNOWN_DOMAINS });
    const uncovered = scorePositional(r, matchSpace(docAgent.capabilities), { knownDomainIds: KNOWN_DOMAINS });
    expect(covered.score).toBeGreaterThan(uncovered.score);
  });
});

// ─── axis scorers ────────────────────────────────────────────────────────────

describe('content axis (deterministic)', () => {
  it('proficiency table drives the score; undeclared/never → 0', () => {
    expect(scoreContentDeterministic(req({}), matchSpace(builder.capabilities)).score).toBe(PROFICIENCY_SCORE.primary);
    expect(scoreContentDeterministic(req({ workType: 'fix' }), matchSpace(builder.capabilities)).score).toBe(PROFICIENCY_SCORE.secondary);
    expect(scoreContentDeterministic(req({ workType: 'migrate' }), matchSpace(builder.capabilities)).score).toBe(0);
    expect(scoreContentDeterministic(req({}), matchSpace(refactorer.capabilities)).score).toBe(0);
  });

  it('subtype rolls up to parent', () => {
    expect(scoreContentDeterministic(req({ workType: 'build:cli' }), matchSpace(builder.capabilities)).score).toBe(1);
  });
});

describe('positional axis', () => {
  it('explicit domain owner beats wildcard', () => {
    const r = req({ domains: [{ id: 'i18n', weight: 1 }] });
    const owner = scorePositional(r, matchSpace(i18nSpecialist.capabilities), { knownDomainIds: KNOWN_DOMAINS });
    const wildcard = scorePositional(r, matchSpace(builder.capabilities), { knownDomainIds: KNOWN_DOMAINS });
    expect(owner.score).toBeGreaterThan(wildcard.score);
  });

  it('unknown capability domain surfaces a typed issue, never silent-zero', () => {
    const weird = agent('weird', cap({ domains: [{ id: 'no-such-domain', proficiency: 'primary' }] }));
    const result = scorePositional(req({}), matchSpace(weird.capabilities), { knownDomainIds: KNOWN_DOMAINS });
    expect(result.issues.some((i) => i.includes('no-such-domain'))).toBe(true);
  });
});

describe('numerical axis', () => {
  it('cold-start: missing cells are NEUTRAL, never a penalty', () => {
    const result = scoreNumerical(req({}), 'builder', builder.capabilities, { cells: new Map() });
    expect(result.evidence.join(' ')).toContain('cold-start');
    const fresh = result.score;
    const seasoned = scoreNumerical(req({}), 'builder', builder.capabilities, {
      cells: new Map([[`build|core-runtime|builder`, { uses: CELL_MIN_USES, successes: 0, qualitySum: 0 }]]),
    });
    expect(seasoned.score).toBeLessThan(fresh); // real failures rank below neutral
  });

  it('live signals absent → neutral, present → consumed', () => {
    const absent = scoreNumerical(req({}), 'builder', builder.capabilities, { cells: new Map() });
    const present = scoreNumerical(req({}), 'builder', builder.capabilities, {
      cells: new Map(),
      providerHealth: 1,
      latencyScore: 1,
    });
    expect(present.score).toBeGreaterThan(absent.score);
    expect(absent.evidence.join(' ')).toContain('absent → neutral');
  });

  // ─── K1 — 581-kalibrasyon: signal-gated component mean ────────────────────
  describe('K1 signal-gated numerical (581 calibration)', () => {
    it('legacy (no `active`) = 3-component neutral-filled mean; gated = pure tier signal', () => {
      const gated = scoreNumerical(
        req({}), 'builder', builder.capabilities, { cells: new Map() },
        { cells: false, live: false },
      );
      const legacy = scoreNumerical(req({}), 'builder', builder.capabilities, { cells: new Map() });
      // gated drops both dead components → score IS the tier component; legacy
      // dilutes the same tier value with two neutrals: (0.5 + tier + 0.5)/3.
      expect(legacy.score).toBeCloseTo((NEUTRAL + gated.score + NEUTRAL) / 3, 10);
      expect(gated.evidence.join(' ')).toContain('signal-gated K1');
    });

    it('a warm cell keeps the cells component in the mean — real failures now WEIGH (no neutral dilution)', () => {
      const cells = new Map([[`build|core-runtime|builder`, { uses: CELL_MIN_USES, successes: 0, qualitySum: 0 }]]);
      const gatedWarm = scoreNumerical(req({}), 'builder', builder.capabilities, { cells }, { cells: true, live: false });
      const gatedCold = scoreNumerical(req({}), 'builder', builder.capabilities, { cells: new Map() }, { cells: false, live: false });
      // warm 0% success-rate drags the mean below the pure-tier score — the
      // whole point of K1: real signal weighs, dead-neutral no longer pads it.
      expect(gatedWarm.score).toBeLessThan(gatedCold.score);
      expect(gatedWarm.evidence.join(' ')).toContain('cells build');
    });
  });
});

// ─── ranking ─────────────────────────────────────────────────────────────────

describe('stage-4 ranking', () => {
  const axes = (c: number, p: number, n: number) => ({
    content: { score: c, evidence: [] },
    positional: { score: p, evidence: [] },
    numerical: { score: n, evidence: [] },
  });

  it('config weights decide the order (override flips it)', () => {
    const a = { agentId: 'a', axisScores: axes(1.0, 0.2, 0.5) };
    const b = { agentId: 'b', axisScores: axes(0.3, 1.0, 0.5) };
    expect(rank([a, b], CONFIG).top?.agentId).toBe('a'); // content-heavy default
    const positionalHeavy = { ...CONFIG, weights: { content: 0.1, positional: 0.8, numerical: 0.1 } };
    expect(rank([a, b], positionalHeavy).top?.agentId).toBe('b');
  });

  it('tie and low-confidence produce typed indecision', () => {
    const a = { agentId: 'a', axisScores: axes(0.9, 0.9, 0.9) };
    const b = { agentId: 'b', axisScores: axes(0.9, 0.9, 0.9) };
    expect(rank([a, b], CONFIG).indecision).toBe('tie');

    const weak = { agentId: 'w', axisScores: axes(0.3, 0.3, 0.3) };
    expect(rank([weak], CONFIG).indecision).toBe('low-confidence');
  });

  it('deterministic total order: identical runs → identical arrays', () => {
    const inputs = ['z', 'a', 'm'].map((id) => ({ agentId: id, axisScores: axes(0.5, 0.5, 0.5) }));
    const one = rank(inputs, CONFIG).ordered.map((c) => c.agentId);
    const two = rank(inputs, CONFIG).ordered.map((c) => c.agentId);
    expect(one).toEqual(two);
    expect(one).toEqual(['a', 'm', 'z']); // documented last-resort lexicographic
  });

  it('calibrated confidence is monotonic in gap and in top score', () => {
    expect(calibrateConfidence(0.9, 0.5)).toBeGreaterThan(calibrateConfidence(0.9, 0.8));
    expect(calibrateConfidence(0.9, 0.7)).toBeGreaterThan(calibrateConfidence(0.6, 0.4));
  });
});

// ─── verifier ────────────────────────────────────────────────────────────────

describe('stage-3 verifier', () => {
  it('content↔structural conflict caught both directions', () => {
    expect(contentStructuralConflict(req({ workType: 'document', deliverables: [{ type: 'code-src', ratio: 1 }] }))).toContain('document');
    expect(contentStructuralConflict(req({ workType: 'build', deliverables: [{ type: 'doc', ratio: 1 }] }))).toContain('build');
    expect(contentStructuralConflict(req({}))).toBeNull();
  });

  it('force bypasses ranking, never authority: violation → forceWarning', () => {
    const verdict = verify(req({ needsWrite: true }), reviewer, { forced: true });
    expect(verdict.pass).toBe(false);
    expect(verdict.forceWarning).toBe(true);
  });

  it('defense-in-depth: an unfiltered candidate is still caught', () => {
    const verdict = verify(req({ workType: 'build' }), refactorer, {});
    expect(verdict.violations.some((v) => v.code === 'WORK_TYPE_NEVER')).toBe(true);
  });

  it('anti-temp: temp wins only when genuinely alone', () => {
    const close = [
      { agentId: 'temp-x', finalScore: 0.80, axisScores: { content: { score: 1, evidence: [] }, positional: { score: 1, evidence: [] }, numerical: { score: 1, evidence: [] } } },
      { agentId: 'builder', finalScore: 0.79, axisScores: { content: { score: 1, evidence: [] }, positional: { score: 1, evidence: [] }, numerical: { score: 1, evidence: [] } } },
    ];
    const sourceOf = (id: string) => (id === 'temp-x' ? ('learned' as const) : ('builtin' as const));
    expect(enforceAntiTemp(close, sourceOf, TIE_EPSILON)[0]!.agentId).toBe('builder');

    const alone = [close[0]!];
    expect(enforceAntiTemp(alone, sourceOf, TIE_EPSILON)[0]!.agentId).toBe('temp-x');
  });
});

// ─── policy packs ────────────────────────────────────────────────────────────

describe('policy packs', () => {
  function withPolicyProject(rules: unknown[], fn: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'r3-policy-'));
    try {
      const file = join(root, PROJECT_POLICY_PACK_RELATIVE_PATH);
      mkdirSync(join(root, '.deckent', 'routing'), { recursive: true });
      writeFileSync(file, JSON.stringify({ rules }), 'utf8');
      fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('security-domain → only reviewer role (violation carries policy id)', () => {
    withPolicyProject(
      [{ id: 'sec-review-only', description: 'security work is reviewed', when: { domains: ['security'] }, require: { roles: ['reviewer'] } }],
      (root) => {
        const policies = loadPolicyPacks(root);
        const r = req({ domains: [{ id: 'security', weight: 1 }] });
        const verdict = verify(r, builder, { policies });
        expect(verdict.pass).toBe(false);
        expect(verdict.violations[0]).toMatchObject({ code: 'POLICY_ROLE_RESTRICTED', policyId: 'sec-review-only' });
        // non-matching requirement → rule inert
        expect(verify(req({}), builder, { policies }).pass).toBe(true);
      },
    );
  });

  it('high-risk config → escalate + minConfidence honored', () => {
    withPolicyProject(
      [{ id: 'risky-config', description: 'high-risk config escalates', when: { riskClass: ['high'] }, require: { escalate: true, minConfidence: 0.9 } }],
      (root) => {
        const policies = loadPolicyPacks(root);
        const verdict = verify(req({ riskClass: 'high' }), builder, { policies });
        expect(verdict.policyEscalate).toBe(true);
        expect(verdict.policyMinConfidence).toBe(0.9);
      },
    );
  });

  it('absent file = clean empty pack; malformed layer skipped visibly', () => {
    const root = mkdtempSync(join(tmpdir(), 'r3-policy-'));
    try {
      expect(loadPolicyPacks(root).rules).toHaveLength(0);
      mkdirSync(join(root, '.deckent', 'routing'), { recursive: true });
      writeFileSync(join(root, PROJECT_POLICY_PACK_RELATIVE_PATH), '{not json', 'utf8');
      const reg = loadPolicyPacks(root);
      expect(reg.rules).toHaveLength(0);
      expect(reg.invalid).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── routeTaskV3 e2e (deterministic) ─────────────────────────────────────────

const BUILD_TASK: RoutableTask = {
  title: 'Add pagination to the list command',
  description: 'Build cursor pagination with tests.',
  scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/pager.ts', 'tests/core/pager.test.ts'] },
};

describe('routeTaskV3 — deterministic end-to-end', () => {
  it('build requirement → builder wins; decision frozen; story carries WHY', async () => {
    const decision = await routeTaskV3(BUILD_TASK, catalogOf(builder, refactorer, reviewer), {
      config: CONFIG,
      requirement: req({}),
    });
    expect(decision.agentId).toBe('builder');
    expect(decision.provenance).toBe('deterministic');
    expect(Object.isFrozen(decision)).toBe(true);
    expect(decision.story.summary).toContain('builder');
    expect(decision.story.steps.every((s) => s.line.length <= 80)).toBe(true);
    expect(decision.story.eliminated.map((e) => e.entityId)).toEqual(expect.arrayContaining(['refactorer', 'reviewer']));
  });

  it('explicit refactor requirement → refactorer (via requirement override)', async () => {
    const decision = await routeTaskV3(BUILD_TASK, catalogOf(builder, refactorer), {
      config: CONFIG,
      requirement: req({ workType: 'refactor' }),
    });
    expect(decision.agentId).toBe('refactorer');
  });

  it('i18n-domain requirement → domain owner beats generalist', async () => {
    const decision = await routeTaskV3(BUILD_TASK, catalogOf(builder, i18nSpecialist), {
      config: CONFIG,
      requirement: req({ domains: [{ id: 'i18n', weight: 1 }] }),
    });
    expect(decision.agentId).toBe('i18n-spec');
  });

  it('word-inference ban holds through the FULL pipeline (agent-name + test token)', async () => {
    const base: RoutableTask = { ...BUILD_TASK };
    const poisoned: RoutableTask = {
      ...BUILD_TASK,
      title: 'security-auditor test görevi — Add pagination to the list command',
      description: `${BUILD_TASK.description} Mention: test test refactorer i18n-spec.`,
    };
    const catalog = catalogOf(builder, i18nSpecialist);
    const a = await routeTaskV3(base, catalog, { config: CONFIG });
    const b = await routeTaskV3(poisoned, catalog, { config: CONFIG });
    expect(b.agentId).toBe(a.agentId);
    expect(b.finalScore).toBeCloseTo(a.finalScore, 10);
  });

  it('catalog gap → typed CatalogGapError with actionable payload', async () => {
    await expect(
      routeTaskV3(BUILD_TASK, catalogOf(reviewer), { config: CONFIG, requirement: req({}) }),
    ).rejects.toMatchObject({ name: 'CatalogGapError', workType: 'build' });
  });

  it('tie → escalation to Brain (decision-5)', async () => {
    const twinA = agent('twin-a', cap({}));
    const twinB = agent('twin-b', cap({}));
    const decision = await routeTaskV3(BUILD_TASK, catalogOf(twinA, twinB), {
      config: CONFIG,
      requirement: req({}),
    });
    expect(decision.escalation?.reason).toBe('tie');
    expect(decision.escalation?.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('temp agent loses a near-tie to a builtin (anti-temp, vectorial)', async () => {
    const decision = await routeTaskV3(BUILD_TASK, catalogOf(tempAgent, builder), {
      config: CONFIG,
      requirement: req({}),
    });
    expect(decision.agentId).toBe('builder');
  });

  it('skills: honest-empty below fit floor; persona slice via alias table', async () => {
    const catalog: RouteCatalog = {
      ...catalogOf(builder),
      skills: [
        { skillId: 'irrelevant-skill', profile: { profileVersion: 3, workTypes: [{ type: 'migrate', proficiency: 'primary' }], domains: [{ id: 'docs', proficiency: 'primary' }], expertise: [], deliverables: [] } },
        { skillId: 'core-build-skill', profile: { profileVersion: 3, workTypes: [{ type: 'build', proficiency: 'primary' }], domains: [{ id: 'core-runtime', proficiency: 'primary' }], expertise: [], deliverables: [] } },
      ],
    };
    const decision = await routeTaskV3(BUILD_TASK, catalog, { config: CONFIG, requirement: req({}) });
    expect(decision.skillIds).toEqual(['core-build-skill']);
    expect(decision.personaSlices).toEqual(['implementation', 'default']); // build → alias
  });

  // 7094-F1c: the generic workType axis alone can no longer attach a skill —
  // real domain overlap with THIS task is required (sprint-565 measured case:
  // derivation gives nearly every skill a leading `build:primary`, so all 11
  // prompts carried the same alphabetically-first three skills).
  it('skills: generic build:primary with NO domain overlap is honest-empty (7094-F1c)', async () => {
    const catalog: RouteCatalog = {
      ...catalogOf(builder),
      skills: [
        { skillId: 'aaa-generic-skill', profile: { profileVersion: 3, workTypes: [{ type: 'build', proficiency: 'primary' }], domains: [{ id: 'docs', proficiency: 'primary' }], expertise: [], deliverables: [] } },
        { skillId: 'bbb-generic-skill', profile: { profileVersion: 3, workTypes: [{ type: 'build', proficiency: 'primary' }], domains: [{ id: 'security', proficiency: 'primary' }], expertise: [], deliverables: [] } },
      ],
    };
    // requirement domain is core-runtime — neither skill overlaps → NO skills,
    // never the alphabetical tie-break winners.
    const decision = await routeTaskV3(BUILD_TASK, catalog, { config: CONFIG, requirement: req({}) });
    expect(decision.skillIds).toEqual([]);
  });

  it('skills: derived test authority is selected for a core plus tests task', async () => {
    const testing = deriveCanonicalSkillProfile(createSkillDefinition({
      id: 'testing-expert', name: 'Testing Expert', category: 'workflow', priority: 10,
      description: 'Test pyramid, mocking strategies, coverage, and CI integration',
      triggers: ['test', 'coverage', 'spec'],
      stackDetection: { files: [], dependencies: ['vitest'], commands: [] },
    }));
    const generic = deriveCanonicalSkillProfile(createSkillDefinition({
      id: 'generic-builder', name: 'Generic Builder', category: 'workflow', priority: 10,
      description: 'Build components and tooling', triggers: ['build'],
    }));
    if (testing.status !== 'routable' || generic.status !== 'routable') {
      throw new Error('test fixtures must derive');
    }
    const catalog: RouteCatalog = {
      ...catalogOf(builder),
      skills: [
        { skillId: 'generic-builder', profile: generic.profile },
        { skillId: 'testing-expert', profile: testing.profile },
      ],
    };

    const decision = await routeTaskV3(BUILD_TASK, catalog, { config: CONFIG });
    expect(decision.skillIds).toEqual(['testing-expert']);
  });

  it('skills: an explicit `*` domain declaration still attaches (owner-authored wildcard, 7094-F1c)', async () => {
    const catalog: RouteCatalog = {
      ...catalogOf(builder),
      skills: [
        { skillId: 'everywhere-skill', profile: { profileVersion: 3, workTypes: [{ type: 'build', proficiency: 'primary' }], domains: [{ id: '*', proficiency: 'secondary' }], expertise: [], deliverables: [] } },
      ],
    };
    const decision = await routeTaskV3(BUILD_TASK, catalog, { config: CONFIG, requirement: req({}) });
    expect(decision.skillIds).toEqual(['everywhere-skill']);
  });
});

// ─── journal + replay ────────────────────────────────────────────────────────

describe('journal v3 + replay', () => {
  it('append/read round-trip; corrupted line skipped visibly; replay equality + drift', async () => {
    const root = mkdtempSync(join(tmpdir(), 'r3-journal-'));
    try {
      const catalog = catalogOf(builder, refactorer);
      const requirement = req({});
      const decision = await routeTaskV3(BUILD_TASK, catalog, { config: CONFIG, requirement });
      const entry: JournalEntryV3 = {
        schemaVersion: 1,
        taskId: 't-1',
        sprintId: 'sprint-test',
        recordedAt: '2026-07-14T00:00:00.000Z',
        requirement,
        configHash: hashConfig(CONFIG),
        catalog: { builder: builder.capabilities, refactorer: refactorer.capabilities },
        decision: decision as RoutingDecisionV3,
      };
      appendDecision(root, entry);

      // corrupt a second line
      const file = join(root, '.deckent', 'routing', 'decisions', 'sprint-test.jsonl');
      writeFileSync(file, `${readFileSync(file, 'utf8')}{broken\n`, 'utf8');

      const read = readSprintJournal(root, 'sprint-test');
      expect(read.entries).toHaveLength(1);
      expect(read.corruptedLines).toHaveLength(1);

      // replay: identical re-derivation passes…
      const derive = () => ({
        agentId: decision.agentId,
        finalScore: decision.finalScore,
        ranked: decision.ranked,
      });
      expect(() => replayDecision(read.entries[0]!, hashConfig(CONFIG), derive)).not.toThrow();

      // …winner drift and config drift both throw typed errors
      expect(() =>
        replayDecision(read.entries[0]!, hashConfig(CONFIG), () => ({ agentId: 'other', finalScore: 0, ranked: [] })),
      ).toThrow(JournalReplayMismatchError);
      expect(() =>
        replayDecision(read.entries[0]!, hashConfig({ ...CONFIG, topK: 99 }), derive),
      ).toThrow(JournalReplayMismatchError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── story ───────────────────────────────────────────────────────────────────

describe('decision story', () => {
  it('escalated trace summarizes the escalation; all lines ≤80 chars', () => {
    const story = buildStory({
      taskLabel: 'x',
      workType: 'build',
      domains: ['core-runtime'],
      candidateCount: 3,
      eliminated: [{ entityId: 'reviewer', kind: 'agent', reason: 'write-authority-missing', detail: 'd' }],
      verifierDrops: [],
      winner: null,
      runnerUp: null,
      confidence: 0.4,
      indecision: 'low-confidence',
      escalation: { reason: 'low-confidence', candidates: [], evidence: {} },
      provenance: 'deterministic',
    });
    expect(story.summary).toContain('Escalated to Brain');
    expect(story.steps.every((s) => s.line.length <= 80)).toBe(true);
    expect(story.steps.at(-1)?.messageKey).toBe('routing.story.escalated');
  });
});
