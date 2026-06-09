import { randomBytes } from 'node:crypto';
import type { ActorContext } from './work-model.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Opaque session token (hex string). */
export type SessionToken = string;

/** A verified SSO session, carrying the actor identity fields. */
export interface Session {
  actorId: string;
  role?: string;
  tenantId?: string;
  issuedAt: number;
  expiresAt: number;
}

/** Optional durability hook — injected to persist/restore session state. */
export interface PersistenceHook {
  load?(): Map<SessionToken, Session>;
  save?(sessions: ReadonlyMap<SessionToken, Session>): void;
}

// ─── SessionStore ────────────────────────────────────────────────────────────

export class SessionStore {
  private readonly sessions: Map<SessionToken, Session>;
  private readonly persistence: PersistenceHook;
  private readonly now: () => number;

  constructor(opts?: { now?: () => number; persistence?: PersistenceHook }) {
    this.now = opts?.now ?? (() => Date.now());
    this.persistence = opts?.persistence ?? {};
    this.sessions = this.persistence.load?.() ?? new Map();
  }

  /**
   * Create a new session for a verified identity.
   * Returns an opaque token that can be passed to resolve().
   */
  create(identity: ActorContext, ttlMs: number): SessionToken {
    const token = randomBytes(32).toString('hex');
    const now = this.now();
    const session: Session = {
      actorId: identity.id,
      role: identity.role,
      tenantId: identity.tenantId,
      issuedAt: now,
      expiresAt: now + ttlMs,
    };
    this.sessions.set(token, session);
    this.persistence.save?.(this.sessions);
    return token;
  }

  /**
   * Resolve a token to its session, or null if expired or unknown.
   */
  resolve(token: SessionToken): Session | null {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (this.now() >= session.expiresAt) return null;
    return session;
  }

  /**
   * Revoke a session immediately.
   */
  revoke(token: SessionToken): void {
    this.sessions.delete(token);
    this.persistence.save?.(this.sessions);
  }

  /**
   * Drop all expired sessions. Returns the count of pruned entries.
   */
  prune(now?: number): number {
    const ts = now ?? this.now();
    let pruned = 0;
    for (const [token, session] of this.sessions) {
      if (ts >= session.expiresAt) {
        this.sessions.delete(token);
        pruned++;
      }
    }
    if (pruned > 0) {
      this.persistence.save?.(this.sessions);
    }
    return pruned;
  }
}
