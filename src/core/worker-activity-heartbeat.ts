import { z } from 'zod';

export const WORKER_ACTIVITY_HEARTBEAT_VERSION = 1 as const;
export const WORKER_ACTIVITY_HEARTBEAT_KIND = 'worker-activity-heartbeat' as const;
export const WORKER_ACTIVITY_BACKENDS = ['docker', 'tmux', 'subprocess'] as const;

const nonBlankString = z.string().trim().min(1);
const canonicalTimestamp = z.string().refine(value => {
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}, { message: 'observedAt must be a canonical UTC ISO-8601 timestamp' });

/** Worker-authored activity only; never process or completion authority. */
export const workerActivityHeartbeatSchema = z.object({
  version: z.literal(WORKER_ACTIVITY_HEARTBEAT_VERSION),
  kind: z.literal(WORKER_ACTIVITY_HEARTBEAT_KIND),
  taskId: nonBlankString,
  workerId: nonBlankString,
  attemptId: nonBlankString,
  backend: z.enum(WORKER_ACTIVITY_BACKENDS),
  status: nonBlankString,
  currentAction: nonBlankString,
  observedAt: canonicalTimestamp,
}).strict();

export type WorkerActivityBackend = (typeof WORKER_ACTIVITY_BACKENDS)[number];
export type WorkerActivityHeartbeat = z.infer<typeof workerActivityHeartbeatSchema>;

export interface WorkerActivityHeartbeatInput {
  readonly taskId: string;
  readonly workerId: string;
  readonly attemptId: string;
  readonly backend: WorkerActivityBackend;
  readonly status: string;
  readonly currentAction: string;
  readonly observedAt?: string;
}

export type WorkerActivityHeartbeatHoldReason =
  | 'LEGACY_SHAPE'
  | 'AMBIGUOUS_LEGACY_IDENTITY'
  | 'MALFORMED';

export interface WorkerActivityHeartbeatHold {
  readonly state: 'HOLD';
  readonly reasonCode: WorkerActivityHeartbeatHoldReason;
  readonly detail: string;
}

export type WorkerActivityHeartbeatParseResult =
  | { readonly state: 'VALID'; readonly heartbeat: WorkerActivityHeartbeat }
  | WorkerActivityHeartbeatHold;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLegacyShape(value: Record<string, unknown>): boolean {
  return ['timestamp', 'sequence', 'progress', 'filesChangedCount', 'pid']
    .some(key => key in value);
}

export function createWorkerActivityHeartbeat(
  input: WorkerActivityHeartbeatInput,
  clock: () => Date = () => new Date(),
): WorkerActivityHeartbeat {
  return workerActivityHeartbeatSchema.parse({
    version: WORKER_ACTIVITY_HEARTBEAT_VERSION,
    kind: WORKER_ACTIVITY_HEARTBEAT_KIND,
    taskId: input.taskId,
    workerId: input.workerId,
    attemptId: input.attemptId,
    backend: input.backend,
    status: input.status,
    currentAction: input.currentAction,
    observedAt: input.observedAt ?? clock().toISOString(),
  });
}

/** The only wire serializer used by native workers and prompt instructions. */
export function serializeWorkerActivityHeartbeat(
  heartbeat: WorkerActivityHeartbeat,
): string {
  const validated = workerActivityHeartbeatSchema.parse(heartbeat);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

/** Legacy data is held, never upgraded by guessing identity from its filename. */
export function parseWorkerActivityHeartbeat(
  raw: unknown,
): WorkerActivityHeartbeatParseResult {
  const parsed = workerActivityHeartbeatSchema.safeParse(raw);
  if (parsed.success) return { state: 'VALID', heartbeat: parsed.data };
  if (!isRecord(raw)) {
    return { state: 'HOLD', reasonCode: 'MALFORMED', detail: 'heartbeat must be a JSON object' };
  }
  if (isLegacyShape(raw)) {
    const hasAttempt = typeof raw['attemptId'] === 'string'
      && raw['attemptId'].trim().length > 0;
    const hasBackend = WORKER_ACTIVITY_BACKENDS.includes(
      raw['backend'] as WorkerActivityBackend,
    );
    return {
      state: 'HOLD',
      reasonCode: hasAttempt && hasBackend
        ? 'LEGACY_SHAPE'
        : 'AMBIGUOUS_LEGACY_IDENTITY',
      detail: hasAttempt && hasBackend
        ? 'legacy authority/progress fields are not activity schema v1'
        : 'legacy heartbeat lacks explicit attemptId or backend identity',
    };
  }
  return {
    state: 'HOLD',
    reasonCode: 'MALFORMED',
    detail: parsed.error.issues.map(issue => issue.message).join('; '),
  };
}

/** Prompt projection of the same contract; compilation never invents its clock. */
export function renderWorkerActivityHeartbeatInstruction(
  identity: Omit<WorkerActivityHeartbeatInput, 'status' | 'currentAction' | 'observedAt'>,
): string {
  const example = {
    version: WORKER_ACTIVITY_HEARTBEAT_VERSION,
    kind: WORKER_ACTIVITY_HEARTBEAT_KIND,
    ...identity,
    status: 'EXECUTING',
    currentAction: '<short current action>',
    observedAt: '<current UTC ISO-8601 timestamp>',
  };
  return [
    'Create the heartbeat ONCE using worker activity heartbeat schema v1:',
    '```json',
    JSON.stringify(example, null, 2),
    '```',
    'Replace both angle-bracket placeholders before writing.',
    'Write exactly this activity-only shape in one filesystem write.',
    'Do not add sequence, progress, PID, process-liveness, or verdict fields.',
  ].join('\n');
}
