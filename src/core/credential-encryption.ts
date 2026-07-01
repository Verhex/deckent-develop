import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  tag: string;
}

export class CredentialEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialEncryptionError';
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const KEY_BYTES = 32; // 256-bit key
const KEYRING_DIR = join(homedir(), '.deckent');
const KEYRING_FILE = join(KEYRING_DIR, '.keyring');

// ─── Master Key Management ──────────────────────────────────────────────────

/**
 * Resolve the master key from env var or keyring file.
 * If neither exists, auto-generate a keyring file on first call.
 */
export function getMasterKey(options?: { keyringPath?: string }): Buffer {
  const keyringPath = options?.keyringPath ?? KEYRING_FILE;
  const keyringDir = join(keyringPath, '..');

  // 1. Check DECKENT_MASTER_KEY env var (32-byte hex = 64 hex chars)
  const envKey = process.env['DECKENT_MASTER_KEY'];
  if (envKey) {
    const buf = Buffer.from(envKey, 'hex');
    if (buf.length !== KEY_BYTES) {
      throw new CredentialEncryptionError(
        `DECKENT_MASTER_KEY must be ${KEY_BYTES * 2} hex characters (${KEY_BYTES} bytes), got ${envKey.length} chars`,
      );
    }
    return buf;
  }

  // 2. Read from keyring file
  if (existsSync(keyringPath)) {
    const hex = readFileSync(keyringPath, 'utf-8').trim();
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== KEY_BYTES) {
      throw new CredentialEncryptionError(
        `Keyring file contains invalid key length: expected ${KEY_BYTES} bytes, got ${buf.length}`,
      );
    }
    return buf;
  }

  // 3. Auto-generate keyring file
  if (!existsSync(keyringDir)) {
    mkdirSync(keyringDir, { recursive: true, mode: 0o700 });
  }

  const newKey = randomBytes(KEY_BYTES);
  writeFileSync(keyringPath, newKey.toString('hex') + '\n', { encoding: 'utf-8', mode: 0o600 });

  try {
    chmodSync(keyringPath, 0o600);
  } catch {
    // Best-effort: some file systems may not support chmod
  }

  return newKey;
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns IV, ciphertext, and auth tag as hex strings.
 *
 * `aad` (Additional Authenticated Data) is optional and NOT stored in the returned
 * payload — the caller must supply the identical `aad` value to `decrypt()`. Binding
 * an entry's ciphertext to e.g. its own key name (349-003 CRED-HARDEN-PACK) makes the
 * auth tag fail to verify if the ciphertext is later relabeled/permuted onto a
 * different key, turning a silent entry-swap into a loud decrypt failure.
 */
export function encrypt(plaintext: string, masterKey: Buffer, aad?: string): EncryptedPayload {
  if (masterKey.length !== KEY_BYTES) {
    throw new CredentialEncryptionError(`Master key must be ${KEY_BYTES} bytes`);
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf-8'));
  }

  let ciphertext = cipher.update(plaintext, 'utf-8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    iv: iv.toString('hex'),
    ciphertext,
    tag,
  };
}

/**
 * Decrypt an encrypted payload using AES-256-GCM.
 * Throws CredentialEncryptionError if decryption fails (wrong key, tampered data, or
 * `aad` mismatched against what was passed to `encrypt()`).
 */
export function decrypt(encrypted: EncryptedPayload, masterKey: Buffer, aad?: string): string {
  if (masterKey.length !== KEY_BYTES) {
    throw new CredentialEncryptionError(`Master key must be ${KEY_BYTES} bytes`);
  }

  try {
    const iv = Buffer.from(encrypted.iv, 'hex');
    const tag = Buffer.from(encrypted.tag, 'hex');
    const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
    if (aad) {
      decipher.setAAD(Buffer.from(aad, 'utf-8'));
    }
    decipher.setAuthTag(tag);

    let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf-8');
    plaintext += decipher.final('utf-8');
    return plaintext;
  } catch (err) {
    throw new CredentialEncryptionError(
      `Decryption failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Check if a parsed credential entry contains encrypted data.
 */
export function isEncryptedEntry(entry: unknown): entry is { encrypted: EncryptedPayload } {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  if (!e['encrypted'] || typeof e['encrypted'] !== 'object') return false;
  const enc = e['encrypted'] as Record<string, unknown>;
  return typeof enc['iv'] === 'string' && typeof enc['ciphertext'] === 'string' && typeof enc['tag'] === 'string';
}
