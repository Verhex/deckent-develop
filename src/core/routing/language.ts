// ─── RoutingEngine — TR/EN language heuristic ────────────────────────────────
// Moved verbatim from the retired V2 routing-engine.ts (WM-7, Sprint 355-008)
// during the S3 cut-over: the requirement-vector's positional axis is its one
// live consumer. Dependency-free, conservative — a confident TR/EN split, not
// language identification.

export type HeuristicLanguage = 'tr' | 'en' | 'unknown';

/** TR-specific letters absent from standard English orthography. Deliberately
 *  excludes plain ASCII 'I'/'i' (ambiguous with English) — only the dotted/dotless
 *  and diacritic forms unique to Turkish are counted. */
const TR_SPECIFIC_CHARS = /[çğıİöşüÇĞÖŞÜ]/;

/** Below this word count, the ratio has no statistical meaning — 'unknown'. */
const LANGUAGE_DETECT_MIN_WORDS = 3;

/** Ratio of TR-charactered words to total words at/above which text is
 *  confidently classified Turkish. Conservative — plain English text scores ~0
 *  because none of its words carry a Turkish-specific letter. */
const TR_WORD_RATIO_THRESHOLD = 0.08;

/**
 * The ratio of words containing at least one TR-specific character to total
 * words. Turkish's suffix morphology means a real Turkish sentence of any
 * reasonable length reliably contains several such words; plain English text
 * scores ~0. Too few words or a below-threshold ratio returns 'unknown'/'en'
 * rather than guessing.
 */
export function detectHeuristicLanguage(text: string): HeuristicLanguage {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < LANGUAGE_DETECT_MIN_WORDS) return 'unknown';
  const trWordCount = words.filter(w => TR_SPECIFIC_CHARS.test(w)).length;
  return trWordCount / words.length >= TR_WORD_RATIO_THRESHOLD ? 'tr' : 'en';
}
