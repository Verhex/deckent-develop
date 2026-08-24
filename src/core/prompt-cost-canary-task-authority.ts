import { createHash } from 'node:crypto';

import { DEFAULT_PROMPT_CONFIG } from './config.js';
import type { PromptConfig } from './config-types.js';
import type { GoNoGoCriteria, TaskScope } from './task-types.js';
import type { TaskKind } from './work-model.js';

export const PROMPT_COST_CANARY_TASK_AUTHORITY_VERSION = 1 as const;

/** Prompt/runtime switches whose measured effect may participate in a canary. */
export interface PromptCostCanaryFeatureSnapshot {
  readonly excludeDynamicSystemPromptSections: boolean;
  readonly workerCoreSystemPrompt: boolean;
  readonly codexCoreChannel: boolean;
  readonly codexSuppressProjectDoc: boolean;
  readonly catalogMountMask: boolean;
}

/**
 * Plan-time authority carried by every task and inherited byte-for-byte by FIX
 * attempts. The logical lineage excludes sprint/provider/model identity so the
 * same workload can be joined across independently settled A/B runs.
 */
export interface PromptCostCanaryTaskAuthority {
  readonly version: typeof PROMPT_COST_CANARY_TASK_AUTHORITY_VERSION;
  readonly logicalLineageId: string;
  readonly workloadDigest: string;
  readonly featureDigest: string;
  readonly authorityDigest: string;
  readonly featureSnapshot: PromptCostCanaryFeatureSnapshot;
}

export interface PromptCostCanaryTaskDefinition {
  readonly title: string;
  readonly description: string;
  readonly type?: TaskKind;
  readonly scope: TaskScope;
  readonly dependencies?: readonly string[];
  readonly goNogo: GoNoGoCriteria;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim().replace(/[\t ]+/gu, ' ');
}

function normalizePath(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/{2,}/gu, '/');
}

function normalizeDependency(value: string): string {
  const normalized = normalizeText(value);
  const planSlot = /^\d+-(\d+)$/u.exec(normalized);
  return planSlot ? `slot-${planSlot[1]}` : normalized;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function resolvedBoolean(value: boolean | undefined, fallback: boolean): boolean {
  return value ?? fallback;
}

export function resolvePromptCostCanaryFeatureSnapshot(
  prompt: PromptConfig | undefined,
): PromptCostCanaryFeatureSnapshot {
  return Object.freeze({
    excludeDynamicSystemPromptSections: resolvedBoolean(
      prompt?.exclude_dynamic_system_prompt_sections,
      DEFAULT_PROMPT_CONFIG.exclude_dynamic_system_prompt_sections,
    ),
    workerCoreSystemPrompt: resolvedBoolean(
      prompt?.worker_core_system_prompt,
      DEFAULT_PROMPT_CONFIG.worker_core_system_prompt,
    ),
    codexCoreChannel: resolvedBoolean(
      prompt?.codex_core_channel,
      DEFAULT_PROMPT_CONFIG.codex_core_channel,
    ),
    codexSuppressProjectDoc: resolvedBoolean(
      prompt?.codex_suppress_project_doc,
      DEFAULT_PROMPT_CONFIG.codex_suppress_project_doc,
    ),
    catalogMountMask: resolvedBoolean(
      prompt?.catalog_mount_mask,
      DEFAULT_PROMPT_CONFIG.catalog_mount_mask,
    ),
  });
}

/** Build a deterministic authority; callers never author any digest field. */
export function createPromptCostCanaryTaskAuthority(
  task: PromptCostCanaryTaskDefinition,
  prompt?: PromptConfig,
): PromptCostCanaryTaskAuthority {
  const criterionItems = (task.goNogo.items ?? []).map(item => ({
    polarity: item.polarity,
    statement: normalizeText(item.statement),
    evidenceRequirements: [...item.evidenceRequirements].map(normalizeText).sort(),
  })).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  const workload = {
    title: normalizeText(task.title),
    description: normalizeText(task.description),
    type: task.type ?? null,
    scope: {
      directories: [...new Set(task.scope.directories.map(normalizePath))].sort(),
      filesRead: [...new Set(task.scope.filesRead.map(normalizePath))].sort(),
      filesWrite: [...new Set(task.scope.filesWrite.map(normalizePath))].sort(),
    },
    dependencies: [...new Set((task.dependencies ?? []).map(normalizeDependency))].sort(),
    acceptance: {
      goCriteria: normalizeText(task.goNogo.goCriteria),
      noGoCriteria: normalizeText(task.goNogo.noGoCriteria),
      techDebtAcceptable: normalizeText(task.goNogo.techDebtAcceptable),
      items: criterionItems,
    },
  };
  const workloadDigest = sha256(canonicalJson(workload));
  const featureSnapshot = resolvePromptCostCanaryFeatureSnapshot(prompt);
  const featureDigest = sha256(canonicalJson(featureSnapshot));
  const unsigned = {
    version: PROMPT_COST_CANARY_TASK_AUTHORITY_VERSION,
    logicalLineageId: `prompt-cost-lineage:sha256:${workloadDigest}`,
    workloadDigest,
    featureDigest,
    featureSnapshot,
  };
  return Object.freeze({ ...unsigned, authorityDigest: sha256(canonicalJson(unsigned)) });
}

/** Fail-closed parser for untrusted archived task JSON. */
export function parsePromptCostCanaryTaskAuthority(
  value: unknown,
): PromptCostCanaryTaskAuthority | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const snapshot = record['featureSnapshot'];
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const feature = snapshot as Record<string, unknown>;
  const parsedSnapshot: PromptCostCanaryFeatureSnapshot = {
    excludeDynamicSystemPromptSections: feature['excludeDynamicSystemPromptSections'] as boolean,
    workerCoreSystemPrompt: feature['workerCoreSystemPrompt'] as boolean,
    codexCoreChannel: feature['codexCoreChannel'] as boolean,
    codexSuppressProjectDoc: feature['codexSuppressProjectDoc'] as boolean,
    catalogMountMask: feature['catalogMountMask'] as boolean,
  };
  if (Object.values(parsedSnapshot).some(entry => typeof entry !== 'boolean')) return null;
  if (record['version'] !== PROMPT_COST_CANARY_TASK_AUTHORITY_VERSION
      || typeof record['logicalLineageId'] !== 'string'
      || !/^prompt-cost-lineage:sha256:[a-f0-9]{64}$/u.test(record['logicalLineageId'])
      || typeof record['workloadDigest'] !== 'string'
      || !/^[a-f0-9]{64}$/u.test(record['workloadDigest'])
      || record['logicalLineageId'] !== `prompt-cost-lineage:sha256:${record['workloadDigest']}`
      || typeof record['featureDigest'] !== 'string'
      || !/^[a-f0-9]{64}$/u.test(record['featureDigest'])
      || typeof record['authorityDigest'] !== 'string'
      || !/^[a-f0-9]{64}$/u.test(record['authorityDigest'])) return null;
  const featureDigest = sha256(canonicalJson(parsedSnapshot));
  if (record['featureDigest'] !== featureDigest) return null;
  const unsigned = {
    version: PROMPT_COST_CANARY_TASK_AUTHORITY_VERSION,
    logicalLineageId: record['logicalLineageId'],
    workloadDigest: record['workloadDigest'],
    featureDigest,
    featureSnapshot: parsedSnapshot,
  };
  if (record['authorityDigest'] !== sha256(canonicalJson(unsigned))) return null;
  return Object.freeze({ ...unsigned, authorityDigest: record['authorityDigest'] });
}
