// ═══ Tool Scope Gate ════════════════════════════════════════════════
// Pure, realpath-based containment gate for TOOL-SCOPE enforcement
// (pivot-P0 "scope'u prompt yerine TOOL ile çöz" — Sprint 352 Task 352-010).
//
// The realpath-based scope-containment algorithm (ADR-G-017
// SYMLINK-AUTHORITY-WIRE: a symlink placed inside scope that resolves
// outside the scope root is rejected on its REAL path, not just
// nominal-string-matched) is single-sourced in core/scope-check.ts — the
// canonical home shared with src/orchestra/authority-enforcer.ts (ADR-D-004
// SCOPECHECK-CORE, Sprint 353 Task 353-001, dissolving the Sprint-352
// duplicate noted above). This module builds the `ScopeGate` decision
// wrapper (advisory/enforce mode) on top of that shared primitive.
//
// Advisory→enforce ready (ADR-G-020 V1→V2): `mode` defaults to 'advisory'.
// In 'advisory' mode a scope violation is surfaced (`violation: true`) but
// never blocks (`allowed` stays true) — this stays a pure decision function
// with no logging/IO side effect; a future worker-tool seam decides whether
// and how to log `violation`. In 'enforce' mode a violation blocks
// (`allowed: false`). The default must never be 'enforce'.

import {
  normalizePath,
  resolveRealPath,
  resolveContainment,
  type ScopeContainmentResult,
  type ScopeMatchVia,
} from './scope-check.js';

// ─── Types ───────────────────────────────────────────────────────────

/** Enforcement mode — 'advisory' never blocks, 'enforce' blocks on violation. */
export type ScopeGateMode = 'advisory' | 'enforce';

/** Which part of the declared scope produced an `allowed` decision. */
export type ScopeGateMatchedVia = ScopeMatchVia;

/** Scope declaration a gate is built from — mirrors core/task-types.ts TaskScope fields. */
export interface ScopeGateInput {
  directories?: string[];
  filesWrite?: string[];
  filesRead?: string[];
}

export interface CreateScopeGateOptions {
  /** Project root used to resolve realpaths. Defaults to process.cwd(). */
  projectRoot?: string;
  /** Defaults to 'advisory' — never default to 'enforce'. */
  mode?: ScopeGateMode;
}

/** Result of a single checkWrite/checkRead call. */
export interface ScopeGateResult {
  /** Actionable decision after `mode` is applied. */
  allowed: boolean;
  /** Raw scope-containment verdict, independent of `mode`. */
  violation: boolean;
  reason: string;
  mode: ScopeGateMode;
  matchedVia?: ScopeGateMatchedVia;
  matchedPattern?: string;
}

export interface ScopeGate {
  readonly mode: ScopeGateMode;
  checkWrite(target: string): ScopeGateResult;
  checkRead(target: string): ScopeGateResult;
}

// ─── Gate factory ────────────────────────────────────────────────────
// normalizePath / resolveRealPath / resolveContainment live in core/scope-check.ts
// (single source, ADR-D-004 SCOPECHECK-CORE — dissolves the Sprint-352 duplicate);
// imported above.

function applyMode(
  match: ScopeContainmentResult,
  target: string,
  action: 'write' | 'read',
  mode: ScopeGateMode,
): ScopeGateResult {
  if (match.within) {
    const via = match.matchedVia ?? 'directory';
    const reason = via === 'directory'
      ? `${target} is within scope directory ${match.matchedPattern}`
      : `${target} is in scope ${via}`;
    return {
      allowed: true,
      violation: false,
      reason,
      mode,
      matchedVia: match.matchedVia,
      matchedPattern: match.matchedPattern,
    };
  }

  return {
    allowed: mode === 'advisory',
    violation: true,
    reason: `${target} is outside assigned ${action} scope (TOOL-SCOPE, realpath-resolved)`,
    mode,
  };
}

/**
 * Build a pure scope gate from a task's declared scope.
 *
 * `checkWrite` allows a target matched via `scope.filesWrite` (exact file) or
 * `scope.directories` (prefix containment). `checkRead` additionally accepts
 * `scope.filesRead` (write access implies read access). A target matched by
 * neither is a `violation` — fail-closed, including when no scope was
 * declared at all.
 *
 * `mode: 'advisory'` (the default) never blocks — `allowed` stays `true` even
 * on `violation: true`; the caller is expected to log the violation. Passing
 * `mode: 'enforce'` makes `allowed` mirror `violation` (blocks on scope
 * escape). This function performs no IO or logging of its own.
 */
export function createScopeGate(scope: ScopeGateInput, options: CreateScopeGateOptions = {}): ScopeGate {
  const mode: ScopeGateMode = options.mode ?? 'advisory';
  const projectRoot = options.projectRoot ?? process.cwd();
  const directories = scope.directories ?? [];
  const filesWrite = scope.filesWrite ?? [];
  const filesRead = scope.filesRead ?? [];

  return {
    mode,
    checkWrite(target: string): ScopeGateResult {
      const match = resolveContainment(target, projectRoot, directories, [
        { via: 'filesWrite', files: filesWrite },
      ]);
      return applyMode(match, target, 'write', mode);
    },
    checkRead(target: string): ScopeGateResult {
      const match = resolveContainment(target, projectRoot, directories, [
        { via: 'filesRead', files: filesRead },
        { via: 'filesWrite', files: filesWrite },
      ]);
      return applyMode(match, target, 'read', mode);
    },
  };
}

// ─── Exports for testing ─────────────────────────────────────────────

/** Exposed for unit testing — do not use directly in production code. */
export const _testing = {
  normalizePath,
  resolveRealPath,
  resolveContainment,
};
