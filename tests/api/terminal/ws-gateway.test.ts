import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { attachTerminalGateway } from '../../../src/api/terminal/ws-gateway.js';
import { PtySessionManager } from '../../../src/api/terminal/session-manager.js';
import type { SessionBackend, BackendHandle, SpawnSpec } from '../../../src/api/terminal/session-backend.js';
import { LocalTokenAuthProvider } from '../../../src/api/terminal/auth-provider.js';

class FakeBackend implements SessionBackend {
  public spawned: SpawnSpec[] = [];
  public handles: BackendHandle[] = [];
  public lastOnData: ((d: string) => void) | undefined;
  spawn(spec: SpawnSpec, onData: (d: string) => void, _onExit: (code: number) => void): BackendHandle {
    this.spawned.push(spec);
    this.lastOnData = onData;
    const handle: BackendHandle = {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    };
    this.handles.push(handle);
    return handle;
  }
}

interface Setup {
  server: Server;
  mgr: PtySessionManager;
  backend: FakeBackend;
  audit: { record: ReturnType<typeof vi.fn> };
  port: number;
}

async function setup(token: string): Promise<Setup> {
  const backend = new FakeBackend();
  const mgr = new PtySessionManager(backend, { scrollbackBytes: 65536, idleTimeoutMs: 0 });
  const audit = { record: vi.fn() };
  const server = createServer();
  attachTerminalGateway(server, {
    manager: mgr,
    auth: new LocalTokenAuthProvider(token),
    audit,
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  return { server, mgr, backend, audit, port };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((res) => server.close(() => res()));
}

const ctx: { server?: Server } = {};

afterEach(async () => {
  if (ctx.server) {
    await closeServer(ctx.server);
    ctx.server = undefined;
  }
});

describe('terminal ws gateway', () => {
  it('rejects upgrade with invalid subprotocol token — no session spawned', async () => {
    const s = await setup('good');
    ctx.server = s.server;

    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/api/terminal/ws`, ['deckent.bad']);
    const closed = await new Promise<number>((res) => {
      ws.on('close', (code) => res(code));
      ws.on('error', () => res(-1)); // tolerate transport-level error to keep test deterministic
    });

    expect(closed).toBe(4401);
    // Security invariant: no session was created on the manager
    expect(s.backend.spawned.length).toBe(0);
    expect(s.mgr.list().length).toBe(0);
    // auth.deny recorded; auth.ok NOT recorded
    const actions = s.audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain('auth.deny');
    expect(actions).not.toContain('auth.ok');
  });

  it('accepts valid token, attaches a session, replays buffer + streams output', async () => {
    const s = await setup('good');
    ctx.server = s.server;

    // pre-seed a session with some buffered output
    const meta = s.mgr.create({ kind: 'shell' });
    // simulate prior PTY output that should be replayed on attach
    s.backend.lastOnData?.('hello-prior\n');

    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/api/terminal/ws`, ['deckent.good']);
    await new Promise<void>((res, rej) => {
      ws.on('open', () => res());
      ws.on('error', (e) => rej(e));
    });

    // collect first two frames after attach (expect replay + new output)
    const frames: string[] = [];
    const got = new Promise<string[]>((res) => {
      ws.on('message', (m) => {
        frames.push(m.toString());
        if (frames.length >= 2) res(frames.slice());
      });
    });

    ws.send(JSON.stringify({ t: 'attach', sessionId: meta.id }));
    // drive a live output through the backend to ensure attach listener fires
    await new Promise((r) => setTimeout(r, 20));
    s.backend.lastOnData?.('live-output\n');

    const collected = await got;
    // first frame after attach should be the replay buffer
    const replay = JSON.parse(collected[0]) as { t: string; data: string };
    expect(replay.t).toBe('output');
    expect(replay.data).toContain('hello-prior');
    // second frame should be the live output streamed through the bridge
    const live = JSON.parse(collected[1]) as { t: string; data: string };
    expect(live.t).toBe('output');
    expect(live.data).toContain('live-output');

    // audit ok recorded, session.attach recorded
    const actions = s.audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain('auth.ok');
    expect(actions).toContain('session.attach');

    ws.close();
    await new Promise((r) => setTimeout(r, 20));
  });
});
