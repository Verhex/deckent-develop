// ─── Shared Memory ──────────────────────────────────────────────────────────
// Key-value store for inter-worker data sharing with TTL support.
// Data stored in .tasks/shared/{key}.json files.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface SharedMemoryEntry {
  value: unknown;
  writerId: string;
  writtenAt: string;
  ttlMs?: number;
}

export class SharedMemory {
  private sharedDir: string;

  constructor(projectRoot: string, private ttlMs?: number) {
    this.sharedDir = join(projectRoot, '.tasks', 'shared');
  }

  /**
   * Write a value under the given key.
   */
  write(key: string, value: unknown, writerId: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('SharedMemory.write: key must be a non-empty string');
    }
    if (!writerId || typeof writerId !== 'string') {
      throw new Error('SharedMemory.write: writerId must be a non-empty string');
    }

    mkdirSync(this.sharedDir, { recursive: true });

    const entry: SharedMemoryEntry = {
      value,
      writerId,
      writtenAt: new Date().toISOString(),
      ttlMs: this.ttlMs,
    };

    const filePath = this._keyPath(key);
    writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  }

  /**
   * Read a value by key. Returns null if not found or expired.
   */
  read(key: string): { value: unknown; writerId: string; writtenAt: string } | null {
    const entry = this._readEntry(key);
    if (!entry) return null;
    if (this._isEntryExpired(entry)) return null;
    return { value: entry.value, writerId: entry.writerId, writtenAt: entry.writtenAt };
  }

  /**
   * List all non-expired keys.
   */
  listKeys(): string[] {
    if (!existsSync(this.sharedDir)) return [];
    try {
      const files = readdirSync(this.sharedDir).filter(f => f.endsWith('.json'));
      const keys: string[] = [];
      for (const file of files) {
        const key = file.replace(/\.json$/, '');
        const entry = this._readEntry(key);
        if (entry && !this._isEntryExpired(entry)) {
          keys.push(key);
        }
      }
      return keys.sort();
    } catch {
      return [];
    }
  }

  /**
   * Check if a key's entry is expired based on TTL.
   */
  isExpired(key: string): boolean {
    const entry = this._readEntry(key);
    if (!entry) return true;
    return this._isEntryExpired(entry);
  }

  /**
   * Remove expired entries. Returns the number of entries removed.
   */
  cleanup(): number {
    if (!existsSync(this.sharedDir)) return 0;
    let removed = 0;
    try {
      const files = readdirSync(this.sharedDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const key = file.replace(/\.json$/, '');
        const entry = this._readEntry(key);
        if (entry && this._isEntryExpired(entry)) {
          try {
            unlinkSync(this._keyPath(key));
            removed++;
          } catch {
            // best effort
          }
        }
      }
    } catch {
      // best effort
    }
    return removed;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private _keyPath(key: string): string {
    // Sanitize key for filesystem safety
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.sharedDir, `${safeKey}.json`);
  }

  private _readEntry(key: string): SharedMemoryEntry | null {
    const filePath = this._keyPath(key);
    try {
      if (!existsSync(filePath)) return null;
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as SharedMemoryEntry;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private _isEntryExpired(entry: SharedMemoryEntry): boolean {
    const ttl = entry.ttlMs ?? this.ttlMs;
    if (ttl === undefined || ttl <= 0) return false;
    const writtenAt = new Date(entry.writtenAt).getTime();
    const now = Date.now();
    return (now - writtenAt) > ttl;
  }
}
