import { createHash, createHmac } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ProviderAuthorityKeyring,
  ProviderAuthorityKeyringError,
  resolveProviderAuthorityKeyringDirectory,
} from '../../src/core/provider-authority-keyring.js';

const roots: string[] = [];

function root(prefix = 'deckent-provider-authority-'): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

function create(dataDir: string): ProviderAuthorityKeyring {
  return ProviderAuthorityKeyring.create({
    dataDir,
    now: () => new Date('2026-07-23T00:00:00.000Z'),
    keyringIdFactory: () => 'par-test-00000001',
    keyIdFactory: () => 'pak-test-00000001',
    randomBytesFactory: size => Buffer.alloc(size, 0x11),
  }).keyring;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function recomputeRevisionHash(revision: Record<string, unknown>): string {
  const { revisionHash: _ignored, ...unsigned } = revision;
  return createHash('sha256').update(JSON.stringify(canonicalize(unsigned))).digest('hex');
}

afterEach(() => {
  for (const item of roots.splice(0)) rmSync(item, { recursive: true, force: true });
});

describe('ProviderAuthorityKeyring', () => {
  it('resolves only below platform dataDir and keeps snapshots secret-free', () => {
    expect(resolveProviderAuthorityKeyringDirectory('linux', { HOME: '/home/alice' }))
      .toBe('/home/alice/.local/share/deckent/keys/provider-authority/v1/revisions');
    expect(resolveProviderAuthorityKeyringDirectory('win32', {
      USERPROFILE: 'C:\\Users\\Alice',
      APPDATA: 'D:\\Roaming',
    })).toBe('D:\\Roaming\\deckent\\keys\\provider-authority\\v1\\revisions');

    const dataDir = root();
    const keyring = create(dataDir);
    expect(keyring.snapshot()).toEqual({
      schemaVersion: 1,
      keyringId: 'par-test-00000001',
      revision: 1,
      revisionHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      activeAuthorityKeyId: 'pak-test-00000001',
      authorityKeys: [{
        keyId: 'pak-test-00000001',
        status: 'active',
        derivation: 'hkdf-v1',
        domains: ['truth', 'limit'],
        createdAt: '2026-07-23T00:00:00.000Z',
        retiredAt: null,
      }],
    });
    expect(JSON.stringify(keyring.snapshot())).not.toContain('1111111111');
  });

  it('domain-separates MACs and keeps account pseudonyms stable across signing rotation', () => {
    const dataDir = root();
    const keyring = create(dataDir);
    const truth = keyring.sign('truth', 'same-payload');
    const limit = keyring.sign('limit', 'same-payload');
    expect(truth.mac).not.toBe(limit.mac);
    expect(keyring.verify('truth', truth.keyId, 'same-payload', truth.mac)).toBe(true);
    expect(keyring.verify('limit', truth.keyId, 'same-payload', truth.mac)).toBe(false);

    const identity = {
      tenantId: 'tenant-a',
      provider: 'claude',
      authMode: 'subscription',
      stableAccountIdentity: 'raw-account@example.invalid',
    };
    const before = keyring.pseudonymizeAccount(identity);
    const first = keyring.snapshot();
    keyring.rotate({
      expectedRevisionHash: first.revisionHash,
      now: () => new Date('2026-07-23T01:00:00.000Z'),
      keyIdFactory: () => 'pak-test-00000002',
      randomBytesFactory: size => Buffer.alloc(size, 0x22),
    });
    const after = keyring.pseudonymizeAccount(identity);
    expect(after).toBe(before);
    expect(keyring.verify('truth', truth.keyId, 'same-payload', truth.mac)).toBe(true);
    expect(keyring.sign('truth', 'new').keyId).toBe('pak-test-00000002');
    expect(readFileSync(join(
      dataDir, 'keys', 'provider-authority', 'v1', 'revisions',
      `${first.revisionHash}.json`,
    ), 'utf8')).not.toContain(identity.stableAccountIdentity);
  });

  it('allows exactly one rotation from an expected revision', () => {
    const dataDir = root();
    const keyring = create(dataDir);
    const expectedRevisionHash = keyring.snapshot().revisionHash;
    keyring.rotate({
      expectedRevisionHash,
      keyIdFactory: () => 'pak-winner-0000001',
      randomBytesFactory: size => Buffer.alloc(size, 0x33),
    });
    expect(() => keyring.rotate({
      expectedRevisionHash,
      keyIdFactory: () => 'pak-loser-00000001',
      randomBytesFactory: size => Buffer.alloc(size, 0x44),
    })).toThrowError(expect.objectContaining<Partial<ProviderAuthorityKeyringError>>({
      code: 'KEYRING_CONCURRENT_UPDATE',
    }));
  });

  it('rejects a re-hashed revision that rewrites carried key derivation metadata', () => {
    const dataDir = root();
    const keyring = create(dataDir);
    const first = keyring.snapshot();
    keyring.rotate({
      expectedRevisionHash: first.revisionHash,
      keyIdFactory: () => 'pak-test-00000002',
      randomBytesFactory: size => Buffer.alloc(size, 0x22),
    });

    const revisionPath = join(
      dataDir,
      'keys',
      'provider-authority',
      'v1',
      'revisions',
      `${first.revisionHash}.json`,
    );
    const revision = JSON.parse(readFileSync(revisionPath, 'utf8')) as Record<string, unknown>;
    const authorityKeys = revision.authorityKeys as Array<Record<string, unknown>>;
    authorityKeys[0] = { ...authorityKeys[0], derivation: 'legacy-raw-v1' };
    revision.revisionHash = recomputeRevisionHash(revision);
    writeFileSync(revisionPath, JSON.stringify(revision), { mode: 0o600 });

    expect(() => ProviderAuthorityKeyring.open({ dataDir }))
      .toThrowError(expect.objectContaining<Partial<ProviderAuthorityKeyringError>>({
        code: 'KEYRING_INTEGRITY_FAILURE',
      }));
  });

  it('imports legacy material as domain-scoped retired verification authority', () => {
    const dataDir = root();
    const keyring = create(dataDir);
    const legacyKey = 'legacy-provider-truth-integrity-key-0001';
    keyring.importLegacyVerificationKey({
      expectedRevisionHash: keyring.snapshot().revisionHash,
      domain: 'truth',
      legacyKey,
      keyIdFactory: () => 'pak-legacy-truth-0001',
    });
    const mac = createHmac('sha256', legacyKey).update('legacy-payload').digest('hex');
    expect(keyring.verify('truth', 'pak-legacy-truth-0001', 'legacy-payload', mac)).toBe(true);
    expect(() => keyring.verify('limit', 'pak-legacy-truth-0001', 'legacy-payload', mac))
      .toThrow(/does not cover this domain/);
    expect(keyring.sign('truth', 'new').keyId).toBe('pak-test-00000001');
  });

  it('fails closed on unknown keys, revision tamper, unsafe modes and project scope', () => {
    const dataDir = root();
    const keyring = create(dataDir);
    expect(() => keyring.verify('truth', 'pak-unknown-0000001', 'x', '0'.repeat(64)))
      .toThrowError(expect.objectContaining<Partial<ProviderAuthorityKeyringError>>({
        code: 'KEYRING_UNKNOWN_KEY_ID',
      }));

    const genesis = join(dataDir, 'keys', 'provider-authority', 'v1', 'revisions', 'genesis.json');
    const parsed = JSON.parse(readFileSync(genesis, 'utf8')) as Record<string, unknown>;
    writeFileSync(genesis, JSON.stringify({ ...parsed, revision: 99 }), { mode: 0o600 });
    expect(() => ProviderAuthorityKeyring.open({ dataDir }))
      .toThrowError(expect.objectContaining<Partial<ProviderAuthorityKeyringError>>({
        code: 'KEYRING_INTEGRITY_FAILURE',
      }));

    const unsafe = root();
    create(unsafe);
    chmodSync(join(unsafe, 'keys', 'provider-authority', 'v1', 'revisions'), 0o755);
    expect(() => ProviderAuthorityKeyring.open({ dataDir: unsafe }))
      .toThrowError(expect.objectContaining<Partial<ProviderAuthorityKeyringError>>({
        code: 'KEYRING_ACL_ENFORCEMENT_FAILED',
      }));

    const project = root('deckent-project-');
    expect(() => ProviderAuthorityKeyring.create({ dataDir: join(project, '.global'), projectRoot: project }))
      .toThrowError(expect.objectContaining<Partial<ProviderAuthorityKeyringError>>({
        code: 'KEYRING_PROJECT_SCOPE_FORBIDDEN',
      }));

    const symlinkData = root();
    const target = root();
    symlinkSync(target, join(symlinkData, 'keys'));
    expect(() => ProviderAuthorityKeyring.create({ dataDir: symlinkData }))
      .toThrowError(expect.objectContaining<Partial<ProviderAuthorityKeyringError>>({
        code: 'KEYRING_STORAGE_UNSAFE',
      }));
  });
});
