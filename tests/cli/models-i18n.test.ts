// tests/cli/models-i18n.test.ts
// ═══ TERMINAL-I18N-MODELS-001 — `deckent models` output is catalog-backed and theme-mapped ═══
//
// Owner decision (2026-09-03): models.ts printed English literals and raw
// SGR color maps. Every user-facing sentence is now a `cli.memcat.models.out.*`
// row (en + tr) and every color a palette role through theme.ts (the same
// gate + host-theme mapping the Terminal uses). Hermetic (catalog + source scan
// + pure helpers).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderModelsTable, sourceBadge, colorTier } from '../../src/cli/commands/models.js';
import { memoryCatalogMessage, CLI_MEMORY_CATALOG_MESSAGES as MEMORY_CATALOG_MESSAGES } from '../../src/cli/helpers/message-catalog/cli-memory-catalog.js';
import type { ModelDefinition } from '../../src/core/model-registry.js';

const ROOT = join(__dirname, '..', '..');
const ENV_KEYS = ['NO_COLOR', 'FORCE_COLOR', 'COLORTERM', 'COLORFGBG', 'TERM'] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env['FORCE_COLOR'] = '1';
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const OUT_KEYS = Object.keys(MEMORY_CATALOG_MESSAGES).filter((k) => k.startsWith('cli.memcat.models.out.'));

describe('catalog rows', () => {
  it('every models output row exists in en and tr and the two differ where the text is prose', () => {
    expect(OUT_KEYS.length).toBeGreaterThanOrEqual(30);
    for (const key of OUT_KEYS) {
      const row = MEMORY_CATALOG_MESSAGES[key] as Record<string, string>;
      expect(row['en']?.length ?? 0, key).toBeGreaterThan(0);
      expect(row['tr']?.length ?? 0, key).toBeGreaterThan(0);
    }
    expect(memoryCatalogMessage('cli.memcat.models.out.no_models', 'tr')).not.toBe(memoryCatalogMessage('cli.memcat.models.out.no_models', 'en'));
  });
});

describe('models.ts source', () => {
  const src = readFileSync(join(ROOT, 'src/cli/commands/models.ts'), 'utf-8');
  it('carries no raw SGR color literal and no dim', () => {
    expect(src).not.toMatch(/\\x1b\[(?:\d+;)*(?:3[0-7]|9[0-7]|38;[25];[\d;]+|1|2)m/);
    expect(src).not.toMatch(/\bcolor\(/);
  });
  it('carries no English sentence inside a print() call (rows come from the catalog)', () => {
    const prints = src.split('\n').filter((l) => /\bprint\(/.test(l));
    for (const line of prints) {
      // A literal segment (before any `${…}` interpolation) must not carry two
      // English words — prose belongs to the catalog; catalog KEYS are allowed.
      const literalHead = line.replace(/^.*?\bprint\(/, '').split('${')[0] ?? '';
      expect(literalHead, line).not.toMatch(/[A-Za-z]{3,} [a-z]{2,}/);
      expect(line, line).not.toMatch(/'(Catalog refreshed|Model Catalog|No models found\.|No policy recorded|Model Activation|Active Execution Set)/);
    }
  });
  it('the provider list quoted in --provider help comes from the registry, not a literal map', () => {
    expect(src).toMatch(/modelRegistry\.getAllProviders\(\)/);
    expect(src).not.toMatch(/PROVIDER_COLORS/);
  });
});

describe('helpers', () => {
  const def = (over: Partial<ModelDefinition>): ModelDefinition =>
    ({ id: 'm-1', apiId: 'm-1', provider: 'claude', tier: 'premium', status: 'ga', contextWindow: 200_000, costPerMillion: { input: 1, output: 2 }, ...over } as unknown as ModelDefinition);
  it('renderModelsTable localizes the empty message and the column headers', () => {
    expect(renderModelsTable([], 'en')).toContain('No models found.');
    expect(renderModelsTable([], 'tr')).toContain('Model bulunamadı.');
    expect(renderModelsTable([def({})], 'tr')).toContain('SAĞLAYICI');
    expect(renderModelsTable([def({})], 'en')).toContain('PROVIDER');
  });
  it('sourceBadge and colorTier paint through palette roles (94 for code/info, never dim)', () => {
    expect(sourceBadge('remote', 'tr')).toContain('canlı');
    expect(sourceBadge('bundled', 'en')).toBe('bundled'); // muted = default foreground in the host tier
    expect(colorTier('premium')).toContain('\x1b[94m');
    expect(colorTier('economy')).toContain('\x1b[33m');
    expect(colorTier('premium_plus')).not.toContain('\x1b[35m');
  });
});
