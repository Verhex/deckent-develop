// ─── Skill Sandbox ───────────────────────────────────────────────────────────
// Security validation and quarantine system for skills from the marketplace.
// Two-pass scanning: regex (fast, all files) + AST (accurate, .ts/.js only).

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
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

// ─── AST Scanning ───────────────────────────────────────────────────────────

/** @internal Dangerous module names that should not be imported/required */
const DANGEROUS_MODULES = new Set([
  'child_process',
  'node:child_process',
  'fs',
  'node:fs',
  'os',
  'node:os',
  'net',
  'node:net',
]);

/** @internal Dangerous global function names */
const DANGEROUS_CALLS = new Set(['eval', 'Function']);

/** @internal Functions dangerous when called with string arguments */
const DANGEROUS_STRING_ARG_CALLS = new Set(['setTimeout', 'setInterval']);

/**
 * AST-level security scan for .ts/.js files.
 * Uses TypeScript compiler API (ts.createSourceFile) for accurate detection
 * that regex patterns cannot catch (e.g., obfuscated eval via bracket access).
 * @internal
 */
export function scanCodeAST(content: string, fileName: string): string[] {
  // Lazy-load typescript — it's a devDependency, may not be available at runtime
  let ts: typeof import('typescript') | undefined;
  try {
    const esmRequire = createRequire(import.meta.url);
    ts = esmRequire('typescript') as typeof import('typescript');
  } catch {
    // TypeScript not available at runtime — return sentinel so callers can distinguish
    // "scanner could not run" from "scanner ran and found nothing" (silent-pass security gap)
    return ['__SANDBOX_UNAVAILABLE__:typescript-not-installed'];
  }

  const violations: string[] = [];
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
    ts.ScriptKind.TS,
  );

  function visit(node: import('typescript').Node): void {
    if (!ts) return;

    // ─── CallExpression: eval(...), Function(...), require('child_process'), etc.
    if (ts.isCallExpression(node)) {
      const expr = node.expression;

      // Direct calls: eval(), Function()
      if (ts.isIdentifier(expr)) {
        const name = expr.text;
        if (DANGEROUS_CALLS.has(name)) {
          violations.push(`AST: Dangerous call to ${name}()`);
        }
        if (DANGEROUS_STRING_ARG_CALLS.has(name) && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          if (firstArg && ts.isStringLiteral(firstArg)) {
            violations.push(`AST: ${name}() called with string argument (code execution)`);
          }
        }

        // require('child_process') etc.
        if (name === 'require' && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          if (firstArg && ts.isStringLiteral(firstArg) && DANGEROUS_MODULES.has(firstArg.text)) {
            violations.push(`AST: require('${firstArg.text}') — dangerous module`);
          }
        }
      }

      // Bracket-access calls: global['eval'](...), globalThis['eval'](...)
      if (ts.isElementAccessExpression(expr)) {
        const arg = expr.argumentExpression;
        if (ts.isStringLiteral(arg)) {
          if (DANGEROUS_CALLS.has(arg.text)) {
            violations.push(`AST: Bracket-access call to ['${arg.text}']()`);
          }
        }
        // String concatenation in bracket: global['ev'+'al']
        if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
          const resolved = tryResolveStringConcat(arg, ts);
          if (resolved !== null && DANGEROUS_CALLS.has(resolved)) {
            violations.push(`AST: Obfuscated bracket-access call to ['${resolved}']()`);
          }
        }
      }
    }

    // ─── Dynamic import: import('child_process')
    if (ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isStringLiteral(firstArg) && DANGEROUS_MODULES.has(firstArg.text)) {
        violations.push(`AST: Dynamic import('${firstArg.text}') — dangerous module`);
      }
    }

    // ─── NewExpression: new Function(...)
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (DANGEROUS_CALLS.has(name)) {
        violations.push(`AST: Dangerous call to new ${name}()`);
      }
    }

    // ─── Property access: global.eval, globalThis.eval
    if (ts.isPropertyAccessExpression(node)) {
      const objName = ts.isIdentifier(node.expression) ? node.expression.text : '';
      if ((objName === 'global' || objName === 'globalThis') && DANGEROUS_CALLS.has(node.name.text)) {
        violations.push(`AST: Property access ${objName}.${node.name.text}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

/** @internal Try to resolve a binary string concatenation ('ev' + 'al') at AST level */
function tryResolveStringConcat(
  node: import('typescript').BinaryExpression,
  ts: typeof import('typescript'),
): string | null {
  const left = node.left;
  const right = node.right;

  const leftStr = ts.isStringLiteral(left)
    ? left.text
    : (ts.isBinaryExpression(left) && left.operatorToken.kind === ts.SyntaxKind.PlusToken)
      ? tryResolveStringConcat(left, ts)
      : null;
  const rightStr = ts.isStringLiteral(right)
    ? right.text
    : (ts.isBinaryExpression(right) && right.operatorToken.kind === ts.SyntaxKind.PlusToken)
      ? tryResolveStringConcat(right, ts)
      : null;

  if (leftStr !== null && rightStr !== null) {
    return leftStr + rightStr;
  }
  return null;
}

// ─── Built-in Trusted Skills ─────────────────────────────────────────────────
// IDs must match real `src/core/builtins/skills/*/manifest.json` id fields —
// a stale id here silently breaks isTrusted() for that skill (it would be
// scanned as untrusted third-party). No "node-expert" skill exists; there is
// no substitute id for it, so it is omitted rather than mismapped.

const BUILTIN_TRUSTED_SKILLS = new Set([
  'typescript-expert',
  'react-specialist',
  'testing-expert',
  'documentation-writer',
]);

// ─── Filesystem abstraction for testing ──────────────────────────────────────

export interface SkillSandboxFS {
  existsSync: typeof fs.existsSync;
  mkdirSync: typeof fs.mkdirSync;
  readdirSync: typeof fs.readdirSync;
  readFileSync: typeof fs.readFileSync;
  renameSync: typeof fs.renameSync;
  writeFileSync: typeof fs.writeFileSync;
}

const defaultFS: SkillSandboxFS = {
  get existsSync() { return fs.existsSync; },
  get mkdirSync() { return fs.mkdirSync; },
  get readdirSync() { return fs.readdirSync; },
  get readFileSync() { return fs.readFileSync; },
  get renameSync() { return fs.renameSync; },
  get writeFileSync() { return fs.writeFileSync; },
} as SkillSandboxFS;

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
        const relFile = file.replace(resolvedPath + '/', '');

        // Pass 1: Fast regex scan (all file types)
        for (const { pattern, description } of SUSPICIOUS_PATTERNS) {
          if (pattern.test(content)) {
            issues.push(`${relFile}: ${description}`);
          }
        }

        // Pass 2: AST scan (.ts/.js files only — more accurate, catches obfuscation)
        if (/\.(ts|js|mjs|cjs)$/.test(file)) {
          const astViolations = scanCodeAST(content, file);
          for (const v of astViolations) {
            issues.push(`${relFile}: ${v}`);
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
   * Fail-closed sandbox gate: trusted skills (built-in or explicitly trusted)
   * bypass scanning; anything else MUST pass `validateSkillSafety` or this
   * throws `SkillSandboxError` with every issue listed. Intended as the single
   * enforcement point for both `skill publish` and `skill install` — unlike
   * `validateSkillSafety`, which only reports, this makes "unsafe" a hard stop.
   */
  requireSafe(skillPath: string, skillId: string): SafetyReport {
    if (this.isTrusted(skillId)) {
      return { safe: true, issues: [], scannedFiles: 0 };
    }

    const report = this.validateSkillSafety(skillPath);
    if (!report.safe) {
      throw new SkillSandboxError(
        `Skill "${skillId}" failed sandbox validation (${report.issues.length} issue(s)):\n` +
        report.issues.map((issue) => `  - ${issue}`).join('\n'),
      );
    }
    return report;
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
