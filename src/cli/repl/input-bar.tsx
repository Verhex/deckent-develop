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
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Key } from 'node:readline';
import { editInput, EMPTY_INPUT, InputHistory, type InputState } from './line-edit.js';
import { segmentGraphemes } from './cursor-model.js';
import { appendHistory, HistoryNavigator, loadHistory } from './input-history.js';
import { filterSlashCommands } from '../commands/chat-slash-menu.js';
import type { SlashRegistry, SlashCommand } from '../commands/chat-slash-registry.js';
import { activeAtQuery, filterAtPaths, completeAtToken, type ActiveAtToken } from './at-ref.js';
import { requireInjectedLabel } from '../helpers/injected-label.js';

const TEAL = '#4DB8A4';
const GOLD = '#C4A855';

export interface InputBarProps {
  /** Active only when the REPL is accepting input (false during a confirm modal). */
  active: boolean;
  /** Submit a completed line (already trimmed by the caller if desired). */
  onSubmit: (line: string) => void;
  /** Ctrl-C ('int') / Ctrl-D on an empty buffer ('eof'). TERMINAL-TOOLS-006:
   * the bar reports whether a draft was present (it clears the draft itself on
   * 'int'); the caller decides (interrupt-policy.ts) — never exits blindly. */
  onInterrupt: (signal: 'int' | 'eof', draftNonEmpty: boolean) => void;
  /** Ctrl-L → clear the screen/history. */
  onClear?: () => void;
  /** TERMINAL-TOOLS-008 — Esc that NO composer menu consumed (slash menu,
   * `@` menu and Ctrl-R search all take Esc first). The caller decides what
   * it means (app.tsx: interrupt the running turn). */
  onEscape?: () => void;
  /** Slash command catalog — when set, typing `/` opens an interactive menu. */
  slashRegistry?: SlashRegistry;
  /** Localized hint shown under the menu (e.g. "↑↓ gez · Enter seç · Esc kapat"). */
  menuHint?: string;
  /** `{n}`-templates for the rows scrolled out of the 8-row `/` menu window
   * (tui.menu_more_above / tui.menu_more_below via run.tsx buildReplLabels).
   * REQUIRED injected labels — this mechanism module carries no fallback
   * text; a missing injection throws InjectedLabelMissingError (surfaced by
   * ReplErrorBoundary) instead of silently rendering English. */
  menuMoreAbove: string;
  menuMoreBelow: string;
  /** TERMINAL-TOOLS-002 — the Ctrl-R reverse-history prompt (tui.reverse_search
   * via run.tsx buildReplLabels). REQUIRED injected label; the readline-ism
   * literal that used to live here rendered in every language. */
  reverseSearchLabel: string;
  /** Caret carrier — 'inverse' (default) or 'marker' when the color gate is
   * suppressed (run.tsx resolves it from theme.ts; see CaretText). */
  caretStyle?: CaretStyle;
  /** TERMINAL-TOOLS-010 — `?` on an EMPTY composer toggles this catalog-built
   * shortcuts panel above the box (Esc or `?` closes it). String-free: the
   * mechanism renders the injected rows verbatim. Absent → `?` is plain text. */
  shortcutsPanel?: ShortcutsPanel;
  /** Project root for persistent history (`.deckent/settings/repl-history`).
   * Injectable for tests (tmpdir); defaults to `process.cwd()` — the real
   * REPL's project root — when the caller (app.tsx) doesn't override it. */
  historyProjectRoot?: string;
  /** TERM-AT-REF (583/N2b) — project-path candidates for the `@` fuzzy menu.
   * Called with the query typed after `@`; returns rel-path candidates (the
   * component fuzzy-orders them via filterAtPaths). Injected by the caller
   * (run.tsx's cached walkProjectFiles lister) — string-free mechanism rule:
   * this component never imports a cli/commands internal. Absent → typing
   * `@` never opens a menu (render byte-identical). */
  pathProvider?: (prefix: string) => string[];
  /** Localized hint under the `@` menu — same injected-labels route as
   * `menuHint` (tui.atref_menu_hint via run.tsx). */
  atMenuHint?: string;
}

/** Persistent (disk-backed), prefix-filtered history for one InputBar instance. */
export interface HistoryController {
  /** Entries loaded from disk at construction, grown in place as lines submit —
   * shared by reference with `navigator` so pushes stay visible without rebuilding it. */
  entries: string[];
  navigator: HistoryNavigator;
}

/** Load persisted history for `projectRoot` and wrap it in a fresh navigator. */
export function createHistoryController(projectRoot: string): HistoryController {
  const entries = loadHistory(projectRoot);
  return { entries, navigator: new HistoryNavigator(entries) };
}

/** Resolve the next input state for a ↑/↓ history-navigation signal (the
 * `-1|1` editInput emits for up/down). Prefix-filters against `buffer` when
 * navigation is (re)entered — mirrors HistoryNavigator's own semantics. */
export function resolveHistoryNav(navigator: HistoryNavigator, dir: -1 | 1, buffer: string): InputState {
  const next = navigator.navigate(dir === -1 ? 'up' : 'down', buffer, buffer);
  return { buffer: next, cursor: next.length };
}

/** Record a submitted line into the persistent (disk) + in-session history,
 * then reset navigation back to the live line. Call on every Enter-submit. */
export function recordHistoryEntry(projectRoot: string, controller: HistoryController, line: string): void {
  controller.entries.push(line);
  appendHistory(projectRoot, line);
  controller.navigator.reset();
}

/** Interactive slash menu is open when the buffer is a bare `/command` prefix
 * (no space/args yet) and at least one command matches. */
function slashMenuMatches(registry: SlashRegistry | undefined, buffer: string): SlashCommand[] {
  if (!registry || !buffer.startsWith('/') || buffer.includes(' ')) return [];
  return filterSlashCommands(registry, buffer);
}

/** TERM-AT-REF (583/N2b) — the `@` menu's open-state resolution (mirrors
 * slashMenuMatches's role for `/`). Open when a provider is wired, the cursor
 * sits inside an `@` token on a word boundary (activeAtQuery — emails/`@@`
 * never open), the token was not Esc-dismissed (`dismissedStart` is the
 * dismissed token's `@` index), and the fuzzy filter finds ≥1 candidate.
 * Pure — regression-tested without mounting Ink (tests/cli/at-ref.test.ts). */
export function atMenuMatches(
  provider: ((prefix: string) => string[]) | undefined,
  state: InputState,
  dismissedStart: number | null,
): { token: ActiveAtToken; matches: string[] } | null {
  if (!provider) return null;
  const token = activeAtQuery(state.buffer, state.cursor);
  if (!token || token.start === dismissedStart) return null;
  const matches = filterAtPaths(provider(token.query), token.query);
  return matches.length > 0 ? { token, matches } : null;
}

/** Enter-decision while the slash menu is open. filterSlashCommands keeps the
 * menu open with the FULL catalog when nothing prefix-matches (fallback list);
 * in that state Enter must submit the TYPED buffer, not the menu selection —
 * otherwise any command missing from the registry (a handleSubmit-only command
 * like /term before it was catalogued) is silently replaced by the first menu
 * item and can never be submitted at all. Only a real prefix-match may
 * substitute the selection. Pure — regression-tested without mounting Ink. */
export function resolveMenuSubmit(buffer: string, matches: readonly SlashCommand[], sel: number): string {
  const q = buffer.toLowerCase();
  const realMatch = matches.some((c) => c.name.toLowerCase().startsWith(q));
  if (!realMatch) return buffer;
  return matches[sel]?.name ?? buffer;
}

/** Classification of a batched Ink `input` chunk that contains \r/\n (only
 * relevant when `!key.return` — a real lone Enter keystroke is `key.return`,
 * handled separately by editInput). */
export type PasteChunkResult =
  | { kind: 'insert'; text: string }
  | { kind: 'submit'; line: string }
  | { kind: 'noop' };

/**
 * Classify a raw multi-byte Ink `input` chunk against the current buffer:
 *  • an internal newline survives stripping the TRAILING run of \r/\n → still
 *    multi-line → `insert` as ONE message (newlines kept, Alperen: "paste tek
 *    mesaj"); the user reviews + presses Enter for real.
 *  • no internal newline left after stripping → a single line + trailing
 *    newline ("text\r") → `submit`, UNLESS the resulting line (`buffer +
 *    withoutTrailing`) is empty OR whitespace-only — a chunk that is PURELY
 *    \r/\n bytes (e.g. a coalesced double-Enter, or a paste of only blank
 *    lines while the buffer is empty), or reduces to spaces/tabs only, must
 *    never auto-submit or land in history — `.trim()` before the length
 *    check mirrors appendHistory's own `trimmed.trim().length === 0` skip
 *    (input-history.ts), so both history sinks (in-session + persisted) agree
 *    on what counts as "empty".
 * Pure — regression-tested without mounting Ink.
 */
export function resolvePasteChunk(buffer: string, input: string): PasteChunkResult {
  const withoutTrailing = input.replace(/[\r\n]+$/, '');
  if (/[\r\n]/.test(withoutTrailing)) {
    return { kind: 'insert', text: input.replace(/\r\n?/g, '\n') };
  }
  const line = buffer + withoutTrailing;
  return line.trim().length > 0 ? { kind: 'submit', line } : { kind: 'noop' };
}

/** Resolve the debug keylog path: `DECKENT_INK_DEBUG_LOG` env override first,
 * else the OS-appropriate temp dir. A hardcoded `/tmp/...` is POSIX-only —
 * native Windows (non-WSL, Law #2 "every environment") has no `/tmp`, so the
 * write throws ENOENT and the surrounding try/catch silently swallows it:
 * `DECKENT_INK_DEBUG=1` would do nothing there with zero signal. */
export function debugKeylogPath(): string {
  return process.env['DECKENT_INK_DEBUG_LOG'] ?? join(tmpdir(), 'ink-keys.log');
}

/** Map an Ink keypress to the node:readline Key shape editInput expects.
 * `key.home`/`key.end` are the properties Ink's own `useInput` hook actually
 * fills (node_modules/ink/build/hooks/use-input.js: `home: keypress.name ===
 * 'home'`, and parse-keypress.js maps every common xterm/rxvt/vt encoding —
 * ESC[H, ESC[1~, ESC OH / ESC[F, ESC[4~, ESC OF, etc. — to that name), so
 * they are the primary, Ink-idiomatic signal. The raw-escape-sequence check
 * below is kept as a defense-in-depth fallback only (older Ink majors /
 * terminal multiplexers that might not resolve `keypress.name`) — it must
 * never be the sole detection path, unlike the pre-fix version of this
 * function was documented (incorrectly) to require. */
export function inkToKey(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]): Key {
  if (key.leftArrow) return { name: 'left' } as Key;
  if (key.rightArrow) return { name: 'right' } as Key;
  if (key.upArrow) return { name: 'up' } as Key;
  if (key.downArrow) return { name: 'down' } as Key;
  // TERMINAL-TOOLS-009 — modifiers on Enter reach the reducer (Shift+Enter via
  // kitty CSI-u, Alt/Option+Enter via ESC CR); a bare linefeed (Ctrl-J) is
  // Ink's 'enter' name and inserts a newline (line-edit.ts).
  if (key.return) return { name: 'return', shift: key.shift === true, meta: key.meta === true } as Key;
  if (input === '\n') return { name: 'enter' } as Key;
  if (key.backspace) return { name: 'backspace' } as Key;
  if (key.delete) return { name: 'delete' } as Key;
  if (key.home || input === '\x1b[H' || input === '\x1b[1~' || input === '\x1bOH') return { name: 'home' } as Key;
  if (key.end || input === '\x1b[F' || input === '\x1b[4~' || input === '\x1bOF') return { name: 'end' } as Key;
  if (key.ctrl) return { name: input, ctrl: true } as Key;
  return { name: input, sequence: input } as Key;
}

/**
 * TERMINAL-TOOLS-003 — caret carrier. 'inverse' is the default (SGR 7 on the
 * caret cell). When the color gate is suppressed (NO_COLOR / --no-color /
 * FORCE_COLOR=0 — resolved by run.tsx from theme.ts) chalk drops the inverse
 * attribute too and the caret would vanish, so 'marker' renders an explicit
 * ASCII `|` before the caret cell instead: meaning is never carried by color
 * (or an attribute) alone.
 */
export type CaretStyle = 'inverse' | 'marker';
export const CARET_MARKER = '|';

/** TERMINAL-TOOLS-010 — caller-built keyboard help (run.tsx buildShortcutsPanel). */
export interface ShortcutsPanel {
  title: string;
  rows: ReadonlyArray<{ keys: string; action: string }>;
}

/** Render the buffer with a visible caret at the cursor cell. TERMINAL-TOOLS-005:
 *  the caret cell is the whole grapheme cluster under the cursor (an emoji, a
 *  ZWJ family, a flag) — `slice(cursor, cursor + 1)` used to take half of a
 *  surrogate pair and the terminal drew garbage. */
function CaretText({ state, caretStyle }: { state: InputState; caretStyle: CaretStyle }): ReactElement {
  const { buffer, cursor } = state;
  const before = buffer.slice(0, cursor);
  const atCluster = segmentGraphemes(buffer.slice(cursor))[0] ?? '';
  const at = atCluster || ' ';
  const after = buffer.slice(cursor + atCluster.length);
  if (caretStyle === 'marker') {
    return <Text>{`${before}${CARET_MARKER}${buffer.slice(cursor)}`}</Text>;
  }
  return (
    <Text>
      {before}
      <Text inverse>{at}</Text>
      {after}
    </Text>
  );
}

/** Substitute the scrolled-out row count into a `{n}` hint template. */
export function formatMenuMore(template: string, n: number): string {
  return template.replace('{n}', String(n));
}

export function InputBar(props: InputBarProps): ReactElement {
  const { active, onSubmit, onInterrupt, onClear, onEscape, slashRegistry, menuHint, pathProvider, atMenuHint, shortcutsPanel } = props;
  // TERMINAL-TOOLS-010 — `?` shortcuts panel (open/closed).
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsOpenRef = useRef(false);
  const setShortcuts = (open: boolean): void => { shortcutsOpenRef.current = open; setShortcutsOpen(open); };
  // TERMINAL-TOOLS-001 — string-free mechanism: no English fallback here. A
  // caller that forgets the catalog labels gets a typed error through the
  // REPL error boundary, never a silently English menu.
  const menuMoreAbove = requireInjectedLabel('menuMoreAbove', props.menuMoreAbove);
  const menuMoreBelow = requireInjectedLabel('menuMoreBelow', props.menuMoreBelow);
  const reverseSearchLabel = requireInjectedLabel('reverseSearchLabel', props.reverseSearchLabel);
  const projectRoot = props.historyProjectRoot ?? process.cwd();
  const [state, setState] = useState<InputState>(EMPTY_INPUT);
  const [menuSel, setMenuSel] = useState(0);
  const [search, setSearch] = useState<{ q: string; idx: number } | null>(null);
  // TERM-AT-REF: `@` index of an Esc-dismissed token — the menu stays closed
  // for THAT token only; a new `@` (different index) reopens it.
  const [atDismissed, setAtDismissed] = useState<number | null>(null);
  const stateRef = useRef<InputState>(EMPTY_INPUT);
  const menuSelRef = useRef(0);
  const searchRef = useRef<{ q: string; idx: number } | null>(null);
  const atDismissedRef = useRef<number | null>(null);
  const history = useRef(new InputHistory()); // Ctrl-R search only — HistoryNavigator has no search()
  const persistentHistoryRef = useRef<HistoryController | null>(null);
  if (persistentHistoryRef.current === null) persistentHistoryRef.current = createHistoryController(projectRoot);
  const persistentHistory = persistentHistoryRef.current;
  const set = (s: InputState): void => { stateRef.current = s; setState(s); };
  const setSel = (n: number): void => { menuSelRef.current = n; setMenuSel(n); };
  const setSearchBoth = (s: { q: string; idx: number } | null): void => { searchRef.current = s; setSearch(s); };
  const setAtDismissedBoth = (n: number | null): void => { atDismissedRef.current = n; setAtDismissed(n); };

  useInput((input, key) => {
    if (process.env['DECKENT_INK_DEBUG'] === '1') {
      try { appendFileSync(debugKeylogPath(), JSON.stringify({ input, key }) + '\n'); } catch { /* ignore */ }
    }

    if (key.ctrl && (input === 'l' || input === '\f')) { onClear?.(); return; } // Ctrl-L → clear

    // ── TERMINAL-TOOLS-010: `?` shortcuts panel — only on an EMPTY composer,
    // so a `?` inside a sentence stays text. Esc or `?` closes it. ──
    if (shortcutsPanel) {
      if (shortcutsOpenRef.current && (key.escape || input === '?')) { setShortcuts(false); return; }
      if (input === '?' && !key.ctrl && !key.meta && stateRef.current.buffer.length === 0 && !searchRef.current) {
        setShortcuts(true);
        return;
      }
    }

    // ── Ctrl-R reverse history search ──
    if (key.ctrl && input === 'r') {
      const cur = searchRef.current;
      setSearchBoth(cur ? { q: cur.q, idx: cur.idx + 1 } : { q: '', idx: 0 }); // open, or cycle older
      return;
    }
    if (searchRef.current) {
      const s = searchRef.current;
      if (key.escape) { setSearchBoth(null); return; } // cancel, keep buffer
      if (key.return) {
        const hits = history.current.search(s.q);
        const m = hits.length > 0 ? (hits[s.idx % hits.length] ?? '') : '';
        setSearchBoth(null);
        if (m) set({ buffer: m, cursor: m.length });
        return;
      }
      if (key.backspace || key.delete) { setSearchBoth({ q: s.q.slice(0, -1), idx: 0 }); return; }
      if (input && !key.ctrl && !key.meta && !key.tab && input.charCodeAt(0) >= 0x20) { setSearchBoth({ q: s.q + input, idx: 0 }); return; }
      return; // swallow other keys while searching
    }

    // ── Interactive slash menu: intercept nav keys while it is open ──
    const matches = slashMenuMatches(slashRegistry, stateRef.current.buffer);
    if (matches.length > 0) {
      const n = matches.length;
      const sel = ((menuSelRef.current % n) + n) % n;
      if (key.upArrow) { setSel((sel - 1 + n) % n); return; }
      if (key.downArrow) { setSel((sel + 1) % n); return; }
      if (key.escape) { set(EMPTY_INPUT); setSel(0); return; }
      if (key.tab) { const name = matches[sel]?.name ?? ''; set({ buffer: name + ' ', cursor: name.length + 1 }); setSel(0); return; }
      if (key.return) { onSubmit(resolveMenuSubmit(stateRef.current.buffer, matches, sel)); set(EMPTY_INPUT); setSel(0); setAtDismissedBoth(null); return; }
      // any other key falls through to editInput → re-filters; reset selection
    }

    // ── TERM-AT-REF (583/N2b): interactive `@` path menu — mirrors the slash
    // block above (nav keys intercepted ONLY while it is open; Enter completes
    // the token instead of submitting, and is never stolen when closed).
    if (matches.length === 0) {
      const at = atMenuMatches(pathProvider, stateRef.current, atDismissedRef.current);
      if (at) {
        const n = at.matches.length;
        const sel = ((menuSelRef.current % n) + n) % n;
        if (key.upArrow) { setSel((sel - 1 + n) % n); return; }
        if (key.downArrow) { setSel((sel + 1) % n); return; }
        if (key.escape) { setAtDismissedBoth(at.token.start); setSel(0); return; } // close, keep buffer
        if (key.tab || key.return) {
          const chosen = at.matches[sel] ?? '';
          set(completeAtToken(stateRef.current.buffer, stateRef.current.cursor, at.token.start, chosen));
          setSel(0); setAtDismissedBoth(null);
          return;
        }
        // any other key falls through to editInput → re-filters; selection resets below
      }
    }

    // A batched chunk that contains a newline (a real lone Enter keystroke is
    // key.return, handled by editInput below) — classify via resolvePasteChunk.
    // (TERMINAL-TOOLS-009: a bare '\n' is the Ctrl-J newline key, not a paste.)
    if (!key.return && input !== '\n' && /[\r\n]/.test(input)) {
      const result = resolvePasteChunk(stateRef.current.buffer, input);
      if (result.kind === 'insert') {
        const s = stateRef.current;
        set({ buffer: s.buffer.slice(0, s.cursor) + result.text + s.buffer.slice(s.cursor), cursor: s.cursor + result.text.length });
      } else if (result.kind === 'submit') {
        history.current.push(result.line); // keep history (Ctrl-R) consistent with the lone-Enter path
        recordHistoryEntry(projectRoot, persistentHistory, result.line);
        onSubmit(result.line);
        set(EMPTY_INPUT);
        setAtDismissedBoth(null);
      } else {
        set(EMPTY_INPUT); // chunk was purely \r/\n bytes → no submit, no history pollution
      }
      return;
    }

    // TERMINAL-TOOLS-008 — a bare Esc reaching this point was consumed by no
    // menu: hand it to the caller (turn interrupt). Never edits the buffer.
    if (key.escape) { onEscape?.(); return; }

    const res = editInput(stateRef.current, inkToKey(input, key));
    if (res.signal === 'int') {
      const draftNonEmpty = stateRef.current.buffer.length > 0;
      set(EMPTY_INPUT); setAtDismissedBoth(null); setSel(0);
      onInterrupt('int', draftNonEmpty);
      return;
    }
    if (res.signal === 'eof') { onInterrupt('eof', false); return; }
    if (res.history) {
      set(resolveHistoryNav(persistentHistory.navigator, res.history, stateRef.current.buffer));
      return;
    }
    if (res.submit !== undefined) {
      history.current.push(res.submit);
      recordHistoryEntry(projectRoot, persistentHistory, res.submit);
      onSubmit(res.submit);
      set(EMPTY_INPUT);
      setAtDismissedBoth(null);
      return;
    }
    set(res.state);
    setSel(0); // buffer changed → re-filter from the top
    // TERM-AT-REF: an Esc-dismissal only pins THAT token — once the cursor's
    // active `@` token no longer starts at the dismissed index (token deleted,
    // or moved to another word), clear it so a fresh `@` reopens the menu.
    if (atDismissedRef.current !== null
        && activeAtQuery(res.state.buffer, res.state.cursor)?.start !== atDismissedRef.current) {
      setAtDismissedBoth(null);
    }
  }, { isActive: active });

  const matches = search ? [] : slashMenuMatches(slashRegistry, state.buffer);
  const sel = matches.length > 0 ? ((menuSel % matches.length) + matches.length) % matches.length : 0;

  // TERM-AT-REF: the `@` path menu — mutually exclusive with the slash menu
  // (same open-state resolution the key handler uses, so render == behavior).
  const atOpen = search || matches.length > 0 ? null : atMenuMatches(pathProvider, state, atDismissed);
  const atSel = atOpen ? ((menuSel % atOpen.matches.length) + atOpen.matches.length) % atOpen.matches.length : 0;

  // Reverse-search line (Ctrl-R): current match shown live as you refine the query.
  const searchHits = search ? history.current.search(search.q) : [];
  const searchMatch = searchHits.length > 0 ? (searchHits[search!.idx % searchHits.length] ?? '') : '';

  // claude-code-style framed input box, with the interactive menu ABOVE it.
  const keysWidth = shortcutsPanel ? Math.max(...shortcutsPanel.rows.map((r) => r.keys.length), 0) : 0;
  return (
    <Box flexDirection="column">
      {/* TERMINAL-TOOLS-010: `?` shortcuts panel (caller-built rows, no mechanism text). */}
      {shortcutsOpen && shortcutsPanel ? (
        <Box flexDirection="column" marginBottom={0}>
          <Text color={GOLD} bold>{`  ${shortcutsPanel.title}`}</Text>
          {shortcutsPanel.rows.map((row) => (
            <Text key={row.keys}>
              <Text color={TEAL}>{`  ${row.keys.padEnd(keysWidth)}`}</Text>
              <Text dimColor>{`  ${row.action}`}</Text>
            </Text>
          ))}
        </Box>
      ) : null}
      {search ? (
        <Box>
          <Text color={GOLD}>{`${reverseSearchLabel} `}</Text>
          <Text dimColor>{`'${search.q}': `}</Text>
          <Text>{searchMatch || '—'}</Text>
        </Box>
      ) : null}
      {matches.length > 0 && (() => {
        // Scroll window: keep the selected row visible even past the cap.
        const WINDOW = 8;
        const start = Math.max(0, Math.min(sel - (WINDOW >> 1), matches.length - WINDOW));
        const lo = Math.max(0, start);
        const visible = matches.slice(lo, lo + WINDOW);
        return (
          <Box flexDirection="column" marginBottom={0}>
            {lo > 0 ? <Text dimColor>{`  ${formatMenuMore(menuMoreAbove, lo)}`}</Text> : null}
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
            {lo + WINDOW < matches.length ? <Text dimColor>{`  ${formatMenuMore(menuMoreBelow, matches.length - lo - WINDOW)}`}</Text> : null}
            {menuHint ? <Text dimColor>{`  ${menuHint}`}</Text> : null}
          </Box>
        );
      })()}
      {/* TERM-AT-REF: the `@` path menu — filterAtPaths already caps at 8 rows
          (== the slash menu's WINDOW), so no scroll window is needed here. */}
      {atOpen && (
        <Box flexDirection="column" marginBottom={0}>
          {atOpen.matches.map((p, i) => (
            <Text key={p}>
              <Text color={i === atSel ? GOLD : TEAL}>{i === atSel ? '❯ ' : '  '}</Text>
              <Text color={i === atSel ? GOLD : undefined} bold={i === atSel}>{p}</Text>
            </Text>
          ))}
          {atMenuHint ? <Text dimColor>{`  ${atMenuHint}`}</Text> : null}
        </Box>
      )}
      <Box borderStyle="round" borderColor={TEAL} paddingX={1}>
        <Text color={TEAL}>{'› '}</Text>
        <CaretText state={state} caretStyle={props.caretStyle ?? 'inverse'} />
      </Box>
    </Box>
  );
}
