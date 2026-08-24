import { createHash, randomUUID } from 'node:crypto';
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
  writeCrossVerifyDecodedSlice,
} from '../../src/core/cross-verify-evidence-broker.js';
import {
  CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS,
  CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES as CANONICAL_CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES,
  CROSS_VERIFY_UTF8_WORST_CASE_BYTES_PER_JAVASCRIPT_CHAR,
} from '../../src/core/cross-verify-response-limits.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  readTaskResultSettlementClosure,
  taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementPreparedAtomic,
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

      // Host-decoded plain snapshot: raw bytes (binary-safe — never base64), keyed
      // by bare contentSha256, so the sandboxed verifier reads it with a bare `cat`
      // and no interpreter. The filename asserts the digest the verifier can re-check.
      const decodedBinary = readFileSync(
        join(crossVerifyEvidenceBrokerDirectory(ref), 'decoded', binary.contentSha256),
      );
      expect(decodedBinary).toEqual(Buffer.from([0, 1, 2, 255]));
      expect(createHash('sha256').update(decodedBinary).digest('hex'))
        .toBe(binary.contentSha256);

      writeFileSync(join(projectRoot, 'src', 'z.ts'), 'drift after capture\n');
      expect(captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot,
        settlementRef: ref,
        claim,
      })).toEqual(evidence);
      expect(readCrossVerifyEvidenceReceipt(projectRoot, ref)).toEqual(evidence);
    });

    it('fails closed when a reused host-decoded artifact is tampered', () => {
      const { projectRoot, ref, fenceTokenHash } = fixture();
      mkdirSync(join(projectRoot, 'src'));
      writeFileSync(join(projectRoot, 'src', 'file.ts'), 'evidence\n');
      const claim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot, settlementRef: ref, fenceTokenHash, relativePaths: ['src/file.ts'],
      });
      const evidence = captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot, settlementRef: ref, claim,
      });
      // Tamper the published decoded artifact in place, keeping its content-
      // addressed name — the replay/re-capture CAS re-read must reject the
      // mismatch and never mount a corrupt snapshot to the verifier.
      const contentSha = evidence.manifest.entries[0]!.contentSha256;
      writeFileSync(
        join(crossVerifyEvidenceBrokerDirectory(ref), 'decoded', contentSha),
        'TAMPERED-DECODED-CONTENT',
      );
      expectBrokerCode(
        () => captureCrossVerifyEvidenceSnapshotAtomic({ projectRoot, settlementRef: ref, claim }),
        'UNSAFE_FILESYSTEM_ENTRY',
      );
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
      // The host verdict receipt may only publish after a terminally closed
      // settlement (see writeCrossVerifyVerdictReceiptAtomic), so close it first.
      writeTaskResultSettlementPreparedAtomic(ref, 'claude-fable-5');
      writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), '2026-07-28T00:00:02.000Z');
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref, exitCode: 0, settledAt: '2026-07-28T00:00:03.000Z',
        result: { taskId: ref.taskId, selfAssessment: 'DONE' },
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed', locksReleased: true,
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

      const tampered = JSON.parse(readFileSync(crossVerifyVerdictReceiptPath(ref), 'utf8')) as {
        receipt: { outputByteLength: number };
      };
      tampered.receipt.outputByteLength = CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES + 1;
      writeFileSync(crossVerifyVerdictReceiptPath(ref), JSON.stringify(tampered), 'utf8');
      expectBrokerCode(() => readCrossVerifyVerdictReceipt(projectRoot, ref), 'CORRUPT_RECEIPT');
    });

    it('shares the canonical raw byte ceiling at ASCII and worst-case Unicode boundaries', () => {
      const ascii = 'a'.repeat(CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS);
      const worstCaseUnicode = '\u0800'.repeat(CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS);

      expect(CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES)
        .toBe(CANONICAL_CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES);
      expect(Buffer.byteLength(ascii, 'utf8'))
        .toBe(CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS);
      expect(Buffer.byteLength(worstCaseUnicode, 'utf8'))
        .toBe(CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES);
      expect(CROSS_VERIFY_COMPLETE_RESPONSE_MAX_CHARS
        * CROSS_VERIFY_UTF8_WORST_CASE_BYTES_PER_JAVASCRIPT_CHAR)
        .toBe(CROSS_VERIFY_RAW_OUTPUT_MAX_BYTES);
    });

    it('publishes the host verdict receipt after the settlement is terminally closed', () => {
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
      // Settle + terminally close the attempt — retiring the ACTIVE settlement
      // claim, exactly as the coordinator does before the runner persists the
      // final host verdict receipt.
      writeTaskResultSettlementPreparedAtomic(ref, 'claude-fable-5');
      writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), '2026-07-28T00:00:02.000Z');
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref, exitCode: 0, settledAt: '2026-07-28T00:00:03.000Z',
        result: { taskId: ref.taskId, selfAssessment: 'DONE' },
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed', locksReleased: true,
      });
      expect(readTaskResultSettlementClosure(ref)).not.toBeNull();

      // The verdict receipt still publishes: BOTH the pre- and post-publication
      // fence checks bind to the durable (now-closed) claim, not the retired
      // active claim. (This is the exact §12.2 verdict-receipt path.)
      const verdict = writeCrossVerifyVerdictReceiptAtomic({
        projectRoot,
        settlementRef: ref,
        claimSha256: claim.claimSha256,
        evidenceManifestSha256: evidence.manifestSha256,
        effectiveVerdict: 'CONFIRMED',
        disposition: 'allow',
        adjudicationReceiptSha256: 'a'.repeat(64),
        outputSha256: 'b'.repeat(64),
        outputByteLength: 64,
      });
      expect(verdict.receipt).toMatchObject({
        state: 'host-adjudicated',
        effectiveVerdict: 'CONFIRMED',
        disposition: 'allow',
      });
      expect(readCrossVerifyVerdictReceipt(projectRoot, ref)).toEqual(verdict);
    });

    it('fails closed on an open settlement and accepts idempotent replay once closed', () => {
      const { projectRoot, ref, fenceTokenHash } = fixture();
      mkdirSync(join(projectRoot, 'src'));
      writeFileSync(join(projectRoot, 'src', 'file.ts'), 'evidence\n');
      const claim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot, settlementRef: ref, fenceTokenHash, relativePaths: ['src/file.ts'],
      });
      const evidence = captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot, settlementRef: ref, claim,
      });
      const input = {
        projectRoot, settlementRef: ref,
        claimSha256: claim.claimSha256,
        evidenceManifestSha256: evidence.manifestSha256,
        effectiveVerdict: 'CONFIRMED' as const,
        disposition: 'allow' as const,
        adjudicationReceiptSha256: 'a'.repeat(64),
        outputSha256: 'b'.repeat(64),
        outputByteLength: 64,
      };
      // Open settlement (claimed but not closed) → fail closed, nothing published.
      expectBrokerCode(() => writeCrossVerifyVerdictReceiptAtomic(input), 'AUTHORITY_MISMATCH');
      expect(existsSync(crossVerifyVerdictReceiptPath(ref))).toBe(false);

      // Terminally close it → the receipt publishes and idempotently replays.
      writeTaskResultSettlementPreparedAtomic(ref, 'claude-fable-5');
      writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), '2026-07-28T00:00:02.000Z');
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref, exitCode: 0, settledAt: '2026-07-28T00:00:03.000Z',
        result: { taskId: ref.taskId, selfAssessment: 'DONE' },
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed', locksReleased: true,
      });
      const verdict = writeCrossVerifyVerdictReceiptAtomic(input);
      expect(writeCrossVerifyVerdictReceiptAtomic(input)).toEqual(verdict);
      expect(readCrossVerifyVerdictReceipt(projectRoot, ref)).toEqual(verdict);
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

// ─── 7094/7081 ranged-read-verifier: bounded decoded slices ─────────────
describe.skipIf(!pinnedRuntimeAvailable)(
  'writeCrossVerifyDecodedSlice (bounded evidence)',
  () => {
    it('cuts a content-addressed slice from the pinned decoded blob', () => {
      const { projectRoot, ref, fenceTokenHash } = fixture('xverify-slice-task');
      mkdirSync(join(projectRoot, 'src'));
      const body = ['line one', 'line two', 'line three', 'line four', 'line five'].join('\n');
      writeFileSync(join(projectRoot, 'src', 'big.ts'), body);
      const claim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot, settlementRef: ref, fenceTokenHash,
        relativePaths: ['src/big.ts'],
      });
      const evidence = captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot, settlementRef: ref, claim,
      });
      const source = evidence.manifest.entries[0]!;

      const slice = writeCrossVerifyDecodedSlice({
        projectRoot, settlementRef: ref,
        sourceContentSha256: source.contentSha256,
        startLine: 2, endLine: 4,
      });
      const expected = ['line two', 'line three', 'line four'].join('\n');
      expect(slice.lineCount).toBe(3);
      expect(slice.byteLength).toBe(Buffer.byteLength(expected));
      expect(slice.contentSha256)
        .toBe(createHash('sha256').update(expected, 'utf8').digest('hex'));
      // The slice lives in decoded/ under its own content address.
      const decodedPath = join(
        crossVerifyEvidenceBrokerDirectory(ref), 'decoded', slice.contentSha256,
      );
      expect(readFileSync(decodedPath, 'utf-8')).toBe(expected);
    });

    it('rejects a range beyond the source line count with a typed error', () => {
      const { projectRoot, ref, fenceTokenHash } = fixture('xverify-slice-range');
      mkdirSync(join(projectRoot, 'src'));
      writeFileSync(join(projectRoot, 'src', 'small.ts'), 'only\ntwo');
      const claim = claimCrossVerifyEvidenceSnapshotAtomic({
        projectRoot, settlementRef: ref, fenceTokenHash,
        relativePaths: ['src/small.ts'],
      });
      const evidence = captureCrossVerifyEvidenceSnapshotAtomic({
        projectRoot, settlementRef: ref, claim,
      });
      expect(() => writeCrossVerifyDecodedSlice({
        projectRoot, settlementRef: ref,
        sourceContentSha256: evidence.manifest.entries[0]!.contentSha256,
        startLine: 1, endLine: 99,
      })).toThrowError(/exceeds source line count/u);
    });
  },
);
