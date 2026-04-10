// ─── Plugin Loader — Security Layer ──────────────────────────────────────────
// Provides sandbox AST scanning + SHA-256 signature verification before
// plugin hook modules are loaded via import(). Defense-in-depth approach:
//   1. SkillSandbox AST scan — rejects plugins with dangerous code patterns
//   2. SHA-256 integrity verification — ensures plugin files haven't been tampered with
//   3. Allowed path list — restricts plugin loading to known directories

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PluginManifest, Plugin } from './plugin.js';
import { PluginSecurityError } from './plugin.js';
import { SkillSandbox } from './marketplace/skill-sandbox.js';
import type { SafetyReport } from './marketplace/skill-sandbox.js';

// ─── SHA-256 Signature ──────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a file's contents.
 * Returns lowercase hex string.
 */
export function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Verify a plugin's SHA-256 signature against its entrypoint file.
 * Returns true if the signature matches, false otherwise.
 * Throws PluginSecurityError if the entrypoint file doesn't exist.
 */
export function verifyPluginSignature(pluginDir: string, manifest: PluginManifest): boolean {
  if (!manifest.signature) {
    return false; // No signature present — caller decides what to do
  }

  const entrypointPath = join(pluginDir, manifest.entrypoint);
  if (!existsSync(entrypointPath)) {
    throw new PluginSecurityError(
      `Plugin "${manifest.name}": entrypoint file not found: ${entrypointPath}`
    );
  }

  const actualHash = computeFileHash(entrypointPath);
  return actualHash === manifest.signature.value;
}

// ─── Sandbox Scan ───────────────────────────────────────────────────────────

/**
 * Run SkillSandbox AST + regex scan on a plugin directory.
 * Returns the safety report with any detected issues.
 */
export function scanPluginSandbox(pluginDir: string, projectRoot: string): SafetyReport {
  const sandbox = new SkillSandbox(projectRoot);
  return sandbox.validateSkillSafety(pluginDir);
}

// ─── Secure Plugin Validation ───────────────────────────────────────────────

export interface PluginSecurityConfig {
  /** Require valid SHA-256 signature (default: false for backwards-compat) */
  require_signature: boolean;
  /** Project root for SkillSandbox initialization */
  projectRoot: string;
  /** Optional allowed plugin directory paths. If set, plugins outside these paths are rejected. */
  allowed_paths?: string[];
}

export interface PluginSecurityResult {
  allowed: boolean;
  unsigned: boolean;
  sandboxReport: SafetyReport;
  signatureValid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Perform full security validation on a plugin before loading its hook modules.
 *
 * Validation order:
 *   1. Allowed path check (if configured)
 *   2. SkillSandbox AST scan — rejects plugins with dangerous code
 *   3. Signature verification — rejects on mismatch, warns on unsigned
 *
 * Returns PluginSecurityResult with allowed=true if the plugin passes all checks.
 */
export function validatePluginSecurity(
  plugin: Plugin,
  config: PluginSecurityConfig,
): PluginSecurityResult {
  const result: PluginSecurityResult = {
    allowed: true,
    unsigned: false,
    sandboxReport: { safe: true, issues: [], scannedFiles: 0 },
    signatureValid: false,
    warnings: [],
    errors: [],
  };

  // Step 1: Allowed path check
  if (config.allowed_paths && config.allowed_paths.length > 0) {
    const resolvedPluginDir = resolve(plugin.dir);
    const inAllowedPath = config.allowed_paths.some(
      (p) => resolvedPluginDir.startsWith(resolve(p))
    );
    if (!inAllowedPath) {
      result.allowed = false;
      result.errors.push(
        `Plugin "${plugin.manifest.name}" is outside allowed paths: ${config.allowed_paths.join(', ')}`
      );
      return result;
    }
  }

  // Step 2: Sandbox AST scan
  const sandboxReport = scanPluginSandbox(plugin.dir, config.projectRoot);
  result.sandboxReport = sandboxReport;

  if (!sandboxReport.safe) {
    result.allowed = false;
    result.errors.push(
      `Plugin "${plugin.manifest.name}" failed sandbox scan: ${sandboxReport.issues.join('; ')}`
    );
    return result;
  }

  // Step 3: Signature verification
  if (!plugin.manifest.signature) {
    result.unsigned = true;
    if (config.require_signature) {
      result.allowed = false;
      result.errors.push(
        `Plugin "${plugin.manifest.name}" has no signature and plugin_require_signature is enabled`
      );
    } else {
      result.warnings.push(
        `UNSIGNED: Plugin "${plugin.manifest.name}" has no signature — loading with reduced trust`
      );
    }
  } else {
    try {
      const sigValid = verifyPluginSignature(plugin.dir, plugin.manifest);
      result.signatureValid = sigValid;
      if (!sigValid) {
        result.allowed = false;
        result.errors.push(
          `Plugin "${plugin.manifest.name}" signature mismatch — expected ${plugin.manifest.signature.value}, file hash differs`
        );
      }
    } catch (err) {
      result.allowed = false;
      result.errors.push(
        err instanceof Error ? err.message : `Signature verification failed: ${String(err)}`
      );
    }
  }

  return result;
}
