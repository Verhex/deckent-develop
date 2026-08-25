/**
 * Conservative retention for RunFlow compatibility journals.
 *
 * SQLite remains the canonical current authority.  This module only retires a
 * per-flow event projection after publishing its exact bytes to the immutable
 * maintenance archive.  Decisions are reconstructed from a fresh canonical
 * read on every invocation; caller-supplied liveness can widen eligibility but
 * can never make malformed or ambiguous authority disposable.
 */
import { existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { DeckentError } from './errors.js';
import {
  publishMaintenanceArchive,
  type MaintenanceArchivePublication,
} from './maintenance-archive.js';
import type { RunFlowEvent } from './run-flow-contract.js';
import {
  listFlowIds,
  loadApprovedSnapshot,
  loadLatestStartAttempt,
  loadPlannedSprint,
  readFlowEvents,
} from './run-flow-store.js';

const RUN_FLOW_STORE_RELATIVE = '.deckent/runtime/run-flow-store';
const DEFAULT_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1_000;

export type RunFlowRetentionHoldReason =
  | 'live-authority'
  | 'resumable-authority'
  | 'ambiguous-authority'
  | 'not-stale'
  | 'liveness-unproven'
  | 'liveness-lineage-mismatch'
  | 'malformed-journal'
  | 'journal-projection-absent';

export interface RunFlowLivenessEvidence {
  readonly flowId: string;
  readonly state: 'live' | 'dead' | 'unknown';
  readonly observedAt: string;
  /** Freshness fence: evidence is valid only for this exact canonical head. */
  readonly eventHead: number;
  readonly revision: number;
  readonly planDigest?: string;
}

export interface RunFlowRetentionOptions {
  readonly now?: Date;
  readonly staleAfterMs?: number;
  readonly archiveRoot?: string;
  readonly liveness?: readonly RunFlowLivenessEvidence[];
}

export interface RunFlowRetentionArchive {
  readonly flowId: string;
  readonly revision: number;
  readonly planDigest?: string;
  readonly eventHead: number;
  readonly reason: 'terminal' | 'stale-dead';
  readonly publication: MaintenanceArchivePublication;
}

export interface RunFlowRetentionHold {
  readonly flowId: string;
  readonly reason: RunFlowRetentionHoldReason;
}

export interface RunFlowRetentionResult {
  readonly archived: readonly RunFlowRetentionArchive[];
  readonly held: readonly RunFlowRetentionHold[];
  readonly failures: readonly { readonly flowId: string; readonly error: string }[];
}

interface JournalAuthority {
  readonly revision: number;
  readonly planDigest?: string;
  readonly eventHead: number;
  readonly updatedAt: number;
  readonly terminal: boolean;
  readonly resumable: boolean;
  readonly running: boolean;
}

function portable(path: string): string {
  return path.split(sep).join('/');
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function positiveRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validate rather than trusting the store's structurally typed JSON parse. */
function journalAuthority(flowId: string, events: readonly RunFlowEvent[]): JournalAuthority | undefined {
  if (events.length === 0) return undefined;
  let revision: number | undefined;
  let planDigest: string | undefined;
  let updatedAt = 0;
  let expectedSequence = 1;
  let terminal = false;
  let resumable = false;
  let running = false;
  let phase: 'empty' | 'proposed' | 'previewing' | 'awaiting-approval' | 'approved' | 'starting' | 'running' = 'empty';

  for (const event of events) {
    if (!event || event.schemaVersion !== 1 || event.flowId !== flowId
      || event.sequence !== expectedSequence || !validTimestamp(event.timestamp)
      || !nonEmpty(event.type)) return undefined;
    expectedSequence += 1;
    updatedAt = Date.parse(event.timestamp);
    switch (event.type) {
      case 'PROPOSAL_SUBMITTED':
        if (phase !== 'empty' || !event.proposal || event.proposal.flowId !== flowId
          || !positiveRevision(event.proposal.revision)) return undefined;
        revision = event.proposal.revision;
        phase = 'proposed';
        break;
      case 'PREVIEW_STARTED':
        if (phase !== 'proposed' || !positiveRevision(event.revision) || event.revision !== revision) return undefined;
        phase = 'previewing';
        break;
      case 'PREVIEW_READY':
        if (phase !== 'previewing' || !event.preview || event.preview.flowId !== flowId
          || !positiveRevision(event.preview.revision) || event.preview.revision !== revision
          || !nonEmpty(event.preview.planDigest)) return undefined;
        planDigest = event.preview.planDigest;
        phase = 'awaiting-approval';
        break;
      case 'APPROVAL_GRANTED':
        if (phase !== 'awaiting-approval' || !positiveRevision(event.revision) || event.revision !== revision
          || !nonEmpty(event.planDigest) || event.planDigest !== planDigest) return undefined;
        phase = 'approved';
        break;
      case 'START_REQUESTED':
        if (phase !== 'approved' || !positiveRevision(event.revision) || event.revision !== revision
          || !nonEmpty(event.planDigest) || event.planDigest !== planDigest) return undefined;
        phase = 'starting';
        running = true;
        break;
      case 'APPROVAL_REJECTED':
        if (phase !== 'awaiting-approval' || !positiveRevision(event.revision) || event.revision !== revision) return undefined;
        terminal = true;
        break;
      case 'RUN_STARTED':
        if (phase !== 'starting' || !event.handle || event.handle.flowId !== flowId
          || !nonEmpty(event.handle.jobId) || !nonEmpty(event.handle.logRef)) return undefined;
        phase = 'running';
        running = true;
        break;
      case 'RUN_PAUSED':
        if (phase !== 'running' || !nonEmpty(event.reason)) return undefined;
        running = false;
        resumable = true;
        break;
      case 'RUN_COMPLETED':
      case 'RUN_FAILED':
        if (phase !== 'running') return undefined;
        terminal = true;
        running = false;
        resumable = false;
        break;
      case 'FLOW_ABORTED':
        if (phase === 'empty') return undefined;
        terminal = true;
        running = false;
        resumable = false;
        break;
      default:
        return undefined;
    }
  }
  if (revision === undefined) return undefined;
  return { revision, planDigest, eventHead: events.length, updatedAt, terminal, resumable, running };
}

function projectionRelative(flowId: string): string {
  return `${RUN_FLOW_STORE_RELATIVE}/${flowId}.events.jsonl`;
}

function lineage(flowId: string, authority: JournalAuthority): string {
  return [
    'run-flow-journal-v1',
    `flow=${flowId}`,
    `revision=${authority.revision}`,
    `planDigest=${authority.planDigest ?? 'none'}`,
    `eventHead=${authority.eventHead}`,
  ].join(';');
}

function evidenceFor(
  evidence: readonly RunFlowLivenessEvidence[],
  flowId: string,
): RunFlowLivenessEvidence | undefined {
  const matches = evidence.filter(item => item.flowId === flowId);
  return matches.length === 1 ? matches[0] : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Archive eligible event projections.  Terminality comes only from the fresh
 * journal. A non-terminal flow additionally needs exact-head dead evidence and
 * must exceed the staleness window. Missing/malformed evidence always HOLDs.
 */
export function applyRunFlowRetention(
  projectRoot: string,
  options: RunFlowRetentionOptions = {},
): RunFlowRetentionResult {
  const now = (options.now ?? new Date()).getTime();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  if (!Number.isFinite(now) || !Number.isSafeInteger(staleAfterMs) || staleAfterMs < 0) {
    throw new DeckentError('RUN_FLOW_RETENTION_INVALID_TIME_POLICY', 'RUN_FLOW_RETENTION_INVALID_TIME_POLICY');
  }
  const root = resolve(projectRoot);
  const archived: RunFlowRetentionArchive[] = [];
  const held: RunFlowRetentionHold[] = [];
  const failures: { flowId: string; error: string }[] = [];

  for (const flowId of listFlowIds(root)) {
    try {
      const events = readFlowEvents(root, flowId);
      const authority = journalAuthority(flowId, events);
      if (!authority) {
        held.push({ flowId, reason: 'malformed-journal' });
        continue;
      }

      // Cross-check every independently persisted latest pointer. A mismatch is
      // ambiguous authority, never an invitation to pick one side as "latest".
      const snapshot = loadApprovedSnapshot(root, flowId);
      const plan = loadPlannedSprint(root, flowId);
      const attempt = loadLatestStartAttempt(root, flowId);
      const pointers = [snapshot, plan, attempt].filter(value => value !== undefined);
      if (pointers.some(pointer => pointer!.revision !== authority.revision
        || (pointer!.planDigest !== undefined && pointer!.planDigest !== authority.planDigest))) {
        held.push({ flowId, reason: 'ambiguous-authority' });
        continue;
      }

      const source = projectionRelative(flowId);
      if (!existsSync(join(root, source))) {
        // Canonical SQLite history is intentionally retained. This makes a
        // successful prior retirement a harmless, idempotent re-run.
        held.push({ flowId, reason: 'journal-projection-absent' });
        continue;
      }

      let reason: RunFlowRetentionArchive['reason'];
      if (authority.terminal) {
        reason = 'terminal';
      } else {
        if (authority.resumable) {
          held.push({ flowId, reason: 'resumable-authority' });
          continue;
        }
        if (!authority.running) {
          held.push({ flowId, reason: 'live-authority' });
          continue;
        }
        if (now - authority.updatedAt <= staleAfterMs) {
          held.push({ flowId, reason: 'not-stale' });
          continue;
        }
        const proof = evidenceFor(options.liveness ?? [], flowId);
        if (!proof || proof.state !== 'dead' || !validTimestamp(proof.observedAt)) {
          held.push({ flowId, reason: 'liveness-unproven' });
          continue;
        }
        if (proof.eventHead !== authority.eventHead || proof.revision !== authority.revision
          || proof.planDigest !== authority.planDigest) {
          held.push({ flowId, reason: 'liveness-lineage-mismatch' });
          continue;
        }
        reason = 'stale-dead';
      }

      const publication = publishMaintenanceArchive(root, {
        source,
        lineage: lineage(flowId, authority),
        retireSource: true,
        ...(options.archiveRoot === undefined ? {} : { archiveRoot: options.archiveRoot }),
      });
      archived.push({
        flowId,
        revision: authority.revision,
        ...(authority.planDigest === undefined ? {} : { planDigest: authority.planDigest }),
        eventHead: authority.eventHead,
        reason,
        publication,
      });
    } catch (error) {
      failures.push({ flowId, error: errorMessage(error) });
    }
  }
  return { archived, held, failures };
}

/** Alias matching the module's journal-oriented task vocabulary. */
export const retainRunFlowJournals = applyRunFlowRetention;

/** Project-relative path helper for audit/test consumers. */
export function runFlowJournalProjectionPath(projectRoot: string, flowId: string): string {
  return portable(relative(resolve(projectRoot), join(resolve(projectRoot), projectionRelative(flowId))));
}
