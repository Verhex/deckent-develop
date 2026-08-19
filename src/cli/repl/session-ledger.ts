import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';

import type { ProviderMessage } from '../../agent/provider-tooluse/types.js';
import { GLOBAL_DECKENT_DIR } from '../../core/constants.js';
import type { ChatSessionSummary } from '../../core/memory-types.js';
import { projectSlug } from '../../core/project-slug.js';

const DIRECTORY_MODE = 0o700;
const LEDGER_FILE_MODE = 0o600;
const LEDGER_VERSION = 1 as const;
const PREVIEW_MAX_LENGTH = 60;

export interface LedgerUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface LedgerUsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface LedgerStoreOptions {
  cwd?: string;
  /** Injectable replacement for GLOBAL_DECKENT_DIR. Required in tests. */
  rootDir?: string;
}

export interface AppendLedgerTurnInput extends LedgerStoreOptions {
  sessionId: string;
  turnIndex: number;
  ts: string;
  provider: string;
  model: string;
  messagesDelta: ProviderMessage[];
  usage: LedgerUsage | null;
}

export interface LedgerSession {
  messages: ProviderMessage[];
  lastModel: string | null;
  totals: LedgerUsageTotals;
  turnCount: number;
}

interface LedgerLine {
  v: typeof LEDGER_VERSION;
  sessionId: string;
  turnIndex: number;
  ts: string;
  provider: string;
  model: string;
  messagesDelta: ProviderMessage[];
  usage: LedgerUsage | null;
}

function safePart(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '-');
  return sanitized.length > 0 ? sanitized : '-';
}

function ledgerDirectory(options: LedgerStoreOptions): string {
  return join(
    options.rootDir ?? GLOBAL_DECKENT_DIR,
    'projects',
    projectSlug(options.cwd ?? process.cwd()),
  );
}

function ledgerPath(sessionId: string, options: LedgerStoreOptions): string {
  return join(ledgerDirectory(options), `${safePart(sessionId)}.jsonl`);
}

function hardenMode(path: string, mode: number): void {
  if (process.platform === 'win32') return;
  chmodSync(path, mode);
}

function ensureLedgerDirectory(options: LedgerStoreOptions): string {
  const projectsDir = join(options.rootDir ?? GLOBAL_DECKENT_DIR, 'projects');
  const directory = ledgerDirectory(options);
  mkdirSync(projectsDir, { recursive: true, mode: DIRECTORY_MODE });
  mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
  hardenMode(projectsDir, DIRECTORY_MODE);
  hardenMode(directory, DIRECTORY_MODE);
  return directory;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseUsage(value: unknown): LedgerUsage | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const usage = value as Record<string, unknown>;
  if (!isNonNegativeFinite(usage['inputTokens']) || !isNonNegativeFinite(usage['outputTokens'])) {
    return undefined;
  }
  if (usage['cacheReadTokens'] !== undefined && !isNonNegativeFinite(usage['cacheReadTokens'])) {
    return undefined;
  }
  if (usage['cacheCreationTokens'] !== undefined && !isNonNegativeFinite(usage['cacheCreationTokens'])) {
    return undefined;
  }
  return {
    inputTokens: usage['inputTokens'],
    outputTokens: usage['outputTokens'],
    ...(usage['cacheReadTokens'] === undefined
      ? {}
      : { cacheReadTokens: usage['cacheReadTokens'] }),
    ...(usage['cacheCreationTokens'] === undefined
      ? {}
      : { cacheCreationTokens: usage['cacheCreationTokens'] }),
  };
}

function parseLedgerLine(raw: string): LedgerLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const line = value as Record<string, unknown>;
  const usage = Object.prototype.hasOwnProperty.call(line, 'usage')
    ? parseUsage(line['usage'])
    : undefined;
  if (
    line['v'] !== LEDGER_VERSION
    || typeof line['sessionId'] !== 'string'
    || !Number.isInteger(line['turnIndex'])
    || (line['turnIndex'] as number) < 0
    || typeof line['ts'] !== 'string'
    || typeof line['provider'] !== 'string'
    || typeof line['model'] !== 'string'
    || !Array.isArray(line['messagesDelta'])
    || usage === undefined
  ) {
    return null;
  }
  return {
    v: LEDGER_VERSION,
    sessionId: line['sessionId'],
    turnIndex: line['turnIndex'] as number,
    ts: line['ts'],
    provider: line['provider'],
    model: line['model'],
    messagesDelta: line['messagesDelta'] as ProviderMessage[],
    usage,
  };
}

function readLedgerLines(file: string): LedgerLine[] {
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const lines: LedgerLine[] = [];
  for (const raw of content.split('\n')) {
    if (!raw.trim()) continue;
    const parsed = parseLedgerLine(raw);
    if (parsed) lines.push(parsed);
  }
  return lines;
}

/** Append exactly one complete JSONL record containing only this turn's delta. */
export function appendLedgerTurn(input: AppendLedgerTurnInput): void {
  ensureLedgerDirectory(input);
  const file = ledgerPath(input.sessionId, input);
  const line: LedgerLine = {
    v: LEDGER_VERSION,
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    ts: input.ts,
    provider: input.provider,
    model: input.model,
    messagesDelta: input.messagesDelta,
    usage: input.usage,
  };
  appendFileSync(file, `${JSON.stringify(line)}\n`, {
    encoding: 'utf8',
    mode: LEDGER_FILE_MODE,
  });
  hardenMode(file, LEDGER_FILE_MODE);
}

/** Read and rehydrate all valid deltas for one session. */
export function readLedgerSession(
  sessionId: string,
  options: LedgerStoreOptions = {},
): LedgerSession {
  const lines = readLedgerLines(ledgerPath(sessionId, options))
    .filter((line) => line.sessionId === sessionId)
    .sort((a, b) => a.turnIndex - b.turnIndex);
  const totals: LedgerUsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  const messages: ProviderMessage[] = [];
  let lastModel: string | null = null;
  for (const line of lines) {
    messages.push(...line.messagesDelta);
    lastModel = line.model;
    if (line.usage) {
      totals.inputTokens += line.usage.inputTokens;
      totals.outputTokens += line.usage.outputTokens;
      totals.cacheReadTokens += line.usage.cacheReadTokens ?? 0;
      totals.cacheCreationTokens += line.usage.cacheCreationTokens ?? 0;
    }
  }
  return { messages, lastModel, totals, turnCount: lines.length };
}

function messageText(message: ProviderMessage): string {
  const content = (message as unknown as Record<string, unknown>)['content'];
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const text = (block as Record<string, unknown>)['text'];
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join(' ');
}

function previewFor(lines: LedgerLine[]): string {
  for (const line of lines) {
    for (const message of line.messagesDelta) {
      const record = message as unknown as Record<string, unknown>;
      if (record['role'] !== 'user') continue;
      const raw = messageText(message).replace(/\s+/g, ' ').trim();
      return raw.length > PREVIEW_MAX_LENGTH
        ? `${raw.slice(0, PREVIEW_MAX_LENGTH - 3)}…`
        : raw;
    }
  }
  return '';
}

/** List valid ledger sessions in descending last-activity order. */
export function listLedgerSessions(
  limit = 10,
  options: LedgerStoreOptions = {},
): ChatSessionSummary[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  let names: string[];
  try {
    names = readdirSync(ledgerDirectory(options)).filter((name) => name.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const summaries: ChatSessionSummary[] = [];
  for (const name of names) {
    const lines = readLedgerLines(join(ledgerDirectory(options), name));
    if (lines.length === 0) continue;
    const sessionId = lines[0]!.sessionId;
    const sessionLines = lines
      .filter((line) => line.sessionId === sessionId)
      .sort((a, b) => a.turnIndex - b.turnIndex);
    if (sessionLines.length === 0) continue;
    summaries.push({
      sessionId,
      turnCount: sessionLines.length,
      lastAt: sessionLines[sessionLines.length - 1]!.ts,
      preview: previewFor(sessionLines),
    });
  }
  return summaries
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, Math.floor(limit));
}
