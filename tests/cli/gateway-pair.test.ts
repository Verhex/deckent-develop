// tests/cli/gateway-pair.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleGatewayPairApprove, handleGatewayPairList } from '../../src/cli/commands/gateway.js';
import { loadGatewayAccess } from '../../src/connectors/gateway/gateway-access.js';

describe('gateway pair CLI', () => {
  it('approve moves a pending pairing onto the project allowlist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-pair-'));
    process.env['DECKENT_GATEWAY_HOME'] = dir;
    try {
      const access = await loadGatewayAccess();
      await access.requestPairing('telegram:77');
      const code = access.listPairings()[0]!.code;
      const out: string[] = [];
      await handleGatewayPairApprove({ code, project: '/proj', lang: 'en', print: (s) => out.push(s) });
      expect(out.join(' ')).toContain('telegram:77');
      const after = await loadGatewayAccess();
      expect(after.isAuthorized('telegram:77', '/proj')).toBe(true);
    } finally {
      delete process.env['DECKENT_GATEWAY_HOME'];
    }
  });
});
