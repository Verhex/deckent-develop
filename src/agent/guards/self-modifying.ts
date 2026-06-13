// src/agent/guards/self-modifying.ts
// ═══ Self-modifying guard (SP-1 §8, ADR-039) ════════════════════════════════
// When the native agent runs INSIDE the deckent repo and a tool would write to
// deckent's own source, elevate the permission tier to the always-floor so the
// write is never silently auto-approved (a bug could corrupt the running agent).
// It does NOT block — it forces a confirm. In a user's own project, editing
// their src is normal, so this never fires (detectDeckentRepo gates it).

import { detectDeckentRepo, DECKENT_SOURCE_PATTERNS } from '../../orchestra/self-modifying-detector.js';

export interface SelfModVerdict {
  /** true → loop forces tier='always' (floor → ask) for this tool call. */
  elevated: boolean;
  reason: string;
}

export function checkSelfModifying(cwd: string, writeTargets: string[]): SelfModVerdict {
  if (writeTargets.length === 0 || !detectDeckentRepo(cwd)) return { elevated: false, reason: '' };
  const hit = writeTargets.find((p) => {
    const n = p.trim();
    return n.length > 0 && DECKENT_SOURCE_PATTERNS.some((pat) => n.startsWith(pat));
  });
  return hit ? { elevated: true, reason: `write targets deckent source: ${hit}` } : { elevated: false, reason: '' };
}
