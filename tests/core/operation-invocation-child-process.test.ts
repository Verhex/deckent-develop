import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  Op,
  operationReference,
} from '../../src/core/operation-catalog/index.js';
import { createOperationInvocationContext } from '../../src/core/operation-invocation-context.js';
import { createRootOperationIdentity } from '../../src/core/operation-invocation-identity.js';
import {
  decodeOperationInvocationContext,
  encodeOperationInvocationContext,
  OPERATION_INVOCATION_TRANSPORT_MAX_BYTES,
  type OperationInvocationTransportErrorCode,
} from '../../src/core/operation-invocation-transport.js';

const CREATED_AT = '2026-08-29T00:00:00.000Z';
const TSX_LOADER_URL = new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url).href;
const TRANSPORT_MODULE_URL = new URL('../../src/core/operation-invocation-transport.ts', import.meta.url).href;
const HARNESS_STDIN_MAX_BYTES = 4 * 1024 * 1024;
const HARNESS_STDOUT_MAX_BYTES = OPERATION_INVOCATION_TRANSPORT_MAX_BYTES;
const HARNESS_STDERR_MAX_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const TERMINATION_GRACE_MS = 250;

const CHILD_SOURCE = String.raw`
const mode = process.argv[1];
const transportModuleUrl = process.argv[2];

if (mode === 'early-exit') {
  process.exit(23);
}

if (mode === 'hang') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}

try {
  const transport = await import(transportModuleUrl);
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > transport.OPERATION_INVOCATION_TRANSPORT_MAX_BYTES + 1) {
      throw new transport.OperationInvocationTransportError(
        'OVERSIZE',
        'operation invocation transport input exceeds the fixed bound',
      );
    }
    chunks.push(bytes);
  }
  const input = Buffer.concat(chunks, totalBytes);
  const context = transport.decodeOperationInvocationContext(input);
  if (!Object.isFrozen(context)) {
    throw Object.assign(new Error('decoded context was not frozen'), { code: 'CONTEXT_INVALID' });
  }
  const output = transport.encodeOperationInvocationContext(context);
  await new Promise((resolve, reject) => {
    process.stdout.write(Buffer.from(output), error => error === null || error === undefined
      ? resolve()
      : reject(error));
  });
} catch (error) {
  const failure = {
    name: error instanceof Error ? error.name : 'Error',
    code: typeof error === 'object' && error !== null && typeof error.code === 'string'
      ? error.code
      : 'UNEXPECTED',
  };
  process.stderr.write(JSON.stringify(failure));
  process.exitCode = 42;
}
`;

type ChildMode = 'roundtrip' | 'hang' | 'early-exit';
type TerminalReason = 'EXIT' | 'TIMEOUT' | 'OUTPUT_LIMIT' | 'SPAWN_ERROR';
type StdinDisposition = 'WRITTEN' | 'CLOSED' | 'EPIPE' | 'ERROR';

interface ProcessTerminal {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly spawnError?: Error;
}

interface ChildOutcome extends ProcessTerminal {
  readonly reason: TerminalReason;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly stdin: StdinDisposition;
  readonly timedOut: boolean;
  readonly settlementCount: number;
  readonly pid: number | undefined;
}

interface RunChildOptions {
  readonly mode?: ChildMode;
  readonly timeoutMs?: number;
}

interface BoundedCollector {
  readonly done: Promise<Uint8Array>;
}

const activeChildren = new Set<ChildProcessWithoutNullStreams>();
let sandboxDirectory = '';

function isTerminal(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function signal(child: ChildProcessWithoutNullStreams, name: NodeJS.Signals): void {
  if (isTerminal(child)) return;
  try {
    child.kill(name);
  } catch {
    // The process may have exited between the terminal check and kill request.
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function reapChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (isTerminal(child)) {
    activeChildren.delete(child);
    return;
  }
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  signal(child, 'SIGTERM');
  await Promise.race([exited, delay(TERMINATION_GRACE_MS)]);
  if (!isTerminal(child)) {
    signal(child, 'SIGKILL');
    await Promise.race([exited, delay(TERMINATION_GRACE_MS)]);
  }
  if (!isTerminal(child)) {
    throw new Error(`child process ${child.pid ?? 'unknown'} did not terminate`);
  }
  activeChildren.delete(child);
}

function collectBounded(
  stream: NodeJS.ReadableStream,
  maximumBytes: number,
  onOverflow: () => void,
): BoundedCollector {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let overflowed = false;
  const done = new Promise<Uint8Array>((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => {
      if (overflowed) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (totalBytes + bytes.byteLength > maximumBytes) {
        overflowed = true;
        onOverflow();
        return;
      }
      chunks.push(Buffer.from(bytes));
      totalBytes += bytes.byteLength;
    });
    stream.once('error', reject);
    stream.once('close', () => resolve(Uint8Array.from(Buffer.concat(chunks, totalBytes))));
  });
  return { done };
}

function writeStdin(
  child: ChildProcessWithoutNullStreams,
  input: Uint8Array,
): Promise<StdinDisposition> {
  return new Promise(resolve => {
    let settled = false;
    const settle = (disposition: StdinDisposition): void => {
      if (settled) return;
      settled = true;
      resolve(disposition);
    };
    child.stdin.once('error', (error: NodeJS.ErrnoException) => {
      settle(error.code === 'EPIPE' ? 'EPIPE' : 'ERROR');
    });
    child.stdin.once('close', () => settle('CLOSED'));
    child.stdin.end(Buffer.from(input), () => settle('WRITTEN'));
  });
}

async function runChild(input: Uint8Array, options: RunChildOptions = {}): Promise<ChildOutcome> {
  if (!(input instanceof Uint8Array) || input.byteLength > HARNESS_STDIN_MAX_BYTES) {
    throw new TypeError(`child harness stdin must be a Uint8Array of at most ${HARNESS_STDIN_MAX_BYTES} bytes`);
  }
  const mode = options.mode ?? 'roundtrip';
  const child = spawn(process.execPath, [
    '--import',
    TSX_LOADER_URL,
    '--input-type=module',
    '--eval',
    CHILD_SOURCE,
    mode,
    TRANSPORT_MODULE_URL,
  ], {
    cwd: sandboxDirectory,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  activeChildren.add(child);

  let reason: TerminalReason = 'EXIT';
  let escalationTimer: NodeJS.Timeout | undefined;
  const terminate = (terminalReason: Exclude<TerminalReason, 'EXIT' | 'SPAWN_ERROR'>): void => {
    if (reason === 'EXIT') reason = terminalReason;
    signal(child, 'SIGTERM');
    escalationTimer ??= setTimeout(() => signal(child, 'SIGKILL'), TERMINATION_GRACE_MS);
  };

  const stdout = collectBounded(child.stdout, HARNESS_STDOUT_MAX_BYTES, () => terminate('OUTPUT_LIMIT'));
  const stderr = collectBounded(child.stderr, HARNESS_STDERR_MAX_BYTES, () => terminate('OUTPUT_LIMIT'));
  const stdin = writeStdin(child, input);
  const terminal = new Promise<ProcessTerminal>(resolve => {
    let settled = false;
    const settle = (outcome: ProcessTerminal): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    child.once('error', (error: Error) => {
      reason = 'SPAWN_ERROR';
      settle({ code: null, signal: null, spawnError: error });
    });
    child.once('exit', (code, exitSignal) => settle({ code, signal: exitSignal }));
  });
  const timeoutTimer = setTimeout(() => terminate('TIMEOUT'), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let settlementCount = 0;
  try {
    const [terminalOutcome, stdoutBytes, stderrBytes, stdinDisposition] = await Promise.all([
      terminal,
      stdout.done,
      stderr.done,
      stdin,
    ]);
    settlementCount += 1;
    return {
      ...terminalOutcome,
      reason,
      stdout: stdoutBytes,
      stderr: stderrBytes,
      stdin: stdinDisposition,
      timedOut: reason === 'TIMEOUT',
      settlementCount,
      pid: child.pid,
    };
  } finally {
    clearTimeout(timeoutTimer);
    if (escalationTimer !== undefined) clearTimeout(escalationTimer);
    if (isTerminal(child)) activeChildren.delete(child);
  }
}

function context() {
  return createOperationInvocationContext({
    schemaVersion: 1,
    operation: operationReference(Op.FsWrite, 1),
    identity: createRootOperationIdentity({
      invocationId: 'invocation:child-process-root-1',
      transactionId: 'transaction:child-process-tx-1',
      operationAttemptId: 'operation-attempt:child-process-attempt-1',
      correlationId: 'correlation:child-process-corr-1',
      occurredAt: CREATED_AT,
    }),
    subject: {
      principal: {
        id: 'principal-child-process-01',
        identityClass: 'service',
        assurance: 'token-verified',
        provenance: 'cli',
        verifiedBy: 'oidc:issuer-a',
        tenantId: 'tenant:principal',
        role: 'operator',
      },
      tenantId: 'tenant:invocation',
      projectId: 'project:project-01',
      resource: { tenantId: 'tenant:resource', type: 'repository', id: 'resource:repo-01' },
      environmentId: 'environment:test',
      adapterId: 'adapter:child-process-01',
      platform: 'linux',
    },
    idempotency: { kind: 'KEYED', key: 'idempotency:child-process-request-01' },
    createdAt: CREATED_AT,
  });
}

function childFailure(outcome: ChildOutcome): { readonly name: string; readonly code: string } {
  return JSON.parse(Buffer.from(outcome.stderr).toString('utf8')) as { name: string; code: string };
}

function replaceSameLength(input: Uint8Array, from: string, to: string): Uint8Array {
  expect(Buffer.byteLength(from)).toBe(Buffer.byteLength(to));
  const text = Buffer.from(input).toString('utf8');
  expect(text).toContain(from);
  return Buffer.from(text.replace(from, to), 'utf8');
}

beforeEach(async () => {
  sandboxDirectory = await mkdtemp(join(tmpdir(), 'deckent-operation-child-process-'));
});

afterEach(async () => {
  await Promise.all([...activeChildren].map(reapChild));
  expect(activeChildren.size).toBe(0);
  if (sandboxDirectory !== '') {
    await rm(sandboxDirectory, { recursive: true, force: true });
    sandboxDirectory = '';
  }
});

describe('operation invocation child-process transport', () => {
  it('round-trips exact canonical bytes and digest through an isolated child', async () => {
    const encoded = encodeOperationInvocationContext(context());
    const inputEnvelope = JSON.parse(Buffer.from(encoded).toString('utf8')) as { contextSha256: string };
    const outcome = await runChild(encoded);

    expect(outcome).toMatchObject({
      reason: 'EXIT',
      code: 0,
      signal: null,
      timedOut: false,
      settlementCount: 1,
    });
    expect(outcome.stderr).toHaveLength(0);
    expect(outcome.stdout).toEqual(encoded);
    const outputEnvelope = JSON.parse(Buffer.from(outcome.stdout).toString('utf8')) as { contextSha256: string };
    expect(outputEnvelope.contextSha256).toBe(inputEnvelope.contextSha256);

    const decoded = decodeOperationInvocationContext(outcome.stdout);
    expect(decoded).toEqual(context());
    for (const value of [
      decoded,
      decoded.operation,
      decoded.identity,
      decoded.subject,
      decoded.subject.principal,
      decoded.subject.resource,
      decoded.idempotency,
    ]) expect(Object.isFrozen(value)).toBe(true);
    expect(activeChildren.size).toBe(0);
  });

  it.each([
    ['tampered', (encoded: Uint8Array) => replaceSameLength(encoded, 'resource:repo-01', 'resource:repo-02'), 'DIGEST_MISMATCH'],
    ['truncated', (encoded: Uint8Array) => encoded.slice(0, -1), 'INVALID_JSON'],
  ] as const)('returns a typed child failure for %s canonical authority bytes', async (_label, mutate, code) => {
    const outcome = await runChild(mutate(encodeOperationInvocationContext(context())));

    expect(outcome).toMatchObject({ reason: 'EXIT', code: 42, settlementCount: 1 });
    expect(outcome.stdout).toHaveLength(0);
    expect(childFailure(outcome)).toEqual({
      name: 'OperationInvocationTransportError',
      code: code satisfies OperationInvocationTransportErrorCode,
    });
    expect(activeChildren.size).toBe(0);
  });

  it('returns a typed oversize refusal without accumulating unbounded authority bytes', async () => {
    const outcome = await runChild(new Uint8Array(OPERATION_INVOCATION_TRANSPORT_MAX_BYTES + 1));

    expect(outcome).toMatchObject({ reason: 'EXIT', code: 42, settlementCount: 1 });
    expect(outcome.stdout).toHaveLength(0);
    expect(childFailure(outcome)).toEqual({
      name: 'OperationInvocationTransportError',
      code: 'OVERSIZE',
    });
    expect(activeChildren.size).toBe(0);
  });

  it('times out a hung child, escalates termination, and reaps it', async () => {
    const outcome = await runChild(new Uint8Array(), { mode: 'hang', timeoutMs: 200 });

    expect(outcome.reason).toBe('TIMEOUT');
    expect(outcome.timedOut).toBe(true);
    expect(outcome.settlementCount).toBe(1);
    expect(outcome.code === null || outcome.code === 0).toBe(true);
    if (process.platform === 'win32') {
      expect(['SIGTERM', 'SIGKILL', null]).toContain(outcome.signal);
    } else {
      expect(outcome.signal).toBe('SIGKILL');
    }
    expect(activeChildren.size).toBe(0);
  });

  it('settles once when early exit races a large stdin write and leaves no child', async () => {
    const input = new Uint8Array(HARNESS_STDIN_MAX_BYTES);
    input.fill(0x61);
    const outcome = await runChild(input, { mode: 'early-exit' });

    expect(outcome).toMatchObject({ reason: 'EXIT', code: 23, settlementCount: 1 });
    expect(['EPIPE', 'CLOSED', 'WRITTEN']).toContain(outcome.stdin);
    expect(outcome.stdout).toHaveLength(0);
    expect(activeChildren.size).toBe(0);
  });
});
