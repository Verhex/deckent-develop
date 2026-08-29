import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  Op,
  operationReference,
} from '../../src/core/operation-catalog/index.js';
import {
  createOperationInvocationContext,
  retryOperationInvocationContext,
} from '../../src/core/operation-invocation-context.js';
import { createRootOperationIdentity } from '../../src/core/operation-invocation-identity.js';
import {
  decodeOperationInvocationContext,
  encodeOperationInvocationContext,
  OPERATION_INVOCATION_TRANSPORT_MAX_BYTES,
  OperationInvocationTransportError,
  type OperationInvocationTransportErrorCode,
} from '../../src/core/operation-invocation-transport.js';

const CREATED_AT = '2026-08-29T00:00:00.000Z';
const DOMAIN = 'deckent:operation-invocation-context:v1\0';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`;
}

function digest(context: Json): string {
  return createHash('sha256')
    .update(DOMAIN, 'utf8')
    .update(canonical(context), 'utf8')
    .digest('hex');
}

function bytes(value: Json): Uint8Array {
  return Buffer.from(canonical(value), 'utf8');
}

function plain(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function subject(overrides: Record<string, unknown> = {}) {
  return {
    principal: {
      id: 'principal-01',
      identityClass: 'oidc',
      assurance: 'token-verified',
      provenance: 'api',
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

function rootInput(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    operation: operationReference(Op.FsWrite, 1),
    identity: createRootOperationIdentity({
      invocationId: 'invocation:root-1',
      transactionId: 'transaction:tx-1',
      operationAttemptId: 'operation-attempt:attempt-1',
      correlationId: 'correlation:corr-1',
      occurredAt: CREATED_AT,
    }),
    subject: subject(),
    idempotency: { kind: 'KEYED', key: 'idempotency:request-01' },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return createOperationInvocationContext(rootInput(overrides));
}

function envelopeFor(value: unknown): Json {
  const contextValue = plain(value);
  return {
    schemaVersion: 1,
    contextSha256: digest(contextValue),
    context: contextValue,
  };
}

function expectCode(action: () => unknown, code: OperationInvocationTransportErrorCode): void {
  expect(action).toThrowError(expect.objectContaining({
    name: 'OperationInvocationTransportError',
    code,
  } satisfies Partial<OperationInvocationTransportError>));
}

function decodeText(value: Uint8Array): string {
  return Buffer.from(value).toString('utf8');
}

describe('operation invocation canonical transport', () => {
  it('has deterministic golden bytes, an independent domain digest, and a frozen lossless round-trip', () => {
    const source = context();
    const first = encodeOperationInvocationContext(source);
    const second = encodeOperationInvocationContext(plain(source));
    const contextValue = plain(source);
    const expectedDigest = digest(contextValue);
    const expectedEnvelope = canonical({
      schemaVersion: 1,
      contextSha256: expectedDigest,
      context: contextValue,
    });

    expect(expectedDigest).toBe('2ab562cddb02d366cd4688b005f3ea79d1d61016135081e81969d4e9da368176');
    expect(decodeText(first)).toBe(expectedEnvelope);
    expect(first).toEqual(second);
    first[0] = 0;
    expect(decodeText(second)).toBe(expectedEnvelope);

    const decoded = decodeOperationInvocationContext(second);
    expect(decoded).toEqual(source);
    for (const value of [
      decoded,
      decoded.operation,
      decoded.identity,
      decoded.subject,
      decoded.subject.principal,
      decoded.subject.resource,
      decoded.idempotency,
    ]) expect(Object.isFrozen(value)).toBe(true);
  });

  it('measures UTF-8 bytes, preserves Unicode, and enforces one fixed hard ceiling', () => {
    const unicodeType = '\u{1f680}'.repeat(128);
    const source = context({
      subject: subject({
        resource: { tenantId: 'tenant:resource', type: unicodeType, id: 'resource:repo-01' },
      }),
    });
    const encoded = encodeOperationInvocationContext(source);
    expect(encoded.byteLength).toBe(Buffer.byteLength(decodeText(encoded), 'utf8'));
    expect(decodeOperationInvocationContext(encoded).subject.resource.type).toBe(unicodeType);
    expect(encoded.byteLength).toBeLessThan(OPERATION_INVOCATION_TRANSPORT_MAX_BYTES);
    expectCode(
      () => decodeOperationInvocationContext(new Uint8Array(OPERATION_INVOCATION_TRANSPORT_MAX_BYTES + 1)),
      'OVERSIZE',
    );
    expectCode(() => decodeOperationInvocationContext(new Uint8Array()), 'INVALID_INPUT');
    expectCode(() => decodeOperationInvocationContext('not-bytes' as never), 'INVALID_INPUT');
  });

  it('changes the digest when every authority-bearing context dimension changes', () => {
    const base = context();
    const baseDigest = (JSON.parse(decodeText(encodeOperationInvocationContext(base))) as { contextSha256: string }).contextSha256;
    const naturalOperation = operationReference(Op.FsRead, 1);
    const otherKeyedOperation = operationReference(Op.MemoryWrite, 1);
    const variants = [
      context({ operation: otherKeyedOperation }),
      context({
        operation: naturalOperation,
        idempotency: { kind: 'NATURAL', operation: naturalOperation },
      }),
      context({ identity: { ...base.identity, invocationId: 'invocation:root-2' } }),
      context({ identity: { ...base.identity, transactionId: 'transaction:tx-2' } }),
      context({ identity: { ...base.identity, operationAttemptId: 'operation-attempt:attempt-2' } }),
      context({ identity: { ...base.identity, correlationId: 'correlation:corr-2' } }),
      context({
        identity: { ...base.identity, occurredAt: '2026-08-29T00:00:01.000Z' },
        createdAt: '2026-08-29T00:00:01.000Z',
      }),
      context({ subject: subject({ tenantId: 'tenant:other' }) }),
      context({ subject: subject({ projectId: 'project:other' }) }),
      context({ subject: subject({ resource: { ...subject().resource, tenantId: 'tenant:other' } }) }),
      context({ subject: subject({ resource: { ...subject().resource, type: 'workspace' } }) }),
      context({ subject: subject({ resource: { ...subject().resource, id: 'resource:other' } }) }),
      context({ subject: subject({ environmentId: 'environment:staging' }) }),
      context({ subject: subject({ adapterId: 'adapter:api-01' }) }),
      context({ subject: subject({ platform: 'win32' }) }),
      context({ subject: subject({ principal: { ...subject().principal, id: 'principal-02' } }) }),
      context({ subject: subject({ principal: { ...subject().principal, identityClass: 'service' } }) }),
      context({ subject: subject({ principal: { ...subject().principal, assurance: 'token-parsed' } }) }),
      context({ subject: subject({ principal: { ...subject().principal, provenance: 'mcp' } }) }),
      context({ subject: subject({ principal: { ...subject().principal, verifiedBy: 'oidc:issuer-b' } }) }),
      context({ subject: subject({ principal: { ...subject().principal, tenantId: 'principal-other' } }) }),
      context({ subject: subject({ principal: { ...subject().principal, role: 'reviewer' } }) }),
      context({ idempotency: { kind: 'KEYED', key: 'idempotency:request-02' } }),
      retryOperationInvocationContext({
        previous: base,
        operationAttemptId: 'operation-attempt:retry-1',
        occurredAt: '2026-08-29T00:01:00.000Z',
      }),
    ];
    const variantDigests = variants.map(value => (
      JSON.parse(decodeText(encodeOperationInvocationContext(value))) as { contextSha256: string }
    ).contextSha256);
    expect(variantDigests).not.toContain(baseDigest);
    expect(new Set(variantDigests).size).toBe(variantDigests.length);
  });

  it('rejects malformed UTF-8 classes before JSON parsing', () => {
    for (const hostile of [
      Uint8Array.from([0xff]),
      Uint8Array.from([0xc0, 0xaf]),
      Uint8Array.from([0x80]),
      Uint8Array.from([0xe2, 0x82]),
    ]) expectCode(() => decodeOperationInvocationContext(hostile), 'INVALID_UTF8');
  });

  it('rejects truncation and syntactically valid incomplete envelopes without repair', () => {
    const encoded = encodeOperationInvocationContext(context());
    expectCode(() => decodeOperationInvocationContext(encoded.slice(0, -1)), 'INVALID_JSON');
    expectCode(() => decodeOperationInvocationContext(Buffer.from('{}', 'utf8')), 'INVALID_ENVELOPE');
  });

  it('rejects duplicate top-level and nested keys through original-byte canonical equality', () => {
    const encoded = encodeOperationInvocationContext(context());
    const text = decodeText(encoded);
    const topLevelDuplicate = text.replace(/\}$/u, ',"schemaVersion":1}');
    const nestedDuplicate = text.replace(
      `"createdAt":"${CREATED_AT}"`,
      `"createdAt":"${CREATED_AT}","createdAt":"${CREATED_AT}"`,
    );
    expectCode(() => decodeOperationInvocationContext(Buffer.from(topLevelDuplicate, 'utf8')), 'NON_CANONICAL_BYTES');
    expectCode(() => decodeOperationInvocationContext(Buffer.from(nestedDuplicate, 'utf8')), 'NON_CANONICAL_BYTES');
  });

  it('rejects BOM, whitespace, key order, alternate escapes, and numeric spellings', () => {
    const encoded = encodeOperationInvocationContext(context());
    const text = decodeText(encoded);
    const parsed = JSON.parse(text) as { schemaVersion: number; contextSha256: string; context: Json };
    const reordered = JSON.stringify({
      schemaVersion: parsed.schemaVersion,
      contextSha256: parsed.contextSha256,
      context: parsed.context,
    });
    const hostile = [
      Buffer.from(` ${text}`, 'utf8'),
      Buffer.from(`${text}\n`, 'utf8'),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]),
      Buffer.from(reordered, 'utf8'),
      Buffer.from(text.replace('principal-01', 'principal-\\u0030\\u0031'), 'utf8'),
      Buffer.from(text.replace(/"schemaVersion":1\}$/u, '"schemaVersion":1.0}'), 'utf8'),
    ];
    for (const value of hostile) {
      expectCode(() => decodeOperationInvocationContext(value), 'NON_CANONICAL_BYTES');
    }
  });

  it('rejects context and digest tampering without claiming authentication', () => {
    const original = JSON.parse(decodeText(encodeOperationInvocationContext(context()))) as {
      schemaVersion: 1;
      contextSha256: string;
      context: Record<string, unknown>;
    };
    const changedContext = plain(original) as { schemaVersion: 1; contextSha256: string; context: Record<string, Json> };
    const changedSubject = changedContext.context.subject as Record<string, Json>;
    const changedResource = changedSubject.resource as Record<string, Json>;
    changedResource.id = 'resource:tampered';
    expectCode(() => decodeOperationInvocationContext(bytes(changedContext as unknown as Json)), 'DIGEST_MISMATCH');

    const changedDigest = plain(original) as { schemaVersion: 1; contextSha256: string; context: Json };
    changedDigest.contextSha256 = `${changedDigest.contextSha256[0] === '0' ? '1' : '0'}${changedDigest.contextSha256.slice(1)}`;
    expectCode(() => decodeOperationInvocationContext(bytes(changedDigest as unknown as Json)), 'DIGEST_MISMATCH');
  });

  it('rejects inexact envelope schemas, versions, and digest representations', () => {
    const valid = envelopeFor(context()) as Record<string, Json>;
    const { context: _omitted, ...missingContext } = valid;
    const cases: Array<[Json, OperationInvocationTransportErrorCode]> = [
      [null, 'INVALID_ENVELOPE'],
      [missingContext, 'INVALID_ENVELOPE'],
      [{ ...valid, extra: true }, 'INVALID_ENVELOPE'],
      [{ ...valid, schemaVersion: 2 }, 'UNSUPPORTED_SCHEMA_VERSION'],
      [{ ...valid, contextSha256: 'A'.repeat(64) }, 'INVALID_DIGEST'],
      [{ ...valid, contextSha256: `sha256:${'a'.repeat(64)}` }, 'INVALID_DIGEST'],
      [{ ...valid, contextSha256: 'a'.repeat(63) }, 'INVALID_DIGEST'],
    ];
    for (const [value, code] of cases) {
      expectCode(() => decodeOperationInvocationContext(bytes(value)), code);
    }
  });

  it('rejects catalog drift even when an attacker recomputes a valid domain digest', () => {
    const drifted = plain(context()) as Record<string, Json>;
    drifted.operation = { operationId: Op.FsWrite, version: 2, key: 'op.fs.write@2' };
    const driftedEnvelope: Json = {
      schemaVersion: 1,
      contextSha256: digest(drifted),
      context: drifted,
    };
    expectCode(() => decodeOperationInvocationContext(bytes(driftedEnvelope)), 'CONTEXT_INVALID');

    const unknown = plain(context()) as Record<string, Json>;
    unknown.operation = { operationId: 'op.unknown', version: 1, key: 'op.unknown@1' };
    const unknownEnvelope: Json = {
      schemaVersion: 1,
      contextSha256: digest(unknown),
      context: unknown,
    };
    expectCode(() => decodeOperationInvocationContext(bytes(unknownEnvelope)), 'CONTEXT_INVALID');
  });
});
