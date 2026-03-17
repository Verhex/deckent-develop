import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import {
  DASHBOARD_FILE, BRAIN_DIR, SPRINTS_DIR,
  PROJECT_CONFIG_PATH, MEMORY_FILE, DEBT_FILE, DIRECTIVES_FILE,
} from '../core/constants.js';
import { watchDashboard } from './watcher.js';
import { parseSprintLog } from '../cli/commands/history.js';
import { runDoctorChecks } from '../cli/commands/doctor.js';
import { killWorker } from '../orchestra/tmux.js';
import { loadConfig } from '../core/config.js';
import {
  runSprint, readContext, checkUsage, adjustSprintSize, planSprint,
} from '../orchestra/brain.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const DEFAULT_PORT = 3100;

// ─── Active Job Tracking ─────────────────────────────────────────
interface ActiveJob {
  id: string;
  status: 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

let activeJob: ActiveJob | null = null;

/** Exported for testing — resets activeJob state */
export function _resetActiveJob(): void {
  activeJob = null;
}

// ─── Helpers ─────────────────────────────────────────────────────

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, { error: message }, status);
}

export function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) { resolve({}); return; }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function readDashboardJson(dashPath: string): unknown | null {
  if (!existsSync(dashPath)) return null;
  try {
    return JSON.parse(readFileSync(dashPath, 'utf-8')) as unknown;
  } catch {
    return null;
  }
}

function getLatestSprintLog(projectRoot: string): { id: string; metrics: Record<string, string>; tasks: string[] } | null {
  const sprintsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsDir)) return null;

  const files = readdirSync(sprintsDir)
    .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
    .sort();

  if (files.length === 0) return null;

  const latest = files[files.length - 1]!;
  const content = readFileSync(join(sprintsDir, latest), 'utf-8');
  const record = parseSprintLog(content);

  const tasks: string[] = [];
  const taskSection = content.match(/## Tasks\n([\s\S]*?)(?=\n##|$)/);
  if (taskSection?.[1]) {
    for (const line of taskSection[1].split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) tasks.push(trimmed.slice(2));
    }
  }

  return {
    id: record.sprint,
    metrics: {
      tasks: record.tasks,
      completed: record.completed,
      noGoRate: record.noGoRate,
      coverage: record.coverage,
      duration: record.duration,
    },
    tasks,
  };
}

function getAllSprintLogs(projectRoot: string): unknown[] {
  const sprintsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsDir)) return [];

  const files = readdirSync(sprintsDir)
    .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
    .sort();

  return files.map((f) => {
    const content = readFileSync(join(sprintsDir, f), 'utf-8');
    const record = parseSprintLog(content);
    return { id: record.sprint, ...record };
  });
}

function readJsonFile(filePath: string): unknown | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  } catch {
    return null;
  }
}

function readTextFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function countTaskBlocks(content: string): number {
  const matches = content.match(/^## Task\b/gm);
  return matches ? matches.length : 0;
}

// ─── Route Handler ───────────────────────────────────────────────

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
  dashPath: string,
  sseClients: Set<ServerResponse>,
  staticDir?: string,
): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ─── GET routes ────────────────────────────────────────────
  if (method === 'GET') {
    if (url === '/api/status') {
      const data = readDashboardJson(dashPath);
      if (!data) { sendError(res, 404, 'No active sprint'); return; }
      sendJson(res, data);
      return;
    }

    if (url === '/api/sprint') {
      const sprint = getLatestSprintLog(projectRoot);
      if (!sprint) { sendError(res, 404, 'No sprint logs found'); return; }
      sendJson(res, sprint);
      return;
    }

    if (url === '/api/history') {
      sendJson(res, getAllSprintLogs(projectRoot));
      return;
    }

    if (url === '/api/config') {
      const configPath = join(projectRoot, PROJECT_CONFIG_PATH);
      const data = readJsonFile(configPath);
      if (!data) { sendError(res, 404, 'Config not found'); return; }
      sendJson(res, data);
      return;
    }

    if (url === '/api/doctor') {
      const result = runDoctorChecks(projectRoot);
      sendJson(res, result);
      return;
    }

    if (url === '/api/memory') {
      const content = readTextFile(join(projectRoot, BRAIN_DIR, MEMORY_FILE));
      if (content === null) { sendError(res, 404, 'Memory file not found'); return; }
      sendJson(res, { content });
      return;
    }

    if (url === '/api/debt') {
      const content = readTextFile(join(projectRoot, BRAIN_DIR, DEBT_FILE));
      if (content === null) { sendError(res, 404, 'Debt file not found'); return; }
      sendJson(res, { content });
      return;
    }

    // GET /api/job/:jobId
    if (url.startsWith('/api/job/')) {
      const jobId = url.slice('/api/job/'.length);
      if (!activeJob || activeJob.id !== jobId) {
        sendError(res, 404, 'Job not found');
        return;
      }
      sendJson(res, activeJob);
      return;
    }

    if (url === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('\n');
      sseClients.add(res);
      req.on('close', () => { sseClients.delete(res); });
      return;
    }

    // Static file serving for dashboard
    if (staticDir && !url.startsWith('/api/')) {
      const urlPath = url.split('?')[0]!;
      const filePath = join(staticDir, urlPath === '/' ? 'index.html' : urlPath);

      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath);
          const mimeType = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mimeType });
          res.end(content);
          return;
        } catch {
          // fall through to SPA fallback
        }
      }

      // SPA fallback
      const indexPath = join(staticDir, 'index.html');
      if (existsSync(indexPath)) {
        try {
          const content = readFileSync(indexPath);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
          return;
        } catch {
          // fall through to 404
        }
      }
    }

    // GET with no matching route
    sendError(res, 404, 'Not found');
    return;
  }

  // ─── POST routes ───────────────────────────────────────────
  if (method === 'POST') {
    let body: unknown;
    try {
      body = await parseBody(req);
    } catch {
      sendError(res, 400, 'Invalid JSON body');
      return;
    }

    if (url === '/api/start') {
      if (activeJob && activeJob.status === 'running') {
        sendError(res, 409, 'Sprint already running');
        return;
      }
      const b = body as { autoApprove?: boolean } | undefined;
      const jobId = `job-${Date.now()}`;
      activeJob = { id: jobId, status: 'running' };
      sendJson(res, { jobId, status: 'started' }, 202);

      // Run sprint in background
      loadConfig(projectRoot)
        .then((config) => runSprint(projectRoot, config, { autoApprove: b?.autoApprove }))
        .then((result) => {
          if (activeJob && activeJob.id === jobId) {
            activeJob.status = 'completed';
            activeJob.result = result;
          }
        })
        .catch((err: unknown) => {
          if (activeJob && activeJob.id === jobId) {
            activeJob.status = 'failed';
            activeJob.error = err instanceof Error ? err.message : String(err);
          }
        });
      return;
    }

    if (url === '/api/plan') {
      try {
        const b = body as { directive?: string } | undefined;
        void b?.directive; // reserved for future use
        const config = await loadConfig(projectRoot);
        const context = readContext(projectRoot);
        const usage = checkUsage(config);
        const recommendation = adjustSprintSize(config, usage);
        const plan = planSprint(projectRoot, config, context, recommendation);
        sendJson(res, plan);
      } catch (err: unknown) {
        sendError(res, 500, err instanceof Error ? err.message : 'Plan failed');
      }
      return;
    }

    // POST /api/kill/:workerId
    if (url.startsWith('/api/kill/')) {
      const workerId = url.slice('/api/kill/'.length);
      if (!workerId) { sendError(res, 400, 'Missing workerId'); return; }
      try {
        killWorker(workerId);
        sendJson(res, { success: true });
      } catch (err: unknown) {
        sendError(res, 500, err instanceof Error ? err.message : 'Kill failed');
      }
      return;
    }

    if (url === '/api/set-directives') {
      const b = body as { content?: string } | undefined;
      if (!b?.content || typeof b.content !== 'string') {
        sendError(res, 400, 'Missing content field');
        return;
      }
      try {
        const directivesPath = join(projectRoot, DIRECTIVES_FILE);
        writeFileSync(directivesPath, b.content, 'utf-8');
        const taskCount = countTaskBlocks(b.content);
        sendJson(res, { success: true, taskCount });
      } catch (err: unknown) {
        sendError(res, 500, err instanceof Error ? err.message : 'Write failed');
      }
      return;
    }

    if (url === '/api/config') {
      const configPath = join(projectRoot, PROJECT_CONFIG_PATH);
      try {
        let existing: Record<string, unknown> = {};
        if (existsSync(configPath)) {
          existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
        }
        const merged = { ...existing, ...(body as Record<string, unknown>) };
        writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
        sendJson(res, merged);
      } catch (err: unknown) {
        sendError(res, 500, err instanceof Error ? err.message : 'Config update failed');
      }
      return;
    }

    sendError(res, 404, 'Not found');
    return;
  }

  // Unknown method
  sendError(res, 405, 'Method not allowed');
}

// ─── Public API ──────────────────────────────────────────────────

export interface HttpApi {
  server: Server;
  close(): Promise<void>;
}

export function createHttpServer(projectRoot: string, port?: number, staticDir?: string): HttpApi {
  const listenPort = port ?? DEFAULT_PORT;
  const dashPath = join(projectRoot, DASHBOARD_FILE);

  const sseClients = new Set<ServerResponse>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res, projectRoot, dashPath, sseClients, staticDir).catch((err: unknown) => {
      sendError(res, 500, err instanceof Error ? err.message : 'Internal server error');
    });
  });

  // Watch dashboard file for SSE
  let watcher: ReturnType<typeof watchDashboard> | null = null;
  if (existsSync(dashPath)) {
    watcher = watchDashboard(dashPath, () => {
      const data = readDashboardJson(dashPath);
      if (!data) return;
      const payload = `data: ${JSON.stringify(data)}\n\n`;
      for (const client of sseClients) {
        client.write(payload);
      }
    });
  }

  server.listen(listenPort);

  return {
    server,
    close(): Promise<void> {
      watcher?.close();
      for (const client of sseClients) {
        client.end();
      }
      sseClients.clear();
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
