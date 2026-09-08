import { describe, expect, it, vi } from 'vitest';
import {
  projectTaskOutput,
  type TaskOutputProjectionEvent,
  type TaskOutputProjectionInput,
} from '../../src/core/task-output-projection.js';
import type {
  TaskOutputReadCapability,
  TaskOutputReadIdentity,
  TaskOutputReadResult,
  TaskOutputReadService,
} from '../../src/core/task-output-read-service.js';

const digest = `sha256:${'a'.repeat(64)}` as const;
const capability = Object.freeze({}) as TaskOutputReadCapability;
const identity: TaskOutputReadIdentity = {
  projectId: 'project-fixture', taskId: '724-001', sprintId: 'sprint-724',
  attemptId: 'fixture-attempt', generation: 1, dispatchRequestId: 'fixture-dispatch',
  tenantId: 'fixture-tenant', provider: 'codex', model: 'fixture-model',
};
const pending: TaskOutputReadResult = {
  state: 'pending', phase: 'provider-exit', capability, identity,
};
function sealed(content: string): TaskOutputReadResult {
  return { state: 'sealed', identity, capability, source: 'pristine-provider-stream',
    encoding: 'utf8', content, receiptDigest: digest, contentSha256: digest,
    byteLength: Buffer.byteLength(content), capturedAt: '2026-09-09T00:00:00Z',
    providerExitReceiptDigest: digest };
}
function fixture(read: TaskOutputReadResult, overrides: Partial<TaskOutputProjectionInput> = {}) {
  const events: TaskOutputProjectionEvent[] = [];
  const service: TaskOutputReadService = {
    read: vi.fn(() => read),
    observe: vi.fn(async () => ({ state: 'closed', terminalMeaning: 'observer-only' })),
  };
  const input: TaskOutputProjectionInput = {
    query: { projectId: identity.projectId, taskId: identity.taskId,
      caller: { id: 'fixture', tenantId: identity.tenantId }, strictTenantIsolation: true },
    tail: 5, follow: false, signal: new AbortController().signal,
    limits: { maxPendingBytes: 64 * 1024, maxTailLines: 100, maxTailBytes: 64 * 1024,
      termGraceMs: 5, reapObservationMs: 10, streamCloseMs: 10 },
    redactionLabel: '[private key withheld]',
    onEvent: (event) => { events.push(event); }, ...overrides,
  };
  return { service, input, events };
}
function lines(events: TaskOutputProjectionEvent[]): string[] {
  return events.flatMap((event) => event.type === 'lines' ? event.lines : []);
}

describe('shared exact task output projection', () => {
  it('strips pristine content and capability from public metadata without changing source digests', async () => {
    const f = fixture(sealed('first\nlast\n'), { tail: 1 });
    await expect(projectTaskOutput(f.service, f.input)).resolves.toEqual({ state: 'sealed-view', omittedLines: 1 });
    const event = f.events[0];
    expect(event.type).toBe('state');
    if (event.type !== 'state') throw new Error('missing state');
    expect(event.result).not.toHaveProperty('content');
    expect(event.result).not.toHaveProperty('capability');
    expect(event.result).toMatchObject({ contentSha256: digest, byteLength: 11 });
    expect(f.events[1]).toMatchObject({ type: 'lines', redacted: true, omittedLines: 1 });
    expect(lines(f.events)).toEqual(['last']);
    expect(f.service.observe).not.toHaveBeenCalled();
  });

  it('sanitizes the complete sealed stream before tailing a private key block', async () => {
    const f = fixture(sealed('start\n-----BEGIN PRIVATE KEY-----\nfixture-secret-body\n-----END PRIVATE KEY-----\nend\n'), { tail: 2 });
    await projectTaskOutput(f.service, f.input);
    expect(lines(f.events)).toEqual(['[private key withheld]', 'end']);
    expect(JSON.stringify(f.events)).not.toContain('fixture-secret-body');
  });

  it('evicts whole lines by byte budget and reports omissions, never partial words', async () => {
    const f = fixture(sealed('yağmurlu\nson\n'));
    const input = { ...f.input, limits: { ...f.input.limits, maxTailBytes: 4 } };
    await expect(projectTaskOutput(f.service, input)).resolves.toEqual({ state: 'sealed-view', omittedLines: 1 });
    expect(lines(f.events)).toEqual(['son']);
  });

  it('preserves surrogate pairs across bounded re-encoding and the natural final line', async () => {
    const content = `${'a'.repeat(16_383)}😀son`;
    const f = fixture(sealed(content));
    await projectTaskOutput(f.service, f.input);
    expect(lines(f.events)).toEqual([content]);
  });

  it('does not infer a selected attempt or spawn from absent/denied/ambiguous/unreleased states', async () => {
    const states: TaskOutputReadResult[] = [
      { state: 'unavailable', reasonCode: 'admission-not-found' },
      { state: 'denied', reasonCode: 'tenant-mismatch' },
      { state: 'ambiguous', reasonCode: 'multiple-exact-attempts', candidateCount: 2 },
      { state: 'not-dispatched', identity, receiptDigest: digest, reasonCode: 'INVALID_INPUT' },
      { state: 'pending', phase: 'dispatch', identity, capability: null },
    ];
    for (const state of states) {
      const f = fixture(state);
      await expect(projectTaskOutput(f.service, f.input)).resolves.toEqual({ state: 'not-observed' });
      expect(f.service.observe).not.toHaveBeenCalled();
      expect(f.events).toHaveLength(1);
    }
  });

  it('keeps split UTF8/secret state independent across stdout and stderr; observer EOF is not DONE', async () => {
    const f = fixture(pending);
    f.service.observe = vi.fn(async (provided, input) => {
      expect(provided).toBe(capability);
      const bytes = Buffer.from('yağmurlu\n');
      await input.onChunk(bytes.subarray(0, 3), 'stdout');
      await input.onChunk(Buffer.from('stderr\n'), 'stderr');
      await input.onChunk(bytes.subarray(3), 'stdout');
      await input.onChunk(Buffer.from('natural-end'), 'stderr');
      return { state: 'closed', terminalMeaning: 'observer-only' };
    });
    await expect(projectTaskOutput(f.service, f.input)).resolves.toEqual({ state: 'live-view',
      observation: { state: 'closed', terminalMeaning: 'observer-only' } });
    expect(lines(f.events)).toEqual(['stderr', 'yağmurlu', 'natural-end']);
    expect(f.events.filter((event) => event.type === 'lines').map((event) => event.source))
      .toEqual(['live-stderr', 'live-stdout', 'live-stderr']);
    expect(JSON.stringify(f.events)).not.toMatch(/DONE|COMPLETE|"capability"/u);
  });

  it('does not turn an aborted/source-changed partial word into a completed line', async () => {
    for (const outcome of [{ state: 'aborted' } as const,
      { state: 'unavailable', reasonCode: 'custody-changed' } as const]) {
      const f = fixture(pending);
      f.service.observe = vi.fn(async (_capability, input) => {
        await input.onChunk(Buffer.from('complete\ncut-wo'), 'stdout');
        return outcome;
      });
      await projectTaskOutput(f.service, f.input);
      expect(lines(f.events)).toEqual(['complete']);
      expect(f.events.at(-1)).toEqual({ type: 'observation-end', result: outcome });
    }
  });

  it('flushes natural terminal units by observed source order, without a stdout-first bias', async () => {
    const f = fixture(pending);
    f.service.observe = vi.fn(async (_capability, input) => {
      await input.onChunk(Buffer.from('err'), 'stderr');
      await input.onChunk(Buffer.from('out'), 'stdout');
      return { state: 'closed', terminalMeaning: 'observer-only' };
    });
    await projectTaskOutput(f.service, f.input);
    expect(lines(f.events)).toEqual(['err', 'out']);
  });

  it('rejects excessive view requests before custody access and supports a zero-line sealed view', async () => {
    const f = fixture(sealed('hidden\n'), { tail: 101 });
    await expect(projectTaskOutput(f.service, f.input)).resolves.toEqual({ state: 'held', reason: 'invalid-view' });
    expect(f.service.read).not.toHaveBeenCalled();
    await expect(projectTaskOutput(f.service, { ...f.input, tail: 0 }))
      .resolves.toEqual({ state: 'sealed-view', omittedLines: 1 });
    expect(lines(f.events)).toEqual([]);
  });

  it('holds invalid/oversized live text after observer cleanup rather than leaking fragments', async () => {
    const f = fixture(pending);
    let cleanupObserved = false;
    f.service.observe = vi.fn(async (_capability, input) => {
      try { await input.onChunk(Uint8Array.of(0xff, 0x0a), 'stdout'); }
      catch { cleanupObserved = true; }
      return { state: 'unavailable', reasonCode: 'sink-failed' };
    });
    await expect(projectTaskOutput(f.service, f.input)).resolves.toEqual({ state: 'held', reason: 'invalid-utf8' });
    expect(cleanupObserved).toBe(true);
    expect(lines(f.events)).toEqual([]);
  });

  it('serializes the two backpressured surface writers and stops on a sink failure', async () => {
    const f = fixture(pending);
    let active = 0;
    let maximum = 0;
    const onEvent = vi.fn(async (event: TaskOutputProjectionEvent) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      if (event.type === 'lines') throw new Error('fixture connection closed');
    });
    f.service.observe = vi.fn(async (_capability, input) => {
      await Promise.allSettled([input.onChunk(Buffer.from('one\n'), 'stdout'), input.onChunk(Buffer.from('two\n'), 'stderr')]);
      return { state: 'unavailable', reasonCode: 'sink-failed' };
    });
    await expect(projectTaskOutput(f.service, { ...f.input, onEvent })).resolves.toEqual({ state: 'held', reason: 'sink-failed' });
    expect(maximum).toBe(1);
    expect(onEvent).toHaveBeenCalledTimes(2); // initial metadata + first failed line, no retry
  });
});
