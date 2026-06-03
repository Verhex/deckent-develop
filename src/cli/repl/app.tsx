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
import { useState, useRef, useEffect, type ReactElement } from 'react';
import { runChatNativeLoop, type ChatProviderAdapter, type McpToolDispatcher } from '../commands/chat-native.js';
import { renderMarkdown } from '../commands/chat-render.js';
import { InputBar } from './input-bar.js';
import type { SlashRegistry } from '../commands/chat-slash-registry.js';

export type ConfirmAnswer = 'y' | 'a' | 'n';
export type ConfirmTrigger = (summary: string) => Promise<ConfirmAnswer>;

/** A completed tool action, rendered as a claude-code-style change block. The
 * caller (run.tsx) localizes `verb`/`note`; the App owns the colored layout. */
export interface ToolInfo {
  verb: string;       // localized, e.g. "dosya yazıldı"
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
  menuHint: string;     // "↑↓ gez · Enter seç · Tab tamamla · Esc kapat"
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
}

interface Turn { id: number; role: 'user' | 'assistant' | 'tool'; text: string; tool?: ToolInfo; }

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
    const { verb, target, added, removed, note } = turn.tool;
    const hasDelta = added !== undefined || removed !== undefined || note !== undefined;
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
  return (
    <Box flexDirection="column" marginTop={1}>
      <DeckentHeader />
      <Text>{renderMarkdown(turn.text, true)}</Text>
    </Box>
  );
}

export function ReplApp(props: ReplAppProps): ReactElement {
  const { provider, dispatcher, labels, providerName, cwd, registerConfirm, registerToolSink, slashRegistry } = props;
  const { exit } = useApp();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<{ summary: string } | null>(null);

  const idRef = useRef(1);
  const replyAccum = useRef('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<string[]>([]);
  const wake = useRef<(() => void) | null>(null);
  const confirmResolve = useRef<((a: ConfirmAnswer) => void) | null>(null);
  const started = useRef(false);

  const pushTurn = (role: Turn['role'], text: string): void =>
    setTurns((t) => [...t, { id: idRef.current++, role, text }]);

  useEffect(() => {
    registerConfirm((summary: string) => new Promise<ConfirmAnswer>((resolve) => {
      confirmResolve.current = resolve;
      setConfirm({ summary });
    }));
  }, [registerConfirm]);

  // Tool/change blocks: a completed tool action becomes a 'tool' turn in the
  // history (rendered as ● verb target / ⎿ +added -removed). Finalize any live
  // reply first so the block lands AFTER the text that requested it.
  useEffect(() => {
    registerToolSink((info: ToolInfo) => {
      if (replyAccum.current.length > 0) {
        pushTurn('assistant', replyAccum.current);
        replyAccum.current = '';
        setReply('');
      }
      setTurns((t) => [...t, { id: idRef.current++, role: 'tool', text: '', tool: info }]);
    });
  }, [registerToolSink]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const finalizeReply = (): void => {
      if (replyAccum.current.length > 0) {
        pushTurn('assistant', replyAccum.current);
        replyAccum.current = '';
        setReply('');
      }
    };

    async function* inputIter(): AsyncGenerator<string> {
      for (;;) {
        while (queue.current.length > 0) {
          const line = queue.current.shift() as string;
          setQueued([...queue.current]);
          pushTurn('user', line);
          yield line;
          // The consumer pulls the next line only once THIS turn finished
          // streaming → finalize the reply NOW (move it into <Static>, render
          // markdown, drop to the idle '✓ hazır' phase, stop re-rendering so
          // mouse-scroll / selection / copy work).
          finalizeReply();
        }
        await new Promise<void>((r) => { wake.current = r; });
      }
    }

    void runChatNativeLoop({
      provider,
      dispatcher,
      input: inputIter(),
      // Chunked streaming (Alperen: "token token değil cümle cümle"): tokens
      // accumulate into replyAccum (always complete), but the rendered reply is
      // flushed on a sentence/line boundary or a calm ~90ms tick — so the flow
      // appears in meaningful chunks, not a jittery per-token crawl.
      output: (text: string) => {
        replyAccum.current += text;
        const atBoundary = /[.!?:;\n)]\s*$/.test(text);
        if (atBoundary) {
          if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
          setReply(replyAccum.current);
        } else if (!flushTimer.current) {
          flushTimer.current = setTimeout(() => { flushTimer.current = null; setReply(replyAccum.current); }, 90);
        }
      },
      thinkingIndicator: { start: () => setBusy(true), stop: () => setBusy(false) },
      interactiveTty: true,
      layoutEnabled: false,
      gracefulErrors: true,
    }).then(() => exit()).catch(() => exit());
  }, [provider, dispatcher, exit]);

  const handleSubmit = (line: string): void => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    if (['/exit', '/quit', ':exit', ':quit'].includes(trimmed.toLowerCase())) { exit(); return; }
    queue.current.push(trimmed);
    setQueued([...queue.current]);
    if (wake.current) { const w = wake.current; wake.current = null; w(); }
  };

  // Confirm modal owns input only while it is open (single-key y / a / N).
  useInput((input) => {
    const answer: ConfirmAnswer = input === 'y' ? 'y' : input === 'a' ? 'a' : 'n';
    setConfirm(null);
    const r = confirmResolve.current; confirmResolve.current = null;
    r?.(answer);
  }, { isActive: confirm !== null });

  // Persistent phase anchor — the orientation signal ("am I working / done?").
  const phase: 'thinking' | 'generating' | 'idle' =
    reply.length > 0 ? 'generating' : busy ? 'thinking' : 'idle';

  return (
    <Box flexDirection="column">
      <Static items={turns}>{(turn) => <TurnView key={turn.id} turn={turn} />}</Static>

      {/* Live streaming reply (moves into <Static> at the turn boundary). */}
      {reply.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <DeckentHeader />
          <Text>{reply}</Text>
        </Box>
      )}

      {/* Confirm modal. */}
      {confirm && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={TEAL}>{confirm.summary}</Text>
          <Text dimColor>{labels.confirmHint}</Text>
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
        slashRegistry={slashRegistry}
        menuHint={labels.menuHint}
      />

      <Box>
        <Text dimColor>{`deckent  ${providerName}  ${cwd}`}</Text>
      </Box>
    </Box>
  );
}
