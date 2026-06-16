/**
 * DASH-OPS-1 (§15 ARC-C) — honest "dashboard not built" page.
 *
 * When the dashboard bundle is genuinely missing (fresh clone, or a TS-only
 * `npm run build` before `build:dashboard`), `deckent serve` must NOT answer a
 * dashboard route with a bare 404. It serves a 200 HTML page that tells the
 * owner the bundle is missing and how to build it — the JSON API at /api/*
 * stays available. (The other DASH-OPS-1 half — clean.mjs preserving
 * dist/dashboard across a TS-only build — already shipped.)
 *
 * Hermetic: boots the REAL HTTP server against a tmpdir staticDir that contains
 * NO index.html. Model: serve-spa-token-inject.test.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createHttpServer,
  renderDashboardNotBuiltPage,
  type HttpApi,
} from '../../src/api/server.js';

function makeEmptyStaticDir(): string {
  // No index.html written — simulates a never-built / wiped dashboard bundle.
  return mkdtempSync(join(tmpdir(), 'deckent-nodash-static-'));
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-nodash-proj-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

async function bootServer(staticDir: string, projectRoot: string): Promise<{ api: HttpApi; baseUrl: string }> {
  const api = createHttpServer(projectRoot, { port: 0, apiToken: 'tok-nodash', staticDir, host: '127.0.0.1' });
  await new Promise<void>((resolve) => api.server.once('listening', () => resolve()));
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  return { api, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe('DASH-OPS-1 — honest dashboard-not-built page', () => {
  let staticDir: string | undefined;
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;

  afterEach(async () => {
    if (api) { try { await api.close(); } catch { /* ignore */ } api = undefined; }
    if (staticDir) { try { rmSync(staticDir, { recursive: true, force: true }); } catch { /* ignore */ } staticDir = undefined; }
    if (projectRoot) { try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ } projectRoot = undefined; }
  });

  it('renderDashboardNotBuiltPage is valid HTML naming the build command and the live API', () => {
    const html = renderDashboardNotBuiltPage();
    expect(html).toContain('<!doctype html>');
    expect(html).toMatch(/dashboard/i);
    expect(html).toMatch(/not built|build the dashboard/i);
    expect(html).toContain('npm run build:dashboard');
    expect(html).toContain('/api');
  });

  it('serves the honest page (200, not a bare 404) on the root path when the bundle is missing', async () => {
    staticDir = makeEmptyStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer(staticDir, projectRoot);
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');
    const html = await res.text();
    expect(html).toContain('npm run build:dashboard');
  });

  it('serves the honest page on a deep-link route too (SPA path, bundle missing)', async () => {
    staticDir = makeEmptyStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer(staticDir, projectRoot);
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/enterprise`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/not built|build the dashboard/i);
  });

  it('keeps the JSON API working while the dashboard bundle is missing', async () => {
    staticDir = makeEmptyStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer(staticDir, projectRoot);
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/api/status`, { headers: { Authorization: 'Bearer tok-nodash' } });
    expect(res.status).toBe(200);
  });
});
