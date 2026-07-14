/**
 * Persona Guidance Parser & Slice Selector (U4 — PCOMP-8)
 *
 * Parses author-pinned `<!-- guidance:<intent>-start --> … <!-- guidance:<intent>-end -->`
 * sections out of an agent PROMPT.md body, where `<intent>` is one of `ALL_INTENT_TYPES`
 * (src/core/routing-types.ts) or the literal `default`. `selectGuidanceSlice` then resolves
 * the slice for a task's routing intent via the fallback chain: exact intent → default →
 * full body. Mirrors the marker-extraction idiom of `extractMarkedSlice`
 * (src/orchestra/adr-selector.ts) — same comment-marker grammar shape, generalized here to
 * many keyed sections per document instead of one fixed pair.
 *
 * Pure, no I/O. Never throws — malformed markers are fail-soft: the offending section is
 * ignored and the reason is appended to `issues`, per ADR-G-027 (no truncation of WHAT,
 * only of HOW — a worker never gets less guidance than the full body would have given it).
 */

import { ALL_INTENT_TYPES } from './routing-types.js';

export interface GuidanceParseResult {
  /** intent key (or `'default'`) -> trimmed slice content between its markers. */
  sections: ReadonlyMap<string, string>;
  /** Human-readable fail-soft diagnostics: unknown keys, duplicates, unclosed markers. */
  issues: string[];
  /** F1 (blast-radius fix): source-text spans (start-marker → end-marker, inclusive) of the
   *  VALIDLY captured blocks — exactly the keys present in `sections`. `personaCoreBody`
   *  removes these spans for the full-render transport; malformed/dropped blocks are NOT
   *  listed (fail-soft: text that isn't a valid guidance block is never silently deleted). */
  captures: ReadonlyArray<{ key: string; from: number; to: number }>;
}

export type GuidanceSource = 'intent' | 'default' | 'full-body';

export interface GuidanceSelection {
  slice: string;
  source: GuidanceSource;
}

const GUIDANCE_KNOWN_KEYS: ReadonlySet<string> = new Set<string>([...ALL_INTENT_TYPES, 'default']);

const GUIDANCE_MARKER_PATTERN = /<!--\s*guidance:([a-z][a-z0-9_-]*?)-(start|end)\s*-->/g;

interface GuidanceMarker {
  key: string;
  kind: 'start' | 'end';
  /** Index of the marker's first character in the source text. */
  index: number;
  /** Index just past the marker's last character (`-->`). */
  markerEnd: number;
}

function scanMarkers(text: string): GuidanceMarker[] {
  const markers: GuidanceMarker[] = [];
  // Fresh RegExp instance per scan — GUIDANCE_MARKER_PATTERN is a module-level `g` regex and
  // reusing it directly across calls would carry stale `lastIndex` state between invocations.
  const pattern = new RegExp(GUIDANCE_MARKER_PATTERN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    markers.push({
      key: m[1]!,
      kind: m[2] as 'start' | 'end',
      index: m.index,
      markerEnd: m.index + m[0].length,
    });
  }
  return markers;
}

/**
 * Parse all `guidance:<key>-start/end` sections out of a PROMPT.md body.
 *
 * Edge policies (U4 spec §3), all fail-soft — never throws:
 * - Unknown key (not in ALL_INTENT_TYPES ∪ {'default'}) → whole key ignored, one issue.
 * - Duplicate closed pairs for the same key → first pair's content wins; each extra
 *   start/end marker is reported.
 * - Unclosed marker (a start with no matching end, or an end with no preceding start) →
 *   that section is dropped; the reason is reported. A later, properly-closed pair for the
 *   same key still gets captured (best-effort recovery).
 * - No markers at all → empty sections map, no issues (caller falls back to full body).
 * - Overlapping/interleaved pairs across two different keys (e.g. `A-start B-start A-end
 *   B-end` — a plausible authoring slip the grammar doesn't otherwise forbid) → both
 *   entangled sections are dropped and reported. Without this check the naive
 *   `text.slice(open.markerEnd, marker.index)` extraction would silently capture the OTHER
 *   key's raw marker comment as literal slice content — corrupted output with no diagnostic,
 *   the one case the fail-soft contract must not allow through silently.
 */
export function parseGuidanceSections(promptMd: string): GuidanceParseResult {
  const sections = new Map<string, string>();
  const issues: string[] = [];
  const text = typeof promptMd === 'string' ? promptMd : '';
  if (!text) return { sections, issues, captures: [] };

  const allMarkers = scanMarkers(text);
  const byKey = new Map<string, GuidanceMarker[]>();
  for (const marker of allMarkers) {
    const bucket = byKey.get(marker.key);
    if (bucket) bucket.push(marker);
    else byKey.set(marker.key, [marker]);
  }

  // Captured (key, start, end) triples, validated for cross-key overlap once every key's
  // bucket has been processed — overlap detection needs the full marker set, not just the
  // current key's own bucket.
  const captures: Array<{ key: string; start: GuidanceMarker; end: GuidanceMarker }> = [];

  for (const [key, marks] of byKey) {
    if (!GUIDANCE_KNOWN_KEYS.has(key)) {
      issues.push(`unknown intent key "${key}" in guidance marker — ignored`);
      continue;
    }

    let open: GuidanceMarker | null = null;
    let captured = false;

    for (const marker of marks) {
      if (marker.kind === 'start') {
        if (captured) {
          issues.push(`duplicate guidance marker for intent "${key}" — first occurrence kept`);
          continue;
        }
        if (open) {
          issues.push(
            `unclosed guidance marker for intent "${key}" (start with no matching end) — section ignored`,
          );
        }
        open = marker;
        continue;
      }

      // end marker
      if (open) {
        sections.set(key, text.slice(open.markerEnd, marker.index).trim());
        captures.push({ key, start: open, end: marker });
        captured = true;
        open = null;
      } else if (!captured) {
        issues.push(
          `unclosed guidance marker for intent "${key}" (end with no matching start) — ignored`,
        );
      } else {
        issues.push(`duplicate guidance marker for intent "${key}" — first occurrence kept`);
      }
    }

    if (open && !captured) {
      issues.push(
        `unclosed guidance marker for intent "${key}" (start with no matching end) — section ignored`,
      );
    }
  }

  for (const { key, start, end } of captures) {
    const intruder = allMarkers.find(
      m => m !== start && m !== end && m.index > start.markerEnd && m.index < end.index,
    );
    if (intruder) {
      issues.push(
        `overlapping guidance marker inside intent "${key}" section (interleaved with intent "${intruder.key}") — section ignored`,
      );
      sections.delete(key);
    }
  }

  const validCaptures = captures
    .filter(c => sections.has(c.key))
    .map(c => ({ key: c.key, from: c.start.index, to: c.end.markerEnd }));

  return { sections, issues, captures: validCaptures };
}

// ─── Core-body extraction (F1 — full-render transport hygiene) ─────────────────

const GUIDANCE_SLICES_HEADING_RE = /^[ \t]*## Guidance Slices[ \t]*$/m;

/**
 * The persona body WITHOUT its guidance blocks — the correct FULL-render transport.
 *
 * F1 (sprint-443 blast-radius fix): guidance slices are distilled COPIES of the body
 * (the U4 content contract). Rendering the raw file in 'full' mode after U4 would ship
 * body + all slices = pure duplication, GROWING every prompt by the very bytes U4 exists
 * to save — and the AGSK-6 cap amendment had made that growth invisible. This function
 * restores the pre-U4 transport: valid marker blocks are removed, a `## Guidance Slices`
 * heading left with no content is dropped, leftover blank runs collapse.
 *
 * Contracts:
 * - No valid guidance blocks → the input is returned UNCHANGED (byte-identical legacy).
 * - Malformed/dropped blocks are NOT removed (fail-soft: never silently delete text that
 *   isn't a valid guidance block).
 * - ADR-G-027: the caller pairs a stripped render with a `[full persona: …]` pointer, so
 *   the full source stays one pointer away — access is never reduced.
 */
export function personaCoreBody(promptMd: string): string {
  const text = typeof promptMd === 'string' ? promptMd : '';
  const { captures } = parseGuidanceSections(text);
  if (captures.length === 0) return text;

  let out = '';
  let cursor = 0;
  for (const c of [...captures].sort((a, b) => a.from - b.from)) {
    if (c.from > cursor) out += text.slice(cursor, c.from);
    cursor = Math.max(cursor, c.to);
  }
  out += text.slice(cursor);

  // Content-task convention: slices live under a trailing '## Guidance Slices' heading —
  // once its blocks are gone the heading (and any now-orphaned slice sub-headings that were
  // whitespace-only remainders) carries no content; cut it. A heading with REAL remaining
  // content after it stays (fail-soft).
  const heading = GUIDANCE_SLICES_HEADING_RE.exec(out);
  if (heading && out.slice(heading.index + heading[0].length).trim() === '') {
    out = out.slice(0, heading.index);
  }

  return out.replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * Select the guidance slice for a task's routing intent, falling back to `default` and then
 * the full PROMPT.md body. Deterministic per `(promptMd, intent)`; never mutates `promptMd`.
 *
 * `intent` is looked up as a plain map key — it need not be a validated `IntentType` member.
 * An unrecognized or `'unknown'` intent (missing taskDNA) simply has no matching section and
 * falls through to `'default'` (or `'full-body'` if no default section exists either), which
 * is the same fallback every other unmatched intent takes.
 */
export function selectGuidanceSlice(promptMd: string, intent: string): GuidanceSelection {
  const text = typeof promptMd === 'string' ? promptMd : '';
  const { sections } = parseGuidanceSections(text);

  const intentSlice = sections.get(intent);
  if (intentSlice !== undefined) return { slice: intentSlice, source: 'intent' };

  const defaultSlice = sections.get('default');
  if (defaultSlice !== undefined) return { slice: defaultSlice, source: 'default' };

  return { slice: text, source: 'full-body' };
}
