// ─── Voice Backend Health-Check ───────────────────────────────────────────────
//
// Resolves the health URL for a local voice wrapper and performs a lightweight
// GET check. Used by bot.ts on start-up when voice is configured — an honest
// warn (Law 2: fail honestly, never silently) is emitted if the backend is
// unreachable; the bot still starts and Pillar-1 runtime degrade covers the
// transcribe/synthesize failure path at runtime.

import type { VoiceConfig } from './types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface VoiceHealthResult {
  ok: boolean;
  provider: string;
  /** The health-check URL that was (or would be) queried — empty for openai/none. */
  url?: string;
  detail?: string;
}

// ─── resolveHealthUrl ─────────────────────────────────────────────────────────

/**
 * Derive the health-check URL for a local voice wrapper config.
 *
 * Priority:
 *  1. Explicit `local.health_url` — returned as-is.
 *  2. Origin of `local.stt_url` + "/health" (e.g. http://127.0.0.1:8001/stt →
 *     http://127.0.0.1:8001/health).
 *  3. Origin of `local.tts_url` + "/health" — fallback when stt_url absent.
 *  4. null — no URL configured; caller should skip the check.
 */
export function resolveHealthUrl(
  local: NonNullable<VoiceConfig['local']>,
): string | null {
  if (local.health_url) return local.health_url;

  const base = local.stt_url ?? local.tts_url;
  if (!base) return null;

  try {
    const { origin } = new URL(base);
    return `${origin}/health`;
  } catch {
    // Malformed URL — cannot derive; skip check.
    return null;
  }
}

// ─── checkVoiceHealth ────────────────────────────────────────────────────────

/**
 * Run a lightweight health check against the configured voice backend.
 *
 * - `voice disabled`  → `{ ok: true, provider: 'none' }` — nothing to check.
 * - `provider: local` → GET the resolved health URL; ok iff 2xx.
 *                       Network errors → ok:false + detail.
 *                       No URL configured → ok:true (cannot verify; not a failure).
 * - `provider: openai`→ ok iff OPENAI_API_KEY is present + non-empty in `deck`.
 *                       No network call is made.
 *
 * @param cfg   VoiceConfig from deckent config (bot_capabilities.voice).
 * @param deck  Deck secrets map (loadDeckSecrets result).
 * @param fetchImpl  Injectable fetch — defaults to globalThis.fetch (Node 18+).
 */
export async function checkVoiceHealth(
  cfg: VoiceConfig,
  deck: Record<string, string>,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<VoiceHealthResult> {
  // Default-off: if voice is not explicitly enabled there is nothing to check.
  if (!cfg.enabled) {
    return { ok: true, provider: 'none' };
  }

  const provider = cfg.provider ?? 'local';

  if (provider === 'openai') {
    const key = deck['OPENAI_API_KEY'];
    if (!key) {
      return {
        ok: false,
        provider: 'openai',
        detail: 'OPENAI_API_KEY is absent from deck secrets — voice (openai) will not work',
      };
    }
    return { ok: true, provider: 'openai' };
  }

  // provider === 'local' (default)
  const healthUrl = resolveHealthUrl(cfg.local ?? {});

  if (!healthUrl) {
    // No URL to check — cannot verify, cannot fail honestly.
    return { ok: true, provider: 'local' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetchImpl(healthUrl, { signal: controller.signal });
    if (res.ok) {
      return { ok: true, provider: 'local', url: healthUrl };
    }
    return {
      ok: false,
      provider: 'local',
      url: healthUrl,
      detail: `HTTP ${res.status} from ${healthUrl}`,
    };
  } catch (err) {
    const detail =
      err instanceof Error && err.name === 'AbortError'
        ? `timeout after 5000ms waiting for ${healthUrl}`
        : `Network error reaching ${healthUrl}: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, provider: 'local', url: healthUrl, detail };
  } finally {
    clearTimeout(timer);
  }
}
