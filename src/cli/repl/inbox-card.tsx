// ═══ InboxCard — live-refreshing run-flow inbox (SURF-3 multi-flow-inbox D3a) ═
//
// D1/D2 push a STATIC `/runs` snapshot to the transcript (one shot, freezes).
// D3a adds a persistent, self-refreshing surface: `/runs --follow` mounts this
// card in the dynamic region (below <Static>, the same slot as PlanPreviewCard /
// the live footer) and it re-polls `feed()` on an interval, re-rendering in
// place — the user sees state changes without re-typing `/runs`. Esc closes it.
//
// Deliberately VIEW-ONLY (D3a): no row selection / focus-nav — that heavy
// stdin-ownership work is D3b. This card owns stdin only for Esc, so it slots in
// as the LOWEST-priority consumer (defers to the confirm modal, ApprovalCard,
// and PlanPreviewCard via `isActive`, ANDed at the app.tsx call site — the
// resolveStdinOwner 3-key return is NOT extended, mirroring PlanPreviewCard).
//
// Copies PlanPreviewCard's structure: a thin Ink component over pure helpers
// that live elsewhere (collectInboxRows / buildInboxLines in run-flow-inbox.ts,
// already unit-tested). ink-testing-library is not a project dep, so the render
// itself is manual-verify (`/runs --follow`) — the same accepted limitation as
// ApprovalCard / PlanPreviewCard. `feed` returns pre-rendered lines so this
// component stays string-free (labels are applied upstream in run.tsx).

import { Box, Text, useInput } from 'ink';
import { useEffect, useState, type ReactElement } from 'react';

export interface InboxCardProps {
  /** When false the card renders nothing and owns no stdin (mirrors
   *  PlanPreviewCard's `preview === null`). */
  open: boolean;
  /** Returns the CURRENT rendered inbox lines (buildInboxLines(collectInboxRows(...))
   *  applied upstream). Polled on an interval while open. */
  feed: () => string[];
  /** Localized footer hint, e.g. "⟳ live · Esc to close". */
  followHint: string;
  /** Called on Esc — the caller closes the card (sets `open` false). */
  onClose: () => void;
  /** Stdin-ownership mutex gate (mirrors PlanPreviewCardProps.isActive) — the
   *  caller ANDs it with the higher-priority consumers. Default true. */
  isActive?: boolean;
  /** Poll cadence (ms). Default 1000 — same as the live-footer stateFeed. */
  pollMs?: number;
}

export function InboxCard(props: InboxCardProps): ReactElement | null {
  const { open, feed, followHint, onClose, isActive: mutexActive = true, pollMs = 1000 } = props;
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!open) { setLines([]); return; }
    const tick = (): void => setLines(feed());
    tick(); // render the first snapshot immediately, before the interval fires
    const id = setInterval(tick, pollMs);
    return () => clearInterval(id);
  }, [open, feed, pollMs]);

  useInput((_input, key) => {
    if (key.escape) onClose();
  }, { isActive: open && mutexActive });

  if (!open) return null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#4DB8A4" paddingX={1}>
      {lines.map((line, i) => (
        <Text key={`${i}-${line}`}>{line}</Text>
      ))}
      <Text dimColor>{followHint}</Text>
    </Box>
  );
}
