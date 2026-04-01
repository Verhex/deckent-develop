import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { randomBytes, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  DASHBOARD_FILE, BRAIN_DIR, SPRINTS_DIR, TASKS_DIR,
  PROJECT_CONFIG_PATH, MEMORY_FILE, DEBT_FILE, DIRECTIVES_FILE,
} from '../core/constants.js';
import { readJsonSafe } from '../core/utils.js';
import { deepMerge } from '../core/config.js';
import { watchDashboard } from './watcher.js';
import { parseSprintLog } from '../cli/commands/history.js';
import { runDoctorChecks } from '../cli/commands/doctor.js';
import { killWorker } from '../orchestra/tmux.js';
import { loadConfig, createDefaultConfig, validatePartialConfig, ConfigValidationError } from '../core/config.js';
import { readWorkerLog } from '../agents/worker.js';
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
const LOCALHOST_ONLY = '127.0.0.1';
const MAX_BODY_SIZE = 1024 * 1024; // 1MB

// ─── Rate Limiter ────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly store = new Map<string, RateLimitEntry>();

  constructor(maxRequests = 100, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(ip: string): boolean {
    const now = Date.now();
    const entry = this.store.get(ip);
    if (!entry || now >= entry.resetAt) {
      this.store.set(ip, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.maxRequests;
  }

  /** Exported for testing — resets all entries */
  reset(): void {
    this.store.clear();
  }
}

// ─── Auth ───────────────────────────────────────────────────────

/** Generate a cryptographically random API token */
export function generateApiToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a token with SHA-256 so timingSafeEqual always compares equal-length buffers.
 * This prevents length-based timing side-channels.
 */
function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Check bearer token from Authorization header using timing-safe comparison */
function checkAuth(req: IncomingMessage, token: string | null): boolean {
  // If no token configured, auth is disabled (backward-compatible)
  if (!token) return true;
  const authHeader = req.headers['authorization'];
  if (!authHeader) return false;
  const [scheme, value] = authHeader.split(' ', 2);
  if (scheme !== 'Bearer' || value === undefined) return false;
  // Use SHA-256 hashes so buffers are always 32 bytes — required by timingSafeEqual
  const expected = hashToken(token);
  const actual = hashToken(value);
  return timingSafeEqual(actual, expected);
}

// ─── Zod Schemas for POST validation ────────────────────────────
const StartSchema = z.object({ autoApprove: z.boolean().optional() });
const PlanSchema = z.object({
  directive: z.string().optional(),
  mode: z.enum(['ai', 'structured', 'auto']).optional(),
});
const SetDirectivesSchema = z.object({ content: z.string().min(1) });
const ConfigSchema = z.record(z.string(), z.unknown());
const WORKER_ID_RE = /^[a-zA-Z0-9-]+$/;

// ─── Active Job Tracking ─────────────────────────────────────────
interface ActiveJob {
  id: string;
  status: 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

const activeJobs = new Map<string, ActiveJob>();

/** Exported for testing — resets all job state */
export function _resetActiveJob(): void {
  activeJobs.clear();
}

function getRunningJob(): ActiveJob | undefined {
  for (const job of activeJobs.values()) {
    if (job.status === 'running') return job;
  }
  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': `http://localhost:${DEFAULT_PORT}`,
  });
  res.end(body);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, { error: message }, status);
}

export function parseBody(req: IncomingMessage, maxSize = MAX_BODY_SIZE): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let rejected = false;
    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        rejected = true;
        reject(new Error('Payload too large'));
        req.resume(); // drain remaining data
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
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
  return readJsonSafe<unknown>(dashPath);
}

function getLatestSprintLog(projectRoot: string): { id: string; metrics: Record<string, string>; tasks: string[] } | null {
  const sprintsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsDir)) return null;

  const files = readdirSync(sprintsDir)
    .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
    .sort();

  if (files.length === 0) return null;

  const latest = files.at(-1);
  if (!latest) return null;
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
  return readJsonSafe<unknown>(filePath);
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
  initWatcher?: () => void,
  apiToken?: string | null,
  rateLimiter?: RateLimiter,
): Promise<void> {
  // Normalize /api/v1/... → /api/... for backward compat
  const rawUrl = req.url ?? '/';
  const url = rawUrl.startsWith('/api/v1/') ? '/api/' + rawUrl.slice('/api/v1/'.length) : rawUrl;
  const method = req.method ?? 'GET';

  // Rate limiting
  if (rateLimiter && url.startsWith('/api/')) {
    const ip = req.socket.remoteAddress ?? '127.0.0.1';
    if (!rateLimiter.check(ip)) {
      sendError(res, 429, 'Too Many Requests');
      return;
    }
  }

  const origin = req.headers['origin'] ?? `http://localhost:${DEFAULT_PORT}`;
  const allowedOrigin = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
    ? origin
    : `http://localhost:${DEFAULT_PORT}`;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // Auth check for API routes (POST and mutating endpoints)
  if (url.startsWith('/api/') && method === 'POST') {
    if (!checkAuth(req, apiToken ?? null)) {
      sendError(res, 401, 'Unauthorized — provide Authorization: Bearer <token>');
      return;
    }
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

    if (url === '/api/config/defaults') {
      const defaults = createDefaultConfig();
      sendJson(res, defaults);
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

    // GET /api/tasks — list all task JSON files from .tasks/
    if (url === '/api/tasks') {
      const tasksDir = join(projectRoot, TASKS_DIR);
      if (!existsSync(tasksDir)) { sendJson(res, []); return; }
      const files = readdirSync(tasksDir).filter(f => f.endsWith('.json') && f.startsWith('task-'));
      const tasks = files.map(f => readJsonSafe(join(tasksDir, f))).filter(Boolean);
      sendJson(res, tasks);
      return;
    }

    // GET /api/job/:jobId
    if (url.startsWith('/api/job/')) {
      const jobId = url.slice('/api/job/'.length);
      const job = activeJobs.get(jobId);
      if (!job) {
        sendError(res, 404, 'Job not found');
        return;
      }
      sendJson(res, job);
      return;
    }

    // GET /api/worker/:taskId/log
    if (url.startsWith('/api/worker/') && url.endsWith('/log')) {
      const taskId = url.slice('/api/worker/'.length, -'/log'.length);
      if (!taskId) {
        sendError(res, 400, 'Missing taskId');
        return;
      }
      const taskPath = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
      const task = readJsonFile(taskPath);
      if (!task) {
        sendError(res, 404, 'Task not found');
        return;
      }
      const log = readWorkerLog(projectRoot, taskId);
      sendJson(res, { taskId, log, task });
      return;
    }

    if (url === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': allowedOrigin,
      });
      res.write('retry: 3000\n\n');
      sseClients.add(res);
      req.on('close', () => { sseClients.delete(res); });
      if (initWatcher) initWatcher();
      return;
    }

    // Static file serving for dashboard
    if (staticDir && !url.startsWith('/api/')) {
      const urlPath = url.split('?')[0] ?? '/';
      const resolved = resolve(staticDir, urlPath === '/' ? 'index.html' : urlPath.slice(1));
      if (!resolved.startsWith(resolve(staticDir))) {
        sendError(res, 403, 'Forbidden');
        return;
      }

      if (existsSync(resolved)) {
        try {
          const content = readFileSync(resolved);
          const mimeType = MIME_TYPES[extname(resolved)] ?? 'application/octet-stream';
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON body';
      if (msg === 'Payload too large') {
        sendError(res, 413, 'Payload too large');
      } else {
        sendError(res, 400, 'Invalid JSON body');
      }
      return;
    }

    if (url === '/api/start') {
      const parsed = StartSchema.safeParse(body);
      if (!parsed.success) {
        sendError(res, 400, parsed.error.message);
        return;
      }
      if (getRunningJob()) {
        sendError(res, 409, 'Sprint already running');
        return;
      }
      const b = parsed.data;
      const jobId = `job-${Date.now()}`;
      const job: ActiveJob = { id: jobId, status: 'running' };
      activeJobs.set(jobId, job);
      sendJson(res, { jobId, status: 'started' }, 202);

      // Run sprint in background
      loadConfig(projectRoot)
        .then((config) => runSprint(projectRoot, config, { autoApprove: b.autoApprove }))
        .then((result) => {
          const j = activeJobs.get(jobId);
          if (j) { j.status = 'completed'; j.result = result; }
        })
        .catch((err: unknown) => {
          const j = activeJobs.get(jobId);
          if (j) { j.status = 'failed'; j.error = err instanceof Error ? err.message : String(err); }
        });
      return;
    }

    if (url === '/api/plan') {
      const parsed = PlanSchema.safeParse(body);
      if (!parsed.success) {
        sendError(res, 400, parsed.error.message);
        return;
      }
      try {
        const b = parsed.data;
        void b.directive; // reserved for future use
        const config = await loadConfig(projectRoot);
        const context = readContext(projectRoot);
        const usage = checkUsage(config);
        const recommendation = adjustSprintSize(config, usage);
        const plan = await planSprint(projectRoot, config, context, recommendation, {
          mode: b.mode,
        });
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
      if (!WORKER_ID_RE.test(workerId)) { sendError(res, 400, 'Invalid workerId'); return; }
      try {
        killWorker(workerId);
        sendJson(res, { success: true });
      } catch (err: unknown) {
        sendError(res, 500, err instanceof Error ? err.message : 'Kill failed');
      }
      return;
    }

    if (url === '/api/set-directives') {
      const parsed = SetDirectivesSchema.safeParse(body);
      if (!parsed.success) {
        sendError(res, 400, 'Missing content field');
        return;
      }
      const b = parsed.data;
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
      const parsed = ConfigSchema.safeParse(body);
      if (!parsed.success) {
        sendError(res, 400, parsed.error.message);
        return;
      }
      const configPath = join(projectRoot, PROJECT_CONFIG_PATH);
      try {
        const existing: Record<string, unknown> = readJsonSafe<Record<string, unknown>>(configPath) ?? {};
        const merged = deepMerge(existing, parsed.data as Partial<Record<string, unknown>>);
        // Validate merged config before writing
        try {
          validatePartialConfig(merged as Partial<import('../core/config-types.js').DeckentConfig>);
        } catch (validationErr: unknown) {
          if (validationErr instanceof Error && validationErr.name === 'ConfigValidationError' && 'errors' in validationErr) {
            sendJson(res, { error: { code: 'VALIDATION_ERROR', message: 'Config validation failed', details: (validationErr as ConfigValidationError).errors } }, 422);
            return;
          }
          // Non-validation errors (e.g. missing function) are ignored — write proceeds
        }
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

export interface HttpServerOptions {
  port?: number;
  staticDir?: string;
  /** Bearer token for POST endpoints. If omitted, auth is disabled. */
  apiToken?: string;
  /** Bind address. Defaults to 127.0.0.1 (localhost-only). */
  host?: string;
  /** Auto-generate a token if none provided. Defaults to false. */
  autoGenerateToken?: boolean;
  /** Max requests per minute per IP. Defaults to 100. 0 disables rate limiting. */
  rateLimit?: number;
}

export function createHttpServer(projectRoot: string, port?: number, staticDir?: string, apiToken?: string): HttpApi;
export function createHttpServer(projectRoot: string, opts?: HttpServerOptions): HttpApi;
export function createHttpServer(
  projectRoot: string,
  portOrOpts?: number | HttpServerOptions,
  staticDir?: string,
  apiToken?: string,
): HttpApi {
  let listenPort: number;
  let resolvedStaticDir: string | undefined;
  let resolvedToken: string | undefined;
  let host: string;

  let autoGenerateToken = false;
  let rateLimitMax = 100;

  if (typeof portOrOpts === 'object' && portOrOpts !== null) {
    listenPort = portOrOpts.port ?? DEFAULT_PORT;
    resolvedStaticDir = portOrOpts.staticDir;
    resolvedToken = portOrOpts.apiToken;
    host = portOrOpts.host ?? LOCALHOST_ONLY;
    autoGenerateToken = portOrOpts.autoGenerateToken ?? false;
    rateLimitMax = portOrOpts.rateLimit ?? 100;
  } else {
    listenPort = portOrOpts ?? DEFAULT_PORT;
    resolvedStaticDir = staticDir;
    resolvedToken = apiToken;
    host = LOCALHOST_ONLY;
  }

  // Auto-generate token if requested and none provided
  if (!resolvedToken && autoGenerateToken) {
    resolvedToken = randomUUID();
    process.stderr.write(`[deckent:info] Auto-generated API token: ${resolvedToken}\n`);
  }

  // Warn once at startup if no auth token is configured
  if (!resolvedToken) {
    process.stderr.write(
      '[deckent:warn] API server running without authentication. Set DECKENT_API_TOKEN or config.api_token to enable auth.\n',
    );
  }

  const rateLimiter = rateLimitMax > 0 ? new RateLimiter(rateLimitMax) : undefined;

  const dashPath = join(projectRoot, DASHBOARD_FILE);
  const sseClients = new Set<ServerResponse>();

  // Watch dashboard file for SSE — lazy start
  let watcher: ReturnType<typeof watchDashboard> | null = null;

  function initWatcher(): void {
    if (watcher !== null) return;
    if (!existsSync(dashPath)) return;
    watcher = watchDashboard(dashPath, () => {
      const data = readDashboardJson(dashPath);
      if (!data) return;
      const payload = `data: ${JSON.stringify(data)}\n\n`;
      for (const client of sseClients) {
        client.write(payload);
      }
    });
    // Send current data to all connected clients
    const data = readDashboardJson(dashPath);
    if (data) {
      const payload = `data: ${JSON.stringify(data)}\n\n`;
      for (const client of sseClients) {
        client.write(payload);
      }
    }
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res, projectRoot, dashPath, sseClients, resolvedStaticDir, initWatcher, resolvedToken, rateLimiter).catch((err: unknown) => {
      sendError(res, 500, err instanceof Error ? err.message : 'Internal server error');
    });
  });

  server.listen(listenPort, host);

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
