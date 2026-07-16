/**
 * DESK-1 (born-496) — the typed preload⇄renderer contract, SSOT.
 *
 * ZERO runtime Electron imports (types + zod schema only): both the preload
 * (implements it via contextBridge) and the renderer ambient declaration
 * consume this file. The dashboard sub-package cannot import across build
 * units, so it carries a hand-mirrored minimal copy at
 * src/dashboard/src/types/desktop-global.d.ts — kept in sync by
 * scripts/lint-desktop-api-sync.mjs (wired into lint:gates). Change HERE
 * first; the gate fails the build on drift.
 */
import { z } from 'zod';
import type { DesktopPreferences, DesktopPreferencesInput } from './theme-tokens';

/** Where the target daemon lives — the 4-kind matrix is schema-complete from
 * day one (Law #2); `wsl`/`ssh`/`container` render an honest
 * "not yet available" UI state until their phases land. */
export const CONNECTION_KINDS = ['local', 'wsl', 'ssh', 'container'] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

/**
 * A saved way to reach/spawn a deckent daemon. Deliberately NEVER stores a
 * token — tokens are re-derived at connect time from the daemon handshake
 * file (.deckent/serve-daemon.json) / spawn env, so a leaked profile file
 * exposes only "how to reach" metadata, no live credential.
 */
export const connectionProfileSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  kind: z.enum(CONNECTION_KINDS),
  /** Absolute project path ON THE TARGET (host for local, distro for wsl, remote for ssh). */
  projectPath: z.string().min(1),
  /** '127.0.0.1' for local/wsl (WSL2 auto-forwards localhost); tunnel-local port host for ssh. */
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  wslDistro: z.string().optional(),
  sshHost: z.string().optional(),
  sshIdentityFile: z.string().optional(),
  containerId: z.string().optional(),
  /** spawn-if-absent vs adopt-only. */
  autoStart: z.boolean(),
  /** On app quit, SIGTERM daemons THIS shell spawned (never adopted ones). */
  orphanShutdownOnQuit: z.boolean(),
  lastConnectedAt: z.string().optional(),
  createdAt: z.string(),
});

export type ConnectionProfile = z.infer<typeof connectionProfileSchema>;

export type DaemonStatus = 'idle' | 'adopting' | 'spawning' | 'health-polling' | 'connected' | 'error';

export interface DaemonStatusEvent {
  profileId: string;
  status: DaemonStatus;
  /** i18n MESSAGE KEY (mechanism stays string-free; renderer resolves via IPC-fetched strings). */
  errorKey?: string;
  /** Interpolation vars for errorKey. */
  errorVars?: Record<string, string>;
}

export type ConnectResult = { ok: true; url: string } | { ok: false; errorKey: string; errorVars?: Record<string, string> };

/**
 * D4-3 — the live daemon session the renderer's OWN transport uses (approved
 * SURF-4 decision #2: the renderer consumes the daemon's tokened HTTP API
 * directly via fetch/EventSource; IPC stays UI-grade). `apiToken` is the
 * daemon handshake's api token — mutations send it as a Bearer header, SSE
 * appends `?token=` (the server's documented EventSource fallback). Pushed on
 * `daemon.session` after a successful connect and pull-able via
 * `session.get()` (renderer reloads). Cleared on disconnect (null).
 */
export interface DaemonSession {
  profileId: string;
  /** Daemon origin, e.g. `http://127.0.0.1:4317`. */
  url: string;
  apiToken?: string;
}

/**
 * The ONLY surface the renderer can reach into main/Node with
 * (`window.deckentDesktop`). Keep it UI-grade: anything substantive goes
 * through the daemon's tokened HTTP/WS API instead.
 */
export interface DeckentDesktopApi {
  isDesktop: true;
  connections: {
    list(): Promise<ConnectionProfile[]>;
    add(profile: Omit<ConnectionProfile, 'id' | 'createdAt'>): Promise<ConnectionProfile>;
    remove(id: string): Promise<void>;
    connect(id: string): Promise<ConnectResult>;
    disconnect(id: string): Promise<void>;
  };
  daemon: {
    /** Subscribe to push status updates; returns an unsubscribe. */
    onStatus(cb: (event: DaemonStatusEvent) => void): () => void;
    /** D4-3 — push of the live daemon session after a successful connect
     *  (null push on disconnect); returns an unsubscribe. */
    onSession(cb: (session: DaemonSession | null) => void): () => void;
  };
  session: {
    /** D4-3 — the current daemon session (renderer reload/pull path). */
    get(): Promise<DaemonSession | null>;
  };
  app: {
    getVersion(): Promise<string>;
    /** URL-allowlisted external open (never arbitrary shell exec). */
    openExternal(url: string): Promise<void>;
    /** Resolved UI strings for the renderer (i18n lives repo-side). */
    getStrings(): Promise<Record<string, string>>;
  };
  preferences: {
    /** D4-1 — watch (theme) choice + custom token overrides, persisted by
     *  the main-process preferences store (restart-persist done-criterion). */
    get(): Promise<DesktopPreferences>;
    set(input: DesktopPreferencesInput): Promise<DesktopPreferences>;
  };
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
  };
}
