import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLATFORM_TAGS,
  extractFlags,
  classifyCondition,
  buildRegistry,
  aggregate,
  renderCategoriesMarkdown,
  replaceAutogenBlock,
  regenerateDoc,
  main,
  // @ts-expect-error — .mjs script lacks .d.ts; import works at runtime via vitest's esm loader
} from '../../scripts/gen-platform-registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'platform-registry-test-'));
});

afterEach(() => {
  if (tmpRoot && existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

function writeTestFile(root: string, relPath: string, contents: string): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

const PLATFORM_DOC_TEMPLATE = (categoriesBody: string) =>
  `---\n` +
  `doc_rank: 50\n` +
  `status: active\n` +
  `---\n` +
  `\n` +
  `# Platform-Specific Test Guide\n` +
  `\n` +
  `Intro prose.\n` +
  `\n` +
  `## Categories\n` +
  `\n` +
  `${categoriesBody}\n` +
  `## How Platform Conditions Work\n` +
  `\n` +
  `Procedural prose that must never be touched by the generator.\n`;

// ─── extractFlags / classifyCondition ────────────────────────────────────────

describe('extractFlags', () => {
  it('resolves a `const X = process.platform === literal` flag definition', () => {
    const flags = extractFlags(`const isWindows = process.platform === 'win32';\n`);
    expect(flags.get('isWindows')).toEqual({ op: '===', value: 'win32' });
  });

  it('resolves a negated-operator flag definition', () => {
    const flags = extractFlags(`const isLinux = process.platform !== 'linux';\n`);
    expect(flags.get('isLinux')).toEqual({ op: '!==', value: 'linux' });
  });

  it('ignores unrelated const declarations', () => {
    const flags = extractFlags(`const foo = 1;\nconst bar = os.platform() === 'win32';\n`);
    expect(flags.size).toBe(0);
  });
});

describe('classifyCondition', () => {
  const emptyFlags = new Map();

  it('classifies an inline process.platform literal (===)', () => {
    const result = classifyCondition(`process.platform === 'win32'`, emptyFlags);
    expect(result).toEqual({ kind: 'platform-literal', tag: 'windows-native', op: '===' });
  });

  it('classifies an inline process.platform literal (!==)', () => {
    const result = classifyCondition(`process.platform !== 'linux'`, emptyFlags);
    expect(result).toEqual({ kind: 'platform-literal', tag: 'linux', op: '!==' });
  });

  it('resolves a bare flag identifier through the flags map', () => {
    const flags = new Map([['isWindows', { op: '===', value: 'win32' }]]);
    const result = classifyCondition('isWindows', flags);
    expect(result).toEqual({ kind: 'platform-literal', tag: 'windows-native', op: '===' });
  });

  it('flips the operator for a negated flag identifier', () => {
    const flags = new Map([['isWindows', { op: '===', value: 'win32' }]]);
    const result = classifyCondition('!isWindows', flags);
    expect(result).toEqual({ kind: 'platform-literal', tag: 'windows-native', op: '!==' });
  });

  it('classifies a measured-capability probe', () => {
    const result = classifyCondition('!symlinkCapability.supported', emptyFlags);
    expect(result).toEqual({ kind: 'capability-probe', capability: 'symlinkCapability.supported', negated: true });
  });

  it('falls back to unclassified for an unrecognized condition, never dropping it', () => {
    const result = classifyCondition('!dockerAvailable', emptyFlags);
    expect(result).toEqual({ kind: 'unclassified', raw: '!dockerAvailable' });
  });
});

// ─── buildRegistry / aggregate ────────────────────────────────────────────────

describe('buildRegistry', () => {
  it('finds a describe.skipIf gated on a resolved windows flag', () => {
    writeTestFile(
      tmpRoot,
      'tests/foo/win.test.ts',
      `import { describe, it } from 'vitest';\n` +
        `const isWindows = process.platform === 'win32';\n` +
        `describe.skipIf(isWindows)('Windows-excluded suite', () => {\n` +
        `  it('runs', () => {});\n` +
        `});\n`,
    );
    const registry = buildRegistry(tmpRoot);
    expect(registry.files).toEqual(['tests/foo/win.test.ts']);
    expect(registry.skipSites).toHaveLength(1);
    expect(registry.skipSites[0]).toMatchObject({
      file: 'tests/foo/win.test.ts',
      blockType: 'describe',
      kind: 'platform-literal',
      tag: 'windows-native',
      op: '===',
      name: 'Windows-excluded suite',
    });
  });

  it('finds an it.skipIf gated on an inline linux-required literal', () => {
    writeTestFile(
      tmpRoot,
      'tests/foo/linux-only.test.ts',
      `import { it } from 'vitest';\n` +
        `it.skipIf(process.platform !== 'linux')(\n` +
        `  'linux-only case',\n` +
        `  () => {},\n` +
        `);\n`,
    );
    const registry = buildRegistry(tmpRoot);
    expect(registry.skipSites[0]).toMatchObject({
      blockType: 'it',
      tag: 'linux',
      op: '!==',
      name: 'linux-only case',
    });
  });

  it('detects a non-skip if(process.platform) behavior-differs guard', () => {
    writeTestFile(
      tmpRoot,
      'tests/foo/behavior.test.ts',
      `import { it, expect } from 'vitest';\n` +
        `it('differs by platform', () => {\n` +
        `  if (process.platform === 'darwin') {\n` +
        `    expect(1).toBe(1);\n` +
        `  }\n` +
        `});\n`,
    );
    const registry = buildRegistry(tmpRoot);
    expect(registry.skipSites).toHaveLength(0);
    expect(registry.behaviorSites).toHaveLength(1);
    expect(registry.behaviorSites[0]).toMatchObject({
      file: 'tests/foo/behavior.test.ts',
      tag: 'macos',
      direction: 'asserts differently ON macos',
    });
  });

  it('routes an unrecognized skipIf condition to unclassified instead of dropping it', () => {
    writeTestFile(
      tmpRoot,
      'tests/foo/env-gated.test.ts',
      `import { describe } from 'vitest';\n` +
        `describe.skipIf(!dockerAvailable)('docker suite', () => {});\n`,
    );
    const registry = buildRegistry(tmpRoot);
    expect(registry.skipSites).toHaveLength(0);
    expect(registry.unclassified).toHaveLength(1);
    expect(registry.unclassified[0]).toMatchObject({ raw: '!dockerAvailable', name: 'docker suite' });
  });

  it('counts files with no platform-conditional gate as "all other test files"', () => {
    writeTestFile(tmpRoot, 'tests/foo/plain.test.ts', `import { it } from 'vitest';\nit('x', () => {});\n`);
    const registry = buildRegistry(tmpRoot);
    expect(registry.files).toEqual(['tests/foo/plain.test.ts']);
    expect(registry.skipSites).toHaveLength(0);
    expect(registry.behaviorSites).toHaveLength(0);
    expect(registry.unclassified).toHaveLength(0);
  });
});

describe('aggregate', () => {
  it('buckets platform-literal sites by tag and excluded/required-only direction', () => {
    const registry = {
      files: [],
      skipSites: [
        { kind: 'platform-literal', tag: 'windows-native', op: '===', file: 'a', line: 1, blockType: 'describe', name: 'a' },
        { kind: 'platform-literal', tag: 'linux', op: '!==', file: 'b', line: 2, blockType: 'it', name: 'b' },
        { kind: 'capability-probe', capability: 'x.supported', negated: true, file: 'c', line: 3, blockType: 'it', name: 'c' },
      ],
      behaviorSites: [],
      unclassified: [],
    };
    const agg = aggregate(registry);
    expect(PLATFORM_TAGS).toContain('windows-native');
    expect(agg.byTagExcluded.get('windows-native')).toHaveLength(1);
    expect(agg.byTagOnly.get('linux')).toHaveLength(1);
    expect(agg.capability).toHaveLength(1);
  });
});

// ─── regenerateDoc / replaceAutogenBlock (marker placement + byte-preservation) ──

describe('regenerateDoc', () => {
  it('places markers at ## Categories on first run and preserves everything else byte-for-byte', () => {
    const before = PLATFORM_DOC_TEMPLATE('### Old Table\n\nsome stale static content\n\n');
    const result = regenerateDoc(before, 'GENERATED BODY\n');
    expect(result).toContain('<!-- AUTOGEN:START id="platform-registry" -->\nGENERATED BODY\n<!-- AUTOGEN:END id="platform-registry" -->');
    expect(result).not.toContain('Old Table');
    expect(result).not.toContain('stale static content');
    expect(result.startsWith(before.slice(0, before.indexOf('## Categories') + '## Categories'.length))).toBe(true);
    expect(result.endsWith('## How Platform Conditions Work\n\nProcedural prose that must never be touched by the generator.\n')).toBe(true);
  });

  it('replaces only the block between existing markers on subsequent runs', () => {
    const withMarkers = PLATFORM_DOC_TEMPLATE(
      '<!-- AUTOGEN:START id="platform-registry" -->\nOLD BODY\n<!-- AUTOGEN:END id="platform-registry" -->\n\n',
    );
    const result = regenerateDoc(withMarkers, 'NEW BODY\n');
    expect(result).toContain('NEW BODY');
    expect(result).not.toContain('OLD BODY');
    expect(result).toContain('Procedural prose that must never be touched by the generator.');
  });

  it('is idempotent: regenerating twice with the same body yields the same content', () => {
    const before = PLATFORM_DOC_TEMPLATE('### Old Table\n\n');
    const once = regenerateDoc(before, 'BODY\n');
    const twice = regenerateDoc(once, 'BODY\n');
    expect(twice).toBe(once);
  });

  it('throws instead of guessing when the ## Categories heading is missing', () => {
    const noHeading = '# Title\n\nno categories heading here\n';
    expect(() => regenerateDoc(noHeading, 'BODY\n')).toThrow(/Categories.*not found/);
  });
});

describe('replaceAutogenBlock', () => {
  it('throws when markers are absent', () => {
    expect(() => replaceAutogenBlock('no markers here', 'body')).toThrow(/AUTOGEN markers/);
  });
});

// ─── renderCategoriesMarkdown ─────────────────────────────────────────────────

describe('renderCategoriesMarkdown', () => {
  it('renders every platform tag section even when empty ("None at this time")', () => {
    const registry = buildRegistry(tmpRoot); // empty tmp tests dir
    const body = renderCategoriesMarkdown(registry);
    for (const tag of PLATFORM_TAGS) {
      expect(body).toContain(`### \`${tag}\``);
    }
    expect(body).toContain('_None at this time._');
  });

  it('never silently drops an unrecognized skipIf — it appears in the Unclassified section', () => {
    writeTestFile(
      tmpRoot,
      'tests/foo/env.test.ts',
      `import { describe } from 'vitest';\ndescribe.skipIf(!dockerAvailable)('docker', () => {});\n`,
    );
    const registry = buildRegistry(tmpRoot);
    const body = renderCategoriesMarkdown(registry);
    expect(body).toContain('Unclassified `skipIf` Conditions');
    expect(body).toContain('!dockerAvailable');
  });
});

// ─── main() CLI (--check / --write) ───────────────────────────────────────────

describe('main', () => {
  function seedDoc(root: string, categoriesBody: string): void {
    mkdirSync(join(root, 'tests'), { recursive: true });
    writeFileSync(join(root, 'tests/PLATFORM.md'), PLATFORM_DOC_TEMPLATE(categoriesBody));
  }

  it('--check reports drift (exit 1) when markers are absent', () => {
    seedDoc(tmpRoot, '### stale\n\n');
    const code = main(['--check'], { root: tmpRoot });
    expect(code).toBe(1);
  });

  it('--write regenerates the doc, then --check reports no drift', () => {
    seedDoc(tmpRoot, '### stale\n\n');
    writeTestFile(
      tmpRoot,
      'tests/foo/win.test.ts',
      `import { describe } from 'vitest';\n` +
        `const isWindows = process.platform === 'win32';\n` +
        `describe.skipIf(isWindows)('suite', () => {});\n`,
    );
    const writeCode = main(['--write'], { root: tmpRoot });
    expect(writeCode).toBe(0);
    const content = readFileSync(join(tmpRoot, 'tests/PLATFORM.md'), 'utf-8');
    expect(content).toContain('tests/foo/win.test.ts');
    expect(content).toContain('Procedural prose that must never be touched by the generator.');

    const checkCode = main(['--check'], { root: tmpRoot });
    expect(checkCode).toBe(0);
  });

  it('returns 2 when neither --check nor --write is passed', () => {
    expect(main([], { root: tmpRoot })).toBe(2);
  });

  it('returns 1 when tests/PLATFORM.md does not exist under root', () => {
    expect(main(['--check'], { root: tmpRoot })).toBe(1);
  });
});

// ─── real-repo drift gate (row 90 requirement: fails closed on drift) ─────────

describe('real-repo drift signal', () => {
  // 2026-08-27: the committed AUTOGEN block was regenerated (it had gone stale
  // through the Faz-B test-slim line shifts); the suite now asserts the in-sync
  // state, which is the stronger fail-closed gate — any future drift turns this
  // red and forces `node scripts/gen-platform-registry.mjs --write`.
  it('reports the committed AUTOGEN block as in sync', () => {
    const code = main(['--check'], { root: REPO_ROOT });
    expect(code).toBe(0);
  });

  it('fresh regeneration matches the committed AUTOGEN block byte-for-byte', () => {
    const actual = readFileSync(join(REPO_ROOT, 'tests/PLATFORM.md'), 'utf-8');
    const registry = buildRegistry(REPO_ROOT);
    const body = renderCategoriesMarkdown(registry);
    const expected = regenerateDoc(actual, body);
    expect(actual).toBe(expected);
  });
});
