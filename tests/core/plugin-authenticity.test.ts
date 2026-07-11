import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

import {
  isPathContained,
  validatePluginSecurity,
  checkPluginAuthenticity,
  readPublisherSignature,
  resolveTrustedPublisherKey,
  buildPluginSignPayload,
  resolvePluginSecurityConfig,
} from '../../src/core/plugin-loader.js';
import type { PluginSecurityConfig, TrustedPublisherKey } from '../../src/core/plugin-loader.js';
import type { PluginManifest, Plugin } from '../../src/core/plugin.js';
import { generateKeypair, signMessage, bytesToHex } from '../../src/core/signature.js';
import type { Keypair } from '../../src/core/signature.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

let testDir: string;

function createTestDir(): string {
  const dir = path.join(tmpdir(), `plugin-authenticity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function baseConfig(overrides: Partial<PluginSecurityConfig> = {}): PluginSecurityConfig {
  return { require_signature: false, projectRoot: testDir, ...overrides };
}

beforeEach(() => {
  testDir = createTestDir();
});

afterEach(() => {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

// ─── RED — path-containment prefix-bypass ────────────────────────────────────

describe('RED — path-containment prefix-bypass (the bug this task closes)', () => {
  it('proves the vulnerability class: naive string-prefix comparison treats a sibling dir as contained', () => {
    const allowedRoot = path.join(testDir, 'plugins');
    const evilDir = path.join(testDir, 'plugins-evil');
    fs.mkdirSync(allowedRoot, { recursive: true });
    fs.mkdirSync(evilDir, { recursive: true });

    // This is exactly the pre-fix logic: resolvedPluginDir.startsWith(resolve(allowedPath)).
    const buggyPrefixCheck = path.resolve(evilDir).startsWith(path.resolve(allowedRoot));
    expect(buggyPrefixCheck).toBe(true); // <- the bug: string-prefix match on a sibling dir

    // The real containment check must reject it.
    expect(isPathContained(evilDir, allowedRoot)).toBe(false);
  });

  it('validatePluginSecurity rejects a plugin loaded from an evil-prefix sibling directory', () => {
    const allowedRoot = path.join(testDir, 'plugins');
    const evilDir = path.join(testDir, 'plugins-evil', 'my-plugin');
    fs.mkdirSync(allowedRoot, { recursive: true });
    fs.mkdirSync(evilDir, { recursive: true });
    writeFile(evilDir, 'hook.js', 'export default function() {}');

    const plugin: Plugin = {
      manifest: { name: 'evil', version: '1.0.0', description: 'x', entrypoint: 'hook.js' },
      dir: evilDir,
    };

    const result = validatePluginSecurity(plugin, baseConfig({ allowed_paths: [allowedRoot] }));
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.includes('outside allowed paths'))).toBe(true);
  });
});

// ─── isPathContained ──────────────────────────────────────────────────────────

describe('isPathContained', () => {
  it('true for the same directory', () => {
    expect(isPathContained(testDir, testDir)).toBe(true);
  });

  it('true for a real descendant', () => {
    const child = path.join(testDir, 'sub', 'dir');
    expect(isPathContained(child, testDir)).toBe(true);
  });

  it('false for a sibling directory with a matching string prefix', () => {
    expect(isPathContained(testDir + '-evil', testDir)).toBe(false);
  });

  it('false for a ".."-escape back out of the parent', () => {
    const escapee = path.join(testDir, '..', path.basename(testDir) + '-evil');
    expect(isPathContained(escapee, testDir)).toBe(false);
  });

  describe('Windows separators (path.win32 injected — deterministic on any host OS)', () => {
    const win = path.win32;

    it('true for a real descendant', () => {
      expect(isPathContained('C:\\Users\\me\\plugins\\sub', 'C:\\Users\\me\\plugins', win)).toBe(true);
    });

    it('false for a sibling directory with a matching string prefix', () => {
      expect(isPathContained('C:\\Users\\me\\plugins-evil\\x', 'C:\\Users\\me\\plugins', win)).toBe(false);
    });

    it('false for a ".."-escape', () => {
      expect(isPathContained('C:\\Users\\me\\plugins\\..\\..\\evil', 'C:\\Users\\me\\plugins', win)).toBe(false);
    });

    it('false across drive roots', () => {
      expect(isPathContained('D:\\plugins\\x', 'C:\\Users\\me\\plugins', win)).toBe(false);
    });
  });
});

// ─── RED — SHA-256 "signature" is integrity only, not identity ──────────────

describe('RED — SHA-256 "signature" proves integrity, not authorship', () => {
  it('an attacker who controls the file also controls its sha256 hash — legacy gate alone accepts it', () => {
    const content = 'export default function() { /* attacker-controlled */ }';
    writeFile(testDir, 'hook.js', content);
    const selfComputedHash = createHash('sha256').update(content).digest('hex');

    const plugin: Plugin = {
      manifest: {
        name: 'forged',
        version: '1.0.0',
        description: 'x',
        entrypoint: 'hook.js',
        signature: { algorithm: 'sha256', value: selfComputedHash },
      },
      dir: testDir,
    };

    // Confirms today's legacy sha256-only gate treats this as fully "signed" —
    // exactly the gap born-612 closes with real publisher-identity verification.
    const legacyOnly = validatePluginSecurity(plugin, baseConfig({ require_signature: true }));
    expect(legacyOnly.allowed).toBe(true);
    expect(legacyOnly.signatureValid).toBe(true);

    // The same plugin (no publisherSignature at all) is honestly flagged once an
    // operator configures a trust root — never silently treated as authenticated.
    const withTrustRoot = validatePluginSecurity(plugin, baseConfig({
      require_signature: false,
      trusted_publisher_keys: [{ keyId: 'k1', publicKey: '00'.repeat(32) }],
    }));
    expect(withTrustRoot.authenticity.present).toBe(false);
    expect(withTrustRoot.warnings.some((w) => w.includes('UNSIGNED'))).toBe(true);
  });
});

// ─── readPublisherSignature ───────────────────────────────────────────────────

describe('readPublisherSignature', () => {
  it('returns null when manifest.json has no publisherSignature block', () => {
    writeFile(testDir, 'manifest.json', JSON.stringify({ name: 'x' }));
    expect(readPublisherSignature(testDir)).toBeNull();
  });

  it('returns null when manifest.json does not exist', () => {
    expect(readPublisherSignature(testDir)).toBeNull();
  });

  it('returns null for a malformed publisherSignature block (missing fields)', () => {
    writeFile(testDir, 'manifest.json', JSON.stringify({ name: 'x', publisherSignature: { alg: 'ed25519' } }));
    expect(readPublisherSignature(testDir)).toBeNull();
  });

  it('returns null for a non-ed25519 alg', () => {
    writeFile(testDir, 'manifest.json', JSON.stringify({
      name: 'x',
      publisherSignature: { alg: 'rsa', publisherKeyId: 'k1', sig: 'ab'.repeat(64) },
    }));
    expect(readPublisherSignature(testDir)).toBeNull();
  });

  it('parses a well-formed publisherSignature block', () => {
    writeFile(testDir, 'manifest.json', JSON.stringify({
      name: 'x',
      publisherSignature: { alg: 'ed25519', publisherKeyId: 'k1', sig: 'ab'.repeat(64) },
    }));
    expect(readPublisherSignature(testDir)).toEqual({ alg: 'ed25519', publisherKeyId: 'k1', sig: 'ab'.repeat(64) });
  });
});

// ─── resolveTrustedPublisherKey ───────────────────────────────────────────────

describe('resolveTrustedPublisherKey', () => {
  it('returns null when the key id is not in the trust list', () => {
    expect(resolveTrustedPublisherKey('missing', [{ keyId: 'k1', publicKey: '00'.repeat(32) }])).toBeNull();
  });

  it('returns decoded 32-byte key material for a matching key id', () => {
    const bytes = resolveTrustedPublisherKey('k1', [{ keyId: 'k1', publicKey: 'ab'.repeat(32) }]);
    expect(bytes).not.toBeNull();
    expect(bytes).toHaveLength(32);
  });

  it('returns null for an undecodable hex value', () => {
    expect(resolveTrustedPublisherKey('k1', [{ keyId: 'k1', publicKey: 'not-hex!!' }])).toBeNull();
  });
});

// ─── checkPluginAuthenticity / validatePluginSecurity — Ed25519 roundtrip ────

describe('checkPluginAuthenticity — Ed25519 publisher-identity verification', () => {
  async function makeSignedPlugin(opts: {
    keypair: Keypair;
    keyId?: string;
    tamperAfterSign?: boolean;
  }): Promise<Plugin> {
    const entrypointContent = 'export default function() { return "ok"; }';
    const keyId = opts.keyId ?? 'publisher-1';
    writeFile(testDir, 'index.js', entrypointContent);

    const rawManifest: Record<string, unknown> = {
      name: 'signed-plugin',
      version: '1.0.0',
      description: 'A signed plugin',
      entrypoint: 'index.js',
    };
    const payload = buildPluginSignPayload(entrypointContent, rawManifest);
    const sigHex = await signMessage(payload, opts.keypair.privateKey);

    if (opts.tamperAfterSign) {
      // Simulates tampering after publish — the signature was valid for the
      // ORIGINAL content, but the file on disk no longer matches it.
      writeFile(testDir, 'index.js', entrypointContent + '\n// tampered after signing');
    }

    const manifestJson = {
      ...rawManifest,
      publisherSignature: { alg: 'ed25519', publisherKeyId: keyId, sig: sigHex },
    };
    writeFile(testDir, 'manifest.json', JSON.stringify(manifestJson, null, 2));

    const manifest: PluginManifest = {
      name: 'signed-plugin',
      version: '1.0.0',
      description: 'A signed plugin',
      entrypoint: 'index.js',
    };
    return { manifest, dir: testDir };
  }

  it('roundtrip: signs with a real keypair, configures the same pubkey as trust root, verifies', async () => {
    const kp = await generateKeypair();
    const plugin = await makeSignedPlugin({ keypair: kp });
    const trustedKeys: TrustedPublisherKey[] = [{ keyId: 'publisher-1', publicKey: bytesToHex(kp.publicKey) }];

    const result = checkPluginAuthenticity(plugin, baseConfig({ trusted_publisher_keys: trustedKeys }));
    expect(result.checked).toBe(true);
    expect(result.present).toBe(true);
    expect(result.trustedKey).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('roundtrip through validatePluginSecurity + resolvePluginSecurityConfig (full config passthrough)', async () => {
    const kp = await generateKeypair();
    const plugin = await makeSignedPlugin({ keypair: kp });
    const trustedKeys: TrustedPublisherKey[] = [{ keyId: 'publisher-1', publicKey: bytesToHex(kp.publicKey) }];

    // Exercises the config resolver contract: a loosely-typed `{plugins: {...}}`
    // block (the shape a future ResolvedConfig.plugins would carry) resolves into
    // a PluginSecurityConfig and flows unchanged into verification.
    const config = resolvePluginSecurityConfig(testDir, {
      plugins: { require_signature: true, trusted_publisher_keys: trustedKeys },
    });

    const result = validatePluginSecurity(plugin, config);
    expect(result.allowed).toBe(true);
    expect(result.authenticity.checked).toBe(true);
    expect(result.authenticity.valid).toBe(true);
    expect(result.authenticity.trustedKey).toBe(true);
  });

  it('rejects a forged signature (payload signed by a keypair other than the trust root)', async () => {
    const trustedKp = await generateKeypair();
    const forgerKp = await generateKeypair();
    const plugin = await makeSignedPlugin({ keypair: forgerKp });
    const trustedKeys: TrustedPublisherKey[] = [{ keyId: 'publisher-1', publicKey: bytesToHex(trustedKp.publicKey) }];

    const result = checkPluginAuthenticity(plugin, baseConfig({ trusted_publisher_keys: trustedKeys }));
    expect(result.trustedKey).toBe(true); // the key id matched...
    expect(result.valid).toBe(false); // ...but the crypto doesn't verify
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.includes('verification failed'))).toBe(true);
  });

  it('rejects an untrusted publisher key id (valid crypto, signer not configured as trusted)', async () => {
    const kp = await generateKeypair();
    const otherKp = await generateKeypair();
    const plugin = await makeSignedPlugin({ keypair: kp, keyId: 'unknown-publisher' });
    const trustedKeys: TrustedPublisherKey[] = [{ keyId: 'publisher-1', publicKey: bytesToHex(otherKp.publicKey) }];

    const result = checkPluginAuthenticity(plugin, baseConfig({ trusted_publisher_keys: trustedKeys }));
    expect(result.present).toBe(true);
    expect(result.trustedKey).toBe(false);
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.includes('untrusted publisher key id'))).toBe(true);
  });

  it('rejects content tampered after a valid signature was produced', async () => {
    const kp = await generateKeypair();
    const plugin = await makeSignedPlugin({ keypair: kp, tamperAfterSign: true });
    const trustedKeys: TrustedPublisherKey[] = [{ keyId: 'publisher-1', publicKey: bytesToHex(kp.publicKey) }];

    const result = checkPluginAuthenticity(plugin, baseConfig({ trusted_publisher_keys: trustedKeys }));
    expect(result.trustedKey).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.allowed).toBe(false);
  });

  it('unsigned plugin: default policy loads with a loud warning (never silent) once a trust root is configured', () => {
    writeFile(testDir, 'index.js', 'export default function() {}');
    writeFile(testDir, 'manifest.json', JSON.stringify({
      name: 'unsigned', version: '1.0.0', description: 'x', entrypoint: 'index.js',
    }));
    const plugin: Plugin = {
      manifest: { name: 'unsigned', version: '1.0.0', description: 'x', entrypoint: 'index.js' },
      dir: testDir,
    };
    const trustedKeys: TrustedPublisherKey[] = [{ keyId: 'publisher-1', publicKey: '00'.repeat(32) }];

    const result = checkPluginAuthenticity(plugin, baseConfig({ require_signature: false, trusted_publisher_keys: trustedKeys }));
    expect(result.allowed).toBe(true);
    expect(result.present).toBe(false);
    expect(result.warnings.some((w) => w.includes('UNSIGNED'))).toBe(true);
  });

  it('unsigned plugin: require_signature=true rejects (fail-closed, enterprise profile)', () => {
    writeFile(testDir, 'index.js', 'export default function() {}');
    writeFile(testDir, 'manifest.json', JSON.stringify({
      name: 'unsigned-strict', version: '1.0.0', description: 'x', entrypoint: 'index.js',
    }));
    const plugin: Plugin = {
      manifest: { name: 'unsigned-strict', version: '1.0.0', description: 'x', entrypoint: 'index.js' },
      dir: testDir,
    };
    const trustedKeys: TrustedPublisherKey[] = [{ keyId: 'publisher-1', publicKey: '00'.repeat(32) }];

    const result = checkPluginAuthenticity(plugin, baseConfig({ require_signature: true, trusted_publisher_keys: trustedKeys }));
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.includes('require_signature'))).toBe(true);
  });

  it('dormant (byte-identical to pre-born-612 behavior) when no trust root is configured', async () => {
    const kp = await generateKeypair();
    const plugin = await makeSignedPlugin({ keypair: kp });

    const result = checkPluginAuthenticity(plugin, baseConfig());
    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('validatePluginSecurity stays byte-identical for legacy sha256-only fixtures with no trust root', () => {
    // Regression pin against tests/core/plugin-security.test.ts's own happy path:
    // a plugin with ONLY a legacy sha256 signature must still pass cleanly (no new
    // warnings/errors) when trusted_publisher_keys is unset.
    const content = 'export default function() { return "secure"; }';
    writeFile(testDir, 'secure-hook.js', content);
    const hash = createHash('sha256').update(content).digest('hex');

    const plugin: Plugin = {
      manifest: {
        name: 'secure-plugin',
        version: '1.0.0',
        description: 'Properly signed plugin',
        entrypoint: 'secure-hook.js',
        signature: { algorithm: 'sha256', value: hash },
      },
      dir: testDir,
    };

    const result = validatePluginSecurity(plugin, baseConfig({ require_signature: true }));
    expect(result.allowed).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.unsigned).toBe(false);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.authenticity.checked).toBe(false);
  });
});
