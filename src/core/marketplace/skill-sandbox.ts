// ─── Skill Sandbox ───────────────────────────────────────────────────────────
// Security validation and quarantine system for skills from the marketplace.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SafetyReport {
  safe: boolean;
  issues: string[];
  scannedFiles: number;
}

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
}

export class SkillSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillSandboxError';
  }
}

// ─── Suspicious Patterns ─────────────────────────────────────────────────────

const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /eval\s*\(/, description: 'Use of eval()' },
  { pattern: /Function\s*\(/, description: 'Dynamic Function constructor' },
  { pattern: /child_process/, description: 'child_process module access' },
  { pattern: /require\s*\(\s*['"]fs['"]/, description: 'Direct fs require' },
  { pattern: /process\.env/, description: 'Environment variable access' },
  { pattern: /\.exec\s*\(/, description: 'Possible command execution' },
  { pattern: /import\s+.*from\s+['"]node:child_process['"]/, description: 'node:child_process import' },
  { pattern: /globalThis|global\./, description: 'Global scope modification' },
  { pattern: /Proxy\s*\(/, description: 'Proxy usage (potential interception)' },
  { pattern: /require\s*\(\s*['"]net['"]/, description: 'Network module access' },
];

// ─── Built-in Trusted Skills ─────────────────────────────────────────────────

const BUILTIN_TRUSTED_SKILLS = new Set([
  'typescript-expert',
  'react-expert',
  'node-expert',
  'test-expert',
  'doc-expert',
]);

// ─── Filesystem abstraction for testing ──────────────────────────────────────

export interface SkillSandboxFS {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  readdirSync: typeof readdirSync;
  readFileSync: typeof readFileSync;
  renameSync: typeof renameSync;
  writeFileSync: typeof writeFileSync;
}

const defaultFS: SkillSandboxFS = {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
};

// ─── SkillSandbox ────────────────────────────────────────────────────────────

export class SkillSandbox {
  private readonly projectRoot: string;
  private readonly fs: SkillSandboxFS;
  private readonly trustedSkills: Set<string>;

  constructor(projectRoot: string, options?: { fs?: SkillSandboxFS; extraTrusted?: string[] }) {
    this.projectRoot = projectRoot;
    this.fs = options?.fs ?? defaultFS;
    this.trustedSkills = new Set([
      ...BUILTIN_TRUSTED_SKILLS,
      ...(options?.extraTrusted ?? []),
    ]);
  }

  /**
   * Scan a skill directory for suspicious code patterns.
   */
  validateSkillSafety(skillPath: string): SafetyReport {
    const resolvedPath = resolve(skillPath);
    const issues: string[] = [];
    let scannedFiles = 0;

    if (!this.fs.existsSync(resolvedPath)) {
      return { safe: false, issues: ['Skill directory does not exist'], scannedFiles: 0 };
    }

    const files = this._collectFiles(resolvedPath);
    for (const file of files) {
      scannedFiles++;
      try {
        const content = this.fs.readFileSync(file, 'utf-8') as string;
        for (const { pattern, description } of SUSPICIOUS_PATTERNS) {
          if (pattern.test(content)) {
            const relFile = file.replace(resolvedPath + '/', '');
            issues.push(`${relFile}: ${description}`);
          }
        }
      } catch {
        // Skip files that cannot be read
      }
    }

    return {
      safe: issues.length === 0,
      issues,
      scannedFiles,
    };
  }

  /**
   * Validate a skill manifest.
   */
  validateManifest(manifestPath: string): ManifestValidation {
    const errors: string[] = [];

    if (!this.fs.existsSync(manifestPath)) {
      return { valid: false, errors: ['Manifest file does not exist'] };
    }

    try {
      const raw = this.fs.readFileSync(manifestPath, 'utf-8') as string;
      const manifest = JSON.parse(raw) as Record<string, unknown>;

      if (!manifest.id || typeof manifest.id !== 'string') {
        errors.push('Missing or invalid "id" field');
      }
      if (!manifest.name || typeof manifest.name !== 'string') {
        errors.push('Missing or invalid "name" field');
      }
      if (!manifest.version || typeof manifest.version !== 'string') {
        errors.push('Missing or invalid "version" field');
      } else if (!/^\d+\.\d+\.\d+/.test(manifest.version as string)) {
        errors.push('Version must follow semver (e.g. 1.0.0)');
      }
      if (manifest.category && typeof manifest.category !== 'string') {
        errors.push('"category" must be a string');
      }
    } catch {
      errors.push('Failed to parse manifest JSON');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Quarantine a skill by moving it to .quarantine/ directory.
   */
  quarantine(skillId: string): boolean {
    const skillDir = join(this.projectRoot, '.deckent', 'skills', skillId);
    if (!this.fs.existsSync(skillDir)) return false;

    const quarantineDir = join(this.projectRoot, '.quarantine');
    if (!this.fs.existsSync(quarantineDir)) {
      this.fs.mkdirSync(quarantineDir, { recursive: true });
    }

    const targetDir = join(quarantineDir, skillId);
    try {
      this.fs.renameSync(skillDir, targetDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Trust a skill by adding it to the trusted set.
   */
  trustSkill(skillId: string): void {
    this.trustedSkills.add(skillId);
  }

  /**
   * Check if a skill is trusted (built-in or explicitly trusted).
   */
  isTrusted(skillId: string): boolean {
    return this.trustedSkills.has(skillId);
  }

  /**
   * Get the list of built-in trusted skills.
   */
  getBuiltinTrustedSkills(): string[] {
    return [...BUILTIN_TRUSTED_SKILLS];
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _collectFiles(dirPath: string): string[] {
    const results: string[] = [];
    try {
      const entries = this.fs.readdirSync(dirPath, { withFileTypes: true });
      for (const rawEntry of entries) {
        const entry = rawEntry as unknown as { name: string; isDirectory(): boolean };
        const name = typeof entry === 'string' ? (entry as unknown as string) : String(entry.name);
        const isDir = typeof entry !== 'string' && typeof entry.isDirectory === 'function' ? entry.isDirectory() : false;
        const fullPath = join(dirPath, name);
        if (isDir) {
          // Skip node_modules and hidden directories
          if (name === 'node_modules' || name.startsWith('.')) continue;
          results.push(...this._collectFiles(fullPath));
        } else {
          // Only scan relevant file types
          if (/\.(ts|js|mjs|cjs|json|md)$/.test(name)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
    return results;
  }
}
