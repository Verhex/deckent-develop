import { describe, it, expect } from 'vitest';
import { enrichResponse, generateSummary, generateHints } from '../../src/mcp/helpers/enrich.js';

describe('enrichResponse', () => {
  it('preserves all existing fields (spread test)', () => {
    const response = { status: 'ok', data: [1, 2, 3], nested: { a: 1 } };
    const result = enrichResponse('status', response);
    expect(result.status).toBe('ok');
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.nested).toEqual({ a: 1 });
  });

  it('adds _enriched field without modifying response', () => {
    const response = { foo: 'bar' };
    const result = enrichResponse('status', response);
    expect('_enriched' in result).toBe(true);
    // original not mutated
    expect('_enriched' in response).toBe(false);
  });

  it('_enriched.summary is a string', () => {
    const result = enrichResponse('plan', { tasks: [] });
    expect(typeof result._enriched.summary).toBe('string');
    expect(result._enriched.summary.length).toBeGreaterThan(0);
  });

  it('_enriched.hints is an array', () => {
    const result = enrichResponse('start', { sprintId: 'sprint-001' });
    expect(Array.isArray(result._enriched.hints)).toBe(true);
  });

  it('_enriched.timestamp is ISO 8601 format', () => {
    const result = enrichResponse('status', {});
    const ts = result._enriched.timestamp;
    expect(typeof ts).toBe('string');
    expect(() => new Date(ts).toISOString()).not.toThrow();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('tr localization works', () => {
    const result = enrichResponse('plan', {}, { lang: 'tr' });
    expect(result._enriched.summary).toContain('oluşturuldu');
  });

  it('en localization works', () => {
    const result = enrichResponse('plan', {}, { lang: 'en' });
    expect(result._enriched.summary).toContain('created');
  });

  it('unknown tool returns generic fallback summary (en)', () => {
    const result = enrichResponse('unknown_tool', {}, { lang: 'en' });
    expect(result._enriched.summary).toContain('unknown_tool');
    expect(result._enriched.summary).toContain('completed');
  });

  it('unknown tool returns generic fallback summary (tr)', () => {
    const result = enrichResponse('unknown_tool', {}, { lang: 'tr' });
    expect(result._enriched.summary).toContain('unknown_tool');
    expect(result._enriched.summary).toContain('tamamlandı');
  });

  it('unknown tool returns empty hints array', () => {
    const result = enrichResponse('unknown_tool', {});
    expect(result._enriched.hints).toEqual([]);
  });

  it('defaults to en when no context provided', () => {
    const result = enrichResponse('plan', {});
    expect(result._enriched.summary).toContain('created');
  });
});

describe('generateSummary', () => {
  it('returns known tool summary in en', () => {
    expect(generateSummary('doctor', {}, 'en')).toBe('System health check completed.');
  });

  it('returns known tool summary in tr', () => {
    expect(generateSummary('doctor', {}, 'tr')).toBe('Sistem sağlık kontrolü tamamlandı.');
  });

  it('returns generic for unknown tool', () => {
    expect(generateSummary('foobar', {}, 'en')).toBe('foobar operation completed.');
  });

  it('defaults to en', () => {
    expect(generateSummary('init', {})).toBe('Project initialized.');
  });
});

describe('generateHints', () => {
  it('returns hints array for known tool', () => {
    const hints = generateHints('set_directives', {});
    expect(Array.isArray(hints)).toBe(true);
    expect(hints.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown tool', () => {
    expect(generateHints('nonexistent', {})).toEqual([]);
  });

  it('start tool hints include watch command', () => {
    const hints = generateHints('start', {});
    expect(hints.some(h => h.includes('watch'))).toBe(true);
  });
});
