import { randomUUID } from 'node:crypto';
import type { SessionBackend, BackendHandle, SpawnSpec } from './session-backend.js';
import type { AuditEvent, CreateSessionInput, SessionMeta, TenantId } from './types.js';
import { checkCommandGuard, formatCommandGuardDetail } from './command-guard.js';

interface ManagerOpts {
  scrollbackBytes: number;
  idleTimeoutMs: number;
  maxSessions?: number;
  /**
   * Remote host for the session pipeline. The command guard (I3) bypasses
   * when this host is in {127.0.0.1, ::1, localhost}; otherwise it enforces.
   * Defaults to 'localhost' to preserve today's LocalTokenAuthProvider reality.
   * Sub-project #3 mTLS will plumb the real peer host through here.
   */
  host?: string;
  /**
   * Optional structured audit sink. Used by the command guard (W4-9) to emit
   * `guard.block` events when a deny-list pattern fires on a remote shell.
   * If unset, blocks still kill the session but are not recorded.
   */
  audit?: { record(ev: AuditEvent): void };
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
    const matches = checkCommandGuard(data, {
      kind: s.meta.kind,
      host: this.opts.host ?? 'localhost',
    });
    if (matches.length > 0) {
      if (this.opts.audit) {
        const at = new Date().toISOString();
        for (const m of matches) {
          this.opts.audit.record({
            action: 'guard.block',
            tenantId: s.meta.tenantId,
            sessionId: s.meta.id,
            detail: formatCommandGuardDetail(m),
            at,
          });
        }
      }
      this.kill(id);
      return;
    }
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
