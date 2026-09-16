#!/usr/bin/env node
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMA,
  canonicalize,
  digestOf,
  computeBatchManifestDigest,
} from './canonical.mjs';
import { registryIntegrityDigest } from '../master-plan-integrity.mjs';
import { parseTrustAnchorsDoc, resolveTrustAnchorScope } from '../lint-closure-dispositions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_MASTER = join(ROOT, 'docs/generated/master-plan-active.json');
const DEFAULT_PROPOSAL = join(ROOT, 'docs/governance/closure-classification-owner-proposal.md');
const DEFAULT_TRUST_ANCHORS = join(ROOT, 'docs/governance/closure-trust-anchors.json');
const DOCS_GOVERNANCE = join(ROOT, 'docs/governance');
const HEX64 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DECISION_FIELDS = Object.freeze({
  'level-lane-disposition': ['kind', 'level', 'lane', 'ruleId', 'confidence'],
  'priority-retriage': ['kind', 'fromPriority', 'toPriority'],
  admission: ['kind', 'disposition', 'parentOutcomeId'],
  'born-promotion': ['kind', 'promotedTo', 'outcomeId'],
  supersede: ['kind', 'targetSeq', 'reason'],
  revoke: ['kind', 'targetSeq', 'reason'],
});
const UNSIGNED_TOP = new Set(['schemaVersion', 'seq', 'eventId', 'recordedAt', 'rowRef', 'decision', 'evidenceRefs', 'supersedesSeq']);

export class DryRunError extends Error {
  constructor(code, message, cause) {
    super(`${code}: ${message}`, cause === undefined ? undefined : { cause });
    this.name = 'DryRunError';
    this.code = code;
  }
}

const fail = (code, message, cause) => { throw new DryRunError(code, message, cause); };
const isWithin = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
function readRequired(path, label) {
  try { return readFileSync(path); }
  catch (error) { fail('E_DRYRUN_INPUT', `${label} is unreadable: ${path}`, error); }
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (error) { fail('E_DRYRUN_MALFORMED', `${label} is not valid JSON`, error); }
}

function requireString(value, field, index) {
  if (typeof value !== 'string' || value.length === 0) fail('E_DRYRUN_SCHEMA', `event ${index}: ${field} must be a non-empty string`);
}

function validateDecision(decision, index) {
  if (decision === null || typeof decision !== 'object' || Array.isArray(decision)) fail('E_DRYRUN_SCHEMA', `event ${index}: decision must be an object`);
  const allowed = DECISION_FIELDS[decision.kind];
  if (!allowed || !SCHEMA.decisionKinds.values.includes(decision.kind)) fail('E_DRYRUN_SCHEMA', `event ${index}: unknown decision.kind '${decision.kind}'`);
  for (const key of Object.keys(decision)) if (!allowed.includes(key)) fail('E_DRYRUN_SCHEMA', `event ${index}: unknown decision field '${key}'`);
  if (decision.kind === 'level-lane-disposition') {
    if (!SCHEMA.levels.values.includes(decision.level)) fail('E_DRYRUN_SCHEMA', `event ${index}: invalid decision.level`);
    if (![...SCHEMA.lanes.values, SCHEMA.lanes.holdState].includes(decision.lane)) fail('E_DRYRUN_SCHEMA', `event ${index}: invalid decision.lane`);
    requireString(decision.ruleId, 'decision.ruleId', index);
    if (!['high', 'medium', 'low'].includes(decision.confidence)) fail('E_DRYRUN_SCHEMA', `event ${index}: invalid decision.confidence`);
  } else if (decision.kind === 'priority-retriage') {
    if (!SCHEMA.priorities.values.includes(decision.toPriority)) fail('E_DRYRUN_SCHEMA', `event ${index}: invalid decision.toPriority`);
    if (decision.fromPriority !== undefined && !SCHEMA.priorities.values.includes(decision.fromPriority)) fail('E_DRYRUN_SCHEMA', `event ${index}: invalid decision.fromPriority`);
  } else if (decision.kind === 'admission') {
    if (!SCHEMA.admissionDispositions.values.includes(decision.disposition)) fail('E_DRYRUN_SCHEMA', `event ${index}: invalid decision.disposition`);
    if (SCHEMA.admissionDispositions.requiresParentOutcome.includes(decision.disposition)) requireString(decision.parentOutcomeId, 'decision.parentOutcomeId', index);
  } else if (decision.kind === 'born-promotion') {
    if (decision.promotedTo !== 'committed-outcome') fail('E_DRYRUN_SCHEMA', `event ${index}: invalid decision.promotedTo`);
    requireString(decision.outcomeId, 'decision.outcomeId', index);
  } else {
    if (!Number.isInteger(decision.targetSeq)) fail('E_DRYRUN_SCHEMA', `event ${index}: decision.targetSeq must be an integer`);
    requireString(decision.reason, 'decision.reason', index);
  }
}

export function validateUnsignedEvents(value) {
  if (!Array.isArray(value) || value.length === 0) fail('E_DRYRUN_DECISIONS', 'decisions must be a non-empty JSON array');
  const seenIds = new Set();
  value.forEach((event, index) => {
    if (event === null || typeof event !== 'object' || Array.isArray(event)) fail('E_DRYRUN_SCHEMA', `event ${index}: expected an object`);
    for (const forbidden of ['authorityProof', 'eventDigest', 'previousEventDigest']) if (forbidden in event) fail('E_DRYRUN_SCHEMA', `event ${index}: forbidden finalized field '${forbidden}'`);
    for (const key of Object.keys(event)) if (!UNSIGNED_TOP.has(key)) fail('E_DRYRUN_SCHEMA', `event ${index}: unknown top-level field '${key}'`);
    if (event.schemaVersion !== SCHEMA.schemaVersion) fail('E_DRYRUN_SCHEMA', `event ${index}: schemaVersion must be ${SCHEMA.schemaVersion}`);
    if (!Number.isInteger(event.seq)) fail('E_DRYRUN_SCHEMA', `event ${index}: seq must be an integer`);
    requireString(event.eventId, 'eventId', index);
    if (seenIds.has(event.eventId)) fail('E_DRYRUN_SCHEMA', `event ${index}: duplicate eventId '${event.eventId}'`);
    seenIds.add(event.eventId);
    requireString(event.recordedAt, 'recordedAt', index);
    if (!ISO_UTC.test(event.recordedAt)) fail('E_DRYRUN_SCHEMA', `event ${index}: recordedAt must be strict ISO UTC`);
    if (event.rowRef === null || typeof event.rowRef !== 'object' || Array.isArray(event.rowRef)) fail('E_DRYRUN_SCHEMA', `event ${index}: rowRef must be an object`);
    for (const field of SCHEMA.rowRef.requiredFields.filter((field) => field !== 'batchManifestDigest')) requireString(event.rowRef[field], `rowRef.${field}`, index);
    if ('batchManifestDigest' in event.rowRef) fail('E_DRYRUN_SCHEMA', `event ${index}: rowRef.batchManifestDigest is finalized later`);
    for (const key of Object.keys(event.rowRef)) if (!SCHEMA.rowRef.requiredFields.includes(key)) fail('E_DRYRUN_SCHEMA', `event ${index}: unknown rowRef field '${key}'`);
    validateDecision(event.decision, index);
  });
  return value;
}

function prepareOutputDirectory(outDir) {
  const abs = resolve(outDir);
  const docsReal = realpathSync(DOCS_GOVERNANCE);
  let probe = abs;
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const existingReal = realpathSync(probe);
  const resolvedThroughAncestor = resolve(existingReal, relative(probe, abs));
  if (isWithin(docsReal, resolvedThroughAncestor)) fail('E_DRYRUN_FORBIDDEN_OUTDIR', `outDir may not be under docs/governance: ${outDir}`);
  if (existsSync(abs) && lstatSync(abs).isSymbolicLink()) fail('E_DRYRUN_PATH_ESCAPE', `outDir may not be a symbolic link: ${outDir}`);
  mkdirSync(abs, { recursive: true });
  const realOut = realpathSync(abs);
  if (isWithin(docsReal, realOut)) fail('E_DRYRUN_FORBIDDEN_OUTDIR', `outDir resolves under docs/governance: ${outDir}`);
  return realOut;
}

function outputPath(outDir, name) {
  const candidate = resolve(outDir, name);
  if (!isWithin(outDir, candidate) || dirname(candidate) !== outDir) fail('E_DRYRUN_PATH_ESCAPE', `output path escapes outDir: ${name}`);
  if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) fail('E_DRYRUN_PATH_ESCAPE', `output path is a symbolic link: ${candidate}`);
  return candidate;
}

function closureScopeFromTrustAnchors(bytes, label) {
  const parsed = parseTrustAnchorsDoc(bytes.toString('utf8'), label);
  const resolved = resolveTrustAnchorScope(parsed.anchors);
  const problems = [...parsed.problems, ...resolved.problems];
  if (problems.length > 0 || resolved.scope === null) {
    fail('E_DRYRUN_AUTHORITY', `trust-anchor scope is unavailable: ${problems.map((problem) => problem.code).join(', ') || 'unknown'}`);
  }
  return resolved.scope;
}

export function createDryRunArtifacts({ events, master, proposalBytes, closureScope }) {
  validateUnsignedEvents(events);
  if (master === null || typeof master !== 'object' || Array.isArray(master)) fail('E_DRYRUN_MASTER', 'MASTER must be a JSON object');
  const sourceDigest = master.sourceDigest;
  if (sourceDigest?.algorithm !== 'sha256(normalized-lf-utf8)' || typeof sourceDigest.value !== 'string' || !HEX64.test(sourceDigest.value)) fail('E_DRYRUN_MASTER', 'MASTER sourceDigest is missing or malformed');
  const registryDigest = registryIntegrityDigest(master);
  const embeddedRegistry = master.registryIntegrity;
  if (embeddedRegistry?.algorithm !== 'sha256(canonical-json-utf8)' || embeddedRegistry.value !== registryDigest) fail('E_DRYRUN_MASTER', 'MASTER registryIntegrity is missing, malformed, or stale');
  const tenantId = closureScope?.tenantId;
  const projectId = closureScope?.projectId;
  requireString(tenantId, 'trust-anchor tenantId', 'authority');
  requireString(projectId, 'trust-anchor projectId', 'authority');
  const unsignedManifestDigest = computeBatchManifestDigest(events);
  const proposalDigest = digestOf(proposalBytes.toString('utf8'));
  const seqs = events.map((event) => event.seq);
  const subject = {
    kind: 'closure-disposition-batch', tenantId, projectId,
    masterSnapshotDigest: sourceDigest.value,
    registryIntegrityDigest: registryDigest,
    proposalDigest, unsignedManifestDigest,
    eventCount: events.length,
    seqIntervalStart: Math.min(...seqs),
    seqIntervalEnd: Math.max(...seqs),
  };
  const signedBindingPreview = {
    requestId: null, claimRef: null, decision: null,
    tenantId, projectId,
    masterSnapshotDigest: subject.masterSnapshotDigest,
    registryIntegrityDigest: registryDigest,
    proposalDigest, unsignedManifestDigest,
    eventCount: subject.eventCount,
    seqIntervalStart: subject.seqIntervalStart,
    seqIntervalEnd: subject.seqIntervalEnd,
    authenticatedAt: null, decidedAt: null, authExpiresAt: null,
  };
  return { summary: { ...subject, signedBindingPreview } };
}

export function buildDryRunBundle({
  decisionsPath,
  outDir,
  masterPlanPath = DEFAULT_MASTER,
  proposalPath = DEFAULT_PROPOSAL,
  trustAnchorsPath = DEFAULT_TRUST_ANCHORS,
}) {
  if (typeof decisionsPath !== 'string' || decisionsPath.length === 0) fail('E_DRYRUN_ARGUMENT', 'decisionsPath is required');
  if (typeof outDir !== 'string' || outDir.length === 0) fail('E_DRYRUN_ARGUMENT', 'outDir is required');
  const decisions = parseJson(readRequired(decisionsPath, 'decisions'), 'decisions');
  const masterBytes = readRequired(masterPlanPath, 'MASTER');
  const master = parseJson(masterBytes, 'MASTER');
  const proposalBytes = readRequired(proposalPath, 'proposal');
  const closureScope = closureScopeFromTrustAnchors(readRequired(trustAnchorsPath, 'trust anchors'), trustAnchorsPath);
  const artifacts = createDryRunArtifacts({ events: decisions, master, proposalBytes, closureScope });
  const realOut = prepareOutputDirectory(outDir);
  const outputs = Object.fromEntries(['events.json', 'proposal.md', 'master-snapshot.json', 'dry-run-summary.json'].map((name) => [name, outputPath(realOut, name)]));
  writeFileSync(outputs['events.json'], `${canonicalize(decisions)}\n`, 'utf8');
  writeFileSync(outputs['proposal.md'], proposalBytes);
  writeFileSync(outputs['master-snapshot.json'], masterBytes);
  writeFileSync(outputs['dry-run-summary.json'], `${JSON.stringify(artifacts.summary, null, 2)}\n`, 'utf8');
  return artifacts.summary;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]; const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) fail('E_DRYRUN_ARGUMENT', `invalid CLI argument near '${key ?? ''}'`);
    args[key.slice(2)] = value;
  }
  if (!args.decisions || !args.out) fail('E_DRYRUN_ARGUMENT', '--decisions <path> and --out <dir> are required');
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summary = buildDryRunBundle({ decisionsPath: args.decisions, outDir: args.out, masterPlanPath: args.master, proposalPath: args.proposal });
    process.stdout.write(`${JSON.stringify({ masterSnapshotDigest: summary.masterSnapshotDigest, registryIntegrityDigest: summary.registryIntegrityDigest, proposalDigest: summary.proposalDigest, unsignedManifestDigest: summary.unsignedManifestDigest }, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
