// ═══ File Notification Adapter ════════════════════════════════════════════════
// Sprint 145: Append notifications as JSONL to a local file.
// Used for audit trail and offline review of sprint notifications.
// Fail-safe: write errors are caught and logged, never crash the sprint.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Notification, NotificationAdapter } from '../notification-dispatcher.js';
import { debugLog } from '../utils.js';

// ─── File Adapter ───────────────────────────────────────────────

export class FileNotificationAdapter implements NotificationAdapter {
  readonly name = 'file-jsonl';
  private dirEnsured = false;

  constructor(private readonly filePath: string) {}

  /**
   * Always available — file writes don't require external dependencies.
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Append notification as a single JSON line to the configured file.
   * Creates parent directory if needed on first write.
   */
  async send(notification: Notification): Promise<void> {
    try {
      if (!this.dirEnsured) {
        mkdirSync(dirname(this.filePath), { recursive: true });
        this.dirEnsured = true;
      }
      appendFileSync(this.filePath, JSON.stringify(notification) + '\n');
    } catch (err) {
      debugLog('file-adapter', `Write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
