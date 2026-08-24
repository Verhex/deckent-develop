import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registryIntegrityDigest } from '../../scripts/master-plan-integrity.mjs';
import { buildDryRunBundle, DryRunError } from '../../scripts/closure-ledger/phase5-dry-run.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'phase5-dry-run-'));
  roots.push(root);
  const decisionsPath = join(root, 'decisions.json');
  const masterPlanPath = join(root, 'master.json');
  const proposalPath = join(root, 'proposal-source.md');
  const trustAnchorsPath = join(root, 'trust-anchors.json');
  const masterBase = {
    schemaVersion: 1,
    sourceDigest: { algorithm: 'sha256(normalized-lf-utf8)', value: 'a'.repeat(64) },
    identityRegistry: [{ id: 'ROW-A' }],
    workItems: [{ id: 'ROW-A', state: 'active' }],
  };
  const master = { ...masterBase, registryIntegrity: { algorithm: 'sha256(canonical-json-utf8)', value: registryIntegrityDigest(masterBase) } };
  const decisions = [{
    schemaVersion: 1,
    seq: 41,
    eventId: 'event-41',
    recordedAt: '2026-08-17T00:00:00Z',
    rowRef: { workId: 'ROW-A', rowDefinitionDigest: 'b'.repeat(64), masterSourceDigest: 'a'.repeat(64) },
    decision: { kind: 'level-lane-disposition', level: 'task', lane: 'runtime', ruleId: 'RULE-1', confidence: 'high' },
  }];
  writeFileSync(decisionsPath, JSON.stringify(decisions));
  writeFileSync(masterPlanPath, JSON.stringify(master));
  writeFileSync(proposalPath, '# Owner proposal\n', 'utf8');
  const publicKeyPem = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
  writeFileSync(trustAnchorsPath, JSON.stringify({
    schemaVersion: 1,
    anchors: [{ keyId: 'owner-a', publicKeyPem, tenantId: 'tenant-main', projectId: 'deckent' }],
  }));
  return { root, decisionsPath, masterPlanPath, proposalPath, trustAnchorsPath, decisions };
}

describe('Phase-5 dry-run bundle builder', () => {
  it('is digest-deterministic for the same unsigned fixture', () => {
    const f = fixture();
    const first = buildDryRunBundle({ ...f, outDir: join(f.root, 'out-a') });
    const second = buildDryRunBundle({ ...f, outDir: join(f.root, 'out-b') });
    expect(first.unsignedManifestDigest).toBe(second.unsignedManifestDigest);
  });

  it('writes exactly the four staging artifacts and leaves inputs untouched', () => {
    const f = fixture();
    const before = readFileSync(f.proposalPath);
    const masterBefore = readFileSync(f.masterPlanPath);
    const outDir = join(f.root, 'staging');
    buildDryRunBundle({ ...f, outDir });
    expect(readdirSync(outDir).sort()).toEqual(['dry-run-summary.json', 'events.json', 'master-snapshot.json', 'proposal.md']);
    expect(readFileSync(f.proposalPath)).toEqual(before);
    expect(readFileSync(join(outDir, 'proposal.md'))).toEqual(before);
    expect(readFileSync(join(outDir, 'master-snapshot.json'))).toEqual(masterBefore);
  });

  it('refuses an outDir under docs/governance', () => {
    const f = fixture();
    const forbidden = join(process.cwd(), 'docs/governance/phase5-test-forbidden');
    expect(() => buildDryRunBundle({ ...f, outDir: forbidden })).toThrowError(/E_DRYRUN_FORBIDDEN_OUTDIR/);
  });

  it('fails with a typed SCHEMA error when a required unsigned event field is missing', () => {
    const f = fixture();
    writeFileSync(f.decisionsPath, JSON.stringify([{ ...f.decisions[0], eventId: undefined }]));
    try { buildDryRunBundle({ ...f, outDir: join(f.root, 'out') }); expect.unreachable(); }
    catch (error) {
      expect(error).toBeInstanceOf(DryRunError);
      expect((error as DryRunError).code).toBe('E_DRYRUN_SCHEMA');
    }
  });

  it('emits the complete §3.4 subject and unsigned signed-binding preview', () => {
    const f = fixture();
    const summary = buildDryRunBundle({ ...f, outDir: join(f.root, 'out') });
    expect(Object.keys(summary).sort()).toEqual([
      'eventCount', 'kind', 'masterSnapshotDigest', 'projectId', 'proposalDigest',
      'registryIntegrityDigest', 'seqIntervalEnd', 'seqIntervalStart',
      'signedBindingPreview', 'tenantId', 'unsignedManifestDigest',
    ].sort());
    expect(Object.keys(summary.signedBindingPreview).sort()).toEqual([
      'requestId', 'claimRef', 'decision', 'tenantId', 'projectId', 'masterSnapshotDigest',
      'registryIntegrityDigest', 'proposalDigest', 'unsignedManifestDigest', 'eventCount',
      'seqIntervalStart', 'seqIntervalEnd', 'authenticatedAt', 'decidedAt', 'authExpiresAt',
    ].sort());
    expect(JSON.stringify(summary)).not.toMatch(/signature|attestation|authorityProof/);
    expect(summary).toMatchObject({ tenantId: 'tenant-main', projectId: 'deckent' });
  });

  it('accepts key rotation within one scope and rejects cross-scope anchors', () => {
    const f = fixture();
    const first = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const second = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const writeAnchors = (projectId: string) => writeFileSync(f.trustAnchorsPath, JSON.stringify({
      schemaVersion: 1,
      anchors: [
        { keyId: 'owner-a', publicKeyPem: first, tenantId: 'tenant-main', projectId: 'deckent' },
        { keyId: 'owner-b', publicKeyPem: second, tenantId: 'tenant-main', projectId },
      ],
    }));
    writeAnchors('deckent');
    expect(buildDryRunBundle({ ...f, outDir: join(f.root, 'same-scope') })).toMatchObject({ projectId: 'deckent' });
    writeAnchors('other-project');
    expect(() => buildDryRunBundle({ ...f, outDir: join(f.root, 'cross-scope') }))
      .toThrowError(/E_DRYRUN_AUTHORITY.*TRUST_ANCHOR_SCOPE_CONFLICT/);
  });
});
