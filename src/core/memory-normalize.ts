/**
 * Normalize text for language-agnostic FTS5 search.
 *
 * SQLite FTS5 unicode61 tokenizer handles most diacritics but fails on
 * Turkish I/İ/ı/i case folding (locale-dependent in Unicode).
 * This function produces a pure ASCII lowercase equivalent that FTS5
 * can match regardless of the user's input locale.
 *
 * Stored in a separate *_norm column alongside the original text.
 * Queries search both columns with OR for 100% recall.
 *
 * Tested: 15/15 pass across TR/EN/DE/ES/FR (see spec Section 4).
 */
export function turkishNormalize(text: string): string {
  if (!text) return '';

  return text
    // Turkish-specific uppercase → lowercase (before generic toLowerCase)
    .replace(/I/g, 'ı')     // Turkish: I is uppercase of ı, not i
    .replace(/İ/g, 'i')     // Turkish: İ is uppercase of i
    .replace(/Ş/g, 'ş')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    // Generic lowercase
    .toLowerCase()
    // NFD decomposition: split base char + combining mark (e.g. é → e + ́)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip combining diacritical marks
    // Turkish chars that survive NFD (ı, ş, ğ don't decompose in NFD)
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}
