// ─── Plugin Loader — Security Layer ──────────────────────────────────────────
// Provides sandbox AST scanning + SHA-256 signature verification before
// plugin hook modules are loaded via import(). Defense-in-depth approach:
//   1. SkillSandbox AST scan — rejects plugins with dangerous code patterns
//   2. SHA-256 integrity verification — ensures plugin files haven't been tampered with
//      (integrity only — proves the file wasn't corrupted, NOT who published it: an
//      attacker who controls the file also controls the hash written next to it)
//   3. Publisher-identity (Ed25519) verification — proves WHO signed the plugin,
//      checked against an operator-configured trust root (born-612)
//   4. Allowed path list — restricts plugin loading to known directories, via real
//      path-containment (not prefix comparison, which a sibling dir like
//      "plugins-evil" can spoof — born-612)

import * as ed from '@noble/ed25519';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import * as nodePath from 'node:path';
import { join } from 'node:path';
import type { PluginManifest, Plugin } from './plugin.js';
import { PluginSecurityError } from './plugin.js';
import { SkillSandbox } from './marketplace/skill-sandbox.js';
import type { SafetyReport } from './marketplace/skill-sandbox.js';
// Importing from signature.ts also runs its module-level `ed.etc.sha512Sync/Async`
// wiring (ESM modules are singletons — the same `@noble/ed25519` instance is shared),
// which is what makes the sync `ed.verify()` call in verifySignatureSync() below work.
import { hexToBytes } from './signature.js';

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

// ─── Path Containment ───────────────────────────────────────────────────────

/** The subset of `node:path` a containment check needs — lets a test inject `path.win32`
 *  to get deterministic Windows-separator coverage without depending on `process.platform`. */
type PathImpl = Pick<typeof nodePath, 'resolve' | 'relative' | 'isAbsolute'>;

/**
 * True if `childDir` is contained within `parentDir` (equal to it, or a real descendant).
 * Uses `path.relative()` instead of prefix comparison: `startsWith()` treats
 * "/plugins-evil" as contained by "/plugins" because the STRING "/plugins-evil" starts
 * with the string "/plugins" — a sibling directory, not a descendant. `path.relative()`
 * gives the actual filesystem relationship: not contained when the relative path escapes
 * upward (starts with "..") or lands on a different root entirely (absolute result, e.g.
 * crossing drive letters on Windows).
 */
export function isPathContained(childDir: string, parentDir: string, pathImpl: PathImpl = nodePath): boolean {
  const resolvedChild = pathImpl.resolve(childDir);
  const resolvedParent = pathImpl.resolve(parentDir);
  if (resolvedChild === resolvedParent) return true;
  const rel = pathImpl.relative(resolvedParent, resolvedChild);
  if (rel === '') return true;
  if (rel.startsWith('..') || pathImpl.isAbsolute(rel)) return false;
  return true;
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

// ─── Publisher-Identity (Ed25519) Verification ───────────────────────────────
// Fixes: SHA-256 above proves integrity ("file wasn't corrupted"), not identity
// ("who published this"). An attacker who controls the plugin file also controls
// the hash sitting next to it in the manifest — the hash is not a signature.
// This layer verifies a real detached Ed25519 signature against an
// operator-configured trust root, reusing signature.ts's existing infra.

/** One trust-root entry: a publisher key id the operator has decided to trust,
 *  mapped to its hex-encoded Ed25519 public key (32 bytes / 64 hex chars). */
export interface TrustedPublisherKey {
  keyId: string;
  publicKey: string;
}

/** Detached Ed25519 publisher signature, read from a plugin manifest's optional
 *  `publisherSignature` block. Deliberately a different manifest key than
 *  `signature` (the legacy SHA-256 field) — `plugin.ts`'s `validateManifest()`
 *  hard-rejects any `signature.algorithm !== 'sha256'`, so an ed25519 block can't
 *  live under the `signature` key without that manifest passing validation. */
export interface PublisherSignature {
  alg: 'ed25519';
  publisherKeyId: string;
  sig: string;
}

/** Loosely-typed `plugins.*` config block — structurally compatible with a future
 *  `DeckentConfig`/`ResolvedConfig.plugins` shape without requiring config-types.ts
 *  to declare it first (that wiring is out of this module's scope; see
 *  `resolvePluginSecurityConfig()`). */
export interface PluginsRawConfig {
  require_signature?: boolean;
  trusted_publisher_keys?: TrustedPublisherKey[];
  allowed_paths?: string[];
}

export interface PluginAuthenticityResult {
  /** True once a trust root was configured and a check actually ran (dormant otherwise). */
  checked: boolean;
  /** True if the manifest carries a `publisherSignature` block. */
  present: boolean;
  /** True if the publisher key id matched a configured trust-root entry. */
  trustedKey: boolean;
  /** True if the signature cryptographically verified against the trusted key. */
  valid: boolean;
  allowed: boolean;
  publisherKeyId?: string;
  warnings: string[];
  errors: string[];
}

/**
 * Read the optional `publisherSignature` block directly off `manifest.json` on disk.
 * Independent of `validateManifest()`/`PluginManifest` (which doesn't carry this
 * field) — reads the raw JSON so this works without changing plugin.ts's schema.
 * Returns null if absent or malformed (malformed is treated as "no signature",
 * not an error — the manifest itself already passed the loader's own validation).
 */
export function readPublisherSignature(pluginDir: string): PublisherSignature | null {
  const raw = readRawManifestJson(pluginDir);
  if (!raw) return null;
  const sig = raw['publisherSignature'];
  if (!sig || typeof sig !== 'object' || Array.isArray(sig)) return null;
  const s = sig as Record<string, unknown>;
  if (s['alg'] !== 'ed25519') return null;
  if (typeof s['publisherKeyId'] !== 'string' || !s['publisherKeyId'].trim()) return null;
  if (typeof s['sig'] !== 'string' || !s['sig'].trim()) return null;
  return { alg: 'ed25519', publisherKeyId: s['publisherKeyId'], sig: s['sig'] };
}

/** @internal Parse manifest.json into a plain object, or null if missing/malformed. */
function readRawManifestJson(pluginDir: string): Record<string, unknown> | null {
  const manifestPath = join(pluginDir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Resolve a trust-root entry's public key by publisher key id.
 * Returns null if the key id isn't trusted, or its hex value doesn't decode.
 */
export function resolveTrustedPublisherKey(
  publisherKeyId: string,
  trustedKeys: TrustedPublisherKey[],
): Uint8Array | null {
  const entry = trustedKeys.find((k) => k.keyId === publisherKeyId);
  if (!entry) return null;
  try {
    return hexToBytes(entry.publicKey);
  } catch {
    return null;
  }
}

/**
 * Canonical plugin-signing payload: entrypoint file content + serialized manifest
 * (with the signature block itself excluded, so the payload doesn't self-reference
 * the signature being verified). Mirrors `signature.ts`'s `buildSkillSignPayload`
 * convention for the plugin domain. Exported so a future `plugin publish`-style
 * signer command produces bytes that verify against this exact function.
 */
export function buildPluginSignPayload(entrypointContent: string, rawManifest: Record<string, unknown>): string {
  const { publisherSignature: _publisherSignature, ...rest } = rawManifest;
  return entrypointContent + JSON.stringify(rest);
}

/**
 * Synchronous Ed25519 verify. Mirrors `signature.ts`'s `verifySignature()` but
 * sync, so `validatePluginSecurity()` (and every existing sync caller/test of it)
 * doesn't have to become Promise-returning to gain authenticity checking. Safe to
 * call sync because this file imports from `signature.ts`, which wires
 * `ed.etc.sha512Sync` at module-eval time — before any function in this file runs.
 */
function verifySignatureSync(message: string, signatureHex: string, publicKey: Uint8Array): boolean {
  try {
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = hexToBytes(signatureHex);
    return ed.verify(sigBytes, msgBytes, publicKey);
  } catch {
    return false;
  }
}

/**
 * Verify a plugin's publisher identity against the operator's trust root.
 * Dormant (checked=false, allowed=true, no warnings/errors) when
 * `trusted_publisher_keys` isn't configured — there is nothing to verify against,
 * and this keeps every caller that doesn't set it byte-identical to pre-born-612
 * behavior. Once a trust root is configured:
 *   - no `publisherSignature` present -> "unsigned": loud warning always; rejected
 *     only when `require_signature` is true (fail-closed opt-in).
 *   - `publisherSignature` present but the key id is untrusted, or the signature
 *     doesn't verify -> always rejected, regardless of `require_signature`. A
 *     present-but-broken signature is stronger evidence of tampering than no
 *     signature at all, so it is never downgraded to a warning.
 */
export function checkPluginAuthenticity(
  plugin: Plugin,
  config: PluginSecurityConfig,
): PluginAuthenticityResult {
  const result: PluginAuthenticityResult = {
    checked: false,
    present: false,
    trustedKey: false,
    valid: false,
    allowed: true,
    warnings: [],
    errors: [],
  };

  const trustedKeys = config.trusted_publisher_keys;
  if (!trustedKeys || trustedKeys.length === 0) {
    return result;
  }
  result.checked = true;

  const publisherSig = readPublisherSignature(plugin.dir);
  if (!publisherSig) {
    result.warnings.push(
      `UNSIGNED: Plugin "${plugin.manifest.name}" has no publisher signature — loading with reduced trust`
    );
    if (config.require_signature) {
      result.allowed = false;
      result.errors.push(
        `Plugin "${plugin.manifest.name}" has no publisher signature and require_signature is enabled`
      );
    }
    return result;
  }
  result.present = true;
  result.publisherKeyId = publisherSig.publisherKeyId;

  const publicKey = resolveTrustedPublisherKey(publisherSig.publisherKeyId, trustedKeys);
  if (!publicKey) {
    result.allowed = false;
    result.errors.push(
      `Plugin "${plugin.manifest.name}" signed by untrusted publisher key id "${publisherSig.publisherKeyId}"`
    );
    return result;
  }
  result.trustedKey = true;

  const entrypointPath = join(plugin.dir, plugin.manifest.entrypoint);
  if (!existsSync(entrypointPath)) {
    result.allowed = false;
    result.errors.push(
      `Plugin "${plugin.manifest.name}": entrypoint file not found for authenticity check: ${entrypointPath}`
    );
    return result;
  }

  const rawManifest = readRawManifestJson(plugin.dir) ?? {};
  const payload = buildPluginSignPayload(readFileSync(entrypointPath, 'utf-8'), rawManifest);
  const valid = verifySignatureSync(payload, publisherSig.sig, publicKey);
  result.valid = valid;
  if (!valid) {
    result.allowed = false;
    result.errors.push(
      `Plugin "${plugin.manifest.name}" publisher signature verification failed — signature does not match content`
    );
  }
  return result;
}

/**
 * Resolve a `PluginSecurityConfig` from a loosely-typed `{plugins?: ...}` config
 * block. Structurally compatible with a future `ResolvedConfig` once
 * config-types.ts/config.ts grow a `plugins` block (out of this module's write
 * scope) — a follow-up can pass its resolved config straight in without any
 * further change here.
 */
export function resolvePluginSecurityConfig(
  projectRoot: string,
  rawConfig: { plugins?: PluginsRawConfig } | undefined,
): PluginSecurityConfig {
  const plugins = rawConfig?.plugins;
  return {
    projectRoot,
    require_signature: plugins?.require_signature ?? false,
    allowed_paths: plugins?.allowed_paths,
    trusted_publisher_keys: plugins?.trusted_publisher_keys,
  };
}

// ─── Secure Plugin Validation ───────────────────────────────────────────────

export interface PluginSecurityConfig {
  /** Require valid signature (default: false for backwards-compat).
   *  Governs BOTH the legacy SHA-256 field and publisher-identity verification
   *  (the latter only when `trusted_publisher_keys` is configured). */
  require_signature: boolean;
  /** Project root for SkillSandbox initialization */
  projectRoot: string;
  /** Optional allowed plugin directory paths. If set, plugins outside these paths are rejected. */
  allowed_paths?: string[];
  /** Trust root for publisher-identity (Ed25519) verification — passthrough for
   *  `plugins.trusted_publisher_keys[]` config. Dormant (no authenticity check runs)
   *  when unset — additive, byte-identical to pre-born-612 behavior. */
  trusted_publisher_keys?: TrustedPublisherKey[];
}

export interface PluginSecurityResult {
  allowed: boolean;
  unsigned: boolean;
  sandboxReport: SafetyReport;
  signatureValid: boolean;
  warnings: string[];
  errors: string[];
  /** Publisher-identity (Ed25519) verification outcome — always present, but only
   *  `checked: true` when a trust root was configured. */
  authenticity: PluginAuthenticityResult;
}

/**
 * Perform full security validation on a plugin before loading its hook modules.
 *
 * Validation order:
 *   1. Allowed path check (if configured)
 *   2. SkillSandbox AST scan — rejects plugins with dangerous code
 *   3. SHA-256 integrity verification — rejects on mismatch, warns on unsigned
 *   4. Publisher-identity (Ed25519) verification — dormant unless
 *      `trusted_publisher_keys` is configured; see checkPluginAuthenticity()
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
    authenticity: {
      checked: false,
      present: false,
      trustedKey: false,
      valid: false,
      allowed: true,
      warnings: [],
      errors: [],
    },
  };

  // Step 1: Allowed path check — real containment (path.relative-based), not prefix
  // comparison; see isPathContained() for why prefix comparison is exploitable.
  if (config.allowed_paths && config.allowed_paths.length > 0) {
    const inAllowedPath = config.allowed_paths.some(
      (p) => isPathContained(plugin.dir, p)
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

  // Step 3: Legacy SHA-256 signature verification (integrity only — see Step 4 for
  // publisher identity). A plugin carrying a publisherSignature (ed25519) block
  // defers require_signature/unsigned reporting to Step 4 instead of double-reporting
  // "no signature" for a plugin that has in fact adopted the newer scheme.
  const hasPublisherSignature = readPublisherSignature(plugin.dir) !== null;
  if (!plugin.manifest.signature) {
    result.unsigned = true;
    if (hasPublisherSignature) {
      // Step 4 verifies and reports on the publisherSignature block.
    } else if (config.require_signature) {
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

  // Step 4: Publisher-identity (Ed25519) verification — dormant unless
  // config.trusted_publisher_keys is set (see checkPluginAuthenticity() doc).
  const authenticity = checkPluginAuthenticity(plugin, config);
  result.authenticity = authenticity;
  if (authenticity.warnings.length > 0) {
    result.warnings.push(...authenticity.warnings);
  }
  if (!authenticity.allowed) {
    result.allowed = false;
    result.errors.push(...authenticity.errors);
  }

  return result;
}
