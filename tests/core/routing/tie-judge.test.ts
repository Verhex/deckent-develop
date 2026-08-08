// ─── K3 TIE-JUDGE pinleri (581-kalibrasyon, Alperen-onaylı hibrit) ──────────
// Yargıç YALNIZ gerçek ε-tie'da konuşur; her hata-modu fail-open; çözüm
// provenance='ai' ile işaretlenir, tie-eskalasyonu journal'da kalır.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { routeTaskV3 } from '../../../src/core/routing/route-task-v3.js';
import type { RouteCatalog, RoutableTask } from '../../../src/core/routing/route-task-v3.js';
import { TIE_EPSILON } from '../../../src/core/routing/stage-rank.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../../src/core/routing/config.js';
import { validateCapabilities } from '../../../src/core/routing/capability-vector.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';
import { buildTieJudgePrompt, parseTieJudgeVerdict, makeCompleteTieJudge } from '../../../src/core/routing/tie-judge.js';
import type { TieJudgeFn } from '../../../src/core/routing/tie-judge.js';

const BUILTIN_AGENTS_DIR = join(process.cwd(), 'src/core/builtins/agents');

function loadRealCatalog(): RouteCatalog {
  const agents: RouteCatalog['agents'][number][] = [];
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

// 443-natural sınıfı gerçek katalogda deterministik bir kazanan üretir; tie'ı
// SENTETİK kurmak için kazanan ikilinin skorlarını eşitleyen bir yol yerine,
// aynı capabilities'i iki farklı agentId ile klonlarız — birebir eş vektör =
// garanti ε-tie (skorlar bit-eş), tie-break agentId-leksikografik.
function makeTieCatalog(): { catalog: RouteCatalog; a: string; b: string } {
  const real = loadRealCatalog();
  const donor = real.agents.find((x) => x.agentId === 'implementer')!;
  const a = 'aaa-clone';
  const b = 'bbb-clone';
  const catalog: RouteCatalog = {
    ...real,
    agents: [
      { agentId: a, capabilities: donor.capabilities, source: 'builtin' },
      { agentId: b, capabilities: donor.capabilities, source: 'builtin' },
    ],
  };
  return { catalog, a, b };
}

// KN1: the harness task must carry a REAL positional signal (api domain via
// the src/api/** path pattern + 'endpoint' alias) — a zero-signal tie now
// deliberately skips the judge, and these pins cover the INFORMED arm.
const task = (): RoutableTask => ({
  id: 'tie-1',
  title: 'Build the widget endpoint',
  description: 'Implement the REST endpoint for the widget module.',
  scope: { directories: ['src/api/'], filesRead: [], filesWrite: ['src/api/widget-endpoint.ts'] },
} as RoutableTask);

const CONFIG = DEFAULT_ROUTING_V3_CONFIG;

describe('K3 tie-judge — engine integration', () => {
  it('judge picks the runner-up: winner flips, provenance=ai, tie escalation preserved', async () => {
    const { catalog, a, b } = makeTieCatalog();
    const judge: TieJudgeFn = async (_r, tieSet) => ({ agentId: tieSet[1]!.agentId, rationale: 'test pick' });
    const d = await routeTaskV3(task(), catalog, { config: CONFIG, tieJudge: judge });
    expect(d.agentId).toBe(b); // deterministik top-1 leksikografik a'ydı
    expect(d.provenance).toBe('ai');
    expect(d.escalation?.reason).toBe('tie');
    expect(d.ranked[0]?.agentId).toBe(b);
    expect(Math.abs(d.ranked[0]!.finalScore - d.ranked[1]!.finalScore)).toBeLessThan(TIE_EPSILON);
    void a;
  });

  it('judge confirms deterministic top-1: winner stays, provenance=ai', async () => {
    const { catalog, a } = makeTieCatalog();
    const judge: TieJudgeFn = async (_r, tieSet) => ({ agentId: tieSet[0]!.agentId, rationale: 'confirm' });
    const d = await routeTaskV3(task(), catalog, { config: CONFIG, tieJudge: judge });
    expect(d.agentId).toBe(a);
    expect(d.provenance).toBe('ai');
  });

  it('fail-open: judge throws → deterministic winner + provenance=deterministic', async () => {
    const { catalog, a } = makeTieCatalog();
    const judge: TieJudgeFn = async () => { throw new Error('provider down'); };
    const d = await routeTaskV3(task(), catalog, { config: CONFIG, tieJudge: judge });
    expect(d.agentId).toBe(a);
    expect(d.provenance).toBe('deterministic');
    expect(d.escalation?.reason).toBe('tie');
  });

  it('fail-open: out-of-set / null verdicts keep the deterministic winner', async () => {
    const { catalog, a } = makeTieCatalog();
    for (const judge of [
      (async () => ({ agentId: 'not-in-set', rationale: 'x' })) as unknown as TieJudgeFn,
      (async () => null) as TieJudgeFn,
    ]) {
      const d = await routeTaskV3(task(), catalog, { config: CONFIG, tieJudge: judge });
      expect(d.agentId).toBe(a);
      expect(d.provenance).toBe('deterministic');
    }
  });

  it('no tie → judge is NEVER called (real catalog, clear winner)', async () => {
    let called = 0;
    const judge: TieJudgeFn = async () => { called++; return null; };
    const d = await routeTaskV3(task(), loadRealCatalog(), { config: CONFIG, tieJudge: judge });
    expect(d.escalation?.reason ?? 'none').not.toBe('tie');
    expect(called).toBe(0);
    expect(d.provenance).toBe('deterministic');
  });

  it("governanceMode 'deterministic' silences the judge even on a real tie", async () => {
    const { catalog, a } = makeTieCatalog();
    let called = 0;
    const judge: TieJudgeFn = async () => { called++; return null; };
    const d = await routeTaskV3(task(), catalog, {
      config: { ...CONFIG, governanceMode: 'deterministic' },
      tieJudge: judge,
    });
    expect(called).toBe(0);
    expect(d.agentId).toBe(a);
  });
});

describe('KN1 — zero-signal tie skips the judge (GR-2026-08-08-DOGFOOD-KN1-01)', () => {
  // The EXACT task shape the 2026-08-07 cold-start smoke measured: domains [],
  // surfaces [], deliverables [code-src@1.0] — six agents tied @1.000 and the
  // judge burned a real provider call per task with nothing to discriminate on.
  const zeroSignalTask = (): RoutableTask => ({
    id: '001-002',
    title: 'Add `greetLoud(name)` to src/greet.js returning the uppercase greeting.',
    description: 'Add `greetLoud(name)` to src/greet.js returning the uppercase greeting.',
    scope: { directories: [], filesRead: ['src/greet.js'], filesWrite: ['src/greet.js'] },
  } as RoutableTask);

  it('judge is NOT called; deterministic top-1 stays; tie escalation stays journaled', async () => {
    const real = loadRealCatalog();
    let judgeCalls = 0;
    const judge: TieJudgeFn = async (_r, tieSet) => {
      judgeCalls += 1;
      return { agentId: tieSet[tieSet.length - 1]!.agentId, rationale: 'noise' };
    };
    const d = await routeTaskV3(zeroSignalTask(), real, { config: CONFIG, tieJudge: judge });
    expect(judgeCalls).toBe(0);
    expect(d.provenance).toBe('deterministic');
    // The tie FACT is not erased — K3's journal contract survives the skip.
    expect(d.escalation?.reason).toBe('tie');
  });

  it('the same tie WITH a domain signal still consults the judge (informed arm intact)', async () => {
    const { catalog } = makeTieCatalog();
    let judgeCalls = 0;
    const judge: TieJudgeFn = async () => { judgeCalls += 1; return null; };
    await routeTaskV3(task(), catalog, { config: CONFIG, tieJudge: judge });
    expect(judgeCalls).toBe(1);
  });

  it('a single code-src deliverable alone is NOT a discriminating signal (tautology rule)', async () => {
    // Same zero-signal shape but through the cloned-tie catalog, proving the
    // skip is driven by the requirement, not by which agents happen to tie.
    const { catalog } = makeTieCatalog();
    let judgeCalls = 0;
    const judge: TieJudgeFn = async () => { judgeCalls += 1; return null; };
    const d = await routeTaskV3(zeroSignalTask(), catalog, { config: CONFIG, tieJudge: judge });
    expect(judgeCalls).toBe(0);
    expect(d.provenance).toBe('deterministic');
  });
});

describe('K3 tie-judge — prompt + parse (pure)', () => {
  it('prompt names every tied candidate and demands JSON-only', async () => {
    const { catalog, a, b } = makeTieCatalog();
    const d = await routeTaskV3(task(), catalog, { config: CONFIG });
    const caps = new Map(catalog.agents.map((x) => [x.agentId, x.capabilities]));
    const prompt = buildTieJudgePrompt(
      { content: { workType: 'build', subtype: null, summary: null, semanticTags: null, provenance: 'structural', calibratedConfidence: 0.7 },
        positional: { domains: [], deliverables: [], surfaces: [], needsWrite: true, language: 'en' },
        numerical: { estimatedSize: 'medium', fileCount: 1, moduleCount: 1, effortClass: 'normal', riskClass: 'medium' } } as never,
      d.ranked.slice(0, 2),
      caps,
    );
    expect(prompt).toContain(a);
    expect(prompt).toContain(b);
    expect(prompt).toContain('JSON ONLY');
  });

  it('parse: valid pick passes; garbage / out-of-set / non-JSON → null', () => {
    const allowed = new Set(['x', 'y']);
    expect(parseTieJudgeVerdict('{"agentId":"y","rationale":"fits"}', allowed)).toEqual({ agentId: 'y', rationale: 'fits' });
    expect(parseTieJudgeVerdict('prose around {"agentId":"x","rationale":"r"} more prose', allowed)?.agentId).toBe('x');
    expect(parseTieJudgeVerdict('{"agentId":"z","rationale":"r"}', allowed)).toBeNull();
    expect(parseTieJudgeVerdict('not json at all', allowed)).toBeNull();
    expect(parseTieJudgeVerdict('{"rationale":"no id"}', allowed)).toBeNull();
  });

  it('makeCompleteTieJudge: complete-fn failure → null (never throws)', async () => {
    const judge = makeCompleteTieJudge(async () => { throw new Error('llm down'); });
    const verdict = await judge(
      {} as never,
      [{ agentId: 'x', finalScore: 0.5, axisScores: { content: { score: 0.5, evidence: [] }, positional: { score: 0.5, evidence: [] }, numerical: { score: 0.5, evidence: [] } } }],
      new Map(),
    );
    expect(verdict).toBeNull();
  });
});
