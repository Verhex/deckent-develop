import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { resolveHealthUrl, checkVoiceHealth } from '../../../src/connectors/voice/health.js';
import type { VoiceConfig } from '../../../src/connectors/voice/types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeFetch(opts: {
  ok?: boolean;
  status?: number;
  throws?: Error;
}): typeof globalThis.fetch {
  if (opts.throws) {
    return vi.fn(() => Promise.reject(opts.throws));
  }
  const { ok = true, status = 200 } = opts;
  return vi.fn(async () => ({ ok, status } as unknown as Response));
}

// ─── resolveHealthUrl ────────────────────────────────────────────────────────

describe('resolveHealthUrl', () => {
  it('returns explicit health_url when set (wins over derivation)', () => {
    const result = resolveHealthUrl({
      stt_url: 'http://127.0.0.1:8001/stt',
      health_url: 'http://127.0.0.1:8001/custom-health',
    });
    expect(result).toBe('http://127.0.0.1:8001/custom-health');
  });

  it('derives health URL from stt_url origin + /health', () => {
    const result = resolveHealthUrl({ stt_url: 'http://127.0.0.1:8001/stt' });
    expect(result).toBe('http://127.0.0.1:8001/health');
  });

  it('derives health URL from tts_url origin + /health when stt_url absent', () => {
    const result = resolveHealthUrl({ tts_url: 'http://127.0.0.1:8002/tts' });
    expect(result).toBe('http://127.0.0.1:8002/health');
  });

  it('returns null when neither stt_url nor tts_url present', () => {
    const result = resolveHealthUrl({});
    expect(result).toBeNull();
  });

  it('returns null when local object is empty', () => {
    const result = resolveHealthUrl({ tts_voice: 'alloy' });
    expect(result).toBeNull();
  });
});

// ─── checkVoiceHealth — disabled ─────────────────────────────────────────────

describe('checkVoiceHealth — disabled (voice off)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns ok:true with provider:none and does NOT call fetch', async () => {
    const fetchMock = makeFetch({ ok: true });
    const cfg: VoiceConfig = { enabled: false };
    const result = await checkVoiceHealth(cfg, {}, fetchMock);
    expect(result).toEqual({ ok: true, provider: 'none' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns ok:true with provider:none when enabled is absent', async () => {
    const fetchMock = makeFetch({ ok: true });
    const cfg: VoiceConfig = {};
    const result = await checkVoiceHealth(cfg, {}, fetchMock);
    expect(result).toEqual({ ok: true, provider: 'none' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── checkVoiceHealth — local provider ───────────────────────────────────────

describe('checkVoiceHealth — local provider', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const localCfg: VoiceConfig = {
    enabled: true,
    provider: 'local',
    local: { stt_url: 'http://127.0.0.1:8001/stt', tts_url: 'http://127.0.0.1:8001/tts' },
  };

  it('returns ok:true when health endpoint responds 200', async () => {
    const fetchMock = makeFetch({ ok: true, status: 200 });
    const result = await checkVoiceHealth(localCfg, {}, fetchMock);
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('local');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('http://127.0.0.1:8001/health');
  });

  it('returns ok:false + detail when health endpoint responds 503', async () => {
    const fetchMock = makeFetch({ ok: false, status: 503 });
    const result = await checkVoiceHealth(localCfg, {}, fetchMock);
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('local');
    expect(result.detail).toMatch(/503/);
  });

  it('returns ok:false + detail when fetch throws (network error)', async () => {
    const fetchMock = makeFetch({ throws: new Error('ECONNREFUSED') });
    const result = await checkVoiceHealth(localCfg, {}, fetchMock);
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('local');
    expect(result.detail).toMatch(/ECONNREFUSED/);
  });

  it('returns ok:true + provider:local when health_url is null (no url configured)', async () => {
    const fetchMock = makeFetch({ ok: true });
    const cfgNoUrls: VoiceConfig = { enabled: true, provider: 'local', local: {} };
    const result = await checkVoiceHealth(cfgNoUrls, {}, fetchMock);
    // No URL to check — treat as ok:true (cannot verify, but cannot fail honestly either)
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('local');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── checkVoiceHealth — fetch timeout (AbortController) ──────────────────────

describe('checkVoiceHealth — local provider fetch timeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('resolves ok:false with timeout detail and does NOT hang when fetch never responds', async () => {
    // Simulate a fetch that hangs until its AbortSignal fires, then rejects with AbortError.
    const hangingFetch = vi.fn(
      (_url: string, init?: RequestInit): Promise<Response> =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            // If already aborted before we start (edge case), reject immediately.
            if (signal.aborted) {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
          // Never resolves on its own — only the abort above unblocks it.
        }),
    );

    const cfg: VoiceConfig = {
      enabled: true,
      provider: 'local',
      local: { stt_url: 'http://127.0.0.1:8001/stt' },
    };

    // Start the health-check — it must NOT resolve before the timer fires.
    const promise = checkVoiceHealth(cfg, {}, hangingFetch as unknown as typeof globalThis.fetch);

    // Advance fake clock past the 5000ms AbortController ceiling.
    await vi.advanceTimersByTimeAsync(5001);

    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.provider).toBe('local');
    expect(result.detail).toMatch(/timeout after 5000ms/);
    expect(hangingFetch).toHaveBeenCalledOnce();
  });
});

// ─── checkVoiceHealth — openai provider ──────────────────────────────────────

describe('checkVoiceHealth — openai provider', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns ok:true when OPENAI_API_KEY is present in deck', async () => {
    const fetchMock = makeFetch({ ok: true });
    const cfg: VoiceConfig = { enabled: true, provider: 'openai' };
    const result = await checkVoiceHealth(cfg, { OPENAI_API_KEY: 'sk-test-key' }, fetchMock);
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('openai');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns ok:false + detail when OPENAI_API_KEY is absent', async () => {
    const fetchMock = makeFetch({ ok: true });
    const cfg: VoiceConfig = { enabled: true, provider: 'openai' };
    const result = await checkVoiceHealth(cfg, {}, fetchMock);
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('openai');
    expect(result.detail).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns ok:false + detail when OPENAI_API_KEY is empty string', async () => {
    const fetchMock = makeFetch({ ok: true });
    const cfg: VoiceConfig = { enabled: true, provider: 'openai' };
    const result = await checkVoiceHealth(cfg, { OPENAI_API_KEY: '' }, fetchMock);
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('openai');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
