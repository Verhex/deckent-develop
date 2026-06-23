// ─── Prompt Version Manager ─────────────────────────────────────────────────
// Manages versioned prompt history for agents. Max 10 versions per agent.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export interface PromptVersion {
  version: number;
  content: string;
  reason: string;
  createdAt: string;
  stats: { uses: number; successRate: number };
}

// ─── Constants ──────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';
const VERSIONS_SUBDIR = 'versions';
const CURRENT_FILE = 'current.json';
const PROMPT_FILE = 'PROMPT.md';
const MAX_VERSIONS = 10;

// ─── PromptVersionManager ───────────────────────────────────────────

export class PromptVersionManager {
  constructor(private projectRoot: string) {}

  /**
   * Create a new version for an agent's prompt.
   * If max versions reached, prunes the oldest version.
   */
  createVersion(agentId: string, content: string, reason: string): PromptVersion {
    const versions = this.listVersions(agentId);
    const nextVersion = versions.length > 0
      ? Math.max(...versions.map(v => v.version)) + 1
      : 1;

    const newVersion: PromptVersion = {
      version: nextVersion,
      content,
      reason,
      createdAt: new Date().toISOString(),
      stats: { uses: 0, successRate: 0 },
    };

    // Save version file
    this._saveVersionFile(agentId, newVersion);

    // Set as current
    this._setCurrentVersion(agentId, nextVersion);

    // Write PROMPT.md
    this._writePromptFile(agentId, content);

    // Prune oldest if over max
    this._pruneOldVersions(agentId);

    return newVersion;
  }

  /**
   * Get a specific version by number.
   */
  getVersion(agentId: string, version: number): PromptVersion | null {
    const filePath = this._versionFilePath(agentId, version);
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as PromptVersion;
    } catch {
      return null;
    }
  }

  /**
   * Get the current active version for an agent.
   */
  getCurrentVersion(agentId: string): PromptVersion | null {
    const currentNum = this._getCurrentVersionNumber(agentId);
    if (currentNum === null) return null;
    return this.getVersion(agentId, currentNum);
  }

  /**
   * List all versions for an agent, sorted by version number ascending.
   */
  listVersions(agentId: string): PromptVersion[] {
    const dir = this._versionsDir(agentId);
    if (!existsSync(dir)) return [];

    const versions: PromptVersion[] = [];
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        const match = file.match(/^v(\d+)\.json$/);
        if (!match) continue;
        try {
          const content = readFileSync(join(dir, file), 'utf-8');
          const parsed = JSON.parse(content) as PromptVersion;
          if (typeof parsed.version === 'number') {
            versions.push(parsed);
          }
        } catch {
          // Skip malformed version files
        }
      }
    } catch {
      // Directory read error
    }

    return versions.sort((a, b) => a.version - b.version);
  }

  /**
   * Activate a specific version: sets it as current and writes PROMPT.md.
   * Returns true if successful, false if version not found.
   */
  activateVersion(agentId: string, version: number): boolean {
    const v = this.getVersion(agentId, version);
    if (!v) return false;

    this._setCurrentVersion(agentId, version);
    this._writePromptFile(agentId, v.content);

    return true;
  }

  /**
   * Update the stats for a specific version.
   */
  updateVersionStats(
    agentId: string,
    version: number,
    evaluation: string,
  ): void {
    const v = this.getVersion(agentId, version);
    if (!v) return;

    const isSuccess = evaluation === 'DONE' || evaluation === 'GO_WITH_TECH_DEBT';
    const prevTotal = v.stats.uses;
    const prevSuccessCount = Math.round(v.stats.successRate * prevTotal);
    v.stats.uses += 1;
    v.stats.successRate = (prevSuccessCount + (isSuccess ? 1 : 0)) / v.stats.uses;

    this._saveVersionFile(agentId, v);
  }

  /**
   * Record one use of an agent's CURRENT prompt version with the task
   * evaluation (F5 evolution loop wire). No-op when the agent has no versioned
   * prompt — the common case for built-in agents that were never evolved — so
   * it is safe to call for every task. Feeds real uses/successRate to the F5
   * analytics consumers (prompt-analytics, GET /api/evolution/prompt-metrics);
   * previously updateVersionStats had zero callers so stats stayed {0,0}.
   */
  recordCurrentVersionUse(agentId: string, evaluation: string): void {
    const num = this._getCurrentVersionNumber(agentId);
    if (num === null) return;
    this.updateVersionStats(agentId, num, evaluation);
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private _agentDir(agentId: string): string {
    return join(this.projectRoot, AGENTS_DIR, agentId);
  }

  private _versionsDir(agentId: string): string {
    return join(this._agentDir(agentId), VERSIONS_SUBDIR);
  }

  private _versionFilePath(agentId: string, version: number): string {
    return join(this._versionsDir(agentId), `v${version}.json`);
  }

  private _currentFilePath(agentId: string): string {
    return join(this._agentDir(agentId), CURRENT_FILE);
  }

  private _promptFilePath(agentId: string): string {
    return join(this._agentDir(agentId), PROMPT_FILE);
  }

  private _saveVersionFile(agentId: string, version: PromptVersion): void {
    const dir = this._versionsDir(agentId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      this._versionFilePath(agentId, version.version),
      JSON.stringify(version, null, 2) + '\n',
      'utf-8',
    );
  }

  private _setCurrentVersion(agentId: string, version: number): void {
    const dir = this._agentDir(agentId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      this._currentFilePath(agentId),
      JSON.stringify({ currentVersion: version }) + '\n',
      'utf-8',
    );
  }

  private _getCurrentVersionNumber(agentId: string): number | null {
    const filePath = this._currentFilePath(agentId);
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as { currentVersion?: number };
      return parsed.currentVersion ?? null;
    } catch {
      return null;
    }
  }

  private _writePromptFile(agentId: string, content: string): void {
    const dir = this._agentDir(agentId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this._promptFilePath(agentId), content, 'utf-8');
  }

  private _pruneOldVersions(agentId: string): void {
    const versions = this.listVersions(agentId);
    if (versions.length <= MAX_VERSIONS) return;

    // Remove oldest versions (lowest version numbers)
    const toRemove = versions.slice(0, versions.length - MAX_VERSIONS);
    for (const v of toRemove) {
      const filePath = this._versionFilePath(agentId, v.version);
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch {
        // Best-effort removal
      }
    }
  }
}
