#!/usr/bin/env node
// Closure OS — genesis trust-anchor PROVISIONING tool (the "REPORTED procedure",
// docs/governance/closure-os-sidecar-ledger.md §5 / closure-classification-schema.json
// trustAnchorRootOfTrust.genesis). This is the SEPARATE genesis PR's engine.
//
// WHAT IT IS. A buildless ceremony/verification tool that (a) generates an ed25519
// genesis keypair, writing the OWNER PRIVATE KEY to a caller-named path that MUST be
// OUTSIDE this repository and NEVER committed, (b) emits a conformant
// `docs/governance/closure-trust-anchors.json` carrying only the SPKI-PEM PUBLIC key,
// and (c) emits a deterministic, independently-recomputable fingerprint manifest so
// the owner can VERIFY the exact fingerprint before reviewing/merging the PR.
//
// WHAT IT IS NOT. It writes no ledger event, no receipt, no signature, no MASTER/
// priority mutation; it is not the Phase-5 signer/writer. It does not, and cannot,
// grant the anchor authority: authority derives ONLY from the reviewed-parent (the
// owner reviewing the fingerprint and merging this PR — merge-base HEAD origin/main).
// A key added in its own PR cannot self-authorize; that is exactly why genesis is a
// separate PR the owner verifies. See resolveTrustAnchors() in the SOLE gate.
//
// SOLE STRICT VALIDATOR. Shape strictness is NOT re-implemented here — this tool
// imports `parseTrustAnchorsDoc` from the SOLE gate (scripts/lint-closure-dispositions.mjs)
// and asserts every emitted anchor conforms to it, so there is exactly one trust-anchor
// schema authority and no mirror to drift (contrast scripts/approval-identity.mjs, a
// mirror that exists only because its authority lives in un-importable TS).
//
// Node >=24, ESM. Cross-platform: fileURLToPath/join (no separators), NFC on identity
// inputs, LF output (.gitattributes `* text=auto eol=lf`), fingerprint over DER bytes
// (PEM line-wrap/EOL is platform-fragile). Emits English (a gate/CLI script, not a
// product user-surface).

import {
  generateKeyPairSync,
  createPublicKey,
  createHash,
} from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { parseTrustAnchorsDoc } from '../lint-closure-dispositions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

const FINGERPRINT_ALGORITHM = 'sha256-spki-der';
const KEY_ALGORITHM = 'ed25519';

// ── identity input normalization (NFC, exactly like closure canonical v1) ──────────
function normId(value) {
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

// ── fingerprint = sha256 over the SPKI DER bytes of the public key ────────────────
// DER (not PEM): the PEM envelope's line-wrap and EOL vary by platform/tool, so a
// PEM-based digest is not portable; the DER is the canonical key encoding.
export function computeFingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return `sha256:${createHash('sha256').update(der).digest('hex')}`;
}

// ── build the conformant anchors doc (public key ONLY) ────────────────────────────
export function buildAnchorsDoc({ keyId, tenantId, projectId, publicKeyPem }) {
  return {
    schemaVersion: 1,
    anchors: [
      {
        keyId: normId(keyId),
        publicKeyPem,
        tenantId: normId(tenantId),
        projectId: normId(projectId),
      },
    ],
  };
}

// ── deterministic, recomputable fingerprint manifest (no timestamp/randomness) ────
// A pure function of the anchors doc, so the owner can recompute it byte-for-byte
// from the committed anchor and confirm the fingerprint independently (HC-1).
export function buildFingerprintManifest(anchorsDoc) {
  const parsed = parseTrustAnchorsDoc(JSON.stringify(anchorsDoc), 'fingerprint-manifest');
  if (parsed.problems.length > 0) {
    throw new Error(
      `cannot fingerprint a non-conformant anchors doc: ${parsed.problems.map((p) => `${p.code} ${p.message}`).join('; ')}`,
    );
  }
  // A GENESIS fingerprint manifest asserts predecessor: null — it has no rotations.
  // `rotations` is a legal top-level field that parseTrustAnchorsDoc accepts, so the
  // refusal has to live HERE: fingerprinting a rotations-bearing doc as "genesis"
  // would mislabel a post-genesis, reviewed-parent-signed state as the root.
  if (Array.isArray(anchorsDoc.rotations) && anchorsDoc.rotations.length > 0) {
    throw new Error(
      'genesis fingerprint manifest refuses a rotations-bearing doc: a genesis anchor carries no rotations (predecessor: null); rotations are a post-genesis, reviewed-parent-signed act (out of scope for this tool)',
    );
  }
  const anchors = (anchorsDoc.anchors ?? []).map((a) => ({
    keyId: a.keyId,
    tenantId: a.tenantId,
    projectId: a.projectId,
    fingerprint: computeFingerprint(a.publicKeyPem),
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

// ── serialization: pretty JSON + trailing LF (index normalizes to LF) ─────────────
function serialize(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

// ── repo-containment guard for the private-key path ───────────────────────────────
// The owner private key must NEVER be written inside the repository. We resolve the
// requested path against the deepest EXISTING ancestor (realpath, to defeat symlink
// escapes) and refuse any target that lands inside the repo tree.
export function assertPrivateKeyOutsideRepo(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    throw new Error('--private-out <path> is required and must be a non-empty path OUTSIDE the repository');
  }
  const abs = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
  // Resolve the deepest existing ancestor so a not-yet-created file still gets a real
  // (symlink-resolved) directory to test containment against.
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
  const resolvedAbs = realAncestor
    ? join(realAncestor, relative(existingAncestor, abs))
    : abs;
  const rel = relative(realRepo, resolvedAbs);
  const insideRepo = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (insideRepo) {
    throw new Error(
      `refusing to write the owner private key inside the repository (${rel || '.'}); choose a path OUTSIDE ${realRepo} — e.g. a hardware-key-gated store or $HOME/.deckent-secrets/…`,
    );
  }
  return resolvedAbs;
}

// ── generate: keypair → private key OUTSIDE repo; public anchor + fingerprint out ──
export function generate({ keyId, tenantId, projectId, privateOut }) {
  for (const [name, v] of [['--key-id', keyId], ['--tenant-id', tenantId], ['--project-id', projectId]]) {
    if (typeof v !== 'string' || v.trim() === '') {
      throw new Error(`${name} is required and must be a non-empty string (owner-chosen identity; there is no canonical producer — it defines the anchor's tenant/project binding)`);
    }
  }
  const privateAbs = assertPrivateKeyOutsideRepo(privateOut);
  const { publicKey, privateKey } = generateKeyPairSync(KEY_ALGORITHM);
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  const anchorsDoc = buildAnchorsDoc({ keyId, tenantId, projectId, publicKeyPem });
  // Hard conformance gate on our own output before we hand anything back.
  const check = parseTrustAnchorsDoc(JSON.stringify(anchorsDoc), 'generated');
  if (check.problems.length > 0) {
    throw new Error(`internal: generated anchor is non-conformant: ${check.problems.map((p) => p.code).join(',')}`);
  }
  const fingerprintManifest = buildFingerprintManifest(anchorsDoc);

  // Persist ONLY the private key to disk here; the public artifacts go to stdout or
  // caller-named files so nothing secret is ever printed.
  const dir = dirname(privateAbs);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(privateAbs, privateKeyPem, { encoding: 'utf-8', mode: 0o600 });

  return { anchorsDoc, fingerprintManifest, publicKeyPem, privateKeyPath: privateAbs };
}

// ────────────────────────────────────────────────────────────────────────────────
// Adversarial self-check: proves a tool-generated genesis anchor CONFORMS to the SOLE
// gate validator, its fingerprint is stable + DER-based, and every forgery class is
// rejected with the exact typed code. Runs fully in-process (ephemeral keys, tmp
// private-key path) so the vitest wrapper only has to spawn it.
// ────────────────────────────────────────────────────────────────────────────────
export function runSelfCheck() {
  let passed = 0;
  const fail = (msg) => { throw new Error(`SELF-CHECK FAIL: ${msg}`); };
  const codesOf = (doc) => parseTrustAnchorsDoc(JSON.stringify(doc), 'sc').problems.map((p) => p.code);
  const accepts = (doc) => parseTrustAnchorsDoc(JSON.stringify(doc), 'sc').problems.length === 0;
  const ok = (cond, msg) => { if (!cond) fail(msg); passed++; };

  const kp = generateKeyPairSync(KEY_ALGORITHM);
  const publicKeyPem = kp.publicKey.export({ type: 'spki', format: 'pem' });
  const base = { keyId: 'closure-owner-genesis', tenantId: 'tenant-x', projectId: 'proj-y', publicKeyPem };
  const good = buildAnchorsDoc(base);

  // 1. tool output conforms to the SOLE gate validator
  ok(accepts(good), 'a tool-generated genesis anchor must be accepted by parseTrustAnchorsDoc');

  // 2. fingerprint is DER-based, stable, and matches an independent recompute
  const fp1 = computeFingerprint(publicKeyPem);
  const fp2 = computeFingerprint(publicKeyPem);
  ok(fp1 === fp2 && /^sha256:[0-9a-f]{64}$/.test(fp1), 'fingerprint must be a stable lowercase sha256 hex');
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  const independent = `sha256:${createHash('sha256').update(der).digest('hex')}`;
  ok(fp1 === independent, 'fingerprint must equal an independent sha256-over-SPKI-DER recompute (HC-1 recomputability)');
  ok(buildFingerprintManifest(good).anchors[0].fingerprint === fp1, 'manifest fingerprint must match computeFingerprint');

  // 3. a one-byte key edit changes the fingerprint (tamper-evidence)
  const other = generateKeyPairSync(KEY_ALGORITHM).publicKey.export({ type: 'spki', format: 'pem' });
  ok(computeFingerprint(other) !== fp1, 'a different key must yield a different fingerprint');

  // 4. NEGATIVE FORGERY SET — each must be rejected with the exact typed code.
  // 4a. tampered/invalid PEM → TRUST_ANCHOR_BAD_PEM
  ok(codesOf({ schemaVersion: 1, anchors: [{ ...good.anchors[0], publicKeyPem: '-----BEGIN PUBLIC KEY-----\nnotbase64\n-----END PUBLIC KEY-----\n' }] }).includes('TRUST_ANCHOR_BAD_PEM'), 'invalid PEM must be TRUST_ANCHOR_BAD_PEM');
  // 4b. unknown top-level field → TRUST_ANCHOR_UNKNOWN_FIELD
  ok(codesOf({ ...good, forged: true }).includes('TRUST_ANCHOR_UNKNOWN_FIELD'), 'unknown top-level field must be TRUST_ANCHOR_UNKNOWN_FIELD');
  // 4c. unknown anchor field → TRUST_ANCHOR_UNKNOWN_FIELD
  ok(codesOf({ schemaVersion: 1, anchors: [{ ...good.anchors[0], rogue: 1 }] }).includes('TRUST_ANCHOR_UNKNOWN_FIELD'), 'unknown anchor field must be TRUST_ANCHOR_UNKNOWN_FIELD');
  // 4d. schemaVersion ≠ 1 → TRUST_ANCHOR_SCHEMA
  ok(codesOf({ ...good, schemaVersion: 2 }).includes('TRUST_ANCHOR_SCHEMA'), 'schemaVersion≠1 must be TRUST_ANCHOR_SCHEMA');
  // 4e. duplicate keyId → TRUST_ANCHOR_DUPLICATE_KEYID
  ok(codesOf({ schemaVersion: 1, anchors: [good.anchors[0], good.anchors[0]] }).includes('TRUST_ANCHOR_DUPLICATE_KEYID'), 'duplicate keyId must be TRUST_ANCHOR_DUPLICATE_KEYID');
  // 4f. missing/empty required field → TRUST_ANCHOR_MALFORMED
  ok(codesOf({ schemaVersion: 1, anchors: [{ keyId: 'k', publicKeyPem, tenantId: '', projectId: 'p' }] }).includes('TRUST_ANCHOR_MALFORMED'), 'empty tenantId must be TRUST_ANCHOR_MALFORMED');
  ok(codesOf({ schemaVersion: 1, anchors: [{ keyId: 'k', publicKeyPem, projectId: 'p' }] }).includes('TRUST_ANCHOR_MALFORMED'), 'missing tenantId must be TRUST_ANCHOR_MALFORMED');
  // 4g. genesis carrying a self-vouching rotation is structurally parsed (rotations is
  // a legal field), but buildFingerprintManifest MUST refuse it — a genesis manifest
  // has no rotations (predecessor: null). Assert the refusal DIRECTLY on the real path.
  const withRotation = { ...good, rotations: [{ newKeyId: 'k2', newPublicKeyPem: other, tenantId: 'tenant-x', projectId: 'proj-y', signedByKeyId: 'closure-owner-genesis', signature: 'AA==' }] };
  let rotationRefused = false;
  try { buildFingerprintManifest(withRotation); } catch { rotationRefused = true; }
  ok(rotationRefused, 'buildFingerprintManifest must throw on a rotations-bearing (non-genesis) doc');
  ok(parseTrustAnchorsDoc(JSON.stringify(withRotation), 'sc').problems.length === 0, 'rotations is a legal field parseTrustAnchorsDoc accepts (so the refusal must live in buildFingerprintManifest, not the shape parse)');

  // 5. repo-containment guard rejects an in-repo private-key path, accepts an out path
  let guarded = false;
  try { assertPrivateKeyOutsideRepo(join(REPO_ROOT, 'docs', 'governance', 'leaked.key')); }
  catch { guarded = true; }
  ok(guarded, 'private-key path inside the repo must be refused');
  ok(typeof assertPrivateKeyOutsideRepo(join(REPO_ROOT, '..', 'outside.key')) === 'string', 'a path outside the repo must be accepted');

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
      if (next === undefined || next.startsWith('--')) { args[key] = true; }
      else { args[key] = next; i++; }
    } else { args._.push(a); }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);

  if (args['self-check']) {
    const n = runSelfCheck();
    console.log(`[genesis-anchor] self-check: ${n}/${n} assertions passed`);
    return 0;
  }

  if (args.generate) {
    const { anchorsDoc, fingerprintManifest, privateKeyPath } = generate({
      keyId: args['key-id'],
      tenantId: args['tenant-id'],
      projectId: args['project-id'],
      privateOut: args['private-out'],
    });
    const anchorsText = serialize(anchorsDoc);
    const manifestText = serialize(fingerprintManifest);
    if (args['anchors-out']) writeFileSync(args['anchors-out'], anchorsText, 'utf-8');
    if (args['fingerprint-out']) writeFileSync(args['fingerprint-out'], manifestText, 'utf-8');
    const fp = fingerprintManifest.anchors[0].fingerprint;
    // stderr = human ceremony guidance; stdout = the machine artifacts. The private
    // key is NEVER printed — only its on-disk path is reported.
    console.error('[genesis-anchor] PRIVATE KEY written (KEEP SECRET, NEVER COMMIT):');
    console.error(`  ${privateKeyPath}`);
    console.error('[genesis-anchor] VERIFY THIS FINGERPRINT before committing/merging:');
    console.error(`  ${fp}`);
    if (!args['anchors-out']) { console.error('--- docs/governance/closure-trust-anchors.json ---'); process.stdout.write(anchorsText); }
    if (!args['fingerprint-out']) { console.error('--- docs/governance/closure-trust-anchors.fingerprints.json ---'); process.stdout.write(manifestText); }
    return 0;
  }

  if (args.fingerprint || args.verify) {
    const file = typeof (args.fingerprint ?? args.verify) === 'string' ? (args.fingerprint ?? args.verify) : args._[0];
    if (!file) { console.error('usage: --fingerprint <closure-trust-anchors.json> | --verify <closure-trust-anchors.json>'); return 2; }
    const text = readFileSync(file, 'utf-8');
    const parsed = parseTrustAnchorsDoc(text, file);
    if (parsed.problems.length > 0) {
      console.error(`[genesis-anchor] NOT CONFORMANT (${file}):`);
      for (const p of parsed.problems) console.error(`  ${p.code}: ${p.message}`);
      return 1;
    }
    const manifest = buildFingerprintManifest(JSON.parse(text));
    console.log(serialize(manifest).trimEnd());
    return 0;
  }

  console.error([
    'Closure OS genesis trust-anchor provisioning tool',
    '',
    'usage:',
    '  --generate --key-id <id> --tenant-id <t> --project-id <p> --private-out <PATH-OUTSIDE-REPO>',
    '            [--anchors-out <file>] [--fingerprint-out <file>]',
    '  --fingerprint <closure-trust-anchors.json>   recompute the fingerprint manifest',
    '  --verify <closure-trust-anchors.json>        strict-validate + print fingerprints',
    '  --self-check                                 run the adversarial conformance suite',
    '',
    'The owner private key is written ONLY to --private-out and MUST be outside the repo;',
    'it is never printed and never committed. Authority derives solely from the owner',
    'verifying the printed fingerprint and merging this PR (reviewed-parent root of trust).',
  ].join('\n'));
  return 2;
}

// ESM entrypoint guard (cross-platform: compare file URLs, not raw path strings)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`[genesis-anchor] ERROR: ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
}
