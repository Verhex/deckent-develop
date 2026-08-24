/** Immutable, content-addressed authority for prompt-cost canary decisions. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const PROMPT_COST_CANARY_RECEIPT_SCHEMA = 'deckent.prompt-cost-canary-receipt' as const;
export const PROMPT_COST_CANARY_RECEIPT_VERSION = 1 as const;
export const PROMPT_COST_CANARY_RECEIPT_MAX_DISCOVERY = 10_000;

const RECEIPT_DOMAIN = 'deckent:prompt-cost-canary-receipt:v1\0';
const DECISION_DOMAIN = 'deckent:prompt-cost-canary-decision:v1\0';
const SCOPE_DOMAIN = 'deckent:prompt-cost-canary-scope:v1\0';
const STORE_COMPONENTS = ['.deckent', 'prompt-cost-canary', 'receipts', 'v1'] as const;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const BASE32 = /^[a-z2-7]{52}$/u;
const FINAL_NAME = /^[a-f0-9]{64}\.json$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const MAX_RECEIPT_BYTES = 256 * 1024;
const MAX_DECISION_NODES = 4_096;
const MAX_DECISION_DEPTH = 32;

export type PromptCostCanaryJson =
  | null | boolean | number | string
  | readonly PromptCostCanaryJson[]
  | { readonly [key: string]: PromptCostCanaryJson };

/** The exact comparison output. Its domain fields are preserved, not projected. */
export type PromptCostCanaryComparisonDecision = Readonly<Record<string, PromptCostCanaryJson>>;

export type PromptCostCanaryReceiptStoreErrorCode =
  | 'INVALID_SCOPE'
  | 'INVALID_PATH'
  | 'PATH_ESCAPE'
  | 'UNSAFE_LINK'
  | 'PERMISSION_DENIED'
  | 'INVALID_DECISION'
  | 'UNSUPPORTED_VERSION'
  | 'DECISION_MISMATCH'
  | 'RECEIPT_NOT_FOUND'
  | 'RECEIPT_COLLISION'
  | 'DISCOVERY_LIMIT_EXCEEDED'
  | 'DURABILITY_UNCONFIRMED'
  | 'UNSUPPORTED_FILESYSTEM';

/** Every store failure is a fail-closed HOLD, including corrupt existing bytes. */
export class PromptCostCanaryReceiptStoreError extends Error {
  readonly state = 'HOLD' as const;

  constructor(readonly code: PromptCostCanaryReceiptStoreErrorCode, options?: ErrorOptions) {
    super(`PROMPT_COST_CANARY_HOLD:${code}`, options);
    this.name = 'PromptCostCanaryReceiptStoreError';
  }
}

export interface PromptCostCanaryReceiptScope {
  readonly environmentKey: string;
  readonly tenantKey: string;
}

export interface PromptCostCanaryReceipt {
  readonly schema: typeof PROMPT_COST_CANARY_RECEIPT_SCHEMA;
  readonly version: typeof PROMPT_COST_CANARY_RECEIPT_VERSION;
  readonly receiptId: string;
  readonly scope: PromptCostCanaryReceiptScope;
  readonly decision: PromptCostCanaryComparisonDecision;
  readonly decisionDigest: string;
  readonly publishedAt: string;
}

export interface PromptCostCanaryReceiptStoreContext {
  readonly projectRoot: string;
  readonly environmentId: string;
  readonly tenantId: string;
}

export interface PublishPromptCostCanaryReceiptInput extends PromptCostCanaryReceiptStoreContext {
  readonly decision: PromptCostCanaryComparisonDecision;
  readonly publishedAt: string;
}

export interface PublishPromptCostCanaryReceiptResult {
  readonly state: 'created' | 'existing-identical';
  readonly receipt: PromptCostCanaryReceipt;
  readonly projectRelativeReceiptPath: string;
}

export interface ReadPromptCostCanaryReceiptInput extends PromptCostCanaryReceiptStoreContext {
  readonly receiptId: string;
  readonly expectedDecisionDigest?: string;
  /** Documents that replay must use durable bytes; reads are never cached. */
  readonly fresh?: boolean;
}

function fail(code: PromptCostCanaryReceiptStoreErrorCode, cause?: unknown): never {
  throw new PromptCostCanaryReceiptStoreError(code, cause === undefined ? undefined : { cause });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonical(value: PromptCostCanaryJson): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Readonly<Record<string, PromptCostCanaryJson>>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key]!)}`).join(',')}}`;
}

function digest(domain: string, value: PromptCostCanaryJson): string {
  return `sha256:${createHash('sha256').update(domain).update(canonical(value)).digest('hex')}`;
}

function equalDigest(left: string, right: string): boolean {
  return SHA256.test(left) && SHA256.test(right)
    && timingSafeEqual(Buffer.from(left.slice(7), 'hex'), Buffer.from(right.slice(7), 'hex'));
}

function validIso(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validRelativePath(value: string): boolean {
  if (value.length === 0 || value.length > 1_024 || value !== value.normalize('NFC')
    || value.startsWith('/') || value.includes('\\') || CONTROL.test(value)
    || /^[A-Za-z]:/u.test(value) || value.includes('://')) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'
    && !part.includes(':') && !WINDOWS_RESERVED.test(part) && !part.endsWith('.') && !part.endsWith(' '));
}

/** Strictly admits a bounded JSON tree and validates every declared project path. */
function validateDecision(value: unknown): PromptCostCanaryComparisonDecision {
  let nodes = 0;
  const visit = (candidate: unknown, depth: number, key?: string): void => {
    nodes += 1;
    if (nodes > MAX_DECISION_NODES || depth > MAX_DECISION_DEPTH) fail('INVALID_DECISION');
    if (candidate === null || typeof candidate === 'boolean') return;
    if (typeof candidate === 'number') {
      // Cost and quality measurements legitimately contain fractions. JSON has
      // no NaN/Infinity representation, so finite values are the strict bound.
      if (!Number.isFinite(candidate)) fail('INVALID_DECISION');
      return;
    }
    if (typeof candidate === 'string') {
      if (candidate.length > 16_384 || candidate !== candidate.normalize('NFC') || CONTROL.test(candidate)) fail('INVALID_DECISION');
      if (key === 'projectRelativePath' && !validRelativePath(candidate)) fail('PATH_ESCAPE');
      return;
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > 1_024) fail('INVALID_DECISION');
      for (const child of candidate) visit(child, depth + 1);
      return;
    }
    if (!record(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) fail('INVALID_DECISION');
    const keys = Object.keys(candidate);
    if (keys.length > 256 || keys.some((name) => !SAFE_KEY.test(name))) fail('INVALID_DECISION');
    for (const name of keys) visit(candidate[name], depth + 1, name);
  };
  if (!record(value) || Object.keys(value).length === 0) fail('INVALID_DECISION');
  visit(value, 0);
  return value as PromptCostCanaryComparisonDecision;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function promptCostCanaryDecisionDigest(decision: PromptCostCanaryComparisonDecision): string {
  return digest(DECISION_DOMAIN, validateDecision(decision));
}

export function promptCostCanaryReceiptId(body: Omit<PromptCostCanaryReceipt, 'receiptId'>): string {
  return digest(RECEIPT_DOMAIN, body as unknown as PromptCostCanaryJson);
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
  if (value.length === 0 || value.length > 1_024 || value !== value.normalize('NFC') || CONTROL.test(value)) fail('INVALID_SCOPE');
  return base32(createHash('sha256').update(`${SCOPE_DOMAIN}${kind}\0${value}`).digest());
}

export function derivePromptCostCanaryReceiptScope(input: {
  readonly environmentId: string; readonly tenantId: string;
}): PromptCostCanaryReceiptScope {
  return Object.freeze({
    environmentKey: scopeKey('environment', input.environmentId),
    tenantKey: scopeKey('tenant', input.tenantId),
  });
}

function validateReceipt(value: unknown): PromptCostCanaryReceipt {
  if (!record(value)) fail('INVALID_DECISION');
  if (value['version'] !== PROMPT_COST_CANARY_RECEIPT_VERSION) {
    if (Number.isSafeInteger(value['version'])) fail('UNSUPPORTED_VERSION');
    fail('INVALID_DECISION');
  }
  if (!exactKeys(value, ['schema', 'version', 'receiptId', 'scope', 'decision', 'decisionDigest', 'publishedAt'])
    || value['schema'] !== PROMPT_COST_CANARY_RECEIPT_SCHEMA
    || typeof value['receiptId'] !== 'string' || !SHA256.test(value['receiptId'])
    || typeof value['decisionDigest'] !== 'string' || !SHA256.test(value['decisionDigest'])
    || !validIso(value['publishedAt']) || !record(value['scope'])
    || !exactKeys(value['scope'], ['environmentKey', 'tenantKey'])
    || typeof value['scope']['environmentKey'] !== 'string' || !BASE32.test(value['scope']['environmentKey'])
    || typeof value['scope']['tenantKey'] !== 'string' || !BASE32.test(value['scope']['tenantKey'])) fail('INVALID_DECISION');
  const decision = validateDecision(value['decision']);
  if (!equalDigest(value['decisionDigest'], promptCostCanaryDecisionDigest(decision))) fail('DECISION_MISMATCH');
  const receipt = { ...value, decision } as unknown as PromptCostCanaryReceipt;
  const { receiptId, ...body } = receipt;
  if (!equalDigest(receiptId, promptCostCanaryReceiptId(body))) fail('RECEIPT_COLLISION');
  return deepFreeze(receipt);
}

export function serializePromptCostCanaryReceipt(receipt: PromptCostCanaryReceipt): Buffer {
  return Buffer.from(canonical(validateReceipt(receipt) as unknown as PromptCostCanaryJson), 'utf8');
}

export function parsePromptCostCanaryReceipt(bytes: Buffer | string): PromptCostCanaryReceipt {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  if (buffer.length === 0 || buffer.length > MAX_RECEIPT_BYTES
    || !Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer)) fail('INVALID_DECISION');
  let parsed: unknown;
  try { parsed = JSON.parse(buffer.toString('utf8')); } catch (cause) { fail('INVALID_DECISION', cause); }
  const receipt = validateReceipt(parsed);
  if (canonical(receipt as unknown as PromptCostCanaryJson) !== buffer.toString('utf8')) fail('INVALID_DECISION');
  return receipt;
}

function trustedRoot(projectRoot: string): string {
  if (!isAbsolute(projectRoot)) fail('INVALID_PATH');
  const requested = resolve(projectRoot);
  let root: string;
  try {
    const entry = lstatSync(requested);
    if (entry.isSymbolicLink() || !entry.isDirectory()) fail(entry.isSymbolicLink() ? 'UNSAFE_LINK' : 'INVALID_PATH');
    root = realpathSync(requested);
  } catch (cause) {
    if (cause instanceof PromptCostCanaryReceiptStoreError) throw cause;
    fail('INVALID_PATH', cause);
  }
  if (!statSync(root).isDirectory()) fail('INVALID_PATH');
  return root;
}

function directoryComponent(path: string, create: boolean, shared: boolean): void {
  try { if (create) mkdirSync(path, { mode: 0o700 }); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; }
  let entry;
  try { entry = lstatSync(path, { bigint: true }); }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') fail('RECEIPT_NOT_FOUND', cause);
    throw cause;
  }
  if (entry.isSymbolicLink()) fail('UNSAFE_LINK');
  if (!entry.isDirectory()) fail('INVALID_PATH');
  const forbidden = shared ? 0o022n : 0o077n;
  if ((entry.mode & forbidden) !== 0n
    || (!shared && typeof process.getuid === 'function' && entry.uid !== BigInt(process.getuid()))) fail('PERMISSION_DENIED');
}

function storeDirectory(root: string, scope: PromptCostCanaryReceiptScope, create: boolean): string {
  let cursor = root;
  for (const component of STORE_COMPONENTS) {
    cursor = join(cursor, component);
    directoryComponent(cursor, create, component === '.deckent');
  }
  for (const component of [scope.environmentKey, scope.tenantKey]) {
    cursor = join(cursor, component);
    directoryComponent(cursor, create, false);
  }
  const rel = relative(root, cursor);
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) fail('PATH_ESCAPE');
  return cursor;
}

function fsyncDirectory(path: string): void {
  if (process.platform === 'win32') return;
  let fd: number;
  try { fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW); }
  catch (cause) { fail('DURABILITY_UNCONFIRMED', cause); }
  try { fsyncSync(fd); } catch (cause) { fail('DURABILITY_UNCONFIRMED', cause); } finally { closeSync(fd); }
}

interface ReadProof { readonly receipt: PromptCostCanaryReceipt; readonly bytes: Buffer; readonly dev: bigint; readonly ino: bigint }

function readFinal(path: string, expectedId: string): ReadProof {
  let fd: number;
  try { fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') fail('RECEIPT_NOT_FOUND', cause);
    fail('UNSAFE_LINK', cause);
  }
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size < 1n || before.size > BigInt(MAX_RECEIPT_BYTES)
      || (before.mode & 0o077n) !== 0n) fail('RECEIPT_COLLISION');
    const bytes = Buffer.alloc(Number(before.size));
    let position = 0;
    while (position < bytes.length) {
      const count = readSync(fd, bytes, position, bytes.length - position, position);
      if (count === 0) fail('RECEIPT_COLLISION');
      position += count;
    }
    const after = fstatSync(fd, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) fail('RECEIPT_COLLISION');
    let receipt: PromptCostCanaryReceipt;
    try { receipt = parsePromptCostCanaryReceipt(bytes); }
    catch (cause) { fail('RECEIPT_COLLISION', cause); }
    if (!equalDigest(receipt.receiptId, expectedId)) fail('RECEIPT_COLLISION');
    return { receipt, bytes, dev: before.dev, ino: before.ino };
  } finally { closeSync(fd); }
}

function createReceipt(input: PublishPromptCostCanaryReceiptInput): PromptCostCanaryReceipt {
  if (!validIso(input.publishedAt)) fail('INVALID_DECISION');
  const decision = validateDecision(input.decision);
  const body = {
    schema: PROMPT_COST_CANARY_RECEIPT_SCHEMA,
    version: PROMPT_COST_CANARY_RECEIPT_VERSION,
    scope: derivePromptCostCanaryReceiptScope(input),
    decision,
    decisionDigest: promptCostCanaryDecisionDigest(decision),
    publishedAt: input.publishedAt,
  } satisfies Omit<PromptCostCanaryReceipt, 'receiptId'>;
  return deepFreeze({ ...body, receiptId: promptCostCanaryReceiptId(body) });
}

export function publishPromptCostCanaryReceipt(input: PublishPromptCostCanaryReceiptInput): PublishPromptCostCanaryReceiptResult {
  const root = trustedRoot(input.projectRoot);
  const receipt = createReceipt(input);
  const intended = serializePromptCostCanaryReceipt(receipt);
  const directory = storeDirectory(root, receipt.scope, true);
  const finalPath = join(directory, `${receipt.receiptId.slice(7)}.json`);
  const temporaryPath = join(directory, `.receipt-${randomBytes(16).toString('hex')}.tmp`);
  let created = false;
  let temporaryIdentity: { dev: bigint; ino: bigint } | undefined;
  try {
    let fd: number;
    try { fd = openSync(temporaryPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600); }
    catch (cause) { fail('UNSUPPORTED_FILESYSTEM', cause); }
    try {
      let offset = 0;
      while (offset < intended.length) {
        const count = writeSync(fd, intended, offset, intended.length - offset, null);
        if (count === 0) fail('DURABILITY_UNCONFIRMED');
        offset += count;
      }
      fsyncSync(fd);
      const entry = fstatSync(fd, { bigint: true });
      if (!entry.isFile() || entry.size !== BigInt(intended.length) || (entry.mode & 0o077n) !== 0n) fail('DURABILITY_UNCONFIRMED');
      temporaryIdentity = { dev: entry.dev, ino: entry.ino };
    } finally { closeSync(fd); }
    try { linkSync(temporaryPath, finalPath); created = true; }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') fail('UNSUPPORTED_FILESYSTEM', cause); }
    fsyncDirectory(directory);
    let observed: ReadProof;
    try { observed = readFinal(finalPath, receipt.receiptId); }
    catch (cause) { if (!created) fail('RECEIPT_COLLISION', cause); throw cause; }
    if ((created && temporaryIdentity !== undefined
      && (observed.dev !== temporaryIdentity.dev || observed.ino !== temporaryIdentity.ino))
      || !observed.bytes.equals(intended)) fail('RECEIPT_COLLISION');
    return Object.freeze({
      state: created ? 'created' : 'existing-identical',
      receipt: observed.receipt,
      projectRelativeReceiptPath: relative(root, finalPath).split(sep).join('/'),
    });
  } finally {
    try {
      const entry = lstatSync(temporaryPath, { bigint: true });
      if (temporaryIdentity !== undefined && entry.dev === temporaryIdentity.dev && entry.ino === temporaryIdentity.ino) unlinkSync(temporaryPath);
    } catch { /* Never disturb a concurrently published final authority. */ }
  }
}

export function readPromptCostCanaryReceipt(input: ReadPromptCostCanaryReceiptInput): PromptCostCanaryReceipt {
  if (!SHA256.test(input.receiptId)) fail('INVALID_DECISION');
  const root = trustedRoot(input.projectRoot);
  const scope = derivePromptCostCanaryReceiptScope(input);
  const receipt = readFinal(join(storeDirectory(root, scope, false), `${input.receiptId.slice(7)}.json`), input.receiptId).receipt;
  if (receipt.scope.environmentKey !== scope.environmentKey || receipt.scope.tenantKey !== scope.tenantKey) fail('INVALID_SCOPE');
  if (input.expectedDecisionDigest !== undefined
    && !equalDigest(input.expectedDecisionDigest, receipt.decisionDigest)) fail('DECISION_MISMATCH');
  return receipt;
}

export function discoverPromptCostCanaryReceipts(
  input: PromptCostCanaryReceiptStoreContext & { readonly maxEntries?: number },
): readonly PromptCostCanaryReceipt[] {
  const maximum = input.maxEntries ?? PROMPT_COST_CANARY_RECEIPT_MAX_DISCOVERY;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > PROMPT_COST_CANARY_RECEIPT_MAX_DISCOVERY) fail('DISCOVERY_LIMIT_EXCEEDED');
  const root = trustedRoot(input.projectRoot);
  const scope = derivePromptCostCanaryReceiptScope(input);
  const directory = storeDirectory(root, scope, false);
  let names: string[];
  try { names = readdirSync(directory); } catch (cause) { fail('RECEIPT_NOT_FOUND', cause); }
  if (names.length > maximum) fail('DISCOVERY_LIMIT_EXCEEDED');
  return Object.freeze(names.sort().map((name) => {
    if (!FINAL_NAME.test(name)) fail('RECEIPT_COLLISION');
    const receipt = readFinal(join(directory, name), `sha256:${name.slice(0, 64)}`).receipt;
    if (receipt.scope.environmentKey !== scope.environmentKey || receipt.scope.tenantKey !== scope.tenantKey) fail('INVALID_SCOPE');
    return receipt;
  }));
}

export class PromptCostCanaryReceiptStore {
  constructor(private readonly context: PromptCostCanaryReceiptStoreContext) {}

  publish(input: Omit<PublishPromptCostCanaryReceiptInput, keyof PromptCostCanaryReceiptStoreContext>): PublishPromptCostCanaryReceiptResult {
    return publishPromptCostCanaryReceipt({ ...input, ...this.context });
  }

  read(input: Omit<ReadPromptCostCanaryReceiptInput, keyof PromptCostCanaryReceiptStoreContext>): PromptCostCanaryReceipt {
    return readPromptCostCanaryReceipt({ ...input, ...this.context });
  }

  discover(maxEntries?: number): readonly PromptCostCanaryReceipt[] {
    return discoverPromptCostCanaryReceipts({ ...this.context, maxEntries });
  }
}
