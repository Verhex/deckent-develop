// WM-7 (sprint-355-008) — task/agent-prompt language-mismatch penalty, config-gated
// via RoutingOptions.languagePenalty (default-off). Mirrors the getKindAffinityBonus
// (PCOMP-W5C) / getRoleMismatchPenalty (PCOMP-W5) pattern: additive, non-exclusionary,
// pure signal that only tips ties/close calls — never a hard exclusion.

import { describe, it, expect } from 'vitest';
import {
  routeTaskV2,
  detectHeuristicLanguage,
  getLanguageMismatchPenalty,
  AGENT_LANGUAGE_MISMATCH_PENALTY,
} from '../../src/core/routing-engine.js';
import type { AgentDefinition, AgentPool } from '../../src/core/agent-types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';
import type { ActivationConfig } from '../../src/core/routing-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgent(opts: {
  id: string;
  activation?: ActivationConfig;
  description?: string;
  systemPrompt?: string;
}): AgentDefinition {
  const base = createAgentDefinition({
    id: opts.id,
    name: opts.id,
    description: opts.description ?? '',
    systemPrompt: opts.systemPrompt ?? '',
  });
  return opts.activation ? ({ ...base, activation: opts.activation } as AgentDefinition) : base;
}

function makePool(...agents: AgentDefinition[]): AgentPool {
  return new Map(agents.map(a => [a.id, a]));
}

function makeSkillPool(): Map<string, SkillDefinition> {
  return new Map();
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TR_TASK = {
  title: 'Görev ve ajan arasında dil uyuşmazlığı düzeltmesi',
  description:
    'Görev metninin dili ile ajanın kişilik metninin dili birbirini tutmadığında ' +
    'küçük bir yönlendirme cezası uygulanır, böylece seçim daha isabetli olur.',
  scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/routing-engine.ts'] },
  type: 'code-development' as const,
};

const EN_PERSONA = {
  description: 'An English-speaking software engineering agent focused on implementation tasks.',
  systemPrompt:
    'You are a software architect agent. You design robust systems, review architecture ' +
    'decisions, and document technical tradeoffs in clear English prose.',
};

const TR_PERSONA = {
  description: 'Türkçe konuşan, uygulama görevlerine odaklanan bir yazılım mühendisliği ajanı.',
  systemPrompt:
    'Sen bir yazılım mimarı ajanısın. Sağlam sistemler tasarlar, mimari kararları gözden ' +
    'geçirir ve teknik ödünleşimleri açık bir dille belgelersin.',
};

const IMPL_RULE = (score: number): ActivationConfig => ({
  rules: [{ when: { 'intent.primary': 'implementation' }, score }],
  exclude: [],
  minScore: 5,
});

// ─── Unit: detectHeuristicLanguage ──────────────────────────────────────────

describe('WM-7: detectHeuristicLanguage', () => {
  it('classifies a Turkish sentence as tr', () => {
    expect(detectHeuristicLanguage(TR_TASK.title + ' ' + TR_TASK.description)).toBe('tr');
  });

  it('classifies an English sentence as en', () => {
    expect(detectHeuristicLanguage(EN_PERSONA.description + ' ' + EN_PERSONA.systemPrompt)).toBe('en');
  });

  it('returns unknown below the minimum word count', () => {
    expect(detectHeuristicLanguage('Fix bug')).toBe('unknown');
    expect(detectHeuristicLanguage('düzelt')).toBe('unknown');
  });

  it('returns unknown for empty text', () => {
    expect(detectHeuristicLanguage('')).toBe('unknown');
    expect(detectHeuristicLanguage('   ')).toBe('unknown');
  });

  it('classifies three TR-charactered words as tr', () => {
    expect(detectHeuristicLanguage('değiştir düzelt gözden geçir')).toBe('tr');
  });

  it('classifies three plain-ASCII words as en', () => {
    expect(detectHeuristicLanguage('fix this bug please')).toBe('en');
  });
});

// ─── Unit: getLanguageMismatchPenalty ───────────────────────────────────────

describe('WM-7: getLanguageMismatchPenalty', () => {
  it('penalizes a confident tr/en mismatch, either direction', () => {
    expect(getLanguageMismatchPenalty('tr', 'en')).toBe(AGENT_LANGUAGE_MISMATCH_PENALTY);
    expect(getLanguageMismatchPenalty('tr', 'en')).toBe(-1);
    expect(getLanguageMismatchPenalty('en', 'tr')).toBe(-1);
  });

  it('has no opinion when both languages match', () => {
    expect(getLanguageMismatchPenalty('tr', 'tr')).toBe(0);
    expect(getLanguageMismatchPenalty('en', 'en')).toBe(0);
  });

  it('has no opinion when either side is unknown', () => {
    expect(getLanguageMismatchPenalty('unknown', 'en')).toBe(0);
    expect(getLanguageMismatchPenalty('en', 'unknown')).toBe(0);
    expect(getLanguageMismatchPenalty('tr', 'unknown')).toBe(0);
    expect(getLanguageMismatchPenalty('unknown', 'tr')).toBe(0);
    expect(getLanguageMismatchPenalty('unknown', 'unknown')).toBe(0);
  });
});

// ─── Flag-off: byte-identical routing ────────────────────────────────────────

describe('routing-v2: languagePenalty flag-off (byte-identical)', () => {
  it('omitted option === explicit false, even on a TR-task/EN-agent mismatch', () => {
    const agent = makeAgent({ id: 'agent-en', activation: IMPL_RULE(8), ...EN_PERSONA });

    const resultDefault = routeTaskV2(TR_TASK, makePool(agent), makeSkillPool());
    const resultExplicitOff = routeTaskV2(TR_TASK, makePool(agent), makeSkillPool(), {
      languagePenalty: false,
    });

    expect(resultDefault.agentId).toBe(resultExplicitOff.agentId);
    expect(resultDefault.agentScore).toBe(resultExplicitOff.agentScore);
    expect(resultDefault.reasoning).toEqual(resultExplicitOff.reasoning);
  });

  it('flag-off never emits a language-mismatch reasoning line, mismatch or not', () => {
    const agent = makeAgent({ id: 'agent-en', activation: IMPL_RULE(8), ...EN_PERSONA });

    const result = routeTaskV2(TR_TASK, makePool(agent), makeSkillPool());

    expect(result.agentId).toBe('agent-en');
    expect(result.agentScore).toBe(8);
    expect(result.reasoning.some(r => r.includes('language-mismatch'))).toBe(false);
  });
});

// ─── Flag-on: fixture-pool behavior ──────────────────────────────────────────

describe('routing-v2: languagePenalty flag-on', () => {
  it('TR-task + EN-only-agent: agentScore drops by exactly 1 (fixture)', () => {
    const agent = makeAgent({ id: 'agent-en', activation: IMPL_RULE(8), ...EN_PERSONA });

    const resultOff = routeTaskV2(TR_TASK, makePool(agent), makeSkillPool(), { languagePenalty: false });
    const resultOn = routeTaskV2(TR_TASK, makePool(agent), makeSkillPool(), { languagePenalty: true });

    expect(resultOff.agentId).toBe('agent-en');
    expect(resultOff.agentScore).toBe(8);
    expect(resultOn.agentId).toBe('agent-en');
    expect(resultOn.agentScore).toBe(7);
    expect(
      resultOn.reasoning.some(r =>
        r.includes("Agent 'agent-en' language-mismatch penalty: -1 (taskLanguage=tr, agentLanguage=en)"),
      ),
    ).toBe(true);
  });

  it('TR-task: penalty flips the winner from the EN-persona agent to the TR-persona agent', () => {
    // agent-en(8) > agent-tr(7.5) pre-penalty. Flag-off: agent-en wins outright.
    // Flag-on: agent-en's mismatch penalty (8-1=7) drops it below the
    // language-matched agent-tr (7.5+0=7.5) — a clean flip.
    const agentEn = makeAgent({ id: 'agent-en', activation: IMPL_RULE(8), ...EN_PERSONA });
    const agentTr = makeAgent({ id: 'agent-tr', activation: IMPL_RULE(7.5), ...TR_PERSONA });

    const resultOff = routeTaskV2(TR_TASK, makePool(agentEn, agentTr), makeSkillPool(), {
      languagePenalty: false,
    });
    const resultOn = routeTaskV2(TR_TASK, makePool(agentEn, agentTr), makeSkillPool(), {
      languagePenalty: true,
    });

    expect(resultOff.agentId).toBe('agent-en');
    expect(resultOn.agentId).toBe('agent-tr');
    expect(resultOn.agentScore).toBe(7.5);
    expect(resultOn.reasoning.some(r => r.includes("Agent 'agent-en' language-mismatch penalty: -1"))).toBe(true);
  });

  it('never penalizes when task and agent language both match', () => {
    const agentTr = makeAgent({ id: 'agent-tr', activation: IMPL_RULE(8), ...TR_PERSONA });

    const resultOff = routeTaskV2(TR_TASK, makePool(agentTr), makeSkillPool(), { languagePenalty: false });
    const resultOn = routeTaskV2(TR_TASK, makePool(agentTr), makeSkillPool(), { languagePenalty: true });

    expect(resultOn.agentScore).toBe(resultOff.agentScore);
    expect(resultOn.reasoning.some(r => r.includes('language-mismatch'))).toBe(false);
  });

  it('has no opinion when the task text is too short to classify (unknown)', () => {
    const agent = makeAgent({ id: 'agent-en', activation: IMPL_RULE(8), ...EN_PERSONA });
    const shortTask = {
      title: 'Fix',
      description: 'X',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/x.ts'] },
      type: 'code-development' as const,
    };

    const resultOff = routeTaskV2(shortTask, makePool(agent), makeSkillPool(), { languagePenalty: false });
    const resultOn = routeTaskV2(shortTask, makePool(agent), makeSkillPool(), { languagePenalty: true });

    expect(resultOn.agentScore).toBe(resultOff.agentScore);
    expect(resultOn.reasoning.some(r => r.includes('language-mismatch'))).toBe(false);
  });
});
