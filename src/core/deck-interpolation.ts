import { loadDeckSecrets } from './deck-file.js';

const DECK_PATTERN = /^\$DECK:([A-Z_][A-Z0-9_]*)$/;

/**
 * Interpolate $DECK:KEY references in config with values from .deck file.
 * Only exact full-string matches are replaced (no partial interpolation).
 * Missing keys produce a warning but keep the placeholder unchanged.
 */
export function interpolateConfig<T>(config: T, projectRoot: string): T {
  const secrets = loadDeckSecrets(projectRoot);
  return deepInterpolate(config, secrets) as T;
}

function deepInterpolate(val: unknown, secrets: Record<string, string>): unknown {
  if (typeof val === 'string') {
    const match = val.match(DECK_PATTERN);
    if (match && match[1]) {
      const key = match[1];
      const secret = secrets[key] ?? secrets[`DECKENT_${key}`];
      if (!secret) {
        console.warn(`[deck-interpolation] Missing secret: ${key} (from $DECK:${key})`);
        return val;
      }
      return secret;
    }
    return val;
  }
  if (Array.isArray(val)) return val.map((v) => deepInterpolate(v, secrets));
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = deepInterpolate(v, secrets);
    }
    return out;
  }
  return val;
}
