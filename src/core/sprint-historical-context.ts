import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';

export const SPRINT_HISTORICAL_CONTEXT_ARTIFACT = 'docs/brain-sprint.md' as const;

export type SprintHistoricalContextHoldReason =
  | 'INVALID_REQUEST' | 'UNSAFE_PROJECT_ROOT' | 'UNSAFE_ARCHIVE_PATH'
  | 'MANIFEST_UNAVAILABLE' | 'MANIFEST_TOO_LARGE' | 'ARTIFACT_UNAVAILABLE'
  | 'ARTIFACT_TOO_LARGE' | 'ARCHIVE_VERIFICATION_FAILED'
  | 'TERMINAL_VERIFICATION_FAILED' | 'VERIFICATION_RESOURCE_LIMIT'
  | 'ARTIFACT_CHANGED' | 'INVALID_UTF8'
  | 'VERIFICATION_TIMEOUT' | 'ABORTED' | 'VERIFICATION_WORKER_FAILED';

export type SprintHistoricalContextResult =
  | { readonly kind: 'loaded'; readonly sprintId: string; readonly manifestDigest: string;
      readonly artifactPath: typeof SPRINT_HISTORICAL_CONTEXT_ARTIFACT;
      readonly sha256: string; readonly bytes: number; readonly text: string }
  | { readonly kind: 'hold'; readonly reasonCode: SprintHistoricalContextHoldReason };

export interface ReadVerifiedSprintHistoricalContextInput {
  readonly projectRoot: string;
  readonly sprintId: string;
  readonly maxBytes: number;
  readonly verificationTimeoutMs: number;
  readonly signal?: AbortSignal;
}

const SPRINT_ID = /^sprint-\d+$/u;
const MIN_VERIFICATION_RESOURCE_BYTES = 8 * 1024 * 1024;
const MAX_VERIFICATION_RESOURCE_BYTES = 256 * 1024 * 1024;

/**
 * Provider-free asynchronous adapter over the canonical archive verifiers.
 * Authorization is deliberately NOT inferred here: the Terminal ingress must
 * resolve principal/project/tenant admission before calling this integrity reader.
 */
export async function readVerifiedSprintHistoricalContext(
  input: ReadVerifiedSprintHistoricalContextInput,
): Promise<SprintHistoricalContextResult> {
  if (typeof input.projectRoot !== 'string' || input.projectRoot.trim() === ''
    || !SPRINT_ID.test(input.sprintId)
    || !Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1
    || !Number.isSafeInteger(input.verificationTimeoutMs) || input.verificationTimeoutMs < 1) {
    return { kind: 'hold', reasonCode: 'INVALID_REQUEST' };
  }
  if (input.signal?.aborted) return { kind: 'hold', reasonCode: 'ABORTED' };

  // maxBytes is the complete note payload budget. Canonical verification also
  // reads manifest/JSON/JSONL sidecars, so its separate worker budget has an
  // 8 MiB floor and a hard 256 MiB ceiling. A requested note budget above that
  // ceiling cannot be verified under this resource policy and fails honestly.
  if (input.maxBytes > MAX_VERIFICATION_RESOURCE_BYTES) {
    return { kind: 'hold', reasonCode: 'VERIFICATION_RESOURCE_LIMIT' };
  }

  const resourceBytes = Math.min(
    Math.max(input.maxBytes * 2, MIN_VERIFICATION_RESOURCE_BYTES),
    MAX_VERIFICATION_RESOURCE_BYTES,
  );
  let worker: Worker;
  try {
    worker = new Worker(new URL('./sprint-historical-context-worker.js', import.meta.url), {
      workerData: {
        projectRoot: input.projectRoot,
        sprintId: input.sprintId,
        maxBytes: input.maxBytes,
        verificationResourceBytes: resourceBytes,
        artifactPath: SPRINT_HISTORICAL_CONTEXT_ARTIFACT,
      },
      resourceLimits: { maxOldGenerationSizeMb: Math.ceil(resourceBytes / (1024 * 1024)) + 32 },
    });
  } catch {
    return { kind: 'hold', reasonCode: 'VERIFICATION_WORKER_FAILED' };
  }
  if (input.signal?.aborted) {
    try {
      await worker.terminate();
      return { kind: 'hold', reasonCode: 'ABORTED' };
    } catch {
      return { kind: 'hold', reasonCode: 'VERIFICATION_WORKER_FAILED' };
    }
  }
  return await new Promise<SprintHistoricalContextResult>((resolveResult) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const deadline = performance.now() + input.verificationTimeoutMs;
    const finish = (result: SprintHistoricalContextResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener('abort', onAbort);
      void worker.terminate().then(
        () => resolveResult(result),
        () => resolveResult({ kind: 'hold', reasonCode: 'VERIFICATION_WORKER_FAILED' }),
      );
    };
    const onAbort = (): void => finish({ kind: 'hold', reasonCode: 'ABORTED' });
    const armDeadline = (): void => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) { finish({ kind: 'hold', reasonCode: 'VERIFICATION_TIMEOUT' }); return; }
      timer = setTimeout(armDeadline, Math.min(remaining, 2_147_483_647));
      timer.unref();
    };
    armDeadline();
    input.signal?.addEventListener('abort', onAbort, { once: true });
    worker.once('message', (result: SprintHistoricalContextResult) => finish(result));
    worker.once('error', () => finish({ kind: 'hold', reasonCode: 'VERIFICATION_WORKER_FAILED' }));
    worker.once('exit', () => {
      if (!settled) finish({ kind: 'hold', reasonCode: 'VERIFICATION_WORKER_FAILED' });
    });
  });
}
