import { matchGlob } from './glob.js';
import type { DocFrontmatter, DocTrackingConfig } from './types.js';

export function resolveRank(path: string, fm: DocFrontmatter, config: DocTrackingConfig): number {
  if (typeof fm.doc_rank === 'number' && Number.isInteger(fm.doc_rank) && fm.doc_rank >= 0) {
    return fm.doc_rank;
  }
  let best: { rank: number; spec: number } | null = null;
  for (const [pattern, rank] of Object.entries(config.rankMap)) {
    if (matchGlob(path, pattern)) {
      const spec = pattern.replace(/\*/g, '').length; // more literal chars = more specific
      if (!best || spec > best.spec) best = { rank, spec };
    }
  }
  return best ? best.rank : config.defaultRank;
}
