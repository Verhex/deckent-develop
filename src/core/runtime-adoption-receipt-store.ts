import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  closeSync, constants as fsConstants, fstatSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, openSync, readSync, readdirSync, realpathSync, statSync, unlinkSync, writeSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  canonicalRuntimeAdoptionJson,
  RuntimeAdoptionHoldError,
  type RuntimeAdoptionPlan,
  validateRuntimeAdoptionPlan,
} from './runtime-adoption.js';

export const RUNTIME_ADOPTION_RECEIPT_SCHEMA = 'deckent.runtime-adoption-receipt' as const;
export const RUNTIME_ADOPTION_RECEIPT_VERSION = 1 as const;
export const RUNTIME_ADOPTION_MAX_DISCOVERY = 10_000;

const RECEIPT_DOMAIN = 'deckent:runtime-adoption-receipt:v1\0';
const SCOPE_DOMAIN = 'deckent:runtime-adoption-scope:v1\0';
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const BASE32 = /^[a-z2-7]{52}$/u;
const FINAL_NAME = /^[a-f0-9]{64}\.json$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const STORE_COMPONENTS = ['.deckent', 'runtime-adoption', 'receipts', 'v1'] as const;
type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export interface RuntimeAdoptionReceiptScope {
  readonly environmentKey: string;
  readonly tenantKey: string;
}

export interface RuntimeAdoptionReceipt {
  readonly schema: typeof RUNTIME_ADOPTION_RECEIPT_SCHEMA;
  readonly version: typeof RUNTIME_ADOPTION_RECEIPT_VERSION;
  readonly receiptId: string;
  readonly scope: RuntimeAdoptionReceiptScope;
  readonly plan: RuntimeAdoptionPlan;
  readonly planDigest: string;
  readonly publishedAt: string;
  readonly databaseMutation: 'none';
}

export interface RuntimeAdoptionReceiptStoreContext {
  readonly projectRoot: string;
  readonly environmentId: string;
  readonly tenantId: string;
}

export interface PublishRuntimeAdoptionReceiptInput extends RuntimeAdoptionReceiptStoreContext {
  readonly plan: RuntimeAdoptionPlan;
  readonly publishedAt: string;
  /** Re-observed ownership of the live process at the publication boundary. */
  readonly observedRuntime: RuntimeAdoptionPlan['liveRuntime'];
}

export interface PublishRuntimeAdoptionReceiptResult {
  readonly state: 'created' | 'existing-identical';
  readonly receipt: RuntimeAdoptionReceipt;
  readonly projectRelativeReceiptPath: string;
}

export interface ReadRuntimeAdoptionReceiptInput extends RuntimeAdoptionReceiptStoreContext {
  readonly receiptId: string;
  readonly expectedPlanDigest?: string;
  readonly fresh?: boolean;
  readonly observedRuntime?: RuntimeAdoptionPlan['liveRuntime'];
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function equalDigest(left: string, right: string): boolean {
  return SHA256.test(left) && SHA256.test(right)
    && timingSafeEqual(Buffer.from(left.slice(7), 'hex'), Buffer.from(right.slice(7), 'hex'));
}

function base32(bytes: Buffer): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0; let accumulator = 0; let output = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; output += alphabet[(accumulator >>> bits) & 31]!; }
  }
  if (bits !== 0) output += alphabet[(accumulator << (5 - bits)) & 31]!;
  return output;
}

function scopeKey(kind: 'environment' | 'tenant', value: string): string {
  if (value.length === 0 || value !== value.normalize('NFC') || CONTROL.test(value)) {
    throw new RuntimeAdoptionHoldError('INVALID_SCOPE');
  }
  return base32(createHash('sha256').update(`${SCOPE_DOMAIN}${kind}\0${value}`).digest());
}

export function deriveRuntimeAdoptionReceiptScope(input: {
  readonly environmentId: string; readonly tenantId: string;
}): RuntimeAdoptionReceiptScope {
  return Object.freeze({
    environmentKey: scopeKey('environment', input.environmentId),
    tenantKey: scopeKey('tenant', input.tenantId),
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validIso(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function receiptId(body: Omit<RuntimeAdoptionReceipt, 'receiptId'>): string {
  return sha256(`${RECEIPT_DOMAIN}${canonicalRuntimeAdoptionJson(body as unknown as Json)}`);
}

function validateReceipt(value: unknown): RuntimeAdoptionReceipt {
  if (!record(value) || !Object.prototype.hasOwnProperty.call(value, 'version')) {
    throw new RuntimeAdoptionHoldError('INVALID_PLAN');
  }
  if (value['version'] !== RUNTIME_ADOPTION_RECEIPT_VERSION) throw new RuntimeAdoptionHoldError('UNSUPPORTED_VERSION');
  if (!exactKeys(value, ['schema', 'version', 'receiptId', 'scope', 'plan', 'planDigest', 'publishedAt', 'databaseMutation'])
    || value['schema'] !== RUNTIME_ADOPTION_RECEIPT_SCHEMA || typeof value['receiptId'] !== 'string'
    || !SHA256.test(value['receiptId']) || typeof value['planDigest'] !== 'string' || !SHA256.test(value['planDigest'])
    || !validIso(value['publishedAt']) || value['databaseMutation'] !== 'none' || !record(value['scope'])
    || !exactKeys(value['scope'], ['environmentKey', 'tenantKey'])
    || typeof value['scope']['environmentKey'] !== 'string' || !BASE32.test(value['scope']['environmentKey'])
    || typeof value['scope']['tenantKey'] !== 'string' || !BASE32.test(value['scope']['tenantKey'])) {
    throw new RuntimeAdoptionHoldError('INVALID_PLAN');
  }
  const plan = validateRuntimeAdoptionPlan(value['plan']);
  if (!equalDigest(value['planDigest'], plan.planDigest)) throw new RuntimeAdoptionHoldError('PLAN_DIGEST_MISMATCH');
  const candidate = { ...value, plan } as unknown as RuntimeAdoptionReceipt;
  const { receiptId: actualId, ...body } = candidate;
  if (receiptId(body) !== actualId) throw new RuntimeAdoptionHoldError('RECEIPT_COLLISION');
  return deepFreeze(candidate);
}

export function serializeRuntimeAdoptionReceipt(receipt: RuntimeAdoptionReceipt): Buffer {
  return Buffer.from(canonicalRuntimeAdoptionJson(validateReceipt(receipt) as unknown as Json), 'utf8');
}

export function parseRuntimeAdoptionReceipt(bytes: Buffer | string): RuntimeAdoptionReceipt {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  if (buffer.length === 0 || buffer.length > 128 * 1024 || !Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer)) {
    throw new RuntimeAdoptionHoldError('INVALID_PLAN');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(buffer.toString('utf8')); } catch { throw new RuntimeAdoptionHoldError('INVALID_PLAN'); }
  const receipt = validateReceipt(parsed);
  if (canonicalRuntimeAdoptionJson(receipt as unknown as Json) !== buffer.toString('utf8')) {
    throw new RuntimeAdoptionHoldError('INVALID_PLAN');
  }
  return receipt;
}

function trustedRoot(projectRoot: string): string {
  if (!isAbsolute(projectRoot)) throw new RuntimeAdoptionHoldError('INVALID_PATH');
  let root: string;
  try { root = realpathSync(projectRoot); } catch (cause) { throw new RuntimeAdoptionHoldError('INVALID_PATH', { cause }); }
  if (!statSync(root).isDirectory()) throw new RuntimeAdoptionHoldError('INVALID_PATH');
  return root;
}

function secureRelativeFile(root: string, projectRelativePath: string): string {
  const absolute = resolve(root, ...projectRelativePath.split('/'));
  const rel = relative(root, absolute);
  if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new RuntimeAdoptionHoldError('PATH_ESCAPE');
  let cursor = root;
  for (const component of projectRelativePath.split('/').slice(0, -1)) {
    cursor = join(cursor, component);
    let entry;
    try { entry = lstatSync(cursor); } catch (cause) { throw new RuntimeAdoptionHoldError('ARTIFACT_NOT_FOUND', { cause }); }
    if (entry.isSymbolicLink()) throw new RuntimeAdoptionHoldError('UNSAFE_LINK');
    if (!entry.isDirectory()) throw new RuntimeAdoptionHoldError('INVALID_PATH');
  }
  return absolute;
}

interface FileProof { readonly digest: string; readonly dev: bigint; readonly ino: bigint; readonly size: bigint }

function proveFile(root: string, path: string): FileProof {
  const absolute = secureRelativeFile(root, path);
  let fd: number;
  try { fd = openSync(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); }
  catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    throw new RuntimeAdoptionHoldError(code === 'ELOOP' ? 'UNSAFE_LINK' : 'ARTIFACT_NOT_FOUND', { cause });
  }
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new RuntimeAdoptionHoldError('INVALID_PATH');
    const hash = createHash('sha256'); const buffer = Buffer.allocUnsafe(64 * 1024); let position = 0;
    while (position < Number(before.size)) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, Number(before.size) - position), position);
      if (count === 0) throw new RuntimeAdoptionHoldError('ARTIFACT_CHANGED');
      hash.update(buffer.subarray(0, count)); position += count;
    }
    const after = fstatSync(fd, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new RuntimeAdoptionHoldError('ARTIFACT_CHANGED');
    return { digest: `sha256:${hash.digest('hex')}`, dev: before.dev, ino: before.ino, size: before.size };
  } finally { closeSync(fd); }
}

function sameRuntime(left: RuntimeAdoptionPlan['liveRuntime'], right: RuntimeAdoptionPlan['liveRuntime']): boolean {
  return left.runtimeId === right.runtimeId && left.processId === right.processId
    && left.processStartIdentity === right.processStartIdentity
    && equalDigest(left.ownerIdentityDigest, right.ownerIdentityDigest);
}

function verifyBindings(root: string, plan: RuntimeAdoptionPlan, observedRuntime?: RuntimeAdoptionPlan['liveRuntime']): void {
  const provider = proveFile(root, plan.providerObservationReceipt.projectRelativePath);
  if (!equalDigest(provider.digest, plan.providerObservationReceipt.receiptDigest)) {
    throw new RuntimeAdoptionHoldError('PROVIDER_RECEIPT_MISMATCH');
  }
  const target = proveFile(root, plan.targetDatabase.projectRelativePath);
  if (!equalDigest(target.digest, plan.targetDatabase.databaseDigest)) throw new RuntimeAdoptionHoldError('TARGET_DATABASE_MISMATCH');
  const entrypoint = proveFile(root, plan.entrypoint.projectRelativePath);
  if (!equalDigest(entrypoint.digest, plan.entrypoint.artifactDigest)) throw new RuntimeAdoptionHoldError('ENTRYPOINT_MISMATCH');
  if ((provider.dev === target.dev && provider.ino === target.ino)
    || (provider.dev === entrypoint.dev && provider.ino === entrypoint.ino)
    || (target.dev === entrypoint.dev && target.ino === entrypoint.ino)) throw new RuntimeAdoptionHoldError('INVALID_PATH');
  if (observedRuntime === undefined || !sameRuntime(plan.liveRuntime, observedRuntime)) {
    throw new RuntimeAdoptionHoldError('RUNTIME_OWNERSHIP_MISMATCH');
  }
}

function privateDirectory(path: string, create: boolean): void {
  try { if (create) mkdirSync(path, { mode: 0o700 }); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; }
  let entry;
  try { entry = lstatSync(path, { bigint: true }); }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') throw new RuntimeAdoptionHoldError('RECEIPT_NOT_FOUND');
    throw cause;
  }
  if (entry.isSymbolicLink()) throw new RuntimeAdoptionHoldError('UNSAFE_LINK');
  if (!entry.isDirectory()) throw new RuntimeAdoptionHoldError('INVALID_PATH');
  if ((entry.mode & 0o077n) !== 0n || (typeof process.getuid === 'function' && entry.uid !== BigInt(process.getuid()))) {
    throw new RuntimeAdoptionHoldError('PERMISSION_DENIED');
  }
}

function storeDirectory(root: string, scope: RuntimeAdoptionReceiptScope, create: boolean): string {
  let cursor = root;
  for (const component of STORE_COMPONENTS) {
    cursor = join(cursor, component);
    if (component === '.deckent') {
      try { if (create) mkdirSync(cursor, { mode: 0o700 }); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; }
      let entry;
      try { entry = lstatSync(cursor, { bigint: true }); } catch { throw new RuntimeAdoptionHoldError('RECEIPT_NOT_FOUND'); }
      if (entry.isSymbolicLink()) throw new RuntimeAdoptionHoldError('UNSAFE_LINK');
      if (!entry.isDirectory()) throw new RuntimeAdoptionHoldError('INVALID_PATH');
      if ((entry.mode & 0o022n) !== 0n) throw new RuntimeAdoptionHoldError('PERMISSION_DENIED');
    } else privateDirectory(cursor, create);
  }
  for (const component of [scope.environmentKey, scope.tenantKey]) { cursor = join(cursor, component); privateDirectory(cursor, create); }
  return cursor;
}

function fsyncDirectory(path: string): void {
  if (process.platform === 'win32') return;
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function readFinal(path: string, expectedId: string): { receipt: RuntimeAdoptionReceipt; bytes: Buffer; dev: bigint; ino: bigint } {
  let fd: number;
  try { fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') throw new RuntimeAdoptionHoldError('RECEIPT_NOT_FOUND');
    throw new RuntimeAdoptionHoldError('UNSAFE_LINK', { cause });
  }
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > 128n * 1024n || (before.mode & 0o077n) !== 0n) throw new RuntimeAdoptionHoldError('RECEIPT_COLLISION');
    const bytes = Buffer.alloc(Number(before.size)); let position = 0;
    while (position < bytes.length) { const count = readSync(fd, bytes, position, bytes.length - position, position); if (count === 0) throw new RuntimeAdoptionHoldError('RECEIPT_COLLISION'); position += count; }
    const after = fstatSync(fd, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new RuntimeAdoptionHoldError('RECEIPT_COLLISION');
    const receipt = parseRuntimeAdoptionReceipt(bytes);
    if (receipt.receiptId !== expectedId) throw new RuntimeAdoptionHoldError('RECEIPT_COLLISION');
    return { receipt, bytes, dev: before.dev, ino: before.ino };
  } finally { closeSync(fd); }
}

function buildReceipt(input: PublishRuntimeAdoptionReceiptInput): RuntimeAdoptionReceipt {
  const plan = validateRuntimeAdoptionPlan(input.plan);
  const root = trustedRoot(input.projectRoot);
  verifyBindings(root, plan, input.observedRuntime);
  if (!validIso(input.publishedAt)) throw new RuntimeAdoptionHoldError('INVALID_PLAN');
  const body = {
    schema: RUNTIME_ADOPTION_RECEIPT_SCHEMA, version: RUNTIME_ADOPTION_RECEIPT_VERSION,
    scope: deriveRuntimeAdoptionReceiptScope(input), plan, planDigest: plan.planDigest,
    publishedAt: input.publishedAt, databaseMutation: 'none' as const,
  } satisfies Omit<RuntimeAdoptionReceipt, 'receiptId'>;
  return deepFreeze({ ...body, receiptId: receiptId(body) });
}

export function publishRuntimeAdoptionReceipt(input: PublishRuntimeAdoptionReceiptInput): PublishRuntimeAdoptionReceiptResult {
  const receipt = buildReceipt(input); const intended = serializeRuntimeAdoptionReceipt(receipt);
  const root = trustedRoot(input.projectRoot); const directory = storeDirectory(root, receipt.scope, true);
  const finalPath = join(directory, `${receipt.receiptId.slice(7)}.json`);
  const temporaryPath = join(directory, `.receipt-${randomBytes(16).toString('hex')}.tmp`);
  let created = false; let temporaryIdentity: { dev: bigint; ino: bigint } | undefined;
  try {
    const fd = openSync(temporaryPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    try {
      let offset = 0; while (offset < intended.length) { const count = writeSync(fd, intended, offset, intended.length - offset, null); if (count === 0) throw new RuntimeAdoptionHoldError('DURABILITY_UNCONFIRMED'); offset += count; }
      fsyncSync(fd); const entry = fstatSync(fd, { bigint: true });
      if (!entry.isFile() || entry.size !== BigInt(intended.length) || (entry.mode & 0o077n) !== 0n) throw new RuntimeAdoptionHoldError('DURABILITY_UNCONFIRMED');
      temporaryIdentity = { dev: entry.dev, ino: entry.ino };
    } finally { closeSync(fd); }
    try { linkSync(temporaryPath, finalPath); created = true; }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw new RuntimeAdoptionHoldError('UNSUPPORTED_FILESYSTEM', { cause }); }
    fsyncDirectory(directory);
    let observed;
    try { observed = readFinal(finalPath, receipt.receiptId); }
    catch (cause) { if (!created) throw new RuntimeAdoptionHoldError('RECEIPT_COLLISION', { cause }); throw cause; }
    if ((created && temporaryIdentity !== undefined && (observed.dev !== temporaryIdentity.dev || observed.ino !== temporaryIdentity.ino))
      || !observed.bytes.equals(intended)) throw new RuntimeAdoptionHoldError('RECEIPT_COLLISION');
    return Object.freeze({ state: created ? 'created' : 'existing-identical', receipt: observed.receipt,
      projectRelativeReceiptPath: relative(root, finalPath).split(sep).join('/') });
  } finally {
    try { const entry = lstatSync(temporaryPath, { bigint: true }); if (temporaryIdentity && entry.dev === temporaryIdentity.dev && entry.ino === temporaryIdentity.ino) unlinkSync(temporaryPath); } catch { /* preserve final authority */ }
  }
}

export function readRuntimeAdoptionReceipt(input: ReadRuntimeAdoptionReceiptInput): RuntimeAdoptionReceipt {
  if (!SHA256.test(input.receiptId)) throw new RuntimeAdoptionHoldError('INVALID_PLAN');
  const root = trustedRoot(input.projectRoot); const scope = deriveRuntimeAdoptionReceiptScope(input);
  const receipt = readFinal(join(storeDirectory(root, scope, false), `${input.receiptId.slice(7)}.json`), input.receiptId).receipt;
  if (receipt.scope.environmentKey !== scope.environmentKey || receipt.scope.tenantKey !== scope.tenantKey) throw new RuntimeAdoptionHoldError('INVALID_SCOPE');
  if (input.expectedPlanDigest !== undefined && !equalDigest(input.expectedPlanDigest, receipt.planDigest)) throw new RuntimeAdoptionHoldError('PLAN_DIGEST_MISMATCH');
  if (input.fresh === true) verifyBindings(root, receipt.plan, input.observedRuntime);
  return receipt;
}

export function discoverRuntimeAdoptionReceipts(input: RuntimeAdoptionReceiptStoreContext & { readonly maxEntries?: number }): readonly RuntimeAdoptionReceipt[] {
  const maximum = input.maxEntries ?? RUNTIME_ADOPTION_MAX_DISCOVERY;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > RUNTIME_ADOPTION_MAX_DISCOVERY) throw new RuntimeAdoptionHoldError('DISCOVERY_LIMIT_EXCEEDED');
  const root = trustedRoot(input.projectRoot); const scope = deriveRuntimeAdoptionReceiptScope(input);
  const directory = storeDirectory(root, scope, false); const names = readdirSync(directory);
  if (names.length > maximum) throw new RuntimeAdoptionHoldError('DISCOVERY_LIMIT_EXCEEDED');
  return Object.freeze(names.sort().filter((name) => FINAL_NAME.test(name)).map((name) => {
    const id = `sha256:${name.slice(0, 64)}`; const receipt = readFinal(join(directory, name), id).receipt;
    if (receipt.scope.environmentKey !== scope.environmentKey || receipt.scope.tenantKey !== scope.tenantKey) throw new RuntimeAdoptionHoldError('INVALID_SCOPE');
    return receipt;
  }));
}

export class RuntimeAdoptionReceiptStore {
  constructor(private readonly context: RuntimeAdoptionReceiptStoreContext) {}
  publish(input: Omit<PublishRuntimeAdoptionReceiptInput, keyof RuntimeAdoptionReceiptStoreContext>): PublishRuntimeAdoptionReceiptResult {
    return publishRuntimeAdoptionReceipt({ ...input, ...this.context });
  }
  read(input: Omit<ReadRuntimeAdoptionReceiptInput, keyof RuntimeAdoptionReceiptStoreContext>): RuntimeAdoptionReceipt {
    return readRuntimeAdoptionReceipt({ ...input, ...this.context });
  }
  discover(maxEntries?: number): readonly RuntimeAdoptionReceipt[] {
    return discoverRuntimeAdoptionReceipts({ ...this.context, maxEntries });
  }
}
