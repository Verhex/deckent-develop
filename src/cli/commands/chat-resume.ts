// ═══ chat-resume — REPL /resume render + target resolution ═══════════════════
//
// Pure helpers for the REPL `/resume` command (chat-native.ts loop caller):
//   - renderSessionList: a numbered picker of recent chat sessions
//   - resolveResumeTarget: map a /resume arg (number from the last list, or a
//     literal session id) to a concrete session id
//   - renderResumedHistory: a readable block of the resumed conversation
//
// i18n-first (getMessage) and dependency-free (no chat-native import → no
// cycle), so it is unit-testable without the loop or the Ink stack.

import type { ChatSessionSummary } from '../../core/memory-types.js';
import { getMessage } from '../helpers/messages.js';

/** Minimal turn shape — matches both ChatTurn and ChatMemoryAdapter.getChatHistory. */
interface ResumeTurn { role: string; content: string }

/** Max characters of a turn's content shown in the resumed-history block. */
const TURN_PREVIEW_MAX = 200;

/** Render a numbered list of recent chat sessions for the /resume picker. */
export function renderSessionList(sessions: readonly ChatSessionSummary[], lang: string): string {
  if (sessions.length === 0) return getMessage('tui.resume_none', lang);
  const lines: string[] = [getMessage('tui.resume_list_header', lang)];
  sessions.forEach((s, i) => {
    const count = getMessage('tui.resume_turn_count', lang, { count: String(s.turnCount) });
    const when = shortTime(s.lastAt);
    const label = s.preview.length > 0 ? s.preview : s.sessionId;
    lines.push(`  ${i + 1}. ${label}  ·  ${count}  ·  ${when}`);
  });
  lines.push(getMessage('tui.resume_hint', lang));
  return lines.join('\n');
}

/**
 * Resolve a /resume argument to a session id.
 *
 * A bare positive integer N selects the Nth entry of the most recently shown
 * list (1-based); anything else is treated as a literal session id. Returns
 * null when a numeric index is out of range.
 */
export function resolveResumeTarget(
  arg: string,
  sessions: readonly ChatSessionSummary[],
): string | null {
  const trimmed = arg.trim();
  if (/^\d+$/.test(trimmed)) {
    const idx = Number.parseInt(trimmed, 10) - 1;
    const hit = sessions[idx];
    return hit ? hit.sessionId : null;
  }
  return trimmed.length > 0 ? trimmed : null;
}

/** Render the resumed conversation as a readable block (user `›` / assistant `‹`). */
export function renderResumedHistory(
  sessionId: string,
  turns: readonly ResumeTurn[],
  lang: string,
): string {
  if (turns.length === 0) {
    return getMessage('tui.resume_not_found', lang, { session: sessionId });
  }
  const header = getMessage('tui.resume_loaded', lang, {
    session: sessionId,
    count: String(turns.length),
  });
  const lines: string[] = [header];
  for (const turn of turns) {
    const prefix = turn.role === 'user' ? '›' : '‹';
    const body = turn.content.length > TURN_PREVIEW_MAX
      ? `${turn.content.slice(0, TURN_PREVIEW_MAX - 1)}…`
      : turn.content;
    lines.push(`  ${prefix} ${body.replace(/\n+/g, ' ')}`);
  }
  return lines.join('\n');
}

/** Compact a timestamp to `YYYY-MM-DD HH:MM`; falls back to the raw value. */
function shortTime(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : iso;
}
