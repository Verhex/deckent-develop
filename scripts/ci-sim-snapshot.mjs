import { createHash } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, readFile, readlink, realpath, rm, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { CI_SIM_BOOTSTRAP_PATHS } from './ci-sim-dependencies.mjs';
import { runProcess } from './ci-sim-process.mjs';
export const PROTECTED_PATHS = Object.freeze([
  '.analysis', '.brain/analysis', '.brain/memory.db', '.brain/memory.db-wal',
  '.brain/memory.db-shm', '.deck', '.deckent/autonomous', '.deckent/config.json',
  '.deckent/recovery-snapshots', '.deckent/runtime',
  '.deckent/settings/resource-log.jsonl', '.locks', '.tasks',
]);
export function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
function safePath(path) {
  if (!path || isAbsolute(path) || path.split(/[\\/]/u).includes('..')) {
    throw new Error(`E_CI_SIM_UNSAFE_PATH:${path}`);
  }
  return path.replaceAll('\\', '/').replace(/^\.\//u, '');
}
function protectedPath(path, extra = []) {
  const normalized = safePath(path);
  return [...PROTECTED_PATHS, ...extra].some(prefix => (
    normalized === prefix || normalized.startsWith(`${prefix}/`)
  ));
}
async function git(root, args, options = {}) {
  const { gitArgsPrefix = [], ...processOptions } = options;
  const result = await runProcess('git', [...gitArgsPrefix, ...args], {
    cwd: root, ...processOptions,
  });
  if (result.code !== 0) {
    throw new Error(`E_CI_SIM_GIT:${args.join(' ')}:${result.stderr.trim()}`);
  }
  return result.stdout;
}
function pathspecs(extraProtected = []) {
  return ['.', ...[...PROTECTED_PATHS, ...extraProtected]
    .flatMap(path => [`:(exclude)${path}`, `:(exclude)${path}/**`])];
}
async function selectedUntracked(root, selectors, extraProtected, gitOptions = {}) {
  const raw = await git(root, ['ls-files', '--others', '--exclude-standard', '-z'], gitOptions);
  const available = raw.split('\0').filter(Boolean).map(safePath).sort();
  const chosen = [];
  const bootstrap = CI_SIM_BOOTSTRAP_PATHS.filter(path => available.includes(path));
  for (const selectorValue of [...bootstrap, ...selectors]) {
    const selector = safePath(selectorValue).replace(/\/$/u, '');
    if (protectedPath(selector, extraProtected)) {
      throw new Error(`E_CI_SIM_PROTECTED_PATH:${selector}`);
    }
    const matches = available.filter(path => path === selector || path.startsWith(`${selector}/`));
    if (matches.length === 0) throw new Error(`E_CI_SIM_UNTRACKED_NOT_FOUND:${selector}`);
    chosen.push(...matches);
  }
  return { chosen: [...new Set(chosen)].sort(), available };
}
async function describeFiles(root, paths, extraProtected = []) {
  const entries = [];
  for (const path of paths) {
    if (protectedPath(path, extraProtected)) throw new Error(`E_CI_SIM_PROTECTED_PATH:${path}`);
    await assertContainedSymlink(root, path);
    const absolute = resolve(root, path);
    if (!inside(root, absolute)) throw new Error(`E_CI_SIM_UNSAFE_PATH:${path}`);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) {
      const target = await readlink(absolute);
      entries.push({ path, kind: 'symlink', target });
    } else if (stat.isFile()) {
      entries.push({ path, kind: 'file', mode: stat.mode & 0o777,
        size: stat.size, hash: digest(await readFile(absolute)) });
    } else {
      throw new Error(`E_CI_SIM_UNSUPPORTED_UNTRACKED:${path}`);
    }
  }
  return entries;
}
async function describeTracked(root, paths) {
  const entries = [];
  for (const path of paths) {
    await assertContainedSymlink(root, path);
    const absolute = resolve(root, path);
    let stat;
    try { stat = await lstat(absolute); } catch (error) {
      if (error?.code === 'ENOENT') {
        entries.push({ path, kind: 'deleted' });
        continue;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      const target = await readlink(absolute);
      entries.push({ path, kind: 'symlink', target, hash: digest(target) });
    } else if (stat.isFile()) entries.push({
      path, kind: 'file', size: stat.size, hash: digest(await readFile(absolute)),
    });
    else entries.push({ path, kind: 'other' });
  }
  return entries;
}

export async function captureSourceSnapshot(root, options = {}) {
  const gitOptions = {
    ...(options.gitEnv ? { env: options.gitEnv } : {}),
    gitArgsPrefix: options.gitArgsPrefix ?? [],
  };
  const extraProtected = (options.protectedPaths ?? []).map(safePath);
  const specs = pathspecs(extraProtected);
  const head = (await git(root, ['rev-parse', 'HEAD'], gitOptions)).trim();
  const patch = await git(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', head, '--', ...specs,
  ], gitOptions);
  const namesRaw = await git(root, ['diff', '--name-only', '-z', head, '--', ...specs], gitOptions);
  const trackedNames = namesRaw.split('\0').filter(Boolean).map(safePath).sort();
  const tracked = await describeTracked(root, trackedNames);
  const allTrackedRaw = await git(root, ['diff', '--name-only', '-z', head, '--', '.'], gitOptions);
  const skippedTracked = allTrackedRaw.split('\0').filter(Boolean).map(safePath)
    .filter(path => protectedPath(path, extraProtected)).sort();
  const selected = await selectedUntracked(
    root, options.includeUntracked ?? [], extraProtected, gitOptions,
  );
  const untrackedPaths = selected.chosen;
  const untracked = await describeFiles(root, untrackedPaths, extraProtected);
  const omittedUntracked = selected.available.filter(path => !untrackedPaths.includes(path));
  return {
    head, patch, tracked, skippedTracked, untracked, omittedUntracked, extraProtected,
    gitEnv: options.gitEnv, gitArgsPrefix: options.gitArgsPrefix,
  };
}

export async function applySourceSnapshot(root, workspace, snapshot) {
  if (snapshot.patch.trim()) {
    await git(workspace, ['apply', '--whitespace=nowarn', '-'], {
      input: snapshot.patch, env: snapshot.gitEnv,
      gitArgsPrefix: snapshot.gitArgsPrefix,
    });
  }
  for (const entry of snapshot.untracked) {
    const source = resolve(root, entry.path);
    const destination = resolve(workspace, entry.path);
    await mkdir(dirname(destination), { recursive: true });
    if (entry.kind === 'symlink') await symlink(entry.target, destination);
    else {
      await copyFile(source, destination);
      await chmod(destination, entry.mode);
    }
  }
  for (const path of [...PROTECTED_PATHS, ...snapshot.extraProtected]) {
    const target = resolve(workspace, path);
    if (target === resolve(workspace) || !inside(resolve(workspace), target)) {
      throw new Error(`E_CI_SIM_PROTECTED_PATH:${path}`);
    }
    await rm(target, { recursive: true, force: true });
  }
}

async function assertContainedSymlink(workspace, path) {
  const segments = safePath(path).split('/');
  for (let index = 1; index <= segments.length; index += 1) {
    const candidate = resolve(workspace, ...segments.slice(0, index));
    let stat;
    try { stat = await lstat(candidate); } catch { break; }
    if (!stat.isSymbolicLink()) continue;
    let target;
    try { target = await realpath(candidate); } catch {
      throw new Error(`E_CI_SIM_DANGLING_SYMLINK:${path}`);
    }
    if (!inside(workspace, target)) throw new Error(`E_CI_SIM_EXTERNAL_SYMLINK:${path}`);
  }
}

export async function validateSnapshotTree(workspace, snapshot) {
  const raw = await git(workspace, ['ls-files', '-z'], {
    env: snapshot.gitEnv, gitArgsPrefix: snapshot.gitArgsPrefix,
  });
  const trackedPaths = raw.split('\0').filter(Boolean).map(safePath).sort();
  const paths = [...trackedPaths, ...snapshot.untracked.map(item => item.path)];
  for (const path of paths) await assertContainedSymlink(workspace, path);
  const copiedUntracked = await describeFiles(
    workspace, snapshot.untracked.map(item => item.path), snapshot.extraProtected,
  );
  if (JSON.stringify(copiedUntracked) !== JSON.stringify(snapshot.untracked)) {
    throw new Error('E_CI_SIM_UNTRACKED_COPY_MISMATCH');
  }
  const executedTree = {
    tracked: await describeTracked(workspace, trackedPaths), untracked: copiedUntracked,
  };
  return `sha256:${digest(JSON.stringify(executedTree))}`;
}

export async function verifyStableSnapshot(root, before, options = {}) {
  const after = await captureSourceSnapshot(root, options);
  if (before.head !== after.head || before.patch !== after.patch
    || JSON.stringify(before.untracked) !== JSON.stringify(after.untracked)) {
    throw new Error('E_CI_SIM_WORKTREE_CHANGED_DURING_SNAPSHOT');
  }
}
