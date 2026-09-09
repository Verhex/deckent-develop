// tests/agent/transport-errors.test.ts
// ═══ 7108 §3 — typed transport failures: undici cause chain surfaced, ONE
// bounded retry for transient connect-phase failures, never after a byte.
import { describe, expect, it, vi } from 'vitest';
import {
  classifyTransportFailure,
  isAbortError,
  isTransientTransportFailure,
  ProviderTransportError,
  sleepWithSignal,
} from '../../src/agent/provider-tooluse/transport-errors.js';
import { createOpenAIAdapter } from '../../src/agent/provider-tooluse/openai.js';
import type { ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { DEFAULT_NATIVE_AGENT_BUDGET } from '../../src/core/execution-budget-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';

/** Synthetic undici shape: TypeError('fetch failed') → cause (SocketError) → cause (os error). */
function undiciError(code: string, opts: { errno?: number; syscall?: string; depth?: 1 | 2 } = {}): TypeError {
  const os = Object.assign(new Error(`${opts.syscall ?? 'read'} ${code}`), {
    code, ...(opts.errno !== undefined ? { errno: opts.errno } : {}), ...(opts.syscall ? { syscall: opts.syscall } : {}),
  });
  const mid = (opts.depth ?? 2) === 2 ? Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET', cause: os }) : os;
  return new TypeError('fetch failed', { cause: mid });
}

const REQ: ProviderRequest = { system: 's', model: 'm', messages: [{ role: 'user', content: 'hi' }], tools: [] };
const SSE_OK = 'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
const okResponse = () => ({ ok: true, status: 200, body: (async function* () { yield new TextEncoder().encode(SSE_OK); })() });

async function drain(iter: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe('classifyTransportFailure', () => {
  it('reads the DEEPEST coded cause (cause.cause) — ECONNRESET under UND_ERR_SOCKET is a reset with errno/syscall', () => {
    const failure = classifyTransportFailure(undiciError('ECONNRESET', { errno: -104, syscall: 'read' }), 'connect');
    expect(failure).toMatchObject({ class: 'reset', code: 'ECONNRESET', errno: -104, syscall: 'read', detail: 'fetch failed' });
  });
  it('classifies connect / timeout / abort / unknown honestly', () => {
    expect(classifyTransportFailure(undiciError('ECONNREFUSED', { depth: 1 }), 'connect').class).toBe('connect');
    expect(classifyTransportFailure(undiciError('UND_ERR_CONNECT_TIMEOUT', { depth: 1 }), 'connect').class).toBe('timeout');
    expect(classifyTransportFailure(undiciError('UND_ERR_BODY_TIMEOUT', { depth: 1 }), 'stream').class).toBe('timeout');
    expect(classifyTransportFailure(Object.assign(new Error('x'), { name: 'AbortError' }), 'connect').class).toBe('abort');
    // undici's bare wrapper without any code: connect-phase → connect, mid-stream → reset.
    expect(classifyTransportFailure(new TypeError('fetch failed'), 'connect')).toMatchObject({ class: 'connect', code: null });
    expect(classifyTransportFailure(new TypeError('fetch failed'), 'stream')).toMatchObject({ class: 'reset', code: null });
  });
  it('strips control characters from the detail and bounds it', () => {
    const failure = classifyTransportFailure(new Error(`bad\u001b[2J${'x'.repeat(400)}`), 'connect');
    expect(failure.detail).not.toContain('\u001b');
    expect(failure.detail.length).toBeLessThanOrEqual(200);
  });
  it('transient = connect/reset/timeout in the connect phase only', () => {
    const reset = classifyTransportFailure(undiciError('ECONNRESET'), 'connect');
    expect(isTransientTransportFailure(reset, 'connect')).toBe(true);
    expect(isTransientTransportFailure(reset, 'stream')).toBe(false);
    expect(isTransientTransportFailure(classifyTransportFailure(Object.assign(new Error('a'), { name: 'AbortError' }), 'connect'), 'connect')).toBe(false);
    expect(isAbortError(Object.assign(new Error('a'), { code: 'UND_ERR_ABORTED' }))).toBe(true);
  });
  it('ProviderTransportError message carries the real code and the retry count', () => {
    const err = new ProviderTransportError('openai-compatible', 'connect', classifyTransportFailure(undiciError('ECONNRESET', { syscall: 'read' }), 'connect'), 2);
    expect(err.message).toBe('openai-compatible connect failed — fetch failed (class=reset code=ECONNRESET syscall=read) — retried 1×');
    expect(err.retries).toBe(1);
    expect(err.code).toBe('PROVIDER_TRANSPORT_FAILURE');
  });
  it('sleepWithSignal rejects with an AbortError when the turn is cancelled', async () => {
    const controller = new AbortController();
    const pending = sleepWithSignal(10_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(sleepWithSignal(0)).resolves.toBeUndefined();
  });
});

describe('createOpenAIAdapter — bounded transport retry', () => {
  it('retries ONCE on a transient connect-phase reset when authorized, then succeeds', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(undiciError('ECONNRESET', { syscall: 'read' }))
      .mockImplementationOnce(async () => okResponse() as unknown as Response);
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    const events = await drain(adapter.send({ ...REQ, transportRetry: { attempts: 1, backoffMs: 0 } }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'text-delta', text: 'ok' });
  });

  it('retry-once-then-typed-error: a second failure surfaces ProviderTransportError with the real code and attempts=2', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(undiciError('ECONNRESET', { errno: -104, syscall: 'read' }));
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    await expect(drain(adapter.send({ ...REQ, transportRetry: { attempts: 1, backoffMs: 0 } }))).rejects.toSatisfy((err: unknown) =>
      err instanceof ProviderTransportError
      && err.attempts === 2 && err.retries === 1 && err.phase === 'connect'
      && err.failure.code === 'ECONNRESET' && err.failure.class === 'reset' && err.failure.errno === -104
      && /openai-compatible connect failed — fetch failed \(class=reset code=ECONNRESET syscall=read\) — retried 1×/.test(err.message));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('no authorization (transportRetry absent) → exactly one attempt, typed error with retries=0', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(undiciError('ECONNREFUSED', { depth: 1 }));
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    await expect(drain(adapter.send(REQ))).rejects.toSatisfy((err: unknown) =>
      err instanceof ProviderTransportError && err.attempts === 1 && err.failure.class === 'connect' && err.failure.code === 'ECONNREFUSED');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('honors a config-resolved budget above one (3 attempts = 1 + 2 retries) and never exceeds it', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(undiciError('UND_ERR_CONNECT_TIMEOUT', { depth: 1 }));
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    await expect(drain(adapter.send({ ...REQ, transportRetry: { attempts: 2, backoffMs: 0 } }))).rejects.toSatisfy((err: unknown) =>
      err instanceof ProviderTransportError && err.attempts === 3 && err.failure.class === 'timeout');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('NEVER retries after a partial stream: a mid-body failure is a typed stream-phase error, one fetch only', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => ({
      ok: true, status: 200,
      body: (async function* () {
        yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"par"}}]}\n\n');
        throw undiciError('ECONNRESET', { syscall: 'read' });
      })(),
    }) as unknown as Response);
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    const seen: ProviderEvent[] = [];
    await expect((async () => { for await (const e of adapter.send({ ...REQ, transportRetry: { attempts: 3, backoffMs: 0 } })) seen.push(e); })())
      .rejects.toSatisfy((err: unknown) => err instanceof ProviderTransportError && err.phase === 'stream' && err.attempts === 1
        && err.failure.code === 'ECONNRESET' && /stream failed/.test(err.message));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(seen).toContainEqual({ type: 'text-delta', text: 'par' });
  });

  it('an abort is the caller\'s own decision: rethrown as-is, never retried, never wrapped', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(abort);
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    await expect(drain(adapter.send({ ...REQ, transportRetry: { attempts: 3, backoffMs: 0 } }))).rejects.toBe(abort);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy cold-start message shape for callers matching on it', async () => {
    const fetchImpl = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    await expect(drain(adapter.send(REQ))).rejects.toThrow(/openai-compatible connect failed — fetch failed/);
  });
});

describe('runAgentTurn — typed transport error reaches the view with vars', () => {
  function deps(adapter: LoopDeps['adapter']): LoopDeps {
    return {
      adapter, registry: new ToolRegistry(), policy: SAFE_DEFAULT_POLICY,
      ruleStore: { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] },
      cwd: '/tmp', model: 'm', getMode: () => 'suggest', nativeBudget: DEFAULT_NATIVE_AGENT_BUDGET,
      issuePermission: () => { throw new Error('unexpected'); },
      requestPermission: async () => ({ decision: 'hold', reasonCode: 'unexpected' }),
      validatePermission: () => false, claimPermissionEffect: () => false,
    };
  }
  async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
    const out: AgentEvent[] = [];
    for await (const e of iter) out.push(e);
    return out;
  }

  it('the loop authorizes the config-resolved retry on every request and localizes the failure by code', async () => {
    const seen: ProviderRequest[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(undiciError('ECONNRESET', { syscall: 'read' }));
    const inner = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    const adapter = { name: 'spy', async *send(req: ProviderRequest) { seen.push(req); yield* inner.send(req); } };
    const events = await collect(runAgentTurn(deps(adapter), new Transcript(), 'go'));
    expect(seen[0]?.transportRetry).toEqual({
      attempts: DEFAULT_NATIVE_AGENT_BUDGET.transportRetry, backoffMs: DEFAULT_NATIVE_AGENT_BUDGET.transportRetryBackoffMs,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1 + DEFAULT_NATIVE_AGENT_BUDGET.transportRetry);
    const error = events.find((e) => e.type === 'error');
    expect(error).toMatchObject({
      type: 'error', code: 'native.transport-failure',
      vars: { code: 'ECONNRESET', class: 'reset', retries: String(DEFAULT_NATIVE_AGENT_BUDGET.transportRetry), phase: 'connect' },
    });
    expect(events[events.length - 1]).toEqual({ type: 'turn-end' });
  });

  it('a stream-phase failure is reported under the no-retry code', async () => {
    const adapter = { name: 'stream-drop', async *send(): AsyncIterable<ProviderEvent> {
      yield { type: 'text-delta', text: 'partial' };
      throw new ProviderTransportError('openai-compatible', 'stream', classifyTransportFailure(undiciError('ECONNRESET'), 'stream'), 1);
    } };
    const events = await collect(runAgentTurn(deps(adapter), new Transcript(), 'go'));
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: 'native.transport-failure.no-retry', vars: { code: 'ECONNRESET', retries: '0', phase: 'stream' },
    });
  });
});
