import type { ResolvedConfig, SprintResult } from '../../core/types.js';
export type { SprintResult } from '../../core/types.js';

// ─── DocUpdater ─────────────────────────────────────────────────────
export interface DocUpdateContext {
  projectRoot: string;
  sprintResult: SprintResult;
  config: ResolvedConfig;
  isInternalProject: boolean;
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
