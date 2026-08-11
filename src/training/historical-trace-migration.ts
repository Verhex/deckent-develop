/**
 * Immutable, bounded historical trace migration.
 *
 * Sources are opened as regular files, hashed before and after projection, and
 * never written. Publication reserves a new destination and exposes the
 * manifest last; an existing destination is reusable only after every digest
 * reconciles.
 */
import { createHash, randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  lstat, mkdir, open, readFile, realpath, rename, rmdir, unlink,
  type FileHandle,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import {
  HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION,
  normalizeHistoricalTraceEnvelope,
  validateHistoricalTraceEnvelope,
  type HistoricalTraceEnvelope,
  type HistoricalTraceMessage,
  type HistoricalTracePolicy,
  type HistoricalTraceSourceSchema,
} from '../core/training-trace-envelope.js';
import { redactSensitive } from '../core/redact-sensitive.js';

export const HISTORICAL_TRACE_MIGRATION_SCHEMA_VERSION = 1 as const;
export const HISTORICAL_TRACE_MIGRATION_CODE_VERSION = 'historical-trace-migration/v2' as const;

export type HistoricalTraceMigrationErrorCode =
  | 'PATH_AUTHORITY_INVALID'
  | 'SYMLINK_REFUSED'
  | 'INPUT_OUTPUT_OVERLAP'
  | 'SOURCE_LIMIT_EXCEEDED'
  | 'SOURCE_DRIFT'
  | 'OUTPUT_CONFLICT'
  | 'ENVELOPE_INVALID'
  | 'NO_INPUT_FILES';

export class HistoricalTraceMigrationError extends Error {
  constructor(
    readonly code: HistoricalTraceMigrationErrorCode,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}${Object.keys(details).length > 0 ? `: ${stableJson(details)}` : ''}`);
    this.name = 'HistoricalTraceMigrationError';
  }
}

export class HistoricalTraceMigrationConflictError extends HistoricalTraceMigrationError {
  constructor(details: Readonly<Record<string, unknown>>) {
    super('OUTPUT_CONFLICT', details);
    this.name = 'HistoricalTraceMigrationConflictError';
  }
}

export interface HistoricalTraceMigrationLimits {
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
  readonly maxTotalSourceBytes?: number;
  readonly maxRecords?: number;
  readonly maxLineBytes?: number;
}

export interface HistoricalTraceMigrationOptions {
  readonly projectRoot: string;
  readonly inputPaths: readonly string[];
  readonly outputPath: string;
  readonly policy?: HistoricalTracePolicy;
  readonly dryRun?: boolean;
  readonly limits?: HistoricalTraceMigrationLimits;
  readonly policyVersion?: string;
  readonly contractVersion?: string;
}

export interface HistoricalTraceMigrationSource {
  readonly path: string;
  readonly byteSize: number;
  readonly sha256: string;
}

export interface HistoricalTraceMigrationInventory {
  readonly files: readonly HistoricalTraceMigrationSource[];
  readonly physicalLines: number;
  readonly nonEmptyLines: number;
  readonly parsedRecords: number;
  readonly projectedRecords: number;
  readonly malformedRecords: number;
  readonly unknownProvenanceRecords: number;
  readonly zeroWeightDuplicateRecords: number;
  readonly dispositionCounts: Readonly<Record<string, number>>;
  readonly reasonCounts: Readonly<Record<string, number>>;
  readonly malformedReasonCounts: Readonly<Record<string, number>>;
}

export interface HistoricalTraceMigrationManifest {
  readonly schemaVersion: typeof HISTORICAL_TRACE_MIGRATION_SCHEMA_VERSION;
  readonly codeVersion: typeof HISTORICAL_TRACE_MIGRATION_CODE_VERSION;
  readonly envelopeSchemaVersion: typeof HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION;
  readonly migrationId: string;
  readonly policyVersion: string;
  readonly contractVersion: string;
  readonly policy: HistoricalTracePolicy;
  readonly policyDigest: string;
  readonly sourceDigest: string;
  readonly sources: HistoricalTraceMigrationInventory['files'];
  readonly inventory: HistoricalTraceMigrationInventory;
  readonly projectionDigest: string;
  readonly malformedDigest: string;
  readonly prePostSourceReconciled: true;
  readonly publicationProtocol: 'manifest-last-no-clobber-v1';
}

export interface HistoricalTraceMigrationResult {
  readonly status: 'dry-run' | 'published' | 'noop';
  readonly outputPath: string;
  readonly inventory: HistoricalTraceMigrationInventory;
  readonly manifest: HistoricalTraceMigrationManifest;
}

interface SourceAuthority extends HistoricalTraceMigrationSource {
  readonly absolutePath: string;
  readonly dev: bigint;
  readonly ino: bigint;
}

interface BoundedLine {
  readonly line: number;
  readonly byteLength: number;
  readonly digest: string;
  readonly text: string | null;
  readonly failure: 'line-byte-limit' | 'invalid-utf8' | null;
}

interface SequenceNode {
  readonly children: Map<string, SequenceNode>;
  terminalId: string | null;
  firstDescendantId: string | null;
}

const DEFAULT_LIMITS: Required<HistoricalTraceMigrationLimits> = {
  maxFiles: 100_000,
  maxFileBytes: 1024 * 1024 * 1024 * 1024,
  maxTotalSourceBytes: 4 * 1024 * 1024 * 1024 * 1024,
  maxRecords: 10_000_000,
  maxLineBytes: 16 * 1024 * 1024,
};
const PROJECTION_FILE = 'projection.jsonl';
const MALFORMED_FILE = 'malformed.jsonl';
const MANIFEST_FILE = 'manifest.json';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableJson(value: unknown): string {
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(
        Object.keys(item as Record<string, unknown>).sort()
          .map(key => [key, visit((item as Record<string, unknown>)[key])]),
      );
    }
    return item;
  };
  return JSON.stringify(visit(value));
}

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

function toProjectPath(root: string, candidate: string): string {
  return relative(root, candidate).split(sep).join('/');
}

function count(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function assertPositiveLimits(limits: Required<HistoricalTraceMigrationLimits>): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new HistoricalTraceMigrationError('SOURCE_LIMIT_EXCEEDED', { name, value, reason: 'invalid-limit' });
    }
  }
}

/** Redact a JSON-derived copy; the parsed source object and source bytes remain untouched. */
function redactCopy(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitive(value);
  if (Array.isArray(value)) return value.map(redactCopy);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactCopy(item)]),
    );
  }
  return value;
}

function regularOpenFlags(): number {
  const noFollow = (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  return constants.O_RDONLY | noFollow;
}

async function openRegular(path: string): Promise<{ handle: FileHandle; stats: Stats }> {
  let handle: FileHandle;
  try {
    handle = await open(path, regularOpenFlags());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new HistoricalTraceMigrationError('SYMLINK_REFUSED', { path });
    }
    throw error;
  }
  try {
    const stats = await handle.stat({ bigint: false });
    if (!stats.isFile()) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path, reason: 'not-regular-file' });
    return { handle, stats };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function digestRegularFile(path: string): Promise<{ digest: string; stats: Stats }> {
  const { handle, stats } = await openRegular(path);
  const hash = createHash('sha256');
  try {
    for await (const part of handle.createReadStream({ autoClose: false })) hash.update(part as Buffer);
    return { digest: hash.digest('hex'), stats };
  } finally {
    await handle.close();
  }
}

function sameIdentity(a: Stats, authority: SourceAuthority): boolean {
  return BigInt(a.dev) === authority.dev && BigInt(a.ino) === authority.ino;
}

async function assertNotSymlink(path: string, label: string): Promise<Stats> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new HistoricalTraceMigrationError('SYMLINK_REFUSED', { path, label });
  return info;
}

async function discoverFiles(
  root: string,
  requested: readonly string[],
  output: string,
  limits: Required<HistoricalTraceMigrationLimits>,
): Promise<string[]> {
  if (requested.length === 0) throw new HistoricalTraceMigrationError('NO_INPUT_FILES');
  const found = new Set<string>();
  const visit = async (candidate: string): Promise<void> => {
    const info = await assertNotSymlink(candidate, 'input');
    if (info.isFile()) {
      if (!candidate.toLowerCase().endsWith('.jsonl')) {
        throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: toProjectPath(root, candidate), reason: 'non-jsonl-input' });
      }
      found.add(candidate);
      if (found.size > limits.maxFiles) throw new HistoricalTraceMigrationError('SOURCE_LIMIT_EXCEEDED', { limit: 'maxFiles', value: limits.maxFiles });
      return;
    }
    if (!info.isDirectory()) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: candidate, reason: 'unsupported-input-kind' });
    const entries = await (await import('node:fs/promises')).readdir(candidate, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw new HistoricalTraceMigrationError('SYMLINK_REFUSED', { path: join(candidate, entry.name), label: 'nested-input' });
      await visit(join(candidate, entry.name));
    }
  };

  for (const input of requested) {
    const candidate = resolve(root, input);
    if (!inside(root, candidate) || candidate === root) {
      throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { input, reason: 'outside-or-project-root' });
    }
    if (candidate === output || inside(candidate, output) || inside(output, candidate)) {
      throw new HistoricalTraceMigrationError('INPUT_OUTPUT_OVERLAP', { input, output: toProjectPath(root, output) });
    }
    const real = await realpath(candidate);
    if (!inside(root, real)) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { input, reason: 'realpath-escape' });
    await visit(candidate);
  }
  if (found.size === 0) throw new HistoricalTraceMigrationError('NO_INPUT_FILES');
  return [...found].sort((a, b) => toProjectPath(root, a).localeCompare(toProjectPath(root, b)));
}

async function ensureSafeDirectory(root: string, target: string, create: boolean): Promise<void> {
  if (!inside(root, target)) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { target, reason: 'directory-escape' });
  const parts = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      const info = await assertNotSymlink(current, 'output-parent');
      if (!info.isDirectory()) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: current, reason: 'output-parent-not-directory' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!create) return;
      await mkdir(current, { recursive: false, mode: 0o700 });
    }
  }
  if (create) {
    const resolved = await realpath(target);
    if (!inside(root, resolved)) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { target, reason: 'created-parent-escape' });
  }
}

async function collectAuthorities(
  root: string,
  files: readonly string[],
  limits: Required<HistoricalTraceMigrationLimits>,
): Promise<SourceAuthority[]> {
  const sources: SourceAuthority[] = [];
  let totalBytes = 0;
  for (const absolutePath of files) {
    const measured = await digestRegularFile(absolutePath);
    if (measured.stats.size > limits.maxFileBytes) {
      throw new HistoricalTraceMigrationError('SOURCE_LIMIT_EXCEEDED', { path: toProjectPath(root, absolutePath), limit: 'maxFileBytes', measured: measured.stats.size, allowed: limits.maxFileBytes });
    }
    totalBytes += measured.stats.size;
    if (totalBytes > limits.maxTotalSourceBytes) {
      throw new HistoricalTraceMigrationError('SOURCE_LIMIT_EXCEEDED', { limit: 'maxTotalSourceBytes', measured: totalBytes, allowed: limits.maxTotalSourceBytes });
    }
    sources.push({
      absolutePath,
      path: toProjectPath(root, absolutePath),
      byteSize: measured.stats.size,
      sha256: measured.digest,
      dev: BigInt(measured.stats.dev),
      ino: BigInt(measured.stats.ino),
    });
  }
  return sources;
}

async function* boundedLines(path: string, maxLineBytes: number): AsyncGenerator<BoundedLine> {
  const { handle } = await openRegular(path);
  let chunks: Buffer[] = [];
  let bytes = 0;
  let lineNumber = 0;
  let overLimit = false;
  let hash = createHash('sha256');

  const finish = (): BoundedLine => {
    lineNumber++;
    const lineDigest = hash.digest('hex');
    let text: string | null = null;
    let failure: BoundedLine['failure'] = overLimit ? 'line-byte-limit' : null;
    if (!overLimit) {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
      } catch {
        failure = 'invalid-utf8';
      }
    }
    const result: BoundedLine = { line: lineNumber, byteLength: bytes, digest: lineDigest, text, failure };
    chunks = [];
    bytes = 0;
    overLimit = false;
    hash = createHash('sha256');
    return result;
  };

  try {
    for await (const chunkValue of handle.createReadStream({ autoClose: false })) {
      const chunk = chunkValue as Buffer;
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(0x0a, offset);
        const end = newline === -1 ? chunk.length : newline;
        const part = chunk.subarray(offset, end);
        hash.update(part);
        bytes += part.length;
        if (!overLimit && bytes <= maxLineBytes) chunks.push(part);
        if (bytes > maxLineBytes) { overLimit = true; chunks = []; }
        if (newline !== -1) yield finish();
        offset = newline === -1 ? chunk.length : newline + 1;
      }
    }
    if (bytes > 0 || chunks.length > 0 || overLimit) yield finish();
  } finally {
    await handle.close();
  }
}

function schemaHintForPath(path: string): HistoricalTraceSourceSchema | undefined {
  const name = basename(path).toLowerCase();
  if (name === 'extracted-aligned.jsonl' || name === 'aligned.jsonl') return 'extracted-aligned';
  if (name === 'extracted-general.jsonl' || name === 'general.jsonl') return 'extracted-general';
  return undefined;
}

function semanticMessage(message: HistoricalTraceMessage): unknown {
  return {
    role: message.role,
    observedRole: message.observedRole,
    content: message.content,
    auxiliaryEvidence: message.auxiliaryEvidence,
    causal: { kind: message.causal.kind, toolCallId: message.causal.toolCallId },
  };
}

function semanticMessageKeys(messages: readonly HistoricalTraceMessage[]): string[] {
  return messages.map(message => sha256(stableJson(semanticMessage(message))));
}

function sequenceRelations(root: SequenceNode, keys: readonly string[]): string[] {
  const references = new Set<string>();
  let node: SequenceNode | undefined = root;
  for (let index = 0; index < keys.length; index++) {
    node = node.children.get(keys[index]!);
    if (!node) return [...references];
    if (node.terminalId && index < keys.length - 1) references.add(node.terminalId);
  }
  if (node?.terminalId) references.add(node.terminalId);
  if (node?.firstDescendantId) references.add(node.firstDescendantId);
  return [...references];
}

function insertSequence(root: SequenceNode, keys: readonly string[], recordId: string): void {
  let node = root;
  if (!node.firstDescendantId) node.firstDescendantId = recordId;
  for (const key of keys) {
    let child = node.children.get(key);
    if (!child) {
      child = { children: new Map(), terminalId: null, firstDescendantId: null };
      node.children.set(key, child);
    }
    node = child;
    if (!node.firstDescendantId) node.firstDescendantId = recordId;
  }
  if (!node.terminalId) node.terminalId = recordId;
}

class DurableLineAccumulator {
  readonly hash = createHash('sha256');
  private handle: FileHandle | null = null;
  private closed = false;

  private constructor(readonly path: string | null) {}

  static async create(path: string | null): Promise<DurableLineAccumulator> {
    const accumulator = new DurableLineAccumulator(path);
    if (path) accumulator.handle = await open(path, 'wx', 0o600);
    return accumulator;
  }

  async write(value: unknown): Promise<void> {
    if (this.closed) throw new Error('line accumulator is closed');
    const bytes = Buffer.from(stableJson(value) + '\n', 'utf8');
    this.hash.update(bytes);
    if (!this.handle) return;
    let offset = 0;
    while (offset < bytes.length) {
      const result = await this.handle.write(bytes, offset, bytes.length - offset, null);
      offset += result.bytesWritten;
    }
  }

  async close(): Promise<string> {
    if (this.closed) throw new Error('line accumulator already closed');
    this.closed = true;
    if (this.handle) {
      await this.handle.sync();
      await this.handle.close();
      this.handle = null;
    }
    return this.hash.digest('hex');
  }

  async abandon(): Promise<void> {
    if (!this.closed && this.handle) {
      try { await this.handle.close(); } catch { /* original failure wins */ }
      this.handle = null;
    }
    this.closed = true;
  }
}

async function writeDurableJson(path: string, value: unknown): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(stableJson(value) + '\n', 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fsyncDirectory(path: string): Promise<void> {
  let handle: FileHandle | null = null;
  try {
    handle = await open(path, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EINVAL' && code !== 'EPERM' && code !== 'EISDIR' && code !== 'ENOTSUP') throw error;
  } finally {
    if (handle) await handle.close();
  }
}

async function cleanupKnownDirectory(path: string): Promise<void> {
  for (const name of [PROJECTION_FILE, MALFORMED_FILE, MANIFEST_FILE]) {
    try { await unlink(join(path, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  try { await rmdir(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

async function readExistingResult(
  output: string,
  expectedMigrationId: string,
): Promise<HistoricalTraceMigrationResult | null> {
  try {
    const info = await assertNotSymlink(output, 'output');
    if (!info.isDirectory()) throw new HistoricalTraceMigrationConflictError({ output, reason: 'not-directory' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  for (const name of [PROJECTION_FILE, MALFORMED_FILE, MANIFEST_FILE]) {
    try {
      const artifact = await assertNotSymlink(join(output, name), 'output-artifact');
      if (!artifact.isFile()) throw new HistoricalTraceMigrationConflictError({ output, artifact: name, reason: 'not-regular-file' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new HistoricalTraceMigrationConflictError({ output, artifact: name, reason: 'incomplete-publication' });
      throw error;
    }
  }
  let manifest: HistoricalTraceMigrationManifest;
  try {
    manifest = JSON.parse(await readFile(join(output, MANIFEST_FILE), 'utf8')) as HistoricalTraceMigrationManifest;
  } catch (error) {
    throw new HistoricalTraceMigrationConflictError({ output, reason: 'manifest-unreadable', cause: error instanceof Error ? error.message : String(error) });
  }
  if (manifest.migrationId !== expectedMigrationId) throw new HistoricalTraceMigrationConflictError({ output, reason: 'different-migration', expectedMigrationId, actualMigrationId: manifest.migrationId });
  const projection = await digestRegularFile(join(output, PROJECTION_FILE));
  const malformed = await digestRegularFile(join(output, MALFORMED_FILE));
  if (projection.digest !== manifest.projectionDigest || malformed.digest !== manifest.malformedDigest) {
    throw new HistoricalTraceMigrationConflictError({ output, reason: 'artifact-digest-mismatch' });
  }
  return { status: 'noop', outputPath: output, inventory: manifest.inventory, manifest };
}

async function reconcileSources(sources: readonly SourceAuthority[]): Promise<void> {
  for (const source of sources) {
    const measured = await digestRegularFile(source.absolutePath);
    if (!sameIdentity(measured.stats, source)
        || measured.stats.size !== source.byteSize
        || measured.digest !== source.sha256) {
      throw new HistoricalTraceMigrationError('SOURCE_DRIFT', { path: source.path });
    }
  }
}

function duplicateProjection(
  envelope: HistoricalTraceEnvelope,
  duplicateRefs: readonly string[],
  cumulativeRefs: readonly string[],
): HistoricalTraceEnvelope {
  if (duplicateRefs.length === 0) return envelope;
  return {
    ...envelope,
    duplicateOf: [...new Set([...envelope.duplicateOf, ...duplicateRefs])].sort(),
    cumulativeReferences: [...new Set([...envelope.cumulativeReferences, ...cumulativeRefs])].sort(),
    trainingWeight: 0,
    disposition: envelope.disposition === 'train-ready' ? 'manual-review-required' : envelope.disposition,
    reasonCodes: [...new Set([...envelope.reasonCodes, 'duplicate-reference' as const])],
  };
}

export async function migrateHistoricalTraces(
  options: HistoricalTraceMigrationOptions,
): Promise<HistoricalTraceMigrationResult> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  assertPositiveLimits(limits);
  const root = await realpath(options.projectRoot);
  const output = resolve(root, options.outputPath);
  if (!inside(root, output) || output === root) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { outputPath: options.outputPath });
  await ensureSafeDirectory(root, dirname(output), false);
  const files = await discoverFiles(root, options.inputPaths, output, limits);
  const authorities = await collectAuthorities(root, files, limits);
  const sources: HistoricalTraceMigrationSource[] = authorities.map(({ path, byteSize, sha256: digestValue }) => ({ path, byteSize, sha256: digestValue }));
  const policy = options.policy ?? {};
  const policyVersion = options.policyVersion ?? 'historical-trace-policy/v1';
  const contractVersion = options.contractVersion ?? 'historical-trace-contract/v1';
  const policyDigest = sha256(stableJson({ policy, policyVersion, contractVersion }));
  const sourceDigest = sha256(stableJson(sources));
  const migrationId = sha256(stableJson({
    codeVersion: HISTORICAL_TRACE_MIGRATION_CODE_VERSION,
    envelopeSchemaVersion: HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION,
    policyDigest,
    sourceDigest,
  }));
  const existing = await readExistingResult(output, migrationId);
  if (existing) return existing;

  const dryRun = options.dryRun !== false;
  if (!dryRun) await ensureSafeDirectory(root, dirname(output), true);
  const temporary = dryRun ? null : join(dirname(output), `.${basename(output)}.migration-${randomUUID()}`);
  if (temporary) await mkdir(temporary, { recursive: false, mode: 0o700 });
  const projectionWriter = await DurableLineAccumulator.create(temporary ? join(temporary, PROJECTION_FILE) : null);
  const malformedWriter = await DurableLineAccumulator.create(temporary ? join(temporary, MALFORMED_FILE) : null);
  const inventory: {
    files: HistoricalTraceMigrationSource[];
    physicalLines: number;
    nonEmptyLines: number;
    parsedRecords: number;
    projectedRecords: number;
    malformedRecords: number;
    unknownProvenanceRecords: number;
    zeroWeightDuplicateRecords: number;
    dispositionCounts: Record<string, number>;
    reasonCounts: Record<string, number>;
    malformedReasonCounts: Record<string, number>;
  } = {
    files: sources,
    physicalLines: 0,
    nonEmptyLines: 0,
    parsedRecords: 0,
    projectedRecords: 0,
    malformedRecords: 0,
    unknownProvenanceRecords: 0,
    zeroWeightDuplicateRecords: 0,
    dispositionCounts: {},
    reasonCounts: {},
    malformedReasonCounts: {},
  };
  const seenExact = new Map<string, string>();
  const sequenceRoot: SequenceNode = { children: new Map(), terminalId: null, firstDescendantId: null };
  let projectionDigest = '';
  let malformedDigest = '';
  let publishedDestination = false;

  const malformed = async (source: SourceAuthority, line: BoundedLine, reason: string, details?: unknown): Promise<void> => {
    inventory.malformedRecords++;
    count(inventory.malformedReasonCounts, reason);
    await malformedWriter.write({
      schemaVersion: 1,
      source: { path: source.path, line: line.line, byteLength: line.byteLength, lineDigest: line.digest },
      reason,
      ...(details === undefined ? {} : { details }),
    });
  };

  try {
    for (const source of authorities) {
      const hint = schemaHintForPath(source.path);
      for await (const line of boundedLines(source.absolutePath, limits.maxLineBytes)) {
        inventory.physicalLines++;
        if (line.byteLength === 0) continue;
        inventory.nonEmptyLines++;
        if (line.failure || line.text === null) { await malformed(source, line, line.failure ?? 'invalid-utf8'); continue; }
        let raw: unknown;
        try { raw = JSON.parse(line.text); }
        catch { await malformed(source, line, 'invalid-json'); continue; }
        inventory.parsedRecords++;
        if (inventory.parsedRecords > limits.maxRecords) {
          throw new HistoricalTraceMigrationError('SOURCE_LIMIT_EXCEEDED', { limit: 'maxRecords', measured: inventory.parsedRecords, allowed: limits.maxRecords });
        }
        const envelope = normalizeHistoricalTraceEnvelope(redactCopy(raw), {
          projectRelativePath: source.path,
          sourceLine: line.line,
          sourceFileByteSize: source.byteSize,
          sourceFileDigest: source.sha256,
          sourceRecordContent: line.text,
          sourceRecordDigest: line.digest,
          sourceIntegrityVerified: true,
          ...(hint ? { sourceSchemaHint: hint } : {}),
        }, policy);
        const initialValidation = validateHistoricalTraceEnvelope(envelope, policy);
        if (!initialValidation.ok) {
          await malformed(source, line, 'invalid-envelope', initialValidation.errors);
          continue;
        }

        const messageKeys = semanticMessageKeys(envelope.messages);
        const exactPrior = seenExact.get(envelope.integrity.contentDigest);
        const sequencePrior = messageKeys.length > 0 ? sequenceRelations(sequenceRoot, messageKeys) : [];
        const duplicateRefs = [...new Set([...(exactPrior ? [exactPrior] : []), ...sequencePrior])]
          .filter(ref => ref !== envelope.source.recordId)
          .sort();
        const cumulativeRefs = sequencePrior.filter(ref => ref !== envelope.source.recordId).sort();
        const projected = duplicateProjection(envelope, duplicateRefs, cumulativeRefs);
        const projectedValidation = validateHistoricalTraceEnvelope(projected, policy);
        if (!projectedValidation.ok) {
          throw new HistoricalTraceMigrationError('ENVELOPE_INVALID', { source: source.path, line: line.line, errors: projectedValidation.errors });
        }

        inventory.projectedRecords++;
        if (Object.values(projected.executionLineage).every(value => value === null)) inventory.unknownProvenanceRecords++;
        if (projected.duplicateOf.length > 0 && projected.trainingWeight === 0) inventory.zeroWeightDuplicateRecords++;
        count(inventory.dispositionCounts, projected.disposition);
        for (const reason of projected.reasonCodes) count(inventory.reasonCounts, reason);
        await projectionWriter.write(projected);
        if (!seenExact.has(envelope.integrity.contentDigest)) seenExact.set(envelope.integrity.contentDigest, envelope.source.recordId);
        if (messageKeys.length > 0) insertSequence(sequenceRoot, messageKeys, envelope.source.recordId);
      }
    }
    projectionDigest = await projectionWriter.close();
    malformedDigest = await malformedWriter.close();
    await reconcileSources(authorities);
    const manifest: HistoricalTraceMigrationManifest = {
      schemaVersion: HISTORICAL_TRACE_MIGRATION_SCHEMA_VERSION,
      codeVersion: HISTORICAL_TRACE_MIGRATION_CODE_VERSION,
      envelopeSchemaVersion: HISTORICAL_TRACE_ENVELOPE_SCHEMA_VERSION,
      migrationId,
      policyVersion,
      contractVersion,
      policy,
      policyDigest,
      sourceDigest,
      sources,
      inventory,
      projectionDigest,
      malformedDigest,
      prePostSourceReconciled: true,
      publicationProtocol: 'manifest-last-no-clobber-v1',
    };
    if (dryRun) return { status: 'dry-run', outputPath: output, inventory, manifest };
    await writeDurableJson(join(temporary!, MANIFEST_FILE), manifest);
    await fsyncDirectory(temporary!);

    try {
      await mkdir(output, { recursive: false, mode: 0o700 });
      publishedDestination = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new HistoricalTraceMigrationConflictError({ output, reason: 'concurrent-publication' });
      throw error;
    }
    await rename(join(temporary!, PROJECTION_FILE), join(output, PROJECTION_FILE));
    await rename(join(temporary!, MALFORMED_FILE), join(output, MALFORMED_FILE));
    await rename(join(temporary!, MANIFEST_FILE), join(output, MANIFEST_FILE));
    await fsyncDirectory(output);
    await fsyncDirectory(dirname(output));
    await rmdir(temporary!);
    return { status: 'published', outputPath: output, inventory, manifest };
  } catch (error) {
    await projectionWriter.abandon();
    await malformedWriter.abandon();
    if (temporary) {
      try { await cleanupKnownDirectory(temporary); } catch { /* do not mask the root failure */ }
    }
    if (publishedDestination) {
      try { await cleanupKnownDirectory(output); } catch { /* complete manifest permits safe idempotent recovery */ }
    }
    throw error;
  }
}
