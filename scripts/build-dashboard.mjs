#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const DASHBOARD_RELATIVE_PATH = join('src', 'dashboard');
const DEFAULT_OUTPUT_RELATIVE_PATH = join('dist', 'dashboard');

function codedError(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  return error;
}

function isWithin(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== ''
    && rel !== '..'
    && !rel.startsWith(`..${sep}`)
    && !isAbsolute(rel);
}

function nearestExistingPath(candidate) {
  const suffix = [];
  let cursor = candidate;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw codedError('E_DASHBOARD_BUILD_OUTPUT_PARENT_MISSING', candidate);
    }
    suffix.unshift(relative(parent, cursor));
    cursor = parent;
  }
  return suffix.reduce(
    (current, component) => join(current, component),
    realpathSync.native(cursor),
  );
}

function bindDirectory(root, directory, code) {
  const canonicalRoot = realpathSync.native(root);
  const canonicalDirectory = realpathSync.native(directory);
  if (!isWithin(canonicalRoot, canonicalDirectory)) {
    throw codedError(code, directory);
  }
  const named = lstatSync(directory, { bigint: true });
  const canonical = lstatSync(canonicalDirectory, { bigint: true });
  if (!named.isDirectory()
    || named.isSymbolicLink()
    || !canonical.isDirectory()
    || canonical.isSymbolicLink()
    || named.dev !== canonical.dev
    || named.ino !== canonical.ino) {
    throw codedError(code, directory);
  }
  return Object.freeze({
    path: directory,
    canonicalPath: canonicalDirectory,
    dev: canonical.dev,
    ino: canonical.ino,
  });
}

function assertDirectoryBinding(binding, code) {
  let named;
  let canonical;
  try {
    named = lstatSync(binding.path, { bigint: true });
    canonical = realpathSync.native(binding.path);
  } catch (error) {
    throw codedError(code, binding.path, error);
  }
  if (!named.isDirectory()
    || named.isSymbolicLink()
    || canonical !== binding.canonicalPath
    || named.dev !== binding.dev
    || named.ino !== binding.ino) {
    throw codedError(code, binding.path);
  }
}

function secureFileDigest(path, code) {
  const named = lstatSync(path, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n) {
    throw codedError(code, path);
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
      throw codedError(code, path);
    }
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (true) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, offset);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const after = fstatSync(fd, { bigint: true });
    if (after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || BigInt(offset) !== before.size) {
      throw codedError(code, path);
    }
    return Object.freeze({
      path: realpathSync.native(path),
      dev: before.dev,
      ino: before.ino,
      size: before.size,
      mtimeNs: before.mtimeNs,
      sha256: hash.digest('hex'),
    });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function assertFileDigest(binding, code) {
  const current = secureFileDigest(binding.path, code);
  if (current.path !== binding.path
    || current.dev !== binding.dev
    || current.ino !== binding.ino
    || current.size !== binding.size
    || current.mtimeNs !== binding.mtimeNs
    || current.sha256 !== binding.sha256) {
    throw codedError(code, binding.path);
  }
}

export function resolveDashboardOutputDirectory(
  root = REPO_ROOT,
  rawOutputDirectory = DEFAULT_OUTPUT_RELATIVE_PATH,
) {
  const canonicalRoot = realpathSync.native(root);
  const requested = resolve(canonicalRoot, rawOutputDirectory);
  const identityBound = nearestExistingPath(requested);
  if (!isWithin(canonicalRoot, identityBound)) {
    throw codedError('E_DASHBOARD_BUILD_OUTPUT_OUTSIDE_PROJECT', requested);
  }
  if (existsSync(requested)) {
    const stat = lstatSync(requested);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw codedError('E_DASHBOARD_BUILD_OUTPUT_UNSAFE', requested);
    }
  }
  return requested;
}

export function resolveDashboardToolchain(
  root = REPO_ROOT,
  toolchainDashboardDirectory,
) {
  const canonicalRoot = realpathSync.native(root);
  const dashboardDirectory = resolve(
    canonicalRoot,
    toolchainDashboardDirectory ?? DASHBOARD_RELATIVE_PATH,
  );
  if (!existsSync(dashboardDirectory)
    || !lstatSync(dashboardDirectory).isDirectory()) {
    throw codedError(
      'E_DASHBOARD_BUILD_SOURCE_MISSING',
      dashboardDirectory,
    );
  }
  const boundToolchainDirectory = bindDirectory(
    canonicalRoot,
    dashboardDirectory,
    'E_DASHBOARD_BUILD_TOOLCHAIN_UNSAFE',
  );
  const typeScriptEntrypoint = join(
    dashboardDirectory,
    'node_modules',
    'typescript',
    'bin',
    'tsc',
  );
  const viteEntrypoint = join(
    dashboardDirectory,
    'node_modules',
    'vite',
    'bin',
    'vite.js',
  );
  for (const [kind, entrypoint] of [
    ['typescript', typeScriptEntrypoint],
    ['vite', viteEntrypoint],
  ]) {
    if (!existsSync(entrypoint) || !lstatSync(entrypoint).isFile()) {
      throw codedError(
        'E_DASHBOARD_BUILD_TOOLCHAIN_MISSING',
        `${kind}:${entrypoint}`,
      );
    }
  }
  const typeScript = secureFileDigest(
    typeScriptEntrypoint,
    'E_DASHBOARD_BUILD_TOOLCHAIN_UNSAFE',
  );
  const vite = secureFileDigest(
    viteEntrypoint,
    'E_DASHBOARD_BUILD_TOOLCHAIN_UNSAFE',
  );
  return Object.freeze({
    dashboardDirectory,
    dashboardDirectoryBinding: boundToolchainDirectory,
    typeScriptEntrypoint: typeScript.path,
    viteEntrypoint: vite.path,
    typeScript,
    vite,
  });
}

export function runDashboardNodeTool(
  entrypoint,
  args,
  cwd,
  options = {},
) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      options.nodeExecutable ?? process.execPath,
      [entrypoint, ...args],
      {
        cwd,
        env: options.env ?? process.env,
        stdio: options.stdio ?? 'inherit',
        shell: false,
        windowsHide: true,
        signal: options.signal,
      },
    );
    child.once('error', error => {
      reject(codedError(
        'E_DASHBOARD_BUILD_PROCESS_START_FAILED',
        error instanceof Error ? error.message : String(error),
      ));
    });
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(codedError(
        'E_DASHBOARD_BUILD_PROCESS_FAILED',
        `exit=${String(code)}:signal=${String(signal)}`,
      ));
    });
  });
}

export async function buildDashboard(options = {}) {
  const root = realpathSync.native(options.root ?? REPO_ROOT);
  const sourceDirectory = resolve(
    root,
    options.sourceDirectory ?? DASHBOARD_RELATIVE_PATH,
  );
  const outputDirectory = resolveDashboardOutputDirectory(
    root,
    options.outputDirectory ?? DEFAULT_OUTPUT_RELATIVE_PATH,
  );
  const toolchain = resolveDashboardToolchain(
    root,
    options.toolchainDashboardDirectory,
  );
  const run = options.run ?? runDashboardNodeTool;
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  if (readdirSync(outputDirectory).length !== 0) {
    throw codedError(
      'E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY',
      outputDirectory,
    );
  }
  const sourceBinding = bindDirectory(
    root,
    sourceDirectory,
    'E_DASHBOARD_BUILD_SOURCE_UNSAFE',
  );
  const outputBinding = bindDirectory(
    root,
    outputDirectory,
    'E_DASHBOARD_BUILD_OUTPUT_UNSAFE',
  );
  const checkpoint = () => {
    assertDirectoryBinding(
      sourceBinding,
      'E_DASHBOARD_BUILD_SOURCE_IDENTITY_CHANGED',
    );
    assertDirectoryBinding(
      outputBinding,
      'E_DASHBOARD_BUILD_OUTPUT_IDENTITY_CHANGED',
    );
    assertDirectoryBinding(
      toolchain.dashboardDirectoryBinding,
      'E_DASHBOARD_BUILD_TOOLCHAIN_IDENTITY_CHANGED',
    );
    assertFileDigest(
      toolchain.typeScript,
      'E_DASHBOARD_BUILD_TOOLCHAIN_IDENTITY_CHANGED',
    );
    assertFileDigest(
      toolchain.vite,
      'E_DASHBOARD_BUILD_TOOLCHAIN_IDENTITY_CHANGED',
    );
  };

  checkpoint();
  await run(
    toolchain.typeScriptEntrypoint,
    [
      '--noEmit',
      '--pretty',
      'false',
      '-p',
      join(sourceDirectory, 'tsconfig.json'),
    ],
    sourceDirectory,
    options,
  );
  checkpoint();
  await run(
    toolchain.typeScriptEntrypoint,
    [
      '--noEmit',
      '--pretty',
      'false',
      '--composite',
      'false',
      '-p',
      join(sourceDirectory, 'tsconfig.node.json'),
    ],
    sourceDirectory,
    options,
  );
  checkpoint();
  await run(
    toolchain.viteEntrypoint,
    [
      'build',
      '--outDir',
      outputDirectory,
    ],
    sourceDirectory,
    options,
  );
  checkpoint();
  return Object.freeze({ outputDirectory });
}

function parseOutputDirectory(argv) {
  const index = argv.indexOf('--output-dir');
  if (index < 0) return DEFAULT_OUTPUT_RELATIVE_PATH;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw codedError('E_DASHBOARD_BUILD_OUTPUT_ARGUMENT_INVALID');
  }
  if (argv.indexOf('--output-dir', index + 1) >= 0) {
    throw codedError('E_DASHBOARD_BUILD_OUTPUT_ARGUMENT_DUPLICATE');
  }
  return value;
}

const invokedDirectly =
  process.argv[1]
  && realpathSync.native(process.argv[1]) === realpathSync.native(SCRIPT_PATH);

if (invokedDirectly) {
  try {
    const result = await buildDashboard({
      outputDirectory: parseOutputDirectory(process.argv.slice(2)),
    });
    console.log(JSON.stringify({
      schemaVersion: 1,
      event: 'DASHBOARD_BUILD_COMPLETED',
      outputDirectory: relative(REPO_ROOT, result.outputDirectory),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      schemaVersion: 1,
      event: 'DASHBOARD_BUILD_FAILED',
      code: error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'E_DASHBOARD_BUILD_UNKNOWN',
    }));
    process.exitCode = 1;
  }
}
