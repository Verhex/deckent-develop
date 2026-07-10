/**
 * DESK-1 (born-496) — /health loopback identity enrichment.
 *
 * A desktop shell confirms adopt-vs-spawn via GET /health: loopback callers get
 * identity fields (version/pid/projectRoot/terminalEnabled) in addition to the
 * legacy minimal body. The remote-caller gate reuses the pre-existing
 * `isLocalhostRequest` helper (own unit coverage) — a non-loopback socket keeps
 * the exact minimal body, so pid/projectRoot never leak off-machine.
 *
 * Hermetic: real ephemeral-port server over a tmpdir project root; no fs mocks,
 * no HOME/global state.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';

function httpGetJson(port: number, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => { data += c.toString(); });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) as Record<string, unknown> });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

describe('/health — DESK-1 loopback identity enrichment', () => {
  let root: string;
  let api: HttpApi;
  let port: number;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'deckent-health-'));
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    api = createHttpServer(root, 0);
    await new Promise<void>((r) => api.server.once('listening', r));
    const addr = api.server.address();
    port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  });

  afterEach(async () => {
    await api.close();
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    rmSync(root, { recursive: true, force: true });
  });

  it('keeps the legacy minimal contract (status + timestamp)', async () => {
    const { status, body } = await httpGetJson(port, '/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });

  it('adds identity fields for loopback callers (adopt-vs-spawn handshake)', async () => {
    const { body } = await httpGetJson(port, '/health');
    expect(typeof body.version).toBe('string');
    expect(body.pid).toBe(process.pid);
    expect(body.projectRoot).toBe(root);
    // No terminal backend wired in this fixture → capability reported honestly.
    expect(body.terminalEnabled).toBe(false);
  });

  it('serves the same enrichment on the /api/health alias', async () => {
    const { body } = await httpGetJson(port, '/api/health');
    expect(body.pid).toBe(process.pid);
    expect(body.projectRoot).toBe(root);
  });
});
