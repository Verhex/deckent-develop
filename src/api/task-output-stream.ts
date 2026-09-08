import type { IncomingMessage, ServerResponse } from 'node:http';
import { createExactDockerTaskOutputReadService } from '../orchestra/spawn-backend-docker.js';
import {
  projectTaskOutput,
  type TaskOutputProjectionEvent,
  type TaskOutputProjectionResult,
} from '../core/task-output-projection.js';
import type { TaskOutputReadService } from '../core/task-output-read-service.js';
import {
  readTaskOutputViewPolicy,
  TaskOutputViewPolicyError,
  type TaskOutputViewPolicy,
} from '../core/task-output-view-policy.js';
import { validateTaskId } from '../core/validators.js';

const OUTPUT_STREAM_DEFAULT_TAIL = 50;
const DISPATCH_REQUEST_ID = /^dreq-[a-f0-9]{64}$/u;
const SELECTOR = /^[A-Za-z0-9._:-]+$/u;

export type TaskOutputStreamSseEvent =
  | 'output-state'
  | 'output-lines'
  | 'output-observation-end'
  | 'output-view-end';

export interface TaskOutputStreamContext {
  readonly projectRoot: string;
  readonly projectId: string;
  readonly principal: { readonly id: string; readonly tenantId?: string };
  readonly allowedOrigin: string;
  readonly redactionLabel: string;
  /** The worker-log route supplies its already path-validated exact task id. */
  readonly routeTaskId?: string;
}

export interface TaskOutputStreamDependencies {
  readonly createService?: (projectRoot: string) => TaskOutputReadService;
  readonly readPolicy?: (projectRoot: string) => TaskOutputViewPolicy;
}

type ParsedRequest = {
  readonly taskId: string;
  readonly sprintId?: string;
  readonly attemptId?: string;
  readonly dispatchRequestId?: string;
  readonly tail: number;
  readonly follow: boolean;
};

function single(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name);
  return values.length === 0 ? undefined : values.length === 1 ? values[0] : null;
}

function safeSelector(value: string | null | undefined): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 16_384
    && SELECTOR.test(value);
}

function parseRequest(req: IncomingMessage, routeTaskId: string | undefined): ParsedRequest | null {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const taskId = single(url.searchParams, 'taskId');
  const sprintId = single(url.searchParams, 'sprintId');
  const attemptId = single(url.searchParams, 'attemptId');
  const dispatchRequestId = single(url.searchParams, 'dispatchRequestId');
  const tailRaw = single(url.searchParams, 'tail');
  const followRaw = single(url.searchParams, 'follow');
  if (taskId === null || sprintId === null || attemptId === null
    || dispatchRequestId === null || tailRaw === null || followRaw === null) return null;
  if (routeTaskId !== undefined && taskId !== undefined && taskId !== routeTaskId) return null;
  const effectiveTaskId = routeTaskId ?? taskId;
  try {
    if (effectiveTaskId === undefined || validateTaskId(effectiveTaskId) !== effectiveTaskId) return null;
  } catch {
    return null;
  }
  if ((sprintId !== undefined && !safeSelector(sprintId))
    || (attemptId !== undefined && !safeSelector(attemptId))
    || (dispatchRequestId !== undefined && !DISPATCH_REQUEST_ID.test(dispatchRequestId))) return null;
  const tail = tailRaw === undefined ? OUTPUT_STREAM_DEFAULT_TAIL
    : /^\d+$/u.test(tailRaw) ? Number(tailRaw) : Number.NaN;
  if (!Number.isSafeInteger(tail) || tail < 0) return null;
  if (followRaw !== undefined && followRaw !== 'true' && followRaw !== 'false') return null;
  return {
    taskId: effectiveTaskId,
    ...(sprintId !== undefined ? { sprintId } : {}),
    ...(attemptId !== undefined ? { attemptId } : {}),
    ...(dispatchRequestId !== undefined ? { dispatchRequestId } : {}),
    tail,
    follow: followRaw === undefined || followRaw === 'true',
  };
}

function sendMachineError(res: ServerResponse, status: number, code: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code }));
}

function eventName(event: TaskOutputProjectionEvent): TaskOutputStreamSseEvent {
  if (event.type === 'state') return 'output-state';
  if (event.type === 'lines') return 'output-lines';
  return 'output-observation-end';
}

function eventBody(event: TaskOutputProjectionEvent): unknown {
  if (event.type === 'state' || event.type === 'observation-end') return event.result;
  return event;
}

async function writeSse(
  req: IncomingMessage,
  res: ServerResponse,
  controller: AbortController,
  event: TaskOutputStreamSseEvent,
  body: unknown,
): Promise<void> {
  if (controller.signal.aborted || res.destroyed || res.writableEnded) throw new Error('sse closed');
  const frame = `event: ${event}\ndata: ${JSON.stringify(body)}\n\n`;
  if (res.write(frame)) return;
  await new Promise<void>((resolve, reject) => {
    const done = (): void => {
      res.off('drain', onDrain);
      res.off('close', onClosed);
      res.off('error', onError);
      req.off('aborted', onClosed);
    };
    const onDrain = (): void => { done(); resolve(); };
    const onClosed = (): void => { done(); controller.abort(); reject(new Error('sse closed')); };
    const onError = (): void => { done(); controller.abort(); reject(new Error('sse write failed')); };
    res.once('drain', onDrain);
    res.once('close', onClosed);
    res.once('error', onError);
    req.once('aborted', onClosed);
  });
}

/**
 * The shared HTTP projection for both output routes. It has no legacy-log
 * fallback: callers receive exact custody state, sanitized line units, and an
 * observer-only end record. Disconnecting aborts only the log observer.
 */
export async function handleTaskOutputStream(
  req: IncomingMessage,
  res: ServerResponse,
  context: TaskOutputStreamContext,
  dependencies: TaskOutputStreamDependencies = {},
): Promise<void> {
  const parsed = parseRequest(req, context.routeTaskId);
  if (parsed === null) {
    sendMachineError(res, 400, 'OUTPUT_VIEW_INVALID');
    return;
  }

  let policy: TaskOutputViewPolicy;
  try {
    policy = (dependencies.readPolicy ?? readTaskOutputViewPolicy)(context.projectRoot);
  } catch (error) {
    if (error instanceof TaskOutputViewPolicyError) {
      sendMachineError(res, 503, 'OUTPUT_VIEW_UNAVAILABLE');
      return;
    }
    sendMachineError(res, 503, 'OUTPUT_VIEW_UNAVAILABLE');
    return;
  }
  if (parsed.tail > policy.limits.maxTailLines) {
    sendMachineError(res, 400, 'OUTPUT_VIEW_INVALID');
    return;
  }

  let service: TaskOutputReadService;
  try {
    service = (dependencies.createService ?? createExactDockerTaskOutputReadService)(context.projectRoot);
  } catch {
    sendMachineError(res, 503, 'OUTPUT_VIEW_UNAVAILABLE');
    return;
  }

  const controller = new AbortController();
  const close = (): void => controller.abort();
  req.once('aborted', close);
  res.once('close', close);
  res.once('error', close);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': context.allowedOrigin,
  });

  let result: TaskOutputProjectionResult | undefined;
  try {
    // The custody ingress accepts only its two caller keys.  Request principals
    // deliberately carry additional auth provenance (role/claims verification),
    // which must not widen this strict, getter-free transport record.
    const caller = {
      id: context.principal.id,
      ...(context.principal.tenantId !== undefined ? { tenantId: context.principal.tenantId } : {}),
    };
    result = await projectTaskOutput(service, {
      query: {
        projectId: context.projectId,
        taskId: parsed.taskId,
        caller,
        strictTenantIsolation: policy.strictTenantIsolation,
        ...(parsed.sprintId !== undefined ? { sprintId: parsed.sprintId } : {}),
        ...(parsed.attemptId !== undefined ? { attemptId: parsed.attemptId } : {}),
        ...(parsed.dispatchRequestId !== undefined ? { dispatchRequestId: parsed.dispatchRequestId } : {}),
      },
      tail: parsed.tail,
      follow: parsed.follow,
      signal: controller.signal,
      limits: policy.limits,
      redactionLabel: context.redactionLabel,
      onEvent: async (event) => writeSse(req, res, controller, eventName(event), eventBody(event)),
    });
    if (!controller.signal.aborted) {
      await writeSse(req, res, controller, 'output-view-end', result);
    }
  } finally {
    req.off('aborted', close);
    res.off('close', close);
    res.off('error', close);
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}
