#!/usr/bin/env node
// gen-platform-registry.mjs — row 90 (2026-08-03)
// Derives the platform-tag registry from source truth: `describe.skipIf` / `it.skipIf` gates,
// measured-capability probes, and non-skip `process.platform` guards actually present across
// tests/**/*.test.ts(x). Regenerates the AUTOGEN block in tests/PLATFORM.md.
//
// Hermeticity contract (mirrors scripts/update-readme-stats.mjs): --check and --write are pure
// functions of TRACKED files under tests/ — no wall-clock, no environment-dependent input — so
// every machine computes the same output.
//
// Modes:
//   --check  → exit 1 if the AUTOGEN block in tests/PLATFORM.md drifts from derived truth
//   --write  → overwrite the AUTOGEN block in place (first run also places the markers)
// Exit codes: 0 = ok / in-sync, 1 = drift detected (check) or write error, 2 = bad args

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, '..');

export const PLATFORM_TAGS = ['linux', 'macos', 'windows-native', 'wsl'];

const AUTOGEN_ID = 'platform-registry';
const AUTOGEN_START = `<!-- AUTOGEN:START id="${AUTOGEN_ID}" -->`;
const AUTOGEN_END = `<!-- AUTOGEN:END id="${AUTOGEN_ID}" -->`;
const DOC_RELATIVE_PATH = 'tests/PLATFORM.md';

// ─── test-tree discovery ─────────────────────────────────────────────────────

function listTestFilesRecursive(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...listTestFilesRecursive(p));
    } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

// This generator's own drift test writes fixture test-file *source strings* (e.g.
// `describe.skipIf(isWindows)(...)`) to exercise the scanner against tmpdir fixtures. Scanning
// the file itself would treat those fixture strings as real platform gates — self-referential
// noise, not source truth — so it is excluded from the corpus it derives the registry from.
const SELF_EXCLUDE_RELATIVE = 'tests/scripts/platform-registry.test.ts';

export function scanTestFiles(root = DEFAULT_ROOT) {
  return listTestFilesRecursive(join(root, 'tests'))
    .filter((abs) => relative(root, abs).replace(/\\/g, '/') !== SELF_EXCLUDE_RELATIVE)
    .sort();
}

// ─── platform-flag resolution ────────────────────────────────────────────────

// `const isWindows = process.platform === 'win32';` — resolves a named boolean flag back to
// the platform literal it guards, so `skipIf(isWindows)` classifies the same as an inline
// `skipIf(process.platform === 'win32')`.
const FLAG_DEF_RE =
  /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*process\.platform\s*(===|!==)\s*['"](win32|darwin|linux)['"]\s*;/g;

export function extractFlags(source) {
  const flags = new Map();
  FLAG_DEF_RE.lastIndex = 0;
  let m;
  while ((m = FLAG_DEF_RE.exec(source))) {
    flags.set(m[1], { op: m[2], value: m[3] });
  }
  return flags;
}

const PLATFORM_VALUE_TAG = { win32: 'windows-native', darwin: 'macos', linux: 'linux' };

// ─── skipIf condition classification ─────────────────────────────────────────

const PLATFORM_LITERAL_RE = /^process\.platform\s*(===|!==)\s*['"](win32|darwin|linux)['"]$/;
const NEGATED_IDENT_RE = /^!\s*([A-Za-z_$][\w$]*)$/;
const BARE_IDENT_RE = /^([A-Za-z_$][\w$]*)$/;
const CAPABILITY_RE = /^(!?)\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.supported)$/;

// Returns one of:
//   { kind: 'platform-literal', tag, op }   — op '===' → excluded from tag; '!==' → required-only on tag
//   { kind: 'capability-probe', capability, negated }
//   { kind: 'unclassified', raw }
export function classifyCondition(rawCondition, flags) {
  const condition = rawCondition.trim();

  const literal = PLATFORM_LITERAL_RE.exec(condition);
  if (literal) {
    return { kind: 'platform-literal', tag: PLATFORM_VALUE_TAG[literal[2]], op: literal[1] };
  }

  const negatedIdent = NEGATED_IDENT_RE.exec(condition);
  const bareIdent = BARE_IDENT_RE.exec(condition);
  const identName = negatedIdent?.[1] ?? bareIdent?.[1];
  if (identName && flags.has(identName)) {
    const flag = flags.get(identName);
    const effectiveOp = negatedIdent ? (flag.op === '===' ? '!==' : '===') : flag.op;
    return { kind: 'platform-literal', tag: PLATFORM_VALUE_TAG[flag.value], op: effectiveOp };
  }

  const capability = CAPABILITY_RE.exec(condition);
  if (capability) {
    return { kind: 'capability-probe', capability: capability[2], negated: capability[1] === '!' };
  }

  return { kind: 'unclassified', raw: condition };
}

// ─── source scanning ──────────────────────────────────────────────────────────

const SKIPIF_RE = /\b(describe|it)\.skipIf\(([^)]*)\)/g;
const IF_GUARD_RE = /\bif\s*\(\s*process\.platform\s*(===|!==)\s*['"](win32|darwin|linux)['"]\s*\)/g;
const NAME_AFTER_RE = /^\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractName(source, afterIndex) {
  const slice = source.slice(afterIndex, afterIndex + 400);
  const m = NAME_AFTER_RE.exec(slice);
  return m ? m[2] : null;
}

export function buildRegistry(root = DEFAULT_ROOT) {
  const absFiles = scanTestFiles(root);
  const files = [];
  const skipSites = [];
  const behaviorSites = [];
  const unclassified = [];

  for (const absPath of absFiles) {
    const relPath = relative(root, absPath).replace(/\\/g, '/');
    files.push(relPath);
    const source = readFileSync(absPath, 'utf-8');
    const flags = extractFlags(source);

    SKIPIF_RE.lastIndex = 0;
    let m;
    while ((m = SKIPIF_RE.exec(source))) {
      const blockType = m[1];
      const line = lineOf(source, m.index);
      const name = extractName(source, SKIPIF_RE.lastIndex);
      const classification = classifyCondition(m[2], flags);
      if (classification.kind === 'unclassified') {
        unclassified.push({ file: relPath, line, blockType, name, raw: classification.raw });
        continue;
      }
      skipSites.push({ file: relPath, line, blockType, name, ...classification });
    }

    IF_GUARD_RE.lastIndex = 0;
    while ((m = IF_GUARD_RE.exec(source))) {
      const tag = PLATFORM_VALUE_TAG[m[2]];
      behaviorSites.push({
        file: relPath,
        line: lineOf(source, m.index),
        tag,
        direction: m[1] === '===' ? `asserts differently ON ${tag}` : `asserts differently OFF ${tag}`,
      });
    }
  }

  return { files, skipSites, behaviorSites, unclassified };
}

// ─── aggregation ──────────────────────────────────────────────────────────────

export function aggregate(registry) {
  const byTagExcluded = new Map(PLATFORM_TAGS.map((t) => [t, []]));
  const byTagOnly = new Map(PLATFORM_TAGS.map((t) => [t, []]));
  const capability = [];

  for (const site of registry.skipSites) {
    if (site.kind === 'platform-literal') {
      (site.op === '===' ? byTagExcluded : byTagOnly).get(site.tag).push(site);
    } else if (site.kind === 'capability-probe') {
      capability.push(site);
    }
  }
  return { byTagExcluded, byTagOnly, capability };
}

// ─── markdown rendering ───────────────────────────────────────────────────────

function escapeMd(s) {
  return String(s ?? '_(name not statically extractable)_').replace(/\|/g, '\\|');
}

function table(headers, rows) {
  if (rows.length === 0) return '_None at this time._';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => '------').join('|')}|`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

function renderTagSection(tag, excluded, onlyRequired) {
  const requiredNote =
    tag === 'linux'
      ? '**Required-only** (skipped unless running on this platform — note: WSL also reports ' +
        "`process.platform === 'linux'`, so these also run under WSL):"
      : '**Required-only** (skipped unless running on this platform):';
  return [
    `### \`${tag}\``,
    '',
    '**Excluded** (skipped when running on this platform):',
    '',
    table(
      ['File', 'Line', 'Block', 'Test/Suite name'],
      excluded.map((s) => [`\`${s.file}\``, String(s.line), s.blockType, escapeMd(s.name)]),
    ),
    '',
    requiredNote,
    '',
    table(
      ['File', 'Line', 'Block', 'Test/Suite name'],
      onlyRequired.map((s) => [`\`${s.file}\``, String(s.line), s.blockType, escapeMd(s.name)]),
    ),
    '',
  ].join('\n');
}

export function renderCategoriesMarkdown(registry) {
  const agg = aggregate(registry);
  const parts = [
    '_Derived by `scripts/gen-platform-registry.mjs` from `describe.skipIf` / `it.skipIf` gates ' +
      'and `process.platform` guards actually present across `tests/**/*.test.ts(x)`. Do not ' +
      'hand-edit this block — run `node scripts/gen-platform-registry.mjs --write` to regenerate; ' +
      '`tests/scripts/platform-registry.test.ts` fails closed when this block drifts from source ' +
      'truth._',
    '',
  ];

  for (const tag of PLATFORM_TAGS) {
    parts.push(renderTagSection(tag, agg.byTagExcluded.get(tag), agg.byTagOnly.get(tag)));
  }

  parts.push(
    '### Measured-Capability Gates',
    '',
    'Skip conditions gated on a measured capability probe (an actual attempted operation, e.g. a ' +
      'real symlink write) rather than a raw platform literal — a probed capability, not a ' +
      'platform guess.',
    '',
    table(
      ['File', 'Line', 'Block', 'Capability', 'Test/Suite name'],
      registry.skipSites
        .filter((s) => s.kind === 'capability-probe')
        .map((s) => [
          `\`${s.file}\``,
          String(s.line),
          s.blockType,
          `\`${s.negated ? '!' : ''}${s.capability}\``,
          escapeMd(s.name),
        ]),
    ),
    '',
  );

  parts.push(
    '### Behavior-Differs Guards',
    '',
    'Non-skip `if (process.platform ...)` branches inside test bodies — the test still runs on ' +
      'every platform but asserts a different expectation depending on the result.',
    '',
    table(
      ['File', 'Line', 'Tag', 'Direction'],
      registry.behaviorSites.map((s) => [`\`${s.file}\``, String(s.line), `\`${s.tag}\``, s.direction]),
    ),
    '',
  );

  if (registry.unclassified.length > 0) {
    parts.push(
      '### Unclassified `skipIf` Conditions',
      '',
      '_These `skipIf` conditions matched no rule in `classifyCondition()` — extend the generator ' +
        'rather than leaving them silently uncovered._',
      '',
      table(
        ['File', 'Line', 'Block', 'Raw condition'],
        registry.unclassified.map((s) => [`\`${s.file}\``, String(s.line), s.blockType, `\`${escapeMd(s.raw)}\``]),
      ),
      '',
    );
  }

  const gatedFiles = new Set([
    ...registry.skipSites.map((s) => s.file),
    ...registry.behaviorSites.map((s) => s.file),
    ...registry.unclassified.map((s) => s.file),
  ]);
  const otherCount = registry.files.length - gatedFiles.size;
  parts.push(
    '### All Other Test Files',
    '',
    `${otherCount} of ${registry.files.length} test files under \`tests/\` carry no ` +
      'platform-conditional gate detected above and run identically on every supported platform.',
    '',
  );

  return parts.join('\n');
}

// ─── AUTOGEN block placement ──────────────────────────────────────────────────

export function replaceAutogenBlock(content, body) {
  const startIdx = content.indexOf(AUTOGEN_START);
  const endIdx = content.indexOf(AUTOGEN_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`gen-platform-registry: AUTOGEN markers for id="${AUTOGEN_ID}" not found`);
  }
  const before = content.slice(0, startIdx + AUTOGEN_START.length);
  const after = content.slice(endIdx);
  const bodyBlock = body.endsWith('\n') ? body : `${body}\n`;
  return `${before}\n${bodyBlock}${after}`;
}

const CATEGORIES_HEADING_RE = /^## Categories\s*$/m;
const NEXT_HEADING_RE = /\n## /;

// First-time placement: locate `## Categories`, replace everything up to (but not including)
// the next `## ` heading with a fresh AUTOGEN block. Content before `## Categories` and from
// the next `## ` heading onward is untouched — the doc's human-authored frontmatter/prose/
// procedural sections are byte-preserved.
export function regenerateDoc(content, body) {
  if (content.includes(AUTOGEN_START) && content.includes(AUTOGEN_END)) {
    return replaceAutogenBlock(content, body);
  }
  const headingMatch = CATEGORIES_HEADING_RE.exec(content);
  if (!headingMatch) {
    throw new Error(
      `gen-platform-registry: "## Categories" heading not found in ${DOC_RELATIVE_PATH} — cannot place AUTOGEN block`,
    );
  }
  const afterHeadingIdx = headingMatch.index + headingMatch[0].length;
  const rest = content.slice(afterHeadingIdx);
  const nextMatch = NEXT_HEADING_RE.exec(rest);
  const after = nextMatch ? rest.slice(nextMatch.index) : '';
  const before = content.slice(0, afterHeadingIdx);
  const bodyBlock = body.endsWith('\n') ? body : `${body}\n`;
  const block = `${AUTOGEN_START}\n${bodyBlock}${AUTOGEN_END}`;
  return `${before}\n\n${block}\n${after}`;
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

export function main(argv = process.argv.slice(2), opts = {}) {
  const args = new Set(argv);
  const check = args.has('--check');
  const write = args.has('--write');
  if (args.has('-h') || args.has('--help')) {
    process.stdout.write(
      'gen-platform-registry.mjs — derive the platform-tag registry and regenerate tests/PLATFORM.md\n\n' +
        'Usage:\n' +
        '  node scripts/gen-platform-registry.mjs --check   # CI gate (exit 1 on drift)\n' +
        '  node scripts/gen-platform-registry.mjs --write   # regenerate the AUTOGEN block in place\n',
    );
    return 0;
  }
  if (!check && !write) {
    process.stderr.write('error: must pass --check or --write\n');
    return 2;
  }
  const root = opts.root ?? DEFAULT_ROOT;
  const docPath = join(root, DOC_RELATIVE_PATH);
  if (!existsSync(docPath)) {
    process.stderr.write(`error: ${DOC_RELATIVE_PATH} not found under ${root}\n`);
    return 1;
  }
  const actual = readFileSync(docPath, 'utf-8');
  const registry = buildRegistry(root);
  const body = renderCategoriesMarkdown(registry);

  let expected;
  try {
    expected = regenerateDoc(actual, body);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
  const drift = expected !== actual;

  if (write) {
    if (drift) {
      writeFileSync(docPath, expected);
      process.stdout.write(`  ✎ ${DOC_RELATIVE_PATH} (updated)\n`);
    } else {
      process.stdout.write(`  ✓ ${DOC_RELATIVE_PATH} (in sync)\n`);
    }
    return 0;
  }

  // --check mode
  if (drift) {
    process.stderr.write(
      `  ✗ ${DOC_RELATIVE_PATH} — stale\n\n` +
        'gen-platform-registry: registry drift detected. Run ' +
        '`node scripts/gen-platform-registry.mjs --write` to regenerate.\n',
    );
    return 1;
  }
  process.stdout.write(`  ✓ ${DOC_RELATIVE_PATH} — in sync\n`);
  return 0;
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  const code = main();
  process.exit(code);
}
