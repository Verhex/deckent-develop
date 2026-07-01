import { hkdfSync } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile, chmod, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DECKENT_DIR } from './constants.js';
import { debugLog } from './utils.js';
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

/**
 * Persist the credential store atomically: write the full contents to a temp file,
 * then `rename()` it onto the real path. A rename is atomic on POSIX and Windows NTFS
 * (single filesystem-metadata op), so a crash or a concurrent `saveFile()` call can
 * never leave `credentials.enc` half-written — readers always see either the old
 * complete file or the new complete file, never a torn write (349-003 CRED-HARDEN-PACK,
 * same tmp+rename pattern as src/orchestra/sprint-checkpoint.ts writeCheckpoint).
 */
async function saveFile(canonicalProjectRoot: string, file: PerProjectCredentialFile): Promise<void> {
  const dir = join(canonicalProjectRoot, DECKENT_DIR);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const filePath = credentialsFilePath(canonicalProjectRoot);
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(file, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });

  try {
    await rename(tmpPath, filePath);
  } catch (renameErr) {
    try {
      await unlink(tmpPath);
    } catch {
      // Best-effort cleanup: if unlink also fails, the original renameErr below is
      // what the caller needs to see — a leftover .tmp file is harmless (overwritten
      // by the next successful save) and never mistaken for the real store.
    }
    throw renameErr;
  }

  try {
    await chmod(filePath, 0o600);
  } catch (err) {
    // Best-effort: Windows-native chmod is a documented no-op (no POSIX permission
    // bits), so this is expected to "fail" silently-by-design there. Log honestly
    // rather than swallow so a genuine POSIX permission failure is visible.
    // Windows-native ACL-based hardening is a tracked follow-up (SYMLINK-AUTHORITY-WIRE
    // sibling work under ADR-G-017) — not implemented here.
    debugLog('credentials-per-project:saveFile:chmod', err);
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
  // AAD-bind the ciphertext to its own key name (349-003 CRED-HARDEN-PACK): an
  // attacker with file-write who relabels/swaps entries between key names can no
  // longer make getCredential silently return the wrong secret — see getCredential.
  file.entries[key] = encrypt(value, derivedKey, key);
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

  // AAD-bound path first: entries written by setCredential (349-003 onward) are
  // encrypted with aad = their own key name, so this is the correct decrypt for
  // every current entry AND is what rejects a swapped/relabeled entry (its actual
  // ciphertext was bound to a *different* key name's AAD, so the tag fails to
  // verify against `key`).
  try {
    return decrypt(entry, derivedKey, key);
  } catch (aadErr) {
    // BACKWARD-COMPAT fallback: entries written before AAD binding existed have no
    // AAD at all. Retry without AAD so pre-existing credentials.enc files keep
    // decrypting without a migration step. If this also fails, the entry is either
    // genuinely tampered/wrong-key OR was swapped from a different key's AAD-bound
    // slot — either way it must throw, not silently fall through.
    try {
      return decrypt(entry, derivedKey);
    } catch {
      throw aadErr; // propagates CredentialEncryptionError on wrong key / tampered / swapped data
    }
  }
}

export { CredentialEncryptionError };
