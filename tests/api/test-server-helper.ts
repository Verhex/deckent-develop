import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer, type HttpApi, type HttpServerOptions } from '../../src/api/server.js';

/**
 * Minimal E2E test harness for the Deckent HTTP API.
 *
 * Boots a real `createHttpServer` on a random port (`port: 0`) against a
 * temporary project root, so tests exercise the request pipeline end-to-end
 * (auth middleware + rate limiter + routing + response serialization).
 *
 * Use this helper instead of mocking `node:fs` when you want to verify the
 * actual HTTP contract surface. For per-handler unit tests with mocked I/O,
 * see `tests/api/server.test.ts`.
 */
export interface TestServerHandle {
  api: HttpApi;
  baseUrl: string;
  projectRoot: string;
  apiToken: string | undefined;
  /** Header set including auth when a token is configured. */
  authHeaders: Record<string, string>;
  close(): Promise<void>;
}

export interface TestServerOptions extends Omit<HttpServerOptions, 'port'> {
  /** When true, bypass auth via DECKENT_API_AUTH_DISABLED=1 (cleared on close). */
  disableAuth?: boolean;
  /** Optional explicit token; takes precedence over disableAuth. */
  apiToken?: string;
  /** Pre-populate dashboard JSON, sprint logs, config, exports, tasks. */
  seed?: SeedData;
  /** Build a project-bound approval composition after the tmp root exists. */
  approvalAuthorityFactory?: (
    projectRoot: string,
  ) => HttpServerOptions['approvalAuthority'];
}

export interface SeedData {
  dashboard?: unknown;
  /** Sprint-state JSON — written to `.deckent/sprint-state.json` so that
   *  reconcileStatusResponse treats the sprint as active and passes through
   *  the dashboard data unchanged. */
  sprintState?: unknown;
  config?: unknown;
  sprintLogs?: Array<{ id: string; markdown: string }>;
  memoryMd?: string;
  debtMd?: string;
  directives?: string;
  tasks?: Array<{ id: string; json: unknown }>;
}

/**
 * Boot a test server and resolve when listening.
 *
 * Caller MUST `await handle.close()` in `afterEach`/`afterAll` — failure to
 * do so leaks the port and the SSE watcher.
 */
export async function startTestServer(
  opts: TestServerOptions = {},
): Promise<TestServerHandle> {
  const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-api-e2e-'));

  // Required directories so server-side fs lookups behave deterministically.
  mkdirSync(join(projectRoot, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(projectRoot, '.brain', 'exports'), { recursive: true });
  mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
  mkdirSync(join(projectRoot, '.locks'), { recursive: true });
  mkdirSync(join(projectRoot, '.deckent'), { recursive: true });

  if (opts.seed) {
    applySeed(projectRoot, opts.seed);
  }
  // SURF-7 note: the orchestration-control ratchet is opened suite-wide via
  // DECKENT_CONTROL_MUTATIONS=1 (tests/setup-control-mutations.ts), NOT here —
  // writing a config file from this helper would break "config absent → 404"
  // pins. The default-OFF posture is pinned by control-mutation-ratchet.test.ts.

  const envBefore = process.env['DECKENT_API_AUTH_DISABLED'];
  const tokenEnvBefore = process.env['DECKENT_API_TOKEN'];
  if (opts.disableAuth && !opts.apiToken) {
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
  } else if (!opts.apiToken) {
    // Default for E2E tests: no token, no bypass — auth middleware will 401
    // every non-exempt request. Caller can opt into either token mode or
    // disabled mode explicitly.
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    delete process.env['DECKENT_API_TOKEN'];
  }

  const approvalAuthority =
    opts.approvalAuthorityFactory?.(projectRoot) ?? opts.approvalAuthority;
  const api = createHttpServer(projectRoot, {
    port: 0,
    apiToken: opts.apiToken,
    rateLimit: opts.rateLimit,
    // Tests run over real loopback sockets; default to the strict (no loopback
    // exemption) limiter so rate-limit wire-up stays E2E-testable. Production
    // serve keeps the exemption (HttpServerOptions default true).
    rateLimitExemptLoopback: opts.rateLimitExemptLoopback ?? false,
    staticDir: opts.staticDir,
    host: opts.host ?? '127.0.0.1',
    ...(opts.oidc ? { oidc: opts.oidc } : {}),
    ...(approvalAuthority ? { approvalAuthority } : {}),
    ...(opts.providerAuthority ? { providerAuthority: opts.providerAuthority } : {}),
    ...(opts.approvalExpirySweepMs !== undefined
      ? { approvalExpirySweepMs: opts.approvalExpirySweepMs }
      : {}),
    ...(opts.terminalBackend ? { terminalBackend: opts.terminalBackend } : {}),
  });

  await new Promise<void>((resolve) => api.server.once('listening', () => resolve()));

  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const authHeaders: Record<string, string> = {};
  if (opts.apiToken) {
    authHeaders['Authorization'] = `Bearer ${opts.apiToken}`;
  }

  return {
    api,
    baseUrl,
    projectRoot,
    apiToken: opts.apiToken,
    authHeaders,
    async close(): Promise<void> {
      await api.close();
      // Restore env exactly as it was — important when other tests share the
      // same vitest worker.
      if (envBefore === undefined) {
        delete process.env['DECKENT_API_AUTH_DISABLED'];
      } else {
        process.env['DECKENT_API_AUTH_DISABLED'] = envBefore;
      }
      if (tokenEnvBefore === undefined) {
        delete process.env['DECKENT_API_TOKEN'];
      } else {
        process.env['DECKENT_API_TOKEN'] = tokenEnvBefore;
      }
      try {
        rmSync(projectRoot, { recursive: true, force: true });
      } catch {
        // Temp dir cleanup is best-effort — don't fail the test on Windows
        // file-lock quirks.
      }
    },
  };
}

function applySeed(projectRoot: string, seed: SeedData): void {
  if (seed.dashboard !== undefined) {
    writeFileSync(
      join(projectRoot, '.dashboard'),
      JSON.stringify(seed.dashboard),
      'utf-8',
    );
  }
  if (seed.sprintState !== undefined) {
    writeFileSync(
      join(projectRoot, '.deckent', 'sprint-state.json'),
      JSON.stringify(seed.sprintState),
      'utf-8',
    );
  }
  if (seed.config !== undefined) {
    writeFileSync(
      join(projectRoot, '.deckent', 'config.json'),
      JSON.stringify(seed.config, null, 2),
      'utf-8',
    );
  }
  if (seed.sprintLogs) {
    for (const log of seed.sprintLogs) {
      writeFileSync(
        join(projectRoot, '.brain', 'sprints', `${log.id}.md`),
        log.markdown,
        'utf-8',
      );
    }
  }
  if (seed.memoryMd !== undefined) {
    writeFileSync(
      join(projectRoot, '.brain', 'exports', 'memory.md'),
      seed.memoryMd,
      'utf-8',
    );
  }
  if (seed.debtMd !== undefined) {
    writeFileSync(
      join(projectRoot, '.brain', 'exports', 'debt.md'),
      seed.debtMd,
      'utf-8',
    );
  }
  if (seed.directives !== undefined) {
    writeFileSync(join(projectRoot, 'DIRECTIVES.md'), seed.directives, 'utf-8');
  }
  if (seed.tasks) {
    for (const task of seed.tasks) {
      writeFileSync(
        join(projectRoot, '.tasks', `task-${task.id}.json`),
        JSON.stringify(task.json, null, 2),
        'utf-8',
      );
    }
  }
}

/** Convenience wrapper around `globalThis.fetch` with sensible E2E defaults. */
export interface FetchResult {
  status: number;
  headers: Headers;
  text: string;
  json<T = unknown>(): T;
}

export async function call(
  handle: TestServerHandle,
  path: string,
  init: RequestInit = {},
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    ...handle.authHeaders,
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${handle.baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    json<T = unknown>(): T {
      return JSON.parse(text) as T;
    },
  };
}

/**
 * Subscribe to a SSE stream and resolve with the first `data:` payload.
 * The connection is torn down via AbortController before the promise resolves.
 */
export async function readFirstSseEvent(
  handle: TestServerHandle,
  path = '/api/events',
  timeoutMs = 1500,
): Promise<{ status: number; firstChunk: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${handle.baseUrl}${path}`, {
      headers: { ...handle.authHeaders, Accept: 'text/event-stream' },
      signal: controller.signal,
    });

    if (!res.body) {
      return { status: res.status, firstChunk: '' };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE chunks are delimited by a blank line; once we have one we can stop.
      if (buf.includes('\n\n')) break;
    }
    return { status: res.status, firstChunk: buf };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Synthetic dashboard JSON used in multiple tests. */
export function buildDashboardSeed(overrides: Record<string, unknown> = {}): unknown {
  return {
    sprint: { id: 'sprint-001', number: 1, phase: 'EXECUTE', status: 'ACTIVE' },
    agents: [],
    progress: { done: 1, active: 0, blocked: 0, total: 1 },
    alerts: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Synthetic sprint markdown that survives the history/sprint parser. */
export function buildSprintMarkdown(id = 'sprint-001'): string {
  return [
    `# ${id}`,
    '',
    '## Metrics',
    '| Metric | Value |',
    '|--------|-------|',
    '| Total Tasks | 1 |',
    '| Completed | 1 |',
    '| Tech Debt | 0 |',
    '| No-Go | 0 |',
    '| Coverage | 100% |',
    '| Duration | 1000ms |',
    '',
    '## Tasks',
    '- 001-001: Seed task (DONE)',
    '',
  ].join('\n');
}

/** Used by `existsSync` callers from outside the helper. */
export function pathExists(p: string): boolean {
  return existsSync(p);
}
