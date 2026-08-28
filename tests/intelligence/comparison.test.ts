import { describe, expect, expectTypeOf, it } from 'vitest';

import { buildAlarmAnalyzerPrompt } from '../../src/intelligence/alarm-prompt.js';
import {
  GAP_DIMENSIONS,
  RELATIVE_CLASSIFICATIONS,
  classifyRelativePosition,
  compareSignal,
  type RelativeClassification,
} from '../../src/intelligence/comparison.js';
import {
  identifyCompetitor,
  KNOWN_COMPETITORS,
} from '../../src/intelligence/competitor-universe.js';
import { evaluateSignificance } from '../../src/intelligence/significance-gate.js';
import { translateCompetitorTerm } from '../../src/intelligence/terminology.js';

describe('comparison kernel', () => {
  it('keeps the five relative classes closed and reports all eight dimensions separately', () => {
    expect(RELATIVE_CLASSIFICATIONS).toEqual([
      'AHEAD',
      'PARITY',
      'BEHIND',
      'DIFFERENT_APPROACH',
      'NOT_APPLICABLE',
    ]);
    expectTypeOf<RelativeClassification>().toEqualTypeOf<
      (typeof RELATIVE_CLASSIFICATIONS)[number]
    >();

    const report = comparison({ distribution: 'New bundled channel.' });
    expect(report.dimensions.map(({ dimension }) => dimension)).toEqual(
      GAP_DIMENSIONS,
    );
    expect(report.dimensions).toHaveLength(8);
    expect(report.dimensions.find((item) => item.dimension === 'distribution'))
      .toMatchObject({ affected: true, implication: 'New bundled channel.' });
    expect(report.dimensions.find((item) => item.dimension === 'trust'))
      .toMatchObject({ affected: false, classification: 'NOT_APPLICABLE' });
    expect(report).not.toHaveProperty('score');
  });

  it('classifies maturity and non-rankable cases deterministically', () => {
    expect(classifyRelativePosition('LIVE_PROVEN', 'LIVE_PARTIAL')).toBe('AHEAD');
    expect(classifyRelativePosition('LIVE_PARTIAL', 'LIVE_PARTIAL')).toBe('PARITY');
    expect(classifyRelativePosition('ROADMAP', 'LIVE_PROVEN')).toBe('BEHIND');
    expect(classifyRelativePosition('LIVE_PROVEN', 'LIVE_PROVEN', {
      differentApproach: true,
    })).toBe('DIFFERENT_APPROACH');
    expect(classifyRelativePosition('LIVE_PROVEN', 'LIVE_PROVEN', {
      applicable: false,
    })).toBe('NOT_APPLICABLE');
  });

  it('separates distribution, enterprise economics, and protocol implications', () => {
    const report = comparison({
      distribution: 'Bundled in an existing developer channel.',
      'enterprise-economics': 'Changes organization procurement economics.',
      'protocol/interop': 'Introduces a new interoperable protocol surface.',
    });
    expect(report.dimensions.filter(({ affected }) => affected)).toEqual([
      expect.objectContaining({ dimension: 'distribution', implication: expect.stringContaining('channel') }),
      expect.objectContaining({ dimension: 'enterprise-economics', implication: expect.stringContaining('procurement') }),
      expect.objectContaining({ dimension: 'protocol/interop', implication: expect.stringContaining('protocol') }),
    ]);
  });

  it('suppresses DAG catch-up and unchanged positions but admits real movement', () => {
    const report = comparison({ capability: 'Competitor reached proven orchestration.' });
    expect(evaluateSignificance({
      comparison: report,
      previousByDimension: { capability: 'AHEAD' },
      baselineStatus: 'LIVE_PROVEN',
      dagCatchUp: true,
    })).toMatchObject({ kind: 'suppressed', reason: 'DAG_CATCH_UP' });
    expect(evaluateSignificance({
      comparison: report,
      previousByDimension: { capability: 'AHEAD' },
      baselineStatus: 'LIVE_PROVEN',
    })).toMatchObject({ kind: 'suppressed', reason: 'NO_POSITION_CHANGE' });
    expect(evaluateSignificance({
      comparison: report,
      previousByDimension: { capability: 'PARITY' },
      baselineStatus: 'LIVE_PROVEN',
    })).toEqual({ kind: 'material', changedDimensions: ['capability'] });
  });

  it('preserves unknown entrants and unmapped terms as typed seams', () => {
    expect(KNOWN_COMPETITORS).toContain('openai-codex');
    expect(identifyCompetitor('openai-codex')).toEqual({
      kind: 'known', competitorId: 'openai-codex',
    });
    expect(identifyCompetitor('new-lab')).toEqual({
      kind: 'unknown-entrant', observedName: 'new-lab',
    });
    expect(translateCompetitorTerm('agent teams')).toEqual({
      kind: 'mapped', sourceTerm: 'agent teams', primitives: ['Mission', 'WorkItem'],
    });
    expect(translateCompetitorTerm('quantum swarm')).toEqual({
      kind: 'unmapped', sourceTerm: 'quantum swarm',
    });
  });

  it('builds an English evidence-bound prompt without score-like numbers', () => {
    const prompt = buildAlarmAnalyzerPrompt(
      comparison({ 'protocol/interop': 'Adds an interoperable transport.' }),
    );
    expect(prompt).toContain('Overall relative class: AHEAD');
    expect(prompt).toContain('Evidence references:\n- evidence/release-note.md');
    expect(prompt).not.toMatch(/\bscore\b/i);
    expect(prompt).not.toMatch(/\b\d+(?:\.\d+)?\s*%/);
    expect(prompt).not.toMatch(/\b\d+(?:\.\d+)?\s*\/\s*\d+\b/);
  });
});

function comparison(dimensions: Parameters<typeof compareSignal>[0]['dimensions']) {
  return compareSignal({
    signalId: 'signal-alpha',
    baselineStatus: 'LIVE_PROVEN',
    competitorStatus: 'LIVE_PARTIAL',
    evidenceRefs: ['evidence/release-note.md'],
    dimensions,
  });
}
