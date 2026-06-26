// ─── Agent Selection Cache ──────────────────────────────────────────────────
// LRU cache for agent selection results. Pure logic, no fs.

// ─── Types ──────────────────────────────────────────────────────────

export interface TaskSignatureInput {
  title: string;
  description: string;
  scope: { directories: string[]; filesWrite: string[] };
  taskType?: string;
  /** Skill IDs assigned to the task — included in the hash so affinity-on cache is correct. */
  assignedSkills?: string[];
}

export interface CachedResult {
  agentId: string;
  score: number;
  reason: string;
  /** ConfidenceLevel string, stored for round-trip. */
  confidence?: string;
  /** Full reasoning lines from selectBestAgent for cache-hit passthrough. */
  reasoningLines?: string[];
}

interface CacheEntry {
  result: CachedResult;
  expiresAt: number;
  accessedAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── AgentSelectionCache ────────────────────────────────────────────

export class AgentSelectionCache {
  private _cache = new Map<string, CacheEntry>();
  private _maxEntries: number;
  private _defaultTtl: number;

  constructor(maxEntries: number = MAX_ENTRIES, defaultTtl: number = DEFAULT_TTL_MS) {
    this._maxEntries = maxEntries;
    this._defaultTtl = defaultTtl;
  }

  /**
   * Generate a deterministic hash/signature from a task.
   */
  taskSignature(task: TaskSignatureInput): string {
    const parts = [
      task.title.toLowerCase().trim(),
      task.description.toLowerCase().trim(),
      task.scope.directories.slice().sort().join(','),
      task.scope.filesWrite.slice().sort().join(','),
      task.taskType ?? '',
      (task.assignedSkills ?? []).slice().sort().join(','),
    ];
    return this._simpleHash(parts.join('|'));
  }

  /**
   * Cache a selection result for a task signature.
   */
  cache(signature: string, result: CachedResult, ttl?: number): void {
    const now = Date.now();
    const effectiveTtl = ttl ?? this._defaultTtl;

    // Evict if at capacity
    if (this._cache.size >= this._maxEntries && !this._cache.has(signature)) {
      this._evictLru();
    }

    this._cache.set(signature, {
      result,
      expiresAt: now + effectiveTtl,
      accessedAt: now,
    });
  }

  /**
   * Get a cached result by signature. Returns undefined if miss or expired.
   */
  get(signature: string): CachedResult | undefined {
    const entry = this._cache.get(signature);
    if (!entry) return undefined;

    const now = Date.now();
    if (now >= entry.expiresAt) {
      this._cache.delete(signature);
      return undefined;
    }

    entry.accessedAt = now;
    return entry.result;
  }

  /**
   * Invalidate all entries for a specific agent.
   */
  invalidate(agentId: string): number {
    let count = 0;
    for (const [sig, entry] of this._cache) {
      if (entry.result.agentId === agentId) {
        this._cache.delete(sig);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this._cache.clear();
  }

  /**
   * Get current cache size.
   */
  get size(): number {
    return this._cache.size;
  }

  /**
   * Check if a signature is cached and not expired.
   */
  has(signature: string): boolean {
    return this.get(signature) !== undefined;
  }

  /**
   * Get all cached signatures.
   */
  keys(): string[] {
    // Clean expired entries first
    this._purgeExpired();
    return [...this._cache.keys()];
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private _simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `sig_${(hash >>> 0).toString(36)}`;
  }

  private _evictLru(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this._cache.delete(oldestKey);
    }
  }

  private _purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this._cache) {
      if (now >= entry.expiresAt) {
        this._cache.delete(key);
      }
    }
  }
}
