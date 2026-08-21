import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  APPROVAL_LIFECYCLE_SLA_STAGES,
  type ApprovalLifecycleStage,
} from './config-types.js';
import { createJsonFileFirstWriterWins } from './approval-file-cas.js';

export const APPROVAL_SLA_STAGES = APPROVAL_LIFECYCLE_SLA_STAGES;
export type ApprovalSlaStage = ApprovalLifecycleStage;
export type ApprovalSlaTimedStage = Exclude<ApprovalSlaStage, 'initial' | 'expired'>;

export interface ApprovalSlaClock {
  now(): Date;
}

export interface ApprovalSlaPolicy {
  readonly slaMs: readonly [number, number, number];
  readonly authoredPolicyDigest: string;
  readonly appliedPolicyDigest: string;
}

export interface ApprovalSlaState {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly lifecycleGeneration: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastAuditOrdinal: number;
  readonly lastOutboundOrdinal: number;
  readonly terminal: boolean;
}

export type ApprovalSlaEvidenceKind = 'due' | 'skipped' | 'expired';

export interface ApprovalSlaEvidence {
  readonly eventId: string;
  readonly requestId: string;
  readonly lifecycleGeneration: string;
  readonly stage: ApprovalSlaStage;
  readonly ordinal: number;
  readonly kind: ApprovalSlaEvidenceKind;
  readonly dueAt: string;
  readonly observedAt: string;
  readonly authoredPolicyDigest: string;
  readonly appliedPolicyDigest: string;
  readonly reasonCode?: 'effective-expiry-precedes-stage';
}

export interface AdvanceApprovalSlaInput {
  readonly requestId: string;
  readonly lifecycleGeneration: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly policy: ApprovalSlaPolicy;
  readonly clock: ApprovalSlaClock;
  readonly state?: ApprovalSlaState;
}

export interface AdvanceApprovalSlaResult {
  readonly state: ApprovalSlaState;
  /** Every newly crossed ordinal, including typed skipped-stage evidence. */
  readonly audit: readonly ApprovalSlaEvidence[];
  /** At most one event: the highest actionable stage, or the single expiry. */
  readonly outbound: readonly ApprovalSlaEvidence[];
}

export class ApprovalSlaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalSlaError';
  }
}

function parseInstant(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ApprovalSlaError(`${field} must be a valid ISO instant`);
  return parsed;
}

function assertDigest(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new ApprovalSlaError(`${field} must be a lowercase SHA-256 digest`);
}

function validateInput(input: AdvanceApprovalSlaInput): { createdAtMs: number; expiresAtMs: number; nowMs: number } {
  if (!input.requestId) throw new ApprovalSlaError('requestId is required');
  if (typeof input.lifecycleGeneration !== 'string'
    || input.lifecycleGeneration.length < 1
    || input.lifecycleGeneration.length > 128) {
    throw new ApprovalSlaError('lifecycleGeneration must be a non-empty string of at most 128 characters');
  }
  const createdAtMs = parseInstant(input.createdAt, 'createdAt');
  const expiresAtMs = parseInstant(input.expiresAt, 'expiresAt');
  const now = input.clock.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new ApprovalSlaError('clock.now() must be valid');
  if (expiresAtMs <= createdAtMs) throw new ApprovalSlaError('expiresAt must be after createdAt');
  const [first, second, third] = input.policy.slaMs;
  if (![first, second, third].every((value) => Number.isSafeInteger(value) && value > 0)
    || !(first < second && second < third)) {
    throw new ApprovalSlaError('slaMs must contain three positive, strictly increasing integer offsets');
  }
  assertDigest(input.policy.authoredPolicyDigest, 'authoredPolicyDigest');
  assertDigest(input.policy.appliedPolicyDigest, 'appliedPolicyDigest');
  if (input.state) {
    if (input.state.requestId !== input.requestId
      || input.state.lifecycleGeneration !== input.lifecycleGeneration
      || input.state.createdAt !== input.createdAt
      || input.state.expiresAt !== input.expiresAt) {
      throw new ApprovalSlaError('persisted SLA state lineage mismatch');
    }
  }
  return { createdAtMs, expiresAtMs, nowMs: now.getTime() };
}

export function approvalSlaEventId(
  requestId: string,
  lifecycleGeneration: string,
  stage: ApprovalSlaStage,
): string {
  return `approval-sla:${createHash('sha256')
    .update(`${requestId}\u0000${lifecycleGeneration}\u0000${stage}`)
    .digest('hex')}`;
}

function evidence(
  input: AdvanceApprovalSlaInput,
  stage: ApprovalSlaStage,
  ordinal: number,
  kind: ApprovalSlaEvidenceKind,
  dueAtMs: number,
  observedAtMs: number,
  reasonCode?: ApprovalSlaEvidence['reasonCode'],
): ApprovalSlaEvidence {
  return {
    eventId: approvalSlaEventId(input.requestId, input.lifecycleGeneration, stage),
    requestId: input.requestId,
    lifecycleGeneration: input.lifecycleGeneration,
    stage,
    ordinal,
    kind,
    dueAt: new Date(dueAtMs).toISOString(),
    observedAt: new Date(observedAtMs).toISOString(),
    authoredPolicyDigest: input.policy.authoredPolicyDigest,
    appliedPolicyDigest: input.policy.appliedPolicyDigest,
    ...(reasonCode ? { reasonCode } : {}),
  };
}

/**
 * Advance the durable SLA cursor without replay. Restart catch-up records each
 * crossed audit ordinal but exposes only the highest actionable outbound stage.
 * A short producer TTL skips unreachable reminders with typed evidence and is
 * never extended. Expiry is the sole terminal stage.
 */
export function advanceApprovalSla(input: AdvanceApprovalSlaInput): AdvanceApprovalSlaResult {
  const { createdAtMs, expiresAtMs, nowMs } = validateInput(input);
  const current: ApprovalSlaState = input.state ?? {
    schemaVersion: 1,
    requestId: input.requestId,
    lifecycleGeneration: input.lifecycleGeneration,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    lastAuditOrdinal: -1,
    lastOutboundOrdinal: -1,
    terminal: false,
  };
  if (current.terminal) return { state: current, audit: [], outbound: [] };

  const timed = [
    { stage: 'renotify' as const, ordinal: 1, dueAtMs: createdAtMs + input.policy.slaMs[0] },
    { stage: 'alternate-channel' as const, ordinal: 2, dueAtMs: createdAtMs + input.policy.slaMs[1] },
    { stage: 'park-alert' as const, ordinal: 3, dueAtMs: createdAtMs + input.policy.slaMs[2] },
  ];
  const audit: ApprovalSlaEvidence[] = [];
  const actionable: ApprovalSlaEvidence[] = [];

  if (current.lastAuditOrdinal < 0) {
    const initial = evidence(input, 'initial', 0, 'due', createdAtMs, nowMs);
    audit.push(initial);
    if (current.lastOutboundOrdinal < 0 && nowMs < expiresAtMs) actionable.push(initial);
  }
  for (const item of timed) {
    if (item.ordinal <= current.lastAuditOrdinal) continue;
    if (item.dueAtMs >= expiresAtMs) {
      audit.push(evidence(
        input,
        item.stage,
        item.ordinal,
        'skipped',
        item.dueAtMs,
        nowMs,
        'effective-expiry-precedes-stage',
      ));
      continue;
    }
    if (item.dueAtMs <= nowMs) {
      const due = evidence(input, item.stage, item.ordinal, 'due', item.dueAtMs, nowMs);
      audit.push(due);
      if (item.ordinal > current.lastOutboundOrdinal) actionable.push(due);
    }
  }

  if (nowMs >= expiresAtMs && current.lastAuditOrdinal < 4) {
    const expired = evidence(input, 'expired', 4, 'expired', expiresAtMs, nowMs);
    audit.push(expired);
    return {
      state: { ...current, lastAuditOrdinal: 4, lastOutboundOrdinal: 4, terminal: true },
      audit,
      outbound: current.lastOutboundOrdinal < 4 ? [expired] : [],
    };
  }

  const highestAudit = audit.reduce((value, item) => Math.max(value, item.ordinal), current.lastAuditOrdinal);
  const highestActionable = actionable.reduce<ApprovalSlaEvidence | undefined>(
    (value, item) => value === undefined || item.ordinal > value.ordinal ? item : value,
    undefined,
  );
  return {
    state: {
      ...current,
      lastAuditOrdinal: highestAudit,
      lastOutboundOrdinal: highestActionable?.ordinal ?? current.lastOutboundOrdinal,
    },
    audit,
    outbound: highestActionable ? [highestActionable] : [],
  };
}

export interface ApprovalSlaJournalOptions {
  readonly storeDir: string;
}

function journalKey(requestId: string, lifecycleGeneration: string): string {
  return createHash('sha256').update(`${requestId}\u0000${lifecycleGeneration}`).digest('hex');
}

/**
 * Append-only durable SLA audit/outbox cursor. Each stage and ACK is a
 * first-writer-wins file, so concurrent processes cannot overwrite a newer
 * cursor with stale state. An unacknowledged event is re-exposed after restart
 * with the same stable eventId; acknowledged stages never replay.
 */
export class ApprovalSlaJournal {
  private readonly storeDir: string;

  constructor(options: ApprovalSlaJournalOptions) {
    this.storeDir = options.storeDir;
  }

  private eventPath(key: string, ordinal: number): string {
    return join(this.storeDir, `${key}.${ordinal}.sla-event.json`);
  }

  private ackPath(key: string, ordinal: number): string {
    return join(this.storeDir, `${key}.${ordinal}.sla-ack.json`);
  }

  private persistedOrdinals(key: string, suffix: 'sla-event.json' | 'sla-ack.json'): number[] {
    if (!existsSync(this.storeDir)) return [];
    try {
      return readdirSync(this.storeDir).flatMap((file) => {
        const prefix = `${key}.`;
        const ending = `.${suffix}`;
        if (!file.startsWith(prefix) || !file.endsWith(ending)) return [];
        const ordinal = Number(file.slice(prefix.length, -ending.length));
        return Number.isSafeInteger(ordinal) && ordinal >= 0 ? [ordinal] : [];
      }).filter(Number.isSafeInteger);
    } catch {
      return [];
    }
  }

  advance(input: Omit<AdvanceApprovalSlaInput, 'state'>): AdvanceApprovalSlaResult {
    const key = journalKey(input.requestId, input.lifecycleGeneration);
    const eventOrdinals = this.persistedOrdinals(key, 'sla-event.json');
    const ackOrdinals = this.persistedOrdinals(key, 'sla-ack.json');
    const lastAudit = eventOrdinals.length === 0 ? -1 : Math.max(...eventOrdinals);
    const lastAck = ackOrdinals.length === 0 ? -1 : Math.max(...ackOrdinals);
    const result = advanceApprovalSla({
      ...input,
      state: {
        schemaVersion: 1,
        requestId: input.requestId,
        lifecycleGeneration: input.lifecycleGeneration,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        lastAuditOrdinal: lastAudit,
        lastOutboundOrdinal: lastAck,
        terminal: lastAudit >= 4 && lastAck >= 4,
      },
    });
    if (result.audit.length > 0) mkdirSync(this.storeDir, { recursive: true, mode: 0o700 });
    for (const evidence of result.audit) {
      createJsonFileFirstWriterWins(this.eventPath(key, evidence.ordinal), evidence);
    }
    const retryable = [...eventOrdinals, ...result.audit.map((item) => item.ordinal)]
      .filter((ordinal) => ordinal > lastAck)
      .map((ordinal) => result.audit.find((item) => item.ordinal === ordinal) ?? this.readEvent(key, ordinal))
      .filter((item): item is ApprovalSlaEvidence => item !== null && item.kind !== 'skipped')
      .sort((left, right) => right.ordinal - left.ordinal)[0];
    return { ...result, outbound: retryable ? [retryable] : [] };
  }

  acknowledge(evidence: ApprovalSlaEvidence): boolean {
    const key = journalKey(evidence.requestId, evidence.lifecycleGeneration);
    const stored = this.readEvent(key, evidence.ordinal);
    if (!stored || stored.eventId !== evidence.eventId) {
      throw new ApprovalSlaError('cannot acknowledge an SLA event that is not durably journaled');
    }
    return createJsonFileFirstWriterWins(this.ackPath(key, evidence.ordinal), {
      schemaVersion: 1,
      eventId: evidence.eventId,
      requestId: evidence.requestId,
      lifecycleGeneration: evidence.lifecycleGeneration,
      ordinal: evidence.ordinal,
      acknowledgedAt: evidence.observedAt,
    });
  }

  private readEvent(key: string, ordinal: number): ApprovalSlaEvidence | null {
    try {
      return JSON.parse(readFileSync(this.eventPath(key, ordinal), 'utf8')) as ApprovalSlaEvidence;
    } catch {
      return null;
    }
  }
}
