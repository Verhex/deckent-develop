#!/usr/bin/env node

/**
 * Archive script: moves .brain/DECISIONS.md to .brain/archive/decisions-root-pre-sprint143/
 * with SHA-256 hash verification.
 *
 * Usage: node scripts/archive-decisions-md.mjs [--dry-run] [--root <path>]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const rootIdx = args.indexOf('--root');
const root = rootIdx >= 0 && args[rootIdx + 1] ? args[rootIdx + 1] : process.cwd();

const BRAIN_DIR = join(root, '.brain');
const SOURCE = join(BRAIN_DIR, 'DECISIONS.md');
const ARCHIVE_DIR = join(BRAIN_DIR, 'archive', 'decisions-root-pre-sprint143');
const DEST = join(ARCHIVE_DIR, 'DECISIONS.md');
const HASH_FILE = join(ARCHIVE_DIR, 'DECISIONS.md.sha256');

function main() {
  if (!existsSync(SOURCE)) {
    console.log('✓ .brain/DECISIONS.md already archived (not found).');
    process.exit(0);
  }

  const content = readFileSync(SOURCE, 'utf-8');
  const hash = createHash('sha256').update(content).digest('hex');
  const lineCount = content.split('\n').length;

  console.log(`Source: ${SOURCE}`);
  console.log(`  Lines: ${lineCount}`);
  console.log(`  SHA-256: ${hash}`);

  if (dryRun) {
    console.log(`[DRY RUN] Would archive to: ${ARCHIVE_DIR}`);
    return;
  }

  // Create archive directory
  mkdirSync(ARCHIVE_DIR, { recursive: true });

  // Copy to archive
  writeFileSync(DEST, content);
  writeFileSync(HASH_FILE, `${hash}  DECISIONS.md\n`);

  // Verify the copy
  const verifyContent = readFileSync(DEST, 'utf-8');
  const verifyHash = createHash('sha256').update(verifyContent).digest('hex');

  if (verifyHash !== hash) {
    console.error('✗ Hash verification FAILED after copy. Aborting — source file preserved.');
    process.exit(1);
  }

  // Remove original
  unlinkSync(SOURCE);

  console.log(`✓ Archived to: ${ARCHIVE_DIR}`);
  console.log(`✓ Hash verified: ${hash}`);
  console.log(`✓ Original removed: ${SOURCE}`);
}

main();
