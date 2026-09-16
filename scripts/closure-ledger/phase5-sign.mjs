#!/usr/bin/env node
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createPrivateKey, createPublicKey, randomBytes, sign } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from './canonical.mjs';
import { parseTrustAnchorsDoc } from '../lint-closure-dispositions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = realpathSync(resolve(HERE, '..', '..'));
const SUBJECT_FIELDS = Object.freeze([
  'kind', 'tenantId', 'projectId', 'masterSnapshotDigest',
  'registryIntegrityDigest', 'proposalDigest', 'unsignedManifestDigest',
  'eventCount', 'seqIntervalStart', 'seqIntervalEnd',
]);
const ISO_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;
const AUTH_WINDOW_MS = 10 * 60 * 1000;

export const REASON = Object.freeze({
  ARGUMENT: 'E_SIGN_ARGUMENT',
  UNKNOWN_FLAG: 'E_SIGN_UNKNOWN_FLAG',
  INPUT: 'E_SIGN_INPUT',
  MALFORMED: 'E_SIGN_MALFORMED',
  BUNDLE: 'E_SIGN_BUNDLE',
  CLAIM: 'E_SIGN_CLAIM',
  DECISION: 'E_SIGN_DECISION',
  KEY_NOT_ABSOLUTE: 'E_SIGN_KEY_NOT_ABSOLUTE',
  KEY_IN_REPO: 'E_SIGN_KEY_IN_REPO',
  KEY_SYMLINK: 'E_SIGN_KEY_SYMLINK',
  KEY_MODE: 'E_SIGN_KEY_MODE',
  KEY_CUSTODY_UNVERIFIABLE: 'E_SIGN_KEY_CUSTODY_UNVERIFIABLE',
  PUBLIC_KEY_INPUT: 'E_SIGN_PUBLIC_KEY_INPUT',
  KEY_INVALID: 'E_SIGN_KEY_INVALID',
  KEY_NOT_ED25519: 'E_SIGN_KEY_NOT_ED25519',
  TRUST_ANCHOR: 'E_SIGN_TRUST_ANCHOR',
  KEY_NOT_TRUSTED: 'E_SIGN_KEY_NOT_TRUSTED',
  KEY_AMBIGUOUS: 'E_SIGN_KEY_AMBIGUOUS',
  OUTPUT_EXISTS: 'E_SIGN_OUTPUT_EXISTS',
  OUTPUT_WRITE: 'E_SIGN_OUTPUT_WRITE',
});

export class SignError extends Error {
  constructor(code, message, cause) {
    super(`${code}: ${message}`, cause === undefined ? undefined : { cause });
    this.name = 'SignError';
    this.code = code;
  }
}

const fail = (code, message, cause) => { throw new SignError(code, message, cause); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const within = (parent, candidate) => {
  const rel = relative(parent, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

function readBytes(path, label) {
  try { return readFileSync(path); }
  catch (error) { fail(REASON.INPUT, `${label} is unreadable: ${path}`, error); }
}

function readJson(path, label) {
  try { return JSON.parse(readBytes(path, label).toString('utf8')); }
  catch (error) {
    if (error instanceof SignError) throw error;
    fail(REASON.MALFORMED, `${label} is not valid JSON`, error);
  }
}

function exactSubject(summary) {
  const subject = Object.fromEntries(SUBJECT_FIELDS.map((field) => [field, summary?.[field]]));
  if (subject.kind !== 'closure-disposition-batch') fail(REASON.BUNDLE, 'dry-run summary kind must be closure-disposition-batch');
  for (const field of SUBJECT_FIELDS.slice(1, 7)) {
    if (typeof subject[field] !== 'string' || subject[field].length === 0) fail(REASON.BUNDLE, `dry-run summary ${field} must be non-empty`);
  }
  for (const field of SUBJECT_FIELDS.slice(7)) {
    if (!Number.isInteger(subject[field])) fail(REASON.BUNDLE, `dry-run summary ${field} must be an integer`);
  }
  return subject;
}

function readBundle(bundleDir, requestId) {
  let stat;
  const dir = resolve(bundleDir || '');
  try { stat = lstatSync(dir); } catch (error) { fail(REASON.INPUT, `bundle is unavailable: ${dir}`, error); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(REASON.BUNDLE, `bundle must be a non-symlink directory: ${dir}`);
  const subject = exactSubject(readJson(join(dir, 'dry-run-summary.json'), 'dry-run-summary.json'));
  const claim = readJson(join(dir, 'claim.json'), 'claim.json');
  if (!isObject(claim) || claim.requestId !== requestId || claim.claimRef !== `approval:${requestId}`) {
    fail(REASON.CLAIM, 'claim.json must bind the requested requestId as approval:<requestId>');
  }
  return { subject, claimRef: claim.claimRef };
}

function privateKeyPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0 || !isAbsolute(rawPath)) {
    fail(REASON.KEY_NOT_ABSOLUTE, '--key must be an absolute path outside the repository');
  }
  let stat;
  try { stat = lstatSync(rawPath); } catch (error) { fail(REASON.INPUT, `private key is unreadable: ${rawPath}`, error); }
  if (stat.isSymbolicLink()) fail(REASON.KEY_SYMLINK, 'private key path must not be a symlink');
  if (!stat.isFile()) fail(REASON.KEY_INVALID, 'private key path must name a regular file');
  const actual = realpathSync(rawPath);
  if (within(REPO_ROOT, actual)) fail(REASON.KEY_IN_REPO, `refusing a private key inside the repository: ${actual}`);
  if (process.platform === 'win32') fail(REASON.KEY_CUSTODY_UNVERIFIABLE, 'file-key signing cannot verify private-key ACL custody on Windows');
  const mode = stat.mode & 0o777;
  if (mode !== 0o600) fail(REASON.KEY_MODE, `private key mode must be exactly 0600 (got 0${mode.toString(8)})`);
  return actual;
}

function loadPrivateKey(path) {
  const bytes = readBytes(path, 'private key');
  const labels = [...bytes.toString('utf8').matchAll(/-----BEGIN ([A-Za-z0-9 ]+?)-----/g)].map((match) => match[1].trim());
  if (labels.some((label) => label === 'PUBLIC KEY')) fail(REASON.PUBLIC_KEY_INPUT, '--key requires a private Ed25519 key, not a PUBLIC KEY input');
  let key;
  try { key = createPrivateKey(bytes); } catch (error) { fail(REASON.KEY_INVALID, '--key is not a valid private key', error); }
  if (key.asymmetricKeyType !== 'ed25519') fail(REASON.KEY_NOT_ED25519, `private key type is '${key.asymmetricKeyType}', expected ed25519`);
  return key;
}

function resolveAnchor(privateKey, subject, trustAnchorsText) {
  const parsed = parseTrustAnchorsDoc(trustAnchorsText, 'signer trust anchors');
  if (parsed.problems.length > 0) fail(REASON.TRUST_ANCHOR, `trust-anchor validation failed: ${parsed.problems.map((problem) => problem.code).join(', ')}`);
  const publicDer = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const matches = [...parsed.anchors.entries()].filter(([, anchor]) => {
    try { return createPublicKey(anchor.publicKeyPem).export({ type: 'spki', format: 'der' }).equals(publicDer); }
    catch { return false; }
  });
  if (matches.length === 0) fail(REASON.KEY_NOT_TRUSTED, 'private key has no matching canonical trust anchor');
  const scoped = matches.filter(([, anchor]) => anchor.tenantId === subject.tenantId && anchor.projectId === subject.projectId);
  if (scoped.length === 0) fail(REASON.KEY_NOT_TRUSTED, 'matching trust anchor does not authorize this bundle tenant/project');
  if (scoped.length !== 1) fail(REASON.KEY_AMBIGUOUS, 'multiple trust anchors match this private key and tenant/project');
  return scoped[0][0];
}

function atomicCreate(path, text) {
  const destination = resolve(path);
  if (existsSync(destination)) fail(REASON.OUTPUT_EXISTS, `refusing to overwrite existing output: ${destination}`);
  const tmp = join(dirname(destination), `.${basename(destination)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  let fd;
  try {
    fd = openSync(tmp, 'wx', 0o600);
    writeFileSync(fd, text);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    linkSync(tmp, destination);
    unlinkSync(tmp);
  } catch (error) {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* best effort */ } }
    try { unlinkSync(tmp); } catch { /* best effort */ }
    if (error?.code === 'EEXIST') fail(REASON.OUTPUT_EXISTS, `refusing to overwrite existing output: ${destination}`);
    fail(REASON.OUTPUT_WRITE, `failed to write output: ${destination}`, error);
  }
}

export function signBundle({ bundleDir, requestId, decision, keyPath, outPath, now = new Date(), trustAnchorsText }) {
  if (decision !== 'allow') fail(REASON.DECISION, '--decision must be exactly allow');
  if (typeof requestId !== 'string' || requestId.length === 0) fail(REASON.ARGUMENT, '--request must be non-empty');
  const { subject, claimRef } = readBundle(bundleDir, requestId);
  const path = privateKeyPath(keyPath);
  const privateKey = loadPrivateKey(path);
  const anchorText = trustAnchorsText ?? readBytes(join(REPO_ROOT, 'docs/governance/closure-trust-anchors.json'), 'canonical trust anchors').toString('utf8');
  const keyId = resolveAnchor(privateKey, subject, anchorText);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail(REASON.ARGUMENT, 'now must be a valid Date');
  const authenticatedAt = now.toISOString();
  const decidedAt = authenticatedAt;
  const authExpiresAt = new Date(now.getTime() + AUTH_WINDOW_MS).toISOString();
  if (![authenticatedAt, decidedAt, authExpiresAt].every((value) => ISO_UTC.test(value))) fail(REASON.ARGUMENT, 'generated timestamps are not strict ISO-UTC');
  const binding = {
    requestId, claimRef, decision,
    tenantId: subject.tenantId, projectId: subject.projectId,
    masterSnapshotDigest: subject.masterSnapshotDigest,
    registryIntegrityDigest: subject.registryIntegrityDigest,
    proposalDigest: subject.proposalDigest,
    unsignedManifestDigest: subject.unsignedManifestDigest,
    eventCount: subject.eventCount,
    seqIntervalStart: subject.seqIntervalStart,
    seqIntervalEnd: subject.seqIntervalEnd,
    authenticatedAt, decidedAt, authExpiresAt,
  };
  const attestation = { keyId, signature: sign(null, Buffer.from(canonicalize(binding), 'utf8'), privateKey).toString('base64') };
  const receipt = { schemaVersion: 1, requestId, claimRef, decision, subject, authenticatedAt, decidedAt, authExpiresAt, attestation };
  if (outPath) atomicCreate(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { ...attestation, receipt };
}

function parseArgs(argv) {
  const allowed = new Set(['--bundle', '--request', '--decision', '--key', '--out']);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) fail(REASON.UNKNOWN_FLAG, `unknown flag '${flag}'`);
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) fail(REASON.ARGUMENT, `${flag} requires a value`);
    if (own(args, flag)) fail(REASON.ARGUMENT, `duplicate flag '${flag}'`);
    args[flag] = value;
  }
  for (const flag of ['--bundle', '--request', '--decision', '--key']) if (!args[flag]) fail(REASON.ARGUMENT, `${flag} is required`);
  return args;
}

export function runCli(argv) {
  const args = parseArgs(argv);
  return signBundle({ bundleDir: args['--bundle'], requestId: args['--request'], decision: args['--decision'], keyPath: args['--key'], outPath: args['--out'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runCli(process.argv.slice(2)))}\n`); }
  catch (error) {
    const code = error instanceof SignError ? error.code : 'E_SIGN_UNEXPECTED';
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`reasonCode=${code} ${message}\n`);
    process.exitCode = 1;
  }
}
