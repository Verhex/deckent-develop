// ═══ PermissionPolicy — data-driven posture (SP-1 §6) ═══════════════════════
// The same engine adapts to enterprise-locked / solo-YOLO / air-gapped by
// loading .deckent/permission-policy.json over a safe default. Overrides may
// raise restrictions (extend the floor, tighten the mode) but the safe floor
// is always preserved — an override can never shrink it below the baseline.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ApprovalMode } from './permission-types.js';
import type { ToolPermissionTier } from './tools/types.js';

export interface PermissionPolicy {
  /** tool-name or category → default tier (overrides ToolDefinition.tier). */
  tierMap: Record<string, ToolPermissionTier>;
  /** tools/commands that ALWAYS ask — never auto-approvable (the safe floor). */
  alwaysFloor: string[];
  /** default approval mode when no rule applies. */
  defaultMode: ApprovalMode;
}

/** Baseline floor — destructive/irreversible ops (spec §6). Never removed. */
const SAFE_FLOOR: readonly string[] = ['deckent_kill', 'deckent_cleanup', 'deckent_recover'];

export const SAFE_DEFAULT_POLICY: PermissionPolicy = {
  tierMap: {},
  alwaysFloor: [...SAFE_FLOOR],
  defaultMode: 'suggest',
};

/** Load + merge policy over the safe default. Fail-safe: malformed → default. */
export function loadPolicy(cwd: string): PermissionPolicy {
  const p = join(cwd, '.deckent', 'permission-policy.json');
  if (!existsSync(p)) return clone(SAFE_DEFAULT_POLICY);
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<PermissionPolicy>;
    return {
      tierMap: { ...SAFE_DEFAULT_POLICY.tierMap, ...(isObj(raw.tierMap) ? raw.tierMap : {}) },
      alwaysFloor: [...new Set([...SAFE_FLOOR, ...(Array.isArray(raw.alwaysFloor) ? raw.alwaysFloor.filter((x) => typeof x === 'string') : [])])],
      defaultMode: isMode(raw.defaultMode) ? raw.defaultMode : SAFE_DEFAULT_POLICY.defaultMode,
    };
  } catch {
    return clone(SAFE_DEFAULT_POLICY);
  }
}

function clone(p: PermissionPolicy): PermissionPolicy {
  return { tierMap: { ...p.tierMap }, alwaysFloor: [...p.alwaysFloor], defaultMode: p.defaultMode };
}
function isObj(x: unknown): x is Record<string, ToolPermissionTier> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}
function isMode(x: unknown): x is ApprovalMode {
  return x === 'suggest' || x === 'auto-edit' || x === 'full-auto';
}
