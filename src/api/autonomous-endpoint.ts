// autonomous-endpoint.ts — HTTP routes for the dashboard AutonomousPage (W6-W7).
// GET  /api/autonomous/status        → { pendingCount, backlogSummary, recentAudit }
// GET  /api/autonomous/pending       → PendingApproval[] (triggerId/action/requestedBy/enqueuedAt)
// GET  /api/autonomous/backlog       → BacklogEntry[] (id/title/kind/status/policy/trigger/lastRun)
// POST /api/autonomous/approve/<id>  → gate.accept(triggerId) → decisions.json
// POST /api/autonomous/reject/<id>   → gate.reject(triggerId) → decisions.json
//
// Mirrors nervous-endpoint.ts so the two dashboard pages share one shape. Reuses
// the durable autonomous artifacts (approval-adapter gate + backlog) — no engine
// boot. Fail-safe: a missing/corrupt backlog or pending file degrades to empty,
// never a 500.

import type { ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApprovalGate } from '../orchestra/autonomous/approval-adapter.js';
import { loadBacklog } from '../orchestra/autonomous/backlog.js';
import type { BacklogEntry } from '../orchestra/autonomous/backlog-types.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function pendingPath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'pending.json');
}
function backlogPath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'backlog.json');
}
function eventsPath(root: string): string {
  return join(root, '.deckent', 'autonomous-events.jsonl');
}

/** Backlog entries, fail-safe ([] on a missing/corrupt file — never a 500). */
function safeBacklog(root: string): BacklogEntry[] {
  try {
    return loadBacklog(backlogPath(root)).entries;
  } catch {
    return [];
  }
}

function backlogSummary(entries: BacklogEntry[]): Record<'total' | 'pending' | 'running' | 'parked' | 'done' | 'failed', number> {
  const counts = { total: entries.length, pending: 0, running: 0, parked: 0, done: 0, failed: 0 };
  for (const e of entries) {
    if (e.status in counts) counts[e.status as keyof typeof counts]++;
  }
  return counts;
}

/** Last `n` audit events from the autonomous event stream (fail-safe → []). */
function recentAudit(root: string, n = 5): Array<{ timestamp: string; action: string; outcome: string; reason: string }> {
  const p = eventsPath(root);
  if (!existsSync(p)) return [];
  try {
    const lines = readFileSync(p, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
    const out: Array<{ timestamp: string; action: string; outcome: string; reason: string }> = [];
    for (const line of lines.slice(-n)) {
      try {
        const ev = JSON.parse(line) as { payload?: Record<string, unknown>; timestamp?: string };
        const pl = ev.payload ?? {};
        out.push({
          timestamp: (pl['timestamp'] as string | undefined) ?? ev.timestamp ?? '',
          action: (pl['action'] as string | undefined) ?? '?',
          outcome: (pl['outcome'] as string | undefined) ?? '?',
          reason: (pl['reason'] as string | undefined) ?? '',
        });
      } catch {
        // skip malformed audit line
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Handle autonomous-engine HTTP routes. Returns true when the route matched (and a
 * response was sent), false otherwise so the caller can fall through.
 */
export function registerAutonomousRoutes(
  url: string,
  method: string,
  res: ServerResponse,
  projectRoot: string,
): boolean {
  const path = new URL(url, 'http://localhost').pathname;
  if (!path.startsWith('/api/autonomous/')) return false;

  const gate = makeApprovalGate({ pendingPath: pendingPath(projectRoot) });

  // GET /api/autonomous/pending
  if (method === 'GET' && path === '/api/autonomous/pending') {
    sendJson(res, gate.pending().map((p) => ({
      triggerId: p.triggerId,
      action: p.action,
      requestedBy: p.requestedBy,
      enqueuedAt: p.enqueuedAt,
    })));
    return true;
  }

  // GET /api/autonomous/backlog
  if (method === 'GET' && path === '/api/autonomous/backlog') {
    sendJson(res, safeBacklog(projectRoot).map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      status: e.status,
      policy: e.policy,
      trigger: e.trigger,
      lastRun: e.lastRun,
    })));
    return true;
  }

  // GET /api/autonomous/status
  if (method === 'GET' && path === '/api/autonomous/status') {
    const entries = safeBacklog(projectRoot);
    sendJson(res, {
      pendingCount: gate.pending().length,
      backlogSummary: backlogSummary(entries),
      recentAudit: recentAudit(projectRoot),
    });
    return true;
  }

  // POST /api/autonomous/approve/<triggerId>
  if (method === 'POST' && path.startsWith('/api/autonomous/approve/')) {
    const triggerId = decodeURIComponent(path.slice('/api/autonomous/approve/'.length));
    gate.accept(triggerId, 'approved via dashboard');
    sendJson(res, { approved: triggerId });
    return true;
  }

  // POST /api/autonomous/reject/<triggerId>
  if (method === 'POST' && path.startsWith('/api/autonomous/reject/')) {
    const triggerId = decodeURIComponent(path.slice('/api/autonomous/reject/'.length));
    gate.reject(triggerId, 'rejected via dashboard');
    sendJson(res, { rejected: triggerId });
    return true;
  }

  return false;
}
