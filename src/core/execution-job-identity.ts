import { randomUUID } from 'node:crypto';

/** Detached execution jobs have their own namespace; they are not sprint IDs. */
export function createExecutionJobId(
  now: () => number = Date.now,
  uuid: () => string = randomUUID,
): string {
  return `job-${String(now()).padStart(13, '0')}-${uuid()}`;
}

/**
 * Extract ordering time from current job IDs and the legacy timestamp-shaped
 * sprint IDs that were historically used for detached jobs.
 */
export function executionJobTimestamp(fileName: string): number {
  const current = fileName.match(/^job-(\d{13})-[0-9a-f-]+\.json$/i);
  if (current?.[1]) return Number(current[1]);
  const legacy = fileName.match(/^sprint-(\d{13})\.json$/);
  if (legacy?.[1]) return Number(legacy[1]);
  return 0;
}
