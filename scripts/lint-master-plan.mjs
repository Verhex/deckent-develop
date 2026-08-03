#!/usr/bin/env node
/**
 * Canonical MASTER-PLAN validator and deterministic active-view generator.
 *
 * Source authority:
 *   docs/MASTER-PLAN.md
 *
 * Derived, read-only projections:
 *   docs/generated/master-plan-active.md
 *   docs/generated/master-plan-active.json
 *
 * Modes:
 *   --check  validate the canonical plan and fail when a projection is missing/stale
 *   --write  validate first, then atomically refresh the two derived projections
 *   --json   emit a machine-readable result (implies --check when no mode is given)
 *   --root   alternate repository root for hermetic tests/tooling
 *
 * Exit codes:
 *   0 — canonical plan valid and requested operation succeeded
 *   1 — schema/invariant/projection-drift failure
 *   2 — usage or filesystem/scan failure
 *
 * Design constraints:
 *   - dependency-free ESM so `npm run lint` does not depend on `dist/`
 *   - report-only in --check mode
 *   - deterministic across LF/CRLF checkouts and host path separators
 *   - no fixed row/count baseline: the schema and graph, not today's count, are authority
 */

import {
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');
export const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');
export const MASTER_PLAN_RELATIVE_PATH = 'docs/MASTER-PLAN.md';

/**
 * Paths an ACTIVE receipt may not pin: the ledger that carries the receipt and the
 * projections generated from it. Pinning them is self-referential — writing the receipt
 * changes the bytes it claims as baseline — so they belong to the consumed settlement
 * receipt instead. See the admission gate near `RECEIPT_SELF_REFERENTIAL`.
 */
export const SELF_REFERENTIAL_RECEIPT_PATHS = new Set([
  'docs/MASTER-PLAN.md',
  'docs/generated/master-plan-active.md',
  'docs/generated/master-plan-active.json',
]);
export const ACTIVE_MARKDOWN_RELATIVE_PATH = 'docs/generated/master-plan-active.md';
export const ACTIVE_JSON_RELATIVE_PATH = 'docs/generated/master-plan-active.json';
const ACTIVE_WRITE_LOCK_RELATIVE_PATH = 'docs/generated/.master-plan-write.lock';

export const PROGRAM_ROOTS = Object.freeze(
  Array.from({ length: 11 }, (_, index) => `P${String(index).padStart(2, '0')}`),
);

export const PROGRAMS = Object.freeze([
  'API',
  'ASSURANCE',
  'AUTHORITY',
  'CODEX',
  'CONNECTOR',
  'COST',
  'DASHBOARD',
  'DATA',
  'DESKTOP',
  'DOCS',
  'DURABILITY',
  'ECOSYSTEM',
  'ENTERPRISE',
  'EVAL',
  'EVOLUTION',
  'KERNEL',
  'LEARNING',
  'OBS',
  'ONBOARDING',
  'OPS',
  'PAEP',
  'PRODUCT',
  'PROMPT',
  'PROVIDER',
  'RELEASE',
  'REPO',
  'RESILIENCE',
  'ROUTING',
  'SCALE',
  'SECURITY',
  'SURFACE',
  'TERMINAL',
  'TOOL',
  'TRUTH',
  'XPLAT',
]);

export const PRIORITIES = Object.freeze(['P0', 'P1', 'P2']);
export const STATES = Object.freeze([
  'OPEN',
  'READY',
  'IN_PROGRESS',
  'BLOCKED',
  'VERIFY',
  'DONE',
  'DEFERRED',
  'DISPOSED',
]);
export const GATES = Object.freeze(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7']);
export const TRUTH_KEYS = Object.freeze(['C', 'W', 'E', 'H', 'L', 'X', 'S']);
export const TRUTH_VALUES = Object.freeze(['1', '0', '~', '?', '-']);

export const LEDGER_COLUMNS = Object.freeze([
  'Order',
  'ID',
  'Parent',
  'Program',
  'Outcome',
  'Priority',
  'DependsOn',
  'Gate',
  'State',
  'Truth C/W/E/H/L/X/S',
  'Acceptance',
  'Evidence',
  'Updated',
]);

export const RECEIPT_COLUMNS = Object.freeze([
  'Receipt ID',
  'Work IDs',
  'Gate',
  'Exact manifest and baseline',
  'Owner decision',
  'Recorded',
  'State',
]);

export const BLOCKER_COLUMNS = Object.freeze([
  'Blocker code',
  'Work IDs',
  'Remedy IDs / authority',
]);

export const G7_REQUIRED_MANIFEST_KEYS = Object.freeze([
  'provider',
  'surface',
  'binary',
  'model',
  'stage',
  'authClass',
  'accountClass',
  'tenant',
  'project',
  'task',
  'attempt',
  'promptDataClass',
  'tools',
  'filesystem',
  'network',
  'maxWallClock',
  'authorizationTtl',
  'budget',
  'expiresAt',
  'fallback',
  'killRollback',
]);

const TERMINAL_STATES = new Set(['DONE', 'DISPOSED']);
const DEPENDENCY_SATISFIED_STATES = new Set(['DONE']);
const ALLOWED_STATE_TRANSITIONS = Object.freeze({
  OPEN: new Set(['OPEN', 'READY', 'BLOCKED', 'VERIFY', 'DEFERRED', 'DISPOSED']),
  READY: new Set(['READY', 'IN_PROGRESS', 'BLOCKED', 'OPEN', 'DISPOSED']),
  IN_PROGRESS: new Set(['IN_PROGRESS', 'VERIFY', 'BLOCKED', 'OPEN', 'DISPOSED']),
  BLOCKED: new Set(['BLOCKED', 'OPEN', 'READY', 'DEFERRED', 'DISPOSED']),
  VERIFY: new Set(['VERIFY', 'DONE', 'BLOCKED', 'OPEN', 'DISPOSED']),
  DEFERRED: new Set(['DEFERRED', 'OPEN', 'DISPOSED']),
  DONE: new Set(['DONE']),
  DISPOSED: new Set(['DISPOSED']),
});
const MUTATION_PROVENANCE_RE =
  /\bGR-\d{4}-\d{2}-\d{2}-[A-Z0-9][A-Z0-9-]*\b/g;
const RECEIPT_ID_RE =
  /^GR-(\d{4}-\d{2}-\d{2})-[A-Z0-9][A-Z0-9-]*$/;
const CANONICAL_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const BLOCKER_CODE_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_AUTHORITY_VALUES = new Set([
  '-',
  'n/a',
  'na',
  'none',
  'null',
  'pending',
  'rejected',
  'tbd',
  'todo',
  'unknown',
  'unapproved',
]);

/**
 * Normalize only line endings. A missing final newline remains meaningful drift.
 * @param {string} value
 */
export function normalizeLineEndings(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

/**
 * Stable source digest across Git LF/CRLF checkout policies.
 * @param {string} value
 */
export function normalizedSha256(value) {
  return createHash('sha256').update(normalizeLineEndings(value), 'utf8').digest('hex');
}

/**
 * Parse a Markdown pipe row. Only an escaped `\|` is a literal pipe; every
 * unescaped pipe is structural, including inside inline code. This is the
 * canonical pipe-lint rule and makes malformed rows fail loudly.
 *
 * @param {string} line
 * @returns {string[] | null}
 */
export function splitMarkdownRow(line) {
  const trimmed = String(line).trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  let terminalEscapeRun = 0;
  for (
    let index = trimmed.length - 2;
    index >= 0 && trimmed[index] === '\\';
    index -= 1
  ) {
    terminalEscapeRun += 1;
  }
  if (terminalEscapeRun % 2 === 1) return null;

  /** @type {string[]} */
  const cells = [];
  let current = '';

  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const char = trimmed[index];
    if (char === '\\') {
      let runEnd = index;
      while (trimmed[runEnd] === '\\') runEnd += 1;
      const runLength = runEnd - index;
      if (trimmed[runEnd] === '|' && runEnd < trimmed.length - 1) {
        current += '\\'.repeat(Math.floor(runLength / 2));
        if (runLength % 2 === 1) {
          current += '|';
        } else {
          cells.push(current.trim());
          current = '';
        }
        index = runEnd;
        continue;
      }
      current += '\\'.repeat(runLength);
      index = runEnd - 1;
      continue;
    }
    if (char === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** @param {string} value */
function stripInlineCode(value) {
  const trimmed = String(value).trim();
  if (trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** @param {string} value */
function parseCommaList(value) {
  return parseCommaListDetailed(value).items;
}

/** @param {string} value */
function parseCommaListDetailed(value) {
  const normalized = String(value).trim();
  if (normalized === '—') return { items: [], valid: true };
  if (!normalized) return { items: [], valid: false };
  const rawItems = normalized.split(',');
  const items = rawItems.map((item) => stripInlineCode(item));
  return {
    items: items.filter(Boolean),
    valid:
      rawItems.every((item) => Boolean(item.trim())) &&
      items.every((item) => Boolean(item) && item !== '—'),
  };
}

/**
 * Split semicolon-delimited authority segments without splitting structured
 * inline-code tokens whose payload contains semicolons.
 *
 * @param {string} value
 */
function splitAuthoritySegments(value) {
  const source = String(value);
  const segments = [];
  let start = 0;
  let inInlineCode = false;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '`' && source[index - 1] !== '\\') {
      inInlineCode = !inInlineCode;
    } else if (source[index] === ';' && !inInlineCode) {
      segments.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  segments.push(source.slice(start).trim());
  return segments.filter(Boolean);
}

/**
 * Parse semicolon-delimited key=value authority fields once. Keys are
 * case-insensitive and duplicates are retained as findings instead of silently
 * selecting a winner. Non-key prose/target segments are allowed.
 *
 * @param {string} value
 * @param {{
 *   ignoreManifestTargets?: boolean,
 *   ignoreReceiptReferences?: boolean
 * }} [options]
 */
function parseAuthorityFields(value, options = {}) {
  const fields = new Map();
  const keySpellings = new Map();
  const duplicates = [];
  const malformed = [];
  const unkeyed = [];
  let source = String(value);
  if (options.ignoreManifestTargets) {
    source = source.replace(
      /`[^`\r\n]+@(?:[a-f0-9]{64}|ABSENT)`/gi,
      '',
    );
  }
  if (options.ignoreReceiptReferences) {
    source = splitAuthoritySegments(source)
      .filter(
        (segment) =>
          !/^`receipt=GR-\d{4}-\d{2}-\d{2}-[A-Z0-9][A-Z0-9-]*`$/.test(
            segment,
          ),
      )
      .join(';');
  }
  for (const rawSegment of source.split(';')) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    if (!segment.includes('=')) {
      unkeyed.push(segment);
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9-]*)\s*=\s*(.*)$/.exec(segment);
    if (!match) {
      malformed.push(segment);
      continue;
    }
    const key = match[1].toLowerCase();
    const fieldValue = match[2].trim();
    if (!fieldValue) malformed.push(segment);
    if (fields.has(key)) duplicates.push(key);
    else {
      fields.set(key, fieldValue);
      keySpellings.set(key, match[1]);
    }
  }
  return { fields, keySpellings, duplicates, malformed, unkeyed };
}

/** @param {string} value */
function isRealIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Date.parse normalizes impossible calendar dates (for example February 31).
 * Validate every civil component before converting to an instant.
 *
 * @param {string} value
 * @returns {number | null}
 */
function strictRfc3339Ms(value) {
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , zone, offsetHour, offsetMinute] =
    match;
  if (!isRealIsoDate(`${year}-${month}-${day}`)) return null;
  if (
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    (zone !== 'Z' && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
  ) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** @param {string} state */
function parseReceiptLifecycle(state) {
  const match =
    /^`(ONE_SHOT|EXPIRING)`:\s*(active|consumed|expired|revoked)(?:@(\S+))?$/.exec(
      String(state).trim(),
    );
  if (!match) return null;
  const mode = match[1];
  const status = match[2];
  const transitionAt = match[3] ?? null;
  if (status === 'active' && transitionAt !== null) return null;
  if (status !== 'active' && transitionAt === null) return null;
  const transitionMs = transitionAt === null ? null : strictRfc3339Ms(transitionAt);
  if (transitionAt !== null && transitionMs === null) return null;
  return { mode, status, transitionAt, transitionMs };
}

/**
 * Canonical historical provenance is a single backticked, structured token.
 * Free prose containing “historical” never grants mutation authority.
 *
 * @param {string} evidence
 */
function parseHistoricalProvenance(evidence) {
  const source = String(evidence);
  const markerCount = (source.match(/\bhistorical-authority\b/gi) ?? []).length;
  const matches = splitAuthoritySegments(source)
    .map((segment) =>
      /^`historical-authority=([^;`\s]+);historical-gates=([^;`]+);proof=([^;`\s]+)`$/i.exec(
        segment,
      ),
    )
    .filter(Boolean);
  if (matches.length !== 1 || markerCount !== 1) return null;
  const gateList = parseCommaListDetailed(matches[0][2]);
  const gates = gateList.items;
  const authority = matches[0][1].trim();
  const proof = matches[0][3].trim();
  if (
    INVALID_AUTHORITY_VALUES.has(authority.toLowerCase()) ||
    INVALID_AUTHORITY_VALUES.has(proof.toLowerCase()) ||
    !gateList.valid ||
    gates.length === 0 ||
    new Set(gates).size !== gates.length ||
    gates.some((gate) => !GATES.includes(gate))
  ) {
    return null;
  }
  return { authority, gates, proof };
}

/**
 * Mutation provenance is authority-bearing data, never a free-text ID match.
 * Every receipt reference must be one exact backticked
 * `receipt=GR-YYYY-MM-DD-...` token. Raw/negated GR markers therefore cannot
 * accidentally grant authority.
 *
 * @param {string} evidence
 */
function parseEvidenceReceiptRefs(evidence) {
  const source = String(evidence);
  const structured = splitAuthoritySegments(source)
    .map((segment) =>
      /^`receipt=(GR-\d{4}-\d{2}-\d{2}-[A-Z0-9][A-Z0-9-]*)`$/.exec(
        segment,
      ),
    )
    .filter(Boolean);
  const rawMatches = [...source.matchAll(MUTATION_PROVENANCE_RE)];
  const refs = structured.map((match) => match[1]);
  const structuredCounts = new Map();
  for (const receiptId of refs) {
    structuredCounts.set(receiptId, (structuredCounts.get(receiptId) ?? 0) + 1);
  }
  const observedCounts = new Map();
  const unstructured = [];
  for (const match of rawMatches) {
    const receiptId = match[0];
    const observed = (observedCounts.get(receiptId) ?? 0) + 1;
    observedCounts.set(receiptId, observed);
    if (observed > (structuredCounts.get(receiptId) ?? 0)) {
      unstructured.push(receiptId);
    }
  }
  const duplicates = refs.filter((receiptId, index) => refs.indexOf(receiptId) !== index);
  return {
    refs: [...new Set(refs)],
    duplicates: [...new Set(duplicates)],
    unstructured,
  };
}

/** @param {string} evidence */
function hasExplicitProof(evidence) {
  const relevantSegments = splitAuthoritySegments(evidence).filter(
    (segment) =>
      !/^`historical-authority=[^`]+`$/i.test(segment),
  );
  const matches = relevantSegments
    .map((segment) =>
      /^`proof=([A-Za-z0-9][A-Za-z0-9._:/-]*)`$/.exec(segment),
    )
    .filter(Boolean);
  const markerCount = (
    relevantSegments.join(';').match(/\bproof\s*=/gi) ?? []
  ).length;
  return (
    matches.length === 1 &&
    markerCount === 1 &&
    !INVALID_AUTHORITY_VALUES.has(matches[0][1].trim().toLowerCase())
  );
}

/** @param {string} value */
function looksLikeRepositoryPath(value) {
  const normalized = String(value).trim();
  return (
    normalized.includes('/') ||
    /^(?:\.[^/\s]+|[^/\s]+\.[A-Za-z0-9][A-Za-z0-9._-]*)$/.test(normalized)
  );
}

/** @param {string} value */
function isMeaningfulLedgerText(value) {
  const normalized = String(value).trim();
  if (
    normalized.length < 3 ||
    normalized.length > 10_000 ||
    /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(normalized) ||
    /^(?:—|-|n\/?a|none|null|unknown|pending|todo|tbd|yok|bekliyor)$/i.test(
      stripInlineCode(normalized),
    )
  ) {
    return false;
  }
  const semanticTokens = normalized.match(/[\p{L}\p{N}][\p{L}\p{N}._:/+-]*/gu) ?? [];
  return (
    semanticTokens.length >= 2 ||
    CANONICAL_ID_RE.test(stripInlineCode(normalized)) ||
    looksLikeRepositoryPath(stripInlineCode(normalized))
  );
}

/** @param {string} manifest */
function parseManifestTargets(manifest) {
  return [
    ...String(manifest).matchAll(/`([^`\r\n]+)@([a-f0-9]{64}|ABSENT)`/gi),
  ].map((match) => ({
    path: match[1],
    baseline:
      match[2].toUpperCase() === 'ABSENT' ? 'ABSENT' : match[2].toLowerCase(),
  }));
}

/** @param {string} value */
function portablePathKey(value) {
  return String(value).normalize('NFKC').toUpperCase();
}

/** @param {string | undefined} value */
function isBoundedAuthorityToken(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 160 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/,+-]*$/.test(value) &&
    !INVALID_AUTHORITY_VALUES.has(value.toLowerCase())
  );
}

/** @param {string | undefined} value */
function isLowercaseAuthorityToken(value) {
  return (
    isBoundedAuthorityToken(value) &&
    /^[a-z0-9][a-z0-9._:/,+-]*$/.test(value ?? '')
  );
}

/** @param {string | undefined} value */
function parseBoundedDurationMs(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,12})(ms|s|m|h|d)$/.exec(value);
  if (!match) return null;
  const amount = BigInt(match[1]);
  const multiplier = {
    ms: 1n,
    s: 1_000n,
    m: 60_000n,
    h: 3_600_000n,
    d: 86_400_000n,
  }[match[2]];
  const duration = amount * multiplier;
  return duration > 0n && duration <= 604_800_000n
    ? Number(duration)
    : null;
}

/** @param {string | undefined} value */
function parseBoundedBudget(value) {
  if (typeof value !== 'string') return null;
  const match =
    /^([1-9]\d{0,18})@([a-z][a-z0-9._:-]{1,127})#([a-f0-9]{64})$/.exec(
      value,
    );
  if (!match) return null;
  const amount = BigInt(match[1]);
  return amount <= 9_223_372_036_854_775_807n
    ? { amount: match[1], unit: match[2], policyDigest: match[3] }
    : null;
}

/**
 * @param {Map<string, string>} fields
 * @param {GateReceipt} receipt
 * @returns {string[]}
 */
function validateG7Manifest(fields, receipt) {
  const issues = [];
  const lowercaseTokenKeys = [
    'provider',
    'surface',
    'model',
    'authclass',
    'accountclass',
    'tenant',
    'project',
    'attempt',
    'promptdataclass',
    'filesystem',
    'fallback',
    'killrollback',
  ];
  for (const key of lowercaseTokenKeys) {
    const value = fields.get(key);
    if (!isLowercaseAuthorityToken(value)) {
      issues.push(
        `${key} must be a bounded lowercase canonical internal identifier`,
      );
    }
  }
  const binary = fields.get('binary');
  if (
    !binary ||
    !(
      /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(binary) ||
      /^sha256:[a-f0-9]{64}$/.test(binary)
    )
  ) {
    issues.push('binary must be an exact semantic version or sha256 digest');
  }
  const stage = fields.get('stage');
  if (!stage || !CANONICAL_ID_RE.test(stage)) {
    issues.push('stage must be a canonical upper-kebab ID');
  }
  if (receipt.workIds.length !== 1) {
    issues.push('a G7 receipt must bind exactly one Work ID');
  } else if (fields.get('task') !== receipt.workIds[0]) {
    issues.push('task must equal the receipt Work ID');
  }
  if (parseBoundedDurationMs(fields.get('maxwallclock')) === null) {
    issues.push('maxWallClock must be positive, finite and no greater than 7d');
  }
  if (parseBoundedBudget(fields.get('budget')) === null) {
    issues.push(
      'budget must be <positive-int64>@<canonical-unit>#<sha256-policy-digest>',
    );
  }
  const tools = fields.get('tools');
  if (
    tools &&
    tools !== 'none' &&
    !tools.split(',').every((tool) => isBoundedAuthorityToken(tool))
  ) {
    issues.push('tools must be none or a comma-delimited canonical tool list');
  }
  const filesystem = fields.get('filesystem');
  if (
    filesystem &&
    !new Set([
      'no-access',
      'read-only',
      'workspace-write',
      'sandboxed-write',
      'full-access',
    ]).has(filesystem)
  ) {
    issues.push('filesystem must use a canonical access class');
  }
  const network = fields.get('network');
  if (
    network &&
    !new Set(['none', 'provider-only', 'restricted', 'full']).has(network) &&
    !/^allowlist:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(network)
  ) {
    issues.push('network must use a canonical access class or allowlist:<id>');
  }
  return issues;
}

/**
 * @typedef {{
 *   code: string,
 *   message: string,
 *   line?: number,
 *   workId?: string
 * }} ValidationFinding
 */

/**
 * @typedef {{
 *   order: number,
 *   id: string,
 *   parent: string,
 *   program: string,
 *   outcome: string,
 *   priority: string,
 *   dependsOn: string[],
 *   gates: string[],
 *   state: string,
 *   truth: string[],
 *   acceptance: string,
 *   evidence: string,
 *   updated: string,
 *   sectionRoot: string,
 *   line: number
 * }} WorkItem
 */

/**
 * @typedef {{
 *   id: string,
 *   workIds: string[],
 *   gates: string[],
 *   manifest: string,
 *   ownerDecision: string,
 *   recorded: string,
 *   state: string,
 *   active: boolean,
 *   ownerApproved?: boolean,
 *   validAuthority?: boolean,
 *   manifestTargets?: { path: string, baseline: string }[],
 *   lifecycle?: ReturnType<typeof parseReceiptLifecycle>,
 *   line: number
 * }} GateReceipt
 */

/**
 * @typedef {{
 *   code: string,
 *   workIds: string[],
 *   remedy: string,
 *   line: number
 * }} TypedBlocker
 */

/**
 * @param {ValidationFinding[]} findings
 * @param {string} code
 * @param {string} message
 * @param {number | undefined} line
 * @param {string | undefined} workId
 */
function addFinding(findings, code, message, line, workId) {
  findings.push({
    code,
    message,
    ...(line === undefined ? {} : { line }),
    ...(workId === undefined ? {} : { workId }),
  });
}

/**
 * @param {string[]} lines
 * @param {string} heading
 * @param {ValidationFinding[]} findings
 */
function requireHeading(lines, heading, findings) {
  const indexes = [];
  lines.forEach((line, index) => {
    if (line.trim() === heading) indexes.push(index);
  });
  if (indexes.length !== 1) {
    addFinding(
      findings,
      'SECTION_CARDINALITY',
      `${heading} must exist exactly once; found ${indexes.length}`,
      undefined,
      undefined,
    );
    return -1;
  }
  return indexes[0];
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @param {readonly string[]} expectedColumns
 * @param {string} tableName
 * @param {ValidationFinding[]} findings
 */
function validateTableHeaders(lines, start, end, expectedColumns, tableName, findings) {
  const matchingLines = [];
  for (let index = start; index < end; index += 1) {
    const cells = splitMarkdownRow(lines[index]);
    if (!cells) continue;
    if (cells[0] === expectedColumns[0]) {
      matchingLines.push({ line: index + 1, cells });
    }
  }
  for (const match of matchingLines) {
    if (
      match.cells.length !== expectedColumns.length ||
      expectedColumns.some((column, index) => match.cells[index] !== column)
    ) {
      addFinding(
        findings,
        'TABLE_HEADER_SCHEMA',
        `${tableName} header must exactly match the canonical ${expectedColumns.length}-column schema`,
        match.line,
        undefined,
      );
    }
  }
  return matchingLines;
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @param {ValidationFinding[]} findings
 * @returns {WorkItem[]}
 */
function parseLedger(lines, start, end, findings) {
  const sectionHeadings = [];
  for (let index = start; index < end; index += 1) {
    const match = /^### (P\d{2})\b/.exec(lines[index].trim());
    if (match) sectionHeadings.push({ root: match[1], line: index + 1, index });
  }

  const roots = sectionHeadings.map((heading) => heading.root);
  if (
    roots.length !== PROGRAM_ROOTS.length ||
    PROGRAM_ROOTS.some((root, index) => roots[index] !== root)
  ) {
    addFinding(
      findings,
      'PROGRAM_SECTION_ORDER',
      `ledger program sections must appear exactly once in order: ${PROGRAM_ROOTS.join(', ')}`,
      undefined,
      undefined,
    );
  }
  const firstSectionIndex = sectionHeadings[0]?.index ?? end;
  for (let index = start + 1; index < firstSectionIndex; index += 1) {
    if (lines[index].trim()) {
      addFinding(
        findings,
        'LEDGER_PREAMBLE_CONTENT',
        'canonical ledger may contain only blank lines before the P00 section',
        index + 1,
        undefined,
      );
    }
  }

  const headers = validateTableHeaders(
    lines,
    start,
    end,
    LEDGER_COLUMNS,
    'canonical ledger',
    findings,
  );
  if (headers.length !== PROGRAM_ROOTS.length) {
    addFinding(
      findings,
      'LEDGER_HEADER_CARDINALITY',
      `canonical ledger must contain ${PROGRAM_ROOTS.length} exact headers; found ${headers.length}`,
      undefined,
      undefined,
    );
  }

  /** @type {WorkItem[]} */
  const items = [];
  for (let sectionIndex = 0; sectionIndex < sectionHeadings.length; sectionIndex += 1) {
    const section = sectionHeadings[sectionIndex];
    const sectionEnd = sectionHeadings[sectionIndex + 1]?.index ?? end;
    const headerIndexes = [];
    for (let index = section.index + 1; index < sectionEnd; index += 1) {
      const cells = splitMarkdownRow(lines[index]);
      if (
        cells &&
        cells.length === LEDGER_COLUMNS.length &&
        LEDGER_COLUMNS.every((column, cellIndex) => cells[cellIndex] === column)
      ) {
        headerIndexes.push(index);
      }
    }
    if (headerIndexes.length !== 1) {
      addFinding(
        findings,
        'PROGRAM_LEDGER_HEADER',
        `${section.root} must contain exactly one canonical ledger header; found ${headerIndexes.length}`,
        section.line,
        undefined,
      );
      continue;
    }
    const headerIndex = headerIndexes[0];
    for (let index = section.index + 1; index < headerIndex; index += 1) {
      const trimmed = lines[index].trim();
      if (trimmed.startsWith('|') || trimmed.endsWith('|')) {
        addFinding(
          findings,
          'PROGRAM_PREHEADER_ROW',
          `${section.root} table-like content cannot appear before its canonical header`,
          index + 1,
          undefined,
        );
      }
    }
    let separatorIndex = headerIndex + 1;
    while (separatorIndex < sectionEnd && !lines[separatorIndex].trim()) separatorIndex += 1;
    const separatorCells = splitMarkdownRow(lines[separatorIndex] ?? '');
    if (
      !separatorCells ||
      separatorCells.length !== LEDGER_COLUMNS.length ||
      separatorCells.some((cell) => !/^:?-{3,}:?$/.test(cell))
    ) {
      addFinding(
        findings,
        'LEDGER_SEPARATOR_SCHEMA',
        `${section.root} ledger separator must contain ${LEDGER_COLUMNS.length} Markdown separator cells`,
        separatorIndex + 1,
        undefined,
      );
      continue;
    }

    for (let index = separatorIndex + 1; index < sectionEnd; index += 1) {
      const line = lines[index];
      if (!line.trim()) continue;
      if (!line.trimStart().startsWith('|') || !line.trimEnd().endsWith('|')) {
        addFinding(
          findings,
          'LEDGER_ROW_SYNTAX',
          `${section.root} ledger row must have leading and trailing pipes`,
          index + 1,
          undefined,
        );
        continue;
      }
      const cells = splitMarkdownRow(line);
      if (!cells || cells.length !== LEDGER_COLUMNS.length) {
        addFinding(
          findings,
          'LEDGER_COLUMN_COUNT',
          `ledger row must contain exactly ${LEDGER_COLUMNS.length} cells; found ${cells?.length ?? 0}`,
          index + 1,
          undefined,
        );
        continue;
      }
      if (!/^\d+$/.test(cells[0])) {
        addFinding(
          findings,
          'ORDER_FORMAT',
          `ledger Order cell must be an unsigned integer; got ${cells[0] || '<empty>'}`,
          index + 1,
          stripInlineCode(cells[1] ?? '') || undefined,
        );
        continue;
      }
      const order = Number(cells[0]);
      const workId = stripInlineCode(cells[1]);
      const dependencies = parseCommaListDetailed(cells[6]);
      const gates = parseCommaListDetailed(cells[7]);
      if (!dependencies.valid) {
        addFinding(
          findings,
          'DEPENDENCY_LIST_FORMAT',
          'DependsOn must be `—` or a comma-delimited list without empty segments',
          index + 1,
          workId || undefined,
        );
      }
      if (!gates.valid) {
        addFinding(
          findings,
          'GATE_LIST_FORMAT',
          'Gate must be a comma-delimited list without empty segments',
          index + 1,
          workId || undefined,
        );
      }
      items.push({
        order,
        id: workId,
        parent: stripInlineCode(cells[2]),
        program: stripInlineCode(cells[3]),
        outcome: cells[4],
        priority: stripInlineCode(cells[5]),
        dependsOn: dependencies.items,
        gates: gates.items,
        state: stripInlineCode(cells[8]),
        truth: cells[9].split('/').map((value) => value.trim()),
        acceptance: cells[10],
        evidence: cells[11],
        updated: stripInlineCode(cells[12]),
        sectionRoot: section.root,
        line: index + 1,
      });
    }
  }
  if (items.length === 0) {
    addFinding(findings, 'LEDGER_EMPTY', 'canonical ledger has no work rows', undefined, undefined);
  }
  return items;
}

/**
 * A ledger-shaped row anywhere outside the parsed §7 program bodies is a
 * competing/shadow work authority, not harmless prose.
 *
 * @param {string[]} lines
 * @param {WorkItem[]} items
 * @param {ValidationFinding[]} findings
 */
function detectShadowLedgerRows(lines, items, findings) {
  const parsedLines = new Set(items.map((item) => item.line));
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const cells = splitMarkdownRow(line);
    const looseIdentity =
      /^\s*\|?\s*(\d+)\s*\|\s*`?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)`?\s*\|/.exec(
        line,
      );
    const order = cells?.[0] ?? looseIdentity?.[1] ?? '';
    const workId = stripInlineCode(cells?.[1] ?? looseIdentity?.[2] ?? '');
    if (
      /^\d+$/.test(order) &&
      CANONICAL_ID_RE.test(workId) &&
      !parsedLines.has(index + 1)
    ) {
      addFinding(
        findings,
        'SHADOW_LEDGER_ROW',
        `ledger-shaped Work ID ${workId} exists outside a canonical §7 program body`,
        index + 1,
        workId,
      );
    }
  }
}

/**
 * Canonical-looking receipt/blocker rows outside their single authority
 * registers are competing ledgers. Exact row shape plus canonical identity
 * avoids treating ordinary prose/examples as authority.
 *
 * @param {string[]} lines
 * @param {GateReceipt[]} receipts
 * @param {TypedBlocker[]} blockers
 * @param {ValidationFinding[]} findings
 */
function detectShadowAuthorityRows(lines, receipts, blockers, findings) {
  const receiptLines = new Set(receipts.map((receipt) => receipt.line));
  const blockerLines = new Set(blockers.map((blocker) => blocker.line));
  for (let index = 0; index < lines.length; index += 1) {
    const cells = splitMarkdownRow(lines[index]);
    if (!cells) continue;
    const line = index + 1;
    const firstCell = stripInlineCode(cells[0] ?? '');
    if (
      cells.length === RECEIPT_COLUMNS.length &&
      RECEIPT_ID_RE.test(firstCell) &&
      !receiptLines.has(line)
    ) {
      addFinding(
        findings,
        'SHADOW_RECEIPT_ROW',
        `receipt-shaped authority ${firstCell} exists outside canonical §3.4`,
        line,
        undefined,
      );
    }
    const workIds =
      cells.length === BLOCKER_COLUMNS.length ? parseCommaList(cells[1]) : [];
    if (
      cells.length === BLOCKER_COLUMNS.length &&
      BLOCKER_CODE_RE.test(firstCell) &&
      workIds.length > 0 &&
      workIds.every((workId) => CANONICAL_ID_RE.test(workId)) &&
      Boolean(cells[2]?.trim()) &&
      !blockerLines.has(line)
    ) {
      addFinding(
        findings,
        'SHADOW_BLOCKER_ROW',
        `blocker-shaped authority ${firstCell} exists outside canonical §3.5`,
        line,
        undefined,
      );
    }
  }
}

/**
 * Resolve and validate the body bounds of a single canonical register table.
 * Every nonblank line after the separator belongs to the table; this prevents a
 * missing leading/trailing pipe from silently dropping an authority row.
 *
 * @param {string[]} lines
 * @param {{ line: number, cells: string[] }[]} headers
 * @param {number} sectionStart
 * @param {number} end
 * @param {readonly string[]} columns
 * @param {string} codePrefix
 * @param {ValidationFinding[]} findings
 */
function registerBodyBounds(
  lines,
  headers,
  sectionStart,
  end,
  columns,
  codePrefix,
  findings,
) {
  if (headers.length !== 1) return null;
  const headerIndex = headers[0].line - 1;
  for (let index = sectionStart + 1; index < headerIndex; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith('|') || trimmed.endsWith('|')) {
      addFinding(
        findings,
        `${codePrefix}_PREHEADER_ROW`,
        `${codePrefix.toLowerCase()} table-like content cannot appear before its canonical header`,
        index + 1,
        undefined,
      );
    }
  }
  let separatorIndex = headerIndex + 1;
  while (separatorIndex < end && !lines[separatorIndex].trim()) separatorIndex += 1;
  const separator = splitMarkdownRow(lines[separatorIndex] ?? '');
  if (
    !separator ||
    separator.length !== columns.length ||
    separator.some((cell) => !/^:?-{3,}:?$/.test(cell))
  ) {
    addFinding(
      findings,
      `${codePrefix}_SEPARATOR_SCHEMA`,
      `${codePrefix.toLowerCase()} separator must contain ${columns.length} Markdown cells`,
      separatorIndex + 1,
      undefined,
    );
    return null;
  }
  return { start: separatorIndex + 1, end };
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @param {ValidationFinding[]} findings
 * @returns {GateReceipt[]}
 */
function parseReceipts(lines, start, end, findings) {
  const headers = validateTableHeaders(
    lines,
    start,
    end,
    RECEIPT_COLUMNS,
    'receipt register',
    findings,
  );
  if (headers.length !== 1) {
    addFinding(
      findings,
      'RECEIPT_HEADER_CARDINALITY',
      `receipt register must contain exactly one header; found ${headers.length}`,
      undefined,
      undefined,
    );
  }
  const bounds = registerBodyBounds(
    lines,
    headers,
    start,
    end,
    RECEIPT_COLUMNS,
    'RECEIPT',
    findings,
  );

  /** @type {GateReceipt[]} */
  const receipts = [];
  if (!bounds) return receipts;
  for (let index = bounds.start; index < bounds.end; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (!line.trimStart().startsWith('|') || !line.trimEnd().endsWith('|')) {
      addFinding(
        findings,
        'RECEIPT_ROW_SYNTAX',
        'receipt row must have leading and trailing pipes',
        index + 1,
        undefined,
      );
      continue;
    }
    const cells = splitMarkdownRow(line);
    if (!cells || cells.length !== RECEIPT_COLUMNS.length) {
      addFinding(
        findings,
        'RECEIPT_COLUMN_COUNT',
        `receipt row must contain exactly ${RECEIPT_COLUMNS.length} cells; found ${cells?.length ?? 0}`,
        index + 1,
        undefined,
      );
      continue;
    }
    const state = cells[6];
    const lifecycle = parseReceiptLifecycle(state);
    const workIds = parseCommaListDetailed(cells[1]);
    const gates = parseCommaListDetailed(cells[2]);
    if (!workIds.valid) {
      addFinding(
        findings,
        'RECEIPT_WORK_LIST_FORMAT',
        'receipt Work IDs must be a comma-delimited list without empty segments',
        index + 1,
        undefined,
      );
    }
    if (!gates.valid) {
      addFinding(
        findings,
        'RECEIPT_GATE_LIST_FORMAT',
        'receipt Gate must be a comma-delimited list without empty segments',
        index + 1,
        undefined,
      );
    }
    receipts.push({
      id: stripInlineCode(cells[0]),
      workIds: workIds.items,
      gates: gates.items,
      manifest: cells[3],
      ownerDecision: cells[4],
      recorded: stripInlineCode(cells[5]),
      state,
      active: lifecycle?.status === 'active',
      lifecycle,
      line: index + 1,
    });
  }
  return receipts;
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @param {ValidationFinding[]} findings
 * @returns {TypedBlocker[]}
 */
function parseBlockers(lines, start, end, findings) {
  const headers = validateTableHeaders(
    lines,
    start,
    end,
    BLOCKER_COLUMNS,
    'typed blocker register',
    findings,
  );
  if (headers.length !== 1) {
    addFinding(
      findings,
      'BLOCKER_HEADER_CARDINALITY',
      `typed blocker register must contain exactly one header; found ${headers.length}`,
      undefined,
      undefined,
    );
  }
  const bounds = registerBodyBounds(
    lines,
    headers,
    start,
    end,
    BLOCKER_COLUMNS,
    'BLOCKER',
    findings,
  );

  /** @type {TypedBlocker[]} */
  const blockers = [];
  if (!bounds) return blockers;
  for (let index = bounds.start; index < bounds.end; index += 1) {
    if (!lines[index].trim()) continue;
    if (!lines[index].trimStart().startsWith('|') || !lines[index].trimEnd().endsWith('|')) {
      addFinding(
        findings,
        'BLOCKER_ROW_SYNTAX',
        'blocker row must have leading and trailing pipes',
        index + 1,
        undefined,
      );
      continue;
    }
    const cells = splitMarkdownRow(lines[index]);
    if (!cells || cells.length !== BLOCKER_COLUMNS.length) {
      addFinding(
        findings,
        'BLOCKER_COLUMN_COUNT',
        `blocker row must contain exactly ${BLOCKER_COLUMNS.length} cells; found ${cells?.length ?? 0}`,
        index + 1,
        undefined,
      );
      continue;
    }
    const code = stripInlineCode(cells[0]);
    const workIds = parseCommaListDetailed(cells[1]);
    if (!workIds.valid) {
      addFinding(
        findings,
        'BLOCKER_WORK_LIST_FORMAT',
        'blocker Work IDs must be a comma-delimited list without empty segments',
        index + 1,
        undefined,
      );
    }
    blockers.push({
      code,
      workIds: workIds.items,
      remedy: cells[2],
      line: index + 1,
    });
  }
  return blockers;
}

/**
 * @param {Map<string, Set<string>>} adjacency
 * @returns {string[] | null}
 */
function findGraphCycle(adjacency) {
  /** @type {Map<string, 0 | 1 | 2>} */
  const colors = new Map();
  for (const start of adjacency.keys()) {
    if ((colors.get(start) ?? 0) !== 0) continue;
    /** @type {{ node: string, neighbors: string[], index: number }[]} */
    const frames = [
      { node: start, neighbors: [...(adjacency.get(start) ?? [])], index: 0 },
    ];
    const path = [start];
    const pathIndex = new Map([[start, 0]]);
    colors.set(start, 1);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame.index >= frame.neighbors.length) {
        colors.set(frame.node, 2);
        frames.pop();
        pathIndex.delete(frame.node);
        path.pop();
        continue;
      }

      const next = frame.neighbors[frame.index];
      frame.index += 1;
      const color = colors.get(next) ?? 0;
      if (color === 1) {
        const cycleStart = pathIndex.get(next);
        return [
          ...path.slice(cycleStart === undefined ? 0 : cycleStart),
          next,
        ];
      }
      if (color === 2) continue;
      colors.set(next, 1);
      pathIndex.set(next, path.length);
      path.push(next);
      frames.push({
        node: next,
        neighbors: [...(adjacency.get(next) ?? [])],
        index: 0,
      });
    }
  }
  return null;
}

/**
 * @param {WorkItem[]} items
 * @param {GateReceipt[]} receipts
 * @param {TypedBlocker[]} blockers
 * @param {ValidationFinding[]} findings
 * @param {number} nowMs
 * @param {string | undefined} repositoryRoot
 * @param {'disk' | 'structural-only'} baselineMode
 */
function validateLedger(
  items,
  receipts,
  blockers,
  findings,
  nowMs,
  repositoryRoot,
  baselineMode,
) {
  const itemById = new Map();
  const orderSeen = new Map();
  const validationDate = new Date(nowMs).toISOString().slice(0, 10);
  let previousOrder = -Infinity;

  for (const item of items) {
    if (!Number.isSafeInteger(item.order) || item.order <= 0) {
      addFinding(
        findings,
        'ORDER_FORMAT',
        `Order must be a positive safe integer; got ${item.order}`,
        item.line,
        item.id,
      );
    }
    if (item.order <= previousOrder) {
      addFinding(
        findings,
        'ORDER_NOT_STRICT',
        `Order ${item.order} must be strictly greater than previous Order ${previousOrder}`,
        item.line,
        item.id,
      );
    }
    previousOrder = item.order;
    if (orderSeen.has(item.order)) {
      addFinding(
        findings,
        'ORDER_DUPLICATE',
        `Order ${item.order} is also used by ${orderSeen.get(item.order)}`,
        item.line,
        item.id,
      );
    } else {
      orderSeen.set(item.order, item.id);
    }

    if (!CANONICAL_ID_RE.test(item.id) || PROGRAM_ROOTS.includes(item.id)) {
      addFinding(
        findings,
        'ID_FORMAT',
        `ID must be canonical upper-kebab and must not collide with a program root: ${item.id}`,
        item.line,
        item.id,
      );
    }
    if (itemById.has(item.id)) {
      addFinding(
        findings,
        'ID_DUPLICATE',
        `ID ${item.id} is duplicated`,
        item.line,
        item.id,
      );
    } else {
      itemById.set(item.id, item);
    }

    if (!PROGRAMS.includes(item.program)) {
      addFinding(
        findings,
        'PROGRAM_ENUM',
        `Program ${item.program} is not in the canonical program enum`,
        item.line,
        item.id,
      );
    }
    if (!PRIORITIES.includes(item.priority)) {
      addFinding(
        findings,
        'PRIORITY_ENUM',
        `Priority ${item.priority} is not one of ${PRIORITIES.join(', ')}`,
        item.line,
        item.id,
      );
    }
    if (!STATES.includes(item.state)) {
      addFinding(
        findings,
        'STATE_ENUM',
        `State ${item.state} is not canonical`,
        item.line,
        item.id,
      );
    }
    if (item.gates.length === 0) {
      addFinding(findings, 'GATE_EMPTY', 'Gate must contain at least one gate', item.line, item.id);
    }
    if (new Set(item.gates).size !== item.gates.length) {
      addFinding(findings, 'GATE_DUPLICATE', 'Gate list contains duplicates', item.line, item.id);
    }
    for (const gate of item.gates) {
      if (!GATES.includes(gate)) {
        addFinding(
          findings,
          'GATE_ENUM',
          `Gate ${gate} is not one of ${GATES.join(', ')}`,
          item.line,
          item.id,
        );
      }
    }
    if (
      item.truth.length !== TRUTH_KEYS.length ||
      item.truth.some((value) => !TRUTH_VALUES.includes(value))
    ) {
      addFinding(
        findings,
        'TRUTH_SHAPE',
        `Truth must contain ${TRUTH_KEYS.length} values from ${TRUTH_VALUES.join(', ')}`,
        item.line,
        item.id,
      );
    }
    if (!item.outcome || !item.acceptance || !item.evidence) {
      addFinding(
        findings,
        'REQUIRED_TEXT_EMPTY',
        'Outcome, Acceptance and Evidence must be non-empty',
        item.line,
        item.id,
      );
    }
    for (const [field, value] of [
      ['Outcome', item.outcome],
      ['Acceptance', item.acceptance],
      ['Evidence', item.evidence],
    ]) {
      if (!isMeaningfulLedgerText(value)) {
        addFinding(
          findings,
          'REQUIRED_TEXT_PLACEHOLDER',
          `${field} must be bounded, visible and semantically non-placeholder`,
          item.line,
          item.id,
        );
      }
    }
    if (!isRealIsoDate(item.updated) || item.updated > validationDate) {
      addFinding(
        findings,
        'UPDATED_DATE',
        `Updated must be a real, non-future YYYY-MM-DD date; got ${item.updated}`,
        item.line,
        item.id,
      );
    }
    if (new Set(item.dependsOn).size !== item.dependsOn.length) {
      addFinding(
        findings,
        'DEPENDENCY_DUPLICATE',
        'DependsOn contains a duplicate ID',
        item.line,
        item.id,
      );
    }
  }

  /** @type {Map<string, Set<string>>} */
  const closureGraph = new Map(items.map((item) => [item.id, new Set()]));
  /** @type {Map<string, WorkItem[]>} */
  const childrenByParent = new Map();

  for (const item of items) {
    if (item.parent === item.id) {
      addFinding(findings, 'PARENT_SELF', 'Work item cannot parent itself', item.line, item.id);
    } else if (!PROGRAM_ROOTS.includes(item.parent) && !itemById.has(item.parent)) {
      addFinding(
        findings,
        'PARENT_MISSING',
        `Parent ${item.parent} is neither a program root nor a canonical Work ID`,
        item.line,
        item.id,
      );
    } else if (itemById.has(item.parent)) {
      const children = childrenByParent.get(item.parent) ?? [];
      children.push(item);
      childrenByParent.set(item.parent, children);
      closureGraph.get(item.parent)?.add(item.id);
    }

    for (const dependency of item.dependsOn) {
      if (dependency === item.id) {
        addFinding(
          findings,
          'DEPENDENCY_SELF',
          'Work item cannot depend on itself',
          item.line,
          item.id,
        );
        continue;
      }
      if (PROGRAM_ROOTS.includes(dependency)) {
        addFinding(
          findings,
          'DEPENDENCY_PROGRAM_ROOT',
          `DependsOn cannot reference grouping node ${dependency}`,
          item.line,
          item.id,
        );
        continue;
      }
      if (!itemById.has(dependency)) {
        addFinding(
          findings,
          'DEPENDENCY_MISSING',
          `DependsOn references missing Work ID ${dependency}`,
          item.line,
          item.id,
        );
        continue;
      }
      closureGraph.get(item.id)?.add(dependency);
    }
  }

  const cycle = findGraphCycle(closureGraph);
  if (cycle) {
    addFinding(
      findings,
      'CLOSURE_CYCLE',
      `combined dependency + aggregate-parent closure graph has a cycle: ${cycle.join(' -> ')}`,
      undefined,
      cycle[0],
    );
  }

  const rootByWorkId = new Map();
  for (const item of items) {
    if (rootByWorkId.has(item.id)) continue;
    const unresolvedPath = [];
    const pathIds = new Set();
    let cursor = item;
    let resolvedRoot = '';
    while (cursor) {
      if (rootByWorkId.has(cursor.id)) {
        resolvedRoot = rootByWorkId.get(cursor.id) ?? '';
        break;
      }
      if (pathIds.has(cursor.id)) break;
      pathIds.add(cursor.id);
      unresolvedPath.push(cursor);
      if (PROGRAM_ROOTS.includes(cursor.parent)) {
        resolvedRoot = cursor.parent;
        break;
      }
      cursor = itemById.get(cursor.parent);
    }
    for (const unresolved of unresolvedPath) {
      rootByWorkId.set(unresolved.id, resolvedRoot);
    }
  }
  for (const item of items) {
    const resolvedRoot = rootByWorkId.get(item.id) ?? '';
    if (resolvedRoot && item.sectionRoot !== resolvedRoot) {
      addFinding(
        findings,
        'PROGRAM_SECTION_SCOPE',
        `${item.id} resolves to ${resolvedRoot} but is listed under ${item.sectionRoot || '<none>'}`,
        item.line,
        item.id,
      );
    }
  }

  const receiptById = new Map();
  const g7AttemptKeys = new Set();
  for (const receipt of receipts) {
    const receiptFindingStart = findings.length;
    const receiptIdMatch = RECEIPT_ID_RE.exec(receipt.id);
    if (!receiptIdMatch) {
      addFinding(
        findings,
        'RECEIPT_ID_FORMAT',
        `Receipt ID is not canonical: ${receipt.id}`,
        receipt.line,
        undefined,
      );
    }
    if (receiptById.has(receipt.id)) {
      addFinding(
        findings,
        'RECEIPT_DUPLICATE',
        `Receipt ${receipt.id} is duplicated`,
        receipt.line,
        undefined,
      );
    } else {
      receiptById.set(receipt.id, receipt);
    }
    if (receipt.workIds.length === 0) {
      addFinding(
        findings,
        'RECEIPT_WORK_EMPTY',
        `Receipt ${receipt.id} has no Work IDs`,
        receipt.line,
        undefined,
      );
    }
    if (new Set(receipt.workIds).size !== receipt.workIds.length) {
      addFinding(
        findings,
        'RECEIPT_WORK_DUPLICATE',
        `Receipt ${receipt.id} repeats a Work ID`,
        receipt.line,
        undefined,
      );
    }
    if (receipt.gates.length === 0 || new Set(receipt.gates).size !== receipt.gates.length) {
      addFinding(
        findings,
        'RECEIPT_GATE_SHAPE',
        `Receipt ${receipt.id} must contain a non-empty unique gate list`,
        receipt.line,
        undefined,
      );
    }
    for (const gate of receipt.gates) {
      if (!GATES.includes(gate) || gate === 'G0') {
        addFinding(
          findings,
          'RECEIPT_GATE_ENUM',
          `Receipt ${receipt.id} uses invalid mutation gate ${gate}`,
          receipt.line,
          undefined,
        );
      }
    }
    const manifestAuthority = parseAuthorityFields(receipt.manifest, {
      ignoreManifestTargets: true,
    });
    if (manifestAuthority.duplicates.length > 0) {
      addFinding(
        findings,
        'RECEIPT_MANIFEST_FIELD_DUPLICATE',
        `Receipt ${receipt.id} repeats manifest field(s): ${[
          ...new Set(manifestAuthority.duplicates),
        ].join(', ')}`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
    }
    if (manifestAuthority.malformed.length > 0) {
      addFinding(
        findings,
        'RECEIPT_MANIFEST_FIELD_MALFORMED',
        `Receipt ${receipt.id} contains malformed/empty manifest field(s): ${manifestAuthority.malformed.join(
          ', ',
        )}`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
    }
    if (
      manifestAuthority.fields.has('expiresat') &&
      manifestAuthority.keySpellings.get('expiresat') !== 'expiresAt'
    ) {
      addFinding(
        findings,
        'RECEIPT_MANIFEST_FIELD_CASE',
        `Receipt ${receipt.id} must spell expiresAt with canonical case`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
    }

    const manifestTargets = parseManifestTargets(receipt.manifest);
    receipt.manifestTargets = manifestTargets;
    if (manifestTargets.length === 0) {
      addFinding(
        findings,
        'RECEIPT_BASELINE',
        `Receipt ${receipt.id} manifest must contain at least one \`path@SHA256|ABSENT\` target`,
        receipt.line,
        undefined,
      );
    }
    const manifestPaths = new Set();
    const manifestPortablePaths = new Set();
    for (const target of manifestTargets) {
      const segments = target.path.split('/');
      const hasUnsafePortableSegment = segments.some((segment) => {
        const deviceStem = segment
          .normalize('NFKC')
          .split('.')[0]
          .replace(/[ .]+$/g, '');
        return (
          !segment ||
          Buffer.byteLength(segment, 'utf8') > 255 ||
          segment === '.' ||
          segment === '..' ||
          /[<>:"|?*\u0000-\u001f]/.test(segment) ||
          /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(segment) ||
          /[ .]$/.test(segment) ||
          /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(deviceStem)
        );
      });
      if (
        !target.path ||
        Buffer.byteLength(target.path, 'utf8') > 4_096 ||
        target.path !== target.path.normalize('NFC') ||
        target.path.includes('\\') ||
        target.path.startsWith('/') ||
        /^[A-Za-z]:/.test(target.path) ||
        hasUnsafePortableSegment
      ) {
        addFinding(
          findings,
          'RECEIPT_TARGET_PATH',
          `Receipt ${receipt.id} target must be a normalized repository-relative path: ${target.path}`,
          receipt.line,
          undefined,
        );
      }
      if (manifestPaths.has(target.path)) {
        addFinding(
          findings,
          'RECEIPT_TARGET_DUPLICATE',
          `Receipt ${receipt.id} repeats target ${target.path}`,
          receipt.line,
          undefined,
        );
      }
      manifestPaths.add(target.path);
      const portablePath = portablePathKey(target.path);
      if (manifestPortablePaths.has(portablePath)) {
        addFinding(
          findings,
          'RECEIPT_TARGET_PORTABLE_DUPLICATE',
          `Receipt ${receipt.id} repeats a target under portable case-folding: ${target.path}`,
          receipt.line,
          undefined,
        );
      }
      manifestPortablePaths.add(portablePath);
    }
    for (const token of receipt.manifest.match(/`[^`]+`/g) ?? []) {
      const content = stripInlineCode(token);
      if (
        looksLikeRepositoryPath(content) &&
        !/@(?:[a-f0-9]{64}|ABSENT)$/i.test(content)
      ) {
        addFinding(
          findings,
          'RECEIPT_TARGET_UNBOUND',
          `Receipt ${receipt.id} path-like token lacks an exact baseline: ${content}`,
          receipt.line,
          undefined,
        );
      }
    }

    const ownerAuthority = parseAuthorityFields(receipt.ownerDecision);
    if (ownerAuthority.duplicates.length > 0) {
      addFinding(
        findings,
        'RECEIPT_OWNER_FIELD_DUPLICATE',
        `Receipt ${receipt.id} repeats owner-decision field(s): ${[
          ...new Set(ownerAuthority.duplicates),
        ].join(', ')}`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
    }
    if (
      ownerAuthority.malformed.length > 0 ||
      ownerAuthority.unkeyed.length > 0
    ) {
      addFinding(
        findings,
        'RECEIPT_OWNER_FIELD_MALFORMED',
        `Receipt ${receipt.id} contains malformed/unkeyed owner-decision segment(s): ${[
          ...ownerAuthority.malformed,
          ...ownerAuthority.unkeyed,
        ].join(', ')}`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
    }
    const requiredOwnerKeys = ['owner', 'decision', 'scope', 'exclusions'];
    const unknownOwnerKeys = [...ownerAuthority.fields.keys()].filter(
      (key) => !requiredOwnerKeys.includes(key),
    );
    const owner = ownerAuthority.fields.get('owner');
    const decision = ownerAuthority.fields.get('decision');
    const scope = ownerAuthority.fields.get('scope');
    const exclusions = ownerAuthority.fields.get('exclusions');
    receipt.ownerApproved =
      ownerAuthority.duplicates.length === 0 &&
      ownerAuthority.malformed.length === 0 &&
      ownerAuthority.unkeyed.length === 0 &&
      requiredOwnerKeys.every((key) => ownerAuthority.fields.has(key)) &&
      requiredOwnerKeys.every(
        (key) => ownerAuthority.keySpellings.get(key) === key,
      ) &&
      unknownOwnerKeys.length === 0 &&
      Boolean(owner && scope && exclusions) &&
      /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(String(owner)) &&
      !INVALID_AUTHORITY_VALUES.has(String(owner).toLowerCase()) &&
      !INVALID_AUTHORITY_VALUES.has(String(scope).toLowerCase()) &&
      !INVALID_AUTHORITY_VALUES.has(String(exclusions).toLowerCase()) &&
      scope.length <= 500 &&
      exclusions.length <= 500 &&
      !/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(scope) &&
      !/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(exclusions) &&
      decision === 'APPROVED';
    if (!receipt.ownerApproved) {
      addFinding(
        findings,
        'RECEIPT_OWNER_DECISION',
        `Receipt ${receipt.id} owner decision must contain exactly owner, decision=APPROVED, scope and exclusions`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
    }

    const recordedMs = strictRfc3339Ms(receipt.recorded);
    if (recordedMs === null) {
      addFinding(
        findings,
        'RECEIPT_RECORDED',
        `Receipt ${receipt.id} Recorded must be a real RFC3339 instant`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
      receipt.ownerApproved = false;
    } else if (recordedMs > nowMs) {
      addFinding(
        findings,
        'RECEIPT_NOT_YET_VALID',
        `Receipt ${receipt.id} cannot exist before its Recorded instant`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
      receipt.ownerApproved = false;
    }
    if (receiptIdMatch && !receipt.recorded.startsWith(`${receiptIdMatch[1]}T`)) {
      addFinding(
        findings,
        'RECEIPT_ID_DATE',
        `Receipt ${receipt.id} date must equal its Recorded civil date`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
      receipt.ownerApproved = false;
    }
    if (!receipt.lifecycle) {
      addFinding(
        findings,
        'RECEIPT_STATE',
        `Receipt ${receipt.id} state must exactly match \`ONE_SHOT|EXPIRING\`: active or terminal@RFC3339`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
      receipt.ownerApproved = false;
    }
    const expiresAt = manifestAuthority.fields.get('expiresat');
    if (
      (receipt.lifecycle?.mode !== 'ONE_SHOT' ||
        receipt.lifecycle?.status === 'expired') &&
      !expiresAt
    ) {
      addFinding(
        findings,
        'RECEIPT_BOUNDARY',
        `Receipt ${receipt.id} must declare ONE_SHOT state or an expiresAt= boundary`,
        receipt.line,
        undefined,
      );
    }
    let expiresAtMs = null;
    if (expiresAt) {
      expiresAtMs = strictRfc3339Ms(expiresAt);
      if (expiresAtMs === null || recordedMs === null || expiresAtMs <= recordedMs) {
        addFinding(
          findings,
          'RECEIPT_EXPIRY',
          `Receipt ${receipt.id} expiresAt must be a real RFC3339 instant later than Recorded`,
          receipt.line,
          undefined,
        );
        receipt.active = false;
      } else if (receipt.active && expiresAtMs <= nowMs) {
        addFinding(
          findings,
          'RECEIPT_ACTIVE_EXPIRED',
          `Receipt ${receipt.id} is active after its expiresAt boundary`,
          receipt.line,
          undefined,
        );
        receipt.active = false;
      }
    }
    if (
      receipt.lifecycle?.transitionMs !== null &&
      receipt.lifecycle?.transitionMs !== undefined
    ) {
      const transitionMs = receipt.lifecycle.transitionMs;
      const lifecycleTimeInvalid =
        recordedMs === null ||
        transitionMs < recordedMs ||
        transitionMs > nowMs ||
        (receipt.lifecycle.status === 'consumed' &&
          expiresAtMs !== null &&
          transitionMs > expiresAtMs) ||
        (receipt.lifecycle.status === 'expired' &&
          expiresAtMs !== null &&
          transitionMs < expiresAtMs);
      if (lifecycleTimeInvalid) {
        addFinding(
          findings,
          'RECEIPT_LIFECYCLE_TIME',
          `Receipt ${receipt.id} terminal transition must be real, non-future and consistent with Recorded/expiresAt`,
          receipt.line,
          undefined,
        );
        receipt.ownerApproved = false;
      }
    }
    if (receipt.active && !repositoryRoot && baselineMode !== 'structural-only') {
      addFinding(
        findings,
        'RECEIPT_BASELINE_ROOT_REQUIRED',
        `Active receipt ${receipt.id} requires a physical repository root for admission validation`,
        receipt.line,
        undefined,
      );
      receipt.active = false;
    } else if (receipt.active && repositoryRoot) {
      for (const target of manifestTargets) {
        try {
          if (target.baseline === 'ABSENT') {
            const canonicalRoot = canonicalRepositoryRoot(repositoryRoot);
            const targetPath = resolve(canonicalRoot, target.path);
            assertTargetInsideRoot(canonicalRoot, targetPath);
            assertNoSymlinkPath(canonicalRoot, dirname(targetPath));
            if (pathEntryExists(targetPath)) {
              addFinding(
                findings,
                'RECEIPT_BASELINE_DRIFT',
                `Active receipt ${receipt.id} expected ${target.path} to be absent`,
                receipt.line,
                undefined,
              );
              receipt.active = false;
            }
          } else {
            const bytes = /** @type {Buffer} */ (
              readRegularFile(repositoryRoot, target.path, null)
            );
            const actual = createHash('sha256').update(bytes).digest('hex');
            if (actual !== target.baseline) {
              addFinding(
                findings,
                'RECEIPT_BASELINE_DRIFT',
                `Active receipt ${receipt.id} baseline drift for ${target.path}`,
                receipt.line,
                undefined,
              );
              receipt.active = false;
            }
          }
        } catch (error) {
          addFinding(
            findings,
            hasErrorCode(error, 'ENOENT')
              ? 'RECEIPT_BASELINE_DRIFT'
              : 'RECEIPT_BASELINE_UNSAFE',
            `Active receipt ${receipt.id} cannot verify ${target.path}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            receipt.line,
            undefined,
          );
          receipt.active = false;
        }
      }
    }
    // ─── Active-receipt admission under the documented trust anchor ──────────
    //
    // Owner decision 2026-08-03 (Alperen), option B of the READY-lock resolution.
    //
    // This check previously rejected EVERY active receipt with EXTERNAL_GRANT_REQUIRED.
    // The consequence was architectural, not editorial: without an active receipt no row
    // can reach READY/IN_PROGRESS (see ADMISSION_RECEIPT_MISSING below), so the ledger
    // could never produce an admissible root — `READY` was unreachable by construction.
    //
    // It also contradicted this repository's own documented trust model. MASTER §3.3 states:
    // "…trust anchor reviewed Git parent/CI protection'dır; signed/append-only runtime
    // settlement KERNEL-SETTLEMENT-001, AUDIT-001 ve RECEIPT-001 kapsamındadır."
    // The validator demanded an external immutable grant verifier that does not exist yet,
    // while the document declared reviewed Git parent/CI to be the anchor for this
    // projection. Both could not be true.
    //
    // Narrow gate: an active receipt is admitted under the Git-parent anchor ONLY when it
    // does not authorize mutating the ledger that vouches for it. A receipt whose manifest
    // covers MASTER or its generated projections cannot be baseline-verified — inserting it
    // changes the very bytes it pins — so those paths belong to the post-hoc settlement
    // receipt, which is `consumed` and outside this check.
    //
    // This is a dated, justified exception, not a removal: signed/append-only external grant
    // verification stays owned by RECEIPT-001. When that lands, this gate tightens back.
    if (
      receipt.lifecycle?.status === 'active' &&
      baselineMode !== 'structural-only'
    ) {
      const selfReferential = manifestTargets
        .map((target) => target.path)
        .filter((path) => SELF_REFERENTIAL_RECEIPT_PATHS.has(path));
      if (selfReferential.length > 0) {
        addFinding(
          findings,
          'RECEIPT_SELF_REFERENTIAL',
          `Active receipt ${receipt.id} cannot pin the ledger that carries it (${selfReferential.join(
            ', ',
          )}); move those paths to the consumed settlement receipt`,
          receipt.line,
          undefined,
        );
        receipt.active = false;
      }
    }
    for (const workId of receipt.workIds) {
      const work = itemById.get(workId);
      if (!work) {
        addFinding(
          findings,
          'RECEIPT_WORK_MISSING',
          `Receipt ${receipt.id} references missing Work ID ${workId}`,
          receipt.line,
          workId,
        );
        continue;
      }
      for (const gate of receipt.gates) {
        if (!work.gates.includes(gate)) {
          addFinding(
            findings,
            'RECEIPT_GATE_SCOPE',
            `Receipt ${receipt.id} grants ${gate}, absent from ${workId} Gate`,
            receipt.line,
            workId,
          );
        }
      }
    }
    if (receipt.gates.includes('G7')) {
      const allowedG7Keys = new Set(
        G7_REQUIRED_MANIFEST_KEYS.map((key) => key.toLowerCase()),
      );
      const unknownG7Keys = [...manifestAuthority.fields.keys()].filter(
        (key) => !allowedG7Keys.has(key),
      );
      const canonicalG7KeyByLower = new Map(
        G7_REQUIRED_MANIFEST_KEYS.map((key) => [key.toLowerCase(), key]),
      );
      const nonCanonicalG7Keys = [...manifestAuthority.fields.keys()].filter(
        (key) =>
          canonicalG7KeyByLower.has(key) &&
          manifestAuthority.keySpellings.get(key) !==
            canonicalG7KeyByLower.get(key),
      );
      if (unknownG7Keys.length > 0) {
        addFinding(
          findings,
          'G7_MANIFEST_UNKNOWN_FIELD',
          `G7 receipt ${receipt.id} contains unknown field(s): ${unknownG7Keys.join(', ')}`,
          receipt.line,
          undefined,
        );
        receipt.active = false;
      }
      if (nonCanonicalG7Keys.length > 0) {
        addFinding(
          findings,
          'G7_MANIFEST_FIELD_CASE',
          `G7 receipt ${receipt.id} uses non-canonical field spelling(s): ${nonCanonicalG7Keys.join(
            ', ',
          )}`,
          receipt.line,
          undefined,
        );
        receipt.active = false;
      }
      if (manifestAuthority.unkeyed.length > 0) {
        addFinding(
          findings,
          'G7_MANIFEST_UNKEYED_SEGMENT',
          `G7 receipt ${receipt.id} contains unkeyed/contradictory manifest segment(s): ${manifestAuthority.unkeyed.join(
            ', ',
          )}`,
          receipt.line,
          undefined,
        );
        receipt.active = false;
      }
      for (const key of G7_REQUIRED_MANIFEST_KEYS) {
        if (!manifestAuthority.fields.get(key.toLowerCase())) {
          addFinding(
            findings,
            'G7_MANIFEST_FIELD',
            `G7 receipt ${receipt.id} is missing ${key}=`,
            receipt.line,
            undefined,
          );
        }
      }
      for (const issue of validateG7Manifest(manifestAuthority.fields, receipt)) {
        addFinding(
          findings,
          'G7_MANIFEST_VALUE',
          `G7 receipt ${receipt.id}: ${issue}`,
          receipt.line,
          undefined,
        );
        receipt.active = false;
      }
      const maxWallClockMs = parseBoundedDurationMs(
        manifestAuthority.fields.get('maxwallclock'),
      );
      const authorizationTtlMs = parseBoundedDurationMs(
        manifestAuthority.fields.get('authorizationttl'),
      );
      if (
        recordedMs !== null &&
        expiresAtMs !== null &&
        (maxWallClockMs === null ||
          authorizationTtlMs === null ||
          authorizationTtlMs < maxWallClockMs ||
          expiresAtMs - recordedMs !== authorizationTtlMs)
      ) {
        addFinding(
          findings,
          'G7_TTL',
          `G7 receipt ${receipt.id} must bind maxWallClock <= authorizationTtl <= 7d and expiresAt - Recorded = authorizationTtl`,
          receipt.line,
          undefined,
        );
        receipt.active = false;
      }
      const attemptParts = [
        'provider',
        'tenant',
        'project',
        'task',
        'attempt',
        'stage',
      ].map((key) => manifestAuthority.fields.get(key) ?? '');
      if (attemptParts.every(Boolean)) {
        const attemptKey = attemptParts.join('\u0000');
        if (g7AttemptKeys.has(attemptKey)) {
          addFinding(
            findings,
            'G7_ATTEMPT_DUPLICATE',
            `G7 receipt ${receipt.id} reuses an existing provider/tenant/project/task/attempt/stage identity`,
            receipt.line,
            undefined,
          );
          receipt.active = false;
        }
        g7AttemptKeys.add(attemptKey);
      }
      if (receipt.lifecycle?.mode !== 'ONE_SHOT') {
        addFinding(
          findings,
          'G7_SINGLE_USE',
          `G7 receipt ${receipt.id} must explicitly be ONE_SHOT/single-use`,
          receipt.line,
          undefined,
        );
      }
      if (!expiresAt) {
        addFinding(
          findings,
          'G7_EXPIRY',
          `G7 receipt ${receipt.id} must bind an expiresAt= timestamp`,
          receipt.line,
          undefined,
        );
      }
    }
    receipt.validAuthority =
      Boolean(receipt.ownerApproved) && findings.length === receiptFindingStart;
    if (!receipt.validAuthority) receipt.active = false;
  }

  const activeTargetOwner = new Map();
  for (const receipt of receipts) {
    if (!receipt.active || !receipt.validAuthority) continue;
    for (const target of receipt.manifestTargets ?? []) {
      const portablePath = portablePathKey(target.path);
      const existing = activeTargetOwner.get(portablePath);
      if (existing) {
        addFinding(
          findings,
          'RECEIPT_ACTIVE_TARGET_COLLISION',
          `active receipts ${existing.id} and ${receipt.id} both authorize portable target ${target.path}`,
          receipt.line,
          undefined,
        );
        existing.active = false;
        existing.validAuthority = false;
        receipt.active = false;
        receipt.validAuthority = false;
      } else {
        activeTargetOwner.set(portablePath, receipt);
      }
    }
  }

  const activeReceiptByWorkGate = new Set();
  const activeReceiptsByWork = new Map();
  for (const receipt of receipts) {
    if (!receipt.active || !receipt.validAuthority) continue;
    for (const workId of receipt.workIds) {
      const scoped = activeReceiptsByWork.get(workId) ?? [];
      scoped.push(receipt);
      activeReceiptsByWork.set(workId, scoped);
      for (const gate of receipt.gates) {
        activeReceiptByWorkGate.add(`${workId}\u0000${gate}`);
      }
    }
  }

  const blockerAssignments = new Map();
  const blockerCodes = new Set();
  for (const blocker of blockers) {
    if (!BLOCKER_CODE_RE.test(blocker.code)) {
      addFinding(
        findings,
        'BLOCKER_CODE_FORMAT',
        `Blocker code is not canonical UPPER_SNAKE_CASE: ${blocker.code}`,
        blocker.line,
        undefined,
      );
    }
    if (blockerCodes.has(blocker.code)) {
      addFinding(
        findings,
        'BLOCKER_CODE_DUPLICATE',
        `Blocker code ${blocker.code} has multiple register rows`,
        blocker.line,
        undefined,
      );
    }
    blockerCodes.add(blocker.code);
    if (blocker.workIds.length === 0) {
      addFinding(
        findings,
        'BLOCKER_WORK_EMPTY',
        `Blocker ${blocker.code} has no Work IDs`,
        blocker.line,
        undefined,
      );
    }
    if (new Set(blocker.workIds).size !== blocker.workIds.length) {
      addFinding(
        findings,
        'BLOCKER_WORK_DUPLICATE',
        `Blocker ${blocker.code} repeats a Work ID`,
        blocker.line,
        undefined,
      );
    }
    if (!blocker.remedy.trim()) {
      addFinding(
        findings,
        'BLOCKER_REMEDY_EMPTY',
        `Blocker ${blocker.code} has no remedy`,
        blocker.line,
        undefined,
      );
    }
    for (const workId of blocker.workIds) {
      if (!itemById.has(workId)) {
        addFinding(
          findings,
          'BLOCKER_WORK_MISSING',
          `Blocker ${blocker.code} references missing Work ID ${workId}`,
          blocker.line,
          workId,
        );
      }
      const assignments = blockerAssignments.get(workId) ?? [];
      assignments.push(blocker.code);
      blockerAssignments.set(workId, assignments);
    }
    for (const token of blocker.remedy.match(/`([^`]+)`/g) ?? []) {
      const candidate = stripInlineCode(token);
      // Semantic result/state tokens such as `ALLOW`, `HOLD` and `UNSUPPORTED`
      // deliberately share the uppercase vocabulary. Canonical Work IDs in this
      // ledger are upper-kebab and therefore contain at least one hyphen.
      if (CANONICAL_ID_RE.test(candidate) && !itemById.has(candidate)) {
        addFinding(
          findings,
          'BLOCKER_REMEDY_MISSING',
          `Blocker ${blocker.code} remedy references missing Work ID ${candidate}`,
          blocker.line,
          candidate,
        );
      }
    }
    const dependencyDelegationMarkers =
      blocker.remedy.match(/`DependsOn`/g) ?? [];
    const delegatesExactDependencies =
      dependencyDelegationMarkers.length === 1 &&
      /^(?:exact `DependsOn`|exact ledger `DependsOn` IDs)(?=$|;|\s+\+)/.test(
        blocker.remedy.trim(),
      );
    const explicitRemedyIds = [
      ...new Set(
        (blocker.remedy.match(/`([^`]+)`/g) ?? [])
          .map((token) => stripInlineCode(token))
          .filter((token) => CANONICAL_ID_RE.test(token)),
      ),
    ].sort();
    const gateRemedies = [
      ...new Set(
        [...blocker.remedy.matchAll(/`gate:(G[0-7])`/g)].map((match) => match[1]),
      ),
    ];
    if (
      dependencyDelegationMarkers.length > 0 &&
      !delegatesExactDependencies
    ) {
      addFinding(
        findings,
        'BLOCKER_REMEDY_DELEGATION',
        `Blocker ${blocker.code} dependency delegation must use exactly one leading canonical "exact \`DependsOn\`" or "exact ledger \`DependsOn\` IDs" phrase`,
        blocker.line,
        undefined,
      );
    }
    for (const workId of blocker.workIds) {
      const work = itemById.get(workId);
      if (!work) continue;
      if (delegatesExactDependencies && explicitRemedyIds.length > 0) {
        addFinding(
          findings,
          'BLOCKER_REMEDY_SCOPE',
          `Blocker ${blocker.code} cannot mix exact DependsOn delegation with explicit Work IDs: ${explicitRemedyIds.join(
            ', ',
          )}`,
          blocker.line,
          workId,
        );
      } else if (!delegatesExactDependencies) {
        const expected = [...new Set(work.dependsOn)].sort();
        if (
          explicitRemedyIds.length !== expected.length ||
          explicitRemedyIds.some((id, index) => id !== expected[index])
        ) {
          addFinding(
            findings,
            'BLOCKER_REMEDY_SCOPE',
            `Blocker ${blocker.code} explicit remedy IDs must exactly equal ${workId} DependsOn: ${
              expected.join(', ') || '<empty>'
            }`,
            blocker.line,
            workId,
          );
        }
      }
      for (const gate of gateRemedies) {
        if (!work.gates.includes(gate)) {
          addFinding(
            findings,
            'BLOCKER_REMEDY_GATE_SCOPE',
            `Blocker ${blocker.code} remedy requires ${gate}, absent from ${workId} Gate`,
            blocker.line,
            workId,
          );
        }
      }
    }
  }

  for (const item of items) {
    const assignments = blockerAssignments.get(item.id) ?? [];
    if (item.state === 'BLOCKED' && assignments.length !== 1) {
      addFinding(
        findings,
        'BLOCKED_REGISTER_CARDINALITY',
        `BLOCKED item must appear in typed blocker register exactly once; found ${assignments.length}`,
        item.line,
        item.id,
      );
    }
    if (item.state !== 'BLOCKED' && assignments.length > 0) {
      addFinding(
        findings,
        'BLOCKER_STATE_MISMATCH',
        `non-BLOCKED item appears in blocker register (${assignments.join(', ')})`,
        item.line,
        item.id,
      );
    }

    const unsatisfiedDependencies = item.dependsOn.filter((dependency) => {
      const state = itemById.get(dependency)?.state;
      return state !== undefined && !DEPENDENCY_SATISFIED_STATES.has(state);
    });
    if (
      ['READY', 'IN_PROGRESS', 'DONE'].includes(item.state) &&
      unsatisfiedDependencies.length > 0
    ) {
      addFinding(
        findings,
        'DEPENDENCY_STATE_UNSATISFIED',
        `${item.state} item has dependencies that are not DONE: ${unsatisfiedDependencies.join(', ')}`,
        item.line,
        item.id,
      );
    }

    const children = childrenByParent.get(item.id) ?? [];
    const openChildren = children.filter((child) => !TERMINAL_STATES.has(child.state));
    if (['READY', 'DONE', 'DISPOSED'].includes(item.state) && openChildren.length > 0) {
      addFinding(
        findings,
        'AGGREGATE_PARENT_PREMATURE',
        `${item.state} aggregate parent has non-terminal children: ${openChildren
          .map((child) => child.id)
          .join(', ')}`,
        item.line,
        item.id,
      );
    }

    const evidenceProvenance = parseEvidenceReceiptRefs(item.evidence);
    if (evidenceProvenance.unstructured.length > 0) {
      addFinding(
        findings,
        'EVIDENCE_RECEIPT_GRAMMAR',
        `raw receipt marker(s) must use exact \`receipt=GR-...\` tokens: ${[
          ...new Set(evidenceProvenance.unstructured),
        ].join(', ')}`,
        item.line,
        item.id,
      );
    }
    if (evidenceProvenance.duplicates.length > 0) {
      addFinding(
        findings,
        'EVIDENCE_RECEIPT_DUPLICATE',
        `Evidence repeats receipt token(s): ${evidenceProvenance.duplicates.join(', ')}`,
        item.line,
        item.id,
      );
    }
    const receiptRefs = evidenceProvenance.refs;
    const scopedReceipts = [];
    for (const receiptId of receiptRefs) {
      const receipt = receiptById.get(receiptId);
      if (!receipt) {
        addFinding(
          findings,
          'EVIDENCE_RECEIPT_MISSING',
          `Evidence references absent receipt ${receiptId}`,
          item.line,
          item.id,
        );
      } else if (!receipt.workIds.includes(item.id)) {
        addFinding(
          findings,
          'EVIDENCE_RECEIPT_SCOPE',
          `Receipt ${receiptId} does not include ${item.id}`,
          item.line,
          item.id,
        );
      } else if (
        receipt.validAuthority &&
        receipt.lifecycle?.status === 'consumed'
      ) {
        scopedReceipts.push(receipt);
      }
    }

    const mutationGates = item.gates.filter((gate) => gate !== 'G0');
    const historicalMarkerPresent = /\bhistorical-authority\b/i.test(item.evidence);
    const historicalProvenance = parseHistoricalProvenance(item.evidence);
    if (historicalMarkerPresent && !historicalProvenance) {
      addFinding(
        findings,
        'HISTORICAL_PROVENANCE_INVALID',
        'historical provenance must be one exact structured token with non-generic authority, gates and proof',
        item.line,
        item.id,
      );
    }
    const historicalUncoveredGates = historicalProvenance
      ? mutationGates.filter((gate) => !historicalProvenance.gates.includes(gate))
      : mutationGates;
    if (historicalProvenance && historicalUncoveredGates.length > 0) {
      addFinding(
        findings,
        'HISTORICAL_GATE_COVERAGE',
        `historical provenance does not cover mutation gates: ${historicalUncoveredGates.join(', ')}`,
        item.line,
        item.id,
      );
    }
    const hasHistoricalProvenance =
      Boolean(historicalProvenance) && historicalUncoveredGates.length === 0;
    if (
      item.state === 'VERIFY' &&
      mutationGates.length > 0 &&
      scopedReceipts.length === 0 &&
      !hasHistoricalProvenance
    ) {
      addFinding(
        findings,
        'VERIFY_PROVENANCE',
        'VERIFY mutation claim requires a scoped receipt or typed historical provenance',
        item.line,
        item.id,
      );
    }
    if (
      ['VERIFY', 'DONE'].includes(item.state) &&
      mutationGates.length > 0 &&
      (scopedReceipts.length > 0 || hasHistoricalProvenance)
    ) {
      const oneReceiptCoversAll = scopedReceipts.some((receipt) =>
        mutationGates.every((gate) => receipt.gates.includes(gate)),
      );
      const historicalCoversAll =
        item.state === 'VERIFY' &&
        Boolean(
          historicalProvenance &&
            mutationGates.every((gate) =>
              historicalProvenance.gates.includes(gate),
            ),
        );
      if (!oneReceiptCoversAll && !historicalCoversAll) {
        addFinding(
          findings,
          'EVIDENCE_GATE_COVERAGE',
          `${item.state} requires one scoped receipt covering every mutation gate; split receipt authority is invalid`,
          item.line,
          item.id,
        );
      }
    }

    if (['READY', 'IN_PROGRESS'].includes(item.state)) {
      const individuallyCovered = [];
      for (const gate of mutationGates) {
        const covered = activeReceiptByWorkGate.has(`${item.id}\u0000${gate}`);
        individuallyCovered.push(covered);
        if (!covered) {
          addFinding(
            findings,
            'ADMISSION_RECEIPT_MISSING',
            `${item.state} mutation item has no active scope-exact ${gate} receipt`,
            item.line,
            item.id,
          );
        }
      }
      if (
        mutationGates.length > 1 &&
        individuallyCovered.every(Boolean) &&
        !(activeReceiptsByWork.get(item.id) ?? []).some((receipt) =>
          mutationGates.every((gate) => receipt.gates.includes(gate)),
        )
      ) {
        addFinding(
          findings,
          'ADMISSION_RECEIPT_SPLIT_SCOPE',
          `${item.state} requires one active receipt covering every mutation gate; split authority is invalid`,
          item.line,
          item.id,
        );
      }
    }

    if (item.state === 'DONE') {
      if (
        item.truth.some((value) => value !== '1' && value !== '-') ||
        !item.truth.includes('1')
      ) {
        addFinding(
          findings,
          'DONE_TRUTH_INCOMPLETE',
          'DONE truth must contain only proven (1) or not-applicable (-) values and at least one proof',
          item.line,
          item.id,
        );
      }
      if (
        /\b(?:TODO|TBD|pending|bekliyor|kalan|residual|remaining|incomplete|unverified|eksik|invalid|rejected|denied)\b|(?:\b(?:not|never)\s+(?:used|verified|proven|authorized)\b)/i.test(
          item.evidence,
        )
      ) {
        addFinding(
          findings,
          'DONE_EVIDENCE_PENDING',
          'DONE evidence contains unresolved/pending language',
          item.line,
          item.id,
        );
      }
      if (
        mutationGates.length > 0 &&
        scopedReceipts.length === 0
      ) {
        addFinding(
          findings,
          'DONE_PROVENANCE',
          'DONE mutation claim requires a scoped, consumed authority receipt',
          item.line,
          item.id,
        );
      }
      if (
        !hasExplicitProof(item.evidence)
      ) {
        addFinding(
          findings,
          'DONE_PROOF',
          'DONE evidence requires standalone functional proof=<id>; authorization receipts and historical claims are insufficient',
          item.line,
          item.id,
        );
      }
    }

    if (item.state === 'DEFERRED') {
      const authority = parseAuthorityFields(item.evidence, {
        ignoreReceiptReferences: true,
      });
      const reason = authority.fields.get('reason');
      const reviewDate = authority.fields.get('review-date');
      const unknownKeys = [...authority.fields.keys()].filter(
        (key) => !new Set(['reason', 'review-date']).has(key),
      );
      const nonCanonicalKeys = [...authority.fields.keys()].filter(
        (key) => authority.keySpellings.get(key) !== key,
      );
      if (
        !reason ||
        INVALID_AUTHORITY_VALUES.has(reason.toLowerCase()) ||
        !reviewDate ||
        !isRealIsoDate(reviewDate) ||
        reviewDate <= validationDate ||
        authority.duplicates.length > 0 ||
        authority.malformed.length > 0 ||
        authority.unkeyed.length > 0 ||
        unknownKeys.length > 0 ||
        nonCanonicalKeys.length > 0 ||
        evidenceProvenance.refs.length > 0
      ) {
        addFinding(
          findings,
          'DEFERRED_AUTHORITY',
          'DEFERRED evidence must contain exactly reason=<non-empty>;review-date=<real future YYYY-MM-DD>',
          item.line,
          item.id,
        );
      }
    }

    if (item.state === 'DISPOSED') {
      const authority = parseAuthorityFields(item.evidence, {
        ignoreReceiptReferences: true,
      });
      const reason = authority.fields.get('owner-approved');
      const decisionDate = authority.fields.get('decision-date');
      const unknownKeys = [...authority.fields.keys()].filter(
        (key) => !new Set(['owner-approved', 'decision-date']).has(key),
      );
      const nonCanonicalKeys = [...authority.fields.keys()].filter(
        (key) => authority.keySpellings.get(key) !== key,
      );
      const disposalReceipt =
        evidenceProvenance.refs.length === 1
          ? scopedReceipts.find(
              (receipt) =>
                receipt.id === evidenceProvenance.refs[0] &&
                receipt.gates.includes('G2'),
            )
          : undefined;
      if (
        !item.gates.includes('G2') ||
        !reason ||
        INVALID_AUTHORITY_VALUES.has(reason.toLowerCase()) ||
        !decisionDate ||
        !isRealIsoDate(decisionDate) ||
        decisionDate > validationDate ||
        authority.duplicates.length > 0 ||
        authority.malformed.length > 0 ||
        authority.unkeyed.length > 0 ||
        unknownKeys.length > 0 ||
        nonCanonicalKeys.length > 0 ||
        evidenceProvenance.refs.length !== 1 ||
        !disposalReceipt
      ) {
        addFinding(
          findings,
          'DISPOSED_AUTHORITY',
          'DISPOSED requires exactly owner-approved=<reason>;decision-date=<real non-future date> plus one scoped `receipt=GR-...` G2 token',
          item.line,
          item.id,
        );
      }
    }
  }

  return { itemById, childrenByParent, receiptById, blockerAssignments };
}

/**
 * Parse and validate the complete canonical MASTER source.
 *
 * @param {string} source
 * @param {{
 *   nowMs?: number,
 *   root?: string,
 *   baselineMode?: 'disk' | 'structural-only'
 * }} [options]
 * @returns {{
 *   ok: boolean,
 *   findings: ValidationFinding[],
 *   items: WorkItem[],
 *   receipts: GateReceipt[],
 *   blockers: TypedBlocker[],
 *   sourceSha256: string,
 *   asOfDate: string,
 *   validationNowMs: number,
 *   itemById: Map<string, WorkItem>,
 *   childrenByParent: Map<string, WorkItem[]>,
 *   receiptById: Map<string, GateReceipt>,
 *   blockerAssignments: Map<string, string[]>
 * }}
 */
export function validateMasterPlan(source, options = {}) {
  const normalized = normalizeLineEndings(source);
  const lines = normalized.split('\n');
  /** @type {ValidationFinding[]} */
  const findings = [];
  const nowMs = options.nowMs ?? Date.now();
  const clockValid =
    typeof nowMs === 'number' &&
    Number.isFinite(nowMs) &&
    !Number.isNaN(new Date(nowMs).getTime());
  const validationNowMs = clockValid ? nowMs : Date.now();
  const baselineMode = options.baselineMode ?? 'disk';
  if (!clockValid) {
    addFinding(
      findings,
      'VALIDATION_CLOCK',
      'validation nowMs must be a real Date-domain epoch-millisecond value',
      undefined,
      undefined,
    );
  }
  if (!['disk', 'structural-only'].includes(baselineMode)) {
    addFinding(
      findings,
      'BASELINE_MODE',
      'baselineMode must be disk or structural-only',
      undefined,
      undefined,
    );
  }

  const receiptStart = requireHeading(lines, '### 3.4 Gate receipt contract', findings);
  const blockerStart = requireHeading(lines, '### 3.5 Typed blocker register', findings);
  const sourceCatalogStart = requireHeading(lines, '## 4. Kaynak disposition kataloğu', findings);
  const ledgerStart = requireHeading(lines, '## 7. Canonical execution ledger', findings);
  const reconciliationStart = requireHeading(lines, '## 8. Legacy reconciliation manifest', findings);

  if (
    [receiptStart, blockerStart, sourceCatalogStart, ledgerStart, reconciliationStart].some(
      (index) => index < 0,
    )
  ) {
    return {
      ok: false,
      findings,
      items: [],
      receipts: [],
      blockers: [],
      sourceSha256: normalizedSha256(source),
      asOfDate: new Date(validationNowMs).toISOString().slice(0, 10),
      validationNowMs,
      itemById: new Map(),
      childrenByParent: new Map(),
      receiptById: new Map(),
      blockerAssignments: new Map(),
    };
  }

  if (
    !(
      receiptStart < blockerStart &&
      blockerStart < sourceCatalogStart &&
      sourceCatalogStart < ledgerStart &&
      ledgerStart < reconciliationStart
    )
  ) {
    addFinding(
      findings,
      'SECTION_ORDER',
      'receipt, blocker, source catalog, ledger and reconciliation sections are out of order',
      undefined,
      undefined,
    );
  }

  const receipts = parseReceipts(lines, receiptStart, blockerStart, findings);
  const blockers = parseBlockers(lines, blockerStart, sourceCatalogStart, findings);
  const items = parseLedger(lines, ledgerStart, reconciliationStart, findings);
  detectShadowLedgerRows(lines, items, findings);
  detectShadowAuthorityRows(lines, receipts, blockers, findings);
  const indexes = validateLedger(
    items,
    receipts,
    blockers,
    findings,
    validationNowMs,
    options.root,
    baselineMode === 'structural-only' ? 'structural-only' : 'disk',
  );

  return {
    ok: findings.length === 0,
    findings,
    items,
    receipts,
    blockers,
    sourceSha256: normalizedSha256(source),
    asOfDate: new Date(validationNowMs).toISOString().slice(0, 10),
    validationNowMs,
    ...indexes,
  };
}

/** @param {unknown} value */
function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalJsonValue(child)]),
    );
  }
  return value;
}

/** @param {unknown} value */
function sha256CanonicalJson(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJsonValue(value)), 'utf8')
    .digest('hex');
}

/** @param {WorkItem | Record<string, unknown>} item */
function workDefinitionDigest(item) {
  return sha256CanonicalJson({
    id: item.id,
    parent: item.parent,
    program: item.program,
    outcome: item.outcome,
    acceptance: item.acceptance,
    dependsOn: item.dependsOn,
    gates: item.gates,
  });
}

/**
 * @param {WorkItem | Record<string, unknown>} item
 * @param {{ code: string, remedy: string } | null} blocker
 */
function workProgressDigest(item, blocker) {
  const truth = Array.isArray(item.truth)
    ? item.truth
    : TRUTH_KEYS.map(
        (key) =>
          /** @type {Record<string, string> | undefined} */ (item.truth)?.[key],
      );
  return sha256CanonicalJson({
    priority: item.priority,
    state: item.state,
    truth,
    evidence: item.evidence,
    blocker,
    updated: item.updated,
  });
}

/** @param {Record<string, unknown>} model */
function registryIntegrityDigest(model) {
  const { registryIntegrity: _ignored, ...payload } = model;
  return sha256CanonicalJson(payload);
}

/**
 * @param {ReturnType<typeof validateMasterPlan>} validation
 */
export function buildActiveModel(validation) {
  const activeItems = validation.items.filter((item) => !TERMINAL_STATES.has(item.state));
  const blockerByWork = new Map();
  const blockerAuthorityByWork = new Map();
  for (const blocker of validation.blockers) {
    for (const workId of blocker.workIds) {
      blockerByWork.set(workId, blocker.code);
      blockerAuthorityByWork.set(workId, {
        code: blocker.code,
        remedy: blocker.remedy,
      });
    }
  }

  const dependentsByWork = new Map(validation.items.map((item) => [item.id, []]));
  for (const item of validation.items) {
    for (const dependency of item.dependsOn) {
      dependentsByWork.get(dependency)?.push(item.id);
    }
  }

  const byState = Object.fromEntries(STATES.map((state) => [state, 0]));
  const byPriority = Object.fromEntries(PRIORITIES.map((priority) => [priority, 0]));
  const byProgram = Object.fromEntries(PROGRAMS.map((program) => [program, 0]));
  for (const item of validation.items) {
    byState[item.state] += 1;
    byPriority[item.priority] += 1;
    byProgram[item.program] += 1;
  }

  const workItems = activeItems.map((item) => {
    const children = (validation.childrenByParent.get(item.id) ?? []).map((child) => child.id);
    const dependencyBlockers = item.dependsOn.filter((dependency) => {
      const state = validation.itemById.get(dependency)?.state;
      return state !== undefined && !DEPENDENCY_SATISFIED_STATES.has(state);
    });
    const aggregateBlockers = children.filter((child) => {
      const state = validation.itemById.get(child)?.state;
      return state !== undefined && !TERMINAL_STATES.has(state);
    });
    const evidenceReceipts = parseEvidenceReceiptRefs(item.evidence).refs;
    return {
      order: item.order,
      id: item.id,
      parent: item.parent,
      program: item.program,
      outcome: item.outcome,
      priority: item.priority,
      dependsOn: item.dependsOn,
      dependents: [...(dependentsByWork.get(item.id) ?? [])].sort(),
      children,
      gates: item.gates,
      state: item.state,
      truth: Object.fromEntries(TRUTH_KEYS.map((key, index) => [key, item.truth[index]])),
      blockerCode: blockerByWork.get(item.id) ?? null,
      blockerRemedy: blockerAuthorityByWork.get(item.id)?.remedy ?? null,
      closureBlockedBy: [...new Set([...dependencyBlockers, ...aggregateBlockers])],
      evidenceReceipts,
      acceptance: item.acceptance,
      evidence: item.evidence,
      updated: item.updated,
    };
  });

  const model = {
    schemaVersion: 3,
    generatedFrom: MASTER_PLAN_RELATIVE_PATH,
    sourceDigest: {
      algorithm: 'sha256(normalized-lf-utf8)',
      value: validation.sourceSha256,
    },
    summary: {
      total: validation.items.length,
      active: activeItems.length,
      terminal: validation.items.length - activeItems.length,
      receipts: validation.receipts.length,
      byState,
      byPriority,
      byProgram,
    },
    identityRegistry: validation.items.map((item) => {
      const canonicalDefinitionDigest = workDefinitionDigest(item);
      const blocker = blockerAuthorityByWork.get(item.id) ?? null;
      const progressDigest = workProgressDigest(item, blocker);
      const terminalClosureDigest = TERMINAL_STATES.has(item.state)
        ? sha256CanonicalJson({
            definitionDigest: canonicalDefinitionDigest,
            priority: item.priority,
            state: item.state,
            dependsOn: item.dependsOn,
            gates: item.gates,
            truth: item.truth,
            evidence: item.evidence,
            updated: item.updated,
          })
        : null;
      return {
        order: item.order,
        id: item.id,
        program: item.program,
        priority: item.priority,
        state: item.state,
        updated: item.updated,
        definitionDigest: canonicalDefinitionDigest,
        progressDigest,
        terminalClosureDigest,
      };
    }),
    receiptRegistry: validation.receipts.map((receipt) => {
      const fields = parseAuthorityFields(receipt.manifest, {
        ignoreManifestTargets: true,
      }).fields;
      const g7AttemptIdentity = receipt.gates.includes('G7')
        ? {
            provider: fields.get('provider'),
            tenant: fields.get('tenant'),
            project: fields.get('project'),
            task: fields.get('task'),
            attempt: fields.get('attempt'),
            stage: fields.get('stage'),
          }
        : null;
      const authorityDigest = createHash('sha256')
        .update(
          JSON.stringify({
            id: receipt.id,
            workIds: receipt.workIds,
            gates: receipt.gates,
            manifest: receipt.manifest,
            ownerDecision: receipt.ownerDecision,
            recorded: receipt.recorded,
          }),
          'utf8',
        )
        .digest('hex');
      return {
        id: receipt.id,
        authorityDigest,
        lifecycle: receipt.lifecycle
          ? {
              mode: receipt.lifecycle.mode,
              status: receipt.lifecycle.status,
              transitionAt: receipt.lifecycle.transitionAt,
            }
          : null,
        g7AttemptIdentity,
      };
    }),
    workItems,
  };
  return {
    ...model,
    registryIntegrity: {
      algorithm: 'sha256(canonical-json-utf8)',
      value: registryIntegrityDigest(model),
    },
  };
}

/** @param {string} value */
function escapeMarkdownCell(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

/** @param {string[]} values */
function renderList(values) {
  return values.length === 0 ? '—' : values.map((value) => `\`${value}\``).join(', ');
}

/**
 * @param {ReturnType<typeof buildActiveModel>} model
 */
export function renderActiveMarkdown(model) {
  const lines = [
    '# Deckent Active Work View',
    '',
    '> Auto-generated from [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md). Do not edit by hand.',
    '> Run `npm run docs:master-plan` to regenerate and `npm run lint:master-plan` to verify.',
    '',
    `**Schema:** ${model.schemaVersion}`,
    '',
    `**Source digest:** \`${model.sourceDigest.algorithm}:${model.sourceDigest.value}\``,
    '',
    `**Rows:** ${model.summary.total} total · ${model.summary.active} active · ${model.summary.terminal} terminal`,
    '',
    '## State summary',
    '',
    '| State | Count |',
    '|---|---:|',
    ...STATES.map((state) => `| ${state} | ${model.summary.byState[state]} |`),
    '',
    '## Active ledger',
    '',
    '| Order | ID | State | Priority | Program | DependsOn | Blocker | Outcome |',
    '|---:|---|---|---|---|---|---|---|',
    ...model.workItems.map(
      (item) =>
        `| ${item.order} | \`${item.id}\` | ${item.state} | ${item.priority} | ${item.program} | ${renderList(
          item.dependsOn,
        )} | ${item.blockerCode ? `\`${item.blockerCode}\`` : '—'} | ${escapeMarkdownCell(
          item.outcome,
        )} |`,
    ),
    '',
  ];
  return `${lines.join('\n')}`;
}

/**
 * @param {ReturnType<typeof validateMasterPlan>} validation
 */
export function generateActiveViews(validation) {
  if (!validation.ok) {
    throw new Error('cannot generate active views from an invalid MASTER plan');
  }
  const model = buildActiveModel(validation);
  return {
    [ACTIVE_MARKDOWN_RELATIVE_PATH]: renderActiveMarkdown(model),
    [ACTIVE_JSON_RELATIVE_PATH]: `${JSON.stringify(model, null, 2)}\n`,
  };
}

/**
 * Prevent a normal regeneration from silently deleting/reordering identities
 * already published in a schema-v3 projection. This is a temporal ratchet over
 * the tracked prior view; the canonical ledger remains the source of current
 * row content.
 *
 * @param {string} root
 * @param {ReturnType<typeof validateMasterPlan>} validation
 */
export function checkIdentityContinuity(root, validation) {
  let previous;
  let previousRaw;
  try {
    previousRaw = /** @type {string} */ (
      readRegularFile(root, ACTIVE_JSON_RELATIVE_PATH)
    );
    previous = JSON.parse(previousRaw);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return {
        ok: false,
        state: 'missing-prior-registry',
        findings: [
          {
            code: 'IDENTITY_REGISTRY_MISSING',
            message:
              'prior authority registry is missing; restore the tracked projection before regeneration',
          },
        ],
      };
    }
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        state: 'invalid-prior-registry',
        findings: [
          {
            code: 'IDENTITY_REGISTRY_INVALID',
            message: `prior identity registry is not valid JSON: ${error.message}`,
          },
        ],
      };
    }
    return {
      ok: false,
      state: 'prior-registry-unreadable',
      scanError: true,
      findings: [
        {
          code: 'IDENTITY_REGISTRY_UNREADABLE',
          message: `prior identity registry is unsafe or unreadable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }

  if (
    !previous ||
    previous.schemaVersion !== 3 ||
    !Array.isArray(previous.identityRegistry) ||
    !Array.isArray(previous.receiptRegistry)
  ) {
    return {
      ok: false,
      state: 'legacy-prior-registry',
      findings: [
        {
          code: 'IDENTITY_REGISTRY_MIGRATION_REQUIRED',
          message:
            'prior projection is not exact authority schema v3; migration requires a separately reviewed code/version receipt, not a runtime bypass flag',
        },
      ],
    };
  }

  const findings = [];
  const priorById = new Map();
  const priorOrders = new Set();
  const priorWorkItems = Array.isArray(previous.workItems)
    ? previous.workItems
    : [];
  let previousOrder = -Infinity;
  const summary = previous.summary;
  if (
    previous.generatedFrom !== MASTER_PLAN_RELATIVE_PATH ||
    previous.registryIntegrity?.algorithm !== 'sha256(canonical-json-utf8)' ||
    !/^[a-f0-9]{64}$/.test(previous.registryIntegrity?.value ?? '') ||
    registryIntegrityDigest(previous) !== previous.registryIntegrity?.value
  ) {
    findings.push({
      code: 'IDENTITY_REGISTRY_INTEGRITY',
      message:
        'prior projection origin or canonical payload integrity digest is invalid',
    });
  }
  if (
    !summary ||
    !Number.isSafeInteger(summary.total) ||
    summary.total <= 0 ||
    !Number.isSafeInteger(summary.active) ||
    !Number.isSafeInteger(summary.terminal) ||
    summary.active < 0 ||
    summary.terminal < 0 ||
    summary.active + summary.terminal !== summary.total ||
    summary.total !== previous.identityRegistry.length ||
    !Array.isArray(previous.workItems) ||
    summary.active !== priorWorkItems.length ||
    !Number.isSafeInteger(summary.receipts) ||
    summary.receipts < 0 ||
    summary.receipts !== previous.receiptRegistry.length ||
    previous.sourceDigest?.algorithm !== 'sha256(normalized-lf-utf8)' ||
    !/^[a-f0-9]{64}$/.test(previous.sourceDigest?.value ?? '') ||
    !STATES.every(
      (state) =>
        Number.isSafeInteger(summary.byState?.[state]) &&
        summary.byState[state] >= 0,
    ) ||
    STATES.reduce(
      (total, state) => total + (Number(summary.byState?.[state]) || 0),
      0,
    ) !== summary.total ||
    !PRIORITIES.every(
      (priority) =>
        Number.isSafeInteger(summary.byPriority?.[priority]) &&
        summary.byPriority[priority] >= 0,
    ) ||
    PRIORITIES.reduce(
      (total, priority) =>
        total + (Number(summary.byPriority?.[priority]) || 0),
      0,
    ) !== summary.total ||
    !PROGRAMS.every(
      (program) =>
        Number.isSafeInteger(summary.byProgram?.[program]) &&
        summary.byProgram[program] >= 0,
    ) ||
    PROGRAMS.reduce(
      (total, program) => total + (Number(summary.byProgram?.[program]) || 0),
      0,
    ) !== summary.total
  ) {
    findings.push({
      code: 'IDENTITY_REGISTRY_INVALID',
      message: 'prior projection summary/digest/registry cardinality is inconsistent',
    });
  }
  for (const entry of previous.identityRegistry) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !CANONICAL_ID_RE.test(entry.id) ||
      !Number.isSafeInteger(entry.order) ||
      entry.order <= 0 ||
      entry.order <= previousOrder ||
      !PROGRAMS.includes(entry.program) ||
      !PRIORITIES.includes(entry.priority) ||
      !STATES.includes(entry.state) ||
      !isRealIsoDate(entry.updated) ||
      !/^[a-f0-9]{64}$/.test(entry.definitionDigest ?? '') ||
      !/^[a-f0-9]{64}$/.test(entry.progressDigest ?? '') ||
      (TERMINAL_STATES.has(entry.state)
        ? !/^[a-f0-9]{64}$/.test(entry.terminalClosureDigest ?? '')
        : entry.terminalClosureDigest !== null) ||
      priorById.has(entry.id) ||
      priorOrders.has(entry.order)
    ) {
      findings.push({
        code: 'IDENTITY_REGISTRY_INVALID',
        message: 'prior identity registry contains malformed or duplicate entries',
      });
      break;
    }
    priorById.set(entry.id, entry);
    priorOrders.add(entry.order);
    previousOrder = entry.order;
  }
  for (const state of STATES) {
    const registryCount = [...priorById.values()].filter(
      (entry) => entry.state === state,
    ).length;
    if (summary?.byState?.[state] !== registryCount) {
      findings.push({
        code: 'IDENTITY_REGISTRY_INVALID',
        message: `prior byState.${state} does not match identityRegistry`,
      });
    }
  }
  for (const priority of PRIORITIES) {
    const registryCount = [...priorById.values()].filter(
      (entry) => entry.priority === priority,
    ).length;
    if (summary?.byPriority?.[priority] !== registryCount) {
      findings.push({
        code: 'IDENTITY_REGISTRY_INVALID',
        message: `prior byPriority.${priority} does not match identityRegistry`,
      });
    }
  }
  for (const program of PROGRAMS) {
    const registryCount = [...priorById.values()].filter(
      (entry) => entry.program === program,
    ).length;
    if (summary?.byProgram?.[program] !== registryCount) {
      findings.push({
        code: 'IDENTITY_REGISTRY_INVALID',
        message: `prior byProgram.${program} does not match identityRegistry`,
      });
    }
  }
  const priorActiveIds = [...priorById.values()]
    .filter((entry) => !TERMINAL_STATES.has(entry.state))
    .map((entry) => entry.id);
  const priorTerminalCount =
    priorById.size - priorActiveIds.length;
  if (
    summary?.active !== priorActiveIds.length ||
    summary?.terminal !== priorTerminalCount
  ) {
    findings.push({
      code: 'IDENTITY_REGISTRY_INVALID',
      message:
        'prior active/terminal summary does not match identityRegistry states',
    });
  }
  const priorWorkItemIds = new Set();
  for (const item of priorWorkItems) {
    const registryEntry = priorById.get(item?.id);
    const blockerShapeValid =
      (item?.blockerCode === null && item?.blockerRemedy === null) ||
      (typeof item?.blockerCode === 'string' &&
        BLOCKER_CODE_RE.test(item.blockerCode) &&
        typeof item?.blockerRemedy === 'string' &&
        isMeaningfulLedgerText(item.blockerRemedy));
    const itemShapeValid =
      item &&
      Number.isSafeInteger(item.order) &&
      item.order > 0 &&
      typeof item.parent === 'string' &&
      PROGRAMS.includes(item.program) &&
      PRIORITIES.includes(item.priority) &&
      Array.isArray(item.dependsOn) &&
      Array.isArray(item.gates) &&
      typeof item.outcome === 'string' &&
      typeof item.acceptance === 'string' &&
      typeof item.evidence === 'string' &&
      isRealIsoDate(item.updated) &&
      item.truth &&
      TRUTH_KEYS.every((key) => TRUTH_VALUES.includes(item.truth[key])) &&
      blockerShapeValid;
    const blocker = item?.blockerCode
      ? { code: item.blockerCode, remedy: item.blockerRemedy }
      : null;
    if (
      !item ||
      !itemShapeValid ||
      typeof item.id !== 'string' ||
      !registryEntry ||
      registryEntry.order !== item.order ||
      registryEntry.program !== item.program ||
      registryEntry.priority !== item.priority ||
      registryEntry.state !== item.state ||
      registryEntry.updated !== item.updated ||
      registryEntry.definitionDigest !== workDefinitionDigest(item) ||
      registryEntry.progressDigest !== workProgressDigest(item, blocker) ||
      TERMINAL_STATES.has(registryEntry.state) ||
      priorWorkItemIds.has(item.id)
    ) {
      findings.push({
        code: 'IDENTITY_REGISTRY_INVALID',
        message: 'prior active workItems are not a unique subset of identityRegistry',
      });
      break;
    }
    priorWorkItemIds.add(item.id);
  }
  if (
    JSON.stringify(priorWorkItems.map((item) => item?.id)) !==
    JSON.stringify(priorActiveIds)
  ) {
    findings.push({
      code: 'IDENTITY_REGISTRY_INVALID',
      message:
        'prior workItems must list every non-terminal identity exactly once in registry order',
    });
  }

  const currentModel = buildActiveModel(validation);
  const currentById = new Map(
    currentModel.identityRegistry.map((entry) => [entry.id, entry]),
  );
  for (const [id, prior] of priorById) {
    const current = currentById.get(id);
    if (!current) {
      findings.push({
        code: 'IDENTITY_DELETION',
        message: `immutable Work ID ${id} disappeared; retain it and use DONE/DISPOSED`,
        workId: id,
      });
      continue;
    }
    if (current.order !== prior.order) {
      findings.push({
        code: 'IDENTITY_ORDER_DRIFT',
        message: `immutable Work ID ${id} changed Order ${prior.order} → ${current.order}`,
        workId: id,
      });
    }
    if (current.definitionDigest !== prior.definitionDigest) {
      findings.push({
        code: 'IDENTITY_DEFINITION_DRIFT',
        message: `immutable parent/program/outcome/acceptance/dependency/gate definition changed for ${id}`,
        workId: id,
      });
    }
    if (current.updated < prior.updated) {
      findings.push({
        code: 'WORK_UPDATED_ROLLBACK',
        message: `Work ID ${id} moved Updated backwards ${prior.updated} → ${current.updated}`,
        workId: id,
      });
    } else if (
      current.progressDigest !== prior.progressDigest &&
      current.updated === prior.updated &&
      current.updated < validation.asOfDate
    ) {
      findings.push({
        code: 'WORK_UPDATED_STALE',
        message: `Work ID ${id} changed priority/state/truth/evidence/blocker authority after its ${current.updated} review date without advancing Updated`,
        workId: id,
      });
    }
    if (!ALLOWED_STATE_TRANSITIONS[prior.state]?.has(current.state)) {
      findings.push({
        code: 'STATE_TRANSITION_INVALID',
        message: `Work ID ${id} cannot transition ${prior.state} → ${current.state}`,
        workId: id,
      });
    }
    if (
      TERMINAL_STATES.has(prior.state) &&
      current.terminalClosureDigest !== prior.terminalClosureDigest
    ) {
      findings.push({
        code: 'TERMINAL_CLOSURE_DRIFT',
        message: `terminal closure evidence changed for ${id}`,
        workId: id,
      });
    }
  }

  const currentReceiptById = new Map(
    currentModel.receiptRegistry.map((receipt) => [receipt.id, receipt]),
  );
  const priorReceiptById = new Map();
  const priorG7AttemptByKey = new Map();
  for (const receipt of previous.receiptRegistry) {
    const lifecycle = receipt?.lifecycle;
    const lifecycleShapeValid =
      lifecycle &&
      ['ONE_SHOT', 'EXPIRING'].includes(lifecycle.mode) &&
      ['active', 'consumed', 'expired', 'revoked'].includes(lifecycle.status) &&
      (lifecycle.status === 'active'
        ? lifecycle.transitionAt === null
        : strictRfc3339Ms(lifecycle.transitionAt ?? '') !== null);
    if (
      !receipt ||
      !/^GR-\d{4}-\d{2}-\d{2}-[A-Z0-9][A-Z0-9-]*$/.test(receipt.id) ||
      !/^[a-f0-9]{64}$/.test(receipt.authorityDigest ?? '') ||
      !lifecycleShapeValid ||
      priorReceiptById.has(receipt.id)
    ) {
      findings.push({
        code: 'RECEIPT_REGISTRY_INVALID',
        message: 'prior receipt registry contains malformed or duplicate entries',
      });
      break;
    }
    priorReceiptById.set(receipt.id, receipt);
    if (receipt.g7AttemptIdentity !== null) {
      const identity = receipt.g7AttemptIdentity;
      const values = [
        identity?.provider,
        identity?.tenant,
        identity?.project,
        identity?.task,
        identity?.attempt,
        identity?.stage,
      ];
      if (
        !isLowercaseAuthorityToken(identity?.provider) ||
        !isLowercaseAuthorityToken(identity?.tenant) ||
        !isLowercaseAuthorityToken(identity?.project) ||
        !CANONICAL_ID_RE.test(identity?.task ?? '') ||
        !isLowercaseAuthorityToken(identity?.attempt) ||
        !CANONICAL_ID_RE.test(identity?.stage ?? '')
      ) {
        findings.push({
          code: 'RECEIPT_REGISTRY_INVALID',
          message: `prior G7 attempt identity for ${receipt.id} is malformed`,
        });
        continue;
      }
      const key = JSON.stringify(values);
      if (priorG7AttemptByKey.has(key)) {
        findings.push({
          code: 'G7_ATTEMPT_REPLAY',
          message: `prior registry repeats G7 attempt identity for ${receipt.id}`,
        });
      } else {
        priorG7AttemptByKey.set(key, receipt.id);
      }
    }
  }

  const currentReceiptOrder = currentModel.receiptRegistry.map(
    (receipt) => receipt.id,
  );
  const priorReceiptOrder = previous.receiptRegistry.map(
    (receipt) => receipt?.id ?? null,
  );
  for (let index = 0; index < priorReceiptOrder.length; index += 1) {
    if (currentReceiptOrder[index] !== priorReceiptOrder[index]) {
      findings.push({
        code: 'RECEIPT_ORDER_DRIFT',
        message:
          'gate receipts are append-only; an existing receipt moved or a new receipt was inserted before prior history',
      });
      break;
    }
  }

  for (const [id, prior] of priorReceiptById) {
    const current = currentReceiptById.get(id);
    if (!current) {
      findings.push({
        code: 'RECEIPT_DELETION',
        message: `immutable gate receipt ${id} disappeared`,
      });
      continue;
    }
    if (current.authorityDigest !== prior.authorityDigest) {
      findings.push({
        code: 'RECEIPT_AUTHORITY_DRIFT',
        message: `immutable authority fields changed for receipt ${id}`,
      });
    }
    const priorLifecycle = prior.lifecycle;
    const currentLifecycle = current.lifecycle;
    const terminalPrior = priorLifecycle.status !== 'active';
    const lifecycleValid =
      currentLifecycle &&
      currentLifecycle.mode === priorLifecycle.mode &&
      (terminalPrior
        ? currentLifecycle.status === priorLifecycle.status &&
          currentLifecycle.transitionAt === priorLifecycle.transitionAt
        : ['active', 'consumed', 'expired', 'revoked'].includes(
            currentLifecycle.status,
          ));
    if (!lifecycleValid) {
      findings.push({
        code: 'RECEIPT_LIFECYCLE_REPLAY',
        message: `receipt ${id} lifecycle reversed or rewrote a terminal transition`,
      });
    }
  }

  for (const receipt of currentModel.receiptRegistry) {
    if (receipt.g7AttemptIdentity === null) continue;
    const identity = receipt.g7AttemptIdentity;
    const key = JSON.stringify([
      identity.provider,
      identity.tenant,
      identity.project,
      identity.task,
      identity.attempt,
      identity.stage,
    ]);
    const priorReceiptId = priorG7AttemptByKey.get(key);
    if (priorReceiptId && priorReceiptId !== receipt.id) {
      findings.push({
        code: 'G7_ATTEMPT_REPLAY',
        message: `G7 attempt identity moved from ${priorReceiptId} to ${receipt.id}`,
      });
    }
  }
  return {
    ok: findings.length === 0,
    state: findings.length === 0 ? 'continuous' : 'authority-drift',
    findings,
    priorRegistrySha256: createHash('sha256')
      .update(previousRaw, 'utf8')
      .digest('hex'),
  };
}

/** @param {string} root @param {string} target */
function assertTargetInsideRoot(root, target) {
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`generated target escapes repository root: ${target}`);
  }
}

/** @param {unknown} error @param {string} code */
function hasErrorCode(error, code) {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    /** @type {{ code?: unknown }} */ (error).code === code
  );
}

/** @param {string} path */
function pathEntryExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

/** @param {string} root */
function canonicalRepositoryRoot(root) {
  const canonicalRoot = realpathSync.native(resolve(root));
  const stat = lstatSync(canonicalRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`repository root is not a physical directory: ${root}`);
  }
  return canonicalRoot;
}

/** @param {string} root @param {string} targetDir */
function assertNoSymlinkPath(root, targetDir) {
  const rel = relative(root, targetDir);
  let cursor = root;
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (!pathEntryExists(cursor)) continue;
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`refusing generated write through symlinked directory: ${cursor}`);
    }
  }
}

/**
 * Read only a physical regular file below the physical repository root.
 * Symlinked parents, symlinked leaves, directories and FIFOs fail before read.
 *
 * @param {string} root
 * @param {string} relativePath
 * @param {BufferEncoding | null} [encoding]
 * @returns {string | Buffer}
 */
function readRegularFile(root, relativePath, encoding = 'utf8') {
  const canonicalRoot = canonicalRepositoryRoot(root);
  const target = resolve(canonicalRoot, relativePath);
  assertTargetInsideRoot(canonicalRoot, target);
  assertNoSymlinkPath(canonicalRoot, target);
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`refusing to read non-regular file: ${relativePath}`);
  }
  return encoding === null ? readFileSync(target) : readFileSync(target, encoding);
}

/** @param {string} path */
function syncParentDirectory(path) {
  if (process.platform === 'win32') return;
  let descriptor;
  try {
    descriptor = openSync(dirname(path), 'r');
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/** @param {string} root @param {string} sourceDigest */
function acquireProjectionWriteLock(root, sourceDigest) {
  const lockPath = resolve(root, ACTIVE_WRITE_LOCK_RELATIVE_PATH);
  assertTargetInsideRoot(root, lockPath);
  assertNoSymlinkPath(root, dirname(lockPath));
  mkdirSync(dirname(lockPath), { recursive: true });
  assertNoSymlinkPath(root, dirname(lockPath));
  const nonce = `${process.pid}-${randomUUID()}`;
  let descriptor;
  let openedStat;
  try {
    descriptor = openSync(lockPath, 'wx', 0o600);
    openedStat = fstatSync(descriptor);
    writeFileSync(
      descriptor,
      `${JSON.stringify({
        schemaVersion: 1,
        pid: process.pid,
        nonce,
        sourceDigest,
        acquiredAt: new Date().toISOString(),
      })}\n`,
      'utf8',
    );
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    syncParentDirectory(lockPath);
    return { lockPath, nonce };
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (openedStat) {
      try {
        const currentStat = lstatSync(lockPath);
        if (
          currentStat.isFile() &&
          !currentStat.isSymbolicLink() &&
          currentStat.dev === openedStat.dev &&
          currentStat.ino === openedStat.ino
        ) {
          rmSync(lockPath);
          syncParentDirectory(lockPath);
        }
      } catch {
        // Preserve the original acquisition error. An ownership mismatch is
        // intentionally never removed by this process.
      }
    }
    if (hasErrorCode(error, 'EEXIST')) {
      throw new Error(
        `projection write lock already exists; verify the owning process and restore/remove the exact lock safely: ${lockPath}`,
      );
    }
    throw error;
  }
}

/** @param {{ lockPath: string, nonce: string }} lock */
function releaseProjectionWriteLock(lock) {
  const stat = lstatSync(lock.lockPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`projection write lock changed type during generation: ${lock.lockPath}`);
  }
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(lock.lockPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `projection write lock metadata became unreadable: ${lock.lockPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (metadata?.nonce !== lock.nonce) {
    throw new Error(`projection write lock ownership changed during generation: ${lock.lockPath}`);
  }
  rmSync(lock.lockPath);
  syncParentDirectory(lock.lockPath);
}

/**
 * Replace one derived projection without an observable target-absent window.
 * The temporary file is flushed before rename; on platforms that cannot
 * atomically replace an existing regular file, rename fails and the old target
 * remains intact. The two projections are intentionally recoverable derived
 * views, not a multi-file authority transaction: --check rejects any split
 * generation after interruption.
 *
 * @param {string} target
 * @param {string} content
 */
function atomicReplace(target, content) {
  const nonce = `${process.pid}-${randomUUID()}`;
  const temp = join(dirname(target), `.${basename(target)}.${nonce}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temp, 'wx', 0o666);
    writeFileSync(descriptor, content, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (pathEntryExists(target)) {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`refusing to replace non-regular generated target: ${target}`);
      }
    }
    renameSync(temp, target);
    syncParentDirectory(target);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temp, { force: true });
  }
}

/**
 * Validate source CAS before every write so a concurrent MASTER edit cannot
 * silently produce projections for an obsolete snapshot.
 *
 * @param {string} root
 * @param {string} sourceDigest
 * @param {Record<string, string>} views
 * @param {{
 *   nowMs?: number,
 *   expectedPriorRegistrySha256: string
 * }} options
 */
function writeActiveViews(root, sourceDigest, views, options) {
  const canonicalRoot = canonicalRepositoryRoot(root);
  if (
    !/^[a-f0-9]{64}$/.test(
      options?.expectedPriorRegistrySha256 ?? '',
    )
  ) {
    throw new Error(
      'projection write requires an exact prior-registry continuity capability',
    );
  }
  const viewKeys = Reflect.ownKeys(views ?? {});
  const requiredViewKeys = [
    ACTIVE_MARKDOWN_RELATIVE_PATH,
    ACTIVE_JSON_RELATIVE_PATH,
  ];
  if (
    viewKeys.length !== requiredViewKeys.length ||
    !requiredViewKeys.every((path) => viewKeys.includes(path)) ||
    requiredViewKeys.some((path) => typeof views[path] !== 'string')
  ) {
    throw new Error(
      `projection bundle must contain exactly ${requiredViewKeys.join(', ')}`,
    );
  }
  const lock = acquireProjectionWriteLock(canonicalRoot, sourceDigest);
  let operationError;
  try {
    const lockedSource = /** @type {string} */ (
      readRegularFile(canonicalRoot, MASTER_PLAN_RELATIVE_PATH)
    );
    if (normalizedSha256(lockedSource) !== sourceDigest) {
      throw new Error(
        'MASTER plan changed before locked generation; refusing stale projection write',
      );
    }
    const sourceValidation = validateMasterPlan(lockedSource, {
      root: canonicalRoot,
      nowMs: options.nowMs,
    });
    if (!sourceValidation.ok) {
      throw new Error('refusing projection write for an invalid current MASTER plan');
    }
    const lockedContinuity = checkIdentityContinuity(
      canonicalRoot,
      sourceValidation,
    );
    if (
      !lockedContinuity.ok ||
      lockedContinuity.priorRegistrySha256 !==
        options.expectedPriorRegistrySha256
    ) {
      throw new Error(
        'prior authority registry changed or failed continuity before locked generation',
      );
    }
    const expectedViews = generateActiveViews(sourceValidation);
    if (
      requiredViewKeys.some(
        (path) =>
          normalizeLineEndings(views[path]) !==
          normalizeLineEndings(expectedViews[path]),
      )
    ) {
      throw new Error(
        'projection bundle content does not match deterministic current MASTER generation',
      );
    }
    for (const relativePath of requiredViewKeys) {
      const content = views[relativePath];
      const currentSource = /** @type {string} */ (
        readRegularFile(canonicalRoot, MASTER_PLAN_RELATIVE_PATH)
      );
      if (normalizedSha256(currentSource) !== sourceDigest) {
        throw new Error('MASTER plan changed during generation; refusing stale projection write');
      }
      const currentPriorRegistry = /** @type {string} */ (
        readRegularFile(canonicalRoot, ACTIVE_JSON_RELATIVE_PATH)
      );
      const currentPriorDigest = createHash('sha256')
        .update(currentPriorRegistry, 'utf8')
        .digest('hex');
      if (currentPriorDigest !== options.expectedPriorRegistrySha256) {
        throw new Error(
          'prior authority registry changed during locked generation',
        );
      }
      const target = resolve(canonicalRoot, relativePath);
      assertTargetInsideRoot(canonicalRoot, target);
      assertNoSymlinkPath(canonicalRoot, dirname(target));
      mkdirSync(dirname(target), { recursive: true });
      assertNoSymlinkPath(canonicalRoot, dirname(target));
      atomicReplace(target, content);
    }
    if (
      normalizedSha256(
        /** @type {string} */ (
          readRegularFile(canonicalRoot, MASTER_PLAN_RELATIVE_PATH)
        ),
      ) !== sourceDigest
    ) {
      throw new Error(
        'MASTER plan changed before generation settled; projections are not authoritative',
      );
    }
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      releaseProjectionWriteLock(lock);
    } catch (lockError) {
      if (operationError) {
        throw new AggregateError(
          [operationError, lockError],
          'projection write failed and lock release could not be verified',
        );
      }
      throw lockError;
    }
  }
}

/**
 * @param {string} root
 * @param {Record<string, string>} views
 */
export function compareActiveViews(root, views) {
  return Object.entries(views).map(([relativePath, expected]) => {
    try {
      const actual = /** @type {string} */ (readRegularFile(root, relativePath));
      const contentMatches =
        normalizeLineEndings(actual) === normalizeLineEndings(expected);
      return {
        path: relativePath,
        state: contentMatches ? 'in-sync' : 'stale',
        ok: contentMatches,
      };
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        return { path: relativePath, state: 'missing', ok: false };
      }
      return {
        path: relativePath,
        state: 'unsafe-or-unreadable',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

/**
 * @param {string[]} argv
 * @returns {{
 *   help: boolean,
 *   mode: 'check' | 'write',
 *   json: boolean,
 *   root: string
 * }}
 */
export function parseArgs(argv) {
  let mode;
  let json = false;
  let root = DEFAULT_ROOT;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check' || arg === '--write') {
      const nextMode = arg.slice(2);
      if (mode && mode !== nextMode) throw new Error('--check and --write are mutually exclusive');
      mode = nextMode;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--root requires a path');
      root = resolve(value);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  const resolvedMode = mode ?? 'check';
  return { help, mode: resolvedMode, json, root };
}

function usage() {
  return [
    'lint-master-plan.mjs — canonical MASTER validator and active-view generator',
    '',
    'Usage:',
    '  node scripts/lint-master-plan.mjs --check [--json] [--root <repo>]',
    '  node scripts/lint-master-plan.mjs --write [--json] [--root <repo>]',
    '',
  ].join('\n');
}

/**
 * @param {string[]} argv
 * @param {{
 *   stdout?: NodeJS.WritableStream,
 *   stderr?: NodeJS.WritableStream,
 *   nowMs?: number,
 *   beforeProjectionWrite?: () => void
 * }} io
 */
export function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr.write(`[master-plan] usage error: ${error instanceof Error ? error.message : String(error)}\n`);
    stderr.write(usage());
    return 2;
  }
  if (args.help) {
    stdout.write(usage());
    return 0;
  }

  let source;
  try {
    source = /** @type {string} */ (
      readRegularFile(args.root, MASTER_PLAN_RELATIVE_PATH)
    );
  } catch (error) {
    const result = {
      ok: false,
      mode: args.mode,
      source: MASTER_PLAN_RELATIVE_PATH,
      error: error instanceof Error ? error.message : String(error),
    };
    if (args.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else stderr.write(`[master-plan] scan error: ${result.error}\n`);
    return 2;
  }

  const validation = validateMasterPlan(source, {
    root: args.root,
    nowMs: io.nowMs,
  });
  if (!validation.ok) {
    const result = {
      ok: false,
      mode: args.mode,
      source: MASTER_PLAN_RELATIVE_PATH,
      sourceSha256: validation.sourceSha256,
      rowCount: validation.items.length,
      findings: validation.findings,
    };
    if (args.json) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      stderr.write(
        `[master-plan] FAIL — ${validation.findings.length} canonical invariant violation(s):\n`,
      );
      for (const finding of validation.findings) {
        const where = [
          finding.line ? `${MASTER_PLAN_RELATIVE_PATH}:${finding.line}` : MASTER_PLAN_RELATIVE_PATH,
          finding.workId ? `[${finding.workId}]` : '',
        ]
          .filter(Boolean)
          .join(' ');
        stderr.write(`  - ${finding.code} ${where}: ${finding.message}\n`);
      }
    }
    return 1;
  }

  const identityContinuity = checkIdentityContinuity(args.root, validation);
  if (!identityContinuity.ok) {
    const result = {
      ok: false,
      mode: args.mode,
      source: MASTER_PLAN_RELATIVE_PATH,
      sourceSha256: validation.sourceSha256,
      rowCount: validation.items.length,
      identityContinuity: identityContinuity.state,
      findings: identityContinuity.findings,
    };
    if (args.json) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      stderr.write(
        `[master-plan] FAIL — ${identityContinuity.findings.length} identity continuity violation(s):\n`,
      );
      for (const finding of identityContinuity.findings) {
        stderr.write(
          `  - ${finding.code}${finding.workId ? ` [${finding.workId}]` : ''}: ${finding.message}\n`,
        );
      }
    }
    return identityContinuity.scanError ? 2 : 1;
  }

  const views = generateActiveViews(validation);
  if (args.mode === 'write') {
    try {
      io.beforeProjectionWrite?.();
      writeActiveViews(args.root, validation.sourceSha256, views, {
        nowMs: validation.validationNowMs,
        expectedPriorRegistrySha256:
          identityContinuity.priorRegistrySha256,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (args.json) {
        stdout.write(
          `${JSON.stringify(
            {
              ok: false,
              mode: args.mode,
              source: MASTER_PLAN_RELATIVE_PATH,
              sourceSha256: validation.sourceSha256,
              error: message,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        stderr.write(`[master-plan] write error: ${message}\n`);
      }
      return 2;
    }
  }

  const projections = compareActiveViews(args.root, views);
  let sourceStable;
  try {
    sourceStable =
      normalizedSha256(
        /** @type {string} */ (
          readRegularFile(args.root, MASTER_PLAN_RELATIVE_PATH)
        ),
      ) === validation.sourceSha256;
  } catch (error) {
    const result = {
      ok: false,
      mode: args.mode,
      source: MASTER_PLAN_RELATIVE_PATH,
      sourceSha256: validation.sourceSha256,
      error: error instanceof Error ? error.message : String(error),
    };
    if (args.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else stderr.write(`[master-plan] scan error: ${result.error}\n`);
    return 2;
  }
  const ok = sourceStable && projections.every((projection) => projection.ok);
  const unsafeProjections = projections.filter(
    (projection) => projection.state === 'unsafe-or-unreadable',
  );
  const result = {
    ok,
    mode: args.mode,
    source: MASTER_PLAN_RELATIVE_PATH,
    sourceSha256: validation.sourceSha256,
    rowCount: validation.items.length,
    activeCount: validation.items.filter((item) => !TERMINAL_STATES.has(item.state)).length,
    receiptCount: validation.receipts.length,
    blockerCount: validation.blockers.length,
    identityContinuity: identityContinuity.state,
    sourceStable,
    projections,
  };

  if (args.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const projection of projections) {
      stdout.write(`  ${projection.ok ? '✓' : '✗'} ${projection.path} — ${projection.state}\n`);
    }
    if (ok) {
      stdout.write(
        `\n[master-plan] OK — ${result.rowCount} rows, ${result.activeCount} active, ` +
          `${result.receiptCount} receipts, ${result.blockerCount} blocker classes; projections in sync.\n`,
      );
    } else {
      if (unsafeProjections.length > 0) {
        for (const projection of unsafeProjections) {
          stderr.write(
            `[master-plan] scan error: ${projection.path}: ${projection.error ?? projection.state}\n`,
          );
        }
      } else {
        stderr.write(
          sourceStable
            ? '\n[master-plan] FAIL — generated projections are missing/stale. ' +
                'Run `npm run docs:master-plan` and review the diff.\n'
            : '\n[master-plan] FAIL — canonical source changed during validation; rerun on a stable snapshot.\n',
        );
      }
    }
  }
  if (unsafeProjections.length > 0) return 2;
  return ok ? 0 : 1;
}

/**
 * Decide whether this module is the process entrypoint.
 *
 * MASTER-CLI-SYMLINK-FLAKE-001 root cause: the previous guard wrapped both `realpathSync`
 * calls in `try { … } catch { return false }`. Any resolution error — a symlinked entry whose
 * target is momentarily unreadable, a pruned scratch directory, a sandbox that refuses
 * `realpath` on one of the two paths — was swallowed into "not the entrypoint". The CLI then
 * produced NO output and exited 0, which is indistinguishable from a successful run. That is
 * the fail-open/silent-exit the acceptance criterion forbids, and it is why a full-file test
 * run could intermittently observe empty stdout while the isolated test passed: the outcome
 * depended on whether `realpath` happened to succeed, not on the contract.
 *
 * Contract now:
 * - No entry argument at all (imported as a library) → not main, silently. This is the normal
 *   path for `import { validateMasterPlan } from …` and must stay quiet.
 * - Both paths resolve → canonical identity decides. Symlinked entries work because `realpath`
 *   resolves them to the same target.
 * - Either path fails to resolve → fall back to a lexical comparison instead of swallowing the
 *   error, and report the degraded decision on stderr. A wrong answer is then loud, never silent.
 *
 * Pure and injectable so the contract is testable without spawning a process.
 *
 * @param {string} modulePath absolute path of this module
 * @param {string | undefined} argvEntry `process.argv[1]`
 * @param {(path: string) => string} [resolveReal] realpath implementation (injected in tests)
 * @returns {{ isMain: boolean, basis: 'no-entry' | 'canonical' | 'lexical-fallback' }}
 */
export function resolveEntrypointIdentity(
  modulePath,
  argvEntry,
  resolveReal = realpathSync.native,
) {
  if (!argvEntry) return { isMain: false, basis: 'no-entry' };
  // Both operands are normalized ONCE, up front, so the two branches below cannot disagree
  // about what "the same path" means. The canonical branch used to canonicalize a raw
  // `modulePath` against an already-`resolve()`d `entryPath` while the lexical branch resolved
  // both — the same function contradicting itself. Behaviour-neutral at the real call site
  // (`fileURLToPath(import.meta.url)` and `process.argv[1]` are both native-absolute already,
  // and `resolve` is idempotent on those), but the asymmetry was a live trap for any other
  // caller and it made platform-dependent path normalization decide the answer.
  const entryPath = resolve(argvEntry);
  const modulePathResolved = resolve(modulePath);
  const canonical = (candidate) => {
    try {
      return resolveReal(candidate);
    } catch {
      return null;
    }
  };
  const moduleReal = canonical(modulePathResolved);
  const entryReal = canonical(entryPath);
  if (moduleReal !== null && entryReal !== null) {
    return { isMain: moduleReal === entryReal, basis: 'canonical' };
  }
  return { isMain: modulePathResolved === entryPath, basis: 'lexical-fallback' };
}

const entrypoint = resolveEntrypointIdentity(
  fileURLToPath(import.meta.url),
  process.argv[1],
);

if (entrypoint.basis === 'lexical-fallback') {
  // Degraded identity resolution must never be silent, whichever way it decided.
  process.stderr.write(
    '[master-plan] WARN — entrypoint identity resolved lexically because realpath failed; '
      + `treating this invocation as ${entrypoint.isMain ? 'the CLI entrypoint' : 'a library import'}.\n`,
  );
}

if (entrypoint.isMain) {
  process.exitCode = main();
}
