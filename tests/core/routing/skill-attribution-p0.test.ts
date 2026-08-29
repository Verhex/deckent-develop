import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildSkillAttributionReceipt,
  readSkillAttributionBatch,
  writeSkillAttributionBatch,
  SkillAttributionConflictError,
} from '../../../src/core/routing/skill-attribution.js';

const roots: string[] = [];
const D1 = `sha256:${'1'.repeat(64)}`;
const D2 = `sha256:${'2'.repeat(64)}`;
const D3 = `sha256:${'3'.repeat(64)}`;

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
    expect(() => writeSkillAttributionBatch(projectRoot, 'sprint-707', [conflicting]))
      .toThrow(SkillAttributionConflictError);
  });

  it('rejects a receipt whose inner digest was not recomputed even when the batch is present', () => {
    const projectRoot = root();
    const written = writeSkillAttributionBatch(projectRoot, 'sprint-707', [
      buildSkillAttributionReceipt(input()),
    ]);
    const tampered = JSON.parse(written.bytes);
    tampered.receipts[0].deliveredSkillIds = ['testing-expert'];
    writeFileSync(written.path, `${JSON.stringify(tampered)}\n`, 'utf8');

    expect(() => readSkillAttributionBatch(projectRoot, 'sprint-707'))
      .toThrow(SkillAttributionConflictError);
  });
});
