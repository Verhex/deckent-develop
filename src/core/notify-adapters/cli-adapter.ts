// ═══ CLI Parent-TTY Notification Adapter ═════════════════════════════════════
// Sprint 139: Write notifications to the parent terminal (Claude Code chat bar).
// Uses DECKENT_PARENT_PID to locate the parent process's stdout fd on Linux.
// Falls back to process.stderr when parent fd is unavailable.
// Emoji prefix by priority: 🚨 critical, ⚠️ warning, ℹ️ info.

import { existsSync } from 'node:fs';
import { writeFileSync, openSync, closeSync } from 'node:fs';
import type { Notification, NotificationAdapter } from '../notification-dispatcher.js';
import { debugLog } from '../utils.js';

// ─── Priority Emoji Mapping ──────────────────────────────────────

const PRIORITY_EMOJI: Record<string, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};

// ─── CLI Adapter ─────────────────────────────────────────────────

export class CliNotificationAdapter implements NotificationAdapter {
  readonly name = 'cli-parent-tty';

  /**
   * Check if we can write to a terminal.
   * Available when:
   *  1. DECKENT_PARENT_PID is set and /proc/<pid>/fd/1 exists (Linux), OR
   *  2. process.stderr is a TTY (fallback for direct CLI usage)
   */
  isAvailable(): boolean {
    // Linux: parent process stdout fd
    const parentPid = process.env['DECKENT_PARENT_PID'];
    if (parentPid) {
      const fdPath = `/proc/${parentPid}/fd/1`;
      try {
        return existsSync(fdPath);
      } catch {
        return false;
      }
    }

    // Fallback: own stderr is a TTY
    return process.stderr?.isTTY === true;
  }

  /**
   * Format and write notification to parent terminal or stderr.
   */
  async send(notification: Notification): Promise<void> {
    const emoji = PRIORITY_EMOJI[notification.priority] ?? 'ℹ️';
    const line = `\n${emoji} [deckent] ${notification.title}: ${notification.summary}\n`;

    // Try parent process fd first
    const parentPid = process.env['DECKENT_PARENT_PID'];
    if (parentPid) {
      const fdPath = `/proc/${parentPid}/fd/1`;
      try {
        if (existsSync(fdPath)) {
          const fd = openSync(fdPath, 'w');
          try {
            writeFileSync(fd, line);
          } finally {
            closeSync(fd);
          }
          return;
        }
      } catch (err) {
        debugLog('cli-adapter', `Parent fd write failed: ${err instanceof Error ? err.message : String(err)}`);
        // Fall through to stderr
      }
    }

    // Fallback: write to stderr (visible in terminal but doesn't pollute stdout)
    if (process.stderr?.writable) {
      process.stderr.write(line);
    }
  }
}
