export const KNOWN_COMPETITORS = [
  'anthropic-claude-code',
  'google-gemini-cli',
  'openai-codex',
  'github-copilot',
  'cursor',
  'devin',
  'openhands',
] as const;

export type KnownCompetitorId = (typeof KNOWN_COMPETITORS)[number];

export type Competitor =
  | { kind: 'known'; competitorId: KnownCompetitorId }
  | { kind: 'unknown-entrant'; observedName: string };

/** Preserve an unrecognised actor as evidence instead of silently dropping it. */
export function identifyCompetitor(observedName: string): Competitor {
  if (isKnownCompetitor(observedName)) {
    return { kind: 'known', competitorId: observedName };
  }
  return { kind: 'unknown-entrant', observedName };
}

export function isKnownCompetitor(value: string): value is KnownCompetitorId {
  return (KNOWN_COMPETITORS as readonly string[]).includes(value);
}
