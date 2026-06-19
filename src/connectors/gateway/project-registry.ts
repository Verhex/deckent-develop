// src/connectors/gateway/project-registry.ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { projectsPath } from './gateway-paths.js';

export interface ProjectEntry { name: string; path: string }

export interface ProjectRegistry {
  list(): ProjectEntry[];
  resolve(nameOrPath: string): ProjectEntry | undefined;
  add(name: string, path: string): Promise<ProjectEntry>;
}

export async function loadProjectRegistry(opts: { path?: string } = {}): Promise<ProjectRegistry> {
  const path = opts.path ?? projectsPath();
  const byName = new Map<string, ProjectEntry>();

  try {
    const raw = JSON.parse(await readFile(path, 'utf-8')) as ProjectEntry[];
    if (Array.isArray(raw)) {
      for (const e of raw) {
        if (e && typeof e.name === 'string' && typeof e.path === 'string') byName.set(e.name, e);
      }
    }
  } catch {
    // Missing/corrupt → empty catalog.
  }

  async function persist(): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify([...byName.values()], null, 2), 'utf-8');
    await rename(tmp, path);
  }

  return {
    list: () => [...byName.values()],
    resolve: (nameOrPath) =>
      byName.get(nameOrPath) ?? [...byName.values()].find((e) => e.path === nameOrPath),
    async add(name, p) {
      const entry: ProjectEntry = { name, path: p };
      byName.set(name, entry);
      await persist();
      return entry;
    },
  };
}
