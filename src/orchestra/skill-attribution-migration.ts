import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from '../core/audit-writer.js';
import { DeckentError } from '../core/errors.js';
import { writeOperationFileAtomic } from '../core/operation-file-authority.js';
import {
  deriveLegacySkillQuarantineSnapshot,
  OutcomeTracker,
  type LearningsData,
} from './outcome-tracker.js';
import { persistCatalogStatsSkillAttributionCutover } from './sprint-finalizer.js';

export const SKILL_ATTRIBUTION_CUTOVER_ID = 'skill-attribution-cutover-v1' as const;
export const SKILL_ATTRIBUTION_MIGRATION_RECEIPT_VERSION = 1 as const;

const LEARNINGS_PATH = join('.deckent', 'routing', 'learnings.json');
const STATS_PATH = join('.deckent', 'stats', 'catalog-stats.json');
const RECEIPT_PATH = join('.deckent', 'routing', 'skill-attribution', 'cutover-v1.json');

export interface SkillAttributionLegacyInventory {
  learningsSkillIds: number;
  learningsHistoryIds: number;
  learningsSynergyRows: number;
  learningsEvolvedSkillRules: number;
  sidecarSkillIds: number;
}

export interface SkillAttributionMigrationInspection {
  state: 'READY' | 'ALREADY_APPLIED' | 'HOLD';
  cutoverId: typeof SKILL_ATTRIBUTION_CUTOVER_ID;
  sourceDigests: { learnings: string | null; catalogStats: string | null };
  inventory: SkillAttributionLegacyInventory;
  reasons: string[];
}

export interface SkillAttributionMigrationReceipt {
  schemaVersion: typeof SKILL_ATTRIBUTION_MIGRATION_RECEIPT_VERSION;
  kind: 'skill-attribution-migration-receipt';
  cutoverId: typeof SKILL_ATTRIBUTION_CUTOVER_ID;
  sourceDigests: SkillAttributionMigrationInspection['sourceDigests'];
  inventory: SkillAttributionLegacyInventory;
  learningsQuarantineDigest: string | null;
  sidecarQuarantineDigest: string | null;
  state: 'PREPARED' | 'COMMITTED';
  receiptDigest: string;
}

export class SkillAttributionMigrationError extends DeckentError {
  constructor(detail: string) {
    super(
      'SKILL_ATTRIBUTION_MIGRATION_HOLD',
      `Skill attribution migration HOLD: ${detail}`,
      'Repair the malformed source or conflicting receipt without deleting it, then rerun the explicit migration.',
    );
    this.name = 'SkillAttributionMigrationError';
  }
}

function digestBytes(bytes: string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digestValue(value: unknown): string {
  return digestBytes(canonicalJson(value as never));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readJsonSource(
  projectRoot: string,
  relativePath: string,
): { bytes: string | null; value: Record<string, unknown>; error: string | null } {
  const path = join(projectRoot, relativePath);
  if (!existsSync(path)) return { bytes: null, value: {}, error: null };
  try {
    const bytes = readFileSync(path, 'utf8');
    const value = record(JSON.parse(bytes));
    return value
      ? { bytes, value, error: null }
      : { bytes, value: {}, error: `${relativePath}: root is not an object` };
  } catch (error) {
    return {
      bytes: null,
      value: {},
      error: `${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function isSkillRule(value: unknown): boolean {
  return record(value)?.['entityType'] === 'skill';
}

function inventory(
  learnings: Record<string, unknown>,
  stats: Record<string, unknown>,
): SkillAttributionLegacyInventory {
  const evolvedRules = Array.isArray(learnings['evolvedRules']) ? learnings['evolvedRules'] : [];
  const synergy = Array.isArray(learnings['synergyMatrix']) ? learnings['synergyMatrix'] : [];
  return {
    learningsSkillIds: Object.keys(record(learnings['skillPerformance']) ?? {}).length,
    learningsHistoryIds: Object.keys(record(learnings['skillSprintHistory']) ?? {}).length,
    learningsSynergyRows: synergy.length,
    learningsEvolvedSkillRules: evolvedRules.filter(isSkillRule).length,
    sidecarSkillIds: Object.keys(record(stats['skills']) ?? {}).length,
  };
}

function hasCausalAuthority(
  learnings: Record<string, unknown>,
  stats: Record<string, unknown>,
): boolean {
  return record(learnings['skillAttributionAuthority'])?.['mode'] === 'causal-receipt-v1'
    && record(stats['skillAttribution'])?.['authority'] === 'causal-receipt-v1';
}

function expectedQuarantineDigests(
  learningsBytes: string | null,
  learnings: Record<string, unknown>,
  statsBytes: string | null,
  stats: Record<string, unknown>,
): { learnings: string | null; catalogStats: string | null } {
  const legacySnapshot = deriveLegacySkillQuarantineSnapshot(
    learnings as Partial<LearningsData>,
  );
  const legacySkills = record(stats['skills']) ?? {};
  return {
    learnings: learningsBytes === null
      ? null
      : digestValue(legacySnapshot),
    catalogStats: statsBytes === null || Object.keys(legacySkills).length === 0
      ? null
      : digestValue(legacySkills),
  };
}

export function inspectSkillAttributionMigration(
  projectRoot: string,
): SkillAttributionMigrationInspection {
  const learnings = readJsonSource(projectRoot, LEARNINGS_PATH);
  const stats = readJsonSource(projectRoot, STATS_PATH);
  const reasons = [learnings.error, stats.error].filter((value): value is string => value !== null);
  return {
    state: reasons.length > 0
      ? 'HOLD'
      : hasCausalAuthority(learnings.value, stats.value)
        ? 'ALREADY_APPLIED'
        : 'READY',
    cutoverId: SKILL_ATTRIBUTION_CUTOVER_ID,
    sourceDigests: {
      learnings: learnings.bytes === null ? null : digestBytes(learnings.bytes),
      catalogStats: stats.bytes === null ? null : digestBytes(stats.bytes),
    },
    inventory: inventory(learnings.value, stats.value),
    reasons,
  };
}

function parseReceipt(raw: string): SkillAttributionMigrationReceipt {
  try {
    const parsed = JSON.parse(raw) as SkillAttributionMigrationReceipt;
    const { receiptDigest, ...unsigned } = parsed;
    if (
      parsed.schemaVersion !== SKILL_ATTRIBUTION_MIGRATION_RECEIPT_VERSION
      || parsed.kind !== 'skill-attribution-migration-receipt'
      || parsed.cutoverId !== SKILL_ATTRIBUTION_CUTOVER_ID
      || (parsed.state !== 'PREPARED' && parsed.state !== 'COMMITTED')
      || receiptDigest !== digestValue(unsigned)
    ) throw new Error('receipt integrity mismatch');
    return parsed;
  } catch (error) {
    throw new SkillAttributionMigrationError(
      `migration receipt is malformed or conflicting: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function finalizeReceipt(
  input: Omit<SkillAttributionMigrationReceipt, 'receiptDigest' | 'state'>,
  state: SkillAttributionMigrationReceipt['state'],
): SkillAttributionMigrationReceipt {
  const unsigned = { ...input, state };
  return { ...unsigned, receiptDigest: digestValue(unsigned) };
}

function writeReceiptAtomic(path: string, receipt: SkillAttributionMigrationReceipt): void {
  writeOperationFileAtomic(path, `${canonicalJson(receipt as never)}\n`);
}

/**
 * Persist the source identity before either mutable projection changes. A
 * PREPARED receipt is intentionally resumable: each target must still match
 * either its original digest or the exact expected quarantine identity.
 */
export function prepareSkillAttributionMigration(
  projectRoot: string,
): SkillAttributionMigrationReceipt {
  const receiptPath = join(projectRoot, RECEIPT_PATH);
  if (existsSync(receiptPath)) return parseReceipt(readFileSync(receiptPath, 'utf8'));

  const inspection = inspectSkillAttributionMigration(projectRoot);
  if (inspection.state === 'HOLD') {
    throw new SkillAttributionMigrationError(inspection.reasons.join('; '));
  }

  // Without the source-bound PREPARED receipt, an already-mutated projection
  // cannot truthfully reconstruct the legacy source identity.
  if (inspection.state === 'ALREADY_APPLIED') {
    throw new SkillAttributionMigrationError(
      'causal authority exists without a prepared or committed cutover receipt',
    );
  }

  const learnings = readJsonSource(projectRoot, LEARNINGS_PATH);
  const stats = readJsonSource(projectRoot, STATS_PATH);
  const expected = expectedQuarantineDigests(
    learnings.bytes, learnings.value, stats.bytes, stats.value,
  );
  const prepared = finalizeReceipt({
    schemaVersion: SKILL_ATTRIBUTION_MIGRATION_RECEIPT_VERSION,
    kind: 'skill-attribution-migration-receipt',
    cutoverId: inspection.cutoverId,
    sourceDigests: inspection.sourceDigests,
    inventory: inspection.inventory,
    learningsQuarantineDigest: expected.learnings,
    sidecarQuarantineDigest: expected.catalogStats,
  }, 'PREPARED');
  writeReceiptAtomic(receiptPath, prepared);
  return parseReceipt(readFileSync(receiptPath, 'utf8'));
}

function sourceProjectionState(
  source: ReturnType<typeof readJsonSource>,
  sourceDigest: string | null,
  expectedQuarantineDigest: string | null,
  projection: 'learnings' | 'catalogStats',
): 'SOURCE' | 'PROJECTED' {
  if (source.error) throw new SkillAttributionMigrationError(source.error);
  const currentDigest = source.bytes === null ? null : digestBytes(source.bytes);
  if (currentDigest === sourceDigest) return 'SOURCE';
  const authority = projection === 'learnings'
    ? record(source.value['skillAttributionAuthority'])
    : record(source.value['skillAttribution']);
  const isCausal = projection === 'learnings'
    ? authority?.['mode'] === 'causal-receipt-v1'
    : authority?.['authority'] === 'causal-receipt-v1';
  if (isCausal && (authority?.['legacyQuarantineDigest'] ?? null) === expectedQuarantineDigest) {
    return 'PROJECTED';
  }
  throw new SkillAttributionMigrationError(
    `${projection} changed after PREPARED receipt and does not match the expected projection`,
  );
}

export function applySkillAttributionMigration(
  projectRoot: string,
): SkillAttributionMigrationReceipt {
  const receiptPath = join(projectRoot, RECEIPT_PATH);
  const prepared = prepareSkillAttributionMigration(projectRoot);
  if (prepared.state === 'COMMITTED') return prepared;

  const beforeLearnings = readJsonSource(projectRoot, LEARNINGS_PATH);
  const beforeStats = readJsonSource(projectRoot, STATS_PATH);
  const learningsState = sourceProjectionState(
    beforeLearnings,
    prepared.sourceDigests.learnings,
    prepared.learningsQuarantineDigest,
    'learnings',
  );
  const statsState = sourceProjectionState(
    beforeStats,
    prepared.sourceDigests.catalogStats,
    prepared.sidecarQuarantineDigest,
    'catalogStats',
  );

  if (learningsState === 'SOURCE') {
    const tracker = new OutcomeTracker(projectRoot);
    tracker.persistSkillAttributionCutover();
  }
  if (statsState === 'SOURCE') {
    persistCatalogStatsSkillAttributionCutover(projectRoot, prepared.cutoverId);
  }

  const learnings = readJsonSource(projectRoot, LEARNINGS_PATH);
  const stats = readJsonSource(projectRoot, STATS_PATH);
  if (
    learnings.error || stats.error
    || !hasCausalAuthority(learnings.value, stats.value)
  ) throw new SkillAttributionMigrationError('post-write causal authority verification failed');

  sourceProjectionState(
    learnings,
    prepared.sourceDigests.learnings,
    prepared.learningsQuarantineDigest,
    'learnings',
  );
  sourceProjectionState(
    stats,
    prepared.sourceDigests.catalogStats,
    prepared.sidecarQuarantineDigest,
    'catalogStats',
  );
  const { receiptDigest: _preparedDigest, state: _preparedState, ...identity } = prepared;
  const receipt = finalizeReceipt(identity, 'COMMITTED');
  writeReceiptAtomic(receiptPath, receipt);
  return parseReceipt(readFileSync(receiptPath, 'utf8'));
}
