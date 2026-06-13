// ═══ Data Capability Handlers — F8 reference implementations ═══════════════
//
// Additive read-only handlers for data access. Concrete DB/mail I/O is injected
// so tests and callers can stay hermetic while the existing broker least-
// privilege gate enforces each handler's requiredCapability.

import {
  CapabilityRegistry,
  type CapabilityHandler,
  type InvocationContext,
} from './capability-broker.js';
import type { Capability } from './work-model.js';
import { DeckentError } from './errors.js';

type DataRequiredCapability = 'db.read' | 'mail.read';

export type DbQueryImpl = (
  sql: string,
  params: readonly unknown[],
  ctx: InvocationContext,
) => unknown | Promise<unknown>;

export interface DbQueryHandlerOptions {
  queryImpl?: DbQueryImpl;
}

export interface MailSearchRequest {
  query: string;
  limit?: number;
}

export interface RawMailMessage {
  id?: string;
  messageId?: string;
  headers?: Record<string, unknown>;
  subject?: string;
  from?: string;
  to?: string | readonly string[];
  date?: string;
}

export interface NormalizedMailHeaders {
  id: string | null;
  subject: string | null;
  from: string | null;
  to: string[];
  date: string | null;
}

export type MailSearchImpl = (
  request: MailSearchRequest,
  ctx: InvocationContext,
) => readonly RawMailMessage[] | Promise<readonly RawMailMessage[]>;

export interface MailSearchHandlerOptions {
  searchImpl?: MailSearchImpl;
}

export interface DataHandlerOptions {
  db?: DbQueryHandlerOptions;
  mail?: MailSearchHandlerOptions;
}

const BLOCKED_SQL_TOKEN = /\b(insert|update|delete|drop|alter|create|truncate|merge|replace|grant|revoke|call|execute|exec|into)\b/i;

function requiredCapability(capability: DataRequiredCapability): Capability {
  // The canonical Capability union has not been widened to the new F8 read-only
  // names yet; the broker gates by exact string equality.
  return capability as Capability;
}

function requireString(args: Record<string, unknown>, key: string, handlerName: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DeckentError('DECKENT_E039', `${handlerName} requires a non-empty string args.${key}`);
  }
  return value;
}

function readParams(args: Record<string, unknown>): readonly unknown[] {
  const value = args.params;
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new DeckentError('DECKENT_E004', 'db.query requires args.params to be an array when provided');
  }
  return [...value];
}

function readLimit(args: Record<string, unknown>): number | undefined {
  const value = args.limit;
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new DeckentError('DECKENT_E004', 'mail.search requires args.limit to be a positive integer when provided');
  }
  return value;
}

function assertReadOnlySelect(sql: string): string {
  const statement = sql.trim();
  if (statement.length === 0) {
    throw new DeckentError('DECKENT_E039', 'db.query requires a non-empty SELECT statement');
  }
  if (statement.includes(';')) {
    throw new DeckentError('DECKENT_E004', 'db.query is read-only and rejects semicolon multi-statement SQL');
  }
  if (statement.includes('--') || statement.includes('/*') || statement.includes('*/')) {
    throw new DeckentError('DECKENT_E004', 'db.query is read-only and rejects SQL comments');
  }
  if (!/^select\b/i.test(statement)) {
    throw new DeckentError('DECKENT_E004', 'db.query is read-only and only accepts SELECT statements');
  }
  if (BLOCKED_SQL_TOKEN.test(statement)) {
    throw new DeckentError('DECKENT_E004', 'db.query is read-only and rejects write or administrative SQL tokens');
  }
  return statement;
}

async function missingQueryImpl(): Promise<never> {
  throw new DeckentError('DECKENT_E004', 'db.query requires an injected queryImpl');
}

async function missingSearchImpl(): Promise<never> {
  throw new DeckentError('DECKENT_E004', 'mail.search requires an injected searchImpl');
}

function headerValue(headers: Record<string, unknown> | undefined, key: string): unknown {
  if (headers === undefined) return undefined;
  const exact = headers[key];
  if (exact !== undefined) return exact;
  const lowerKey = key.toLowerCase();
  const match = Object.entries(headers).find(([name]) => name.toLowerCase() === lowerKey);
  return match?.[1];
}

function stringHeader(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return first?.trim() ?? null;
  }
  return null;
}

function stringListHeader(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
  }
  return [];
}

function normalizeMailHeaders(message: RawMailMessage): NormalizedMailHeaders {
  const headers = message.headers;
  const id = stringHeader(message.id ?? message.messageId ?? headerValue(headers, 'message-id'));
  const subject = stringHeader(message.subject ?? headerValue(headers, 'subject'));
  const from = stringHeader(message.from ?? headerValue(headers, 'from'));
  const to = stringListHeader(message.to ?? headerValue(headers, 'to'));
  const date = stringHeader(message.date ?? headerValue(headers, 'date'));
  return { id, subject, from, to, date };
}

/** Create a read-only db.query handler. Tests inject queryImpl; no DB is opened here. */
export function createDbQueryHandler(options: DbQueryHandlerOptions = {}): CapabilityHandler {
  const queryImpl = options.queryImpl ?? missingQueryImpl;

  return {
    requiredCapability: requiredCapability('db.read'),
    description: 'Executes one read-only SELECT query through an injected queryImpl.',
    invoke: (args: Record<string, unknown>, ctx: InvocationContext) => {
      const sql = assertReadOnlySelect(requireString(args, 'sql', 'db.query'));
      return queryImpl(sql, readParams(args), ctx);
    },
  };
}

/** Create a mail.search handler. Tests inject searchImpl; no mail backend is opened here. */
export function createMailSearchHandler(options: MailSearchHandlerOptions = {}): CapabilityHandler {
  const searchImpl = options.searchImpl ?? missingSearchImpl;

  return {
    requiredCapability: requiredCapability('mail.read'),
    description: 'Searches mail through an injected searchImpl and returns normalized headers.',
    invoke: async (args: Record<string, unknown>, ctx: InvocationContext) => {
      const request: MailSearchRequest = {
        query: requireString(args, 'query', 'mail.search'),
        limit: readLimit(args),
      };
      const messages = await searchImpl(request, ctx);
      return messages.map(normalizeMailHeaders);
    },
  };
}

export const dbQueryHandler: CapabilityHandler = createDbQueryHandler();
export const mailSearchHandler: CapabilityHandler = createMailSearchHandler();

/** Install the data handlers without modifying the broker. */
export function installDataHandlers(
  registry: CapabilityRegistry,
  options: DataHandlerOptions = {},
): void {
  registry.register('db.query', createDbQueryHandler(options.db));
  registry.register('mail.search', createMailSearchHandler(options.mail));
}
