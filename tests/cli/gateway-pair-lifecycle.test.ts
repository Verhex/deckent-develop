import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  handleGatewayPairApprove,
  handleGatewayPairList,
  handleGatewayPairReject,
} from '../../src/cli/commands/gateway.js';
import { loadGatewayAccess } from '../../src/connectors/gateway/gateway-access.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';

const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });

afterEach(() => { delete process.env['DECKENT_GATEWAY_HOME']; });

async function home(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-pair-cli-lifecycle-'));
  process.env['DECKENT_GATEWAY_HOME'] = dir;
  return dir;
}

function scope(projectPath = '/projects/alpha') {
  return {
    tenantId: 'tenant-cli',
    projectPath,
    lifecycle,
    lifecycleGeneration: 'gateway-config:cli-test',
  };
}

describe('gateway pair CLI lifecycle guard', () => {
  it('approves through the canonical scoped transition and a second decision is visibly late', async () => {
    await home();
    const access = await loadGatewayAccess({ genCode: () => 'CLI42', genPairingId: () => 'gwp-cli' });
    await access.requestPairing('telegram:cli', scope());
    const approved: string[] = [];
    await handleGatewayPairApprove({ code: 'CLI42', project: '/projects/alpha', lang: 'en', print: (line) => approved.push(line) });
    expect(approved.join(' ')).toContain('telegram:cli');

    const late: string[] = [];
    await handleGatewayPairReject({ code: 'CLI42', lang: 'en', print: (line) => late.push(line) });
    expect(late.join(' ')).toMatch(/late|approvals\.late_decision/iu);
    expect((await loadGatewayAccess()).isAuthorized('telegram:cli', '/projects/alpha')).toBe(true);
  });

  it('renders expiry and never grants when approval arrives after the boundary', async () => {
    await home();
    const access = await loadGatewayAccess({
      clock: () => new Date('2026-01-01T00:00:00.000Z'),
      genCode: () => 'EXPIRED42',
      genPairingId: () => 'gwp-cli-expired',
    });
    await access.requestPairing('telegram:expired', scope());
    const output: string[] = [];
    await handleGatewayPairApprove({
      code: 'EXPIRED42', project: '/projects/alpha', lang: 'en', print: (line) => output.push(line),
    });
    expect(output.join(' ')).toMatch(/expired|approvals\.expired/iu);
    expect((await loadGatewayAccess()).isAuthorized('telegram:expired', '/projects/alpha')).toBe(false);
  });

  it('lists only live pending records from the revisioned map', async () => {
    await home();
    const access = await loadGatewayAccess({ genCode: () => 'LIST42', genPairingId: () => 'gwp-cli-list' });
    await access.requestPairing('telegram:list', scope());
    const output: string[] = [];
    await handleGatewayPairList({ lang: 'en', print: (line) => output.push(line) });
    expect(output.join(' ')).toContain('telegram:list');
    expect(output.join(' ')).toContain('LIST42');
  });

  it('scope mismatch returns a quarantined/HOLD message and preserves denial', async () => {
    await home();
    const access = await loadGatewayAccess({ genCode: () => 'SCOPECLI', genPairingId: () => 'gwp-cli-scope' });
    await access.requestPairing('telegram:scope', scope('/projects/exact'));
    const output: string[] = [];
    await handleGatewayPairApprove({ code: 'SCOPECLI', project: '/projects/other', lang: 'en', print: (line) => output.push(line) });
    expect(output.join(' ')).toMatch(/quarantined|approvals\.quarantined/iu);
    expect((await loadGatewayAccess()).isAuthorized('telegram:scope', '/projects/exact')).toBe(false);
  });
});
