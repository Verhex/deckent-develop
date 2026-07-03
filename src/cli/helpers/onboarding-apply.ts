// ─── Onboarding Wizard Apply (ONB-WIZARD-APPLY, Sprint 365 Task 365-007) ───
//
// The layer that APPLIES an `OnboardingConfigWritePlan`
// (`onboarding-wizard.ts`'s step 5, `planConfigWrite`) to disk. The wizard
// core is intentionally plan-only (see its own module doc); this module is
// the explicit, separate follow-up that turns a plan into a real
// `config.json` write.
//
// Atomic write (tmp-file + `renameSync`): no shared exported helper exists
// for this in the codebase — `core/global-store.ts`, `core/approval-broker.ts`,
// and `core/tool-availability.ts` each re-implement the same
// `${path}.${randomUUID()}.tmp` write + rename + best-effort-cleanup idiom
// locally. This module follows that established convention rather than
// inventing a new one or reusing `cli/commands/init-steps.ts`'s `writeConfig`
// (init-flow-specific side effects — system-capacity detection, docker image
// checks — and not atomic).
//
// Reversible by construction: every applied field change records its
// `previousValue` (or `undefined` when the key was absent), so
// `revertOnboardingApply` can restore prior state exactly — including
// deleting a key that did not exist before the apply.
//
// Dry-run parity: `dryRunOnboardingApply` and `applyOnboardingPlan` both
// route through the same pure `previewOnboardingApply` to compute
// `fieldChanges` — there is only one implementation of "what would change",
// so the two can never drift apart.
//
// Explicitly NOT this module's job (see task 365-007 NO-GO):
//   - Wiring into `onboard.ts` / touching `init.ts` — that's a follow-up.
//   - Any global-vs-project scope branching — `plan.configPath` is already
//     fully resolved by `onboarding-wizard.ts` steps 4/5; this module treats
//     it as an opaque write target.
//   - Executing `plan.mcpAttachActions` — carried through in the report only.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { deepMerge } from '../../core/config.js';
import type { OnboardingConfigWritePlan } from './onboarding-wizard.js';

// ─── Report Types ────────────────────────────────────────────────────────

/** One config key the plan would (or did) change, with enough context to reverse it. */
export interface OnboardingApplyFieldChange {
  key: string;
  previousValue: unknown;
  newValue: unknown;
  changed: boolean;
}

/** Shared shape returned by both the dry-run preview and a real apply. */
export interface OnboardingApplyReport {
  configPath: string;
  /** False for a dry-run preview or a preview computed pre-write; true once the write has happened. */
  applied: boolean;
  /** Whether a config file already existed at configPath before this operation. */
  configExisted: boolean;
  fieldChanges: OnboardingApplyFieldChange[];
  /** Carried through from the plan, never executed here. */
  mcpAttachActions: OnboardingConfigWritePlan['mcpAttachActions'];
  blockedReasonKey?: string;
}

/** Report returned by a real write (apply or revert) — adds post-write, read-back verification. */
export interface OnboardingApplyResult extends OnboardingApplyReport {
  applied: true;
  /** True only when every fieldChange's newValue was confirmed present on disk after the write. */
  verified: boolean;
  verificationErrors: string[];
}

// ─── Internal Helpers ────────────────────────────────────────────────────

/** Fail-soft config read: missing file, unreadable file, or non-object JSON all resolve to `undefined`. */
function readOnboardingConfigFile(configPath: string): Record<string, unknown> | undefined {
  if (!existsSync(configPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** tmp-file + renameSync — mirrors global-store.ts/approval-broker.ts/tool-availability.ts. */
function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — the rename error below is what the caller needs.
    }
    throw err;
  }
}

/** Order-independent structural equality for JSON-safe values (primitives, plain objects, arrays). */
function jsonDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => jsonDeepEqual(v, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => jsonDeepEqual(aObj[k], bObj[k]));
}

/** Read configPath back and confirm every fieldChange's newValue actually landed on disk. */
function verifyFieldChanges(
  configPath: string,
  fieldChanges: OnboardingApplyFieldChange[],
): { verified: boolean; verificationErrors: string[] } {
  const onDisk = readOnboardingConfigFile(configPath) ?? {};
  const verificationErrors: string[] = [];
  for (const change of fieldChanges) {
    if (!jsonDeepEqual(onDisk[change.key], change.newValue)) {
      verificationErrors.push(
        `field '${change.key}' expected ${JSON.stringify(change.newValue)} but found ${JSON.stringify(onDisk[change.key])} on disk`,
      );
    }
  }
  return { verified: verificationErrors.length === 0, verificationErrors };
}

// ─── Preview / Dry-Run ───────────────────────────────────────────────────

/**
 * PURE — no I/O. Given the plan and an already-read config object (or
 * `undefined` when none exists yet), computes the before/after field-change
 * list. Both {@link dryRunOnboardingApply} and {@link applyOnboardingPlan}
 * call this exact function, which is what guarantees dry-run/apply parity.
 */
export function previewOnboardingApply(
  plan: OnboardingConfigWritePlan,
  existingConfig: Record<string, unknown> | undefined,
): OnboardingApplyReport {
  const base = existingConfig ?? {};
  const fieldChanges: OnboardingApplyFieldChange[] = Object.entries(plan.fields)
    .filter(([, newValue]) => newValue !== undefined)
    .map(([key, newValue]) => {
      const previousValue = base[key];
      return { key, previousValue, newValue, changed: !jsonDeepEqual(previousValue, newValue) };
    });

  return {
    configPath: plan.configPath,
    applied: false,
    configExisted: existingConfig !== undefined,
    fieldChanges,
    mcpAttachActions: plan.mcpAttachActions,
    blockedReasonKey: plan.blockedReasonKey,
  };
}

/** Read-only: reads configPath (if present) and returns the same preview `applyOnboardingPlan` would compute. */
export function dryRunOnboardingApply(plan: OnboardingConfigWritePlan): OnboardingApplyReport {
  return previewOnboardingApply(plan, readOnboardingConfigFile(plan.configPath));
}

// ─── Apply ───────────────────────────────────────────────────────────────

/**
 * Applies the plan: reads the existing config (if any), deep-merges
 * `plan.fields` on top of it (unrelated existing keys are preserved,
 * undefined plan fields never overwrite anything — same semantics as
 * `deepMerge` elsewhere in the codebase), writes atomically, then reads the
 * file back to verify every changed field actually landed.
 */
export function applyOnboardingPlan(plan: OnboardingConfigWritePlan): OnboardingApplyResult {
  const existingConfig = readOnboardingConfigFile(plan.configPath);
  const preview = previewOnboardingApply(plan, existingConfig);

  const merged = deepMerge(existingConfig ?? {}, plan.fields as Record<string, unknown>);
  atomicWriteJson(plan.configPath, merged);

  const { verified, verificationErrors } = verifyFieldChanges(plan.configPath, preview.fieldChanges);

  return { ...preview, applied: true, verified, verificationErrors };
}

// ─── Revert ──────────────────────────────────────────────────────────────

/**
 * Reverses a previously-applied report: writes each fieldChange's
 * `previousValue` back (deleting the key entirely when it was absent
 * before the apply), atomically, then verifies. This is the real "undo"
 * half of the reversible-report contract — not just recorded data.
 */
export function revertOnboardingApply(report: OnboardingApplyReport): OnboardingApplyResult {
  const current = readOnboardingConfigFile(report.configPath) ?? {};
  const reverted: Record<string, unknown> = { ...current };
  for (const change of report.fieldChanges) {
    if (change.previousValue === undefined) {
      delete reverted[change.key];
    } else {
      reverted[change.key] = change.previousValue;
    }
  }
  atomicWriteJson(report.configPath, reverted);

  const reversedChanges: OnboardingApplyFieldChange[] = report.fieldChanges.map((c) => ({
    key: c.key,
    previousValue: c.newValue,
    newValue: c.previousValue,
    changed: c.changed,
  }));
  const { verified, verificationErrors } = verifyFieldChanges(report.configPath, reversedChanges);

  return {
    configPath: report.configPath,
    applied: true,
    configExisted: true,
    fieldChanges: reversedChanges,
    mcpAttachActions: report.mcpAttachActions,
    blockedReasonKey: report.blockedReasonKey,
    verified,
    verificationErrors,
  };
}
