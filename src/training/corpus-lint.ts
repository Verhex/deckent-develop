// src/training/corpus-lint.ts
// ═══ TRN-LINT — ShareGPT JSONL corpus quality auditor ═══════════════════════
// Read-only auditor over a ShareGPT-format JSONL file (src/training/pipeline.ts's
// ShareGptExample shape, produced by runPipeline/traceToShareGpt). Checks
// schema-compliance, un-redacted credential remnants (sk-/AKIA/ghp_/JWT etc.,
// via the same redactSensitive() ADR-G-009 already relies on — no duplicated
// regex logic), duplicate-example statistics (content-hash), and empty/
// too-short examples. Never mutates the input file — CLI-wiring is a
// follow-up task; this module only produces the report object.
//
// Streams via node:readline over a read stream (same pattern as
// runPipeline in pipeline.ts) — never materializes the whole file in memory.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { redactSensitive } from '../core/redact-sensitive.js';
import { isValidShareGptExample, type ShareGptExample } from './pipeline.js';

// ─── Report types ────────────────────────────────────────────────────────────

export type CorpusViolationKind =
  | 'MALFORMED_JSON'
  | 'SCHEMA_INVALID'
  | 'SECRET_REMNANT'
  | 'EMPTY_EXAMPLE'
  | 'TOO_SHORT_EXAMPLE';

export interface CorpusViolation {
  line: number;
  kind: CorpusViolationKind;
  detail: string;
}

export interface CorpusLintStats {
  linesRead: number;
  validExamples: number;
  duplicateCount: number;
  uniqueCount: number;
}

export interface CorpusLintReport {
  ok: boolean;
  violations: CorpusViolation[];
  stats: CorpusLintStats;
}

export interface CorpusLintOptions {
  /** Minimum total content chars (system + all turn values) below which an example is TOO_SHORT_EXAMPLE. */
  minChars?: number;
  /** Injectable line source (hermetic tests). Defaults to a real readline stream over filePath. */
  openLines?: (filePath: string) => AsyncIterable<string>;
}

const DEFAULT_MIN_CHARS = 8;

function defaultOpenLines(filePath: string): AsyncIterable<string> {
  return createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
}

// ─── Per-example checks ──────────────────────────────────────────────────────

/** Total value-length across system + every conversation turn. */
function contentLength(example: ShareGptExample): number {
  let total = example.system?.length ?? 0;
  for (const turn of example.conversations) total += turn.value.length;
  return total;
}

/** Deterministic content hash for dedupe stats (system + conversations, order-sensitive). */
function contentHash(example: ShareGptExample): string {
  const key = JSON.stringify({ system: example.system, conversations: example.conversations });
  return createHash('sha256').update(key).digest('hex');
}

/** Un-redacted credential scan: if redactSensitive() would change a text, a remnant slipped through. */
function hasSecretRemnant(example: ShareGptExample): boolean {
  if (example.system !== undefined && redactSensitive(example.system) !== example.system) return true;
  return example.conversations.some((turn) => redactSensitive(turn.value) !== turn.value);
}

// ─── Streaming auditor ───────────────────────────────────────────────────────

/**
 * Lints `filePath` (one ShareGPT example JSONL per line) and returns
 * `{ ok, violations[], stats }`. Read-only — never writes or fixes the input.
 */
export async function lintCorpus(filePath: string, opts: CorpusLintOptions = {}): Promise<CorpusLintReport> {
  const minChars = opts.minChars ?? DEFAULT_MIN_CHARS;
  const openLines = opts.openLines ?? defaultOpenLines;

  const violations: CorpusViolation[] = [];
  const seenHashes = new Set<string>();
  let linesRead = 0;
  let validExamples = 0;
  let duplicateCount = 0;

  let lineNo = 0;
  for await (const raw of openLines(filePath)) {
    lineNo++;
    if (raw.length === 0) continue;
    linesRead++;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      violations.push({ line: lineNo, kind: 'MALFORMED_JSON', detail: 'line is not valid JSON' });
      continue;
    }

    if (!isValidShareGptExample(parsed)) {
      violations.push({ line: lineNo, kind: 'SCHEMA_INVALID', detail: 'does not match ShareGptExample schema' });
      continue;
    }

    validExamples++;

    if (hasSecretRemnant(parsed)) {
      violations.push({ line: lineNo, kind: 'SECRET_REMNANT', detail: 'un-redacted credential pattern detected' });
    }

    const len = contentLength(parsed);
    if (parsed.conversations.length === 0 || len === 0) {
      violations.push({ line: lineNo, kind: 'EMPTY_EXAMPLE', detail: 'no conversation content' });
    } else if (len < minChars) {
      violations.push({ line: lineNo, kind: 'TOO_SHORT_EXAMPLE', detail: `content length ${len} < minChars ${minChars}` });
    }

    const hash = contentHash(parsed);
    if (seenHashes.has(hash)) {
      duplicateCount++;
    } else {
      seenHashes.add(hash);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    stats: { linesRead, validExamples, duplicateCount, uniqueCount: seenHashes.size },
  };
}
