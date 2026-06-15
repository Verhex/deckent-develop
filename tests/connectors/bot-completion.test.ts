// BOT-1 — live bot-agent wiring (buildBotHumanizer). Verifies the config gate +
// fail-safe fallbacks. The real LLM round-trip is exercised via the native
// transport's DECKENT_NATIVE_MOCK seam (no provider/key needed).

import { describe, it, expect } from 'vitest';
import { buildBotHumanizer } from '../../src/connectors/bot-completion.js';

describe('buildBotHumanizer (BOT-1 wiring)', () => {
  it('passthrough when bot_agent is disabled (raw, lossless)', async () => {
    const h = buildBotHumanizer({}, {});
    expect(await h.toParts('approve t-42')).toEqual(['approve t-42']);
  });

  it('passthrough when config is undefined', async () => {
    const h = buildBotHumanizer(undefined, {});
    expect(await h.toParts('approve t-42')).toEqual(['approve t-42']);
  });

  it('humanizes when enabled AND a native provider resolves (mock transport)', async () => {
    const mock = JSON.stringify([[{ type: 'text-delta', text: 'Hey — just approve t-42 when ready 👍' }, { type: 'done' }]]);
    const h = buildBotHumanizer({ bot_agent: { enabled: true } }, { DECKENT_NATIVE_MOCK: mock });
    const parts = await h.toParts('[autonomous] parked — approve t-42 / reject t-42');
    expect(parts.join('')).toContain('approve t-42');   // command preserved through humanize
    expect(parts.join('')).toContain('Hey');             // humanized phrasing came through
  });

  it('fail-safe: enabled but no provider resolves → passthrough (raw, never breaks)', async () => {
    const h = buildBotHumanizer({ bot_agent: { enabled: true } }, {}); // no key, no ollama_host
    expect(await h.toParts('approve t-42')).toEqual(['approve t-42']);
  });
});
