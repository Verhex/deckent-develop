/**
 * Abstract base class for messaging connectors.
 *
 * Provides handler registration, message emission, and lifecycle state tracking.
 * Concrete connectors (Discord, Telegram, etc.) extend this class and implement
 * the platform-specific start/stop/sendMessage/isHealthy methods.
 */

import type {
  ConnectorConfig,
  ConnectorId,
  IMessageConnector,
  IncomingMessage,
  MessageHandler,
  OutgoingMessage,
} from './types.js';

export abstract class BaseConnector implements IMessageConnector {
  abstract readonly id: ConnectorId;
  abstract readonly name: string;

  /** Registered message handlers */
  private readonly handlers: MessageHandler[] = [];

  /** Whether the connector has been started */
  protected started = false;

  /**
   * Start the connector. If config.enabled is false, this is a no-op.
   * Subclasses should call `super.start(config)` first, then do platform-specific init.
   */
  async start(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) {
      return;
    }
    // Subclasses implement platform-specific startup after calling super.start()
    this.started = true;
  }

  /**
   * Stop the connector and release resources.
   * Subclasses should call `super.stop()` after platform-specific cleanup.
   */
  async stop(): Promise<void> {
    this.started = false;
  }

  /** Send a message. Must be overridden by subclasses. */
  abstract sendMessage(msg: OutgoingMessage): Promise<void>;

  /** Check connector health. Must be overridden by subclasses. */
  abstract isHealthy(): boolean;

  /**
   * Register a handler for incoming messages.
   * Multiple handlers can be registered — all are called for each message.
   */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Emit an incoming message to all registered handlers.
   * Called by subclasses when a message arrives from the platform.
   */
  protected emitMessage(msg: IncomingMessage): void {
    for (const handler of this.handlers) {
      try {
        handler(msg);
      } catch {
        // Handler errors should not crash the connector
      }
    }
  }

  /** Whether the connector has been started (not necessarily healthy) */
  get isStarted(): boolean {
    return this.started;
  }
}
