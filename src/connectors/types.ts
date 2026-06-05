/**
 * Messaging connector types — IMessageConnector interface + supporting types.
 *
 * Design follows ProviderAdapter pattern (src/core/provider.ts):
 * readonly identity fields, async lifecycle, config-driven start.
 */

/** Supported messaging platform identifiers */
export type ConnectorId = 'discord' | 'telegram' | 'whatsapp' | 'slack' | 'email';

/** Inbound message from a messaging platform */
export interface IncomingMessage {
  /** Provider-specific message ID */
  readonly id: string;
  /** Which connector produced this message */
  readonly connector: ConnectorId;
  /** User ID or handle on the platform */
  readonly fromUser: string;
  /** Channel / chat / DM identifier */
  readonly channelId: string;
  /** Message text content */
  readonly text: string;
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  /** Raw provider-specific payload (for advanced use) */
  readonly raw?: unknown;
}

/** Outbound message to a messaging platform */
export interface OutgoingMessage {
  /** Target connector */
  readonly connector: ConnectorId;
  /** Target channel / chat / DM */
  readonly channelId: string;
  /** Message text to send */
  readonly text: string;
  /** Original message ID for threading / reply */
  readonly replyTo?: string;
}

/** Handler function for incoming messages */
export type MessageHandler = (msg: IncomingMessage) => void;

/**
 * Core messaging connector interface.
 *
 * Each platform (Discord, Telegram, etc.) implements this interface.
 * Lifecycle: create → start(config) → onMessage(handler) / sendMessage() → stop()
 */
export interface IMessageConnector {
  /** Unique connector identifier */
  readonly id: ConnectorId;
  /** Human-readable connector name */
  readonly name: string;

  /** Start the connector with the given config. No-op if config.enabled is false. */
  start(config: ConnectorConfig): Promise<void>;

  /**
   * Start in OUTBOUND-only mode (no inbound poller). For platforms whose full
   * start() launches a blocking long-poll (Telegram), this brings up just the
   * send path so an outbound-only notification wire never hangs. Defaults to
   * start() in BaseConnector; the inbound poller belongs to BOT-002.
   */
  startOutbound?(config: ConnectorConfig): Promise<void>;

  /** Gracefully stop the connector, releasing resources. */
  stop(): Promise<void>;

  /** Send a message to a channel. Throws if connector is not started. */
  sendMessage(msg: OutgoingMessage): Promise<void>;

  /** Register a handler for incoming messages. Multiple handlers supported. */
  onMessage(handler: MessageHandler): void;

  /** Check whether the connector is connected and healthy. */
  isHealthy(): boolean;
}

/** Configuration for a single connector instance */
export interface ConnectorConfig {
  /** Whether this connector is active */
  readonly enabled: boolean;
  /** Authentication token (from .deck interpolation) */
  readonly token: string;
  /** Optional webhook URL for inbound messages */
  readonly webhookUrl?: string;
  /** Connector-specific options */
  readonly options?: Record<string, unknown>;
}
