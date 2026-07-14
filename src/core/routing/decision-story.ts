// ─── RoutingEngineV3 — DECISION STORY (human-readable WHY) ───────────────────
// Slice-1 (hand-coded, Brain 2026-07-14). Detail-doc §3 stage-5 + MASTER-PLAN
// #582 WORKER-LIVE-LOG contract: every decision carries a structured story —
// ≤80-char short-form lines (live feed rows) + message-KEY + params (CLI and
// desktop render through i18n; model-surface serialization stays EN).

import type {
  AxisScores,
  BrainEscalation,
  DecisionStory,
  EliminatedCandidate,
  StoryStep,
} from './decision-types.js';
import type { Indecision } from './stage-rank.js';
import type { VerifierViolation } from './verifier.js';

const MAX_LINE = 80;

function clip(line: string): string {
  return line.length <= MAX_LINE ? line : `${line.slice(0, MAX_LINE - 1)}…`;
}

export interface StoryTrace {
  taskLabel: string;
  workType: string;
  domains: readonly string[];
  candidateCount: number;
  eliminated: readonly EliminatedCandidate[];
  verifierDrops: ReadonlyArray<{ agentId: string; violations: readonly VerifierViolation[] }>;
  winner: { agentId: string; finalScore: number; axisScores: AxisScores } | null;
  runnerUp: { agentId: string; finalScore: number } | null;
  confidence: number;
  indecision: Indecision | null;
  escalation: BrainEscalation | null;
  provenance: 'deterministic' | 'ai';
}

/** Which axis carried the winner — the decisive-axis clause of the summary. */
function decisiveAxis(axisScores: AxisScores): 'content' | 'positional' | 'numerical' {
  const entries = [
    ['content', axisScores.content.score],
    ['positional', axisScores.positional.score],
    ['numerical', axisScores.numerical.score],
  ] as const;
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}

/** Build the structured story from a pipeline trace. Pure. */
export function buildStory(trace: StoryTrace): DecisionStory {
  const steps: StoryStep[] = [];

  steps.push({
    stage: 'vectorize',
    line: clip(`req: ${trace.workType} × [${trace.domains.join(',')}]`),
    messageKey: 'routing.story.vectorize',
    detail: { workType: trace.workType, domains: trace.domains, provenance: trace.provenance },
  });

  steps.push({
    stage: 'eliminate',
    line: clip(`candidates ${trace.candidateCount} → ${trace.candidateCount - trace.eliminated.length} (${trace.eliminated.length} out)`),
    messageKey: 'routing.story.eliminate',
    detail: { total: trace.candidateCount, eliminated: trace.eliminated.length },
  });

  if (trace.verifierDrops.length > 0) {
    steps.push({
      stage: 'verify',
      line: clip(`verifier dropped ${trace.verifierDrops.length}: ${trace.verifierDrops.map((d) => d.agentId).join(',')}`),
      messageKey: 'routing.story.verifierDrops',
      detail: {
        drops: trace.verifierDrops.map((d) => ({
          agentId: d.agentId,
          codes: d.violations.map((v) => v.code),
          policyIds: d.violations.map((v) => v.policyId).filter(Boolean),
        })),
      },
    });
  }

  if (trace.winner) {
    const axis = decisiveAxis(trace.winner.axisScores);
    steps.push({
      stage: 'rank',
      line: clip(`top ${trace.winner.agentId} ${trace.winner.finalScore.toFixed(2)}${trace.runnerUp ? ` (next ${trace.runnerUp.agentId} ${trace.runnerUp.finalScore.toFixed(2)})` : ''}`),
      messageKey: 'routing.story.rank',
      detail: {
        winner: trace.winner.agentId,
        finalScore: trace.winner.finalScore,
        runnerUp: trace.runnerUp,
        decisiveAxis: axis,
      },
    });
  }

  const decideLine = trace.escalation
    ? `escalated to Brain: ${trace.escalation.reason}`
    : trace.winner
      ? `${trace.winner.agentId} selected @ confidence ${trace.confidence.toFixed(2)}`
      : 'no decision';
  steps.push({
    stage: 'decide',
    line: clip(decideLine),
    messageKey: trace.escalation ? 'routing.story.escalated' : 'routing.story.decided',
    detail: {
      escalation: trace.escalation?.reason ?? null,
      confidence: trace.confidence,
      indecision: trace.indecision,
    },
  });

  const summary = trace.escalation
    ? `Escalated to Brain (${trace.escalation.reason}) for ${trace.workType} work over [${trace.domains.join(', ')}].`
    : trace.winner
      ? `${trace.winner.agentId} wins ${trace.workType} work on the ${decisiveAxis(trace.winner.axisScores)} axis (score ${trace.winner.finalScore.toFixed(2)}, confidence ${trace.confidence.toFixed(2)}).`
      : `No candidate for ${trace.workType} work over [${trace.domains.join(', ')}].`;

  return {
    summary,
    steps,
    eliminated: [...trace.eliminated],
  };
}
