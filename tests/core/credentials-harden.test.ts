// Sprint 349 349-003 — CRED-HARDEN-PACK
// Covers: AAD binding (entry-swap rejection + legacy no-AAD backward compat) and
// atomic tmp+rename writes (no partial state on crash / rename failure).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, hkdfSync } from 'node:crypto';

// One-shot failure switch consumed by the mocked `rename` below — set by the
// injected-failure test only; every other test leaves this false, so the mock is a
// pure passthrough to the real node:fs/promises implementation.
let renameShouldFail = false;

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (renameShouldFail) {
        renameShouldFail = false;
        throw new Error('simulated rename failure (injected)');
      }
      return actual.rename(...args);
    },
  };
});

import {
  setCredential,
  getCredential,
  CredentialEncryptionError,
} from '../../src/core/credentials-per-project.js';
import { encrypt } from '../../src/core/credential-encryption.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempProjectRoot(label: string): string {
  const dir = join(
    tmpdir(),
    `deckent-cred-harden-test-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Mirrors the private deriveProjectKey() in credentials-per-project.ts exactly, so
// tests can hand-construct entries that getCredential() will derive the SAME key for.
function deriveProjectKeyForTest(canonicalProjectRoot: string): Buffer {
  const masterKey = Buffer.from(process.env['DECKENT_MASTER_KEY']!, 'hex');
  const salt = Buffer.from(canonicalProjectRoot, 'utf-8');
  const info = Buffer.from('deckent:credentials-per-project:v1', 'utf-8');
  return Buffer.from(hkdfSync('sha256', masterKey, salt, info, 32));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('credentials-harden (349-003 CRED-HARDEN-PACK)', () => {
  let projectA: string;

  beforeEach(() => {
    renameShouldFail = false;
    projectA = makeTempProjectRoot('a');
    process.env['DECKENT_MASTER_KEY'] = randomBytes(32).toString('hex');
  });

  afterEach(() => {
    rmSync(projectA, { recursive: true, force: true });
    delete process.env['DECKENT_MASTER_KEY'];
  });

  // ─── AAD proof: entry-swap ───────────────────────────────────────────────

  describe('AAD binding rejects swapped/relabeled entries', () => {
    it('getCredential throws (not the wrong secret) after two entries are swapped in the file', async () => {
      await setCredential(projectA, 'KEY_A', 'secret-for-a');
      await setCredential(projectA, 'KEY_B', 'secret-for-b');

      const filePath = join(projectA, '.deckent', 'credentials.enc');
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as {
        version: 1;
        entries: Record<string, unknown>;
      };

      // Attacker with file-write access relabels the two entries.
      const entryA = parsed.entries['KEY_A'];
      const entryB = parsed.entries['KEY_B'];
      parsed.entries['KEY_A'] = entryB;
      parsed.entries['KEY_B'] = entryA;
      writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');

      await expect(getCredential(projectA, 'KEY_A')).rejects.toThrow(CredentialEncryptionError);
      await expect(getCredential(projectA, 'KEY_B')).rejects.toThrow(CredentialEncryptionError);
    });

    it('happy path: new entries still round-trip normally (AAD does not break correct reads)', async () => {
      await setCredential(projectA, 'ROUND_TRIP_KEY', 'round-trip-value');
      expect(await getCredential(projectA, 'ROUND_TRIP_KEY')).toBe('round-trip-value');
    });
  });

  // ─── Backward compat: pre-AAD entries ────────────────────────────────────

  describe('legacy no-AAD entries still round-trip (backward compat)', () => {
    it('an entry encrypted without AAD (pre-349-003 format) still decrypts correctly', async () => {
      const canonicalRoot = realpathSync(projectA);
      const derivedKey = deriveProjectKeyForTest(canonicalRoot);

      // Simulate a credentials.enc written by the OLD code path: encrypt() called
      // with no aad argument at all.
      const legacyEntry = encrypt('legacy-secret-value', derivedKey);

      const deckentDir = join(projectA, '.deckent');
      mkdirSync(deckentDir, { recursive: true });
      const filePath = join(deckentDir, 'credentials.enc');
      writeFileSync(
        filePath,
        JSON.stringify({ version: 1, entries: { LEGACY_KEY: legacyEntry } }, null, 2) + '\n',
        'utf-8',
      );

      const retrieved = await getCredential(projectA, 'LEGACY_KEY');
      expect(retrieved).toBe('legacy-secret-value');
    });

    it('a mixed file (legacy + AAD-bound entries) reads both correctly', async () => {
      const canonicalRoot = realpathSync(projectA);
      const derivedKey = deriveProjectKeyForTest(canonicalRoot);
      const legacyEntry = encrypt('legacy-value', derivedKey);

      const deckentDir = join(projectA, '.deckent');
      mkdirSync(deckentDir, { recursive: true });
      const filePath = join(deckentDir, 'credentials.enc');
      writeFileSync(
        filePath,
        JSON.stringify({ version: 1, entries: { LEGACY_KEY: legacyEntry } }, null, 2) + '\n',
        'utf-8',
      );

      // Now write a new, AAD-bound entry alongside the legacy one via the real API.
      await setCredential(projectA, 'NEW_KEY', 'new-value');

      expect(await getCredential(projectA, 'LEGACY_KEY')).toBe('legacy-value');
      expect(await getCredential(projectA, 'NEW_KEY')).toBe('new-value');
    });
  });

  // ─── Atomic write ─────────────────────────────────────────────────────────

  describe('atomic tmp+rename write', () => {
    it('leaves no .tmp leftover after a successful write', async () => {
      await setCredential(projectA, 'SOME_KEY', 'some-value');

      const deckentDir = join(projectA, '.deckent');
      const leftover = readdirSync(deckentDir).filter((f) => f.endsWith('.tmp'));
      expect(leftover).toEqual([]);
    });

    it('an injected rename failure leaves the original store untouched and cleans up the tmp file', async () => {
      await setCredential(projectA, 'KEEP_KEY', 'original-value');

      const filePath = join(projectA, '.deckent', 'credentials.enc');
      const before = readFileSync(filePath, 'utf-8');

      renameShouldFail = true;
      await expect(setCredential(projectA, 'KEEP_KEY', 'corrupted-value')).rejects.toThrow(
        'simulated rename failure',
      );

      // Original file must be byte-for-byte untouched — the failed write never
      // reached the real path.
      const after = readFileSync(filePath, 'utf-8');
      expect(after).toBe(before);
      expect(await getCredential(projectA, 'KEEP_KEY')).toBe('original-value');

      // The tmp file written before the failed rename must be cleaned up, not left
      // behind as a leftover.
      const deckentDir = join(projectA, '.deckent');
      const leftover = readdirSync(deckentDir).filter((f) => f.endsWith('.tmp'));
      expect(leftover).toEqual([]);
    });
  });
});
