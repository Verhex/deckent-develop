// ═══ chat-permissions — REPL tool izin hafızası (Sprint 224 T-224-016) ═══════
//
// claude-code'un `.claude/settings.local.json` `permissions.allow` mantığı:
// kullanıcı bir tool'a "hep izin ver" derse, onay `.deckent/settings.local.json`'a
// yazılır ve bir daha SORULMAZ (auto-approve). Tek-seferlik onaylar kaydedilmez.
//
// Şema (claude-code uyumlu): { "permissions": { "allow": ["deckent_write_file", …] } }
// Konum: <cwd>/.deckent/settings.local.json (kişisel/yerel state, .local = gitignore).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface PermissionStore {
  /** tool kalıcı izinli mi (onaysız geçer)? */
  isAllowed(tool: string): boolean;
  /** tool'u kalıcı izin listesine ekle + diske yaz. */
  allow(tool: string): void;
  /** Kalıcı izinli tool'ların anlık listesi (görüntüleme için). */
  list(): string[];
}

/** Yerel ayar dosyasının yolu (claude-code settings.local.json muadili). */
export function settingsLocalPath(cwd: string): string {
  return join(cwd, '.deckent', 'settings.local.json');
}

/** settings.local.json → permissions.allow setini oku (yoksa/bozuksa boş — fail-safe). */
export function loadPermissions(cwd: string): Set<string> {
  try {
    const p = settingsLocalPath(cwd);
    if (!existsSync(p)) return new Set();
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as { permissions?: { allow?: unknown } };
    const allow = Array.isArray(parsed.permissions?.allow)
      ? (parsed.permissions!.allow as unknown[]).filter((x) => typeof x === 'string')
      : [];
    return new Set(allow as string[]);
  } catch {
    return new Set();
  }
}

/**
 * permissions.allow setini settings.local.json'a yaz; dosyadaki DİĞER alanları
 * (varsa) korur (merge — sadece permissions.allow'u günceller). .deckent/ yoksa oluştur.
 */
export function writePermissions(cwd: string, allow: ReadonlySet<string>): void {
  const p = settingsLocalPath(cwd);
  let doc: Record<string, unknown> = {};
  try {
    if (existsSync(p)) doc = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    doc = {};
  }
  const permissions = (doc['permissions'] && typeof doc['permissions'] === 'object')
    ? (doc['permissions'] as Record<string, unknown>)
    : {};
  permissions['allow'] = [...allow].sort();
  doc['permissions'] = permissions;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}

/**
 * Bellekte cache'lenen, settings.local.json'a kalıcı izin deposu. REPL başında
 * bir kez kurulur; isAllowed onay-gate'inde sorulur, allow() "hep izin ver"
 * seçilince çağrılır.
 */
export function createPermissionStore(cwd: string): PermissionStore {
  const cache = loadPermissions(cwd);
  return {
    isAllowed: (tool) => cache.has(tool),
    allow: (tool) => {
      if (cache.has(tool)) return;
      // Atomic read-merge-write (born-539, consistent with the born-555
      // agent/permission-store.ts pattern): re-read the CURRENT on-disk
      // allow-set right before writing, instead of persisting this store's
      // stale creation-time `cache` snapshot. Two PermissionStore instances
      // sharing the same settings.local.json (e.g. two concurrent REPL/worker
      // sessions) each hold an independent snapshot; writing the raw snapshot
      // would let the later writer silently clobber an earlier concurrent
      // grant (last-writer-wins → grant loss). Merging the fresh disk state
      // with `tool` + everything this store already knows about fixes that.
      const merged = loadPermissions(cwd);
      merged.add(tool);
      for (const t of cache) merged.add(t);
      writePermissions(cwd, merged);
      cache.clear();
      for (const t of merged) cache.add(t);
    },
    list: () => [...cache].sort(),
  };
}
