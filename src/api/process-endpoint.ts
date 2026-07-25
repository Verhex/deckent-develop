// process-endpoint.ts — REST routes for process mode (ADR-067/071).
// POST /api/process/submit          → submit an ExecutionRequest → { executionId, status }
// GET  /api/process/status/<id>     → { id, title, kind, status, lastResult }
// GET  /api/process/result/<id>     → same (lastResult carries the outcome)
//
// The submit drives the request through the process-controller (policy-gate →
// auto-dispatch or park). GET reads the durable backlog (light — no engine boot).
// The ERP / business automation surface: an external system (or the user's MCP
// client) injects work here and polls status; every execution lands on the audit
// hash-chain (training-data trail).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { loadBacklog } from '../orchestra/autonomous/backlog.js';
import { buildProcessController } from '../cli/helpers/process-runtime.js';
import { deriveRequestPrincipal } from './auth-me-endpoint.js';
import type { ProcessSubmitCtx } from '../orchestra/process-controller.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function backlogPathFor(projectRoot: string): Promise<string> {
  const config = await loadConfig(projectRoot);
  return join(projectRoot, config.autonomous?.backlog_path ?? '.deckent/autonomous/backlog.json');
}

/**
 * Handle process-mode HTTP routes. Async (the submit awaits execution; OIDC route
 * uses the same await-able shape). Returns true when the route matched.
 */
export async function registerProcessRoutes(
  url: string,
  method: string,
  res: ServerResponse,
  body: unknown,
  projectRoot: string,
  req: IncomingMessage,
): Promise<boolean> {
  const path = new URL(url, 'http://localhost').pathname;
  if (!path.startsWith('/api/process/')) return false;

  // The caller's identity is ALWAYS derived server-side from the verified bearer —
  // never from the request body (anti-spoofing). The auth-gate middleware has
  // already rejected unauthenticated requests before this handler runs.
  const principal = deriveRequestPrincipal(req);

  // GET /api/process/status/<id>  |  /api/process/result/<id>
  if (method === 'GET' && (path.startsWith('/api/process/status/') || path.startsWith('/api/process/result/'))) {
    const id = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
    const entry = loadBacklog(await backlogPathFor(projectRoot)).entries.find((e) => e.id === id);
    // Effective-tenant fail-closed: callerTenant defaults to 'local' when no
    // tenantId claim. A claim-siz principal only sees 'local' entries (fail-closed).
    const callerTenant = principal.tenantId ?? 'local';
    const isAdmin = principal.role === 'admin';
    const allowed = isAdmin || (!!entry && (entry.tenant ?? 'local') === callerTenant);
    if (!entry || !allowed) {
      sendJson(res, { error: 'execution not found', id }, 404);
      return true;
    }
    sendJson(res, { id: entry.id, title: entry.title, kind: entry.kind, status: entry.status, lastResult: entry.lastResult });
    return true;
  }

  // POST /api/process/submit
  if (method === 'POST' && path === '/api/process/submit') {
    const ctx = (body ?? {}) as ProcessSubmitCtx;
    if (!ctx.description || typeof ctx.description !== 'string') {
      sendJson(res, { error: 'description (string) is required' }, 400);
      return true;
    }
    // SECURITY: drop any client-supplied identity (actor / tenant / origin) and
    // stamp the SERVER-DERIVED principal — a caller cannot impersonate another
    // tenant/actor or forge audit lineage.
    const { actor: _clientActor, tenant: _clientTenant, origin: _clientOrigin, ...safe } = ctx;
    void _clientActor; void _clientTenant; void _clientOrigin;
    let controller: Awaited<ReturnType<typeof buildProcessController>> | null = null;
    try {
      controller = await buildProcessController(projectRoot);
      const result = await controller.submit({
        ...safe,
        origin: 'api',
        actor: principal,
        ...(principal.tenantId ? { tenant: principal.tenantId } : {}),
      });
      const completedController = controller;
      controller = null;
      completedController.close();
      sendJson(res, result);
    } catch (err) {
      sendJson(res, { error: err instanceof Error ? err.message : String(err) }, 500);
    } finally {
      controller?.close();
    }
    return true;
  }

  return false;
}
