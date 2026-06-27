import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type GetMessageFn = (key: string, lang: string, vars?: Record<string, string>) => string;

describe('getMessage — missing key prod-warn dedup', () => {
  let getMessage: GetMessageFn;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../src/cli/helpers/messages.js');
    getMessage = mod.getMessage;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns once to stderr for missing key in production', () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      getMessage('__test.missing.prod.warn.001', 'en');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(String(stderrSpy.mock.calls[0]![0])).toContain('__test.missing.prod.warn.001');
    } finally {
      process.env['NODE_ENV'] = origEnv;
    }
  });

  it('does not warn a second time for the same key (dedup)', () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      getMessage('__test.missing.prod.warn.002', 'en');
      getMessage('__test.missing.prod.warn.002', 'en');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    } finally {
      process.env['NODE_ENV'] = origEnv;
    }
  });

  it('still returns the raw key as fallback in production', () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const result = getMessage('__test.missing.prod.warn.003', 'en');
      expect(result).toBe('__test.missing.prod.warn.003');
    } finally {
      process.env['NODE_ENV'] = origEnv;
    }
  });

  it('does not warn for a present key in production', () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      getMessage('hint.COMPLETE', 'en');
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      process.env['NODE_ENV'] = origEnv;
    }
  });

  it('warns on every call in non-production (existing behavior preserved)', () => {
    const origEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';
    try {
      getMessage('__test.missing.dev.warn.001', 'en');
      getMessage('__test.missing.dev.warn.001', 'en');
      expect(stderrSpy).toHaveBeenCalledTimes(2);
    } finally {
      process.env['NODE_ENV'] = origEnv;
    }
  });
});
