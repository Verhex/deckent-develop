// ═══ InboxCard — live, focus-navigable run-flow inbox (SURF-3 D3a + D3b) ═════
//
// D1/D2 push a STATIC `/runs` snapshot to the transcript (one shot, freezes).
// D3a added a persistent, self-refreshing card: `/runs --follow` mounts this in
// the dynamic region (below <Static>, the same slot as PlanPreviewCard / the
// live footer), re-polling `feed()` on an interval and re-rendering in place.
// D3b makes it INTERACTIVE: ↑↓ move a row cursor, ↵ opens the focused run's
// detail block in-card, Esc closes the detail (then, from the list, the card).
//
// STDIN OWNERSHIP is unchanged from D3a: this card is the LOWEST-priority
// consumer (defers to the confirm modal, ApprovalCard and PlanPreviewCard via
// `isActive`, ANDed at the app.tsx call site — `resolveStdinOwner`'s 3-key
// return is NOT extended). D3b only adds ↑↓/↵ branches to the SAME already-gated
// `useInput` handler — no mutex change.
//
// The navigation LOGIC (key map, selection reducer, poll-realign) is pure and
// unit-tested in run-flow-inbox.ts (mapInboxKey / reduceInboxNav /
// realignInboxSelection). This component is the thin render + stdin shell,
// mirroring ApprovalCard's queue-controller/card split. Row bodies come from the
// SAME formatInboxRowBody the transcript path renders (one source of truth); the
// card only prepends its focus gutter. i18n-first: string-free — every label
// arrives via `labels` (defaulting to the English DEFAULT_INBOX_LABELS, the same
// fallback-until-wired precedent ApprovalCard/PlanPreviewCard use).

import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { InboxRow, InboxLabels, InboxNavState, InboxDecisionVerb } from './run-flow-inbox.js';
import {
  DEFAULT_INBOX_LABELS,
  EMPTY_INBOX_NAV,
  formatInboxRowBody,
  buildInboxDetailLines,
  mapInboxKey,
  reduceInboxNav,
  realignInboxSelection,
  decidableInboxVerbs,
  mapInboxDecisionKey,
} from './run-flow-inbox.js';

/** Focus-highlight color for the selected row — the GOLD the slash-menu uses for
 *  its own selection cursor (app-wide selected-item convention). */
const SELECTED_COLOR = '#C4A855';
/** The list card's border (D3a teal). */
const LIST_BORDER = '#4DB8A4';

export interface InboxCardProps {
  /** When false the card renders nothing and owns no stdin (mirrors
   *  PlanPreviewCard's `preview === null`). */
  open: boolean;
  /** Returns the CURRENT structured rows (collectInboxRows(...)). Polled on an
   *  interval while open — the card renders + highlights them itself. */
  feed: () => InboxRow[];
  /** Localized labels — row/detail rendering + footer hints (i18n-first).
   *  Defaults to the English DEFAULT_INBOX_LABELS when the caller omits it. */
  labels?: InboxLabels;
  /** Called on Esc while the LIST is showing — the caller closes the card.
   *  (Esc while a detail is open just collapses the detail, handled in-card.) */
  onClose: () => void;
  /** Stdin-ownership mutex gate (mirrors PlanPreviewCardProps.isActive) — the
   *  caller ANDs it with the higher-priority consumers. Default true. */
  isActive?: boolean;
  /** Poll cadence (ms). Default 1000 — same as the live-footer stateFeed. */
  pollMs?: number;
  /** SURF-6 in-card decision executor (run.tsx wires the shared decision
   *  service). Returns the honest one-line outcome (success OR refusal) shown
   *  under the detail; the next poll shows the durable state itself. When
   *  absent, the decision keys are inert (view-only card, D3b behavior). */
  onDecide?: (flowId: string, verb: InboxDecisionVerb) => string;
}

export function InboxCard(props: InboxCardProps): ReactElement | null {
  const { open, feed, labels = DEFAULT_INBOX_LABELS, onClose, isActive: mutexActive = true, pollMs = 1000, onDecide } = props;
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [nav, setNav] = useState<InboxNavState>(EMPTY_INBOX_NAV);
  // SURF-6: the last decision outcome line (honest success/refusal) — cleared
  // on any nav action so a stale verdict never sits under a different run.
  const [decideNotice, setDecideNotice] = useState<string | null>(null);
  // Refs mirror the state so the useInput callback (a stable closure) always
  // reads the LATEST rows/nav — the menuSelRef pattern from input-bar.tsx.
  const rowsRef = useRef<InboxRow[]>([]);
  const navRef = useRef<InboxNavState>(EMPTY_INBOX_NAV);
  const setRowsBoth = (r: InboxRow[]): void => { rowsRef.current = r; setRows(r); };
  const setNavBoth = (s: InboxNavState): void => { navRef.current = s; setNav(s); };

  useEffect(() => {
    if (!open) { setRowsBoth([]); setNavBoth(EMPTY_INBOX_NAV); return; }
    const tick = (): void => {
      const next = feed();
      setRowsBoth(next);
      // Keep the highlight glued to its run across live-refresh reorders.
      const selectedFlowId = realignInboxSelection(navRef.current.selectedFlowId, next);
      if (selectedFlowId !== navRef.current.selectedFlowId) {
        setNavBoth({ ...navRef.current, selectedFlowId });
      }
    };
    tick(); // first snapshot immediately, before the interval fires
    const id = setInterval(tick, pollMs);
    return () => clearInterval(id);
  }, [open, feed, pollMs]);

  useInput((input, key) => {
    const action = mapInboxKey(input, key);
    if (action) {
      // Esc on the LIST closes the card; Esc on a detail collapses it (reducer).
      if (action === 'close' && !navRef.current.detailOpen) { onClose(); return; }
      setDecideNotice(null);
      setNavBoth(reduceInboxNav(navRef.current, action, rowsRef.current));
      return;
    }
    // SURF-6: decision keys — DETAIL view only (the operator has the run's
    // facts in front of them), and only for verbs the focused row offers.
    if (!onDecide || !navRef.current.detailOpen) return;
    const verb = mapInboxDecisionKey(input);
    if (!verb) return;
    const focusedId = realignInboxSelection(navRef.current.selectedFlowId, rowsRef.current);
    const row = rowsRef.current.find((r) => r.flowId === focusedId);
    if (!row || !decidableInboxVerbs(row).includes(verb)) return;
    setDecideNotice(onDecide(row.flowId, verb));
  }, { isActive: open && mutexActive });

  if (!open) return null;

  const selectedFlowId = realignInboxSelection(nav.selectedFlowId, rows);
  const selectedRow = rows.find((r) => r.flowId === selectedFlowId);

  // ── Detail view — the focused run's detail block + decision keys + hints. ──
  if (nav.detailOpen && selectedRow) {
    const verbs = onDecide ? decidableInboxVerbs(selectedRow) : [];
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={SELECTED_COLOR} paddingX={1}>
        {buildInboxDetailLines(selectedRow, labels).map((line, i) => (
          <Text key={`detail-${i}-${line}`}>{line}</Text>
        ))}
        {decideNotice !== null && <Text>{decideNotice}</Text>}
        {verbs.includes('approve') && <Text dimColor>{labels.decideHintAwaiting}</Text>}
        {verbs.includes('start') && !verbs.includes('approve') && <Text dimColor>{labels.decideHintApproved}</Text>}
        <Text dimColor>{labels.followDetailHint}</Text>
      </Box>
    );
  }

  // ── List view — header + rows (focused row gets a ❯ gutter + color). ──
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={LIST_BORDER} paddingX={1}>
      {rows.length === 0 ? (
        <Text>{labels.empty}</Text>
      ) : (
        <>
          <Text>{labels.header}</Text>
          {rows.map((row, i) => {
            const focused = row.flowId === selectedFlowId;
            return (
              <Text key={row.flowId} color={focused ? SELECTED_COLOR : undefined}>
                {(focused ? '❯ ' : '  ') + formatInboxRowBody(row, i, labels)}
              </Text>
            );
          })}
        </>
      )}
      <Text dimColor>{labels.followNavHint}</Text>
    </Box>
  );
}
