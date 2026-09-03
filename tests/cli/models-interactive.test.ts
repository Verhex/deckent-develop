// tests/cli/models-interactive.test.ts
// ═══ CLI-INTERACTIVE-001 — `deckent models activate|deactivate` choose interactively ═══
//
// Owner decision (2026-09-03): the CLI's selection commands offer the same
// numbered choice the Terminal offers. `activate` / `deactivate` take an
// optional model and provider; on an interactive terminal a missing value is
// asked through the shared prompt-choice primitive (the SAME picker rows and
// labels the Terminal renders); off a terminal a missing value is a typed
// error — never a hang. The picker core is Ink-free so the plain CLI never
// loads Ink for a list. Hermetic (source scans + catalog).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { memoryCatalogMessage, CLI_MEMORY_CATALOG_MESSAGES } from '../../src/cli/helpers/message-catalog/cli-memory-catalog.js';

const ROOT = join(__dirname, '..', '..');

describe('models.ts wiring', () => {
  const src = readFileSync(join(ROOT, 'src/cli/commands/models.ts'), 'utf-8');
  it('activate and deactivate take an optional model and provider and resolve them through the shared choice flow', () => {
    expect((src.match(/\.argument\('\[model\]'/g) ?? []).length).toBe(2);
    expect((src.match(/\.option\('--provider <name>'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/requiredOption\('--provider/);
    expect(src).toMatch(/resolveActivationTarget\(/);
    expect(src).toMatch(/chooseFromSpec\(/);
    expect(src).toMatch(/stdinIsInteractive\(\)/);
    expect(src).toMatch(/out\('missing_args'/);
  });
});

describe('catalog rows', () => {
  it('the interactive rows exist in en and tr', () => {
    for (const suffix of ['choose_provider', 'choose_model', 'missing_args', 'cancelled', 'choice_not_found', 'no_catalog_models']) {
      const row = CLI_MEMORY_CATALOG_MESSAGES[`cli.memcat.models.out.${suffix}`] as Record<string, string> | undefined;
      expect(row, suffix).toBeDefined();
      expect(row!['en']?.length ?? 0).toBeGreaterThan(0);
      expect(row!['tr']?.length ?? 0).toBeGreaterThan(0);
    }
    expect(memoryCatalogMessage('cli.memcat.models.out.missing_args', 'en', { verb: 'activate' })).toContain('deckent models activate <model> --provider <name>');
  });
});

describe('the picker core stays Ink-free', () => {
  it('picker.ts takes its cell helpers from cursor-model, not from the Ink status row', () => {
    const picker = readFileSync(join(ROOT, 'src/cli/repl/picker.ts'), 'utf-8');
    expect(picker).not.toMatch(/status-row/);
    expect(picker).toMatch(/from '\.\/cursor-model\.js'/);
    const cursorModel = readFileSync(join(ROOT, 'src/cli/repl/cursor-model.ts'), 'utf-8');
    expect(cursorModel).not.toMatch(/from 'ink'/);
    expect(cursorModel).toMatch(/export function truncateEnd/);
  });
});
