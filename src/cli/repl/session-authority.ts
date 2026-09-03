// src/cli/repl/session-authority.ts
// ═══ TERMINAL-SESSION-AUTHORITY-001 — one posture + approval state for every surface ═══
//
// The Ask/Run/Control posture (term-mode.ts) and the approval mode
// (agent/permission-types.ts) are SESSION authority, not a property of the
// Ink App: the readline loop needs the same state to apply `/term` and
// `/approve` and to gate its tool confirms. This holder owns the two values,
// applies the same pure transitions the Ink App applies (applyModeTarget),
// exposes the same gate (term-gate.ts gateAction) and the native engine's
// confirm policy (permission.ts decide: full-auto → allow, auto-edit → allow
// except the shell tool, suggest → ask), and signals every change to
// whichever surface renders it. No I/O, no strings.

import { APPROVAL_MODES, type ApprovalMode } from '../../agent/permission-types.js';
import { applyModeTarget, initialTermModeState, type TermMode, type TermModeState } from './term-mode.js';
import { gateAction, type DispatchRiskInput, type TermGateDecision } from './term-gate.js';

export interface SessionAuthorityState {
  readonly posture: TermMode;
  readonly approval: ApprovalMode;
}

export interface SessionAuthorityTransition {
  readonly changed: boolean;
  readonly state: SessionAuthorityState;
  /** Set when the requested value was not a valid mode (nothing applied). */
  readonly rejected?: string;
}

export type ConfirmPolicy = 'allow' | 'ask';

export interface SessionAuthority {
  state(): SessionAuthorityState;
  posture(): TermMode;
  approval(): ApprovalMode;
  /** The term-mode state object (for callers that still take TermModeState). */
  termState(): TermModeState;
  setPosture(target: TermMode): SessionAuthorityTransition;
  setApproval(mode: ApprovalMode): SessionAuthorityTransition;
  /** The posture gate for one action — identical to the Ink App's gate. */
  gate(action: DispatchRiskInput): TermGateDecision;
  /** What the approval mode says about a side-effecting tool's confirm. */
  confirmPolicy(tool: string): ConfirmPolicy;
  subscribe(listener: (state: SessionAuthorityState) => void): () => void;
}

export interface SessionAuthorityInit {
  posture?: TermMode;
  approval?: ApprovalMode;
}

/** Mirrors permission.ts: the registered shell tool is `deckent_bash`; the
 *  generic `bash` name and any `*_bash` namespace variant count as shell. */
function isShellTool(tool: string): boolean {
  return tool === 'bash' || tool.endsWith('_bash');
}

export function createSessionAuthority(init: SessionAuthorityInit): SessionAuthority {
  let term: TermModeState = initialTermModeState(init.posture);
  let approval: ApprovalMode = init.approval ?? 'suggest';
  const listeners = new Set<(state: SessionAuthorityState) => void>();

  const state = (): SessionAuthorityState => ({ posture: term.mode, approval });
  const emit = (): void => { const s = state(); for (const l of listeners) l(s); };

  return {
    state,
    posture: () => term.mode,
    approval: () => approval,
    termState: () => term,
    setPosture(target) {
      const result = applyModeTarget(term, target);
      if (!result.changed) return { changed: false, state: state() };
      term = result.state;
      emit();
      return { changed: true, state: state() };
    },
    setApproval(mode) {
      if (!APPROVAL_MODES.includes(mode)) return { changed: false, state: state(), rejected: String(mode) };
      if (mode === approval) return { changed: false, state: state() };
      approval = mode;
      emit();
      return { changed: true, state: state() };
    },
    gate: (action) => gateAction(term, action),
    confirmPolicy(tool) {
      if (approval === 'full-auto') return 'allow';
      if (approval === 'auto-edit' && !isShellTool(tool)) return 'allow';
      return 'ask';
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
