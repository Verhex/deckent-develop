#!/usr/bin/env node
/**
 * Project-owned dogfood core-memory projection.
 *
 * Authority is always:
 *   <project>/.deckent/docs/core-memory/
 *
 * Host/provider memory directories are optional projections. They never write
 * back to the project authority and timestamp-based "newer wins" is forbidden.
 *
 * Usage:
 *   node scripts/sync-core-memory.mjs --target /absolute/projection/path [--dry-run]
 *   DECKENT_MEMORY_PROJECTION_PATH=/absolute/path node scripts/sync-core-memory.mjs
 *
 * `DECKENT_USER_MEMORY_PATH` remains a compatibility input for existing local
 * automation, but has projection-only semantics.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const checkOnly = args.includes('--check');
const projectRoot = resolve(process.env.DECKENT_PROJECT_ROOT || process.cwd());
const authorityDir = resolve(
  process.env.DECKENT_CORE_MEMORY_PATH
    || join(projectRoot, '.deckent', 'docs', 'core-memory'),
);

function readOption(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires an absolute path`);
  }
  return value;
}

const forbiddenModes = ['--backup', '--restore', '--bidirectional']
  .filter(flag => args.includes(flag));
if (forbiddenModes.length > 0) {
  throw new Error(
    `${forbiddenModes.join(', ')} removed: repo-local core-memory is the only authority; `
    + 'use --target for one-way projection',
  );
}

const configuredTarget = readOption('--target')
  || process.env.DECKENT_MEMORY_PROJECTION_PATH
  || process.env.DECKENT_USER_MEMORY_PATH
  || null;

if (!configuredTarget) {
  throw new Error(
    'No projection target configured. Pass --target or DECKENT_MEMORY_PROJECTION_PATH.',
  );
}
if (!isAbsolute(configuredTarget)) {
  throw new Error(`Projection target must be absolute: ${configuredTarget}`);
}

const projectionDir = resolve(configuredTarget);
if (projectionDir === authorityDir) {
  throw new Error('Projection target must differ from the repo-local authority directory');
}

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(file => file.endsWith('.md'))
    .sort();
}

function readFile(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function syncProjection() {
  if (!existsSync(authorityDir)) {
    throw new Error(`Core-memory authority not found: ${authorityDir}`);
  }

  const authorityFiles = listMarkdownFiles(authorityDir);
  if (!authorityFiles.includes('MEMORY.md')) {
    throw new Error(`Core-memory authority is missing MEMORY.md: ${authorityDir}`);
  }

  if (!dryRun && !checkOnly && !existsSync(projectionDir)) {
    mkdirSync(projectionDir, { recursive: true });
  }

  const authoritySet = new Set(authorityFiles);
  const projectionFiles = listMarkdownFiles(projectionDir);
  let copied = 0;
  let removed = 0;
  let unchanged = 0;
  let drifted = 0;

  for (const stale of projectionFiles) {
    if (authoritySet.has(stale)) continue;
    drifted++;
    console.log(`[core-memory] ${checkOnly || dryRun ? 'would remove' : 'remove'} stale projection: ${stale}`);
    if (!dryRun && !checkOnly) unlinkSync(join(projectionDir, stale));
    removed++;
  }

  for (const file of authorityFiles) {
    const source = join(authorityDir, file);
    const target = join(projectionDir, file);
    const sourceContent = readFile(source);
    const targetContent = readFile(target);

    if (sourceContent === targetContent) {
      unchanged++;
      continue;
    }

    drifted++;
    console.log(`[core-memory] ${checkOnly || dryRun ? 'would project' : 'project'} ${file}`);
    if (!dryRun && !checkOnly) writeFileSync(target, sourceContent, 'utf-8');
    copied++;
  }

  console.log(
    `[core-memory] authority=${authorityDir} projection=${projectionDir} `
    + `copied=${copied} removed=${removed} unchanged=${unchanged}`,
  );

  if (checkOnly && drifted > 0) process.exitCode = 1;
  return { copied, removed, unchanged, drifted };
}

syncProjection();

export { syncProjection };
