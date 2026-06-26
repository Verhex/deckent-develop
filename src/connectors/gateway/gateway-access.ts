// src/connectors/gateway/gateway-access.ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomInt } from 'node:crypto';
import { gatewayHome } from './gateway-paths.js';
import { join } from 'node:path';
import type { ChannelBinding } from '../identity/principal-resolver.js';

export interface PendingPairing { code: string; chatKey: string; requestedAt: string }

export interface GatewayAccess {
  isAuthorized(chatKey: string, projectPath: string): boolean;
  authorize(chatKey: string, projectPath: string): Promise<void>;
  revoke(chatKey: string, projectPath: string): Promise<void>;
  requestPairing(chatKey: string): Promise<string>;
  approvePairing(code: string, projectPath: string): Promise<{ chatKey: string } | null>;
  rejectPairing(code: string): Promise<boolean>;
  listPairings(): PendingPairing[];
  getBinding(chatKey: string): ChannelBinding | null;
  setBinding(chatKey: string, binding: ChannelBinding): Promise<void>;
}

export interface LoadGatewayAccessOptions {
  allowlistPath?: string;
  pairingsPath?: string;
  bindingsPath?: string;
  genCode?: () => string;
  now?: () => string;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf-8')) as T; } catch { return fallback; }
}
async function writeJson(path: string, obj: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf-8');
  await rename(tmp, path);
}

export async function loadGatewayAccess(opts: LoadGatewayAccessOptions = {}): Promise<GatewayAccess> {
  const allowlistPath = opts.allowlistPath ?? join(gatewayHome(), 'allowlist.json');
  const pairingsPath = opts.pairingsPath ?? join(gatewayHome(), 'pairings.json');
  const genCode = opts.genCode ?? ((): string => String(randomInt(100000, 1000000)));
  const now = opts.now ?? ((): string => new Date().toISOString());

  const bindingsPath = opts.bindingsPath ?? join(gatewayHome(), 'bindings.json');
  const allow = await readJson<Record<string, string[]>>(allowlistPath, {});
  const pairings = await readJson<Record<string, PendingPairing>>(pairingsPath, {});
  const bindings = await readJson<Record<string, ChannelBinding>>(bindingsPath, {});

  return {
    isAuthorized(chatKey, projectPath) {
      return (allow[projectPath] ?? []).includes(chatKey);
    },
    async authorize(chatKey, projectPath) {
      const list = allow[projectPath] ?? (allow[projectPath] = []);
      if (!list.includes(chatKey)) { list.push(chatKey); await writeJson(allowlistPath, allow); }
    },
    async revoke(chatKey, projectPath) {
      const list = allow[projectPath];
      if (!list) return;
      const i = list.indexOf(chatKey);
      if (i >= 0) { list.splice(i, 1); await writeJson(allowlistPath, allow); }
    },
    async requestPairing(chatKey) {
      const existing = Object.values(pairings).find((p) => p.chatKey === chatKey);
      if (existing) return existing.code;
      const code = genCode();
      pairings[code] = { code, chatKey, requestedAt: now() };
      await writeJson(pairingsPath, pairings);
      return code;
    },
    async approvePairing(code, projectPath) {
      const p = pairings[code];
      if (!p) return null;
      delete pairings[code];
      await writeJson(pairingsPath, pairings);
      const list = allow[projectPath] ?? (allow[projectPath] = []);
      if (!list.includes(p.chatKey)) { list.push(p.chatKey); await writeJson(allowlistPath, allow); }
      return { chatKey: p.chatKey };
    },
    async rejectPairing(code) {
      if (!pairings[code]) return false;
      delete pairings[code];
      await writeJson(pairingsPath, pairings);
      return true;
    },
    listPairings() { return Object.values(pairings); },
    getBinding(chatKey) { return bindings[chatKey] ?? null; },
    async setBinding(chatKey, binding) { bindings[chatKey] = binding; await writeJson(bindingsPath, bindings); },
  };
}
