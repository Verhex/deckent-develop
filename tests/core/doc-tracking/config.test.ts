import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocTrackingConfig } from '../../../src/core/doc-tracking/config.js';
import { DEFAULT_DOC_TRACKING_CONFIG } from '../../../src/core/doc-tracking/types.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('loadDocTrackingConfig', () => {
  it('returns defaults when docs.json is absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-'));
    const cfg = loadDocTrackingConfig(dir);
    expect(cfg.defaultRank).toBe(DEFAULT_DOC_TRACKING_CONFIG.defaultRank);
    expect(cfg.trackIgnore).toContain('node_modules/**');
  });
  it('merges a tracking block from .deckent/settings/docs.json over defaults', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-'));
    mkdirSync(join(dir, '.deckent/settings'), { recursive: true });
    writeFileSync(join(dir, '.deckent/settings/docs.json'),
      JSON.stringify({ tracking: { defaultRank: 7, rankMap: { 'x/**': 3 } } }));
    const cfg = loadDocTrackingConfig(dir);
    expect(cfg.defaultRank).toBe(7);
    expect(cfg.rankMap['x/**']).toBe(3);
    // unspecified fields fall back to defaults
    expect(cfg.scoring.criticalAt).toBe(80);
  });
});
