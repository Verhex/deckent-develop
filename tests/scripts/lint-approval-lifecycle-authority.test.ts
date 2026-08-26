import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkApprovalLifecycleAuthority } from '../../scripts/lint-approval-lifecycle-authority.mjs';

const files: Record<string, string> = {
  'src/core/approval-lifecycle-policy.ts': 'DEFAULT_APPROVAL_LIFECYCLE_POLICY resolveEffectiveApprovalExpiry mapLegacyApprovalRisk resolveApprovalTimeout',
  'src/core/approval-contract.ts': 'APPROVAL_CONTRACT_V2_VERSION policySnapshotDigest lifecycleProfile',
  'src/core/approval-broker.ts': 'decideAt( APR_EXPIRED .transition(id, category, input)',
  'src/core/approval-store.ts': "buildApprovalTimeoutSettlement persistPolicyTransitions actor: 'system:expiry'",
  'src/orchestra/approval-decision-federation.ts': 'canonical profile mirror',
  'src/core/approval-channel-authenticator.ts': 'import { mapLegacyApprovalRisk }',
  'src/core/approval-rules-engine.ts': 'import { mapLegacyApprovalRisk }',
};

describe('lint-approval-lifecycle-authority', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-lint-approval-lifecycle-'));
    for (const [relative, source] of Object.entries(files)) {
      mkdirSync(dirname(join(root, relative)), { recursive: true });
      writeFileSync(join(root, relative), source, 'utf8');
    }
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('passes a single canonical policy and guarded broker/store chain', () => {
    expect(checkApprovalLifecycleAuthority(root)).toEqual({ ok: true, problems: [] });
  });

  it('fails when the central decision choke-point marker disappears', () => {
    writeFileSync(join(root, 'src/core/approval-broker.ts'), 'decideAt( APR_EXPIRED', 'utf8');
    expect(checkApprovalLifecycleAuthority(root)).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: 'D4_AUTHORITY_MARKER_MISSING' })],
    });
  });

  it('fails when a legacy mirror reintroduces its own TTL table', () => {
    writeFileSync(join(root, 'src/orchestra/approval-decision-federation.ts'), 'const MIRROR_DECISION_WINDOW_MS = 1;', 'utf8');
    expect(checkApprovalLifecycleAuthority(root)).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: 'D4_LOCAL_AUTHORITY_REINTRODUCED' })],
    });
  });

  it('fails when a consumer recreates the legacy risk mapping', () => {
    writeFileSync(join(root, 'src/core/approval-channel-authenticator.ts'), 'function mapLegacyApprovalRiskToRiskTier() {}', 'utf8');
    expect(checkApprovalLifecycleAuthority(root).problems[0]).toMatchObject({
      code: 'D4_LOCAL_AUTHORITY_REINTRODUCED',
      file: 'src/core/approval-channel-authenticator.ts',
    });
  });
});
