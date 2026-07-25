import { createHmac } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ApprovalAuthorityKeyringError,
  PosixPrivateFileApprovalDecisionCustodyAdapter,
  defaultApprovalDecisionCustodyAdapter,
} from '../../src/core/approval-authority-keyring.js';
import {
  writeApprovalAuthorityFixtureRevision,
} from '../helpers/approval-authority-fixture.js';

const roots: string[] = [];

function fixture(): { base: string; projectRoot: string; dataDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-approval-keyring-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const dataDir = join(base, 'host-data');
  mkdirSync(projectRoot, { recursive: true });
  return { base, projectRoot, dataDir };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('approval decision key custody', () => {
  it('opens a contiguous approval-only revision chain and verifies exact active and retired keys', () => {
    const { projectRoot, dataDir } = fixture();
    const firstKey = '11'.repeat(32);
    const secondKey = '22'.repeat(32);
    const firstHash = writeApprovalAuthorityFixtureRevision({
      dataDir,
      revision: 1,
      previousRevisionHash: null,
      activeKeyId: 'approval-key-0001',
      keys: [{
        keyId: 'approval-key-0001',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        retiredAt: null,
        keyMaterialHex: firstKey,
      }],
    });
    writeApprovalAuthorityFixtureRevision({
      dataDir,
      revision: 2,
      previousRevisionHash: firstHash,
      activeKeyId: 'approval-key-0002',
      keys: [
        {
          keyId: 'approval-key-0001',
          status: 'retired',
          createdAt: '2026-07-01T00:00:00.000Z',
          retiredAt: '2026-07-02T00:00:00.000Z',
          keyMaterialHex: firstKey,
        },
        {
          keyId: 'approval-key-0002',
          status: 'active',
          createdAt: '2026-07-02T00:00:00.000Z',
          retiredAt: null,
          keyMaterialHex: secondKey,
        },
      ],
    });

    const handle = new PosixPrivateFileApprovalDecisionCustodyAdapter().open({
      dataDir,
      projectRoot,
      platform: 'linux',
    });
    const payload = '{"request":"exact"}';
    const current = handle.sign(payload);
    const retiredMac = createHmac('sha256', Buffer.from(firstKey, 'hex'))
      .update(payload)
      .digest('hex');

    expect(handle.snapshot).toMatchObject({
      kind: 'approval-decision-keyring',
      revision: 2,
      activeKeyId: 'approval-key-0002',
      custodyAdapterId: 'posix-private-file:approval-decision:v1',
    });
    expect(current.keyId).toBe('approval-key-0002');
    expect(handle.verify(current.keyId, payload, current.mac)).toBe(true);
    expect(handle.verify('approval-key-0001', payload, retiredMac)).toBe(true);
    expect(handle.verify('approval-key-unknown', payload, current.mac)).toBe(false);
  });

  it('cannot validate a provider-domain MAC with the dedicated approval key', () => {
    const { projectRoot, dataDir } = fixture();
    writeApprovalAuthorityFixtureRevision({
      dataDir,
      revision: 1,
      previousRevisionHash: null,
      activeKeyId: 'approval-key-0001',
      keys: [{
        keyId: 'approval-key-0001',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        retiredAt: null,
        keyMaterialHex: '33'.repeat(32),
      }],
    });
    const handle = new PosixPrivateFileApprovalDecisionCustodyAdapter().open({
      dataDir,
      projectRoot,
      platform: 'wsl',
    });
    const payload = '{"decision":"allow"}';
    const providerDomainMac = createHmac('sha256', Buffer.from('44'.repeat(32), 'hex'))
      .update(payload)
      .digest('hex');

    expect(handle.verify('approval-key-0001', payload, providerDomainMac)).toBe(false);
  });

  it('fails closed when the keyring is missing, project-local, permissive, symlinked, or hash-broken', () => {
    const adapter = new PosixPrivateFileApprovalDecisionCustodyAdapter();

    const missing = fixture();
    expect(() => adapter.open({
      dataDir: missing.dataDir,
      projectRoot: missing.projectRoot,
      platform: 'linux',
    })).toThrowError(expect.objectContaining<Partial<ApprovalAuthorityKeyringError>>({
      code: 'APPROVAL_KEYRING_NOT_PROVISIONED',
    }));

    const local = fixture();
    const localData = join(local.projectRoot, '.host-data');
    writeApprovalAuthorityFixtureRevision({
      dataDir: localData,
      revision: 1,
      previousRevisionHash: null,
      activeKeyId: 'approval-key-0001',
      keys: [{
        keyId: 'approval-key-0001',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        retiredAt: null,
        keyMaterialHex: '55'.repeat(32),
      }],
    });
    expect(() => adapter.open({
      dataDir: localData,
      projectRoot: local.projectRoot,
      platform: 'linux',
    })).toThrowError(expect.objectContaining<Partial<ApprovalAuthorityKeyringError>>({
      code: 'APPROVAL_KEYRING_PROJECT_SCOPE_FORBIDDEN',
    }));

    const permissive = fixture();
    writeApprovalAuthorityFixtureRevision({
      dataDir: permissive.dataDir,
      revision: 1,
      previousRevisionHash: null,
      activeKeyId: 'approval-key-0001',
      keys: [{
        keyId: 'approval-key-0001',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        retiredAt: null,
        keyMaterialHex: '66'.repeat(32),
      }],
    });
    const revisionPath = join(
      permissive.dataDir,
      'keys',
      'approval-decision',
      'v1',
      'revisions',
      'revision-1.json',
    );
    chmodSync(revisionPath, 0o644);
    expect(() => adapter.open({
      dataDir: permissive.dataDir,
      projectRoot: permissive.projectRoot,
      platform: 'linux',
    })).toThrowError(expect.objectContaining<Partial<ApprovalAuthorityKeyringError>>({
      code: 'APPROVAL_KEYRING_ACL_ENFORCEMENT_FAILED',
    }));

    const linked = fixture();
    writeApprovalAuthorityFixtureRevision({
      dataDir: linked.dataDir,
      revision: 1,
      previousRevisionHash: null,
      activeKeyId: 'approval-key-0001',
      keys: [{
        keyId: 'approval-key-0001',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        retiredAt: null,
        keyMaterialHex: '77'.repeat(32),
      }],
    });
    const linkedRevision = join(
      linked.dataDir,
      'keys',
      'approval-decision',
      'v1',
      'revisions',
      'revision-1.json',
    );
    const target = `${linkedRevision}.target`;
    symlinkSync(linkedRevision, target);
    unlinkSync(linkedRevision);
    symlinkSync(target, linkedRevision);
    expect(() => adapter.open({
      dataDir: linked.dataDir,
      projectRoot: linked.projectRoot,
      platform: 'linux',
    })).toThrowError(expect.objectContaining<Partial<ApprovalAuthorityKeyringError>>({
      code: 'APPROVAL_KEYRING_STORAGE_UNSAFE',
    }));
  });

  it('returns an explicit unsupported adapter on native Windows', () => {
    const { projectRoot, dataDir } = fixture();
    expect(() => defaultApprovalDecisionCustodyAdapter('win32').open({
      dataDir,
      projectRoot,
      platform: 'win32',
    })).toThrowError(expect.objectContaining<Partial<ApprovalAuthorityKeyringError>>({
      code: 'APPROVAL_KEYRING_ACL_UNSUPPORTED',
    }));
  });
});
