// ─── Permission Guard ────────────────────────────────────────────────────────
// Validates agent modifications to prevent self-modification, tool escalation,
// and unauthorized changes. Only Brain can modify agent configurations.

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve, normalize, sep } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentRole = 'brain' | 'auditor' | 'worker';

export interface ModificationAttempt {
  agentId: string;
  agentRole: AgentRole;
  targetPath: string;
  action: 'write' | 'delete' | 'modify';
  timestamp: string;
}

export interface ValidationResult {
  allowed: boolean;
  reason: string;
}

export interface PermissionGuardFS {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  appendFileSync: typeof appendFileSync;
  mkdirSync: typeof mkdirSync;
}

const defaultFS: PermissionGuardFS = {
  existsSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
};

// ─── Protected Paths ─────────────────────────────────────────────────────────

const PROTECTED_AGENT_PATHS = [
  '.claude/rules/',
  '.deckent/workspace/',
  'src/agents/',
  'src/orchestra/brain.ts',
  'src/monitor/auditor.ts',
];

const TOOL_CONFIG_PATHS = [
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.mcp/',
];

// ─── PermissionGuard ─────────────────────────────────────────────────────────

export class PermissionGuard {
  private readonly projectRoot: string;
  private readonly logDir: string;
  private readonly fs: PermissionGuardFS;

  constructor(projectRoot: string, options?: { logDir?: string; fs?: PermissionGuardFS }) {
    this.projectRoot = resolve(projectRoot);
    this.logDir = options?.logDir ?? join(this.projectRoot, '.deckent', 'logs');
    this.fs = options?.fs ?? defaultFS;
  }

  /**
   * Validate whether an agent is allowed to modify a given path.
   * Rules:
   *   1. No agent can modify its own source file (self-modification).
   *   2. No agent can escalate tools (modify .claude/settings or .mcp/).
   *   3. Only Brain can modify agent configuration files.
   *   4. Auditor can never write source code.
   */
  validateAgentModification(attempt: ModificationAttempt): ValidationResult {
    const normalizedTarget = this._normalizePath(attempt.targetPath);

    // Rule 1: No self-modification
    const selfModResult = this._checkSelfModification(attempt.agentId, attempt.agentRole, normalizedTarget);
    if (!selfModResult.allowed) {
      this._logAttempt(attempt, selfModResult.reason);
      return selfModResult;
    }

    // Rule 2: No tool escalation
    const toolResult = this._checkToolEscalation(attempt.agentRole, normalizedTarget);
    if (!toolResult.allowed) {
      this._logAttempt(attempt, toolResult.reason);
      return toolResult;
    }

    // Rule 3: Only Brain can modify agent configs
    const agentConfigResult = this._checkAgentConfigModification(attempt.agentRole, normalizedTarget);
    if (!agentConfigResult.allowed) {
      this._logAttempt(attempt, agentConfigResult.reason);
      return agentConfigResult;
    }

    // Rule 4: Auditor cannot write source code
    const auditorResult = this._checkAuditorSourceWrite(attempt.agentRole, normalizedTarget);
    if (!auditorResult.allowed) {
      this._logAttempt(attempt, auditorResult.reason);
      return auditorResult;
    }

    return { allowed: true, reason: 'Modification allowed' };
  }

  /**
   * Get the log file path for permission guard events.
   */
  getLogPath(): string {
    return join(this.logDir, 'permission-guard.log');
  }

  // ─── Rule Checks ──────────────────────────────────────────────────────────

  private _checkSelfModification(
    agentId: string,
    agentRole: AgentRole,
    targetPath: string,
  ): ValidationResult {
    const selfPaths: Record<AgentRole, string[]> = {
      brain: ['src/orchestra/brain.ts'],
      auditor: ['src/monitor/auditor.ts'],
      worker: ['src/agents/worker.ts', 'src/agents/worker-ipc.ts'],
    };

    const ownPaths = selfPaths[agentRole] ?? [];
    for (const ownPath of ownPaths) {
      if (targetPath === ownPath || targetPath.startsWith(ownPath.replace('.ts', ''))) {
        return {
          allowed: false,
          reason: `Self-modification blocked: ${agentRole} (${agentId}) cannot modify ${targetPath}`,
        };
      }
    }

    return { allowed: true, reason: '' };
  }

  private _checkToolEscalation(agentRole: AgentRole, targetPath: string): ValidationResult {
    // Only Brain can modify tool configs, but even Brain should be careful
    if (agentRole !== 'brain') {
      for (const toolPath of TOOL_CONFIG_PATHS) {
        if (targetPath.startsWith(toolPath)) {
          return {
            allowed: false,
            reason: `Tool escalation blocked: ${agentRole} cannot modify tool config ${targetPath}`,
          };
        }
      }
    }

    return { allowed: true, reason: '' };
  }

  private _checkAgentConfigModification(agentRole: AgentRole, targetPath: string): ValidationResult {
    if (agentRole === 'brain') {
      return { allowed: true, reason: '' };
    }

    for (const protectedPath of PROTECTED_AGENT_PATHS) {
      if (targetPath.startsWith(protectedPath)) {
        return {
          allowed: false,
          reason: `Agent config modification blocked: only Brain can modify ${targetPath}`,
        };
      }
    }

    return { allowed: true, reason: '' };
  }

  private _checkAuditorSourceWrite(agentRole: AgentRole, targetPath: string): ValidationResult {
    if (agentRole !== 'auditor') {
      return { allowed: true, reason: '' };
    }

    if (targetPath.startsWith('src/') || targetPath.startsWith('tests/')) {
      return {
        allowed: false,
        reason: `Auditor source write blocked: auditor cannot write to ${targetPath}`,
      };
    }

    return { allowed: true, reason: '' };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private _normalizePath(filePath: string): string {
    // Make relative to project root if absolute
    let normalized = normalize(filePath).split(sep).join('/');
    const rootPrefix = this.projectRoot.split(sep).join('/') + '/';
    if (normalized.startsWith(rootPrefix)) {
      normalized = normalized.slice(rootPrefix.length);
    }
    // Remove leading slashes
    return normalized.replace(/^\/+/, '');
  }

  private _logAttempt(attempt: ModificationAttempt, reason: string): void {
    try {
      if (!this.fs.existsSync(this.logDir)) {
        this.fs.mkdirSync(this.logDir, { recursive: true });
      }
      const logEntry = JSON.stringify({
        ...attempt,
        reason,
        blockedAt: new Date().toISOString(),
      }) + '\n';
      this.fs.appendFileSync(this.getLogPath(), logEntry, 'utf-8');
    } catch {
      // Logging is best-effort
    }
  }
}
