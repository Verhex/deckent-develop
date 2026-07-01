// CFG-1 (row 209) — regression suite for the claim "legacy `mode` config-set blokajı":
// a legacy `mode` alias (max_plan / max5x_plan / pro_plan / unlimited) left on disk from an
// old deckent install must not block `deckent config set <unrelated-key> <value>`.
//
// Disk-verify finding (see .tasks/task-352-006.plan): the claim is ALREADY fixed. The
// routing_engine v1→v2 coercion pattern (config.ts) has already been mirrored onto `mode` in
// three places — loadConfig() read-time coerce, validatePartialConfig() write-time coerce
// (commit 38185e8b, sprint-332, explicitly labeled "CFG-1"), and config-migration.ts's
// migrateConfig() on-disk persist. This suite locks that behavior in with the one case that
// was previously untested: a legacy alias flowing through validatePartialConfig / the
// `config set` write path / loadConfig / migrateConfig.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validatePartialConfig,
  resolveMode,
  MODE_ALIASES,
  ConfigValidationError,
  loadConfig,
  clearConfigCache,
  createDefaultConfig,
} from '../../src/core/config.js';
import { migrateConfig, needsMigration } from '../../src/core/config-migration.js';
import type { DeckentConfig, PlanMode } from '../../src/core/types.js';

const LEGACY_ALIASES = Object.keys(MODE_ALIASES) as Array<keyof typeof MODE_ALIASES>;

const dirs: string[] = [];
function tmpProjectWithConfig(cfg: Record<string, unknown>): { dir: string; configPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'cfg1-legacy-mode-'));
  dirs.push(dir);
  const deckentDir = join(dir, '.deckent');
  mkdirSync(deckentDir, { recursive: true });
  const configPath = join(deckentDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
  return { dir, configPath };
}

afterEach(() => {
  clearConfigCache();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ─── 1. validatePartialConfig — legacy mode + unrelated key ───────────────

describe('CFG-1: validatePartialConfig coerces a legacy `mode` alias in place', () => {
  for (const alias of LEGACY_ALIASES) {
    const canonical = MODE_ALIASES[alias];

    it(`does not throw for legacy mode '${alias}' combined with an unrelated key`, () => {
      const partial: Partial<DeckentConfig> = {
        mode: alias as PlanMode,
        spawn_backend: 'tmux',
      };
      expect(() => validatePartialConfig(partial)).not.toThrow();
    });

    it(`mutates partial.mode from '${alias}' to canonical '${canonical}' in place`, () => {
      const partial: Partial<DeckentConfig> = { mode: alias as PlanMode };
      validatePartialConfig(partial);
      expect(partial.mode).toBe(canonical);
    });
  }

  it('still rejects a genuinely invalid mode (not a known legacy alias)', () => {
    expect(() =>
      validatePartialConfig({ mode: 'not_a_real_mode' as PlanMode }),
    ).toThrow(ConfigValidationError);
  });

  it('leaves an already-canonical mode untouched', () => {
    const partial: Partial<DeckentConfig> = { mode: 'balanced' };
    validatePartialConfig(partial);
    expect(partial.mode).toBe('balanced');
  });
});

// ─── 2. tmpdir end-to-end "config set" simulation ──────────────────────────
//
// src/cli/commands/config.ts is read-scope only for this task (not writable), so this
// replicates its `config set <key> <value>` logic exactly using only exported core
// functions: read existing JSON → mutate the target key → validatePartialConfig(existing)
// → writeFileSync. That is the real code path in registerConfig()'s `set` action.

function simulateConfigSet(configPath: string, key: string, value: unknown): void {
  const existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  existing[key] = value;
  validatePartialConfig(existing as Partial<DeckentConfig>);
  writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
}

describe('CFG-1: `config set` succeeds on a legacy-mode fixture (tmpdir)', () => {
  for (const alias of LEGACY_ALIASES) {
    const canonical = MODE_ALIASES[alias];

    it(`sets an unrelated key without throwing when on-disk mode is legacy '${alias}'`, () => {
      const { configPath } = tmpProjectWithConfig({ mode: alias, language: 'en' });
      expect(() => simulateConfigSet(configPath, 'spawn_backend', 'tmux')).not.toThrow();
    });

    it(`persists canonical mode '${canonical}' on disk after the set (read-time coerce persisted)`, () => {
      const { configPath } = tmpProjectWithConfig({ mode: alias, language: 'en' });
      simulateConfigSet(configPath, 'spawn_backend', 'tmux');
      const written = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(written['mode']).toBe(canonical);
      expect(written['spawn_backend']).toBe('tmux');
    });
  }
});

// ─── 3. loadConfig — read-time coercion ────────────────────────────────────

describe('CFG-1: loadConfig resolves a legacy `mode` alias at read time', () => {
  for (const alias of LEGACY_ALIASES) {
    const canonical = MODE_ALIASES[alias];

    it(`resolves project config mode '${alias}' to '${canonical}'`, async () => {
      const { dir } = tmpProjectWithConfig({ mode: alias });
      if (alias === 'unlimited') {
        process.env['ANTHROPIC_API_KEY'] = 'test-key-cfg1';
      }
      try {
        const resolved = await loadConfig(dir, { force: true });
        expect(resolved.mode).toBe(canonical);
      } finally {
        if (alias === 'unlimited') delete process.env['ANTHROPIC_API_KEY'];
      }
    });
  }
});

// ─── 4. migrateConfig — on-disk persistence ────────────────────────────────
//
// config-migration.ts's LEGACY_MODE_MAP covers max_plan/max5x_plan/pro_plan (all in write
// scope here are read-only imports; config-migration.ts itself is out of this task's write
// scope). This locks in the "migrateConfig kalıcılaştır" (migrate persists) half of the
// goCriteria for the three aliases it supports today.

const MIGRATE_SUPPORTED_ALIASES: Array<[string, string]> = [
  ['max_plan', 'performance'],
  ['max5x_plan', 'balanced'],
  ['pro_plan', 'economic'],
];

describe('CFG-1: migrateConfig rewrites a legacy `mode` on disk', () => {
  for (const [alias, canonical] of MIGRATE_SUPPORTED_ALIASES) {
    it(`flags mode '${alias}' as needing migration`, () => {
      const { configPath } = tmpProjectWithConfig({ mode: alias, modes: {} });
      const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(needsMigration(raw)).toBe(true);
    });

    it(`migrateConfig renames '${alias}' → '${canonical}' and persists it`, () => {
      const { configPath } = tmpProjectWithConfig({ mode: alias, modes: {} });
      const result = migrateConfig(configPath);
      expect(result.migrated).toBe(true);
      expect(result.renamedFields).toContain(`mode: ${alias} → ${canonical}`);

      const written = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(written['mode']).toBe(canonical);
    });
  }
});

// ─── 5. Known gap (documented, not fixed here — out of write scope) ───────
//
// config-migration.ts's LEGACY_MODE_MAP / needsMigration's legacyModes array only cover 3 of
// config.ts's 4 MODE_ALIASES entries — 'unlimited' → 'api' is missing. resolveMode/loadConfig/
// validatePartialConfig all resolve 'unlimited' correctly at runtime (sections 1-3 above), so
// `config set` and `loadConfig` are NOT blocked. But `deckent config migrate` (and the
// auto-migrate-on-load path gated by needsMigration) will never rewrite an on-disk
// `mode: "unlimited"` to `"api"`. This test documents CURRENT behavior so the gap is
// regression-visible; see .result notes for the follow-up (fix belongs in
// config-migration.ts, which is outside this task's write scope).
describe("CFG-1: known gap — migrateConfig does not cover the 'unlimited' alias", () => {
  it("does not flag mode 'unlimited' as needing migration (config-migration.ts gap)", () => {
    // Start from a COMPLETE default config (no missing fields) so the only thing
    // `needsMigration` could flag is the legacy-mode-alias check itself, isolating the gap
    // from unrelated missing-field noise.
    const complete = {
      ...(createDefaultConfig() as unknown as Record<string, unknown>),
      mode: 'unlimited',
    };
    expect(needsMigration(complete)).toBe(false);
  });

  it("migrateConfig leaves 'unlimited' unchanged on disk when no other field is missing", () => {
    const { configPath, dir } = tmpProjectWithConfig({ mode: 'unlimited', modes: {} });
    void dir;
    // resolveMode already covers 'unlimited', confirming runtime correctness independent
    // of the migrate-persist gap being documented here.
    expect(resolveMode('unlimited')).toBe('api');

    // migrateConfig still fills OTHER missing default fields (routing_engine etc.), so
    // `migrated` can be true — the assertion that matters is that `mode` itself is left as
    // the legacy literal, not rewritten to 'api'.
    expect(existsSync(configPath)).toBe(true);
    migrateConfig(configPath);
    const written = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    expect(written['mode']).toBe('unlimited');
  });
});
