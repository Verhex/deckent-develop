import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { canonicalJson } from '../audit-writer.js';
import { DeckentError } from '../errors.js';
import { writeOperationFileAtomic } from '../operation-file-authority.js';
import {
  SPRINT_TERMINAL_PUBLICATION_VERSION,
  type SprintTerminalReceiptV1,
} from '../sprint-terminal-publication.js';

export const SKILL_ATTRIBUTION_RECEIPT_VERSION = 1 as const;
export const SKILL_ATTRIBUTION_BATCH_VERSION = 1 as const;
export const SKILL_ATTRIBUTION_TERMINAL_BATCH_VERSION = 1 as const;
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

export interface SkillAttributionTerminalAuthorityV1 {
  readonly receipt: SprintTerminalReceiptV1;
  readonly exactCustodyDigestsDigest: string;
  readonly logicalWinnersDigest: string;
}

export interface SkillAttributionTerminalBatchV1 {
  readonly schemaVersion: typeof SKILL_ATTRIBUTION_TERMINAL_BATCH_VERSION;
  readonly kind: 'skill-attribution-terminal-batch';
  readonly sprintId: string;
  readonly terminalAuthorityDigest: string;
  readonly terminalReceipt: SprintTerminalReceiptV1;
  readonly exactCustodyDigestsDigest: string;
  readonly logicalWinnersDigest: string;
  readonly predecessorBatchDigest: string | null;
  readonly batch: SkillAttributionBatch;
  readonly recordDigest: string;
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

export class SkillAttributionTerminalPublicationError extends DeckentError {
  constructor(
    sprintId: string,
    readonly reasonCode:
      | 'INVALID_TERMINAL_AUTHORITY'
      | 'INCOMPATIBLE_PREDECESSOR'
      | 'DURABILITY_UNCONFIRMED'
      | 'PUBLICATION_CONFLICT',
  ) {
    super(
      'SKILL_ATTRIBUTION_TERMINAL_PUBLICATION_HOLD',
      `Terminal-bound skill attribution publication held for ${sprintId}: ${reasonCode}`,
      'Preserve every existing attribution artifact and retry only with the same verified terminal authority.',
    );
    this.name = 'SkillAttributionTerminalPublicationError';
  }
}

export type SkillAttributionIntegrityReason =
  | 'INVALID_DIGEST'
  | 'INVALID_RECEIPT'
  | 'INVALID_BATCH'
  | 'DUPLICATE_LOGICAL_TASK';

/** A malformed producer artifact is not a competing immutable publication. */
export class SkillAttributionIntegrityError extends DeckentError {
  constructor(
    sprintId: string,
    readonly reasonCode: SkillAttributionIntegrityReason,
  ) {
    super(
      'SKILL_ATTRIBUTION_BATCH_INTEGRITY_FAILED',
      `Skill attribution batch integrity check failed for ${sprintId}: ${reasonCode}`,
      'Preserve the artifact and repair or migrate it from trusted source evidence before retrying.',
    );
    this.name = 'SkillAttributionIntegrityError';
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

function isLegacyBareDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

/**
 * Skill-attribution V1 writes canonical algorithm-qualified digests. Bare
 * lowercase SHA-256 remains an explicit read/input compatibility form for
 * historical finalizer settlement producers; every new receipt normalizes it.
 */
export function canonicalizeSkillAttributionDigest(
  value: string,
  sprintId: string,
): string {
  if (isDigest(value)) return value;
  if (isLegacyBareDigest(value)) return `sha256:${value}`;
  throw new SkillAttributionIntegrityError(sprintId, 'INVALID_DIGEST');
}

function isCanonicalIds(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.every(item => typeof item === 'string' && item.length > 0)
    && JSON.stringify(value) === JSON.stringify(ids(value));
}

function assertReceiptIntegrity(
  receipt: SkillAttributionReceipt,
  sprintId: string,
  allowLegacyBareSettlementDigest = false,
): void {
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
    || (!isDigest(receipt.logicalSettlementDigest)
      && !(allowLegacyBareSettlementDigest && isLegacyBareDigest(receipt.logicalSettlementDigest)))
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
  ) throw new SkillAttributionIntegrityError(sprintId, 'INVALID_RECEIPT');

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
    throw new SkillAttributionIntegrityError(sprintId, 'INVALID_RECEIPT');
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
  ) throw new SkillAttributionIntegrityError(sprintId, 'INVALID_RECEIPT');
}

function finalizeReceipt(
  input: BuildSkillAttributionReceiptInput,
  state: SkillAttributionState,
  reasonCode: SkillAttributionReasonCode,
  appliedSkillIds: readonly string[],
  creditedSkillIds: readonly string[],
): SkillAttributionReceipt {
  const routingDecisionDigest = input.routingDecisionDigest === null
    ? null
    : canonicalizeSkillAttributionDigest(input.routingDecisionDigest, input.sprintId);
  const skillEvidenceDigest = input.skillEvidenceDigest === null
    ? null
    : canonicalizeSkillAttributionDigest(input.skillEvidenceDigest, input.sprintId);
  const logicalSettlementDigest = canonicalizeSkillAttributionDigest(
    input.logicalSettlementDigest,
    input.sprintId,
  );
  const appliedEvidenceDigest = input.appliedEvidence === undefined
    ? null
    : canonicalizeSkillAttributionDigest(input.appliedEvidence.evidenceDigest, input.sprintId);
  const unsigned = {
    schemaVersion: SKILL_ATTRIBUTION_RECEIPT_VERSION,
    kind: 'skill-attribution-receipt' as const,
    sprintId: input.sprintId,
    logicalTaskId: input.logicalTaskId,
    resolvingAttemptId: input.resolvingAttemptId,
    routingDecisionDigest,
    skillEvidenceDigest,
    logicalSettlementDigest,
    promptDeliveryState: input.promptDeliveryState,
    selectedSkillIds: ids(input.selectedSkillIds),
    deliveredSkillIds: ids(input.deliveredSkillIds),
    appliedSkillIds: ids(appliedSkillIds),
    creditedSkillIds: ids(creditedSkillIds),
    appliedEvidenceDigest,
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

function terminalBatchPath(
  projectRoot: string,
  sprintId: string,
  terminalAuthorityDigest: string,
): string {
  const safe = sprintId.replace(/[^A-Za-z0-9._-]/g, '_');
  return join(
    projectRoot,
    SKILL_ATTRIBUTION_DIR,
    `${safe}.terminal`,
    `${terminalAuthorityDigest.slice('sha256:'.length)}.json`,
  );
}

function finalizeBatch(
  sprintId: string,
  receipts: readonly SkillAttributionReceipt[],
  allowLegacyBareSettlementDigest = false,
): SkillAttributionBatch {
  const ordered = [...receipts].sort((a, b) =>
    a.logicalTaskId.localeCompare(b.logicalTaskId)
    || a.resolvingAttemptId.localeCompare(b.resolvingAttemptId));
  for (const receipt of ordered) {
    assertReceiptIntegrity(receipt, sprintId, allowLegacyBareSettlementDigest);
  }
  const duplicate = ordered.find((receipt, index) =>
    index > 0 && ordered[index - 1]!.logicalTaskId === receipt.logicalTaskId);
  if (duplicate) {
    throw new SkillAttributionIntegrityError(sprintId, 'DUPLICATE_LOGICAL_TASK');
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
    ) throw new SkillAttributionIntegrityError(expectedSprintId, 'INVALID_BATCH');
    const rebuilt = finalizeBatch(parsed.sprintId, parsed.receipts, true);
    if (
      rebuilt.batchDigest !== parsed.batchDigest
      || canonicalJson(rebuilt.receipts as never) !== canonicalJson(parsed.receipts as never)
    ) throw new SkillAttributionIntegrityError(expectedSprintId, 'INVALID_BATCH');
    return parsed;
  } catch (error) {
    if (
      error instanceof SkillAttributionConflictError
      || error instanceof SkillAttributionIntegrityError
    ) throw error;
    throw new SkillAttributionIntegrityError(expectedSprintId, 'INVALID_BATCH');
  }
}

function migrateLegacySettlementDigests(batch: SkillAttributionBatch): SkillAttributionBatch {
  const receipts = batch.receipts.map(receipt => {
    if (!isLegacyBareDigest(receipt.logicalSettlementDigest)) return receipt;
    const { receiptDigest: _legacyReceiptDigest, ...legacyUnsigned } = receipt;
    const unsigned = {
      ...legacyUnsigned,
      logicalSettlementDigest: canonicalizeSkillAttributionDigest(
        receipt.logicalSettlementDigest,
        batch.sprintId,
      ),
    };
    return Object.freeze({ ...unsigned, receiptDigest: digest(unsigned) });
  });
  return finalizeBatch(batch.sprintId, receipts);
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
    const hasLegacySettlementDigest = existing.receipts.some(receipt =>
      isLegacyBareDigest(receipt.logicalSettlementDigest));
    if (hasLegacySettlementDigest) {
      const migrated = migrateLegacySettlementDigests(existing);
      const migratedBytes = `${canonicalJson(migrated as never)}\n`;
      if (
        migrated.batchDigest !== batch.batchDigest
        || canonicalJson(migrated.receipts as never) !== canonicalJson(batch.receipts as never)
      ) {
        throw new SkillAttributionConflictError(sprintId);
      }
      // A verified historical batch is migrated only by an equivalent current
      // publication. Divergent evidence remains immutable-conflict authority.
      writeOperationFileAtomic(target, migratedBytes);
      return {
        state: 'replayed',
        path: target,
        bytes: migratedBytes,
        batchDigest: migrated.batchDigest,
        batch: migrated,
      };
    }
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

function assertTerminalAuthority(
  sprintId: string,
  batch: SkillAttributionBatch,
  authority: SkillAttributionTerminalAuthorityV1,
): string {
  const receipt = authority.receipt;
  if (
    JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify([
      'authorityVersion', 'coordinatorGeneration', 'logicalSettlementDigest',
      'priorAuthorityVersion', 'runId', 'sprintId', 'terminalOutcome', 'version',
    ])
    || receipt.version !== SPRINT_TERMINAL_PUBLICATION_VERSION
    || receipt.sprintId !== sprintId
    || receipt.terminalOutcome !== 'COMPLETE'
    || receipt.priorAuthorityVersion !== 0
    || receipt.authorityVersion !== 1
    || !Number.isSafeInteger(receipt.coordinatorGeneration)
    || receipt.coordinatorGeneration < 1
    || typeof receipt.runId !== 'string'
    || receipt.runId.length === 0
    || !/^[a-f0-9]{64}$/u.test(receipt.logicalSettlementDigest)
    || !isDigest(authority.exactCustodyDigestsDigest)
    || !isDigest(authority.logicalWinnersDigest)
    || batch.receipts.some(candidate => candidate.logicalSettlementDigest
      !== canonicalizeSkillAttributionDigest(receipt.logicalSettlementDigest, sprintId))
  ) {
    throw new SkillAttributionTerminalPublicationError(sprintId, 'INVALID_TERMINAL_AUTHORITY');
  }
  return digest({
    receipt,
    exactCustodyDigestsDigest: authority.exactCustodyDigestsDigest,
    logicalWinnersDigest: authority.logicalWinnersDigest,
  });
}

function sameAttributionSemantics(
  predecessor: SkillAttributionBatch,
  successor: SkillAttributionBatch,
): boolean {
  if (predecessor.receipts.length !== successor.receipts.length) return false;
  return predecessor.receipts.every((prior, index) => {
    const next = successor.receipts[index];
    if (!next) return false;
    const {
      logicalSettlementDigest: _priorLogicalSettlementDigest,
      receiptDigest: _priorReceiptDigest,
      ...priorSemantics
    } = prior;
    const {
      logicalSettlementDigest: _nextLogicalSettlementDigest,
      receiptDigest: _nextReceiptDigest,
      ...nextSemantics
    } = next;
    return canonicalJson(priorSemantics as never) === canonicalJson(nextSemantics as never);
  });
}

function finalizeTerminalBatch(
  sprintId: string,
  batch: SkillAttributionBatch,
  authority: SkillAttributionTerminalAuthorityV1,
  predecessorBatchDigest: string | null,
): SkillAttributionTerminalBatchV1 {
  const terminalAuthorityDigest = assertTerminalAuthority(sprintId, batch, authority);
  const unsigned = {
    schemaVersion: SKILL_ATTRIBUTION_TERMINAL_BATCH_VERSION,
    kind: 'skill-attribution-terminal-batch' as const,
    sprintId,
    terminalAuthorityDigest,
    terminalReceipt: authority.receipt,
    exactCustodyDigestsDigest: authority.exactCustodyDigestsDigest,
    logicalWinnersDigest: authority.logicalWinnersDigest,
    predecessorBatchDigest,
    batch,
  };
  return Object.freeze({ ...unsigned, recordDigest: digest(unsigned) });
}

function parseTerminalBatch(
  raw: string,
  expected: SkillAttributionTerminalBatchV1,
): SkillAttributionTerminalBatchV1 {
  try {
    const parsed = JSON.parse(raw) as SkillAttributionTerminalBatchV1;
    if (
      JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify([
        'batch', 'exactCustodyDigestsDigest', 'kind', 'logicalWinnersDigest',
        'predecessorBatchDigest', 'recordDigest', 'schemaVersion', 'sprintId',
        'terminalAuthorityDigest', 'terminalReceipt',
      ])
      || parsed.schemaVersion !== SKILL_ATTRIBUTION_TERMINAL_BATCH_VERSION
      || parsed.kind !== 'skill-attribution-terminal-batch'
      || parsed.sprintId !== expected.sprintId
      || parsed.terminalAuthorityDigest !== expected.terminalAuthorityDigest
      || parsed.exactCustodyDigestsDigest !== expected.exactCustodyDigestsDigest
      || parsed.logicalWinnersDigest !== expected.logicalWinnersDigest
      || parsed.predecessorBatchDigest !== expected.predecessorBatchDigest
      || !isDigest(parsed.recordDigest)
    ) throw new Error('invalid terminal batch');
    const parsedBatch = finalizeBatch(parsed.sprintId, parsed.batch.receipts);
    const rebuilt = finalizeTerminalBatch(
      parsed.sprintId,
      parsedBatch,
      {
        receipt: parsed.terminalReceipt,
        exactCustodyDigestsDigest: parsed.exactCustodyDigestsDigest,
        logicalWinnersDigest: parsed.logicalWinnersDigest,
      },
      parsed.predecessorBatchDigest,
    );
    if (
      parsed.batch.batchDigest !== parsedBatch.batchDigest
      || parsed.recordDigest !== rebuilt.recordDigest
      || canonicalJson(parsed as never) !== canonicalJson(rebuilt as never)
      || canonicalJson(parsed as never) !== canonicalJson(expected as never)
    ) throw new Error('terminal batch conflict');
    return parsed;
  } catch (error) {
    if (error instanceof SkillAttributionTerminalPublicationError) throw error;
    throw new SkillAttributionTerminalPublicationError(
      expected.sprintId,
      'PUBLICATION_CONFLICT',
    );
  }
}

function writeComplete(descriptor: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
    if (written <= 0) throw new Error('short write');
    offset += written;
  }
}

function requiredNoFollowFlag(sprintId: string): number {
  const flag = fsConstants.O_NOFOLLOW;
  if (typeof flag !== 'number' || flag === 0) {
    throw new SkillAttributionTerminalPublicationError(
      sprintId,
      'DURABILITY_UNCONFIRMED',
    );
  }
  return flag;
}

function readTerminalBatchNoFollow(
  path: string,
  expected: SkillAttributionTerminalBatchV1,
): { readonly bytes: Buffer; readonly dev: bigint; readonly ino: bigint } {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY | requiredNoFollowFlag(expected.sprintId),
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile()
      || opened.size < 1n
      || opened.size > 16n * 1024n * 1024n
      || (opened.mode & 0o077n) !== 0n
    ) throw new Error('invalid terminal batch file');
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (read <= 0) throw new Error('short read');
      offset += read;
    }
    parseTerminalBatch(bytes.toString('utf8'), expected);
    const current = lstatSync(path, { bigint: true });
    if (!current.isFile() || current.dev !== opened.dev || current.ino !== opened.ino) {
      throw new Error('terminal batch path identity changed');
    }
    return { bytes, dev: opened.dev, ino: opened.ino };
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function publishTerminalBatchFirstWriter(
  path: string,
  bytes: Buffer,
  expected: SkillAttributionTerminalBatchV1,
): 'written' | 'replayed' {
  const noFollowFlag = requiredNoFollowFlag(expected.sprintId);
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | null = null;
  let identity: { readonly dev: bigint; readonly ino: bigint } | null = null;
  let published = false;
  try {
    descriptor = openSync(
      temporary,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | noFollowFlag,
      0o600,
    );
    writeComplete(descriptor, bytes);
    fsyncSync(descriptor);
    const staged = fstatSync(descriptor, { bigint: true });
    if (!staged.isFile() || staged.size !== BigInt(bytes.length) || (staged.mode & 0o077n) !== 0n) {
      throw new Error('invalid staged file');
    }
    identity = { dev: staged.dev, ino: staged.ino };
    closeSync(descriptor);
    descriptor = null;
    try {
      linkSync(temporary, path);
      published = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const directoryDescriptor = openSync(parent, 'r');
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    const observed = readTerminalBatchNoFollow(path, expected);
    const observedBytes = observed.bytes;
    if (!observedBytes.equals(bytes)) {
      throw new SkillAttributionTerminalPublicationError(
        expected.sprintId,
        'PUBLICATION_CONFLICT',
      );
    }
    if (published && identity) {
      if (observed.dev !== identity.dev || observed.ino !== identity.ino) {
        throw new Error('published identity mismatch');
      }
    }
    return published ? 'written' : 'replayed';
  } catch (error) {
    if (error instanceof SkillAttributionTerminalPublicationError) throw error;
    throw new SkillAttributionTerminalPublicationError(
      expected.sprintId,
      'DURABILITY_UNCONFIRMED',
    );
  } finally {
    if (descriptor !== null) {
      try { closeSync(descriptor); } catch { /* preserve publication outcome */ }
    }
    try {
      const staged = lstatSync(temporary, { bigint: true });
      if (identity && staged.isFile() && staged.dev === identity.dev && staged.ino === identity.ino) {
        unlinkSync(temporary);
      }
    } catch { /* absent or foreign path; never remove it */ }
  }
}

export interface SkillAttributionTerminalBatchWriteResult {
  readonly state: 'written' | 'replayed';
  readonly path: string;
  readonly bytes: string;
  readonly batch: SkillAttributionBatch;
  readonly authority: SkillAttributionTerminalBatchV1;
}

/**
 * Publish current attribution only after a canonical COMPLETE receipt reread.
 * A compatible historical base remains immutable evidence; current authority
 * occupies a receipt-keyed no-replace slot.
 */
export function writeTerminalBoundSkillAttributionBatch(input: {
  readonly projectRoot: string;
  readonly sprintId: string;
  readonly receipts: readonly SkillAttributionReceipt[];
  readonly terminalAuthority: SkillAttributionTerminalAuthorityV1;
}): SkillAttributionTerminalBatchWriteResult {
  const batch = finalizeBatch(input.sprintId, input.receipts);
  const predecessor = readSkillAttributionBatch(input.projectRoot, input.sprintId);
  if (predecessor && !sameAttributionSemantics(predecessor, batch)) {
    throw new SkillAttributionTerminalPublicationError(
      input.sprintId,
      'INCOMPATIBLE_PREDECESSOR',
    );
  }
  const authority = finalizeTerminalBatch(
    input.sprintId,
    batch,
    input.terminalAuthority,
    predecessor?.batchDigest ?? null,
  );
  const path = terminalBatchPath(
    input.projectRoot,
    input.sprintId,
    digest(authority.terminalReceipt),
  );
  const bytes = `${canonicalJson(authority as never)}\n`;
  const state = publishTerminalBatchFirstWriter(path, Buffer.from(bytes, 'utf8'), authority);
  return Object.freeze({ state, path, bytes, batch, authority });
}
