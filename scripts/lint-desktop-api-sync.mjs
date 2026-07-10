#!/usr/bin/env node
// scripts/lint-desktop-api-sync.mjs — 392-008 DESK-B2-DASHBOARD-BRIDGE.
//
// The dashboard sub-package cannot import src/desktop/src/shared/desktop-api.ts
// across the build unit boundary (separate tsc/Vite project), so
// src/dashboard/src/types/desktop-global.d.ts carries a hand-mirrored ambient
// copy of the `DeckentDesktopApi` interface. This gate extracts the TOP-LEVEL
// member names of `DeckentDesktopApi` from both files (brace/paren-depth
// scan, not a full TS parser — same regex/depth-scan style as
// lint-cli-mcp-parity.mjs / lint-layer-shims.mjs) and fails on any drift:
// a member added/removed/renamed in the SSOT without the mirror following.
//
// Exit: 0 = in sync, 1 = drift detected, 2 = scan error (file/interface missing)
// Usage:
//   node scripts/lint-desktop-api-sync.mjs
//   node scripts/lint-desktop-api-sync.mjs --source <path> --mirror <path>   # fixture/drift-sim use

import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const DEFAULT_SOURCE = resolve(REPO_ROOT, 'src/desktop/src/shared/desktop-api.ts');
const DEFAULT_MIRROR = resolve(REPO_ROOT, 'src/dashboard/src/types/desktop-global.d.ts');

const INTERFACE_NAME = 'DeckentDesktopApi';

/**
 * Extract the `{ ... }` body of `interface <name> { ... }` from source text,
 * via brace-depth scanning (handles nested object-type members).
 * @param {string} content
 * @param {string} name
 * @returns {string|null} the body between the outer braces, or null if not found
 */
export function extractInterfaceBody(content, name) {
  const re = new RegExp(`interface\\s+${name}\\s*\\{`);
  const m = re.exec(content);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return null; // unbalanced braces — malformed source
  return content.slice(start, i - 1);
}

/**
 * Split an interface body into top-level member declarations (depth-0 `;`
 * boundaries — `{`/`(`/`[` all open a nested scope) and extract each
 * member's leading identifier. Angle brackets (generics, `=>`) are
 * deliberately NOT depth-tracked: they are always balanced within a single
 * member's type expression and never contain a top-level-relevant `;`.
 * @param {string} body
 * @returns {string[]} unique member names, in first-seen order
 */
export function extractTopLevelMemberNames(body) {
  let depth = 0;
  let current = '';
  const rawMembers = [];
  for (const ch of body) {
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    if (ch === ';' && depth === 0) {
      rawMembers.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) rawMembers.push(current);

  const seen = new Set();
  const names = [];
  for (const raw of rawMembers) {
    const line = raw.trim();
    if (!line) continue;
    const nameMatch = line.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\??\s*[:(]/);
    if (!nameMatch) continue;
    const memberName = nameMatch[1];
    if (!seen.has(memberName)) {
      seen.add(memberName);
      names.push(memberName);
    }
  }
  return names;
}

/**
 * Load a file and extract `DeckentDesktopApi`'s top-level member names.
 * @param {string} path
 * @returns {{ names: string[] } | { error: string }}
 */
export function scanFile(path) {
  if (!existsSync(path)) {
    return { error: `file not found: ${path}` };
  }
  const content = readFileSync(path, 'utf-8');
  const body = extractInterfaceBody(content, INTERFACE_NAME);
  if (body === null) {
    return { error: `interface ${INTERFACE_NAME} not found (or malformed) in: ${path}` };
  }
  return { names: extractTopLevelMemberNames(body) };
}

/**
 * Compare two member-name lists; returns the symmetric-difference drift.
 * @param {string[]} sourceNames
 * @param {string[]} mirrorNames
 * @returns {{ missingInMirror: string[], extraInMirror: string[] }}
 */
export function diffMembers(sourceNames, mirrorNames) {
  const sourceSet = new Set(sourceNames);
  const mirrorSet = new Set(mirrorNames);
  const missingInMirror = sourceNames.filter((n) => !mirrorSet.has(n));
  const extraInMirror = mirrorNames.filter((n) => !sourceSet.has(n));
  return { missingInMirror, extraInMirror };
}

// ─── CLI ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { source: DEFAULT_SOURCE, mirror: DEFAULT_MIRROR };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opts.source = resolve(argv[++i]);
    else if (argv[i] === '--mirror') opts.mirror = resolve(argv[++i]);
  }
  return opts;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  const { source, mirror } = parseArgs(process.argv.slice(2));

  const sourceResult = scanFile(source);
  const mirrorResult = scanFile(mirror);

  if ('error' in sourceResult || 'error' in mirrorResult) {
    if ('error' in sourceResult) process.stderr.write(`[desktop-api-sync] ERROR (source): ${sourceResult.error}\n`);
    if ('error' in mirrorResult) process.stderr.write(`[desktop-api-sync] ERROR (mirror): ${mirrorResult.error}\n`);
    process.exit(2);
  }

  const { missingInMirror, extraInMirror } = diffMembers(sourceResult.names, mirrorResult.names);

  if (missingInMirror.length === 0 && extraInMirror.length === 0) {
    process.stdout.write(
      `[desktop-api-sync] OK — ${INTERFACE_NAME} in sync (${sourceResult.names.length} member(s)): `
      + `${relative(REPO_ROOT, source)} <-> ${relative(REPO_ROOT, mirror)}\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`[desktop-api-sync] FAIL — ${INTERFACE_NAME} drift detected:\n`);
  process.stderr.write(`  source: ${relative(REPO_ROOT, source)}\n`);
  process.stderr.write(`  mirror: ${relative(REPO_ROOT, mirror)}\n`);
  if (missingInMirror.length > 0) {
    process.stderr.write(`  missing in mirror (add to the .d.ts): ${missingInMirror.join(', ')}\n`);
  }
  if (extraInMirror.length > 0) {
    process.stderr.write(`  extra in mirror (stale — remove from the .d.ts, or SSOT dropped it): ${extraInMirror.join(', ')}\n`);
  }
  process.exit(1);
}
