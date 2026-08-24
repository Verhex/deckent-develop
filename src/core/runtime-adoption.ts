import { createHash, timingSafeEqual } from 'node:crypto';

export const RUNTIME_ADOPTION_PLAN_SCHEMA = 'deckent.runtime-adoption-plan' as const;
export const RUNTIME_ADOPTION_PLAN_VERSION = 1 as const;

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export type RuntimeAdoptionHoldCode =
  | 'INVALID_PLAN'
  | 'UNSUPPORTED_VERSION'
  | 'PLAN_DIGEST_MISMATCH'
  | 'INVALID_SCOPE'
  | 'INVALID_PATH'
  | 'PATH_ESCAPE'
  | 'UNSAFE_LINK'
  | 'PERMISSION_DENIED'
  | 'ARTIFACT_NOT_FOUND'
  | 'ARTIFACT_CHANGED'
  | 'PROVIDER_RECEIPT_MISMATCH'
  | 'TARGET_DATABASE_MISMATCH'
  | 'BUILD_IDENTITY_MISMATCH'
  | 'ENTRYPOINT_MISMATCH'
  | 'RUNTIME_OWNERSHIP_MISMATCH'
  | 'RECEIPT_NOT_FOUND'
  | 'RECEIPT_COLLISION'
  | 'DISCOVERY_LIMIT_EXCEEDED'
  | 'DURABILITY_UNCONFIRMED'
  | 'UNSUPPORTED_FILESYSTEM';

/** A fail-closed adoption decision. Callers must treat every instance as HOLD. */
export class RuntimeAdoptionHoldError extends Error {
  readonly state = 'HOLD' as const;

  constructor(readonly code: RuntimeAdoptionHoldCode, options?: ErrorOptions) {
    super(`RUNTIME_ADOPTION_HOLD:${code}`, options);
    this.name = 'RuntimeAdoptionHoldError';
  }
}

export interface RuntimeAdoptionProviderReceiptBinding {
  readonly projectRelativePath: string;
  readonly receiptId: string;
  readonly receiptDigest: string;
}

export interface RuntimeAdoptionTargetDatabaseBinding {
  readonly projectRelativePath: string;
  readonly databaseDigest: string;
  readonly lineageDigest: string;
}

export interface RuntimeAdoptionBuildBinding {
  readonly buildIdentityDigest: string;
  readonly sourceTreeIdentityDigest: string;
}

export interface RuntimeAdoptionEntrypointBinding {
  readonly projectRelativePath: string;
  readonly artifactDigest: string;
}

export interface RuntimeAdoptionLiveRuntimeBinding {
  readonly runtimeId: string;
  readonly processId: number;
  /** Stable OS/container process-birth identity; a PID alone is never authority. */
  readonly processStartIdentity: string;
  /** Digest of the authenticated owner/principal and its runtime fence. */
  readonly ownerIdentityDigest: string;
}

export interface RuntimeAdoptionPlanBody {
  readonly schema: typeof RUNTIME_ADOPTION_PLAN_SCHEMA;
  readonly version: typeof RUNTIME_ADOPTION_PLAN_VERSION;
  readonly adoptionId: string;
  readonly providerObservationReceipt: RuntimeAdoptionProviderReceiptBinding;
  readonly targetDatabase: RuntimeAdoptionTargetDatabaseBinding;
  readonly deckentBuild: RuntimeAdoptionBuildBinding;
  readonly entrypoint: RuntimeAdoptionEntrypointBinding;
  readonly liveRuntime: RuntimeAdoptionLiveRuntimeBinding;
  readonly plannedAt: string;
  readonly databaseMutation: 'none';
}

export interface RuntimeAdoptionPlan extends RuntimeAdoptionPlanBody {
  readonly planDigest: string;
}

export type CreateRuntimeAdoptionPlanInput = Omit<
  RuntimeAdoptionPlanBody,
  'schema' | 'version' | 'databaseMutation'
>;

function isArray(value: Json): value is readonly Json[] {
  return Array.isArray(value);
}

/** Deterministic RFC-8785-compatible encoding for this integer/string-only schema. */
export function canonicalRuntimeAdoptionJson(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (isArray(value)) return `[${value.map(canonicalRuntimeAdoptionJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalRuntimeAdoptionJson(value[key]!)}`).join(',')}}`;
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function digestEqual(left: string, right: string): boolean {
  return SHA256.test(left) && SHA256.test(right)
    && timingSafeEqual(Buffer.from(left.slice(7), 'hex'), Buffer.from(right.slice(7), 'hex'));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.normalize('NFC')
    || CONTROL.test(value) || value.startsWith('/') || value.includes('\\') || /^[A-Za-z]:/u.test(value)) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..' && !part.includes(':'));
}

function validIso(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function invalid(): never {
  throw new RuntimeAdoptionHoldError('INVALID_PLAN');
}

function validateBody(value: unknown): asserts value is RuntimeAdoptionPlanBody {
  if (!record(value)) invalid();
  if (!Object.prototype.hasOwnProperty.call(value, 'version') || !Number.isSafeInteger(value['version'])) invalid();
  if (value['version'] !== RUNTIME_ADOPTION_PLAN_VERSION) throw new RuntimeAdoptionHoldError('UNSUPPORTED_VERSION');
  if (!exactKeys(value, ['schema', 'version', 'adoptionId', 'providerObservationReceipt', 'targetDatabase',
    'deckentBuild', 'entrypoint', 'liveRuntime', 'plannedAt', 'databaseMutation'])
    || value['schema'] !== RUNTIME_ADOPTION_PLAN_SCHEMA || typeof value['adoptionId'] !== 'string'
    || !ID.test(value['adoptionId']) || !validIso(value['plannedAt']) || value['databaseMutation'] !== 'none') invalid();

  const provider = value['providerObservationReceipt'];
  const target = value['targetDatabase'];
  const build = value['deckentBuild'];
  const entrypoint = value['entrypoint'];
  const runtime = value['liveRuntime'];
  if (!record(provider) || !exactKeys(provider, ['projectRelativePath', 'receiptId', 'receiptDigest'])
    || !validPath(provider['projectRelativePath']) || typeof provider['receiptId'] !== 'string'
    || !SHA256.test(provider['receiptId']) || typeof provider['receiptDigest'] !== 'string'
    || !SHA256.test(provider['receiptDigest'])) invalid();
  if (!record(target) || !exactKeys(target, ['projectRelativePath', 'databaseDigest', 'lineageDigest'])
    || !validPath(target['projectRelativePath']) || typeof target['databaseDigest'] !== 'string'
    || !SHA256.test(target['databaseDigest']) || typeof target['lineageDigest'] !== 'string'
    || !SHA256.test(target['lineageDigest'])) invalid();
  if (!record(build) || !exactKeys(build, ['buildIdentityDigest', 'sourceTreeIdentityDigest'])
    || typeof build['buildIdentityDigest'] !== 'string' || !SHA256.test(build['buildIdentityDigest'])
    || typeof build['sourceTreeIdentityDigest'] !== 'string' || !SHA256.test(build['sourceTreeIdentityDigest'])) invalid();
  if (!record(entrypoint) || !exactKeys(entrypoint, ['projectRelativePath', 'artifactDigest'])
    || !validPath(entrypoint['projectRelativePath']) || typeof entrypoint['artifactDigest'] !== 'string'
    || !SHA256.test(entrypoint['artifactDigest'])) invalid();
  if (!record(runtime) || !exactKeys(runtime, ['runtimeId', 'processId', 'processStartIdentity', 'ownerIdentityDigest'])
    || typeof runtime['runtimeId'] !== 'string' || !ID.test(runtime['runtimeId'])
    || !Number.isSafeInteger(runtime['processId']) || Number(runtime['processId']) < 1
    || typeof runtime['processStartIdentity'] !== 'string' || !ID.test(runtime['processStartIdentity'])
    || typeof runtime['ownerIdentityDigest'] !== 'string' || !SHA256.test(runtime['ownerIdentityDigest'])) invalid();
  if (provider['projectRelativePath'] === target['projectRelativePath']
    || provider['projectRelativePath'] === entrypoint['projectRelativePath']
    || target['projectRelativePath'] === entrypoint['projectRelativePath']) invalid();
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function runtimeAdoptionPlanDigest(body: RuntimeAdoptionPlanBody): string {
  validateBody(body);
  return sha256(canonicalRuntimeAdoptionJson(body as unknown as Json));
}

export function createRuntimeAdoptionPlan(input: CreateRuntimeAdoptionPlanInput): RuntimeAdoptionPlan {
  const body: RuntimeAdoptionPlanBody = {
    schema: RUNTIME_ADOPTION_PLAN_SCHEMA,
    version: RUNTIME_ADOPTION_PLAN_VERSION,
    adoptionId: input.adoptionId,
    providerObservationReceipt: { ...input.providerObservationReceipt },
    targetDatabase: { ...input.targetDatabase },
    deckentBuild: { ...input.deckentBuild },
    entrypoint: { ...input.entrypoint },
    liveRuntime: { ...input.liveRuntime },
    plannedAt: input.plannedAt,
    databaseMutation: 'none',
  };
  validateBody(body);
  return deepFreeze({ ...body, planDigest: runtimeAdoptionPlanDigest(body) });
}

export function validateRuntimeAdoptionPlan(value: unknown): RuntimeAdoptionPlan {
  if (!record(value) || !exactKeys(value, ['schema', 'version', 'adoptionId', 'providerObservationReceipt',
    'targetDatabase', 'deckentBuild', 'entrypoint', 'liveRuntime', 'plannedAt', 'databaseMutation', 'planDigest'])) invalid();
  const { planDigest, ...body } = value;
  validateBody(body);
  if (typeof planDigest !== 'string' || !digestEqual(planDigest, runtimeAdoptionPlanDigest(body))) {
    throw new RuntimeAdoptionHoldError('PLAN_DIGEST_MISMATCH');
  }
  return deepFreeze({ ...body, planDigest });
}

export function serializeRuntimeAdoptionPlan(plan: RuntimeAdoptionPlan): Buffer {
  const validated = validateRuntimeAdoptionPlan(plan);
  return Buffer.from(canonicalRuntimeAdoptionJson(validated as unknown as Json), 'utf8');
}

export function parseRuntimeAdoptionPlan(bytes: Buffer | string): RuntimeAdoptionPlan {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  if (buffer.length === 0 || buffer.length > 64 * 1024 || !Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer)) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(buffer.toString('utf8')); } catch { invalid(); }
  const plan = validateRuntimeAdoptionPlan(parsed);
  if (canonicalRuntimeAdoptionJson(plan as unknown as Json) !== buffer.toString('utf8')) invalid();
  return plan;
}
