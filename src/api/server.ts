import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import type { SessionBackend } from './terminal/session-backend.js';
import { PtySessionManager } from './terminal/session-manager.js';
import { LocalTokenAuthProvider } from './terminal/auth-provider.js';
import { TerminalAudit, type AuditSink } from './terminal/audit.js';
import { attachTerminalGateway } from './terminal/ws-gateway.js';
import type { CreateSessionInput, SessionKind, TenantId } from './terminal/types.js';
import { z } from 'zod';
import {
  DASHBOARD_FILE, BRAIN_DIR, SPRINTS_DIR, TASKS_DIR, LOCKS_DIR,
  PROJECT_CONFIG_PATH, DIRECTIVES_FILE,
} from '../core/constants.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../core/types.js';
import type { Task, Sprint } from '../core/types.js';
import { readJsonSafe } from '../core/utils.js';
import { deepMerge } from '../core/config.js';
import { watchDashboard } from './watcher.js';
import { bearerAuthMiddleware, resolveAuthToken } from './auth.js';
import { injectApiTokenIntoHtml, isLoopbackRemote } from './middleware/token.js';
import { parseSprintLog } from '../cli/commands/history.js';
import { runDoctorChecks } from '../cli/commands/doctor.js';
import { killWorker } from '../orchestra/tmux.js';
import { loadConfig, createDefaultConfig, validatePartialConfig, ConfigValidationError } from '../core/config.js';
import { readWorkerLog } from '../agents/worker.js';
import { AgentPoolManager } from '../core/agent-pool.js';
import {
  readContext, planSprint, cleanup,
} from '../orchestra/brain.js';
import { startSprintDetached } from './sprint-job-runner.js';
import {
  IncomingMessageRouter,
  isValidConnectorId,
  parseWebhookPayload,
  validateWebhookKey,
} from '../connectors/incoming-router.js';
import { loadDeckSecrets } from '../core/deck-file.js';
import { buildChatReply } from './chat-handler.js';
import { registerEvolutionRoutes } from './evolution-endpoint.js';
import { registerMemorySearch } from './memory-search-endpoint.js';

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

// ─── Security Headers ───────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-XSS-Protection': '0',
};

// ─── Zod Schemas for POST validation ────────────────────────────
const StartSchema = z.object({ autoApprove: z.boolean().optional() });
const PlanSchema = z.object({
  directive: z.string().optional(),
  mode: z.enum(['ai', 'structured', 'auto']).optional(),
});
const SetDirectivesSchema = z.object({ content: z.string().min(1) });
const ChatSchema = z.object({ message: z.string() });
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
    ...SECURITY_HEADERS,
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

/** One-line current status for the /api/chat handler. */
function chatStatusLine(projectRoot: string, dashPath: string): string {
  const data = readDashboardJson(dashPath) as {
    sprint?: { id?: string; phase?: string; status?: string };
    progress?: { done?: number; active?: number; blocked?: number; total?: number };
  } | null;
  if (data?.sprint) {
    const s = data.sprint;
    const p = data.progress ?? {};
    return `${s.id ?? 'sprint'} — ${s.phase ?? s.status ?? 'running'} — ` +
      `${p.done ?? 0}/${p.total ?? 0} done, ${p.active ?? 0} active, ${p.blocked ?? 0} blocked`;
  }
  const last = getLatestSprintLog(projectRoot);
  return last ? `idle — last sprint ${last.id}` : 'idle — no sprint yet';
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

function computeRoutingDistribution(
  performanceMap: Record<string, { totalTasks?: number }>,
): { entries: Array<{ id: string; tasks: number; pct: number }>; total: number } {
  const entries = Object.entries(performanceMap);
  if (entries.length === 0) return { entries: [], total: 0 };
  const total = entries.reduce((s, [, p]) => s + (p.totalTasks ?? 0), 0);
  if (total === 0) return { entries: entries.map(([id]) => ({ id, tasks: 0, pct: 0 })), total: 0 };
  const result = entries
    .map(([id, p]) => ({
      id,
      tasks: p.totalTasks ?? 0,
      pct: Math.round(((p.totalTasks ?? 0) / total) * 1000) / 10,
    }))
    .sort((a, b) => b.tasks - a.tasks);
  return { entries: result, total };
}

function detectRoutingImbalance(
  entries: Array<{ id: string; pct: number }>,
  threshold = 80,
): string[] {
  return entries
    .filter((e) => e.pct > threshold)
    .map((e) => `IMBALANCE: "${e.id}" dominates with ${e.pct}% (threshold: ${threshold}%)`);
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
  _apiToken?: string | null,
  rateLimiter?: RateLimiter,
  authMiddleware?: (req: IncomingMessage, res: ServerResponse) => boolean,
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

  const origin = req.headers['origin'] ?? '';
  // Strict CORS: only localhost/127.0.0.1 with explicit port — wildcard never allowed
  const isAllowedOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
  const allowedOrigin = isAllowedOrigin ? origin : `http://localhost:${DEFAULT_PORT}`;

  // CORS preflight
  if (method === 'OPTIONS') {
    if (!isAllowedOrigin && origin !== '') {
      // Reject CORS preflight from disallowed origins
      res.writeHead(403, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      res.end(JSON.stringify({ error: 'CORS origin not allowed' }));
      return;
    }
    res.writeHead(200, {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...SECURITY_HEADERS,
    });
    res.end();
    return;
  }

  // Auth check for all API routes (health endpoint exempt, handled by bearerAuthMiddleware)
  if (url.startsWith('/api/') && authMiddleware) {
    if (!authMiddleware(req, res)) return;
  }

  // ─── Health endpoint (always accessible, no auth) ──────────
  if (method === 'GET' && (url === '/health' || url === '/api/health')) {
    sendJson(res, { status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  // ─── GET routes ────────────────────────────────────────────
  if (method === 'GET') {
    if (url === '/api/status') {
      const data = readDashboardJson(dashPath);
      if (data) { sendJson(res, data); return; }

      // No active sprint — return idle state with last sprint summary
      const lastSprint = getLatestSprintLog(projectRoot);
      sendJson(res, {
        sprint: {
          id: lastSprint?.id ?? null,
          phase: 'IDLE',
          status: 'IDLE',
        },
        agents: [],
        progress: { done: 0, active: 0, blocked: 0, total: 0 },
        alerts: [],
        updatedAt: new Date().toISOString(),
        idle: true,
        lastSprint: lastSprint ? {
          id: lastSprint.id,
          metrics: lastSprint.metrics,
          tasks: lastSprint.tasks,
        } : null,
      });
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
      // B8: memory is DB-first; serve the generated exports/memory.md view.
      const content = readTextFile(join(projectRoot, BRAIN_DIR, 'exports', 'memory.md'));
      if (content === null) { sendError(res, 404, 'Memory export not found'); return; }
      sendJson(res, { content });
      return;
    }

    if (url === '/api/debt') {
      // Task #4d: DEBT.md is DB-first; serve the generated exports/debt.md view.
      const content = readTextFile(join(projectRoot, BRAIN_DIR, 'exports', 'debt.md'));
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

    // GET /api/workers — list active workers from .tasks/*.hb heartbeat files
    if (url === '/api/workers') {
      const tasksDir = join(projectRoot, TASKS_DIR);
      if (!existsSync(tasksDir)) { sendJson(res, []); return; }
      const hbFiles = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.hb'));
      const workers = hbFiles.map((f) => {
        const hb = readJsonSafe<Record<string, unknown>>(join(tasksDir, f));
        if (!hb) return null;
        const taskId = String(hb['taskId'] ?? '');
        const taskFile = join(tasksDir, `task-${taskId}.json`);
        const task = readJsonSafe<Record<string, unknown>>(taskFile);
        return {
          workerId: hb['workerId'] ?? null,
          taskId,
          status: hb['status'] ?? 'UNKNOWN',
          sequence: hb['sequence'] ?? 0,
          timestamp: hb['timestamp'] ?? null,
          taskTitle: task ? String(task['title'] ?? '') : null,
          taskStatus: task ? String(task['status'] ?? '') : null,
        };
      }).filter(Boolean);
      sendJson(res, workers);
      return;
    }

    // GET /api/agents — list enabled agents from agent pool
    if (url === '/api/agents') {
      const agentPool = new AgentPoolManager(projectRoot);
      const agents = agentPool.listEnabled().map((a) => ({
        id: a.id,
        name: a.name,
        source: a.source,
        enabled: a.enabled,
        totalUses: a.stats?.totalUses ?? 0,
        successRate: a.stats?.successRate ?? 0,
      }));
      sendJson(res, agents);
      return;
    }

    // GET /api/routing/distribution — agent+skill routing distribution from learnings.json
    if (url === '/api/routing/distribution') {
      const learningsPath = join(projectRoot, '.deckent', 'routing', 'learnings.json');
      const learnings = readJsonSafe<Record<string, unknown>>(learningsPath);
      if (!learnings) {
        sendJson(res, { agents: { entries: [], total: 0 }, skills: { entries: [], total: 0 }, warnings: [], totalOutcomes: 0 });
        return;
      }
      const agentPerf = (learnings['agentPerformance'] ?? {}) as Record<string, { totalTasks?: number }>;
      const skillPerf = (learnings['skillPerformance'] ?? {}) as Record<string, { totalTasks?: number }>;
      const agentDist = computeRoutingDistribution(agentPerf);
      const skillDist = computeRoutingDistribution(skillPerf);
      const warnings = detectRoutingImbalance([...agentDist.entries, ...skillDist.entries]);
      sendJson(res, { agents: agentDist, skills: skillDist, warnings, totalOutcomes: learnings['totalOutcomes'] ?? 0 });
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

    // SSE: EventSource can append `?token=...` for auth (Sprint 191), so
    // accept both bare and query-suffixed forms.
    if (url === '/api/events' || url.startsWith('/api/events?')) {
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

    // Evolution endpoints: /api/evolution/genealogy, /retirement, /prompt-metrics
    if (url.startsWith('/api/evolution/')) {
      if (registerEvolutionRoutes(url, res, projectRoot)) return;
    }

    // Memory FTS5 search: /api/memory/search?q= (216-012)
    if (registerMemorySearch(url, res, projectRoot)) return;

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
      const { jobId } = startSprintDetached(
        projectRoot,
        { autoApprove: b.autoApprove },
        (code) => {
          const j = activeJobs.get(jobId);
          if (j) {
            if (code === 0) { j.status = 'completed'; }
            else { j.status = 'failed'; j.error = `Sprint exited with code ${code ?? 'null'}`; }
          }
        },
      );
      const job: ActiveJob = { id: jobId, status: 'running' };
      activeJobs.set(jobId, job);
      console.log(`[deckent] Sprint started via dashboard (jobId: ${jobId})`);
      sendJson(res, { jobId, status: 'started' }, 202);
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
        const maxW = config.activeModeConfig.max_workers;
        const recommendation = {
          size: 'full' as const,
          maxWorkers: typeof maxW === 'number' ? maxW : 4,
          modelConstraint: null,
          reason: 'No usage constraints',
        };
        const plan = await planSprint(projectRoot, config, context, recommendation, {
          mode: b.mode,
        });
        console.log(`[deckent] Plan requested via dashboard (mode: ${b.mode ?? 'auto'})`);
        sendJson(res, plan);
      } catch (err: unknown) {
        sendError(res, 500, err instanceof Error ? err.message : 'Plan failed');
      }
      return;
    }

    if (url === '/api/chat') {
      const parsed = ChatSchema.safeParse(body);
      if (!parsed.success) {
        sendError(res, 400, parsed.error.message);
        return;
      }
      const reply = buildChatReply(parsed.data.message, {
        status: () => chatStatusLine(projectRoot, dashPath),
      });
      sendJson(res, { reply });
      return;
    }

    // POST /api/kill/:workerId
    if (url.startsWith('/api/kill/')) {
      const workerId = url.slice('/api/kill/'.length);
      if (!workerId) { sendError(res, 400, 'Missing workerId'); return; }
      if (!WORKER_ID_RE.test(workerId)) { sendError(res, 400, 'Invalid workerId'); return; }
      try {
        killWorker(workerId);
        console.log(`[deckent] Worker killed via dashboard: ${workerId}`);
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
        console.log(`[deckent] Directives updated via dashboard (${taskCount} tasks)`);
        sendJson(res, { success: true, taskCount });
      } catch (err: unknown) {
        sendError(res, 500, err instanceof Error ? err.message : 'Write failed');
      }
      return;
    }

    if (url === '/api/cleanup') {
      const tasksDir = join(projectRoot, TASKS_DIR);
      const locksDir = join(projectRoot, LOCKS_DIR);

      // Collect task JSON files to check for active sprint
      const tasks: Task[] = [];
      if (existsSync(tasksDir)) {
        const jsonFiles = (readdirSync(tasksDir) as string[]).filter(
          (f) => f.startsWith('task-') && f.endsWith('.json'),
        );
        for (const f of jsonFiles) {
          try {
            const task = readJsonSafe(join(tasksDir, f)) as Task | null;
            if (!task) continue;
            tasks.push(task);
          } catch { /* skip malformed */ }
        }
      }

      // Block cleanup if sprint is actively executing
      const activeTasks = tasks.filter(
        (t) => t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED,
      );
      if (activeTasks.length > 0) {
        sendJson(res, { error: 'Cannot cleanup while sprint is active' }, 409);
        return;
      }

      // Count files before cleanup for the result payload
      const taskFileCount = existsSync(tasksDir)
        ? (readdirSync(tasksDir) as string[]).filter((f) => /\.(json|plan|hb|result|paused|log)$/.test(f)).length
        : 0;
      const lockFileCount = existsSync(locksDir)
        ? (readdirSync(locksDir) as string[]).length
        : 0;

      const sprint: Sprint = {
        id: `cleanup-${Date.now()}`,
        number: 0,
        status: SprintStatus.COMPLETE,
        phase: SprintPhase.COMPLETE,
        tasks,
        workers: [],
      };

      try {
        cleanup(projectRoot, sprint);
        console.log(`[deckent] Cleanup triggered via dashboard (removed: ${taskFileCount} tasks, ${lockFileCount} locks)`);
        sendJson(res, { success: true, removedTasks: taskFileCount, removedLocks: lockFileCount });
      } catch (err: unknown) {
        sendError(res, 500, err instanceof Error ? err.message : 'Cleanup failed');
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
        const changedKeys = Object.keys(parsed.data as Record<string, unknown>).join(', ');
        console.log(`[deckent] Config updated via dashboard: ${changedKeys}`);
        sendJson(res, merged);
      } catch (err: unknown) {
        sendError(res, 500, err instanceof Error ? err.message : 'Config update failed');
      }
      return;
    }

    // POST /api/webhooks/:connector/:key — inbound webhook from messaging platforms
    if (url.startsWith('/api/webhooks/')) {
      const parts = url.slice('/api/webhooks/'.length).split('/');
      const connector = parts[0] ?? '';
      const key = parts[1] ?? '';

      if (!connector || !key) {
        sendError(res, 400, 'Missing connector or key parameter');
        return;
      }

      if (!isValidConnectorId(connector)) {
        sendError(res, 400, `Invalid connector: ${connector}`);
        return;
      }

      // Validate webhook key against .deck secrets
      const secrets = loadDeckSecrets(projectRoot);
      const expectedKey = secrets['DECKENT_WEBHOOK_KEY'] ?? secrets[`DECKENT_WEBHOOK_KEY_${connector.toUpperCase()}`] ?? '';
      if (!expectedKey || !validateWebhookKey(key, expectedKey)) {
        sendError(res, 401, 'Invalid webhook key');
        return;
      }

      // Parse payload per connector format
      const parsed = parseWebhookPayload(connector, body);
      if (!parsed) {
        sendError(res, 400, 'Invalid webhook payload');
        return;
      }

      // Route to nervous system via IncomingMessageRouter
      const router = new IncomingMessageRouter();
      router.route({
        id: parsed.id,
        connector,
        fromUser: parsed.fromUser,
        channelId: parsed.channelId,
        text: parsed.text,
        timestamp: parsed.timestamp,
        raw: parsed.raw,
      });

      sendJson(res, { ok: true });
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
  /** Terminal auth token (test-exposed). Only set when terminal is enabled. */
  terminalToken?: string;
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
  /** PTY session backend for embedded terminal support (Sprint 175). */
  terminalBackend?: SessionBackend;
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
  let terminalBackend: SessionBackend | undefined;

  if (typeof portOrOpts === 'object' && portOrOpts !== null) {
    listenPort = portOrOpts.port ?? DEFAULT_PORT;
    resolvedStaticDir = portOrOpts.staticDir;
    resolvedToken = portOrOpts.apiToken;
    host = portOrOpts.host ?? LOCALHOST_ONLY;
    autoGenerateToken = portOrOpts.autoGenerateToken ?? false;
    rateLimitMax = portOrOpts.rateLimit ?? 100;
    terminalBackend = portOrOpts.terminalBackend;
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

  // Resolve final token: explicit param > env var fallback
  let finalToken = resolveAuthToken(resolvedToken);

  // Sprint 216-006 (reconstructed Sprint 218 after a git reset --hard wiped the
  // original uncommitted change). On a loopback bind with no configured token,
  // auto-mint an API token so the dashboard served from the same origin receives
  // a working `__DECKENT_API_TOKEN__` injection and `/api/*` returns 200 instead
  // of 401. Without this the dashboard loads but every data call fails. Remote
  // binds still require an explicit token (no silent auth on non-loopback).
  const isLoopbackHost = host === '127.0.0.1' || host === '::1' || host === 'localhost';
  if (!finalToken && isLoopbackHost && process.env['DECKENT_API_AUTH_DISABLED'] !== '1') {
    finalToken = randomBytes(32).toString('hex');
    process.stderr.write(`[deckent:info] Auto-minted localhost API token: ${finalToken}\n`);
  }

  // Inform at startup about auth status (only reached on a remote bind with no token)
  if (!finalToken && process.env['DECKENT_API_AUTH_DISABLED'] !== '1') {
    process.stderr.write(
      '[deckent:info] No API token configured. All API requests will require auth (401). Set DECKENT_API_TOKEN or config.api_auth_token to provide a token.\n',
    );
  }

  // Build auth middleware with health endpoint exempt. SSE clients
  // (`EventSource`) cannot set Authorization headers, so `/api/events` opts
  // into a `?token=...` query-parameter fallback — the dashboard appends the
  // bootstrap token there. Same constant-time compare as the Bearer header.
  const authMiddleware = bearerAuthMiddleware({
    configToken: finalToken,
    exemptPaths: ['/health', '/api/health'],
    queryTokenPaths: ['/api/events'],
  });

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

  // ─── Terminal setup (Sprint 175) ──────────────────────────────
  let terminalToken: string | undefined;
  let terminalMgr: PtySessionManager | undefined;
  let terminalAudit: TerminalAudit | undefined;
  let terminalAuth: LocalTokenAuthProvider | undefined;
  let terminalReaper: NodeJS.Timeout | undefined;

  if (terminalBackend) {
    // Check if terminal is enabled via project config (sync read — createHttpServer is synchronous)
    let terminalEnabled = true;
    const projCfgPath = join(projectRoot, PROJECT_CONFIG_PATH);
    if (existsSync(projCfgPath)) {
      try {
        const raw = readFileSync(projCfgPath, 'utf-8');
        const projCfg = JSON.parse(raw) as { terminal?: { enabled?: boolean } };
        if (projCfg?.terminal?.enabled === false) {
          terminalEnabled = false;
        }
      } catch { /* ignore parse errors */ }
    }

    if (terminalEnabled) {
      // Terminal ALWAYS mints its own token — independent of API auth (spec §1c.2).
      // LocalTokenAuthProvider uses constant-time SHA-256 compare (timingSafeEqual)
      // and DELIBERATELY ignores DECKENT_API_AUTH_DISABLED.
      terminalToken = randomUUID();
      process.stderr.write(`[deckent:info] Auto-generated API token: ${terminalToken}\n`);
      terminalMgr = new PtySessionManager(terminalBackend, {
        scrollbackBytes: 262_144,
        idleTimeoutMs: 1_800_000,
        maxSessions: 10,
      });
      // Structured audit recorder. Tests pass a no-op sink; production wires
      // MemoryStore. Raw PTY output is NEVER routed here (security invariant).
      const auditSink: AuditSink = { insert: () => { /* no-op default */ } };
      terminalAudit = new TerminalAudit(auditSink);
      terminalAuth = new LocalTokenAuthProvider(terminalToken);
    }
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    (async () => {
      const rawUrl = req.url ?? '/';
      const urlPath = rawUrl.split('?')[0] ?? '/';
      const method = req.method ?? 'GET';

      // ─── Terminal routes (bypass-independent auth, spec §1c.2) ─
      if (terminalMgr && terminalAuth && terminalAudit && rawUrl.startsWith('/api/terminal/')) {
        const authHeader = req.headers['authorization'] ?? '';
        const tok = authHeader.replace(/^Bearer\s+/i, '');
        if (!terminalAuth.verify(tok || undefined)) {
          terminalAudit.record({
            action: 'auth.deny',
            tenantId: 'local',
            detail: `http ${method} ${urlPath}`,
            at: new Date().toISOString(),
          });
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        // POST /api/terminal/sessions
        if (method === 'POST' && urlPath === '/api/terminal/sessions') {
          let body: unknown;
          try { body = await parseBody(req); } catch { body = {}; }
          const input = body as { kind?: string; tool?: string; args?: string[] };
          const kind = input.kind ?? 'shell';
          try {
            const sess = terminalMgr.create({
              kind: kind as SessionKind,
              tool: input.tool as CreateSessionInput['tool'],
              args: input.args,
              tenantId: 'local' as TenantId,
            });
            terminalAudit.record({
              action: 'session.create',
              tenantId: 'local',
              sessionId: sess.id,
              detail: `kind=${sess.kind}`,
              at: new Date().toISOString(),
            });
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(sess));
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'create failed';
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: msg }));
          }
          return;
        }
        // GET /api/terminal/sessions
        if (method === 'GET' && urlPath === '/api/terminal/sessions') {
          const list = terminalMgr.list();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(list));
          return;
        }
        // DELETE /api/terminal/sessions/:id
        if (method === 'DELETE' && urlPath.startsWith('/api/terminal/sessions/')) {
          const id = urlPath.slice('/api/terminal/sessions/'.length);
          terminalMgr.kill(id);
          terminalAudit.record({
            action: 'session.kill',
            tenantId: 'local',
            sessionId: id,
            detail: 'http delete',
            at: new Date().toISOString(),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        // Unknown terminal route
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // ─── Localhost-only token injection into index.html ─
      // Inject both:
      //   - `window.__DECKENT_TERMINAL_TOKEN__` (existing terminal bootstrap)
      //   - `window.__DECKENT_API_TOKEN__` (Sprint 191 — dashboard reads it and
      //     attaches `Authorization: Bearer ...` on non-terminal fetches)
      // Inject ONLY when at least one token is set AND the caller is loopback.
      // Non-localhost callers receive the unmodified HTML so the tokens never
      // leak across the network.
      if (resolvedStaticDir && (terminalToken || finalToken) && method === 'GET' &&
          (urlPath === '/' || urlPath === '/index.html')) {
        const remoteAddr = req.socket.remoteAddress ?? '';
        const isLocalhost = isLoopbackRemote(remoteAddr);
        if (isLocalhost) {
          const indexPath = join(resolvedStaticDir, 'index.html');
          if (existsSync(indexPath)) {
            try {
              let html = readFileSync(indexPath, 'utf-8');
              if (terminalToken) {
                const inject = `<script>window.__DECKENT_TERMINAL_TOKEN__ = ${JSON.stringify(terminalToken)};</script>`;
                html = html.replace('</head>', inject + '</head>');
              }
              if (finalToken) {
                html = injectApiTokenIntoHtml(html, finalToken);
              }
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(html);
              return;
            } catch { /* fall through to normal handling */ }
          }
        }
      }

      await handleRequest(req, res, projectRoot, dashPath, sseClients, resolvedStaticDir, initWatcher, finalToken, rateLimiter, authMiddleware);
    })().catch((err: unknown) => {
      sendError(res, 500, err instanceof Error ? err.message : 'Internal server error');
    });
  });

  // Attach WS gateway for live terminal sessions (spec §1c.2 — auth verified
  // BEFORE bridge, independent of DECKENT_API_AUTH_DISABLED).
  if (terminalMgr && terminalAuth && terminalAudit) {
    attachTerminalGateway(server, {
      manager: terminalMgr,
      auth: terminalAuth,
      audit: terminalAudit,
    });
    // Idle reaper — sweeps stale non-deckent sessions every 30s.
    // unref() so the timer does not keep the event loop alive in tests.
    terminalReaper = setInterval(() => {
      terminalMgr?.reapIdle();
    }, 30_000);
    terminalReaper.unref?.();
  }

  server.listen(listenPort, host);

  return {
    server,
    terminalToken,
    close(): Promise<void> {
      watcher?.close();
      if (terminalReaper) {
        clearInterval(terminalReaper);
        terminalReaper = undefined;
      }
      terminalMgr?.reapIdle();
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
