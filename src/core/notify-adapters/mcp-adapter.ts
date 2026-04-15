// ═══ MCP Notification Adapter ═════════════════════════════════════════════════
// Sprint 139: Send notifications via MCP notifications/message protocol.
// Uses McpServer.sendLoggingMessage() to deliver structured messages
// to the MCP client (Claude Code, VS Code, JetBrains).
// Priority mapping: critical→'critical', warning→'warning', info→'info'.

import type { NotificationAdapter, Notification, NotificationPriority } from '../notification-dispatcher.js';
import { debugLog } from '../utils.js';

// ─── MCP Server Interface ────────────────────────────────────────
// Minimal interface to avoid tight coupling to the full McpServer type.
// Compatible with @modelcontextprotocol/sdk McpServer.sendLoggingMessage().

export type McpLoggingLevel =
  | 'debug' | 'info' | 'notice' | 'warning'
  | 'error' | 'critical' | 'alert' | 'emergency';

export interface McpServerLike {
  sendLoggingMessage(params: {
    level: McpLoggingLevel;
    logger?: string;
    data: unknown;
  }): Promise<void>;
}

// ─── Priority → MCP Level Mapping ────────────────────────────────

const PRIORITY_TO_MCP_LEVEL: Record<NotificationPriority, McpLoggingLevel> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
};

// ─── MCP Adapter ─────────────────────────────────────────────────

export class McpNotificationAdapter implements NotificationAdapter {
  readonly name = 'mcp-logging';
  private server: McpServerLike | null;

  constructor(server?: McpServerLike | null) {
    this.server = server ?? null;
  }

  /**
   * Set or replace the MCP server instance.
   * Allows lazy binding after server creation.
   */
  setServer(server: McpServerLike): void {
    this.server = server;
  }

  /**
   * Available when a server instance is registered.
   */
  isAvailable(): boolean {
    return this.server !== null;
  }

  /**
   * Send notification via MCP notifications/message.
   * Format: { level, logger: 'deckent', data: { event, title, summary, ... } }
   */
  async send(notification: Notification): Promise<void> {
    if (!this.server) {
      debugLog('mcp-adapter', 'No MCP server instance — skipping notification');
      return;
    }

    const level = PRIORITY_TO_MCP_LEVEL[notification.priority] ?? 'info';

    await this.server.sendLoggingMessage({
      level,
      logger: 'deckent',
      data: {
        event: notification.event,
        title: notification.title,
        summary: notification.summary,
        details: notification.details,
        sprintId: notification.sprintId,
        timestamp: notification.timestamp,
      },
    });
  }
}
