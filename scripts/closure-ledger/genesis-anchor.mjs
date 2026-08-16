#!/usr/bin/env node
// Closure OS — genesis trust-anchor PROVISIONING tool (the "REPORTED procedure",
// docs/governance/closure-os-sidecar-ledger.md §5 / closure-classification-schema.json
// trustAnchorRootOfTrust.genesis). This is the SEPARATE genesis PR's engine.
//
// WHAT IT IS. A buildless ceremony/verification tool with two provisioning modes:
//   • --adopt-public-key  (CANONICAL): the owner exports the PUBLIC key of a key held
//     in a hardware token / KMS / OS keychain; the tool never sees a private key. It
//     validates the Ed25519 public key and emits the public anchor + fingerprint.
//   • --generate  (software-key BOOTSTRAP): the tool generates an Ed25519 keypair and
//     writes a plaintext PKCS8 PRIVATE key to a caller-named path OUTSIDE the repo,
//     with POSIX 0600 enforced-and-verified. On Windows it refuses (typed HOLD) because
//     it cannot prove secure ACL custody. This mode does NOT provide hardware/keychain
//     custody and never claims to.
// Both modes then emit a conformant `closure-trust-anchors.json` (SPKI-PEM PUBLIC key
// only) + a deterministic, recomputable fingerprint manifest so the owner can VERIFY
// the exact fingerprint before reviewing/merging the PR.
//
// FAIL-CLOSED. Every destination (private-out, anchors-out, fingerprint-out) is
// preflighted absent BEFORE any keygen; the private key is created with O_EXCL (never
// overwrites, never follows a final symlink) and its mode is verified 0600 on POSIX;
// public outputs are also O_EXCL. A partial failure rolls back ONLY the files this run
// created (all-or-nothing); a pre-existing artifact is never modified or deleted. The
// private key is never printed to any stream.
//
// WHAT IT IS NOT. No ledger event, receipt, signature, MASTER/priority mutation; not
// the Phase-5 signer/writer. It cannot grant authority: authority derives ONLY from the
// reviewed-parent (owner reviewing the fingerprint and merging — merge-base HEAD
// origin/main). A key added in its own PR cannot self-authorize; that is why genesis is
// a separate PR the owner verifies. See resolveTrustAnchors() in the SOLE gate.
//
// SOLE STRICT VALIDATOR. Shape strictness is NOT re-implemented — this tool imports
// `parseTrustAnchorsDoc` from the SOLE gate (scripts/lint-closure-dispositions.mjs) and
// asserts every emitted anchor conforms to it, so there is exactly one trust-anchor
// schema authority and no mirror to drift.
//
// Node >=24, ESM. Cross-platform: fileURLToPath/join (no separators), NFC on identity
// inputs, LF output (.gitattributes `* text=auto eol=lf`), fingerprint over DER bytes.

import {
  generateKeyPairSync,
  createPublicKey,
  createHash,
} from 'node:crypto';
import {
  readFileSync, mkdirSync, existsSync, realpathSync, lstatSync,
  openSync, writeSync, fsyncSync, closeSync, fchmodSync, fstatSync, unlinkSync,
} from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { parseTrustAnchorsDoc } from '../lint-closure-dispositions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

const FINGERPRINT_ALGORITHM = 'sha256-spki-der';
const KEY_ALGORITHM = 'ed25519';

// ── stable, machine-parseable failure reason codes ────────────────────────────────
export const REASON = Object.freeze({
  MISSING_INPUT: 'GENESIS_MISSING_INPUT',
  PRIVATE_OUT_IN_REPO: 'GENESIS_PRIVATE_OUT_IN_REPO',
  PRIVATE_OUT_EXISTS: 'GENESIS_PRIVATE_OUT_EXISTS',
  ANCHORS_OUT_EXISTS: 'GENESIS_ANCHORS_OUT_EXISTS',
  FINGERPRINT_OUT_EXISTS: 'GENESIS_FINGERPRINT_OUT_EXISTS',
  PRIVATE_MODE_UNVERIFIED: 'GENESIS_PRIVATE_MODE_UNVERIFIED',
  WINDOWS_KEY_CUSTODY_UNVERIFIABLE: 'GENESIS_WINDOWS_KEY_CUSTODY_UNVERIFIABLE',
  PUBLIC_KEY_INVALID: 'GENESIS_PUBLIC_KEY_INVALID',
  PUBLIC_KEY_NOT_ED25519: 'GENESIS_PUBLIC_KEY_NOT_ED25519',
  ROTATIONS_NOT_ALLOWED: 'GENESIS_ROTATIONS_NOT_ALLOWED',
  NON_CONFORMANT: 'GENESIS_NON_CONFORMANT',
});

class GenesisError extends Error {
  constructor(reasonCode, message) { super(message); this.name = 'GenesisError'; this.reasonCode = reasonCode; }
}
function fail(reasonCode, message) { throw new GenesisError(reasonCode, message); }

// ── identity input normalization (NFC, exactly like closure canonical v1) ──────────
function normId(value) { return typeof value === 'string' ? value.normalize('NFC') : value; }

// ── fingerprint = sha256 over the SPKI DER bytes of the public key ────────────────
export function computeFingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return `sha256:${createHash('sha256').update(der).digest('hex')}`;
}

// ── build the conformant anchors doc (public key ONLY) ────────────────────────────
export function buildAnchorsDoc({ keyId, tenantId, projectId, publicKeyPem }) {
  return {
    schemaVersion: 1,
    anchors: [{ keyId: normId(keyId), publicKeyPem, tenantId: normId(tenantId), projectId: normId(projectId) }],
  };
}

// ── deterministic, recomputable fingerprint manifest (no timestamp/randomness) ────
export function buildFingerprintManifest(anchorsDoc) {
  const parsed = parseTrustAnchorsDoc(JSON.stringify(anchorsDoc), 'fingerprint-manifest');
  if (parsed.problems.length > 0) {
    fail(REASON.NON_CONFORMANT, `cannot fingerprint a non-conformant anchors doc: ${parsed.problems.map((p) => `${p.code} ${p.message}`).join('; ')}`);
  }
  // A GENESIS fingerprint manifest asserts predecessor: null — it has no rotations.
  // `rotations` is a legal top-level field parseTrustAnchorsDoc accepts, so the refusal
  // lives HERE: fingerprinting a rotations-bearing doc as "genesis" would mislabel a
  // post-genesis, reviewed-parent-signed state as the root.
  if (Array.isArray(anchorsDoc.rotations) && anchorsDoc.rotations.length > 0) {
    fail(REASON.ROTATIONS_NOT_ALLOWED, 'genesis fingerprint manifest refuses a rotations-bearing doc: a genesis anchor carries no rotations (predecessor: null); rotations are a post-genesis, reviewed-parent-signed act (out of scope for this tool)');
  }
  const anchors = (anchorsDoc.anchors ?? []).map((a) => ({
    keyId: a.keyId, tenantId: a.tenantId, projectId: a.projectId, fingerprint: computeFingerprint(a.publicKeyPem),
  }));
  return {
    schemaVersion: 1,
    keyAlgorithm: KEY_ALGORITHM,
    fingerprintAlgorithm: FINGERPRINT_ALGORITHM,
    genesis: true,
    predecessor: null,
    rotationBoundary: {
      depth: 1,
      requiresParentSignedRotation: true,
      note: 'A working-tree key not committed at the reviewed parent is trusted ONLY via a rotation receipt ed25519-signed by a reviewed-parent key (TRUST_ANCHOR_UNAUTHORIZED_ROTATION otherwise); a rotation-added key cannot authorize another rotation in the same change (depth-1). Genesis carries no rotations and no predecessor.',
    },
    anchors,
    generatedBy: 'scripts/closure-ledger/genesis-anchor.mjs',
  };
}

function serialize(obj) { return `${JSON.stringify(obj, null, 2)}\n`; }
function resolveOut(p) { return isAbsolute(p) ? p : resolve(process.cwd(), p); }

function requireIdentity(keyId, tenantId, projectId) {
  for (const [name, v] of [['--key-id', keyId], ['--tenant-id', tenantId], ['--project-id', projectId]]) {
    if (typeof v !== 'string' || v.trim() === '') {
      fail(REASON.MISSING_INPUT, `${name} is required and must be a non-empty string (owner-chosen identity; no canonical producer — it defines the anchor's tenant/project binding)`);
    }
  }
}

function assertConformant(anchorsDoc) {
  const check = parseTrustAnchorsDoc(JSON.stringify(anchorsDoc), 'generated');
  if (check.problems.length > 0) fail(REASON.NON_CONFORMANT, `generated anchor non-conformant: ${check.problems.map((p) => p.code).join(',')}`);
}

// ── Ed25519 public-key gate for adoption (SOLE-validator PEM parse + ed25519 type) ─
export function assertEd25519SpkiPem(pem) {
  let key;
  try { key = createPublicKey(pem); }
  catch { return fail(REASON.PUBLIC_KEY_INVALID, 'not a valid public key (expected an SPKI PEM public key)'); }
  if (key.asymmetricKeyType !== 'ed25519') {
    fail(REASON.PUBLIC_KEY_NOT_ED25519, `public key type is '${key.asymmetricKeyType}', expected ed25519 (trust-anchor authority is ed25519-only)`);
  }
  return key.export({ type: 'spki', format: 'pem' });
}

// ── repo-containment guard for the private-key path ───────────────────────────────
export function assertPrivateKeyOutsideRepo(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    fail(REASON.MISSING_INPUT, '--private-out <path> is required and must be a non-empty path OUTSIDE the repository');
  }
  const abs = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
  // Resolve the deepest existing ancestor (realpath) so a symlink anywhere in the path
  // that redirects into the repo is caught before we ever open a descriptor.
  let probe = abs;
  let existingAncestor = null;
  while (true) {
    if (existsSync(probe)) { existingAncestor = probe; break; }
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realAncestor = existingAncestor ? realpathSync(existingAncestor) : null;
  const realRepo = realpathSync(REPO_ROOT);
  const resolvedAbs = realAncestor ? join(realAncestor, relative(existingAncestor, abs)) : abs;
  const rel = relative(realRepo, resolvedAbs);
  const insideRepo = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (insideRepo) {
    fail(REASON.PRIVATE_OUT_IN_REPO, `refusing to write the owner private key inside the repository (${rel || '.'}); choose a path OUTSIDE ${realRepo} — a hardware-key-gated store or $HOME/.deckent-secrets/… (or use --adopt-public-key)`);
  }
  return resolvedAbs;
}

// ── fail-closed exclusive writes ───────────────────────────────────────────────────
function preflightAbsent(absPath, reasonCode) {
  try { lstatSync(absPath); }              // lstat, not stat: a symlink at the path counts as existing
  catch (e) { if (e.code === 'ENOENT') return; throw e; }
  fail(reasonCode, `refusing to overwrite an existing path (${absPath}); genesis provisioning is fail-closed — remove it or choose a fresh path`);
}

function writePrivateExclusive(absPath, pem, created) {
  const dir = dirname(absPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  let fd;
  try { fd = openSync(absPath, 'wx', 0o600); }   // O_WRONLY|O_CREAT|O_EXCL → EEXIST on file OR symlink
  catch (e) {
    if (e.code === 'EEXIST') fail(REASON.PRIVATE_OUT_EXISTS, `private-out already exists or is a symlink (${absPath}) — fail-closed (O_EXCL), nothing written`);
    throw e;
  }
  created.push(absPath);
  try {
    writeSync(fd, pem);
    fsyncSync(fd);
    if (process.platform !== 'win32') {
      fchmodSync(fd, 0o600);
      const mode = fstatSync(fd).mode & 0o777;
      if (mode !== 0o600) fail(REASON.PRIVATE_MODE_UNVERIFIED, `private key mode is 0${mode.toString(8)} after write, expected exactly 0600 — fail-closed`);
    }
  } finally { closeSync(fd); }
}

function writePublicExclusive(absPath, text, existsReason, created) {
  const dir = dirname(absPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  let fd;
  try { fd = openSync(absPath, 'wx', 0o644); }
  catch (e) {
    if (e.code === 'EEXIST') fail(existsReason, `output already exists or is a symlink (${absPath}) — fail-closed (O_EXCL), nothing overwritten`);
    throw e;
  }
  created.push(absPath);
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
}

// Roll back ONLY the files created in this run (all-or-nothing); a pre-existing artifact
// was never opened (O_EXCL) so it is never touched here.
function rollback(created) {
  for (const p of created.slice().reverse()) { try { unlinkSync(p); } catch { /* best-effort */ } }
}

// ── generate: SOFTWARE-KEY BOOTSTRAP (POSIX 0600-enforced; Windows → typed HOLD) ──
export function generate({ keyId, tenantId, projectId, privateOut, anchorsOut, fingerprintOut }) {
  requireIdentity(keyId, tenantId, projectId);
  const privateAbs = assertPrivateKeyOutsideRepo(privateOut);
  const anchorsAbs = anchorsOut ? resolveOut(anchorsOut) : null;
  const fingerprintAbs = fingerprintOut ? resolveOut(fingerprintOut) : null;

  if (process.platform === 'win32') {
    fail(REASON.WINDOWS_KEY_CUSTODY_UNVERIFIABLE, 'software file-key --generate cannot prove secure private-key custody on Windows (no POSIX 0600 / ACL enforcement here); export your key from a hardware token / KMS / keychain and use --adopt-public-key instead');
  }

  // Preflight ALL destinations absent BEFORE any keygen or write (fail-closed).
  preflightAbsent(privateAbs, REASON.PRIVATE_OUT_EXISTS);
  if (anchorsAbs) preflightAbsent(anchorsAbs, REASON.ANCHORS_OUT_EXISTS);
  if (fingerprintAbs) preflightAbsent(fingerprintAbs, REASON.FINGERPRINT_OUT_EXISTS);

  const { publicKey, privateKey } = generateKeyPairSync(KEY_ALGORITHM);
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const anchorsDoc = buildAnchorsDoc({ keyId, tenantId, projectId, publicKeyPem });
  assertConformant(anchorsDoc);
  const fingerprintManifest = buildFingerprintManifest(anchorsDoc);
  const anchorsText = serialize(anchorsDoc);
  const manifestText = serialize(fingerprintManifest);

  const created = [];
  try {
    writePrivateExclusive(privateAbs, privateKeyPem, created);
    if (anchorsAbs) writePublicExclusive(anchorsAbs, anchorsText, REASON.ANCHORS_OUT_EXISTS, created);
    if (fingerprintAbs) writePublicExclusive(fingerprintAbs, manifestText, REASON.FINGERPRINT_OUT_EXISTS, created);
  } catch (e) { rollback(created); throw e; }

  return { mode: 'software-key-bootstrap', anchorsDoc, fingerprintManifest, anchorsText, manifestText, publicKeyPem, privateKeyPath: privateAbs };
}

// ── adopt-public-key: CANONICAL hardware/KMS/keychain path (NO private material) ──
export function adoptPublicKey({ keyId, tenantId, projectId, publicKeyPem, anchorsOut, fingerprintOut }) {
  requireIdentity(keyId, tenantId, projectId);
  if (typeof publicKeyPem !== 'string' || publicKeyPem.trim() === '') {
    fail(REASON.MISSING_INPUT, '--adopt-public-key requires a readable file containing an SPKI PEM public key');
  }
  const spkiPem = assertEd25519SpkiPem(publicKeyPem);
  const anchorsDoc = buildAnchorsDoc({ keyId, tenantId, projectId, publicKeyPem: spkiPem });
  assertConformant(anchorsDoc);
  const fingerprintManifest = buildFingerprintManifest(anchorsDoc);
  const anchorsText = serialize(anchorsDoc);
  const manifestText = serialize(fingerprintManifest);
  const anchorsAbs = anchorsOut ? resolveOut(anchorsOut) : null;
  const fingerprintAbs = fingerprintOut ? resolveOut(fingerprintOut) : null;
  if (anchorsAbs) preflightAbsent(anchorsAbs, REASON.ANCHORS_OUT_EXISTS);
  if (fingerprintAbs) preflightAbsent(fingerprintAbs, REASON.FINGERPRINT_OUT_EXISTS);

  const created = [];
  try {
    if (anchorsAbs) writePublicExclusive(anchorsAbs, anchorsText, REASON.ANCHORS_OUT_EXISTS, created);
    if (fingerprintAbs) writePublicExclusive(fingerprintAbs, manifestText, REASON.FINGERPRINT_OUT_EXISTS, created);
  } catch (e) { rollback(created); throw e; }

  // No privateKeyPath — this mode never reads, writes, or holds a private key.
  return { mode: 'adopt-public-key', anchorsDoc, fingerprintManifest, anchorsText, manifestText, publicKeyPem: spkiPem, privateKeyPath: undefined };
}

// ────────────────────────────────────────────────────────────────────────────────
// Adversarial self-check (in-process; ephemeral keys; no disk writes).
// ────────────────────────────────────────────────────────────────────────────────
export function runSelfCheck() {
  let passed = 0;
  const scfail = (msg) => { throw new Error(`SELF-CHECK FAIL: ${msg}`); };
  const codesOf = (doc) => parseTrustAnchorsDoc(JSON.stringify(doc), 'sc').problems.map((p) => p.code);
  const accepts = (doc) => parseTrustAnchorsDoc(JSON.stringify(doc), 'sc').problems.length === 0;
  const ok = (cond, msg) => { if (!cond) scfail(msg); passed++; };
  const reasonOf = (fn) => { try { fn(); return null; } catch (e) { return e && e.reasonCode ? e.reasonCode : `THROW:${e && e.message}`; } };

  const kp = generateKeyPairSync(KEY_ALGORITHM);
  const publicKeyPem = kp.publicKey.export({ type: 'spki', format: 'pem' });
  const base = { keyId: 'closure-owner-genesis-v1', tenantId: 'main', projectId: 'deckent', publicKeyPem };
  const good = buildAnchorsDoc(base);

  // 1. tool output conforms to the SOLE gate validator
  ok(accepts(good), 'a tool-generated genesis anchor must be accepted by parseTrustAnchorsDoc');

  // 2. fingerprint is DER-based, stable, and matches an independent recompute
  const fp1 = computeFingerprint(publicKeyPem);
  ok(computeFingerprint(publicKeyPem) === fp1 && /^sha256:[0-9a-f]{64}$/.test(fp1), 'fingerprint must be a stable lowercase sha256 hex');
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  ok(fp1 === `sha256:${createHash('sha256').update(der).digest('hex')}`, 'fingerprint must equal an independent sha256-over-SPKI-DER recompute (HC-1 recomputability)');
  ok(buildFingerprintManifest(good).anchors[0].fingerprint === fp1, 'manifest fingerprint must match computeFingerprint');

  // 3. a different key changes the fingerprint (tamper-evidence)
  const other = generateKeyPairSync(KEY_ALGORITHM).publicKey.export({ type: 'spki', format: 'pem' });
  ok(computeFingerprint(other) !== fp1, 'a different key must yield a different fingerprint');

  // 4. NEGATIVE FORGERY SET — each rejected with the exact typed code.
  ok(codesOf({ schemaVersion: 1, anchors: [{ ...good.anchors[0], publicKeyPem: '-----BEGIN PUBLIC KEY-----\nnotbase64\n-----END PUBLIC KEY-----\n' }] }).includes('TRUST_ANCHOR_BAD_PEM'), 'invalid PEM → TRUST_ANCHOR_BAD_PEM');
  ok(codesOf({ ...good, forged: true }).includes('TRUST_ANCHOR_UNKNOWN_FIELD'), 'unknown top-level field → TRUST_ANCHOR_UNKNOWN_FIELD');
  ok(codesOf({ schemaVersion: 1, anchors: [{ ...good.anchors[0], rogue: 1 }] }).includes('TRUST_ANCHOR_UNKNOWN_FIELD'), 'unknown anchor field → TRUST_ANCHOR_UNKNOWN_FIELD');
  ok(codesOf({ ...good, schemaVersion: 2 }).includes('TRUST_ANCHOR_SCHEMA'), 'schemaVersion≠1 → TRUST_ANCHOR_SCHEMA');
  ok(codesOf({ schemaVersion: 1, anchors: [good.anchors[0], good.anchors[0]] }).includes('TRUST_ANCHOR_DUPLICATE_KEYID'), 'duplicate keyId → TRUST_ANCHOR_DUPLICATE_KEYID');
  ok(codesOf({ schemaVersion: 1, anchors: [{ keyId: 'k', publicKeyPem, tenantId: '', projectId: 'p' }] }).includes('TRUST_ANCHOR_MALFORMED'), 'empty tenantId → TRUST_ANCHOR_MALFORMED');
  ok(codesOf({ schemaVersion: 1, anchors: [{ keyId: 'k', publicKeyPem, projectId: 'p' }] }).includes('TRUST_ANCHOR_MALFORMED'), 'missing tenantId → TRUST_ANCHOR_MALFORMED');

  // 4g. rotations-bearing doc → buildFingerprintManifest refuses (real path, typed code)
  const withRotation = { ...good, rotations: [{ newKeyId: 'k2', newPublicKeyPem: other, tenantId: 'main', projectId: 'deckent', signedByKeyId: 'closure-owner-genesis-v1', signature: 'AA==' }] };
  ok(reasonOf(() => buildFingerprintManifest(withRotation)) === REASON.ROTATIONS_NOT_ALLOWED, 'rotations-bearing doc → GENESIS_ROTATIONS_NOT_ALLOWED');
  ok(parseTrustAnchorsDoc(JSON.stringify(withRotation), 'sc').problems.length === 0, 'rotations is a legal field parseTrustAnchorsDoc accepts (so the refusal lives in buildFingerprintManifest)');

  // 5. repo-containment guard (typed) — in-repo refused, symlink-into-repo refused, out accepted
  ok(reasonOf(() => assertPrivateKeyOutsideRepo(join(REPO_ROOT, 'docs', 'governance', 'leaked.key'))) === REASON.PRIVATE_OUT_IN_REPO, 'in-repo private path → GENESIS_PRIVATE_OUT_IN_REPO');
  ok(typeof assertPrivateKeyOutsideRepo(join(REPO_ROOT, '..', 'outside.key')) === 'string', 'a path outside the repo is accepted');

  // 6. --adopt-public-key: ed25519 public → anchor + fingerprint, ZERO private artifact
  const adopt = adoptPublicKey({ ...base });
  ok(adopt.privateKeyPath === undefined && adopt.mode === 'adopt-public-key', 'adopt-public-key must produce NO private artifact');
  ok(adopt.fingerprintManifest.anchors[0].fingerprint === fp1, 'adopt fingerprint must equal the DER fingerprint of the adopted key');
  ok(accepts(adopt.anchorsDoc), 'adopted anchor must conform to the SOLE validator');

  // 7. adopt rejects a non-ed25519 public key, and a malformed key, with typed codes
  const ecPub = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ type: 'spki', format: 'pem' });
  ok(reasonOf(() => adoptPublicKey({ keyId: 'k', tenantId: 't', projectId: 'p', publicKeyPem: ecPub })) === REASON.PUBLIC_KEY_NOT_ED25519, 'non-ed25519 adopt → GENESIS_PUBLIC_KEY_NOT_ED25519');
  ok(reasonOf(() => adoptPublicKey({ keyId: 'k', tenantId: 't', projectId: 'p', publicKeyPem: 'not a pem' })) === REASON.PUBLIC_KEY_INVALID, 'malformed adopt → GENESIS_PUBLIC_KEY_INVALID');

  return passed;
}

// ────────────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { args[key] = true; } else { args[key] = next; i++; }
    } else { args._.push(a); }
  }
  return args;
}
const strOrU = (v) => (typeof v === 'string' ? v : undefined);

function reportPublicOutputs(r, args) {
  const fp = r.fingerprintManifest.anchors[0].fingerprint;
  console.error('[genesis-anchor] VERIFY THIS FINGERPRINT before committing/merging:');
  console.error(`  ${fp}`);
  if (strOrU(args['anchors-out'])) console.error(`[genesis-anchor] anchor written: ${resolveOut(args['anchors-out'])}`);
  else { console.error('--- docs/governance/closure-trust-anchors.json ---'); process.stdout.write(r.anchorsText); }
  if (strOrU(args['fingerprint-out'])) console.error(`[genesis-anchor] fingerprint manifest written: ${resolveOut(args['fingerprint-out'])}`);
  else { console.error('--- docs/governance/closure-trust-anchors.fingerprints.json ---'); process.stdout.write(r.manifestText); }
}

function main(argv) {
  const args = parseArgs(argv);

  if (args['self-check']) {
    const n = runSelfCheck();
    console.log(`[genesis-anchor] self-check: ${n}/${n} assertions passed`);
    return 0;
  }

  if (args['adopt-public-key']) {
    const pemPath = strOrU(args['adopt-public-key']);
    if (!pemPath) { console.error('[genesis-anchor] --adopt-public-key <path-to-spki-pem-file> is required'); return 2; }
    let publicKeyPem;
    try { publicKeyPem = readFileSync(pemPath, 'utf-8'); }
    catch { console.error(`[genesis-anchor] ERROR reasonCode=${REASON.MISSING_INPUT}: cannot read --adopt-public-key file (${pemPath})`); return 1; }
    const r = adoptPublicKey({
      keyId: strOrU(args['key-id']), tenantId: strOrU(args['tenant-id']), projectId: strOrU(args['project-id']),
      publicKeyPem, anchorsOut: strOrU(args['anchors-out']), fingerprintOut: strOrU(args['fingerprint-out']),
    });
    console.error('[genesis-anchor] MODE: adopt-public-key (canonical) — hardware/KMS/keychain-held key; NO private material read, written, or held.');
    reportPublicOutputs(r, args);
    return 0;
  }

  if (args.generate) {
    const r = generate({
      keyId: strOrU(args['key-id']), tenantId: strOrU(args['tenant-id']), projectId: strOrU(args['project-id']),
      privateOut: strOrU(args['private-out']), anchorsOut: strOrU(args['anchors-out']), fingerprintOut: strOrU(args['fingerprint-out']),
    });
    console.error('[genesis-anchor] MODE: software-key bootstrap — plaintext PKCS8 file key, POSIX 0600 enforced+verified. This is NOT hardware/keychain custody; prefer --adopt-public-key for a hardware/KMS/keychain key.');
    console.error('[genesis-anchor] PRIVATE KEY written (KEEP SECRET, NEVER COMMIT):');
    console.error(`  ${r.privateKeyPath}`);
    reportPublicOutputs(r, args);
    return 0;
  }

  if (args.fingerprint || args.verify) {
    const file = strOrU(args.fingerprint ?? args.verify) ?? args._[0];
    if (!file) { console.error('usage: --fingerprint <closure-trust-anchors.json> | --verify <closure-trust-anchors.json>'); return 2; }
    const text = readFileSync(file, 'utf-8');
    const parsed = parseTrustAnchorsDoc(text, file);
    if (parsed.problems.length > 0) {
      console.error(`[genesis-anchor] NOT CONFORMANT (${file}):`);
      for (const p of parsed.problems) console.error(`  ${p.code}: ${p.message}`);
      return 1;
    }
    console.log(serialize(buildFingerprintManifest(JSON.parse(text))).trimEnd());
    return 0;
  }

  console.error([
    'Closure OS genesis trust-anchor provisioning tool',
    '',
    'PROVISIONING MODES:',
    '  --adopt-public-key <spki-pem-file>  CANONICAL. Adopt the PUBLIC key of a key held',
    '        --key-id <id> --tenant-id <t> --project-id <p>   in a hardware token / KMS /',
    '        [--anchors-out <file>] [--fingerprint-out <file>] keychain. No private key touched.',
    '  --generate  SOFTWARE-KEY BOOTSTRAP (POSIX only; Windows → typed HOLD). Generates a',
    '        --key-id <id> --tenant-id <t> --project-id <p>   plaintext PKCS8 private key at',
    '        --private-out <PATH-OUTSIDE-REPO>                --private-out (0600 enforced),',
    '        [--anchors-out <file>] [--fingerprint-out <file>] NOT hardware/keychain custody.',
    '',
    'VERIFY:',
    '  --fingerprint <closure-trust-anchors.json>   recompute the fingerprint manifest',
    '  --verify <closure-trust-anchors.json>        strict-validate + print fingerprints',
    '  --self-check                                 run the adversarial conformance suite',
    '',
    'Fail-closed: every destination is preflighted absent; the private key is created with',
    'O_EXCL (never overwrites, never follows a symlink) and verified 0600 on POSIX; a partial',
    'failure rolls back only this run\'s files. The private key is never printed. Authority',
    'derives solely from the owner verifying the fingerprint and merging (reviewed-parent).',
  ].join('\n'));
  return 2;
}

// ESM entrypoint guard (cross-platform: compare file URLs, not raw path strings)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    const rc = e && e.reasonCode ? ` reasonCode=${e.reasonCode}` : '';
    console.error(`[genesis-anchor] ERROR${rc}: ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
}
