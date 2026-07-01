import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  setCredential,
  getCredential,
  PerProjectCredentialError,
  CredentialEncryptionError,
} from '../../src/core/credentials-per-project.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempProjectRoot(label: string): string {
  const dir = join(
    tmpdir(),
    `deckent-cred-per-project-test-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('credentials-per-project', () => {
  let projectA: string;
  let projectB: string;

  beforeEach(() => {
    projectA = makeTempProjectRoot('a');
    projectB = makeTempProjectRoot('b');
    // Hermetic master secret: bypasses ~/.deckent/.keyring entirely (matches the
    // existing convention in tests/core/credential-encryption.test.ts).
    process.env['DECKENT_MASTER_KEY'] = randomBytes(32).toString('hex');
  });

  afterEach(() => {
    rmSync(projectA, { recursive: true, force: true });
    rmSync(projectB, { recursive: true, force: true });
    delete process.env['DECKENT_MASTER_KEY'];
  });

  it('round-trip: get returns exactly what was set, within one project', async () => {
    await setCredential(projectA, 'OPENAI_API_KEY', 'sk-openai-secret-12345');
    const retrieved = await getCredential(projectA, 'OPENAI_API_KEY');

    expect(retrieved).toBe('sk-openai-secret-12345');
  });

  it('writes an encrypted file with no plaintext secret in the bytes', async () => {
    await setCredential(projectA, 'ANTHROPIC_API_KEY', 'sk-ant-super-secret-value');

    const filePath = join(projectA, '.deckent', 'credentials.enc');
    const raw = readFileSync(filePath, 'utf-8');

    expect(raw).not.toContain('sk-ant-super-secret-value');
    expect(raw).toContain('"entries"');
    expect(raw).toContain('"ciphertext"');
    expect(raw).toContain('"iv"');
    expect(raw).toContain('"tag"');
  });

  it('getCredential returns null for a key that was never set', async () => {
    await setCredential(projectA, 'SOME_KEY', 'some-value');
    const missing = await getCredential(projectA, 'NEVER_SET_KEY');

    expect(missing).toBeNull();
  });

  it('getCredential returns null when the project has no credentials.enc yet', async () => {
    const result = await getCredential(projectA, 'ANY_KEY');
    expect(result).toBeNull();
  });

  it('stores multiple independent keys within the same project', async () => {
    await setCredential(projectA, 'KEY_ONE', 'value-one');
    await setCredential(projectA, 'KEY_TWO', 'value-two');

    expect(await getCredential(projectA, 'KEY_ONE')).toBe('value-one');
    expect(await getCredential(projectA, 'KEY_TWO')).toBe('value-two');
  });

  it('overwriting a key updates the value on subsequent get', async () => {
    await setCredential(projectA, 'ROTATING_KEY', 'first-value');
    await setCredential(projectA, 'ROTATING_KEY', 'second-value');

    expect(await getCredential(projectA, 'ROTATING_KEY')).toBe('second-value');
  });

  it('sibling-project cross-read FAILS: project B cannot decrypt project A credentials.enc', async () => {
    await setCredential(projectA, 'SHARED_KEY_NAME', 'project-a-secret-value');

    // Copy project A's encrypted store byte-for-byte into project B's .deckent dir,
    // simulating an attacker (or misconfigured worker) reading project A's file from
    // project B's context. Project B's HKDF derivation uses a different salt
    // (its own canonical projectRoot), so decryption must fail loudly.
    const filePathA = join(projectA, '.deckent', 'credentials.enc');
    const rawA = readFileSync(filePathA, 'utf-8');
    mkdirSync(join(projectB, '.deckent'), { recursive: true });
    const filePathB = join(projectB, '.deckent', 'credentials.enc');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(filePathB, rawA, 'utf-8');

    await expect(getCredential(projectB, 'SHARED_KEY_NAME')).rejects.toThrow(CredentialEncryptionError);
  });

  it('rejects an empty credential value', async () => {
    await expect(setCredential(projectA, 'EMPTY_KEY', '')).rejects.toThrow(PerProjectCredentialError);
  });

  it('rejects an empty key name', async () => {
    await expect(setCredential(projectA, '', 'some-value')).rejects.toThrow(PerProjectCredentialError);
  });

  it('rejects a projectRoot that does not exist', async () => {
    const nonExistentRoot = join(tmpdir(), `deckent-does-not-exist-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await expect(setCredential(nonExistentRoot, 'KEY', 'value')).rejects.toThrow(PerProjectCredentialError);
    await expect(getCredential(nonExistentRoot, 'KEY')).rejects.toThrow(PerProjectCredentialError);
  });

  it('throws on a corrupt (non-JSON) credentials.enc file', async () => {
    mkdirSync(join(projectA, '.deckent'), { recursive: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(projectA, '.deckent', 'credentials.enc'), 'not valid json{{{', 'utf-8');

    await expect(getCredential(projectA, 'ANY_KEY')).rejects.toThrow(PerProjectCredentialError);
  });
});
