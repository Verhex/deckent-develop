// ═══ Panic Kill Guard ════════════════════════════════════════════════════════
// Sprint 143: Runtime panic → worker kill requires user approval (Alperen rule).
// Default behavior: BLOCK kill. Override: --force --user-explicit CLI flags.
// Panic events logged to .deckent/<sprint-id>-panic-*.json for forensic review.
// Integrates with NotifyDispatcher for immediate user notification.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { debugLog } from './utils.js';
import { DECKENT_DIR } from './constants.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PanicReason =
  | 'stale_heartbeat'
  | 'grace_period_timeout'
  | 'runtime_error'
  | 'unresponsive_worker';

export interface PanicEvent {
  taskId: string;
  workerId: string;
  sprintId: string;
  reason: PanicReason;
  timestamp: string;
  blocked: boolean;
  details?: string;
}

export interface PanicKillOptions {
  /** Force kill without user approval */
  force?: boolean;
  /** Explicit user confirmation flag (must be combined with force) */
  userExplicit?: boolean;
}

export type PanicGuardDecision = 'BLOCK' | 'ALLOW';

// ─── PanicGuard ─────────────────────────────────────────────────────────────

export class PanicGuard {
  private events: PanicEvent[] = [];
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Evaluate whether a worker kill should proceed.
   * Returns BLOCK by default (safe). Returns ALLOW only when:
   * - force AND userExplicit are both true
   */
  evaluate(
    taskId: string,
    workerId: string,
    sprintId: string,
    reason: PanicReason,
    opts?: PanicKillOptions,
    details?: string,
  ): PanicGuardDecision {
    const isAllowed = opts?.force === true && opts?.userExplicit === true;
    const decision: PanicGuardDecision = isAllowed ? 'ALLOW' : 'BLOCK';

    const event: PanicEvent = {
      taskId,
      workerId,
      sprintId,
      reason,
      timestamp: new Date().toISOString(),
      blocked: decision === 'BLOCK',
      details,
    };

    this.events.push(event);
    this.writePanicLog(event);

    if (decision === 'BLOCK') {
      debugLog('panic-guard', `BLOCKED kill for task ${taskId} (reason: ${reason}). Use --force --user-explicit to override.`);
    } else {
      debugLog('panic-guard', `ALLOWED kill for task ${taskId} (reason: ${reason}, user-explicit override).`);
    }

    return decision;
  }

  /**
   * Write panic event to JSON log file.
   * File: .deckent/<sprint-id>-panic-<timestamp>.json
   */
  private writePanicLog(event: PanicEvent): void {
    try {
      const deckentDir = join(this.projectRoot, DECKENT_DIR);
      mkdirSync(deckentDir, { recursive: true });
      const safeTimestamp = event.timestamp.replace(/[:.]/g, '-');
      const filename = `${event.sprintId}-panic-${safeTimestamp}.json`;
      const logPath = join(deckentDir, filename);
      writeFileSync(logPath, JSON.stringify(event, null, 2) + '\n', 'utf-8');
    } catch (err) {
      debugLog('panic-guard', `Failed to write panic log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get all recorded panic events.
   */
  getEvents(): readonly PanicEvent[] {
    return this.events;
  }

  /**
   * Get events for a specific sprint.
   */
  getSprintEvents(sprintId: string): PanicEvent[] {
    return this.events.filter(e => e.sprintId === sprintId);
  }

  /**
   * Build a notification payload for a panic event.
   * Compatible with NotifyDispatcher's Notification interface.
   */
  buildNotification(event: PanicEvent): {
    priority: 'critical';
    event: 'human-checkpoint-required';
    title: string;
    summary: string;
    details: string;
    sprintId: string;
    timestamp: string;
  } {
    return {
      priority: 'critical',
      event: 'human-checkpoint-required',
      title: `Panic Kill Guard: Worker ${event.taskId} blocked`,
      summary: `Runtime panic detected (${event.reason}). Worker kill blocked — user approval required.`,
      details: event.details ?? `Task: ${event.taskId}, Worker: ${event.workerId}, Reason: ${event.reason}`,
      sprintId: event.sprintId,
      timestamp: event.timestamp,
    };
  }
}
