#!/usr/bin/env node
// scripts/lint-closure-dispositions.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Machine gate for the Closure OS append-only sidecar decision-ledger
// (docs/governance/closure-dispositions.jsonl, §12.1 rev-2). The SOLE validator.
//
// Checks: schema/enum · canonical digest chain · rowRef 3-part identity ·
// intra-class active-exclusivity · admission→promotion lifecycle ordering ·
// check-proof⇒proof invariant · authority-proof presence · append-only byte
// prefix vs merge-base. Any unresolved condition (unknown row, digest drift, seq
// gap, broken chain, missing authority, unresolvable merge-base) → typed HOLD,
// never a silent pass.
//
// Pure functions are exported for hermetic tests (injected ledger text, baseline
// and gitRunner). The CLI resolves the baseline from git and reads the schema +
// registry from disk.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { verify as cryptoVerify, createPublicKey, generateKeyPairSync, sign as edSign } from 'node:crypto';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA, canonicalize, digestOf, computeEventDigest, verifyEventDigest, computeBatchManifestDigest } from './closure-ledger/canonical.mjs';
// The SINGLE master-plan integrity authority (registryIntegrity = sha256(canonical-json-utf8)),
// reused verbatim so an ARCHIVED master snapshot's payload integrity is re-verified with the
// SAME algorithm MASTER uses — never the Closure canonical, never a reimplementation.
import { registryIntegrityDigest } from './master-plan-integrity.mjs';
// Buildless MIRROR of the canonical ApprovalBroker identity (src/core/approval-contract.ts →
// approvalIdSchema), PINNED to it by tests/governance/approval-identity-parity.test.ts — the
// gate does NOT invent a second identifier authority.
import { isCanonicalApprovalId, claimRefFor } from './approval-identity.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_REL = 'docs/governance/closure-dispositions.jsonl';
const RECEIPTS_REL = 'docs/governance/closure-dispositions.receipts';
const TRUST_ANCHORS_REL = 'docs/governance/closure-trust-anchors.json';
const BATCHES_REL = 'docs/governance/closure-batches';
const MASTER_JSON = join(ROOT, 'docs/generated/master-plan-active.json');

const RECEIPT_ALLOWED = new Set(['schemaVersion', 'requestId', 'claimRef', 'decision', 'closureReason', 'subject', 'authenticatedAt', 'decidedAt', 'authExpiresAt', 'attestation']);
const RECEIPT_REJECTED = new Set(['authenticationEvidence', 'grantedAt']);
// strict nested shapes (Codex phase-4.4 req-3)
const RECEIPT_REQUIRED = ['schemaVersion', 'requestId', 'claimRef', 'decision', 'subject', 'authenticatedAt', 'decidedAt', 'authExpiresAt', 'attestation'];
const SUBJECT_STRING_FIELDS = ['tenantId', 'projectId', 'masterSnapshotDigest', 'registryIntegrityDigest', 'proposalDigest', 'unsignedManifestDigest'];
const SUBJECT_INT_FIELDS = ['eventCount', 'seqIntervalStart', 'seqIntervalEnd'];
const SUBJECT_ALLOWED = new Set(['kind', ...SUBJECT_STRING_FIELDS, ...SUBJECT_INT_FIELDS]);
const ATTESTATION_ALLOWED = new Set(['keyId', 'signature']);
const MASTER_SOURCE_DIGEST_ALG = 'sha256(normalized-lf-utf8)';
const MASTER_REGISTRY_INTEGRITY_ALG = 'sha256(canonical-json-utf8)';

/** Load committed batch receipts. Returns { manifests: Map<unsignedManifestDigest,
 *  {masterSnapshotDigest, receipt, requestId, file}>, problems }. Detects duplicate-
 *  manifest, filename↔requestId mismatch and malformed receipts (all fail-closed).
 *  A batch's snapshot is the immutable MASTER digest bound at write time. */
export function loadBatchManifests(dir) {
  const manifests = new Map(); const problems = [];
  let names = [];
  try { names = readdirSync(dir); } catch { return { manifests, problems }; }
  for (const f of names.slice().sort()) {
    if (!f.endsWith('.json')) continue;
    const requestId = basename(f, '.json');
    let r;
    try { r = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { problems.push(err('RECEIPT_MALFORMED', `receipt '${f}' is not valid JSON`)); continue; }
    if (r.requestId !== requestId) problems.push(err('RECEIPT_FILENAME_MISMATCH', `receipt '${f}': requestId '${r.requestId}' ≠ filename basename`));
    const md = r.subject?.unsignedManifestDigest;
    if (!md || !r.subject?.masterSnapshotDigest) { problems.push(err('RECEIPT_INCOMPLETE', `receipt '${f}': subject missing unsignedManifestDigest/masterSnapshotDigest`)); continue; }
    if (manifests.has(md)) { problems.push(err('DUPLICATE_MANIFEST_RECEIPT', `two receipts bind the same manifest digest ${String(md).slice(0, 8)}… (latest: '${f}')`)); continue; }
    manifests.set(md, { masterSnapshotDigest: r.subject.masterSnapshotDigest, receipt: r, requestId, file: f });
  }
  return { manifests, problems };
}

const TA_ALLOWED_TOP = new Set(['schemaVersion', 'anchors', 'rotations']);
const TA_ANCHOR_ALLOWED = new Set(['keyId', 'publicKeyPem', 'tenantId', 'projectId']);
const TA_ROTATION_ALLOWED = new Set(['newKeyId', 'newPublicKeyPem', 'tenantId', 'projectId', 'signedByKeyId', 'signature']);

/** Strict-shape parse of a trust-anchors doc → { anchors: Map<keyId,{publicKeyPem,
 *  tenantId, projectId}>, rotations: [...], problems }. Any deviation (bad JSON,
 *  wrong schemaVersion, unknown field, duplicate keyId, missing required, invalid
 *  PEM) is a fail-closed problem — a malformed anchor file NEVER yields a usable
 *  key (Codex phase-4.3 req-1 strict shapes). */
export function parseTrustAnchorsDoc(text, label) {
  const anchors = new Map(); const rotations = []; const problems = [];
  let j;
  try { j = JSON.parse(text); } catch { return { anchors, rotations, problems: [err('TRUST_ANCHOR_MALFORMED', `${label}: not valid JSON`)] }; }
  if (j === null || typeof j !== 'object' || Array.isArray(j)) return { anchors, rotations, problems: [err('TRUST_ANCHOR_MALFORMED', `${label}: root must be an object`)] };
  if (j.schemaVersion !== 1) problems.push(err('TRUST_ANCHOR_SCHEMA', `${label}: schemaVersion must be exactly 1`));
  for (const k of Object.keys(j)) if (!TA_ALLOWED_TOP.has(k)) problems.push(err('TRUST_ANCHOR_UNKNOWN_FIELD', `${label}: unknown top-level field '${k}'`));
  if (j.anchors !== undefined && !Array.isArray(j.anchors)) problems.push(err('TRUST_ANCHOR_MALFORMED', `${label}: 'anchors' must be an array`));
  for (const a of (Array.isArray(j.anchors) ? j.anchors : [])) {
    if (a === null || typeof a !== 'object' || Array.isArray(a)) { problems.push(err('TRUST_ANCHOR_MALFORMED', `${label}: an anchor entry is not an object`)); continue; }
    for (const k of Object.keys(a)) if (!TA_ANCHOR_ALLOWED.has(k)) problems.push(err('TRUST_ANCHOR_UNKNOWN_FIELD', `${label}: unknown anchor field '${k}'`));
    if (typeof a.keyId !== 'string' || !a.keyId) { problems.push(err('TRUST_ANCHOR_MALFORMED', `${label}: anchor missing keyId`)); continue; }
    if (typeof a.publicKeyPem !== 'string' || !a.publicKeyPem) { problems.push(err('TRUST_ANCHOR_MALFORMED', `${label}: anchor '${a.keyId}' missing publicKeyPem`)); continue; }
    if (typeof a.tenantId !== 'string' || !a.tenantId) { problems.push(err('TRUST_ANCHOR_MALFORMED', `${label}: anchor '${a.keyId}' missing non-empty tenantId`)); continue; }
    if (typeof a.projectId !== 'string' || !a.projectId) { problems.push(err('TRUST_ANCHOR_MALFORMED', `${label}: anchor '${a.keyId}' missing non-empty projectId`)); continue; }
    if (anchors.has(a.keyId)) { problems.push(err('TRUST_ANCHOR_DUPLICATE_KEYID', `${label}: duplicate keyId '${a.keyId}'`)); continue; }
    try { createPublicKey(a.publicKeyPem); } catch { problems.push(err('TRUST_ANCHOR_BAD_PEM', `${label}: anchor '${a.keyId}' publicKeyPem is not a valid public key`)); continue; }
    anchors.set(a.keyId, { publicKeyPem: a.publicKeyPem, tenantId: a.tenantId, projectId: a.projectId });
  }
  if (j.rotations !== undefined) {
    if (!Array.isArray(j.rotations)) problems.push(err('TRUST_ANCHOR_MALFORMED', `${label}: 'rotations' must be an array`));
    else for (const r of j.rotations) {
      if (r === null || typeof r !== 'object' || Array.isArray(r)) { problems.push(err('TRUST_ANCHOR_MALFORMED', `${label}: a rotation entry is not an object`)); continue; }
      for (const k of Object.keys(r)) if (!TA_ROTATION_ALLOWED.has(k)) problems.push(err('TRUST_ANCHOR_UNKNOWN_FIELD', `${label}: unknown rotation field '${k}'`));
      rotations.push(r);
    }
  }
  return { anchors, rotations, problems };
}

/** Read a repo path's blob at a git ref → {status:'ok',blob} | {status:'absent'} |
 *  {status:'error'} (OQ-XVE-05 verbatim: a provable-exists-but-unreadable object is
 *  'error', NEVER 'absent' — else genesis-bootstrap HOLD is bypassable by making the
 *  blob unreadable). */
function readTrustAnchorBlobAt(anchor, path, gitRunner) {
  try { return { status: 'ok', blob: String(gitRunner(['show', `${anchor}:${path}`])) }; }
  catch { try { gitRunner(['cat-file', '-e', `${anchor}:${path}`]); return { status: 'error' }; } catch { return { status: 'absent' }; } }
}

/** Reviewed-parent ROOT OF TRUST (Codex phase-4.3 req-1). Mirrors lint-master-plan
 *  TRUST-ANCHOR-001: the SET of trusted keys is the set committed at the reviewed
 *  baseline (merge-base HEAD origin/main) — NEVER the current working tree, so a key
 *  added in the same PR cannot vouch for itself. A working-tree key absent at the
 *  parent is trusted ONLY via a rotation receipt ed25519-signed by a parent-trusted
 *  key. Genesis (no parent file) or ANY unresolvable git state → typed HOLD
 *  TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED. Unlike TRUST-ANCHOR-001 there is NO WARN
 *  fallback and NO fallback to HEAD or the working-tree file — authority verification
 *  IS the deliverable here, so an unresolvable root is a HOLD, never a pass.
 *  Returns { anchors: Map, problems }. gitRunner injectable for hermetic tests. */
export function resolveTrustAnchors({ gitRunner, workingTreeText }) {
  const empty = new Map();
  const boot = (msg) => ({ anchors: empty, problems: [hold('TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED', msg)] });
  const git = (args) => { try { return String(gitRunner(args)).trim(); } catch { return null; } };
  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') return boot('not inside a git work tree → reviewed trust anchors unresolvable → HOLD (no working-tree fallback)');
  if (git(['rev-parse', '--verify', 'HEAD']) === null) return boot('no commit history → no reviewed trust anchor → HOLD');
  if (git(['rev-parse', '--is-shallow-repository']) === 'true') return boot('shallow clone → reviewed pre-state unprovable → HOLD');
  if (!git(['rev-parse', '--verify', '--quiet', 'origin/main'])) return boot('origin/main not fetchable → reviewed baseline unresolved → HOLD');
  const base = git(['merge-base', 'HEAD', 'origin/main']);
  if (!base) return boot('git merge-base HEAD origin/main failed → HOLD');
  const read = readTrustAnchorBlobAt(base, TRUST_ANCHORS_REL, gitRunner);
  if (read.status === 'error') return boot(`trust-anchors file provably exists at reviewed parent ${base.slice(0, 12)} but cannot be read → HOLD (a read error is never treated as 'absent')`);
  if (read.status === 'absent') return boot('no trust-anchors file at the reviewed parent — the first key cannot self-bootstrap in-repo; a genesis anchor needs an external owner fingerprint / signed Git authority (a reported phase-5 provisioning procedure) → HOLD TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED');
  const problems = [];
  const parent = parseTrustAnchorsDoc(read.blob, `reviewed-parent(${base.slice(0, 12)}) trust-anchors`);
  for (const pr of parent.problems) problems.push(pr);
  const wt = parseTrustAnchorsDoc(workingTreeText ?? '', 'working-tree trust-anchors');
  for (const pr of wt.problems) problems.push(pr);
  // trusted set STARTS as the reviewed-parent set (reviewed keys are always trusted).
  const trusted = new Map(parent.anchors);
  // apply working-tree rotations, each ed25519-signed by a reviewed-parent key.
  for (const rot of wt.rotations) {
    const shapeOk = typeof rot.newKeyId === 'string' && rot.newKeyId && typeof rot.newPublicKeyPem === 'string' && rot.newPublicKeyPem
      && typeof rot.tenantId === 'string' && rot.tenantId && typeof rot.projectId === 'string' && rot.projectId
      && typeof rot.signedByKeyId === 'string' && typeof rot.signature === 'string';
    if (!shapeOk) { problems.push(err('TRUST_ANCHOR_UNAUTHORIZED_ROTATION', 'rotation entry malformed (needs non-empty newKeyId, newPublicKeyPem, tenantId, projectId, signedByKeyId, signature)')); continue; }
    const signer = parent.anchors.get(rot.signedByKeyId); // MUST be a reviewed-parent key (no self-authorization)
    if (!signer) { problems.push(err('TRUST_ANCHOR_UNAUTHORIZED_ROTATION', `rotation of '${rot.newKeyId}' is signed by '${rot.signedByKeyId}', not a reviewed-parent trusted key → FAIL`)); continue; }
    const binding = { newKeyId: rot.newKeyId, newPublicKeyPem: rot.newPublicKeyPem, tenantId: rot.tenantId, projectId: rot.projectId, signedByKeyId: rot.signedByKeyId };
    let sigOk = false;
    try { createPublicKey(rot.newPublicKeyPem); sigOk = cryptoVerify(null, Buffer.from(canonicalize(binding), 'utf8'), createPublicKey(signer.publicKeyPem), Buffer.from(String(rot.signature), 'base64')); } catch { sigOk = false; }
    if (!sigOk) { problems.push(err('TRUST_ANCHOR_UNAUTHORIZED_ROTATION', `rotation of '${rot.newKeyId}' has no valid ed25519 signature by parent key '${rot.signedByKeyId}' → FAIL`)); continue; }
    trusted.set(rot.newKeyId, { publicKeyPem: rot.newPublicKeyPem, tenantId: rot.tenantId, projectId: rot.projectId });
  }
  // every working-tree anchor must be justified: a reviewed-parent key (same PEM) or a rotation-added key.
  for (const [keyId, entry] of wt.anchors) {
    const t = trusted.get(keyId);
    if (!t) problems.push(err('TRUST_ANCHOR_UNAUTHORIZED_ROTATION', `working-tree anchor '${keyId}' is neither a reviewed-parent key nor an authorized rotation → FAIL (a key cannot be introduced in the same change it authorizes)`));
    else if (t.publicKeyPem !== entry.publicKeyPem) problems.push(err('TRUST_ANCHOR_UNAUTHORIZED_ROTATION', `working-tree anchor '${keyId}' replaces the reviewed key's publicKeyPem without an authorized rotation → FAIL`));
  }
  return { anchors: trusted, problems };
}

/** Load the immutable per-batch snapshot bundles (Codex phase-4.3 req-2). Each
 *  batch's directory is named by its batchManifestDigest and archives the exact
 *  MASTER + proposal bytes AT batch time, so historical validation never depends on
 *  the CURRENT (evolving) MASTER/proposal. Returns Map<batchManifestDigest, snap>.
 *  A bundle whose proposal bytes were not archived before delete-on-consume is a
 *  DISTINCT, expected steady-state HOLD downstream (BATCH_SNAPSHOT_PROPOSAL_ABSENT). */
export function loadBatchSnapshots(dir) {
  const snapshots = new Map();
  let names = [];
  try { names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return snapshots; }
  for (const batchDigest of names.slice().sort()) {
    const bdir = join(dir, batchDigest);
    const masterPath = join(bdir, 'master-snapshot.json');
    const proposalPath = join(bdir, 'proposal.md');
    let masterPresent = false, masterMalformed = false, sourceDigestValue = null, registryIntegrityValue = null, integrityVerified = false;
    if (existsSync(masterPath)) {
      masterPresent = true;
      try {
        const m = JSON.parse(readFileSync(masterPath, 'utf8'));
        const sd = m.sourceDigest, ri = m.registryIntegrity;
        // strict shape: BOTH digest blocks must carry the master algorithms + a lowercase-sha256 value
        const shapeOk = sd && typeof sd === 'object' && ri && typeof ri === 'object'
          && sd.algorithm === MASTER_SOURCE_DIGEST_ALG && typeof sd.value === 'string' && HEX64.test(sd.value)
          && ri.algorithm === MASTER_REGISTRY_INTEGRITY_ALG && typeof ri.value === 'string' && HEX64.test(ri.value);
        if (!shapeOk) masterMalformed = true;
        else {
          sourceDigestValue = sd.value; registryIntegrityValue = ri.value;
          // RECOMPUTE registryIntegrity over the ARCHIVED payload with the ONE master authority
          // (registryIntegrityDigest, NOT Closure canonical). Tampering workItems/identityRegistry
          // while leaving ri.value stale is caught here — canonical-payload integrity, the same
          // byte-semantics MASTER's own gate enforces. integrityVerified is set true ONLY here.
          integrityVerified = registryIntegrityDigest(m) === ri.value;
        }
      } catch { masterMalformed = true; }
    }
    let proposalPresent = false, proposalDigest = null;
    if (existsSync(proposalPath)) { proposalPresent = true; proposalDigest = digestOf(readFileSync(proposalPath, 'utf8')); }
    snapshots.set(batchDigest, { masterPresent, masterMalformed, sourceDigestValue, registryIntegrityValue, integrityVerified, proposalPresent, proposalDigest });
  }
  return snapshots;
}

// ── typed results ──
const err = (code, message, seq) => ({ kind: 'error', code, message, seq });
const hold = (code, message, seq) => ({ kind: 'hold', code, message, seq });

const LEVELS = SCHEMA.levels.values;
const LANES = new Set([...SCHEMA.lanes.values, SCHEMA.lanes.holdState]);
const PRIORITIES = new Set(SCHEMA.priorities.values);
const ADMISSION = new Set(SCHEMA.admissionDispositions.values);
const KINDS = new Set(SCHEMA.decisionKinds.values);
const CONF = new Set(['high', 'medium', 'low']);
const CLASS_MAP = SCHEMA.decisionClasses.map;
const CHECKPROOF_PROOF = SCHEMA.invariants.checkProofImpliesProofLane === true;

const ZERO_ANCHOR = '0'.repeat(64);
const HEX64 = /^[0-9a-f]{64}$/;                                        // lowercase sha256
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;  // strict ISO UTC
const CORRECTION_KINDS = new Set(['supersede', 'revoke']);
// only discovery / future-deferred admissions are promotable (§ Codex: NOT duplicate-superseded-disposed)
const PROMOTABLE_ADMISSIONS = new Set(['discovery', 'future-deferred']);
const ALLOWED_TOP = new Set(['schemaVersion', 'seq', 'eventId', 'recordedAt', 'rowRef', 'decision', 'authorityProof', 'evidenceRefs', 'supersedesSeq', 'previousEventDigest', 'eventDigest']);
// rowRef required/allowed fields resolved from the schema SSOT (schema.rowRef.requiredFields)
// — NOT a hardcoded literal — so gate ↔ schema ↔ TS ROWREF_FIELDS stay exactly aligned.
const ROWREF_REQUIRED = SCHEMA.rowRef.requiredFields;
const ALLOWED_ROWREF = new Set(ROWREF_REQUIRED);
const DECISION_FIELDS = {
  'level-lane-disposition': ['kind', 'level', 'lane', 'ruleId', 'confidence'],
  'priority-retriage': ['kind', 'fromPriority', 'toPriority'],
  'admission': ['kind', 'disposition', 'parentOutcomeId'],
  'born-promotion': ['kind', 'promotedTo', 'outcomeId'],
  'supersede': ['kind', 'targetSeq', 'reason'],
  'revoke': ['kind', 'targetSeq', 'reason'],
};

/** Parse newline-delimited JSON. Blank lines ignored; a malformed line is a HOLD
 *  (never silently skipped). */
export function parseLedger(text) {
  const events = []; const problems = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (line.trim() === '') return;
    try { events.push(JSON.parse(line)); }
    catch { problems.push(hold('LEDGER_PARSE', `line ${i + 1} is not valid JSON`)); }
  });
  return { events, problems };
}

function validateShape(e, i) {
  const p = [];
  const seq = e?.seq;
  if (e.schemaVersion !== SCHEMA.schemaVersion) p.push(err('SCHEMA_VERSION', `event ${i}: schemaVersion ${e.schemaVersion} ≠ ${SCHEMA.schemaVersion}`, seq));
  if (!Number.isInteger(e.seq)) p.push(err('SEQ_TYPE', `event ${i}: seq must be an integer`, seq));
  for (const f of ['eventId', 'recordedAt', 'previousEventDigest', 'eventDigest']) if (typeof e[f] !== 'string' || !e[f]) p.push(err('MISSING_FIELD', `event ${i}: ${f} missing`, seq));
  // strict shape: reject unknown top-level fields
  for (const k of Object.keys(e)) if (!ALLOWED_TOP.has(k)) p.push(err('UNKNOWN_FIELD', `event ${i}: unknown top-level field '${k}'`, seq));
  // digest format (lowercase sha256; previousEventDigest may be the genesis zero-anchor) + strict ISO UTC
  if (typeof e.eventDigest === 'string' && !HEX64.test(e.eventDigest)) p.push(err('DIGEST_FORMAT', `event ${i}: eventDigest is not lowercase sha256`, seq));
  if (typeof e.previousEventDigest === 'string' && e.previousEventDigest !== ZERO_ANCHOR && !HEX64.test(e.previousEventDigest)) p.push(err('DIGEST_FORMAT', `event ${i}: previousEventDigest is neither the zero-anchor nor lowercase sha256`, seq));
  if (typeof e.recordedAt === 'string' && !ISO_UTC.test(e.recordedAt)) p.push(err('RECORDEDAT_FORMAT', `event ${i}: recordedAt is not strict ISO UTC (…Z)`, seq));
  // rowRef 4-part (workId + rowDefinitionDigest + masterSourceDigest + batchManifestDigest) + no unknown fields
  const rr = e.rowRef || {};
  for (const f of ROWREF_REQUIRED) if (typeof rr[f] !== 'string' || !rr[f]) p.push(err('ROWREF_INCOMPLETE', `event ${i}: rowRef.${f} missing (all ${ROWREF_REQUIRED.length} required)`, seq));
  for (const k of Object.keys(rr)) if (!ALLOWED_ROWREF.has(k)) p.push(err('UNKNOWN_FIELD', `event ${i}: unknown rowRef field '${k}'`, seq));
  // authority proof
  if (typeof e.authorityProof?.ownerReceipt !== 'string' || !e.authorityProof.ownerReceipt) p.push(hold('AUTHORITY_UNRESOLVED', `event ${i}: authorityProof.ownerReceipt missing → HOLD (no fabricated receipt)`, seq));
  // decision per kind
  const d = e.decision || {};
  if (!KINDS.has(d.kind)) { p.push(err('DECISION_KIND', `event ${i}: unknown decision.kind '${d.kind}'`, seq)); return p; }
  const allowedD = DECISION_FIELDS[d.kind];
  if (allowedD) for (const k of Object.keys(d)) if (!allowedD.includes(k)) p.push(err('UNKNOWN_FIELD', `event ${i}: unknown decision field '${k}' for kind '${d.kind}'`, seq));
  if (d.kind === 'level-lane-disposition') {
    if (!LEVELS.includes(d.level)) p.push(err('BAD_LEVEL', `event ${i}: level '${d.level}'`, seq));
    if (!LANES.has(d.lane)) p.push(err('BAD_LANE', `event ${i}: lane '${d.lane}'`, seq));
    if (typeof d.ruleId !== 'string' || !d.ruleId) p.push(err('BAD_RULEID', `event ${i}: ruleId missing`, seq));
    if (!CONF.has(d.confidence)) p.push(err('BAD_CONFIDENCE', `event ${i}: confidence '${d.confidence}'`, seq));
    if (CHECKPROOF_PROOF && d.level === 'check-proof' && d.lane !== 'proof') p.push(err('CHECKPROOF_INVARIANT', `event ${i}: level=check-proof requires lane=proof, got '${d.lane}'`, seq));
  } else if (d.kind === 'priority-retriage') {
    if (!PRIORITIES.has(d.toPriority)) p.push(err('BAD_PRIORITY', `event ${i}: toPriority '${d.toPriority}'`, seq));
    if (d.fromPriority !== undefined && !PRIORITIES.has(d.fromPriority)) p.push(err('BAD_PRIORITY', `event ${i}: fromPriority '${d.fromPriority}'`, seq));
  } else if (d.kind === 'admission') {
    if (!ADMISSION.has(d.disposition)) p.push(err('BAD_ADMISSION', `event ${i}: disposition '${d.disposition}'`, seq));
    if (SCHEMA.admissionDispositions.requiresParentOutcome.includes(d.disposition) && !d.parentOutcomeId) p.push(err('MISSING_PARENT', `event ${i}: disposition '${d.disposition}' requires parentOutcomeId`, seq));
  } else if (d.kind === 'born-promotion') {
    if (d.promotedTo !== 'committed-outcome') p.push(err('BAD_PROMOTION', `event ${i}: promotedTo '${d.promotedTo}'`, seq));
  } else if (d.kind === 'supersede' || d.kind === 'revoke') {
    if (!Number.isInteger(d.targetSeq)) p.push(err('BAD_TARGET', `event ${i}: ${d.kind}.targetSeq must be an integer`, seq));
    if (typeof d.reason !== 'string' || !d.reason) p.push(err('BAD_REASON', `event ${i}: ${d.kind}.reason missing`, seq));
  }
  return p;
}

/** digest chain + seq monotonicity + genesis link. */
export function validateChain(events) {
  const p = [];
  const seenIds = new Set();
  let prev = null;
  events.forEach((e, i) => {
    if (e.eventDigest !== computeEventDigest(e)) p.push(err('DIGEST_MISMATCH', `event seq=${e.seq}: eventDigest does not match canonical recomputation`, e.seq));
    if (typeof e.eventId === 'string') { if (seenIds.has(e.eventId)) p.push(err('DUPLICATE_EVENT_ID', `event seq=${e.seq}: duplicate eventId '${e.eventId}'`, e.seq)); seenIds.add(e.eventId); }
    if (i === 0) {
      if (e.seq !== 1) p.push(err('SEQ_START', `first event seq must be 1, got ${e.seq}`, e.seq));
      if (e.previousEventDigest !== ZERO_ANCHOR) p.push(err('GENESIS_ANCHOR', `genesis event previousEventDigest must be the zero-anchor (64×'0')`, e.seq));
    } else {
      if (e.seq !== prev.seq + 1) p.push(hold('SEQ_GAP', `seq gap: ${prev.seq} → ${e.seq}`, e.seq));
      if (e.previousEventDigest !== prev.eventDigest) p.push(err('CHAIN_BROKEN', `event seq=${e.seq}: previousEventDigest ≠ prior eventDigest`, e.seq));
    }
    prev = e;
  });
  return p;
}

/** Correction (supersede/revoke) integrity: target must exist, be earlier, same
 *  workId, not itself a correction, and be corrected at most once (§ Codex req 3). */
export function validateCorrections(events) {
  const p = [];
  const bySeq = new Map(events.map((e) => [e.seq, e]));
  const corrected = new Set();
  for (const e of events) {
    if (!CORRECTION_KINDS.has(e.decision?.kind)) continue;
    const t = e.decision.targetSeq;
    const target = bySeq.get(t);
    if (!target) { p.push(err('CORRECTION_TARGET_MISSING', `${e.decision.kind} seq=${e.seq} targets nonexistent seq ${t}`, e.seq)); continue; }
    if (!(t < e.seq)) p.push(err('CORRECTION_TARGET_ORDER', `${e.decision.kind} seq=${e.seq} must target an earlier seq (got ${t}: future/self)`, e.seq));
    if (target.rowRef?.workId !== e.rowRef?.workId) p.push(err('CORRECTION_FOREIGN_ROW', `${e.decision.kind} seq=${e.seq} targets a foreign workId (target=${target.rowRef?.workId})`, e.seq));
    if (CORRECTION_KINDS.has(target.decision?.kind)) p.push(err('CORRECTION_TARGET_IS_CORRECTION', `${e.decision.kind} seq=${e.seq} may not target a correction event (seq ${t})`, e.seq));
    if (corrected.has(t)) p.push(err('CORRECTION_DOUBLE', `seq ${t} is corrected more than once (again by seq ${e.seq})`, e.seq));
    corrected.add(t);
  }
  return p;
}

/** rowRef identity per §12.1 + Codex req-2 (per-batch snapshot).
 *  - workId must exist in the current registry (else HOLD).
 *  - Each event's masterSourceDigest is validated against ITS BATCH snapshot
 *    (immutable), NEVER the current global — a progress-only MASTER change must
 *    not invalidate historical events.
 *  - ONLY the effective-latest classification per row is checked against the
 *    CURRENT rowDefinitionDigest; a real definition drift HOLDs THAT ROW only,
 *    not the whole ledger. Superseded historical events are not re-checked.
 *  registry=null → HOLD (unknown env). batchManifests: Map<batchManifestDigest,
 *  { masterSnapshotDigest }> from committed batch receipts. */
export function validateRowRefs(events, registry, _currentSourceDigest, batchManifests) {
  if (!registry) return [hold('REGISTRY_UNAVAILABLE', 'identityRegistry unavailable → HOLD')];
  const reg = new Map(registry.map((r) => [r.id, r]));
  const batches = batchManifests instanceof Map ? batchManifests : new Map();
  const p = [];
  // (1) per-event: workId known + masterSourceDigest self-consistent with its batch snapshot
  for (const e of events) {
    const rr = e.rowRef || {};
    if (!reg.has(rr.workId)) { p.push(hold('UNKNOWN_ROW', `event seq=${e.seq}: workId '${rr.workId}' not in registry`, e.seq)); continue; }
    const batch = batches.get(rr.batchManifestDigest);
    if (batch) {
      if (rr.masterSourceDigest !== batch.masterSnapshotDigest) p.push(err('BATCH_SNAPSHOT_MISMATCH', `event seq=${e.seq}: masterSourceDigest ≠ its batch snapshot (${String(batch.masterSnapshotDigest).slice(0, 8)}…)`, e.seq));
    } else if (rr.batchManifestDigest) {
      p.push(hold('BATCH_UNRESOLVED', `event seq=${e.seq}: batch manifest '${String(rr.batchManifestDigest).slice(0, 8)}…' not resolvable → HOLD (cannot verify snapshot)`, e.seq));
    }
  }
  // (2) effective-latest classification per row → current rowDefinitionDigest (per-row HOLD on drift)
  const latest = new Map();
  for (const e of effectiveEvents(events)) if (e.decision.kind === 'level-lane-disposition') latest.set(e.rowRef.workId, e);
  for (const e of latest.values()) {
    const row = reg.get(e.rowRef.workId);
    if (row?.definitionDigest && e.rowRef.rowDefinitionDigest !== row.definitionDigest) p.push(hold('DEFINITION_DRIFT', `effective classification for '${e.rowRef.workId}' (seq ${e.seq}): rowDefinitionDigest drift vs current MASTER → HOLD this row only (write a superseding disposition)`, e.seq));
  }
  return p;
}

/** Effective (non-superseded, non-revoked) events, honoring supersede/revoke. */
export function effectiveEvents(events) {
  const dead = new Set();
  for (const e of events) if (e.decision.kind === 'supersede' || e.decision.kind === 'revoke') dead.add(e.decision.targetSeq);
  return events.filter((e) => !dead.has(e.seq) && e.decision.kind !== 'supersede' && e.decision.kind !== 'revoke');
}

/** At most one active decision per (workId, decisionClass) — except 'correction'. */
export function validateExclusivity(events) {
  const p = [];
  const seen = new Map(); // `${workId}::${class}` → seq
  for (const e of effectiveEvents(events)) {
    const cls = CLASS_MAP[e.decision.kind];
    if (cls === 'correction') continue;
    const key = `${e.rowRef.workId}::${cls}`;
    if (seen.has(key)) p.push(hold('ACTIVE_CONFLICT', `conflicting active '${cls}' decisions for '${e.rowRef.workId}' (seq ${seen.get(key)} and ${e.seq})`, e.seq));
    else seen.set(key, e.seq);
  }
  return p;
}

/** admission→promotion ordering: a born-promotion requires a prior non-revoked
 *  admission whose disposition is a born/discovery-admitted (parked) state. */
export function validateLifecycle(events) {
  const p = [];
  const admittedParked = new Map(); // workId → true iff a promotable (discovery/future-deferred) admission exists
  const eff = effectiveEvents(events);
  for (const e of eff) {
    if (e.decision.kind === 'admission') admittedParked.set(e.rowRef.workId, PROMOTABLE_ADMISSIONS.has(e.decision.disposition));
    if (e.decision.kind === 'born-promotion') {
      const state = admittedParked.get(e.rowRef.workId);
      if (state === undefined) p.push(hold('PROMOTION_NO_ADMISSION', `born-promotion for '${e.rowRef.workId}' (seq ${e.seq}) has no prior admission`, e.seq));
      else if (state !== true) p.push(err('PROMOTION_BAD_STATE', `born-promotion for '${e.rowRef.workId}' (seq ${e.seq}) requires a prior parked admission (discovery/future-deferred)`, e.seq));
    }
  }
  return p;
}

/** Authority verification (Codex req-1). The buildless gate NEVER concludes
 *  'authenticated' — it verifies the REPO-VERIFIABLE binding of a committed batch
 *  receipt, or typed-HOLDs. Three outcomes per batch (schema.approvalIntegration):
 *  verified-binding (no problems), typed HOLD (no receipt → the MAC cannot be
 *  re-verified pre-build), or error (mismatch/deny/expired/replay). A bare non-empty
 *  ownerReceipt string is NEVER accepted as authority. */
export function validateAuthority(events, batchManifests, trustAnchors, batchSnapshots, receiptProblems = []) {
  const p = [...receiptProblems]; // dup-manifest / filename-mismatch / malformed surfaced fail-closed
  const manifests = batchManifests instanceof Map ? batchManifests : new Map();
  const anchors = trustAnchors instanceof Map ? trustAnchors : new Map();
  const snapshots = batchSnapshots instanceof Map ? batchSnapshots : new Map();
  const byBatch = new Map();
  for (const e of events) { const b = e.rowRef?.batchManifestDigest; if (!byBatch.has(b)) byBatch.set(b, []); byBatch.get(b).push(e); }
  const seenClaims = new Set();
  for (const [bDigest, bEvents] of byBatch) {
    const seq0 = bEvents[0]?.seq;
    const manifest = manifests.get(bDigest);
    if (!manifest || !manifest.receipt) { p.push(hold('AUTHORITY_UNVERIFIABLE', `batch '${String(bDigest).slice(0, 8)}…' has no committed repo-verifiable receipt → HOLD (missing trust anchor: a committed receipt + ed25519 attestation)`, seq0)); continue; }
    const r = manifest.receipt; const s = r.subject && typeof r.subject === 'object' ? r.subject : {};
    // strict receipt shape: reject forbidden (self-authored string) + unknown fields, fail-closed
    for (const k of Object.keys(r)) if (!RECEIPT_ALLOWED.has(k)) p.push(err(RECEIPT_REJECTED.has(k) ? 'RECEIPT_REJECTED_FIELD' : 'RECEIPT_UNKNOWN_FIELD', `receipt '${manifest.requestId}': forbidden/unknown field '${k}'`, seq0));
    // strict NESTED shape (req-3): every required receipt field present + exact subject/attestation
    if (r.schemaVersion !== 1) p.push(err('RECEIPT_SCHEMA', `receipt '${manifest.requestId}': schemaVersion must be exactly 1`, seq0));
    for (const f of RECEIPT_REQUIRED) if (r[f] === undefined || r[f] === null) p.push(err('RECEIPT_INCOMPLETE_FIELD', `receipt '${manifest.requestId}': missing required '${f}'`, seq0));
    if (typeof r.requestId !== 'string' || !r.requestId) p.push(err('RECEIPT_FORMAT', `receipt '${manifest.requestId}': requestId must be a non-empty string`, seq0));
    if (typeof r.claimRef !== 'string' || !r.claimRef) p.push(err('RECEIPT_FORMAT', `receipt '${manifest.requestId}': claimRef must be a non-empty string`, seq0));
    // (4.4a) ApprovalBroker identity parity: requestId canonical (approvalIdSchema mirror) + claimRef === approval:<requestId>
    if (typeof r.requestId === 'string' && r.requestId && !isCanonicalApprovalId(r.requestId)) p.push(err('AUTHORITY_REQUESTID_FORMAT', `receipt '${manifest.requestId}': requestId is not a canonical ApprovalBroker id (approvalIdSchema parity — lowercase-ASCII, 1..128, path-safe, no Windows reserved device)`, seq0));
    if (typeof r.requestId === 'string' && typeof r.claimRef === 'string' && r.claimRef !== claimRefFor(r.requestId)) p.push(err('AUTHORITY_CLAIMREF_FORMAT', `receipt '${manifest.requestId}': claimRef must be exactly '${claimRefFor(r.requestId)}' (got '${r.claimRef}')`, seq0));
    if (r.subject === undefined || r.subject === null || typeof r.subject !== 'object') p.push(err('SUBJECT_INCOMPLETE_FIELD', `receipt '${manifest.requestId}': subject missing/invalid`, seq0));
    else {
      if (s.kind !== 'closure-disposition-batch') p.push(err('SUBJECT_KIND', `subject.kind must be exactly 'closure-disposition-batch' (got '${s.kind}')`, seq0));
      for (const f of SUBJECT_STRING_FIELDS) if (typeof s[f] !== 'string' || !s[f]) p.push(err('SUBJECT_INCOMPLETE_FIELD', `subject missing/empty required string '${f}'`, seq0));
      for (const f of SUBJECT_INT_FIELDS) if (!Number.isInteger(s[f])) p.push(err('SUBJECT_INCOMPLETE_FIELD', `subject missing/non-integer required '${f}'`, seq0));
      for (const k of Object.keys(s)) if (!SUBJECT_ALLOWED.has(k)) p.push(err('SUBJECT_UNKNOWN_FIELD', `subject unknown field '${k}'`, seq0));
    }
    if (r.attestation === undefined || r.attestation === null || typeof r.attestation !== 'object') p.push(err('ATTESTATION_SHAPE', `receipt '${manifest.requestId}': attestation missing/invalid`, seq0));
    else {
      for (const k of Object.keys(r.attestation)) if (!ATTESTATION_ALLOWED.has(k)) p.push(err('ATTESTATION_UNKNOWN_FIELD', `attestation unknown field '${k}'`, seq0));
      if (typeof r.attestation.keyId !== 'string' || !r.attestation.keyId || typeof r.attestation.signature !== 'string' || !r.attestation.signature) p.push(err('ATTESTATION_SHAPE', `attestation must be exactly { keyId, signature } non-empty`, seq0));
    }
    if (r.decision !== 'allow') { p.push(err('AUTHORITY_NOT_ALLOWED', `receipt decision='${r.decision}' (not allow)`, seq0)); continue; }
    if (r.closureReason) { p.push(err('AUTHORITY_SYSTEM_CLOSED', `receipt carries closureReason='${r.closureReason}' (TTL/system closure, not an owner allow)`, seq0)); continue; }
    // attestation must resolve to a COMMITTED public trust anchor
    const att = r.attestation || {};
    const anchor = anchors.get(att.keyId);
    if (!att.keyId || !att.signature || !anchor) { p.push(hold('AUTHORITY_UNVERIFIABLE', `batch '${String(bDigest).slice(0, 8)}…': no committed trust anchor for attestation keyId '${att.keyId ?? '(none)'}' → HOLD (missing trust anchor)`, seq0)); continue; }
    // (1) verify the ed25519 signature over the canonical binding reconstructed from the receipt
    const binding = { requestId: r.requestId, claimRef: r.claimRef, decision: r.decision, tenantId: s.tenantId, projectId: s.projectId, masterSnapshotDigest: s.masterSnapshotDigest, registryIntegrityDigest: s.registryIntegrityDigest, proposalDigest: s.proposalDigest, unsignedManifestDigest: s.unsignedManifestDigest, eventCount: s.eventCount, seqIntervalStart: s.seqIntervalStart, seqIntervalEnd: s.seqIntervalEnd, authenticatedAt: r.authenticatedAt, decidedAt: r.decidedAt, authExpiresAt: r.authExpiresAt };
    let sigOk = false;
    try { sigOk = cryptoVerify(null, Buffer.from(canonicalize(binding), 'utf8'), createPublicKey(anchor.publicKeyPem), Buffer.from(String(att.signature), 'base64')); } catch { sigOk = false; }
    if (!sigOk) { p.push(err('AUTHORITY_SIGNATURE_INVALID', `receipt '${r.requestId}': ed25519 attestation does not verify against trust anchor '${att.keyId}'`, seq0)); continue; }
    // (2) INDEPENDENTLY re-derive / cross-check EVERY signed field (never trust the reconstructed binding alone)
    const recomputed = computeBatchManifestDigest(bEvents);
    const seqs = bEvents.map((e) => e.seq); const lo = Math.min(...seqs), hi = Math.max(...seqs);
    const chk = (cond, code, msg) => { if (!cond) p.push(err(code, `receipt '${r.requestId}': ${msg}`, seq0)); };
    chk(recomputed === bDigest, 'AUTHORITY_MANIFEST_BINDING', "events' batchManifestDigest ≠ recomputed manifest");
    chk(s.unsignedManifestDigest === recomputed, 'AUTHORITY_MANIFEST_MISMATCH', 'unsignedManifestDigest ≠ recomputed');
    chk(s.eventCount === bEvents.length, 'AUTHORITY_COUNT_MISMATCH', `eventCount ${s.eventCount} ≠ ${bEvents.length}`);
    chk(s.seqIntervalStart === lo && s.seqIntervalEnd === hi, 'AUTHORITY_SEQ_MISMATCH', 'seq interval mismatch');
    // HISTORICAL BINDING (req-2): recompute the signed MASTER/registry/proposal digests
    // from the IMMUTABLE per-batch snapshot bundle's archived bytes — NEVER current
    // MASTER (a progress-only change must not invalidate a historical batch), and NEVER
    // a `== null` short-circuit (Codex named a silent skip itself a false-pass). Current
    // MASTER is used ONLY for the effective-latest rowDefinitionDigest drift (validateRowRefs).
    const snap = snapshots.get(bDigest);
    if (!snap) {
      p.push(hold('BATCH_SNAPSHOT_MISSING', `batch '${String(bDigest).slice(0, 8)}…': no immutable snapshot bundle under ${BATCHES_REL}/<batchManifestDigest>/ → HOLD (cannot recompute the signed MASTER/proposal digests from batch-time bytes)`, seq0));
    } else {
      if (!snap.masterPresent || snap.masterMalformed) p.push(hold('BATCH_SNAPSHOT_MASTER_ABSENT', `batch '${String(bDigest).slice(0, 8)}…': master-snapshot.json absent/malformed in the bundle → HOLD (cannot verify)`, seq0));
      // integrity BEFORE the value binds: 'cannot verify' (absent/malformed) is a HOLD; 'verified
      // and wrong' (payload tamper, recomputed registryIntegrity ≠ stored) is a FAIL.
      else if (snap.integrityVerified !== true) p.push(err('AUTHORITY_SNAPSHOT_INTEGRITY_MISMATCH', `receipt '${r.requestId}': archived master snapshot integrity NOT verified — recomputed registryIntegrity ≠ its stored value (canonical-payload tamper of workItems/identityRegistry with a stale embedded digest)`, seq0));
      else {
        chk(s.masterSnapshotDigest === snap.sourceDigestValue, 'AUTHORITY_SNAPSHOT_MISMATCH', 'masterSnapshotDigest ≠ the batch snapshot bundle sourceDigest.value (archived bytes)');
        chk(s.registryIntegrityDigest === snap.registryIntegrityValue, 'AUTHORITY_REGISTRY_MISMATCH', 'registryIntegrityDigest ≠ the batch snapshot bundle registryIntegrity.value (archived bytes)');
      }
      if (!snap.proposalPresent) p.push(hold('BATCH_SNAPSHOT_PROPOSAL_ABSENT', `batch '${String(bDigest).slice(0, 8)}…': proposal bytes were not archived into the immutable bundle before delete-on-consume → HOLD (distinct from a missing bundle)`, seq0));
      else chk(s.proposalDigest === snap.proposalDigest, 'AUTHORITY_PROPOSAL_MISMATCH', 'proposalDigest ≠ digest of the archived proposal.md bytes');
    }
    chk(s.tenantId === anchor.tenantId, 'AUTHORITY_TENANT_MISMATCH', 'tenantId ≠ trust-anchor tenant');
    chk(s.projectId === anchor.projectId, 'AUTHORITY_PROJECT_MISMATCH', 'projectId ≠ trust-anchor project');
    chk(r.requestId === manifest.requestId, 'AUTHORITY_REQUESTID_MISMATCH', 'requestId ≠ receipt filename');
    for (const e of bEvents) if (e.authorityProof?.ownerReceipt !== r.claimRef) p.push(err('AUTHORITY_CLAIM_MISMATCH', `event seq=${e.seq} ownerReceipt ≠ claimRef`, e.seq));
    // (3) window: authenticatedAt ≤ decidedAt ≤ authExpiresAt (strict ISO-UTC; the gate's clock is irrelevant)
    if (!ISO_UTC.test(r.authenticatedAt || '') || !ISO_UTC.test(r.decidedAt || '') || !ISO_UTC.test(r.authExpiresAt || '')) p.push(err('AUTHORITY_WINDOW_FORMAT', `receipt '${r.requestId}': window timestamps must be strict ISO-UTC (…Z)`, seq0));
    else if (!(r.authenticatedAt <= r.decidedAt && r.decidedAt <= r.authExpiresAt)) p.push(err('AUTHORITY_WINDOW', `receipt '${r.requestId}': decidedAt not within [authenticatedAt, authExpiresAt]`, seq0));
    // (4) replay: single-use claim across batches
    if (seenClaims.has(r.claimRef)) p.push(err('AUTHORITY_CLAIM_REPLAY', `claimRef '${r.claimRef}' reused across batches`, seq0));
    else seenClaims.add(r.claimRef);
  }
  return p;
}

/** Append-only: baseline lines must be an exact prefix of current lines. */
export function validateAppendOnly(currentText, baselineText) {
  const cur = currentText.split('\n');
  const base = baselineText.split('\n');
  // drop a single trailing empty element from a final newline
  if (cur.length && cur[cur.length - 1] === '') cur.pop();
  if (base.length && base[base.length - 1] === '') base.pop();
  const p = [];
  if (base.length > cur.length) return [err('APPEND_ONLY', `baseline has ${base.length} lines, current only ${cur.length} — lines were removed`)];
  for (let i = 0; i < base.length; i++) if (base[i] !== cur[i]) { p.push(err('APPEND_ONLY', `line ${i + 1} changed vs baseline — not append-only`)); break; }
  return p;
}

/** Resolve the append-only baseline from git. Unresolvable → typed HOLD. */
export function resolveBaseline({ ledgerRel, gitRunner }) {
  const run = (args) => { try { return { status: 0, stdout: gitRunner(args) }; } catch (e) { return { status: 1, stdout: '', error: e }; } };
  const originMain = run(['rev-parse', '--verify', '--quiet', 'origin/main']);
  if (originMain.status !== 0 || !originMain.stdout.trim()) return { hold: hold('MERGE_BASE_UNRESOLVED', 'origin/main not fetchable → append-only baseline unresolved → HOLD') };
  const mb = run(['merge-base', 'HEAD', 'origin/main']);
  if (mb.status !== 0 || !mb.stdout.trim()) return { hold: hold('MERGE_BASE_UNRESOLVED', 'git merge-base HEAD origin/main failed → HOLD') };
  const base = mb.stdout.trim();
  const show = run(['show', `${base}:${ledgerRel}`]);
  // file absent at base = brand-new ledger → empty baseline (all appends valid)
  if (show.status !== 0) return { baselineText: '' };
  return { baselineText: show.stdout };
}

/** Full gate over already-loaded inputs (hermetic). */
export function runGate({ ledgerText, baseline, registry, masterSourceDigest, batchManifests, verifyAuthority, trustAnchors, batchSnapshots, trustAnchorProblems, receiptProblems }) {
  const holds = []; const errors = [];
  const { events, problems } = parseLedger(ledgerText);
  for (const pr of problems) (pr.kind === 'hold' ? holds : errors).push(pr);
  events.forEach((e, i) => { for (const pr of validateShape(e, i)) (pr.kind === 'hold' ? holds : errors).push(pr); });
  const push = (arr) => { for (const pr of arr) (pr.kind === 'hold' ? holds : errors).push(pr); };
  push(validateChain(events));
  push(validateCorrections(events));
  push(validateRowRefs(events, registry, masterSourceDigest, batchManifests));
  push(validateExclusivity(events));
  push(validateLifecycle(events));
  if (verifyAuthority) { push(trustAnchorProblems ?? []); push(validateAuthority(events, batchManifests, trustAnchors, batchSnapshots, receiptProblems)); }
  if (baseline && baseline.hold) holds.push(baseline.hold);
  else if (baseline) push(validateAppendOnly(ledgerText, baseline.baselineText ?? ''));
  return { ok: errors.length === 0 && holds.length === 0, errors, holds, eventCount: events.length };
}

// ── Self-check (in-process unit assertions over the mechanism) ──
// The hermetic-lint test-graph resolver stack-overflows when a *.test.ts imports
// a brand-new production module, so the mechanism cannot be unit-tested by import
// (see the owner-facing finding). Instead the full logic + canonical edge cases
// live here and are asserted through the CLI (`--self-check`), which is the real
// production surface; tests/governance invoke this via a subprocess.
export function runSelfCheck() {
  const failures = [];
  let n = 0;
  const ok = (cond, label) => { n += 1; if (!cond) failures.push(label); };
  const throws = (fn, re, label) => { n += 1; try { fn(); failures.push(`${label} (did not throw)`); } catch (e) { if (re && !re.test(String(e.message))) failures.push(`${label} (wrong error: ${e.message})`); } };

  const GENESIS = '0'.repeat(64);
  const SRC = 'SRC-DIGEST';
  const BATCH = 'batch-manifest-1';
  const batchManifests = new Map([[BATCH, { masterSnapshotDigest: SRC }]]);
  const registry = ['ROW-A', 'ROW-B', 'ROW-C'].map((id) => ({ id, definitionDigest: `def-${id}` }));
  const rr = (workId, over = {}) => ({ workId, rowDefinitionDigest: `def-${workId}`, masterSourceDigest: SRC, batchManifestDigest: BATCH, ...over });
  const ll = (level, lane, over = {}) => ({ kind: 'level-lane-disposition', level, lane, ruleId: 'LVL-owner-override', confidence: 'high', ...over });
  const build = (parts) => { let prev = GENESIS; return parts.map((p, i) => { const e = { schemaVersion: 1, seq: i + 1, eventId: `e${i + 1}`, recordedAt: '2026-08-14T00:00:00Z', previousEventDigest: prev, authorityProof: { ownerReceipt: 'r:1' }, ...p }; e.eventDigest = computeEventDigest(e); prev = e.eventDigest; return e; }); };
  const jsonl = (evs) => evs.map((e) => JSON.stringify(e)).join('\n') + '\n';
  const gate = (evs, over = {}) => runGate({ ledgerText: jsonl(evs), baseline: null, registry, masterSourceDigest: SRC, batchManifests, ...over });
  const has = (arr, code) => arr.some((x) => x.code === code);

  // canonical encoding
  ok(canonicalize({ b: 1, a: 2 }) === '{"a":2,"b":1}', 'canonical: sorted keys');
  ok(canonicalize({ a: 1, b: undefined }) === canonicalize({ a: 1 }), 'canonical: undefined omitted');
  ok(canonicalize([3, 1, 2]) === '[3,1,2]', 'canonical: array order preserved');
  ok(canonicalize({ x: 'é' }) === canonicalize({ x: 'é' }), 'canonical: NFC normalization');
  throws(() => canonicalize({ x: 1.5 }), /non-integer/, 'canonical: rejects non-integer');
  const [ev] = build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }]);
  ok(verifyEventDigest(ev), 'canonical: digest verifies');
  ok(computeEventDigest({ ...ev, eventDigest: 'x' }) === ev.eventDigest, 'canonical: digest excludes eventDigest');

  // chain + schema/enum
  ok(gate(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-B'), decision: ll('outcome', 'contract') }])).ok, 'gate: well-formed chain passes');
  const brk = build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-B'), decision: ll('task', 'runtime') }]); brk[1].previousEventDigest = 'wrong'; brk[1].eventDigest = computeEventDigest(brk[1]);
  ok(has(validateChain(brk), 'CHAIN_BROKEN'), 'gate: broken chain flagged');
  ok(has(gate(build([{ rowRef: rr('ROW-A'), decision: { kind: 'nope' } }])).errors, 'DECISION_KIND'), 'gate: unknown kind rejected');
  ok(has(gate(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'martian') }])).errors, 'BAD_LANE'), 'gate: bad lane rejected');

  // check-proof ⇒ proof invariant
  ok(has(gate(build([{ rowRef: rr('ROW-A'), decision: ll('check-proof', 'contract') }])).errors, 'CHECKPROOF_INVARIANT'), 'gate: check-proof⇒proof enforced');
  ok(gate(build([{ rowRef: rr('ROW-A'), decision: ll('check-proof', 'proof') }])).ok, 'gate: check-proof in proof passes');

  // rowRef identity / per-batch snapshot / effective-latest drift (req-2)
  ok(has(gate(build([{ rowRef: rr('ROW-ZZZ'), decision: ll('task', 'runtime') }])).holds, 'UNKNOWN_ROW'), 'gate: unknown row → HOLD');
  ok(has(gate(build([{ rowRef: rr('ROW-A', { rowDefinitionDigest: 'stale' }), decision: ll('task', 'runtime') }])).holds, 'DEFINITION_DRIFT'), 'gate: effective-latest definition drift → HOLD that row');
  ok(has(gate(build([{ rowRef: rr('ROW-A', { masterSourceDigest: 'OTHER' }), decision: ll('task', 'runtime') }])).errors, 'BATCH_SNAPSHOT_MISMATCH'), 'gate: masterSourceDigest ≠ its batch snapshot → error');
  ok(has(gate(build([{ rowRef: rr('ROW-A', { batchManifestDigest: 'nope' }), decision: ll('task', 'runtime') }])).holds, 'BATCH_UNRESOLVED'), 'gate: unresolvable batch manifest → HOLD');
  ok(has(gate(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }]), { registry: null }).holds, 'REGISTRY_UNAVAILABLE'), 'gate: no registry → HOLD');
  // Codex req-2 acceptance: old event → MASTER def evolves → old superseded → new event with current def → PASS.
  {
    const reg2 = [{ id: 'ROW-A', definitionDigest: 'def-ROW-A-v2' }, { id: 'ROW-B', definitionDigest: 'def-ROW-B' }, { id: 'ROW-C', definitionDigest: 'def-ROW-C' }];
    const evolved = build([
      { rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, // old: def-ROW-A (now stale vs v2) — will be superseded
      { rowRef: rr('ROW-A'), decision: { kind: 'supersede', targetSeq: 1, reason: 'MASTER definition evolved' } },
      { rowRef: rr('ROW-A', { rowDefinitionDigest: 'def-ROW-A-v2' }), decision: ll('outcome', 'contract') }, // new: current def
    ]);
    const res = runGate({ ledgerText: jsonl(evolved), baseline: null, registry: reg2, masterSourceDigest: SRC, batchManifests });
    ok(res.ok, `req-2 acceptance: source-evolution+supersede → gate PASS (holds=[${res.holds.map((h) => h.code)}] errors=[${res.errors.map((x) => x.code)}])`);
  }

  // authority
  ok(has(gate(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime'), authorityProof: { ownerReceipt: '' } }])).holds, 'AUTHORITY_UNRESOLVED'), 'gate: missing receipt → HOLD');

  // exclusivity + supersede
  ok(has(validateExclusivity(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-A'), decision: ll('outcome', 'contract') }])), 'ACTIVE_CONFLICT'), 'gate: intra-class conflict → HOLD');
  ok(validateExclusivity(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-A'), decision: { kind: 'supersede', targetSeq: 1, reason: 'fix' } }, { rowRef: rr('ROW-A'), decision: ll('outcome', 'contract') }])).length === 0, 'gate: supersede clears conflict');
  ok(validateExclusivity(build([{ rowRef: rr('ROW-A'), decision: { kind: 'admission', disposition: 'discovery' } }, { rowRef: rr('ROW-A'), decision: { kind: 'born-promotion', promotedTo: 'committed-outcome' } }])).length === 0, 'gate: admission+promotion not mutually exclusive');

  // lifecycle
  ok(has(validateLifecycle(build([{ rowRef: rr('ROW-A'), decision: { kind: 'born-promotion', promotedTo: 'committed-outcome' } }])), 'PROMOTION_NO_ADMISSION'), 'gate: promotion w/o admission → HOLD');
  ok(validateLifecycle(build([{ rowRef: rr('ROW-A'), decision: { kind: 'admission', disposition: 'discovery' } }, { rowRef: rr('ROW-A'), decision: { kind: 'born-promotion', promotedTo: 'committed-outcome' } }])).length === 0, 'gate: promotion after parked admission ok');
  ok(has(validateLifecycle(build([{ rowRef: rr('ROW-A'), decision: { kind: 'admission', disposition: 'separate-committed-outcome' } }, { rowRef: rr('ROW-A'), decision: { kind: 'born-promotion', promotedTo: 'committed-outcome' } }])), 'PROMOTION_BAD_STATE'), 'gate: promotion after committed admission errors');

  // canonical v1 freeze hardening (req 4)
  const collide = {}; collide['é'] = 1; collide['é'] = 2; // composed vs decomposed é
  throws(() => canonicalize(collide), /collision/, 'canonical: NFC key collision rejected');
  throws(() => canonicalize({ a: [1, undefined, 2] }), /undefined element/, 'canonical: undefined array element rejected');

  // chain hardening (req 3): genesis anchor, digest format, unique eventId, recordedAt, unknown fields
  const g = build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }]); g[0].previousEventDigest = 'a'.repeat(64); g[0].eventDigest = computeEventDigest(g[0]);
  ok(has(validateChain(g), 'GENESIS_ANCHOR'), 'gate: genesis non-zero anchor rejected');
  const df = build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }]); df[0].eventDigest = df[0].eventDigest.toUpperCase();
  ok(has(gate(df).errors, 'DIGEST_FORMAT'), 'gate: non-lowercase-sha256 digest rejected');
  const di = build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-B'), decision: ll('task', 'runtime') }]); di[1].eventId = di[0].eventId; di[1].eventDigest = computeEventDigest(di[1]);
  ok(has(validateChain(di), 'DUPLICATE_EVENT_ID'), 'gate: duplicate eventId rejected');
  const ra = build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }]); ra[0].recordedAt = '2026-08-14 00:00:00'; ra[0].eventDigest = computeEventDigest(ra[0]);
  ok(has(gate(ra).errors, 'RECORDEDAT_FORMAT'), 'gate: non-ISO-UTC recordedAt rejected');
  const uf = build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }]); uf[0].bogusTop = 1; uf[0].eventDigest = computeEventDigest(uf[0]);
  ok(has(gate(uf).errors, 'UNKNOWN_FIELD'), 'gate: unknown top-level field rejected');
  ok(has(gate(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime', { extra: 1 }) }])).errors, 'UNKNOWN_FIELD'), 'gate: unknown decision field rejected');
  ok(has(gate(build([{ rowRef: rr('ROW-A', { bogusRef: 1 }), decision: ll('task', 'runtime') }])).errors, 'UNKNOWN_FIELD'), 'gate: unknown rowRef field rejected');
  // rowRef is FOUR-part (Codex closure-fixup): a MISSING batchManifestDigest → ROWREF_INCOMPLETE
  ok(has(gate(build([{ rowRef: { workId: 'ROW-A', rowDefinitionDigest: 'def-ROW-A', masterSourceDigest: SRC }, decision: ll('task', 'runtime') }])).errors, 'ROWREF_INCOMPLETE'), 'gate: rowRef missing batchManifestDigest (3-part) → ROWREF_INCOMPLETE');

  // correction hardening (req 3)
  ok(has(validateCorrections(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-A'), decision: { kind: 'revoke', targetSeq: 99, reason: 'x' } }])), 'CORRECTION_TARGET_MISSING'), 'gate: correction target-missing (future seq) rejected');
  ok(has(validateCorrections(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-A'), decision: { kind: 'revoke', targetSeq: 2, reason: 'x' } }])), 'CORRECTION_TARGET_ORDER'), 'gate: correction self/future target rejected');
  ok(has(validateCorrections(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-B'), decision: { kind: 'supersede', targetSeq: 1, reason: 'x' } }])), 'CORRECTION_FOREIGN_ROW'), 'gate: correction foreign-row target rejected');
  ok(has(validateCorrections(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-A'), decision: { kind: 'supersede', targetSeq: 1, reason: 'x' } }, { rowRef: rr('ROW-A'), decision: { kind: 'revoke', targetSeq: 2, reason: 'y' } }])), 'CORRECTION_TARGET_IS_CORRECTION'), 'gate: cannot target a correction event');
  ok(has(validateCorrections(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-A'), decision: { kind: 'supersede', targetSeq: 1, reason: 'x' } }, { rowRef: rr('ROW-A'), decision: { kind: 'revoke', targetSeq: 1, reason: 'y' } }])), 'CORRECTION_DOUBLE'), 'gate: double correction of same target rejected');

  // ── the 3 Codex false-pass fixtures must now FAIL/HOLD ──
  // fixture-1: fabricated batch — invalid date + bad genesis + duplicate eventId
  const fx1 = build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-B'), decision: ll('task', 'runtime') }]);
  fx1[0].previousEventDigest = 'b'.repeat(64); fx1[0].recordedAt = 'not-a-date'; fx1[1].eventId = fx1[0].eventId;
  fx1[0].eventDigest = computeEventDigest(fx1[0]); fx1[1].eventDigest = computeEventDigest(fx1[1]);
  const r1 = gate(fx1);
  ok(!r1.ok && has(r1.errors, 'GENESIS_ANCHOR') && has(r1.errors, 'RECORDEDAT_FORMAT') && has(r1.errors, 'DUPLICATE_EVENT_ID'), 'fixture-1: fabricated/invalid batch FAILS (genesis+date+dupeId)');
  // fixture-2: duplicate-superseded-disposed → promotion
  ok(has(validateLifecycle(build([{ rowRef: rr('ROW-A'), decision: { kind: 'admission', disposition: 'duplicate-superseded-disposed' } }, { rowRef: rr('ROW-A'), decision: { kind: 'born-promotion', promotedTo: 'committed-outcome' } }])), 'PROMOTION_BAD_STATE'), 'fixture-2: duplicate-superseded-disposed CANNOT be promoted');
  // fixture-3: revoke targetSeq in the future
  ok(has(validateCorrections(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-A'), decision: { kind: 'revoke', targetSeq: 5, reason: 'x' } }])), 'CORRECTION_TARGET_MISSING'), 'fixture-3: revoke targetSeq=future FAILS');

  // append-only + merge-base
  const one = jsonl(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }]));
  const two = jsonl(build([{ rowRef: rr('ROW-A'), decision: ll('task', 'runtime') }, { rowRef: rr('ROW-B'), decision: ll('task', 'runtime') }]));
  ok(validateAppendOnly(two, one).length === 0, 'gate: pure append passes');
  ok(has(validateAppendOnly('', one), 'APPEND_ONLY'), 'gate: removed line rejected');
  ok(has(validateAppendOnly(jsonl(build([{ rowRef: rr('ROW-B'), decision: ll('outcome', 'contract') }])), one), 'APPEND_ONLY'), 'gate: changed line rejected');
  const okGit = (a) => (a[0] === 'rev-parse' ? 'abc\n' : a[0] === 'merge-base' ? 'base\n' : one);
  ok(resolveBaseline({ ledgerRel: 'x', gitRunner: okGit }).baselineText === one, 'gate: baseline resolves when git ok');
  ok(resolveBaseline({ ledgerRel: 'x', gitRunner: (a) => { if (a[0] === 'rev-parse') throw new Error('no'); return ''; } }).hold.code === 'MERGE_BASE_UNRESOLVED', 'gate: unfetchable origin/main → HOLD');
  ok(resolveBaseline({ ledgerRel: 'x', gitRunner: (a) => { if (a[0] === 'rev-parse') return 'abc\n'; if (a[0] === 'merge-base') throw new Error('no'); return ''; } }).hold.code === 'MERGE_BASE_UNRESOLVED', 'gate: no merge-base → HOLD');
  ok(resolveBaseline({ ledgerRel: 'x', gitRunner: (a) => { if (a[0] === 'show') throw new Error('absent'); return a[0] === 'rev-parse' ? 'abc\n' : 'base\n'; } }).baselineText === '', 'gate: absent-at-base → empty baseline');

  // ── authority verification (req-1): repo-verifiable receipt binding, 3 outcomes ──
  const buildBatch = (parts, claimRef) => {
    let ev = parts.map((pp, i) => ({ schemaVersion: 1, seq: i + 1, eventId: `a${i + 1}`, recordedAt: '2026-08-14T00:00:00Z', authorityProof: { ownerReceipt: claimRef }, rowRef: { workId: pp.workId, rowDefinitionDigest: `def-${pp.workId}`, masterSourceDigest: SRC, batchManifestDigest: 'PENDING' }, decision: pp.decision }));
    const md = computeBatchManifestDigest(ev);
    let prev = GENESIS;
    ev = ev.map((e) => { const ne = { ...e, rowRef: { ...e.rowRef, batchManifestDigest: md }, previousEventDigest: prev }; ne.eventDigest = computeEventDigest(ne); prev = ne.eventDigest; return ne; });
    return { events: ev, md };
  };
  {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
    const attackerKp = generateKeyPairSync('ed25519');
    const attackerPub = attackerKp.publicKey.export({ type: 'spki', format: 'pem' });
    const newKp = generateKeyPairSync('ed25519');
    const newPub = newKp.publicKey.export({ type: 'spki', format: 'pem' });
    const keyId = 'anchor-1', tenantId = 'tenant-x', projectId = 'proj-y', regDig = 'REG-INTEGRITY', propDig = 'PROP-DIGEST';
    const anchors = new Map([[keyId, { publicKeyPem, tenantId, projectId }]]);
    const win = { authenticatedAt: '2026-08-14T00:00:00Z', decidedAt: '2026-08-14T00:05:00Z', authExpiresAt: '2026-08-14T00:10:00Z' };
    // immutable per-batch snapshot bundle fixture (req-2): the gate recomputes the signed
    // MASTER/registry/proposal digests from THESE archived bytes, never current MASTER.
    const snapFor = () => ({ masterPresent: true, masterMalformed: false, integrityVerified: true, sourceDigestValue: SRC, registryIntegrityValue: regDig, proposalPresent: true, proposalDigest: propDig });
    const mkBatch = (parts, requestId, claimRef) => {
      const { events, md } = buildBatch(parts, claimRef);
      const subject = { kind: 'closure-disposition-batch', tenantId, projectId, masterSnapshotDigest: SRC, registryIntegrityDigest: regDig, proposalDigest: propDig, unsignedManifestDigest: md, eventCount: events.length, seqIntervalStart: events[0].seq, seqIntervalEnd: events[events.length - 1].seq };
      const sign = (subj, over = {}) => {
        const base = { schemaVersion: 1, requestId, claimRef, decision: 'allow', subject: subj, ...win, ...over };
        const b = { requestId: base.requestId, claimRef: base.claimRef, decision: base.decision, tenantId: subj.tenantId, projectId: subj.projectId, masterSnapshotDigest: subj.masterSnapshotDigest, registryIntegrityDigest: subj.registryIntegrityDigest, proposalDigest: subj.proposalDigest, unsignedManifestDigest: subj.unsignedManifestDigest, eventCount: subj.eventCount, seqIntervalStart: subj.seqIntervalStart, seqIntervalEnd: subj.seqIntervalEnd, authenticatedAt: base.authenticatedAt, decidedAt: base.decidedAt, authExpiresAt: base.authExpiresAt };
        return { ...base, attestation: { keyId, signature: edSign(null, Buffer.from(canonicalize(b), 'utf8'), privateKey).toString('base64') } };
      };
      return { events, md, subject, sign };
    };
    const A = mkBatch([{ workId: 'ROW-A', decision: ll('task', 'runtime') }, { workId: 'ROW-B', decision: ll('outcome', 'contract') }], 'aprcdb-1', 'approval:aprcdb-1');
    const M = (rc) => new Map([[A.md, { masterSnapshotDigest: SRC, receipt: rc, requestId: 'aprcdb-1' }]]);
    const snaps = (over = {}) => new Map([[A.md, { ...snapFor(), ...over }]]);
    // (c) valid signed decision within window + matching snapshot bundle → verified-binding PASS
    ok(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps()).length === 0, 'authority(c): valid ed25519 attestation within window + matching immutable bundle → verified-binding (clock-independent PASS)');
    // (a) self-authored authenticationEvidence string → FAIL/HOLD, never PASS
    ok(validateAuthority(A.events, M({ schemaVersion: 1, requestId: 'aprcdb-1', claimRef: 'approval:aprcdb-1', decision: 'allow', subject: A.subject, ...win, authenticationEvidence: 'validated-at-write-time' }), anchors, snaps()).some((x) => ['RECEIPT_REJECTED_FIELD', 'AUTHORITY_UNVERIFIABLE'].includes(x.code)), 'authority(a): self-authored authenticationEvidence string → FAIL/HOLD (never PASS)');
    // no committed trust anchor → typed HOLD
    ok(has(validateAuthority(A.events, M(A.sign(A.subject)), new Map(), snaps()), 'AUTHORITY_UNVERIFIABLE'), 'authority: no committed trust anchor → AUTHORITY_UNVERIFIABLE HOLD');
    // (b) tamper a signed field after signing → signature no longer verifies
    ok(has(validateAuthority(A.events, M({ ...A.sign(A.subject), subject: { ...A.subject, tenantId: 'evil' } }), anchors, snaps()), 'AUTHORITY_SIGNATURE_INVALID'), 'authority(b): tampered signed field → signature invalid → FAIL');
    // (b) validly-signed but a bound field ≠ the INDEPENDENT bundle source → FAIL (forger controls receipt, not the archived bytes)
    ok(has(validateAuthority(A.events, M(A.sign({ ...A.subject, registryIntegrityDigest: 'stale' })), anchors, snaps()), 'AUTHORITY_REGISTRY_MISMATCH'), 'authority(b): receipt registryIntegrityDigest ≠ archived bundle → independent FAIL');
    ok(has(validateAuthority(A.events, M(A.sign({ ...A.subject, proposalDigest: 'stale' })), anchors, snaps()), 'AUTHORITY_PROPOSAL_MISMATCH'), 'authority(b): receipt proposalDigest ≠ archived bundle → independent FAIL');
    ok(has(validateAuthority(A.events, M(A.sign({ ...A.subject, masterSnapshotDigest: 'stale' })), anchors, snaps()), 'AUTHORITY_SNAPSHOT_MISMATCH'), 'authority(b): receipt masterSnapshotDigest ≠ archived bundle → independent FAIL');
    ok(has(validateAuthority(A.events, M(A.sign({ ...A.subject, tenantId: 'other' })), new Map([[keyId, { publicKeyPem, tenantId: 'tenant-x', projectId }]]), snaps()), 'AUTHORITY_TENANT_MISMATCH'), 'authority(b): tenantId ≠ trust-anchor tenant → FAIL');
    // (d) window / deny / claim / replay / dup
    ok(has(validateAuthority(A.events, M(A.sign(A.subject, { decidedAt: '2026-08-14T00:20:00Z' })), anchors, snaps()), 'AUTHORITY_WINDOW'), 'authority(d): decidedAt outside [authenticatedAt,authExpiresAt] → AUTHORITY_WINDOW');
    ok(has(validateAuthority(A.events, M(A.sign(A.subject, { decision: 'deny' })), anchors, snaps()), 'AUTHORITY_NOT_ALLOWED'), 'authority(d): deny → error');
    ok(has(validateAuthority(A.events.map((e) => ({ ...e, authorityProof: { ownerReceipt: 'approval:other' } })), M(A.sign(A.subject)), anchors, snaps()), 'AUTHORITY_CLAIM_MISMATCH'), 'authority: event ownerReceipt ≠ claimRef → error');
    const B = mkBatch([{ workId: 'ROW-C', decision: ll('task', 'runtime') }], 'aprcdb-2', 'approval:aprcdb-1');
    const replayM = new Map([[A.md, { masterSnapshotDigest: SRC, receipt: A.sign(A.subject), requestId: 'aprcdb-1' }], [B.md, { masterSnapshotDigest: SRC, receipt: B.sign(B.subject), requestId: 'aprcdb-2' }]]);
    const replaySnaps = new Map([[A.md, snapFor()], [B.md, snapFor()]]);
    ok(has(validateAuthority([...A.events, ...B.events], replayM, anchors, replaySnaps), 'AUTHORITY_CLAIM_REPLAY'), 'authority(d): claimRef reused across batches → AUTHORITY_CLAIM_REPLAY');
    // (d) surfaced receipt-loading problems (dup manifest / filename) fail closed
    ok(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps(), [err('DUPLICATE_MANIFEST_RECEIPT', 'x')]).some((x) => x.code === 'DUPLICATE_MANIFEST_RECEIPT'), 'authority(d): duplicate-manifest receipt problem surfaced fail-closed');

    // ── req-2 HISTORICAL BINDING: immutable per-batch snapshot bundle (not current MASTER) ──
    ok(has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, new Map()), 'BATCH_SNAPSHOT_MISSING'), 'req-2: no immutable snapshot bundle for the batch → BATCH_SNAPSHOT_MISSING HOLD');
    ok(has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps({ proposalPresent: false, proposalDigest: null })), 'BATCH_SNAPSHOT_PROPOSAL_ABSENT'), 'req-2: proposal bytes not archived before delete-on-consume → distinct BATCH_SNAPSHOT_PROPOSAL_ABSENT HOLD');
    ok(has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps({ masterPresent: false })), 'BATCH_SNAPSHOT_MASTER_ABSENT'), 'req-2: master snapshot absent from the bundle → BATCH_SNAPSHOT_MASTER_ABSENT HOLD');
    ok(has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps({ sourceDigestValue: 'TAMPERED' })), 'AUTHORITY_SNAPSHOT_MISMATCH'), 'req-2: tampered archived master bytes → AUTHORITY_SNAPSHOT_MISMATCH');
    ok(has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps({ registryIntegrityValue: 'TAMPERED' })), 'AUTHORITY_REGISTRY_MISMATCH'), 'req-2: tampered archived registry value → AUTHORITY_REGISTRY_MISMATCH');
    ok(has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps({ proposalDigest: 'TAMPERED' })), 'AUTHORITY_PROPOSAL_MISMATCH'), 'req-2: tampered archived proposal bytes → AUTHORITY_PROPOSAL_MISMATCH');
    // history-independence: the batch validates against ITS bundle with NO current-MASTER dependency (no ctx exists) → PASS
    ok(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps()).length === 0, 'req-2: historical batch validates against its immutable bundle only (no current-MASTER dependency) → PASS');

    // ── req-2 (a) ARCHIVED-PAYLOAD INTEGRITY: recompute registryIntegrity from stored bytes ──
    ok(has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps({ integrityVerified: false })), 'AUTHORITY_SNAPSHOT_INTEGRITY_MISMATCH'), 'req-2 (a) mock: integrityVerified≠true → AUTHORITY_SNAPSHOT_INTEGRITY_MISMATCH (FAIL, fail-closed on absent too)');
    {
      // REAL files through loadBatchSnapshots (the ONLY producer of integrityVerified:true)
      const mkMaster = (state) => { const m = { schemaVersion: 1, sourceDigest: { algorithm: 'sha256(normalized-lf-utf8)', value: 'a'.repeat(64) }, identityRegistry: [{ id: 'ROW-A' }], workItems: [{ id: 'ROW-A', state }] }; m.registryIntegrity = { algorithm: 'sha256(canonical-json-utf8)', value: registryIntegrityDigest(m) }; return m; };
      const validMaster = mkMaster('OPEN');
      const root = mkdtempSync(join(tmpdir(), 'closure-batches-'));
      try {
        mkdirSync(join(root, A.md), { recursive: true });
        writeFileSync(join(root, A.md, 'master-snapshot.json'), JSON.stringify(validMaster));
        writeFileSync(join(root, A.md, 'proposal.md'), 'proposal-bytes');
        const okSnap = loadBatchSnapshots(root).get(A.md);
        ok(okSnap && okSnap.masterPresent && !okSnap.masterMalformed && okSnap.integrityVerified === true && okSnap.sourceDigestValue === 'a'.repeat(64) && okSnap.registryIntegrityValue === validMaster.registryIntegrity.value, 'req-2 (f) real-file: valid archived master snapshot → integrityVerified (canonical-payload)');
        // tamper a workItems VALUE (not a reorder — canonicalJsonValue sorts keys), keep the embedded registryIntegrity.value
        const tampered = JSON.parse(JSON.stringify(validMaster)); tampered.workItems[0].state = 'DONE';
        writeFileSync(join(root, A.md, 'master-snapshot.json'), JSON.stringify(tampered));
        const tSnaps = loadBatchSnapshots(root);
        ok(tSnaps.get(A.md)?.integrityVerified === false, 'req-2 (a) real-file: tampered workItems value (embedded digest unchanged) → integrityVerified=false');
        ok(has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, tSnaps), 'AUTHORITY_SNAPSHOT_INTEGRITY_MISMATCH'), 'req-2 (a) end-to-end: tampered archived payload via loadBatchSnapshots → AUTHORITY_SNAPSHOT_INTEGRITY_MISMATCH FAIL');
        // strict archived shape: wrong registryIntegrity.algorithm → masterMalformed = cannot-verify HOLD (never a silent integrity PASS)
        const badAlg = JSON.parse(JSON.stringify(validMaster)); badAlg.registryIntegrity.algorithm = 'sha1';
        writeFileSync(join(root, A.md, 'master-snapshot.json'), JSON.stringify(badAlg));
        ok(loadBatchSnapshots(root).get(A.md)?.masterMalformed === true, 'req-2: wrong archived registryIntegrity.algorithm → masterMalformed (cannot-verify HOLD, not an integrity FAIL)');
      } finally { try { rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } }
    }

    // ── req-1 ROOT OF TRUST: reviewed-parent trust anchors (resolveTrustAnchors) ──
    const parentDoc = JSON.stringify({ schemaVersion: 1, anchors: [{ keyId, publicKeyPem, tenantId, projectId }] });
    const mkGit = (opts = {}) => (args) => {
      const a = args.join(' ');
      const o = { inWorkTree: 'true', head: 'HEADSHA', shallow: 'false', originMain: 'ORIGSHA', base: 'BASESHA', parentDoc: undefined, readError: false, ...opts };
      const ret = (v) => { if (v === null) throw new Error('git-fail'); return v; };
      if (a === 'rev-parse --is-inside-work-tree') return ret(o.inWorkTree);
      if (a === 'rev-parse --verify HEAD') return ret(o.head);
      if (a === 'rev-parse --is-shallow-repository') return ret(o.shallow);
      if (a === 'rev-parse --verify --quiet origin/main') return ret(o.originMain);
      if (a === 'merge-base HEAD origin/main') return ret(o.base);
      if (a === `show ${o.base}:${TRUST_ANCHORS_REL}`) { if (o.parentDoc === undefined) throw new Error('absent'); return o.parentDoc; }
      if (a === `cat-file -e ${o.base}:${TRUST_ANCHORS_REL}`) { if (o.readError) return ''; throw new Error('absent'); }
      throw new Error('unexpected git: ' + a);
    };
    const rtProblem = (opts, wt, code) => resolveTrustAnchors({ gitRunner: mkGit(opts), workingTreeText: wt }).problems.some((x) => x.code === code);
    // (positive) reviewed-parent key present + WT identical → resolves to the same trusted anchor, no problems
    const rt0 = resolveTrustAnchors({ gitRunner: mkGit({ parentDoc }), workingTreeText: parentDoc });
    ok(rt0.problems.length === 0 && rt0.anchors.get(keyId)?.publicKeyPem === publicKeyPem, 'root-of-trust: reviewed-parent key present, WT identical → trusted (no problems)');
    // (integration) reviewed-parent-RESOLVED anchors validate a real batch receipt → PASS
    ok(validateAuthority(A.events, M(A.sign(A.subject)), rt0.anchors, snaps()).length === 0, 'root-of-trust: reviewed-parent-resolved anchors + valid batch receipt → verified-binding PASS');
    // (forged) same-branch key added ONLY in the working tree, no rotation → FAIL, not trusted
    const forgedWt = JSON.stringify({ schemaVersion: 1, anchors: [{ keyId, publicKeyPem, tenantId, projectId }, { keyId: 'attacker', publicKeyPem: attackerPub, tenantId, projectId }] });
    const rtForged = resolveTrustAnchors({ gitRunner: mkGit({ parentDoc }), workingTreeText: forgedWt });
    ok(rtForged.problems.some((x) => x.code === 'TRUST_ANCHOR_UNAUTHORIZED_ROTATION') && !rtForged.anchors.has('attacker'), 'root-of-trust: same-branch forged key (no rotation) → TRUST_ANCHOR_UNAUTHORIZED_ROTATION, not trusted');
    // (valid rotation) new key authorized by a rotation receipt ed25519-signed by the parent key → trusted
    const rotBinding = { newKeyId: 'anchor-2', newPublicKeyPem: newPub, tenantId, projectId, signedByKeyId: keyId };
    const rotSig = edSign(null, Buffer.from(canonicalize(rotBinding), 'utf8'), privateKey).toString('base64');
    const rotWt = JSON.stringify({ schemaVersion: 1, anchors: [{ keyId, publicKeyPem, tenantId, projectId }, { keyId: 'anchor-2', publicKeyPem: newPub, tenantId, projectId }], rotations: [{ ...rotBinding, signature: rotSig }] });
    const rtRot = resolveTrustAnchors({ gitRunner: mkGit({ parentDoc }), workingTreeText: rotWt });
    ok(rtRot.problems.length === 0 && rtRot.anchors.get('anchor-2')?.publicKeyPem === newPub, 'root-of-trust: parent-signed rotation → new key trusted');
    // (unauthorized rotation) rotation signed by a NON-parent key → FAIL
    const badRotBinding = { newKeyId: 'anchor-3', newPublicKeyPem: attackerPub, tenantId, projectId, signedByKeyId: 'attacker' };
    const badRotSig = edSign(null, Buffer.from(canonicalize(badRotBinding), 'utf8'), attackerKp.privateKey).toString('base64');
    const badRotWt = JSON.stringify({ schemaVersion: 1, anchors: [{ keyId, publicKeyPem, tenantId, projectId }, { keyId: 'anchor-3', publicKeyPem: attackerPub, tenantId, projectId }], rotations: [{ ...badRotBinding, signature: badRotSig }] });
    ok(rtProblem({ parentDoc }, badRotWt, 'TRUST_ANCHOR_UNAUTHORIZED_ROTATION'), 'root-of-trust: rotation signed by a non-parent key → FAIL');
    // (unsigned/invalid rotation) garbage signature → FAIL
    const unsignedWt = JSON.stringify({ schemaVersion: 1, anchors: [{ keyId, publicKeyPem, tenantId, projectId }, { keyId: 'anchor-2', publicKeyPem: newPub, tenantId, projectId }], rotations: [{ newKeyId: 'anchor-2', newPublicKeyPem: newPub, tenantId, projectId, signedByKeyId: keyId, signature: 'AAAA' }] });
    ok(rtProblem({ parentDoc }, unsignedWt, 'TRUST_ANCHOR_UNAUTHORIZED_ROTATION'), 'root-of-trust: unsigned/invalid-signature rotation → FAIL');
    // (genesis) no trust-anchors file at the reviewed parent → BOOTSTRAP_UNRESOLVED HOLD (no in-repo self-sign)
    ok(rtProblem({ parentDoc: undefined }, parentDoc, 'TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED'), 'root-of-trust: genesis (no parent file) → TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED HOLD');
    // (unresolvable git — NO WARN, NO working-tree fallback) shallow / origin-main / not-in-worktree → HOLD
    ok(rtProblem({ shallow: 'true' }, parentDoc, 'TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED'), 'root-of-trust: shallow clone → HOLD (no WARN fallback)');
    ok(rtProblem({ originMain: null }, parentDoc, 'TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED'), 'root-of-trust: origin/main unfetchable → HOLD');
    ok(rtProblem({ inWorkTree: 'false' }, parentDoc, 'TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED'), 'root-of-trust: not inside a git work tree → HOLD (no working-tree fallback)');
    // (read error — OQ-XVE-05) file provably exists at parent but unreadable → HOLD (never 'absent'/bootstrap-bypass)
    ok(rtProblem({ parentDoc: undefined, readError: true }, parentDoc, 'TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED'), 'root-of-trust: parent file exists but unreadable → HOLD (read-error ≠ absent)');
    // (strict shape) duplicate keyId / bad PEM / unknown field / wrong schemaVersion → fail-closed
    ok(parseTrustAnchorsDoc(JSON.stringify({ schemaVersion: 1, anchors: [{ keyId, publicKeyPem, tenantId, projectId }, { keyId, publicKeyPem, tenantId, projectId }] }), 'x').problems.some((x) => x.code === 'TRUST_ANCHOR_DUPLICATE_KEYID'), 'root-of-trust: duplicate keyId rejected');
    ok(parseTrustAnchorsDoc(JSON.stringify({ schemaVersion: 1, anchors: [{ keyId: 'k', publicKeyPem: 'not-a-pem', tenantId, projectId }] }), 'x').problems.some((x) => x.code === 'TRUST_ANCHOR_BAD_PEM'), 'root-of-trust: invalid PEM rejected');
    ok(parseTrustAnchorsDoc(JSON.stringify({ schemaVersion: 1, anchors: [], bogus: 1 }), 'x').problems.some((x) => x.code === 'TRUST_ANCHOR_UNKNOWN_FIELD'), 'root-of-trust: unknown top-level field rejected');
    ok(parseTrustAnchorsDoc(JSON.stringify({ schemaVersion: 2, anchors: [] }), 'x').problems.some((x) => x.code === 'TRUST_ANCHOR_SCHEMA'), 'root-of-trust: wrong schemaVersion rejected');

    // ── req-3 STRICT NESTED SHAPE (receipt / subject / attestation / anchor / rotation) ──
    const av = (rc, over) => validateAuthority(A.events, M(rc), over ?? anchors, snaps());
    // (b) missing tenantId/projectId — never PASS even when the anchor also lacks it
    ok(has(av(A.sign({ ...A.subject, tenantId: undefined }), new Map([[keyId, { publicKeyPem, projectId }]])), 'SUBJECT_INCOMPLETE_FIELD'), 'req-3 (b): subject.tenantId missing (anchor tenant also absent) → SUBJECT_INCOMPLETE_FIELD, never PASS');
    ok(has(av(A.sign({ ...A.subject, projectId: undefined })), 'SUBJECT_INCOMPLETE_FIELD'), 'req-3 (b): subject.projectId missing → SUBJECT_INCOMPLETE_FIELD');
    // (c) subject / attestation unknown or missing field
    ok(has(av(A.sign({ ...A.subject, bogus: 1 })), 'SUBJECT_UNKNOWN_FIELD'), 'req-3 (c): subject unknown field → SUBJECT_UNKNOWN_FIELD');
    ok(has(av(A.sign({ ...A.subject, kind: 'nope' })), 'SUBJECT_KIND'), 'req-3 (c): subject.kind ≠ closure-disposition-batch → SUBJECT_KIND');
    ok(has(av(A.sign({ ...A.subject, eventCount: 'two' })), 'SUBJECT_INCOMPLETE_FIELD'), 'req-3 (c): subject.eventCount non-integer → SUBJECT_INCOMPLETE_FIELD');
    ok(has(av({ ...A.sign(A.subject), attestation: { keyId, signature: 'x', extra: 1 } }), 'ATTESTATION_UNKNOWN_FIELD'), 'req-3 (c): attestation unknown field → ATTESTATION_UNKNOWN_FIELD');
    ok(has(av({ ...A.sign(A.subject), attestation: { keyId } }), 'ATTESTATION_SHAPE'), 'req-3 (c): attestation missing signature → ATTESTATION_SHAPE');
    ok(has(av({ ...A.sign(A.subject), decidedAt: undefined }), 'RECEIPT_INCOMPLETE_FIELD'), 'req-3 (c): receipt missing required decidedAt → RECEIPT_INCOMPLETE_FIELD');
    // (d) wrong schemaVersion
    ok(has(av({ ...A.sign(A.subject), schemaVersion: 2 }), 'RECEIPT_SCHEMA'), 'req-3 (d): receipt schemaVersion ≠ 1 → RECEIPT_SCHEMA');
    // anchor & rotation all-four-required
    ok(parseTrustAnchorsDoc(JSON.stringify({ schemaVersion: 1, anchors: [{ keyId: 'k', publicKeyPem, projectId }] }), 'x').problems.some((x) => x.code === 'TRUST_ANCHOR_MALFORMED'), 'req-3: anchor missing tenantId → TRUST_ANCHOR_MALFORMED');
    ok(rtProblem({ parentDoc }, JSON.stringify({ schemaVersion: 1, anchors: [{ keyId, publicKeyPem, tenantId, projectId }, { keyId: 'anchor-2', publicKeyPem: newPub, tenantId, projectId }], rotations: [{ newKeyId: 'anchor-2', newPublicKeyPem: newPub, signedByKeyId: keyId, signature: 'AAAA' }] }), 'TRUST_ANCHOR_UNAUTHORIZED_ROTATION'), 'req-3: rotation missing tenantId/projectId → TRUST_ANCHOR_UNAUTHORIZED_ROTATION');

    // ── 4.4a APPROVAL IDENTITY: requestId parity (approvalIdSchema mirror) + claimRef pin ──
    // (the FULL cross-corpus parity to approvalIdSchema is pinned in
    // tests/governance/approval-identity-parity.test.ts; here: the clear mandate cases + in-gate)
    for (const id of ['aprcdb-1', 'a', '0', 'x'.repeat(128), 'a.b_c-1']) ok(isCanonicalApprovalId(id), `approval-id: canonical '${id}' accepted`);
    for (const id of ['', 'Abc', 'a/b', 'x.', 'con', 'com1', 'a'.repeat(129)]) ok(!isCanonicalApprovalId(id), `approval-id: non-canonical '${JSON.stringify(id)}' rejected`);
    ok(claimRefFor('aprcdb-1') === 'approval:aprcdb-1', 'approval-id: claimRefFor(id) = approval:<id>');
    // in-gate (a): arbitrary signed claimRef → FAIL; non-canonical requestId → FAIL; canonical + exact approval:<id> → no identity error
    ok(has(av({ ...A.sign(A.subject), claimRef: 'arbitrary-not-approval' }), 'AUTHORITY_CLAIMREF_FORMAT'), 'approval-id (a): arbitrary signed claimRef → AUTHORITY_CLAIMREF_FORMAT');
    ok(has(av({ ...A.sign(A.subject), requestId: 'BadReq' }), 'AUTHORITY_REQUESTID_FORMAT'), 'approval-id: uppercase/non-canonical requestId → AUTHORITY_REQUESTID_FORMAT');
    ok(!has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps()), 'AUTHORITY_REQUESTID_FORMAT') && !has(validateAuthority(A.events, M(A.sign(A.subject)), anchors, snaps()), 'AUTHORITY_CLAIMREF_FORMAT'), 'approval-id: canonical requestId + exact approval:<id> → no identity error (PASS)');

    // loadBatchManifests dup + filename detection (tmpdir fixture, hermetic — try/finally cleanup)
    {
      const d = mkdtempSync(join(tmpdir(), 'closure-receipts-'));
      try {
        writeFileSync(join(d, 'req-a.json'), JSON.stringify({ requestId: 'req-a', subject: { unsignedManifestDigest: 'md1', masterSnapshotDigest: SRC } }));
        writeFileSync(join(d, 'req-b.json'), JSON.stringify({ requestId: 'req-b', subject: { unsignedManifestDigest: 'md1', masterSnapshotDigest: SRC } })); // same md → dup
        writeFileSync(join(d, 'req-c.json'), JSON.stringify({ requestId: 'WRONG', subject: { unsignedManifestDigest: 'md2', masterSnapshotDigest: SRC } })); // filename ≠ requestId
        const { problems } = loadBatchManifests(d);
        ok(problems.some((x) => x.code === 'DUPLICATE_MANIFEST_RECEIPT'), 'loadBatchManifests: duplicate-manifest detected');
        ok(problems.some((x) => x.code === 'RECEIPT_FILENAME_MISMATCH'), 'loadBatchManifests: filename↔requestId mismatch detected');
      } finally { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
    }
  }

  // schema SSOT internal consistency (TS union in closure-ledger-types.ts mirrors these)
  ok(SCHEMA.levels.values.length > 0 && SCHEMA.lanes.values.length > 0, 'schema: enums non-empty');
  // gate ↔ schema SSOT: the gate's ALLOWED_ROWREF/ROWREF_REQUIRED IS schema.rowRef.requiredFields
  // (resolved, not hardcoded). The TS↔schema half is the exact-equality drift-guard in tests/governance.
  ok(JSON.stringify([...ALLOWED_ROWREF]) === JSON.stringify(SCHEMA.rowRef.requiredFields), 'schema: gate ALLOWED_ROWREF == schema.rowRef.requiredFields (4-part SSOT)');
  ok(ROWREF_REQUIRED.length === 4 && ROWREF_REQUIRED.includes('batchManifestDigest'), 'schema: rowRef is the FOUR-part contract (incl. batchManifestDigest)');
  ok(SCHEMA.decisionKinds.values.every((k) => SCHEMA.decisionClasses.map[k]), 'schema: every kind has a decisionClass');
  const admissionVals = new Set(SCHEMA.admissionDispositions.values);
  ok(SCHEMA.decisionClasses.map.admission === 'admission' && SCHEMA.decisionClasses.map['born-promotion'] === 'promotion', 'schema: admission/promotion separate classes');
  ok(SCHEMA.invariants.checkProofImpliesProofLane === true, 'schema: check-proof⇒proof invariant present');
  ok([...admissionVals].length === 6, 'schema: 6 admission dispositions');
  // NB: the TS↔schema EXACT-equality drift-guard is a real test in
  // tests/governance (parses the as-const arrays and deep-compares) — it is NOT
  // hidden here as a weak text-contains check (Codex req-6).

  if (failures.length) { for (const f of failures) console.log(`[closure-gate:self-check] FAIL ${f}`); console.log(`[closure-gate:self-check] ${n - failures.length}/${n} passed, ${failures.length} FAILED`); return 1; }
  console.log(`[closure-gate:self-check] OK — ${n}/${n} assertions passed`);
  return 0;
}

// ── CLI ──
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) return runSelfCheck();
  const positional = args.find((a) => !a.startsWith('-'));
  const ledgerPath = positional ? (positional.startsWith('/') ? positional : join(ROOT, positional)) : join(ROOT, LEDGER_REL);
  const ledgerText = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : '';
  if (ledgerText.trim() === '') { console.log('[closure-gate] ledger empty/absent — nothing to validate (OK)'); return 0; }
  let registry = null, masterSourceDigest = null;
  try { const m = JSON.parse(readFileSync(MASTER_JSON, 'utf8')); registry = m.identityRegistry; masterSourceDigest = m.sourceDigest?.value; } catch { /* registry unavailable → HOLD inside gate */ }
  const { manifests, problems: receiptProblems } = loadBatchManifests(join(ROOT, RECEIPTS_REL));
  const batchSnapshots = loadBatchSnapshots(join(ROOT, BATCHES_REL));
  const gitRunner = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  // Root of trust resolved from the REVIEWED PARENT (never the working tree). No
  // ctx/current-MASTER binding: each batch is bound to its own immutable snapshot.
  const wtTrust = existsSync(join(ROOT, TRUST_ANCHORS_REL)) ? readFileSync(join(ROOT, TRUST_ANCHORS_REL), 'utf8') : '';
  const { anchors: trustAnchors, problems: trustAnchorProblems } = resolveTrustAnchors({ gitRunner, workingTreeText: wtTrust });
  const baseline = resolveBaseline({ ledgerRel: LEDGER_REL, gitRunner });
  const res = runGate({ ledgerText, baseline, registry, masterSourceDigest, batchManifests: manifests, verifyAuthority: true, trustAnchors, batchSnapshots, trustAnchorProblems, receiptProblems });
  for (const h of res.holds) console.log(`[closure-gate] HOLD ${h.code}: ${h.message}`);
  for (const e of res.errors) console.log(`[closure-gate] ERROR ${e.code}: ${e.message}`);
  if (res.ok) { console.log(`[closure-gate] OK — ${res.eventCount} events, chain + identity + lifecycle + append-only verified`); return 0; }
  console.log(`[closure-gate] FAIL — ${res.errors.length} error(s), ${res.holds.length} hold(s)`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
