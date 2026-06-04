import { writeEvent } from '../event-stream.js';
import type { AuditSink, AuditRecord } from '../autonomous-runtime.js';

const AUDIT_CHANNEL = 'AUTONOMOUS:AUDIT';

/**
 * Build an AuditSink that persists every AuditRecord as a structured event
 * via event-stream.writeEvent.
 *
 * @param projectRoot - Project root directory (passed through to writeEvent)
 * @param sprintId    - Sprint identifier; defaults to 'autonomous'
 */
export function makeAuditSink(projectRoot: string, sprintId: string = 'autonomous'): AuditSink {
  return {
    record(record: AuditRecord): void {
      writeEvent(projectRoot, sprintId, 'deckent', '*', AUDIT_CHANNEL, {
        triggerId: record.triggerId,
        action: record.action,
        requestedBy: record.requestedBy,
        outcome: record.outcome,
        reason: record.reason,
        timestamp: record.timestamp,
      });
    },
  };
}
