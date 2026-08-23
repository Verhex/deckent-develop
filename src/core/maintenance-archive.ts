/**
 * Immutable, content-addressed storage for non-sprint operational evidence.
 *
 * There is deliberately no "latest" file.  A caller keeps the returned
 * manifest path (and digest) as its durable authority for verification or
 * replay.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  chmodSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const MAINTENANCE_ARCHIVE_MANIFEST_KIND = 'deckent.maintenance-archive-manifest';
export const MAINTENANCE_ARCHIVE_MANIFEST_VERSION = 1 as const;
export const DEFAULT_MAINTENANCE_ARCHIVE_ROOT = '.deckent/archive/maintenance';

const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const READ_BUFFER_BYTES = 1024 * 1024;

export interface MaintenanceArchiveManifest {
  readonly kind: typeof MAINTENANCE_ARCHIVE_MANIFEST_KIND;
  readonly schemaVersion: typeof MAINTENANCE_ARCHIVE_MANIFEST_VERSION;
  readonly algorithm: 'sha256';
  readonly contentDigest: string;
  readonly bytes: number;
  /** Permission bits needed for an exact replay; file-type bits are excluded. */
  readonly mode: number;
  /** Project-relative origin, never an absolute host path. */
  readonly source: string;
  /** Caller-owned lineage identity (for example an operation or receipt id). */
  readonly lineage: string;
  /** Project-relative immutable content path. */
  readonly contentPath: string;
  /** Digest over the canonical manifest fields above. */
  readonly manifestDigest: string;
}

export interface PublishMaintenanceArchiveOptions {
  readonly source: string;
  readonly lineage: string;
  readonly retireSource?: boolean;
  readonly archiveRoot?: string;
}

export interface MaintenanceArchivePublication {
  readonly state: 'published' | 'deduplicated';
  readonly contentPath: string;
  readonly manifestPath: string;
  readonly contentDigest: string;
  readonly manifestDigest: string;
  readonly sourceRetired: boolean;
  readonly manifest: MaintenanceArchiveManifest;
}

export interface MaintenanceArchiveVerification {
  readonly ok: boolean;
  readonly manifestDigestValid: boolean;
  readonly contentDigestValid: boolean;
  readonly modeValid: boolean;
  readonly manifest: MaintenanceArchiveManifest | null;
}

function portable(path: string): string {
  return path.split(sep).join('/');
}

function safeRelativePath(value: string, label: string): string {
  if (value.length === 0 || isAbsolute(value) || value.includes('\0')) {
    throw new Error(`MAINTENANCE_ARCHIVE_INVALID_${label.toUpperCase()}`);
  }
  const normalized = portable(value).replace(/^\.\//u, '');
  if (normalized === '' || normalized === '.' || normalized.split('/').some(part => part === '..' || part === '')) {
    throw new Error(`MAINTENANCE_ARCHIVE_INVALID_${label.toUpperCase()}`);
  }
  return normalized;
}

function withinProject(projectRoot: string, value: string, label: string): string {
  const relativePath = safeRelativePath(value, label);
  const root = resolve(projectRoot);
  const absolute = resolve(root, relativePath);
  const projected = relative(root, absolute);
  if (projected === '' || projected.startsWith(`..${sep}`) || projected === '..' || isAbsolute(projected)) {
    throw new Error(`MAINTENANCE_ARCHIVE_PATH_ESCAPE:${label}`);
  }
  return absolute;
}

/** Reject symlinks in every existing component, including the leaf. */
function assertNoSymlink(root: string, absolutePath: string): void {
  const projected = relative(root, absolutePath);
  let cursor = root;
  for (const part of projected.split(sep)) {
    if (!part) continue;
    cursor = join(cursor, part);
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error('symlink');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new Error(`MAINTENANCE_ARCHIVE_SYMLINK_REJECTED:${portable(projected)}`);
    }
  }
}

function hashOpenFile(path: string): { digest: string; bytes: number } {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES);
  let bytes = 0;
  try {
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      bytes += count;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(fd);
  }
  return { digest: hash.digest('hex'), bytes };
}

function manifestProjection(manifest: Omit<MaintenanceArchiveManifest, 'manifestDigest'>): string {
  return JSON.stringify(manifest);
}

function manifestDigest(manifest: Omit<MaintenanceArchiveManifest, 'manifestDigest'>): string {
  return createHash('sha256').update(manifestProjection(manifest)).digest('hex');
}

function fsyncPath(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function publishImmutable(path: string, bytes: Buffer, mode: number): boolean {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  assertNoSymlink(resolve(dirname(dirname(dirname(dirname(path))))), path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', mode);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    try {
      linkSync(temporary, path);
      fsyncPath(path);
      fsyncPath(dirname(path));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      return false;
    }
  } finally {
    try { unlinkSync(temporary); } catch { /* publication outcome is authoritative */ }
  }
}

function parseManifest(bytes: Buffer): MaintenanceArchiveManifest | null {
  try {
    const value = JSON.parse(bytes.toString('utf8')) as Partial<MaintenanceArchiveManifest>;
    if (value.kind !== MAINTENANCE_ARCHIVE_MANIFEST_KIND
      || value.schemaVersion !== MAINTENANCE_ARCHIVE_MANIFEST_VERSION
      || value.algorithm !== 'sha256'
      || typeof value.contentDigest !== 'string' || !DIGEST_PATTERN.test(value.contentDigest)
      || typeof value.manifestDigest !== 'string' || !DIGEST_PATTERN.test(value.manifestDigest)
      || typeof value.bytes !== 'number' || !Number.isSafeInteger(value.bytes) || value.bytes < 0
      || typeof value.mode !== 'number' || !Number.isInteger(value.mode) || value.mode < 0 || value.mode > 0o777
      || typeof value.source !== 'string' || typeof value.lineage !== 'string'
      || typeof value.contentPath !== 'string') return null;
    safeRelativePath(value.source, 'source');
    safeRelativePath(value.contentPath, 'content');
    if (value.lineage.trim() === '') return null;
    return value as MaintenanceArchiveManifest;
  } catch {
    return null;
  }
}

export function publishMaintenanceArchive(
  projectRoot: string,
  options: PublishMaintenanceArchiveOptions,
): MaintenanceArchivePublication {
  const root = resolve(projectRoot);
  const sourceRelative = safeRelativePath(options.source, 'source');
  const sourcePath = withinProject(root, sourceRelative, 'source');
  assertNoSymlink(root, sourcePath);
  const sourceStat = lstatSync(sourcePath);
  if (!sourceStat.isFile()) throw new Error('MAINTENANCE_ARCHIVE_SOURCE_NOT_REGULAR');
  if (options.lineage.trim() === '') throw new Error('MAINTENANCE_ARCHIVE_INVALID_LINEAGE');

  const archiveRelative = safeRelativePath(
    options.archiveRoot ?? DEFAULT_MAINTENANCE_ARCHIVE_ROOT,
    'archive_root',
  );
  const archiveRoot = withinProject(root, archiveRelative, 'archive_root');
  assertNoSymlink(root, archiveRoot);
  const source = hashOpenFile(sourcePath);
  const objectRelative = `${archiveRelative}/objects/sha256/${source.digest.slice(0, 2)}/${source.digest}`;
  const contentRelative = `${objectRelative}/content`;
  const contentPath = withinProject(root, contentRelative, 'content');
  const sourceBytes = readFileSync(sourcePath);
  if (createHash('sha256').update(sourceBytes).digest('hex') !== source.digest) {
    throw new Error('MAINTENANCE_ARCHIVE_SOURCE_CHANGED');
  }
  const contentCreated = publishImmutable(contentPath, sourceBytes, 0o400);
  const contentFresh = hashOpenFile(contentPath);
  if (contentFresh.digest !== source.digest || contentFresh.bytes !== source.bytes) {
    throw new Error('MAINTENANCE_ARCHIVE_PUBLICATION_UNVERIFIED');
  }

  const projection: Omit<MaintenanceArchiveManifest, 'manifestDigest'> = {
    kind: MAINTENANCE_ARCHIVE_MANIFEST_KIND,
    schemaVersion: MAINTENANCE_ARCHIVE_MANIFEST_VERSION,
    algorithm: 'sha256',
    contentDigest: source.digest,
    bytes: source.bytes,
    mode: sourceStat.mode & 0o777,
    source: sourceRelative,
    lineage: options.lineage,
    contentPath: contentRelative,
  };
  const digest = manifestDigest(projection);
  const manifest: MaintenanceArchiveManifest = { ...projection, manifestDigest: digest };
  const manifestRelative = `${objectRelative}/manifests/${digest}.json`;
  const manifestPath = withinProject(root, manifestRelative, 'manifest');
  const manifestCreated = publishImmutable(
    manifestPath,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    0o400,
  );
  const verification = verifyMaintenanceArchive(root, manifestRelative);
  if (!verification.ok) throw new Error('MAINTENANCE_ARCHIVE_MANIFEST_UNVERIFIED');

  let sourceRetired = false;
  if (options.retireSource) {
    const freshStat = lstatSync(sourcePath);
    const fresh = hashOpenFile(sourcePath);
    if (!freshStat.isFile()
      || freshStat.dev !== sourceStat.dev || freshStat.ino !== sourceStat.ino
      || freshStat.size !== sourceStat.size || freshStat.mtimeMs !== sourceStat.mtimeMs
      || (freshStat.mode & 0o777) !== (sourceStat.mode & 0o777)
      || fresh.digest !== source.digest || fresh.bytes !== source.bytes) {
      throw new Error('MAINTENANCE_ARCHIVE_SOURCE_RETIREMENT_UNVERIFIED');
    }
    unlinkSync(sourcePath);
    sourceRetired = true;
  }
  return {
    state: contentCreated || manifestCreated ? 'published' : 'deduplicated',
    contentPath: contentRelative,
    manifestPath: manifestRelative,
    contentDigest: source.digest,
    manifestDigest: digest,
    sourceRetired,
    manifest,
  };
}

export function verifyMaintenanceArchive(
  projectRoot: string,
  manifestRelativePath: string,
): MaintenanceArchiveVerification {
  const root = resolve(projectRoot);
  try {
    const manifestPath = withinProject(root, manifestRelativePath, 'manifest');
    assertNoSymlink(root, manifestPath);
    const manifest = parseManifest(readFileSync(manifestPath));
    if (!manifest) return { ok: false, manifestDigestValid: false, contentDigestValid: false, modeValid: false, manifest: null };
    const { manifestDigest: recordedDigest, ...projection } = manifest;
    const digestValid = manifestDigest(projection) === recordedDigest
      && manifestRelativePath.endsWith(`/manifests/${recordedDigest}.json`);
    const expectedObject = `${DEFAULT_MAINTENANCE_ARCHIVE_ROOT}/objects/sha256/${manifest.contentDigest.slice(0, 2)}/${manifest.contentDigest}/content`;
    const customObjectSuffix = `/objects/sha256/${manifest.contentDigest.slice(0, 2)}/${manifest.contentDigest}/content`;
    const contentPathShapeValid = manifest.contentPath === expectedObject || manifest.contentPath.endsWith(customObjectSuffix);
    const contentPath = withinProject(root, manifest.contentPath, 'content');
    assertNoSymlink(root, contentPath);
    const content = hashOpenFile(contentPath);
    const contentValid = contentPathShapeValid
      && content.digest === manifest.contentDigest && content.bytes === manifest.bytes;
    const archiveMode = statSync(contentPath).mode & 0o777;
    const modeValid = (archiveMode & 0o222) === 0;
    return { ok: digestValid && contentValid && modeValid, manifestDigestValid: digestValid, contentDigestValid: contentValid, modeValid, manifest };
  } catch {
    return { ok: false, manifestDigestValid: false, contentDigestValid: false, modeValid: false, manifest: null };
  }
}

export function replayMaintenanceArchive(
  projectRoot: string,
  manifestRelativePath: string,
  destination: string,
): void {
  const verification = verifyMaintenanceArchive(projectRoot, manifestRelativePath);
  if (!verification.ok || !verification.manifest) throw new Error('MAINTENANCE_ARCHIVE_REPLAY_UNVERIFIED');
  const root = resolve(projectRoot);
  const destinationPath = withinProject(root, destination, 'destination');
  assertNoSymlink(root, destinationPath);
  mkdirSync(dirname(destinationPath), { recursive: true, mode: 0o700 });
  const bytes = readFileSync(withinProject(root, verification.manifest.contentPath, 'content'));
  const fd = openSync(destinationPath, 'wx', verification.manifest.mode);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(destinationPath, verification.manifest.mode);
  const replay = hashOpenFile(destinationPath);
  if (replay.digest !== verification.manifest.contentDigest || replay.bytes !== verification.manifest.bytes) {
    try { unlinkSync(destinationPath); } catch { /* retain verification failure */ }
    throw new Error('MAINTENANCE_ARCHIVE_REPLAY_MISMATCH');
  }
}

/** Naming-compatible explicit artifact entrypoint. */
export const publishMaintenanceArchiveArtifact = publishMaintenanceArchive;
