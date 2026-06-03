// ═══ InputBar — pinned input with a VISIBLE cursor + full line editing ═══════
//
// Closes the orientation findings (Sprint 224): the minimal append-only input
// had no visible cursor and no arrow keys. This reuses the tested editInput
// reducer + InputHistory (chat-pinned-tui) and renders the caret as an inverse
// cell, so ←/→/Home/End move the cursor, ↑/↓ walk history, Backspace/Delete edit,
// and the user can always SEE where they are. i18n-free: labels via props.

import { Box, Text, useInput } from 'ink';
import { useState, useRef, type ReactElement } from 'react';
import type { Key } from 'node:readline';
import { editInput, EMPTY_INPUT, InputHistory, type InputState } from '../commands/chat-pinned-tui.js';

const TEAL = '#4DB8A4';

export interface InputBarProps {
  /** Active only when the REPL is accepting input (false during a confirm modal). */
  active: boolean;
  /** Submit a completed line (already trimmed by the caller if desired). */
  onSubmit: (line: string) => void;
  /** Ctrl-C with an empty buffer. */
  onInterrupt: () => void;
}

/** Map an Ink keypress to the node:readline Key shape editInput expects. */
function inkToKey(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]): Key {
  if (key.leftArrow) return { name: 'left' } as Key;
  if (key.rightArrow) return { name: 'right' } as Key;
  if (key.upArrow) return { name: 'up' } as Key;
  if (key.downArrow) return { name: 'down' } as Key;
  if (key.return) return { name: 'return' } as Key;
  if (key.backspace) return { name: 'backspace' } as Key;
  if (key.delete) return { name: 'delete' } as Key;
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
  const { active, onSubmit, onInterrupt } = props;
  const [state, setState] = useState<InputState>(EMPTY_INPUT);
  const stateRef = useRef<InputState>(EMPTY_INPUT);
  const history = useRef(new InputHistory());
  const set = (s: InputState): void => { stateRef.current = s; setState(s); };

  useInput((input, key) => {
    // A batched/pasted chunk that embeds Enter: split so each completed line
    // submits and the trailing part stays in the buffer (real Enter is a lone
    // `return` key handled by editInput below).
    if (!key.return && /[\r\n]/.test(input)) {
      const segs = input.split(/\r\n|\r|\n/);
      let cur = stateRef.current.buffer;
      onSubmit(cur + (segs[0] ?? ''));
      for (let i = 1; i < segs.length - 1; i++) onSubmit(segs[i] ?? '');
      const tail = segs[segs.length - 1] ?? '';
      set({ buffer: tail, cursor: tail.length });
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
  }, { isActive: active });

  return (
    <Box>
      <Text color={TEAL}>{'› '}</Text>
      <CaretText state={state} />
    </Box>
  );
}
