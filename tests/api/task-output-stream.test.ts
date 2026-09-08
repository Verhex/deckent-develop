import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import {
  handleTaskOutputStream,
  type TaskOutputStreamContext,
} from '../../src/api/task-output-stream.js';
import type { TaskOutputReadCapability, TaskOutputReadService } from '../../src/core/task-output-read-service.js';
import { TaskOutputViewPolicyError, type TaskOutputViewPolicy } from '../../src/core/task-output-view-policy.js';
import { startTestServer } from './test-server-helper.js';

const digest = `sha256:${'a'.repeat(64)}` as const;
const capability = Object.freeze({}) as TaskOutputReadCapability;
const policy: TaskOutputViewPolicy = {
  strictTenantIsolation: true,
  limits: {
    maxPendingBytes: 1024,
    maxTailLines: 100,
    maxTailBytes: 4096,
    termGraceMs: 5,
    reapObservationMs: 5,
    streamCloseMs: 20,
  },
};
const context: TaskOutputStreamContext = {
  projectRoot: '/trusted/project',
  projectId: 'project-derived',
  principal: { id: 'principal-derived', tenantId: 'tenant-derived' },
  allowedOrigin: 'http://localhost:5173',
  redactionLabel: '[private withheld]',
};

function request(url: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  Object.assign(req, { method: 'GET', url, headers: {} });
  return req;
}

function response(backpressured = false): ServerResponse & { readonly frames: string[]; status: number; ended: boolean } {
  const res = new EventEmitter() as ServerResponse & { frames: string[]; status: number; ended: boolean };
  res.frames = [];
  res.status = 200;
  res.ended = false;
  res.destroyed = false;
  res.writableEnded = false;
  res.writeHead = vi.fn((status: number) => { res.status = status; return res; }) as unknown as ServerResponse['writeHead'];
  let first = backpressured;
  res.write = vi.fn((frame: string) => {
    res.frames.push(frame);
    if (!first) return true;
    first = false;
    queueMicrotask(() => res.emit('drain'));
    return false;
  }) as unknown as ServerResponse['write'];
  res.end = vi.fn(() => { res.ended = true; res.writableEnded = true; return res; }) as unknown as ServerResponse['end'];
  return res;
}

function readService(overrides: Partial<TaskOutputReadService> = {}): TaskOutputReadService {
  return {
    read: vi.fn(() => ({
      state: 'sealed',
      identity: {
        projectId: 'project-derived', taskId: 'task-1', sprintId: 'sprint-1', attemptId: 'attempt-1',
        generation: 1, dispatchRequestId: `dreq-${'b'.repeat(64)}`, tenantId: 'tenant-derived', provider: 'provider', model: 'model',
      },
      capability,
      source: 'pristine-provider-stream',
      encoding: 'utf8',
      content: 'safe\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n',
      receiptDigest: digest,
      contentSha256: digest,
      byteLength: 64,
      capturedAt: '2026-09-09T00:00:00Z',
      providerExitReceiptDigest: digest,
    })),
    observe: vi.fn(async () => ({ state: 'closed', terminalMeaning: 'observer-only' })),
    ...overrides,
  } as TaskOutputReadService;
}

function frameBody(frames: readonly string[], event: string): unknown[] {
  return frames
    .filter((frame) => frame.startsWith(`event: ${event}\n`))
    .map((frame) => JSON.parse(frame.split('data: ')[1]!.trim()) as unknown);
}

function dependencies(service: TaskOutputReadService) {
  return { createService: vi.fn(() => service), readPolicy: vi.fn(() => policy) };
}

describe('exact task-output SSE projection', () => {
  it('writes canonical public SSE bodies with no capability/content or task-DONE inference', async () => {
    const req = request('/api/output-stream?taskId=task-1&tail=2&follow=false');
    const res = response();
    const service = readService();

    await handleTaskOutputStream(req, res, context, dependencies(service));

    const state = frameBody(res.frames, 'output-state')[0] as Record<string, unknown>;
    const lines = frameBody(res.frames, 'output-lines')[0] as Record<string, unknown>;
    expect(state).not.toHaveProperty('capability');
    expect(state).not.toHaveProperty('content');
    expect(lines).toMatchObject({ type: 'lines', source: 'pristine-provider-stream', redacted: true });
    expect(JSON.stringify(lines)).not.toContain('secret');
    expect(frameBody(res.frames, 'output-observation-end')).toEqual([]);
    expect(frameBody(res.frames, 'output-view-end')).toEqual([{ state: 'sealed-view', omittedLines: 0 }]);
    expect(JSON.stringify(res.frames)).not.toMatch(/DONE|COMPLETE|event: done/u);
    expect(res.ended).toBe(true);
  });

  it('passes only derived project/principal plus validated exact selectors to the shared read service', async () => {
    const req = request(`/api/output-stream?taskId=task-1&sprintId=sprint-1&attemptId=attempt-1&dispatchRequestId=dreq-${'b'.repeat(64)}&tail=0`);
    const res = response();
    const service = readService();

    await handleTaskOutputStream(req, res, context, dependencies(service));

    expect(service.read).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-derived',
      taskId: 'task-1',
      sprintId: 'sprint-1',
      attemptId: 'attempt-1',
      caller: { id: 'principal-derived', tenantId: 'tenant-derived' },
      strictTenantIsolation: true,
    }));
  });

  it("projects a rich authenticated principal to the custody caller's exact own-key contract", async () => {
    const req = request('/api/output-stream?taskId=task-1');
    const res = response();
    const service = readService();
    const authenticatedContext = {
      ...context,
      principal: {
        id: 'principal-derived',
        tenantId: 'tenant-derived',
        role: 'admin',
        claimsVerified: true,
      },
    } as TaskOutputStreamContext;

    await handleTaskOutputStream(req, res, authenticatedContext, dependencies(service));

    const query = (service.read as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      caller: Record<string, unknown>;
    };
    expect(query.caller).toEqual({ id: 'principal-derived', tenantId: 'tenant-derived' });
    expect(Object.keys(query.caller).sort()).toEqual(['id', 'tenantId']);
  });

  it('rejects malformed, mismatched, and policy-over-limit requests before service construction', async () => {
    for (const url of [
      '/api/output-stream?taskId=../../etc',
      '/api/output-stream?taskId=task-1&taskId=task-2',
      '/api/output-stream?taskId=task-1&tail=01x',
      '/api/output-stream?taskId=task-1&tail=101',
    ]) {
      const res = response();
      const factory = vi.fn(() => readService());
      await handleTaskOutputStream(request(url), res, context, { createService: factory, readPolicy: () => policy });
      expect(res.status).toBe(400);
      expect(res.frames).toEqual([]);
      expect(factory).not.toHaveBeenCalled();
      expect((res.end as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    }
    const res = response();
    await handleTaskOutputStream(request('/api/workers/task-1/logs/stream?taskId=task-2'), res, {
      ...context,
      routeTaskId: 'task-1',
    }, dependencies(readService()));
    expect(res.status).toBe(400);
  });

  it('surfaces foreign, ambiguous, and not-dispatched custody states without observation', async () => {
    for (const read of [
      { state: 'denied' as const, reasonCode: 'tenant-mismatch' as const },
      { state: 'ambiguous' as const, reasonCode: 'multiple-exact-attempts' as const, candidateCount: 2 },
      { state: 'unavailable' as const, reasonCode: 'custody-read-hold' as const },
      { state: 'not-dispatched' as const, identity: { projectId: 'project-derived', taskId: 'task-1', sprintId: 'sprint-1', attemptId: 'attempt-1', generation: 1, dispatchRequestId: `dreq-${'b'.repeat(64)}`, tenantId: 'tenant-derived', provider: 'provider', model: 'model' }, receiptDigest: digest, reasonCode: 'INVALID_INPUT' as const },
    ]) {
      const service = readService({ read: vi.fn(() => read) });
      const res = response();
      await handleTaskOutputStream(request('/api/output-stream?taskId=task-1'), res, context, dependencies(service));
      expect(service.observe).not.toHaveBeenCalled();
      expect(frameBody(res.frames, 'output-state')).toEqual([read]);
      expect(frameBody(res.frames, 'output-view-end')).toEqual([{ state: 'not-observed' }]);
    }
  });

  it('returns a machine unavailable code for unreadable or invalid view policy without service construction', async () => {
    const res = response();
    const factory = vi.fn(() => readService());

    await handleTaskOutputStream(request('/api/output-stream?taskId=task-1'), res, context, {
      createService: factory,
      readPolicy: () => { throw new TaskOutputViewPolicyError('CONFIG_INVALID'); },
    });

    expect(res.status).toBe(503);
    expect(res.frames).toEqual([]);
    expect(factory).not.toHaveBeenCalled();
    expect((res.end as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('{"code":"OUTPUT_VIEW_UNAVAILABLE"}');
  });

  it('awaits SSE drain and closes only the observer view on client disconnect', async () => {
    const res = response(true);
    const req = request('/api/output-stream?taskId=task-1');
    const service = readService({
      read: vi.fn(() => ({
        state: 'pending',
        phase: 'provider-exit',
        capability,
        identity: { projectId: 'project-derived', taskId: 'task-1', sprintId: 'sprint-1', attemptId: 'attempt-1', generation: 1, dispatchRequestId: `dreq-${'b'.repeat(64)}`, tenantId: 'tenant-derived', provider: 'provider', model: 'model' },
      })),
      observe: vi.fn(async (_capability, input) => {
        res.emit('close');
        expect(input.signal.aborted).toBe(true);
        return { state: 'aborted' };
      }),
    });

    await handleTaskOutputStream(req, res, context, dependencies(service));

    expect(res.write).toHaveBeenCalled();
    expect(frameBody(res.frames, 'output-view-end')).toEqual([]);
    expect(JSON.stringify(res.frames)).not.toMatch(/DONE|COMPLETE|event: done/u);
  });

  it('keeps an observer closure distinct from task completion', async () => {
    const service = readService({
      read: vi.fn(() => ({
        state: 'pending', phase: 'provider-exit', capability,
        identity: { projectId: 'project-derived', taskId: 'task-1', sprintId: 'sprint-1', attemptId: 'attempt-1', generation: 1, dispatchRequestId: `dreq-${'b'.repeat(64)}`, tenantId: 'tenant-derived', provider: 'provider', model: 'model' },
      })),
      observe: vi.fn(async (_capability, input) => {
        await input.onChunk(Buffer.from('live\n'), 'stdout');
        return { state: 'closed', terminalMeaning: 'observer-only' };
      }),
    });
    const res = response();

    await handleTaskOutputStream(request('/api/output-stream?taskId=task-1'), res, context, dependencies(service));

    expect(frameBody(res.frames, 'output-observation-end')).toEqual([{ state: 'closed', terminalMeaning: 'observer-only' }]);
    expect(frameBody(res.frames, 'output-view-end')).toEqual([{
      state: 'live-view', observation: { state: 'closed', terminalMeaning: 'observer-only' },
    }]);
  });

  it('selects the registered shared projection route for both legacy URL shapes', async () => {
    const server = await startTestServer({ disableAuth: true });
    try {
      for (const path of [
        '/api/output-stream?taskId=task-1',
        '/api/workers/task-1/logs/stream',
      ]) {
        const response = await fetch(`${server.baseUrl}${path}`);
        const body = await response.text();
        expect(response.status).toBe(200);
        expect(body).toContain('event: output-state');
        expect(body).toContain('event: output-view-end');
        expect(body).not.toContain('event: log_backfill');
        expect(body).not.toContain('event: done');
      }
    } finally {
      await server.close();
    }
  });
});
