import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { GLOBAL_CREDENTIALS_DIR } from './constants.js';
import { readJsonSafe } from './utils.js';
import {
  encrypt,
  decrypt,
  getMasterKey,
  isEncryptedEntry,
  type EncryptedPayload,
} from './credential-encryption.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CredentialEntry {
  provider: string;
  key: string;
  storedAt: string;
}

export interface EncryptedCredentialEntry {
  provider: string;
  encrypted: EncryptedPayload;
  storedAt: string;
}

export class CredentialNotFoundError extends Error {
  constructor(provider: string) {
    super(`Credential not found for provider: "${provider}"`);
    this.name = 'CredentialNotFoundError';
  }
}

export class CredentialStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialStorageError';
  }
}

// ─── CredentialManager ───────────────────────────────────────────────────────

/**
 * Manages credentials stored in ~/.deckent/credentials/.
 * Each provider's credential is stored in a separate file with 0600 permissions.
 */
export class CredentialManager {
  private readonly credentialsDir: string;
  private readonly encryptionEnabled: boolean;
  private readonly keyringPath?: string;

  constructor(credentialsDir: string = GLOBAL_CREDENTIALS_DIR, options?: { encryption?: boolean; keyringPath?: string }) {
    this.credentialsDir = credentialsDir;
    this.encryptionEnabled = options?.encryption ?? true;
    this.keyringPath = options?.keyringPath;
  }

  private ensureDir(): void {
    if (!existsSync(this.credentialsDir)) {
      mkdirSync(this.credentialsDir, { recursive: true, mode: 0o700 });
    }
  }

  private credentialFilePath(provider: string): string {
    // Sanitize provider name to prevent directory traversal
    const safeProvider = provider.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.credentialsDir, `${safeProvider}.json`);
  }

  /**
   * Store a credential for a given provider.
   * When encryption is enabled, the key is encrypted with AES-256-GCM.
   * File permissions are set to 0600 (owner read/write only).
   */
  storeCredential(provider: string, key: string): void {
    if (!provider || typeof provider !== 'string') {
      throw new CredentialStorageError('Provider name must be a non-empty string');
    }
    if (!key || typeof key !== 'string') {
      throw new CredentialStorageError('Credential key must be a non-empty string');
    }

    this.ensureDir();

    let entry: CredentialEntry | EncryptedCredentialEntry;

    if (this.encryptionEnabled) {
      try {
        const masterKey = getMasterKey({ keyringPath: this.keyringPath });
        const encrypted = encrypt(key, masterKey);
        entry = {
          provider,
          encrypted,
          storedAt: new Date().toISOString(),
        };
      } catch (err) {
        throw new CredentialStorageError(
          `Encryption failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      entry = {
        provider,
        key,
        storedAt: new Date().toISOString(),
      };
    }

    const filePath = this.credentialFilePath(provider);
    writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });

    // Explicitly set permissions (in case umask interfered)
    try {
      chmodSync(filePath, 0o600);
    } catch {
      // Best-effort: some file systems may not support chmod
    }
  }

  /**
   * Retrieve the stored API key for a provider.
   * Supports both encrypted and legacy plaintext entries.
   * Returns null if no credential is found or on parse error.
   */
  getCredential(provider: string): string | null {
    if (!provider || typeof provider !== 'string') return null;

    const filePath = this.credentialFilePath(provider);
    const raw = readJsonSafe<Record<string, unknown>>(filePath);
    if (!raw) return null;

    // Encrypted entry
    if (isEncryptedEntry(raw)) {
      if (!this.encryptionEnabled) return null;
      try {
        const masterKey = getMasterKey({ keyringPath: this.keyringPath });
        return decrypt(raw.encrypted, masterKey);
      } catch {
        return null;
      }
    }

    // Legacy plaintext entry
    const entry = raw as unknown as CredentialEntry;
    return entry?.key ?? null;
  }

  /**
   * Delete a stored credential for a provider.
   * Returns true if deleted, false if not found.
   */
  deleteCredential(provider: string): boolean {
    if (!provider || typeof provider !== 'string') return false;

    const filePath = this.credentialFilePath(provider);
    if (!existsSync(filePath)) return false;

    try {
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all providers that have stored credentials.
   */
  listCredentials(): string[] {
    if (!existsSync(this.credentialsDir)) return [];

    try {
      const files = readdirSync(this.credentialsDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const entry = readJsonSafe<CredentialEntry>(join(this.credentialsDir, f));
          return entry?.provider ?? null;
        })
        .filter((p): p is string => p !== null);
    } catch {
      return [];
    }
  }

  /**
   * Check whether a credential exists for a provider.
   */
  hasCredential(provider: string): boolean {
    if (!provider || typeof provider !== 'string') return false;
    return existsSync(this.credentialFilePath(provider));
  }

  /**
   * Get the full credential entry (provider + key + storedAt) for a provider.
   * Decrypts encrypted entries transparently.
   * Returns null if not found.
   */
  getCredentialEntry(provider: string): CredentialEntry | null {
    if (!provider || typeof provider !== 'string') return null;

    const filePath = this.credentialFilePath(provider);
    const raw = readJsonSafe<Record<string, unknown>>(filePath);
    if (!raw) return null;

    // Encrypted entry — decrypt to return a CredentialEntry
    if (isEncryptedEntry(raw)) {
      if (!this.encryptionEnabled) return null;
      try {
        const masterKey = getMasterKey({ keyringPath: this.keyringPath });
        const key = decrypt(raw.encrypted, masterKey);
        return {
          provider: (raw as { provider?: string }).provider ?? provider,
          key,
          storedAt: (raw as { storedAt?: string }).storedAt ?? '',
        };
      } catch {
        return null;
      }
    }

    return raw as unknown as CredentialEntry;
  }

  /**
   * Update an existing credential (store overwrites).
   * Throws CredentialNotFoundError if the credential does not exist.
   */
  updateCredential(provider: string, key: string): void {
    if (!this.hasCredential(provider)) {
      throw new CredentialNotFoundError(provider);
    }
    this.storeCredential(provider, key);
  }
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Store a credential using the default credentials directory.
 */
export function storeCredential(provider: string, key: string): void {
  new CredentialManager().storeCredential(provider, key);
}

/**
 * Get a credential from the default credentials directory.
 */
export function getCredential(provider: string): string | null {
  return new CredentialManager().getCredential(provider);
}

/**
 * List all providers with credentials in the default directory.
 */
export function listCredentials(): string[] {
  return new CredentialManager().listCredentials();
}
