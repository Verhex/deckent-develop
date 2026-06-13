// ═══ Permission engine — decide() (SP-1 §6) ═════════════════════════════════
// Precedence (high → low):
//   1. explicit deny rule
//   2. always-floor (policy.alwaysFloor)  — never auto, even in full-auto
//   3. explicit allow rule (once/session/always grants)
//   4. tier default (silent → allow, confirm → ask)
//   5. approvalMode (suggest/auto-edit/full-auto)
// The floor (step 2) sits ABOVE every grant/mode — the safety invariant.

import { matchRule, type ApprovalMode, type PermissionDecision, type PermissionRule } from './permission-types.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { ToolPermissionTier } from './tools/types.js';

export interface PermissionContext {
  /** Active allow grants (session memory + persisted rules). */
  rules: PermissionRule[];
  /** Active deny rules. */
  denies: PermissionRule[];
  /** Loaded policy (tier-map already applied by caller to `tier`). */
  policy: PermissionPolicy;
  /** Session approval mode. */
  mode: ApprovalMode;
}

function inFloor(policy: PermissionPolicy, tool: string): boolean {
  return policy.alwaysFloor.includes(tool);
}

export function decide(
  tool: string,
  resource: string,
  tier: ToolPermissionTier,
  ctx: PermissionContext,
): PermissionDecision {
  // 1. explicit deny
  if (ctx.denies.some((d) => matchRule(d, tool, resource))) return 'deny';
  // 2. always-floor — never auto
  if (tier === 'always' || inFloor(ctx.policy, tool)) return 'ask';
  // 3. silent tier auto-allows
  if (tier === 'silent') return 'allow';
  // 4. explicit allow grant
  if (ctx.rules.some((r) => matchRule(r, tool, resource))) return 'allow';
  // 5. approval mode (confirm tier only reaches here)
  if (ctx.mode === 'full-auto') return 'allow';
  if (ctx.mode === 'auto-edit' && tool !== 'bash') return 'allow';
  return 'ask';
}
