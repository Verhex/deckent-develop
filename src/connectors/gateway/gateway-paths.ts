// src/connectors/gateway/gateway-paths.ts
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Global gateway home. Test/override via DECKENT_GATEWAY_HOME; else ~/.deckent/gateway. */
export function gatewayHome(): string {
  const override = process.env['DECKENT_GATEWAY_HOME'];
  return override && override.length > 0 ? override : join(homedir(), '.deckent', 'gateway');
}

export function gatewayPidPath(): string { return join(gatewayHome(), 'gateway.pid'); }
export function sessionsPath(): string { return join(gatewayHome(), 'sessions.json'); }
export function projectsPath(): string { return join(gatewayHome(), 'projects.json'); }
