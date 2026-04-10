import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

import {
  computeFileHash,
  verifyPluginSignature,
  scanPluginSandbox,
  validatePluginSecurity,
} from '../../src/core/plugin-loader.js';
import type { PluginSecurityConfig } from '../../src/core/plugin-loader.js';
import { PluginSecurityError } from '../../src/core/plugin.js';
import type { PluginManifest, Plugin } from '../../src/core/plugin.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let testDir: string;

function createTestDir(): string {
  const dir = path.join(tmpdir(), `plugin-security-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function makePlugin(dir: string, manifest: PluginManifest): Plugin {
  return { manifest, dir };
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

beforeEach(() => {
  testDir = createTestDir();
});

afterEach(() => {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

// ─── computeFileHash ────────────────────────────────────────────────────────

describe('computeFileHash', () => {
  it('computes correct SHA-256 hash', () => {
    const content = 'export default function() { return 42; }';
    const filePath = writeFile(testDir, 'index.js', content);
    const hash = computeFileHash(filePath);
    const expected = createHash('sha256').update(content).digest('hex');
    expect(hash).toBe(expected);
    expect(hash).toHaveLength(64); // SHA-256 hex = 64 chars
  });
});

// ─── verifyPluginSignature ──────────────────────────────────────────────────

describe('verifyPluginSignature', () => {
  it('returns false when manifest has no signature', () => {
    const manifest: PluginManifest = {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'Test',
      entrypoint: 'index.js',
    };
    expect(verifyPluginSignature(testDir, manifest)).toBe(false);
  });

  it('returns true when signature matches file hash', () => {
    const content = 'export default function hook() { console.log("ok"); }';
    writeFile(testDir, 'index.js', content);
    const hash = sha256(content);

    const manifest: PluginManifest = {
      name: 'signed-plugin',
      version: '1.0.0',
      description: 'Signed test plugin',
      entrypoint: 'index.js',
      signature: { algorithm: 'sha256', value: hash },
    };

    expect(verifyPluginSignature(testDir, manifest)).toBe(true);
  });

  it('returns false when signature does not match', () => {
    writeFile(testDir, 'index.js', 'modified content');

    const manifest: PluginManifest = {
      name: 'tampered-plugin',
      version: '1.0.0',
      description: 'Tampered plugin',
      entrypoint: 'index.js',
      signature: { algorithm: 'sha256', value: 'deadbeef'.repeat(8) },
    };

    expect(verifyPluginSignature(testDir, manifest)).toBe(false);
  });

  it('throws PluginSecurityError when entrypoint file not found', () => {
    const manifest: PluginManifest = {
      name: 'missing-entry',
      version: '1.0.0',
      description: 'Missing entrypoint',
      entrypoint: 'nonexistent.js',
      signature: { algorithm: 'sha256', value: 'abc123' },
    };

    expect(() => verifyPluginSignature(testDir, manifest)).toThrow(PluginSecurityError);
    expect(() => verifyPluginSignature(testDir, manifest)).toThrow('entrypoint file not found');
  });
});

// ─── scanPluginSandbox ──────────────────────────────────────────────────────

describe('scanPluginSandbox', () => {
  it('reports safe for clean plugin code', () => {
    writeFile(testDir, 'index.ts', 'export default function hook() { return 42; }');
    const report = scanPluginSandbox(testDir, testDir);
    expect(report.safe).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.scannedFiles).toBeGreaterThan(0);
  });

  it('detects dangerous code patterns (eval)', () => {
    writeFile(testDir, 'evil.ts', 'const x = eval("alert(1)");');
    const report = scanPluginSandbox(testDir, testDir);
    expect(report.safe).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.some(i => i.includes('eval'))).toBe(true);
  });

  it('detects child_process import', () => {
    writeFile(testDir, 'cmd.ts', 'import { exec } from "node:child_process"; exec("rm -rf /");');
    const report = scanPluginSandbox(testDir, testDir);
    expect(report.safe).toBe(false);
    expect(report.issues.some(i => i.includes('child_process'))).toBe(true);
  });
});

// ─── validatePluginSecurity (integration) ───────────────────────────────────

describe('validatePluginSecurity', () => {
  const defaultConfig: PluginSecurityConfig = {
    require_signature: false,
    projectRoot: '',
  };

  beforeEach(() => {
    defaultConfig.projectRoot = testDir;
  });

  it('rejects plugin that fails sandbox scan (dangerous code)', () => {
    writeFile(testDir, 'evil-hook.js', 'const x = eval("process.exit(1)");');
    writeFile(testDir, 'manifest.json', JSON.stringify({
      name: 'evil-plugin',
      version: '1.0.0',
      description: 'Evil',
      entrypoint: 'evil-hook.js',
    }));

    const plugin = makePlugin(testDir, {
      name: 'evil-plugin',
      version: '1.0.0',
      description: 'Evil plugin with eval',
      entrypoint: 'evil-hook.js',
    });

    const result = validatePluginSecurity(plugin, defaultConfig);
    expect(result.allowed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('sandbox scan'))).toBe(true);
  });

  it('rejects plugin with mismatched signature', () => {
    const content = 'export default function() { return "safe"; }';
    writeFile(testDir, 'hook.js', content);

    const plugin = makePlugin(testDir, {
      name: 'tampered-plugin',
      version: '1.0.0',
      description: 'Tampered',
      entrypoint: 'hook.js',
      signature: { algorithm: 'sha256', value: 'wrong_hash_value_' + '0'.repeat(48) },
    });

    const result = validatePluginSecurity(plugin, defaultConfig);
    expect(result.allowed).toBe(false);
    expect(result.signatureValid).toBe(false);
    expect(result.errors.some(e => e.includes('signature mismatch'))).toBe(true);
  });

  it('allows unsigned plugin with warning when require_signature=false', () => {
    const content = 'export default function() { return "ok"; }';
    writeFile(testDir, 'safe-hook.js', content);

    const plugin = makePlugin(testDir, {
      name: 'unsigned-plugin',
      version: '1.0.0',
      description: 'Unsigned but safe',
      entrypoint: 'safe-hook.js',
    });

    const result = validatePluginSecurity(plugin, { ...defaultConfig, require_signature: false });
    expect(result.allowed).toBe(true);
    expect(result.unsigned).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('UNSIGNED'))).toBe(true);
  });

  it('rejects unsigned plugin when require_signature=true', () => {
    const content = 'export default function() { return "ok"; }';
    writeFile(testDir, 'safe-hook.js', content);

    const plugin = makePlugin(testDir, {
      name: 'unsigned-strict',
      version: '1.0.0',
      description: 'Unsigned, strict mode',
      entrypoint: 'safe-hook.js',
    });

    const result = validatePluginSecurity(plugin, { ...defaultConfig, require_signature: true });
    expect(result.allowed).toBe(false);
    expect(result.unsigned).toBe(true);
    expect(result.errors.some(e => e.includes('no signature'))).toBe(true);
  });

  it('allows valid signed plugin (happy path)', () => {
    const content = 'export default function() { return "secure"; }';
    writeFile(testDir, 'secure-hook.js', content);
    const hash = sha256(content);

    const plugin = makePlugin(testDir, {
      name: 'secure-plugin',
      version: '1.0.0',
      description: 'Properly signed plugin',
      entrypoint: 'secure-hook.js',
      signature: { algorithm: 'sha256', value: hash },
    });

    const result = validatePluginSecurity(plugin, { ...defaultConfig, require_signature: true });
    expect(result.allowed).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.unsigned).toBe(false);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('rejects plugin outside allowed_paths', () => {
    const content = 'export default function() { return "ok"; }';
    writeFile(testDir, 'hook.js', content);

    const plugin = makePlugin(testDir, {
      name: 'path-blocked',
      version: '1.0.0',
      description: 'Outside allowed paths',
      entrypoint: 'hook.js',
    });

    const result = validatePluginSecurity(plugin, {
      ...defaultConfig,
      allowed_paths: ['/some/other/path'],
    });
    expect(result.allowed).toBe(false);
    expect(result.errors.some(e => e.includes('outside allowed paths'))).toBe(true);
  });
});
