// src/cli/repl/picker-card.tsx
// ═══ TERMINAL-PICKER-001 — PickerCard: the thin Ink shell over picker.ts ═════
//
// Mounted in the bounded dynamic region (after InboxCard, before the mode
// indicator) whenever a bare selection command opened a PickerSpec. It is the
// LOWEST-priority stdin consumer: `isActive` is ANDed by the caller with every
// decision card (resolvePickerCardActive in app.tsx) — the stdin-ownership
// mutex `resolveStdinOwner` keeps its pinned 3-key shape.
//
// All navigation logic is pure (picker.ts). This file only: owns React state,
// applies effects through the injected callbacks, and renders. String-free:
// every label comes from the required `labels` prop (run.tsx buildPickerLabels);
// colors are supplements — every state has a word; `noColor` renders words only.

import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { PickerLabels } from './picker-labels.js';
import { displayWidth } from './cursor-model.js';
import {
  filterPickerCandidates, fitPickerRow, initialPickerNav, mapPickerKey, pickerBlockedReason,
  realignPickerSelection, reducePicker, resolveMenuWindow,
  type PickerGlyphs, type PickerNav, type PickerScope, type PickerSpec,
} from './picker.js';

/** Focus color — the GOLD the slash-menu and inbox use for their cursor. */
const SELECTED_COLOR = '#C4A855';
/** Card border — the TEAL of the inbox list card. */
const BORDER_COLOR = '#4DB8A4';
/** Border (2) + paddingX (2) cells the Box consumes around the content. */
const FRAME_CELLS = 4;
/** Cursor gutter cells before each row. */
const GUTTER_CELLS = 2;
const MAX_WINDOW_ROWS = 10;
/** Rows the frame needs besides the list (title, filter, scope, hints, border). */
const RESERVED_ROWS = 9;
const COMPACT_BELOW_ROWS = 6;

export interface PickerCardProps {
  readonly spec: PickerSpec;
  readonly labels: PickerLabels;
  readonly glyphs: PickerGlyphs;
  /** Terminal display columns (useTerminalColumns) — rows fit to it. */
  readonly columns: number;
  /** Terminal rows — bounds the visible window (`min(10, rows − 9)`). */
  readonly rows: number;
  /** Stdin-ownership mutex gate (ANDed by the caller). Default true. */
  readonly isActive?: boolean;
  /** Words only: no color, no dim (NO_COLOR / dumb terminal). */
  readonly noColor?: boolean;
  /** When set, Enter never commits — the reason renders in-card (e.g. a busy turn). */
  readonly readOnlyReason?: string | null;
  readonly onCommit: (id: string, scope: PickerScope) => void;
  readonly onClose: () => void;
  readonly onInterrupt: () => void;
}

export function PickerCard(props: PickerCardProps): ReactElement {
  const { spec, labels, glyphs, columns, rows, isActive = true, noColor = false, readOnlyReason = null, onCommit, onClose, onInterrupt } = props;
  const [nav, setNav] = useState<PickerNav>(() => initialPickerNav(spec));
  const navRef = useRef(nav);
  const [notice, setNotice] = useState<string | null>(null);
  const setNavBoth = (next: PickerNav): void => { navRef.current = next; setNav(next); };

  // A new spec (another command, refreshed candidates) restarts navigation.
  useEffect(() => { setNavBoth(initialPickerNav(spec)); setNotice(null); }, [spec]);

  const windowRows = Math.max(1, Math.min(MAX_WINDOW_ROWS, rows - RESERVED_ROWS));
  const compact = windowRows < COMPACT_BELOW_ROWS;

  useInput((input, key) => {
    const current = navRef.current;
    const action = mapPickerKey(input, key, { queryEmpty: current.query.length === 0, stage: current.stage });
    if (action === null) return;
    if (action.kind === 'select' && readOnlyReason) { setNotice(readOnlyReason); return; }
    const { nav: next, effect } = reducePicker(current, action, spec, windowRows);
    setNavBoth(next);
    if (effect === null) { if (action.kind !== 'select') setNotice(null); return; }
    switch (effect.kind) {
      case 'commit': setNotice(null); onCommit(effect.id, effect.scope); return;
      case 'blocked':
        // The focused blocked row already carries its reason line under the
        // cursor — a second copy as a notice would render the reason twice.
        setNotice(null);
        return;
      case 'close': onClose(); return;
      case 'interrupt': onInterrupt(); return;
      default: return;
    }
  }, { isActive });

  const filtered = filterPickerCandidates(spec.candidates, nav.query);
  const selectedId = realignPickerSelection(nav.selectedId, filtered);
  const idx = Math.max(0, filtered.findIndex((c) => c.id === selectedId));
  const { lo, hi } = resolveMenuWindow(filtered.length, idx, windowRows);
  const visible = filtered.slice(lo, hi);
  const rowCells = Math.max(8, columns - FRAME_CELLS - GUTTER_CELLS);
  // TERMINAL-PICKER-007 — one label column for the visible window (capped at
  // half the row) so facts and state tags line up (§7 alignment before color).
  const labelWidth = Math.min(Math.floor(rowCells / 2), Math.max(0, ...visible.map((c) => displayWidth(c.label))));
  const title = labels.title[spec.kind].replace('{key}', spec.titleSubject ?? '');
  const hint = nav.stage === 'scope' ? labels.hintScope : nav.query.length > 0 ? labels.hintFilterEsc : labels.hintPick;
  const focus = noColor ? {} : { color: SELECTED_COLOR };
  const dim = noColor ? {} : { dimColor: true };
  const border = noColor ? {} : { borderColor: BORDER_COLOR };
  const scopeLine = nav.stage === 'scope'
    ? spec.scopes.map((s, i) => `${i === nav.scopeIdx ? glyphs.on : glyphs.off} ${labels.scopes[s]}`).join('   ')
    : null;

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} width={columns} {...border}>
      <Text bold={!noColor}>{title}</Text>
      {nav.query.length > 0 && <Text {...dim}>{labels.hintFilter.replace('{query}', nav.query)}</Text>}
      {filtered.length === 0 && <Text>{labels.empty}</Text>}
      {lo > 0 && <Text {...dim}>{`${' '.repeat(GUTTER_CELLS)}${labels.more.replace('{glyph}', glyphs.up).replace('{n}', String(lo))}`}</Text>}
      {visible.map((c) => {
        const focused = c.id === selectedId;
        // The state tag is the short word only; a blocked row's typed reason
        // renders on its own line under the cursor (never inside the tag, so a
        // long reason can never eat the label).
        const fit = fitPickerRow({ label: c.label, facts: compact ? [] : c.facts.map((f) => f.value), state: labels.states[c.state] }, rowCells, { labelWidth });
        const gutter = focused ? `${glyphs.cursor} ` : ' '.repeat(GUTTER_CELLS);
        return (
          <Box key={c.id} flexDirection="column">
            <Text {...(focused ? focus : {})}>{`${gutter}${fit.line}`}</Text>
            {focused && fit.truncated && (
              <Text {...dim}>{`${' '.repeat(GUTTER_CELLS)}${labels.reveal.replace('{glyph}', glyphs.reveal).replace('{id}', c.id)}`}</Text>
            )}
            {focused && c.state === 'blocked' && (
              <Text {...dim}>{`${' '.repeat(GUTTER_CELLS)}${pickerBlockedReason(c.blockedCode ?? 'BLOCKED', labels, c.detail)}`}</Text>
            )}
            {focused && c.detail && c.state !== 'blocked' && (
              <Text {...dim}>{`${' '.repeat(GUTTER_CELLS)}${c.detail}`}</Text>
            )}
          </Box>
        );
      })}
      {hi < filtered.length && <Text {...dim}>{`${' '.repeat(GUTTER_CELLS)}${labels.more.replace('{glyph}', glyphs.down).replace('{n}', String(filtered.length - hi))}`}</Text>}
      {scopeLine !== null && <Text>{scopeLine}</Text>}
      {notice !== null && <Text>{notice}</Text>}
      <Text {...dim}>{hint}</Text>
    </Box>
  );
}
