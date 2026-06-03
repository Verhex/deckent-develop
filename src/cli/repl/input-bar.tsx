// ═══ InputBar — pinned input with a VISIBLE cursor + full line editing ═══════
//
// Closes the orientation findings (Sprint 224): the minimal append-only input
// had no visible cursor and no arrow keys. This reuses the tested editInput
// reducer + InputHistory (chat-pinned-tui) and renders the caret as an inverse
// cell, so ←/→/Home/End move the cursor, ↑/↓ walk history, Backspace/Delete edit,
// and the user can always SEE where they are. i18n-free: labels via props.

import { Box, Text, useInput } from 'ink';
import { useState, useRef, type ReactElement } from 'react';
import { appendFileSync } from 'node:fs';
import type { Key } from 'node:readline';
import { editInput, EMPTY_INPUT, InputHistory, type InputState } from './line-edit.js';
import { filterSlashCommands } from '../commands/chat-slash-menu.js';
import type { SlashRegistry, SlashCommand } from '../commands/chat-slash-registry.js';

const TEAL = '#4DB8A4';
const GOLD = '#C4A855';

export interface InputBarProps {
  /** Active only when the REPL is accepting input (false during a confirm modal). */
  active: boolean;
  /** Submit a completed line (already trimmed by the caller if desired). */
  onSubmit: (line: string) => void;
  /** Ctrl-C with an empty buffer. */
  onInterrupt: () => void;
  /** Ctrl-L → clear the screen/history. */
  onClear?: () => void;
  /** Slash command catalog — when set, typing `/` opens an interactive menu. */
  slashRegistry?: SlashRegistry;
  /** Localized hint shown under the menu (e.g. "↑↓ gez · Enter seç · Esc kapat"). */
  menuHint?: string;
}

/** Interactive slash menu is open when the buffer is a bare `/command` prefix
 * (no space/args yet) and at least one command matches. */
function slashMenuMatches(registry: SlashRegistry | undefined, buffer: string): SlashCommand[] {
  if (!registry || !buffer.startsWith('/') || buffer.includes(' ')) return [];
  return filterSlashCommands(registry, buffer);
}

/** Map an Ink keypress to the node:readline Key shape editInput expects.
 * Ink exposes arrows but NOT Home/End — those arrive as raw escape sequences
 * (xterm: ESC[H / ESC[F, or ESC[1~ / ESC[4~), so detect them from `input`. */
function inkToKey(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]): Key {
  if (key.leftArrow) return { name: 'left' } as Key;
  if (key.rightArrow) return { name: 'right' } as Key;
  if (key.upArrow) return { name: 'up' } as Key;
  if (key.downArrow) return { name: 'down' } as Key;
  if (key.return) return { name: 'return' } as Key;
  if (key.backspace) return { name: 'backspace' } as Key;
  if (key.delete) return { name: 'delete' } as Key;
  if ((key as { home?: boolean }).home) return { name: 'home' } as Key;
  if ((key as { end?: boolean }).end) return { name: 'end' } as Key;
  if (key.ctrl) return { name: input, ctrl: true } as Key;
  return { name: input, sequence: input } as Key;
}

/** Render the buffer with a visible inverse-video caret at the cursor cell. */
function CaretText({ state }: { state: InputState }): ReactElement {
  const { buffer, cursor } = state;
  const before = buffer.slice(0, cursor);
  const at = buffer.slice(cursor, cursor + 1) || ' ';
  const after = buffer.slice(cursor + 1);
  return (
    <Text>
      {before}
      <Text inverse>{at}</Text>
      {after}
    </Text>
  );
}

export function InputBar(props: InputBarProps): ReactElement {
  const { active, onSubmit, onInterrupt, onClear, slashRegistry, menuHint } = props;
  const [state, setState] = useState<InputState>(EMPTY_INPUT);
  const [menuSel, setMenuSel] = useState(0);
  const stateRef = useRef<InputState>(EMPTY_INPUT);
  const menuSelRef = useRef(0);
  const history = useRef(new InputHistory());
  const set = (s: InputState): void => { stateRef.current = s; setState(s); };
  const setSel = (n: number): void => { menuSelRef.current = n; setMenuSel(n); };

  useInput((input, key) => {
    if (process.env['DECKENT_INK_DEBUG'] === '1') {
      try { appendFileSync('/tmp/ink-keys.log', JSON.stringify({ input, key }) + '\n'); } catch { /* ignore */ }
    }

    if (key.ctrl && (input === 'l' || input === '\f')) { onClear?.(); return; } // Ctrl-L → clear

    // ── Interactive slash menu: intercept nav keys while it is open ──
    const matches = slashMenuMatches(slashRegistry, stateRef.current.buffer);
    if (matches.length > 0) {
      const n = matches.length;
      const sel = ((menuSelRef.current % n) + n) % n;
      if (key.upArrow) { setSel((sel - 1 + n) % n); return; }
      if (key.downArrow) { setSel((sel + 1) % n); return; }
      if (key.escape) { set(EMPTY_INPUT); setSel(0); return; }
      if (key.tab) { const name = matches[sel]?.name ?? ''; set({ buffer: name + ' ', cursor: name.length + 1 }); setSel(0); return; }
      if (key.return) { const name = matches[sel]?.name ?? stateRef.current.buffer; onSubmit(name); set(EMPTY_INPUT); setSel(0); return; }
      // any other key falls through to editInput → re-filters; reset selection
    }

    // A batched chunk that contains a newline. Two cases:
    //  • MULTI-LINE paste (internal newline) → insert as ONE message, newlines
    //    kept (Alperen: "paste tek mesaj"); the user reviews + presses Enter.
    //  • single line + trailing newline ("text\r") → submit it. (A real lone
    //    Enter keystroke is key.return, handled by editInput below.)
    if (!key.return && /[\r\n]/.test(input)) {
      const withoutTrailing = input.replace(/[\r\n]+$/, '');
      if (/[\r\n]/.test(withoutTrailing)) {
        const text = input.replace(/\r\n?/g, '\n');
        const s = stateRef.current;
        set({ buffer: s.buffer.slice(0, s.cursor) + text + s.buffer.slice(s.cursor), cursor: s.cursor + text.length });
      } else {
        onSubmit(stateRef.current.buffer + withoutTrailing);
        set(EMPTY_INPUT);
      }
      return;
    }

    const res = editInput(stateRef.current, inkToKey(input, key));
    if (res.signal === 'int') { onInterrupt(); set(EMPTY_INPUT); return; }
    if (res.signal === 'eof') { onInterrupt(); return; }
    if (res.history) {
      const next = history.current.navigate(res.history, stateRef.current.buffer);
      set({ buffer: next, cursor: next.length });
      return;
    }
    if (res.submit !== undefined) {
      history.current.push(res.submit);
      onSubmit(res.submit);
      set(EMPTY_INPUT);
      return;
    }
    set(res.state);
    setSel(0); // buffer changed → re-filter from the top
  }, { isActive: active });

  const matches = slashMenuMatches(slashRegistry, state.buffer);
  const sel = matches.length > 0 ? ((menuSel % matches.length) + matches.length) % matches.length : 0;

  // claude-code-style framed input box, with the interactive menu ABOVE it.
  return (
    <Box flexDirection="column">
      {matches.length > 0 && (() => {
        // Scroll window: keep the selected row visible even past the cap.
        const WINDOW = 8;
        const start = Math.max(0, Math.min(sel - (WINDOW >> 1), matches.length - WINDOW));
        const lo = Math.max(0, start);
        const visible = matches.slice(lo, lo + WINDOW);
        return (
          <Box flexDirection="column" marginBottom={0}>
            {lo > 0 ? <Text dimColor>{`  ↑ ${lo} more`}</Text> : null}
            {visible.map((c, vi) => {
              const i = lo + vi;
              return (
                <Text key={c.name}>
                  <Text color={i === sel ? GOLD : TEAL}>{i === sel ? '❯ ' : '  '}</Text>
                  <Text color={i === sel ? GOLD : undefined} bold={i === sel}>{c.name.padEnd(10)}</Text>
                  <Text dimColor> {c.desc}</Text>
                </Text>
              );
            })}
            {lo + WINDOW < matches.length ? <Text dimColor>{`  ↓ ${matches.length - lo - WINDOW} more`}</Text> : null}
            {menuHint ? <Text dimColor>{`  ${menuHint}`}</Text> : null}
          </Box>
        );
      })()}
      <Box borderStyle="round" borderColor={TEAL} paddingX={1}>
        <Text color={TEAL}>{'› '}</Text>
        <CaretText state={state} />
      </Box>
    </Box>
  );
}
