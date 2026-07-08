// src/agent/guards/self-modifying.ts
// ═══ Self-modifying guard (SP-1 §8, ADR-039) ════════════════════════════════
// When the native agent runs INSIDE the deckent repo and a tool would write to
// deckent's own source, elevate the permission tier to the always-floor so the
// write is never silently auto-approved (a bug could corrupt the running agent).
// It does NOT block — it forces a confirm. In a user's own project, editing
// their src is normal, so this never fires (detectDeckentRepo gates it).

import { resolve, relative, sep } from 'node:path';
import { detectDeckentRepo, DECKENT_SOURCE_PATTERNS } from '../../orchestra/self-modifying-detector.js';

export interface SelfModVerdict {
  /** true → loop forces tier='always' (floor → ask) for this tool call. */
  elevated: boolean;
  reason: string;
}

/**
 * Normalize a raw write-target to a cwd-relative, forward-slash form so an
 * absolute or `./`-prefixed variant of the same path compares equal to the
 * relative DECKENT_SOURCE_PATTERNS prefixes (ADR-039 bypass fix — a raw
 * string startsWith() missed absolute-path variants of a blocked target).
 */
function toRepoRelative(cwd: string, target: string): string {
  const abs = resolve(cwd, target);
  return relative(cwd, abs).split(sep).join('/');
}

export function checkSelfModifying(cwd: string, writeTargets: string[]): SelfModVerdict {
  if (writeTargets.length === 0 || !detectDeckentRepo(cwd)) return { elevated: false, reason: '' };
  const hit = writeTargets.find((p) => {
    const n = p.trim();
    if (n.length === 0) return false;
    const rel = toRepoRelative(cwd, n);
    return DECKENT_SOURCE_PATTERNS.some((pat) => rel.startsWith(pat));
  });
  return hit ? { elevated: true, reason: `write targets deckent source: ${hit}` } : { elevated: false, reason: '' };
}
