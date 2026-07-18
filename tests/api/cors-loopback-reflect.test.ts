// ═══ CORS loopback-reflect — KABUL Gün-1 pürüz-2 ════════════════════════════
//
// The live Day-1 dogfood caught two CORS defects at once: (a) sendJson pinned
// ACAO to the HARDCODED default port (origin-insensitive → the Desktop
// dev-renderer on localhost:5173 was refused), and (b) closure-served routes
// (run-flow, terminal) carried NO ACAO at all. The fix is ONE per-request
// reflecting point (applyLoopbackCors + resolveCorsOrigin). These pins hold:
// loopback any-port reflects, packaged `Origin: null` reflects, a non-loopback
// origin NEVER gets a header, and closure routes now carry it too.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer, resolveCorsOrigin, type HttpApi } from '../../src/api/server.js';

let tmpRoot: string;
let api: HttpApi | undefined;

beforeEach(() => {
  delete process.env['DECKENT_API_TOKEN'];
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-cors-reflect-'));
});

afterEach(async () => {
  if (api) {
    await api.close();
    api = undefined;
  }
  rmSync(tmpRoot, { recursive: true, force: true });
});

async function port(a: HttpApi): Promise<number> {
  if (!a.server.listening) {
    await new Promise<void>((resolve, reject) => {
      a.server.once('listening', () => resolve());
      a.server.once('error', reject);
    });
  }
  const addr = a.server.address();
  if (addr === null || typeof addr === 'string') throw new Error('server address unavailable');
  return addr.port;
}

describe('resolveCorsOrigin (pure)', () => {
  it('reflects loopback http origins on ANY port + the packaged file:// null-origin', () => {
    expect(resolveCorsOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(resolveCorsOrigin('http://127.0.0.1:3100')).toBe('http://127.0.0.1:3100');
    expect(resolveCorsOrigin('http://[::1]:8080')).toBe('http://[::1]:8080');
    expect(resolveCorsOrigin('null')).toBe('null');
  });

  it('never reflects non-loopback / https-spoof / missing origins', () => {
    expect(resolveCorsOrigin('http://evil.example:3100')).toBeNull();
    expect(resolveCorsOrigin('https://localhost:5173')).toBeNull(); // scheme must be plain loopback http
    expect(resolveCorsOrigin('http://localhost')).toBeNull(); // explicit port required
    expect(resolveCorsOrigin(undefined)).toBeNull();
    expect(resolveCorsOrigin('')).toBeNull();
  });
});

describe('per-request CORS on the wire (Day-1 blank-fetch class)', () => {
  it('a JSON api response reflects the loopback dev-renderer origin (was: hardcoded default port)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true });
    const base = `http://127.0.0.1:${await port(api)}`;
    const res = await fetch(`${base}/api/approvals`, {
      headers: { Authorization: `Bearer ${api.apiToken!}`, Origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('a closure-served route carries the header too (was: NO ACAO at all on /api/run-flow/*)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true });
    const base = `http://127.0.0.1:${await port(api)}`;
    const res = await fetch(`${base}/api/run-flow/list`, {
      headers: { Authorization: `Bearer ${api.apiToken!}`, Origin: 'http://localhost:5173' },
    });
    // flag-off may answer 404 — the header must be there REGARDLESS of status.
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('pürüz-5: an UNAUTHENTICATED preflight to closure-served /api/terminal/* answers 204 (never the token-gate 401)', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true });
    const base = `http://127.0.0.1:${await port(api)}`;
    const res = await fetch(`${base}/api/terminal/token`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
    // the preflight GRANTS nothing — the real method still hits the gate:
    const real = await fetch(`${base}/api/terminal/sessions`, { headers: { Origin: 'http://localhost:5173' } });
    expect(real.status).toBe(401);
  });

  it('the packaged renderer (`Origin: null`) reflects; a non-loopback origin gets NOTHING', async () => {
    api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true });
    const base = `http://127.0.0.1:${await port(api)}`;
    const packaged = await fetch(`${base}/api/approvals`, {
      headers: { Authorization: `Bearer ${api.apiToken!}`, Origin: 'null' },
    });
    expect(packaged.headers.get('access-control-allow-origin')).toBe('null');
    const evil = await fetch(`${base}/api/approvals`, {
      headers: { Authorization: `Bearer ${api.apiToken!}`, Origin: 'http://evil.example:5173' },
    });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
