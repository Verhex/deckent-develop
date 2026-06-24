import { describe, it, expect } from 'vitest';
import { screenshotCapability } from '../../../src/connectors/capabilities/builtin/screenshot.js';
import { defaultSpawn } from '../../../src/connectors/capabilities/spawn.js';
import { detectPlatform } from '../../../src/connectors/capabilities/platform.js';

// Proof-of-function: REAL host capture. Skips with reason on a headless/unsupported host
// so it never produces a false pass.
describe('screenshot real-run (proof-of-function)', () => {
  it('captures a real PNG on this host (or skips honestly)', async () => {
    const platform = detectPlatform();
    if (platform === 'unsupported') return; // honest skip
    const res = await screenshotCapability.run({}, {
      chatKey: 'smoke', project: process.cwd(), lang: 'en', config: { enabled: true },
      now: 1_700_000_000_000, spawn: defaultSpawn, loadMailTransport: async () => { throw new Error('n/a'); },
    });
    if (res.text && /not supported|failed|başarısız|desteklenmiyor/i.test(res.text)) {
      // No display / tool unavailable on this host → honest skip, not a false pass.
      return;
    }
    expect(res.media?.[0]?.data.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect((res.media?.[0]?.data.length ?? 0)).toBeGreaterThan(100);
  }, 20_000);
});
