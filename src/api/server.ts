import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DASHBOARD_FILE, BRAIN_DIR, SPRINTS_DIR } from '../core/constants.js';
import { watchDashboard } from './watcher.js';
import { parseSprintLog } from '../cli/commands/history.js';

const DEFAULT_PORT = 3100;

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

export interface HttpApi {
  server: Server;
  close(): Promise<void>;
}

export function createHttpServer(projectRoot: string, port?: number): HttpApi {
  const listenPort = port ?? DEFAULT_PORT;
  const dashPath = join(projectRoot, DASHBOARD_FILE);

  // SSE clients
  const sseClients = new Set<ServerResponse>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';

    if (req.method !== 'GET') {
      sendError(res, 405, 'Method not allowed');
      return;
    }

    if (url === '/api/status') {
      const data = readDashboardJson(dashPath);
      if (!data) {
        sendError(res, 404, 'No active sprint');
        return;
      }
      sendJson(res, data);
      return;
    }

    if (url === '/api/sprint') {
      const sprint = getLatestSprintLog(projectRoot);
      if (!sprint) {
        sendError(res, 404, 'No sprint logs found');
        return;
      }
      sendJson(res, sprint);
      return;
    }

    if (url === '/api/history') {
      const history = getAllSprintLogs(projectRoot);
      sendJson(res, history);
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

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    sendError(res, 404, 'Not found');
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
