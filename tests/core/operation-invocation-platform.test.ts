import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  Op,
  operationReference,
} from '../../src/core/operation-catalog/index.js';
import {
  createOperationInvocationContext,
  type OperationInvocationContext,
} from '../../src/core/operation-invocation-context.js';
import { createRootOperationIdentity } from '../../src/core/operation-invocation-identity.js';
import {
  OperationInvocationSubjectError,
  createOperationInvocationSubject,
} from '../../src/core/operation-invocation-subject.js';
import {
  OperationInvocationTransportError,
  decodeOperationInvocationContext,
  encodeOperationInvocationContext,
  OPERATION_INVOCATION_TRANSPORT_MAX_BYTES,
} from '../../src/core/operation-invocation-transport.js';
import type { GlobalScopePlatform } from '../../src/core/global-scope-resolver.js';

const CREATED_AT_Z = '2026-08-29T00:00:00.000Z';
const CREATED_AT_OFFSET = '2026-08-29T03:00:00.000+03:00';
const TSX_LOADER_URL = new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url).href;
const TRANSPORT_MODULE_URL = new URL('../../src/core/operation-invocation-transport.ts', import.meta.url).href;
const CHILD_STDERR_MAX_BYTES = 8 * 1024;
const CHILD_TIMEOUT_MS = 5_000;
const CHILD_TERMINATION_GRACE_MS = 250;
const CHILD_CLOSE_ACK_TIMEOUT_MS = 500;

const ENVIRONMENT_CODEC_SOURCE = String.raw`
const transportModuleUrl = process.argv[1];
const expectedTimezone = process.argv[2];
const expectedLocaleEnvironment = process.argv[3];
const expectedOffsetMinutes = Number(process.argv[4]);

try {
  if (process.env.TZ !== expectedTimezone
    || process.env.LANG !== expectedLocaleEnvironment
    || process.env.LC_ALL !== expectedLocaleEnvironment) {
    throw new Error('child locale/timezone environment did not match its explicit fixture');
  }
  const observedOffsetMinutes = new Date(0).getTimezoneOffset();
  if (observedOffsetMinutes !== expectedOffsetMinutes) {
    throw new Error(
      'child timezone was not applied: expected '
      + expectedOffsetMinutes
      + ', observed '
      + observedOffsetMinutes,
    );
  }

  const transport = await import(transportModuleUrl);
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > transport.OPERATION_INVOCATION_TRANSPORT_MAX_BYTES) {
      throw new transport.OperationInvocationTransportError(
        'OVERSIZE',
        'operation invocation transport input exceeds the fixed bound',
      );
    }
    chunks.push(bytes);
  }
  const decoded = transport.decodeOperationInvocationContext(Buffer.concat(chunks, totalBytes));
  const encoded = transport.encodeOperationInvocationContext(decoded);
  await new Promise((resolve, reject) => {
    process.stdout.write(Buffer.from(encoded), error => error === null || error === undefined
      ? resolve()
      : reject(error));
  });
} catch (error) {
  process.stderr.write(JSON.stringify({
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    code: typeof error === 'object' && error !== null && typeof error.code === 'string'
      ? error.code
      : 'ENVIRONMENT_PROOF_FAILED',
  }));
  process.exitCode = 42;
}
`;

const PLATFORM_PROOF = Object.freeze({
  proofClass: 'SIMULATED_PLATFORM_CONTRACT' as const,
  nativeExecution: false as const,
  nativeProof: 'UNAVAILABLE/HOLD' as const,
});

interface SimulatedPlatformFixture {
  readonly platform: GlobalScopePlatform;
  readonly adapterId: string;
  readonly resourceId: string;
}

interface LocaleTimezoneFixture {
  readonly timezone: string;
  readonly localeEnvironment: string;
  readonly expectedOffsetMinutes: number;
}

const LOCALE_TIMEZONE_FIXTURES: readonly LocaleTimezoneFixture[] = Object.freeze([
  Object.freeze({
    timezone: 'UTC',
    localeEnvironment: 'C',
    expectedOffsetMinutes: 0,
  }),
  Object.freeze({
    timezone: 'Etc/GMT+8',
    localeEnvironment: 'tr_TR.UTF-8',
    expectedOffsetMinutes: 8 * 60,
  }),
]);

const ACTIVE_ENVIRONMENT_CHILDREN = new Set<ChildProcessWithoutNullStreams>();

const PLATFORM_FIXTURES: readonly SimulatedPlatformFixture[] = Object.freeze([
  Object.freeze({
    platform: 'darwin',
    adapterId: 'adapter:darwin-simulated',
    resourceId: 'resource:/Users/alperen/Calisma/repo',
  }),
  Object.freeze({
    platform: 'linux',
    adapterId: 'adapter:linux-simulated',
    resourceId: 'resource:/srv/uretim/repo',
  }),
  Object.freeze({
    platform: 'win32',
    adapterId: 'adapter:win32-simulated',
    resourceId: 'resource:C:\\Work\\Istanbul\\repo',
  }),
  Object.freeze({
    platform: 'wsl',
    adapterId: 'adapter:wsl-simulated',
    resourceId: 'resource:/mnt/c/Users/Alperen/repo',
  }),
]);

function subjectInput(fixture: SimulatedPlatformFixture, resourceId = fixture.resourceId) {
  return {
    principal: {
      id: `principal-${fixture.platform}`,
      identityClass: 'oidc',
      assurance: 'token-verified',
      provenance: 'api',
      verifiedBy: 'oidc:issuer-platform-proof',
      tenantId: 'principal-tenant-platform-proof',
      role: 'operator',
    },
    tenantId: 'tenant:platform-proof',
    projectId: 'project:platform-proof',
    resource: {
      tenantId: 'tenant:platform-resource',
      type: 'repository',
      id: resourceId,
    },
    environmentId: 'environment:platform-proof',
    adapterId: fixture.adapterId,
    platform: fixture.platform,
  };
}

function contextInput(
  fixture: SimulatedPlatformFixture,
  options: Readonly<{ readonly resourceId?: string; readonly occurredAt?: string }> = {},
) {
  const occurredAt = options.occurredAt ?? CREATED_AT_Z;
  return {
    schemaVersion: 1,
    operation: operationReference(Op.FsWrite, 1),
    identity: createRootOperationIdentity({
      invocationId: `invocation:platform-${fixture.platform}`,
      transactionId: `transaction:platform-${fixture.platform}`,
      operationAttemptId: `operation-attempt:platform-${fixture.platform}`,
      correlationId: `correlation:platform-${fixture.platform}`,
      occurredAt,
    }),
    subject: subjectInput(fixture, options.resourceId),
    idempotency: { kind: 'KEYED', key: `idempotency:platform-${fixture.platform}` },
    createdAt: occurredAt,
  };
}

function context(
  fixture: SimulatedPlatformFixture,
  options?: Readonly<{ readonly resourceId?: string; readonly occurredAt?: string }>,
): OperationInvocationContext {
  return createOperationInvocationContext(contextInput(fixture, options));
}

function reverseInsertionOrder(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reverseInsertionOrder);
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, nested]) => [key, reverseInsertionOrder(nested)]),
  );
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeeplyFrozen(nested);
}

function appendWireText(bytes: Uint8Array, suffix: string): Uint8Array {
  const trailer = new TextEncoder().encode(suffix);
  const combined = new Uint8Array(bytes.byteLength + trailer.byteLength);
  combined.set(bytes);
  combined.set(trailer, bytes.byteLength);
  return combined;
}

function childEnvironment(fixture: LocaleTimezoneFixture): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    TZ: fixture.timezone,
    LANG: fixture.localeEnvironment,
    LC_ALL: fixture.localeEnvironment,
  };
  if (process.platform === 'win32') {
    for (const key of ['SystemRoot', 'WINDIR']) {
      const value = process.env[key];
      if (value !== undefined) environment[key] = value;
    }
  }
  return environment;
}

function signalChild(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill(signal);
  } catch {
    // Exit can win the race between the terminal check and the signal.
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function reapEnvironmentChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (!ACTIVE_ENVIRONMENT_CHILDREN.has(child)) return;
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  signalChild(child, 'SIGTERM');
  await Promise.race([closed, delay(CHILD_TERMINATION_GRACE_MS)]);
  if (ACTIVE_ENVIRONMENT_CHILDREN.has(child)) {
    signalChild(child, 'SIGKILL');
    await Promise.race([closed, delay(CHILD_TERMINATION_GRACE_MS)]);
  }
  if (ACTIVE_ENVIRONMENT_CHILDREN.has(child)) {
    throw new Error(`locale/timezone proof child ${child.pid ?? 'unknown'} did not close`);
  }
}

function runEnvironmentCodec(
  input: Uint8Array,
  fixture: LocaleTimezoneFixture,
  isolatedCwd: string,
): Promise<Uint8Array> {
  if (!(input instanceof Uint8Array) || input.byteLength === 0
    || input.byteLength > OPERATION_INVOCATION_TRANSPORT_MAX_BYTES) {
    return Promise.reject(new TypeError('environment proof input must be one bounded non-empty transport envelope'));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--import',
      TSX_LOADER_URL,
      '--input-type=module',
      '--eval',
      ENVIRONMENT_CODEC_SOURCE,
      TRANSPORT_MODULE_URL,
      fixture.timezone,
      fixture.localeEnvironment,
      String(fixture.expectedOffsetMinutes),
    ], {
      cwd: isolatedCwd,
      env: childEnvironment(fixture),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    ACTIVE_ENVIRONMENT_CHILDREN.add(child);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let terminalFailure: Error | undefined;
    let settled = false;
    let escalationTimer: NodeJS.Timeout | undefined;
    let closeAckTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;

    const clearLifecycleTimers = (): void => {
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (escalationTimer !== undefined) clearTimeout(escalationTimer);
      if (closeAckTimer !== undefined) clearTimeout(closeAckTimer);
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearLifecycleTimers();
      if (error !== undefined) reject(error);
      else resolve(Uint8Array.from(Buffer.concat(stdoutChunks, stdoutBytes)));
    };

    const terminate = (error: Error): void => {
      terminalFailure ??= error;
      if (escalationTimer !== undefined || closeAckTimer !== undefined) return;
      signalChild(child, 'SIGTERM');
      escalationTimer = setTimeout(() => {
        signalChild(child, 'SIGKILL');
        closeAckTimer = setTimeout(() => {
          finish(new Error(
            `${terminalFailure?.message ?? 'locale/timezone proof child termination failed'}; `
            + 'child did not acknowledge close after SIGKILL',
          ));
        }, CHILD_CLOSE_ACK_TIMEOUT_MS);
      }, CHILD_TERMINATION_GRACE_MS);
    };
    const collect = (
      chunk: Buffer | string,
      chunks: Buffer[],
      currentBytes: number,
      maximumBytes: number,
      label: string,
    ): number => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const nextBytes = currentBytes + bytes.byteLength;
      if (nextBytes > maximumBytes) {
        terminate(new Error(`locale/timezone proof child exceeded bounded ${label}`));
        return currentBytes;
      }
      chunks.push(Buffer.from(bytes));
      return nextBytes;
    };

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutBytes = collect(
        chunk,
        stdoutChunks,
        stdoutBytes,
        OPERATION_INVOCATION_TRANSPORT_MAX_BYTES,
        'stdout',
      );
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrBytes = collect(chunk, stderrChunks, stderrBytes, CHILD_STDERR_MAX_BYTES, 'stderr');
    });
    child.once('error', (error: Error) => {
      terminalFailure ??= error;
    });

    timeoutTimer = setTimeout(() => {
      terminate(new Error('locale/timezone proof child exceeded its bounded deadline'));
    }, CHILD_TIMEOUT_MS);

    child.once('close', (code, signal) => {
      ACTIVE_ENVIRONMENT_CHILDREN.delete(child);
      clearLifecycleTimers();
      if (settled) return;
      if (terminalFailure !== undefined) {
        finish(terminalFailure);
        return;
      }
      if (code !== 0 || signal !== null) {
        const stderr = Buffer.concat(stderrChunks, stderrBytes).toString('utf8');
        finish(new Error(
          `locale/timezone proof child failed with code ${String(code)}, signal ${String(signal)}: ${stderr}`,
        ));
        return;
      }
      if (stderrBytes !== 0) {
        finish(new Error(`locale/timezone proof child wrote unexpected stderr: ${Buffer.concat(
          stderrChunks,
          stderrBytes,
        ).toString('utf8')}`));
        return;
      }
      finish();
    });

    child.stdin.once('error', (error: NodeJS.ErrnoException) => {
      terminate(new Error(`locale/timezone proof stdin failed: ${error.code ?? error.message}`));
    });
    child.stdin.end(Buffer.from(input));
  });
}

afterEach(async () => {
  await Promise.all([...ACTIVE_ENVIRONMENT_CHILDREN].map(reapEnvironmentChild));
  expect(ACTIVE_ENVIRONMENT_CHILDREN.size).toBe(0);
});

describe('operation invocation SIMULATED_PLATFORM_CONTRACT', () => {
  it('labels simulated contract coverage without claiming native execution proof', () => {
    expect(PLATFORM_PROOF).toEqual({
      proofClass: 'SIMULATED_PLATFORM_CONTRACT',
      nativeExecution: false,
      nativeProof: 'UNAVAILABLE/HOLD',
    });
    expect(Object.isFrozen(PLATFORM_PROOF)).toBe(true);
  });

  it.each(PLATFORM_FIXTURES)(
    'round-trips deterministic frozen $platform bytes while preserving opaque path-looking IDs',
    (fixture) => {
      const source = context(fixture);
      const first = encodeOperationInvocationContext(source);
      const second = encodeOperationInvocationContext(source);
      const decoded = decodeOperationInvocationContext(first);

      expect(first).toEqual(second);
      expect(encodeOperationInvocationContext(decoded)).toEqual(first);
      expect(decoded).toEqual(source);
      expect(decoded.subject.platform).toBe(fixture.platform);
      expect(decoded.subject.adapterId).toBe(fixture.adapterId);
      expect(decoded.subject.resource.id).toBe(fixture.resourceId);
      expectDeeplyFrozen(decoded);
    },
  );

  it('canonicalizes opposite insertion orders to identical transport bytes', () => {
    const fixture = PLATFORM_FIXTURES[2]!;
    const forward = createOperationInvocationContext(contextInput(fixture));
    const reversed = createOperationInvocationContext(reverseInsertionOrder(contextInput(fixture)));

    expect(reversed).toEqual(forward);
    expect(encodeOperationInvocationContext(reversed))
      .toEqual(encodeOperationInvocationContext(forward));
  });

  it('preserves Turkish and composed/decomposed Unicode distinctly without normalization', () => {
    const fixture = PLATFORM_FIXTURES[0]!;
    const composedId = 'resource:/opaque/İstanbul/ı/é';
    const decomposedId = 'resource:/opaque/İstanbul/ı/e\u0301';
    const composed = context(fixture, { resourceId: composedId });
    const decomposed = context(fixture, { resourceId: decomposedId });
    const composedBytes = encodeOperationInvocationContext(composed);
    const decomposedBytes = encodeOperationInvocationContext(decomposed);

    expect(decodeOperationInvocationContext(composedBytes).subject.resource.id).toBe(composedId);
    expect(decodeOperationInvocationContext(decomposedBytes).subject.resource.id).toBe(decomposedId);
    expect(composedBytes).not.toEqual(decomposedBytes);
    expect(encodeOperationInvocationContext(composed)).toEqual(composedBytes);
    expect(encodeOperationInvocationContext(decomposed)).toEqual(decomposedBytes);
  });

  it('preserves exact RFC3339 text and keeps Z and +03:00 representations distinct', () => {
    const fixture = PLATFORM_FIXTURES[1]!;
    const utc = context(fixture, { occurredAt: CREATED_AT_Z });
    const offset = context(fixture, { occurredAt: CREATED_AT_OFFSET });
    const utcBytes = encodeOperationInvocationContext(utc);
    const offsetBytes = encodeOperationInvocationContext(offset);

    expect(decodeOperationInvocationContext(utcBytes).createdAt).toBe(CREATED_AT_Z);
    expect(decodeOperationInvocationContext(offsetBytes).createdAt).toBe(CREATED_AT_OFFSET);
    expect(decodeOperationInvocationContext(offsetBytes).identity.occurredAt).toBe(CREATED_AT_OFFSET);
    expect(utcBytes).not.toEqual(offsetBytes);
    expect(encodeOperationInvocationContext(utc)).toEqual(utcBytes);
    expect(encodeOperationInvocationContext(offset)).toEqual(offsetBytes);
  });

  it('keeps exact codec bytes invariant across explicit locale and timezone environments', async () => {
    const source = context(PLATFORM_FIXTURES[3]!, {
      resourceId: 'resource:/opaque/İstanbul/C:\\Work\\repo',
      occurredAt: CREATED_AT_OFFSET,
    });
    const canonicalBytes = encodeOperationInvocationContext(source);
    const isolatedRoot = await mkdtemp(join(tmpdir(), 'deckent-operation-platform-'));

    try {
      const outputs = await Promise.all(LOCALE_TIMEZONE_FIXTURES.map(fixture => (
        runEnvironmentCodec(canonicalBytes, fixture, isolatedRoot)
      )));
      expect(new Set(LOCALE_TIMEZONE_FIXTURES.map(fixture => fixture.expectedOffsetMinutes)).size)
        .toBe(LOCALE_TIMEZONE_FIXTURES.length);
      for (const output of outputs) {
        expect(output).toEqual(canonicalBytes);
        expect(decodeOperationInvocationContext(output)).toEqual(source);
      }
      expect(outputs[0]).toEqual(outputs[1]);
    } finally {
      await rm(isolatedRoot, { recursive: true, force: true });
    }
  });

  it.each([
    'resource:/repo\nchild',
    'resource:C:\\repo\r\nchild',
    'resource:/repo\u0000child',
    'resource:/repo\u0085child',
  ])('rejects control-bearing opaque resource identity %j', (resourceId) => {
    expect(() => createOperationInvocationSubject({
      ...subjectInput(PLATFORM_FIXTURES[1]!),
      resource: {
        ...subjectInput(PLATFORM_FIXTURES[1]!).resource,
        id: resourceId,
      },
    })).toThrowError(expect.objectContaining({
      name: 'OperationInvocationSubjectError',
      code: 'INVALID_AUTHORITY_ID',
    } satisfies Partial<OperationInvocationSubjectError>));
  });

  it('rejects LF and CRLF appended to otherwise canonical transport bytes', () => {
    const wire = encodeOperationInvocationContext(context(PLATFORM_FIXTURES[3]!));
    for (const suffix of ['\n', '\r\n']) {
      expect(() => decodeOperationInvocationContext(appendWireText(wire, suffix)))
        .toThrowError(expect.objectContaining({
          name: 'OperationInvocationTransportError',
          code: 'NON_CANONICAL_BYTES',
        } satisfies Partial<OperationInvocationTransportError>));
    }
  });

  it('rejects an unsupported platform instead of silently selecting a host fallback', () => {
    expect(() => createOperationInvocationSubject({
      ...subjectInput(PLATFORM_FIXTURES[1]!),
      platform: 'freebsd',
    })).toThrowError(expect.objectContaining({
      name: 'OperationInvocationSubjectError',
      code: 'INVALID_SCOPE_VALUE',
    } satisfies Partial<OperationInvocationSubjectError>));
  });
});
