import { createHash } from 'node:crypto';

import type { MemoryStore } from '../core/memory-store.js';

export interface CompetitorEventInput {
  competitor: string;
  eventType: string;
  source: string;
  publicationDate: string;
  detectionDate: string;
  reportedDate: string;
  affectedCapability: string;
  previousClassification: string;
  confidence: number;
}

export interface CompetitorEvent extends CompetitorEventInput {
  fingerprint: `sha256:${string}`;
}

export type EventHistoryField = keyof CompetitorEventInput;

export type EventHistoryError =
  | {
      code: 'MISSING_FIELD';
      field: EventHistoryField;
      message: string;
    }
  | {
      code: 'INVALID_FIELD';
      field: EventHistoryField;
      message: string;
    }
  | {
      code: 'INVALID_DATE';
      field: 'publicationDate' | 'detectionDate' | 'reportedDate';
      message: string;
    }
  | {
      code: 'STORAGE_ERROR';
      message: string;
    };

export type WriteEventHistoryResult =
  | {
      ok: true;
      state: 'written' | 'duplicate';
      event: CompetitorEvent;
    }
  | { ok: false; error: EventHistoryError };

const REQUIRED_STRING_FIELDS = [
  'competitor',
  'eventType',
  'source',
  'publicationDate',
  'detectionDate',
  'reportedDate',
  'affectedCapability',
  'previousClassification',
] as const satisfies readonly EventHistoryField[];

const DATE_FIELDS = [
  'publicationDate',
  'detectionDate',
  'reportedDate',
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Derive the event identity from semantic fields, never from a source headline.
 * Classification is included because a changed classification is a material
 * evolution even when the competitor, capability, and publication day match.
 */
export function deriveEventFingerprint(
  input: Pick<
    CompetitorEventInput,
    | 'competitor'
    | 'eventType'
    | 'publicationDate'
    | 'affectedCapability'
    | 'previousClassification'
  >,
): `sha256:${string}` {
  const core = [
    normalizeIdentity(input.competitor),
    normalizeIdentity(input.eventType),
    normalizeIdentity(input.affectedCapability),
    publicationDay(input.publicationDate),
    normalizeIdentity(input.previousClassification),
  ];
  return `sha256:${createHash('sha256').update(JSON.stringify(core)).digest('hex')}`;
}

export function validateCompetitorEvent(
  value: unknown,
): { ok: true; value: CompetitorEventInput } | { ok: false; error: EventHistoryError } {
  if (!isRecord(value)) {
    return missing('competitor');
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!(field in value)) return missing(field);
    if (typeof value[field] !== 'string') return invalid(field, 'must be a string');
    if (field !== 'reportedDate' && value[field].trim().length === 0) {
      return invalid(field, 'must not be empty');
    }
  }

  if (!('confidence' in value)) return missing('confidence');
  if (
    typeof value.confidence !== 'number'
    || !Number.isFinite(value.confidence)
    || value.confidence < 0
    || value.confidence > 1
  ) {
    return invalid('confidence', 'must be a finite number between 0 and 1');
  }

  for (const field of DATE_FIELDS) {
    const date = value[field] as string;
    if (field === 'reportedDate' && date === '') continue;
    if (!isIso8601(date)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_DATE',
          field,
          message: `${field} must be a valid ISO-8601 date or timestamp`,
        },
      };
    }
  }

  return { ok: true, value: value as unknown as CompetitorEventInput };
}

/** Store one event in the caller's canonical MemoryStore connection. */
export function writeEventHistory(
  store: MemoryStore,
  input: unknown,
): WriteEventHistoryResult {
  const validation = validateCompetitorEvent(input);
  if (!validation.ok) return validation;

  const event: CompetitorEvent = {
    ...validation.value,
    fingerprint: deriveEventFingerprint(validation.value),
  };
  const id = `competitor-event:${event.fingerprint.slice('sha256:'.length)}`;

  try {
    if (store.getById(id) !== null) {
      return { ok: true, state: 'duplicate', event };
    }
    store.insert({
      id,
      type: 'custom',
      source: 'brain',
      title: `Competitor event: ${event.competitor} / ${event.eventType}`,
      content: JSON.stringify(event),
      metadata: { ...event },
      tags: ['competitor-event', event.competitor, event.affectedCapability],
      decay_exempt: true,
    });
    return { ok: true, state: 'written', event };
  } catch (error: unknown) {
    // A concurrent writer may win between getById and insert. The deterministic
    // primary key makes that race an honest replay rather than a second event.
    if (store.getById(id) !== null) {
      return { ok: true, state: 'duplicate', event };
    }
    return {
      ok: false,
      error: {
        code: 'STORAGE_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function normalizeIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function publicationDay(value: string): string {
  const dateOnly = ISO_DATE.exec(value);
  if (dateOnly) return value;
  return new Date(value).toISOString().slice(0, 10);
}

function isIso8601(value: string): boolean {
  const match = ISO_DATE.exec(value) ?? ISO_DATE_TIME.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const checked = new Date(Date.UTC(year, month - 1, day));
  return checked.getUTCFullYear() === year
    && checked.getUTCMonth() === month - 1
    && checked.getUTCDate() === day;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function missing(
  field: EventHistoryField,
): { ok: false; error: EventHistoryError } {
  return {
    ok: false,
    error: { code: 'MISSING_FIELD', field, message: `${field} is required` },
  };
}

function invalid(
  field: EventHistoryField,
  reason: string,
): { ok: false; error: EventHistoryError } {
  return {
    ok: false,
    error: { code: 'INVALID_FIELD', field, message: `${field} ${reason}` },
  };
}
