// ─── Lazy Loader ────────────────────────────────────────────────────────────
// Generic lazy loading utility. Triggers load on first property access.
// Pure logic, no fs.

// ─── Types ──────────────────────────────────────────────────────────

export type LoaderFn<T> = () => T;

export interface LazyHandle<T> {
  value: T;
  isLoaded: boolean;
  reset: () => void;
}

export interface PreloadConfig {
  /** Keys to preload */
  keys: string[];
  /** Whether to preload in parallel (if async loaders) */
  parallel: boolean;
}

// ─── lazyLoad ───────────────────────────────────────────────────────

/**
 * Create a lazy-loaded value. The loader is called on first access to `.value`.
 * Subsequent accesses return the cached result.
 */
export function lazyLoad<T>(loader: LoaderFn<T>): LazyHandle<T> {
  let loaded = false;
  let cached: T | undefined;

  return {
    get value(): T {
      if (!loaded) {
        cached = loader();
        loaded = true;
      }
      return cached as T; // narrowed: loader() assigns cached before loaded=true
    },
    get isLoaded(): boolean {
      return loaded;
    },
    reset(): void {
      loaded = false;
      cached = undefined;
    },
  };
}

// ─── LazyMap ────────────────────────────────────────────────────────

/**
 * A map of lazy-loaded values. Each key has its own loader.
 */
export class LazyMap<T> {
  private _loaders = new Map<string, LoaderFn<T>>();
  private _handles = new Map<string, LazyHandle<T>>();

  /**
   * Register a loader for a key.
   */
  register(key: string, loader: LoaderFn<T>): void {
    this._loaders.set(key, loader);
    // Reset any existing handle
    this._handles.delete(key);
  }

  /**
   * Get the value for a key. Triggers lazy load on first access.
   * Returns undefined if key is not registered.
   */
  get(key: string): T | undefined {
    if (!this._loaders.has(key)) return undefined;

    let handle = this._handles.get(key);
    if (!handle) {
      const loader = this._loaders.get(key);
      if (!loader) return undefined; // should not happen: has() checked above
      handle = lazyLoad(loader);
      this._handles.set(key, handle);
    }

    return handle.value;
  }

  /**
   * Check if a key has been loaded.
   */
  isLoaded(key: string): boolean {
    const handle = this._handles.get(key);
    return handle?.isLoaded ?? false;
  }

  /**
   * Reset a specific key so it will be reloaded on next access.
   */
  reset(key: string): void {
    this._handles.delete(key);
  }

  /**
   * Reset all keys.
   */
  resetAll(): void {
    this._handles.clear();
  }

  /**
   * Preload specified keys (or all if none specified).
   */
  preload(keys?: string[]): number {
    const keysToLoad = keys ?? [...this._loaders.keys()];
    let count = 0;

    for (const key of keysToLoad) {
      if (this._loaders.has(key)) {
        this.get(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Check if a key is registered.
   */
  has(key: string): boolean {
    return this._loaders.has(key);
  }

  /**
   * Get all registered keys.
   */
  keys(): string[] {
    return [...this._loaders.keys()];
  }

  /**
   * Get the number of registered loaders.
   */
  get size(): number {
    return this._loaders.size;
  }
}
