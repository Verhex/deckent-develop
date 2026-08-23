import { createHash, timingSafeEqual } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import Database from 'better-sqlite3';

import { PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION } from './provider-execution-observation-store.js';

const ADOPTION_VERSION = 1 as const;
const DEFAULT_MAX_ROWS = 100_000;
const DEFAULT_PAGE_SIZE = 256;
const HEX_256 = /^[a-f0-9]{64}$/u;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

type CanonicalValue = string | number | boolean | null
  | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };

export type ProviderExecutionObservationAdoptionErrorCode =
  | 'INVALID_PATH'
  | 'SOURCE_NOT_FOUND'
  | 'SYMLINK_PATH'
  | 'UNSUPPORTED_SCHEMA'
  | 'SCHEMA_MISMATCH'
  | 'ROW_LIMIT_EXCEEDED'
  | 'INVALID_ROW'
  | 'MISSING_LEGACY_ROW'
  | 'LEGACY_ROW_MISMATCH'
  | 'UNOWNED_EXTRA_ROW'
  | 'CONCURRENT_CHANGE';

export class ProviderExecutionObservationAdoptionError extends Error {
  constructor(readonly code: ProviderExecutionObservationAdoptionErrorCode) {
    super(code);
    this.name = 'ProviderExecutionObservationAdoptionError';
  }
}

export interface ProviderExecutionObservationAdoptionClock { readonly now: () => Date }
export interface ProviderExecutionObservationAdoptionIds { readonly nextId: () => string }
export interface ProviderExecutionObservationAdoptionBounds {
  readonly maxRows?: number;
  readonly pageSize?: number;
  readonly maxDatabaseBytes?: number;
}

export interface ProviderExecutionObservationAdoptionPaths {
  /** An immutable schema-v1 database or the exact backup retained from it. */
  readonly v1PreimagePath: string;
  /** The receipt-less schema-v2 database whose existing lineage is being adopted. */
  readonly currentDatabasePath: string;
}

export interface ProviderExecutionObservationAdoptionExtraRow {
  readonly executionId: string;
  readonly runId: string;
  readonly retired: boolean;
}

export interface ProviderExecutionObservationAdoptionInspection {
  readonly sourceSchemaVersion: 1;
  readonly targetSchemaVersion: 2;
  readonly sourceDatabaseDigest: string;
  readonly targetDatabaseDigest: string;
  readonly sourceRowLineageDigest: string;
  readonly adoptedLegacyRowLineageDigest: string;
  readonly sourceRowCount: number;
  readonly adoptedLegacyRowCount: number;
  readonly extraRunOwnedRows: readonly ProviderExecutionObservationAdoptionExtraRow[];
}

export interface ProviderExecutionObservationAdoptionPlan {
  readonly version: typeof ADOPTION_VERSION;
  readonly adoptionId: string;
  readonly paths: ProviderExecutionObservationAdoptionPaths;
  readonly sourceDatabaseDigest: string;
  readonly targetDatabaseDigest: string;
  readonly sourceRowLineageDigest: string;
  readonly adoptedLegacyRowLineageDigest: string;
  readonly sourceRowCount: number;
  readonly adoptedLegacyRowCount: number;
  readonly extraRunOwnedRows: readonly ProviderExecutionObservationAdoptionExtraRow[];
  readonly plannedAt: string;
  readonly planDigest: string;
}

export interface ProviderExecutionObservationAdoptionReceipt {
  readonly version: typeof ADOPTION_VERSION;
  readonly receiptId: string;
  readonly adoptionId: string;
  readonly planDigest: string;
  readonly sourceDatabaseDigest: string;
  readonly targetDatabaseDigest: string;
  readonly sourceRowLineageDigest: string;
  readonly adoptedLegacyRowLineageDigest: string;
  readonly adoptedLegacyRowCount: number;
  readonly extraRunOwnedRows: readonly ProviderExecutionObservationAdoptionExtraRow[];
  /** Makes explicit that this receipt records verification, not a migration performed now. */
  readonly databaseMutation: 'none';
  readonly verifiedAt: string;
  readonly receiptDigest: string;
}

interface IntervalRow {
  readonly execution_id: string;
  readonly task_id: string;
  readonly attempt_id: string;
  readonly principal_digest: string;
  readonly fence: string;
  readonly start_json: string;
  readonly end_json: string | null;
  readonly start_sequence: number;
  readonly end_sequence: number | null;
  readonly run_id?: string | null;
  readonly retired?: number;
}

interface ColumnRow {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly dflt_value: string | null;
  readonly pk: number;
}
type ExpectedColumn = ColumnRow;
interface ContradictionRow {
  readonly contradiction_id: number;
  readonly principal_digest: string;
  readonly payload_json: string;
}

function isCanonicalArray(value: CanonicalValue): value is readonly CanonicalValue[] {
  return Array.isArray(value);
}

function canonical(value: CanonicalValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (isCanonicalArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`;
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function equalDigest(left: string, right: string): boolean {
  return HEX_256.test(left) && HEX_256.test(right)
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function iso(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new TypeError('invalid injected clock');
  return date.toISOString();
}

function identifier(value: string): string {
  if (!IDENTITY.test(value)) throw new TypeError('invalid injected identifier');
  return value;
}

function bounds(input: ProviderExecutionObservationAdoptionBounds): Required<ProviderExecutionObservationAdoptionBounds> {
  const result = {
    maxRows: input.maxRows ?? DEFAULT_MAX_ROWS,
    pageSize: input.pageSize ?? DEFAULT_PAGE_SIZE,
    maxDatabaseBytes: input.maxDatabaseBytes ?? Number.MAX_SAFE_INTEGER,
  };
  if (Object.values(result).some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw new TypeError('adoption bounds must be positive safe integers');
  }
  return result;
}

function normalizePaths(paths: ProviderExecutionObservationAdoptionPaths): ProviderExecutionObservationAdoptionPaths {
  if (paths.v1PreimagePath.trim() === '' || paths.currentDatabasePath.trim() === '') {
    throw new ProviderExecutionObservationAdoptionError('INVALID_PATH');
  }
  const normalized = Object.freeze({
    v1PreimagePath: resolve(paths.v1PreimagePath),
    currentDatabasePath: resolve(paths.currentDatabasePath),
  });
  if (normalized.v1PreimagePath === normalized.currentDatabasePath) {
    throw new ProviderExecutionObservationAdoptionError('INVALID_PATH');
  }
  return normalized;
}

function column(
  name: string,
  type: string,
  notnull: number,
  pk = 0,
  dflt_value: string | null = null,
): ExpectedColumn {
  return { name, type, notnull, dflt_value, pk };
}

function exactColumns(actual: readonly ColumnRow[], expected: readonly ExpectedColumn[]): boolean {
  const normalize = (columns: readonly ColumnRow[]) => columns.map(columnRow => ({
    name: columnRow.name,
    type: columnRow.type.toUpperCase(),
    notnull: columnRow.notnull,
    dflt_value: columnRow.dflt_value,
    pk: columnRow.pk,
  }));
  return canonical(normalize(actual)) === canonical(normalize(expected));
}

function openExact(path: string, expectedVersion: 1 | 2): Database.Database {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version !== expectedVersion) {
      throw new ProviderExecutionObservationAdoptionError('UNSUPPORTED_SCHEMA');
    }
    const columns = db.pragma('table_info(provider_execution_intervals)') as ColumnRow[];
    const contradictionColumns = db.pragma('table_info(provider_execution_contradictions)') as ColumnRow[];
    const v1 = [
      column('execution_id', 'TEXT', 0, 1),
      column('task_id', 'TEXT', 1),
      column('attempt_id', 'TEXT', 1),
      column('principal_digest', 'TEXT', 1),
      column('fence', 'TEXT', 1),
      column('start_json', 'TEXT', 1),
      column('end_json', 'TEXT', 0),
      column('start_sequence', 'INTEGER', 1),
      column('end_sequence', 'INTEGER', 0),
    ] as const;
    const freshV2 = [v1[0], column('run_id', 'TEXT', 0), ...v1.slice(1), column('retired', 'INTEGER', 1, 0, '0')];
    const migratedV2 = [...v1, column('run_id', 'TEXT', 0), column('retired', 'INTEGER', 1, 0, '0')];
    const valid = expectedVersion === 1
      ? exactColumns(columns, v1)
      : exactColumns(columns, freshV2) || exactColumns(columns, migratedV2);
    const expectedContradictions = [
      column('contradiction_id', 'INTEGER', 0, 1),
      column('principal_digest', 'TEXT', 1),
      column('payload_json', 'TEXT', 1),
    ];
    if (!valid || !exactColumns(contradictionColumns, expectedContradictions)) {
      throw new ProviderExecutionObservationAdoptionError('SCHEMA_MISMATCH');
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

interface StableFileState {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

function fileState(fd: number): StableFileState {
  const value = fstatSync(fd, { bigint: true });
  if (!value.isFile()) throw new ProviderExecutionObservationAdoptionError('INVALID_PATH');
  return {
    dev: value.dev,
    ino: value.ino,
    mode: value.mode,
    size: value.size,
    mtimeNs: value.mtimeNs,
    ctimeNs: value.ctimeNs,
  };
}

function sameFileState(left: StableFileState, right: StableFileState): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function pathFileState(path: string): StableFileState {
  try {
    const value = lstatSync(path, { bigint: true });
    if (value.isSymbolicLink()) throw new ProviderExecutionObservationAdoptionError('SYMLINK_PATH');
    if (!value.isFile()) throw new ProviderExecutionObservationAdoptionError('INVALID_PATH');
    return {
      dev: value.dev, ino: value.ino, mode: value.mode, size: value.size,
      mtimeNs: value.mtimeNs, ctimeNs: value.ctimeNs,
    };
  } catch (error) {
    if (error instanceof ProviderExecutionObservationAdoptionError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProviderExecutionObservationAdoptionError('SOURCE_NOT_FOUND');
    }
    throw new ProviderExecutionObservationAdoptionError('INVALID_PATH');
  }
}

type WalState = { readonly kind: 'absent' } | ({ readonly kind: 'zero' } & StableFileState);

function walState(path: string): WalState {
  const walPath = `${path}-wal`;
  let entry;
  try {
    entry = lstatSync(walPath, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' };
    throw new ProviderExecutionObservationAdoptionError('INVALID_PATH');
  }
  if (entry.isSymbolicLink()) throw new ProviderExecutionObservationAdoptionError('SYMLINK_PATH');
  if (!entry.isFile()) throw new ProviderExecutionObservationAdoptionError('INVALID_PATH');
  if (entry.size !== 0n) throw new ProviderExecutionObservationAdoptionError('CONCURRENT_CHANGE');
  return {
    kind: 'zero', dev: entry.dev, ino: entry.ino, mode: entry.mode, size: entry.size,
    mtimeNs: entry.mtimeNs, ctimeNs: entry.ctimeNs,
  };
}

function sameWalState(left: WalState, right: WalState): boolean {
  return left.kind === 'absent'
    ? right.kind === 'absent'
    : right.kind === 'zero' && sameFileState(left, right);
}

function openSource(path: string): number {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new ProviderExecutionObservationAdoptionError('SYMLINK_PATH');
    }
    return openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if (error instanceof ProviderExecutionObservationAdoptionError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new ProviderExecutionObservationAdoptionError('SOURCE_NOT_FOUND');
    if (code === 'ELOOP') throw new ProviderExecutionObservationAdoptionError('SYMLINK_PATH');
    throw error;
  }
}

function hashDescriptor(fd: number, expectedSize: bigint): string {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0n;
  while (position < expectedSize) {
    const remaining = expectedSize - position;
    const requested = Number(remaining < BigInt(buffer.length) ? remaining : BigInt(buffer.length));
    const count = readSync(fd, buffer, 0, requested, Number(position));
    if (count === 0) throw new ProviderExecutionObservationAdoptionError('CONCURRENT_CHANGE');
    hash.update(buffer.subarray(0, count));
    position += BigInt(count);
  }
  return hash.digest('hex');
}

interface Snapshot {
  readonly path: string;
  readonly digest: string;
  readonly sourceState: StableFileState;
}

/** Copies through a pinned, no-follow read descriptor; SQLite only ever sees the private copy. */
function stableSnapshot(sourcePath: string, destinationPath: string, limit: number): Snapshot {
  const initialWal = walState(sourcePath);
  const initialPath = pathFileState(sourcePath);
  const sourceFd = openSource(sourcePath);
  let destinationFd: number | undefined;
  try {
    const before = fileState(sourceFd);
    if (!sameFileState(initialPath, before)) {
      throw new ProviderExecutionObservationAdoptionError('CONCURRENT_CHANGE');
    }
    if (before.size > BigInt(limit)) throw new ProviderExecutionObservationAdoptionError('ROW_LIMIT_EXCEEDED');
    destinationFd = openSync(
      destinationPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0n;
    while (position < before.size) {
      const remaining = before.size - position;
      const requested = Number(remaining < BigInt(buffer.length) ? remaining : BigInt(buffer.length));
      const count = readSync(sourceFd, buffer, 0, requested, Number(position));
      if (count === 0) throw new ProviderExecutionObservationAdoptionError('CONCURRENT_CHANGE');
      let written = 0;
      while (written < count) written += writeSync(destinationFd, buffer, written, count - written);
      hash.update(buffer.subarray(0, count));
      position += BigInt(count);
    }
    closeSync(destinationFd);
    destinationFd = undefined;
    const copiedDigest = hash.digest('hex');
    const afterCopy = fileState(sourceFd);
    const afterCopyWal = walState(sourcePath);
    const verifiedDigest = hashDescriptor(sourceFd, before.size);
    const afterVerify = fileState(sourceFd);
    const afterVerifyWal = walState(sourcePath);
    const finalPath = pathFileState(sourcePath);
    if (!sameFileState(before, afterCopy) || !sameFileState(before, afterVerify)
      || !sameFileState(before, finalPath)
      || !sameWalState(initialWal, afterCopyWal) || !sameWalState(initialWal, afterVerifyWal)
      || !equalDigest(copiedDigest, verifiedDigest)) {
      throw new ProviderExecutionObservationAdoptionError('CONCURRENT_CHANGE');
    }
    return { path: destinationPath, digest: copiedDigest, sourceState: before };
  } finally {
    if (destinationFd !== undefined) closeSync(destinationFd);
    closeSync(sourceFd);
  }
}

function readContradictions(
  db: Database.Database,
  configured: ReturnType<typeof bounds>,
): ContradictionRow[] {
  const rows: ContradictionRow[] = [];
  let cursor = 0;
  const statement = db.prepare(`SELECT contradiction_id, principal_digest, payload_json
    FROM provider_execution_contradictions WHERE contradiction_id > ?
    ORDER BY contradiction_id LIMIT ?`);
  while (true) {
    const page = statement.all(cursor, configured.pageSize) as ContradictionRow[];
    if (page.length === 0) break;
    rows.push(...page);
    if (rows.length > configured.maxRows) {
      throw new ProviderExecutionObservationAdoptionError('ROW_LIMIT_EXCEEDED');
    }
    for (const row of page) {
      if (!Number.isSafeInteger(row.contradiction_id) || row.contradiction_id < 1
        || typeof row.principal_digest !== 'string' || typeof row.payload_json !== 'string') {
        throw new ProviderExecutionObservationAdoptionError('INVALID_ROW');
      }
      cursor = row.contradiction_id;
    }
    if (page.length < configured.pageSize) break;
  }
  return rows;
}

function readRows(db: Database.Database, v2: boolean, configured: ReturnType<typeof bounds>): IntervalRow[] {
  const rows: IntervalRow[] = [];
  let cursor = '';
  const statement = db.prepare(`SELECT execution_id, task_id, attempt_id, principal_digest, fence,
    start_json, end_json, start_sequence, end_sequence${v2 ? ', run_id, retired' : ''}
    FROM provider_execution_intervals WHERE execution_id > ? ORDER BY execution_id LIMIT ?`);
  while (true) {
    const page = statement.all(cursor, configured.pageSize) as IntervalRow[];
    if (page.length === 0) break;
    rows.push(...page);
    if (rows.length > configured.maxRows) throw new ProviderExecutionObservationAdoptionError('ROW_LIMIT_EXCEEDED');
    for (const row of page) {
      if (typeof row.execution_id !== 'string' || row.execution_id === ''
        || typeof row.start_json !== 'string' || typeof row.task_id !== 'string'
        || typeof row.attempt_id !== 'string' || typeof row.principal_digest !== 'string'
        || typeof row.fence !== 'string' || !Number.isSafeInteger(row.start_sequence)
        || (row.end_json !== null && typeof row.end_json !== 'string')
        || (row.end_sequence !== null && !Number.isSafeInteger(row.end_sequence))
        || (v2 && row.retired !== 0 && row.retired !== 1)) {
        throw new ProviderExecutionObservationAdoptionError('INVALID_ROW');
      }
      cursor = row.execution_id;
    }
    if (page.length < configured.pageSize) break;
  }
  return rows;
}

function legacyProjection(row: IntervalRow): CanonicalValue {
  return {
    executionId: row.execution_id,
    taskId: row.task_id,
    attemptId: row.attempt_id,
    principalDigest: row.principal_digest,
    fence: row.fence,
    startJson: row.start_json,
    endJson: row.end_json,
    startSequence: row.start_sequence,
    endSequence: row.end_sequence,
  };
}

function lineage(rows: readonly IntervalRow[], contradictions: readonly ContradictionRow[]): string {
  const hash = createHash('sha256');
  for (const row of rows) hash.update(`interval:${canonical(legacyProjection(row))}\n`);
  for (const row of contradictions) {
    hash.update(`contradiction:${canonical({
      contradictionId: row.contradiction_id,
      principalDigest: row.principal_digest,
      payloadJson: row.payload_json,
    })}\n`);
  }
  return hash.digest('hex');
}

function adoptionPlanCanonicalValue(input: {
  readonly version: typeof ADOPTION_VERSION;
  readonly adoptionId: string;
  readonly paths: ProviderExecutionObservationAdoptionPaths;
  readonly inspection: ProviderExecutionObservationAdoptionInspection;
  readonly plannedAt: string;
}): CanonicalValue {
  return {
    version: input.version,
    adoptionId: input.adoptionId,
    paths: {
      v1PreimagePath: input.paths.v1PreimagePath,
      currentDatabasePath: input.paths.currentDatabasePath,
    },
    sourceSchemaVersion: input.inspection.sourceSchemaVersion,
    targetSchemaVersion: input.inspection.targetSchemaVersion,
    sourceDatabaseDigest: input.inspection.sourceDatabaseDigest,
    targetDatabaseDigest: input.inspection.targetDatabaseDigest,
    sourceRowLineageDigest: input.inspection.sourceRowLineageDigest,
    adoptedLegacyRowLineageDigest: input.inspection.adoptedLegacyRowLineageDigest,
    sourceRowCount: input.inspection.sourceRowCount,
    adoptedLegacyRowCount: input.inspection.adoptedLegacyRowCount,
    extraRunOwnedRows: input.inspection.extraRunOwnedRows.map(row => ({
      executionId: row.executionId,
      runId: row.runId,
      retired: row.retired,
    })),
    plannedAt: input.plannedAt,
  };
}

/**
 * Proves v1-to-v2 lineage using two verified private snapshots. Equality is per row and
 * includes the original start/end JSON strings byte-for-byte; counts alone are
 * never accepted. Existing v2-owned rows are returned separately and do not
 * contaminate the adopted legacy lineage.
 */
export function inspectProviderExecutionObservationAdoption(
  inputPaths: ProviderExecutionObservationAdoptionPaths,
  inputBounds: ProviderExecutionObservationAdoptionBounds = {},
): ProviderExecutionObservationAdoptionInspection {
  const paths = normalizePaths(inputPaths);
  const configured = bounds(inputBounds);
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'deckent-observation-adoption-'));
  let source: Database.Database | undefined;
  let target: Database.Database | undefined;
  try {
    chmodSync(temporaryRoot, 0o700);
    const sourceSnapshot = stableSnapshot(
      paths.v1PreimagePath,
      join(temporaryRoot, `source-${basename(paths.v1PreimagePath)}`),
      configured.maxDatabaseBytes,
    );
    const targetSnapshot = stableSnapshot(
      paths.currentDatabasePath,
      join(temporaryRoot, `target-${basename(paths.currentDatabasePath)}`),
      configured.maxDatabaseBytes,
    );
    if (sourceSnapshot.sourceState.dev === targetSnapshot.sourceState.dev
      && sourceSnapshot.sourceState.ino === targetSnapshot.sourceState.ino) {
      throw new ProviderExecutionObservationAdoptionError('INVALID_PATH');
    }
    source = openExact(sourceSnapshot.path, 1);
    target = openExact(targetSnapshot.path, PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION);
    const sourceRows = readRows(source, false, configured);
    const targetRows = readRows(target, true, configured);
    const sourceContradictions = readContradictions(source, configured);
    const targetContradictions = readContradictions(target, configured);
    if (sourceRows.length + sourceContradictions.length > configured.maxRows
      || targetRows.length + targetContradictions.length > configured.maxRows) {
      throw new ProviderExecutionObservationAdoptionError('ROW_LIMIT_EXCEEDED');
    }
    const targetById = new Map(targetRows.map(row => [row.execution_id, row]));
    const adopted: IntervalRow[] = [];
    for (const sourceRow of sourceRows) {
      const targetRow = targetById.get(sourceRow.execution_id);
      if (!targetRow) throw new ProviderExecutionObservationAdoptionError('MISSING_LEGACY_ROW');
      if (targetRow.run_id !== null || targetRow.retired !== 0
        || canonical(legacyProjection(targetRow)) !== canonical(legacyProjection(sourceRow))) {
        throw new ProviderExecutionObservationAdoptionError('LEGACY_ROW_MISMATCH');
      }
      adopted.push(targetRow);
      targetById.delete(sourceRow.execution_id);
    }
    const extras = [...targetById.values()].map(row => {
      if (typeof row.run_id !== 'string' || row.run_id === '') {
        throw new ProviderExecutionObservationAdoptionError('UNOWNED_EXTRA_ROW');
      }
      return Object.freeze({ executionId: row.execution_id, runId: row.run_id, retired: row.retired === 1 });
    }).sort((left, right) => left.executionId.localeCompare(right.executionId));
    if (sourceContradictions.length !== targetContradictions.length) {
      throw new ProviderExecutionObservationAdoptionError(
        sourceContradictions.length > targetContradictions.length
          ? 'MISSING_LEGACY_ROW'
          : 'UNOWNED_EXTRA_ROW',
      );
    }
    for (let index = 0; index < sourceContradictions.length; index += 1) {
      const sourceRow = sourceContradictions[index]!;
      const targetRow = targetContradictions[index]!;
      if (sourceRow.contradiction_id !== targetRow.contradiction_id
        || sourceRow.principal_digest !== targetRow.principal_digest
        || sourceRow.payload_json !== targetRow.payload_json) {
        throw new ProviderExecutionObservationAdoptionError('LEGACY_ROW_MISMATCH');
      }
    }
    const sourceRowCount = sourceRows.length + sourceContradictions.length;
    const adoptedLegacyRowCount = adopted.length + targetContradictions.length;
    return Object.freeze({
      sourceSchemaVersion: 1,
      targetSchemaVersion: PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION,
      sourceDatabaseDigest: sourceSnapshot.digest,
      targetDatabaseDigest: targetSnapshot.digest,
      sourceRowLineageDigest: lineage(sourceRows, sourceContradictions),
      adoptedLegacyRowLineageDigest: lineage(adopted, targetContradictions),
      sourceRowCount,
      adoptedLegacyRowCount,
      extraRunOwnedRows: Object.freeze(extras),
    });
  } finally {
    try {
      target?.close();
    } finally {
      try {
        source?.close();
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    }
  }
}

/** Constructs a deterministic, content-bound proposal; it performs no I/O. */
export function planProviderExecutionObservationAdoption(input: {
  readonly paths: ProviderExecutionObservationAdoptionPaths;
  readonly inspection: ProviderExecutionObservationAdoptionInspection;
  readonly clock: ProviderExecutionObservationAdoptionClock;
  readonly ids: ProviderExecutionObservationAdoptionIds;
}): ProviderExecutionObservationAdoptionPlan {
  const paths = normalizePaths(input.paths);
  const adoptionId = identifier(input.ids.nextId());
  const plannedAt = iso(input.clock.now());
  const core = {
    version: ADOPTION_VERSION,
    adoptionId,
    paths,
    ...input.inspection,
    plannedAt,
  } as const;
  const canonicalValue = adoptionPlanCanonicalValue({
    version: core.version,
    adoptionId: core.adoptionId,
    paths: core.paths,
    inspection: input.inspection,
    plannedAt: core.plannedAt,
  });
  return Object.freeze({ ...core, planDigest: digest(canonical(canonicalValue)) });
}

/**
 * Revalidates the exact plan against current files and returns a canonical
 * verification receipt. It does not open a writable database or write a receipt.
 */
export function verifyProviderExecutionObservationAdoption(input: {
  readonly plan: ProviderExecutionObservationAdoptionPlan;
  readonly clock: ProviderExecutionObservationAdoptionClock;
  readonly ids: ProviderExecutionObservationAdoptionIds;
  readonly bounds?: ProviderExecutionObservationAdoptionBounds;
}): ProviderExecutionObservationAdoptionReceipt {
  const inspection = inspectProviderExecutionObservationAdoption(input.plan.paths, input.bounds);
  const expected = planProviderExecutionObservationAdoption({
    paths: input.plan.paths,
    inspection,
    clock: { now: () => new Date(input.plan.plannedAt) },
    ids: { nextId: () => input.plan.adoptionId },
  });
  if (!equalDigest(expected.planDigest, input.plan.planDigest)) {
    throw new ProviderExecutionObservationAdoptionError('CONCURRENT_CHANGE');
  }
  const receiptId = identifier(input.ids.nextId());
  const core = {
    version: ADOPTION_VERSION,
    receiptId,
    adoptionId: input.plan.adoptionId,
    planDigest: input.plan.planDigest,
    sourceDatabaseDigest: inspection.sourceDatabaseDigest,
    targetDatabaseDigest: inspection.targetDatabaseDigest,
    sourceRowLineageDigest: inspection.sourceRowLineageDigest,
    adoptedLegacyRowLineageDigest: inspection.adoptedLegacyRowLineageDigest,
    adoptedLegacyRowCount: inspection.adoptedLegacyRowCount,
    extraRunOwnedRows: inspection.extraRunOwnedRows,
    databaseMutation: 'none' as const,
    verifiedAt: iso(input.clock.now()),
  };
  return Object.freeze({ ...core, receiptDigest: providerExecutionObservationAdoptionReceiptDigest(core) });
}

type ProviderExecutionObservationAdoptionReceiptBody = Omit<
  ProviderExecutionObservationAdoptionReceipt,
  'receiptDigest'
>;

/** Exact canonical digest shared by verification and durable receipt readback. */
export function providerExecutionObservationAdoptionReceiptDigest(
  receipt: ProviderExecutionObservationAdoptionReceiptBody,
): string {
  const canonicalValue: CanonicalValue = {
    version: receipt.version,
    receiptId: receipt.receiptId,
    adoptionId: receipt.adoptionId,
    planDigest: receipt.planDigest,
    sourceDatabaseDigest: receipt.sourceDatabaseDigest,
    targetDatabaseDigest: receipt.targetDatabaseDigest,
    sourceRowLineageDigest: receipt.sourceRowLineageDigest,
    adoptedLegacyRowLineageDigest: receipt.adoptedLegacyRowLineageDigest,
    adoptedLegacyRowCount: receipt.adoptedLegacyRowCount,
    extraRunOwnedRows: receipt.extraRunOwnedRows.map(row => ({
      executionId: row.executionId,
      runId: row.runId,
      retired: row.retired,
    })),
    databaseMutation: receipt.databaseMutation,
    verifiedAt: receipt.verifiedAt,
  };
  return digest(canonical(canonicalValue));
}

/** Constant-time exact receipt-digest validation for durable-store consumers. */
export function validateProviderExecutionObservationAdoptionReceiptDigest(
  receipt: ProviderExecutionObservationAdoptionReceipt,
): boolean {
  const { receiptDigest, ...body } = receipt;
  return equalDigest(receiptDigest, providerExecutionObservationAdoptionReceiptDigest(body));
}
