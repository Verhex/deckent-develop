import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DOC_TRACKING_CONFIG, type DocTrackingConfig } from './types.js';

export function loadDocTrackingConfig(root: string): DocTrackingConfig {
  const d = DEFAULT_DOC_TRACKING_CONFIG;
  let tracking: Partial<DocTrackingConfig> = {};
  try {
    const raw = readFileSync(join(root, '.deckent/settings/docs.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { tracking?: Partial<DocTrackingConfig> };
    tracking = parsed.tracking ?? {};
  } catch {
    // missing/invalid → defaults
  }
  return {
    rankMap: { ...d.rankMap, ...(tracking.rankMap ?? {}) },
    defaultRank: tracking.defaultRank ?? d.defaultRank,
    trackIgnore: tracking.trackIgnore ?? d.trackIgnore,
    noFrontmatter: tracking.noFrontmatter ?? d.noFrontmatter,
    scoring: { ...d.scoring, ...(tracking.scoring ?? {}) },
    sizeCapBytes: tracking.sizeCapBytes ?? d.sizeCapBytes,
  };
}
