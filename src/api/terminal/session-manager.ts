import { randomUUID } from 'node:crypto';
import type { SessionBackend, BackendHandle, SpawnSpec } from './session-backend.js';
import type { CreateSessionInput, SessionMeta, TenantId } from './types.js';

interface ManagerOpts {
  scrollbackBytes: number;
  idleTimeoutMs: number;
  maxSessions?: number;
}

interface Session {
  meta: SessionMeta;
  handle: BackendHandle;
  ring: string;
  lastActivity: number;
  listeners: Set<(d: string) => void>;
}

type KindCmd = (i: CreateSessionInput) => Pick<SpawnSpec, 'file' | 'args'>;
const SHELL_CMD: KindCmd = () => ({ file: process.env['SHELL'] ?? 'bash', args: [] });
const KIND_CMD: Record<string, KindCmd> = {
  ai: (i) => ({ file: i.tool ?? 'claude', args: [] }),
  deckent: (i) => ({ file: 'deckent', args: i.args ?? [] }),
  shell: SHELL_CMD,
};

export class PtySessionManager {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly backend: SessionBackend, private readonly opts: ManagerOpts) {}

  create(input: CreateSessionInput): SessionMeta {
    if (this.opts.maxSessions && this.sessions.size >= this.opts.maxSessions) {
      throw new Error(`max sessions reached (${this.opts.maxSessions})`);
    }
    const id = randomUUID();
    const tenantId: TenantId = input.tenantId ?? 'local';
    const cmd = (KIND_CMD[input.kind] ?? SHELL_CMD)(input);
    const meta: SessionMeta = {
      id,
      kind: input.kind,
      tenantId,
      createdAt: new Date().toISOString(),
      status: 'running',
    };
    const sess: Session = {
      meta,
      ring: '',
      lastActivity: Date.now(),
      listeners: new Set(),
      handle: {} as BackendHandle,
    };
    sess.handle = this.backend.spawn(
      { file: cmd.file, args: cmd.args, cwd: input.cwd ?? process.cwd() },
      (d) => {
        sess.ring = (sess.ring + d).slice(-this.opts.scrollbackBytes);
        sess.lastActivity = Date.now();
        for (const l of sess.listeners) l(d);
      },
      (code) => {
        sess.meta.status = 'exited';
        sess.meta.exitCode = code;
      },
    );
    this.sessions.set(id, sess);
    return meta;
  }

  get(id: string): SessionMeta | undefined {
    return this.sessions.get(id)?.meta;
  }

  list(): SessionMeta[] {
    return [...this.sessions.values()].map((s) => s.meta);
  }

  replay(id: string): string {
    return this.sessions.get(id)?.ring ?? '';
  }

  write(id: string, data: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    s.lastActivity = Date.now();
    s.handle.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.handle.resize(cols, rows);
  }

  attach(id: string, listener: (d: string) => void): void {
    this.sessions.get(id)?.listeners.add(listener);
  }

  detach(id: string, listener?: (d: string) => void): void {
    const s = this.sessions.get(id);
    if (!s) return;
    if (listener) s.listeners.delete(listener);
    else s.listeners.clear();
    // detach NEVER kills (tmux-like)
  }

  kill(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    s.handle.kill();
    this.sessions.delete(id);
  }

  reapIdle(): void {
    if (!this.opts.idleTimeoutMs) return;
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (s.meta.kind === 'deckent') continue;
      if (now - s.lastActivity > this.opts.idleTimeoutMs) this.kill(id);
    }
  }
}
