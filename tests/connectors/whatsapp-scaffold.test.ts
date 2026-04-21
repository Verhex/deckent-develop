import { describe, it, expect } from 'vitest';
import { WhatsAppConnector } from '../../src/connectors/whatsapp.js';
import type { ConnectorConfig, OutgoingMessage } from '../../src/connectors/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    enabled: true,
    token: '',
    ...overrides,
  };
}

function makeOutgoing(): OutgoingMessage {
  return {
    connector: 'whatsapp',
    channelId: '+905551234567',
    text: 'Hello from Deckent',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('WhatsAppConnector (scaffold)', () => {
  it('disabled start → no-op (connector stays stopped)', async () => {
    const conn = new WhatsAppConnector();
    // Should not throw and should remain in a non-started state
    await expect(conn.start(makeConfig({ enabled: false }))).resolves.toBeUndefined();
    expect(conn.isHealthy()).toBe(false);
  });

  it('enabled start → throws activation error with guidance', async () => {
    const conn = new WhatsAppConnector();
    await expect(conn.start(makeConfig({ enabled: true }))).rejects.toThrow(
      'WhatsApp connector requires official Business API approval',
    );
    // After failed start, connector must remain unhealthy
    expect(conn.isHealthy()).toBe(false);
  });

  it('isHealthy → always false in scaffold mode', () => {
    const conn = new WhatsAppConnector();
    expect(conn.isHealthy()).toBe(false);
  });

  it('sendMessage → throws not-activated error', async () => {
    const conn = new WhatsAppConnector();
    await expect(conn.sendMessage(makeOutgoing())).rejects.toThrow(
      'WhatsApp connector not yet activated',
    );
  });

  it('stop → no-op (nothing to clean up in scaffold mode)', async () => {
    const conn = new WhatsAppConnector();
    await expect(conn.stop()).resolves.toBeUndefined();
    expect(conn.isHealthy()).toBe(false);
  });

  it('connector identity — correct id and name', () => {
    const conn = new WhatsAppConnector();
    expect(conn.id).toBe('whatsapp');
    expect(conn.name).toBe('WhatsApp');
  });
});
