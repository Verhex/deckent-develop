// src/nervous/dispatcher.ts
//
// NervousDispatcher — Context Detection + 3 Adapter Routing
// Sprint 147 Task 18
//
// 3 channel adapters: MCP, CLI (tty stderr), File (.deckent/nervous-log.jsonl)
// Context detection: DECKENT_MCP_ACTIVE env → MCP, stdout.isTTY → CLI, always → file
// Critical/emergency → broadcast to all enabled channels
// Cross-channel dedup: same notification ID dispatched only once
// MCP failure → CLI fallback

import type { NervousNotification, NervousSystemConfig } from '../core/nervous-types.js';
import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ─── Channel Type ───────────────────────────────────────────────────────────

export type Channel = 'mcp' | 'cli' | 'file';

// ─── Channel Config (extracted from NervousSystemConfig) ────────────────────

export interface ChannelConfig {
  readonly mcp: boolean;
  readonly cli: boolean;
  readonly file: boolean;
  readonly desktop?: boolean;
}

// ─── Dispatch Result ────────────────────────────────────────────────────────

export interface DispatchResult {
  readonly channels: Channel[];
  readonly success: boolean;
}

// ─── Channel Adapter Interface ──────────────────────────────────────────────

export interface ChannelAdapter {
  push(notification: NervousNotification): Promise<boolean>;
}

// ─── NervousDispatcher ──────────────────────────────────────────────────────

/**
 * Nervous System notification dispatcher.
 *
 * Selects delivery channels based on runtime context:
 * - file:  always active (audit log)
 * - mcp:   when DECKENT_MCP_ACTIVE=1 env var is set
 * - cli:   when stdout is a TTY and MCP is not active
 *
 * Critical/emergency severity broadcasts to ALL enabled channels.
 * Cross-channel dedup guarantees each notification ID is dispatched only once.
 */
export class NervousDispatcher {
  private readonly emittedIds = new Set<string>();
  private readonly projectRoot: string;
  private readonly channelConfig: ChannelConfig;

  // Injectable adapters (for testing)
  private mcpAdapter: ChannelAdapter | null = null;
  private cliAdapter: ChannelAdapter | null = null;
  private fileAdapter: ChannelAdapter | null = null;

  // Environment checks (injectable for testing)
  private isMcpActive: () => boolean;
  private isTtyAvailable: () => boolean;

  constructor(
    config: NervousSystemConfig,
    projectRoot: string,
    options?: {
      mcpAdapter?: ChannelAdapter;
      cliAdapter?: ChannelAdapter;
      fileAdapter?: ChannelAdapter;
      isMcpActive?: () => boolean;
      isTtyAvailable?: () => boolean;
    },
  ) {
    this.projectRoot = projectRoot;
    this.channelConfig = extractChannelConfig(config);

    // Adapter injection (defaults created lazily if not provided)
    this.mcpAdapter = options?.mcpAdapter ?? null;
    this.cliAdapter = options?.cliAdapter ?? null;
    this.fileAdapter = options?.fileAdapter ?? null;

    // Environment detection injection
    this.isMcpActive = options?.isMcpActive ?? (() => process.env.DECKENT_MCP_ACTIVE === '1');
    this.isTtyAvailable = options?.isTtyAvailable ?? (() => Boolean(process.stdout.isTTY));
  }

  /**
   * Dispatch a NervousNotification to appropriate channels.
   *
   * Cross-channel dedup: if notification.id was already dispatched, returns immediately.
   * Channel selection: file always, then context-based (MCP env / TTY).
   * Critical/emergency severity broadcasts to all enabled channels.
   * MCP failure triggers CLI fallback.
   */
  async dispatch(notification: NervousNotification): Promise<DispatchResult> {
    // Cross-channel dedup
    if (this.emittedIds.has(notification.id)) {
      return { channels: [], success: true };
    }
    this.emittedIds.add(notification.id);

    const channels = this.selectChannels(notification);
    const deliveredChannels: Channel[] = [];
    let allSuccess = true;
    let mcpFailed = false;

    for (const channel of channels) {
      const ok = await this.pushToChannel(channel, notification);
      if (ok) {
        deliveredChannels.push(channel);
      } else {
        allSuccess = false;
        if (channel === 'mcp') {
          mcpFailed = true;
        }
      }
    }

    // MCP failure fallback: try CLI if not already in the channel list
    if (mcpFailed && !channels.includes('cli') && this.channelConfig.cli) {
      const fallbackOk = await this.pushToChannel('cli', notification);
      if (fallbackOk) {
        deliveredChannels.push('cli');
        // If at least file + cli delivered, consider it a success
        allSuccess = deliveredChannels.length >= 2;
      }
    }

    return {
      channels: deliveredChannels,
      success: allSuccess,
    };
  }

  /**
   * Select channels based on notification severity and runtime context.
   *
   * Rules:
   * 1. 'file' is ALWAYS included (audit trail)
   * 2. Critical/emergency → broadcast to all enabled channels
   * 3. Normal severity → context detection:
   *    - DECKENT_MCP_ACTIVE=1 → add 'mcp'
   *    - stdout.isTTY (and not MCP) → add 'cli'
   */
  selectChannels(notification: NervousNotification): Channel[] {
    const channels: Channel[] = [];

    // File always present (if enabled, which is the default)
    if (this.channelConfig.file) {
      channels.push('file');
    }

    // Critical/emergency → broadcast all enabled
    if (notification.severity === 'critical' || notification.severity === 'emergency') {
      if (this.channelConfig.mcp) channels.push('mcp');
      if (this.channelConfig.cli) channels.push('cli');
      return channels;
    }

    // Context detection for non-critical
    if (this.isMcpActive() && this.channelConfig.mcp) {
      channels.push('mcp');
    } else if (this.isTtyAvailable() && this.channelConfig.cli) {
      channels.push('cli');
    }

    return channels;
  }

  /**
   * Get the count of dispatched notification IDs (for diagnostics).
   */
  get dispatchedCount(): number {
    return this.emittedIds.size;
  }

  /**
   * Clear the dedup set (useful for testing or long-running processes).
   */
  clearDedup(): void {
    this.emittedIds.clear();
  }

  // ─── Private: Channel Push ────────────────────────────────────────────────

  private async pushToChannel(channel: Channel, notification: NervousNotification): Promise<boolean> {
    try {
      switch (channel) {
        case 'file':
          return await this.pushToFile(notification);
        case 'mcp':
          return await this.pushToMcp(notification);
        case 'cli':
          return await this.pushToCli(notification);
        default:
          return false;
      }
    } catch {
      // Fail-safe: adapter errors never crash the nervous system
      return false;
    }
  }

  private async pushToFile(notification: NervousNotification): Promise<boolean> {
    if (this.fileAdapter) {
      return this.fileAdapter.push(notification);
    }

    // Default file adapter: append JSONL to .deckent/nervous-log.jsonl
    const logPath = join(this.projectRoot, '.deckent', 'nervous-log.jsonl');
    const dir = dirname(logPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const line = JSON.stringify({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      severity: notification.severity,
      detectorId: notification.detectorId,
      createdAt: notification.createdAt,
      actionCount: notification.actions.length,
      sprintId: notification.sprintId,
      taskId: notification.taskId,
    }) + '\n';
    await appendFile(logPath, line, 'utf-8');
    return true;
  }

  private async pushToMcp(notification: NervousNotification): Promise<boolean> {
    if (this.mcpAdapter) {
      return this.mcpAdapter.push(notification);
    }
    // Default: no-op if no adapter registered (MCP server registers adapter at startup)
    return false;
  }

  private async pushToCli(notification: NervousNotification): Promise<boolean> {
    if (this.cliAdapter) {
      return this.cliAdapter.push(notification);
    }

    // Default CLI adapter: ANSI-formatted stderr output
    const icon = SEVERITY_ICONS[notification.severity] ?? '';
    const label = notification.severity.toUpperCase();
    const line = `  ${icon} ${label} — ${notification.detectorId}: ${notification.title}`;
    process.stderr.write(line + '\n');
    return true;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_ICONS: Readonly<Record<string, string>> = {
  info: '\u2139\uFE0F',       // ℹ️
  warning: '\u26A0\uFE0F',    // ⚠️
  critical: '\uD83D\uDD34',   // 🔴
  emergency: '\uD83D\uDEA8',  // 🚨
};

/**
 * Extract channel config from NervousSystemConfig.
 * Supports both the full config format and minimal config.
 */
function extractChannelConfig(config: NervousSystemConfig): ChannelConfig {
  // The config may have a notifications.channels sub-object
  const raw = config as unknown as Record<string, unknown>;
  const notifications = raw.notifications as Record<string, unknown> | undefined;
  const channels = notifications?.channels as Partial<ChannelConfig> | undefined;

  if (channels) {
    return {
      mcp: channels.mcp ?? true,
      cli: channels.cli ?? true,
      file: channels.file ?? true,
      desktop: channels.desktop ?? false,
    };
  }

  // Default: all channels enabled
  return { mcp: true, cli: true, file: true, desktop: false };
}
