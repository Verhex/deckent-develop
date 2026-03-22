import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  RegistryClient,
  RegistryNetworkError,
  RegistryRateLimitError,
} from '../../../src/core/marketplace/registry-client.js';
import type { RegistrySkillEntry, SearchResult, SkillDetail } from '../../../src/core/marketplace/registry-client.js';

// ─── Mock HTTP Module ────────────────────────────────────────────────────────

function createMockResponse(statusCode: number, body: unknown, headers: Record<string, string> = {}): { statusCode: number; headers: Record<string, string>; on: ReturnType<typeof vi.fn> } {
  const resEmitter = new EventEmitter();
  const res = {
    statusCode,
    headers,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      resEmitter.on(event, handler);
      // Auto-emit data/end for convenience
      if (event === 'end') {
        setTimeout(() => {
          const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
          resEmitter.emit('data', Buffer.from(bodyStr));
          resEmitter.emit('end');
        }, 0);
      }
      return res;
    }),
  };
  return res;
}

function createMockHttpModule(response: ReturnType<typeof createMockResponse>, error?: Error) {
  const reqEmitter = new EventEmitter();
  const req = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      reqEmitter.on(event, handler);
      if (error && event === 'error') {
        setTimeout(() => reqEmitter.emit('error', error), 0);
      }
      return req;
    }),
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
  };

  return {
    request: vi.fn((_opts: unknown, callback: (res: unknown) => void) => {
      if (!error) {
        setTimeout(() => callback(response), 0);
      }
      return req;
    }),
    _req: req,
    _reqEmitter: reqEmitter,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockSearchResult: SearchResult = {
  skills: [
    {
      name: 'typescript-expert',
      description: 'TypeScript best practices',
      version: '1.0.0',
      author: 'deckent',
      category: 'language',
      downloads: 500,
      rating: 4.5,
      tags: ['typescript', 'ts'],
    },
  ],
  total: 1,
  page: 1,
  pages: 1,
};

const mockSkillDetail: SkillDetail = {
  ...mockSearchResult.skills[0]!,
  readme: '# TypeScript Expert',
  dependencies: [],
  publishedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  repository: 'https://github.com/deckent/ts-expert',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RegistryClient', () => {
  describe('constructor', () => {
    it('uses default registry URL', () => {
      const client = new RegistryClient();
      expect(client).toBeDefined();
    });

    it('accepts custom registry URL', () => {
      const client = new RegistryClient({ registryUrl: 'http://localhost:3000' });
      expect(client).toBeDefined();
    });

    it('accepts custom timeout', () => {
      const client = new RegistryClient({ timeoutMs: 10000 });
      expect(client).toBeDefined();
    });
  });

  describe('searchSkills', () => {
    it('returns search results on success', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, mockSearchResult));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      const result = await client.searchSkills('typescript');
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]!.name).toBe('typescript-expert');
      expect(result.total).toBe(1);
    });

    it('passes category as query parameter', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, mockSearchResult));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await client.searchSkills('ts', { category: 'language' });
      const callArgs = mockHttp.request.mock.calls[0]![0] as { path: string };
      expect(callArgs.path).toContain('category=language');
    });

    it('respects page and limit options', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, mockSearchResult));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await client.searchSkills('ts', { page: 2, limit: 10 });
      const callArgs = mockHttp.request.mock.calls[0]![0] as { path: string };
      expect(callArgs.path).toContain('page=2');
      expect(callArgs.path).toContain('limit=10');
    });

    it('clamps page to minimum 1', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, mockSearchResult));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await client.searchSkills('ts', { page: -5 });
      const callArgs = mockHttp.request.mock.calls[0]![0] as { path: string };
      expect(callArgs.path).toContain('page=1');
    });

    it('clamps limit to 1-100 range', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, mockSearchResult));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await client.searchSkills('ts', { limit: 200 });
      const callArgs = mockHttp.request.mock.calls[0]![0] as { path: string };
      expect(callArgs.path).toContain('limit=100');
    });

    it('throws RegistryRateLimitError on 429', async () => {
      const mockHttp = createMockHttpModule(
        createMockResponse(429, 'Rate limited', { 'retry-after': '30' }),
      );
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await expect(client.searchSkills('ts')).rejects.toThrow(RegistryRateLimitError);
    });

    it('includes retryAfter in rate limit error', async () => {
      const mockHttp = createMockHttpModule(
        createMockResponse(429, 'Rate limited', { 'retry-after': '30' }),
      );
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      try {
        await client.searchSkills('ts');
      } catch (err) {
        expect(err).toBeInstanceOf(RegistryRateLimitError);
        expect((err as RegistryRateLimitError).retryAfter).toBe(30);
      }
    });

    it('throws RegistryNetworkError on 500', async () => {
      const mockHttp = createMockHttpModule(
        createMockResponse(500, 'Internal Server Error'),
      );
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await expect(client.searchSkills('ts')).rejects.toThrow(RegistryNetworkError);
    });

    it('throws RegistryNetworkError on network failure', async () => {
      const mockHttp = createMockHttpModule(
        createMockResponse(200, {}),
        new Error('ECONNREFUSED'),
      );
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await expect(client.searchSkills('ts')).rejects.toThrow(RegistryNetworkError);
    });

    it('throws on invalid JSON response', async () => {
      const mockHttp = createMockHttpModule(
        createMockResponse(200, 'not json{{{'),
      );
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await expect(client.searchSkills('ts')).rejects.toThrow(RegistryNetworkError);
    });

    it('uses GET method for search', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, mockSearchResult));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await client.searchSkills('ts');
      const callArgs = mockHttp.request.mock.calls[0]![0] as { method: string };
      expect(callArgs.method).toBe('GET');
    });
  });

  describe('getSkillDetail', () => {
    it('returns skill detail on success', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, mockSkillDetail));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      const result = await client.getSkillDetail('typescript-expert');
      expect(result.name).toBe('typescript-expert');
      expect(result.readme).toBe('# TypeScript Expert');
    });

    it('throws on empty skill name', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, {}));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await expect(client.getSkillDetail('')).rejects.toThrow('skill name must be non-empty');
    });

    it('encodes skill name in URL', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, mockSkillDetail));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await client.getSkillDetail('my skill');
      const callArgs = mockHttp.request.mock.calls[0]![0] as { path: string };
      expect(callArgs.path).toContain('my%20skill');
    });

    it('throws RegistryNetworkError on 404', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(404, 'Not Found'));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await expect(client.getSkillDetail('nonexistent')).rejects.toThrow(RegistryNetworkError);
    });
  });

  describe('publishSkill', () => {
    it('sends POST with auth header', async () => {
      const publishResponse = { success: true, message: 'Published' };
      const mockHttp = createMockHttpModule(createMockResponse(200, publishResponse));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      const result = await client.publishSkill({ name: 'my-skill' }, 'test-token');
      expect(result.success).toBe(true);

      const callArgs = mockHttp.request.mock.calls[0]![0] as { method: string; headers: Record<string, string> };
      expect(callArgs.method).toBe('POST');
      expect(callArgs.headers['Authorization']).toBe('Bearer test-token');
    });

    it('sends request body as JSON', async () => {
      const mockHttp = createMockHttpModule(createMockResponse(200, { success: true, message: 'ok' }));
      const client = new RegistryClient({
        registryUrl: 'http://localhost:3000',
        httpModule: mockHttp as unknown as typeof import('node:https'),
      });

      await client.publishSkill({ name: 'test', version: '1.0.0' }, 'token');
      expect(mockHttp._req.write).toHaveBeenCalledWith(expect.stringContaining('"name":"test"'));
    });
  });

  describe('timeout handling', () => {
    it('creates client with custom timeout', () => {
      const client = new RegistryClient({ timeoutMs: 1000 });
      expect(client).toBeDefined();
    });
  });
});
