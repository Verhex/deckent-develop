/**
 * Multi-session terminal state manager.
 *
 * Composes the lower-level SessionRegistry / CommandHistory / SessionBuffer
 * primitives from terminal-api into a single stateful facade.  The manager
 * tracks which session is "active", routes history navigation and buffer
 * access per session, and exposes clipboard helpers for copy/paste from
 * terminal output.
 *
 * ADR-062 compliant: buffer is in-memory only — raw PTY output is never
 * persisted to disk or memory.db.
 */

import { SessionRegistry, CommandHistory, SessionBuffer } from './terminal-api.js';
import type { SessionMeta } from './terminal-api.js';

/** Ring-buffer size cap for per-session command history. */
const HISTORY_MAX = 200;

/**
 * MultiSessionManager — tracks open terminal sessions, per-session command
 * history (up/down ring buffer), per-session output buffer, and the currently
 * active session.
 */
export class MultiSessionManager {
  private registry = new SessionRegistry();
  private histories = new Map<string, CommandHistory>();
  private buffers = new Map<string, SessionBuffer>();
  private activeSessionId: string | null = null;

  /** Open a new session: register it, allocate history + buffer, set as active. */
  openSession(meta: SessionMeta): void {
    this.registry.add(meta);
    if (!this.histories.has(meta.id)) {
      this.histories.set(meta.id, new CommandHistory());
    }
    if (!this.buffers.has(meta.id)) {
      this.buffers.set(meta.id, new SessionBuffer());
    }
    this.activeSessionId = meta.id;
  }

  /** Switch the active session to an already-open session id. */
  switchSession(id: string): boolean {
    if (!this.registry.get(id)) return false;
    this.activeSessionId = id;
    return true;
  }

  /** Close a session: remove from registry + clean up history/buffer.
   *  Falls back to the next available session if it was active. */
  closeSession(id: string): void {
    this.registry.remove(id);
    this.histories.delete(id);
    this.buffers.delete(id);
    if (this.activeSessionId === id) {
      const remaining = this.registry.list();
      this.activeSessionId = remaining.length > 0 ? remaining[0].id : null;
    }
  }

  /** Return all open sessions. */
  listSessions(): SessionMeta[] {
    return this.registry.list();
  }

  /** Return the currently active session id (null when no sessions are open). */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /** Return the active session meta, or undefined when no active session. */
  getActiveSession(): SessionMeta | undefined {
    return this.activeSessionId ? this.registry.get(this.activeSessionId) : undefined;
  }

  /** Return the CommandHistory for a given session (creates one if needed). */
  getHistory(id: string): CommandHistory {
    if (!this.histories.has(id)) {
      this.histories.set(id, new CommandHistory());
    }
    return this.histories.get(id)!;
  }

  /** Append PTY output to the in-memory buffer for a session. */
  appendToBuffer(sessionId: string, data: string): void {
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, new SessionBuffer());
    }
    this.buffers.get(sessionId)!.append(sessionId, data);
  }

  /** Get accumulated output for a session from its in-memory buffer. */
  getBufferContent(sessionId: string): string {
    return this.buffers.get(sessionId)?.get(sessionId) ?? '';
  }

  /** Clear the output buffer for a session. */
  clearBuffer(sessionId: string): void {
    this.buffers.get(sessionId)?.clear(sessionId);
  }

  /** Push a command to the active session's history ring buffer. */
  pushCommand(cmd: string, sessionId?: string): void {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return;
    const history = this.getHistory(id);
    history.push(cmd);
    const all = history.getAll();
    if (all.length > HISTORY_MAX) {
      // CommandHistory stores newest-first; reset and re-push trimmed list
      const trimmed = all.slice(0, HISTORY_MAX);
      history.reset();
      for (let i = trimmed.length - 1; i >= 0; i--) {
        history.push(trimmed[i]);
      }
    }
  }

  /** Navigate history (up = older, down = newer) for a session. */
  navigateHistory(direction: 'up' | 'down', sessionId?: string): string | undefined {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return undefined;
    return this.getHistory(id).navigate(direction);
  }
}

/**
 * Copy text to the system clipboard.  Returns a Promise that resolves to true
 * on success or false if the clipboard API is unavailable / permission denied.
 *
 * clipboard helper — no fallback execCommand (deprecated, not needed in modern
 * browsers; tests can mock navigator.clipboard directly).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read text from the system clipboard.  Returns undefined when the clipboard
 * API is unavailable or the user denied the "clipboard-read" permission.
 */
export async function getClipboardText(): Promise<string | undefined> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return undefined;
  }
}
