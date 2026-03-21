// ─── Prompt Rollback ────────────────────────────────────────────────────────
// Automatic rollback to best historical prompt version when current is failing.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PromptVersionManager } from './prompt-version.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface RollbackResult {
  rolledBackTo: number;
  reason: string;
}

export interface RollbackLogEntry {
  timestamp: string;
  fromVersion: number;
  toVersion: number;
  reason: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';
const ROLLBACK_LOG_FILE = 'rollback-log.json';
const ROLLBACK_SUCCESS_THRESHOLD = 0.5;  // 50%
const ROLLBACK_MIN_USES = 3;

// ─── PromptRollback ─────────────────────────────────────────────────

export class PromptRollback {
  private versionManager: PromptVersionManager;

  constructor(private projectRoot: string) {
    this.versionManager = new PromptVersionManager(projectRoot);
  }

  /**
   * Determine whether the current prompt should be rolled back.
   * Returns true if successRate < 50% and uses >= 3.
   */
  shouldRollback(
    _agentId: string,
    currentStats: { uses: number; successRate: number },
  ): boolean {
    if (currentStats.uses < ROLLBACK_MIN_USES) return false;
    return currentStats.successRate < ROLLBACK_SUCCESS_THRESHOLD;
  }

  /**
   * Roll back to the best historical version (highest successRate with >= 2 uses).
   * Activates the best version via PromptVersionManager.
   * Returns null if no suitable version found.
   */
  rollbackPrompt(agentId: string): RollbackResult | null {
    if (!this.canRollback(agentId)) return null;

    const versions = this.versionManager.listVersions(agentId);
    const current = this.versionManager.getCurrentVersion(agentId);
    const currentVersionNum = current?.version ?? -1;

    // Find the best historical version (not the current one)
    let bestVersion: { version: number; successRate: number } | null = null;
    for (const v of versions) {
      if (v.version === currentVersionNum) continue;
      // Prefer versions with at least some usage, or if no used versions exist, pick highest version
      if (
        !bestVersion ||
        v.stats.successRate > bestVersion.successRate ||
        (v.stats.successRate === bestVersion.successRate && v.stats.uses > 0)
      ) {
        bestVersion = { version: v.version, successRate: v.stats.successRate };
      }
    }

    if (!bestVersion) return null;

    // Activate the best version
    const activated = this.versionManager.activateVersion(agentId, bestVersion.version);
    if (!activated) return null;

    const reason = `Current version ${currentVersionNum} underperforming. ` +
      `Rolled back to version ${bestVersion.version} (successRate: ${(bestVersion.successRate * 100).toFixed(0)}%).`;

    // Log the rollback
    this.logRollback(agentId, currentVersionNum, bestVersion.version, reason);

    return {
      rolledBackTo: bestVersion.version,
      reason,
    };
  }

  /**
   * Check whether rollback is possible (needs at least 2 versions).
   */
  canRollback(agentId: string): boolean {
    const versions = this.versionManager.listVersions(agentId);
    return versions.length >= 2;
  }

  /**
   * Log a rollback event to .deckent/agents/{agentId}/rollback-log.json.
   */
  logRollback(
    agentId: string,
    fromVersion: number,
    toVersion: number,
    reason: string,
  ): void {
    const logPath = this._rollbackLogPath(agentId);
    const dir = join(this.projectRoot, AGENTS_DIR, agentId);
    mkdirSync(dir, { recursive: true });

    const existing = this._readRollbackLog(agentId);
    existing.push({
      timestamp: new Date().toISOString(),
      fromVersion,
      toVersion,
      reason,
    });

    writeFileSync(logPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  }

  /**
   * Read the rollback log for an agent.
   */
  getRollbackLog(agentId: string): RollbackLogEntry[] {
    return this._readRollbackLog(agentId);
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private _rollbackLogPath(agentId: string): string {
    return join(this.projectRoot, AGENTS_DIR, agentId, ROLLBACK_LOG_FILE);
  }

  private _readRollbackLog(agentId: string): RollbackLogEntry[] {
    const logPath = this._rollbackLogPath(agentId);
    if (!existsSync(logPath)) return [];
    try {
      const content = readFileSync(logPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed as RollbackLogEntry[];
      return [];
    } catch {
      return [];
    }
  }
}
