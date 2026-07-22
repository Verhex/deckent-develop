// Tests for scripts/lint-no-model-literal.mjs — the model-name string-literal
// ratchet gate (born-item 431-001). Model names may only live in
// src/core/model-registry.ts (the SSOT); any other site is grandfathered by the
// baseline or fails the gate.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  sliceRegistryArray,
  extractIdFields,
  deriveKnownModelIdsFromSource,
  deriveKnownModelIds,
  deriveLegacyModelAliasesFromSource,
  deriveLegacyModelAliases,
  extractModelLiteralSites,
  diffAgainstBaseline,
  isExplicitLegacyMigrationSite,
  scanSource,
  loadBaseline,
} from '../../scripts/lint-no-model-literal.mjs';

// A small, self-contained model-registry.ts fixture — mirrors the real file's
// shape (two `as const` arrays, one object literal per model, `id` + `apiId`
// fields) closely enough to exercise the text-parser without depending on the
// real (much larger) source.
const FIXTURE_REGISTRY = `
import type { ModelDefinition } from './model-registry-types.js';

export const LEGACY_MODEL_ALIASES = Object.freeze({
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-5',
  'gpt-5': 'gpt-5.5',
} as const);

export const BUILTIN_MODELS: readonly ModelDefinition[] = [
  {
    id: 'opus',
    apiId: 'claude-opus-4-8',
    provider: 'claude',
  },
  {
    id: 'sonnet',
    apiId: 'claude-sonnet-5',
    provider: 'claude',
  },
] as const;

export const CODEX_PARITY_MODELS: readonly ModelDefinition[] = [
  {
    id: 'gpt-5.5',
    apiId: 'gpt-5.5',
    provider: 'codex',
  },
] as const;
`;

describe('sliceRegistryArray + extractIdFields', () => {
  it('slices BUILTIN_MODELS and extracts only its id fields', () => {
    const slice = sliceRegistryArray(FIXTURE_REGISTRY, 'BUILTIN_MODELS');
    expect(slice).toContain("id: 'opus'");
    expect(extractIdFields(slice)).toEqual(['opus', 'sonnet']);
  });

  it('slices CODEX_PARITY_MODELS independently', () => {
    const slice = sliceRegistryArray(FIXTURE_REGISTRY, 'CODEX_PARITY_MODELS');
    expect(extractIdFields(slice)).toEqual(['gpt-5.5']);
  });

  it('never mistakes apiId for id — apiId has a capital I, so "id:" never occurs inside it', () => {
    const slice = sliceRegistryArray(FIXTURE_REGISTRY, 'BUILTIN_MODELS');
    const ids = extractIdFields(slice);
    expect(ids).not.toContain('claude-opus-4-8');
    expect(ids).not.toContain('claude-sonnet-5');
  });

  it('returns an empty string when the array marker is absent', () => {
    expect(sliceRegistryArray('export const OTHER = [];', 'BUILTIN_MODELS')).toBe('');
  });
});

describe('deriveKnownModelIdsFromSource', () => {
  it('unions ids from both registry arrays into one dictionary', () => {
    const ids = deriveKnownModelIdsFromSource(FIXTURE_REGISTRY);
    expect(ids).toEqual(new Set(['opus', 'sonnet', 'gpt-5.5']));
  });

  it('derives canonical API ids from the REAL model-registry.ts', () => {
    const ids = deriveKnownModelIds();
    for (const known of ['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-5', 'o3', 'gpt-5.5', 'gpt-5.6-sol']) {
      expect(ids.has(known), `expected known id "${known}"`).toBe(true);
    }
    expect(ids.has('opus')).toBe(false);
    expect(ids.has('sonnet')).toBe(false);
  });
});

describe('deriveLegacyModelAliasesFromSource', () => {
  it('derives migration-only alias keys separately from canonical ids', () => {
    expect(deriveLegacyModelAliasesFromSource(FIXTURE_REGISTRY)).toEqual(new Set(['opus', 'sonnet', 'gpt-5']));
  });

  it('reads the real compatibility table', () => {
    const aliases = deriveLegacyModelAliases();
    expect(aliases.has('opus')).toBe(true);
    expect(aliases.has('gpt-5')).toBe(true);
    expect(aliases.has('claude-opus-4-8')).toBe(false);
  });
});

describe('extractModelLiteralSites', () => {
  const knownIds = new Set(['opus', 'sonnet']);

  it('detects a real model-literal site', () => {
    const sites = extractModelLiteralSites(`const model = opts.model ?? 'sonnet';`, knownIds);
    expect(sites).toHaveLength(1);
    expect(sites[0].code).toContain("'sonnet'");
  });

  it('ignores the import line', () => {
    expect(extractModelLiteralSites(`import { opus } from './x.js';`, knownIds)).toHaveLength(0);
    expect(extractModelLiteralSites(`  sonnet,\n} from './y.js';`, knownIds)).toHaveLength(0);
  });

  it('ignores // and * comment lines', () => {
    expect(extractModelLiteralSites(`// defaults to 'opus' for safety`, knownIds)).toHaveLength(0);
    expect(extractModelLiteralSites(` * pass 'sonnet' to the CLI`, knownIds)).toHaveLength(0);
  });

  it('filters a single-line /** ... */ block comment', () => {
    expect(extractModelLiteralSites(`/** e.g. 'opus' or 'sonnet' */`, knownIds)).toHaveLength(0);
  });

  it('matches double-quote and interpolation-free backtick literals', () => {
    expect(extractModelLiteralSites(`const m = "opus";`, knownIds)).toHaveLength(1);
    expect(extractModelLiteralSites(`const m = \`opus\`;`, knownIds)).toHaveLength(1);
  });

  it('does NOT match a longer literal that merely contains a known id as a substring', () => {
    expect(extractModelLiteralSites(`const m = 'opus-preview';`, knownIds)).toHaveLength(0);
  });

  it('ignores real template-literal interpolation (not a bare string)', () => {
    expect(extractModelLiteralSites('const m = `model:${opus}`;', knownIds)).toHaveLength(0);
  });

  it('counts ONE site per line even when several known ids appear on it', () => {
    // Mirrors extractSpawnSyncCalls's boolean per-line gate (`.test()`, not a
    // match-counting loop) — a union type with several literals is one call site,
    // not N, so editing the line requires exactly one conscious --update.
    const sites = extractModelLiteralSites(`type M = 'opus' | 'sonnet';`, knownIds);
    expect(sites).toHaveLength(1);
  });
});

describe('diffAgainstBaseline', () => {
  const baseline = {
    sanctioned: [{ file: 'src/core/config.ts', code: "default_model: 'opus'," }],
  };

  it('passes when the scan equals the baseline', () => {
    const scan = [{ file: 'src/core/config.ts', code: "default_model: 'opus'," }];
    expect(diffAgainstBaseline(scan, baseline).newCalls).toHaveLength(0);
  });

  it('flags a NEW model-literal site', () => {
    const scan = [
      { file: 'src/core/config.ts', code: "default_model: 'opus'," },
      { file: 'src/core/new-file.ts', code: "const model = 'sonnet';" },
    ];
    const { newCalls } = diffAgainstBaseline(scan, baseline);
    expect(newCalls).toHaveLength(1);
    expect(newCalls[0].file).toBe('src/core/new-file.ts');
  });

  it('is count-based — a real duplicate line (e.g. two config presets both saying brain_model: \'opus\') only fails once it exceeds the baseline count', () => {
    const dupBaseline = {
      sanctioned: [{ file: 'src/core/config.ts', code: "brain_model: 'opus'," }],
    };
    const scanSameAsBaseline = [{ file: 'src/core/config.ts', code: "brain_model: 'opus'," }];
    expect(diffAgainstBaseline(scanSameAsBaseline, dupBaseline).newCalls).toHaveLength(0);

    const scanWithGenuineDuplicate = [
      { file: 'src/core/config.ts', code: "brain_model: 'opus'," },
      { file: 'src/core/config.ts', code: "brain_model: 'opus'," },
    ];
    // Both baselined together (--init grandfathers the real 2x duplicate) → clean.
    const dupBaselineBoth = {
      sanctioned: [
        { file: 'src/core/config.ts', code: "brain_model: 'opus'," },
        { file: 'src/core/config.ts', code: "brain_model: 'opus'," },
      ],
    };
    expect(diffAgainstBaseline(scanWithGenuineDuplicate, dupBaselineBoth).newCalls).toHaveLength(0);
    // A THIRD occurrence beyond the baselined two is new.
    const scanWithThird = [...scanWithGenuineDuplicate, { file: 'src/core/config.ts', code: "brain_model: 'opus'," }];
    expect(diffAgainstBaseline(scanWithThird, dupBaselineBoth).newCalls).toHaveLength(1);
  });
});

describe('isExplicitLegacyMigrationSite', () => {
  it('allows only switch-case input discriminators in the config migration boundary', () => {
    expect(isExplicitLegacyMigrationSite({
      file: 'src/core/config-migration.ts',
      code: "case 'sonnet':",
    })).toBe(true);
    expect(isExplicitLegacyMigrationSite({
      file: 'src/core/config-migration.ts',
      code: "const fallback = 'sonnet';",
    })).toBe(false);
    expect(isExplicitLegacyMigrationSite({
      file: 'src/core/config.ts',
      code: "case 'sonnet':",
    })).toBe(false);
  });
});

describe('scanSource excludes model-registry.ts', () => {
  let tmpRoot: string;

  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('never reports a site inside model-registry.ts itself, even though its own id fields would otherwise match', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-no-model-literal-'));
    const srcDir = join(tmpRoot, 'src');
    mkdirSync(join(srcDir, 'core'), { recursive: true });
    mkdirSync(join(srcDir, 'other'), { recursive: true });

    writeFileSync(
      join(srcDir, 'core', 'model-registry.ts'),
      `export const BUILTIN_MODELS = [\n  { id: 'opus', apiId: 'claude-opus-4-8' },\n] as const;\n`,
      'utf-8',
    );
    writeFileSync(join(srcDir, 'other', 'foo.ts'), `export const DEFAULT = 'opus';\n`, 'utf-8');

    const found = scanSource(srcDir, tmpRoot, new Set(['opus']));
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe('src/other/foo.ts');
  });
});

describe('live baseline is in sync (the committed gate is green)', () => {
  it('the checked-in baseline has no new model-name literal vs the live source tree', () => {
    // Regression: if a dev adds a new hardcoded model literal without --update, or
    // the baseline drifts, this fails here (mirroring `npm run lint:model-literal`).
    const { newCalls } = diffAgainstBaseline(scanSource(), loadBaseline());
    expect(newCalls, `new model literal sites: ${JSON.stringify(newCalls)}`).toHaveLength(0);
  });

  it('has no migration-only alias literal in runtime source', () => {
    const runtimeAliases = scanSource(undefined, undefined, deriveLegacyModelAliases())
      .filter((site) => !isExplicitLegacyMigrationSite(site));
    expect(runtimeAliases).toEqual([]);
  });

  it('model-registry.ts is never scanned as a violation source', () => {
    const found = scanSource();
    expect(found.some((e) => e.file === 'src/core/model-registry.ts')).toBe(false);
  });
});
