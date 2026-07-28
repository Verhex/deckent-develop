import { randomUUID } from 'node:crypto';
import {
  constants as fsConstants,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES,
  CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES,
  CrossVerifyEvidenceBrokerError,
  assertCrossVerifyEvidenceBrokerPlatformSupport,
  assertCrossVerifyEvidenceRelativePath,
  captureCrossVerifyEvidenceSnapshotAtomic,
  claimCrossVerifyEvidenceSnapshotAtomic,
  crossVerifyEvidenceBlobReceiptPath,
  crossVerifyEvidenceBrokerDirectory,
  crossVerifyEvidenceClaimReceiptPath,
  crossVerifyEvidenceClaimRef,
  crossVerifyEvidenceReceiptPath,
  crossVerifyEvidenceReceiptRef,
  crossVerifyVerdictReceiptPath,
  crossVerifyVerdictReceiptRef,
  readCrossVerifyEvidenceClaimReceipt,
  readCrossVerifyEvidenceReceipt,
  readCrossVerifyVerdictReceipt,
  writeCrossVerifyVerdictReceiptAtomic,
} from '../../src/core/cross-verify-evidence-broker.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementAttemptAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;
const pinnedRuntimeAvailable =
  process.platform === 'linux'
  && existsSync('/proc/self/fd')
  && typeof fsConstants.O_NOFOLLOW === 'number'
  && fsConstants.O_NOFOLLOW !== 0
  && typeof fsConstants.O_DIRECTORY === 'number'
  && fsConstants.O_DIRECTORY !== 0;

interface Fixture {
  readonly base: string;
  readonly projectRoot: string;
  readonly stateRoot: string;
  readonly ref: TaskResultSettlementRefV1;
  readonly fenceTokenHash: string;
}

function fixture(taskId = 'xverify-evidence-task'): Fixture {
  const base = mkdtempSync(join(tmpdir(), 'deckent-xverify-evidence-'));
  roots.push(base);
  const projectRoot = join(base, 'project');
  const stateRoot = join(base, 'host-state');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(stateRoot, { recursive: true });
  process.env.DECKENT_HOME = stateRoot;
  const ref = createTaskResultSettlementRefForAttempt(
    projectRoot,
    taskId,
    randomUUID(),
  );
  writeTaskResultSettlementAttemptAtomic(
    ref,
    '2026-07-28T00:00:00.000Z',
  );
  claimTaskResultSettlementAttemptAtomic(
    ref,
    '2026-07-28T00:00:00.000Z',
  );
  return {
    base,
    projectRoot,
    stateRoot,
    ref,
    fenceTokenHash: taskResultSettlementActiveClaimDigest(ref),
  };
}

function projectFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() || entry.isSymbolicLink())
    .map(entry => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

function expectBrokerCode(
  action: () => unknown,
  code: CrossVerifyEvidenceBrokerError['code'],
): void {
  try {
    action();
    expect.unreachable(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CrossVerifyEvidenceBrokerError);
    expect((error as CrossVerifyEvidenceBrokerError).code).toBe(code);
  }
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('cross-verify evidence broker portable contract', () => {
  it('validates exact portable relative paths without normalizing aliases', () => {
    expect(assertCrossVerifyEvidenceRelativePath('src/core/file.ts'))
      .toBe('src/core/file.ts');
    for (const unsafe of [
      '',
      '.',
      '..',
      '../secret',
      'src/../secret',
      '/etc/passwd',
      'C:\\secret.txt',
      'src\\file.ts',
      'src//file.ts',
      'src/./file.ts',
      'src/file.ts.',
      'src/file.ts ',
      'src/CON.txt',
      'src/file:stream',
      `src/${'a'.repeat(256)}`,
    ]) {
      expectBrokerCode(
        () => assertCrossVerifyEvidenceRelativePath(unsafe),
        'INVALID_RELATIVE_PATH',
      );
    }
  });

  it('fails Windows and incomplete native adapters honestly with a typed error', () => {
    expectBrokerCode(() => assertCrossVerifyEvidenceBrokerPlatformSupport({
      nodePlatform: 'win32',
      procSelfFdAvailable: false,
      oNoFollow: undefined,
      oDirectory: undefined,
    }), 'UNSUPPORTED_PLATFORM');
    expectBrokerCode(() => assertCrossVerifyEvidenceBrokerPlatformSupport({
      nodePlatform: 'darwin',
      procSelfFdAvailable: false,
      oNoFollow: 1,
      oDirectory: 2,
    }), 'UNSUPPORTED_PLATFORM');
    expectBrokerCode(() => assertCrossVerifyEvidenceBrokerPlatformSupport({
      nodePlatform: 'linux',
      procSelfFdAvailable: true,
      oNoFollow: 0,
      oDirectory: 2,
    }), 'UNSUPPORTED_PLATFORM');
    expect(() => assertCrossVerifyEvidenceBrokerPlatformSupport({
      nodePlatform: 'linux',
      procSelfFdAvailable: true,
      oNoFollow: 1,
      oDirectory: 2,
    })).not.toThrow();
  });
});

describe.skipIf(!pinnedRuntimeAvailable)(
  'cross-verify evidence broker pinned Linux/WSL authority',
  () => {
    it('publishes a deterministic attempt-scoped snapshot outside the project', () => {
      const { projectRoot, ref, fenceTokenHash } = fixture();
      mkdirSync(join(projectRoot, 'src'));
      writeFileSync(join(projectRoot, 'src', 'z.ts'), 'export const z = 1;\n');
      writeFileSync(
        join(projectRoot, 'src', 'a.bin'),
        Buffer.from([0, 1, 2, 255]),
      );
      const before = projectFiles(projectRoot);

      const claim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        fenceTokenHash,
        relativePaths: ['src/z.ts', 'src/a.bin'],
      });
      expect(claim.claim.relativePaths).toEqual(['src/a.bin', 'src/z.ts']);
      expect(claim.claim.claimedAt).toBe('2026-07-28T00:00:00.000Z');
      expect(readCrossVerifyEvidenceClaimReceipt(projectRoot, ref)).toEqual(claim);

      const evidence = captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        claim,
      });
      expect(evidence.manifest.entries.map(entry => entry.relativePath))
        .toEqual(['src/a.bin', 'src/z.ts']);
      expect(evidence.manifest.totalByteLength).toBe(
        4 + Buffer.byteLength('export const z = 1;\n'),
      );
      expect(readCrossVerifyEvidenceReceipt(projectRoot, ref)).toEqual(evidence);
      expect(projectFiles(projectRoot)).toEqual(before);
      expect(crossVerifyEvidenceBrokerDirectory(ref)).not.toContain(projectRoot);
      expect(crossVerifyEvidenceClaimReceiptPath(ref)).not.toContain(projectRoot);
      expect(crossVerifyEvidenceReceiptPath(ref)).not.toContain(projectRoot);
      expect(crossVerifyEvidenceClaimRef(claim))
        .toBe(`cross-verify-evidence-claim:sha256:${claim.claimSha256}`);
      expect(crossVerifyEvidenceReceiptRef(evidence))
        .toBe(`cross-verify-evidence-manifest:sha256:${evidence.manifestSha256}`);

      const binary = evidence.manifest.entries[0]!;
      const blob = JSON.parse(readFileSync(
        crossVerifyEvidenceBlobReceiptPath(ref, binary.blobReceiptSha256),
        'utf8',
      )) as { receipt: { contentBase64: string } };
      expect(Buffer.from(blob.receipt.contentBase64, 'base64'))
        .toEqual(Buffer.from([0, 1, 2, 255]));

      writeFileSync(join(projectRoot, 'src', 'z.ts'), 'drift after capture\n');
      expect(captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        claim,
      })).toEqual(evidence);
      expect(readCrossVerifyEvidenceReceipt(projectRoot, ref)).toEqual(evidence);
    });

    it('enforces first-writer claim and manifest authority', () => {
      const { projectRoot, ref, fenceTokenHash } = fixture();
      mkdirSync(join(projectRoot, 'src'));
      writeFileSync(join(projectRoot, 'src', 'one.ts'), 'one\n');
      writeFileSync(join(projectRoot, 'src', 'two.ts'), 'two\n');

      const first = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        fenceTokenHash,
        relativePaths: ['src/one.ts'],
      });
      expect(claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        fenceTokenHash,
        relativePaths: ['src/one.ts'],
      })).toEqual(first);
      expectBrokerCode(() => claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        fenceTokenHash,
        relativePaths: ['src/two.ts'],
      }), 'IMMUTABLE_CONFLICT');

      const evidence = captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        claim: first,
      });
      const forgedClaim = {
        ...first,
        claim: { ...first.claim, relativePaths: ['src/two.ts'] },
      };
      expectBrokerCode(() => captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        claim: forgedClaim,
      }), 'AUTHORITY_MISMATCH');
      expect(readCrossVerifyEvidenceReceipt(projectRoot, ref)).toEqual(evidence);
    });

    it('rejects traversal, symlink escapes, hard links, and bounded-byte overflow', () => {
      const { base, projectRoot, ref, fenceTokenHash } = fixture();
      mkdirSync(join(projectRoot, 'src'));
      const outside = join(base, 'outside.txt');
      writeFileSync(outside, 'outside');
      symlinkSync(outside, join(projectRoot, 'src', 'link.ts'));

      const symlinkClaim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        fenceTokenHash,
        relativePaths: ['src/link.ts'],
      });
      expectBrokerCode(() => captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        claim: symlinkClaim,
      }), 'UNSAFE_FILESYSTEM_ENTRY');

      const hardFixture = fixture('xverify-hard-link');
      mkdirSync(join(hardFixture.projectRoot, 'src'));
      const hardOutside = join(hardFixture.base, 'hard-outside.txt');
      writeFileSync(hardOutside, 'hard');
      linkSync(hardOutside, join(hardFixture.projectRoot, 'src', 'hard.ts'));
      const hardClaim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot: hardFixture.projectRoot,
        settlementRef: hardFixture.ref,
        fenceTokenHash: hardFixture.fenceTokenHash,
        relativePaths: ['src/hard.ts'],
      });
      expectBrokerCode(() => captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot: hardFixture.projectRoot,
        settlementRef: hardFixture.ref,
        claim: hardClaim,
      }), 'UNSAFE_FILESYSTEM_ENTRY');

      const boundedFixture = fixture('xverify-bounded');
      mkdirSync(join(boundedFixture.projectRoot, 'src'));
      writeFileSync(join(boundedFixture.projectRoot, 'src', 'large.ts'), '12345');
      const boundedClaim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot: boundedFixture.projectRoot,
        settlementRef: boundedFixture.ref,
        fenceTokenHash: boundedFixture.fenceTokenHash,
        relativePaths: ['src/large.ts'],
        limits: { maxFileBytes: 4, maxTotalBytes: 4 },
      });
      expectBrokerCode(() => captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot: boundedFixture.projectRoot,
        settlementRef: boundedFixture.ref,
        claim: boundedClaim,
      }), 'EVIDENCE_LIMIT_EXCEEDED');
      expect(existsSync(crossVerifyEvidenceReceiptPath(boundedFixture.ref)))
        .toBe(false);
    });

    it('publishes only host-adjudicated verdict receipts bound to raw output digests', () => {
      const { projectRoot, ref, fenceTokenHash } = fixture();
      mkdirSync(join(projectRoot, 'src'));
      writeFileSync(join(projectRoot, 'src', 'file.ts'), 'evidence\n');
      const claim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        fenceTokenHash,
        relativePaths: ['src/file.ts'],
      });
      const evidence = captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        claim,
      });
      const input = {
        projectRoot,
        settlementRef: ref,
        claimSha256: claim.claimSha256,
        evidenceManifestSha256: evidence.manifestSha256,
        effectiveVerdict: 'CONFIRMED' as const,
        disposition: 'allow' as const,
        adjudicationReceiptSha256: 'a'.repeat(64),
        outputSha256: 'b'.repeat(64),
        outputByteLength: 128,
      };
      const verdict = writeCrossVerifyVerdictReceiptAtomic(input);
      expect(verdict.receipt).toMatchObject({
        state: 'host-adjudicated',
        assurance: 'typed-host-adjudicated',
        effectiveVerdict: 'CONFIRMED',
        disposition: 'allow',
        adjudicationReceiptSha256: 'a'.repeat(64),
        outputSha256: 'b'.repeat(64),
        outputByteLength: 128,
      });
      expect(readCrossVerifyVerdictReceipt(projectRoot, ref)).toEqual(verdict);
      expect(writeCrossVerifyVerdictReceiptAtomic(input)).toEqual(verdict);
      expect(crossVerifyVerdictReceiptRef(verdict))
        .toBe(`cross-verify-verdict:sha256:${verdict.verdictReceiptSha256}`);
      expect(crossVerifyVerdictReceiptPath(ref)).not.toContain(projectRoot);

      expectBrokerCode(() => writeCrossVerifyVerdictReceiptAtomic({
        ...input,
        effectiveVerdict: 'UNCLEAR',
        disposition: 'allow',
      }), 'INVALID_INPUT');
      expectBrokerCode(() => writeCrossVerifyVerdictReceiptAtomic({
        ...input,
        outputByteLength: CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES + 1,
      }), 'INVALID_INPUT');
      expectBrokerCode(() => writeCrossVerifyVerdictReceiptAtomic({
        ...input,
        adjudicationReceiptSha256: 'c'.repeat(64),
      }), 'IMMUTABLE_CONFLICT');
    });

    it('detects receipt tampering and refuses receipt-path symlink replacement', () => {
      const { base, projectRoot, ref, fenceTokenHash } = fixture();
      mkdirSync(join(projectRoot, 'src'));
      writeFileSync(join(projectRoot, 'src', 'file.ts'), 'evidence\n');
      const claim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        fenceTokenHash,
        relativePaths: ['src/file.ts'],
      });
      captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        claim,
      });

      const manifestPath = crossVerifyEvidenceReceiptPath(ref);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        manifest: { totalByteLength: number };
      };
      manifest.manifest.totalByteLength += 1;
      writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
      expectBrokerCode(
        () => readCrossVerifyEvidenceReceipt(projectRoot, ref),
        'CORRUPT_RECEIPT',
      );

      unlinkSync(manifestPath);
      const outside = join(base, 'outside-receipt.json');
      writeFileSync(outside, '{}');
      symlinkSync(outside, manifestPath);
      expectBrokerCode(
        () => readCrossVerifyEvidenceReceipt(projectRoot, ref),
        'UNSAFE_FILESYSTEM_ENTRY',
      );
      expect(readFileSync(outside, 'utf8')).toBe('{}');
    });

    it('keeps receipt JSON bounded independently of source content limits', () => {
      const { projectRoot, ref, fenceTokenHash } = fixture();
      mkdirSync(join(projectRoot, 'src'));
      writeFileSync(join(projectRoot, 'src', 'file.ts'), 'bounded\n');
      const claim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        fenceTokenHash,
        relativePaths: ['src/file.ts'],
      });
      captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        claim,
      });
      expect(readFileSync(crossVerifyEvidenceClaimReceiptPath(ref)).byteLength)
        .toBeLessThanOrEqual(CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES);
      expect(readFileSync(crossVerifyEvidenceReceiptPath(ref)).byteLength)
        .toBeLessThanOrEqual(CROSS_VERIFY_EVIDENCE_MAX_RECEIPT_BYTES);
    });
  },
);
