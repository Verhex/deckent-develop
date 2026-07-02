// ═══ Ink REPL App (Sprint 224 — native TUI via React-for-CLI) ════════════════
//
// Why Ink: the hand-rolled raw-ANSI TUI could not deliver native feel (multi-line
// overwrite, broken queue, cursor drift). Ink's full-frame reconciler owns the
// render — completed turns live in <Static> (rendered once, scroll naturally),
// the streaming reply + a persistent status anchor live below, and the input is
// the LAST element so it is ALWAYS pinned at the bottom. claude-code uses the
// same base. Engine vs view: runChatNativeLoop stays the engine; this App drives
// it via an input iterator + output callback and renders the state. String-free:
// all user-facing labels arrive via props (getMessage resolved by the caller).

import { Box, Text, Static, useInput, useApp } from 'ink';
import { useState, useRef, useEffect, Component, type ReactElement, type ReactNode } from 'react';
import { homedir } from 'node:os';
import { runChatNativeLoop, type ChatProviderAdapter, type McpToolDispatcher, type ChatMemoryAdapter } from '../commands/chat-native.js';
import { renderMarkdown } from '../commands/chat-render.js';
import { InputBar } from './input-bar.js';
import type { SlashRegistry } from '../commands/chat-slash-registry.js';
import type { ActiveSelection } from './provider-switch.js';
import { createStreamSegmenter, type StreamSegmenter } from './stream-segmenter.js';
import { measuredOnTurnEnd } from './native-elapsed.js';
import { buildLiveFooter, type LiveFooterState } from '../helpers/live-footer.js';
import { initialTermModeState, applyModeCommand, type TermMode, type TermModeState } from './term-mode.js';
import { createChatTurnQueue, type ChatTurnQueue, type ChatTurnBgEvent, type ChatTurnPayload } from './chat-turn-queue.js';
import { listRecentSessions, pickSession, type SessionRecord } from '../helpers/session-resume.js';
import {
  initialBusyControlsState, markBusy, markIdle, parseBusyCommand,
  resolveQueueCommand, applyInterrupt, applySteer,
  type BusyControlsState, type QueueStatusDecision, type InterruptDecision, type SteerDecision,
} from './busy-controls.js';
import { ApprovalCard, createApprovalCardQueue, type ApprovalCardLabels, type ApprovalCardQueue } from './approval-card.js';
import { composeDualStream } from './dual-stream.js';
import type { ApprovalTerminalChannel } from './approval-terminal-channel.js';
import type { ApprovalStreamEvent } from '../../core/approval-eventstream.js';
import type { ApprovalRisk } from '../../core/approval-contract.js';

export type ConfirmAnswer = 'y' | 'a' | 'n';
// toolName is optional: the dispatcher passes it so an 'a' (always) decision can
// be applied to the SAME-tool remainder still waiting in the confirm queue. The
// ALWAYS-confirm tier (kill/cleanup) omits it on purpose (never auto-applies 'a').
export type ConfirmTrigger = (summary: string, toolName?: string) => Promise<ConfirmAnswer>;

/** One queued confirm request — its prompt, the tool it gates, and its resolver. */
export interface ConfirmRequest {
  summary: string;
  toolName?: string;
  resolve: (answer: ConfirmAnswer) => void;
}

/** The confirm card to render now (queue head) + its position within the burst. */
export interface ConfirmHead {
  summary: string;
  index: number;   // 1-based position of this card within the active burst
  total: number;   // total cards in the active burst (grows if more arrive mid-burst)
}

/** FIFO confirm queue (view-layer authority). */
export interface ConfirmQueue {
  /** Enqueue a request. A pending head is NEVER overwritten — the new one waits. */
  enqueue(req: ConfirmRequest): void;
  /** Answer the current head; advance to the next. Deny does NOT cancel the rest. */
  answer(answer: ConfirmAnswer): void;
  /** The card to show now, or null when the queue is empty. */
  head(): ConfirmHead | null;
  /** Pending count (including the shown head). */
  size(): number;
}

/**
 * Pure FIFO confirm queue — the fix for the H1 single-slot fragility
 * (docs/reviews/sprint-285/repl-tool-root-cause.md). The engine dispatches tool
 * calls sequentially (chat-native.ts for…of await), so in practice one confirm
 * is pending at a time; but a re-entrant/concurrent trigger used to OVERWRITE the
 * single resolver slot and orphan the first request. A queue makes both the
 * sequential and the concurrent path safe: every request is shown in arrival
 * order, none is dropped.
 *
 * String-free (i18n-first): holds no user-facing text of its own; the caller
 * passes the localized `summary`. `onChange` re-renders the head (React setState).
 */
export function createConfirmQueue(onChange: () => void): ConfirmQueue {
  const pending: ConfirmRequest[] = [];
  let answered = 0; // answered so far in the current burst (drives the [i/N] index)

  const head = (): ConfirmHead | null => {
    const h = pending[0];
    if (!h) return null;
    return { summary: h.summary, index: answered + 1, total: answered + pending.length };
  };

  const enqueue = (req: ConfirmRequest): void => {
    pending.push(req); // never overwrite a pending head — append and wait its turn
    onChange();
  };

  const answer = (a: ConfirmAnswer): void => {
    const current = pending.shift();
    if (!current) return;
    answered += 1;
    current.resolve(a);
    // "always" applies to the same-tool remainder: queued requests for the SAME
    // tool already cleared run.tsx's perms gate and won't re-check it, so resolve
    // them here with the same allow decision (claude-code "always allow" feel).
    if (a === 'a' && current.toolName) {
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i]!.toolName === current.toolName) {
          const [same] = pending.splice(i, 1);
          answered += 1;
          same!.resolve('a');
        }
      }
    }
    if (pending.length === 0) answered = 0; // burst drained → reset the counter
    onChange();
  };

  return { enqueue, answer, head, size: () => pending.length };
}

/**
 * REPL-SURFACE-WIRE (354-001) — pure, testable helpers.
 *
 * app.tsx is a mounted Ink component (no ink-testing-library dependency in
 * this repo — see tests/cli/repl-tool-multi-tag-repro.test.ts, sprint 285 —
 * so it cannot be rendered in tests). Decision logic that a follow-up test
 * needs to exercise is pulled out as plain, JSX-free exports, same pattern as
 * `createConfirmQueue` above.
 */

/** Resolve the mode-indicator label (Ask/Run/Control). English fallback until
 * a caller wires localized labels (messages round-7, Task 354-016). */
export function resolveModeLabel(mode: TermMode, labels: Pick<ReplLabels, 'modeAsk' | 'modeRun' | 'modeControl'>): string {
  if (mode === 'ask') return labels.modeAsk ?? 'Ask';
  if (mode === 'run') return labels.modeRun ?? 'Run';
  return labels.modeControl ?? 'Control';
}

/** Map drained ChatTurnPayloads (ChatTurnQueue.drainAsTurns()) to the flat
 * turn-text format the 'bg' Turn role renders — one string per payload. */
export function bgPayloadsToTurnTexts(payloads: readonly ChatTurnPayload[]): string[] {
  return payloads.map((p) => p.events.map((e) => e.summary).join('\n'));
}

/**
 * APP-SURFACE-WIRE (358-006) — pure, testable helpers for the startup
 * resume-teaser, the /resume picker (session-resume.ts), and the busy-controls
 * state machine (busy-controls.ts). Same "pull decision logic out of the Ink
 * component" pattern as the 354-001/355-011 blocks above (ink-testing-library
 * is not a project dependency — tests/cli/repl/app-surface-wire.test.tsx).
 */

/** Session entries the teaser/picker shows (both the startup teaser and the
 * bare-`/resume` list). One shared limit keeps the teaser numbering and the
 * picker numbering aligned, so "/resume 2" always picks the teaser's row 2. */
export const RESUME_RECENT_LIMIT = 5;

/** Minimal structural shape of ChatMemoryAdapter.listChatSessions results. */
interface ChatSessionSummaryLike { sessionId: string; lastAt: string; preview: string }

/** Map memory-backed chat sessions into the picker's SessionRecord shape so
 * pickSession can resolve over ONE combined list (disk sprint sessions first,
 * chat sessions after — the merge with the pre-existing loop-side /resume). */
export function chatSessionsToRecords(summaries: readonly ChatSessionSummaryLike[]): SessionRecord[] {
  return summaries.map((s) => ({
    id: s.sessionId,
    title: s.preview.length > 0 ? s.preview : s.sessionId,
    date: s.lastAt,
    status: 'chat',
  }));
}

/** Compact an ISO timestamp to `YYYY-MM-DD HH:MM`; falls back to the raw value
 * (same display rule as chat-resume.ts's private shortTime). */
function shortSessionTime(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : iso;
}

/**
 * Render the teaser/picker lines for the combined session list. Returns []
 * when BOTH lists are empty — the caller renders NOTHING then (degrade-safe:
 * a fresh checkout with no `.deckent/runtime/jobs/` shows no teaser at all).
 * Numbering is continuous across disk→chat so one number-space serves
 * `/resume <n>` for every visible row.
 */
export function buildResumePickerLines(
  disk: readonly SessionRecord[],
  chat: readonly SessionRecord[],
  labels: Pick<ReplLabels, 'resumeHeader' | 'resumeHint'>,
): string[] {
  const combined = [...disk, ...chat];
  if (combined.length === 0) return [];
  const lines: string[] = [labels.resumeHeader ?? 'Recent sessions'];
  combined.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s.title} · ${s.status} · ${shortSessionTime(s.date)}`);
  });
  lines.push(labels.resumeHint ?? 'Tip: /resume <number> to continue a session');
  return lines;
}

/** What the App should do with a `/resume` input (decided pure, applied in JSX). */
export type ResumeCommandDecision =
  | { readonly kind: 'passthrough' }
  | { readonly kind: 'list'; readonly lines: string[] }
  | { readonly kind: 'switch'; readonly sessionId: string; readonly forwardToLoop: boolean; readonly line: string }
  | { readonly kind: 'reject'; readonly line: string };

/**
 * Resolve a `/resume` input against the local picker lists, MERGING with the
 * pre-existing loop-side /resume (chat-native.ts) instead of shadowing it:
 * - no local sessions at all → 'passthrough' (loop behavior byte-identical);
 * - bare `/resume` → 'list' (the numbered picker, teaser-aligned);
 * - resolved pick → 'switch' — a chat-session pick sets forwardToLoop so the
 *   caller re-queues `/resume <id>` and the loop's REAL transcript/session
 *   switch machinery runs; a sprint-session pick switches locally;
 * - unknown literal id → 'passthrough' (the loop may know it, e.g. an older
 *   chat session beyond the picker window);
 * - numeric out-of-range / ambiguous → 'reject' — forwarding a NUMBER would
 *   let the loop resolve it against a DIFFERENT list and silently resume the
 *   wrong session, so numbers never pass through.
 */
export function resolveResumeCommand(
  arg: string,
  disk: readonly SessionRecord[],
  chat: readonly SessionRecord[],
  labels: Pick<ReplLabels, 'resumeHeader' | 'resumeHint' | 'resumeSwitched' | 'resumeNotFound' | 'resumeAmbiguous'>,
): ResumeCommandDecision {
  const combined = [...disk, ...chat];
  if (combined.length === 0) return { kind: 'passthrough' };
  const trimmed = arg.trim();
  if (trimmed.length === 0) return { kind: 'list', lines: buildResumePickerLines(disk, chat, labels) };
  const picked = pickSession(trimmed, combined);
  if (picked.kind === 'found') {
    return {
      kind: 'switch',
      sessionId: picked.session.id,
      // Same-object check is safe: `combined` holds the caller's own records.
      forwardToLoop: chat.includes(picked.session),
      line: (labels.resumeSwitched ?? 'resumed: {id}').replace('{id}', picked.session.id),
    };
  }
  if (picked.kind === 'ambiguous') {
    const ids = picked.matches.map((m) => m.id).join(' · ');
    return { kind: 'reject', line: (labels.resumeAmbiguous ?? 'ambiguous — matches: {matches}').replace('{matches}', ids) };
  }
  if (/^\d+$/.test(trimmed)) {
    return { kind: 'reject', line: (labels.resumeNotFound ?? 'session not found: {arg}').replace('{arg}', trimmed) };
  }
  return { kind: 'passthrough' };
}

/** Map a busy-controls decision to its display line (labels injected by the
 * caller; English defaults — same fallback precedent as resolveModeLabel). */
export function renderBusyDecision(
  decision: QueueStatusDecision | InterruptDecision | SteerDecision,
  labels: Pick<ReplLabels,
    'busyQueueStatus' | 'busyStateBusy' | 'busyStateIdle' | 'busyInterrupted' |
    'busyInterruptIdle' | 'busyInterruptDup' | 'busySteerQueued' | 'busySteerIdle' | 'busySteerEmpty'>,
): string {
  switch (decision.kind) {
    case 'queue-status': {
      const state = decision.busy ? (labels.busyStateBusy ?? 'busy') : (labels.busyStateIdle ?? 'idle');
      return (labels.busyQueueStatus ?? 'queue: {count} background · {state}')
        .replace('{count}', String(decision.pendingBackgroundBuckets))
        .replace('{state}', state);
    }
    case 'interrupted':
      return labels.busyInterrupted ?? 'interrupt requested — stopping after the current step';
    case 'interrupt-noop':
      return decision.reason === 'idle'
        ? (labels.busyInterruptIdle ?? 'nothing running to interrupt')
        : (labels.busyInterruptDup ?? 'interrupt already requested');
    case 'steer-queued':
      return (labels.busySteerQueued ?? 'steer note queued (#{position}) — applied at turn end')
        .replace('{position}', String(decision.position));
    case 'steer-noop':
      return decision.reason === 'idle'
        ? (labels.busySteerIdle ?? 'nothing running to steer')
        : (labels.busySteerEmpty ?? 'usage: /steer <message>');
  }
}

/** Turn-end steer drain → next-turn inputs: drained notes STEER the work, so
 * they jump ahead of the already-queued messages (FIFO among themselves).
 * Pure — the inputIter applies the result as its new pending queue. */
export function steerNotesToInputs(drained: readonly string[], pendingQueue: readonly string[]): string[] {
  return [...drained, ...pendingQueue];
}

/**
 * F11-016-STAB (360-009) — pure, testable stabilization helpers (same
 * "pull decision logic out of the Ink component" pattern as the 354-001 /
 * 355-011 / 358-006 blocks above — ink-testing-library is not a project
 * dependency, see tests/cli/repl/f11-016-stab.test.tsx).
 */

/**
 * Map a confirm-modal keypress to its ConfirmAnswer — or null when the key
 * must be IGNORED. The previous inline mapping treated EVERY key as deny
 * except lowercase y/a: an uppercase 'Y' (an emphatic approve) DENIED the
 * tool call, and stray navigation keys (arrows, Tab, mouse-wheel escape
 * sequences) or text typed for the input bar (inactive while the modal is
 * open) mowed down the whole confirm burst one card per keystroke. Only the
 * documented keys decide now: y/Y approve, a/A always-approve, n/N deny,
 * Enter/Esc deny (the hint's capital-N default — both already denied before,
 * behavior preserved); anything else keeps the card waiting.
 */
export function confirmKeyToAnswer(
  input: string,
  key: { return?: boolean; escape?: boolean; ctrl?: boolean; meta?: boolean },
): ConfirmAnswer | null {
  if (key.return || key.escape) return 'n'; // default = deny (hint shows capital N)
  if (key.ctrl || key.meta) return null;    // shortcuts/sequences never decide a card
  const ch = input.toLowerCase();
  if (ch === 'y') return 'y';
  if (ch === 'a') return 'a';
  if (ch === 'n') return 'n';
  return null; // arrows, Tab, stray/pasted text → card stays pending
}

/**
 * Build the turn(s) one completed reply segment appends: the '● deckent'
 * head exactly once per reply, then the segment. Pure — id/head bookkeeping
 * happens at the CALL site, never inside a React setState updater. The
 * previous pushSegment mutated the `headPushed`/`idRef` refs INSIDE the
 * updater; React may re-invoke an updater (batched renders), and an impure
 * one can duplicate or drop the head row. Same hazard removed from
 * pushTurn / the tool sink / the foot push (objects built before setTurns).
 */
export function buildSegmentTurns(
  headAlreadyPushed: boolean,
  nextId: number,
  markdown: string,
): { turns: Turn[]; nextId: number } {
  const turns: Turn[] = [];
  let id = nextId;
  if (!headAlreadyPushed) turns.push({ id: id++, role: 'head', text: '' });
  turns.push({ id: id++, role: 'seg', text: markdown });
  return { turns, nextId: id };
}

/** Code-point-safe queue-preview truncation. The old inline `q.slice(0, 60)`
 * counted UTF-16 code units and could bisect a surrogate pair (an emoji in a
 * queued message), leaving a lone surrogate that garbles the row. Slices
 * whole code points instead. (Fixed 60-col width is a KNOWN resize gap —
 * width-aware layout is a separate slice, see task notes.) */
export function truncateQueuePreview(text: string, max = 60): string {
  const points = [...text];
  return points.length > max ? points.slice(0, max).join('') + '…' : text;
}

/**
 * APP-APPROVAL-WIRE (355-011) — pure, testable helpers for the ApprovalCard +
 * dual-stream wiring (same "pull decision logic out of the Ink component"
 * pattern as resolveModeLabel/bgPayloadsToTurnTexts above — ink-testing-library
 * is not a project dependency, see repl-surface-wire.test.tsx / approval-card.test.tsx).
 */

/** English-default labels for ApprovalCard (string-free component; caller
 * injects labels). Messages round-8 (Task 15, MESSAGES-KEYS-4) wires real
 * en/tr keys through run.tsx and DEPENDS ON this task, so this is the same
 * fallback-until-i18n-wired precedent as resolveModeLabel's English default. */
export const DEFAULT_APPROVAL_CARD_LABELS: ApprovalCardLabels = {
  hint: '(y = approve · n = deny · a = approve similar · d = details)',
  progress: '[{index}/{total}]',
  detailsHeading: 'Details',
  noArgs: '(no arguments)',
  riskLabels: {
    none: 'NONE',
    low: 'LOW',
    medium: 'MEDIUM',
    high: 'HIGH',
    critical: 'CRITICAL',
  } satisfies Record<ApprovalRisk, string>,
};

/** Sentinel used only to reserve dual-stream "approval wants space" priority
 * below — never rendered (filtered out before the footer maps to <Text>). */
const DUAL_STREAM_APPROVAL_PLACEHOLDER = '\u0000dual-stream-approval-placeholder';

/**
 * Compress the live-footer (status) region to its dual-stream-tested min-1-line
 * floor (composeDualStream, dual-stream.ts) while an approval is pending, so
 * ApprovalCard — rendered above it — never has to compete with it for space,
 * and the footer itself never fully disappears ("footer kaybolmaz"). No
 * pending approval -> `footerLines` returned unchanged (byte-identical to the
 * pre-355-011 footer render). `height=2` deliberately does not depend on the
 * real terminal size: only composeDualStream's min-1 FLOOR behavior is used
 * here (verified for any height >= 1 by dual-stream.test.ts), not its actual
 * row budget — ApprovalCard renders its own real Ink box separately.
 */
export function resolveFooterLines(footerLines: string[], hasPendingApproval: boolean): string[] {
  if (!hasPendingApproval) return footerLines;
  const composed = composeDualStream({
    statusLines: footerLines,
    approvalLines: [DUAL_STREAM_APPROVAL_PLACEHOLDER],
    width: 4096,
    height: 2,
  });
  return composed.filter((line) => line !== DUAL_STREAM_APPROVAL_PLACEHOLDER);
}

/**
 * Tap one ApprovalTerminalChannel event stream: forwards every event to its
 * single downstream consumer (ApprovalCard's own `events` prop) UNCHANGED,
 * while also feeding a second, app.tsx-local queue purely so the App can
 * derive a `hasPendingApproval` boolean for dual-stream layout — WITHOUT a
 * second independent subscription (the channel's AsyncIterable is backed by
 * one single-consumer queue; two parallel `for await` readers would race and
 * split delivery between ApprovalCard and the App).
 */
export async function* tapApprovalEvents(
  source: AsyncIterable<ApprovalStreamEvent>,
  tracker: ApprovalCardQueue,
): AsyncGenerator<ApprovalStreamEvent> {
  for await (const event of source) {
    tracker.ingest(event);
    yield event;
  }
}

/** A completed tool action, rendered as a claude-code-style change block. The
 * caller (run.tsx) localizes `verb`/`note`; the App owns the colored layout. */
export interface ToolInfo {
  verb: string;       // localized, e.g. "dosya yazıldı"
  failed?: boolean;   // denied/cancelled/errored → render dim with ✗ (honest, no fake success)
  target: string;     // path / command
  added?: number;     // lines added → green
  removed?: number;   // lines removed → red
  note?: string;      // extra dim detail (e.g. truncated output)
}
export type ToolSink = (info: ToolInfo) => void;

/** Localized labels — injected by the caller (i18n-first; component is string-free). */
export interface ReplLabels {
  thinking: string;     // "düşünüyor…"
  generating: string;   // "üretiliyor…"
  ready: string;        // "hazır · sıra sende"
  queued: string;       // "kuyrukta"
  confirmHint: string;  // "(y = izin · a = hep izin · N = reddet)"
  confirmProgress: string; // "[{index}/{total}]" — per-card position (i18n template)
  menuHint: string;     // "↑↓ gez · Enter seç · Tab tamamla · Esc kapat"
  switched: string;     // "geçildi"
  switchUsage: string;  // "kullanım: /model <ad> · /provider <ad>"
  approvalSet: string;  // "onay modu"
  approvalUsage: string;// "kullanım: /approve suggest|auto-edit|full-auto. aktif:"
  queueCleared: string; // "kuyruk temizlendi"
  cdTo: string;         // "dizin"
  cdFail: string;       // "dizin değiştirilemedi"
  /** Mode-indicator labels (Ask/Run/Control) — REPL-SURFACE-WIRE (354-001)
   * seam; optional, English fallback until messages round-7 (Task 354-016)
   * wires en/tr keys through run.tsx. */
  modeAsk?: string;
  modeRun?: string;
  modeControl?: string;
  /** APP-SURFACE-WIRE (358-006) — resume-teaser/picker + busy-controls labels;
   * optional, English fallback until a messages round wires en/tr keys through
   * run.tsx (same seam precedent as the mode labels above). */
  resumeHeader?: string;    // "Recent sessions"
  resumeHint?: string;      // "Tip: /resume <number> to continue a session"
  resumeSwitched?: string;  // "resumed: {id}"
  resumeNotFound?: string;  // "session not found: {arg}"
  resumeAmbiguous?: string; // "ambiguous — matches: {matches}"
  busyQueueStatus?: string; // "queue: {count} background · {state}"
  busyStateBusy?: string;   // "busy"
  busyStateIdle?: string;   // "idle"
  busyInterrupted?: string; // "interrupt requested — stopping after the current step"
  busyInterruptIdle?: string; // "nothing running to interrupt"
  busyInterruptDup?: string;  // "interrupt already requested"
  busySteerQueued?: string;   // "steer note queued (#{position}) — applied at turn end"
  busySteerIdle?: string;     // "nothing running to steer"
  busySteerEmpty?: string;    // "usage: /steer <message>"
}

/**
 * Error boundary — a render error in any child shows a one-line message instead
 * of crashing the whole REPL (enterprise robustness).
 *
 * i18n (269-003): the component is string-free — the caller injects the
 * localized `label` (getMessage('tui.render_error', lang)); English default.
 */
export class ReplErrorBoundary extends Component<{ children: ReactNode; label?: string }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error): { err: Error } { return { err }; }
  override render(): ReactNode {
    if (this.state.err) return <Text color="red">{`⚠ ${this.props.label ?? 'REPL render error'}: ${this.state.err.message}`}</Text>;
    return this.props.children;
  }
}

export interface ReplAppProps {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  labels: ReplLabels;
  providerName: string;
  cwd: string;
  registerConfirm: (trigger: ConfirmTrigger) => void;
  /** Register the sink the dispatcher calls to render a tool/change block. */
  registerToolSink: (sink: ToolSink) => void;
  /** Slash command catalog for the interactive `/` menu. */
  slashRegistry: SlashRegistry;
  /** Initial model/provider selection (shown in the status bar). */
  initialSelection: ActiveSelection;
  /** Switch model/provider; returns the resulting active selection. */
  onSwitch: (sel: Partial<ActiveSelection>) => ActiveSelection;
  /** Set the agentic approval mode (suggest / auto-edit / full-auto). */
  onApprovalMode: (mode: 'suggest' | 'auto-edit' | 'full-auto') => void;
  /** Optional chat-memory adapter — persists turns and powers /resume. */
  memory?: ChatMemoryAdapter;
  /** Active chat session id (new turns append here; /resume switches it). */
  sessionId?: string;
  /** UI language for loop-emitted strings (/resume picker). */
  lang?: string;
  /** When set (native flag on), drives the turn INSTEAD of runChatNativeLoop. */
  nativeEngine?: (input: string, cbs: { output: (text: string) => void; onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void }) => Promise<void>;
  /** repl_surface.enabled config-flag seam (default-off). The caller (run.tsx)
   * resolves the real project-config flag and passes it here; absent/false →
   * this component renders byte-identical to the pre-354-001 App. */
  replSurfaceEnabled?: boolean;
  /** Live-footer state-feed seam (buildLiveFooter, helpers/live-footer.ts).
   * Polled on an interval while `replSurfaceEnabled` is true; the real
   * heartbeat/dashboard-state reader is Task 354-014 (STATE-FEED). */
  stateFeed?: () => LiveFooterState;
  /** Registers the sink used to enqueue a background-completed event.
   * Buffered by ChatTurnQueue and drained as brand-new turn(s) at turn-end —
   * NEVER injected mid-turn (Hermes rule, chat-turn-queue.ts). */
  registerBgEventSink?: (enqueue: (event: ChatTurnBgEvent) => void) => void;
  /** APP-APPROVAL-WIRE (355-011) — `repl_surface.approvals ?? false` seam,
   * resolved by the caller (run.tsx) and INDEPENDENT of `replSurfaceEnabled`
   * (a different feature landed the same sprint). Absent/false -> ApprovalCard
   * never renders and the footer/layout stays byte-identical to the
   * pre-355-011 render. */
  approvalsEnabled?: boolean;
  /** The runtime-wide-ApprovalBroker terminal bridge (createApprovalTerminalChannel,
   * approval-terminal-channel.ts, Task 355-004) — its `events`/`decide` pass
   * straight through to <ApprovalCard>. Absent -> no card, regardless of
   * `approvalsEnabled` (nothing to subscribe to). */
  approvalChannel?: ApprovalTerminalChannel;
  /** Optional label override for the approval card; defaults to
   * DEFAULT_APPROVAL_CARD_LABELS (English) until messages round-8 (Task 15,
   * MESSAGES-KEYS-4 — depends on this task) wires localized keys through run.tsx. */
  approvalLabels?: ApprovalCardLabels;
}

type ApprovalMode = 'suggest' | 'auto-edit' | 'full-auto';

interface TurnStats { elapsedMs: number; tokens?: number; }
// Streaming model: a reply is a 'head' (● deckent) then a series of 'seg' units
// (prose lines / finished code+table blocks) that flow into <Static> as they
// complete, then a 'foot' (⏱ stats). Each lands in scrollback immediately, so
// the user reads in real time and the dynamic region stays tiny (no drift).
// Exported for buildSegmentTurns' tests (360-009) — shape-only, no behavior.
export interface Turn { id: number; role: 'user' | 'head' | 'seg' | 'foot' | 'tool' | 'bg'; text: string; tool?: ToolInfo; stats?: TurnStats; }

const TEAL = '#4DB8A4';
const GOLD = '#C4A855';

/** Animated braille spinner (no extra dep). */
function Spinner(): ReactElement {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color={TEAL}>{frames[i]}</Text>;
}

function DeckentHeader(): ReactElement {
  return <Text><Text color={TEAL}>● </Text><Text color={GOLD} bold>deckent</Text></Text>;
}

function TurnView({ turn }: { turn: Turn }): ReactElement {
  if (turn.role === 'user') {
    return (
      <Box marginTop={1}>
        <Text dimColor>{'› '}</Text>
        <Text>{turn.text}</Text>
      </Box>
    );
  }
  if (turn.role === 'tool' && turn.tool) {
    const { verb, target, added, removed, note, failed } = turn.tool;
    const hasDelta = added !== undefined || removed !== undefined || note !== undefined;
    // Denied/errored action: honest dim "✗ verb target" with NO success delta —
    // never let a blocked write look like it landed (REPL-TOOL-DEBT-1).
    if (failed) {
      return (
        <Box marginTop={1}>
          <Text dimColor><Text color="red">✗ </Text>{verb}<Text dimColor> {target}</Text></Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text><Text color={TEAL}>● </Text><Text bold>{verb}</Text><Text dimColor> {target}</Text></Text>
        {hasDelta && (
          <Text>
            {'  ⎿ '}
            {added !== undefined ? <Text color="green">+{added} </Text> : null}
            {removed !== undefined ? <Text color="red">-{removed} </Text> : null}
            {note !== undefined ? <Text dimColor>{note}</Text> : null}
          </Text>
        )}
      </Box>
    );
  }
  if (turn.role === 'head') return <Box marginTop={1}><DeckentHeader /></Box>;
  if (turn.role === 'bg') {
    // Background-completed-work turn (ChatTurnQueue.drainAsTurns()) — flows in
    // as its OWN new turn, never folded into an in-flight reply.
    return (
      <Box flexDirection="column" marginTop={1}>
        {turn.text.split('\n').map((line, i) => (
          <Text key={i} dimColor><Text color={GOLD}>{'» '}</Text>{line}</Text>
        ))}
      </Box>
    );
  }
  if (turn.role === 'foot') {
    const s = turn.stats;
    return <Text dimColor>{`⏱ ${s ? (s.elapsedMs / 1000).toFixed(1) : '0'}s${s?.tokens ? ` · ${s.tokens} tok` : ''}`}</Text>;
  }
  // 'seg' — one completed reply line/block, rendered markdown, no margin (flows
  // directly under the head + previous segments).
  return <Text>{renderMarkdown(turn.text, true)}</Text>;
}

export function ReplApp(props: ReplAppProps): ReactElement {
  const { provider, dispatcher, labels, registerConfirm, registerToolSink, slashRegistry, initialSelection, onSwitch, onApprovalMode, memory, sessionId, lang, nativeEngine, replSurfaceEnabled = false, stateFeed, registerBgEventSink, approvalsEnabled = false, approvalChannel, approvalLabels } = props;
  const { exit } = useApp();
  const [selection, setSelection] = useState<ActiveSelection>(initialSelection);
  const [approval, setApproval] = useState<ApprovalMode>('suggest');
  const [cwd, setCwd] = useState(props.cwd);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState(''); // in-progress (incomplete) reply line
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false); // a turn is in progress (streaming)
  const [queued, setQueued] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmHead | null>(null);

  const [sessionTok, setSessionTok] = useState(0);
  const idRef = useRef(1);
  const lastStats = useRef<TurnStats | null>(null);
  const headPushed = useRef(false);       // ● deckent header emitted for this turn?
  const segmenter = useRef<StreamSegmenter | null>(null);
  const queue = useRef<string[]>([]);
  const wake = useRef<(() => void) | null>(null);
  // FIFO confirm queue (replaces the single-slot resolver — H1 fix). Lazy-init
  // once; onChange mirrors the head into `confirm` state so React re-renders it.
  const confirmQueue = useRef<ConfirmQueue | null>(null);
  if (confirmQueue.current === null) {
    confirmQueue.current = createConfirmQueue(() => setConfirm(confirmQueue.current!.head()));
  }
  const started = useRef(false);

  // REPL-SURFACE-WIRE (354-001) seam state — inert unless replSurfaceEnabled;
  // when it stays false (the default) none of this affects the render output.
  const [termMode, setTermMode] = useState<TermModeState>(initialTermModeState());
  const [footerLines, setFooterLines] = useState<string[]>([]);
  const bgQueue = useRef<ChatTurnQueue | null>(null);
  if (bgQueue.current === null) bgQueue.current = createChatTurnQueue();

  // APP-SURFACE-WIRE (358-006) seam state — inert unless replSurfaceEnabled.
  // recentSessions: the disk sprint-session snapshot the teaser showed (picker
  // numbering must match it). activeSessionId: /resume switches it; shown in
  // the bottom bar when it differs from the launch session. busyCtl: the
  // /queue-/interrupt-/steer state machine (ref only — no render reads it
  // directly; decision lines re-render via pushTurn).
  const recentSessions = useRef<SessionRecord[] | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(sessionId);
  const busyCtl = useRef<BusyControlsState>(initialBusyControlsState());

  // APP-APPROVAL-WIRE (355-011) seam state — inert unless approvalsEnabled AND
  // an approvalChannel is supplied; independent of replSurfaceEnabled (a
  // different feature). approvalTracker is always created (a bare, never-fed
  // queue is inert) but approvalEvents — the tapped subscription ApprovalCard
  // actually reads from — is only ever created behind the flag, so a flag-off
  // render never subscribes to anything and stays byte-identical.
  const [approvalPending, setApprovalPending] = useState(false);
  const approvalTracker = useRef<ApprovalCardQueue | null>(null);
  if (approvalTracker.current === null) {
    approvalTracker.current = createApprovalCardQueue(() => setApprovalPending(approvalTracker.current!.head() !== null));
  }
  const approvalEvents = useRef<AsyncIterable<ApprovalStreamEvent> | null>(null);
  if (approvalsEnabled && approvalChannel && approvalEvents.current === null) {
    approvalEvents.current = tapApprovalEvents(approvalChannel.events, approvalTracker.current);
  }

  // 360-009: turn objects are built BEFORE setTurns so every updater stays
  // pure (append-only) — React may re-invoke an updater, and the previous
  // inline `idRef.current++` / `headPushed.current` mutations inside it could
  // duplicate or drop rows (the '● deckent' head in particular).
  const pushTurn = (role: Turn['role'], text: string): void => {
    const turn: Turn = { id: idRef.current++, role, text };
    setTurns((t) => [...t, turn]);
  };

  // Push one completed reply segment (a line or a finished code/table block);
  // emit the '● deckent' head once per reply, before the first segment.
  const pushSegment = (markdown: string): void => {
    const built = buildSegmentTurns(headPushed.current, idRef.current, markdown);
    headPushed.current = true;
    idRef.current = built.nextId;
    setTurns((t) => [...t, ...built.turns]);
  };

  // F11-016-STAB (360-009): ONE clear routine for both clear surfaces (the
  // /clear command below + InputBar's Ctrl-L onClear — previously two drifting
  // inline copies). Also RECREATES the segmenter: the old instance still
  // buffered the pre-clear in-flight partial line / open block, so the very
  // next streamed token resurfaced pre-clear text onto the just-cleared screen
  // (output() renders `segmenter.partial()` verbatim).
  const clearScreen = (): void => {
    setTurns([]); setPartial(''); headPushed.current = false;
    segmenter.current = createStreamSegmenter((seg) => pushSegment(seg.markdown));
  };

  useEffect(() => {
    // Enqueue instead of overwriting a single slot: N tool calls = N cards, asked
    // in arrival order. The promise resolves when the queue answers this request.
    registerConfirm((summary: string, toolName?: string) => new Promise<ConfirmAnswer>((resolve) => {
      confirmQueue.current!.enqueue({ summary, resolve, ...(toolName ? { toolName } : {}) });
    }));
  }, [registerConfirm]);

  // Tool/change blocks: a completed tool action becomes a 'tool' turn in the
  // history (rendered as ● verb target / ⎿ +added -removed). Finalize any live
  // reply first so the block lands AFTER the text that requested it.
  useEffect(() => {
    registerToolSink((info: ToolInfo) => {
      segmenter.current?.flush(); setPartial(''); // commit any in-flight reply first
      const turn: Turn = { id: idRef.current++, role: 'tool', text: '', tool: info };
      setTurns((t) => [...t, turn]); // pure updater — id consumed above (360-009)
    });
  }, [registerToolSink]);

  // Live-footer state-feed seam: poll it while enabled (Task 354-014 wires the
  // real heartbeat/dashboard-state reader; this component only renders it).
  useEffect(() => {
    if (!replSurfaceEnabled || !stateFeed) { setFooterLines([]); return; }
    const tick = (): void => setFooterLines(buildLiveFooter(stateFeed()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [replSurfaceEnabled, stateFeed]);

  // Background-completed-work sink: buffered by ChatTurnQueue — never
  // injected mid-turn (drained only at turn-end, see inputIter below).
  useEffect(() => {
    if (!registerBgEventSink) return;
    registerBgEventSink((event) => bgQueue.current!.enqueueBg(event));
  }, [registerBgEventSink]);

  // APP-SURFACE-WIRE (358-006): startup resume-teaser. One disk read per mount
  // (listRecentSessions is degrade-safe: missing/unreadable jobs dir → []).
  // Renders NOTHING when the source is empty — the teaser only ever appears
  // when there are sessions to resume, and it flows into <Static> as a one-off
  // turn so it scrolls away naturally (render order untouched).
  useEffect(() => {
    if (!replSurfaceEnabled || recentSessions.current !== null) return;
    recentSessions.current = listRecentSessions(props.cwd, RESUME_RECENT_LIMIT);
    const lines = buildResumePickerLines(recentSessions.current, [], labels);
    if (lines.length > 0) pushTurn('bg', lines.join('\n'));
    // labels/props.cwd are mount-stable (run.tsx passes literals); the ref
    // guard makes this one-shot even if the deps ever re-fired.
  }, [replSurfaceEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // One segmenter for the whole session: completed lines/blocks emit into
    // <Static> immediately (flow into scrollback, readable in real time, like
    // Claude Code); the dynamic region only ever holds the in-progress partial
    // line → no tall re-render, no drift.
    segmenter.current = createStreamSegmenter((seg) => pushSegment(seg.markdown));

    const finalizeReply = (): void => {
      segmenter.current?.flush();   // emit the trailing partial line / open block
      setPartial('');
      if (headPushed.current) {     // close the reply with a stats footer
        const stats = lastStats.current ?? undefined;
        lastStats.current = null;
        headPushed.current = false;
        const foot: Turn = { id: idRef.current++, role: 'foot', text: '', ...(stats ? { stats } : {}) };
        setTurns((t) => [...t, foot]); // pure updater — id consumed above (360-009)
      }
    };

    async function* inputIter(): AsyncGenerator<string> {
      for (;;) {
        while (queue.current.length > 0) {
          const line = queue.current.shift() as string;
          setQueued([...queue.current]);
          pushTurn('user', line);
          setWorking(true);
          // 358-006: busy-controls turn-start. Unconditional on purpose — with
          // the surface flag off nothing can feed the machine (commands fall
          // through to chat), so this stays invisible; gating would only add a
          // second code path to keep in sync.
          busyCtl.current = markBusy();
          if (replSurfaceEnabled) bgQueue.current!.userTurnActive = true;
          yield line;
          finalizeReply(); // turn finished streaming → close it out
          // 358-006: turn-end steer drain (busy-controls markIdle) — the SAME
          // "never mid-turn" contract as the ChatTurnQueue drain below: notes
          // buffered while busy surface only now, re-queued ahead of pending
          // input so they steer the immediately-following turn.
          const turnEnd = markIdle(busyCtl.current);
          busyCtl.current = turnEnd.state;
          if (turnEnd.drainedSteerNotes.length > 0) {
            queue.current = steerNotesToInputs(turnEnd.drainedSteerNotes, queue.current);
            setQueued([...queue.current]);
          }
          if (replSurfaceEnabled) {
            bgQueue.current!.userTurnActive = false;
            // Drain buffered bg-completed work as brand-new turn(s) — never
            // injected mid-turn (Hermes rule; drainAsTurns() itself no-ops
            // while userTurnActive is true, so this can only fire post-turn).
            for (const text of bgPayloadsToTurnTexts(bgQueue.current!.drainAsTurns())) {
              pushTurn('bg', text);
            }
          }
          setWorking(false);
        }
        await new Promise<void>((r) => { wake.current = r; });
      }
    }

    const output = (text: string) => {
      segmenter.current?.feed(text);
      setPartial(segmenter.current?.partial() ?? '');
    };
    const onTurnEnd = (s: { elapsedMs: number; usage?: { outputTokens?: number } }) => {
      const tokens = s.usage?.outputTokens;
      lastStats.current = { elapsedMs: s.elapsedMs, ...(tokens !== undefined ? { tokens } : {}) };
      if (tokens) setSessionTok((n) => n + tokens);
    };

    if (nativeEngine) {
      void (async () => {
        for await (const line of inputIter()) {
          const startMs = Date.now();
          await nativeEngine(line, {
            output,
            onTurnEnd: measuredOnTurnEnd(startMs, () => Date.now(), (st) => {
              lastStats.current = { elapsedMs: st.elapsedMs, ...(st.tokens !== undefined ? { tokens: st.tokens } : {}) };
              const tok = st.tokens;
              if (tok) setSessionTok((n) => n + tok);
            }),
          });
        }
      })().then(() => exit()).catch(() => exit());
    } else {
      void runChatNativeLoop({
        provider,
        dispatcher,
        // The loop's built-in risky-confirm (requireConfirmIfRisky) uses readline,
        // which fights Ink's raw-mode stdin and hangs the REPL. In the Ink path,
        // confirmation is owned by the dispatcher gate (run.tsx classifyTool →
        // Ink confirm modal), so auto-approve here and let that single authority
        // ask. Read-only tools pass through; write/destructive ones still prompt.
        agenticConfirm: async () => true,
        // Chat persistence + /resume: when a memory adapter is wired, every turn
        // is saved under sessionId and /resume can list/load prior sessions.
        ...(memory ? { memory } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(lang ? { lang } : {}),
        input: inputIter(),
        // Stream tokens straight through the segmenter: completed lines/blocks flow
        // into the scrollback immediately (real-time readable — Alperen: "yukarıya
        // yazdır, beklemeyelim"); the in-progress partial line shows live + small.
        output,
        thinkingIndicator: { start: () => setBusy(true), stop: () => setBusy(false) },
        interactiveTty: true,
        layoutEnabled: false,
        gracefulErrors: true,
        onTurnEnd,
      }).then(() => exit()).catch(() => exit());
    }
  }, [provider, dispatcher, exit, nativeEngine]);

  // 358-006 interrupt canceller (busy-controls Canceller seam): no mid-turn
  // provider-abort seam exists in runChatNativeLoop/nativeEngine yet, so
  // "interrupt" honestly cancels what it CAN — the not-yet-started queued
  // inputs (true mid-turn abort is loop-side follow-up work).
  const cancelPendingInputs = (): void => { queue.current = []; setQueued([]); };

  const handleSubmit = (line: string): void => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    if (['/exit', '/quit', ':exit', ':quit'].includes(trimmed.toLowerCase())) { exit(); return; }
    if (trimmed.toLowerCase() === '/cancel') {
      pushTurn('user', trimmed);
      queue.current = []; setQueued([]);
      pushTurn('seg', labels.queueCleared);
      return;
    }
    // /clear must clear the Ink screen (history), not just the loop transcript.
    if (trimmed.toLowerCase() === '/clear') {
      clearScreen();
      return;
    }
    // /ask · /run · /control — term-mode.ts transition commands (354-001 seam).
    // Inert unless replSurfaceEnabled: keeps flag-off behavior byte-identical
    // (these strings fall through to a normal chat message, exactly as before).
    if (replSurfaceEnabled) {
      const modeCmd = trimmed.toLowerCase();
      if (modeCmd === '/ask' || modeCmd === '/run' || modeCmd === '/control') {
        pushTurn('user', trimmed);
        const result = applyModeCommand(termMode, modeCmd);
        if (result.changed) setTermMode(result.state);
        return;
      }
      // 358-006: /queue · /interrupt · /steer — busy-controls.ts dispatch.
      // Same inertness rule: flag off → these fall through to a chat message.
      const busyAction = parseBusyCommand(trimmed);
      if (busyAction.kind !== 'none') {
        pushTurn('user', trimmed);
        if (busyAction.kind === 'queue') {
          pushTurn('seg', renderBusyDecision(resolveQueueCommand(busyCtl.current, bgQueue.current!), labels));
        } else if (busyAction.kind === 'interrupt') {
          const r = applyInterrupt(busyCtl.current, cancelPendingInputs);
          busyCtl.current = r.state;
          pushTurn('seg', renderBusyDecision(r.decision, labels));
        } else {
          const r = applySteer(busyCtl.current, busyAction.message);
          busyCtl.current = r.state;
          pushTurn('seg', renderBusyDecision(r.decision, labels));
        }
        return;
      }
      // 358-006: /resume picker (session-resume.ts pickSession) merged with the
      // loop-side /resume — only a non-passthrough decision is handled here;
      // 'passthrough' falls to the queue push below, i.e. the loop's existing
      // memory-backed /resume, byte-identical (also the whole flag-off path).
      const resume = trimmed.match(/^\/resume(?:\s+(.*))?$/i);
      if (resume) {
        const chatRecords = chatSessionsToRecords(
          memory?.listChatSessions ? memory.listChatSessions(RESUME_RECENT_LIMIT) : [],
        );
        const decision = resolveResumeCommand(resume[1] ?? '', recentSessions.current ?? [], chatRecords, labels);
        if (decision.kind !== 'passthrough') {
          pushTurn('user', trimmed);
          if (decision.kind === 'list') {
            pushTurn('bg', decision.lines.join('\n'));
          } else if (decision.kind === 'reject') {
            pushTurn('seg', decision.line);
          } else {
            setActiveSessionId(decision.sessionId);
            if (decision.forwardToLoop) {
              // Chat-session pick: hand the RESOLVED id to the loop so its real
              // transcript/session-switch machinery runs (behavior-merge — the
              // loop treats a non-numeric arg as a literal session id).
              queue.current.push(`/resume ${decision.sessionId}`);
              setQueued([...queue.current]);
              if (wake.current) { const w = wake.current; wake.current = null; w(); }
            } else {
              // Sprint-session pick: switch the active session pointer locally
              // (deep context-load for sprint sessions is loop-side follow-up).
              pushTurn('seg', decision.line);
            }
          }
          return;
        }
      }
    }
    // /cd <path> — change the working dir (file tools + status follow it live).
    const cd = trimmed.match(/^\/cd(?:\s+(.+))?$/i);
    if (cd) {
      pushTurn('user', trimmed);
      const arg = cd[1]?.trim();
      if (arg) {
        try {
          process.chdir(arg.startsWith('~') ? arg.replace(/^~/, homedir()) : arg);
          setCwd(process.cwd());
          pushTurn('seg', `${labels.cdTo}: ${process.cwd()}`);
        } catch { pushTurn('seg', `${labels.cdFail}: ${arg}`); }
      } else { pushTurn('seg', process.cwd()); }
      return;
    }
    // /model <id> · /provider <name> — runtime switch (handled here, not the loop).
    const sw = trimmed.match(/^\/(model|provider)(?:\s+(\S+))?$/i);
    if (sw) {
      const kind = (sw[1] as string).toLowerCase();
      const arg = sw[2];
      pushTurn('user', trimmed);
      if (arg) {
        const next = onSwitch(kind === 'model' ? { model: arg } : { provider: arg });
        setSelection(next);
        pushTurn('seg', `${labels.switched}: ${next.provider}${next.model ? ` · ${next.model}` : ''}`);
      } else {
        pushTurn('seg', `${labels.switchUsage}\n${selection.provider}${selection.model ? ` · ${selection.model}` : ''}`);
      }
      return;
    }
    // /approve <mode> — agentic approval mode (suggest / auto-edit / full-auto).
    const ap = trimmed.match(/^\/approve(?:\s+(suggest|auto-edit|full-auto))?$/i);
    if (ap) {
      pushTurn('user', trimmed);
      const mode = ap[1] as ApprovalMode | undefined;
      if (mode) { onApprovalMode(mode); setApproval(mode); pushTurn('seg', `${labels.approvalSet}: ${mode}`); }
      else { pushTurn('seg', `${labels.approvalUsage} (${approval})`); }
      return;
    }
    queue.current.push(trimmed);
    setQueued([...queue.current]);
    if (wake.current) { const w = wake.current; wake.current = null; w(); }
  };

  // Confirm modal owns input only while it is open (single-key y / a / N). The
  // queue resolves the current head and advances to the next card (deny does not
  // cancel the rest); onChange updates `confirm` (null when the queue drains).
  // 360-009: keys route through confirmKeyToAnswer — only documented keys
  // decide a card (case-insensitive y/a/n + Enter/Esc = deny default); stray
  // navigation/typed keys no longer mow the burst down one card per keystroke.
  useInput((input, key) => {
    const answer = confirmKeyToAnswer(input, key);
    if (answer !== null) confirmQueue.current!.answer(answer);
  }, { isActive: confirm !== null });

  // 358-006: Esc→interrupt while a turn is in flight (BUSY_KEY_ACTIONS contract,
  // busy-controls.ts). Double-Esc is idempotent by construction — the second
  // press resolves to interrupt-noop, the canceller never re-fires, and no
  // duplicate line is pushed. Inactive while the confirm modal owns input;
  // inert unless the surface flag is on (flag-off key handling unchanged).
  useInput((_input, key) => {
    if (!key.escape) return;
    const r = applyInterrupt(busyCtl.current, cancelPendingInputs);
    busyCtl.current = r.state;
    if (r.decision.kind === 'interrupted') pushTurn('seg', renderBusyDecision(r.decision, labels));
  }, { isActive: replSurfaceEnabled && working && confirm === null });

  // Persistent phase anchor — the orientation signal ("am I working / done?").
  const phase: 'thinking' | 'generating' | 'idle' =
    busy ? 'thinking' : working ? 'generating' : 'idle';

  return (
    <Box flexDirection="column">
      <Static items={turns}>{(turn) => <TurnView key={turn.id} turn={turn} />}</Static>

      {/* In-progress (incomplete) line — the only streamed text in the dynamic
          region (one line). Completed lines/blocks already flowed into <Static>
          above (readable in real time, native scrollback, no tall re-render). */}
      {partial.length > 0 && <Text>{partial}</Text>}

      {/* Confirm modal — one card per queued tool call, with an [i/N] position. */}
      {confirm && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={TEAL}>{confirm.summary}</Text>
          <Text dimColor>{`${labels.confirmProgress.replace('{index}', String(confirm.index)).replace('{total}', String(confirm.total))} ${labels.confirmHint}`}</Text>
        </Box>
      )}

      {/* Queue preview — what is waiting while deckent is busy. */}
      {queued.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {queued.map((q, i) => (
            <Text key={i} dimColor>{`  ⋯ ${labels.queued} ${i + 1}: ${truncateQueuePreview(q)}`}</Text>
          ))}
        </Box>
      )}

      {/* APP-APPROVAL-WIRE (355-011): the runtime-wide-ApprovalBroker card —
          inert unless approvalsEnabled AND an approvalChannel is supplied
          (flag-off render stays byte-identical). Rendered BEFORE the footer
          block below so a pending approval sits "üst" (on top) of it — Ink's
          natural top-to-bottom Box flow, no manual layout math needed. The
          card itself renders null while nothing is pending. */}
      {approvalsEnabled && approvalChannel && approvalEvents.current && (
        <ApprovalCard
          events={approvalEvents.current}
          onDecide={approvalChannel.decide}
          decidedBy="terminal"
          channel="terminal"
          labels={approvalLabels ?? DEFAULT_APPROVAL_CARD_LABELS}
        />
      )}

      {/* REPL-SURFACE-WIRE (354-001): mode indicator + live-footer — both
          inert unless replSurfaceEnabled (flag-off render stays byte-identical
          to the pre-354-001 App). Footer lines pass through resolveFooterLines
          (355-011 dual-stream seam) — a no-op unless a pending approval is
          compressing it down to its tested min-1-line floor, so the footer
          never fully disappears while the ApprovalCard above it is visible. */}
      {replSurfaceEnabled && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={GOLD} bold>{`[${resolveModeLabel(termMode.mode, labels)}]`}</Text>
          {resolveFooterLines(footerLines, approvalPending).map((line, i) => <Text key={i} dimColor>{line}</Text>)}
        </Box>
      )}

      {/* Persistent status anchor (always present → "where am I / busy or done"). */}
      <Box marginTop={1}>
        {phase === 'idle'
          ? <Text dimColor>{`✓ ${labels.ready}`}</Text>
          : <><Spinner /><Text color={GOLD} bold> deckent </Text><Text dimColor>{`· ${phase === 'thinking' ? labels.thinking : labels.generating}`}</Text></>}
      </Box>

      {/* Pinned input with a VISIBLE cursor + interactive /menu — always last. */}
      <InputBar
        active={confirm === null}
        onSubmit={handleSubmit}
        onInterrupt={() => exit()}
        onClear={clearScreen}
        slashRegistry={slashRegistry}
        menuHint={labels.menuHint}
      />

      <Box>
        <Text dimColor>{'deckent  '}</Text>
        <Text color={TEAL}>{selection.provider}</Text>
        {selection.model ? <Text color={GOLD}>{` · ${selection.model}`}</Text> : null}
        <Text dimColor>{`  ${cwd}`}</Text>
        {sessionTok > 0 ? <Text dimColor>{`  · Σ ${sessionTok} tok`}</Text> : null}
        {approval !== 'suggest' ? <Text color={GOLD}>{`  · ⚡${approval}`}</Text> : null}
        {/* 358-006: visible only after a /resume picker switch (gated upstream). */}
        {activeSessionId && activeSessionId !== sessionId ? <Text dimColor>{`  · ↺ ${activeSessionId}`}</Text> : null}
      </Box>
    </Box>
  );
}
