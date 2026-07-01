// ═══ ApprovalCard — Ink card for the runtime-wide ApprovalBroker (APR-SHELLCLIENT) ═══
//
// Subscribes to an ApprovalEventStream client's `events` (core, READ-ONLY — this
// module owns zero broker/stream internals, only their public types) and renders
// the oldest pending ApprovalRequest as a single card: risk badge + maskedArgs
// summary + a queue counter. y/n/a/d resolve it via a seam-injected `onDecide`
// (mirrors `ApprovalBroker.decide`'s signature — the caller wires the real
// broker; tests supply a stub). Subscribe/unsubscribe lifecycle, clientId choice,
// and identity (decidedBy/channel) plumbing are App-wiring follow-up work (see
// task description) — this module is the card + its pure logic only.
//
// Never renders `rawArgsRef` — it isn't even imported/resolved here, so raw args
// cannot leak through this surface by construction. `maskedArgs`/`details` are
// the contract's own safe-to-display fields (APR-4 redaction + "full detail for
// the dashboard/detail view").
//
// i18n-first: string-free — every user-facing label arrives via `labels` props.

import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { ApprovalRequest, ApprovalRisk } from '../../core/approval-contract.js';
import type { ApprovalDecisionInput } from '../../core/approval-broker.js';
import type { ApprovalStreamEvent } from '../../core/approval-eventstream.js';

// ─── Pure queue controller (framework-free — unit-testable without Ink) ─────

/** The card to render now (queue head) + its position within the active burst.
 *  Same "burst" model as app.tsx's `ConfirmHead`: `index`/`total` track how many
 *  of the current run have been resolved so far, resetting once the queue drains. */
export interface ApprovalCardHead {
  request: ApprovalRequest;
  index: number;
  total: number;
}

export interface ApprovalCardQueue {
  /** Ingest one stream event: `pending` appends/upserts, `cross-decided` retires
   *  (resolved by ANOTHER channel — e.g. dashboard), `dropped` is a backpressure
   *  counter-only signal and is ignored here. */
  ingest(event: ApprovalStreamEvent): void;
  /** The card to show now, or null when the queue is empty. */
  head(): ApprovalCardHead | null;
  /** Pending count (including the shown head). */
  size(): number;
  /** Retire `id` locally — called once THIS card has sent its decision.
   *  Advances the burst counter. */
  resolve(id: string): void;
  /** Every OTHER still-pending request sharing `id`'s `scopeId` — the
   *  "approve-all-similar" cascade set (mirrors ConfirmQueue's `toolName` cascade
   *  key, the closest existing precedent for "same action class"). */
  similarTo(id: string): ApprovalRequest[];
  /** The full "approve-all-similar" (`a`) operation: resolves `id` AND every
   *  `similarTo` match, returning every resolved request (target first, then
   *  cascade members in queue order) so the caller can send a decision for each. */
  resolveSimilar(id: string): ApprovalRequest[];
}

/**
 * Pure FIFO approval queue, string-free and React-free by design — exactly the
 * pattern app.tsx's `createConfirmQueue` established for the same reason
 * (ink-testing-library is not available in this environment; see
 * tests/cli/repl-confirm-queue.test.ts and tests/cli/repl/ink-stabilize.test.ts).
 * `onChange` drives the owning component's re-render (React setState).
 */
export function createApprovalCardQueue(onChange: () => void): ApprovalCardQueue {
  const order: string[] = []; // arrival order of ids, oldest-first
  const byId = new Map<string, ApprovalRequest>();
  let answered = 0; // resolved so far in the current burst (drives index/total)

  const head = (): ApprovalCardHead | null => {
    const id = order[0];
    if (id === undefined) return null;
    const request = byId.get(id);
    if (!request) return null;
    return { request, index: answered + 1, total: answered + order.length };
  };

  const ingest = (event: ApprovalStreamEvent): void => {
    if (event.kind === 'dropped') return;
    const id = event.request.id;
    if (event.kind === 'pending') {
      if (!byId.has(id)) order.push(id);
      byId.set(id, event.request);
    } else {
      byId.delete(id);
      const idx = order.indexOf(id);
      if (idx !== -1) order.splice(idx, 1);
      if (order.length === 0) answered = 0;
    }
    onChange();
  };

  const resolveFn = (id: string): void => {
    const idx = order.indexOf(id);
    if (idx === -1) return;
    order.splice(idx, 1);
    byId.delete(id);
    answered += 1;
    if (order.length === 0) answered = 0;
    onChange();
  };

  const similarTo = (id: string): ApprovalRequest[] => {
    const target = byId.get(id);
    if (!target) return [];
    const out: ApprovalRequest[] = [];
    for (const otherId of order) {
      if (otherId === id) continue;
      const req = byId.get(otherId);
      if (req && req.scopeId === target.scopeId) out.push(req);
    }
    return out;
  };

  const resolveSimilar = (id: string): ApprovalRequest[] => {
    const target = byId.get(id);
    if (!target) return [];
    const cascade = similarTo(id);
    resolveFn(id);
    for (const req of cascade) resolveFn(req.id);
    return [target, ...cascade];
  };

  return { ingest, head, size: () => order.length, resolve: resolveFn, similarTo, resolveSimilar };
}

// ─── Pure key mapper (framework-free — unit-testable without Ink) ───────────

export type ApprovalCardAction = 'approve' | 'deny' | 'approve-all' | 'details';

/** Map a raw `useInput` keypress to a card action. Case-insensitive; any other
 *  key is a no-op (returns null) — unlike app.tsx's 3-way confirm modal (which
 *  treats "anything but y/a" as deny), this card has 4 distinct actions, so an
 *  unmapped key must never silently deny. */
export function mapApprovalKey(input: string): ApprovalCardAction | null {
  switch (input.toLowerCase()) {
    case 'y': return 'approve';
    case 'n': return 'deny';
    case 'a': return 'approve-all';
    case 'd': return 'details';
    default: return null;
  }
}

// ─── Rendering helpers ────────────────────────────────────────────────────────

/** No existing risk-color convention in this codebase to reuse — chosen to read
 *  as an ascending-severity ladder alongside app.tsx's TEAL/GOLD palette. */
const RISK_COLORS: Record<ApprovalRisk, string> = {
  none: '#6B7280',
  low: '#4DB8A4',
  medium: '#C4A855',
  high: '#E08A3C',
  critical: '#E0524D',
};

const MAX_SUMMARY_LEN = 80;

function formatArgValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Compact one-line rendering of maskedArgs for the collapsed card. */
function summarizeMaskedArgs(maskedArgs: Record<string, unknown>): string {
  const flat = Object.entries(maskedArgs)
    .map(([key, value]) => `${key}=${formatArgValue(value)}`)
    .join(' ');
  return flat.length > MAX_SUMMARY_LEN ? `${flat.slice(0, MAX_SUMMARY_LEN - 1)}…` : flat;
}

// ─── Props ──────────────────────────────────────────────────────────────────

/** Localized labels — injected by the caller (i18n-first; component is string-free). */
export interface ApprovalCardLabels {
  /** e.g. "(y = onayla · n = reddet · a = benzerlerini onayla · d = detay)" */
  hint: string;
  /** i18n template, e.g. "[{index}/{total}]" */
  progress: string;
  /** Heading shown above the expanded (`d`) detail view. */
  detailsHeading: string;
  /** Shown in place of the maskedArgs summary when the request carries none. */
  noArgs: string;
  /** Badge text per risk tier. */
  riskLabels: Record<ApprovalRisk, string>;
}

export interface ApprovalCardProps {
  /** A single client's filtered/backfilled event stream — typically
   *  `ApprovalEventStream.subscribe(clientId, filter).events`. This component
   *  owns no subscribe/unsubscribe lifecycle of its own (App-wiring follow-up). */
  events: AsyncIterable<ApprovalStreamEvent>;
  /** Seam-injected decide callback — mirrors `ApprovalBroker.decide`'s second
   *  argument shape. Pass `broker.decide.bind(broker)` in production. */
  onDecide: (id: string, input: ApprovalDecisionInput) => void;
  /** Stamped on every decision this card produces (`ApprovalDecision.decidedBy`). */
  decidedBy: string;
  /** Stamped on every decision this card produces (`ApprovalDecision.channel`). */
  channel: string;
  labels: ApprovalCardLabels;
}

// ─── ApprovalCard ───────────────────────────────────────────────────────────

export function ApprovalCard(props: ApprovalCardProps): ReactElement | null {
  const { events, onDecide, decidedBy, channel, labels } = props;
  const [head, setHead] = useState<ApprovalCardHead | null>(null);
  const [expanded, setExpanded] = useState(false);
  const queueRef = useRef<ApprovalCardQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = createApprovalCardQueue(() => setHead(queueRef.current!.head()));
  }

  useEffect(() => {
    let cancelled = false;
    const iterator = events[Symbol.asyncIterator]();
    void (async () => {
      while (!cancelled) {
        const result = await iterator.next();
        if (cancelled || result.done) break;
        queueRef.current!.ingest(result.value);
      }
    })();
    return () => {
      cancelled = true;
      void iterator.return?.();
    };
  }, [events]);

  const sendDecision = (request: ApprovalRequest, decision: 'allow' | 'deny'): void => {
    onDecide(request.id, { decision, decidedBy, channel, decidedAt: new Date().toISOString(), reason: '' });
  };

  useInput((input) => {
    const current = queueRef.current!.head();
    if (!current) return;
    const { request } = current;
    switch (mapApprovalKey(input)) {
      case 'approve':
        sendDecision(request, 'allow');
        queueRef.current!.resolve(request.id);
        setExpanded(false);
        return;
      case 'deny':
        sendDecision(request, 'deny');
        queueRef.current!.resolve(request.id);
        setExpanded(false);
        return;
      case 'approve-all': {
        const resolved = queueRef.current!.resolveSimilar(request.id);
        for (const r of resolved) sendDecision(r, 'allow');
        setExpanded(false);
        return;
      }
      case 'details':
        setExpanded((e) => !e);
        return;
      default:
        return;
    }
  }, { isActive: head !== null });

  if (!head) return null;

  const { request, index, total } = head;
  const riskColor = RISK_COLORS[request.risk];

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={riskColor} paddingX={1}>
      <Box>
        <Text color={riskColor} bold>{`${labels.riskLabels[request.risk]} `}</Text>
        <Text>{request.summary}</Text>
      </Box>
      <Text dimColor>{request.maskedArgs ? summarizeMaskedArgs(request.maskedArgs) : labels.noArgs}</Text>
      {expanded && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{labels.detailsHeading}</Text>
          <Text>{JSON.stringify(request.maskedArgs ?? {}, null, 2)}</Text>
          <Text>{JSON.stringify(request.details, null, 2)}</Text>
        </Box>
      )}
      <Text dimColor>
        {`${labels.progress.replace('{index}', String(index)).replace('{total}', String(total))} ${labels.hint}`}
      </Text>
    </Box>
  );
}
