import { describe, it, expect, vi } from 'vitest';
import { BaseConnector } from '../../src/connectors/base-connector.js';
import type {
  ConnectorConfig,
  ConnectorId,
  IncomingMessage,
  OutgoingMessage,
} from '../../src/connectors/types.js';

// ─── Test Connector (concrete implementation for testing) ────────────

class TestConnector extends BaseConnector {
  readonly id: ConnectorId = 'discord';
  readonly name = 'Test Connector';

  private healthy = false;
  startError: Error | null = null;

  async start(config: ConnectorConfig): Promise<void> {
    if (this.startError) {
      throw this.startError;
    }
    await super.start(config);
    if (config.enabled) {
      this.healthy = true;
    }
  }

  async stop(): Promise<void> {
    this.healthy = false;
    await super.stop();
  }

  async sendMessage(_msg: OutgoingMessage): Promise<void> {
    if (!this.started) {
      throw new Error('Connector not started');
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  /** Expose emitMessage for testing */
  simulateIncoming(msg: IncomingMessage): void {
    this.emitMessage(msg);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    enabled: true,
    token: 'test-token-123',
    ...overrides,
  };
}

function makeIncomingMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    id: 'msg-001',
    connector: 'discord',
    fromUser: 'user-123',
    channelId: 'ch-456',
    text: 'Hello world',
    timestamp: '2026-04-20T10:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('BaseConnector', () => {
  it('start/stop lifecycle — enabled connector becomes started, stop resets', async () => {
    const conn = new TestConnector();
    expect(conn.isStarted).toBe(false);
    expect(conn.isHealthy()).toBe(false);

    await conn.start(makeConfig({ enabled: true }));
    expect(conn.isStarted).toBe(true);
    expect(conn.isHealthy()).toBe(true);

    await conn.stop();
    expect(conn.isStarted).toBe(false);
    expect(conn.isHealthy()).toBe(false);
  });

  it('start with disabled config — no-op, connector stays stopped', async () => {
    const conn = new TestConnector();
    await conn.start(makeConfig({ enabled: false }));
    expect(conn.isStarted).toBe(false);
    expect(conn.isHealthy()).toBe(false);
  });

  it('handler registration — multiple handlers receive incoming messages', () => {
    const conn = new TestConnector();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    conn.onMessage(handler1);
    conn.onMessage(handler2);

    const msg = makeIncomingMessage({ text: 'test message' });
    conn.simulateIncoming(msg);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith(msg);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith(msg);
  });

  it('unhealthy state detection — not started connector is not healthy', () => {
    const conn = new TestConnector();
    expect(conn.isHealthy()).toBe(false);
    expect(conn.isStarted).toBe(false);
  });

  it('error propagation — start failure throws, connector stays stopped', async () => {
    const conn = new TestConnector();
    conn.startError = new Error('Connection refused');

    await expect(conn.start(makeConfig())).rejects.toThrow('Connection refused');
    expect(conn.isStarted).toBe(false);
  });

  it('handler error isolation — one handler throwing does not prevent others', () => {
    const conn = new TestConnector();
    const badHandler = vi.fn(() => { throw new Error('handler crash'); });
    const goodHandler = vi.fn();

    conn.onMessage(badHandler);
    conn.onMessage(goodHandler);

    const msg = makeIncomingMessage();
    conn.simulateIncoming(msg);

    expect(badHandler).toHaveBeenCalledTimes(1);
    expect(goodHandler).toHaveBeenCalledTimes(1);
    expect(goodHandler).toHaveBeenCalledWith(msg);
  });

  it('IncomingMessage schema — all required fields present', () => {
    const msg = makeIncomingMessage();
    expect(msg.id).toBe('msg-001');
    expect(msg.connector).toBe('discord');
    expect(msg.fromUser).toBe('user-123');
    expect(msg.channelId).toBe('ch-456');
    expect(msg.text).toBe('Hello world');
    expect(msg.timestamp).toBe('2026-04-20T10:00:00.000Z');
    expect(msg.raw).toBeUndefined();
  });
});
