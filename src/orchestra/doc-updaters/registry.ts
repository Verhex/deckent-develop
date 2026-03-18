import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

const updaters: DocUpdater[] = [];

export function registerUpdater(u: DocUpdater): void {
  updaters.push(u);
}

export function getRegisteredUpdaters(): readonly DocUpdater[] {
  return updaters;
}

export function clearUpdaters(): void {
  updaters.length = 0;
}

export function runAllUpdaters(ctx: DocUpdateContext): DocUpdateResult[] {
  return updaters.map(u => {
    if (!u.shouldRun(ctx)) {
      return { file: u.targetFile, updated: false, reason: 'skipped_config' };
    }
    try {
      return u.run(ctx);
    } catch {
      return { file: u.targetFile, updated: false, reason: 'error' };
    }
  });
}
