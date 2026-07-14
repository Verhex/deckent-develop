/**
 * word-match.ts — PCOMP-8 U1 (G1): the SINGLE word-boundary matcher shared by
 * every keyword-scoring surface (intent-classifier, prompt-token-optimizer).
 *
 * Root evidence (A1-İz#2, 2026-07-14): raw `String.includes` classified
 * sprint-442's event-sourcing tasks as `devops` because the keyword 'ci'
 * matched INSIDE the Turkish word "içindeki" and 'cd' matched inside a
 * flowId hex ("1cd42609…"). A term only counts when delimited by string
 * edges or non-alphanumeric characters.
 */
export function containsWord(text: string, term: string): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}
