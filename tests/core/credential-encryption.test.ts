import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  encrypt,
  decrypt,
  getMasterKey,
  isEncryptedEntry,
  CredentialEncryptionError,
} from '../../src/core/credential-encryption.js';
import { CredentialManager } from '../../src/core/credentials.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `deckent-enc-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTestKey(): Buffer {
  return randomBytes(32);
}

// ─── encrypt / decrypt roundtrip ────────────────────────────────────────────

describe('credential-encryption — encrypt/decrypt', () => {
  it('roundtrip: encrypts and decrypts correctly', () => {
    const key = makeTestKey();
    const plaintext = 'sk-ant-api-key-12345-secret';

    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it('encrypted payload has iv, ciphertext, and tag as hex strings', () => {
    const key = makeTestKey();
    const encrypted = encrypt('test-value', key);

    expect(typeof encrypted.iv).toBe('string');
    expect(typeof encrypted.ciphertext).toBe('string');
    expect(typeof encrypted.tag).toBe('string');
    // IV should be 12 bytes = 24 hex chars
    expect(encrypted.iv.length).toBe(24);
    // Auth tag should be 16 bytes = 32 hex chars
    expect(encrypted.tag.length).toBe(32);
  });

  it('each encryption produces different ciphertext (unique IV)', () => {
    const key = makeTestKey();
    const plaintext = 'same-secret';

    const enc1 = encrypt(plaintext, key);
    const enc2 = encrypt(plaintext, key);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it('handles empty string', () => {
    const key = makeTestKey();
    const encrypted = encrypt('', key);
    expect(decrypt(encrypted, key)).toBe('');
  });

  it('handles unicode content', () => {
    const key = makeTestKey();
    const plaintext = 'Türkçe karakter: ğüşıöç — 日本語';
    const encrypted = encrypt(plaintext, key);
    expect(decrypt(encrypted, key)).toBe(plaintext);
  });

  it('rejects invalid key length for encrypt', () => {
    const shortKey = randomBytes(16);
    expect(() => encrypt('test', shortKey)).toThrow(CredentialEncryptionError);
  });

  it('rejects invalid key length for decrypt', () => {
    const key = makeTestKey();
    const encrypted = encrypt('test', key);
    const shortKey = randomBytes(16);
    expect(() => decrypt(encrypted, shortKey)).toThrow(CredentialEncryptionError);
  });
});

// ─── wrong key → decrypt fail ──────────────────────────────────────────────

describe('credential-encryption — wrong key', () => {
  it('decrypt with wrong key throws CredentialEncryptionError', () => {
    const key1 = makeTestKey();
    const key2 = makeTestKey();
    const encrypted = encrypt('secret-api-key', key1);

    expect(() => decrypt(encrypted, key2)).toThrow(CredentialEncryptionError);
  });

  it('tampered ciphertext throws CredentialEncryptionError', () => {
    const key = makeTestKey();
    const encrypted = encrypt('test', key);

    // Flip a byte in ciphertext
    const tampered = { ...encrypted, ciphertext: 'ff' + encrypted.ciphertext.slice(2) };
    expect(() => decrypt(tampered, key)).toThrow(CredentialEncryptionError);
  });

  it('tampered tag throws CredentialEncryptionError', () => {
    const key = makeTestKey();
    const encrypted = encrypt('test', key);

    const tampered = { ...encrypted, tag: '00'.repeat(16) };
    expect(() => decrypt(tampered, key)).toThrow(CredentialEncryptionError);
  });
});

// ─── getMasterKey ───────────────────────────────────────────────────────────

describe('credential-encryption — getMasterKey', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    delete process.env['DECKENT_MASTER_KEY'];
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env['DECKENT_MASTER_KEY'];
  });

  it('auto-generates keyring file on first call', () => {
    const keyringPath = join(tempDir, '.keyring');
    const key = getMasterKey({ keyringPath });

    expect(key.length).toBe(32);
    expect(existsSync(keyringPath)).toBe(true);
  });

  it('returns same key on subsequent calls', () => {
    const keyringPath = join(tempDir, '.keyring');
    const key1 = getMasterKey({ keyringPath });
    const key2 = getMasterKey({ keyringPath });

    expect(key1.equals(key2)).toBe(true);
  });

  it('reads key from DECKENT_MASTER_KEY env var', () => {
    const expectedKey = randomBytes(32);
    process.env['DECKENT_MASTER_KEY'] = expectedKey.toString('hex');

    const key = getMasterKey({ keyringPath: join(tempDir, '.keyring') });
    expect(key.equals(expectedKey)).toBe(true);
  });

  it('env var takes priority over keyring file', () => {
    const keyringPath = join(tempDir, '.keyring');
    // First create a keyring
    getMasterKey({ keyringPath });

    // Now set env var with different key
    const envKey = randomBytes(32);
    process.env['DECKENT_MASTER_KEY'] = envKey.toString('hex');

    const key = getMasterKey({ keyringPath });
    expect(key.equals(envKey)).toBe(true);
  });

  it('throws on invalid env var length', () => {
    process.env['DECKENT_MASTER_KEY'] = 'tooshort';
    expect(() => getMasterKey({ keyringPath: join(tempDir, '.keyring') })).toThrow(
      CredentialEncryptionError,
    );
  });

  it('throws on invalid keyring file content', () => {
    const keyringPath = join(tempDir, '.keyring');
    writeFileSync(keyringPath, 'not-valid-hex\n', 'utf-8');
    expect(() => getMasterKey({ keyringPath })).toThrow(CredentialEncryptionError);
  });

  it('creates parent directory for keyring if needed', () => {
    const nestedKeyring = join(tempDir, 'nested', 'deep', '.keyring');
    const key = getMasterKey({ keyringPath: nestedKeyring });

    expect(key.length).toBe(32);
    expect(existsSync(nestedKeyring)).toBe(true);
  });
});

// ─── isEncryptedEntry ───────────────────────────────────────────────────────

describe('credential-encryption — isEncryptedEntry', () => {
  it('returns true for valid encrypted entry', () => {
    const entry = {
      provider: 'test',
      encrypted: { iv: 'aabb', ciphertext: 'ccdd', tag: 'eeff' },
      storedAt: new Date().toISOString(),
    };
    expect(isEncryptedEntry(entry)).toBe(true);
  });

  it('returns false for plaintext entry', () => {
    const entry = { provider: 'test', key: 'plaintext-key', storedAt: new Date().toISOString() };
    expect(isEncryptedEntry(entry)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isEncryptedEntry(null)).toBe(false);
    expect(isEncryptedEntry(undefined)).toBe(false);
  });

  it('returns false for malformed encrypted field', () => {
    expect(isEncryptedEntry({ encrypted: { iv: 'a' } })).toBe(false);
    expect(isEncryptedEntry({ encrypted: 'not-an-object' })).toBe(false);
  });
});

// ─── CredentialManager with encryption ──────────────────────────────────────

describe('CredentialManager — encryption integration', () => {
  let tempDir: string;
  let keyringPath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    keyringPath = join(tempDir, '.keyring');
    delete process.env['DECKENT_MASTER_KEY'];
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env['DECKENT_MASTER_KEY'];
  });

  it('stores encrypted credential and retrieves plaintext', () => {
    const credDir = join(tempDir, 'creds');
    const mgr = new CredentialManager(credDir, { encryption: true, keyringPath });

    mgr.storeCredential('anthropic', 'sk-ant-secret-key');
    const retrieved = mgr.getCredential('anthropic');

    expect(retrieved).toBe('sk-ant-secret-key');
  });

  it('stored file does NOT contain plaintext key', () => {
    const credDir = join(tempDir, 'creds');
    const mgr = new CredentialManager(credDir, { encryption: true, keyringPath });

    mgr.storeCredential('anthropic', 'sk-ant-secret-key');
    const raw = readFileSync(join(credDir, 'anthropic.json'), 'utf-8');

    expect(raw).not.toContain('sk-ant-secret-key');
    expect(raw).toContain('"encrypted"');
    expect(raw).toContain('"iv"');
    expect(raw).toContain('"ciphertext"');
    expect(raw).toContain('"tag"');
  });

  it('reads legacy plaintext entries (backward compat)', () => {
    const credDir = join(tempDir, 'creds');
    mkdirSync(credDir, { recursive: true });

    // Write a legacy plaintext entry directly
    const legacyEntry = {
      provider: 'openai',
      key: 'sk-openai-legacy-key',
      storedAt: new Date().toISOString(),
    };
    writeFileSync(join(credDir, 'openai.json'), JSON.stringify(legacyEntry, null, 2) + '\n', 'utf-8');

    const mgr = new CredentialManager(credDir, { encryption: true, keyringPath });
    const retrieved = mgr.getCredential('openai');

    expect(retrieved).toBe('sk-openai-legacy-key');
  });

  it('save re-encrypts legacy entry on overwrite', () => {
    const credDir = join(tempDir, 'creds');
    mkdirSync(credDir, { recursive: true });

    // Write a legacy plaintext entry directly
    const legacyEntry = {
      provider: 'openai',
      key: 'sk-openai-legacy-key',
      storedAt: new Date().toISOString(),
    };
    writeFileSync(join(credDir, 'openai.json'), JSON.stringify(legacyEntry, null, 2) + '\n', 'utf-8');

    // Read legacy, then store (re-encrypt) it
    const mgr = new CredentialManager(credDir, { encryption: true, keyringPath });
    const legacyKey = mgr.getCredential('openai');
    expect(legacyKey).toBe('sk-openai-legacy-key');

    // Re-store to encrypt
    mgr.storeCredential('openai', legacyKey!);

    // Now verify file is encrypted
    const raw = readFileSync(join(credDir, 'openai.json'), 'utf-8');
    expect(raw).not.toContain('sk-openai-legacy-key');
    expect(raw).toContain('"encrypted"');

    // And retrieval still works
    expect(mgr.getCredential('openai')).toBe('sk-openai-legacy-key');
  });

  it('getCredentialEntry decrypts encrypted entries', () => {
    const credDir = join(tempDir, 'creds');
    const mgr = new CredentialManager(credDir, { encryption: true, keyringPath });

    mgr.storeCredential('anthropic', 'sk-secret');
    const entry = mgr.getCredentialEntry('anthropic');

    expect(entry).not.toBeNull();
    expect(entry!.key).toBe('sk-secret');
    expect(entry!.provider).toBe('anthropic');
  });

  it('works with encryption disabled (plaintext mode)', () => {
    const credDir = join(tempDir, 'creds');
    const mgr = new CredentialManager(credDir, { encryption: false });

    mgr.storeCredential('test-provider', 'plain-key');
    const raw = readFileSync(join(credDir, 'test-provider.json'), 'utf-8');

    expect(raw).toContain('"key"');
    expect(raw).toContain('plain-key');
    expect(mgr.getCredential('test-provider')).toBe('plain-key');
  });

  it('listCredentials works with encrypted entries', () => {
    const credDir = join(tempDir, 'creds');
    const mgr = new CredentialManager(credDir, { encryption: true, keyringPath });

    mgr.storeCredential('anthropic', 'key1');
    mgr.storeCredential('openai', 'key2');

    const list = mgr.listCredentials();
    expect(list).toContain('anthropic');
    expect(list).toContain('openai');
  });

  it('deleteCredential works with encrypted entries', () => {
    const credDir = join(tempDir, 'creds');
    const mgr = new CredentialManager(credDir, { encryption: true, keyringPath });

    mgr.storeCredential('anthropic', 'key1');
    expect(mgr.deleteCredential('anthropic')).toBe(true);
    expect(mgr.getCredential('anthropic')).toBeNull();
  });
});
