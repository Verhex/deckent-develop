import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fsFault = vi.hoisted(() => ({
  failDirectoryFsync: false,
  noFollowUnavailable: false,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    constants: new Proxy({ ...actual.constants }, {
      get(target, property, receiver) {
        if (property === 'O_NOFOLLOW' && fsFault.noFollowUnavailable) return 0;
        return Reflect.get(target, property, receiver);
      },
    }),
    fsyncSync: (descriptor: number): void => {
      if (fsFault.failDirectoryFsync && actual.fstatSync(descriptor).isDirectory()) {
        throw new Error('dir fsync unavailable');
      }
      actual.fsyncSync(descriptor);
    },
  };
});

import {
  buildSkillAttributionReceipt,
  readSkillAttributionBatch,
  writeSkillAttributionBatch,
  SkillAttributionConflictError,
  SkillAttributionIntegrityError,
  SkillAttributionTerminalPublicationError,
  writeTerminalBoundSkillAttributionBatch,
} from '../../../src/core/routing/skill-attribution.js';
import { canonicalJson } from '../../../src/core/audit-writer.js';

const roots: string[] = [];
const D1 = `sha256:${'1'.repeat(64)}`;
const D2 = `sha256:${'2'.repeat(64)}`;
const D3 = `sha256:${'3'.repeat(64)}`;

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value as never)).digest('hex')}`;
}

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-skill-attribution-'));
  roots.push(value);
  return value;
}

function input() {
  return {
    sprintId: 'sprint-707',
    logicalTaskId: '707-001',
    resolvingAttemptId: '707-001-fix',
    routingDecisionDigest: D1,
    skillEvidenceDigest: D2,
    logicalSettlementDigest: D3,
    promptDeliveryState: 'CURRENT' as const,
    selectedSkillIds: ['typescript-expert', 'testing-expert'],
    deliveredSkillIds: ['typescript-expert', 'testing-expert'],
  };
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('skill attribution receipt authority', () => {
  it('records selection/delivery as exposure but grants zero efficacy credit without causal evidence', () => {
    const receipt = buildSkillAttributionReceipt(input());

    expect(receipt).toMatchObject({
      state: 'EXPOSURE_ONLY',
      selectedSkillIds: ['testing-expert', 'typescript-expert'],
      deliveredSkillIds: ['testing-expert', 'typescript-expert'],
      appliedSkillIds: [],
      creditedSkillIds: [],
      reasonCode: 'causal-application-evidence-missing',
    });
    expect(receipt.receiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('canonicalizes the historical bare settlement digest at the producer boundary', () => {
    const receipt = buildSkillAttributionReceipt({
      ...input(),
      logicalSettlementDigest: '3'.repeat(64),
    });

    expect(receipt.logicalSettlementDigest).toBe(D3);
    expect(receipt.receiptDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('credits only host-validated applied skills that are a subset of delivered skills', () => {
    const receipt = buildSkillAttributionReceipt({
      ...input(),
      appliedEvidence: {
        authority: 'host-validated',
        evidenceDigest: D1,
        skillIds: ['testing-expert'],
      },
    });

    expect(receipt).toMatchObject({
      state: 'CREDITED',
      appliedSkillIds: ['testing-expert'],
      creditedSkillIds: ['testing-expert'],
      reasonCode: 'host-validated-causal-evidence',
    });
  });

  it('holds contradictory applied evidence instead of widening delivery authority', () => {
    const receipt = buildSkillAttributionReceipt({
      ...input(),
      appliedEvidence: {
        authority: 'host-validated',
        evidenceDigest: D1,
        skillIds: ['python-expert'],
      },
    });

    expect(receipt).toMatchObject({
      state: 'HOLD',
      creditedSkillIds: [],
      reasonCode: 'applied-skill-not-delivered',
    });
  });

  it('publishes one content-addressed batch, replays identical bytes, and rejects conflict', () => {
    const projectRoot = root();
    const firstReceipt = buildSkillAttributionReceipt(input());
    const first = writeSkillAttributionBatch(projectRoot, 'sprint-707', [firstReceipt]);
    const replay = writeSkillAttributionBatch(projectRoot, 'sprint-707', [firstReceipt]);

    expect(first.state).toBe('written');
    expect(replay).toMatchObject({ state: 'replayed', batchDigest: first.batchDigest });
    expect(readSkillAttributionBatch(projectRoot, 'sprint-707')).toEqual(first.batch);
    expect(readFileSync(first.path, 'utf8')).toBe(first.bytes);

    const conflicting = buildSkillAttributionReceipt({
      ...input(), logicalTaskId: '707-002', resolvingAttemptId: '707-002',
    });
    let conflict: unknown;
    try {
      writeSkillAttributionBatch(projectRoot, 'sprint-707', [conflicting]);
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(SkillAttributionConflictError);
    expect(conflict).not.toBeInstanceOf(SkillAttributionIntegrityError);
    expect((conflict as SkillAttributionConflictError).code)
      .toBe('SKILL_ATTRIBUTION_BATCH_CONFLICT');
    expect((conflict as SkillAttributionConflictError).message)
      .toBe('Skill attribution batch conflict for sprint-707');
  });

  it('rejects a receipt whose inner digest was not recomputed even when the batch is present', () => {
    const projectRoot = root();
    const written = writeSkillAttributionBatch(projectRoot, 'sprint-707', [
      buildSkillAttributionReceipt(input()),
    ]);
    const tampered = JSON.parse(written.bytes);
    tampered.receipts[0].deliveredSkillIds = ['testing-expert'];
    writeFileSync(written.path, `${JSON.stringify(tampered)}\n`, 'utf8');

    let thrown: unknown;
    try {
      readSkillAttributionBatch(projectRoot, 'sprint-707');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SkillAttributionIntegrityError);
    expect(thrown).not.toBeInstanceOf(SkillAttributionConflictError);
    expect((thrown as SkillAttributionIntegrityError).reasonCode).toBe('INVALID_RECEIPT');
    expect((thrown as SkillAttributionIntegrityError).code)
      .toBe('SKILL_ATTRIBUTION_BATCH_INTEGRITY_FAILED');
    expect((thrown as SkillAttributionIntegrityError).message)
      .toBe('Skill attribution batch integrity check failed for sprint-707: INVALID_RECEIPT');
    expect((thrown as SkillAttributionIntegrityError).suggestion)
      .toBe('Preserve the artifact and repair or migrate it from trusted source evidence before retrying.');
  });

  it('classifies duplicate logical receipts in one authored batch as input integrity, not replay conflict', () => {
    const projectRoot = root();
    const first = buildSkillAttributionReceipt(input());
    const duplicate = buildSkillAttributionReceipt({
      ...input(), resolvingAttemptId: '707-001-fix-fix',
    });

    let thrown: unknown;
    try {
      writeSkillAttributionBatch(projectRoot, 'sprint-707', [first, duplicate]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SkillAttributionIntegrityError);
    expect(thrown).not.toBeInstanceOf(SkillAttributionConflictError);
    expect((thrown as SkillAttributionIntegrityError).reasonCode).toBe('DUPLICATE_LOGICAL_TASK');
    expect((thrown as SkillAttributionIntegrityError).code)
      .toBe('SKILL_ATTRIBUTION_BATCH_INTEGRITY_FAILED');
  });

  it('accepts an integrity-valid historical bare batch and migrates only an equivalent replay', () => {
    const projectRoot = root();
    const canonicalReceipt = buildSkillAttributionReceipt(input());
    const { receiptDigest: _canonicalReceiptDigest, ...canonicalUnsigned } = canonicalReceipt;
    const legacyUnsigned = {
      ...canonicalUnsigned,
      logicalSettlementDigest: canonicalReceipt.logicalSettlementDigest.slice('sha256:'.length),
    };
    const legacyReceipt = { ...legacyUnsigned, receiptDigest: digest(legacyUnsigned) };
    const legacyBatchUnsigned = {
      schemaVersion: 1,
      kind: 'skill-attribution-batch',
      sprintId: 'sprint-707',
      receipts: [legacyReceipt],
    };
    const legacyBatch = { ...legacyBatchUnsigned, batchDigest: digest(legacyBatchUnsigned) };
    const target = join(projectRoot, '.deckent', 'routing', 'skill-attribution', 'sprint-707.json');
    mkdirSync(join(projectRoot, '.deckent', 'routing', 'skill-attribution'), { recursive: true });
    const legacyBytes = `${canonicalJson(legacyBatch as never)}\n`;
    writeFileSync(target, legacyBytes, 'utf8');

    expect(readSkillAttributionBatch(projectRoot, 'sprint-707')?.receipts[0]?.logicalSettlementDigest)
      .toBe('3'.repeat(64));
    const divergent = buildSkillAttributionReceipt({
      ...input(), logicalTaskId: '707-002', resolvingAttemptId: '707-002',
    });
    expect(() => writeSkillAttributionBatch(projectRoot, 'sprint-707', [divergent]))
      .toThrow(SkillAttributionConflictError);
    expect(readFileSync(target, 'utf8')).toBe(legacyBytes);

    const replay = writeSkillAttributionBatch(projectRoot, 'sprint-707', [canonicalReceipt]);

    expect(replay.state).toBe('replayed');
    expect(readSkillAttributionBatch(projectRoot, 'sprint-707')).toEqual(replay.batch);
    expect(replay.batch.receipts[0]?.logicalSettlementDigest).toBe(D3);
    expect(readFileSync(target, 'utf8')).toBe(replay.bytes);
  });

  it('preserves a compatible historical base and publishes one receipt-keyed terminal successor', () => {
    const projectRoot = root();
    const predecessor = writeSkillAttributionBatch(projectRoot, 'sprint-707', [
      buildSkillAttributionReceipt(input()),
    ]);
    const predecessorBytes = readFileSync(predecessor.path, 'utf8');
    const currentReceipt = buildSkillAttributionReceipt({
      ...input(),
      logicalSettlementDigest: `sha256:${'4'.repeat(64)}`,
    });
    const terminalAuthority = {
      receipt: {
        version: 1 as const,
        sprintId: 'sprint-707',
        runId: 'flow-707',
        coordinatorGeneration: 3,
        terminalOutcome: 'COMPLETE' as const,
        logicalSettlementDigest: '4'.repeat(64),
        priorAuthorityVersion: 0,
        authorityVersion: 1,
      },
      exactCustodyDigestsDigest: `sha256:${'5'.repeat(64)}`,
      logicalWinnersDigest: `sha256:${'6'.repeat(64)}`,
    };

    const first = writeTerminalBoundSkillAttributionBatch({
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [currentReceipt],
      terminalAuthority,
    });
    const replay = writeTerminalBoundSkillAttributionBatch({
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [currentReceipt],
      terminalAuthority,
    });

    expect(first.state).toBe('written');
    expect(replay.state).toBe('replayed');
    expect(replay.path).toBe(first.path);
    expect(replay.authority.recordDigest).toBe(first.authority.recordDigest);
    expect(first.authority.predecessorBatchDigest).toBe(predecessor.batchDigest);
    expect(readFileSync(predecessor.path, 'utf8')).toBe(predecessorBytes);
    expect(readFileSync(first.path, 'utf8')).toBe(first.bytes);

    expect(() => writeTerminalBoundSkillAttributionBatch({
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [currentReceipt],
      terminalAuthority: {
        ...terminalAuthority,
        exactCustodyDigestsDigest: `sha256:${'7'.repeat(64)}`,
      },
    })).toThrowError(SkillAttributionTerminalPublicationError);
    expect(() => writeTerminalBoundSkillAttributionBatch({
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [currentReceipt],
      terminalAuthority: {
        ...terminalAuthority,
        logicalWinnersDigest: `sha256:${'8'.repeat(64)}`,
      },
    })).toThrowError(SkillAttributionTerminalPublicationError);
    expect(readFileSync(first.path, 'utf8')).toBe(first.bytes);
  });

  it('rejects unrelated predecessor semantics and a sibling terminal receipt without changing the base', () => {
    const projectRoot = root();
    const predecessor = writeSkillAttributionBatch(projectRoot, 'sprint-707', [
      buildSkillAttributionReceipt(input()),
    ]);
    const predecessorBytes = readFileSync(predecessor.path, 'utf8');
    const authority = {
      receipt: {
        version: 1 as const,
        sprintId: 'sprint-sibling',
        runId: 'flow-707',
        coordinatorGeneration: 1,
        terminalOutcome: 'COMPLETE' as const,
        logicalSettlementDigest: '4'.repeat(64),
        priorAuthorityVersion: 0,
        authorityVersion: 1,
      },
      exactCustodyDigestsDigest: `sha256:${'5'.repeat(64)}`,
      logicalWinnersDigest: `sha256:${'6'.repeat(64)}`,
    };
    const unrelated = buildSkillAttributionReceipt({
      ...input(),
      logicalTaskId: '707-002',
      resolvingAttemptId: '707-002',
      logicalSettlementDigest: `sha256:${'4'.repeat(64)}`,
    });

    expect(() => writeTerminalBoundSkillAttributionBatch({
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [unrelated],
      terminalAuthority: { ...authority, receipt: { ...authority.receipt, sprintId: 'sprint-707' } },
    })).toThrowError(SkillAttributionTerminalPublicationError);
    expect(() => writeTerminalBoundSkillAttributionBatch({
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [buildSkillAttributionReceipt({
        ...input(), logicalSettlementDigest: `sha256:${'4'.repeat(64)}`,
      })],
      terminalAuthority: authority,
    })).toThrowError(SkillAttributionTerminalPublicationError);
    expect(readFileSync(predecessor.path, 'utf8')).toBe(predecessorBytes);
  });

  it('never replaces the first receipt-keyed writer with different attribution bytes', () => {
    const projectRoot = root();
    const authority = {
      receipt: {
        version: 1 as const,
        sprintId: 'sprint-707',
        runId: 'flow-707',
        coordinatorGeneration: 1,
        terminalOutcome: 'COMPLETE' as const,
        logicalSettlementDigest: '3'.repeat(64),
        priorAuthorityVersion: 0,
        authorityVersion: 1,
      },
      exactCustodyDigestsDigest: `sha256:${'5'.repeat(64)}`,
      logicalWinnersDigest: `sha256:${'6'.repeat(64)}`,
    };
    const first = writeTerminalBoundSkillAttributionBatch({
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [buildSkillAttributionReceipt(input())],
      terminalAuthority: authority,
    });
    const firstBytes = readFileSync(first.path, 'utf8');
    const competitor = buildSkillAttributionReceipt({
      ...input(),
      routingDecisionDigest: `sha256:${'7'.repeat(64)}`,
    });

    expect(() => writeTerminalBoundSkillAttributionBatch({
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [competitor],
      terminalAuthority: authority,
    })).toThrowError(SkillAttributionTerminalPublicationError);
    expect(readFileSync(first.path, 'utf8')).toBe(firstBytes);
  });

  it('does not claim an EEXIST replay when directory durability cannot be confirmed', () => {
    const projectRoot = root();
    const authority = {
      receipt: {
        version: 1 as const,
        sprintId: 'sprint-707',
        runId: 'flow-707',
        coordinatorGeneration: 1,
        terminalOutcome: 'COMPLETE' as const,
        logicalSettlementDigest: '3'.repeat(64),
        priorAuthorityVersion: 0,
        authorityVersion: 1,
      },
      exactCustodyDigestsDigest: `sha256:${'5'.repeat(64)}`,
      logicalWinnersDigest: `sha256:${'6'.repeat(64)}`,
    };
    const publicationInput = {
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [buildSkillAttributionReceipt(input())],
      terminalAuthority: authority,
    };
    const first = writeTerminalBoundSkillAttributionBatch(publicationInput);
    fsFault.failDirectoryFsync = true;
    try {
      expect(() => writeTerminalBoundSkillAttributionBatch(publicationInput))
        .toThrowError(SkillAttributionTerminalPublicationError);
      expect(readFileSync(first.path, 'utf8')).toBe(first.bytes);
    } finally {
      fsFault.failDirectoryFsync = false;
    }
  });

  it('fails before publication when the platform cannot enforce no-follow opens', () => {
    const projectRoot = root();
    const authority = {
      receipt: {
        version: 1 as const,
        sprintId: 'sprint-707',
        runId: 'flow-707',
        coordinatorGeneration: 1,
        terminalOutcome: 'COMPLETE' as const,
        logicalSettlementDigest: '3'.repeat(64),
        priorAuthorityVersion: 0,
        authorityVersion: 1,
      },
      exactCustodyDigestsDigest: `sha256:${'5'.repeat(64)}`,
      logicalWinnersDigest: `sha256:${'6'.repeat(64)}`,
    };

    fsFault.noFollowUnavailable = true;
    let failure: unknown;
    try {
      try {
        writeTerminalBoundSkillAttributionBatch({
          projectRoot,
          sprintId: 'sprint-707',
          receipts: [buildSkillAttributionReceipt(input())],
          terminalAuthority: authority,
        });
      } catch (error) {
        failure = error;
      }
    } finally {
      fsFault.noFollowUnavailable = false;
    }
    expect(failure).toBeInstanceOf(SkillAttributionTerminalPublicationError);
    expect((failure as SkillAttributionTerminalPublicationError).reasonCode)
      .toBe('DURABILITY_UNCONFIRMED');
    expect(existsSync(join(
      projectRoot,
      '.deckent',
      'routing',
      'skill-attribution',
    ))).toBe(false);
  });

  it('rejects a final-path symlink instead of following bytes through it', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-skill-attribution-'));
    roots.push(projectRoot);
    const terminalAuthority = {
      receipt: {
        version: 1 as const,
        sprintId: 'sprint-707',
        runId: 'flow-707',
        coordinatorGeneration: 1,
        terminalOutcome: 'COMPLETE' as const,
        logicalSettlementDigest: '3'.repeat(64),
        priorAuthorityVersion: 0,
        authorityVersion: 1,
      },
      exactCustodyDigestsDigest: `sha256:${'5'.repeat(64)}`,
      logicalWinnersDigest: `sha256:${'6'.repeat(64)}`,
    };
    const publicationInput = {
      projectRoot,
      sprintId: 'sprint-707',
      receipts: [buildSkillAttributionReceipt(input())],
      terminalAuthority,
    };
    const first = writeTerminalBoundSkillAttributionBatch(publicationInput);
    const computedLeaf = `${basename(digest(terminalAuthority.receipt).slice(7))}.json`;
    expect(computedLeaf).toBe(
      '3ca6f9ce3fc5a845d58b0187384b20815cfed881cf0f5b3e60267b4545119a17.json',
    );
    const target = join(
      projectRoot,
      '.deckent',
      'routing',
      'skill-attribution',
      'sprint-707.terminal',
      '3ca6f9ce3fc5a845d58b0187384b20815cfed881cf0f5b3e60267b4545119a17.json',
    );
    expect(first.path).toBe(target);
    const redirected = join(projectRoot, 'redirected-terminal-batch.json');
    writeFileSync(redirected, first.bytes, { mode: 0o600 });
    rmSync(target);
    symlinkSync(redirected, target);

    expect(() => writeTerminalBoundSkillAttributionBatch(publicationInput))
      .toThrowError(SkillAttributionTerminalPublicationError);
  });
});
