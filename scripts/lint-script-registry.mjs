#!/usr/bin/env node
// lint-script-registry.mjs — row 270 fail-closed gate for scripts/script-registry.json.
//
// WHAT THIS IS (honest framing): a coverage + shape gate, not a semantic-correctness gate.
// It proves the registry names exactly the real top-level scripts/*.mjs files (no missing,
// no stale entry) and that every entry carries a valid class + the four required fields
// (owner, input, output, expiry) as non-empty strings. It does NOT re-derive whether the
// chosen class is the "right" one — that judgment was made by reading each script's header
// and package.json wiring at authoring time (see registry.derivedFrom); a human/reviewer
// verifies classification quality via diff review, same as every other baseline-ratchet
// gate in this tree (lint-no-spawnsync.mjs, lint-no-model-literal.mjs, ...).
//
// Scope: scripts/*.mjs, TOP-LEVEL ONLY (non-recursive) — matches the registry's own
// `scope.pattern`. Files inside scripts/ subdirectories (archive/, hermeticity/, memory/,
// platform-probe/, security/) and non-.mjs files (.ts/.sh/.json) are out of scope by design
// (see registry.scope.excludes) and are never required to appear.
//
// Exit codes: 0 = registry covers exactly the real directory + every entry is well-formed,
// 1 = coverage or shape violation found, 2 = registry missing/unparsable/infrastructure error.
//
// Usage:
//   node scripts/lint-script-registry.mjs [--root <path>]
//
// NOT wired into any npm script or lint:gates chain in this slice — that is a follow-up
// owner decision (see this task's .result notes), not a decision made here.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REQUIRED_CLASSES = Object.freeze([
  'gate',
  'recurring-proof',
  'admin-migration',
  'one-shot',
  'retired',
]);
const REQUIRED_STRING_FIELDS = Object.freeze(['owner', 'input', 'output', 'expiry']);

/**
 * @param {string} root - absolute path to the repo root containing `scripts/`
 * @returns {string[]} sorted `scripts/<name>.mjs` relative paths, top-level only
 */
export function listRealTopLevelScripts(root) {
  const scriptsDir = join(root, 'scripts');
  const names = readdirSync(scriptsDir);
  const files = [];
  for (const name of names) {
    if (!name.endsWith('.mjs')) continue;
    const full = join(scriptsDir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    files.push(`scripts/${name}`);
  }
  files.sort();
  return files;
}

/**
 * @param {string} registryPath
 * @returns {{ registry: any, error: null } | { registry: null, error: string }}
 */
export function readRegistry(registryPath) {
  let raw;
  try {
    raw = readFileSync(registryPath, 'utf8');
  } catch (error) {
    return { registry: null, error: `E_REGISTRY_MISSING: ${registryPath} (${error?.message ?? error})` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { registry: null, error: `E_REGISTRY_UNPARSABLE: ${registryPath} (${error?.message ?? error})` };
  }
  return { registry: parsed, error: null };
}

/**
 * Validates registry shape + coverage against the real directory contents.
 * Pure function — no process/exit side effects — so it is directly testable.
 * @param {any} registry - parsed script-registry.json contents
 * @param {string[]} realFiles - sorted `scripts/<name>.mjs` paths from listRealTopLevelScripts()
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function validateRegistry(registry, realFiles) {
  const violations = [];

  if (registry === null || typeof registry !== 'object' || Array.isArray(registry)) {
    return { ok: false, violations: ['E_REGISTRY_ROOT_NOT_OBJECT: registry root must be a JSON object'] };
  }
  if (!Array.isArray(registry.entries)) {
    return { ok: false, violations: ['E_REGISTRY_ENTRIES_MISSING: registry.entries must be an array'] };
  }

  const realSet = new Set(realFiles);
  const seenFiles = new Set();
  const duplicates = new Set();

  registry.entries.forEach((entry, index) => {
    const label = `entries[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      violations.push(`E_ENTRY_NOT_OBJECT: ${label} is not an object`);
      return;
    }

    if (typeof entry.file !== 'string' || entry.file.length === 0) {
      violations.push(`E_ENTRY_FILE_INVALID: ${label}.file must be a non-empty string`);
    } else {
      if (seenFiles.has(entry.file)) duplicates.add(entry.file);
      seenFiles.add(entry.file);
      if (!realSet.has(entry.file)) {
        violations.push(`E_ENTRY_FILE_NOT_REAL: ${label}.file "${entry.file}" does not exist as a real top-level scripts/*.mjs file`);
      }
    }

    if (typeof entry.class !== 'string' || !REQUIRED_CLASSES.includes(entry.class)) {
      violations.push(`E_ENTRY_CLASS_INVALID: ${label}.class "${entry.class}" must be one of ${REQUIRED_CLASSES.join(', ')}`);
    }

    for (const field of REQUIRED_STRING_FIELDS) {
      const value = entry[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        violations.push(`E_ENTRY_FIELD_MISSING: ${label}.${field} must be a non-empty string`);
      }
    }

    if ('npmScript' in entry && entry.npmScript !== null && typeof entry.npmScript !== 'string') {
      violations.push(`E_ENTRY_NPMSCRIPT_INVALID: ${label}.npmScript must be a string or null`);
    }
    if ('notes' in entry && entry.notes !== undefined && typeof entry.notes !== 'string') {
      violations.push(`E_ENTRY_NOTES_INVALID: ${label}.notes must be a string when present`);
    }
  });

  for (const dup of duplicates) {
    violations.push(`E_ENTRY_FILE_DUPLICATE: "${dup}" is registered more than once`);
  }

  const missing = realFiles.filter((file) => !seenFiles.has(file));
  for (const file of missing) {
    violations.push(`E_REAL_FILE_UNREGISTERED: "${file}" exists in scripts/ but has no registry entry`);
  }

  return { ok: violations.length === 0, violations };
}

function parseArguments(argv) {
  let root = resolve(__dirname, '..');
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('E_ARG_ROOT_MISSING_VALUE');
      root = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`E_ARGUMENT_UNKNOWN: ${argument}`);
  }
  return { root };
}

const invokedDirectly =
  process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  try {
    const { root } = parseArguments(process.argv.slice(2));
    const registryPath = join(root, 'scripts', 'script-registry.json');
    const { registry, error } = readRegistry(registryPath);
    if (error !== null) {
      console.error(error);
      process.exit(2);
    }
    const realFiles = listRealTopLevelScripts(root);
    const { ok, violations } = validateRegistry(registry, realFiles);
    if (!ok) {
      console.error(`FAIL: ${violations.length} violation(s) in ${registryPath}`);
      for (const violation of violations) console.error(`  - ${violation}`);
      process.exit(1);
    }
    console.log(`OK: ${realFiles.length} scripts/*.mjs files covered exactly by ${registryPath}`);
    process.exit(0);
  } catch (error) {
    console.error(`E_LINT_INFRASTRUCTURE: ${error?.message ?? error}`);
    process.exit(2);
  }
}
