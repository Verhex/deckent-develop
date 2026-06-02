import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';
import type { ChatMemoryAdapter } from './chat-native.js';
import type { ChatRole } from '../../core/memory-types.js';

/** Default number of prior turns to load on session resume. */
export const DEFAULT_SESSION_RESUME_LIMIT = 20;

/**
 * Generate or accept a session id. Pass an existing id to pin the session;
 * omit to auto-generate a timestamp-based one.
 */
export function createSession(sessionId?: string): string {
  if (sessionId && sessionId.trim().length > 0) return sessionId;
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `agentic-${ts}-${rand}`;
}

/**
 * Persist a single chat turn to the memory DB at `projectRoot/.brain/memory.db`.
 * No-ops silently when the DB does not yet exist and the MemoryStore cannot be
 * opened (avoids crashing on first use before `deckent init`).
 */
export function persistTurn(
  projectRoot: string,
  sessionId: string,
  role: ChatRole,
  content: string,
): void {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return;
  const store = new MemoryStore(dbPath);
  try {
    store.appendChatTurn(sessionId, role, content);
  } finally {
    store.close();
  }
}

/**
 * Load prior turns for a session from the memory DB.
 * Returns an empty array when the DB does not exist (clean start).
 */
export function resumeSession(
  projectRoot: string,
  sessionId: string,
  limit: number = DEFAULT_SESSION_RESUME_LIMIT,
): ReadonlyArray<{ role: string; content: string }> {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return [];
  const store = new MemoryStore(dbPath);
  try {
    return store.getChatHistory(sessionId, limit);
  } finally {
    store.close();
  }
}

/**
 * Build a `ChatMemoryAdapter` backed by the project memory DB.
 * This adapter conforms to the duck-typed interface expected by
 * `runChatNativeLoop` (chat-native.ts) so the REPL can persist and
 * resume sessions without knowing about MemoryStore directly.
 *
 * When the DB does not exist, `appendChatTurn` is a no-op and
 * `getChatHistory` returns an empty array — safe for pre-init projects.
 */
export function buildChatMemoryAdapter(projectRoot: string): ChatMemoryAdapter {
  return {
    appendChatTurn(sessionId: string, role: 'user' | 'assistant', content: string): number {
      persistTurn(projectRoot, sessionId, role, content);
      return 0;
    },
    getChatHistory(
      sessionId: string,
      limit?: number,
    ): ReadonlyArray<{ role: string; content: string }> {
      return resumeSession(projectRoot, sessionId, limit);
    },
  };
}
