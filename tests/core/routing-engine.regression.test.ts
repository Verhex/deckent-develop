// ─── Routing-engine regression battery (447-003) ──────────────────────────────
// Derived from the routing-v3 design spec (.analysis/routing-v3-design-spec-
// 2026-07-14.md) and the misroute evidence corpus (.analysis/routing-v3-appendix-
// misroute-corpus-2026-07-14.md). Complements — does NOT duplicate — the existing
// routing3 suites:
//   - tests/core/routing/engine-slice1.test.ts: stage/axis unit tests + the
//     word-inference-ban / tie-escalation / catalog-gap e2e cases (synthetic fixture).
//   - tests/core/routing/corpus-harness.test.ts: misroute-corpus acceptance cases
//     against the real catalog (443 natural-experiment siblings, i18n/docs probes).
//   - tests/core/routing/content-llm-slice2.test.ts: LLM batch prompt/parse
//     contract + one-shot completion-failure fallback.
// This file adds three things nothing else pins: misroute-corpus edge cases not
// yet encoded (substring-collision immunity, the literal "test"-word ban against
// the real catalog, the named 437-001 score-tie incident, a before/after delta
// framing of the 443 natural experiment), model-assignment invariants (nothing
// existed for `modelPreference`/`effortClass`/`effortForWorkType`), and the
// content-fit retry loop's ATTEMPT COUNT (single retry, never a 3rd call).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { routeTaskV3 } from '../../src/core/routing/route-task-v3.js';
import type { RouteCatalog, RoutableTask } from '../../src/core/routing/route-task-v3.js';
import type { AgentCandidate } from '../../src/core/routing/stage-eliminate.js';
import { validateCapabilities } from '../../src/core/routing/capability-vector.js';
import type { CapabilityVector } from '../../src/core/routing/capability-vector.js';
import { BUILTIN_DOMAINS } from '../../src/core/routing/vocabulary-builtin.js';
import { DEFAULT_ROUTING_V3_CONFIG, effortForWorkType } from '../../src/core/routing/config.js';
import { producePositional, produceNumerical } from '../../src/core/routing/requirement-vector.js';
import { produceContentBatchLLM } from '../../src/core/routing/content-llm.js';
import type { Task } from '../../src/core/task-types.js';
import { getAllKnownModelIds } from '../../src/core/task-types.js';
import { modelRegistry } from '../../src/core/model-registry.js';

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const BUILTIN_AGENTS_DIR = join(PROJECT_ROOT, 'src', 'core', 'builtins', 'agents');
const CONFIG = DEFAULT_ROUTING_V3_CONFIG;

// ─── Shared fixtures (local per project convention — every routing3 test file
// defines its own small builders rather than a cross-file shared helper) ──────

function loadRealCatalog(): RouteCatalog {
  const agents: AgentCandidate[] = [];
  for (const id of readdirSync(BUILTIN_AGENTS_DIR)) {
    const manifestPath = join(BUILTIN_AGENTS_DIR, id, 'agent.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    const validation = manifest['capabilities'] ? validateCapabilities(manifest['capabilities']) : null;
    if (!validation?.ok) continue;
    agents.push({ agentId: id, capabilities: validation.value, source: 'builtin' });
  }
  return {
    agents,
    skills: [],
    vocabulary: { domains: BUILTIN_DOMAINS, knownDomainIds: new Set(BUILTIN_DOMAINS.map((d) => d.id)) },
  };
}

const task = (title: string, description: string, dirs: string[], writes: string[]): RoutableTask => ({
  title,
  description,
  scope: { directories: dirs, filesRead: [], filesWrite: writes },
});

function vocabularyOf(domains = BUILTIN_DOMAINS): RouteCatalog['vocabulary'] {
  return { domains, knownDomainIds: new Set(domains.map((d) => d.id)) };
}

// ─── 1. Misroute-corpus edge cases ─────────────────────────────────────────────

describe('routing-engine regression — misroute-corpus edge cases', () => {
  const catalog = loadRealCatalog();

  it(
    'substring-collision immunity: Turkish "icindeki" (contains "ci") / "hex" (contains "cd") never ' +
      'manufacture devops/ci domain evidence (misroute-corpus #5/#6, 442-001/002)',
    async () => {
      const t = task(
        'Rehydrate event-fold getFlow/listFlows',
        'Saf TypeScript event-sourcing icindeki hex-encoded id akisini yeniden olustur.',
        ['src/core/'],
        ['src/core/event-fold.ts'],
      );
      // Direct proof at the producer level: the positional axis is scope-based
      // only, so a prose substring can never inject a domain that no scope path
      // actually matches — the collision cannot even reach the pipeline.
      const positional = producePositional(t as unknown as Task, { domains: BUILTIN_DOMAINS });
      expect(positional.domains.find((d) => d.id === 'devops/ci')).toBeUndefined();

      const decision = await routeTaskV3(t, catalog, { config: CONFIG });
      expect(decision.agentId).not.toBe('devops-engineer');
      expect(decision.agentId).toBe('implementer');
    },
  );

  it(
    'literal word "test" in the title never triggers an unowned/devops misroute — lands on a ' +
      'write-capable builder (misroute-corpus #9-14/#20, the 0.95-confidence NO_GO class)',
    async () => {
      const t = task(
        'test-yazarligi ve hermetik regresyon senaryolari',
        'Write hermetic regression test scenarios for the sync command.',
        ['tests/core/'],
        ['tests/core/sync.test.ts'],
      );
      const decision = await routeTaskV3(t, catalog, { config: CONFIG });
      const winner = catalog.agents.find((a) => a.agentId === decision.agentId)!;
      expect(winner.capabilities.positional.writeAuthority).toBe(true);
      expect(decision.agentId).not.toBe('devops-engineer'); // corpus #7: 0.42-confidence devops misfire
      expect(decision.agentId).toBe('implementer');
    },
  );

  it('score-tie is escalated to Brain, never silently arbitrated (misroute-corpus #15, 437-001 EXPIRE-SWEEP tie)', async () => {
    const identical: CapabilityVector = {
      capabilitiesVersion: 3,
      content: { workTypes: [{ type: 'build', proficiency: 'primary' }], expertise: [], personaSlices: ['default'] },
      positional: { domains: [{ id: '*', proficiency: 'able' }], surfaces: [], writeAuthority: true, role: 'implementer', deliverables: [] },
      numerical: { costTier: 'standard', maxParallel: null },
    };
    const twinA: AgentCandidate = { agentId: 'devops-twin-a', capabilities: identical, source: 'builtin' };
    const twinB: AgentCandidate = { agentId: 'devops-twin-b', capabilities: identical, source: 'builtin' };
    const t = task('EXPIRE-SWEEP core API', 'Implement the expire-sweep core API.', ['src/core/'], ['src/core/expire-sweep.ts']);

    const decision = await routeTaskV3(t, { agents: [twinA, twinB], skills: [], vocabulary: vocabularyOf() }, { config: CONFIG });

    expect(decision.escalation?.reason).toBe('tie');
    expect(decision.escalation?.candidates.map((c) => c.agentId).sort()).toEqual(['devops-twin-a', 'devops-twin-b']);
  });

  it('agent-name-in-description delta invariance over the real catalog (443 natural-experiment, before/after framing)', async () => {
    const baseTask = task(
      'Add accessibility guidance content',
      'Author guidance content with markers for the persona file.',
      ['src/core/builtins/agents/'],
      ['src/core/builtins/agents/frontend-designer/PROMPT.md'],
    );
    const poisonedTask = task(
      baseTask.title,
      `${baseTask.description} See also security-auditor and performance-analyzer for reference.`,
      baseTask.scope.directories,
      baseTask.scope.filesWrite,
    );

    const a = await routeTaskV3(baseTask, catalog, { config: CONFIG });
    const b = await routeTaskV3(poisonedTask, catalog, { config: CONFIG });

    expect(b.agentId).toBe(a.agentId);
    expect(b.finalScore).toBeCloseTo(a.finalScore, 10);
  });
});

// ─── 2. Model-assignment invariants ────────────────────────────────────────────

describe('routing-engine regression — model-assignment invariants', () => {
  const BUILD_TASK: RoutableTask = task(
    'Add pagination to the list command',
    'Build cursor pagination.',
    ['src/core/'],
    ['src/core/pager.ts'],
  );

  const catalogWith = (...agents: AgentCandidate[]): RouteCatalog => ({
    agents,
    skills: [],
    vocabulary: vocabularyOf(),
  });

  it("modelPreference mirrors the WINNING agent's own declared preferredModel — never invented", async () => {
    // ADR-G-036 zero-hardcode: pick two real ids dynamically off the registry
    // rather than naming a known model id as a literal in this test.
    const allIds = modelRegistry.getAllModelIds();
    const modelA = allIds[0]!;
    const modelB = allIds.find((id) => id !== modelA)!;

    const winnerCap: CapabilityVector = {
      capabilitiesVersion: 3,
      content: { workTypes: [{ type: 'build', proficiency: 'primary' }], expertise: [], personaSlices: ['default'] },
      positional: { domains: [{ id: '*', proficiency: 'able' }], surfaces: [], writeAuthority: true, role: 'implementer', deliverables: [] },
      numerical: { preferredModel: modelA, costTier: 'standard', maxParallel: null },
    };
    const loserCap: CapabilityVector = {
      capabilitiesVersion: 3,
      content: { workTypes: [{ type: 'build', proficiency: 'secondary' }], expertise: [], personaSlices: ['default'] },
      positional: { domains: [{ id: '*', proficiency: 'able' }], surfaces: [], writeAuthority: true, role: 'implementer', deliverables: [] },
      numerical: { preferredModel: modelB, costTier: 'standard', maxParallel: null },
    };
    const winner: AgentCandidate = { agentId: 'winner', capabilities: winnerCap, source: 'builtin' };
    const loser: AgentCandidate = { agentId: 'loser', capabilities: loserCap, source: 'builtin' };

    const decision = await routeTaskV3(BUILD_TASK, catalogWith(winner, loser), { config: CONFIG });

    expect(decision.agentId).toBe('winner');
    expect(decision.modelPreference).toBe(modelA);
    expect(decision.modelPreference).not.toBe(modelB);
  });

  it('modelPreference is null (honest-null) when the winning agent declares none', async () => {
    const noModelCap: CapabilityVector = {
      capabilitiesVersion: 3,
      content: { workTypes: [{ type: 'build', proficiency: 'primary' }], expertise: [], personaSlices: ['default'] },
      positional: { domains: [{ id: '*', proficiency: 'able' }], surfaces: [], writeAuthority: true, role: 'implementer', deliverables: [] },
      numerical: { costTier: 'standard', maxParallel: null },
    };
    const solo: AgentCandidate = { agentId: 'solo', capabilities: noModelCap, source: 'builtin' };

    const decision = await routeTaskV3(BUILD_TASK, catalogWith(solo), { config: CONFIG });

    expect(decision.modelPreference).toBeNull();
  });

  it('every builtin agent declares a preferredModel that resolves via the LIVE model registry (ADR-G-036 — no frozen list)', () => {
    const catalog = loadRealCatalog();
    const known = new Set(getAllKnownModelIds());
    expect(catalog.agents.length).toBeGreaterThan(0);
    for (const a of catalog.agents) {
      const declared = a.capabilities.numerical.preferredModel;
      if (declared !== undefined) {
        expect(known.has(declared), `${a.agentId} declares unknown model '${declared}'`).toBe(true);
      }
    }
  });

  it('effortClass passthrough: task.effort round-trips through the numerical axis, defaulting to normal', () => {
    const withEffort = { ...BUILD_TASK, id: 't-1', effort: 'high' } as unknown as Task;
    expect(produceNumerical(withEffort).effortClass).toBe('high');

    const withoutEffort = { ...BUILD_TASK, id: 't-2' } as unknown as Task;
    expect(produceNumerical(withoutEffort).effortClass).toBe('normal');
  });

  it('effortForWorkType: closed work-type table maps to the documented tiers; subtype rolls up to parent', () => {
    expect(effortForWorkType('document')).toBe('low');
    expect(effortForWorkType('configure')).toBe('low');
    expect(effortForWorkType('analyze')).toBe('high');
    expect(effortForWorkType('build')).toBe('normal');
    expect(effortForWorkType('fix')).toBe('normal');
    expect(effortForWorkType('review:compliance')).toBe('normal'); // subtype → parent 'review'
  });
});

// ─── 3. Content-fit fallback chain (single retry, no infinite loop) ───────────

describe('routing-engine regression — content-fit fallback chain (single retry, no infinite loop)', () => {
  const t1 = {
    id: 't-1',
    title: 'Refactor the config loader',
    description: 'Split into pure functions.',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
  } as unknown as Task;
  const positional = producePositional(t1, { domains: BUILTIN_DOMAINS });

  it('persistent completion failure: exactly 2 attempts, then structural fallback — never a 3rd call', async () => {
    let calls = 0;
    const outcome = await produceContentBatchLLM(
      [{ task: t1, positional }],
      async () => {
        calls++;
        throw new Error('provider down');
      },
      CONFIG.structuralConfidence,
    );

    expect(calls).toBe(2);
    expect(outcome.contents.get('t-1')!.provenance).toBe('structural');
    expect(outcome.fallbacks).toHaveLength(1);
  });

  it('retry recovery: first attempt fails, second succeeds — exactly 2 calls, LLM content wins', async () => {
    let calls = 0;
    const outcome = await produceContentBatchLLM(
      [{ task: t1, positional }],
      async () => {
        calls++;
        if (calls === 1) throw new Error('transient');
        return JSON.stringify([
          { taskId: 't-1', workType: 'refactor', subtype: null, summary: 'ok', semanticTags: [], confidence: 0.9 },
        ]);
      },
      CONFIG.structuralConfidence,
    );

    expect(calls).toBe(2);
    expect(outcome.contents.get('t-1')!.provenance).toBe('llm');
    expect(outcome.contents.get('t-1')!.workType).toBe('refactor');
    expect(outcome.fallbacks).toHaveLength(0);
  });

  it('first-attempt success: exactly ONE call, no wasted retry', async () => {
    let calls = 0;
    const outcome = await produceContentBatchLLM(
      [{ task: t1, positional }],
      async () => {
        calls++;
        return JSON.stringify([
          { taskId: 't-1', workType: 'refactor', subtype: null, summary: 'ok', semanticTags: [], confidence: 0.9 },
        ]);
      },
      CONFIG.structuralConfidence,
    );

    expect(calls).toBe(1);
    expect(outcome.contents.get('t-1')!.provenance).toBe('llm');
  });

  it('both attempts return unparseable output (no exception): loop still bounds at 2 calls, then falls back', async () => {
    let calls = 0;
    const outcome = await produceContentBatchLLM(
      [{ task: t1, positional }],
      async () => {
        calls++;
        return 'not json at all';
      },
      CONFIG.structuralConfidence,
    );

    expect(calls).toBe(2);
    expect(outcome.contents.get('t-1')!.provenance).toBe('structural');
    expect(outcome.fallbacks[0]?.reason).toBe('no LLM entry for task');
  });
});
