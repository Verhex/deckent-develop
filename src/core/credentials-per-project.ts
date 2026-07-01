import { hkdfSync } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { DECKENT_DIR } from './constants.js';
import {
  encrypt,
  decrypt,
  getMasterKey,
  CredentialEncryptionError,
  type EncryptedPayload,
} from './credential-encryption.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PerProjectCredentialFile {
  version: 1;
  entries: Record<string, EncryptedPayload>;
}

export class PerProjectCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerProjectCredentialError';
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CREDENTIALS_FILENAME = 'credentials.enc';
const DERIVED_KEY_BYTES = 32; // 256-bit key for AES-256-GCM
const HKDF_DIGEST = 'sha256';
// Fixed context label — keeps this derivation cryptographically distinct from any
// other HKDF use of the same master secret (RFC 5869 "info" parameter).
const HKDF_INFO = Buffer.from('deckent:credentials-per-project:v1', 'utf-8');

// ─── Path / key derivation ──────────────────────────────────────────────────

function credentialsFilePath(canonicalProjectRoot: string): string {
  return join(canonicalProjectRoot, DECKENT_DIR, CREDENTIALS_FILENAME);
}

function canonicalizeProjectRoot(projectRoot: string): string {
  try {
    return realpathSync(projectRoot);
  } catch (err) {
    throw new PerProjectCredentialError(
      `projectRoot does not exist: ${projectRoot} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

/**
 * Derive a per-project data key: HKDF(machine master key, salt = canonical projectRoot).
 * Distinct projectRoot -> distinct salt -> cryptographically independent key, even
 * though the underlying machine secret (getMasterKey()) is shared across projects.
 */
function deriveProjectKey(canonicalProjectRoot: string): Buffer {
  const masterKey = getMasterKey();
  const salt = Buffer.from(canonicalProjectRoot, 'utf-8');
  const derived = hkdfSync(HKDF_DIGEST, masterKey, salt, HKDF_INFO, DERIVED_KEY_BYTES);
  return Buffer.from(derived);
}

// ─── File load / save ───────────────────────────────────────────────────────

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT';
}

async function loadFile(canonicalProjectRoot: string): Promise<PerProjectCredentialFile> {
  const filePath = credentialsFilePath(canonicalProjectRoot);

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if (isEnoent(err)) {
      return { version: 1, entries: {} };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new PerProjectCredentialError(
      `Corrupt credentials file (invalid JSON): ${filePath} (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { entries?: unknown }).entries !== 'object' ||
    (parsed as { entries?: unknown }).entries === null
  ) {
    throw new PerProjectCredentialError(`Corrupt credentials file (missing entries map): ${filePath}`);
  }

  return parsed as PerProjectCredentialFile;
}

async function saveFile(canonicalProjectRoot: string, file: PerProjectCredentialFile): Promise<void> {
  const dir = join(canonicalProjectRoot, DECKENT_DIR);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const filePath = credentialsFilePath(canonicalProjectRoot);
  await writeFile(filePath, JSON.stringify(file, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });

  try {
    await chmod(filePath, 0o600);
  } catch {
    // Best-effort: some file systems may not support chmod.
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Store a credential for a single key, scoped to `projectRoot`. Encrypted with
 * AES-256-GCM using a key derived (HKDF) from the machine master secret salted with
 * the canonical (symlink-resolved) projectRoot — no plaintext ever touches disk.
 */
export async function setCredential(projectRoot: string, key: string, value: string): Promise<void> {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new PerProjectCredentialError('projectRoot must be a non-empty string');
  }
  if (!key || typeof key !== 'string') {
    throw new PerProjectCredentialError('key must be a non-empty string');
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new PerProjectCredentialError('value must be a non-empty string');
  }

  const canonicalRoot = canonicalizeProjectRoot(projectRoot);
  const derivedKey = deriveProjectKey(canonicalRoot);

  const file = await loadFile(canonicalRoot);
  file.entries[key] = encrypt(value, derivedKey);
  await saveFile(canonicalRoot, file);
}

/**
 * Retrieve a credential for a single key, scoped to `projectRoot`. Returns `null` when
 * the key (or the store itself) does not exist. If the stored entry cannot be decrypted
 * with this project's derived key (wrong project, tampered file), the underlying
 * `CredentialEncryptionError` is propagated — decrypt failure is NOT swallowed to null,
 * so a sibling-project cross-read fails loudly rather than silently.
 */
export async function getCredential(projectRoot: string, key: string): Promise<string | null> {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new PerProjectCredentialError('projectRoot must be a non-empty string');
  }
  if (!key || typeof key !== 'string') {
    throw new PerProjectCredentialError('key must be a non-empty string');
  }

  const canonicalRoot = canonicalizeProjectRoot(projectRoot);
  const file = await loadFile(canonicalRoot);

  const entry = file.entries[key];
  if (!entry) return null;

  const derivedKey = deriveProjectKey(canonicalRoot);
  return decrypt(entry, derivedKey); // propagates CredentialEncryptionError on wrong key / tampered data
}

export { CredentialEncryptionError };
