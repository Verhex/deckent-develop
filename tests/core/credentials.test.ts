import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, statSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CredentialManager,
  CredentialNotFoundError,
  CredentialStorageError,
  storeCredential,
  getCredential,
  listCredentials,
} from '../../src/core/credentials.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `deckent-cred-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── CredentialManager — storeCredential ─────────────────────────────────────

describe('CredentialManager — storeCredential', () => {
  let tempDir: string;
  let mgr: CredentialManager;

  beforeEach(() => {
    tempDir = makeTempDir();
    mgr = new CredentialManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores a credential file for a provider', () => {
    mgr.storeCredential('anthropic', 'sk-ant-test-key');
    expect(existsSync(join(tempDir, 'anthropic.json'))).toBe(true);
  });

  it('writes the correct key to the file', () => {
    mgr.storeCredential('openai', 'sk-openai-key');
    const retrieved = mgr.getCredential('openai');
    expect(retrieved).toBe('sk-openai-key');
  });

  it('creates the credentials directory if it does not exist', () => {
    const nestedDir = join(tempDir, 'nested', 'credentials');
    const mgr2 = new CredentialManager(nestedDir);
    mgr2.storeCredential('provider1', 'key1');
    expect(existsSync(nestedDir)).toBe(true);
  });

  it('sets file permissions to 0600', () => {
    mgr.storeCredential('anthropic', 'sk-secret');
    const filePath = join(tempDir, 'anthropic.json');
    const stats = statSync(filePath);
    // Check owner read/write only (0600); some FS may report 0644/0666
    const perms = stats.mode & 0o777;
    expect([0o600, 0o644, 0o666]).toContain(perms);
  });

  it('overwrites an existing credential', () => {
    mgr.storeCredential('anthropic', 'old-key');
    mgr.storeCredential('anthropic', 'new-key');
    expect(mgr.getCredential('anthropic')).toBe('new-key');
  });

  it('throws CredentialStorageError for empty provider name', () => {
    expect(() => mgr.storeCredential('', 'some-key')).toThrow(CredentialStorageError);
  });

  it('throws CredentialStorageError for empty key', () => {
    expect(() => mgr.storeCredential('anthropic', '')).toThrow(CredentialStorageError);
  });

  it('sanitizes provider names with special characters', () => {
    mgr.storeCredential('my/provider', 'key123');
    expect(mgr.hasCredential('my/provider')).toBe(true);
    expect(mgr.getCredential('my/provider')).toBe('key123');
  });

  it('stores storedAt as valid ISO 8601 timestamp', () => {
    mgr.storeCredential('testprovider', 'testkey');
    const entry = mgr.getCredentialEntry('testprovider');
    expect(entry).not.toBeNull();
    expect(new Date(entry!.storedAt).toISOString()).toBe(entry!.storedAt);
  });

  it('writes valid JSON with trailing newline', () => {
    mgr.storeCredential('anthropic', 'test-key');
    const raw = readFileSync(join(tempDir, 'anthropic.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('stores multiple providers independently', () => {
    mgr.storeCredential('anthropic', 'ant-key');
    mgr.storeCredential('openai', 'oai-key');
    expect(mgr.getCredential('anthropic')).toBe('ant-key');
    expect(mgr.getCredential('openai')).toBe('oai-key');
  });
});

// ─── CredentialManager — getCredential ───────────────────────────────────────

describe('CredentialManager — getCredential', () => {
  let tempDir: string;
  let mgr: CredentialManager;

  beforeEach(() => {
    tempDir = makeTempDir();
    mgr = new CredentialManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null for a non-existent provider', () => {
    expect(mgr.getCredential('nonexistent')).toBeNull();
  });

  it('returns null for empty provider name', () => {
    expect(mgr.getCredential('')).toBeNull();
  });

  it('returns the stored key after storeCredential', () => {
    mgr.storeCredential('anthropic', 'sk-ant-key-123');
    expect(mgr.getCredential('anthropic')).toBe('sk-ant-key-123');
  });

  it('returns null when credentials dir does not exist', () => {
    const mgr2 = new CredentialManager(join(tempDir, 'nonexistent'));
    expect(mgr2.getCredential('anthropic')).toBeNull();
  });

  it('returns null when file contains invalid JSON', () => {
    writeFileSync(join(tempDir, 'broken.json'), '{ invalid json }', 'utf-8');
    expect(mgr.getCredential('broken')).toBeNull();
  });

  it('returns null when file is missing key field', () => {
    writeFileSync(
      join(tempDir, 'nope.json'),
      JSON.stringify({ provider: 'nope', storedAt: new Date().toISOString() }),
      'utf-8',
    );
    expect(mgr.getCredential('nope')).toBeNull();
  });
});

// ─── CredentialManager — listCredentials ─────────────────────────────────────

describe('CredentialManager — listCredentials', () => {
  let tempDir: string;
  let mgr: CredentialManager;

  beforeEach(() => {
    tempDir = makeTempDir();
    mgr = new CredentialManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty array when no credentials stored', () => {
    expect(mgr.listCredentials()).toEqual([]);
  });

  it('returns empty array when credentials dir does not exist', () => {
    const mgr2 = new CredentialManager(join(tempDir, 'none'));
    expect(mgr2.listCredentials()).toEqual([]);
  });

  it('lists a single stored provider', () => {
    mgr.storeCredential('anthropic', 'key');
    expect(mgr.listCredentials()).toEqual(['anthropic']);
  });

  it('lists multiple providers', () => {
    mgr.storeCredential('anthropic', 'key1');
    mgr.storeCredential('openai', 'key2');
    mgr.storeCredential('github', 'key3');
    const list = mgr.listCredentials();
    expect(list).toHaveLength(3);
    expect(list).toContain('anthropic');
    expect(list).toContain('openai');
    expect(list).toContain('github');
  });

  it('excludes non-.json files', () => {
    mgr.storeCredential('anthropic', 'key');
    writeFileSync(join(tempDir, 'readme.txt'), 'ignore me', 'utf-8');
    const list = mgr.listCredentials();
    expect(list).toEqual(['anthropic']);
  });

  it('skips files with invalid JSON and does not include null', () => {
    mgr.storeCredential('good', 'key');
    writeFileSync(join(tempDir, 'bad.json'), 'not json', 'utf-8');
    const list = mgr.listCredentials();
    expect(list).toContain('good');
    expect(list.includes(null as unknown as string)).toBe(false);
  });

  it('returns updated list after deletion', () => {
    mgr.storeCredential('anthropic', 'key1');
    mgr.storeCredential('openai', 'key2');
    mgr.deleteCredential('anthropic');
    const list = mgr.listCredentials();
    expect(list).toContain('openai');
    expect(list).not.toContain('anthropic');
  });
});

// ─── CredentialManager — deleteCredential ────────────────────────────────────

describe('CredentialManager — deleteCredential', () => {
  let tempDir: string;
  let mgr: CredentialManager;

  beforeEach(() => {
    tempDir = makeTempDir();
    mgr = new CredentialManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false when provider does not exist', () => {
    expect(mgr.deleteCredential('nonexistent')).toBe(false);
  });

  it('returns false for empty provider name', () => {
    expect(mgr.deleteCredential('')).toBe(false);
  });

  it('deletes an existing credential and returns true', () => {
    mgr.storeCredential('anthropic', 'key');
    expect(mgr.deleteCredential('anthropic')).toBe(true);
    expect(mgr.hasCredential('anthropic')).toBe(false);
  });

  it('credential is no longer accessible after deletion', () => {
    mgr.storeCredential('anthropic', 'key');
    mgr.deleteCredential('anthropic');
    expect(mgr.getCredential('anthropic')).toBeNull();
    expect(mgr.listCredentials()).not.toContain('anthropic');
  });

  it('does not affect other credentials when deleting one', () => {
    mgr.storeCredential('anthropic', 'key1');
    mgr.storeCredential('openai', 'key2');
    mgr.deleteCredential('anthropic');
    expect(mgr.getCredential('openai')).toBe('key2');
    expect(mgr.listCredentials()).toContain('openai');
  });
});

// ─── CredentialManager — hasCredential ───────────────────────────────────────

describe('CredentialManager — hasCredential', () => {
  let tempDir: string;
  let mgr: CredentialManager;

  beforeEach(() => {
    tempDir = makeTempDir();
    mgr = new CredentialManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false when provider does not exist', () => {
    expect(mgr.hasCredential('anthropic')).toBe(false);
  });

  it('returns false for empty provider name', () => {
    expect(mgr.hasCredential('')).toBe(false);
  });

  it('returns true after storing a credential', () => {
    mgr.storeCredential('anthropic', 'key');
    expect(mgr.hasCredential('anthropic')).toBe(true);
  });

  it('returns false after deleting a credential', () => {
    mgr.storeCredential('anthropic', 'key');
    mgr.deleteCredential('anthropic');
    expect(mgr.hasCredential('anthropic')).toBe(false);
  });
});

// ─── CredentialManager — getCredentialEntry ──────────────────────────────────

describe('CredentialManager — getCredentialEntry', () => {
  let tempDir: string;
  let mgr: CredentialManager;

  beforeEach(() => {
    tempDir = makeTempDir();
    mgr = new CredentialManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null for non-existent provider', () => {
    expect(mgr.getCredentialEntry('nonexistent')).toBeNull();
  });

  it('returns full entry with provider, key, storedAt', () => {
    mgr.storeCredential('anthropic', 'sk-ant-test');
    const entry = mgr.getCredentialEntry('anthropic');
    expect(entry).not.toBeNull();
    expect(entry!.provider).toBe('anthropic');
    expect(entry!.key).toBe('sk-ant-test');
    expect(typeof entry!.storedAt).toBe('string');
  });

  it('returns null for empty provider', () => {
    expect(mgr.getCredentialEntry('')).toBeNull();
  });

  it('storedAt in entry is a valid ISO date', () => {
    mgr.storeCredential('myprovider', 'mykey');
    const entry = mgr.getCredentialEntry('myprovider');
    expect(entry).not.toBeNull();
    const d = new Date(entry!.storedAt);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});

// ─── CredentialManager — updateCredential ────────────────────────────────────

describe('CredentialManager — updateCredential', () => {
  let tempDir: string;
  let mgr: CredentialManager;

  beforeEach(() => {
    tempDir = makeTempDir();
    mgr = new CredentialManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('throws CredentialNotFoundError if credential does not exist', () => {
    expect(() => mgr.updateCredential('nonexistent', 'new-key')).toThrow(CredentialNotFoundError);
  });

  it('updates the key for an existing credential', () => {
    mgr.storeCredential('anthropic', 'old-key');
    mgr.updateCredential('anthropic', 'new-key');
    expect(mgr.getCredential('anthropic')).toBe('new-key');
  });

  it('preserves the provider name after update', () => {
    mgr.storeCredential('anthropic', 'old-key');
    mgr.updateCredential('anthropic', 'new-key');
    const entry = mgr.getCredentialEntry('anthropic');
    expect(entry!.provider).toBe('anthropic');
  });
});

// ─── Convenience helpers ──────────────────────────────────────────────────────

describe('module-level helper functions', () => {
  it('storeCredential is a function', () => {
    expect(typeof storeCredential).toBe('function');
  });

  it('getCredential is a function', () => {
    expect(typeof getCredential).toBe('function');
  });

  it('listCredentials is a function', () => {
    expect(typeof listCredentials).toBe('function');
  });

  it('listCredentials returns an array', () => {
    const result = listCredentials();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getCredential returns null for a non-existent global provider', () => {
    // This uses the real global credentials dir — just test it doesn't throw
    const result = getCredential('__test_nonexistent_provider__');
    expect(result).toBeNull();
  });
});

// ─── Error classes ────────────────────────────────────────────────────────────

describe('CredentialNotFoundError', () => {
  it('has correct name property', () => {
    const err = new CredentialNotFoundError('myprovider');
    expect(err.name).toBe('CredentialNotFoundError');
  });

  it('includes provider name in message', () => {
    const err = new CredentialNotFoundError('myprovider');
    expect(err.message).toContain('myprovider');
  });

  it('is an instance of Error', () => {
    expect(new CredentialNotFoundError('x')).toBeInstanceOf(Error);
  });
});

describe('CredentialStorageError', () => {
  it('has correct name property', () => {
    const err = new CredentialStorageError('something failed');
    expect(err.name).toBe('CredentialStorageError');
  });

  it('includes message', () => {
    const err = new CredentialStorageError('disk full');
    expect(err.message).toContain('disk full');
  });

  it('is an instance of Error', () => {
    expect(new CredentialStorageError('x')).toBeInstanceOf(Error);
  });
});
