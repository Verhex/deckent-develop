// tests/connectors/gateway/gateway-paths.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { gatewayHome, sessionsPath, projectsPath, gatewayPidPath } from '../../../src/connectors/gateway/gateway-paths.js';

describe('gateway-paths', () => {
  const prev = process.env['DECKENT_GATEWAY_HOME'];
  afterEach(() => {
    if (prev === undefined) delete process.env['DECKENT_GATEWAY_HOME'];
    else process.env['DECKENT_GATEWAY_HOME'] = prev;
  });

  it('honors DECKENT_GATEWAY_HOME override', () => {
    process.env['DECKENT_GATEWAY_HOME'] = '/tmp/gw-test';
    expect(gatewayHome()).toBe('/tmp/gw-test');
    expect(sessionsPath()).toBe(join('/tmp/gw-test', 'sessions.json'));
    expect(projectsPath()).toBe(join('/tmp/gw-test', 'projects.json'));
    expect(gatewayPidPath()).toBe(join('/tmp/gw-test', 'gateway.pid'));
  });

  it('falls back to ~/.deckent/gateway when unset', () => {
    delete process.env['DECKENT_GATEWAY_HOME'];
    expect(gatewayHome().endsWith(join('.deckent', 'gateway'))).toBe(true);
  });
});
