// ═══ Authority Enforcer ═══════════════════════════════════════════════
// Runtime RBAC enforcement for Brain, Auditor, and Worker roles.
// ADR-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0
//
// Sprint 139: Soft enforcement mode — violations are logged as warnings
// and emitted to the event stream but do NOT block the action.
// Sprint 140+: Hard enforcement (planned).

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { writeEvent } from './event-stream.js';
import { normalizePath, resolveRealPath, isWithinScope } from '../core/scope-check.js';

// ─── Types ───────────────────────────────────────────────────────────

/** Agent roles in the Deckent orchestration system. */
export type AgentRole = 'brain' | 'auditor' | 'worker';

/** Action types that can be checked against the authority matrix. */
export type ActionType = 'read' | 'write' | 'append' | 'spawn' | 'kill' | 'event_emit' | 'event_consume';

/** Enforcement mode — soft logs warnings, hard blocks actions. */
export type EnforcementMode = 'soft' | 'hard';

/** Result of an authority check. */
export interface AuthorityCheckResult {
  allowed: boolean;
  /** Enforcement level — determines if violation blocks or warns */
  level: 'permit' | 'warn' | 'deny';
  /** Current enforcement mode (Sprint 139 = always soft) */
  mode: EnforcementMode;
  /** Human-readable reason for the decision */
  reason: string;
}

/** Context for an authority check request. */
export interface AuthorityCheckRequest {
  role: AgentRole;
  action: ActionType;
  /** Target path (relative to project root) or channel name */
  target: string;
  /** Worker-specific: task ID for scope resolution */
  taskId?: string;
  /** Worker-specific: assigned scope directories */
  scopeDirectories?: string[];
  /** Worker-specific: assigned filesWrite list */
  scopeFilesWrite?: string[];
  /** ADR-038 exception: self-modifying sprint flag */
  isSelfModifyingSprint?: boolean;
  /**
   * Project root for realpath-based scope containment (ADR-G-017
   * SYMLINK-AUTHORITY-WIRE). Defaults to `process.cwd()` when omitted —
   * consistent with the ROOT-DISCIPLINE convention already documented in
   * ADR-G-017 (ctx.projectRoot/--root is a separate, tracked follow-up).
   */
  projectRoot?: string;
}

// ─── Path Pattern Matching ───────────────────────────────────────────
// normalizePath lives in core/scope-check.ts (single source, ADR-D-004 SCOPECHECK-CORE) —
// imported above; re-used here for the static glob-pattern matcher below.

/** Check if a file path matches a glob-like pattern (supports trailing /**). */
function pathMatches(filePath: string, pattern: string): boolean {
  const normalizedFile = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);

  // Exact match
  if (normalizedFile === normalizedPattern) return true;

  // Directory wildcard: "src/**" matches "src/foo.ts", "src/bar/baz.ts"
  if (normalizedPattern.endsWith('/**')) {
    const dirPrefix = normalizedPattern.slice(0, -3); // remove "/**"
    const dirWithSlash = dirPrefix.endsWith('/') ? dirPrefix : `${dirPrefix}/`;
    return normalizedFile.startsWith(dirWithSlash) || normalizedFile === dirPrefix;
  }

  // Directory prefix: ".tasks/" matches ".tasks/task-001.json"
  if (normalizedPattern.endsWith('/')) {
    return normalizedFile.startsWith(normalizedPattern);
  }

  // Pattern with wildcard segments: ".tasks/*" matches ".tasks/anything"
  if (normalizedPattern.includes('*')) {
    const dirPrefix = normalizedPattern.slice(0, normalizedPattern.indexOf('*'));
    return normalizedFile.startsWith(dirPrefix);
  }

  return false;
}

// ─── Symlink-Aware Scope Containment (ADR-G-017 SYMLINK-AUTHORITY-WIRE) ──
//
// resolveRealPath / isWithinScope now live in core/scope-check.ts (single
// source, ADR-D-004 SCOPECHECK-CORE — dissolves the Sprint-352 duplicate)
// and are imported above. Plain path-normalize/prefix-match (pathMatches
// above) remains the ADR-rejected method for scope containment: a symlink
// placed inside scope.filesWrite or scope.directories that resolves outside
// the scope root passes a pure string comparison, which is why the worker
// dynamic scope check below calls isWithinScope instead.

// ─── Authority Matrix (ADR-037) ──────────────────────────────────────

/** Path permission entry in the authority matrix. */
interface PathPermission {
  pattern: string;
  allowed: boolean;
  /** Optional: only match specific action types */
  actions?: ActionType[];
}

/** Role authority definition. */
interface RoleAuthority {
  /** File system path permissions (checked in order, first match wins) */
  paths: PathPermission[];
  /** Event stream channels this role may emit */
  emitChannels: string[];
  /** Event stream channels this role may consume */
  consumeChannels: string[];
}

/**
 * Authority matrix — derived from ADR-037.
 * Rules are evaluated in order: first match wins.
 * DENY rules MUST appear before ALLOW rules for the same prefix.
 */
const AUTHORITY_MATRIX: Record<AgentRole, RoleAuthority> = {
  brain: {
    paths: [
      // DENY — Brain must not write source code or tests
      { pattern: 'src/**', allowed: false, actions: ['write', 'append'] },
      { pattern: 'tests/**', allowed: false, actions: ['write', 'append'] },
      { pattern: '.brain/DECISIONS.md', allowed: false, actions: ['write'] },
      { pattern: 'docs/vision/roadmap.md', allowed: false, actions: ['write'] },
      { pattern: '.dashboard', allowed: false, actions: ['write'] },
      { pattern: '.locks/**', allowed: false, actions: ['write'] },
      // ALLOW — Brain orchestration files
      { pattern: '.tasks/**', allowed: true },
      { pattern: '.deckent/config.json', allowed: true },
      { pattern: '.deckent/sprint-state.json', allowed: true },
      { pattern: '.deckent/sprint-*', allowed: true },
      { pattern: '.deckent/cache/**', allowed: true },
      { pattern: '.brain/MEMORY.md', allowed: true },
      { pattern: '.brain/RETRO.md', allowed: true },
      { pattern: '.brain/DEBT.md', allowed: true },
      { pattern: '.brain/PATTERNS.md', allowed: true },
      { pattern: '.brain/sprints/**', allowed: true },
      { pattern: '.brain/archive/**', allowed: true },
      // Memory V2 (Sprint 179 W3-6): auto-generated exports are brain-owned.
      { pattern: '.brain/exports/**', allowed: true },
      // READ is always allowed for brain
      { pattern: 'src/**', allowed: true, actions: ['read'] },
      { pattern: 'tests/**', allowed: true, actions: ['read'] },
    ],
    emitChannels: [
      'BRAIN→WORKER:TASK_ASSIGN',
      'BRAIN→WORKER:ANSWER',
      'BRAIN→WORKER:FIX_REQUEST',
      'BRAIN→*:METRIC_EMITTED',
      'BRAIN→*:SPRINT_PHASE_CHANGE',
    ],
    consumeChannels: [
      'WORKER→BRAIN:HEARTBEAT',
      'WORKER→BRAIN:RESULT',
      'WORKER→BRAIN:QUESTION',
      'AUDITOR→BRAIN:VERIFICATION_RESULT',
      'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
      'AUDITOR→BRAIN:ADR_VIOLATION',
      'AUDITOR→BRAIN:GATE_COMPUTED',
      'AUDITOR→BRAIN:LOAD_REPORT_WRITTEN',
    ],
  },

  auditor: {
    paths: [
      // DENY — Auditor never writes source code or tests
      { pattern: 'src/**', allowed: false, actions: ['write', 'append'] },
      { pattern: 'tests/**', allowed: false, actions: ['write', 'append'] },
      { pattern: '.tasks/*.json', allowed: false, actions: ['write'] },
      { pattern: '.brain/MEMORY.md', allowed: false, actions: ['write'] },
      { pattern: '.brain/RETRO.md', allowed: false, actions: ['write'] },
      { pattern: '.brain/DECISIONS.md', allowed: false, actions: ['write'] },
      { pattern: '.deckent/sprint-state.json', allowed: false, actions: ['write'] },
      // ALLOW — Auditor observation + reporting files
      { pattern: '.dashboard', allowed: true, actions: ['write'] },
      { pattern: '.deckent/recently-works/sprint-*-gate.json', allowed: true },
      { pattern: '.deckent/recently-works/sprint-*-events.jsonl', allowed: true, actions: ['append'] },
      { pattern: 'docs/audits/**', allowed: true },
      { pattern: '.brain/PATTERNS.md', allowed: true, actions: ['append'] },
      { pattern: '.locks/**', allowed: true },
      // READ is always allowed for auditor
      { pattern: '.tasks/**', allowed: true, actions: ['read'] },
      { pattern: 'src/**', allowed: true, actions: ['read'] },
      { pattern: 'tests/**', allowed: true, actions: ['read'] },
      { pattern: '.brain/DECISIONS.md', allowed: true, actions: ['read'] },
      // Memory V2 (Sprint 179 W3-6): exports are the new ADR source — read allowed.
      { pattern: '.brain/exports/**', allowed: true, actions: ['read'] },
    ],
    emitChannels: [
      'AUDITOR→BRAIN:VERIFICATION_RESULT',
      'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
      'AUDITOR→BRAIN:ADR_VIOLATION',
      'AUDITOR→BRAIN:GATE_COMPUTED',
      'AUDITOR→BRAIN:LOAD_REPORT_WRITTEN',
      'AUDITOR→BRAIN:ORPHAN_HB_DETECTED',
      'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
    ],
    consumeChannels: [
      'WORKER→AUDITOR:CODE_VERIFY_REQUEST',
      'BRAIN→*:SPRINT_PHASE_CHANGE',
      'BRAIN→*:METRIC_EMITTED',
    ],
  },

  worker: {
    paths: [
      // DENY — Worker must not touch other workers' files, brain files, auditor files
      { pattern: '.brain/DECISIONS.md', allowed: false, actions: ['write'] },
      { pattern: '.brain/MEMORY.md', allowed: false, actions: ['write'] },
      { pattern: '.brain/RETRO.md', allowed: false, actions: ['write'] },
      { pattern: '.deckent/sprint-state.json', allowed: false, actions: ['write'] },
      { pattern: '.dashboard', allowed: false, actions: ['write'] },
      { pattern: 'docs/audits/**', allowed: false, actions: ['write'] },
      // ALLOW — Worker task files (own only — dynamic check in checkAuthority)
      { pattern: '.tasks/**', allowed: true },
      { pattern: '.locks/**', allowed: true },
      // ALLOW — Read references
      { pattern: '.brain/DECISIONS.md', allowed: true, actions: ['read'] },
      // Memory V2 (Sprint 179 W3-6): workers must read ADRs from exports too.
      { pattern: '.brain/exports/**', allowed: true, actions: ['read'] },
      { pattern: 'DIRECTIVES.md', allowed: true, actions: ['read'] },
      // src/** and tests/** — allowed only within scope (dynamic check)
      // Handled by dynamic scope check below, not static matrix
    ],
    emitChannels: [
      'WORKER→BRAIN:HEARTBEAT',
      'WORKER→BRAIN:RESULT',
      'WORKER→BRAIN:QUESTION',
      'WORKER→AUDITOR:CODE_VERIFY_REQUEST',
    ],
    consumeChannels: [
      'BRAIN→WORKER:TASK_ASSIGN',
      'BRAIN→WORKER:ANSWER',
      'BRAIN→WORKER:FIX_REQUEST',
      'BRAIN→*:SPRINT_PHASE_CHANGE',
    ],
  },
};

// ─── Core API ────────────────────────────────────────────────────────

/**
 * Check whether a given action is permitted for the specified role.
 *
 * Sprint 139: Soft enforcement — violations return `allowed: false` with
 * `mode: 'soft'` and `level: 'warn'`. The caller decides whether to proceed.
 *
 * @param check - The authority check request (role, action, target, context)
 * @returns AuthorityCheckResult with allowed status and enforcement details
 */
export function checkAuthority(check: AuthorityCheckRequest): AuthorityCheckResult {
  const { action } = check;

  // Event stream channel checks
  if (action === 'event_emit' || action === 'event_consume') {
    return checkChannelAuthority(check);
  }

  // File system path checks
  return checkPathAuthority(check);
}

/**
 * Check channel emit/consume authority for a role.
 */
function checkChannelAuthority(check: AuthorityCheckRequest): AuthorityCheckResult {
  const { role, action, target } = check;
  const matrix = AUTHORITY_MATRIX[role];

  const channels = action === 'event_emit' ? matrix.emitChannels : matrix.consumeChannels;
  const actionLabel = action === 'event_emit' ? 'emit' : 'consume';

  if (channels.includes(target)) {
    return {
      allowed: true,
      level: 'permit',
      mode: 'soft',
      reason: `${role} is permitted to ${actionLabel} on channel ${target}`,
    };
  }

  // Broadcast channels (target: "*") — check if any emitChannel matches
  if (target.includes('→*:') && channels.some(ch => ch.includes('→*:'))) {
    return {
      allowed: true,
      level: 'permit',
      mode: 'soft',
      reason: `${role} is permitted to ${actionLabel} broadcast channel ${target}`,
    };
  }

  return {
    allowed: false,
    level: 'warn',
    mode: 'soft',
    reason: `${role} is NOT permitted to ${actionLabel} on channel ${target} (ADR-037)`,
  };
}

/**
 * Check file system path authority for a role.
 */
function checkPathAuthority(check: AuthorityCheckRequest): AuthorityCheckResult {
  const { role, action, target, isSelfModifyingSprint, scopeDirectories, scopeFilesWrite } = check;

  // ADR-038 exception: self-modifying sprint allows worker to write src/**
  if (role === 'worker' && isSelfModifyingSprint && (action === 'write' || action === 'append')) {
    if (pathMatches(target, 'src/**') || pathMatches(target, 'tests/**')) {
      return {
        allowed: true,
        level: 'permit',
        mode: 'soft',
        reason: `Self-modifying sprint: worker permitted to ${action} ${target} (ADR-038 exception)`,
      };
    }
  }

  const matrix = AUTHORITY_MATRIX[role];

  // Check static path rules (first match wins)
  for (const rule of matrix.paths) {
    if (!pathMatches(target, rule.pattern)) continue;

    // If rule has action filter, check if current action matches
    if (rule.actions && !rule.actions.includes(action)) continue;

    if (rule.allowed) {
      return {
        allowed: true,
        level: 'permit',
        mode: 'soft',
        reason: `${role} is permitted to ${action} ${target} (pattern: ${rule.pattern})`,
      };
    }

    return {
      allowed: false,
      level: 'warn',
      mode: 'soft',
      reason: `${role} is NOT permitted to ${action} ${target} (denied by pattern: ${rule.pattern}, ADR-037)`,
    };
  }

  // Worker dynamic scope check for src/** and tests/** — ADR-G-017
  // SYMLINK-AUTHORITY-WIRE: containment is decided on the REAL (realpathSync)
  // path of both the target and each scope root, not a nominal string match,
  // so a symlink inside scope that resolves outside scope is rejected.
  if (role === 'worker' && (action === 'write' || action === 'append')) {
    if (scopeDirectories || scopeFilesWrite) {
      const resolvedProjectRoot = check.projectRoot ?? process.cwd();
      const scopeResult = isWithinScope(
        target,
        resolvedProjectRoot,
        scopeDirectories ?? [],
        scopeFilesWrite ?? [],
      );

      if (scopeResult.within) {
        const reason = scopeResult.matchedVia === 'filesWrite'
          ? `Worker scope: ${target} is in filesWrite`
          : `Worker scope: ${target} is within directory ${scopeResult.matchedPattern}`;
        return {
          allowed: true,
          level: 'permit',
          mode: 'soft',
          reason,
        };
      }

      return {
        allowed: false,
        level: 'warn',
        mode: 'soft',
        reason: `Worker scope violation: ${target} is outside assigned scope (ADR-037, real-path resolved)`,
      };
    }
  }

  // Default: read is generally allowed, write to unknown paths is warned
  if (action === 'read') {
    return {
      allowed: true,
      level: 'permit',
      mode: 'soft',
      reason: `${role} is permitted to read ${target} (default allow)`,
    };
  }

  return {
    allowed: false,
    level: 'warn',
    mode: 'soft',
    reason: `${role} has no explicit permission to ${action} ${target} (ADR-037 fail-closed)`,
  };
}

// ─── Event Stream Integration ────────────────────────────────────────

/**
 * Emit an AUTHORITY_VIOLATION event to the event stream.
 * Called when checkAuthority returns `allowed: false`.
 *
 * Fail-safe: never throws — violations are observability, not blockers.
 */
export function emitAuthorityViolation(
  projectRoot: string,
  sprintId: string,
  check: AuthorityCheckRequest,
  result: AuthorityCheckResult,
): void {
  try {
    writeEvent(
      projectRoot,
      sprintId,
      'auditor',
      'brain',
      'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
      {
        role: check.role,
        action: check.action,
        target: check.target,
        taskId: check.taskId,
        allowed: result.allowed,
        level: result.level,
        mode: result.mode,
        reason: result.reason,
      },
    );
  } catch {
    // Fail-safe: event stream write failure must not crash the sprint
  }
}

// ─── Layer 4: ADR Compliance Enforcement ────────────────────────────
// Runtime checks for ADR-006 (spawnSync shell:true) and ADR-008 (core→orchestra
// import). Violations produce NO_GO + amendment proposals. A missing/unreadable
// per-file read is skipped (not a violation) — but an internal enforcer crash
// (LIFECYCLE-CRITICAL-2, sprint-380 task 380-002) fails CLOSED: the task is
// blocked (NO_GO) rather than silently passing the compliance gate.
//
// DEP-POLICY-WIRE (ADR-D-005): the former ADR-010 package.json deps WHITELIST
// (NO_GO for any dep outside a 4-package set) was REMOVED here — the minimal-dep
// dogma is retired (deckent legitimately ships 13+3 merit-chosen deps), so the
// whitelist NO_GO'd every real dependency change. Dependency policy is now a
// non-blocking inventory-drift ADVISORY in the auditor
// (checkDependencyInventoryDrift), not a hard enforcer gate.

/** A single ADR compliance violation found in worker output. */
export interface AdrViolation {
  taskId: string;
  adrId: string;
  file: string;
  line: number;
  description: string;
  amendmentProposal: string;
}

/** Result of ADR compliance enforcement. */
export interface AdrComplianceResult {
  pass: boolean;
  violations: AdrViolation[];
  /** If the enforcer itself failed, this captures the error message */
  enforcerError?: string;
}

/**
 * ADR-006: Check for `shell: true` in spawnSync/execSync calls.
 * Scans .ts file contents for shell: true patterns.
 */
function checkAdr006(taskId: string, filePath: string, content: string): AdrViolation[] {
  const violations: AdrViolation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Match shell: true in spawnSync/execSync/spawn options
    if (/shell\s*:\s*true/.test(line)) {
      violations.push({
        taskId,
        adrId: 'adr-006',
        file: filePath,
        line: i + 1,
        description: `ADR-006 violation: \`shell: true\` found at line ${i + 1}. All commands must use \`spawnSync(binary, [...args])\` without shell interpretation.`,
        amendmentProposal: 'Remove `shell: true` and pass command + args array to spawnSync/execSync.',
      });
    }
  }

  return violations;
}

/**
 * ADR-008: Check for core/ modules importing from orchestra/.
 * Only applies to files under src/core/.
 */
function checkAdr008(taskId: string, filePath: string, content: string): AdrViolation[] {
  const violations: AdrViolation[] = [];
  // Only check files in src/core/
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (!normalizedPath.includes('src/core/')) return violations;

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Match import/require from orchestra path
    if (/(?:import|require)\s*\(?\s*['"].*\/orchestra\//.test(line) ||
        /from\s+['"].*\/orchestra\//.test(line)) {
      violations.push({
        taskId,
        adrId: 'adr-008',
        file: filePath,
        line: i + 1,
        description: `ADR-008 violation: core/ module imports from orchestra/ at line ${i + 1}. Brain is the ONLY module that imports orchestra/. core/ must not depend on orchestra/.`,
        amendmentProposal: 'Move the shared logic to core/ or use dependency inversion (interface in core/, implementation in orchestra/).',
      });
    }
  }

  return violations;
}

/**
 * Enforce ADR compliance on worker-changed files.
 *
 * Scans the listed files for violations of ADR-006, ADR-008, and ADR-010.
 * Returns a result with pass/fail status and any violations found.
 *
 * **Fail-CLOSED** (LIFECYCLE-CRITICAL-2, sprint-380 task 380-002): a missing
 * or unreadable individual file is skipped (not a violation — see the
 * per-file try/catch below). But if the enforcer itself crashes — a bug, a
 * malformed `changedFiles` input, anything outside the expected per-file
 * failure modes — compliance is NOT silently assumed. The task is blocked
 * (`pass:false`, with a synthetic violation describing the crash) and the
 * error is also captured in `enforcerError` for diagnosis. An enforcer bug
 * must never be indistinguishable from "no ADR violations found".
 *
 * @param projectRoot - Absolute path to project root
 * @param sprintId - Current sprint identifier
 * @param taskId - The task being evaluated
 * @param changedFiles - List of files changed by the worker (relative paths)
 * @returns AdrComplianceResult with violations (if any)
 */
export function enforceAdrCompliance(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  changedFiles: string[],
): AdrComplianceResult {
  try {
    const violations: AdrViolation[] = [];

    for (const file of changedFiles) {
      let content: string;
      try {
        content = readFileSync(join(projectRoot, file), 'utf-8');
      } catch {
        // File doesn't exist or can't be read — skip (may have been deleted)
        continue;
      }

      // ADR-006: spawnSync shell:true check (all .ts files)
      if (file.endsWith('.ts')) {
        violations.push(...checkAdr006(taskId, file, content));
      }

      // ADR-008: core→orchestra import check (core/ .ts files)
      if (file.endsWith('.ts')) {
        violations.push(...checkAdr008(taskId, file, content));
      }
      // DEP-POLICY-WIRE (ADR-D-005): the ADR-010 package.json deps whitelist
      // check was removed — dependency policy is a non-blocking advisory now.
    }

    // Emit breadcrumb events for each violation
    for (const v of violations) {
      try {
        writeEvent(
          projectRoot,
          sprintId,
          'auditor',
          'brain',
          'AUDITOR→BRAIN:ADR_VIOLATION',
          {
            taskId: v.taskId,
            adrId: v.adrId,
            file: v.file,
            line: v.line,
            description: v.description,
            amendmentProposal: v.amendmentProposal,
          },
        );
      } catch {
        // Fail-safe: event write failure must not block enforcement
      }
    }

    return {
      pass: violations.length === 0,
      violations,
    };
  } catch (err) {
    // Fail-CLOSED (LIFECYCLE-CRITICAL-2, sprint-380 task 380-002): an enforcer
    // internal crash (as opposed to a per-file read miss, which is handled
    // above and never reaches here) used to report pass:true, silently
    // disabling the ADR compliance gate for this task's changed files exactly
    // when something was already broken. Fail-closed instead: the crash
    // becomes a synthetic violation so the standard NO_GO/FIX path (already
    // wired in sprint-phases.ts:runEvaluatePhase off `adrVerdict.pass` /
    // `.violations`) surfaces it with a real reason, with zero changes needed
    // to that call site.
    const errorMsg = err instanceof Error ? err.message : String(err);
    try {
      writeEvent(
        projectRoot,
        sprintId,
        'auditor',
        'brain',
        'AUDITOR→BRAIN:ADR_VIOLATION',
        {
          taskId,
          enforcerError: errorMsg,
          description: 'ADR compliance enforcer crashed — failing CLOSED (task blocked, compliance gate never silently disabled)',
        },
      );
    } catch {
      // Double fail-safe: event write failure must not hide the fail-closed verdict below
    }

    return {
      pass: false, // Fail-CLOSED: an enforcer crash must never silently pass compliance
      violations: [{
        taskId,
        adrId: 'enforcer-internal-error',
        file: '<authority-enforcer>',
        line: 0,
        description: `ADR compliance enforcer crashed before it could evaluate changed files for task ${taskId}: ${errorMsg}. Failing closed — task blocked until the enforcer error is investigated and resolved.`,
        amendmentProposal: 'Investigate and fix the authority-enforcer crash (see enforcerError), then re-run ADR compliance for this task.',
      }],
      enforcerError: errorMsg,
    };
  }
}

// ─── Exports for Testing ─────────────────────────────────────────────

/** Exposed for unit testing — do not use directly in production code. */
export const _testing = {
  pathMatches,
  normalizePath,
  AUTHORITY_MATRIX,
  checkAdr006,
  checkAdr008,
  resolveRealPath,
  isWithinScope,
};
