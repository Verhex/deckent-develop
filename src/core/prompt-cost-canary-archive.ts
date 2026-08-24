/**
 * Read-only projection for a two-sprint prompt-cost canary.
 *
 * Authority is deliberately narrow: a verified, terminally sealed canonical
 * archive manifest; its task/result/evaluation members; and the finalizer's
 * manifest-bound terminal lineageUsage receipt. Live files, transcripts,
 * prose evidence, legacy archives, and reference-price estimates are ignored.
 */
import { lstatSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import type { LineageUsageAuthorityAggregate, LineageUsageAttempt } from './lineage-usage-authority.js';
import {
  parsePromptCostCanaryTaskAuthority,
  type PromptCostCanaryFeatureSnapshot,
  type PromptCostCanaryTaskAuthority,
} from './prompt-cost-canary-task-authority.js';
import {
  isSprintOwnedTaskArtifact,
  resolveSprintArchiveDir,
  SPRINT_ARCHIVE_MANIFEST_FILE,
  SPRINT_ARCHIVE_MANIFEST_KIND,
  SPRINT_ARCHIVE_MANIFEST_VERSION,
  verifySprintArchive,
  verifySprintArchiveTerminal,
  type SprintArchiveManifest,
  type SprintArchiveTerminalSealHoldReason,
} from './sprint-archive.js';

export type PromptCostCanaryArchiveRejectionReason =
  | 'invalid-cohort'
  | 'duplicate-sprint'
  | 'unverified-archive'
  | 'unsealed-archive'
  | 'invalid-manifest'
  | 'incomplete-lineage'
  | 'duplicate-artifact'
  | 'duplicate-attempt'
  | 'foreign-artifact'
  | 'mixed-authority'
  | 'invalid-artifact';

export interface PromptCostCanaryArchiveRejection {
  readonly reason: PromptCostCanaryArchiveRejectionReason;
  readonly sprintId?: string;
  readonly taskId?: string;
  readonly path?: string;
  readonly detail: string;
}

export interface PromptCostCanaryCohortSample {
  readonly sprintId: string;
  readonly logicalLineageId: string;
  readonly taskId: string;
  readonly attemptId: string;
  /** Number of exact terminal attempts in the logical lineage. */
  readonly attempt: number;
  readonly verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  readonly quality: number;
  readonly featureSnapshot: PromptCostCanaryFeatureSnapshot;
  readonly featureDigest: string;
  readonly workloadDigest: string;
  readonly tokenUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
    readonly totalTokens: number;
  };
  /** Every contributing provider/model, sorted and joined for cohort identity. */
  readonly provider: string;
  readonly model: string;
  readonly billingSource: {
    readonly tokenSource: string;
    readonly pricingSource: string;
    readonly billingMode: string | null;
    readonly terminalBillingAuthority: string | null;
  };
  readonly providerReportedUsd: {
    readonly available: boolean;
    readonly usd: number | null;
    readonly source: 'provider-envelope' | null;
  };
  /** Null is honest absence; the comparison kernel only requires it when configured. */
  readonly durationMs: number | null;
}

export type PromptCostCanaryArchiveReadResult =
  | {
    readonly ok: true;
    readonly sprintIds: readonly [string, string];
    readonly samples: readonly PromptCostCanaryCohortSample[];
  }
  | { readonly ok: false; readonly rejections: readonly PromptCostCanaryArchiveRejection[] };

export interface PromptCostCanaryArchiveReadOptions {
  readonly projectRoot: string;
  readonly sprintIds: readonly [string, string];
  readonly hotJournalPaths?: Readonly<Partial<Record<string, string>>>;
}

type JsonRecord = Record<string, unknown>;

interface TaskArtifact {
  readonly taskId: string;
  readonly fixForTaskId: string | null;
  readonly authority: PromptCostCanaryTaskAuthority;
}

interface ProviderBillingArtifact {
  readonly provider: string;
  readonly providerReportedUsd: number;
}

interface ResultArtifact {
  readonly taskId: string;
  readonly attemptId: string;
  readonly provider: string;
  readonly model: string;
  readonly tokenSource: string;
  readonly pricingSource: string;
  readonly billingMode: string | null;
  readonly durationMs: number | null;
  readonly tokenUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
  };
  readonly providerBilling: ProviderBillingArtifact | null;
}

interface EvaluationArtifact {
  readonly taskId: string;
  /** Evaluation identity is an exact execution attempt, never a filename ordinal. */
  readonly attemptId: string;
  readonly verdict: PromptCostCanaryCohortSample['verdict'];
  readonly quality: number;
}

interface TerminalArtifact {
  readonly receipt: JsonRecord;
  readonly lineageUsage: readonly LineageUsageAuthorityAggregate[];
}

const SPRINT_ID = /^sprint-(\d+)$/u;
// Canonical task names have no extension-like segments: landing/skill sidecars are
// manifest members, but never task authority. Result matching remains separate.
const TASK_PATH = /^tasks\/task-([^/.]+)\.json$/u;
const RESULT_PATH = /^tasks\/task-([^/.]+)\.result(?:\.json)?$/u;
const EVALUATION_PATH = /^evaluations\/(.+)\.json$/u;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function readJsonFile(path: string): unknown {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('not a regular archive file');
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseTask(value: unknown, pathTaskId: string): TaskArtifact | null {
  const item = record(value);
  if (!item || item['id'] !== pathTaskId) return null;
  const authority = parsePromptCostCanaryTaskAuthority(item['promptCostCanary']);
  if (!authority) return null;
  const fixFor = item['fixForTaskId'];
  if (fixFor !== undefined && fixFor !== null && typeof fixFor !== 'string') return null;
  return {
    taskId: pathTaskId,
    fixForTaskId: typeof fixFor === 'string' ? fixFor : null,
    authority,
  };
}

function parseProviderBilling(value: unknown, provider: string): ProviderBillingArtifact | null {
  const item = record(value);
  const usd = finiteNonNegative(item?.['providerReportedUsd']);
  return item?.['source'] === 'provider-envelope'
    && item['provider'] === provider
    && item['currency'] === 'USD'
    && usd !== null
    ? { provider, providerReportedUsd: usd }
    : null;
}

function parseResult(value: unknown, pathTaskId: string): ResultArtifact | null {
  const envelope = record(value);
  if (!envelope) return null;
  const item = record(envelope['result']) ?? envelope;
  if (item['taskId'] !== pathTaskId) return null;
  if (envelope['result'] !== undefined && envelope['taskId'] !== pathTaskId) return null;
  const attribution = record(item['workAttribution']);
  const attemptId = attribution?.['attemptId'] ?? envelope['attemptId'];
  if (typeof attemptId !== 'string' || attemptId.length === 0) return null;
  if (typeof attribution?.['attemptId'] === 'string'
      && typeof envelope['attemptId'] === 'string'
      && attribution['attemptId'] !== envelope['attemptId']) return null;
  const usage = record(item['tokenUsage']);
  const inputTokens = safeInteger(usage?.['inputTokens']);
  const outputTokens = safeInteger(usage?.['outputTokens']);
  const cacheReadTokens = safeInteger(usage?.['cacheReadTokens']);
  const cacheCreationTokens = safeInteger(usage?.['cacheCreationTokens']);
  const provider = item['provider'] ?? usage?.['provider'];
  const model = item['model'] ?? usage?.['model'];
  const tokenSource = usage?.['source'];
  if (inputTokens === null || outputTokens === null || cacheReadTokens === null
      || cacheCreationTokens === null || typeof provider !== 'string' || provider.length === 0
      || typeof model !== 'string' || model.length === 0
      || typeof tokenSource !== 'string' || tokenSource.length === 0) return null;
  const cost = record(item['cost']);
  const pricingSource = typeof cost?.['pricingSource'] === 'string' && cost['pricingSource'].length > 0
    ? cost['pricingSource']
    : 'unavailable';
  const billingMode = typeof cost?.['billingMode'] === 'string' ? cost['billingMode'] : null;
  const durationMs = item['durationMs'] === undefined ? null : finiteNonNegative(item['durationMs']);
  if (item['durationMs'] !== undefined && durationMs === null) return null;
  return {
    taskId: pathTaskId,
    attemptId,
    provider,
    model,
    tokenSource,
    pricingSource,
    billingMode,
    durationMs,
    tokenUsage: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens },
    providerBilling: parseProviderBilling(item['providerBilling'], provider),
  };
}

function normalizeVerdict(value: unknown): PromptCostCanaryCohortSample['verdict'] | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
  return normalized === 'DONE' || normalized === 'GO_WITH_TECH_DEBT' || normalized === 'NO_GO'
    ? normalized
    : null;
}

function parseEvaluation(value: unknown): EvaluationArtifact | null {
  const item = record(value);
  if (!item || typeof item['taskId'] !== 'string') return null;
  const attemptId = item['attemptId'];
  const verdict = normalizeVerdict(item['verdict'] ?? item['decision'] ?? item['evaluationDecision']);
  const quality = item['quality'] ?? item['totalScore'];
  if (typeof attemptId !== 'string' || attemptId.length === 0
      || !verdict || typeof quality !== 'number' || !Number.isFinite(quality)
      || quality < 0 || quality > 100) return null;
  return {
    taskId: item['taskId'],
    attemptId,
    verdict,
    quality,
  };
}

function parseAttempt(value: unknown): LineageUsageAttempt | null {
  const item = record(value);
  if (!item || typeof item['id'] !== 'string' || item['id'].length === 0
      || typeof item['taskId'] !== 'string' || item['taskId'].length === 0) return null;
  const inputTokens = safeInteger(item['inputTokens']);
  const outputTokens = safeInteger(item['outputTokens']);
  const cacheReadTokens = safeInteger(item['cacheReadTokens']);
  const cacheCreationTokens = safeInteger(item['cacheCreationTokens']);
  const referenceCostUsd = finiteNonNegative(item['referenceCostUsd']);
  if (inputTokens === null || outputTokens === null || cacheReadTokens === null
      || cacheCreationTokens === null || referenceCostUsd === null) return null;
  const fixForTaskId = item['fixForTaskId'];
  const logicalRootTaskId = item['logicalRootTaskId'];
  if ((fixForTaskId !== undefined && typeof fixForTaskId !== 'string')
      || (logicalRootTaskId !== undefined && typeof logicalRootTaskId !== 'string')) return null;
  const invoicedCostUsd = finiteNonNegative(item['invoicedCostUsd']);
  return {
    id: item['id'], taskId: item['taskId'], inputTokens, outputTokens,
    cacheReadTokens, cacheCreationTokens, referenceCostUsd,
    ...(typeof fixForTaskId === 'string' ? { fixForTaskId } : {}),
    ...(typeof logicalRootTaskId === 'string' ? { logicalRootTaskId } : {}),
    ...(invoicedCostUsd !== null ? { invoicedCostUsd } : {}),
  };
}

function parseLineage(value: unknown): LineageUsageAuthorityAggregate | null {
  const item = record(value);
  if (!item || typeof item['logicalRootTaskId'] !== 'string'
      || !Array.isArray(item['attempts']) || item['attempts'].length === 0) return null;
  const attempts = item['attempts'].map(parseAttempt);
  if (attempts.some(attempt => attempt === null)) return null;
  const typedAttempts = attempts as LineageUsageAttempt[];
  if (typedAttempts.some(attempt => attempt.logicalRootTaskId !== undefined
      && attempt.logicalRootTaskId !== item['logicalRootTaskId'])) return null;
  const usage = record(item['tokenUsage']);
  const inputTokens = safeInteger(usage?.['inputTokens']);
  const outputTokens = safeInteger(usage?.['outputTokens']);
  const cacheReadTokens = safeInteger(usage?.['cacheReadTokens']);
  const cacheCreationTokens = safeInteger(usage?.['cacheCreationTokens']);
  const referenceCostUsd = finiteNonNegative(item['referenceCostUsd']);
  if (inputTokens === null || outputTokens === null || cacheReadTokens === null
      || cacheCreationTokens === null || referenceCostUsd === null) return null;
  const sum = (key: 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheCreationTokens') =>
    typedAttempts.reduce((total, attempt) => total + attempt[key], 0);
  if (inputTokens !== sum('inputTokens') || outputTokens !== sum('outputTokens')
      || cacheReadTokens !== sum('cacheReadTokens')
      || cacheCreationTokens !== sum('cacheCreationTokens')) return null;
  const billed = record(item['billedUsd']);
  if (!billed || (billed['state'] !== 'known' && billed['state'] !== 'unknown')) return null;
  const knownUsd = finiteNonNegative(billed['usd']);
  const billedUsd = billed['state'] === 'known'
    ? knownUsd === null ? null : { state: 'known' as const, usd: knownUsd }
    : typeof billed['reason'] === 'string' ? { state: 'unknown' as const, reason: billed['reason'] } : null;
  if (!billedUsd) return null;
  const billingAuthority = item['billingAuthority'];
  if (billingAuthority !== null && typeof billingAuthority !== 'string') return null;
  return {
    logicalRootTaskId: item['logicalRootTaskId'],
    billingAuthority: billingAuthority as LineageUsageAuthorityAggregate['billingAuthority'],
    attempts: Object.freeze(typedAttempts),
    tokenUsage: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens },
    referenceCostUsd,
    billedUsd: billedUsd as LineageUsageAuthorityAggregate['billedUsd'],
  };
}

function parseTerminal(value: unknown, sprintId: string): TerminalArtifact | null {
  const item = record(value);
  const receipt = record(item?.['receipt']);
  if (!item || item['version'] !== 1 || !receipt || receipt['version'] !== 1
      || receipt['sprintId'] !== sprintId
      || (receipt['terminalOutcome'] !== 'COMPLETE' && receipt['terminalOutcome'] !== 'ABORTED')
      || item['terminalOutcome'] !== receipt['terminalOutcome']
      || !Array.isArray(item['lineageUsage'])) return null;
  const lineages = item['lineageUsage'].map(parseLineage);
  if (lineages.some(lineage => lineage === null)) return null;
  return { receipt, lineageUsage: lineages as LineageUsageAuthorityAggregate[] };
}

function reject(
  reason: PromptCostCanaryArchiveRejectionReason,
  detail: string,
  context: Omit<PromptCostCanaryArchiveRejection, 'reason' | 'detail'> = {},
): PromptCostCanaryArchiveRejection {
  return { reason, detail, ...context };
}

function readManifest(projectRoot: string, sprintId: string): SprintArchiveManifest | null {
  try {
    const value = readJsonFile(join(resolveSprintArchiveDir(projectRoot, sprintId), SPRINT_ARCHIVE_MANIFEST_FILE));
    const item = record(value);
    return item?.['kind'] === SPRINT_ARCHIVE_MANIFEST_KIND
      && item['schemaVersion'] === SPRINT_ARCHIVE_MANIFEST_VERSION
      && item['sprintId'] === sprintId
      && Array.isArray(item['artifacts'])
      ? value as SprintArchiveManifest
      : null;
  } catch {
    return null;
  }
}

function unique(values: readonly string[]): string {
  return [...new Set(values)].sort().join('+');
}

function exactUsage(result: ResultArtifact, attempt: LineageUsageAttempt): boolean {
  return result.tokenUsage.inputTokens === attempt.inputTokens
    && result.tokenUsage.outputTokens === attempt.outputTokens
    && result.tokenUsage.cacheReadTokens === attempt.cacheReadTokens
    && result.tokenUsage.cacheCreationTokens === attempt.cacheCreationTokens;
}

function readSprint(
  options: PromptCostCanaryArchiveReadOptions,
  sprintId: string,
): { samples: PromptCostCanaryCohortSample[]; rejections: PromptCostCanaryArchiveRejection[] } {
  let verified;
  try { verified = verifySprintArchive(options.projectRoot, sprintId); } catch (error) {
    return { samples: [], rejections: [reject('unverified-archive', String(error), { sprintId })] };
  }
  if (!verified.ok) return { samples: [], rejections: [reject('unverified-archive', 'canonical manifest verification failed', { sprintId })] };
  let terminalVerification;
  try {
    terminalVerification = verifySprintArchiveTerminal(
      options.projectRoot,
      sprintId,
      options.hotJournalPaths?.[sprintId],
    );
  } catch (error) {
    return { samples: [], rejections: [reject('unsealed-archive', String(error), { sprintId })] };
  }
  if (!terminalVerification.ok) return { samples: [], rejections: [reject(
    'unsealed-archive',
    (terminalVerification.reasonCodes as readonly SprintArchiveTerminalSealHoldReason[]).join(','),
    { sprintId },
  )] };
  const manifest = readManifest(options.projectRoot, sprintId);
  if (!manifest || terminalVerification.manifestDigest !== manifest.contentDigest
      || manifest.conflicts.length > 0) {
    return { samples: [], rejections: [reject(
      'invalid-manifest',
      'terminal authority and manifest do not bind the same conflict-free archive',
      { sprintId },
    )] };
  }

  const rejections: PromptCostCanaryArchiveRejection[] = [];
  const archiveDir = resolveSprintArchiveDir(options.projectRoot, sprintId);
  const tasks = new Map<string, TaskArtifact>();
  const results = new Map<string, ResultArtifact>();
  const resultsByAttemptId = new Map<string, ResultArtifact>();
  const evaluationsByAttemptId = new Map<string, EvaluationArtifact>();
  let sealedTerminalReceipt: JsonRecord | null = null;
  let terminalArtifact: TerminalArtifact | null = null;
  const exactTerminalPath = `${sprintId}-terminal-receipt.json`;
  const seenAttemptIds = new Set<string>();

  for (const artifact of [...manifest.artifacts].sort((a, b) => a.path.localeCompare(b.path))) {
    const normalized = posix.normalize(artifact.path);
    if (normalized !== artifact.path || normalized.startsWith('../') || normalized.startsWith('/')) {
      rejections.push(reject('foreign-artifact', 'manifest path escapes or is non-canonical', {
        sprintId, path: artifact.path,
      }));
      continue;
    }
    try {
      if (normalized === exactTerminalPath) {
        if (artifact.family !== 'run' || terminalArtifact) {
          throw new Error('terminal receipt role is duplicated or mislabeled');
        }
        terminalArtifact = parseTerminal(readJsonFile(join(archiveDir, artifact.path)), sprintId);
        if (!terminalArtifact) throw new Error('invalid canonical terminal lineage receipt');
        continue;
      }
      if (normalized === 'terminal-seal-receipt.json') {
        if (artifact.family !== 'run' || sealedTerminalReceipt) {
          throw new Error('terminal seal receipt role is duplicated or mislabeled');
        }
        const seal = record(readJsonFile(join(archiveDir, artifact.path)));
        sealedTerminalReceipt = record(seal?.['terminalReceipt']);
        if (!sealedTerminalReceipt) throw new Error('terminal seal receipt is invalid');
        continue;
      }
      const taskMatch = TASK_PATH.exec(normalized);
      const resultMatch = RESULT_PATH.exec(normalized);
      const evaluationMatch = EVALUATION_PATH.exec(normalized);
      if (!taskMatch && !resultMatch && !evaluationMatch) continue;
      const expectedFamily = evaluationMatch ? 'evaluations' : 'tasks';
      if (artifact.family !== expectedFamily) {
        rejections.push(reject('mixed-authority', `artifact is labeled ${artifact.family}, expected ${expectedFamily}`, {
          sprintId, path: artifact.path,
        }));
        continue;
      }
      const value = readJsonFile(join(archiveDir, artifact.path));
      if (taskMatch) {
        const pathTaskId = taskMatch[1]!;
        if (!isSprintOwnedTaskArtifact(`task-${pathTaskId}.json`, sprintId)) {
          rejections.push(reject('foreign-artifact', 'task identity is outside the sprint', {
            sprintId, taskId: pathTaskId, path: artifact.path,
          }));
          continue;
        }
        if (tasks.has(pathTaskId)) throw new Error('duplicate task artifact');
        const parsed = parseTask(value, pathTaskId);
        if (!parsed) throw new Error('invalid task or prompt-canary authority');
        tasks.set(pathTaskId, parsed);
      } else if (resultMatch) {
        const pathTaskId = resultMatch[1]!;
        if (!isSprintOwnedTaskArtifact(`task-${pathTaskId}.json`, sprintId)) {
          rejections.push(reject('foreign-artifact', 'result identity is outside the sprint', {
            sprintId, taskId: pathTaskId, path: artifact.path,
          }));
          continue;
        }
        if (results.has(pathTaskId)) throw new Error('duplicate result artifact');
        const parsed = parseResult(value, pathTaskId);
        if (!parsed) throw new Error('invalid result or exact attempt identity');
        if (seenAttemptIds.has(parsed.attemptId)) throw new Error('duplicate exact attempt identity');
        seenAttemptIds.add(parsed.attemptId);
        results.set(pathTaskId, parsed);
        resultsByAttemptId.set(parsed.attemptId, parsed);
      } else {
        const parsed = parseEvaluation(value);
        if (!parsed || !isSprintOwnedTaskArtifact(`task-${parsed.taskId}.json`, sprintId)) {
          throw new Error('invalid evaluation or task identity');
        }
        if (evaluationsByAttemptId.has(parsed.attemptId)) {
          throw new Error('duplicate evaluation exact attempt identity');
        }
        evaluationsByAttemptId.set(parsed.attemptId, parsed);
      }
    } catch (error) {
      rejections.push(reject('invalid-artifact', error instanceof Error ? error.message : String(error), {
        sprintId, path: artifact.path,
      }));
    }
  }

  if (!terminalArtifact || !sealedTerminalReceipt
      || canonicalJson(sealedTerminalReceipt) !== canonicalJson(terminalArtifact.receipt)) {
    rejections.push(reject('mixed-authority', 'terminal lineage receipt is absent or differs from its seal', { sprintId }));
  }
  if (rejections.length > 0 || !terminalArtifact) return { samples: [], rejections };

  const terminalAttemptIds = new Set<string>();
  const terminalRootIds = new Set<string>();
  const stableLineageIds = new Set<string>();
  const samples: PromptCostCanaryCohortSample[] = [];
  for (const lineage of [...terminalArtifact.lineageUsage]
    .sort((left, right) => left.logicalRootTaskId.localeCompare(right.logicalRootTaskId))) {
    if (terminalRootIds.has(lineage.logicalRootTaskId)) {
      rejections.push(reject('duplicate-artifact', 'terminal receipt repeats a logical root', {
        sprintId, taskId: lineage.logicalRootTaskId,
      }));
      continue;
    }
    terminalRootIds.add(lineage.logicalRootTaskId);
    const rootTask = tasks.get(lineage.logicalRootTaskId);
    if (!rootTask || rootTask.fixForTaskId !== null) {
      rejections.push(reject('incomplete-lineage', 'terminal logical root has no manifest-bound root task', {
        sprintId, taskId: lineage.logicalRootTaskId,
      }));
      continue;
    }
    if (stableLineageIds.has(rootTask.authority.logicalLineageId)) {
      rejections.push(reject('duplicate-artifact', 'two terminal roots share one stable workload identity', {
        sprintId, taskId: lineage.logicalRootTaskId,
      }));
      continue;
    }
    stableLineageIds.add(rootTask.authority.logicalLineageId);
    const lineageResults: ResultArtifact[] = [];
    const lineageEvaluations: EvaluationArtifact[] = [];
    let lineageInvalid = false;
    for (const attempt of lineage.attempts) {
      if (terminalAttemptIds.has(attempt.id)) {
        rejections.push(reject('duplicate-attempt', 'terminal receipt repeats an exact attempt identity', {
          sprintId, taskId: attempt.taskId,
        }));
        lineageInvalid = true;
        continue;
      }
      terminalAttemptIds.add(attempt.id);
      const task = tasks.get(attempt.taskId);
      const result = resultsByAttemptId.get(attempt.id);
      const evaluation = evaluationsByAttemptId.get(attempt.id);
      if (!task || !result || !evaluation) {
        rejections.push(reject('incomplete-lineage', 'every terminal attempt requires task, result, and exact-attempt evaluation members', {
          sprintId, taskId: attempt.taskId,
        }));
        lineageInvalid = true;
        continue;
      }
      const isRootAttempt = task.taskId === rootTask.taskId && task.fixForTaskId === null;
      const isDirectFixAttempt = task.fixForTaskId === rootTask.taskId;
      if ((isRootAttempt === isDirectFixAttempt)
          || task.authority.authorityDigest !== rootTask.authority.authorityDigest
          || result.taskId !== attempt.taskId
          || evaluation.taskId !== attempt.taskId
          || !exactUsage(result, attempt)) {
        rejections.push(reject('mixed-authority', 'task/result/evaluation/terminal exact attempt or logical root contract does not agree', {
          sprintId, taskId: attempt.taskId,
        }));
        lineageInvalid = true;
        continue;
      }
      lineageResults.push(result);
      lineageEvaluations.push(evaluation);
    }
    if (lineageInvalid || lineageResults.length !== lineage.attempts.length) continue;
    const selectedResult = lineageResults.at(-1)!;
    const selectedEvaluation = lineageEvaluations.at(-1)!;
    const allBillingAvailable = lineageResults.every(result => result.providerBilling !== null);
    const durationAvailable = lineageResults.every(result => result.durationMs !== null);
    const providerReportedUsd = allBillingAvailable
      ? lineageResults.reduce((total, result) => total + result.providerBilling!.providerReportedUsd, 0)
      : null;
    const durationMs = durationAvailable
      ? lineageResults.reduce((total, result) => total + result.durationMs!, 0)
      : null;
    const provider = unique(lineageResults.map(result => result.provider));
    const model = unique(lineageResults.map(result => result.model));
    if (!provider || !model) {
      rejections.push(reject('incomplete-lineage', 'provider/model identity is unavailable', {
        sprintId, taskId: selectedResult.taskId,
      }));
      continue;
    }
    const usage = lineage.tokenUsage;
    samples.push(Object.freeze({
      sprintId,
      logicalLineageId: rootTask.authority.logicalLineageId,
      taskId: selectedResult.taskId,
      attemptId: selectedResult.attemptId,
      attempt: lineage.attempts.length,
      verdict: selectedEvaluation.verdict,
      quality: selectedEvaluation.quality,
      featureSnapshot: rootTask.authority.featureSnapshot,
      featureDigest: rootTask.authority.featureDigest,
      workloadDigest: rootTask.authority.workloadDigest,
      tokenUsage: Object.freeze({
        ...usage,
        totalTokens: usage.inputTokens + usage.outputTokens
          + usage.cacheReadTokens + usage.cacheCreationTokens,
      }),
      provider,
      model,
      billingSource: Object.freeze({
        tokenSource: unique(lineageResults.map(result => result.tokenSource)),
        pricingSource: unique(lineageResults.map(result => result.pricingSource)),
        billingMode: unique(lineageResults.map(result => result.billingMode ?? 'unknown')),
        terminalBillingAuthority: lineage.billingAuthority,
      }),
      providerReportedUsd: Object.freeze({
        available: providerReportedUsd !== null,
        usd: providerReportedUsd,
        source: providerReportedUsd === null ? null : 'provider-envelope',
      }),
      durationMs,
    }));
  }

  const plannedRootIds = [...tasks.values()]
    .filter(task => task.fixForTaskId === null)
    .map(task => task.taskId)
    .sort();
  const settledRootIds = [...terminalRootIds].sort();
  if (canonicalJson(plannedRootIds) !== canonicalJson(settledRootIds)) {
    rejections.push(reject('incomplete-lineage', 'planned root task set differs from terminal lineage usage', {
      sprintId,
    }));
  }
  return rejections.length > 0 ? { samples: [], rejections } : { samples, rejections: [] };
}

export function readPromptCostCanaryArchiveCohort(
  options: PromptCostCanaryArchiveReadOptions,
): PromptCostCanaryArchiveReadResult {
  if (!Array.isArray(options.sprintIds) || options.sprintIds.length !== 2
      || options.sprintIds.some(id => typeof id !== 'string' || !SPRINT_ID.test(id))) {
    return { ok: false, rejections: [reject('invalid-cohort', 'exactly two canonical sprint ids are required')] };
  }
  if (options.sprintIds[0] === options.sprintIds[1]) {
    return { ok: false, rejections: [reject('duplicate-sprint', 'cohort sprint ids must be distinct')] };
  }
  const reads = options.sprintIds.map(sprintId => readSprint(options, sprintId));
  const rejections = reads.flatMap(read => read.rejections);
  const attemptIds = new Set<string>();
  for (const sample of reads.flatMap(read => read.samples)) {
    if (attemptIds.has(sample.attemptId)) {
      rejections.push(reject('duplicate-attempt', 'exact attempt identity occurs in both sprint cohorts', {
        sprintId: sample.sprintId, taskId: sample.taskId,
      }));
    }
    attemptIds.add(sample.attemptId);
  }
  if (rejections.length > 0) return { ok: false, rejections: Object.freeze(rejections) };
  return {
    ok: true,
    sprintIds: Object.freeze([...options.sprintIds]) as unknown as readonly [string, string],
    samples: Object.freeze(reads.flatMap(read => read.samples)),
  };
}
