#!/usr/bin/env node
/**
 * Fail-closed doc ↔ CLI-surface truth gate.
 *
 * The onboarding documents are the first thing a new operator trusts, so a
 * command name they invent is a real defect: `deckent agents` and
 * `deckent skills` both sat in DECKENT.md while the actual commands were
 * `deckent agent` and `deckent skill`, and nothing caught it. The CLI surface
 * registry already is the single source of truth for what exists — this gate
 * simply holds the docs to it.
 *
 * Scope discipline: only inline-code spans (`` `deckent x` ``) and fenced code
 * blocks are checked. English prose legitimately uses the product name as a
 * subject or verb ("deckent snapshots the plan state"), and flagging that would
 * make the gate lie about its own findings.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractRegistryCommands } from './lint-cli-surface.mjs';

const REPO_ROOT = realpathSync(resolve(fileURLToPath(import.meta.url), '..', '..'));

/**
 * Documents an operator is expected to trust before running anything.
 * Deliberately narrow: this gate proves the onboarding surface, not every doc.
 */
export const AUDITED_DOCS = Object.freeze([
  'DECKENT.md',
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'README.tr.md',
]);

/** Command-position words that are never a subcommand name. */
const NON_COMMAND_TOKENS = new Set(['--help', '-h', '--version', '-v']);

const posix = (value) => value.split(sep).join('/');

/**
 * Collect `deckent <command>` mentions that sit inside code, with line numbers.
 *
 * @param {string} text markdown source
 * @returns {Array<{ command: string, line: number }>}
 */
export function extractDocumentedCommands(text) {
  const found = [];
  let fenced = false;
  text.split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return;
    }
    // Inside a fence the whole line is code; outside it, only inline spans are.
    const codeSegments = fenced
      ? [line]
      : [...line.matchAll(/`([^`\r\n]+)`/g)].map((match) => match[1]);
    for (const segment of codeSegments) {
      for (const match of segment.matchAll(/\bdeckent\s+([a-z][a-z0-9-]*)/g)) {
        const command = match[1];
        if (NON_COMMAND_TOKENS.has(command)) continue;
        found.push({ command, line: index + 1 });
      }
    }
  });
  return found;
}

/**
 * @param {string} rootDir repository root
 * @returns {{ violations: Array<{ file: string, line: number, command: string }>, checked: number }}
 */
export function checkDocCommandTruth(rootDir = REPO_ROOT) {
  const root = realpathSync(resolve(rootDir));
  if (!statSync(root).isDirectory()) throw new Error('--root is not a directory');
  const registry = extractRegistryCommands(
    readFileSync(resolve(root, 'src/cli/surface-registry.ts'), 'utf8'),
  );
  const known = new Set(registry.names);
  const violations = [];
  let checked = 0;
  for (const relPath of AUDITED_DOCS) {
    let text;
    try {
      text = readFileSync(resolve(root, relPath), 'utf8');
    } catch {
      // A document that does not exist in this checkout is not a doc defect.
      continue;
    }
    checked += 1;
    for (const mention of extractDocumentedCommands(text)) {
      if (known.has(mention.command)) continue;
      violations.push({ file: posix(relPath), line: mention.line, command: mention.command });
    }
  }
  return { violations, checked };
}

function main() {
  const { violations, checked } = checkDocCommandTruth();
  if (violations.length > 0) {
    process.stdout.write(`[doc-command-truth] FAIL: ${violations.length} undocumented command(s):\n`);
    for (const violation of violations) {
      process.stdout.write(`  - ${violation.file}:${violation.line} :: \`deckent ${violation.command}\` is not in the CLI surface registry\n`);
    }
    process.stdout.write('  Fix: use the real command name, or register it in src/cli/surface-registry.ts.\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`[doc-command-truth] OK — ${checked} onboarding document(s) match the CLI surface registry\n`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main();
}
