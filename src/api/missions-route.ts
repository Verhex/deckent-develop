// missions-route.ts — read-only HTTP endpoints for autonomous-v2 missions.
// GET /api/missions        → { missions: MissionView[] }
// GET /api/missions/:id    → MissionView | 404
//
// Fail-safe: missing or inaccessible autonomous.db degrades to empty list, never 500.

import type { ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../core/constants.js';
import { SqliteMissionStore } from '../orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { projectMission } from '../orchestra/autonomous/mission-store/mission-view.js';
import type { MissionView } from '../orchestra/autonomous/mission-store/mission-view.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function autonomousDbPath(projectRoot: string): string {
  return join(projectRoot, DECKENT_DIR, 'autonomous', 'autonomous.db');
}

/**
 * Handle mission read endpoints. Returns true when the route matched
 * (and a response was sent), false to let the caller fall through.
 *
 * Auth is enforced by the caller (server.ts bearerAuthMiddleware) before this
 * function is reached — these handlers assume the request is authenticated.
 */
export function registerMissionsRoute(
  url: string,
  method: string,
  res: ServerResponse,
  projectRoot: string,
): boolean {
  if (method !== 'GET') return false;
  const path = new URL(url, 'http://localhost').pathname;
  if (!path.startsWith('/api/missions')) return false;

  const dbPath = autonomousDbPath(projectRoot);
  if (!existsSync(dbPath)) {
    // No db yet — fail-safe empty response
    if (path === '/api/missions') {
      sendJson(res, { missions: [] });
      return true;
    }
    if (path.startsWith('/api/missions/')) {
      sendJson(res, { error: 'not found' }, 404);
      return true;
    }
    return false;
  }

  const store = new SqliteMissionStore(projectRoot);
  store.migrate();
  try {
    // GET /api/missions
    if (path === '/api/missions') {
      const missions = store.listMissions();
      const views: MissionView[] = missions
        .map((m) => projectMission(store, m.id))
        .filter((v): v is MissionView => v !== null);
      sendJson(res, { missions: views });
      return true;
    }

    // GET /api/missions/:id
    if (path.startsWith('/api/missions/')) {
      const id = decodeURIComponent(path.slice('/api/missions/'.length));
      if (!id) return false;
      const view = projectMission(store, id);
      if (!view) {
        sendJson(res, { error: 'not found' }, 404);
        return true;
      }
      sendJson(res, view);
      return true;
    }
  } finally {
    store.close();
  }

  return false;
}
