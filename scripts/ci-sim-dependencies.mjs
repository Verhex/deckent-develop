import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, lstat, opendir, readlink, realpath, statfs } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

export const CI_SIM_BOOTSTRAP_PATHS = Object.freeze([
  'scripts/ci-sim-capacity.mjs',
  'scripts/ci-sim-dependencies.mjs',
  'scripts/ci-sim-durable-json.mjs',
  'scripts/ci-sim-process.mjs',
  'scripts/ci-sim-receipt.mjs',
  'scripts/ci-sim-runner.mjs',
  'scripts/ci-sim-snapshot.mjs',
  'scripts/ci-sim-state.mjs',
  'scripts/ci-sim-workspace.mjs',
]);

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

async function sortedEntries(dir) {
  const handle = await opendir(dir);
  const entries = [];
  for await (const entry of handle) entries.push(entry);
  return entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
}

async function inspectDependencies(path, rootReal) {
  const actual = await realpath(path);
  const relativePath = relative(rootReal, path).replaceAll('\\', '/') || '.';
  if (!inside(rootReal, actual)) {
    throw new Error(`E_CI_SIM_EXTERNAL_DEPENDENCY:${relativePath}`);
  }
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) return { bytes: Buffer.byteLength(await readlink(path)), files: 1 };
  if (stat.isFile()) return { bytes: stat.size, files: 1 };
  if (!stat.isDirectory()) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  for (const entry of await sortedEntries(path)) {
    if (['.vite', '.cache'].includes(entry.name)) continue;
    const result = await inspectDependencies(join(path, entry.name), rootReal);
    bytes += result.bytes;
    files += result.files;
  }
  return { bytes, files };
}

async function hashTree(path, root, hash, visited = new Set()) {
  const stat = await lstat(path);
  const relativePath = relative(root, path).replaceAll('\\', '/');
  if (stat.isSymbolicLink()) {
    const actual = await realpath(path);
    if (!inside(root, actual)) throw new Error(`E_CI_SIM_EXTERNAL_DEPENDENCY:${relativePath}`);
    hash.update(`L\0${relativePath}\0${await readlink(path)}\0`);
    return;
  }
  if (stat.isFile()) {
    hash.update(`F\0${relativePath}\0${stat.mode & 0o777}\0${stat.size}\0`);
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    hash.update('\0');
    return;
  }
  if (!stat.isDirectory()) throw new Error(`E_CI_SIM_DEPENDENCY_COPY_SPECIAL:${relativePath}`);
  const actual = await realpath(path);
  if (visited.has(actual)) throw new Error(`E_CI_SIM_DEPENDENCY_COPY_CYCLE:${relativePath}`);
  visited.add(actual);
  hash.update(`D\0${relativePath}\0`);
  for (const entry of await sortedEntries(path)) {
    await hashTree(join(path, entry.name), root, hash, visited);
  }
}

export async function cloneDependencies(root, workspace) {
  const sourceLink = join(root, 'node_modules');
  const destination = join(workspace, 'node_modules');
  const source = await realpath(sourceLink).catch(() => null);
  if (!source) throw new Error('E_CI_SIM_NODE_MODULES_MISSING');
  const projection = await inspectDependencies(source, source);
  const filesystem = await statfs(workspace);
  const available = filesystem.bavail * filesystem.bsize;
  if (available < (projection.bytes * 2) + 100_000_000) {
    throw new Error(`E_CI_SIM_DEPENDENCY_SPACE:${projection.bytes}:${available}`);
  }
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    force: false,
    errorOnExist: true,
    filter: path => !/(?:^|[\\/])(?:\.vite|\.cache)(?:[\\/]|$)/u.test(path),
  });
  const hash = createHash('sha256');
  hash.update(`ci-sim-dependencies-v2\0${process.versions.modules}\0${process.platform}\0${process.arch}\0`);
  await hashTree(destination, destination, hash);
  return `sha256:${hash.digest('hex')}:files=${projection.files}:bytes=${projection.bytes}`;
}
