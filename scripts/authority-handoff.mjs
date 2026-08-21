#!/usr/bin/env node
// ─── authority-handoff.mjs — fallback-rules/authority-handoff.md tooling ─────
//
// Machine-produces the immutable receipt chain the manual handoff contract
// requires (PREPARED → VERIFIED → COMMITTED, plus ABORTED / RECOVERY_COMMITTED),
// so digests are computed — never hand-typed — and the 10-minute handoff target
// survives contact with reality. The CONTRACT lives in the document; this tool
// only enforces its mechanical parts: create-only files, sequence/epoch
// monotony, digest chaining, and identity fields. It grants no authority.
//
// Canonicalization: recursive key-sorted JSON.stringify over the receipt with
// `receiptDigest` removed. For this schema's value domain (strings, integer
// sequence/epoch numbers, arrays, plain objects, null) the output is
// byte-identical to RFC 8785/JCS; if the schema ever grows floats or exotic
// strings, revisit against a full JCS implementation.

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HANDOFFS_DIR = join(ROOT, 'docs', 'execution', 'handoffs');

const fail = (code, message) => {
  console.error(`[authority-handoff] ${code}: ${message}`);
  process.exit(1);
};

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function receiptDigestOf(receipt) {
  const { receiptDigest: _omit, ...rest } = receipt;
  return `sha256:${createHash('sha256').update(canonicalize(rest), 'utf-8').digest('hex')}`;
}

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

function policyDigest() {
  try {
    const out = execSync('node scripts/lint-operating-policy.mjs --digest', {
      cwd: ROOT, encoding: 'utf-8',
    });
    const m = out.match(/digest sha256=([0-9a-f]{64})/);
    if (m) return `sha256:${m[1]}`;
  } catch { /* fall through — the contract's typed HOLD below */ }
  return null; // caller turns this into POLICY_DIGEST_UNAVAILABLE/HOLD
}

function listReceipts(handoffId) {
  const dir = join(HANDOFFS_DIR, handoffId);
  if (!existsSync(dir)) return { dir, files: [] };
  const files = readdirSync(dir).filter((f) => /^\d{4}-[a-z-]+\.json$/.test(f)).sort();
  return { dir, files };
}

function readLast(handoffId) {
  const { dir, files } = listReceipts(handoffId);
  if (files.length === 0) return { dir, files, last: null };
  const last = JSON.parse(readFileSync(join(dir, files[files.length - 1]), 'utf-8'));
  const recomputed = receiptDigestOf(last);
  if (last.receiptDigest !== recomputed) {
    fail('RECEIPT_DIGEST_MISMATCH', `${files[files.length - 1]} digest ${last.receiptDigest} != recomputed ${recomputed}`);
  }
  return { dir, files, last };
}

function writeReceipt(dir, sequence, transition, receipt) {
  mkdirSync(dir, { recursive: true });
  const name = `${String(sequence).padStart(4, '0')}-${transition.toLowerCase().replace(/_/g, '-')}.json`;
  const path = join(dir, name);
  if (existsSync(path)) fail('RECEIPT_EXISTS', `${name} already exists — receipts are create-only`);
  writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return path;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return fallback;
}

function requireArg(name) {
  const v = arg(name);
  if (!v) fail('E_ARGS', `--${name} is required`);
  return v;
}

function identityFrom(prefix) {
  return {
    hostId: arg(`${prefix}-host`, 'claude-code-cli'),
    providerId: requireArg(`${prefix}-provider`),
    modelApiId: requireArg(`${prefix}-model`),
    role: arg(`${prefix}-role`, 'supervisor'),
    principalDigest: `sha256:${createHash('sha256').update(arg(`${prefix}-principal`, 'owner-account'), 'utf-8').digest('hex')}`,
    sessionDigest: `sha256:${createHash('sha256').update(arg(`${prefix}-session`, `${Date.now()}`), 'utf-8').digest('hex')}`,
  };
}

function baseSnapshot() {
  return {
    baseSha: git('merge-base HEAD origin/main 2>/dev/null || git rev-parse HEAD'),
    headSha: git('rev-parse HEAD'),
    branch: git('branch --show-current'),
    dirty: git('status --porcelain').split('\n').filter(Boolean).length,
  };
}

const command = process.argv[2];
const now = () => new Date().toISOString();

if (command === 'prepare') {
  const handoffId = arg('handoff', `ah-${now().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`);
  const { last } = readLast(handoffId);
  if (last) fail('EPOCH_CONFLICT', `${handoffId} already has receipts; use a new handoffId`);
  const policy = policyDigest();
  if (!policy) fail('POLICY_DIGEST_UNAVAILABLE', 'lint-operating-policy --digest produced no digest — resolve before preparing');
  const snap = baseSnapshot();
  const scope = {
    goalId: arg('goal', 'n/a'), missionId: arg('mission', 'n/a'),
    flowId: arg('flow', 'n/a'), runId: arg('run', 'n/a'),
    roles: [arg('from-role', 'supervisor')],
    includes: [requireArg('includes')],
    excludes: [arg('excludes', 'owner-only and unadmitted work')],
  };
  const receipt = {
    schemaVersion: 1,
    outcomeId: requireArg('outcome'),
    role: arg('from-role', 'supervisor'),
    baseSha: snap.baseSha, headSha: snap.headSha, branch: snap.branch,
    policyDigest: policy,
    scopeDigest: `sha256:${createHash('sha256').update(canonicalize(scope), 'utf-8').digest('hex')}`,
    filesChanged: [], verification: [], findings: [],
    openActions: requireArg('open-actions').split('|'),
    recommendedNextAction: requireArg('next-action'),
    authorityHandoff: {
      protocolVersion: 1, handoffId, sequence: 1,
      transition: 'PREPARED', transitionActor: 'transferor',
      currentAuthorityEpoch: Number(arg('epoch', '1')),
      proposedAuthorityEpoch: Number(arg('epoch', '1')) + 1,
      previousReceiptDigest: null,
      from: identityFrom('from'), to: identityFrom('to'),
      trigger: { reasonCode: requireArg('reason'), authorityRef: arg('authority-ref', 'owner-live-instruction') },
      authorityScope: scope,
      evidenceSnapshot: {
        observedAt: now(),
        repoStateRef: `git:${snap.headSha}:dirty=${snap.dirty}`,
        runtimeStateRef: arg('runtime-ref', 'see follow-up-works/current-flow.md'),
        approvalStateRef: arg('approval-ref', 'deckent approvals list @ observedAt'),
        verificationStateRef: arg('verification-ref', 'see MASTER + .analysis/xverify'),
        buildStateRef: arg('build-ref', `build:all@${snap.headSha}`),
        ssotStateRef: 'docs/MASTER-PLAN.md + follow-up-works/current-flow.md',
      },
    },
  };
  receipt.receiptDigest = receiptDigestOf(receipt);
  const path = writeReceipt(join(HANDOFFS_DIR, handoffId), 1, 'PREPARED', receipt);
  console.log(JSON.stringify({ handoffId, path, receiptDigest: receipt.receiptDigest }));
} else if (command === 'verify' || command === 'commit' || command === 'abort' || command === 'recovery-commit') {
  const handoffId = requireArg('handoff');
  const { dir, files, last } = readLast(handoffId);
  if (!last) fail('RECEIPT_CHAIN_INCOMPLETE', `${handoffId} has no receipts`);
  const ah = last.authorityHandoff;
  const expectations = {
    verify: { prev: ['PREPARED'], transition: 'VERIFIED', actor: 'transferee' },
    commit: { prev: ['VERIFIED'], transition: 'COMMITTED', actor: 'transferor' },
    abort: { prev: ['PREPARED', 'VERIFIED'], transition: 'ABORTED', actor: 'transferor' },
    'recovery-commit': { prev: ['PREPARED', 'VERIFIED'], transition: 'RECOVERY_COMMITTED', actor: 'transferee' },
  }[command];
  if (!expectations.prev.includes(ah.transition)) {
    fail('EPOCH_CONFLICT', `${command} requires last transition in [${expectations.prev}], found ${ah.transition}`);
  }
  if (command === 'recovery-commit' && !arg('authority-ref')) {
    fail('OWNER_AUTHORITY_REQUIRED', 'recovery-commit requires --authority-ref naming the explicit owner decision');
  }
  const next = structuredClone(last);
  next.authorityHandoff.sequence = ah.sequence + 1;
  next.authorityHandoff.transition = expectations.transition;
  next.authorityHandoff.transitionActor = expectations.actor;
  next.authorityHandoff.previousReceiptDigest = last.receiptDigest;
  next.authorityHandoff.evidenceSnapshot = {
    ...ah.evidenceSnapshot, observedAt: now(),
    repoStateRef: `git:${git('rev-parse HEAD')}:dirty=${git('status --porcelain').split('\n').filter(Boolean).length}`,
  };
  if (command === 'recovery-commit') next.authorityHandoff.trigger = { ...ah.trigger, authorityRef: requireArg('authority-ref') };
  next.receiptDigest = receiptDigestOf(next);
  const path = writeReceipt(dir, next.authorityHandoff.sequence, expectations.transition, next);
  console.log(JSON.stringify({ handoffId, path, transition: expectations.transition, receiptDigest: next.receiptDigest, files: files.length + 1 }));
} else if (command === 'status') {
  const handoffId = requireArg('handoff');
  const { files, last } = readLast(handoffId);
  console.log(JSON.stringify({ handoffId, receipts: files, lastTransition: last?.authorityHandoff?.transition ?? null, epoch: last?.authorityHandoff?.proposedAuthorityEpoch ?? null }));
} else {
  console.error('Usage: authority-handoff.mjs <prepare|verify|commit|abort|recovery-commit|status> [--handoff <id>] ...');
  console.error('prepare requires: --outcome --includes --open-actions a|b|c --next-action --reason --from-provider --from-model --to-provider --to-model');
  process.exit(2);
}
