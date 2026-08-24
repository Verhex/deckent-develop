import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPromptDeliveryReceipt,
  promptDeliveryReceiptPath,
  readPromptDeliveryReceipt,
  resolvePromptDeliveryAttribution,
  writePromptDeliveryReceipt,
} from '../../src/core/prompt-delivery-receipt.js';

let root: string;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

function receipt() {
  return buildPromptDeliveryReceipt({
    taskId: '654-002', prompt: 'final prompt\nbytes',
    promptCompilePlanId: `prompt-compile-plan:sha256:${'a'.repeat(64)}`, rolePolicyIdentity: 'worker:implementer',
    assignedAgentId: 'implementer', assignedSkillIds: ['routed', 'forced'], forcedSkillIds: ['forced'],
    segments: [
      { kind: 'skills', content: '=== Skills ===\n--- routed ---\nbody\n--- forced ---\nbody\n' },
      { kind: 'persona', content: '=== Agent: implementer ===\npersona body' },
    ],
  });
}

describe('prompt delivery receipt', () => {
  it('atomically round-trips deterministic bytes bound to final rendered segments', () => {
    root = mkdtempSync(join(tmpdir(), 'prompt-delivery-receipt-'));
    const first = receipt();
    const second = receipt();
    expect(first).toEqual(second);
    expect(first.promptSha256).toBe(createHash('sha256').update('final prompt\nbytes', 'utf8').digest('hex'));
    expect(first.deliveredSkillIds).toEqual(['forced', 'routed']);
    expect(first.deliveredAgentId).toBe('implementer');
    expect(first.personaSegmentSha256).toBe(createHash('sha256').update('=== Agent: implementer ===\npersona body', 'utf8').digest('hex'));
    expect(writePromptDeliveryReceipt(root, first)).toBe(true);
    const path = promptDeliveryReceiptPath(root, '654-002');
    const bytes = readFileSync(path, 'utf8');
    expect(bytes).toBe(`${JSON.stringify(first)}\n`);
    expect(readPromptDeliveryReceipt(root, '654-002')).toEqual({ state: 'AVAILABLE', receipt: first });
  });

  it('returns typed HOLD for malformed, mismatched, and invalid-digest artifacts', () => {
    root = mkdtempSync(join(tmpdir(), 'prompt-delivery-receipt-'));
    const path = promptDeliveryReceiptPath(root, '654-002');
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(path, '{bad json', 'utf8');
    expect(readPromptDeliveryReceipt(root, '654-002')).toEqual({ state: 'HOLD', reason: 'malformed' });
    writeFileSync(path, JSON.stringify({ ...receipt(), taskId: 'other' }), 'utf8');
    expect(readPromptDeliveryReceipt(root, '654-002')).toEqual({ state: 'HOLD', reason: 'task-mismatch' });
    writeFileSync(path, JSON.stringify({ ...receipt(), promptSha256: 'not-a-digest' }), 'utf8');
    expect(readPromptDeliveryReceipt(root, '654-002')).toEqual({ state: 'HOLD', reason: 'invalid-digest' });
    writeFileSync(path, JSON.stringify({ ...receipt(), promptCompilePlanId: 'prompt-compile-plan:sha256:not-a-digest' }), 'utf8');
    expect(readPromptDeliveryReceipt(root, '654-002')).toEqual({ state: 'HOLD', reason: 'invalid-digest' });
  });

  it('rejects non-canonical or internally contradictory current receipts', () => {
    root = mkdtempSync(join(tmpdir(), 'prompt-delivery-receipt-'));
    const path = promptDeliveryReceiptPath(root, '654-002');
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(path, JSON.stringify({
      ...receipt(),
      deliveredSkillIds: ['routed', 'forced'],
    }), 'utf8');
    expect(readPromptDeliveryReceipt(root, '654-002')).toEqual({ state: 'HOLD', reason: 'malformed' });

    writeFileSync(path, JSON.stringify({
      ...receipt(),
      undeliveredForcedSkillIds: ['forced'],
    }), 'utf8');
    expect(readPromptDeliveryReceipt(root, '654-002')).toEqual({ state: 'HOLD', reason: 'malformed' });

    writeFileSync(path, JSON.stringify({
      ...receipt(),
      deliveredAgentId: null,
    }), 'utf8');
    expect(readPromptDeliveryReceipt(root, '654-002')).toEqual({ state: 'HOLD', reason: 'malformed' });
  });

  it('uses current delivered identities and never lets legacy claims override them', () => {
    root = mkdtempSync(join(tmpdir(), 'prompt-delivery-receipt-'));
    expect(writePromptDeliveryReceipt(root, receipt())).toBe(true);
    expect(resolvePromptDeliveryAttribution({
      projectRoot: root,
      taskId: '654-002',
      requireCurrentReceipt: true,
      legacyAgentId: 'claim-agent',
      legacySkillIds: ['claim-skill'],
    })).toMatchObject({
      state: 'CURRENT',
      agentId: 'implementer',
      skillIds: ['forced', 'routed'],
    });
  });

  it('fails closed for fresh missing/malformed receipts but preserves explicit legacy paths', () => {
    root = mkdtempSync(join(tmpdir(), 'prompt-delivery-receipt-'));
    const fallback = { legacyAgentId: 'legacy-agent', legacySkillIds: ['legacy-skill'] } as const;
    expect(resolvePromptDeliveryAttribution({
      projectRoot: root, taskId: 'legacy', requireCurrentReceipt: false, ...fallback,
    })).toEqual({
      state: 'LEGACY_FALLBACK', agentId: 'legacy-agent', skillIds: ['legacy-skill'],
    });
    expect(resolvePromptDeliveryAttribution({
      projectRoot: root, taskId: 'fresh', requireCurrentReceipt: true, ...fallback,
    })).toEqual({ state: 'HOLD', agentId: null, skillIds: [], reason: 'missing' });

    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(promptDeliveryReceiptPath(root, 'fresh'), '{broken', 'utf8');
    expect(resolvePromptDeliveryAttribution({
      projectRoot: root, taskId: 'fresh', requireCurrentReceipt: true, ...fallback,
    })).toEqual({ state: 'HOLD', agentId: null, skillIds: [], reason: 'malformed' });

    writeFileSync(promptDeliveryReceiptPath(root, 'legacy-v1'), JSON.stringify({
      version: 1,
      taskId: 'legacy-v1',
      source: 'worker-prompt',
      deliveredSkillIds: ['delivered'],
      assignedSkillIds: ['assigned'],
      forcedSkillIds: [],
      undeliveredForcedSkillIds: [],
    }), 'utf8');
    expect(resolvePromptDeliveryAttribution({
      projectRoot: root, taskId: 'legacy-v1', requireCurrentReceipt: false, ...fallback,
    })).toEqual({ state: 'LEGACY_RECEIPT', agentId: 'legacy-agent', skillIds: ['delivered'] });
    expect(resolvePromptDeliveryAttribution({
      projectRoot: root, taskId: 'legacy-v1', requireCurrentReceipt: true, ...fallback,
    })).toEqual({ state: 'HOLD', agentId: null, skillIds: [], reason: 'legacy-version' });
  });
});
