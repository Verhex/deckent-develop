import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockReturnValue('formatted-table'),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/marketplace/registry-client.js', () => {
  const mockClient = {
    searchSkills: vi.fn(),
    getSkillDetail: vi.fn(),
    publishSkill: vi.fn(),
  };
  return {
    RegistryClient: vi.fn(() => mockClient),
    RegistryNetworkError: class extends Error { name = 'RegistryNetworkError'; },
    RegistryRateLimitError: class extends Error { name = 'RegistryRateLimitError'; },
    _mockClient: mockClient,
  };
});

vi.mock('../../../src/core/marketplace/marketplace-auth.js', () => {
  const mockAuth = {
    getToken: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: vi.fn(),
    validateToken: vi.fn(),
  };
  return {
    MarketplaceAuth: vi.fn(() => mockAuth),
    MarketplaceAuthError: class extends Error { name = 'MarketplaceAuthError'; },
    _mockAuth: mockAuth,
  };
});

import { existsSync, readFileSync } from 'node:fs';
import { print, printError, formatTable } from '../../../src/cli/helpers/output.js';
import { registerSkillMarketplace } from '../../../src/cli/commands/skill-marketplace.js';
import { RegistryClient } from '../../../src/core/marketplace/registry-client.js';
import { MarketplaceAuth } from '../../../src/core/marketplace/marketplace-auth.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createProgram(): Command {
  const program = new Command().exitOverride();
  registerSkillMarketplace(program);
  return program;
}

function getClientMock() {
  return (RegistryClient as unknown as { _mockClient: Record<string, ReturnType<typeof vi.fn>> })
    ? new RegistryClient() as unknown as Record<string, ReturnType<typeof vi.fn>>
    : null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('skill marketplace commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  describe('search', () => {
    it('displays search results in table format', async () => {
      const client = new RegistryClient() as unknown as Record<string, ReturnType<typeof vi.fn>>;
      client['searchSkills'].mockResolvedValue({
        skills: [
          { name: 'ts-expert', description: 'TypeScript skill', version: '1.0.0', category: 'language', downloads: 100, rating: 4.5 },
        ],
        total: 1,
        page: 1,
        pages: 1,
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'search', 'typescript']);

      expect(formatTable).toHaveBeenCalled();
      expect(print).toHaveBeenCalledWith(expect.stringContaining('formatted-table'));
    });

    it('shows message for no results', async () => {
      const client = new RegistryClient() as unknown as Record<string, ReturnType<typeof vi.fn>>;
      client['searchSkills'].mockResolvedValue({
        skills: [],
        total: 0,
        page: 1,
        pages: 0,
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'search', 'nonexistent']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('No skills found'));
    });

    it('outputs JSON with --json flag', async () => {
      const client = new RegistryClient() as unknown as Record<string, ReturnType<typeof vi.fn>>;
      client['searchSkills'].mockResolvedValue({
        skills: [{ name: 'test', description: '', version: '1.0.0', category: 'tool', downloads: 0, rating: 0 }],
        total: 1,
        page: 1,
        pages: 1,
      });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'search', 'test', '--json']);

      const printCalls = (print as ReturnType<typeof vi.fn>).mock.calls;
      const jsonOutput = printCalls.find((c: unknown[]) => {
        try { JSON.parse(c[0] as string); return true; } catch { return false; }
      });
      expect(jsonOutput).toBeDefined();
    });

    it('passes --category option to client', async () => {
      const client = new RegistryClient() as unknown as Record<string, ReturnType<typeof vi.fn>>;
      client['searchSkills'].mockResolvedValue({ skills: [], total: 0, page: 1, pages: 0 });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'search', 'test', '--category', 'language']);

      expect(client['searchSkills']).toHaveBeenCalledWith('test', expect.objectContaining({
        category: 'language',
      }));
    });

    it('passes --limit option to client', async () => {
      const client = new RegistryClient() as unknown as Record<string, ReturnType<typeof vi.fn>>;
      client['searchSkills'].mockResolvedValue({ skills: [], total: 0, page: 1, pages: 0 });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'search', 'test', '--limit', '5']);

      expect(client['searchSkills']).toHaveBeenCalledWith('test', expect.objectContaining({
        limit: 5,
      }));
    });

    it('shows offline fallback on network error', async () => {
      const client = new RegistryClient() as unknown as Record<string, ReturnType<typeof vi.fn>>;
      client['searchSkills'].mockRejectedValue(new Error('ECONNREFUSED'));
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'search', 'test']);

      // Should show error since no local skills
      expect(printError).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('validates manifest before publish', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify({
        id: 'my-skill',
        name: 'My Skill',
        version: '1.0.0',
        description: 'A test skill',
        author: 'test-author',
      }));

      const auth = new MarketplaceAuth() as unknown as Record<string, ReturnType<typeof vi.fn>>;
      auth['getToken'].mockReturnValue('test-token');

      const client = new RegistryClient() as unknown as Record<string, ReturnType<typeof vi.fn>>;
      client['publishSkill'].mockResolvedValue({ success: true, message: 'Published' });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'publish']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('Published'));
    });

    it('shows validation errors for bad manifest', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) =>
        p.endsWith('manifest.json'),
      );
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify({
        id: 'my-skill',
        // Missing name, version, description
      }));

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'publish']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('Validation failed'));
    });

    it('--dry-run validates without publishing', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify({
        id: 'my-skill',
        name: 'My Skill',
        version: '1.0.0',
        description: 'A test skill',
        author: 'tester',
      }));

      const client = new RegistryClient() as unknown as Record<string, ReturnType<typeof vi.fn>>;

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'publish', '--dry-run']);

      expect(print).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
      expect(client['publishSkill']).not.toHaveBeenCalled();
    });

    it('requires authentication for publish', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify({
        id: 'my-skill',
        name: 'My Skill',
        version: '1.0.0',
        description: 'A test skill',
        author: 'tester',
      }));

      const auth = new MarketplaceAuth() as unknown as Record<string, ReturnType<typeof vi.fn>>;
      auth['getToken'].mockReturnValue(null);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'publish']);

      expect(printError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('not authenticated'),
      }));
    });

    it('errors when manifest.json not found', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'publish']);

      expect(printError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('manifest not found'),
      }));
    });
  });
});
