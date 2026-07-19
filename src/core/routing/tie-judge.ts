// ─── RoutingEngineV3 — K3 TIE-JUDGE (581-kalibrasyon, Alperen-onaylı hibrit) ──
// Yalnız GERÇEK ε-tie'da devreye giren LLM-yargıcı: deterministik sıralama iki
// (veya daha çok) adayı TIE_EPSILON içinde eşitlediğinde, top-K tie-kümesi
// yetenek-kartlarıyla modele sunulur ve TEK kazanan seçtirilir. Low-confidence
// eskalasyonlarına ASLA karışmaz (K2 kararı: floor bilinçli 0.6'da, kalan
// belirsizlik content-doygunluk diliminin işi). Her hata-modu FAIL-OPEN:
// yargıç yok / cevap bozuk / küme-dışı seçim / exception → deterministik top-1
// aynen kalır. Yargıç-çözümü decision.provenance='ai' ile işaretlenir; tie
// eskalasyonu journal'da KALIR (tie'ın yaşandığı gerçeği silinmez).

import type { CompleteFn } from './content-llm.js';
import type { RequirementVector } from './requirement-vector.js';
import type { ScoredCandidate } from './decision-types.js';
import type { CapabilityVector } from './capability-vector.js';
import { debugLog } from '../utils.js';

export interface TieJudgeVerdict {
  agentId: string;
  rationale: string;
}

/** Injectable judge seam — production default wraps a CompleteFn (LLM). */
export type TieJudgeFn = (
  requirement: RequirementVector,
  tieSet: readonly ScoredCandidate[],
  capabilities: ReadonlyMap<string, CapabilityVector>,
) => Promise<TieJudgeVerdict | null>;

/** Model-facing prompt (EN — PCOMP-8 U3 language unification). */
export function buildTieJudgePrompt(
  requirement: RequirementVector,
  tieSet: readonly ScoredCandidate[],
  capabilities: ReadonlyMap<string, CapabilityVector>,
): string {
  const req = [
    `workType: ${requirement.content.workType}`,
    `domains: ${requirement.positional.domains.map((d) => d.id).join(', ') || '-'}`,
    `deliverables: ${requirement.positional.deliverables.map((d) => `${d.type}:${d.ratio.toFixed(2)}`).join(', ') || '-'}`,
    `surfaces: ${requirement.positional.surfaces.join(', ') || '-'}`,
    `effort: ${requirement.numerical.effortClass} · size: ${requirement.numerical.estimatedSize} · risk: ${requirement.numerical.riskClass}`,
  ].join('\n');

  const cards = tieSet.map((c) => {
    const cap = capabilities.get(c.agentId);
    const workTypes = cap?.content.workTypes.map((w) => `${w.type}:${w.proficiency}`).join(', ') ?? '-';
    const domains = cap?.positional.domains.map((d) => `${d.id}:${d.proficiency}`).join(', ') ?? '-';
    const expertise = cap?.content.expertise.slice(0, 8).join(', ') ?? '-';
    return `- ${c.agentId} (score ${c.finalScore.toFixed(3)})\n  workTypes: ${workTypes}\n  domains: ${domains}\n  expertise: ${expertise}`;
  }).join('\n');

  return [
    'You are a routing tie-judge. The deterministic ranking produced an exact tie between the candidate agents below for one task. Pick the SINGLE best-fitting agent.',
    'Rules:',
    '- You MUST pick one of the listed candidate ids — nothing else.',
    '- Judge by capability fit to the requirement, not by name similarity.',
    '- Answer with JSON ONLY: {"agentId": "<one of the candidates>", "rationale": "<one sentence>"}',
    '',
    'REQUIREMENT:',
    req,
    '',
    'CANDIDATES (tied):',
    cards,
  ].join('\n');
}

/** Strict parse: JSON with an allowed agentId, else null (fail-open). */
export function parseTieJudgeVerdict(raw: string, allowedIds: ReadonlySet<string>): TieJudgeVerdict | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { agentId?: unknown; rationale?: unknown };
    if (typeof parsed.agentId !== 'string' || !allowedIds.has(parsed.agentId)) return null;
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 500) : '';
    return { agentId: parsed.agentId, rationale };
  } catch {
    return null;
  }
}

/** Production judge: one LLM call over the tie-set; every failure → null. */
export function makeCompleteTieJudge(complete: CompleteFn): TieJudgeFn {
  return async (requirement, tieSet, capabilities) => {
    try {
      const raw = await complete(buildTieJudgePrompt(requirement, tieSet, capabilities));
      return parseTieJudgeVerdict(raw, new Set(tieSet.map((c) => c.agentId)));
    } catch (e) {
      debugLog('tieJudge:complete', e);
      return null;
    }
  };
}
