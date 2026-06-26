/**
 * ConnectorPool — multi-connector parallel dispatch.
 *
 * Manages a set of IMessageConnector instances, providing:
 * - Registration and lookup by ConnectorId
 * - Parallel broadcast to multiple connectors with per-target error isolation
 * - Lifecycle management (startAll / stopAll)
 * - Fan-out handler for incoming messages from any connector
 */

import type {
  ConnectorConfig,
  ConnectorId,
  IMessageConnector,
  MessageHandler,
  OutgoingMessage,
} from './types.js';

/** Result of a single connector send attempt within a broadcast */
export interface BroadcastResult {
  readonly connector: ConnectorId;
  readonly success: boolean;
  readonly error?: string;
}

export class ConnectorPool {
  private readonly connectors = new Map<ConnectorId, IMessageConnector>();

  /** Register a connector instance. Replaces any existing connector with the same id. */
  register(connector: IMessageConnector): void {
    this.connectors.set(connector.id, connector);
  }

  /** Look up a connector by id. */
  get(id: ConnectorId): IMessageConnector | undefined {
    return this.connectors.get(id);
  }

  /** Check whether a connector is registered. */
  has(id: ConnectorId): boolean {
    return this.connectors.has(id);
  }

  /** Return all registered connectors. */
  getAll(): IMessageConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Broadcast a message to multiple connectors in parallel.
   *
   * Each target is attempted independently — a failure in one connector
   * does not prevent delivery to others.
   */
  async broadcast(
    msg: Omit<OutgoingMessage, 'connector'>,
    targets: ConnectorId[],
  ): Promise<BroadcastResult[]> {
    return Promise.all(
      targets.map(async (id): Promise<BroadcastResult> => {
        const conn = this.connectors.get(id);
        if (!conn) {
          return { connector: id, success: false, error: 'Not registered' };
        }
        try {
          await conn.sendMessage({ ...msg, connector: id } as OutgoingMessage);
          return { connector: id, success: true };
        } catch (err) {
          return { connector: id, success: false, error: (err as Error).message };
        }
      }),
    );
  }

  /**
   * Start all registered connectors whose config has `enabled: true`.
   *
   * Connectors are started sequentially so that startup ordering is deterministic.
   * A single connector's start failure is logged but does not prevent others from starting.
   */
  async startAll(configs: Partial<Record<ConnectorId, ConnectorConfig>>): Promise<void> {
    for (const conn of this.connectors.values()) {
      const config = configs[conn.id];
      if (config?.enabled) {
        try {
          await conn.start(config);
        } catch (err) {
          console.error(`[connector-pool] ${conn.id} start failed:`, err);
        }
      }
    }
  }

  /** Stop all registered connectors in parallel. */
  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.connectors.values()).map((c) => c.stop()),
    );
  }

  /**
   * Broadcast a message to ALL registered connectors in parallel.
   *
   * Shorthand for `broadcast(msg, [...all registered ids])`. Per-connector error
   * isolation is preserved — a failure in one connector does not affect others.
   */
  broadcastAll(msg: Omit<OutgoingMessage, 'connector'>): Promise<BroadcastResult[]> {
    return this.broadcast(msg, Array.from(this.connectors.keys()));
  }

  /**
   * Register a handler that receives incoming messages from ALL connectors.
   *
   * Internally calls `onMessage` on every currently-registered connector.
   * Connectors registered after this call will NOT receive the handler —
   * call `onAnyMessage` again or register the handler per-connector.
   */
  onAnyMessage(handler: MessageHandler): void {
    for (const conn of this.connectors.values()) {
      conn.onMessage(handler);
    }
  }
}
