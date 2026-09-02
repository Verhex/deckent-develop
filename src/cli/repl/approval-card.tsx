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
import type { ApprovalRequest, ApprovalRequestV2, ApprovalRisk } from '../../core/approval-contract.js';
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

function formatArgValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** One-line `key=value` rendering of maskedArgs for the collapsed card.
 *  TERMINAL-TOOLS-013: never truncated — the operator decides with `y` from
 *  this view (§6 "no one-key decision from an unseen summary"); Ink wraps it to
 *  the terminal's display cells, the old fixed 80-character ceiling was exactly
 *  the §10.2 #5 class of defect. */
function summarizeMaskedArgs(maskedArgs: Record<string, unknown>): string {
  return Object.entries(maskedArgs)
    .map(([key, value]) => `${key}=${formatArgValue(value)}`)
    .join(' ');
}

// ─── §4 shared focus-rail facts (TERMINAL-TOOLS-012) ─────────────────────────
//
// Single-surface contract §4 "Approval": requestor and responsible principal ·
// proposed action and affected resource · tenant/workspace and bounded scope ·
// source policy and effective authority · expiry, risk and timeout/default
// outcome · downstream consequence and known rollback/reconciliation limit ·
// safe, redacted arguments. Every row is a pure projection of the contract;
// a fact the producer did not declare renders as `notDeclared` — never invented.

/** Localized fact labels (all required — i18n-first, no English defaults). */
export interface ApprovalFactLabels {
  requester: string;
  action: string;
  tenant: string;
  policy: string;
  lifecycle: string;
  expiry: string;
  consequence: string;
  rollback: string;
  /** §4 "identity, current condition and age" — the row label ("requested"). */
  age: string;
  /** Template with `{duration}` (e.g. "{duration} ago") — minute-grained. */
  ago: string;
  /** Age under a minute ("just now") — the age row never ticks per second. */
  justNow: string;
  /** Rendered when `details.consequence` / `details.rollbackLimit` are absent. */
  notDeclared: string;
  /** Worded relation templates (TERMINAL-TOOLS-013: no structural arrow in the
   *  mechanism): `{remaining}` + `{outcome}`, and `{outcome}` for the expired case. */
  expiryOutcome: string;
  expiredOutcome: string;
  units: { hours: string; minutes: string; seconds: string };
  policyLabels: Record<ApprovalRequest['policy'], string>;
  actionLabels: Record<ApprovalRequest['defaultAction'], string>;
  scopeLabels: Record<ApprovalRequest['scope'], string>;
  riskTierLabels: Record<ApprovalRequestV2['riskTier'], string>;
  blockingLabels: Record<ApprovalRequestV2['blocking'], string>;
  originLabels: Record<ApprovalRequestV2['origin'], string>;
  slaStageLabels: Record<ApprovalRequestV2['slaStage'], string>;
  timeoutDispositionLabels: Record<ApprovalRequestV2['lifecycleProfile']['timeoutDisposition'], string>;
}

export type ApprovalFactKey = 'action' | 'requester' | 'tenant' | 'policy' | 'lifecycle' | 'age' | 'expiry' | 'consequence' | 'rollback';
/** `emphasis` — rendered at normal weight instead of dim: the object of the
 *  decision (action · resource) always; an UNDECLARED consequence/rollback on a
 *  high/critical request (the absence is itself a fact the operator must weigh). */
export interface ApprovalFact { key: ApprovalFactKey; label: string; value: string; emphasis: boolean }

/**
 * Quiet, coarse-to-fine duration with catalog unit suffixes; the past clamps to
 * zero. Minute-grained above a minute (a pending approval is not a stopwatch —
 * terminal-design: "avoid rapid live-region-like churn"); second-grained only
 * inside the last minute, where the exception legitimately changes pace.
 */
export function formatRemaining(ms: number, units: ApprovalFactLabels['units']): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}${units.hours} ${m}${units.minutes}`;
  if (m > 0) return `${m}${units.minutes}`;
  return `${total}${units.seconds}`;
}

/** Age of the request — never second-grained (an approval's age is context, not urgency). */
export function formatAge(ms: number, f: Pick<ApprovalFactLabels, 'ago' | 'justNow' | 'units'>): string {
  return ms < 60_000 ? f.justNow : f.ago.replace('{duration}', formatRemaining(ms, f.units));
}

const isV2 = (request: ApprovalRequest): request is ApprovalRequestV2 => 'origin' in request;
const HIGH_RISK: ReadonlySet<ApprovalRisk> = new Set<ApprovalRisk>(['high', 'critical']);

/** The §4 field set for one request at `nowMs` (pure — unit-testable without Ink). */
export function buildApprovalFacts(request: ApprovalRequest, labels: ApprovalCardLabels, nowMs: number): ApprovalFact[] {
  const f = labels.facts;
  const weighty = HIGH_RISK.has(request.risk);
  const declared = (key: 'consequence' | 'rollbackLimit'): { value: string; emphasis: boolean } => {
    const value = request.details[key];
    return typeof value === 'string' && value.trim().length > 0
      ? { value, emphasis: false }
      : { value: f.notDeclared, emphasis: weighty };
  };
  const outcome = f.actionLabels[request.defaultAction];
  const remainingMs = Date.parse(request.expiresAt) - nowMs;
  let expiry = remainingMs > 0
    ? f.expiryOutcome.replace('{remaining}', formatRemaining(remainingMs, f.units)).replace('{outcome}', outcome)
    : f.expiredOutcome.replace('{outcome}', outcome);
  if (isV2(request)) expiry += ` (${f.timeoutDispositionLabels[request.lifecycleProfile.timeoutDisposition]})`;
  const facts: ApprovalFact[] = [
    { key: 'action', label: f.action, value: `${f.scopeLabels[request.scope]} · ${request.scopeId}`, emphasis: true },
    { key: 'requester', label: f.requester, value: `${request.requester.role} · ${request.requester.instanceId}`, emphasis: false },
    { key: 'tenant', label: f.tenant, value: `${request.tenantId} · ${request.userId}`, emphasis: false },
    { key: 'policy', label: f.policy, value: f.policyLabels[request.policy], emphasis: false },
  ];
  if (isV2(request)) {
    facts.push({
      key: 'lifecycle',
      label: f.lifecycle,
      value: `${f.originLabels[request.origin]} · ${f.riskTierLabels[request.riskTier]} · ${f.blockingLabels[request.blocking]} · ${f.slaStageLabels[request.slaStage]}`,
      emphasis: false,
    });
  }
  facts.push(
    { key: 'age', label: f.age, value: formatAge(nowMs - Date.parse(request.createdAt), f), emphasis: false },
    { key: 'expiry', label: f.expiry, value: expiry, emphasis: false },
    { key: 'consequence', label: f.consequence, ...declared('consequence') },
    { key: 'rollback', label: f.rollback, ...declared('rollbackLimit') },
  );
  return facts;
}

/** The time-derived carrier of the card at `nowMs` — the countdown re-renders
 *  ONLY when this string changes (once a minute above a minute). */
function timeCarrier(request: ApprovalRequest, f: ApprovalFactLabels, nowMs: number): string {
  return `${formatRemaining(Date.parse(request.expiresAt) - nowMs, f.units)}|${formatAge(nowMs - Date.parse(request.createdAt), f)}`;
}

/** Clock poll cadence while a card is pending (unref'd — never keeps the process alive). */
const FACTS_REFRESH_MS = 1000;

// ─── Props ──────────────────────────────────────────────────────────────────

/** Localized labels — injected by the caller (i18n-first; component is string-free). */
export interface ApprovalCardLabels {
  /** TERMINAL-TOOLS-012 — §4 fact rows (see {@link buildApprovalFacts}). */
  facts: ApprovalFactLabels;
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
  /** born-697 (SURF-3 approval last-mile) — called once per resolved request
   *  right AFTER its decision is sent, so the caller can render a visible
   *  closure line ("✅ Approved — …" / "✖ Rejected — …"). Without it, a terminal
   *  approve/deny silently retired the card with no confirmation. Optional —
   *  omitting it keeps every existing caller/test byte-identical. Fires per
   *  request in the approve-all cascade too. */
  onClosure?: (request: ApprovalRequest, decision: 'allow' | 'deny') => void;
  /** Stamped on every decision this card produces (`ApprovalDecision.decidedBy`). */
  decidedBy: string;
  /** Stamped on every decision this card produces (`ApprovalDecision.channel`). */
  channel: string;
  labels: ApprovalCardLabels;
  /** born-508 (382-003) stdin-ownership mutex gate — ANDed with this card's OWN
   *  pending-queue state (`head !== null`) below. Lets the caller (app.tsx)
   *  defer to a higher-priority stdin consumer (the legacy tool-confirm modal)
   *  so at most one REPL surface ever reacts to the same keypress. Optional,
   *  defaults to true — omitting it keeps every existing caller/test
   *  byte-identical to the pre-born-508 behavior. */
  isActive?: boolean;
  /** Clock for the expiry countdown (TERMINAL-TOOLS-012) — injectable for
   *  deterministic tests; defaults to Date.now. */
  now?: () => number;
}

// ─── ApprovalCard ───────────────────────────────────────────────────────────

export function ApprovalCard(props: ApprovalCardProps): ReactElement | null {
  const { events, onDecide, onClosure, decidedBy, channel, labels, isActive: mutexActive = true, now = Date.now } = props;
  const [head, setHead] = useState<ApprovalCardHead | null>(null);
  const [expanded, setExpanded] = useState(false);
  // TERMINAL-TOOLS-012/013 — keep the expiry/age carrier honest (a frozen
  // "in 14m" is a stale fact) WITHOUT churn: poll the clock, re-render only when
  // the rendered duration string actually changes (minute steps above a minute).
  const [, setClockTick] = useState(0);
  const carrierRef = useRef('');
  useEffect(() => {
    if (!head) return undefined;
    carrierRef.current = timeCarrier(head.request, labels.facts, now());
    const timer = setInterval(() => {
      const next = timeCarrier(head.request, labels.facts, now());
      if (next !== carrierRef.current) { carrierRef.current = next; setClockTick((n) => n + 1); }
    }, FACTS_REFRESH_MS);
    timer.unref?.();
    return () => clearInterval(timer);
  }, [head, labels, now]);
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
    // born-697 — visible closure on the SAME channel that decided. The relay
    // deliberately excludes the deciding channel from `cross-decided`
    // (approval-relay.ts), so without this the terminal never reflected its own
    // decision; the card just vanished.
    onClosure?.(request, decision);
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
  }, { isActive: head !== null && mutexActive });

  if (!head) return null;

  const { request, index, total } = head;
  const riskColor = RISK_COLORS[request.risk];
  const facts = buildApprovalFacts(request, labels, now());

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={riskColor} paddingX={1}>
      {/* One inline Text: at narrow widths a flex row of two Texts dropped the
          separating space when the summary wrapped ("HIGHDEMO — …"). */}
      <Text wrap="wrap">
        <Text color={riskColor} bold>{labels.riskLabels[request.risk]}</Text>
        {` ${request.summary}`}
      </Text>
      {/* TERMINAL-TOOLS-013 hierarchy: the object of the decision first (action ·
          resource, then its redacted arguments at normal weight), then who /
          policy / time, then consequence and rollback. Alignment by a fixed
          label column, not by color. */}
      {facts.map((fact) => (
        <Box key={fact.key} flexDirection="column">
          <Text dimColor={!fact.emphasis}>{`${fact.label}: ${fact.value}`}</Text>
          {fact.key === 'action' && (
            <Text wrap="wrap">{request.maskedArgs ? summarizeMaskedArgs(request.maskedArgs) : labels.noArgs}</Text>
          )}
        </Box>
      ))}
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
