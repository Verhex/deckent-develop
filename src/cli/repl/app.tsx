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

export type ConfirmAnswer = 'y' | 'a' | 'n';
export type ConfirmTrigger = (summary: string) => Promise<ConfirmAnswer>;

/** Localized labels — injected by the caller (i18n-first; component is string-free). */
export interface ReplLabels {
  thinking: string;     // "düşünüyor…"
  generating: string;   // "üretiliyor…"
  ready: string;        // "hazır · sıra sende"
  queued: string;       // "kuyrukta"
  confirmHint: string;  // "(y = izin · a = hep izin · N = reddet)"
}

export interface ReplAppProps {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  labels: ReplLabels;
  providerName: string;
  cwd: string;
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
  const [queued, setQueued] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<{ summary: string } | null>(null);

  const idRef = useRef(1);
  const replyAccum = useRef('');
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
          setQueued([...queue.current]);
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

      {/* Pinned input with a VISIBLE cursor — always the last element → bottom. */}
      <InputBar active={confirm === null} onSubmit={handleSubmit} onInterrupt={() => exit()} />

      <Box>
        <Text dimColor>{`deckent  ${providerName}  ${cwd}`}</Text>
      </Box>
    </Box>
  );
}
