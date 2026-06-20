// tests/cli/gateway-pair.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleGatewayPairApprove, handleGatewayPairList, handleGatewayPairReject } from '../../src/cli/commands/gateway.js';
import { loadGatewayAccess } from '../../src/connectors/gateway/gateway-access.js';
import { loadProjectRegistry } from '../../src/connectors/gateway/project-registry.js';

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

  it('approve by project NAME authorizes the canonical project PATH (router read key)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-pair-np-'));
    process.env['DECKENT_GATEWAY_HOME'] = dir;
    try {
      const projects = await loadProjectRegistry();
      await projects.add('foo', '/home/me/foo');           // name → canonical path
      const access = await loadGatewayAccess();
      await access.requestPairing('telegram:88');
      const code = access.listPairings()[0]!.code;
      await handleGatewayPairApprove({ code, project: 'foo', lang: 'en', print: () => {} }); // owner types the NAME
      const after = await loadGatewayAccess();
      expect(after.isAuthorized('telegram:88', '/home/me/foo')).toBe(true); // the path the router checks
    } finally {
      delete process.env['DECKENT_GATEWAY_HOME'];
    }
  });

  it('list shows pending pairings and the empty case', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-pair-list-'));
    process.env['DECKENT_GATEWAY_HOME'] = dir;
    try {
      const empty: string[] = [];
      await handleGatewayPairList({ lang: 'en', print: (s) => empty.push(s) });
      expect(empty.join(' ')).toMatch(/no pending pairings/i);
      const access = await loadGatewayAccess();
      await access.requestPairing('telegram:55');
      const out: string[] = [];
      await handleGatewayPairList({ lang: 'en', print: (s) => out.push(s) });
      expect(out.join(' ')).toContain('telegram:55');
    } finally {
      delete process.env['DECKENT_GATEWAY_HOME'];
    }
  });

  it('reject removes a pending pairing; unknown code reports unknown', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-pair-rej-'));
    process.env['DECKENT_GATEWAY_HOME'] = dir;
    try {
      const access = await loadGatewayAccess();
      await access.requestPairing('telegram:66');
      const code = access.listPairings()[0]!.code;
      const ok: string[] = [];
      await handleGatewayPairReject({ code, lang: 'en', print: (s) => ok.push(s) });
      expect(ok.join(' ').toLowerCase()).toContain('reject');
      const after = await loadGatewayAccess();
      expect(after.listPairings()).toHaveLength(0);
      const unk: string[] = [];
      await handleGatewayPairReject({ code: 'NOPE', lang: 'en', print: (s) => unk.push(s) });
      expect(unk.join(' ')).toContain('NOPE');
    } finally {
      delete process.env['DECKENT_GATEWAY_HOME'];
    }
  });
});
