/**
 * Prompt-Gate types (G-series) — pure data shapes shared between the orchestra
 * evaluator ({@link ../orchestra/prompt-gate}) and the Sprint model + CLI/MCP
 * surfaces. Kept in core/ so `sprint-types.ts` can reference the result without a
 * core→orchestra import crossing (the logic — which composes orchestra helpers —
 * lives in orchestra/prompt-gate.ts).
 */

/** A single gate lint category (the "which check" axis). */
export type PromptGateLint =
  | 'persona-capability' // agent is Write-denied but the task writes code (hard)
  | 'persona-mandate'    // agent carries a zero-functional-change mandate on a behavior-changing task
  | 'persona-role'       // reviewer/analyst persona on construction work
  | 'persona-domain'     // agent domain ≠ task domain (HIGH)
  | 'decision-space'     // goCriteria offers a false choice (X VEYA/OR Y)
  | 'premise'            // description claims a symbol is absent but it exists in the repo (stale)
  | 'scope-silent-drop'      // SAN-1: render-time sanitizeScope would silently drop a declared write path
  | 'scope-satisfiability';  // G1b: task text ↔ write-authority consistency (mentioned/proof/unchanged)

/** Emitted severity. `pass` findings are never materialized (absence = pass). */
export type PromptGateLevel = 'pass' | 'warn' | 'block';

export interface PromptGateFinding {
  taskId: string;
  lint: PromptGateLint;
  /** Only 'warn' | 'block' are emitted; 'pass' is represented by no finding. */
  level: 'warn' | 'block';
  /** The task's final assigned agent (source-agnostic: forceAgent or router pick). */
  agentId: string;
  message: string;
  suggestion?: string;
}

export interface PromptGateResult {
  /** false iff there is ≥1 unacknowledged BLOCK finding. */
  ok: boolean;
  findings: PromptGateFinding[];
  /** The subset of `findings` with level === 'block'. */
  blockers: PromptGateFinding[];
  /** Set when blockers existed but `acknowledgePromptGate` bypassed the block. */
  overrideApplied?: boolean;
}
