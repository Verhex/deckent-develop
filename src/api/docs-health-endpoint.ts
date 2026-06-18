// ─── Docs Health API Endpoint (ADR-090) ──────────────────────────────────────
// GET /api/docs/health — doc-tracking rows + rank×state heatmap aggregation.
// Read-only; auth-gated by the server's bearer middleware (registered after auth).
import type { ServerResponse } from 'node:http';
import { runDocsTrackStatus } from '../cli/commands/docs.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const BUCKETS: Array<{ name: string; min: number; max: number }> = [
  { name: '0', min: 0, max: 0 },
  { name: '1-10', min: 1, max: 10 },
  { name: '11-50', min: 11, max: 50 },
  { name: '51-94', min: 51, max: 94 },
  { name: '95+', min: 95, max: Infinity },
];
const STATES = ['FRESH', 'DRIFT', 'STALE', 'CRITICAL_STALE', 'EXEMPT'] as const;

function bucketOf(rank: number): string {
  for (const b of BUCKETS) if (rank >= b.min && rank <= b.max) return b.name;
  return '95+';
}

export function aggregateHeatmap(
  rows: Array<{ doc_rank: number; state: string }>,
): Array<{ bucket: string; state: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = `${bucketOf(r.doc_rank)}|${r.state}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells: Array<{ bucket: string; state: string; count: number }> = [];
  for (const b of BUCKETS) {
    for (const s of STATES) {
      cells.push({ bucket: b.name, state: s, count: counts.get(`${b.name}|${s}`) ?? 0 });
    }
  }
  return cells;
}

export function registerDocsHealthRoute(url: string, res: ServerResponse, projectRoot: string): boolean {
  if (url !== '/api/docs/health') return false;
  try {
    const rows = runDocsTrackStatus(projectRoot, { stale: false });
    sendJson(res, { rows, heatmap: aggregateHeatmap(rows), generatedAt: new Date().toISOString() });
  } catch (e) {
    sendJson(res, { error: String(e) }, 500);
  }
  return true;
}
