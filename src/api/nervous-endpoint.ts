// nervous-endpoint.ts — HTTP routes for the dashboard NervousPage (F7-009).
// GET  /api/nervous/pending      → PendingApproval[]
// GET  /api/nervous/status       → { panicGuard, detectors, pendingCount }
// POST /api/nervous/accept/<id>  → accept a pending panic-guard kill
// POST /api/nervous/reject/<id>  → reject (drop the pending marker)
//
// Sprint 218 follow-up (run-verify caught NervousPage 404 — frontend existed,
// backend routes were never wired). Reuses src/cli/commands/nervous.ts.

import type { ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { listPendingPanicEvents, acceptPanicGuard } from '../cli/commands/nervous.js';
import { readRecommendations, dismissRecommendation } from '../nervous/recommendation-log.js';
import { NERVOUS_PENDING_FILE, NERVOUS_IPC_DIR, PANIC_IPC_DIR } from '../core/constants.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** The dashboard NervousPage PendingApproval shape (shared by both sources). */
interface DashboardPendingApproval {
  id: string;
  type: string;
  description: string;
  detector: string;
  createdAt: string;
  risk: 'low' | 'medium' | 'high';
}

/** Map a panic-guard pending event to the dashboard's PendingApproval shape. */
function toPendingApproval(e: { taskId: string; workerId: string; sprintId: string; reason: string; timestamp: string }): DashboardPendingApproval {
  return {
    id: e.taskId,
    type: 'panic-guard-kill',
    description: `${e.reason} (worker ${e.workerId}, ${e.sprintId})`,
    detector: 'panic-guard',
    createdAt: e.timestamp,
    risk: 'high',
  };
}

function severityToRisk(severity?: string): 'low' | 'medium' | 'high' {
  if (severity === 'critical' || severity === 'emergency') return 'high';
  if (severity === 'warning') return 'medium';
  return 'low';
}

/**
 * W8 — surface the cross-surface unified nervous approvals (`.deckent/
 * nervous-pending.json`, the executor's parked store read by `deckent status` /
 * Telegram) in the dashboard's PendingApproval shape, so all surfaces agree.
 * Fail-safe ([] on missing/corrupt).
 */
function readNervousPendingApprovals(root: string): DashboardPendingApproval[] {
  const path = join(root, NERVOUS_PENDING_FILE);
  if (!existsSync(path)) return [];
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (!Array.isArray(data)) return [];
    const out: DashboardPendingApproval[] = [];
    for (const n of data) {
      if (!n || typeof n !== 'object' || typeof (n as { id?: unknown }).id !== 'string') continue;
      const r = n as { id: string; type?: string; title?: string; message?: string; severity?: string; detectorId?: string; createdAt?: string };
      out.push({
        id: r.id,
        type: typeof r.type === 'string' ? r.type : 'nervous',
        description: typeof r.title === 'string' ? r.title : (typeof r.message === 'string' ? r.message : ''),
        detector: typeof r.detectorId === 'string' ? r.detectorId : 'nervous',
        createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
        risk: severityToRisk(typeof r.severity === 'string' ? r.severity : undefined),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * W8 — resolve a nervous approval the SAME way Telegram inbound + MCP do: drop a
 * record into the nervous-ipc pending dir for the executor's poller to consume
 * (cross-process). Written synchronously (mirrors NervousIpcQueue.writeApproval's
 * content format) so the response carries the durable guarantee. Advisory — a
 * write failure never breaks the HTTP response.
 */
function writeNervousIpcApproval(root: string, notificationId: string, decision: 'accepted' | 'rejected'): void {
  try {
    const pendingDir = join(root, NERVOUS_IPC_DIR, 'pending');
    mkdirSync(pendingDir, { recursive: true });
    const safeId = notificationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const suffix = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
    writeFileSync(
      join(pendingDir, `${safeId}-${suffix}.json`),
      JSON.stringify({ notificationId, decision, requestedAt: new Date().toISOString() }, null, 2) + '\n',
      'utf-8',
    );
  } catch {
    // advisory — never break the response
  }
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

  // Union: legacy panic-guard events + the cross-surface unified nervous-pending
  // approvals — so the dashboard shows the SAME nervous queue as status / Telegram.
  const pending = [...listPendingPanicEvents(projectRoot).map(toPendingApproval), ...readNervousPendingApprovals(projectRoot)];

  // GET /api/nervous/pending
  if (method === 'GET' && path === '/api/nervous/pending') {
    sendJson(res, pending);
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

  // GET /api/nervous/recommendations — the Brain inbox (ADR-037: nervous proposes,
  // Brain disposes). Open-only by default; `?all=1` includes dismissed entries.
  if (method === 'GET' && path === '/api/nervous/recommendations') {
    const includeAll = parsed.searchParams.get('all') === '1';
    const recs = readRecommendations(projectRoot).filter(r => includeAll || r.status === 'open');
    sendJson(res, recs);
    return true;
  }

  // POST /api/nervous/recommendations/dismiss/<id> — clear an addressed proposal.
  // A proposal is inert (never auto-executes); dismiss is operator housekeeping.
  if (method === 'POST' && path.startsWith('/api/nervous/recommendations/dismiss/')) {
    const id = decodeURIComponent(path.slice('/api/nervous/recommendations/dismiss/'.length));
    const dismissed = dismissRecommendation(projectRoot, id);
    sendJson(res, { dismissed: dismissed ? id : null }, dismissed ? 200 : 404);
    return true;
  }

  // POST /api/nervous/accept/<id> — resolve via BOTH channels: panic-guard marker
  // (legacy) AND the nervous-ipc queue (executor poller; same path as Telegram).
  if (method === 'POST' && path.startsWith('/api/nervous/accept/')) {
    const taskId = decodeURIComponent(path.slice('/api/nervous/accept/'.length));
    acceptPanicGuard(projectRoot, taskId, 'user-mcp', 'accepted via dashboard');
    writeNervousIpcApproval(projectRoot, taskId, 'accepted');
    sendJson(res, { accepted: taskId });
    return true;
  }

  // POST /api/nervous/reject/<id> — panic-guard resolved marker (so
  // listPendingPanicEvents drops it) + nervous-ipc reject for the executor.
  if (method === 'POST' && path.startsWith('/api/nervous/reject/')) {
    const taskId = decodeURIComponent(path.slice('/api/nervous/reject/'.length));
    const resolvedDir = join(projectRoot, PANIC_IPC_DIR, 'resolved');
    mkdirSync(resolvedDir, { recursive: true });
    const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeFileSync(join(resolvedDir, `${safeTaskId}.json`), JSON.stringify({ taskId, rejectedVia: 'dashboard', at: new Date().toISOString() }));
    writeNervousIpcApproval(projectRoot, taskId, 'rejected');
    sendJson(res, { rejected: taskId });
    return true;
  }

  return false;
}
