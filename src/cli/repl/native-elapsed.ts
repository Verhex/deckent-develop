// src/cli/repl/native-elapsed.ts
// ═══ Native turn-elapsed (SP-1 M4) ══════════════════════════════════════════
// Builds the native branch's onTurnEnd so the footer shows a real duration
// (M3 left it 0). Pure + injectable clock for hermetic tests.

export interface NativeTurnStats { outputTokens?: number; }
export interface FooterStat { elapsedMs: number; tokens?: number; }

export function measuredOnTurnEnd(
  startMs: number,
  now: () => number,
  sink: (s: FooterStat) => void,
): (s: NativeTurnStats) => void {
  return (s) => {
    const tokens = s.outputTokens;
    sink({ elapsedMs: now() - startMs, ...(tokens !== undefined ? { tokens } : {}) });
  };
}
