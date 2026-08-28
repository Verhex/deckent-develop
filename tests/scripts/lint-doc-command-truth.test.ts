// tests/scripts/lint-doc-command-truth.test.ts
// MASTER 3356 — the onboarding documents must not invent CLI commands.
//
// `deckent agents` and `deckent skills` both sat in DECKENT.md while the real
// commands were `deckent agent` and `deckent skill`; nothing caught it because
// no gate held the docs to the CLI surface registry. These pins fix the shape
// of that gate, including the boundary that keeps it honest: English prose
// legitimately uses the product name as a verb ("deckent snapshots the plan
// state"), so only code spans are checked.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AUDITED_DOCS,
  checkDocCommandTruth,
  extractDocumentedCommands,
} from '../../scripts/lint-doc-command-truth.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A fixture repo carrying only what the gate reads. */
function makeRepo(docText: string, registryNames: readonly string[] = ['agent', 'skill']): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-doc-truth-'));
  roots.push(root);
  const registryPath = join(root, 'src/cli/surface-registry.ts');
  mkdirSync(dirname(registryPath), { recursive: true });
  const rows = registryNames.map(name => `  ['${name}', 'system', 'cli.${name}.desc'],`).join('\n');
  writeFileSync(
    registryPath,
    `const VISIBLE_ROWS = [\n${rows}\n] as const;\nconst ADVANCED_ROWS = [] as const;\nconst DEPRECATED_ROWS = [] as const;\n`,
    'utf8',
  );
  writeFileSync(join(root, 'DECKENT.md'), docText, 'utf8');
  return root;
}

describe('doc ↔ CLI surface truth gate', () => {
  it('flags a command that the registry does not know', () => {
    const root = makeRepo('- live list: `deckent agents`\n');
    const { violations } = checkDocCommandTruth(root);
    expect(violations).toEqual([
      { file: 'DECKENT.md', line: 1, command: 'agents' },
    ]);
  });

  it('accepts a command the registry knows', () => {
    const root = makeRepo('- live list: `deckent agent list`\n');
    expect(checkDocCommandTruth(root).violations).toEqual([]);
  });

  it('never flags prose that uses the product name as a verb', () => {
    const root = makeRepo('5. Snapshot Start — deckent snapshots the plan state and spawns workers.\n');
    expect(checkDocCommandTruth(root).violations).toEqual([]);
  });

  it('checks fenced code blocks as code', () => {
    const root = makeRepo('```bash\ndeckent skills\n```\n');
    expect(checkDocCommandTruth(root).violations).toEqual([
      { file: 'DECKENT.md', line: 2, command: 'skills' },
    ]);
  });

  it('does not treat an option as a subcommand', () => {
    const root = makeRepo('- run `deckent --help` first\n');
    expect(checkDocCommandTruth(root).violations).toEqual([]);
  });

  it('reports every audited document that exists', () => {
    const root = makeRepo('- `deckent agent list`\n');
    expect(checkDocCommandTruth(root).checked).toBe(1);
    expect(AUDITED_DOCS).toContain('DECKENT.md');
  });

  it('extracts mentions with their line numbers', () => {
    expect(extractDocumentedCommands('a\n- `deckent status` here\n')).toEqual([
      { command: 'status', line: 2 },
    ]);
  });
});
