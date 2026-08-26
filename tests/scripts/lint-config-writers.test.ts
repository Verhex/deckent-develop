import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { checkConfigWriters, inspectConfigWriterSource } from '../../scripts/lint-config-writers.mjs';

const roots: string[] = [];

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-config-writers-gate-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('lint-config-writers gate', () => {
  it('flags a direct writeFileSync to a config-family identifier (fail-closed)', () => {
    const root = makeTree({
      'src/bad.ts': [
        "import { writeFileSync } from 'node:fs';",
        "import { PROJECT_CONFIG_PATH } from './core/constants.js';",
        'const configPath = PROJECT_CONFIG_PATH;',
        "writeFileSync(configPath, '{}');",
      ].join('\n'),
    });
    const result = checkConfigWriters(root);
    expect(result.ok).toBe(false);
    expect(result.fresh).toHaveLength(1);
    expect(result.fresh[0].code).toBe('CONFIG_DIRECT_WRITE');
    expect(result.fresh[0].file).toBe('src/bad.ts');
    expect(result.fresh[0].line).toBe(4);
  });

  it('flags an inline config.json literal target', () => {
    const problems = inspectConfigWriterSource(
      "writeFileSync('.deckent/config.json', payload);\n",
      'src/inline.ts',
    );
    expect(problems).toHaveLength(1);
  });

  it('does not flag the cost-config/docs-config families (segment boundary)', () => {
    const root = makeTree({
      'src/cost.ts': [
        "const configPath = join(root, '.deckent', 'cost-config.json');",
        'writeFileSync(configPath, data);',
      ].join('\n'),
      'src/docs.ts': [
        "const p = join(root, '.deckent', 'settings', 'docs-config.json');",
        'writeFileSync(p, data);',
      ].join('\n'),
    });
    expect(checkConfigWriters(root).ok).toBe(true);
  });

  it('exempts the authority module interior', () => {
    const problems = inspectConfigWriterSource(
      "writeFileSync('.deckent/config.json', payload);\n",
      'src/core/config-write-authority.ts',
    );
    expect(problems).toHaveLength(0);
  });

  it('does not flag unrelated writers or comment lines', () => {
    const root = makeTree({
      'src/fine.ts': [
        "// writeFileSync(configPath, x) — yorumda örnek, çağrı değil",
        "const configPath = join(root, '.deckent', 'config.json');",
        'const other = join(root, "notes.json");',
        'writeFileSync(other, data);',
      ].join('\n'),
    });
    expect(checkConfigWriters(root).ok).toBe(true);
  });

  it('is green against the real repository (containment holds)', () => {
    // Gerçek src ağacı authority-only olmalı — sprint-680 + el-kablolama sonucu.
    const result = checkConfigWriters(process.cwd());
    expect(result.fresh).toEqual([]);
    expect(result.stale).toEqual([]);
  });
});
