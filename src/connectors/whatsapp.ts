/**
 * WhatsApp connector — scaffold only (Sprint 149).
 *
 * WhatsApp Business API requires official approval (2-6 weeks).
 * This scaffold establishes the connector interface contract and
 * documents the activation path. Full implementation targeted for Sprint 153+.
 *
 * ⚠️  NOTE: whatsapp-web.js (unofficial) is NOT used here — it violates WhatsApp
 * Terms of Service and risks session bans. Official Business API only.
 *
 * See src/connectors/whatsapp-README.md for activation steps.
 */

import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, OutgoingMessage } from './types.js';

export class WhatsAppConnector extends BaseConnector {
  readonly id = 'whatsapp' as const;
  readonly name = 'WhatsApp';

  /**
   * Start the connector.
   *
   * - If config.enabled is false → no-op (API approval not yet obtained).
   * - If config.enabled is true → throws, directing user to activation steps.
   *
   * Activation requires WhatsApp Business API approval. See whatsapp-README.md.
   */
  async start(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) {
      // No-op: API approval not yet obtained, connector disabled
      return;
    }

    throw new Error(
      'WhatsApp connector requires official Business API approval. ' +
        'Scaffold only in Sprint 150. Activation targeted for Sprint 153+. ' +
        'See src/connectors/whatsapp-README.md for activation steps.',
    );
  }

  /**
   * Stop the connector.
   * No-op in scaffold mode — nothing to clean up.
   */
  async stop(): Promise<void> {
    // No-op: connector was never started in scaffold mode
  }

  /**
   * Send a message via WhatsApp.
   * Always throws in scaffold mode — connector not yet activated.
   */
  async sendMessage(_msg: OutgoingMessage): Promise<void> {
    throw new Error(
      'WhatsApp connector not yet activated. ' +
        'See src/connectors/whatsapp-README.md for activation steps.',
    );
  }

  /**
   * Check connector health.
   * Always returns false in scaffold mode — connector is not connected.
   */
  isHealthy(): boolean {
    return false; // Always unhealthy until Sprint 153+ activation
  }
}
