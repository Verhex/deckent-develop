// tests/orchestra/autonomous/webhook-reactive-source.test.ts
//
// Webhook reactive source (N2). Hermetic: tmpdir inbox; persisted-offset drain.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  makeWebhookReactiveSource,
  appendWebhookEvent,
  normalizeWebhookBody,
} from '../../../src/orchestra/autonomous/reactive/webhook-reactive-source.js';
import type { ReactiveEvent } from '../../../src/orchestra/autonomous/reactive/reactive-types.js';

let root: string;
afterEach(() => {
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  root = undefined as unknown as string;
});
function inbox(): string {
  root = mkdtempSync(join(tmpdir(), 'deckent-wh-'));
  return join(root, 'reactive-inbox.jsonl');
}
function harness() {
  const ingested: ReactiveEvent[] = [];
  return { ingested, ingester: { ingest: (ev: ReactiveEvent) => { ingested.push(ev); return 'written' as const; } } };
}

describe('normalizeWebhookBody', () => {
  it('maps event → webhook.<event> groupKey, defaults risk to low', () => {
    const ev = normalizeWebhookBody({ event: 'order.created', metadata: { id: 7 } });
    expect(ev).toEqual({ sourceType: 'webhook', risk: 'low', groupKey: 'webhook.order.created', metadata: { id: 7 } });
  });
  it('keeps a valid risk + severity', () => {
    const ev = normalizeWebhookBody({ event: 'alert', risk: 'high', severity: 'critical' });
    expect(ev).toMatchObject({ risk: 'high', severity: 'critical', groupKey: 'webhook.alert' });
  });
  it('rejects a body with no event name', () => {
    expect(normalizeWebhookBody({ risk: 'high' })).toBeNull();
    expect(normalizeWebhookBody(null)).toBeNull();
  });
  it('drops an invalid risk back to low', () => {
    expect(normalizeWebhookBody({ event: 'x', risk: 'apocalyptic' })!.risk).toBe('low');
  });
});

describe('makeWebhookReactiveSource', () => {
  it('drains appended webhook events into the ingester', () => {
    const path = inbox();
    const h = harness();
    appendWebhookEvent(path, normalizeWebhookBody({ event: 'order.created' })!);
    appendWebhookEvent(path, normalizeWebhookBody({ event: 'order.shipped', risk: 'medium' })!);

    const src = makeWebhookReactiveSource({ inboxPath: path, ingester: h.ingester });
    src.drain();

    expect(h.ingested).toHaveLength(2);
    expect(h.ingested[0].groupKey).toBe('webhook.order.created');
    expect(h.ingested[1].risk).toBe('medium');
  });

  it('persists the offset — a second drain ingests only NEW events, no replay', () => {
    const path = inbox();
    const h = harness();
    appendWebhookEvent(path, normalizeWebhookBody({ event: 'a' })!);
    const src = makeWebhookReactiveSource({ inboxPath: path, ingester: h.ingester });
    src.drain();
    expect(h.ingested).toHaveLength(1);

    appendWebhookEvent(path, normalizeWebhookBody({ event: 'b' })!);
    src.drain();
    expect(h.ingested).toHaveLength(2); // only 'b' added, 'a' not replayed
    expect(existsSync(`${path}.offset`)).toBe(true);
  });

  it('resumes from the persisted offset across a fresh source (restart, no replay)', () => {
    const path = inbox();
    appendWebhookEvent(path, normalizeWebhookBody({ event: 'a' })!);
    appendWebhookEvent(path, normalizeWebhookBody({ event: 'b' })!);
    // first source consumes both
    makeWebhookReactiveSource({ inboxPath: path, ingester: harness().ingester }).drain();
    // a brand-new source (simulated restart) sees the persisted offset → nothing new
    const h2 = harness();
    makeWebhookReactiveSource({ inboxPath: path, ingester: h2.ingester }).drain();
    expect(h2.ingested).toHaveLength(0);
    // a newly-arrived event is still picked up
    appendWebhookEvent(path, normalizeWebhookBody({ event: 'c' })!);
    const src3 = makeWebhookReactiveSource({ inboxPath: path, ingester: h2.ingester });
    src3.drain();
    expect(h2.ingested).toHaveLength(1);
    expect(h2.ingested[0].groupKey).toBe('webhook.c');
  });

  it('skips corrupt lines without throwing', () => {
    const path = inbox();
    const h = harness();
    appendWebhookEvent(path, normalizeWebhookBody({ event: 'ok' })!);
    writeFileSync(path, readFileSync(path, 'utf-8') + 'not-json\n', 'utf-8');
    const src = makeWebhookReactiveSource({ inboxPath: path, ingester: h.ingester });
    src.drain();
    expect(h.ingested).toHaveLength(1);
  });

  it('start()/stop() poll cadence is timer-driven and unref-safe', () => {
    vi.useFakeTimers();
    try {
      const path = inbox();
      const h = harness();
      const src = makeWebhookReactiveSource({ inboxPath: path, ingester: h.ingester, pollMs: 100 });
      src.start();
      appendWebhookEvent(path, normalizeWebhookBody({ event: 'late' })!);
      vi.advanceTimersByTime(100);
      expect(h.ingested).toHaveLength(1);
      src.stop();
      appendWebhookEvent(path, normalizeWebhookBody({ event: 'after-stop' })!);
      vi.advanceTimersByTime(500);
      expect(h.ingested).toHaveLength(1); // stopped → no more drains
    } finally {
      vi.useRealTimers();
    }
  });
});
