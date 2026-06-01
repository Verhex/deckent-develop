// nervous-endpoint.ts — HTTP routes for the dashboard NervousPage (F7-009).
// GET  /api/nervous/pending      → PendingApproval[]
// GET  /api/nervous/status       → { panicGuard, detectors, pendingCount }
// POST /api/nervous/accept/<id>  → accept a pending panic-guard kill
// POST /api/nervous/reject/<id>  → reject (drop the pending marker)
//
// Sprint 218 follow-up (run-verify caught NervousPage 404 — frontend existed,
// backend routes were never wired). Reuses src/cli/commands/nervous.ts.

import type { ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listPendingPanicEvents, acceptPanicGuard } from '../cli/commands/nervous.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** Map a panic-guard pending event to the dashboard's PendingApproval shape. */
function toPendingApproval(e: { taskId: string; workerId: string; sprintId: string; reason: string; timestamp: string }) {
  return {
    id: e.taskId,
    type: 'panic-guard-kill',
    description: `${e.reason} (worker ${e.workerId}, ${e.sprintId})`,
    detector: 'panic-guard',
    createdAt: e.timestamp,
    risk: 'high' as const,
  };
}

/**
 * Handle nervous-system HTTP routes. Returns true when the route matched (and a
 * response was sent), false otherwise so the caller can fall through.
 */
export function registerNervousRoutes(
  url: string,
  method: string,
  res: ServerResponse,
  projectRoot: string,
): boolean {
  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname;
  if (!path.startsWith('/api/nervous/')) return false;

  const pending = listPendingPanicEvents(projectRoot);

  // GET /api/nervous/pending
  if (method === 'GET' && path === '/api/nervous/pending') {
    sendJson(res, pending.map(toPendingApproval));
    return true;
  }

  // GET /api/nervous/status
  if (method === 'GET' && path === '/api/nervous/status') {
    sendJson(res, {
      panicGuard: true,
      detectors: [] as Array<{ id: string; name: string; enabled: boolean; triggerCount: number }>,
      pendingCount: pending.length,
    });
    return true;
  }

  // POST /api/nervous/accept/<taskId>
  if (method === 'POST' && path.startsWith('/api/nervous/accept/')) {
    const taskId = decodeURIComponent(path.slice('/api/nervous/accept/'.length));
    acceptPanicGuard(projectRoot, taskId, 'user-mcp', 'accepted via dashboard');
    sendJson(res, { accepted: taskId });
    return true;
  }

  // POST /api/nervous/reject/<taskId> — write a resolved marker so
  // listPendingPanicEvents() drops it from the pending list.
  if (method === 'POST' && path.startsWith('/api/nervous/reject/')) {
    const taskId = decodeURIComponent(path.slice('/api/nervous/reject/'.length));
    const resolvedDir = join(projectRoot, '.deckent', 'panic-ipc', 'resolved');
    mkdirSync(resolvedDir, { recursive: true });
    const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeFileSync(join(resolvedDir, `${safeTaskId}.json`), JSON.stringify({ taskId, rejectedVia: 'dashboard', at: new Date().toISOString() }));
    sendJson(res, { rejected: taskId });
    return true;
  }

  return false;
}
