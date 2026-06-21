// ═══ Permission engine — decide() (SP-1 §6) ═════════════════════════════════
// Precedence (high → low), implemented as ordered early-returns:
//   1. explicit deny rule
//   2. always-floor (tier 'always' or policy.alwaysFloor) — never auto, even full-auto
//   3. silent tier → allow
//   4. explicit allow rule (once/session/always grants)
//   5. approvalMode (full-auto / auto-edit non-bash → allow; else ask)
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
  // auto-edit auto-approves edits but MUST still gate the shell tool. The
  // registered shell tool is `deckent_bash` (native registry), so a literal
  // `!== 'bash'` never matched and the guard was dead. Match the generic `bash`
  // name and any `*_bash` namespace variant so the prefix cannot defeat it.
  const isShellTool = tool === 'bash' || tool.endsWith('_bash');
  if (ctx.mode === 'auto-edit' && !isShellTool) return 'allow';
  return 'ask';
}

/**
 * Resolve a tool's effective tier: a policy tierMap override (by tool name,
 * then by category) wins over the ToolDefinition's own default tier. This is
 * the M2 precondition that decide() relies on (it consumes the resolved tier).
 */
export function resolveTier(
  tool: { name: string; category: string; tier: ToolPermissionTier },
  policy: PermissionPolicy,
): ToolPermissionTier {
  return policy.tierMap[tool.name] ?? policy.tierMap[tool.category] ?? tool.tier;
}
