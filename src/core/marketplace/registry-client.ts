// ─── Registry Client ─────────────────────────────────────────────────────────
// Remote marketplace registry client for searching and fetching skill details.

import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RegistrySkillEntry {
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  downloads: number;
  rating: number;
  tags: string[];
}

export interface SearchResult {
  skills: RegistrySkillEntry[];
  total: number;
  page: number;
  pages: number;
}

export interface SearchOptions {
  category?: string;
  page?: number;
  limit?: number;
}

export interface SkillDetail extends RegistrySkillEntry {
  readme: string;
  dependencies: string[];
  publishedAt: string;
  updatedAt: string;
  repository?: string;
}

export class RegistryNetworkError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'RegistryNetworkError';
  }
}

export class RegistryRateLimitError extends Error {
  constructor(public readonly retryAfter?: number) {
    super(`Rate limited. ${retryAfter ? `Retry after ${retryAfter}s.` : 'Try again later.'}`);
    this.name = 'RegistryRateLimitError';
  }
}

// ─── Default ─────────────────────────────────────────────────────────────────

const DEFAULT_REGISTRY_URL = 'https://registry.deckent.dev';
const DEFAULT_TIMEOUT_MS = 5000;

// ─── RegistryClient ──────────────────────────────────────────────────────────

export class RegistryClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  /** Injectable http/https module for testing */
  private readonly httpModule: typeof https | typeof http;

  constructor(options?: {
    registryUrl?: string;
    timeoutMs?: number;
    httpModule?: typeof https | typeof http;
  }) {
    this.baseUrl = (options?.registryUrl ?? DEFAULT_REGISTRY_URL).replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const parsedUrl = new URL(this.baseUrl);
    this.httpModule = options?.httpModule ?? (parsedUrl.protocol === 'http:' ? http : https);
  }

  /**
   * Search for skills in the registry.
   */
  async searchSkills(query: string, options?: SearchOptions): Promise<SearchResult> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.max(1, Math.min(100, options?.limit ?? 20));
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(limit),
    });
    if (options?.category) {
      params.set('category', options.category);
    }

    const url = `${this.baseUrl}/api/skills/search?${params.toString()}`;
    const data = await this._request(url);
    return data as SearchResult;
  }

  /**
   * Get full detail for a single skill by name.
   */
  async getSkillDetail(name: string): Promise<SkillDetail> {
    if (!name || typeof name !== 'string') {
      throw new Error('Skill name must be a non-empty string');
    }
    const safeName = encodeURIComponent(name);
    const url = `${this.baseUrl}/api/skills/${safeName}`;
    const data = await this._request(url);
    return data as SkillDetail;
  }

  /**
   * Publish a skill to the registry.
   */
  async publishSkill(payload: Record<string, unknown>, authToken: string): Promise<{ success: boolean; message: string }> {
    const url = `${this.baseUrl}/api/skills/publish`;
    const data = await this._request(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });
    return data as { success: boolean; message: string };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _request(
    urlStr: string,
    options?: { method?: string; body?: string; headers?: Record<string, string> },
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlStr);
      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options?.method ?? 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'deckent-cli',
          ...(options?.headers ?? {}),
        },
        timeout: this.timeoutMs,
      };

      const req = this.httpModule.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          const statusCode = res.statusCode ?? 0;

          if (statusCode === 429) {
            const retryAfter = res.headers['retry-after']
              ? parseInt(res.headers['retry-after'] as string, 10)
              : undefined;
            reject(new RegistryRateLimitError(retryAfter));
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            reject(new RegistryNetworkError(`Registry responded with status ${statusCode}: ${body}`, statusCode));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new RegistryNetworkError('Invalid JSON response from registry'));
          }
        });
      });

      req.on('error', (err: Error) => {
        reject(new RegistryNetworkError(`Network error: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new RegistryNetworkError('Request timed out'));
      });

      if (options?.body) {
        req.write(options.body);
      }

      req.end();
    });
  }
}
