// ─── Memory Search API Endpoint ──────────────────────────────────────────────
// GET /api/memory/search?q=<text> — FTS5 full-text search over memory.db
import type { ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryStore } from '../core/memory-store.js';
import { searchMemory } from '../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

/**
 * Handle GET /api/memory/search?q=<query> — FTS5 memory search.
 * Returns true if the route was handled, false to let the caller try next route.
 */
export function registerMemorySearch(
  url: string,
  res: ServerResponse,
  projectRoot: string,
): boolean {
  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname !== '/api/memory/search') return false;

  const q = parsed.searchParams.get('q') ?? '';
  if (!q.trim()) {
    sendJson(res, []);
    return true;
  }

  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) {
    sendJson(res, []);
    return true;
  }

  const store = new MemoryStore(dbPath);
  try {
    const results = searchMemory(store, { text: q, limit: 20 });
    sendJson(res, results);
  } finally {
    store.close();
  }
  return true;
}
