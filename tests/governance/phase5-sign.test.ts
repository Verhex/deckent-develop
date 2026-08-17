import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalize } from '../../scripts/closure-ledger/canonical.mjs';
import { REASON, SignError, signBundle } from '../../scripts/closure-ledger/phase5-sign.mjs';
import { validateAuthority } from '../../scripts/lint-closure-dispositions.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(algorithm: 'ed25519' | 'rsa' = 'ed25519') {
  const external = mkdtempSync(join(tmpdir(), 'phase5-sign-'));
  roots.push(external);
  const bundleDir = join(external, 'bundle');
  mkdirSync(bundleDir);
  const requestId = 'aprcdb-0123456789abcdef0123456789abcdef';
  const subject = {
    kind: 'closure-disposition-batch', tenantId: 'tenant-main', projectId: 'deckent',
    masterSnapshotDigest: 'a'.repeat(64), registryIntegrityDigest: 'b'.repeat(64),
    proposalDigest: 'c'.repeat(64), unsignedManifestDigest: 'd'.repeat(64),
    eventCount: 1, seqIntervalStart: 7, seqIntervalEnd: 7,
  };
  writeFileSync(join(bundleDir, 'dry-run-summary.json'), JSON.stringify({ ...subject, signedBindingPreview: {} }));
  writeFileSync(join(bundleDir, 'claim.json'), JSON.stringify({ requestId, claimRef: `approval:${requestId}` }));
  const pair = algorithm === 'ed25519'
    ? generateKeyPairSync('ed25519')
    : generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPath = join(external, 'owner-private.pem');
  writeFileSync(keyPath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  chmodSync(keyPath, 0o600);
  const keyId = 'owner-test-key';
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const anchors = JSON.stringify({ schemaVersion: 1, anchors: [{ keyId, publicKeyPem, tenantId: subject.tenantId, projectId: subject.projectId }] });
  return { external, bundleDir, requestId, subject, pair, keyPath, keyId, publicKeyPem, anchors };
}

function expectCode(fn: () => unknown, code: string) {
  try { fn(); expect.unreachable(); }
  catch (error) {
    expect(error).toBeInstanceOf(SignError);
    expect((error as SignError).code).toBe(code);
  }
}

describe('Phase-5 owner signing ceremony', () => {
  it('emits a validator-verifiable receipt with the strict ordered decision window', () => {
    const f = fixture();
    const out = join(f.external, `${f.requestId}.json`);
    const result = signBundle({
      bundleDir: f.bundleDir, requestId: f.requestId, decision: 'allow', keyPath: f.keyPath,
      outPath: out, now: new Date('2026-08-17T12:34:56.789Z'), trustAnchorsText: f.anchors,
    });
    expect(result.keyId).toBe(f.keyId);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual(result.receipt);
    expect(result.receipt.authenticatedAt <= result.receipt.decidedAt).toBe(true);
    expect(result.receipt.decidedAt <= result.receipt.authExpiresAt).toBe(true);
    expect([result.receipt.authenticatedAt, result.receipt.decidedAt, result.receipt.authExpiresAt]).toEqual([
      '2026-08-17T12:34:56.789Z', '2026-08-17T12:34:56.789Z', '2026-08-17T12:44:56.789Z',
    ]);
    const s = result.receipt.subject;
    const binding = {
      requestId: result.receipt.requestId, claimRef: result.receipt.claimRef, decision: result.receipt.decision,
      tenantId: s.tenantId, projectId: s.projectId, masterSnapshotDigest: s.masterSnapshotDigest,
      registryIntegrityDigest: s.registryIntegrityDigest, proposalDigest: s.proposalDigest,
      unsignedManifestDigest: s.unsignedManifestDigest, eventCount: s.eventCount,
      seqIntervalStart: s.seqIntervalStart, seqIntervalEnd: s.seqIntervalEnd,
      authenticatedAt: result.receipt.authenticatedAt, decidedAt: result.receipt.decidedAt,
      authExpiresAt: result.receipt.authExpiresAt,
    };
    expect(verify(null, Buffer.from(canonicalize(binding)), f.pair.publicKey, Buffer.from(result.signature, 'base64'))).toBe(true);

    const events = [{ seq: 7, rowRef: { batchManifestDigest: f.subject.unsignedManifestDigest }, authorityProof: { ownerReceipt: result.receipt.claimRef } }];
    const manifests = new Map([[f.subject.unsignedManifestDigest, { receipt: result.receipt, requestId: f.requestId }]]);
    const anchors = new Map([[f.keyId, { publicKeyPem: f.publicKeyPem, tenantId: f.subject.tenantId, projectId: f.subject.projectId }]]);
    const problems = validateAuthority(events, manifests, anchors, new Map());
    expect(problems.some((problem: { code: string }) => ['AUTHORITY_SIGNATURE_INVALID', 'AUTHORITY_WINDOW', 'AUTHORITY_WINDOW_FORMAT'].includes(problem.code))).toBe(false);
  });

  it('refuses an in-repository key path before reading key bytes', () => {
    const f = fixture();
    const inRepo = join(process.cwd(), 'scripts/closure-ledger/phase5-sign.mjs');
    expectCode(() => signBundle({ bundleDir: f.bundleDir, requestId: f.requestId, decision: 'allow', keyPath: inRepo, trustAnchorsText: f.anchors }), REASON.KEY_IN_REPO);
  });

  it('refuses PUBLIC-key input and non-ed25519 private keys with typed codes', () => {
    const f = fixture();
    const publicPath = join(f.external, 'public.pem');
    writeFileSync(publicPath, f.publicKeyPem); chmodSync(publicPath, 0o600);
    expectCode(() => signBundle({ bundleDir: f.bundleDir, requestId: f.requestId, decision: 'allow', keyPath: publicPath, trustAnchorsText: f.anchors }), REASON.PUBLIC_KEY_INPUT);
    const rsa = fixture('rsa');
    expectCode(() => signBundle({ bundleDir: rsa.bundleDir, requestId: rsa.requestId, decision: 'allow', keyPath: rsa.keyPath, trustAnchorsText: rsa.anchors }), REASON.KEY_NOT_ED25519);
  });
});
