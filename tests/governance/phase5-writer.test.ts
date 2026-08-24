import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalBroker } from '../../src/core/approval-broker.js';
import { registryIntegrityDigest } from '../../scripts/master-plan-integrity.mjs';
import { canonicalize } from '../../scripts/closure-ledger/canonical.mjs';
import { buildDryRunBundle } from '../../scripts/closure-ledger/phase5-dry-run.mjs';
import { appendBundle, fileClaim, runCli, WriterError } from '../../scripts/closure-ledger/phase5-writer.mjs';
import {
  loadBatchManifests,
  loadBatchSnapshots,
  parseLedger,
  parseTrustAnchorsDoc,
  runGate,
} from '../../scripts/lint-closure-dispositions.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

interface Fixture {
  root: string;
  bundleDir: string;
  subject: Record<string, unknown>;
  master: Record<string, unknown>;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
  keyId: string;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'phase5-writer-'));
  roots.push(root);
  const governance = join(root, 'docs/governance');
  mkdirSync(governance, { recursive: true });
  mkdirSync(join(root, 'docs/generated'), { recursive: true });
  const definitionDigest = 'b'.repeat(64);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const keyId = 'owner-test-key';
  const trustAnchorsPath = join(governance, 'closure-trust-anchors.json');
  writeFileSync(trustAnchorsPath, JSON.stringify({
    schemaVersion: 1,
    anchors: [{
      keyId,
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      tenantId: 'tenant-main',
      projectId: 'deckent',
    }],
  }));
  const masterBase = {
    schemaVersion: 1,
    sourceDigest: { algorithm: 'sha256(normalized-lf-utf8)', value: 'a'.repeat(64) },
    identityRegistry: [{ id: 'ROW-A', definitionDigest }],
    workItems: [{ id: 'ROW-A', state: 'active', priority: 'P0', definitionDigest }],
  };
  const master = {
    ...masterBase,
    registryIntegrity: { algorithm: 'sha256(canonical-json-utf8)', value: registryIntegrityDigest(masterBase) },
  };
  const decisions = [{
    schemaVersion: 1,
    seq: 1,
    eventId: 'event-1',
    recordedAt: '2026-08-17T00:00:00Z',
    rowRef: { workId: 'ROW-A', rowDefinitionDigest: definitionDigest, masterSourceDigest: 'a'.repeat(64) },
    decision: { kind: 'level-lane-disposition', level: 'task', lane: 'runtime', ruleId: 'RULE-1', confidence: 'high' },
  }];
  const decisionsPath = join(root, 'decisions.json');
  const masterPath = join(root, 'master.json');
  const proposalPath = join(root, 'proposal.md');
  const bundleDir = join(root, 'staging');
  writeFileSync(decisionsPath, JSON.stringify(decisions));
  writeFileSync(masterPath, JSON.stringify(master));
  writeFileSync(join(root, 'docs/generated/master-plan-active.json'), JSON.stringify(master));
  writeFileSync(proposalPath, '# Owner proposal\n');
  const subject = buildDryRunBundle({ decisionsPath, outDir: bundleDir, masterPlanPath: masterPath, proposalPath, trustAnchorsPath });
  return { root, bundleDir, subject, master, privateKey, keyId };
}

function receiptFor(f: Fixture, overrides: Record<string, unknown> = {}) {
  const requestId = `aprcdb-${String(f.subject.unsignedManifestDigest).slice(0, 32)}`;
  const base = {
    schemaVersion: 1,
    requestId,
    claimRef: `approval:${requestId}`,
    decision: 'allow',
    subject: Object.fromEntries(Object.entries(f.subject).filter(([key]) => key !== 'signedBindingPreview')),
    authenticatedAt: '2026-08-17T00:01:00Z',
    decidedAt: '2026-08-17T00:02:00Z',
    authExpiresAt: '2026-08-17T00:10:00Z',
  };
  const receipt = { ...base, ...overrides } as typeof base & { attestation?: { keyId: string; signature: string } };
  const subject = receipt.subject as Record<string, unknown>;
  const binding = {
    requestId: receipt.requestId,
    claimRef: receipt.claimRef,
    decision: receipt.decision,
    tenantId: subject.tenantId,
    projectId: subject.projectId,
    masterSnapshotDigest: subject.masterSnapshotDigest,
    registryIntegrityDigest: subject.registryIntegrityDigest,
    proposalDigest: subject.proposalDigest,
    unsignedManifestDigest: subject.unsignedManifestDigest,
    eventCount: subject.eventCount,
    seqIntervalStart: subject.seqIntervalStart,
    seqIntervalEnd: subject.seqIntervalEnd,
    authenticatedAt: receipt.authenticatedAt,
    decidedAt: receipt.decidedAt,
    authExpiresAt: receipt.authExpiresAt,
  };
  receipt.attestation = {
    keyId: f.keyId,
    signature: sign(null, Buffer.from(canonicalize(binding)), f.privateKey).toString('base64'),
  };
  return receipt;
}

function writeReceipt(f: Fixture, receipt = receiptFor(f), filename = `${receipt.requestId}.json`) {
  const path = join(f.root, filename);
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return path;
}

function expectWriterCode(fn: () => unknown, code: string) {
  try { fn(); expect.unreachable(); }
  catch (error) {
    expect(error).toBeInstanceOf(WriterError);
    expect((error as WriterError).code).toBe(code);
  }
}

describe('Phase-5 writer claim filing', () => {
  it('files one canonical broker-readable pending request and reuses claim.json', () => {
    const f = fixture();
    const first = fileClaim({ bundleDir: f.bundleDir, root: f.root, now: new Date('2026-08-17T00:00:00Z') });
    const second = fileClaim({ bundleDir: f.bundleDir, root: f.root, now: new Date('2026-08-18T00:00:00Z') });
    expect(second).toEqual(first);
    expect(readdirSync(join(f.root, '.deckent/approvals')).filter((name) => name.endsWith('.request.json'))).toEqual([`${first.requestId}.request.json`]);
    const broker = new ApprovalBroker(f.root);
    const pending = broker.list('pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(first.requestId);
    expect(pending[0]?.details.subject).toEqual(Object.fromEntries(Object.entries(f.subject).filter(([key]) => key !== 'signedBindingPreview')));
    expect(JSON.parse(readFileSync(join(f.bundleDir, 'claim.json'), 'utf8'))).toEqual(first);
  });

  it('fails closed on unknown flags', () => {
    const f = fixture();
    expectWriterCode(() => runCli(['--file-claim', '--bundle', f.bundleDir, '--root', f.root, '--surprise', 'yes']), 'E_WRITER_UNKNOWN_FLAG');
  });
});

describe('Phase-5 writer append refusals', () => {
  it('refuses missing and malformed receipt before a ledger exists', () => {
    const f = fixture();
    expectWriterCode(() => appendBundle({ bundleDir: f.bundleDir, receiptPath: join(f.root, 'missing.json'), root: f.root }), 'E_WRITER_INPUT');
    const malformed = join(f.root, 'malformed.json');
    writeFileSync(malformed, '{');
    expectWriterCode(() => appendBundle({ bundleDir: f.bundleDir, receiptPath: malformed, root: f.root }), 'E_WRITER_MALFORMED');
    expect(existsSync(join(f.root, 'docs/governance/closure-dispositions.jsonl'))).toBe(false);
  });

  it.each([
    ['non-allow decision', (f: Fixture) => receiptFor(f, { decision: 'deny' }), 'E_WRITER_RECEIPT_DECISION'],
    ['wrong tenant', (f: Fixture) => receiptFor(f, { subject: { ...receiptFor(f).subject, tenantId: 'tenant-other' } }), 'E_WRITER_RECEIPT_SUBJECT'],
    ['wrong digest', (f: Fixture) => receiptFor(f, { subject: { ...receiptFor(f).subject, proposalDigest: 'f'.repeat(64) } }), 'E_WRITER_RECEIPT_SUBJECT'],
  ])('refuses %s with no live append', (_label, makeReceipt, code) => {
    const f = fixture();
    const path = writeReceipt(f, makeReceipt(f));
    expectWriterCode(() => appendBundle({ bundleDir: f.bundleDir, receiptPath: path, root: f.root }), code);
    expect(existsSync(join(f.root, 'docs/governance/closure-dispositions.jsonl'))).toBe(false);
  });

  it('refuses filename/requestId mismatch', () => {
    const f = fixture();
    const path = writeReceipt(f, receiptFor(f), 'wrong-name.json');
    expectWriterCode(() => appendBundle({ bundleDir: f.bundleDir, receiptPath: path, root: f.root }), 'E_WRITER_RECEIPT_FILENAME');
    expect(existsSync(join(f.root, 'docs/governance/closure-dispositions.jsonl'))).toBe(false);
  });
});

describe('Phase-5 writer signed append', () => {
  it('archives exact bytes, appends a valid chain, writes projections, and finishes gate-green', () => {
    const f = fixture();
    const receipt = receiptFor(f);
    const receiptPath = writeReceipt(f, receipt);
    const result = appendBundle({ bundleDir: f.bundleDir, receiptPath, root: f.root });
    expect(result).toEqual({
      requestId: receipt.requestId,
      eventCount: 1,
      unsignedManifestDigest: f.subject.unsignedManifestDigest,
    });
    const governance = join(f.root, 'docs/governance');
    const ledgerText = readFileSync(join(governance, 'closure-dispositions.jsonl'), 'utf8');
    const parsed = parseLedger(ledgerText);
    expect(parsed.problems).toEqual([]);
    expect(parsed.events[0]?.previousEventDigest).toBe('0'.repeat(64));
    expect(parsed.events[0]?.authorityProof).toEqual({ receiptRef: receipt.requestId, ownerReceipt: receipt.claimRef });
    const archive = join(governance, 'closure-batches', String(f.subject.unsignedManifestDigest));
    for (const name of ['dry-run-summary.json', 'events.json', 'master-snapshot.json', 'proposal.md']) {
      expect(readFileSync(join(archive, name))).toEqual(readFileSync(join(f.bundleDir, name)));
    }
    expect(readFileSync(join(governance, 'closure-dispositions.receipts', `${receipt.requestId}.json`))).toEqual(readFileSync(receiptPath));
    expect(existsSync(join(governance, 'closure-projections/current.json'))).toBe(true);

    const anchors = parseTrustAnchorsDoc(readFileSync(join(governance, 'closure-trust-anchors.json'), 'utf8'), 'test anchors');
    const manifests = loadBatchManifests(join(governance, 'closure-dispositions.receipts'));
    const gate = runGate({
      ledgerText,
      baseline: null,
      registry: (f.master.identityRegistry as Array<unknown>),
      masterSourceDigest: (f.master.sourceDigest as { value: string }).value,
      batchManifests: manifests.manifests,
      verifyAuthority: true,
      trustAnchors: anchors.anchors,
      batchSnapshots: loadBatchSnapshots(join(governance, 'closure-batches')),
      trustAnchorProblems: anchors.problems,
      receiptProblems: manifests.problems,
    });
    expect(gate).toMatchObject({ ok: true, errors: [], holds: [], eventCount: 1 });
  });
});
