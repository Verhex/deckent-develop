import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadGatewayAccess } from '../../src/connectors/gateway/gateway-access.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { listFederatedPendingItems } from '../../src/core/approval-inbox-federation.js';

const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });

afterEach(() => { delete process.env['DECKENT_GATEWAY_HOME']; });

describe('gateway pairing federated inbox parity', () => {
  it('reads the real revisioned object-map and projects opaque lifecycle authority', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'federated-project-'));
    const gatewayHomeDir = mkdtempSync(join(tmpdir(), 'federated-gateway-'));
    process.env['DECKENT_GATEWAY_HOME'] = gatewayHomeDir;
    const access = await loadGatewayAccess({
      genCode: () => 'VISIBLE42',
      genPairingId: () => 'gwp-inbox-opaque',
    });
    await access.requestPairing('telegram:inbox', {
      tenantId: 'tenant-inbox',
      projectPath: '/projects/inbox',
      lifecycle,
      lifecycleGeneration: 'gateway-config:inbox',
      sourceReference: 'gateway-project-registry:/projects/inbox',
    });

    const pairing = listFederatedPendingItems(projectRoot, { gatewayHomeDir })
      .find(item => item.origin === 'gateway-pairing');
    expect(pairing).toMatchObject({
      id: 'gwp-inbox-opaque',
      tenantId: 'tenant-inbox',
      projectPath: '/projects/inbox',
      riskTier: 'critical',
      lifecycleStage: 'initial',
      sourceReference: 'gateway-project-registry:/projects/inbox',
    });
    expect(pairing?.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(pairing?.id).not.toBe('VISIBLE42');
  });

  it('uses identical compatibility parsing for legacy array and object-map rows', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'federated-project-legacy-'));
    const arrayHome = mkdtempSync(join(tmpdir(), 'federated-array-'));
    const mapHome = mkdtempSync(join(tmpdir(), 'federated-map-'));
    const row = { code: 'LEGACY42', chatKey: 'telegram:legacy', requestedAt: '2026-08-21T10:00:00.000Z' };
    writeFileSync(join(arrayHome, 'pairings.json'), JSON.stringify([row]), 'utf8');
    writeFileSync(join(mapHome, 'pairings.json'), JSON.stringify({ LEGACY42: row }), 'utf8');

    const fromArray = listFederatedPendingItems(projectRoot, { gatewayHomeDir: arrayHome });
    const fromMap = listFederatedPendingItems(projectRoot, { gatewayHomeDir: mapHome });
    expect(fromMap).toEqual(fromArray);
    expect(fromArray[0]).toMatchObject({
      origin: 'gateway-pairing',
      id: 'LEGACY42',
      quarantined: true,
      lifecycleReasonCode: 'legacy-lifecycle-metadata-missing',
    });
  });

  it('does not surface an elapsed pending record as decidable', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'federated-project-expired-'));
    const gatewayHomeDir = mkdtempSync(join(tmpdir(), 'federated-gateway-expired-'));
    process.env['DECKENT_GATEWAY_HOME'] = gatewayHomeDir;
    const access = await loadGatewayAccess({
      clock: () => new Date('2026-01-01T00:00:00.000Z'),
      genCode: () => 'STALE42',
      genPairingId: () => 'gwp-stale-inbox',
    });
    await access.requestPairing('telegram:stale', {
      tenantId: 'tenant-stale',
      projectPath: '/projects/stale',
      lifecycle,
      lifecycleGeneration: 'gateway-config:stale',
    });
    expect(listFederatedPendingItems(projectRoot, { gatewayHomeDir })
      .some(item => item.id === 'gwp-stale-inbox')).toBe(false);
  });
});
