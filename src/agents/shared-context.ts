// ─── Shared Context ─────────────────────────────────────────────────────────
// Enables agents to share key-value data atomically via a JSON file.
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ErrorRegistry } from '../core/errors.js';

export interface SharedContextEntry {
  agentId: string;
  value: unknown;
  timestamp: string;
}

export class SharedContext {
  private filePath: string;

  constructor(projectRoot: string) {
    this.filePath = join(projectRoot, '.tasks', 'shared-context.json');
  }

  /**
   * Write a key-value pair into shared context.
   * Reads existing data, merges, and writes atomically (via .tmp + rename).
   */
  write(agentId: string, key: string, value: unknown): void {
    if (!key || typeof key !== 'string') {
      throw ErrorRegistry.createError('DECKENT_E062', { message: 'SharedContext.write: key must be a non-empty string' });
    }
    if (!agentId || typeof agentId !== 'string') {
      throw ErrorRegistry.createError('DECKENT_E063', { message: 'SharedContext.write: agentId must be a non-empty string' });
    }

    const data = this._readAll();
    data[key] = {
      agentId,
      value,
      timestamp: new Date().toISOString(),
    };
    this._writeAtomic(data);
  }

  /**
   * Read a single key from shared context.
   * Returns undefined if key not found.
   */
  read(key: string): SharedContextEntry | undefined {
    const data = this._readAll();
    return data[key];
  }

  /**
   * Read all entries from shared context.
   */
  readAll(): Record<string, SharedContextEntry> {
    return this._readAll();
  }

  /**
   * Clear all shared context data (deletes the file).
   */
  clear(): void {
    try {
      if (existsSync(this.filePath)) {
        unlinkSync(this.filePath);
      }
    } catch {
      // Best-effort clear
    }
  }

  /**
   * Remove a specific key from shared context.
   */
  remove(key: string): boolean {
    const data = this._readAll();
    if (!(key in data)) return false;
    delete data[key];
    this._writeAtomic(data);
    return true;
  }

  /**
   * Get the number of entries in shared context.
   */
  size(): number {
    return Object.keys(this._readAll()).length;
  }

  /**
   * Check if a key exists in shared context.
   */
  has(key: string): boolean {
    const data = this._readAll();
    return key in data;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private _readAll(): Record<string, SharedContextEntry> {
    try {
      if (!existsSync(this.filePath)) return {};
      const content = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, SharedContextEntry>;
    } catch {
      return {};
    }
  }

  private _writeAtomic(data: Record<string, SharedContextEntry>): void {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmpPath, this.filePath);
  }
}
