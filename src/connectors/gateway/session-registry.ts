// src/connectors/gateway/session-registry.ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sessionsPath } from './gateway-paths.js';

export interface SessionBinding {
  chatKey: string;
  projectPath: string;
  boundAt: string;
  boundBy: string;
}

export interface SessionRegistry {
  resolve(chatKey: string): SessionBinding | undefined;
  bind(chatKey: string, projectPath: string, boundBy: string): Promise<SessionBinding>;
  unbind(chatKey: string): Promise<boolean>;
  list(): SessionBinding[];
}

export interface LoadSessionRegistryOptions {
  /** Override the sessions.json path (tests). Default: sessionsPath(). */
  path?: string;
  /** Injectable clock for boundAt (tests). Default: real ISO now. */
  now?: () => string;
}

/** Load (or initialize) the disk-backed session registry. Corrupt file → empty. */
export async function loadSessionRegistry(opts: LoadSessionRegistryOptions = {}): Promise<SessionRegistry> {
  const path = opts.path ?? sessionsPath();
  const now = opts.now ?? ((): string => new Date().toISOString());
  const map = new Map<string, SessionBinding>();

  try {
    const raw = JSON.parse(await readFile(path, 'utf-8')) as Record<string, SessionBinding>;
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v.projectPath === 'string') map.set(k, { ...v, chatKey: k });
    }
  } catch {
    // Missing or corrupt → start empty (fail-safe; never crash the gateway).
  }

  async function persist(): Promise<void> {
    const obj: Record<string, SessionBinding> = {};
    for (const [k, v] of map) obj[k] = v;
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf-8');
    await rename(tmp, path); // atomic replace
  }

  return {
    resolve: (chatKey) => map.get(chatKey),
    list: () => [...map.values()],
    async bind(chatKey, projectPath, boundBy) {
      const binding: SessionBinding = { chatKey, projectPath, boundAt: now(), boundBy };
      map.set(chatKey, binding);
      await persist();
      return binding;
    },
    async unbind(chatKey) {
      const existed = map.delete(chatKey);
      if (existed) await persist();
      return existed;
    },
  };
}
