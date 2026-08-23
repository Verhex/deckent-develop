import { createHash, timingSafeEqual } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import Database from 'better-sqlite3';

import { PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION } from './provider-execution-observation-store.js';

const MIGRATION_VERSION = 1 as const;
const SOURCE_SCHEMA_VERSION = 1 as const;
const DEFAULT_ROW_LIMIT = 100_000;
const DEFAULT_PAGE_SIZE = 256;
const DEFAULT_DATABASE_BYTES = 1_073_741_824;
const HEX_256 = /^[a-f0-9]{64}$/u;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

type JsonScalar = string | number | boolean | null;
type CanonicalValue = JsonScalar | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };

export type ProviderExecutionObservationMigrationErrorCode =
  | 'INVALID_PATH'
  | 'PATH_ESCAPE'
  | 'SYMLINK_PATH'
  | 'SOURCE_NOT_FOUND'
  | 'UNSUPPORTED_SCHEMA'
  | 'SCHEMA_MISMATCH'
  | 'ROW_LIMIT_EXCEEDED'
  | 'INVALID_ROW'
  | 'AUTHORITY_REQUIRED'
  | 'AUTHORITY_DENIED'
  | 'AUTHORITY_MISMATCH'
  | 'AUTHORITY_EXPIRED'
  | 'BACKUP_VERIFICATION_FAILED'
  | 'CONCURRENT_CHANGE'
  | 'APPLY_FAILED'
  | 'RECEIPT_WRITE_FAILED';

export class ProviderExecutionObservationMigrationError extends Error {
  constructor(
    readonly code: ProviderExecutionObservationMigrationErrorCode,
    readonly causeValue?: unknown,
  ) {
    super(code);
    this.name = 'ProviderExecutionObservationMigrationError';
  }
}

export interface ProviderExecutionObservationMigrationClock {
  readonly now: () => Date;
}

export interface ProviderExecutionObservationMigrationIds {
  readonly nextId: () => string;
}

export interface ProviderExecutionObservationMigrationPath {
  readonly projectRoot: string;
  readonly relativeDatabasePath: string;
  readonly databasePath: string;
}

export interface ProviderExecutionObservationMigrationInspection {
  readonly state: 'migration-required' | 'current';
  readonly sourceSchemaVersion: 1 | 2;
  readonly targetSchemaVersion: 2;
  readonly schemaDigest: string;
  readonly rowLineageDigest: string;
  readonly rowCount: number;
  readonly databaseBytes: number;
}

export interface ProviderExecutionObservationMigrationPlan {
  readonly version: typeof MIGRATION_VERSION;
  readonly migrationId: string;
  readonly projectPath: ProviderExecutionObservationMigrationPath;
  readonly sourceSchemaVersion: 1 | 2;
  readonly targetSchemaVersion: 2;
  readonly sourceSchemaDigest: string;
  readonly sourceRowLineageDigest: string;
  readonly sourceRowCount: number;
  readonly sourceDatabaseBytes: number;
  readonly plannedAt: string;
  readonly planDigest: string;
}

export type ProviderExecutionObservationMigrationAuthority =
  | {
    readonly decision: 'deny';
    readonly authorityId: string;
  }
  | {
    readonly decision: 'allow';
    readonly authorityId: string;
    readonly migrationId: string;
    readonly planDigest: string;
    readonly projectRoot: string;
    readonly relativeDatabasePath: string;
    readonly sourceSchemaDigest: string;
    readonly sourceRowLineageDigest: string;
    readonly expiresAt: string;
  };

export interface ProviderExecutionObservationMigrationReceipt {
  readonly version: typeof MIGRATION_VERSION;
  readonly receiptId: string;
  readonly migrationId: string;
  readonly authorityId: string;
  readonly planDigest: string;
  readonly sourceSchemaDigest: string;
  readonly sourceRowLineageDigest: string;
  readonly targetSchemaDigest: string;
  readonly targetRowLineageDigest: string;
  readonly rowCount: number;
  readonly backupRelativePath: string;
  readonly backupDigest: string;
  readonly appliedAt: string;
}

export type ProviderExecutionObservationMigrationApplyResult =
  | { readonly state: 'already-current'; readonly inspection: ProviderExecutionObservationMigrationInspection }
  | {
    readonly state: 'applied';
    readonly receipt: ProviderExecutionObservationMigrationReceipt;
    readonly receiptPath: string;
    readonly backupPath: string;
  };

export interface ProviderExecutionObservationMigrationBounds {
  readonly maxRows?: number;
  readonly pageSize?: number;
  readonly maxDatabaseBytes?: number;
}

interface ColumnRow {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly dflt_value: string | null;
  readonly pk: number;
}

interface IndexListRow { readonly name: string; readonly unique: number }
interface IndexColumnRow { readonly seqno: number; readonly name: string }
interface LineageRow {
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
interface ContradictionLineageRow {
  readonly contradiction_id: number;
  readonly principal_digest: string;
  readonly payload_json: string;
}

interface ExpectedColumn {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly dflt_value: string | null;
  readonly pk: number;
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

function canonicalIso(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new TypeError('invalid injected clock');
  return date.toISOString();
}

function assertIdentity(value: string): void {
  if (!IDENTITY.test(value)) throw new TypeError('invalid injected identifier');
}

function assertBounds(bounds: ProviderExecutionObservationMigrationBounds): Required<ProviderExecutionObservationMigrationBounds> {
  const resolvedBounds = {
    maxRows: bounds.maxRows ?? DEFAULT_ROW_LIMIT,
    pageSize: bounds.pageSize ?? DEFAULT_PAGE_SIZE,
    maxDatabaseBytes: bounds.maxDatabaseBytes ?? DEFAULT_DATABASE_BYTES,
  };
  for (const value of Object.values(resolvedBounds)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('migration bounds must be positive safe integers');
  }
  return resolvedBounds;
}

/** Pure lexical projection: only a caller-supplied project-relative database is accepted. */
export function safeProviderExecutionObservationProjectPath(
  projectRoot: string,
  relativeDatabasePath: string,
): ProviderExecutionObservationMigrationPath {
  if (projectRoot.trim() === '' || relativeDatabasePath.trim() === '' || isAbsolute(relativeDatabasePath)) {
    throw new ProviderExecutionObservationMigrationError('INVALID_PATH');
  }
  const root = resolve(projectRoot);
  const databasePath = resolve(root, relativeDatabasePath);
  const within = relative(root, databasePath);
  if (within === '' || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new ProviderExecutionObservationMigrationError('PATH_ESCAPE');
  }
  return Object.freeze({ projectRoot: root, relativeDatabasePath: within, databasePath });
}

function assertCanonicalProjectPath(path: ProviderExecutionObservationMigrationPath): void {
  const canonicalPath = safeProviderExecutionObservationProjectPath(
    path.projectRoot,
    path.relativeDatabasePath,
  );
  if (path.projectRoot !== canonicalPath.projectRoot
    || path.relativeDatabasePath !== canonicalPath.relativeDatabasePath
    || path.databasePath !== canonicalPath.databasePath) {
    throw new ProviderExecutionObservationMigrationError('INVALID_PATH');
  }
}

function assertNoSymlinkPath(path: ProviderExecutionObservationMigrationPath): void {
  const root = realpathSync(path.projectRoot);
  const parent = realpathSync(dirname(path.databasePath));
  const within = relative(root, parent);
  if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new ProviderExecutionObservationMigrationError('PATH_ESCAPE');
  }
  if (lstatSync(path.databasePath).isSymbolicLink()) {
    throw new ProviderExecutionObservationMigrationError('SYMLINK_PATH');
  }
}

function tableSchemaProjection(
  db: Database.Database,
  table: 'provider_execution_contradictions' | 'provider_execution_intervals',
) {
    const columns = db.pragma(`table_info(${table})`) as ColumnRow[];
    const indexes = (db.pragma(`index_list(${table})`) as IndexListRow[])
      .filter(index => !index.name.startsWith('sqlite_autoindex_'))
      .map(index => ({
        name: index.name,
        unique: index.unique,
        columns: (db.pragma(`index_info(${JSON.stringify(index.name)})`) as IndexColumnRow[])
          .sort((a, b) => a.seqno - b.seqno).map(column => column.name),
      })).sort((a, b) => a.name.localeCompare(b.name));
    return {
      table,
      columns: columns.map(column => ({
        name: column.name,
        type: column.type.toUpperCase(),
        notNull: column.notnull,
        default: column.dflt_value,
        primaryKey: column.pk,
      })),
      indexes,
    };
}

function schemaProjection(db: Database.Database) {
  return [
    tableSchemaProjection(db, 'provider_execution_contradictions'),
    tableSchemaProjection(db, 'provider_execution_intervals'),
  ] as const;
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

function assertExactColumns(actual: readonly ColumnRow[], expected: readonly ExpectedColumn[]): void {
  const normalized = actual.map(({ name, type, notnull, dflt_value, pk }) => ({
    name,
    type: type.toUpperCase(),
    notnull,
    dflt_value,
    pk,
  }));
  const expectedProjection = expected.map(({ name, type, notnull, dflt_value, pk }) => ({
    name,
    type,
    notnull,
    dflt_value,
    pk,
  }));
  if (canonical(normalized) !== canonical(expectedProjection)) {
    throw new ProviderExecutionObservationMigrationError('SCHEMA_MISMATCH');
  }
}

function inspectOpenDatabase(
  db: Database.Database,
  databaseBytes: number,
  bounds: Required<ProviderExecutionObservationMigrationBounds>,
): ProviderExecutionObservationMigrationInspection {
  const sourceSchemaVersion = db.pragma('user_version', { simple: true }) as number;
  if (sourceSchemaVersion !== SOURCE_SCHEMA_VERSION
    && sourceSchemaVersion !== PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION) {
    throw new ProviderExecutionObservationMigrationError('UNSUPPORTED_SCHEMA');
  }
  assertExactColumns(db.pragma('table_info(provider_execution_contradictions)') as ColumnRow[], [
    column('contradiction_id', 'INTEGER', 0, 1),
    column('principal_digest', 'TEXT', 1),
    column('payload_json', 'TEXT', 1),
  ]);
  const expectedV1Columns = [
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
  const expectedV2FreshColumns = [
    expectedV1Columns[0]!,
    column('run_id', 'TEXT', 0),
    ...expectedV1Columns.slice(1),
    column('retired', 'INTEGER', 1, 0, '0'),
  ];
  const expectedV2MigratedColumns = [
    ...expectedV1Columns,
    column('run_id', 'TEXT', 0),
    column('retired', 'INTEGER', 1, 0, '0'),
  ];
  const intervalColumns = db.pragma('table_info(provider_execution_intervals)') as ColumnRow[];
  if (sourceSchemaVersion === 1) {
    assertExactColumns(intervalColumns, expectedV1Columns);
  } else {
    try {
      assertExactColumns(intervalColumns, expectedV2FreshColumns);
    } catch (error) {
      if (!(error instanceof ProviderExecutionObservationMigrationError)
        || error.code !== 'SCHEMA_MISMATCH') throw error;
      assertExactColumns(intervalColumns, expectedV2MigratedColumns);
    }
  }
  const projection = schemaProjection(db);
  const [contradictions, intervals] = projection;
  const contradictionNames = contradictions.columns.map(column => column.name);
  const expectedContradictions = ['contradiction_id', 'principal_digest', 'payload_json'];
  if (canonical(contradictionNames) !== canonical(expectedContradictions)) {
    throw new ProviderExecutionObservationMigrationError('SCHEMA_MISMATCH');
  }
  const names = intervals.columns.map(column => column.name);
  const expectedV1 = ['execution_id', 'task_id', 'attempt_id', 'principal_digest', 'fence', 'start_json', 'end_json', 'start_sequence', 'end_sequence'];
  const expectedV2Fresh = ['execution_id', 'run_id', 'task_id', 'attempt_id', 'principal_digest', 'fence', 'start_json', 'end_json', 'start_sequence', 'end_sequence', 'retired'];
  const expectedV2Migrated = [...expectedV1, 'run_id', 'retired'];
  const knownLayout = sourceSchemaVersion === 1
    ? canonical(names) === canonical(expectedV1)
    : canonical(names) === canonical(expectedV2Fresh) || canonical(names) === canonical(expectedV2Migrated);
  if (!knownLayout) {
    throw new ProviderExecutionObservationMigrationError('SCHEMA_MISMATCH');
  }
  const lineage = createHash('sha256');
  let rowCount = 0;
  let cursor: string | null = null;
  const select = db.prepare(`SELECT execution_id, task_id, attempt_id, principal_digest, fence,
    start_json, end_json, start_sequence, end_sequence${sourceSchemaVersion === 2 ? ', run_id, retired' : ''}
    FROM provider_execution_intervals WHERE execution_id > ? ORDER BY execution_id LIMIT ?`);
  while (true) {
    const rows = select.all(cursor ?? '', bounds.pageSize) as LineageRow[];
    if (rows.length === 0) break;
    rowCount += rows.length;
    if (rowCount > bounds.maxRows) throw new ProviderExecutionObservationMigrationError('ROW_LIMIT_EXCEEDED');
    for (const row of rows) {
      if (typeof row.execution_id !== 'string'
        || typeof row.task_id !== 'string'
        || typeof row.attempt_id !== 'string'
        || typeof row.principal_digest !== 'string'
        || typeof row.fence !== 'string'
        || typeof row.start_json !== 'string'
        || (row.end_json !== null && typeof row.end_json !== 'string')
        || !Number.isSafeInteger(row.start_sequence)
        || (row.end_sequence !== null && !Number.isSafeInteger(row.end_sequence))
        || (sourceSchemaVersion === 2 && row.retired !== 0 && row.retired !== 1)) {
        throw new ProviderExecutionObservationMigrationError('INVALID_ROW');
      }
      try {
        JSON.parse(row.start_json);
        if (row.end_json !== null) JSON.parse(row.end_json);
      } catch {
        throw new ProviderExecutionObservationMigrationError('INVALID_ROW');
      }
      lineage.update('interval\0');
      lineage.update(canonical({
        attemptId: row.attempt_id,
        endJson: row.end_json,
        endSequence: row.end_sequence,
        executionId: row.execution_id,
        fence: row.fence,
        principalDigest: row.principal_digest,
        startJson: row.start_json,
        startSequence: row.start_sequence,
        taskId: row.task_id,
      }));
      lineage.update('\n');
      cursor = row.execution_id;
    }
    if (rows.length < bounds.pageSize) break;
  }
  let contradictionCursor = 0;
  const selectContradictions = db.prepare(`SELECT contradiction_id, principal_digest, payload_json
    FROM provider_execution_contradictions WHERE contradiction_id > ?
    ORDER BY contradiction_id LIMIT ?`);
  while (true) {
    const rows = selectContradictions.all(contradictionCursor, bounds.pageSize) as ContradictionLineageRow[];
    if (rows.length === 0) break;
    rowCount += rows.length;
    if (rowCount > bounds.maxRows) throw new ProviderExecutionObservationMigrationError('ROW_LIMIT_EXCEEDED');
    for (const row of rows) {
      if (!Number.isSafeInteger(row.contradiction_id)
        || row.contradiction_id <= contradictionCursor
        || typeof row.principal_digest !== 'string'
        || typeof row.payload_json !== 'string') {
        throw new ProviderExecutionObservationMigrationError('INVALID_ROW');
      }
      try { JSON.parse(row.payload_json); } catch {
        throw new ProviderExecutionObservationMigrationError('INVALID_ROW');
      }
      lineage.update('contradiction\0');
      lineage.update(canonical({
        contradictionId: row.contradiction_id,
        payloadJson: row.payload_json,
        principalDigest: row.principal_digest,
      }));
      lineage.update('\n');
      contradictionCursor = row.contradiction_id;
    }
    if (rows.length < bounds.pageSize) break;
  }
  return Object.freeze({
    state: sourceSchemaVersion === 1 ? 'migration-required' : 'current',
    sourceSchemaVersion,
    targetSchemaVersion: PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION,
    schemaDigest: digest(canonical(projection)),
    rowLineageDigest: lineage.digest('hex'),
    rowCount,
    databaseBytes,
  });
}

/** Read-only and bounded inspection. It never creates or upgrades a database. */
export function inspectProviderExecutionObservationMigration(
  projectPath: ProviderExecutionObservationMigrationPath,
  bounds: ProviderExecutionObservationMigrationBounds = {},
): ProviderExecutionObservationMigrationInspection {
  assertCanonicalProjectPath(projectPath);
  if (!existsSync(projectPath.databasePath)) throw new ProviderExecutionObservationMigrationError('SOURCE_NOT_FOUND');
  assertNoSymlinkPath(projectPath);
  const resolvedBounds = assertBounds(bounds);
  const databaseBytes = statSync(projectPath.databasePath).size;
  if (databaseBytes > resolvedBounds.maxDatabaseBytes) {
    throw new ProviderExecutionObservationMigrationError('ROW_LIMIT_EXCEEDED');
  }
  const db = new Database(projectPath.databasePath, { readonly: true, fileMustExist: true });
  try {
    return inspectOpenDatabase(db, databaseBytes, resolvedBounds);
  } finally {
    db.close();
  }
}

/** Pure plan construction from an immutable inspection and injected clock/id authorities. */
export function planProviderExecutionObservationMigration(input: {
  readonly projectPath: ProviderExecutionObservationMigrationPath;
  readonly inspection: ProviderExecutionObservationMigrationInspection;
  readonly clock: ProviderExecutionObservationMigrationClock;
  readonly ids: ProviderExecutionObservationMigrationIds;
}): ProviderExecutionObservationMigrationPlan {
  assertCanonicalProjectPath(input.projectPath);
  const migrationId = input.ids.nextId();
  assertIdentity(migrationId);
  const core = {
    version: MIGRATION_VERSION,
    migrationId,
    projectRoot: input.projectPath.projectRoot,
    relativeDatabasePath: input.projectPath.relativeDatabasePath,
    sourceSchemaVersion: input.inspection.sourceSchemaVersion,
    targetSchemaVersion: input.inspection.targetSchemaVersion,
    sourceSchemaDigest: input.inspection.schemaDigest,
    sourceRowLineageDigest: input.inspection.rowLineageDigest,
    sourceRowCount: input.inspection.rowCount,
    sourceDatabaseBytes: input.inspection.databaseBytes,
    plannedAt: canonicalIso(input.clock.now()),
  } as const;
  return Object.freeze({
    version: core.version,
    migrationId: core.migrationId,
    projectPath: input.projectPath,
    sourceSchemaVersion: core.sourceSchemaVersion,
    targetSchemaVersion: core.targetSchemaVersion,
    sourceSchemaDigest: core.sourceSchemaDigest,
    sourceRowLineageDigest: core.sourceRowLineageDigest,
    sourceRowCount: core.sourceRowCount,
    sourceDatabaseBytes: core.sourceDatabaseBytes,
    plannedAt: core.plannedAt,
    planDigest: digest(canonical(core)),
  });
}

function calculatedPlanDigest(plan: ProviderExecutionObservationMigrationPlan): string {
  return digest(canonical({
    version: plan.version,
    migrationId: plan.migrationId,
    projectRoot: plan.projectPath.projectRoot,
    relativeDatabasePath: plan.projectPath.relativeDatabasePath,
    sourceSchemaVersion: plan.sourceSchemaVersion,
    targetSchemaVersion: plan.targetSchemaVersion,
    sourceSchemaDigest: plan.sourceSchemaDigest,
    sourceRowLineageDigest: plan.sourceRowLineageDigest,
    sourceRowCount: plan.sourceRowCount,
    sourceDatabaseBytes: plan.sourceDatabaseBytes,
    plannedAt: plan.plannedAt,
  }));
}

function equalDigest(left: string, right: string): boolean {
  if (!HEX_256.test(left) || !HEX_256.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function validateProviderExecutionObservationMigrationAuthority(
  plan: ProviderExecutionObservationMigrationPlan,
  authority: ProviderExecutionObservationMigrationAuthority | undefined,
  now: Date,
): asserts authority is Extract<ProviderExecutionObservationMigrationAuthority, { readonly decision: 'allow' }> {
  if (!authority) throw new ProviderExecutionObservationMigrationError('AUTHORITY_REQUIRED');
  if (authority.decision !== 'allow') throw new ProviderExecutionObservationMigrationError('AUTHORITY_DENIED');
  assertCanonicalProjectPath(plan.projectPath);
  assertIdentity(authority.authorityId);
  const expiresAt = Date.parse(authority.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new ProviderExecutionObservationMigrationError('AUTHORITY_EXPIRED');
  }
  if (!equalDigest(plan.planDigest, calculatedPlanDigest(plan))
    || authority.migrationId !== plan.migrationId
    || authority.projectRoot !== plan.projectPath.projectRoot
    || authority.relativeDatabasePath !== plan.projectPath.relativeDatabasePath
    || !equalDigest(authority.planDigest, plan.planDigest)
    || !equalDigest(authority.sourceSchemaDigest, plan.sourceSchemaDigest)
    || !equalDigest(authority.sourceRowLineageDigest, plan.sourceRowLineageDigest)) {
    throw new ProviderExecutionObservationMigrationError('AUTHORITY_MISMATCH');
  }
}

function fsyncFile(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function fileDigest(path: string): string {
  return digest(readFileSync(path));
}

function sqliteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * The sole mutator. Authority is checked before filesystem mutation; source is
 * re-inspected before and inside BEGIN IMMEDIATE. A verified durable backup is
 * retained, no evidence row is deleted, and the receipt is fsync+rename atomic.
 */
export function applyProviderExecutionObservationMigration(input: {
  readonly plan: ProviderExecutionObservationMigrationPlan;
  readonly authority?: ProviderExecutionObservationMigrationAuthority;
  readonly clock: ProviderExecutionObservationMigrationClock;
  readonly ids: ProviderExecutionObservationMigrationIds;
  readonly bounds?: ProviderExecutionObservationMigrationBounds;
}): ProviderExecutionObservationMigrationApplyResult {
  const now = input.clock.now();
  canonicalIso(now);
  validateProviderExecutionObservationMigrationAuthority(input.plan, input.authority, now);
  const authority = input.authority;
  const path = input.plan.projectPath;
  const before = inspectProviderExecutionObservationMigration(path, input.bounds);
  if (!equalDigest(before.schemaDigest, input.plan.sourceSchemaDigest)
    || !equalDigest(before.rowLineageDigest, input.plan.sourceRowLineageDigest)
    || before.rowCount !== input.plan.sourceRowCount) {
    throw new ProviderExecutionObservationMigrationError('CONCURRENT_CHANGE');
  }
  if (before.state === 'current') return { state: 'already-current', inspection: before };

  const backupRelativePath = `${path.relativeDatabasePath}.migration-${input.plan.migrationId}.bak`;
  const backupPath = safeProviderExecutionObservationProjectPath(path.projectRoot, backupRelativePath).databasePath;
  const receiptPath = `${path.databasePath}.migration-${input.plan.migrationId}.receipt.json`;
  if (existsSync(backupPath) || existsSync(receiptPath)) {
    throw new ProviderExecutionObservationMigrationError('APPLY_FAILED');
  }
  try {
    const backupSource = new Database(path.databasePath, { readonly: true, fileMustExist: true });
    try {
      backupSource.exec(`VACUUM INTO ${sqliteLiteral(backupPath)}`);
    } finally { backupSource.close(); }
    fsyncFile(backupPath);
    fsyncDirectory(dirname(backupPath));
    const sourceBackupDigest = fileDigest(backupPath);
    const backupInspection = inspectProviderExecutionObservationMigration(
      safeProviderExecutionObservationProjectPath(path.projectRoot, backupRelativePath),
      input.bounds,
    );
    if (!equalDigest(backupInspection.schemaDigest, before.schemaDigest)
      || !equalDigest(backupInspection.rowLineageDigest, before.rowLineageDigest)
      || backupInspection.rowCount !== before.rowCount) {
      throw new ProviderExecutionObservationMigrationError('BACKUP_VERIFICATION_FAILED');
    }

    const db = new Database(path.databasePath, { fileMustExist: true });
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');
      db.exec('BEGIN IMMEDIATE');
      try {
        const locked = inspectOpenDatabase(db, statSync(path.databasePath).size, assertBounds(input.bounds ?? {}));
        if (!equalDigest(locked.schemaDigest, input.plan.sourceSchemaDigest)
          || !equalDigest(locked.rowLineageDigest, input.plan.sourceRowLineageDigest)) {
          throw new ProviderExecutionObservationMigrationError('CONCURRENT_CHANGE');
        }
        db.exec('ALTER TABLE provider_execution_intervals ADD COLUMN run_id TEXT');
        db.exec('ALTER TABLE provider_execution_intervals ADD COLUMN retired INTEGER NOT NULL DEFAULT 0');
        db.exec(`CREATE INDEX idx_provider_execution_run_scope
          ON provider_execution_intervals (run_id, attempt_id, principal_digest, fence, retired, start_sequence, execution_id)`);
        db.pragma(`user_version = ${PROVIDER_EXECUTION_OBSERVATION_STORE_SCHEMA_VERSION}`);
        db.exec('COMMIT');
      } catch (error) {
        if (db.inTransaction) db.exec('ROLLBACK');
        throw error;
      }
      db.pragma('wal_checkpoint(TRUNCATE)');
    } finally { db.close(); }
    fsyncFile(path.databasePath);
    fsyncDirectory(dirname(path.databasePath));

    const after = inspectProviderExecutionObservationMigration(path, input.bounds);
    if (after.state !== 'current' || after.rowCount !== before.rowCount
      || !equalDigest(after.rowLineageDigest, before.rowLineageDigest)) {
      throw new ProviderExecutionObservationMigrationError('APPLY_FAILED');
    }
    const receiptId = input.ids.nextId();
    assertIdentity(receiptId);
    const receipt: ProviderExecutionObservationMigrationReceipt = Object.freeze({
      version: MIGRATION_VERSION,
      receiptId,
      migrationId: input.plan.migrationId,
      authorityId: authority.authorityId,
      planDigest: input.plan.planDigest,
      sourceSchemaDigest: before.schemaDigest,
      sourceRowLineageDigest: before.rowLineageDigest,
      targetSchemaDigest: after.schemaDigest,
      targetRowLineageDigest: after.rowLineageDigest,
      rowCount: after.rowCount,
      backupRelativePath,
      backupDigest: sourceBackupDigest,
      appliedAt: canonicalIso(input.clock.now()),
    });
    const temporaryReceiptPath = `${receiptPath}.tmp-${receiptId}`;
    try {
      const receiptPayload = {
        version: receipt.version,
        receiptId: receipt.receiptId,
        migrationId: receipt.migrationId,
        authorityId: receipt.authorityId,
        planDigest: receipt.planDigest,
        sourceSchemaDigest: receipt.sourceSchemaDigest,
        sourceRowLineageDigest: receipt.sourceRowLineageDigest,
        targetSchemaDigest: receipt.targetSchemaDigest,
        targetRowLineageDigest: receipt.targetRowLineageDigest,
        rowCount: receipt.rowCount,
        backupRelativePath: receipt.backupRelativePath,
        backupDigest: receipt.backupDigest,
        appliedAt: receipt.appliedAt,
      } satisfies CanonicalValue;
      writeFileSync(temporaryReceiptPath, `${canonical(receiptPayload)}\n`, { flag: 'wx', mode: 0o600 });
      fsyncFile(temporaryReceiptPath);
      renameSync(temporaryReceiptPath, receiptPath);
      fsyncDirectory(dirname(receiptPath));
    } catch (error) {
      throw new ProviderExecutionObservationMigrationError('RECEIPT_WRITE_FAILED', error);
    }
    return { state: 'applied', receipt, receiptPath, backupPath };
  } catch (error) {
    if (error instanceof ProviderExecutionObservationMigrationError) throw error;
    throw new ProviderExecutionObservationMigrationError('APPLY_FAILED', error);
  }
}

export const canonicalProviderExecutionObservationSchemaDigest = (
  inspection: ProviderExecutionObservationMigrationInspection,
): string => inspection.schemaDigest;

export const providerExecutionObservationRowLineageDigest = (
  inspection: ProviderExecutionObservationMigrationInspection,
): string => inspection.rowLineageDigest;
