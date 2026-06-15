// reactive-endpoint.ts — HTTP ingress for the webhook reactive source (N2).
// POST /api/reactive/webhook  → normalize + append to the durable reactive inbox
// (.deckent/autonomous/reactive-inbox.jsonl). The autonomous engine's webhook
// source drains the inbox → reactive-map → backlog (cross-process by design).
//
// Auth: this route lives behind the server's auth-gate (the external caller
// presents the API bearer), so unauthenticated systems cannot inject events.

import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import {
  appendWebhookEvent,
  normalizeWebhookBody,
} from '../orchestra/autonomous/reactive/webhook-reactive-source.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Handle reactive HTTP routes. Returns true when the route matched (response
 * sent), false to fall through. `body` is the parsed JSON request body.
 */
export function registerReactiveRoutes(
  url: string,
  method: string,
  res: ServerResponse,
  body: unknown,
  projectRoot: string,
): boolean {
  const path = new URL(url, 'http://localhost').pathname;
  if (method === 'POST' && path === '/api/reactive/webhook') {
    const ev = normalizeWebhookBody(body);
    if (!ev) {
      sendJson(res, { error: 'webhook body requires a non-empty string `event` (and optional risk/severity/metadata)' }, 400);
      return true;
    }
    try {
      const inboxPath = join(projectRoot, '.deckent', 'autonomous', 'reactive-inbox.jsonl');
      appendWebhookEvent(inboxPath, ev);
      sendJson(res, { accepted: true, groupKey: ev.groupKey });
    } catch (err) {
      sendJson(res, { error: err instanceof Error ? err.message : String(err) }, 500);
    }
    return true;
  }
  return false;
}
