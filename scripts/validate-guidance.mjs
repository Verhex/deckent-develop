#!/usr/bin/env node
// scripts/validate-guidance.mjs <agent-dir>
//
// Validates the persona-guidance marker grammar (U4 — PCOMP-8) inside <agent-dir>/PROMPT.md:
//   - grammar issues: unknown intent key, duplicate same-intent markers, unclosed markers
//   - every parsed slice is MIN_SLICE_LINES-MAX_SLICE_LINES non-empty lines
//   - a `default` slice exists
//
// Mirrors (does NOT import — dependency-free .mjs, same rationale documented in
// scripts/lint-manifests.mjs: `npm run lint` never runs `npm run build` first, so `dist/`
// cannot be assumed available at lint/validate time) the exact parse logic of
// `parseGuidanceSections` in src/core/persona-guidance.ts. Kept in sync by hand — if the
// marker grammar or ALL_INTENT_TYPES (src/core/routing-types.ts) changes, update both.
//
// Usage: node scripts/validate-guidance.mjs <agent-dir>
// Exit: 0 = clean, 1 = violations found, 2 = usage/read error.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ALL_INTENT_TYPES = [
  'implementation', 'bugfix', 'refactor', 'documentation',
  'security', 'devops', 'config', 'performance', 'design', 'migration', 'architecture', 'unknown',
];
const KNOWN_KEYS = new Set([...ALL_INTENT_TYPES, 'default']);
const MARKER_PATTERN = /<!--\s*guidance:([a-z][a-z0-9_-]*?)-(start|end)\s*-->/g;
const MIN_SLICE_LINES = 5;
const MAX_SLICE_LINES = 15;

function scanMarkers(text) {
  const markers = [];
  const pattern = new RegExp(MARKER_PATTERN.source, 'g');
  let m;
  while ((m = pattern.exec(text)) !== null) {
    markers.push({ key: m[1], kind: m[2], index: m.index, markerEnd: m.index + m[0].length });
  }
  return markers;
}

function parseGuidanceSections(text) {
  const sections = new Map();
  const issues = [];
  const allMarkers = scanMarkers(text);
  const byKey = new Map();
  for (const marker of allMarkers) {
    const bucket = byKey.get(marker.key);
    if (bucket) bucket.push(marker);
    else byKey.set(marker.key, [marker]);
  }

  // Captures validated for cross-key overlap after every key's bucket is processed — see
  // src/core/persona-guidance.ts parseGuidanceSections for the rationale (kept in sync by hand).
  const captures = [];

  for (const [key, marks] of byKey) {
    if (!KNOWN_KEYS.has(key)) {
      issues.push(`unknown intent key "${key}" in guidance marker — ignored`);
      continue;
    }

    let open = null;
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

  return { sections, issues };
}

function main() {
  const agentDir = process.argv[2];
  if (!agentDir) {
    console.error('[validate-guidance] usage: node scripts/validate-guidance.mjs <agent-dir>');
    process.exit(2);
    return;
  }

  const promptPath = join(agentDir, 'PROMPT.md');
  if (!existsSync(promptPath)) {
    console.error(`[validate-guidance] PROMPT.md not found: ${promptPath}`);
    process.exit(2);
    return;
  }

  let text;
  try {
    text = readFileSync(promptPath, 'utf8');
  } catch (err) {
    console.error(`[validate-guidance] failed to read ${promptPath}: ${err.message}`);
    process.exit(2);
    return;
  }

  const { sections, issues } = parseGuidanceSections(text);
  const violations = issues.map(i => `grammar: ${i}`);

  for (const [key, slice] of sections) {
    const nonEmptyLines = slice.split('\n').filter(l => l.trim().length > 0);
    if (nonEmptyLines.length < MIN_SLICE_LINES || nonEmptyLines.length > MAX_SLICE_LINES) {
      violations.push(
        `slice "${key}" has ${nonEmptyLines.length} non-empty lines — must be ${MIN_SLICE_LINES}-${MAX_SLICE_LINES}`,
      );
    }
  }

  if (!sections.has('default')) {
    violations.push('missing required "default" guidance slice');
  }

  if (violations.length > 0) {
    console.error(`[validate-guidance] ${promptPath}: ${violations.length} violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
    return;
  }

  console.log(`[validate-guidance] ${promptPath}: clean (${sections.size} slice(s), 0 violations)`);
  process.exit(0);
}

main();
