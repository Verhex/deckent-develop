// ═══ Authority Enforcer ═══════════════════════════════════════════════
// Runtime RBAC enforcement for Brain, Auditor, and Worker roles.
// ADR-037: Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0
//
// Sprint 139: Soft enforcement mode — violations are logged as warnings
// and emitted to the event stream but do NOT block the action.
// Sprint 140+: Hard enforcement (planned).

import { normalize, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { writeEvent } from './event-stream.js';

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
}

// ─── Path Pattern Matching ───────────────────────────────────────────

/** Normalize a path for consistent matching (forward slashes, no trailing slash). */
function normalizePath(p: string): string {
  return normalize(p).split('\\').join('/').replace(/\/$/, '');
}

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
      { pattern: '.deckent/sprint-*-gate.json', allowed: true },
      { pattern: '.deckent/sprint-*-events.jsonl', allowed: true, actions: ['append'] },
      { pattern: 'docs/audits/**', allowed: true },
      { pattern: '.brain/PATTERNS.md', allowed: true, actions: ['append'] },
      { pattern: '.locks/**', allowed: true },
      // READ is always allowed for auditor
      { pattern: '.tasks/**', allowed: true, actions: ['read'] },
      { pattern: 'src/**', allowed: true, actions: ['read'] },
      { pattern: 'tests/**', allowed: true, actions: ['read'] },
      { pattern: '.brain/DECISIONS.md', allowed: true, actions: ['read'] },
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

  // Worker dynamic scope check for src/** and tests/**
  if (role === 'worker' && (action === 'write' || action === 'append')) {
    if (scopeDirectories || scopeFilesWrite) {
      const normalizedTarget = normalizePath(target);

      // Check filesWrite
      if (scopeFilesWrite) {
        for (const f of scopeFilesWrite) {
          if (normalizePath(f) === normalizedTarget) {
            return {
              allowed: true,
              level: 'permit',
              mode: 'soft',
              reason: `Worker scope: ${target} is in filesWrite`,
            };
          }
        }
      }

      // Check directories
      if (scopeDirectories) {
        for (const dir of scopeDirectories) {
          const normalizedDir = normalizePath(dir);
          const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`;
          if (normalizedTarget.startsWith(dirWithSlash) || normalizedTarget === normalizedDir) {
            return {
              allowed: true,
              level: 'permit',
              mode: 'soft',
              reason: `Worker scope: ${target} is within directory ${dir}`,
            };
          }
        }
      }

      return {
        allowed: false,
        level: 'warn',
        mode: 'soft',
        reason: `Worker scope violation: ${target} is outside assigned scope (ADR-037)`,
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
// Runtime checks for ADR-006 (spawnSync shell:true), ADR-008 (core→orchestra
// import), ADR-010 (package.json deps whitelist). Violations produce NO_GO +
// amendment proposals. Fail-safe: enforcer errors → task continues.

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

/** Allowed runtime dependencies per ADR-010 (amended Sprint 143). */
const ADR010_DEPS_WHITELIST = new Set([
  'commander',
  'better-sqlite3',
  '@modelcontextprotocol/sdk',
  'zod',
]);

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
 * ADR-010: Check package.json dependencies against whitelist.
 * Only applies when package.json is in the changed files list.
 */
function checkAdr010(taskId: string, filePath: string, content: string): AdrViolation[] {
  const violations: AdrViolation[] = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (!normalizedPath.endsWith('package.json')) return violations;

  try {
    const pkg = JSON.parse(content) as { dependencies?: Record<string, string> };
    if (!pkg.dependencies) return violations;

    for (const dep of Object.keys(pkg.dependencies)) {
      if (!ADR010_DEPS_WHITELIST.has(dep)) {
        violations.push({
          taskId,
          adrId: 'adr-010',
          file: filePath,
          line: 0,
          description: `ADR-010 violation: runtime dependency "${dep}" is not in the allowed whitelist [${[...ADR010_DEPS_WHITELIST].join(', ')}].`,
          amendmentProposal: `Remove "${dep}" from dependencies, or amend ADR-010 with justification for adding it.`,
        });
      }
    }
  } catch {
    // Malformed package.json — not an ADR violation, skip
  }

  return violations;
}

/**
 * Enforce ADR compliance on worker-changed files.
 *
 * Scans the listed files for violations of ADR-006, ADR-008, and ADR-010.
 * Returns a result with pass/fail status and any violations found.
 *
 * **Fail-safe**: If the enforcer itself throws (e.g., file read error),
 * the task is NOT blocked — the error is captured in `enforcerError`.
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

      // ADR-010: package.json deps whitelist check
      if (file.endsWith('package.json')) {
        violations.push(...checkAdr010(taskId, file, content));
      }
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
    // Fail-safe: enforcer crash → task continues, error is logged
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
          description: 'ADR compliance enforcer failed — task proceeds (fail-safe)',
        },
      );
    } catch {
      // Double fail-safe
    }

    return {
      pass: true, // Fail-safe: do not block the task
      violations: [],
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
  checkAdr010,
  ADR010_DEPS_WHITELIST,
};
