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
}

type ApprovalMode = 'suggest' | 'auto-edit' | 'full-auto';

interface TurnStats { elapsedMs: number; tokens?: number; }
// Streaming model: a reply is a 'head' (● deckent) then a series of 'seg' units
// (prose lines / finished code+table blocks) that flow into <Static> as they
// complete, then a 'foot' (⏱ stats). Each lands in scrollback immediately, so
// the user reads in real time and the dynamic region stays tiny (no drift).
interface Turn { id: number; role: 'user' | 'head' | 'seg' | 'foot' | 'tool'; text: string; tool?: ToolInfo; stats?: TurnStats; }

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
  if (turn.role === 'foot') {
    const s = turn.stats;
    return <Text dimColor>{`⏱ ${s ? (s.elapsedMs / 1000).toFixed(1) : '0'}s${s?.tokens ? ` · ${s.tokens} tok` : ''}`}</Text>;
  }
  // 'seg' — one completed reply line/block, rendered markdown, no margin (flows
  // directly under the head + previous segments).
  return <Text>{renderMarkdown(turn.text, true)}</Text>;
}

export function ReplApp(props: ReplAppProps): ReactElement {
  const { provider, dispatcher, labels, registerConfirm, registerToolSink, slashRegistry, initialSelection, onSwitch, onApprovalMode, memory, sessionId, lang, nativeEngine } = props;
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

  const pushTurn = (role: Turn['role'], text: string): void =>
    setTurns((t) => [...t, { id: idRef.current++, role, text }]);

  // Push one completed reply segment (a line or a finished code/table block);
  // emit the '● deckent' head once per reply, before the first segment.
  const pushSegment = (markdown: string): void => {
    setTurns((t) => {
      const next = [...t];
      if (!headPushed.current) { headPushed.current = true; next.push({ id: idRef.current++, role: 'head', text: '' }); }
      next.push({ id: idRef.current++, role: 'seg', text: markdown });
      return next;
    });
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
      setTurns((t) => [...t, { id: idRef.current++, role: 'tool', text: '', tool: info }]);
    });
  }, [registerToolSink]);

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
        setTurns((t) => [...t, { id: idRef.current++, role: 'foot', text: '', ...(stats ? { stats } : {}) }]);
      }
    };

    async function* inputIter(): AsyncGenerator<string> {
      for (;;) {
        while (queue.current.length > 0) {
          const line = queue.current.shift() as string;
          setQueued([...queue.current]);
          pushTurn('user', line);
          setWorking(true);
          yield line;
          finalizeReply(); // turn finished streaming → close it out
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
          await nativeEngine(line, {
            output,
            onTurnEnd: (s) => {
              const tokens = s.outputTokens;
              lastStats.current = { elapsedMs: 0, ...(tokens !== undefined ? { tokens } : {}) };
              if (tokens) setSessionTok((n) => n + tokens);
            },
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
      setTurns([]); setPartial(''); headPushed.current = false;
      return;
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
  useInput((input) => {
    const answer: ConfirmAnswer = input === 'y' ? 'y' : input === 'a' ? 'a' : 'n';
    confirmQueue.current!.answer(answer);
  }, { isActive: confirm !== null });

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
            <Text key={i} dimColor>{`  ⋯ ${labels.queued} ${i + 1}: ${q.length > 60 ? q.slice(0, 60) + '…' : q}`}</Text>
          ))}
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
        onClear={() => { setTurns([]); setPartial(''); headPushed.current = false; }}
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
      </Box>
    </Box>
  );
}
