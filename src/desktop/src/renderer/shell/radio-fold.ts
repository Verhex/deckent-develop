/**
 * DT-1 «Telsiz» — the PURE transcript fold (no react, no DOM, no transport):
 * how operator/deckent lines accumulate as the SSE frames land. Kept out of
 * Telsiz.tsx so the node-env desktop suite pins it WITHOUT evaluating
 * react-aria-components (the exact at-ref.ts pure-core pattern).
 */

export interface RadioMessage {
  role: 'operator' | 'deckent';
  text: string;
  /** true while the deckent side is still streaming. */
  pending?: boolean;
  /** terminal error marker — the text carries the honest message. */
  failed?: boolean;
}

/** Operator transmits: their line + an empty pending deckent line. */
export function radioSend(list: readonly RadioMessage[], operatorText: string): RadioMessage[] {
  return [...list, { role: 'operator', text: operatorText }, { role: 'deckent', text: '', pending: true }];
}

/** A stream chunk lands on the LAST pending deckent line (no-op otherwise). */
export function radioChunk(list: readonly RadioMessage[], text: string): RadioMessage[] {
  const last = list[list.length - 1];
  if (!last || last.role !== 'deckent' || last.pending !== true) return [...list];
  return [...list.slice(0, -1), { ...last, text: last.text + text }];
}

/** Terminal `done` — the full reply is authoritative (covers send-only adapters). */
export function radioDone(list: readonly RadioMessage[], reply: string): RadioMessage[] {
  const last = list[list.length - 1];
  if (!last || last.role !== 'deckent' || last.pending !== true) return [...list];
  return [...list.slice(0, -1), { role: 'deckent', text: reply.length > 0 ? reply : last.text }];
}

/** Terminal `error` — the pending line becomes an honest failure line. */
export function radioError(list: readonly RadioMessage[], message: string): RadioMessage[] {
  const last = list[list.length - 1];
  if (!last || last.role !== 'deckent' || last.pending !== true) {
    return [...list, { role: 'deckent', text: message, failed: true }];
  }
  return [...list.slice(0, -1), { role: 'deckent', text: message, failed: true }];
}


// ─── 588/F0c — kalıcı-telsiz (profil-anahtarlı localStorage) ────────────────

/** Persist cap — a transcript is a working memory, not an archive. */
export const RADIO_PERSIST_CAP = 400;

export function serializeRadio(list: readonly RadioMessage[]): string {
  return JSON.stringify(list.slice(-RADIO_PERSIST_CAP));
}

/** Tolerant parse: garbage → []; a persisted `pending` line is DROPPED —
 *  a reload cannot resume a dead stream, pretending otherwise would lie. */
export function parseRadio(raw: string | null): RadioMessage[] {
  if (raw === null || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RadioMessage[] = [];
    for (const entry of parsed) {
      const m = entry as { role?: unknown; text?: unknown; failed?: unknown; pending?: unknown };
      if ((m.role === 'operator' || m.role === 'deckent') && typeof m.text === 'string' && m.pending !== true) {
        out.push({ role: m.role, text: m.text, ...(m.failed === true ? { failed: true } : {}) });
      }
    }
    return out;
  } catch {
    return [];
  }
}
