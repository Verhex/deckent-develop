import type { ResolvedConfig, SprintResult, TaskResult } from '../../core/types.js';
import type { MemoryStore } from '../../core/memory-store.js';
export type { SprintResult } from '../../core/types.js';

// ─── DocUpdater ─────────────────────────────────────────────────────
export interface DocUpdateContext {
  projectRoot: string;
  sprintResult: SprintResult;
  config: ResolvedConfig;
  isInternalProject: boolean;
  /** Memory V2 DB store. When provided, generators use DB-first reads instead of .md files. */
  store?: MemoryStore;
  /**
   * Optional task results captured at sprint finalize. Updaters that need to
   * read worker-authored notes (e.g. changelog category prefixes) consume this
   * array when available; pass-through stays backward compatible when omitted.
   */
  results?: TaskResult[];
}

export interface DocUpdateResult {
  file: string;
  updated: boolean;
  reason?: string;
}

export interface DocUpdater {
  name: string;
  tier: 1 | 2 | 3;
  internal: boolean;
  targetFile: string;
  shouldRun(ctx: DocUpdateContext): boolean;
  run(ctx: DocUpdateContext): DocUpdateResult;
}
