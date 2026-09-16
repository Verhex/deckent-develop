#!/usr/bin/env node
// lint-terminal-readability.mjs — TERMINAL-READABILITY-001 hard gate.
//
// The Terminal must stay readable in every IDE terminal under every user
// theme. That holds only while every color the Terminal surface paints comes
// from the generated palette roles (design/tokens/terminal.map.json →
// src/cli/helpers/generated/palette.ts) through src/cli/repl/ink-palette.ts
// (Ink) or src/cli/helpers/theme.ts (SGR strings): the ansi16 tier then maps to
// the HOST palette (the user's theme paints it), truecolor tokens flow only on
// a known-dark background, and SGR dim — which VS Code halves and light themes
// lose — is never emitted (owner decision 2026-09-03).
//
// Scanned: src/cli/repl/**/*.ts(x) and src/cli/commands/chat-*.ts (the
// readline renderers). Test files are exempt. Violations:
//   HEX_LITERAL   '#rrggbb' in source (a color literal outside the token pipeline)
//   NAMED_COLOR   color="red" / borderColor='cyan' / color={'cyan'} (a chalk name
//                 bypassing the roles)
//   DIM_PROP      dimColor (SGR 2 through Ink)
//   SGR_DIM       \x1b[2m / [2m / [1;2m … (raw dim)
//   SGR_COLOR     raw \x1b[3Xm / [9Xm / 38;2; / 38;5; color sequences
// Exemption: `// readability-allow: <reason>` on the SAME line; an allowance
// without a reason is itself a violation (ALLOW_WITHOUT_REASON).
//
// Exit: 0 = clean, 1 = violations, 2 = scan error.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SCAN_DIRS = [join(REPO_ROOT, 'src', 'cli', 'repl')];
const SCAN_FLAT = { dir: join(REPO_ROOT, 'src', 'cli', 'commands'), prefix: 'chat-' };

const RULES = [
  { code: 'HEX_LITERAL', re: /['"`]#[0-9a-fA-F]{6}['"`]/ },
  { code: 'NAMED_COLOR', re: /\b(?:color|borderColor|backgroundColor)=(?:["'][a-zA-Z]+["']|\{["'][a-zA-Z]+["']\})/ },
  { code: 'DIM_PROP', re: /\bdimColor\b/ },
  { code: 'SGR_DIM', re: /\\(?:x1b|u001b|033)\[(?:\d+;)*2m/ },
  { code: 'SGR_COLOR', re: /\\(?:x1b|u001b|033)\[(?:\d+;)*(?:3[0-7]|9[0-7]|38;[25];[\d;]+)m/ },
];
const ALLOW = /\/\/\s*readability-allow(?::\s*(\S.*))?$/;

function collect(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collect(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
}

function collectFlat({ dir, prefix }, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(prefix) || !/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isFile()) out.push(p);
  }
}

const files = [];
for (const d of SCAN_DIRS) collect(d, files);
collectFlat(SCAN_FLAT, files);

const violations = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`scan error: ${file}: ${err.message}`);
    process.exit(2);
  }
  const rel = relative(REPO_ROOT, file);
  text.split('\n').forEach((line, i) => {
    const allow = ALLOW.exec(line);
    const hits = RULES.filter((r) => r.re.test(line)).map((r) => r.code);
    if (hits.length === 0) return;
    if (allow) {
      if (!allow[1]) violations.push({ file: rel, line: i + 1, code: 'ALLOW_WITHOUT_REASON', text: line.trim() });
      return;
    }
    for (const code of hits) violations.push({ file: rel, line: i + 1, code, text: line.trim() });
  });
}

if (violations.length === 0) {
  console.log(`lint-terminal-readability: clean (${files.length} files, ${basename(SCAN_FLAT.dir)}/${SCAN_FLAT.prefix}* + repl/)`);
  process.exit(0);
}
console.error(`lint-terminal-readability: ${violations.length} violation(s) — colors must come from palette roles (ink-palette / theme.ts); dim is not a carrier`);
for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.code}  ${v.text}`);
process.exit(1);
