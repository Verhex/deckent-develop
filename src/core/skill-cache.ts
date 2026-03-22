// ─── Skill Loading Cache ────────────────────────────────────────────────────
// Caches loaded skill content in memory with staleness checks.

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export interface CachedSkill {
  skillId: string;
  content: string;
  loadedAt: number;
  sizeBytes: number;
  mtime: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const MAX_TOTAL_BYTES = 500 * 1024; // 500KB
const SKILLS_DIR = '.deckent/skills';
const SKILL_ENTRYPOINT = 'SKILL.md';

// ─── SkillLoadingCache ──────────────────────────────────────────────

export class SkillLoadingCache {
  private _cache = new Map<string, CachedSkill>();
  private _totalBytes = 0;
  private _projectRoot: string;
  private _maxBytes: number;

  constructor(projectRoot: string, maxBytes: number = MAX_TOTAL_BYTES) {
    this._projectRoot = projectRoot;
    this._maxBytes = maxBytes;
  }

  /**
   * Load a skill's content and cache it.
   */
  loadAndCache(skillId: string): CachedSkill | null {
    const filePath = path.join(this._projectRoot, SKILLS_DIR, skillId, SKILL_ENTRYPOINT);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return null;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }

    const sizeBytes = Buffer.byteLength(content, 'utf8');

    // Evict if we would exceed the budget
    while (this._totalBytes + sizeBytes > this._maxBytes && this._cache.size > 0) {
      this._evictOldest();
    }

    // If a single skill is larger than the budget, do not cache it
    if (sizeBytes > this._maxBytes) {
      return {
        skillId,
        content,
        loadedAt: Date.now(),
        sizeBytes,
        mtime: stat.mtimeMs,
      };
    }

    // Remove old cached version if present
    const existing = this._cache.get(skillId);
    if (existing) {
      this._totalBytes -= existing.sizeBytes;
    }

    const cached: CachedSkill = {
      skillId,
      content,
      loadedAt: Date.now(),
      sizeBytes,
      mtime: stat.mtimeMs,
    };

    this._cache.set(skillId, cached);
    this._totalBytes += sizeBytes;

    return cached;
  }

  /**
   * Get a cached skill. Returns null if not cached.
   */
  getCached(skillId: string): CachedSkill | null {
    return this._cache.get(skillId) ?? null;
  }

  /**
   * Preload all skills from the skills directory.
   */
  preloadAll(): number {
    const skillsDir = path.join(this._projectRoot, SKILLS_DIR);
    if (!fs.existsSync(skillsDir)) return 0;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    } catch {
      return 0;
    }

    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const result = this.loadAndCache(entry.name);
      if (result) count++;
    }

    return count;
  }

  /**
   * Check if a cached skill is stale based on file modification time.
   */
  isStale(skillId: string): boolean {
    const cached = this._cache.get(skillId);
    if (!cached) return true;

    const filePath = path.join(this._projectRoot, SKILLS_DIR, skillId, SKILL_ENTRYPOINT);
    try {
      const stat = fs.statSync(filePath);
      return stat.mtimeMs > cached.mtime;
    } catch {
      return true;
    }
  }

  /**
   * Clear the entire cache.
   */
  clearCache(): void {
    this._cache.clear();
    this._totalBytes = 0;
  }

  /**
   * Remove a specific skill from cache.
   */
  evict(skillId: string): boolean {
    const cached = this._cache.get(skillId);
    if (!cached) return false;

    this._totalBytes -= cached.sizeBytes;
    this._cache.delete(skillId);
    return true;
  }

  /**
   * Get the current total cached size in bytes.
   */
  get totalBytes(): number {
    return this._totalBytes;
  }

  /**
   * Get the number of cached skills.
   */
  get size(): number {
    return this._cache.size;
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private _evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._cache) {
      if (entry.loadedAt < oldestTime) {
        oldestTime = entry.loadedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      const entry = this._cache.get(oldestKey);
      if (entry) {
        this._totalBytes -= entry.sizeBytes;
        this._cache.delete(oldestKey);
      }
    }
  }
}
