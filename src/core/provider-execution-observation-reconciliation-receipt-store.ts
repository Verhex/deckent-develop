/** Immutable, content-addressed receipts for completed observation reconciliation. */
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync, constants as fsConstants, fstatSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, openSync, readdirSync, readSync, realpathSync, statSync, unlinkSync, writeSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  inventoryProviderExecutionObservationReconciliation,
  type ProviderExecutionObservationReconciliationBounds,
  type ProviderExecutionObservationReconciliationPlan,
  type ProviderExecutionObservationRetirementCandidate,
} from './provider-execution-observation-reconciliation.js';
import { ProviderExecutionObservationStore } from './provider-execution-observation-store.js';
import {
  isVerifiedProviderExecutionObservationReconciliationApprovalClaim,
  type ProviderExecutionObservationReconciliationApprovalClaim,
  type ProviderExecutionObservationReconciliationAuthorizedApplyResult,
} from './provider-execution-observation-reconciliation-approval.js';

export const PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_SCHEMA =
  'deckent.provider-execution-observation-reconciliation-receipt' as const;
export const PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_VERSION = 1 as const;
export const PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_MAX_DISCOVERY = 10_000;

const DOMAIN = 'deckent:provider-observation-reconciliation-receipt:v1\0';
const SCOPE_DOMAIN = 'deckent:provider-observation-reconciliation-scope:v1\0';
const HEX = /^[a-f0-9]{64}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const BASE32 = /^[a-z2-7]{52}$/u;
const FINAL_NAME = /^[a-f0-9]{64}\.json$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const COMPONENTS = ['.deckent', 'provider-execution-observation-reconciliation', 'receipts', 'v1'] as const;
const HOLD_CODES = ['missing-fence', 'foreign-attempt', 'end-before-start', 'conflicting-replay'] as const;
type HoldCode = typeof HOLD_CODES[number];
type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export type ProviderExecutionObservationReconciliationReceiptStoreErrorCode =
  | 'INVALID_SCOPE' | 'INVALID_PATH' | 'PATH_ESCAPE' | 'UNSAFE_LINK' | 'PERMISSION_DENIED'
  | 'INPUT_CHANGED' | 'INVALID_RECEIPT' | 'UNSUPPORTED_RECEIPT_VERSION' | 'RECEIPT_NOT_FOUND'
  | 'RECEIPT_COLLISION' | 'DISCOVERY_LIMIT_EXCEEDED' | 'DURABILITY_UNCONFIRMED'
  | 'PLAN_MISMATCH' | 'RECONCILIATION_MISMATCH' | 'LINEAGE_MISMATCH';

export class ProviderExecutionObservationReconciliationReceiptStoreError extends Error {
  constructor(readonly code: ProviderExecutionObservationReconciliationReceiptStoreErrorCode, options?: ErrorOptions) {
    super(code, options); this.name = 'ProviderExecutionObservationReconciliationReceiptStoreError';
  }
}

export interface ProviderExecutionObservationReconciliationReceiptScope {
  readonly projectKey: string; readonly tenantKey: string; readonly environmentKey: string;
}
export interface ProviderExecutionObservationReconciliationReceiptLineage {
  readonly schemaDigest: string; readonly rowLineageDigest: string; readonly activeOpenCount: number;
}
export interface ProviderExecutionObservationReconciliationReceiptExecution extends ProviderExecutionObservationRetirementCandidate {}
export interface ProviderExecutionObservationReconciliationDurableReceipt {
  readonly schema: typeof PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_SCHEMA;
  readonly version: typeof PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_VERSION;
  readonly receiptId: string; readonly scope: ProviderExecutionObservationReconciliationReceiptScope;
  readonly planDigest: string; readonly approvalClaim: ProviderExecutionObservationReconciliationApprovalClaim;
  readonly relativeDatabasePath: string; readonly state: 'applied' | 'replayed';
  readonly retiredExecutions: readonly ProviderExecutionObservationReconciliationReceiptExecution[];
  readonly retainedHoldReasonCounts: Readonly<Record<HoldCode, number>>;
  readonly before: ProviderExecutionObservationReconciliationReceiptLineage;
  readonly after: ProviderExecutionObservationReconciliationReceiptLineage;
  readonly retiredCount: number; readonly verifiedAt: string;
}
export interface ProviderExecutionObservationReconciliationReceiptStoreContext {
  readonly projectRoot: string; readonly tenantId: string; readonly environmentId: string;
}
export interface PublishProviderExecutionObservationReconciliationReceiptInput extends ProviderExecutionObservationReconciliationReceiptStoreContext {
  readonly plan: ProviderExecutionObservationReconciliationPlan;
  readonly result: ProviderExecutionObservationReconciliationAuthorizedApplyResult;
  /** Time at which the caller freshly verified the post-apply durable state. */
  readonly verifiedAt: string; readonly bounds?: ProviderExecutionObservationReconciliationBounds;
  readonly maxPrincipalDigests?: number; readonly maxRetainedHolds?: number;
}
export interface PublishProviderExecutionObservationReconciliationReceiptResult {
  readonly state: 'created' | 'existing-identical'; readonly receipt: ProviderExecutionObservationReconciliationDurableReceipt;
  readonly projectRelativeReceiptPath: string;
}
export interface ReadProviderExecutionObservationReconciliationReceiptInput extends ProviderExecutionObservationReconciliationReceiptStoreContext {
  readonly receiptId: string; readonly expectedPlanDigest?: string; readonly fresh?: boolean;
  readonly bounds?: ProviderExecutionObservationReconciliationBounds; readonly maxPrincipalDigests?: number;
  readonly maxRetainedHolds?: number;
}

function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as { readonly [key: string]: Json };
  return `{${Object.keys(object).sort().map(k => `${JSON.stringify(k)}:${canonical(object[k]!)}`).join(',')}}`;
}
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function base32(bytes: Buffer): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'; let bits = 0; let accumulator = 0; let result = '';
  for (const byte of bytes) { accumulator = (accumulator << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; result += alphabet[(accumulator >>> bits) & 31]!; } }
  return bits === 0 ? result : result + alphabet[(accumulator << (5 - bits)) & 31]!;
}
function scopePart(kind: string, value: string): string {
  if (value.length === 0 || value !== value.normalize('NFC') || CONTROL.test(value)) throw error('INVALID_SCOPE');
  return base32(createHash('sha256').update(`${SCOPE_DOMAIN}${kind}\0${value}`).digest());
}
export function deriveProviderExecutionObservationReconciliationReceiptScope(input: ProviderExecutionObservationReconciliationReceiptStoreContext): ProviderExecutionObservationReconciliationReceiptScope {
  const root = trustedRoot(input.projectRoot);
  return Object.freeze({ projectKey: scopePart('project', root), tenantKey: scopePart('tenant', input.tenantId), environmentKey: scopePart('environment', input.environmentId) });
}
function error(code: ProviderExecutionObservationReconciliationReceiptStoreErrorCode, options?: ErrorOptions): ProviderExecutionObservationReconciliationReceiptStoreError { return new ProviderExecutionObservationReconciliationReceiptStoreError(code, options); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exactKeys(value: object, expected: readonly string[]): boolean { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, i) => key === [...expected].sort()[i]); }
function nonNegative(value: unknown, maximum = 1_000_000): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum; }
function validIso(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && new Date(value).toISOString() === value; }
function validRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.normalize('NFC') || value.startsWith('/') || value.includes('\\') || CONTROL.test(value) || /^[A-Za-z]:/u.test(value)) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !part.includes(':') && !RESERVED.test(part) && !part.endsWith('.') && !part.endsWith(' '));
}
function normalizeDigest(value: string): string { return SHA256.test(value) ? value : `sha256:${value}`; }
function validExecution(value: unknown): value is ProviderExecutionObservationReconciliationReceiptExecution {
  return record(value) && exactKeys(value, ['executionId', 'runId', 'taskId', 'attemptId', 'providerPrincipalDigest', 'fence', 'settlementDigest', 'closureDigest'])
    && ['executionId', 'runId', 'taskId', 'attemptId', 'providerPrincipalDigest', 'fence'].every(key => typeof value[key] === 'string' && value[key] !== '')
    && typeof value['settlementDigest'] === 'string' && HEX.test(value['settlementDigest']) && typeof value['closureDigest'] === 'string' && HEX.test(value['closureDigest']);
}
function validApprovalClaim(value: unknown): value is ProviderExecutionObservationReconciliationApprovalClaim {
  return record(value) && exactKeys(value, ['schemaVersion', 'kind', 'requestId', 'requestDigest', 'decisionDigest', 'subjectDigest', 'decidedAt', 'authorityRef'])
    && value['schemaVersion'] === 1 && value['kind'] === 'provider-execution-observation-reconciliation-approval'
    && typeof value['requestId'] === 'string' && value['requestId'] !== ''
    && ['requestDigest', 'decisionDigest', 'subjectDigest'].every(key => typeof value[key] === 'string' && HEX.test(value[key]))
    && validIso(value['decidedAt']) && typeof value['authorityRef'] === 'string' && value['authorityRef'] !== '';
}
function validLineage(value: unknown): value is ProviderExecutionObservationReconciliationReceiptLineage {
  return record(value) && exactKeys(value, ['schemaDigest', 'rowLineageDigest', 'activeOpenCount']) && typeof value['schemaDigest'] === 'string' && SHA256.test(value['schemaDigest']) && typeof value['rowLineageDigest'] === 'string' && SHA256.test(value['rowLineageDigest']) && nonNegative(value['activeOpenCount']);
}
function invalid(): ProviderExecutionObservationReconciliationReceiptStoreError { return error('INVALID_RECEIPT'); }
function validateShape(value: unknown): asserts value is ProviderExecutionObservationReconciliationDurableReceipt {
  if (!record(value) || typeof value['version'] !== 'number' || !Number.isSafeInteger(value['version'])) throw invalid();
  if (value['version'] !== PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_VERSION) throw error('UNSUPPORTED_RECEIPT_VERSION');
  if (!exactKeys(value, ['schema', 'version', 'receiptId', 'scope', 'planDigest', 'approvalClaim', 'relativeDatabasePath', 'state', 'retiredExecutions', 'retainedHoldReasonCounts', 'before', 'after', 'retiredCount', 'verifiedAt'])
    || value['schema'] !== PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_SCHEMA || typeof value['receiptId'] !== 'string' || !SHA256.test(value['receiptId']) || typeof value['planDigest'] !== 'string' || !SHA256.test(value['planDigest']) || !validApprovalClaim(value['approvalClaim']) || !validRelativePath(value['relativeDatabasePath']) || (value['state'] !== 'applied' && value['state'] !== 'replayed') || !Array.isArray(value['retiredExecutions']) || !nonNegative(value['retiredCount']) || !validIso(value['verifiedAt']) || !validLineage(value['before']) || !validLineage(value['after'])) throw invalid();
  const scope = value['scope']; const holds = value['retainedHoldReasonCounts'];
  if (!record(scope) || !exactKeys(scope, ['projectKey', 'tenantKey', 'environmentKey']) || !Object.values(scope).every(item => typeof item === 'string' && BASE32.test(item)) || !record(holds) || !exactKeys(holds, HOLD_CODES) || !HOLD_CODES.every(code => nonNegative(holds[code])) || !value['retiredExecutions'].every(validExecution) || value['retiredCount'] > value['retiredExecutions'].length || value['state'] === 'applied' && value['retiredCount'] !== value['retiredExecutions'].length) throw invalid();
  const ids = value['retiredExecutions'].map(item => item.executionId);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && ids[index - 1]! >= id)) throw invalid();
}
function receiptId(body: Omit<ProviderExecutionObservationReconciliationDurableReceipt, 'receiptId'>): string { return `sha256:${sha256(`${DOMAIN}${canonical(body as unknown as Json)}`)}`; }
export function providerExecutionObservationReconciliationDurableReceiptId(body: Omit<ProviderExecutionObservationReconciliationDurableReceipt, 'receiptId'>): string { validateShape({ ...body, receiptId: 'sha256:' + '0'.repeat(64) }); return receiptId(body); }
export function serializeProviderExecutionObservationReconciliationReceipt(receipt: ProviderExecutionObservationReconciliationDurableReceipt): Buffer {
  validateShape(receipt); const { receiptId: id, ...body } = receipt; if (receiptId(body) !== id) throw invalid(); return Buffer.from(canonical(receipt as unknown as Json), 'utf8');
}
export function parseProviderExecutionObservationReconciliationReceipt(bytes: Buffer | string): ProviderExecutionObservationReconciliationDurableReceipt {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  if (buffer.length === 0 || buffer.length > 128 * 1024 || buffer[0] === 0xef || !Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer)) throw invalid();
  let parsed: unknown; try { parsed = JSON.parse(buffer.toString('utf8')); } catch { throw invalid(); }
  validateShape(parsed); if (canonical(parsed as unknown as Json) !== buffer.toString('utf8')) throw invalid(); const { receiptId: id, ...body } = parsed; if (receiptId(body) !== id) throw invalid(); return freeze(parsed);
}
function freeze<T>(value: T): T { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function trustedRoot(projectRoot: string): string { if (!isAbsolute(projectRoot)) throw error('INVALID_PATH'); const root = realpathSync(projectRoot); if (!statSync(root).isDirectory()) throw error('INVALID_PATH'); return root; }
function privateDirectory(path: string, create: boolean): void {
  try { if (create) mkdirSync(path, { mode: 0o700 }); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; }
  let entry; try { entry = lstatSync(path, { bigint: true }); } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') throw error('RECEIPT_NOT_FOUND'); throw cause; }
  if (entry.isSymbolicLink()) throw error('UNSAFE_LINK'); if (!entry.isDirectory()) throw error('INVALID_PATH');
  if ((entry.mode & 0o077n) !== 0n || (typeof process.getuid === 'function' && entry.uid !== BigInt(process.getuid()))) throw error('PERMISSION_DENIED');
}
function controlDirectory(root: string, create: boolean): string {
  const path = join(root, COMPONENTS[0]); try { if (create) mkdirSync(path, { mode: 0o700 }); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; }
  let entry; try { entry = lstatSync(path, { bigint: true }); } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') throw error('RECEIPT_NOT_FOUND'); throw cause; }
  if (entry.isSymbolicLink()) throw error('UNSAFE_LINK'); if (!entry.isDirectory()) throw error('INVALID_PATH'); if ((process.platform !== 'win32' && (entry.mode & 0o022n) !== 0n) || (typeof process.getuid === 'function' && entry.uid !== BigInt(process.getuid()))) throw error('PERMISSION_DENIED'); return path;
}
function directory(root: string, scope: ProviderExecutionObservationReconciliationReceiptScope, create: boolean): string { let cursor = controlDirectory(root, create); for (const part of [...COMPONENTS.slice(1), scope.projectKey, scope.tenantKey, scope.environmentKey]) { cursor = join(cursor, part); privateDirectory(cursor, create); } return cursor; }
function fsyncDirectory(path: string): void { if (process.platform === 'win32') return; const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY); try { fsyncSync(fd); } finally { closeSync(fd); } }
function writeComplete(fd: number, bytes: Buffer): void { let offset = 0; while (offset < bytes.length) { const count = writeSync(fd, bytes, offset, bytes.length - offset, null); if (count === 0) throw error('DURABILITY_UNCONFIRMED'); offset += count; } }
function readFinal(path: string, expected: string): { readonly receipt: ProviderExecutionObservationReconciliationDurableReceipt; readonly bytes: Buffer; readonly dev: bigint; readonly ino: bigint } {
  let fd: number; try { fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') throw error('RECEIPT_NOT_FOUND'); throw error('INVALID_RECEIPT', { cause }); }
  try { const before = fstatSync(fd, { bigint: true }); if (!before.isFile() || before.size > 128n * 1024n || (before.mode & 0o077n) !== 0n || (typeof process.getuid === 'function' && before.uid !== BigInt(process.getuid()))) throw invalid(); const bytes = Buffer.alloc(Number(before.size)); let at = 0; while (at < bytes.length) { const count = readSync(fd, bytes, at, bytes.length - at, at); if (count === 0) throw invalid(); at += count; } const after = fstatSync(fd, { bigint: true }); if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw invalid(); const receipt = parseProviderExecutionObservationReconciliationReceipt(bytes); if (receipt.receiptId !== expected) throw invalid(); return { receipt, bytes, dev: before.dev, ino: before.ino }; } finally { closeSync(fd); }
}
function limits(input: { readonly maxPrincipalDigests?: number; readonly maxRetainedHolds?: number }): { principals: number; holds: number } { const principals = input.maxPrincipalDigests ?? 1_000; const holds = input.maxRetainedHolds ?? 10_000; if (!Number.isSafeInteger(principals) || principals < 1 || principals > 100_000 || !Number.isSafeInteger(holds) || holds < 1 || holds > 1_000_000) throw new TypeError('receipt discovery bounds must be positive safe integers'); return { principals, holds }; }
function holdCounts(projectRoot: string, relativeDatabasePath: string, options: { readonly maxPrincipalDigests?: number; readonly maxRetainedHolds?: number }): Readonly<Record<HoldCode, number>> {
  const maximum = limits(options); const store = new ProviderExecutionObservationStore(projectRoot, { dbPath: join(projectRoot, ...relativeDatabasePath.split('/')), readOnly: true });
  try { const principals = store.listProviderPrincipalDigests(maximum.principals + 1); if (principals.length > maximum.principals) throw error('DISCOVERY_LIMIT_EXCEEDED'); const counts: Record<HoldCode, number> = { 'missing-fence': 0, 'foreign-attempt': 0, 'end-before-start': 0, 'conflicting-replay': 0 }; let total = 0; for (const principal of principals) for (const hold of store.listContradictions(principal)) { if (!(hold.reasonCode in counts) || ++total > maximum.holds) throw error('DISCOVERY_LIMIT_EXCEEDED'); counts[hold.reasonCode] += 1; } return Object.freeze(counts); } finally { store.close(); }
}
function pathInside(root: string, path: string): string { const relativePath = relative(root, resolve(path)).split(sep).join('/'); if (!validRelativePath(relativePath)) throw error('PATH_ESCAPE'); return relativePath; }
function buildReceipt(input: PublishProviderExecutionObservationReconciliationReceiptInput): ProviderExecutionObservationReconciliationDurableReceipt {
  if (!validIso(input.verifiedAt)
    || !isVerifiedProviderExecutionObservationReconciliationApprovalClaim(input.result.claim)
    || input.plan.projectRoot !== input.projectRoot || input.result.planDigest !== input.plan.planDigest
    || input.result.retiredCount < 0 || !Number.isSafeInteger(input.result.retiredCount)) {
    throw error('RECONCILIATION_MISMATCH');
  }
  const root = trustedRoot(input.projectRoot); pathInside(root, join(root, ...input.plan.relativeDatabasePath.split('/')));
  const inventory = inventoryProviderExecutionObservationReconciliation({ projectRoot: root, relativeDatabasePath: input.plan.relativeDatabasePath, bounds: input.bounds });
  if (inventory.activeOpenCount !== input.result.afterActiveOpenCount) throw error('RECONCILIATION_MISMATCH');
  const after = { schemaDigest: normalizeDigest(inventory.databaseLineage.schemaDigest), rowLineageDigest: normalizeDigest(inventory.databaseLineage.rowLineageDigest), activeOpenCount: inventory.activeOpenCount } as const;
  const before = { schemaDigest: normalizeDigest(input.plan.databaseSchemaDigest), rowLineageDigest: normalizeDigest(input.plan.databaseLineageDigest), activeOpenCount: input.plan.activeOpenCount } as const;
  if (input.result.state === 'applied' && (input.result.beforeActiveOpenCount !== input.plan.activeOpenCount || input.result.retiredCount !== input.plan.candidates.length || input.result.afterActiveOpenCount !== input.plan.activeOpenCount - input.plan.candidates.length)) throw error('RECONCILIATION_MISMATCH');
  if (input.result.state === 'replayed' && input.result.retiredCount !== 0) throw error('RECONCILIATION_MISMATCH');
  const candidates = [...input.plan.candidates].sort((a, b) => a.executionId.localeCompare(b.executionId)); if (new Set(candidates.map(item => item.executionId)).size !== candidates.length) throw error('RECONCILIATION_MISMATCH');
  const store = new ProviderExecutionObservationStore(root, { dbPath: join(root, ...input.plan.relativeDatabasePath.split('/')), readOnly: true });
  try { for (const candidate of candidates) { const match = store.listIntervals(candidate.providerPrincipalDigest).some(item => item.executionId === candidate.executionId && item.runId === candidate.runId && item.taskId === candidate.taskId && item.attemptId === candidate.attemptId && item.fence === candidate.fence && item.retired); if (!match) throw error('RECONCILIATION_MISMATCH'); } } finally { store.close(); }
  const body = { schema: PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_SCHEMA, version: PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_VERSION, scope: deriveProviderExecutionObservationReconciliationReceiptScope(input), planDigest: normalizeDigest(input.plan.planDigest), approvalClaim: input.result.claim, relativeDatabasePath: input.plan.relativeDatabasePath, state: input.result.state, retiredExecutions: candidates, retainedHoldReasonCounts: holdCounts(root, input.plan.relativeDatabasePath, input), before, after, retiredCount: input.result.retiredCount, verifiedAt: input.verifiedAt } satisfies Omit<ProviderExecutionObservationReconciliationDurableReceipt, 'receiptId'>;
  return freeze({ ...body, receiptId: receiptId(body) });
}
export function publishProviderExecutionObservationReconciliationReceipt(input: PublishProviderExecutionObservationReconciliationReceiptInput): PublishProviderExecutionObservationReconciliationReceiptResult {
  const receipt = buildReceipt(input); const bytes = serializeProviderExecutionObservationReconciliationReceipt(receipt); const root = trustedRoot(input.projectRoot); const target = directory(root, receipt.scope, true); const finalPath = join(target, `${receipt.receiptId.slice(7)}.json`); const temporaryPath = join(target, `.receipt-${randomBytes(16).toString('hex')}.tmp`); let identity: { dev: bigint; ino: bigint } | undefined; let created = false;
  try { const fd = openSync(temporaryPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600); try { writeComplete(fd, bytes); fsyncSync(fd); const entry = fstatSync(fd, { bigint: true }); if (!entry.isFile() || entry.size !== BigInt(bytes.length) || (entry.mode & 0o077n) !== 0n) throw error('DURABILITY_UNCONFIRMED'); identity = { dev: entry.dev, ino: entry.ino }; } finally { closeSync(fd); } try { linkSync(temporaryPath, finalPath); created = true; } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw error('DURABILITY_UNCONFIRMED', { cause }); } fsyncDirectory(target); let observed: ReturnType<typeof readFinal>; try { observed = readFinal(finalPath, receipt.receiptId); } catch (cause) { if (!created && cause instanceof ProviderExecutionObservationReconciliationReceiptStoreError) throw error('RECEIPT_COLLISION'); throw cause; } if ((created && identity !== undefined && (observed.dev !== identity.dev || observed.ino !== identity.ino)) || !observed.bytes.equals(bytes)) throw error('RECEIPT_COLLISION'); return Object.freeze({ state: created ? 'created' : 'existing-identical', receipt: observed.receipt, projectRelativeReceiptPath: relative(root, finalPath).split(sep).join('/') }); } finally { try { const entry = lstatSync(temporaryPath, { bigint: true }); if (identity !== undefined && entry.isFile() && entry.dev === identity.dev && entry.ino === identity.ino) unlinkSync(temporaryPath); } catch { /* safe cleanup only */ } }
}
function verifyFresh(root: string, receipt: ProviderExecutionObservationReconciliationDurableReceipt, input: ReadProviderExecutionObservationReconciliationReceiptInput): void {
  const planPath = receiptPath(receipt, root);
  // Historical before/after snapshots are immutable evidence. Freshness is
  // monotonic: unrelated observations may change row lineage and counts, but
  // cannot change the schema or un-retire an exact receipt candidate.
  const inventory = inventoryProviderExecutionObservationReconciliation({ projectRoot: root, relativeDatabasePath: planPath, bounds: input.bounds });
  if (normalizeDigest(inventory.databaseLineage.schemaDigest) !== receipt.after.schemaDigest) throw error('LINEAGE_MISMATCH');
  const store = new ProviderExecutionObservationStore(root, { dbPath: join(root, ...planPath.split('/')), readOnly: true });
  try {
    for (const item of receipt.retiredExecutions) {
      const exact = store.listIntervals(item.providerPrincipalDigest).some(value => value.executionId === item.executionId
        && value.runId === item.runId && value.taskId === item.taskId && value.attemptId === item.attemptId
        && value.fence === item.fence && value.retired);
      if (!exact) throw error('LINEAGE_MISMATCH');
    }
  } finally { store.close(); }
}
function receiptPath(receipt: ProviderExecutionObservationReconciliationDurableReceipt, root: string): string { pathInside(root, join(root, ...receipt.relativeDatabasePath.split('/'))); return receipt.relativeDatabasePath; }
export function readProviderExecutionObservationReconciliationReceipt(input: ReadProviderExecutionObservationReconciliationReceiptInput): ProviderExecutionObservationReconciliationDurableReceipt {
  if (!SHA256.test(input.receiptId)) throw invalid(); const root = trustedRoot(input.projectRoot); const scope = deriveProviderExecutionObservationReconciliationReceiptScope(input); const observed = readFinal(join(directory(root, scope, false), `${input.receiptId.slice(7)}.json`), input.receiptId).receipt; if (canonical(observed.scope as unknown as Json) !== canonical(scope as unknown as Json)) throw invalid(); if (input.expectedPlanDigest !== undefined && normalizeDigest(input.expectedPlanDigest) !== observed.planDigest) throw error('PLAN_MISMATCH'); if (input.fresh === true) verifyFresh(root, observed, input); return observed;
}
export function discoverProviderExecutionObservationReconciliationReceipts(input: ProviderExecutionObservationReconciliationReceiptStoreContext & { readonly maxEntries?: number }): readonly ProviderExecutionObservationReconciliationDurableReceipt[] {
  const maximum = input.maxEntries ?? PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_MAX_DISCOVERY; if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > PROVIDER_EXECUTION_OBSERVATION_RECONCILIATION_RECEIPT_MAX_DISCOVERY) throw error('DISCOVERY_LIMIT_EXCEEDED'); const root = trustedRoot(input.projectRoot); const scope = deriveProviderExecutionObservationReconciliationReceiptScope(input); const names = readdirSync(directory(root, scope, false)); if (names.length > maximum) throw error('DISCOVERY_LIMIT_EXCEEDED'); return freeze(names.sort().filter(name => FINAL_NAME.test(name)).map(name => readFinal(join(directory(root, scope, false), name), `sha256:${name.slice(0, 64)}`).receipt));
}
export class ProviderExecutionObservationReconciliationReceiptStore {
  constructor(private readonly context: ProviderExecutionObservationReconciliationReceiptStoreContext) {}
  publish(input: Omit<PublishProviderExecutionObservationReconciliationReceiptInput, keyof ProviderExecutionObservationReconciliationReceiptStoreContext>): PublishProviderExecutionObservationReconciliationReceiptResult { return publishProviderExecutionObservationReconciliationReceipt({ ...this.context, ...input }); }
  read(input: Omit<ReadProviderExecutionObservationReconciliationReceiptInput, keyof ProviderExecutionObservationReconciliationReceiptStoreContext>): ProviderExecutionObservationReconciliationDurableReceipt { return readProviderExecutionObservationReconciliationReceipt({ ...this.context, ...input }); }
  discover(maxEntries?: number): readonly ProviderExecutionObservationReconciliationDurableReceipt[] { return discoverProviderExecutionObservationReconciliationReceipts({ ...this.context, maxEntries }); }
}
