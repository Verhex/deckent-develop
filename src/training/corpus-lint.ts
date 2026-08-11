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
import { isValidShareGptExample, type PipelineManifest, type ShareGptExample } from './pipeline.js';

// ─── Report types ────────────────────────────────────────────────────────────

export type CorpusViolationKind =
  | 'MALFORMED_JSON'
  | 'SCHEMA_INVALID'
  | 'SECRET_REMNANT'
  | 'EMPTY_EXAMPLE'
  | 'TOO_SHORT_EXAMPLE'
  | 'PROVENANCE_INVALID'
  | 'INTEGRITY_INVALID'
  | 'DISPOSITION_INVALID'
  | 'DUPLICATE_WEIGHT_INVALID'
  | 'DUPLICATE_REFERENCE_INVALID'
  | 'DUPLICATE_EXAMPLE'
  | 'CAUSALITY_INVALID'
  | 'LABEL_AUTHORITY_INVALID'
  | 'MANIFEST_MISMATCH';

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
  duplicateWeightZeroCount: number;
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
  /** When supplied, corpus bytes/counts must reconcile with the published pipeline manifest. */
  expectedManifest?: PipelineManifest;
  /** Enterprise corpus publication can require canonical provenance on every row. */
  requireCanonicalProvenance?: boolean;
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

function provenanceViolation(example: ShareGptExample): CorpusViolationKind | null {
  if (example.provenance === undefined) return null; // Legacy projection has no provenance field.
  const provenance = example.provenance as Record<string, unknown>;
  if (provenance['schemaVersion'] === 1) {
    const digestFields = ['migrationId', 'policyDigest', 'recordId', 'sourceFileDigest', 'contentDigest'];
    if (digestFields.some(key => typeof provenance[key] !== 'string' || !/^[a-f0-9]{64}$/.test(provenance[key] as string))) return 'PROVENANCE_INVALID';
    if (typeof provenance['sourcePath'] !== 'string' || provenance['sourcePath'].length === 0 || provenance['sourcePath'].includes('\\')) return 'PROVENANCE_INVALID';
    if (!Number.isInteger(provenance['sourceLine']) || (provenance['sourceLine'] as number) <= 0) return 'PROVENANCE_INVALID';
    if (provenance['integrity'] !== 'verified') return 'INTEGRITY_INVALID';
    if (provenance['disposition'] !== 'train-ready') return 'DISPOSITION_INVALID';
    if (!Array.isArray(provenance['duplicateOf']) || provenance['duplicateOf'].length > 0) return 'DUPLICATE_REFERENCE_INVALID';
  }
  if (provenance['taskId'] !== undefined && (typeof provenance['taskId'] !== 'string' || provenance['taskId'].length === 0)) return 'PROVENANCE_INVALID';
  if (provenance['sprintId'] !== undefined && (typeof provenance['sprintId'] !== 'string' || provenance['sprintId'].length === 0)) return 'PROVENANCE_INVALID';
  if (provenance['attemptId'] !== undefined && (typeof provenance['attemptId'] !== 'string' || provenance['attemptId'].length === 0)) return 'PROVENANCE_INVALID';
  if (provenance['integrity'] !== undefined && (typeof provenance['integrity'] !== 'string' || provenance['integrity'].length === 0)) return 'INTEGRITY_INVALID';
  if (provenance['disposition'] !== undefined && (typeof provenance['disposition'] !== 'string' || provenance['disposition'].length === 0)) return 'DISPOSITION_INVALID';
  return null;
}

function causalityInvalid(example: ShareGptExample): boolean {
  const calls = new Set<string>();
  const canonical = example.provenance?.schemaVersion === 1;
  for (const turn of example.conversations) {
    if (turn.from === 'function_call') {
      if (canonical && !turn.causalId) return true;
      if (turn.causalId) {
        if (calls.has(turn.causalId)) return true;
        calls.add(turn.causalId);
      }
    }
    if (turn.from === 'observation') {
      if (canonical && !turn.causalId) return true;
      if (turn.causalId && !calls.has(turn.causalId)) return true;
    }
  }
  return false;
}

function labelAuthorityInvalid(example: ShareGptExample): boolean {
  if (!example.labels?.outcome) return false;
  if (example.provenance?.schemaVersion !== 1) return false;
  return example.provenance.verdictAuthority !== 'trace-meta-brain-evaluation';
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
  const corpusHash = createHash('sha256');
  let linesRead = 0;
  let validExamples = 0;
  let duplicateCount = 0;
  let duplicateWeightZeroCount = 0;

  let lineNo = 0;
  for await (const raw of openLines(filePath)) {
    lineNo++;
    if (raw.length === 0) continue;
    linesRead++;
    corpusHash.update(raw + '\n');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      violations.push({ line: lineNo, kind: 'MALFORMED_JSON', detail: 'line is not valid JSON' });
      continue;
    }

    const parsedRecord = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
    if (parsedRecord && 'weight' in parsedRecord && parsedRecord['weight'] !== undefined
        && (typeof parsedRecord['weight'] !== 'number' || !Number.isFinite(parsedRecord['weight']) || parsedRecord['weight'] < 0)) {
      violations.push({ line: lineNo, kind: 'DUPLICATE_WEIGHT_INVALID', detail: 'weight must be a finite non-negative number' });
      continue;
    }
    if (parsedRecord && Array.isArray(parsedRecord['conversations'])
        && parsedRecord['provenance'] !== undefined
        && typeof parsedRecord['provenance'] === 'object' && parsedRecord['provenance'] !== null) {
      const issue = provenanceViolation(parsed as ShareGptExample);
      if (issue !== null) {
        violations.push({ line: lineNo, kind: issue, detail: 'structured provenance field is invalid' });
        continue;
      }
    }
    if (!isValidShareGptExample(parsed)) {
      violations.push({ line: lineNo, kind: 'SCHEMA_INVALID', detail: 'does not match ShareGptExample schema' });
      continue;
    }

    validExamples++;

    const provenanceIssue = provenanceViolation(parsed);
    if (provenanceIssue !== null) violations.push({ line: lineNo, kind: provenanceIssue, detail: 'structured provenance field is invalid' });
    if (opts.requireCanonicalProvenance === true && parsed.provenance?.schemaVersion !== 1) violations.push({ line: lineNo, kind: 'PROVENANCE_INVALID', detail: 'canonical provenance is required' });
    if (causalityInvalid(parsed)) violations.push({ line: lineNo, kind: 'CAUSALITY_INVALID', detail: 'tool call/result causality is invalid' });
    if (labelAuthorityInvalid(parsed)) violations.push({ line: lineNo, kind: 'LABEL_AUTHORITY_INVALID', detail: 'outcome label lacks accepted verdict authority' });
    if (parsed.weight === 0) duplicateWeightZeroCount++;
    if (parsed.weight === 0 && (!parsed.provenance?.duplicateOf || parsed.provenance.duplicateOf.length === 0)) {
      violations.push({ line: lineNo, kind: 'DUPLICATE_WEIGHT_INVALID', detail: 'zero weight requires an explicit duplicate reference' });
    }
    if (parsed.provenance?.schemaVersion === 1 && (typeof parsed.weight !== 'number' || parsed.weight <= 0)) {
      violations.push({ line: lineNo, kind: 'DUPLICATE_WEIGHT_INVALID', detail: 'canonical train-ready records require positive weight' });
    }

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
      violations.push({ line: lineNo, kind: 'DUPLICATE_EXAMPLE', detail: 'duplicate trainable content detected' });
    } else {
      seenHashes.add(hash);
    }
  }

  const finalDigest = corpusHash.digest('hex');
  if (opts.expectedManifest) {
    const manifest = opts.expectedManifest;
    if (manifest.outputDigest !== finalDigest
        || manifest.examplesWritten !== validExamples
        || manifest.projectionMode === 'canonical-v1' && manifest.canonicalRecordsSeen < validExamples) {
      violations.push({ line: 0, kind: 'MANIFEST_MISMATCH', detail: 'corpus bytes/counts do not reconcile with pipeline manifest' });
    }
  }
  return {
    ok: violations.length === 0,
    violations,
    stats: { linesRead, validExamples, duplicateCount, uniqueCount: seenHashes.size, duplicateWeightZeroCount },
  };
}
