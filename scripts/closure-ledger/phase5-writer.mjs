#!/usr/bin/env node
import { userInfo } from 'node:os';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalize,
  computeBatchManifestDigest,
  computeEventDigest,
  digestOf,
} from './canonical.mjs';
import {
  loadBatchManifests,
  loadBatchSnapshots,
  parseLedger,
  parseTrustAnchorsDoc,
  resolveTrustAnchorScope,
  runGate,
} from '../lint-closure-dispositions.mjs';
import { registryIntegrityDigest } from '../master-plan-integrity.mjs';
import { project, writeBundle } from './project.mjs';

const ZERO_ANCHOR = '0'.repeat(64);
const SUBJECT_FIELDS = Object.freeze([
  'kind', 'tenantId', 'projectId', 'masterSnapshotDigest',
  'registryIntegrityDigest', 'proposalDigest', 'unsignedManifestDigest',
  'eventCount', 'seqIntervalStart', 'seqIntervalEnd',
]);
const BUNDLE_FILES = Object.freeze([
  'dry-run-summary.json', 'events.json', 'master-snapshot.json', 'proposal.md',
]);
const VIEW_FILES = Object.freeze({
  levelLane: 'level-lane.json', active: 'active.json', born: 'born.json',
  closureHealth: 'closure-health.json',
});

export class WriterError extends Error {
  constructor(code, message, cause) {
    super(`${code}: ${message}`, cause === undefined ? undefined : { cause });
    this.name = 'WriterError';
    this.code = code;
  }
}

const fail = (code, message, cause) => { throw new WriterError(code, message, cause); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWithin = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

function requiredBytes(path, label) {
  try { return readFileSync(path); }
  catch (error) { fail('E_WRITER_INPUT', `${label} is unreadable: ${path}`, error); }
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (error) { fail('E_WRITER_MALFORMED', `${label} is not valid JSON`, error); }
}

function exactSubject(value, label = 'subject') {
  if (!isObject(value)) fail('E_WRITER_SUBJECT', `${label} must be an object`);
  const keys = Object.keys(value).sort();
  const expected = [...SUBJECT_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) {
    fail('E_WRITER_SUBJECT', `${label} must contain exactly the closure-disposition-batch field set`);
  }
  if (value.kind !== 'closure-disposition-batch') fail('E_WRITER_SUBJECT', `${label}.kind is invalid`);
  for (const key of SUBJECT_FIELDS.slice(1, 7)) {
    if (typeof value[key] !== 'string' || value[key].length === 0) fail('E_WRITER_SUBJECT', `${label}.${key} must be non-empty`);
  }
  for (const key of SUBJECT_FIELDS.slice(7)) {
    if (!Number.isInteger(value[key])) fail('E_WRITER_SUBJECT', `${label}.${key} must be an integer`);
  }
  return Object.fromEntries(SUBJECT_FIELDS.map((key) => [key, value[key]]));
}

function subjectFromSummary(summary) {
  return exactSubject(Object.fromEntries(SUBJECT_FIELDS.map((key) => [key, summary?.[key]])), 'dry-run summary subject');
}

function sameJson(a, b) {
  try { return canonicalize(a) === canonicalize(b); }
  catch { return false; }
}

function ensurePlainDirectory(path, label) {
  let stat;
  try { stat = lstatSync(path); } catch (error) { fail('E_WRITER_PATH', `${label} is unavailable: ${path}`, error); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('E_WRITER_PATH', `${label} must be a non-symlink directory: ${path}`);
  return resolve(path);
}

function ensureRoot(root) {
  if (typeof root !== 'string' || root.length === 0) fail('E_WRITER_ARGUMENT', '--root <projectRoot> is required');
  return ensurePlainDirectory(resolve(root), 'project root');
}

function resolveInside(parent, candidate, label) {
  const abs = resolve(candidate);
  if (!isWithin(parent, abs)) fail('E_WRITER_PATH', `${label} must remain inside project root: ${candidate}`);
  return abs;
}

function readBundle(bundleDir) {
  const dir = ensurePlainDirectory(resolve(bundleDir), 'bundle');
  const bytes = Object.fromEntries(BUNDLE_FILES.map((name) => [name, requiredBytes(join(dir, name), `bundle ${name}`)]));
  const summary = parseJson(bytes['dry-run-summary.json'], 'dry-run-summary.json');
  const events = parseJson(bytes['events.json'], 'events.json');
  const master = parseJson(bytes['master-snapshot.json'], 'master-snapshot.json');
  if (!Array.isArray(events) || events.length === 0) fail('E_WRITER_BUNDLE', 'events.json must be a non-empty array');
  return { dir, bytes, summary, subject: subjectFromSummary(summary), events, master };
}

function loadTrustAnchorAuthority(projectRoot) {
  const path = join(projectRoot, 'docs/governance/closure-trust-anchors.json');
  const parsed = parseTrustAnchorsDoc(requiredBytes(path, 'trust anchors').toString('utf8'), path);
  const resolved = resolveTrustAnchorScope(parsed.anchors);
  const problems = [...parsed.problems, ...resolved.problems];
  if (problems.length > 0 || resolved.scope === null) {
    fail('E_WRITER_TRUST_ANCHOR', `trust-anchor authority is unavailable: ${problems.map((problem) => problem.code).join(', ') || 'unknown'}`);
  }
  return { anchors: parsed.anchors, scope: resolved.scope };
}

function fsyncFile(path) {
  const fd = openSync(path, 'r+');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function atomicReplace(path, bytes, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    writeFileSync(tmp, bytes, { mode });
    fsyncFile(tmp);
    renameSync(tmp, path);
  } catch (error) {
    try { unlinkSync(tmp); } catch { /* best effort */ }
    throw error;
  }
}

function createFirstWriterWins(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') chmodSync(dirname(path), 0o700);
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    fsyncFile(tmp);
    linkSync(tmp, path);
    if (process.platform !== 'win32') chmodSync(path, 0o600);
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  } finally {
    try { unlinkSync(tmp); } catch { /* best effort */ }
  }
}

function readExistingJson(path, label) {
  return parseJson(requiredBytes(path, label), label);
}

function requestIdFor(subject) {
  return `aprcdb-${subject.unsignedManifestDigest.slice(0, 32)}`;
}

function approvalRequest(subject, requestId, now) {
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  return {
    id: requestId,
    version: '1.0',
    requester: { role: 'worker', instanceId: 'phase5-writer' },
    summary: `Closure disposition batch ${subject.unsignedManifestDigest.slice(0, 12)}`,
    details: { subject },
    scopeId: `closure-disposition-batch:${subject.projectId}`,
    scope: 'file-write',
    risk: 'critical',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: subject.tenantId,
    // The terminal decide ingress mints its live-session actorId from the OS
    // username (approvals CLI → userInfo().username) and rejects on
    // actorId !== request.userId — a fixed literal here can never be decided.
    userId: userInfo().username,
    createdAt,
    expiresAt,
    maskedArgs: { unsignedManifestDigest: subject.unsignedManifestDigest, eventCount: subject.eventCount },
    rawArgsRef: `closure-bundle:${subject.unsignedManifestDigest}`,
  };
}

export function fileClaim({ bundleDir, root, now = new Date() }) {
  const projectRoot = ensureRoot(root);
  const bundle = readBundle(bundleDir);
  const authority = loadTrustAnchorAuthority(projectRoot);
  const recomputed = recomputeBundleSubject(bundle, authority.scope);
  if (!sameJson(bundle.subject, recomputed)) fail('E_WRITER_BUNDLE_DIGEST', 'dry-run summary does not match recomputed bundle bytes and trust-anchor scope');
  const claimPath = join(bundle.dir, 'claim.json');
  if (existsSync(claimPath)) {
    const claim = readExistingJson(claimPath, 'claim.json');
    if (!isObject(claim) || typeof claim.requestId !== 'string' || claim.claimRef !== `approval:${claim.requestId}`) {
      fail('E_WRITER_CLAIM', 'existing claim.json is malformed');
    }
    const persisted = readExistingJson(join(projectRoot, '.deckent', 'approvals', `${claim.requestId}.request.json`), 'persisted approval request');
    if (!sameJson(persisted.details?.subject, bundle.subject)) fail('E_WRITER_CLAIM_MISMATCH', 'existing claim does not bind this bundle subject');
    return claim;
  }
  const requestId = requestIdFor(bundle.subject);
  const requestPath = join(projectRoot, '.deckent', 'approvals', `${requestId}.request.json`);
  const request = approvalRequest(bundle.subject, requestId, now);
  let persisted = request;
  try {
    if (!createFirstWriterWins(requestPath, request)) persisted = readExistingJson(requestPath, 'persisted approval request');
  } catch (error) {
    if (error instanceof WriterError) throw error;
    fail('E_WRITER_BROKER_WRITE', 'failed to persist canonical ApprovalBroker request', error);
  }
  if (!sameJson(persisted.details?.subject, bundle.subject)) fail('E_WRITER_CLAIM_COLLISION', `approval request id collision for ${requestId}`);
  const claim = { requestId, claimRef: `approval:${requestId}` };
  try { atomicReplace(claimPath, `${JSON.stringify(claim, null, 2)}\n`); }
  catch (error) { fail('E_WRITER_CLAIM_WRITE', 'failed to write claim.json', error); }
  return claim;
}

function recomputeBundleSubject(bundle, closureScope) {
  const seqs = bundle.events.map((event) => event?.seq);
  if (seqs.some((seq) => !Number.isInteger(seq))) fail('E_WRITER_BUNDLE', 'every event seq must be an integer');
  const masterSourceDigest = bundle.master?.sourceDigest?.value;
  const embeddedRegistryIntegrity = bundle.master?.registryIntegrity?.value;
  if (typeof masterSourceDigest !== 'string' || typeof embeddedRegistryIntegrity !== 'string') fail('E_WRITER_BUNDLE', 'master snapshot digest fields are missing');
  const computedRegistryIntegrity = registryIntegrityDigest(bundle.master);
  if (embeddedRegistryIntegrity !== computedRegistryIntegrity) fail('E_WRITER_BUNDLE', 'master snapshot registryIntegrity is stale');
  return exactSubject({
    kind: 'closure-disposition-batch',
    tenantId: closureScope.tenantId,
    projectId: closureScope.projectId,
    masterSnapshotDigest: masterSourceDigest,
    registryIntegrityDigest: computedRegistryIntegrity,
    proposalDigest: digestOf(bundle.bytes['proposal.md'].toString('utf8')),
    unsignedManifestDigest: computeBatchManifestDigest(bundle.events),
    eventCount: bundle.events.length,
    seqIntervalStart: Math.min(...seqs),
    seqIntervalEnd: Math.max(...seqs),
  }, 'recomputed bundle subject');
}

function finalizedEvents(unsignedEvents, receipt, previousEvents) {
  let previousDigest = previousEvents.length === 0 ? ZERO_ANCHOR : previousEvents.at(-1)?.eventDigest;
  if (typeof previousDigest !== 'string' || previousDigest.length === 0) fail('E_WRITER_LEDGER', 'existing ledger has no usable terminal eventDigest');
  const finalized = [];
  for (const event of unsignedEvents) {
    const next = {
      ...event,
      rowRef: { ...event.rowRef, batchManifestDigest: receipt.subject.unsignedManifestDigest },
      authorityProof: { receiptRef: receipt.requestId, ownerReceipt: receipt.claimRef },
      previousEventDigest: previousDigest,
    };
    next.eventDigest = computeEventDigest(next);
    finalized.push(next);
    previousDigest = next.eventDigest;
  }
  return finalized;
}

function stable(value) {
  return `${JSON.stringify(value, (_key, item) => (
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.keys(item).sort().reduce((out, key) => { out[key] = item[key]; return out; }, {})
      : item
  ), 2)}\n`;
}

function renderedViews(events, master) {
  const views = project(events, master);
  return Object.fromEntries(Object.keys(VIEW_FILES).map((key) => [key, stable(views[key])]));
}

function gateInputs(root, ledgerText, trustAnchors) {
  const receiptsDir = join(root, 'docs/governance/closure-dispositions.receipts');
  const batchesDir = join(root, 'docs/governance/closure-batches');
  const { manifests, problems: receiptProblems } = loadBatchManifests(receiptsDir);
  return runGate({
    ledgerText,
    baseline: null,
    registry: JSON.parse(readFileSync(join(root, 'docs/generated/master-plan-active.json'), 'utf8')).identityRegistry,
    masterSourceDigest: null,
    batchManifests: manifests,
    verifyAuthority: true,
    trustAnchors,
    batchSnapshots: loadBatchSnapshots(batchesDir),
    trustAnchorProblems: [],
    receiptProblems,
  });
}

function assertGate(result, code) {
  if (result.ok) return;
  const problems = [...result.errors, ...result.holds].map((problem) => problem.code).join(', ');
  fail(code, `closure gate refused ledger: ${problems || 'unknown refusal'}`);
}

function archiveBundle(bundle, destination) {
  if (existsSync(destination)) {
    for (const name of BUNDLE_FILES) {
      const existing = requiredBytes(join(destination, name), `archived ${name}`);
      if (!existing.equals(bundle.bytes[name])) fail('E_WRITER_ARCHIVE_COLLISION', `archived batch differs at ${name}`);
    }
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  const tmp = `${destination}.tmp.${process.pid}.${randomBytes(6).toString('hex')}`;
  try {
    mkdirSync(tmp, { mode: 0o700 });
    for (const name of BUNDLE_FILES) {
      copyFileSync(join(bundle.dir, name), join(tmp, name));
      fsyncFile(join(tmp, name));
    }
    renameSync(tmp, destination);
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true });
    fail('E_WRITER_ARCHIVE_WRITE', 'failed to archive immutable bundle bytes', error);
  }
}

export function appendBundle({ bundleDir, receiptPath, root }) {
  const projectRoot = ensureRoot(root);
  const governanceDir = resolveInside(projectRoot, join(projectRoot, 'docs/governance'), 'governance directory');
  const bundle = readBundle(bundleDir);
  if (isWithin(governanceDir, bundle.dir)) fail('E_WRITER_BUNDLE_LOCATION', 'staging bundle must be outside docs/governance');
  if (typeof receiptPath !== 'string' || receiptPath.length === 0) fail('E_WRITER_ARGUMENT', '--receipt <path> is required');
  const receiptBytes = requiredBytes(resolve(receiptPath), 'receipt');
  const receipt = parseJson(receiptBytes, 'receipt');
  if (!isObject(receipt) || typeof receipt.requestId !== 'string') fail('E_WRITER_RECEIPT', 'receipt requestId is missing');
  if (basename(resolve(receiptPath)) !== `${receipt.requestId}.json`) fail('E_WRITER_RECEIPT_FILENAME', 'receipt filename must equal <requestId>.json');
  if (receipt.decision !== 'allow' || receipt.closureReason !== undefined) fail('E_WRITER_RECEIPT_DECISION', 'receipt is not an owner allow decision');
  if (receipt.claimRef !== `approval:${receipt.requestId}`) fail('E_WRITER_RECEIPT_CLAIM', 'receipt claimRef is invalid');
  const receiptSubject = exactSubject(receipt.subject, 'receipt subject');
  const authority = loadTrustAnchorAuthority(projectRoot);
  const recomputed = recomputeBundleSubject(bundle, authority.scope);
  if (!sameJson(bundle.subject, recomputed)) fail('E_WRITER_BUNDLE_DIGEST', 'dry-run summary does not match recomputed bundle bytes');
  if (!sameJson(receiptSubject, recomputed)) fail('E_WRITER_RECEIPT_SUBJECT', 'receipt subject does not match recomputed bundle bytes');

  const trustAnchors = authority.anchors;
  const ledgerPath = join(governanceDir, 'closure-dispositions.jsonl');
  const existingText = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : '';
  const parsedExisting = parseLedger(existingText);
  if (parsedExisting.problems.length > 0) fail('E_WRITER_LEDGER', `existing ledger is malformed: ${parsedExisting.problems.map((p) => p.code).join(', ')}`);
  const events = finalizedEvents(bundle.events, receipt, parsedExisting.events);
  const allEvents = [...parsedExisting.events, ...events];
  const ledgerText = `${existingText}${events.map((event) => canonicalize(event)).join('\n')}\n`;

  // Preflight the sole authority validator against an isolated snapshot of every
  // would-be live artifact. No docs/governance mutation happens before this passes.
  const preflight = join(projectRoot, `.phase5-writer-preflight-${process.pid}-${randomBytes(6).toString('hex')}`);
  try {
    const preGov = join(preflight, 'docs/governance');
    mkdirSync(join(preflight, 'docs/generated'), { recursive: true });
    const liveReceipts = join(governanceDir, 'closure-dispositions.receipts');
    const liveBatches = join(governanceDir, 'closure-batches');
    const preReceipts = join(preGov, 'closure-dispositions.receipts');
    const preBatches = join(preGov, 'closure-batches');
    if (existsSync(liveReceipts)) cpSync(liveReceipts, preReceipts, { recursive: true, errorOnExist: true });
    else mkdirSync(preReceipts, { recursive: true });
    if (existsSync(liveBatches)) cpSync(liveBatches, preBatches, { recursive: true, errorOnExist: true });
    else mkdirSync(preBatches, { recursive: true });
    const preBatch = join(preBatches, recomputed.unsignedManifestDigest);
    if (existsSync(preBatch)) rmSync(preBatch, { recursive: true, force: true });
    mkdirSync(preBatch, { recursive: true });
    copyFileSync(join(projectRoot, 'docs/generated/master-plan-active.json'), join(preflight, 'docs/generated/master-plan-active.json'));
    writeFileSync(join(preGov, 'closure-dispositions.jsonl'), ledgerText);
    writeFileSync(join(preReceipts, `${receipt.requestId}.json`), receiptBytes);
    for (const name of BUNDLE_FILES) copyFileSync(join(bundle.dir, name), join(preBatch, name));
    const { manifests, problems } = loadBatchManifests(preReceipts);
    const preResult = runGate({
      ledgerText,
      baseline: null,
      registry: bundle.master.identityRegistry,
      masterSourceDigest: bundle.master.sourceDigest?.value,
      batchManifests: manifests,
      verifyAuthority: true,
      trustAnchors,
      batchSnapshots: loadBatchSnapshots(preBatches),
      trustAnchorProblems: [],
      receiptProblems: problems,
    });
    assertGate(preResult, 'E_WRITER_PREFLIGHT_GATE');
  } finally {
    rmSync(preflight, { recursive: true, force: true });
  }

  const archiveDir = join(governanceDir, 'closure-batches', recomputed.unsignedManifestDigest);
  const receiptDestination = join(governanceDir, 'closure-dispositions.receipts', `${receipt.requestId}.json`);
  archiveBundle(bundle, archiveDir);
  if (existsSync(receiptDestination) && !requiredBytes(receiptDestination, 'existing receipt').equals(receiptBytes)) {
    fail('E_WRITER_RECEIPT_COLLISION', 'existing receipt bytes differ');
  }
  if (!existsSync(receiptDestination)) atomicReplace(receiptDestination, receiptBytes);
  try { atomicReplace(ledgerPath, ledgerText); }
  catch (error) { fail('E_WRITER_LEDGER_WRITE', 'failed to atomically append ledger bytes', error); }

  const projectionDir = join(governanceDir, 'closure-projections');
  try { writeBundle(projectionDir, renderedViews(allEvents, bundle.master)); }
  catch (error) { fail('E_WRITER_PROJECTION', 'atomic projection write failed after append', error); }
  const finalResult = gateInputs(projectRoot, ledgerText, trustAnchors);
  assertGate(finalResult, 'E_WRITER_POST_APPEND_GATE');
  return { requestId: receipt.requestId, eventCount: events.length, unsignedManifestDigest: recomputed.unsignedManifestDigest };
}

function parseArgs(argv) {
  const modes = argv.filter((arg) => arg === '--file-claim' || arg === '--append');
  if (modes.length !== 1) fail('E_WRITER_ARGUMENT', 'exactly one of --file-claim or --append is required');
  const mode = modes[0];
  const allowed = new Set(mode === '--file-claim' ? ['--file-claim', '--bundle', '--root'] : ['--append', '--bundle', '--receipt', '--root']);
  const args = { mode };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === mode) continue;
    if (!allowed.has(key)) fail('E_WRITER_UNKNOWN_FLAG', `unknown flag '${key}'`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) fail('E_WRITER_ARGUMENT', `${key} requires a value`);
    if (own(args, key)) fail('E_WRITER_ARGUMENT', `duplicate flag '${key}'`);
    args[key] = value;
  }
  if (!args['--bundle'] || !args['--root']) fail('E_WRITER_ARGUMENT', '--bundle and --root are required');
  if (mode === '--append' && !args['--receipt']) fail('E_WRITER_ARGUMENT', '--receipt is required for --append');
  return args;
}

export function runCli(argv) {
  const args = parseArgs(argv);
  if (args.mode === '--file-claim') return fileClaim({ bundleDir: args['--bundle'], root: args['--root'] });
  return appendBundle({ bundleDir: args['--bundle'], receiptPath: args['--receipt'], root: args['--root'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
