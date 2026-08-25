import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { DeckentError } from './errors.js';

export const PROMPT_DELIVERY_RECEIPT_VERSION = 2 as const;

export type PromptInjectionChannel =
  | 'claude-system-prompt-file'
  | 'codex-model-instructions-file';

export interface PromptRuntimeDeliveryBinding {
  readonly attemptId: string;
  readonly provider: string;
  readonly coreArtifactPath: string;
  readonly coreSha256: string;
  readonly coreBytes: number;
  readonly roleProfile: string;
  readonly injectionChannel: PromptInjectionChannel;
  readonly contextSuppressionFlags: readonly string[];
  readonly providerArgvSha256: string;
}

export interface RenderedPromptSegment {
  readonly kind: string;
  readonly content: string;
}

export interface PromptDeliveryReceipt {
  readonly version: typeof PROMPT_DELIVERY_RECEIPT_VERSION;
  readonly taskId: string;
  readonly source: 'worker-prompt';
  readonly promptSha256: string;
  readonly promptCompilePlanId: string;
  readonly rolePolicyIdentity: string;
  readonly assignedAgentId: string | null;
  readonly deliveredAgentId: string | null;
  readonly personaSegmentSha256: string | null;
  readonly assignedSkillIds: readonly string[];
  readonly deliveredSkillIds: readonly string[];
  readonly forcedSkillIds: readonly string[];
  readonly undeliveredForcedSkillIds: readonly string[];
  readonly runtimeDelivery?: PromptRuntimeDeliveryBinding;
}

export interface PromptDeliveryReceiptInput {
  readonly taskId: string;
  readonly prompt: string;
  readonly promptCompilePlanId: string;
  readonly rolePolicyIdentity: string;
  readonly assignedAgentId?: string;
  readonly assignedSkillIds?: readonly string[];
  readonly forcedSkillIds?: readonly string[];
  readonly segments: readonly RenderedPromptSegment[];
}

export interface FinalizePromptDeliveryReceiptInput {
  readonly projectRoot: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly provider: string;
  readonly coreArtifactPath: string;
  readonly coreSha256: string;
  readonly coreBytes: number;
  readonly roleProfile: string;
  readonly injectionChannel: PromptInjectionChannel;
  readonly contextSuppressionFlags: readonly string[];
  /** Exact command string passed to the provider wrapper, before shell redirection. */
  readonly providerArgv: string;
}

export interface WorkerCoreArtifact {
  readonly path: string;
  readonly relativePath: string;
  readonly sha256: string;
  readonly bytes: number;
}

export type PromptDeliveryReceiptUnavailableReason =
  | 'missing'
  | 'malformed'
  | 'task-mismatch'
  | 'invalid-digest'
  | 'legacy-version';

export type PromptDeliveryReceiptRead =
  | { readonly state: 'AVAILABLE'; readonly receipt: PromptDeliveryReceipt }
  | { readonly state: 'HOLD'; readonly reason: PromptDeliveryReceiptUnavailableReason };

interface LegacySkillDeliveryReceipt {
  readonly version: 1;
  readonly taskId: string;
  readonly source: 'worker-prompt';
  readonly deliveredSkillIds: readonly string[];
  readonly assignedSkillIds: readonly string[];
  readonly forcedSkillIds: readonly string[];
  readonly undeliveredForcedSkillIds: readonly string[];
}

export type PromptDeliveryAttribution =
  | {
      readonly state: 'CURRENT';
      readonly agentId: string | null;
      readonly skillIds: readonly string[];
      readonly receipt: PromptDeliveryReceipt;
    }
  | {
      readonly state: 'LEGACY_RECEIPT';
      readonly agentId: string | null;
      readonly skillIds: readonly string[];
    }
  | {
      readonly state: 'LEGACY_FALLBACK';
      readonly agentId: string | null;
      readonly skillIds: readonly string[];
    }
  | {
      readonly state: 'HOLD';
      readonly agentId: null;
      readonly skillIds: readonly [];
      readonly reason: PromptDeliveryReceiptUnavailableReason;
    };

export interface ResolvePromptDeliveryAttributionInput {
  readonly projectRoot: string;
  readonly taskId: string;
  /** Fresh prompt-authority tasks may never degrade to assignment/result claims. */
  readonly requireCurrentReceipt: boolean;
  /** Compatibility only: used for tasks created before current receipts existed. */
  readonly legacyAgentId?: string | null;
  /** Compatibility only: used for tasks created before current receipts existed. */
  readonly legacySkillIds?: readonly string[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Publish immutable content-addressed core bytes, or fail closed on any collision. */
export function publishWorkerCoreArtifact(
  projectRoot: string,
  core: string,
): WorkerCoreArtifact {
  const bytes = Buffer.from(core, 'utf8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const relativePath = join('.tasks', `.worker-core-${digest}.md`);
  const path = join(projectRoot, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    // Publish only a complete inode and never replace an existing artifact.
    linkSync(temporary, path);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    const existing = readFileSync(path);
    if (existing.length !== bytes.length
      || createHash('sha256').update(existing).digest('hex') !== digest
      || !existing.equals(bytes)) {
      throw new DeckentError('WORKER_CORE_ARTIFACT_COLLISION', `WORKER_CORE_ARTIFACT_COLLISION:${path}`);
    }
  } finally {
    try { unlinkSync(temporary); } catch { /* absent after an early failure */ }
  }
  return { path, relativePath, sha256: digest, bytes: bytes.length };
}

function canonicalIds(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value): value is string => typeof value === 'string' && value.length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

function renderedSkillIds(segments: readonly RenderedPromptSegment[]): string[] {
  const ids: string[] = [];
  for (const segment of segments) {
    if (segment.kind !== 'skills') continue;
    for (const match of segment.content.matchAll(/^--- ([a-z0-9][a-z0-9-]*) ---$/gmu)) {
      ids.push(match[1]!);
    }
  }
  return canonicalIds(ids);
}

function renderedPersona(segments: readonly RenderedPromptSegment[]): { agentId: string | null; digest: string | null } {
  const personas = segments.filter(segment => segment.kind === 'persona');
  if (personas.length !== 1) return { agentId: null, digest: null };
  const segment = personas[0]!;
  const match = /^=== Agent: ([^=\n]+) ===(?:\n|$)/u.exec(segment.content);
  return match && match[1]!.trim().length > 0
    ? { agentId: match[1]!.trim(), digest: sha256(segment.content) }
    : { agentId: null, digest: null };
}

/** Builds the versioned authority exclusively from the final rendered artifact. */
export function buildPromptDeliveryReceipt(input: PromptDeliveryReceiptInput): PromptDeliveryReceipt {
  const deliveredSkillIds = renderedSkillIds(input.segments);
  const forcedSkillIds = canonicalIds(input.forcedSkillIds);
  const persona = renderedPersona(input.segments);
  return {
    version: PROMPT_DELIVERY_RECEIPT_VERSION,
    taskId: input.taskId,
    source: 'worker-prompt',
    promptSha256: sha256(input.prompt),
    promptCompilePlanId: input.promptCompilePlanId,
    rolePolicyIdentity: input.rolePolicyIdentity,
    assignedAgentId: input.assignedAgentId ?? null,
    deliveredAgentId: persona.agentId,
    personaSegmentSha256: persona.digest,
    assignedSkillIds: canonicalIds(input.assignedSkillIds),
    deliveredSkillIds,
    forcedSkillIds,
    undeliveredForcedSkillIds: forcedSkillIds.filter(id => !deliveredSkillIds.includes(id)),
  };
}

/** Stable path for the backward-compatible delivery-sidecar artifact class. */
export function promptDeliveryReceiptPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, '.tasks', `task-${taskId}.skill-delivery.json`);
}

/** Atomically publishes deterministic receipt bytes; a reader sees old or complete new bytes. */
export function writePromptDeliveryReceipt(projectRoot: string, receipt: PromptDeliveryReceipt): boolean {
  if (parseReceipt(receipt, receipt.taskId).state !== 'AVAILABLE') return false;
  const target = promptDeliveryReceiptPath(projectRoot, receipt.taskId);
  const temp = `${target}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(temp, `${JSON.stringify(receipt)}\n`, 'utf8');
    renameSync(temp, target);
    return true;
  } catch {
    try { unlinkSync(temp); } catch { /* best-effort cleanup */ }
    return false;
  }
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/** Current receipts are canonical: sorted, unique identifiers make their bytes stable. */
function isCanonicalIdArray(value: unknown): value is readonly string[] {
  return isStringArray(value)
    && value.every(item => item.length > 0)
    && JSON.stringify(value) === JSON.stringify(canonicalIds(value));
}

function validDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function validPromptCompilePlanId(value: unknown): value is string {
  return typeof value === 'string' && /^prompt-compile-plan:sha256:[a-f0-9]{64}$/u.test(value);
}

function parseReceipt(value: unknown, taskId: string): PromptDeliveryReceiptRead {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { state: 'HOLD', reason: 'malformed' };
  const record = value as Record<string, unknown>;
  if (record.taskId !== taskId) return { state: 'HOLD', reason: 'task-mismatch' };
  if (record.version !== PROMPT_DELIVERY_RECEIPT_VERSION || record.source !== 'worker-prompt') {
    return { state: 'HOLD', reason: record.version === 1 ? 'legacy-version' : 'malformed' };
  }
  if (!validDigest(record.promptSha256) || (record.personaSegmentSha256 !== null && !validDigest(record.personaSegmentSha256))) {
    return { state: 'HOLD', reason: 'invalid-digest' };
  }
  if (!validPromptCompilePlanId(record.promptCompilePlanId)) {
    return { state: 'HOLD', reason: 'invalid-digest' };
  }
  if (
    typeof record.rolePolicyIdentity !== 'string' || record.rolePolicyIdentity.length === 0 ||
    (record.assignedAgentId !== null && (typeof record.assignedAgentId !== 'string' || record.assignedAgentId.length === 0)) ||
    (record.deliveredAgentId !== null && (typeof record.deliveredAgentId !== 'string' || record.deliveredAgentId.length === 0)) ||
    !isCanonicalIdArray(record.assignedSkillIds) || !isCanonicalIdArray(record.deliveredSkillIds) ||
    !isCanonicalIdArray(record.forcedSkillIds) || !isCanonicalIdArray(record.undeliveredForcedSkillIds) ||
    (record.deliveredAgentId === null) !== (record.personaSegmentSha256 === null) ||
    (typeof record.deliveredAgentId === 'string' && record.rolePolicyIdentity !== `worker:${record.deliveredAgentId}`)
  ) return { state: 'HOLD', reason: 'malformed' };
  const deliveredSkillIds = record.deliveredSkillIds as readonly string[];
  const forcedSkillIds = record.forcedSkillIds as readonly string[];
  const undeliveredForcedSkillIds = record.undeliveredForcedSkillIds as readonly string[];
  const expectedUndelivered = forcedSkillIds.filter(
    id => !deliveredSkillIds.includes(id),
  );
  if (JSON.stringify(undeliveredForcedSkillIds) !== JSON.stringify(expectedUndelivered)) {
    return { state: 'HOLD', reason: 'malformed' };
  }
  if (record.runtimeDelivery !== undefined) {
    const binding = record.runtimeDelivery as Record<string, unknown> | null;
    if (!binding
      || typeof binding.attemptId !== 'string' || binding.attemptId.length === 0
      || typeof binding.provider !== 'string' || binding.provider.length === 0
      || typeof binding.coreArtifactPath !== 'string' || binding.coreArtifactPath.length === 0
      || !validDigest(binding.coreSha256)
      || !Number.isSafeInteger(binding.coreBytes) || (binding.coreBytes as number) < 0
      || typeof binding.roleProfile !== 'string' || binding.roleProfile.length === 0
      || !['claude-system-prompt-file', 'codex-model-instructions-file'].includes(
        binding.injectionChannel as string,
      )
      || !isStringArray(binding.contextSuppressionFlags)
      || !validDigest(binding.providerArgvSha256)) {
      return { state: 'HOLD', reason: 'malformed' };
    }
  }
  return { state: 'AVAILABLE', receipt: record as unknown as PromptDeliveryReceipt };
}

export function promptAttemptDeliveryReceiptPath(
  projectRoot: string,
  taskId: string,
  attemptId: string,
  provider: string,
): string {
  if (![taskId, attemptId, provider].every(
    value => /^[a-z0-9][a-z0-9._-]*$/iu.test(value),
  )) {
    throw new DeckentError('PROMPT_DELIVERY_RECEIPT_UNSAFE_IDENTITY', 'PROMPT_DELIVERY_RECEIPT_UNSAFE_IDENTITY');
  }
  const safeProvider = provider.replace(/[^a-z0-9_-]/giu, '_');
  return join(
    projectRoot,
    '.tasks',
    `task-${taskId}.attempt-${attemptId}.${safeProvider}.prompt-delivery.json`,
  );
}

/** Bind compile-time prompt evidence to the exact admitted provider invocation. */
export function finalizePromptDeliveryReceipt(
  input: FinalizePromptDeliveryReceiptInput,
): PromptDeliveryReceipt {
  const current = readPromptDeliveryReceipt(input.projectRoot, input.taskId);
  if (current.state !== 'AVAILABLE') {
    throw new DeckentError('PROMPT_DELIVERY_RECEIPT_FINALIZE_HOLD', `PROMPT_DELIVERY_RECEIPT_FINALIZE_HOLD:${current.reason}`);
  }
  if (input.roleProfile !== current.receipt.rolePolicyIdentity) {
    throw new DeckentError('PROMPT_DELIVERY_RECEIPT_ROLE_PROFILE_MISMATCH', 'PROMPT_DELIVERY_RECEIPT_ROLE_PROFILE_MISMATCH');
  }
  const tasksRoot = resolve(input.projectRoot, '.tasks');
  const corePath = resolve(input.projectRoot, input.coreArtifactPath);
  const projected = relative(tasksRoot, corePath);
  if (projected === '' || projected === '..' || projected.startsWith(`..${sep}`)) {
    throw new DeckentError('PROMPT_DELIVERY_RECEIPT_CORE_PATH_OUTSIDE_TASKS', 'PROMPT_DELIVERY_RECEIPT_CORE_PATH_OUTSIDE_TASKS');
  }
  const coreBytes = readFileSync(corePath);
  const expectedCoreName = `.worker-core-${input.coreSha256}.md`;
  if (corePath !== join(tasksRoot, expectedCoreName)
    || basename(corePath) !== expectedCoreName) {
    throw new DeckentError('PROMPT_DELIVERY_RECEIPT_CORE_PATH_MISMATCH', 'PROMPT_DELIVERY_RECEIPT_CORE_PATH_MISMATCH');
  }
  if (coreBytes.length !== input.coreBytes
    || createHash('sha256').update(coreBytes).digest('hex') !== input.coreSha256) {
    throw new DeckentError('PROMPT_DELIVERY_RECEIPT_CORE_BYTES_MISMATCH', 'PROMPT_DELIVERY_RECEIPT_CORE_BYTES_MISMATCH');
  }
  const expectedProvider = input.injectionChannel === 'claude-system-prompt-file'
    ? 'claude'
    : 'codex';
  if (input.provider !== expectedProvider
    || !input.providerArgv.includes(expectedCoreName)
    || (expectedProvider === 'claude' && !input.providerArgv.includes('--system-prompt-file'))
    || (expectedProvider === 'codex' && !input.providerArgv.includes('model_instructions_file='))) {
    throw new DeckentError('PROMPT_DELIVERY_RECEIPT_PROVIDER_ARGV_MISMATCH', 'PROMPT_DELIVERY_RECEIPT_PROVIDER_ARGV_MISMATCH');
  }
  const binding: PromptRuntimeDeliveryBinding = {
    attemptId: input.attemptId,
    provider: input.provider,
    coreArtifactPath: input.coreArtifactPath.split('\\').join('/'),
    coreSha256: input.coreSha256,
    coreBytes: input.coreBytes,
    roleProfile: input.roleProfile,
    injectionChannel: input.injectionChannel,
    contextSuppressionFlags: [...input.contextSuppressionFlags],
    providerArgvSha256: sha256(input.providerArgv),
  };
  const finalized: PromptDeliveryReceipt = { ...current.receipt, runtimeDelivery: binding };
  const target = promptAttemptDeliveryReceiptPath(
    input.projectRoot,
    input.taskId,
    input.attemptId,
    input.provider,
  );
  mkdirSync(dirname(target), { recursive: true });
  const serialized = `${JSON.stringify(finalized)}\n`;
  try {
    const descriptor = openSync(target, 'wx', 0o600);
    try {
      writeFileSync(descriptor, serialized, 'utf8');
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST'
      || readFileSync(target, 'utf8') !== serialized) throw error;
  }
  if (!writePromptDeliveryReceipt(input.projectRoot, finalized)) {
    throw new DeckentError('PROMPT_DELIVERY_RECEIPT_COMPATIBILITY_WRITE_HOLD', 'PROMPT_DELIVERY_RECEIPT_COMPATIBILITY_WRITE_HOLD');
  }
  return finalized;
}

/** Reads a current receipt fail-closed: corrupt or mismatched evidence is typed HOLD. */
export function readPromptDeliveryReceipt(projectRoot: string, taskId: string): PromptDeliveryReceiptRead {
  const target = promptDeliveryReceiptPath(projectRoot, taskId);
  if (!existsSync(target)) return { state: 'HOLD', reason: 'missing' };
  try {
    return parseReceipt(JSON.parse(readFileSync(target, 'utf8')) as unknown, taskId);
  } catch {
    return { state: 'HOLD', reason: 'malformed' };
  }
}

function parseLegacySkillDeliveryReceipt(value: unknown, taskId: string): LegacySkillDeliveryReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1
    || record.taskId !== taskId
    || record.source !== 'worker-prompt'
    || !isStringArray(record.deliveredSkillIds)
    || !isStringArray(record.assignedSkillIds)
    || !isStringArray(record.forcedSkillIds)
    || !isStringArray(record.undeliveredForcedSkillIds)
  ) return null;
  return {
    version: 1,
    taskId,
    source: 'worker-prompt',
    deliveredSkillIds: canonicalIds(record.deliveredSkillIds),
    assignedSkillIds: canonicalIds(record.assignedSkillIds),
    forcedSkillIds: canonicalIds(record.forcedSkillIds),
    undeliveredForcedSkillIds: canonicalIds(record.undeliveredForcedSkillIds),
  };
}

/**
 * Resolve the only identities eligible for outcome credit.
 *
 * Current prompt-authority tasks fail closed: a missing, legacy, malformed or
 * contradictory receipt yields no agent/skill credit. Pre-migration tasks retain
 * an explicit compatibility path; a v1 receipt still narrows skill credit to
 * delivered ids, while a genuinely absent sidecar falls back to legacy claims.
 */
export function resolvePromptDeliveryAttribution(
  input: ResolvePromptDeliveryAttributionInput,
): PromptDeliveryAttribution {
  const target = promptDeliveryReceiptPath(input.projectRoot, input.taskId);
  const legacyAgentId = typeof input.legacyAgentId === 'string' && input.legacyAgentId.length > 0
    ? input.legacyAgentId
    : null;
  const legacySkillIds = canonicalIds(input.legacySkillIds);
  if (!existsSync(target)) {
    return input.requireCurrentReceipt
      ? { state: 'HOLD', agentId: null, skillIds: [], reason: 'missing' }
      : { state: 'LEGACY_FALLBACK', agentId: legacyAgentId, skillIds: legacySkillIds };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(target, 'utf8')) as unknown;
  } catch {
    return { state: 'HOLD', agentId: null, skillIds: [], reason: 'malformed' };
  }

  if ((parsed as { version?: unknown } | null)?.version === PROMPT_DELIVERY_RECEIPT_VERSION) {
    const current = parseReceipt(parsed, input.taskId);
    return current.state === 'AVAILABLE'
      ? {
          state: 'CURRENT',
          agentId: current.receipt.deliveredAgentId,
          skillIds: [...current.receipt.deliveredSkillIds],
          receipt: current.receipt,
        }
      : { state: 'HOLD', agentId: null, skillIds: [], reason: current.reason };
  }

  const legacy = parseLegacySkillDeliveryReceipt(parsed, input.taskId);
  if (!legacy || input.requireCurrentReceipt) {
    return {
      state: 'HOLD',
      agentId: null,
      skillIds: [],
      reason: legacy ? 'legacy-version' : 'malformed',
    };
  }
  return {
    state: 'LEGACY_RECEIPT',
    agentId: legacyAgentId,
    skillIds: [...legacy.deliveredSkillIds],
  };
}
