import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import type { SessionBackend, BackendHandle } from '../../src/api/terminal/session-backend.js';

/**
 * Task 390-002 (born-565, AI-SESSION-TOOL-ALLOWLIST).
 *
 * `POST /api/terminal/sessions` had a real runtime gate for `kind==='shell'`
 * (config.terminal.allowShellKind, 357-009) but NONE for `kind==='ai'` — the
 * client-supplied `tool` string reached `terminalMgr.create({ tool })` and
 * from there `session-manager.ts` KIND_CMD.ai spawns it verbatim as the
 * executable file. The `AiTool` union (terminal/types.ts) was compile-time
 * only, so it enforced nothing at runtime. This suite proves an unlisted
 * `tool` is rejected (400) BEFORE the session — and therefore the spawn —
 * is ever created, while allowlisted tools and the shell-kind gate are
 * unaffected (real HTTP round-trip against createHttpServer, not a mock).
 */

function fakeBackend(): SessionBackend {
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  return { spawn: (_spec, _onData, _onExit) => handle };
}

/** Captures the exact `file` passed to backend.spawn(), so a test can prove *what* would have been executed. */
function spySpawnBackend(): { be: SessionBackend; spawnedFiles: string[] } {
  const spawnedFiles: string[] = [];
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  const be: SessionBackend = {
    spawn: (spec) => {
      spawnedFiles.push(spec.file);
      return handle;
    },
  };
  return { be, spawnedFiles };
}

let tmpRoot: string;
let api: HttpApi | undefined;

beforeEach(() => {
  delete process.env['DECKENT_API_TOKEN'];
  delete process.env['DECKENT_API_AUTH_DISABLED'];
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-ai-tool-allowlist-'));
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
  if (addr === null || typeof addr === 'string') {
    throw new Error('server address unavailable');
  }
  return addr.port;
}

async function startApi(backend: SessionBackend): Promise<{ base: string; headers: Record<string, string> }> {
  api = createHttpServer(tmpRoot, { port: 0, autoGenerateToken: true, terminalBackend: backend });
  const base = `http://127.0.0.1:${await port(api)}`;
  const headers = { Authorization: `Bearer ${api.terminalToken!}`, 'Content-Type': 'application/json' };
  return { base, headers };
}

describe('AI session tool allowlist (born-565, 390-002)', () => {
  it('kind:"ai" + disallowed tool → 400, and the disallowed binary is never spawned', async () => {
    const spy = spySpawnBackend();
    const { base, headers } = await startApi(spy.be);

    const res = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'ai', tool: '/bin/rm' }),
    });

    expect(res.status).toBe(400);
    const bodyJson = (await res.json()) as { error: string };
    expect(bodyJson.error).toMatch(/not allowed/i);
    expect(spy.spawnedFiles).not.toContain('/bin/rm');
    expect(spy.spawnedFiles).toHaveLength(0);

    // and no session was actually registered
    const list = await fetch(`${base}/api/terminal/sessions`, { headers });
    expect(await list.json()).toEqual([]);
  });

  it('kind:"ai" + an arbitrary non-allowlisted string tool → 400 (not just known-bad binaries)', async () => {
    const { base, headers } = await startApi(fakeBackend());

    const res = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'ai', tool: 'totally-made-up-tool' }),
    });

    expect(res.status).toBe(400);
  });

  it.each(['claude', 'gemini', 'codex'])('kind:"ai" + allowlisted tool %s → 201', async (tool) => {
    const { base, headers } = await startApi(fakeBackend());

    const res = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'ai', tool }),
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as { kind: string };
    expect(created.kind).toBe('ai');
  });

  it('kind:"ai" with no tool field → 201 (default-to-claude path unaffected)', async () => {
    const spy = spySpawnBackend();
    const { base, headers } = await startApi(spy.be);

    const res = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'ai' }),
    });

    expect(res.status).toBe(201);
    expect(spy.spawnedFiles).toEqual(['claude']);
  });

  it('kind:"shell" gate is unaffected by the ai-tool allowlist (regression check)', async () => {
    const { base, headers } = await startApi(fakeBackend());

    const res = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'shell' }),
    });

    expect(res.status).toBe(201);
  });
});
