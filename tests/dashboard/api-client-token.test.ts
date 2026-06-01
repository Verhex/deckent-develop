import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchJson,
  postJson,
  getBootstrapApiToken,
  ApiError,
} from '../../src/dashboard/src/lib/api-client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch;
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true }),
    statusText: 'OK',
  });
});

afterEach(() => {
  // restore to plain object so next test starts clean
  (globalThis as unknown as { window: Record<string, unknown> }).window = {};
});

describe('api-client — Authorization: Bearer token injection', () => {
  it('GET with token attaches Authorization: Bearer header', async () => {
    (globalThis as unknown as { window: { __DECKENT_API_TOKEN__: string } }).window = {
      __DECKENT_API_TOKEN__: 'test-token-abc',
    };

    await fetchJson('/api/status');

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer test-token-abc',
    );
  });

  it('GET without token sends no Authorization header', async () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};

    await fetchJson('/api/status');

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('401 GET dispatches deckent:unauthorized event and throws ApiError', async () => {
    const mockDispatch = vi.fn();
    (globalThis as unknown as { window: { dispatchEvent: typeof mockDispatch; __DECKENT_API_TOKEN__?: string } }).window = {
      dispatchEvent: mockDispatch,
    };
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

    await expect(fetchJson('/api/status')).rejects.toBeInstanceOf(ApiError);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deckent:unauthorized' }),
    );
  });

  it('Authorization header format is exactly "Bearer <token>"', async () => {
    (globalThis as unknown as { window: { __DECKENT_API_TOKEN__: string } }).window = {
      __DECKENT_API_TOKEN__: 'mytoken123',
    };

    await fetchJson('/api/test');

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const authHeader = (opts.headers as Record<string, string>)['Authorization'];
    expect(authHeader).toBe('Bearer mytoken123');
    expect(authHeader).toMatch(/^Bearer /);
  });

  it('POST with token attaches Authorization: Bearer header', async () => {
    (globalThis as unknown as { window: { __DECKENT_API_TOKEN__: string } }).window = {
      __DECKENT_API_TOKEN__: 'post-token-xyz',
    };

    await postJson('/api/start', { autoApprove: true });

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer post-token-xyz',
    );
    expect(opts.method).toBe('POST');
  });

  it('401 on POST also dispatches deckent:unauthorized', async () => {
    const mockDispatch = vi.fn();
    (globalThis as unknown as { window: { dispatchEvent: typeof mockDispatch } }).window = {
      dispatchEvent: mockDispatch,
    };
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

    await expect(postJson('/api/start', {})).rejects.toBeInstanceOf(ApiError);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deckent:unauthorized' }),
    );
  });

  it('getBootstrapApiToken returns token when window has it', () => {
    (globalThis as unknown as { window: { __DECKENT_API_TOKEN__: string } }).window = {
      __DECKENT_API_TOKEN__: 'bootstrap-tok',
    };
    expect(getBootstrapApiToken()).toBe('bootstrap-tok');
  });

  it('getBootstrapApiToken returns undefined when token absent', () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    expect(getBootstrapApiToken()).toBeUndefined();
  });
});
