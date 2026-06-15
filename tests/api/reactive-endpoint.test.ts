/**
 * Tests for POST /api/reactive/webhook (N2 — the webhook reactive ingress).
 * Hermetic: tmpdir project root via startTestServer; asserts the durable inbox.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';

describe('POST /api/reactive/webhook', () => {
  let handle: TestServerHandle;
  afterEach(async () => {
    if (handle) { await handle.close(); handle = undefined as unknown as TestServerHandle; }
  });

  function inboxPath(root: string): string {
    return join(root, '.deckent', 'autonomous', 'reactive-inbox.jsonl');
  }

  it('appends a normalized webhook event to the durable inbox', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/reactive/webhook', {
      method: 'POST',
      body: JSON.stringify({ event: 'order.created', risk: 'medium', metadata: { id: 42 } }),
    });
    expect(res.status).toBe(200);
    expect(res.json<{ accepted: boolean; groupKey: string }>()).toEqual({ accepted: true, groupKey: 'webhook.order.created' });

    const path = inboxPath(handle.projectRoot);
    expect(existsSync(path)).toBe(true);
    const ev = JSON.parse(readFileSync(path, 'utf-8').trim());
    expect(ev).toMatchObject({ sourceType: 'webhook', risk: 'medium', groupKey: 'webhook.order.created', metadata: { id: 42 } });
  });

  it('rejects a body with no event name (400)', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/reactive/webhook', { method: 'POST', body: JSON.stringify({ risk: 'high' }) });
    expect(res.status).toBe(400);
  });

  it('appends multiple events as JSONL (append-only)', async () => {
    handle = await startTestServer({ disableAuth: true });
    await call(handle, '/api/reactive/webhook', { method: 'POST', body: JSON.stringify({ event: 'a' }) });
    await call(handle, '/api/reactive/webhook', { method: 'POST', body: JSON.stringify({ event: 'b' }) });
    const lines = readFileSync(inboxPath(handle.projectRoot), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).groupKey).toBe('webhook.a');
    expect(JSON.parse(lines[1]).groupKey).toBe('webhook.b');
  });
});
