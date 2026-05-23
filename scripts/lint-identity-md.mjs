#!/usr/bin/env node
// lint-identity-md.mjs — IDENTITY.md AUTOGEN block drift detector
//
// Verifies that .deckent/workspace/IDENTITY.md AUTOGEN blocks are in sync with
// live stats. Delegates to update-readme-stats.mjs (the authoritative source).
//
// Usage:
//   node scripts/lint-identity-md.mjs           # check only (exit 1 on drift)
//   node scripts/lint-identity-md.mjs --fix      # rewrite in place
//   node scripts/lint-identity-md.mjs --verbose  # detailed output
//
// Exit codes: 0 = in sync, 1 = drift detected, 2 = error/bad args

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, '..');

const IDENTITY_PATH = '.deckent/workspace/IDENTITY.md';

// ─── AUTOGEN block extraction ────────────────────────────────────────────────

export function extractAutogenBlock(content, id) {
  const start = `<!-- AUTOGEN:START id="${id}" -->`;
  const end = `<!-- AUTOGEN:END id="${id}" -->`;
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
  return content.slice(startIdx + start.length, endIdx).trim();
}

// ─── Scope validator ─────────────────────────────────────────────────────────

/**
 * Verify that AUTOGEN blocks cover the expected sections and that MCP count
 * is internally consistent. Returns { ok, findings }.
 */
export function validateAutogenScope(content) {
  const findings = [];

  const statusStart = '<!-- AUTOGEN:START id="identity-status" -->';
  const statusEnd = '<!-- AUTOGEN:END id="identity-status" -->';
  const statusStartIdx = content.indexOf(statusStart);
  const statusEndIdx = content.indexOf(statusEnd);

  if (statusStartIdx === -1 || statusEndIdx === -1 || statusEndIdx <= statusStartIdx) {
    findings.push('identity-status AUTOGEN block missing or malformed');
    return { ok: false, findings };
  }

  const statusBlock = content.slice(statusStartIdx + statusStart.length, statusEndIdx);

  // Check MCP Tools row
  const mcpMatch = statusBlock.match(/\|\s*MCP Tools\s*\|\s*(\d+)\s*\|/);
  if (!mcpMatch) {
    findings.push('identity-status block missing MCP Tools row');
  } else {
    const count = parseInt(mcpMatch[1], 10);
    if (count < 31) findings.push(`MCP Tools count ${count} is below expected minimum 31`);
  }

  // Check ## Project Status immediately precedes the AUTOGEN block
  const headingBefore = content.lastIndexOf('## Project Status', statusStartIdx);
  const between = headingBefore !== -1
    ? content.slice(headingBefore + '## Project Status'.length, statusStartIdx).trim()
    : '';
  if (headingBefore === -1 || between !== '') {
    findings.push('## Project Status heading does not immediately precede identity-status AUTOGEN block');
  }

  return { ok: findings.length === 0, findings };
}

// ─── Drift checker ───────────────────────────────────────────────────────────

export async function checkIdentityDrift({ root = DEFAULT_ROOT, verbose = false } = {}) {
  const identityFile = join(root, IDENTITY_PATH);
  if (!existsSync(identityFile)) {
    return { ok: false, error: `${IDENTITY_PATH} not found`, drifted: [] };
  }

  // Delegate to update-readme-stats for stat collection + rendering
  const statsModule = await import('./update-readme-stats.mjs');
  const gens = statsModule.collectGenerations({ root });
  const identityGen = gens.find(g => g.target === IDENTITY_PATH);

  if (!identityGen) {
    return { ok: false, error: 'IDENTITY.md not found in generation targets', drifted: [] };
  }

  if (identityGen.renderError) {
    return { ok: false, error: identityGen.renderError, drifted: ['identity-status'] };
  }

  // Always validate scope (independent of drift check)
  const currentContent = identityGen.actual ?? readFileSync(identityFile, 'utf-8');
  const scopeResult = validateAutogenScope(currentContent);
  if (!scopeResult.ok && verbose) {
    for (const finding of scopeResult.findings) {
      process.stdout.write(`  SCOPE ${finding}\n`);
    }
  }

  const drifted = [];

  if (identityGen.drift) {
    // Identify which AUTOGEN blocks are stale
    const current = identityGen.actual;
    const expected = identityGen.content;

    for (const blockId of ['identity-tests', 'identity-summary', 'identity-status']) {
      const currentBlock = extractAutogenBlock(current, blockId);
      const expectedBlock = extractAutogenBlock(expected, blockId);
      if (currentBlock !== expectedBlock) {
        drifted.push(blockId);
        if (verbose) {
          process.stdout.write(`  DRIFT ${blockId}:\n`);
          process.stdout.write(`    current:  ${JSON.stringify(currentBlock?.substring(0, 80))}...\n`);
          process.stdout.write(`    expected: ${JSON.stringify(expectedBlock?.substring(0, 80))}...\n`);
        }
      }
    }
    if (drifted.length === 0) drifted.push('unknown');
  }

  return { ok: !identityGen.drift && scopeResult.ok, error: null, drifted, scopeFindings: scopeResult.findings };
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2), opts = {}) {
  const args = new Set(argv);
  if (args.has('-h') || args.has('--help')) {
    process.stdout.write(
      'lint-identity-md.mjs — IDENTITY.md AUTOGEN drift detector\n\n' +
        'Usage:\n' +
        '  node scripts/lint-identity-md.mjs           # check (exit 1 on drift)\n' +
        '  node scripts/lint-identity-md.mjs --fix      # rewrite in place\n' +
        '  node scripts/lint-identity-md.mjs --verbose  # show per-block diff\n',
    );
    return 0;
  }

  const fix = args.has('--fix');
  const verbose = args.has('--verbose');
  const root = opts.root ?? DEFAULT_ROOT;

  if (fix) {
    // Delegate write to update-readme-stats
    const statsModule = await import('./update-readme-stats.mjs');
    const code = statsModule.main(['--write'], { root });
    return typeof code === 'number' ? code : 0;
  }

  const result = await checkIdentityDrift({ root, verbose });

  if (result.error) {
    process.stderr.write(`lint-identity-md: error — ${result.error}\n`);
    process.stderr.write(`  Run \`npm run docs:stats\` to regenerate.\n`);
    return 1;
  }

  if (result.ok) {
    process.stdout.write(`  ✓ ${IDENTITY_PATH} — all AUTOGEN blocks in sync\n`);
    return 0;
  }

  process.stderr.write(`  ✗ ${IDENTITY_PATH} — stale AUTOGEN blocks: ${result.drifted.join(', ')}\n`);
  process.stderr.write(`  Run \`npm run docs:stats\` to regenerate.\n`);
  return 1;
}

// ─── invoke as CLI ────────────────────────────────────────────────────────────

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  main().then(code => process.exit(code));
}
