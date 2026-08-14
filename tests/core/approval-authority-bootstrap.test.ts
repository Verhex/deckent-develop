import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapApprovalAuthority,
} from '../../src/core/approval-authority-bootstrap.js';
import {
  getDefaultConfig,
  validateConfig,
} from '../../src/core/config.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import {
  writeApprovalAuthorityFixtureRevision,
} from '../helpers/approval-authority-fixture.js';

const roots: string[] = [];

function fixture(): { projectRoot: string; hostRoot: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-approval-bootstrap-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const hostRoot = join(base, 'host');
  mkdirSync(projectRoot, { recursive: true });
  writeApprovalAuthorityFixtureRevision({
    dataDir: hostRoot,
    revision: 1,
    previousRevisionHash: null,
    activeKeyId: 'approval-key-0001',
    keys: [{
      keyId: 'approval-key-0001',
      status: 'active',
      createdAt: '2026-07-25T00:00:00.000Z',
      retiredAt: null,
      keyMaterialHex: 'a5'.repeat(32),
    }],
  });
  return { projectRoot, hostRoot };
}

function enabledConfig(): ResolvedConfig {
  return {
    approval: {
      rules: [],
      gate_enabled: false,
      relay_enabled: false,
      question_bridge: false,
      authority: {
        enabled: true,
        tenant_id: 'tenant-a',
        oidc: {
          authority_ref: 'oidc:https://issuer.example:deckent-api',
          tenant_claim: 'tenant_id',
          role_claim: 'role',
          max_auth_age_seconds: 300,
          max_session_seconds: 120,
          required_acr: ['urn:mfa'],
          required_amr: ['pwd', 'mfa'],
        },
      },
    },
    api_oidc: {
      enabled: true,
      issuer: 'https://issuer.example',
      audience: 'deckent-api',
      algorithm: 'HS256',
      key: 'approval-bootstrap-oidc-secret',
    },
  } as unknown as ResolvedConfig;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('bootstrapApprovalAuthority', () => {
  it('stays disabled without an owner opt-in and never opens custody', () => {
    const { projectRoot } = fixture();
    const result = bootstrapApprovalAuthority(
      projectRoot,
      { approval: undefined } as unknown as ResolvedConfig,
      {
        custodyAdapter: {
          adapterId: 'must-not-open',
          open() {
            throw new Error('custody must not be opened');
          },
        },
      },
    );
    expect(result).toEqual({ state: 'disabled' });
  });

  it('returns a typed HOLD when OIDC is not fully configured', () => {
    const { projectRoot } = fixture();
    const config = enabledConfig();
    config.api_oidc = undefined;
    const result = bootstrapApprovalAuthority(projectRoot, config);
    expect(result).toMatchObject({
      state: 'hold',
      reasonCode: 'approval_authority_composition_failed',
      detailCode: 'APPROVAL_AUTHORITY_OIDC_NOT_CONFIGURED',
    });
  });

  it('opens one approval-only runtime and pinned OIDC verifier without provisioning', () => {
    const { projectRoot, hostRoot } = fixture();
    const result = bootstrapApprovalAuthority(
      projectRoot,
      enabledConfig(),
      {
        platform: 'linux',
        env: { DECKENT_HOME: hostRoot },
        now: () => new Date('2026-07-25T00:10:00.000Z'),
      },
    );
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw new Error(result.reasonCode);
    expect(result.runtime.tenantId).toBe('tenant-a');
    expect(result.runtime.custody.snapshot.kind).toBe('approval-decision-keyring');
    expect(result.policy).toMatchObject({
      issuer: 'https://issuer.example',
      audience: 'deckent-api',
      tenantClaim: 'tenant_id',
      requiredAcr: ['urn:mfa'],
      requiredAmr: ['pwd', 'mfa'],
    });
    expect(result.verifier.authorityRef).toBe(
      'oidc:https://issuer.example:deckent-api',
    );
    result.runtime.close();
  });
});

describe('approval authority config validation', () => {
  it('requires an enabled API OIDC verifier with a non-empty audience', () => {
    const config = getDefaultConfig();
    config.api_oidc = {
      enabled: true,
      issuer: 'https://issuer.example',
      audience: ' ',
      algorithm: 'HS256',
      key: 'oidc-secret',
    };
    config.approval = {
      authority: {
        enabled: true,
        tenant_id: 'tenant-a',
        oidc: {
          authority_ref: 'oidc:https://issuer.example:deckent-api',
          tenant_claim: 'tenant_id',
          max_auth_age_seconds: 300,
          max_session_seconds: 120,
        },
      },
    };
    expect(() => validateConfig(config)).toThrow(
      'approval.authority.oidc requires enabled api_oidc with an explicit audience',
    );
  });
});
