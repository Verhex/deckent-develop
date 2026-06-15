// src/orchestra/autonomous/reactive/webhook-reactive-source.ts
//
// Webhook reactive source (N2): the canonical "external system triggers deckent"
// path. An HTTP ingress (serve: POST /api/reactive/webhook) appends normalized
// ReactiveEvents to a durable inbox (.deckent/autonomous/reactive-inbox.jsonl);
// the autonomous engine drains the inbox → ingester → backlog (reactive-map
// decides what to enqueue). Cross-process by design — the same file-queue shape
// the nervous-ipc / approval queues use.
//
// Durability: a persisted line-offset (<inbox>.offset) means a restart resumes
// where it left off — no replay of already-consumed events, no loss of events
// that arrived while the engine was down. Hermetic: all fs is injectable.

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RiskLevel, Severity } from '../../../core/nervous-types.js';
import type { ReactiveEvent } from './reactive-types.js';
import type { IngestOutcome } from './reactive-ingester.js';

const VALID_RISK: ReadonlySet<string> = new Set<RiskLevel>(['low', 'medium', 'high']);
const VALID_SEVERITY: ReadonlySet<string> = new Set<Severity>(['info', 'warning', 'critical', 'emergency']);

/** Normalize a raw webhook body into a `webhook` ReactiveEvent (defensive). The
 *  external `event` name becomes `webhook.<event>` so reactive-map rules can route
 *  by groupKey. Unknown/missing risk defaults to 'low'. Returns null if invalid. */
export function normalizeWebhookBody(body: unknown): ReactiveEvent | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const event = typeof b.event === 'string' && b.event.trim() ? b.event.trim() : null;
  if (!event) return null;
  const risk: RiskLevel = typeof b.risk === 'string' && VALID_RISK.has(b.risk) ? (b.risk as RiskLevel) : 'low';
  const severity = typeof b.severity === 'string' && VALID_SEVERITY.has(b.severity) ? (b.severity as Severity) : undefined;
  const metadata = b.metadata && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
    ? (b.metadata as Record<string, unknown>)
    : undefined;
  return {
    sourceType: 'webhook',
    risk,
    ...(severity ? { severity } : {}),
    groupKey: `webhook.${event}`,
    ...(metadata ? { metadata } : {}),
  };
}

/** Append a normalized ReactiveEvent to the durable webhook inbox (the HTTP
 *  ingress side; creates the dir if absent). One JSONL line, atomic-append. */
export function appendWebhookEvent(inboxPath: string, ev: ReactiveEvent): void {
  const dir = dirname(inboxPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(inboxPath, JSON.stringify(ev) + '\n', 'utf-8');
}

function isReactiveEvent(v: unknown): v is ReactiveEvent {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return e.sourceType === 'webhook' && typeof e.risk === 'string' && VALID_RISK.has(e.risk);
}

export interface WebhookReactiveSourceDeps {
  inboxPath: string;
  ingester: { ingest(ev: ReactiveEvent): IngestOutcome };
  /** Drain cadence. Default 1000ms. */
  pollMs?: number;
  /** Injectable readers (tests). Default: node:fs. */
  readImpl?: (path: string) => string;
  readOffsetImpl?: (path: string) => number;
  writeOffsetImpl?: (path: string, offset: number) => void;
}

/**
 * Build a webhook reactive source. `start()` drains any unconsumed inbox lines
 * once and then polls; each new line is parsed + ingested. `drain()` is exposed
 * for tests. The consumed line-offset persists to `<inbox>.offset`.
 */
export function makeWebhookReactiveSource(
  deps: WebhookReactiveSourceDeps,
): { start(): void; stop(): void; drain(): void } {
  const pollMs = deps.pollMs ?? 1000;
  const offsetPath = `${deps.inboxPath}.offset`;
  const read = deps.readImpl ?? ((p: string) => (existsSync(p) ? readFileSync(p, 'utf-8') : ''));
  const readOffset = deps.readOffsetImpl ?? ((p: string) => {
    if (!existsSync(p)) return 0;
    const n = parseInt(readFileSync(p, 'utf-8').trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  const writeOffset = deps.writeOffsetImpl ?? ((p: string, offset: number) => writeFileSync(p, String(offset), 'utf-8'));

  let offset = readOffset(offsetPath);
  let timer: NodeJS.Timeout | null = null;

  const drain = (): void => {
    const lines = read(deps.inboxPath).split('\n').filter((l) => l.trim().length > 0);
    if (lines.length <= offset) return;
    for (const line of lines.slice(offset)) {
      try {
        const ev: unknown = JSON.parse(line);
        if (isReactiveEvent(ev)) deps.ingester.ingest(ev);
      } catch {
        // skip a corrupt line — the rest of the inbox still drains
      }
    }
    offset = lines.length;
    writeOffset(offsetPath, offset);
  };

  return {
    drain,
    start(): void {
      drain();
      timer = setInterval(drain, pollMs);
      if (typeof timer.unref === 'function') timer.unref();
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
