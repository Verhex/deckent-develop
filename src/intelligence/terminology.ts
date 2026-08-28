export const DECKENT_PRIMITIVES = [
  'Goal',
  'Mission',
  'Flow',
  'Run',
  'WorkItem',
  'Attempt',
  'Operation',
] as const;

export type DeckentPrimitive = (typeof DECKENT_PRIMITIVES)[number];

const TERMINOLOGY = {
  'agent teams': ['Mission', 'WorkItem'],
  task: ['WorkItem'],
  tasks: ['WorkItem'],
  workflow: ['Flow'],
  workflows: ['Flow'],
  session: ['Run'],
  sessions: ['Run'],
  retry: ['Attempt'],
  retries: ['Attempt'],
  'tool call': ['Operation'],
  'tool calls': ['Operation'],
  objective: ['Goal'],
  objectives: ['Goal'],
} as const satisfies Record<string, readonly DeckentPrimitive[]>;

export type TerminologyTranslation =
  | {
      kind: 'mapped';
      sourceTerm: string;
      primitives: readonly DeckentPrimitive[];
    }
  | { kind: 'unmapped'; sourceTerm: string };

/** Mapping is deliberately explicit: fuzzy guesses would corrupt comparisons. */
export function translateCompetitorTerm(sourceTerm: string): TerminologyTranslation {
  const normalized = sourceTerm.trim().toLocaleLowerCase('en-US');
  const primitives = TERMINOLOGY[normalized as keyof typeof TERMINOLOGY];
  return primitives === undefined
    ? { kind: 'unmapped', sourceTerm }
    : { kind: 'mapped', sourceTerm, primitives };
}
