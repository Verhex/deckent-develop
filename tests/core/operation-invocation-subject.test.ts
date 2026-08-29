import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  OperationInvocationSubjectError,
  adapterId,
  createOperationInvocationSubject,
  environmentId,
  projectId,
  resourceId,
  tenantId,
  type AdapterId,
  type EnvironmentId,
  type ProjectId,
  type ResourceId,
  type TenantId,
} from '../../src/core/operation-invocation-subject.js';
import type { RequestOrigin } from '../../src/core/work-model.js';

function subject(overrides: Record<string, unknown> = {}) {
  return {
    principal: {
      id: 'principal-01',
      identityClass: 'oidc',
      assurance: 'token-verified',
      provenance: 'mcp',
      verifiedBy: 'oidc:issuer-a',
      tenantId: 'principal-tenant',
      role: 'operator',
    },
    tenantId: 'tenant:invocation',
    projectId: 'project:project-01',
    resource: { tenantId: 'tenant:resource', type: 'repository', id: 'resource:repo-01' },
    environmentId: 'environment:production',
    adapterId: 'adapter:filesystem-01',
    platform: 'linux',
    ...overrides,
  };
}

describe('operation invocation subject', () => {
  it('brands every authority namespace distinctly at compile time and runtime', () => {
    const tenant: TenantId = tenantId('tenant:one');
    const project: ProjectId = projectId('project:one');
    const resource: ResourceId = resourceId('resource:one');
    const environment: EnvironmentId = environmentId('environment:one');
    const adapter: AdapterId = adapterId('adapter:one');
    expect([tenant, project, resource, environment, adapter]).toEqual([
      'tenant:one', 'project:one', 'resource:one', 'environment:one', 'adapter:one',
    ]);
    expectTypeOf(tenant).not.toEqualTypeOf<ProjectId>();
    expectTypeOf(resource).not.toEqualTypeOf<EnvironmentId>();
    expect(() => projectId('tenant:one')).toThrow(expect.objectContaining({ code: 'INVALID_AUTHORITY_ID' }));
  });

  it.each(['darwin', 'linux', 'win32', 'wsl'] as const)('round-trips explicit %s platform facts', (platform) => {
    const actual = createOperationInvocationSubject(subject({ platform }));
    expect(actual.platform).toBe(platform);
    expect(actual.tenantId).toBe('tenant:invocation');
    expect(actual.resource).toEqual({ tenantId: 'tenant:resource', type: 'repository', id: 'resource:repo-01' });
  });

  it.each<RequestOrigin>(['cli', 'mcp', 'chat', 'autonomous', 'webhook', 'scheduled', 'api', 'ide'])(
    'preserves the canonical %s RequestOrigin',
    (provenance) => {
      const actual = createOperationInvocationSubject(subject({
        principal: { ...subject().principal, provenance },
      }));
      expect(actual.principal.provenance).toBe(provenance);
    },
  );

  it('preserves every verified principal fact and freezes copied nested values', () => {
    const input = subject();
    const actual = createOperationInvocationSubject(input);
    expect(actual.principal).toEqual(input.principal);
    expect(actual.principal).not.toBe(input.principal);
    expect(Object.isFrozen(actual)).toBe(true);
    expect(Object.isFrozen(actual.principal)).toBe(true);
    expect(Object.isFrozen(actual.resource)).toBe(true);
    expect(() => { (actual.resource as { id: string }).id = 'resource:changed'; }).toThrow();
  });

  it('accepts absent optional principal claims without synthesizing them', () => {
    const actual = createOperationInvocationSubject(subject({ principal: {
      id: 'principal-02',
      identityClass: 'service',
      assurance: 'token-verified',
      provenance: 'webhook',
      verifiedBy: 'service-auth',
    } }));
    expect(actual.principal).not.toHaveProperty('tenantId');
    expect(actual.principal).not.toHaveProperty('role');
  });

  it('keeps conflicting tenancy facts as lossless inputs without deciding them', () => {
    const actual = createOperationInvocationSubject(subject());
    expect(actual.principal.tenantId).toBe('principal-tenant');
    expect(actual.tenantId).toBe('tenant:invocation');
    expect(actual.resource.tenantId).toBe('tenant:resource');
  });

  it.each([
    ['missing subject key', (() => { const value = subject(); delete (value as { adapterId?: string }).adapterId; return value; })()],
    ['extra subject key', { ...subject(), ambientScope: 'local' }],
    ['undefined principal fact', { ...subject(), principal: { ...subject().principal, role: undefined } }],
    ['extra resource key', { ...subject(), resource: { ...subject().resource, authorityMode: 'allow' } }],
    ['wrong namespace', subject({ projectId: 'tenant:project-01' })],
    ['padded id', subject({ projectId: ' project:project-01' })],
    ['C0 control-bearing id', subject({ adapterId: 'adapter:adapter\n01' })],
    ['C1 control-bearing id', subject({ environmentId: 'environment:prod\u0085' })],
    ['malformed platform', subject({ platform: 'freebsd' })],
    ['capability-shaped leak', { ...subject(), capabilityTarget: { capability: 'shell.exec' } }],
  ])('rejects %s deterministically without producing a subject', (_label, input) => {
    expect(() => createOperationInvocationSubject(input)).toThrowError(OperationInvocationSubjectError);
  });

  it('rejects accessors, symbols, hidden extras, and custom prototypes without invoking code', () => {
    let getterCalled = false;
    const accessor = subject();
    Object.defineProperty(accessor, 'tenantId', {
      enumerable: true,
      get: () => { getterCalled = true; return 'tenant:invocation'; },
    });
    expect(() => createOperationInvocationSubject(accessor)).toThrowError(OperationInvocationSubjectError);
    expect(getterCalled).toBe(false);

    const hidden = subject();
    Object.defineProperty(hidden.resource, 'grant', { value: true });
    expect(() => createOperationInvocationSubject(hidden)).toThrowError(OperationInvocationSubjectError);
    expect(() => createOperationInvocationSubject({ ...subject(), [Symbol('secret')]: 'x' })).toThrowError(OperationInvocationSubjectError);
    expect(() => createOperationInvocationSubject(Object.assign(Object.create(null), subject()))).toThrowError(OperationInvocationSubjectError);
  });
});
