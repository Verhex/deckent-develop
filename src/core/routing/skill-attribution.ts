import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from '../audit-writer.js';
import { DeckentError } from '../errors.js';
import { writeOperationFileAtomic } from '../operation-file-authority.js';

export const SKILL_ATTRIBUTION_RECEIPT_VERSION = 1 as const;
export const SKILL_ATTRIBUTION_BATCH_VERSION = 1 as const;
export const SKILL_ATTRIBUTION_DIR = join('.deckent', 'routing', 'skill-attribution');

export type SkillAttributionState = 'NO_SKILLS' | 'EXPOSURE_ONLY' | 'CREDITED' | 'HOLD';
export type SkillAttributionPromptDeliveryState =
  | 'CURRENT'
  | 'LEGACY_RECEIPT'
  | 'LEGACY_FALLBACK'
  | 'HOLD';

export interface HostValidatedSkillApplicationEvidence {
  readonly authority: 'host-validated';
  readonly evidenceDigest: string;
  readonly skillIds: readonly string[];
}

export interface BuildSkillAttributionReceiptInput {
  readonly sprintId: string;
  readonly logicalTaskId: string;
  readonly resolvingAttemptId: string;
  readonly routingDecisionDigest: string | null;
  readonly skillEvidenceDigest: string | null;
  readonly logicalSettlementDigest: string;
  readonly promptDeliveryState: SkillAttributionPromptDeliveryState;
  readonly selectedSkillIds: readonly string[];
  readonly deliveredSkillIds: readonly string[];
  readonly appliedEvidence?: HostValidatedSkillApplicationEvidence;
}

export type SkillAttributionReasonCode =
  | 'no-skills-selected-or-delivered'
  | 'routing-decision-evidence-missing'
  | 'prompt-delivery-authority-unavailable'
  | 'delivered-skill-not-selected'
  | 'causal-application-evidence-missing'
  | 'applied-skill-not-delivered'
  | 'host-validated-causal-evidence';

export interface SkillAttributionReceipt {
  readonly schemaVersion: typeof SKILL_ATTRIBUTION_RECEIPT_VERSION;
  readonly kind: 'skill-attribution-receipt';
  readonly sprintId: string;
  readonly logicalTaskId: string;
  readonly resolvingAttemptId: string;
  readonly routingDecisionDigest: string | null;
  readonly skillEvidenceDigest: string | null;
  readonly logicalSettlementDigest: string;
  readonly promptDeliveryState: SkillAttributionPromptDeliveryState;
  readonly selectedSkillIds: readonly string[];
  readonly deliveredSkillIds: readonly string[];
  readonly appliedSkillIds: readonly string[];
  readonly creditedSkillIds: readonly string[];
  readonly appliedEvidenceDigest: string | null;
  readonly state: SkillAttributionState;
  readonly reasonCode: SkillAttributionReasonCode;
  readonly receiptDigest: string;
}

export interface SkillAttributionBatch {
  readonly schemaVersion: typeof SKILL_ATTRIBUTION_BATCH_VERSION;
  readonly kind: 'skill-attribution-batch';
  readonly sprintId: string;
  readonly receipts: readonly SkillAttributionReceipt[];
  readonly batchDigest: string;
}

export class SkillAttributionConflictError extends DeckentError {
  constructor(sprintId: string) {
    super(
      'SKILL_ATTRIBUTION_BATCH_CONFLICT',
      `Skill attribution batch conflict for ${sprintId}`,
      'The sprint already has a different immutable attribution batch. Preserve both evidence sets and reconcile the logical settlement lineage before retrying.',
    );
    this.name = 'SkillAttributionConflictError';
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value as never)).digest('hex')}`;
}

function ids(values: readonly string[]): string[] {
  return [...new Set(values.filter(value => typeof value === 'string' && value.length > 0))].sort();
}

function subset(left: readonly string[], right: readonly string[]): boolean {
  const allowed = new Set(right);
  return left.every(value => allowed.has(value));
}

const RECEIPT_KEYS = Object.freeze([
  'appliedEvidenceDigest', 'appliedSkillIds', 'creditedSkillIds', 'deliveredSkillIds',
  'kind', 'logicalSettlementDigest', 'logicalTaskId', 'promptDeliveryState',
  'reasonCode', 'receiptDigest', 'resolvingAttemptId', 'routingDecisionDigest',
  'schemaVersion', 'selectedSkillIds', 'skillEvidenceDigest', 'sprintId', 'state',
].sort());

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isCanonicalIds(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.every(item => typeof item === 'string' && item.length > 0)
    && JSON.stringify(value) === JSON.stringify(ids(value));
}

function assertReceiptIntegrity(receipt: SkillAttributionReceipt, sprintId: string): void {
  const keys = Object.keys(receipt).sort();
  const { receiptDigest, ...unsigned } = receipt;
  const validState = ['NO_SKILLS', 'EXPOSURE_ONLY', 'CREDITED', 'HOLD'].includes(receipt.state);
  const validPromptState = ['CURRENT', 'LEGACY_RECEIPT', 'LEGACY_FALLBACK', 'HOLD']
    .includes(receipt.promptDeliveryState);
  if (
    JSON.stringify(keys) !== JSON.stringify(RECEIPT_KEYS)
    || receipt.schemaVersion !== SKILL_ATTRIBUTION_RECEIPT_VERSION
    || receipt.kind !== 'skill-attribution-receipt'
    || receipt.sprintId !== sprintId
    || typeof receipt.logicalTaskId !== 'string' || receipt.logicalTaskId.length === 0
    || typeof receipt.resolvingAttemptId !== 'string' || receipt.resolvingAttemptId.length === 0
    || !isDigest(receipt.logicalSettlementDigest)
    || (receipt.routingDecisionDigest !== null && !isDigest(receipt.routingDecisionDigest))
    || (receipt.skillEvidenceDigest !== null && !isDigest(receipt.skillEvidenceDigest))
    || (receipt.appliedEvidenceDigest !== null && !isDigest(receipt.appliedEvidenceDigest))
    || !validState || !validPromptState
    || !isCanonicalIds(receipt.selectedSkillIds)
    || !isCanonicalIds(receipt.deliveredSkillIds)
    || !isCanonicalIds(receipt.appliedSkillIds)
    || !isCanonicalIds(receipt.creditedSkillIds)
    || (receipt.reasonCode !== 'delivered-skill-not-selected'
      && !subset(receipt.deliveredSkillIds, receipt.selectedSkillIds))
    || (receipt.reasonCode !== 'applied-skill-not-delivered'
      && !subset(receipt.appliedSkillIds, receipt.deliveredSkillIds))
    || !subset(receipt.creditedSkillIds, receipt.appliedSkillIds)
    || !isDigest(receiptDigest)
    || digest(unsigned) !== receiptDigest
  ) throw new SkillAttributionConflictError(sprintId);

  const expectedReasonByState: Readonly<Record<SkillAttributionState, readonly SkillAttributionReasonCode[]>> = {
    NO_SKILLS: ['no-skills-selected-or-delivered'],
    EXPOSURE_ONLY: ['causal-application-evidence-missing'],
    CREDITED: ['host-validated-causal-evidence'],
    HOLD: [
      'routing-decision-evidence-missing',
      'prompt-delivery-authority-unavailable',
      'delivered-skill-not-selected',
      'applied-skill-not-delivered',
    ],
  };
  if (!expectedReasonByState[receipt.state].includes(receipt.reasonCode)) {
    throw new SkillAttributionConflictError(sprintId);
  }
  if (
    (receipt.state === 'NO_SKILLS'
      && (receipt.selectedSkillIds.length > 0 || receipt.deliveredSkillIds.length > 0
        || receipt.appliedSkillIds.length > 0 || receipt.creditedSkillIds.length > 0))
    || (receipt.state === 'EXPOSURE_ONLY'
      && (receipt.appliedSkillIds.length > 0 || receipt.creditedSkillIds.length > 0
        || receipt.appliedEvidenceDigest !== null))
    || (receipt.state === 'CREDITED'
      && (receipt.creditedSkillIds.length === 0
        || JSON.stringify(receipt.creditedSkillIds) !== JSON.stringify(receipt.appliedSkillIds)
        || receipt.appliedEvidenceDigest === null))
    || (receipt.state === 'HOLD' && receipt.creditedSkillIds.length > 0)
  ) throw new SkillAttributionConflictError(sprintId);
}

function finalizeReceipt(
  input: BuildSkillAttributionReceiptInput,
  state: SkillAttributionState,
  reasonCode: SkillAttributionReasonCode,
  appliedSkillIds: readonly string[],
  creditedSkillIds: readonly string[],
): SkillAttributionReceipt {
  const unsigned = {
    schemaVersion: SKILL_ATTRIBUTION_RECEIPT_VERSION,
    kind: 'skill-attribution-receipt' as const,
    sprintId: input.sprintId,
    logicalTaskId: input.logicalTaskId,
    resolvingAttemptId: input.resolvingAttemptId,
    routingDecisionDigest: input.routingDecisionDigest,
    skillEvidenceDigest: input.skillEvidenceDigest,
    logicalSettlementDigest: input.logicalSettlementDigest,
    promptDeliveryState: input.promptDeliveryState,
    selectedSkillIds: ids(input.selectedSkillIds),
    deliveredSkillIds: ids(input.deliveredSkillIds),
    appliedSkillIds: ids(appliedSkillIds),
    creditedSkillIds: ids(creditedSkillIds),
    appliedEvidenceDigest: input.appliedEvidence?.evidenceDigest ?? null,
    state,
    reasonCode,
  };
  return Object.freeze({ ...unsigned, receiptDigest: digest(unsigned) });
}

/**
 * Build the only skill efficacy-credit authority. Selection and prompt delivery
 * are exposure facts; task success alone never becomes skill efficacy. Credit
 * requires a host-validated application receipt and cannot exceed delivery.
 */
export function buildSkillAttributionReceipt(
  input: BuildSkillAttributionReceiptInput,
): SkillAttributionReceipt {
  const selected = ids(input.selectedSkillIds);
  const delivered = ids(input.deliveredSkillIds);
  if (selected.length === 0 && delivered.length === 0) {
    return finalizeReceipt(input, 'NO_SKILLS', 'no-skills-selected-or-delivered', [], []);
  }
  if (!input.routingDecisionDigest || !input.skillEvidenceDigest || !input.logicalSettlementDigest) {
    return finalizeReceipt(input, 'HOLD', 'routing-decision-evidence-missing', [], []);
  }
  if (input.promptDeliveryState !== 'CURRENT') {
    return finalizeReceipt(input, 'HOLD', 'prompt-delivery-authority-unavailable', [], []);
  }
  if (!subset(delivered, selected)) {
    return finalizeReceipt(input, 'HOLD', 'delivered-skill-not-selected', [], []);
  }
  if (!input.appliedEvidence) {
    return finalizeReceipt(input, 'EXPOSURE_ONLY', 'causal-application-evidence-missing', [], []);
  }
  const applied = ids(input.appliedEvidence.skillIds);
  if (!subset(applied, delivered)) {
    return finalizeReceipt(input, 'HOLD', 'applied-skill-not-delivered', applied, []);
  }
  return finalizeReceipt(input, 'CREDITED', 'host-validated-causal-evidence', applied, applied);
}

function batchPath(projectRoot: string, sprintId: string): string {
  const safe = sprintId.replace(/[^A-Za-z0-9._-]/g, '_');
  return join(projectRoot, SKILL_ATTRIBUTION_DIR, `${safe}.json`);
}

function finalizeBatch(sprintId: string, receipts: readonly SkillAttributionReceipt[]): SkillAttributionBatch {
  const ordered = [...receipts].sort((a, b) =>
    a.logicalTaskId.localeCompare(b.logicalTaskId)
    || a.resolvingAttemptId.localeCompare(b.resolvingAttemptId));
  for (const receipt of ordered) assertReceiptIntegrity(receipt, sprintId);
  const duplicate = ordered.find((receipt, index) =>
    index > 0 && ordered[index - 1]!.logicalTaskId === receipt.logicalTaskId);
  if (duplicate) {
    throw new SkillAttributionConflictError(sprintId);
  }
  const unsigned = {
    schemaVersion: SKILL_ATTRIBUTION_BATCH_VERSION,
    kind: 'skill-attribution-batch' as const,
    sprintId,
    receipts: ordered,
  };
  return Object.freeze({ ...unsigned, batchDigest: digest(unsigned) });
}

function parseBatch(raw: string, expectedSprintId: string): SkillAttributionBatch {
  try {
    const parsed = JSON.parse(raw) as SkillAttributionBatch;
    if (
      parsed?.schemaVersion !== SKILL_ATTRIBUTION_BATCH_VERSION
      || parsed.kind !== 'skill-attribution-batch'
      || parsed.sprintId !== expectedSprintId
      || !Array.isArray(parsed.receipts)
      || !isDigest(parsed.batchDigest)
      || JSON.stringify(Object.keys(parsed).sort())
        !== JSON.stringify(['batchDigest', 'kind', 'receipts', 'schemaVersion', 'sprintId'])
    ) throw new SkillAttributionConflictError(expectedSprintId);
    const rebuilt = finalizeBatch(parsed.sprintId, parsed.receipts);
    if (
      rebuilt.batchDigest !== parsed.batchDigest
      || canonicalJson(rebuilt.receipts as never) !== canonicalJson(parsed.receipts as never)
    ) throw new SkillAttributionConflictError(expectedSprintId);
    return parsed;
  } catch (error) {
    if (error instanceof SkillAttributionConflictError) throw error;
    throw new SkillAttributionConflictError(expectedSprintId);
  }
}

export function readSkillAttributionBatch(
  projectRoot: string,
  sprintId: string,
): SkillAttributionBatch | null {
  const target = batchPath(projectRoot, sprintId);
  if (!existsSync(target)) return null;
  return parseBatch(readFileSync(target, 'utf8'), sprintId);
}

export type SkillAttributionBatchWriteResult = {
  readonly state: 'written' | 'replayed';
  readonly path: string;
  readonly bytes: string;
  readonly batchDigest: string;
  readonly batch: SkillAttributionBatch;
};

export function writeSkillAttributionBatch(
  projectRoot: string,
  sprintId: string,
  receipts: readonly SkillAttributionReceipt[],
): SkillAttributionBatchWriteResult {
  const batch = finalizeBatch(sprintId, receipts);
  const target = batchPath(projectRoot, sprintId);
  const bytes = `${canonicalJson(batch as never)}\n`;
  if (existsSync(target)) {
    const existingBytes = readFileSync(target, 'utf8');
    const existing = parseBatch(existingBytes, sprintId);
    if (existing.batchDigest !== batch.batchDigest || existingBytes !== bytes) {
      throw new SkillAttributionConflictError(sprintId);
    }
    return { state: 'replayed', path: target, bytes, batchDigest: batch.batchDigest, batch: existing };
  }

  try {
    writeOperationFileAtomic(target, bytes);
  } catch (error) {
    if (existsSync(target)) {
      const existing = readSkillAttributionBatch(projectRoot, sprintId);
      if (existing?.batchDigest === batch.batchDigest) {
        const existingBytes = readFileSync(target, 'utf8');
        if (existingBytes === bytes) {
          return { state: 'replayed', path: target, bytes, batchDigest: batch.batchDigest, batch: existing };
        }
      }
      throw new SkillAttributionConflictError(sprintId);
    }
    throw error;
  }
  return { state: 'written', path: target, bytes, batchDigest: batch.batchDigest, batch };
}
