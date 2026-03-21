// ─── Marketplace Auth ────────────────────────────────────────────────────────
// Token-based authentication for the deckent marketplace/registry.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_CREDENTIALS_DIR = join(homedir(), '.deckent', 'credentials');
const TOKEN_FILENAME = 'marketplace.json';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MarketplaceTokenEntry {
  token: string;
  storedAt: string;
}

export class MarketplaceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketplaceAuthError';
  }
}

// ─── Filesystem abstraction for testing ──────────────────────────────────────

export interface MarketplaceAuthFS {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  unlinkSync: typeof unlinkSync;
  chmodSync: typeof chmodSync;
}

const defaultFS: MarketplaceAuthFS = {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  chmodSync,
};

// ─── MarketplaceAuth ─────────────────────────────────────────────────────────

export class MarketplaceAuth {
  private readonly credentialsDir: string;
  private readonly fs: MarketplaceAuthFS;

  constructor(options?: { credentialsDir?: string; fs?: MarketplaceAuthFS }) {
    this.credentialsDir = options?.credentialsDir ?? DEFAULT_CREDENTIALS_DIR;
    this.fs = options?.fs ?? defaultFS;
  }

  /**
   * Store a marketplace token. Previous token is overwritten.
   */
  login(token: string): void {
    if (!token || typeof token !== 'string' || !token.trim()) {
      throw new MarketplaceAuthError('Token must be a non-empty string');
    }

    this._ensureDir();

    const entry: MarketplaceTokenEntry = {
      token: token.trim(),
      storedAt: new Date().toISOString(),
    };

    const filePath = this._tokenFilePath();
    this.fs.writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });

    try {
      this.fs.chmodSync(filePath, 0o600);
    } catch {
      // Best-effort: some file systems may not support chmod
    }
  }

  /**
   * Remove stored marketplace token.
   */
  logout(): boolean {
    const filePath = this._tokenFilePath();
    if (!this.fs.existsSync(filePath)) return false;

    try {
      this.fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieve stored marketplace token. Returns null if none found.
   */
  getToken(): string | null {
    const filePath = this._tokenFilePath();
    if (!this.fs.existsSync(filePath)) return null;

    try {
      const raw = this.fs.readFileSync(filePath, 'utf-8') as string;
      const entry = JSON.parse(raw) as MarketplaceTokenEntry;
      return entry.token ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a marketplace token is stored.
   */
  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }

  /**
   * Validate token format (non-empty, at least 8 chars, no whitespace).
   */
  validateToken(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    const trimmed = token.trim();
    if (trimmed.length < 8) return false;
    if (/\s/.test(trimmed)) return false;
    return true;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _tokenFilePath(): string {
    return join(this.credentialsDir, TOKEN_FILENAME);
  }

  private _ensureDir(): void {
    if (!this.fs.existsSync(this.credentialsDir)) {
      this.fs.mkdirSync(this.credentialsDir, { recursive: true, mode: 0o700 });
    }
  }
}
