// ─── AGENT-DISCOVERY-CENSUS (Task 521-007, row 7011 / S0) ────────────────
//
// The agent-catalog authority design §1 records every current discovery path.
// This test is deliberately a scanner-in-test-file: task authority permits this
// governance test only, and the census must remain derived from the real src/
// tree. The exact known set is pinned in both directions: an unregistered new
// scan and a removed known scan each fail loudly.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve, sep } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..', '..');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const tmpDirs: string[] = [];

export type DiscoverySiteKind = 'agents-dir-definition' | 'raw-agent-directory-read';

export interface DiscoverySite {
  kind: DiscoverySiteKind;
  path: string;
  line: number;
}

function walkSourceFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (SOURCE_EXTENSIONS.has(extname(entry.name)) && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }
  walk(dir);
  return files.sort();
}

function lineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function siteKey(site: DiscoverySite): string {
  return `${site.kind}:${site.path}:${site.line}`;
}

/**
 * Finds the two source forms governed by S0:
 * - each module-local `AGENTS_DIR` definition (the §1.2 eleven definitions), and
 * - filesystem directory reads whose bounded source window names an agent layer.
 *
 * The read window deliberately includes multi-line `readdirSync(join(...))`
 * expressions while requiring both a directory-read API and an agent-layer
 * token. It therefore does not treat ordinary mentions of an agent path as a
 * discovery site.
 */
export function findAgentDiscoverySites(root: string): DiscoverySite[] {
  const sites: DiscoverySite[] = [];
  for (const file of walkSourceFiles(join(root, 'src'))) {
    const source = readFileSync(file, 'utf8');
    const path = relative(root, file).split(sep).join('/');

    for (const match of source.matchAll(/\b(?:const|let)\s+AGENTS_DIR\s*=/g)) {
      sites.push({ kind: 'agents-dir-definition', path, line: lineNumber(source, match.index ?? 0) });
    }

    for (const match of source.matchAll(/\b(?:readdirSync|readdir|globSync)\s*\(/g)) {
      const index = match.index ?? 0;
      const window = source.slice(Math.max(0, index - 240), index + 520);
      const namesAgentLayer = /(?:AGENTS_DIR|TEMP_AGENTS_DIR|['"`]\.deckent\/agents|['"`]\.tasks\/agents|builtins[\\/]agents|DECKENT_DIR[\s\S]{0,180}['"`]agents)/;
      if (namesAgentLayer.test(window)) {
        sites.push({ kind: 'raw-agent-directory-read', path, line: lineNumber(source, index) });
      }
    }
  }
  return sites.sort((left, right) => siteKey(left).localeCompare(siteKey(right)));
}

function assertExactCensus(actual: readonly DiscoverySite[], expected: readonly string[]): void {
  const actualKeys = actual.map(siteKey).sort();
  expect(actualKeys, [
    'Agent-discovery census drifted.',
    'New entries require an explicit census decision; removed entries require deleting their pin.',
  ].join(' ')).toEqual([...expected].sort());
}

// Current source census from the §1 inventory. This intentionally remains a
// test-local constant rather than a generated checked-in artifact: it makes any
// discovery-surface drift a visible code-review decision in this governance gate.
const KNOWN_AGENT_DISCOVERY_SITES = [
  'agents-dir-definition:src/agents/agent-genealogy.ts:25',
  'agents-dir-definition:src/agents/agent-retirement.ts:37',
  'agents-dir-definition:src/agents/prompt-evolution.ts:35',
  'agents-dir-definition:src/agents/prompt-rollback.ts:23',
  'agents-dir-definition:src/agents/prompt-version.ts:18',
  'agents-dir-definition:src/cli/commands/agent.ts:48',
  'agents-dir-definition:src/cli/commands/sync.ts:33',
  'agents-dir-definition:src/core/agent-manifest-sync.ts:22',
  'agents-dir-definition:src/core/agent-pool.ts:274',
  'agents-dir-definition:src/core/agent-prompt-sync.ts:23',
  'agents-dir-definition:src/mcp/resources/agents.ts:6',
  'agents-dir-definition:src/orchestra/temp-agent-generator.ts:16',
  'raw-agent-directory-read:src/cli/commands/sync.ts:600',
  'raw-agent-directory-read:src/core/agent-pool.ts:885',
  'raw-agent-directory-read:src/core/agent-pool.ts:923',
  'raw-agent-directory-read:src/core/agent-pool.ts:951',
  'raw-agent-directory-read:src/mcp/tools/help.ts:131',
  'raw-agent-directory-read:src/monitor/auditor.ts:1101',
  'raw-agent-directory-read:src/orchestra/planner.ts:1596',
  'raw-agent-directory-read:src/orchestra/task-builder.ts:1218',
];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('agent-discovery census scanner', () => {
  it('walks every source file and classifies definitions and raw agent-layer reads', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-agent-census-'));
    tmpDirs.push(root);
    mkdirSync(join(root, 'src', 'catalog'), { recursive: true });
    writeFileSync(join(root, 'src', 'catalog', 'reader.ts'), [
      "const AGENTS_DIR = '.deckent/agents';",
      'readdirSync(',
      '  join(root, AGENTS_DIR),',
      ');',
    ].join('\n'));
    writeFileSync(join(root, 'src', 'catalog', 'ordinary.ts'), "const label = '.deckent/agents';\n");

    expect(findAgentDiscoverySites(root).map(siteKey)).toEqual([
      'agents-dir-definition:src/catalog/reader.ts:1',
      'raw-agent-directory-read:src/catalog/reader.ts:2',
    ]);
  });

  it('fails when a deliberately added twelfth raw scan is absent from the pin', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-agent-census-drift-'));
    tmpDirs.push(root);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'reader.ts'), "readdirSync(join(root, '.deckent/agents'));\n");
    writeFileSync(join(root, 'src', 'twelfth.ts'), "readdirSync(join(root, '.tasks/agents'));\n");

    expect(() => assertExactCensus(findAgentDiscoverySites(root), [
      'raw-agent-directory-read:src/reader.ts:1',
    ])).toThrow();
  });

  it('fails when a known discovery site disappears from the pin', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-agent-census-missing-'));
    tmpDirs.push(root);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'reader.ts'), "readdirSync(join(root, '.deckent/agents'));\n");

    expect(() => assertExactCensus(findAgentDiscoverySites(root), [
      'raw-agent-directory-read:src/reader.ts:1',
      'raw-agent-directory-read:src/removed.ts:1',
    ])).toThrow();
  });
});

describe('agent-discovery census — current src tree', () => {
  it('exactly reproduces the design §1 known set in both drift directions', () => {
    assertExactCensus(findAgentDiscoverySites(projectRoot), KNOWN_AGENT_DISCOVERY_SITES);
  });
});
