#!/usr/bin/env node
/**
 * D4 approval-lifecycle authority ratchet.
 *
 * The gate is deliberately structural: it protects the canonical policy,
 * expiry-aware decision choke-point and shared risk mapping without treating
 * unrelated cache/session TTLs as approval policy.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = Object.freeze([
  ['src/core/approval-lifecycle-policy.ts', [
    'DEFAULT_APPROVAL_LIFECYCLE_POLICY',
    'resolveEffectiveApprovalExpiry',
    'mapLegacyApprovalRisk',
    'resolveApprovalTimeout',
  ]],
  ['src/core/approval-contract.ts', [
    'APPROVAL_CONTRACT_V2_VERSION',
    'policySnapshotDigest',
    'lifecycleProfile',
  ]],
  ['src/core/approval-broker.ts', [
    'decideAt(',
    'APR_EXPIRED',
    '.transition(id, category, input)',
  ]],
  ['src/core/approval-store.ts', [
    'buildApprovalTimeoutSettlement',
    'persistPolicyTransitions',
    "actor: 'system:expiry'",
  ]],
]);

const FORBIDDEN = Object.freeze([
  ['src/orchestra/approval-decision-federation.ts', /MIRROR_DECISION_WINDOW_MS/u,
    'legacy mirror TTL must come from the canonical lifecycle profile'],
  ['src/core/approval-channel-authenticator.ts', /mapLegacyApprovalRiskToRiskTier/u,
    'channel authentication must import the shared legacy-risk mapping'],
  ['src/core/approval-rules-engine.ts', /mapLegacyApprovalRiskToRiskTier/u,
    'rules must import the shared legacy-risk mapping'],
]);

export function checkApprovalLifecycleAuthority(root) {
  const problems = [];
  for (const [relative, markers] of REQUIRED) {
    const path = join(root, relative);
    if (!existsSync(path)) {
      problems.push({ code: 'D4_AUTHORITY_FILE_MISSING', file: relative, detail: 'required authority file is absent' });
      continue;
    }
    const source = readFileSync(path, 'utf8');
    for (const marker of markers) {
      if (!source.includes(marker)) {
        problems.push({ code: 'D4_AUTHORITY_MARKER_MISSING', file: relative, detail: `missing ${marker}` });
      }
    }
  }
  for (const [relative, pattern, detail] of FORBIDDEN) {
    const path = join(root, relative);
    if (!existsSync(path)) continue;
    if (pattern.test(readFileSync(path, 'utf8'))) {
      problems.push({ code: 'D4_LOCAL_AUTHORITY_REINTRODUCED', file: relative, detail });
    }
  }
  return { ok: problems.length === 0, problems };
}

function main(argv) {
  const rootIndex = argv.indexOf('--root');
  const root = resolve(rootIndex >= 0 && argv[rootIndex + 1] ? argv[rootIndex + 1] : process.cwd());
  const result = checkApprovalLifecycleAuthority(root);
  if (result.ok) {
    process.stdout.write('approval lifecycle authority: OK\n');
    return 0;
  }
  for (const problem of result.problems) {
    process.stderr.write(`${problem.code} ${problem.file}: ${problem.detail}\n`);
  }
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
