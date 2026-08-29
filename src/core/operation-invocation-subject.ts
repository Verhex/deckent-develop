import type { GlobalScopePlatform } from './global-scope-resolver.js';
import type {
  PrincipalAssurance,
  PrincipalIdentityClass,
  VerifiedPrincipal,
} from './principal.js';
import type { RequestOrigin } from './work-model.js';

interface AuthorityBrand<Name extends string> {
  readonly __operationAuthorityBrand: Name;
}

export type TenantId = string & AuthorityBrand<'TenantId'>;
export type ProjectId = string & AuthorityBrand<'ProjectId'>;
export type ResourceId = string & AuthorityBrand<'ResourceId'>;
export type EnvironmentId = string & AuthorityBrand<'EnvironmentId'>;
export type AdapterId = string & AuthorityBrand<'AdapterId'>;

/** Explicit, neutral resource facts carried by an operation invocation. */
export interface OperationInvocationResource {
  readonly tenantId: TenantId;
  readonly type: string;
  readonly id: ResourceId;
}

/**
 * Lossless policy input for an operation invocation. This intentionally records
 * tenancy facts without interpreting their relationship; 4040 owns decisions.
 */
export interface OperationInvocationSubject {
  readonly principal: VerifiedPrincipal;
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly resource: OperationInvocationResource;
  readonly environmentId: EnvironmentId;
  readonly adapterId: AdapterId;
  readonly platform: GlobalScopePlatform;
}

/** The exact JSON-shaped input accepted by {@link createOperationInvocationSubject}. */
export interface OperationInvocationSubjectInput {
  readonly principal: VerifiedPrincipal;
  readonly tenantId: unknown;
  readonly projectId: unknown;
  readonly resource: Readonly<{ readonly tenantId: unknown; readonly type: unknown; readonly id: unknown }>;
  readonly environmentId: unknown;
  readonly adapterId: unknown;
  readonly platform: unknown;
}

export type OperationInvocationSubjectErrorCode =
  | 'INVALID_SUBJECT'
  | 'INVALID_PRINCIPAL'
  | 'INVALID_SCOPE_VALUE'
  | 'INVALID_AUTHORITY_ID';

/** Typed refusal for malformed, non-canonical, or non-JSON invocation facts. */
export class OperationInvocationSubjectError extends Error {
  readonly code: OperationInvocationSubjectErrorCode;

  constructor(code: OperationInvocationSubjectErrorCode, message: string) {
    super(message);
    this.name = 'OperationInvocationSubjectError';
    this.code = code;
  }
}

type AuthorityNamespace = 'tenant' | 'project' | 'resource' | 'environment' | 'adapter';

const MAX_FACT_LENGTH = 256;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const AUTHORITY_PREFIX: Readonly<Record<AuthorityNamespace, string>> = Object.freeze({
  tenant: 'tenant:',
  project: 'project:',
  resource: 'resource:',
  environment: 'environment:',
  adapter: 'adapter:',
});
const PRINCIPAL_IDENTITY_CLASSES = new Set<PrincipalIdentityClass>([
  'local', 'oidc', 'workload', 'connector', 'service',
]);
const PRINCIPAL_ASSURANCES = new Set<PrincipalAssurance>([
  'unverified', 'os-user', 'token-parsed', 'token-verified',
]);
const REQUEST_ORIGINS = new Set<RequestOrigin>([
  'cli', 'mcp', 'chat', 'autonomous', 'webhook', 'scheduled', 'api', 'ide',
]);
const GLOBAL_SCOPE_PLATFORMS = new Set<GlobalScopePlatform>([
  'darwin', 'linux', 'win32', 'wsl',
]);

function assertExactJsonObject(
  value: unknown,
  name: string,
  requiredKeys: readonly string[],
  code: OperationInvocationSubjectErrorCode,
  optionalKeys: readonly string[] = [],
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OperationInvocationSubjectError(code, `${name} must be a plain JSON object`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(value);
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  if (actualKeys.some(key => typeof key !== 'string' || !allowedKeys.has(key))
    || requiredKeys.some(key => !Object.hasOwn(descriptors, key))) {
    throw new OperationInvocationSubjectError(code, `${name} contains missing or unexpected keys`);
  }
  for (const key of actualKeys) {
    if (typeof key !== 'string') continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new OperationInvocationSubjectError(code, `${name}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function assertFact(
  value: unknown,
  name: string,
  code: OperationInvocationSubjectErrorCode,
): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_FACT_LENGTH
    || value !== value.trim()
    || CONTROL_CHARACTER.test(value)) {
    throw new OperationInvocationSubjectError(
      code,
      `${name} must be a non-empty, bounded, unpadded string without C0/C1 control characters`,
    );
  }
  return value;
}

function assertAuthorityId(value: unknown, namespace: AuthorityNamespace): string {
  const validated = assertFact(value, `${namespace}Id`, 'INVALID_AUTHORITY_ID');
  const prefix = AUTHORITY_PREFIX[namespace];
  if (!validated.startsWith(prefix) || validated.length === prefix.length) {
    throw new OperationInvocationSubjectError(
      'INVALID_AUTHORITY_ID',
      `${namespace} identity must begin with ${prefix} and include an opaque value`,
    );
  }
  return validated;
}

export function tenantId(value: unknown): TenantId {
  return assertAuthorityId(value, 'tenant') as TenantId;
}

export function projectId(value: unknown): ProjectId {
  return assertAuthorityId(value, 'project') as ProjectId;
}

export function resourceId(value: unknown): ResourceId {
  return assertAuthorityId(value, 'resource') as ResourceId;
}

export function environmentId(value: unknown): EnvironmentId {
  return assertAuthorityId(value, 'environment') as EnvironmentId;
}

export function adapterId(value: unknown): AdapterId {
  return assertAuthorityId(value, 'adapter') as AdapterId;
}

function optionalPrincipalFact(
  source: Record<string, unknown>,
  key: 'tenantId' | 'role',
): string | undefined {
  if (!Object.hasOwn(source, key)) return undefined;
  return assertFact(source[key], `principal.${key}`, 'INVALID_PRINCIPAL');
}

function clonePrincipal(value: unknown): VerifiedPrincipal {
  const source = assertExactJsonObject(
    value,
    'principal',
    ['id', 'identityClass', 'assurance', 'provenance', 'verifiedBy'],
    'INVALID_PRINCIPAL',
    ['tenantId', 'role'],
  );
  if (!PRINCIPAL_IDENTITY_CLASSES.has(source.identityClass as PrincipalIdentityClass)
    || !PRINCIPAL_ASSURANCES.has(source.assurance as PrincipalAssurance)
    || !REQUEST_ORIGINS.has(source.provenance as RequestOrigin)) {
    throw new OperationInvocationSubjectError('INVALID_PRINCIPAL', 'principal contains an unsupported identity fact');
  }
  return Object.freeze({
    id: assertFact(source.id, 'principal.id', 'INVALID_PRINCIPAL'),
    identityClass: source.identityClass as PrincipalIdentityClass,
    assurance: source.assurance as PrincipalAssurance,
    provenance: source.provenance as RequestOrigin,
    verifiedBy: assertFact(source.verifiedBy, 'principal.verifiedBy', 'INVALID_PRINCIPAL'),
    ...(Object.hasOwn(source, 'tenantId') ? { tenantId: optionalPrincipalFact(source, 'tenantId') } : {}),
    ...(Object.hasOwn(source, 'role') ? { role: optionalPrincipalFact(source, 'role') } : {}),
  });
}

/**
 * Validate, deeply copy, and deeply freeze an explicit invocation subject.
 * No ambient state, capability grants, or tenancy normalization is consulted.
 */
export function createOperationInvocationSubject(input: unknown): OperationInvocationSubject {
  const source = assertExactJsonObject(
    input,
    'subject',
    ['principal', 'tenantId', 'projectId', 'resource', 'environmentId', 'adapterId', 'platform'],
    'INVALID_SUBJECT',
  );
  const resource = assertExactJsonObject(
    source.resource,
    'resource',
    ['tenantId', 'type', 'id'],
    'INVALID_SCOPE_VALUE',
  );
  if (!GLOBAL_SCOPE_PLATFORMS.has(source.platform as GlobalScopePlatform)) {
    throw new OperationInvocationSubjectError('INVALID_SCOPE_VALUE', 'platform must be darwin, linux, win32, or wsl');
  }

  return Object.freeze({
    principal: clonePrincipal(source.principal),
    tenantId: tenantId(source.tenantId),
    projectId: projectId(source.projectId),
    resource: Object.freeze({
      tenantId: tenantId(resource.tenantId),
      type: assertFact(resource.type, 'resource.type', 'INVALID_SCOPE_VALUE'),
      id: resourceId(resource.id),
    }),
    environmentId: environmentId(source.environmentId),
    adapterId: adapterId(source.adapterId),
    platform: source.platform as GlobalScopePlatform,
  });
}
