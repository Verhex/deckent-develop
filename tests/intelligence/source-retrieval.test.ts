import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  SOURCE_FETCH_MAX_ATTEMPTS,
  SOURCE_FETCH_TIMEOUT_MS,
  SOURCE_KINDS,
  SOURCE_PRIORITY,
  retrieveSources,
  type SourceDefinition,
  type SourceFetch,
  type SourceKind,
} from '../../src/intelligence/source-retrieval.js';

const BASE_SOURCE: SourceDefinition = {
  sourceId: 'release',
  kind: 'official-release',
  url: 'https://example.test/releases',
  format: 'github-release-json',
};

describe('official source retrieval', () => {
  it('defines the closed source priority vocabulary and orders retrieval as data', async () => {
    expect(SOURCE_KINDS).toEqual([
      'official-repo', 'official-release', 'official-docs',
      'official-announcement', 'benchmark',
    ]);
    expectTypeOf<SourceKind>().toEqualTypeOf<(typeof SOURCE_KINDS)[number]>();
    expect(SOURCE_KINDS.map((kind) => SOURCE_PRIORITY[kind])).toEqual([0, 1, 2, 3, 4]);

    const results = await retrieveSources([
      { ...BASE_SOURCE, sourceId: 'benchmark', kind: 'benchmark' },
      { ...BASE_SOURCE, sourceId: 'repo', kind: 'official-repo' },
    ], async () => jsonResponse({ name: 'v1' }));
    expect(results.map((result) => result.source.sourceId)).toEqual(['repo', 'benchmark']);
  });

  it('parses GitHub releases and carries conditional state without retaining raw bodies', async () => {
    const rawSecret = 'raw-body-must-not-survive';
    const fetchImpl = vi.fn<SourceFetch>(async (_input, init) => {
      expect(new Headers(init?.headers).get('if-none-match')).toBe('"old"');
      expect(new Headers(init?.headers).get('if-modified-since')).toBe('yesterday');
      return jsonResponse({
        name: 'Version 2', published_at: '2026-08-28T00:00:00Z',
        html_url: 'https://example.test/v2', body: rawSecret,
      }, { etag: '"new"', 'last-modified': 'today' });
    });
    const [result] = await retrieveSources([{
      ...BASE_SOURCE, conditional: { etag: '"old"', lastModified: 'yesterday' },
    }], fetchImpl);

    expect(result).toMatchObject({
      status: 'ok', attempts: 1,
      conditional: { etag: '"new"', lastModified: 'today' },
      entries: [{
        title: 'Version 2', publishedAt: '2026-08-28T00:00:00Z',
        canonicalUrl: 'https://example.test/v2',
      }],
    });
    expect(result?.byteCount).toBeGreaterThan(0);
    expect(result?.framedOutputDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain(rawSecret);
  });

  it('returns unchanged on 304 and preserves validators', async () => {
    const [result] = await retrieveSources([{
      ...BASE_SOURCE, conditional: { etag: '"same"', lastModified: 'then' },
    }], async () => new Response(null, { status: 304 }));
    expect(result).toMatchObject({
      status: 'unchanged', conditional: { etag: '"same"', lastModified: 'then' },
      attempts: 1, byteCount: 0,
    });
  });

  it('parses JSON Feed and Atom metadata', async () => {
    const sources: SourceDefinition[] = [
      { ...BASE_SOURCE, sourceId: 'json', format: 'json-feed' },
      { ...BASE_SOURCE, sourceId: 'atom', format: 'atom' },
    ];
    const fetchImpl: SourceFetch = async (input) => String(input).includes('releases')
      ? new Response(JSON.stringify({ items: [{
          title: 'JSON item', date_published: '2026-08-27',
          url: 'https://example.test/json', content_text: 'discard me',
        }] }))
      : new Response('');
    sources[1] = { ...sources[1]!, url: 'https://example.test/atom' };
    const results = await retrieveSources(sources, async (input) =>
      String(input).endsWith('/atom')
        ? new Response('<feed><entry><title>Atom item</title><updated>2026-08-28</updated><link rel="alternate" href="https://example.test/atom-item"/><content>discard me too</content></entry></feed>')
        : fetchImpl(input));
    expect(results[0]).toMatchObject({ status: 'ok', entries: [{ title: 'JSON item' }] });
    expect(results[1]).toMatchObject({ status: 'ok', entries: [{ title: 'Atom item' }] });
    expect(JSON.stringify(results)).not.toContain('discard me');
  });

  it('extracts only safe HTML metadata and never retains HTML body content', async () => {
    const privateBody = 'PRIVATE FULL ARTICLE BODY';
    const html = `<html><head><title>Fallback</title><meta property="og:title" content="Safe title"><meta property="article:published_time" content="2026-08-28"><link rel="canonical" href="https://example.test/post"></head><body>${privateBody}</body></html>`;
    const [result] = await retrieveSources([{
      ...BASE_SOURCE, format: 'html', kind: 'official-announcement',
    }], async () => new Response(html));
    expect(result).toMatchObject({ status: 'ok', entries: [{
      title: 'Safe title', publishedAt: '2026-08-28',
      canonicalUrl: 'https://example.test/post',
    }] });
    expect(JSON.stringify(result)).not.toContain(privateBody);
    expect(result).not.toHaveProperty('body');
  });

  it('turns a malformed feed into typed hold without failing successful siblings', async () => {
    const results = await retrieveSources([
      { ...BASE_SOURCE, sourceId: 'bad', format: 'json-feed' },
      { ...BASE_SOURCE, sourceId: 'good', url: 'https://example.test/good' },
    ], async (input) => String(input).endsWith('/good')
      ? jsonResponse({ tag_name: 'v3' })
      : new Response('{broken'));
    expect(results[0]).toMatchObject({ status: 'hold', attempts: 1 });
    expect(results[0]?.status === 'hold' && results[0].reason).toMatch(/JSON/);
    expect(results[1]).toMatchObject({ status: 'ok' });
    expect(JSON.stringify(results)).not.toContain('{broken');
  });

  it('does not exceed the named retry limit for transient responses', async () => {
    const fetchImpl = vi.fn<SourceFetch>(async () => new Response('', { status: 503 }));
    const [result] = await retrieveSources([BASE_SOURCE], fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(SOURCE_FETCH_MAX_ATTEMPTS);
    expect(result).toMatchObject({
      status: 'hold', attempts: SOURCE_FETCH_MAX_ATTEMPTS, reason: 'HTTP 503.',
    });
  });

  it('applies the named timeout to every bounded attempt', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<SourceFetch>(async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }));
      const pending = retrieveSources([BASE_SOURCE], fetchImpl);
      await vi.advanceTimersByTimeAsync(SOURCE_FETCH_TIMEOUT_MS * SOURCE_FETCH_MAX_ATTEMPTS);
      const [result] = await pending;
      expect(fetchImpl).toHaveBeenCalledTimes(SOURCE_FETCH_MAX_ATTEMPTS);
      expect(result).toMatchObject({
        status: 'hold', attempts: SOURCE_FETCH_MAX_ATTEMPTS,
        reason: `Timed out after ${SOURCE_FETCH_TIMEOUT_MS}ms.`,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

function jsonResponse(value: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200, headers: { 'content-type': 'application/json', ...headers },
  });
}
