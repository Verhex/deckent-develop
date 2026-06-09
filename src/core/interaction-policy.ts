import type { InteractionMode } from './work-model.js';

export interface InteractionPolicy {
  autoApproveDefault: boolean;
  promptUser: boolean;
  streamOutput: boolean;
}

/** Conservative default: treat as interactive (safe — never auto-approve without explicit opt-in). */
const INTERACTIVE_POLICY: InteractionPolicy = {
  autoApproveDefault: false,
  promptUser: true,
  streamOutput: false,
};

const POLICIES: Record<InteractionMode, InteractionPolicy> = {
  batch: { autoApproveDefault: true, promptUser: false, streamOutput: false },
  interactive: INTERACTIVE_POLICY,
  streaming: { autoApproveDefault: false, promptUser: true, streamOutput: true },
};

/**
 * Maps an `InteractionMode` to its execution policy.
 * Absent or unrecognised modes fall back to the conservative interactive default
 * (promptUser: true, never auto-approve) so callers are safe by default.
 */
export function resolveInteractionPolicy(mode?: InteractionMode): InteractionPolicy {
  if (mode === undefined || mode === null) return INTERACTIVE_POLICY;
  return POLICIES[mode] ?? INTERACTIVE_POLICY;
}
