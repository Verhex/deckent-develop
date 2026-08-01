#!/usr/bin/env node
/**
 * Copy non-TS assets (JSON schemas, baseline data) from src/ to dist/.
 *
 * tsc only compiles .ts files — JSON, .md, and binary assets must be copied
 * separately. This script runs as part of `npm run build` via postbuild hook
 * and is also wired into CI (ci.yml build job).
 *
 * Sprint 141 Task 141-SAFE-01 — needed for runtime bundled baseline lookup.
 */

import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  writeSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(import.meta.dirname ?? dirname(new URL(import.meta.url).pathname), '..');
const DEFAULT_DIST = join(ROOT, 'dist');

/** File extensions to copy (non-TS assets). `.template` is read at runtime by
 *  docs-config.ts (seedDocsConfig) — without it `deckent init` silently falls
 *  back to an inline minimal docs.json. */
const ASSET_EXTENSIONS = ['.json', '.md', '.template'];
const SOURCE_INPUT_EXTENSIONS = ['.ts', '.tsx', '.json', '.md', '.template'];
const SOURCE_INPUT_EXCLUDED_DIRECTORIES = new Set(['dashboard', 'desktop']);
const SOURCE_INPUT_FILE_LIMIT = 100_000;
const SOURCE_INPUT_MAX_BYTES = 64 * 1024 * 1024;

/** Bin entries from package.json — must have execute bit (Sprint 154 audit A2.F6/A3.F1). */
export const BIN_FILES = ['dist/cli/entry.js', 'dist/mcp/server.js'];
export const BUILD_IDENTITY_RELATIVE_PATH = 'dist/build-identity.json';

function isWithin(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== ''
    && rel !== '..'
    && !rel.startsWith(`..${sep}`)
    && !isAbsolute(rel);
}

function bindOutputDirectory(root, outputDirectory) {
  const canonicalRoot = realpathSync.native(root);
  const requested = resolve(canonicalRoot, outputDirectory);
  if (!isWithin(canonicalRoot, requested)) {
    throw new Error(`E_BUILD_OUTPUT_OUTSIDE_PROJECT:${requested}`);
  }
  let existingAncestor = requested;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) {
      throw new Error(`E_BUILD_OUTPUT_PARENT_MISSING:${requested}`);
    }
    existingAncestor = parent;
  }
  const canonicalAncestor = realpathSync.native(existingAncestor);
  if (canonicalAncestor !== canonicalRoot
    && !isWithin(canonicalRoot, canonicalAncestor)) {
    throw new Error(`E_BUILD_OUTPUT_OUTSIDE_PROJECT:${requested}`);
  }
  mkdirSync(requested, { recursive: true, mode: 0o700 });
  const canonicalOutput = realpathSync.native(requested);
  const named = lstatSync(requested, { bigint: true });
  const canonical = lstatSync(canonicalOutput, { bigint: true });
  if (!isWithin(canonicalRoot, canonicalOutput)
    || !named.isDirectory()
    || named.isSymbolicLink()
    || !canonical.isDirectory()
    || canonical.isSymbolicLink()
    || named.dev !== canonical.dev
    || named.ino !== canonical.ino) {
    throw new Error(`E_BUILD_OUTPUT_UNSAFE:${requested}`);
  }
  return Object.freeze({
    path: requested,
    canonicalPath: canonicalOutput,
    dev: canonical.dev,
    ino: canonical.ino,
  });
}

function assertDirectoryBinding(
  binding,
  code = 'E_BUILD_OUTPUT_IDENTITY_CHANGED',
) {
  const named = lstatSync(binding.path, { bigint: true });
  const canonical = realpathSync.native(binding.path);
  if (!named.isDirectory()
    || named.isSymbolicLink()
    || canonical !== binding.canonicalPath
    || named.dev !== binding.dev
    || named.ino !== binding.ino) {
    throw new Error(`${code}:${binding.path}`);
  }
}

function bindSourceDirectory(root, sourceDirectory) {
  const canonical = realpathSync.native(sourceDirectory);
  const named = lstatSync(sourceDirectory, { bigint: true });
  const canonicalStat = lstatSync(canonical, { bigint: true });
  if (!isWithin(root, canonical)
    || !named.isDirectory()
    || named.isSymbolicLink()
    || !canonicalStat.isDirectory()
    || canonicalStat.isSymbolicLink()
    || named.dev !== canonicalStat.dev
    || named.ino !== canonicalStat.ino) {
    throw new Error(`E_BUILD_ASSET_SOURCE_UNSAFE:${sourceDirectory}`);
  }
  return Object.freeze({
    path: sourceDirectory,
    canonicalPath: canonical,
    dev: canonicalStat.dev,
    ino: canonicalStat.ino,
  });
}

function readRegularFileIdentityChecked(path, maxBytes = 1024 * 1024) {
  const named = lstatSync(path, { bigint: true });
  if (!named.isFile()
    || named.isSymbolicLink()
    || named.nlink !== 1n
    || named.size > BigInt(maxBytes)) {
    throw new Error(`E_BUILD_IDENTITY_INPUT_UNSAFE:${path}`);
  }
  let fd;
  try {
    fd = openSync(
      path,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()
      || before.nlink !== 1n
      || before.dev !== named.dev
      || before.ino !== named.ino) {
      throw new Error(`E_BUILD_IDENTITY_INPUT_IDENTITY_CHANGED:${path}`);
    }
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const bytesRead = readSync(
        fd,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = fstatSync(fd, { bigint: true });
    if (after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || offset !== bytes.length) {
      throw new Error(`E_BUILD_IDENTITY_INPUT_IDENTITY_CHANGED:${path}`);
    }
    return bytes.toString('utf8');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function listBuildSourceInputs(root) {
  const files = [];
  const visit = (directory, atSourceRoot) => {
    for (const entry of readdirSync(directory).sort()) {
      if (atSourceRoot && SOURCE_INPUT_EXCLUDED_DIRECTORIES.has(entry)) continue;
      const path = join(directory, entry);
      const stat = lstatSync(path, { bigint: true });
      if (stat.isSymbolicLink()) throw new Error(`E_BUILD_SOURCE_SYMLINK:${path}`);
      if (stat.isDirectory()) {
        visit(path, false);
        continue;
      }
      if (!stat.isFile()) continue;
      if (!SOURCE_INPUT_EXTENSIONS.some(extension => entry.endsWith(extension))) continue;
      files.push(path);
      if (files.length > SOURCE_INPUT_FILE_LIMIT) throw new Error('E_BUILD_SOURCE_FILE_LIMIT');
    }
  };
  for (const name of ['package.json', 'tsconfig.json']) {
    const path = join(root, name);
    if (existsSync(path)) files.push(path);
  }
  const source = join(root, 'src');
  if (!existsSync(source)) throw new Error('E_BUILD_SOURCE_TREE_MISSING');
  visit(source, true);
  return files.sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}

export function buildSourceTreeIdentity(root) {
  const canonicalRoot = realpathSync.native(root);
  const files = listBuildSourceInputs(canonicalRoot);
  const hash = createHash('sha256');
  for (const path of files) {
    const relativePath = relative(canonicalRoot, path).split(sep).join('/');
    const content = Buffer.from(
      readRegularFileIdentityChecked(path, SOURCE_INPUT_MAX_BYTES),
      'utf8',
    );
    hash.update(relativePath);
    hash.update('\0');
    hash.update(String(content.byteLength));
    hash.update('\0');
    hash.update(createHash('sha256').update(content).digest('hex'));
    hash.update('\n');
  }
  return Object.freeze({
    sourceTreeSha256: hash.digest('hex'),
    sourceTreeFileCount: files.length,
  });
}

/**
 * Bind a compiled dist tree to the exact source checkout that produced it.
 * The distributable manifest contains only a one-way SHA-256 of the canonical
 * source root — never the build machine's absolute path.
 *
 * @param {string} root project root
 * @param {string} outputDirectory isolated output tree
 * @param {{ packageSourceRoot?: string }} options immutable package source
 * @returns {string} written manifest path
 */
export function writeBuildIdentity(
  root,
  outputDirectory = join(root, 'dist'),
  options = {},
) {
  const canonicalRoot = realpathSync.native(root);
  const outputBinding = bindOutputDirectory(canonicalRoot, outputDirectory);
  const packageSourceRoot = realpathSync.native(
    options.packageSourceRoot ?? canonicalRoot,
  );
  if (packageSourceRoot !== canonicalRoot
    && !isWithin(canonicalRoot, packageSourceRoot)) {
    throw new Error(
      `E_BUILD_IDENTITY_SOURCE_OUTSIDE_PROJECT:${packageSourceRoot}`,
    );
  }
  const pkg = JSON.parse(
    readRegularFileIdentityChecked(join(packageSourceRoot, 'package.json')),
  );
  if (pkg.name !== 'deckent') {
    throw new Error(`Cannot write Deckent build identity: package name is ${String(pkg.name)}`);
  }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('Cannot write Deckent build identity: package version is missing');
  }
  const sourceTree = buildSourceTreeIdentity(canonicalRoot);
  const manifest = {
    schemaVersion: 2,
    packageName: 'deckent',
    packageVersion: pkg.version,
    sourceRootSha256: createHash('sha256').update(canonicalRoot).digest('hex'),
    sourceTreeSha256: sourceTree.sourceTreeSha256,
    sourceTreeFileCount: sourceTree.sourceTreeFileCount,
  };
  assertDirectoryBinding(outputBinding);
  const manifestPath = join(outputBinding.path, 'build-identity.json');
  mkdirSync(dirname(manifestPath), { recursive: true });
  let fd;
  try {
    fd = openSync(
      manifestPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_TRUNC
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(fd, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return manifestPath;
}

/**
 * Ensure all BIN_FILES have execute bit (0o755).
 * Safe to call after bare `tsc` / `tsc --watch` which strips mode bits.
 * @param {string} [root] - project root directory (defaults to this file's parent)
 * @returns {number} count of files chmodded
 */
export function ensureBinExecutable(root, outputDirectory = join(root ?? ROOT, 'dist')) {
  const outputBinding = bindOutputDirectory(root ?? ROOT, outputDirectory);
  let count = 0;
  for (const rel of BIN_FILES) {
    const withinDist = relative('dist', rel);
    if (withinDist.startsWith('..') || isAbsolute(withinDist)) {
      throw new Error(`E_BUILD_BIN_PATH_INVALID:${rel}`);
    }
    assertDirectoryBinding(outputBinding);
    const p = join(outputBinding.path, withinDist);
    if (existsSync(p)) {
      chmodSync(p, 0o755);
      count++;
    }
  }
  return count;
}

function walk(dir) {
  const results = [];
  const entries = readdirSync(dir).sort();
  for (const entry of entries) {
    // Skip dashboard + desktop (separate build pipelines — desktop would otherwise
    // leak its package.json/tsconfig/config manifests into dist/, born-496)
    if (entry === 'dashboard' || entry === 'desktop') continue;
    const full = join(dir, entry);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      throw new Error(`E_BUILD_ASSET_SYMLINK_UNSUPPORTED:${full}`);
    }
    if (stat.isDirectory()) {
      results.push(...walk(full));
    } else if (
      stat.isFile()
      && ASSET_EXTENSIONS.some((ext) => entry.endsWith(ext))
    ) {
      results.push(full);
    }
  }
  return results;
}

function copyAssetIdentityChecked(source, destination) {
  const named = lstatSync(source, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n) {
    throw new Error(`E_BUILD_ASSET_INPUT_UNSAFE:${source}`);
  }
  let sourceFd;
  let destinationFd;
  try {
    sourceFd = openSync(
      source,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(sourceFd, { bigint: true });
    if (!before.isFile()
      || before.nlink !== 1n
      || before.dev !== named.dev
      || before.ino !== named.ino) {
      throw new Error(`E_BUILD_ASSET_INPUT_IDENTITY_CHANGED:${source}`);
    }
    destinationFd = openSync(
      destination,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_TRUNC
        | (fsConstants.O_NOFOLLOW ?? 0),
      Number(before.mode & 0o777n) || 0o600,
    );
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (true) {
      const bytesRead = readSync(sourceFd, buffer, 0, buffer.length, offset);
      if (bytesRead === 0) break;
      let written = 0;
      while (written < bytesRead) {
        const count = writeSync(
          destinationFd,
          buffer,
          written,
          bytesRead - written,
        );
        if (count <= 0) {
          throw new Error(`E_BUILD_ASSET_WRITE_FAILED:${destination}`);
        }
        written += count;
      }
      offset += bytesRead;
    }
    fsyncSync(destinationFd);
    const after = fstatSync(sourceFd, { bigint: true });
    if (after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || BigInt(offset) !== before.size) {
      throw new Error(`E_BUILD_ASSET_INPUT_IDENTITY_CHANGED:${source}`);
    }
  } finally {
    if (destinationFd !== undefined) closeSync(destinationFd);
    if (sourceFd !== undefined) closeSync(sourceFd);
  }
}

function resolveOutputDirectory(rawValue) {
  const candidate = rawValue
    ? resolve(ROOT, rawValue)
    : DEFAULT_DIST;
  const rel = relative(ROOT, candidate);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('E_BUILD_OUTPUT_OUTSIDE_PROJECT');
  }
  return candidate;
}

function parseOutputDirectory(argv) {
  const index = argv.indexOf('--output-dir');
  if (index < 0) return DEFAULT_DIST;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('E_BUILD_OUTPUT_ARGUMENT_INVALID');
  }
  if (argv.indexOf('--output-dir', index + 1) >= 0) {
    throw new Error('E_BUILD_OUTPUT_ARGUMENT_DUPLICATE');
  }
  return resolveOutputDirectory(value);
}

export function copyAssets(
  root = ROOT,
  outputDirectory = join(root, 'dist'),
  options = {},
) {
  const canonicalRoot = realpathSync.native(root);
  const sourceDirectory = join(canonicalRoot, 'src');
  const sourceBinding = bindSourceDirectory(canonicalRoot, sourceDirectory);
  const outputAuthorityRoot = realpathSync.native(
    options.outputAuthorityRoot ?? canonicalRoot,
  );
  const outputBinding = bindOutputDirectory(
    outputAuthorityRoot,
    outputDirectory,
  );
  let copied = 0;
  const assets = walk(sourceDirectory);
  for (const src of assets) {
    options.checkpoint?.();
    assertDirectoryBinding(outputBinding);
    assertDirectoryBinding(
      sourceBinding,
      'E_BUILD_ASSET_SOURCE_IDENTITY_CHANGED',
    );
    const rel = relative(sourceDirectory, src);
    const dst = join(outputBinding.path, rel);
    mkdirSync(dirname(dst), { recursive: true });
    const canonicalParent = realpathSync.native(dirname(dst));
    if (!isWithin(outputBinding.canonicalPath, canonicalParent)
      && canonicalParent !== outputBinding.canonicalPath) {
      throw new Error(`E_BUILD_OUTPUT_PARENT_UNSAFE:${dirname(dst)}`);
    }
    copyAssetIdentityChecked(src, dst);
    copied++;
  }
  return copied;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const fixBinOnly = process.argv.includes('--fix-bin-only');
    const outputDirectory = parseOutputDirectory(process.argv.slice(2));
    const copied = fixBinOnly ? 0 : copyAssets(ROOT, outputDirectory);
    if (!fixBinOnly) {
      writeBuildIdentity(ROOT, outputDirectory);
    }
    // Sprint 154 A2.F6/A3.F1 fix: tsc does not propagate Unix mode bits, so
    // compiled bin files need their executable mode restored.
    const chmodCount = ensureBinExecutable(ROOT, outputDirectory);
    console.log(JSON.stringify({
      schemaVersion: 1,
      event: 'BUILD_ASSETS_COMPLETED',
      outputDirectory: relative(ROOT, outputDirectory),
      copied,
      chmodCount,
      buildIdentityWritten: !fixBinOnly,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      schemaVersion: 1,
      event: 'BUILD_ASSETS_FAILED',
      code: error instanceof Error
        ? error.message.split(':', 1)[0]
        : 'E_BUILD_ASSETS_UNKNOWN',
    }));
    process.exitCode = 1;
  }
}
