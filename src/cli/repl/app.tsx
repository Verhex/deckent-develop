// ═══ Ink REPL App (Sprint 224 — native TUI via React-for-CLI) ════════════════
//
// Why Ink: the hand-rolled raw-ANSI TUI could not deliver native feel (multi-line
// overwrite, broken queue, cursor drift). Ink's full-frame reconciler owns the
// render — completed turns live in <Static> (rendered once, scroll naturally),
// the streaming reply + spinner live below, and the input is the LAST element so
// it is ALWAYS pinned to the bottom. claude-code + gemini-cli use the same base.
//
// Engine vs view: runChatNativeLoop stays the engine (agentic tools, slash,
// session) — this App drives it with an Ink-backed input iterator + output
// callback and renders the resulting state. The component is i18n-string-free:
// all user-facing labels arrive via props (getMessage resolved by the caller).

import { Box, Text, Static, useInput, useApp } from 'ink';
import { useState, useRef, useEffect, type ReactElement } from 'react';
import { runChatNativeLoop, type ChatProviderAdapter, type McpToolDispatcher } from '../commands/chat-native.js';
import { renderMarkdown } from '../commands/chat-render.js';

/** Single-key confirm answer. */
export type ConfirmAnswer = 'y' | 'a' | 'n';
/** The App registers this trigger; the dispatcher calls it to raise the modal. */
export type ConfirmTrigger = (summary: string) => Promise<ConfirmAnswer>;

/** Localized labels — injected by the caller (i18n-first; component is string-free). */
export interface ReplLabels {
  thinking: string;
  queued: string;        // "kuyrukta" — followed by a count
  confirmHint: string;   // "(y = izin · a = hep izin · N = reddet)"
}

export interface ReplAppProps {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  labels: ReplLabels;
  providerName: string;
  cwd: string;
  /** Called once on mount with the modal trigger, so the dispatcher's confirm
   * (created in the caller) can raise the App's y/a/N modal and await a key. */
  registerConfirm: (trigger: ConfirmTrigger) => void;
}

interface Turn { id: number; role: 'user' | 'assistant'; text: string; }

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

/** Assistant block header `● deckent` (kraken colors). */
function DeckentHeader(): ReactElement {
  return <Text><Text color={TEAL}>● </Text><Text color={GOLD} bold>deckent</Text></Text>;
}

/** A completed turn: user `› …` (dim) or assistant header + rendered markdown. */
function TurnView({ turn }: { turn: Turn }): ReactElement {
  if (turn.role === 'user') {
    return (
      <Box marginTop={1}>
        <Text dimColor>{'› '}</Text>
        <Text>{turn.text}</Text>
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
  const { provider, dispatcher, labels, providerName, cwd, registerConfirm } = props;
  const { exit } = useApp();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [queuedCount, setQueuedCount] = useState(0);
  const [confirm, setConfirm] = useState<{ summary: string } | null>(null);

  // Bridges between the async engine (runChatNativeLoop) and React state.
  const idRef = useRef(1);
  const replyAccum = useRef('');
  const queue = useRef<string[]>([]);
  const wake = useRef<(() => void) | null>(null);
  const confirmResolve = useRef<((a: ConfirmAnswer) => void) | null>(null);
  const started = useRef(false);

  // Mirror the input in a ref so keystroke handling (which may arrive batched)
  // reads the current value synchronously without waiting for a state flush.
  const inputRef = useRef('');
  const setInputBoth = (v: string): void => { inputRef.current = v; setInput(v); };

  const pushTurn = (role: Turn['role'], text: string): void =>
    setTurns((t) => [...t, { id: idRef.current++, role, text }]);

  // Register the confirm modal trigger for the dispatcher (once).
  useEffect(() => {
    registerConfirm((summary: string) => new Promise<ConfirmAnswer>((resolve) => {
      confirmResolve.current = resolve;
      setConfirm({ summary });
    }));
  }, [registerConfirm]);

  // Start the engine ONCE. The input iterator finalizes the previous assistant
  // reply (into <Static>) right before pulling the next user line.
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function* inputIter(): AsyncGenerator<string> {
      for (;;) {
        if (replyAccum.current.length > 0) {
          pushTurn('assistant', replyAccum.current);
          replyAccum.current = '';
          setReply('');
        }
        while (queue.current.length > 0) {
          const line = queue.current.shift() as string;
          setQueuedCount(queue.current.length);
          pushTurn('user', line);
          yield line;
        }
        await new Promise<void>((r) => { wake.current = r; });
      }
    }

    void runChatNativeLoop({
      provider,
      dispatcher,
      input: inputIter(),
      output: (text: string) => { replyAccum.current += text; setReply(replyAccum.current); },
      thinkingIndicator: { start: () => setBusy(true), stop: () => setBusy(false) },
      interactiveTty: true,
      layoutEnabled: false,
      gracefulErrors: true,
    }).then(() => exit()).catch(() => exit());
  }, [provider, dispatcher, exit]);

  // Submit one completed line: exit slashes quit directly (the engine loop only
  // breaks on the colon form), everything else is queued for the engine.
  const submitLine = (line: string): void => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    if (['/exit', '/quit', ':exit', ':quit'].includes(trimmed.toLowerCase())) { exit(); return; }
    queue.current.push(trimmed);
    setQueuedCount(queue.current.length);
    if (wake.current) { const w = wake.current; wake.current = null; w(); }
  };

  useInput((ch, key) => {
    if (confirm) {
      const answer: ConfirmAnswer = ch === 'y' ? 'y' : ch === 'a' ? 'a' : 'n';
      setConfirm(null);
      const r = confirmResolve.current; confirmResolve.current = null;
      r?.(answer);
      return;
    }
    if (key.ctrl && ch === 'c') { exit(); return; }
    // Real Enter arrives as a `return` key event (lone keystroke).
    if (key.return) { submitLine(inputRef.current); setInputBoth(''); return; }
    if (key.backspace || key.delete) { setInputBoth(inputRef.current.slice(0, -1)); return; }
    if (key.ctrl || key.meta || key.escape) return;
    if (!ch) return;
    // `ch` may be a batched/pasted block that embeds newlines (Enter delivered
    // inside a chunk, not as a lone `return`). Split on newlines: completed
    // segments submit, the trailing segment stays in the input buffer.
    if (/[\r\n]/.test(ch)) {
      const segs = ch.split(/\r\n|\r|\n/);
      submitLine(inputRef.current + (segs[0] ?? ''));
      for (let i = 1; i < segs.length - 1; i++) submitLine(segs[i] ?? '');
      setInputBoth(segs[segs.length - 1] ?? '');
      return;
    }
    setInputBoth(inputRef.current + ch);
  });

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

      {/* Thinking indicator (while busy, before the first token). */}
      {busy && reply.length === 0 && (
        <Box marginTop={1}>
          <Spinner /><Text color={GOLD} bold> deckent </Text><Text dimColor>· {labels.thinking}</Text>
        </Box>
      )}

      {/* Confirm modal. */}
      {confirm && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={TEAL}>{confirm.summary}</Text>
          <Text dimColor>{labels.confirmHint}</Text>
        </Box>
      )}

      {/* Pinned input — ALWAYS the last interactive element → bottom of frame. */}
      <Box marginTop={1}>
        <Text color={TEAL}>{'› '}</Text>
        <Text>{input}</Text>
        <Text dimColor>{queuedCount > 0 ? `  (${labels.queued}: ${queuedCount})` : ''}</Text>
      </Box>
      <Box>
        <Text dimColor>{`deckent  ${providerName}  ${cwd}`}</Text>
      </Box>
    </Box>
  );
}
