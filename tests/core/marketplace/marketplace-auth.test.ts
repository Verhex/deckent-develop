import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketplaceAuth, MarketplaceAuthError } from '../../../src/core/marketplace/marketplace-auth.js';
import type { MarketplaceAuthFS } from '../../../src/core/marketplace/marketplace-auth.js';

// ─── Mock FS ─────────────────────────────────────────────────────────────────

function createMockFS(files: Record<string, string> = {}): MarketplaceAuthFS {
  const store = new Map(Object.entries(files));

  return {
    existsSync: vi.fn((p: string) => store.has(p)),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((p: string) => {
      if (!store.has(p)) throw new Error(`ENOENT: ${p}`);
      return store.get(p)!;
    }),
    writeFileSync: vi.fn((p: string, content: string) => {
      store.set(p, typeof content === 'string' ? content : String(content));
    }),
    unlinkSync: vi.fn((p: string) => {
      store.delete(p);
    }),
    chmodSync: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MarketplaceAuth', () => {
  const testDir = '/tmp/test-credentials';

  describe('login', () => {
    it('stores a token', () => {
      const fs = createMockFS();
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      auth.login('my-secret-token-12345');
      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(writeCall[0]).toContain('marketplace.json');
      const written = JSON.parse(writeCall[1] as string);
      expect(written.token).toBe('my-secret-token-12345');
    });

    it('sets file permissions to 0600', () => {
      const fs = createMockFS();
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      auth.login('my-secret-token-12345');
      expect(fs.chmodSync).toHaveBeenCalledWith(expect.any(String), 0o600);
    });

    it('creates credentials directory if not exists', () => {
      const fs = createMockFS();
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      auth.login('my-secret-token-12345');
      expect(fs.mkdirSync).toHaveBeenCalledWith(testDir, { recursive: true, mode: 0o700 });
    });

    it('throws on empty token', () => {
      const fs = createMockFS();
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      expect(() => auth.login('')).toThrow(MarketplaceAuthError);
    });

    it('throws on whitespace-only token', () => {
      const fs = createMockFS();
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      expect(() => auth.login('   ')).toThrow(MarketplaceAuthError);
    });

    it('trims token before storing', () => {
      const fs = createMockFS();
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      auth.login('  my-token-abcdefgh  ');
      const writeCall = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const written = JSON.parse(writeCall[1] as string);
      expect(written.token).toBe('my-token-abcdefgh');
    });
  });

  describe('logout', () => {
    it('deletes token file', () => {
      const tokenPath = `${testDir}/marketplace.json`;
      const fs = createMockFS({ [tokenPath]: '{"token":"t"}' });
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      const result = auth.logout();
      expect(result).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('returns false if no token file', () => {
      const fs = createMockFS();
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      const result = auth.logout();
      expect(result).toBe(false);
    });
  });

  describe('getToken', () => {
    it('returns stored token', () => {
      const tokenPath = `${testDir}/marketplace.json`;
      const entry = JSON.stringify({ token: 'my-stored-token', storedAt: '2026-01-01T00:00:00Z' });
      const fs = createMockFS({ [tokenPath]: entry });
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      expect(auth.getToken()).toBe('my-stored-token');
    });

    it('returns null if no token file', () => {
      const fs = createMockFS();
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      expect(auth.getToken()).toBeNull();
    });

    it('returns null on corrupted JSON', () => {
      const tokenPath = `${testDir}/marketplace.json`;
      const fs = createMockFS({ [tokenPath]: 'not json{{{' });
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      expect(auth.getToken()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('returns true when token exists', () => {
      const tokenPath = `${testDir}/marketplace.json`;
      const entry = JSON.stringify({ token: 'my-token', storedAt: '2026-01-01T00:00:00Z' });
      const fs = createMockFS({ [tokenPath]: entry });
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      expect(auth.isAuthenticated()).toBe(true);
    });

    it('returns false when no token', () => {
      const fs = createMockFS();
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs });

      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('validateToken', () => {
    it('returns true for valid token (>= 8 chars, no spaces)', () => {
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs: createMockFS() });
      expect(auth.validateToken('abcdefgh')).toBe(true);
    });

    it('returns false for short token', () => {
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs: createMockFS() });
      expect(auth.validateToken('abc')).toBe(false);
    });

    it('returns false for token with spaces', () => {
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs: createMockFS() });
      expect(auth.validateToken('abc def ghi')).toBe(false);
    });

    it('returns false for empty string', () => {
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs: createMockFS() });
      expect(auth.validateToken('')).toBe(false);
    });

    it('returns false for non-string', () => {
      const auth = new MarketplaceAuth({ credentialsDir: testDir, fs: createMockFS() });
      expect(auth.validateToken(undefined as unknown as string)).toBe(false);
    });
  });
});
